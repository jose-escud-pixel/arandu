from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from routes.cuentas_bancarias import resolver_cuenta_id

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ComprasPagoItem(BaseModel):
    """Un ítem de pago parcial o total para una compra específica."""
    compra_id: str
    monto_pagado: float


class PagoProveedorCreate(BaseModel):
    proveedor_id: str
    proveedor_nombre: str
    concepto: str
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    monto_gs: Optional[float] = None          # equivalente en guaraníes (USD → PYG)
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    cuenta_moneda: Optional[str] = None
    cuenta_pago: str = "guaranies"            # "guaranies" | "dolares"
    fecha_vencimiento: str                    # YYYY-MM-DD
    fecha_pago: Optional[str] = None
    recibo_numero: Optional[str] = None        # número de recibo del proveedor; si falta se autogenera
    notas: Optional[str] = None
    logo_tipo: str = "arandujar"
    # Pagos detallados por compra (nuevo flujo de pago parcial)
    compras_pagos: List[ComprasPagoItem] = []
    # Backward compat: IDs simples (ignorado si compras_pagos está presente)
    compras_ids: List[str] = []


class PagoProveedorUpdate(BaseModel):
    concepto: Optional[str] = None
    monto: Optional[float] = None
    moneda: Optional[str] = None
    tipo_cambio: Optional[float] = None
    monto_gs: Optional[float] = None
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    cuenta_moneda: Optional[str] = None
    cuenta_pago: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    fecha_pago: Optional[str] = None
    recibo_numero: Optional[str] = None
    notas: Optional[str] = None
    logo_tipo: Optional[str] = None
    compras_pagos: Optional[List[ComprasPagoItem]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _numero_doc_normalizado(numero: Optional[str]) -> str:
    return "".join((numero or "").strip().lower().split())


async def _next_recibo_proveedor_numero(logo_tipo: str) -> str:
    ultimo = await db.pagos_proveedores.find_one(
        {"logo_tipo": logo_tipo or "arandujar", "recibo_numero": {"$regex": r"^RPROV-\d+$"}},
        {"_id": 0, "recibo_numero": 1},
        sort=[("created_at", -1)],
    )
    if ultimo and ultimo.get("recibo_numero"):
        try:
            n = int(ultimo["recibo_numero"].split("-")[-1]) + 1
        except Exception:
            n = await db.pagos_proveedores.count_documents({"logo_tipo": logo_tipo or "arandujar", "recibo_numero": {"$ne": None}}) + 1
    else:
        n = await db.pagos_proveedores.count_documents({"logo_tipo": logo_tipo or "arandujar", "recibo_numero": {"$ne": None}}) + 1
    while await db.pagos_proveedores.find_one({"logo_tipo": logo_tipo or "arandujar", "recibo_numero": f"RPROV-{n:04d}"}):
        n += 1
    return f"RPROV-{n:04d}"


async def _ensure_recibo_proveedor_unico(
    recibo_numero: Optional[str],
    logo_tipo: Optional[str],
    proveedor_id: Optional[str],
    proveedor_nombre: Optional[str],
    ignore_id: Optional[str] = None,
):
    normalizado = _numero_doc_normalizado(recibo_numero)
    if not normalizado:
        return
    query: dict = {
        "logo_tipo": logo_tipo or "arandujar",
        "$or": [
            {"recibo_numero": (recibo_numero or "").strip()},
            {"recibo_numero_normalizado": normalizado},
        ],
    }
    proveedor_or = []
    if proveedor_id:
        proveedor_or.append({"proveedor_id": proveedor_id})
    if proveedor_nombre:
        proveedor_or.append({"proveedor_nombre": proveedor_nombre})
    if proveedor_or:
        query["$and"] = [{"$or": proveedor_or}]
    if ignore_id:
        query["id"] = {"$ne": ignore_id}
    existente = await db.pagos_proveedores.find_one(query, {"_id": 0, "id": 1, "recibo_numero": 1})
    if existente:
        raise HTTPException(status_code=400, detail=f"Ya existe un recibo {recibo_numero} para este proveedor.")

async def _aplicar_pagos_a_compras(compras_pagos: List[ComprasPagoItem], pago_proveedor_id: str,
                                    moneda: str, tipo_cambio: Optional[float], fecha_pago: Optional[str],
                                    cuenta_id: Optional[str] = None, cuenta_nombre: Optional[str] = None,
                                    recibo_numero: Optional[str] = None):
    """Empuja un pago en cada compra del detalle, respetando el saldo real."""
    fecha = fecha_pago or datetime.now(timezone.utc).date().isoformat()
    for cp in compras_pagos:
        if not cp.compra_id or cp.monto_pagado <= 0:
            continue
        # Verificar que la compra existe y calcular saldo actual
        compra = await db.compras.find_one({"id": cp.compra_id})
        if not compra:
            continue
        pagos_existentes = compra.get("pagos", [])
        total_ya_pagado = sum(p.get("monto_pagado", 0) for p in pagos_existentes)
        nota_or = [{"compra_id": cp.compra_id}]
        if compra.get("numero_factura"):
            nota_or.append({"compra_numero_factura": compra.get("numero_factura")})
        notas = await db.notas_credito.find(
            {"tipo": "compra", "$or": nota_or, "estado": {"$ne": "anulada"}},
            {"_id": 0, "id": 1, "monto": 1},
        ).to_list(1000)
        ids_notas = {n.get("id") for n in notas}
        creditos_guardados = [c for c in (compra.get("creditos") or []) if c.get("id") not in ids_notas]
        total_creditos = sum(c.get("monto", 0) for c in creditos_guardados) + sum(n.get("monto", 0) for n in notas)
        saldo_actual = max(0, compra.get("monto_total", 0) - total_ya_pagado - total_creditos)
        monto_aplicar = min(cp.monto_pagado, saldo_actual)  # nunca pagar más del saldo
        if monto_aplicar <= 0:
            continue
        pago_doc = {
            "id": str(uuid.uuid4()),
            "monto_pagado": monto_aplicar,
            "moneda": moneda,
            "tipo_cambio": tipo_cambio,
            "fecha_pago": fecha,
            "notas": f"Pago registrado vía pago proveedor",
            "pago_proveedor_id": pago_proveedor_id,   # referencia para poder revertir
            "recibo_numero": recibo_numero,
            "cuenta_id": cuenta_id,
            "cuenta_nombre": cuenta_nombre,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.compras.update_one({"id": cp.compra_id}, {"$push": {"pagos": pago_doc}})


async def _revertir_pagos_compras(pago_proveedor_id: str):
    """Elimina todos los pagos de compras que fueron generados por este pago proveedor."""
    await db.compras.update_many(
        {"pagos.pago_proveedor_id": pago_proveedor_id},
        {"$pull": {"pagos": {"pago_proveedor_id": pago_proveedor_id}}}
    )


def _validar_tipo_cambio(moneda: Optional[str], tipo_cambio: Optional[float],
                          monto_gs: Optional[float], cuenta_pago: Optional[str]):
    """Asegura que un movimiento en USD tenga TC (o monto_gs ya calculado) cuando
    se paga desde cuenta en guaraníes. Si paga desde cuenta USD, no hace falta."""
    if (moneda or "PYG").upper() != "USD":
        return
    if (cuenta_pago or "guaranies") == "dolares":
        return  # no afecta a guaraníes
    if not tipo_cambio and not monto_gs:
        raise HTTPException(
            status_code=400,
            detail="Falta el tipo de cambio para un pago en USD desde cuenta en guaraníes.",
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/admin/pagos-proveedores")
async def get_pagos_proveedores(
    logo_tipo: Optional[str] = None,
    proveedor_id: Optional[str] = None,
    estado: Optional[str] = None,   # pendiente | pagado | vencido
    mes: Optional[str] = None,      # YYYY-MM
    anio: Optional[str] = None,     # YYYY
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "pagos_proveedores.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if proveedor_id:
        query["proveedor_id"] = proveedor_id
    # Filtro por período (sobre fecha_pago para pagados, fecha_vencimiento para pendientes)
    if mes:
        query["$or"] = [
            {"fecha_pago": {"$regex": f"^{mes}"}},
            {"fecha_vencimiento": {"$regex": f"^{mes}"}},
        ]
    elif anio:
        query["$or"] = [
            {"fecha_pago": {"$regex": f"^{anio}"}},
            {"fecha_vencimiento": {"$regex": f"^{anio}"}},
        ]

    pagos = await db.pagos_proveedores.find(query, {"_id": 0}).sort("fecha_vencimiento", -1).to_list(1000)

    now_str = datetime.now(timezone.utc).date().isoformat()
    result = []
    for p in pagos:
        if p.get("fecha_pago"):
            p["estado"] = "pagado"
        elif p.get("fecha_vencimiento", "9999") < now_str:
            p["estado"] = "vencido"
        else:
            p["estado"] = "pendiente"
        result.append(p)

    if estado:
        result = [p for p in result if p["estado"] == estado]

    return result


@router.post("/admin/pagos-proveedores")
async def create_pago_proveedor(data: PagoProveedorCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "pagos_proveedores.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para registrar pagos")

    _validar_tipo_cambio(data.moneda, data.tipo_cambio, data.monto_gs, data.cuenta_pago)

    pago_id = str(uuid.uuid4())

    # Usar compras_pagos si viene, sino construir desde compras_ids (backward compat)
    compras_pagos = data.compras_pagos
    if not compras_pagos and data.compras_ids:
        # Fallback: marcar como pagado total (monto_pagado = saldo_pendiente de cada compra)
        compras_pagos = [ComprasPagoItem(compra_id=cid, monto_pagado=data.monto) for cid in data.compras_ids]

    recibo_numero = (data.recibo_numero or "").strip() or None
    if data.fecha_pago and not recibo_numero:
        recibo_numero = await _next_recibo_proveedor_numero(data.logo_tipo)
    if recibo_numero:
        await _ensure_recibo_proveedor_unico(
            recibo_numero, data.logo_tipo, data.proveedor_id, data.proveedor_nombre
        )

    cuenta_id = data.cuenta_id
    cuenta_nombre = data.cuenta_nombre
    if data.fecha_pago:
        moneda_real = "PYG" if (data.tipo_cambio and float(data.tipo_cambio) > 0) else (data.moneda or "PYG")
        cuenta_id = await resolver_cuenta_id(data.logo_tipo, moneda_real, cuenta_id)
        if not cuenta_id:
            raise HTTPException(status_code=400, detail="No hay cuenta bancaria predeterminada. Creá una en Bancos.")
        if not cuenta_nombre:
            c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"nombre": 1, "_id": 0})
            cuenta_nombre = c.get("nombre") if c else None

    doc = {
        "id": pago_id,
        "proveedor_id": data.proveedor_id,
        "proveedor_nombre": data.proveedor_nombre,
        "concepto": data.concepto,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "monto_gs": data.monto_gs,
        "cuenta_id": cuenta_id,
        "cuenta_nombre": cuenta_nombre,
        "cuenta_moneda": data.cuenta_moneda,
        "cuenta_pago": data.cuenta_pago,
        "fecha_vencimiento": data.fecha_vencimiento,
        "fecha_pago": data.fecha_pago,
        "recibo_numero": recibo_numero,
        "recibo_numero_normalizado": _numero_doc_normalizado(recibo_numero) if recibo_numero else None,
        "recibo_auto": bool(data.fecha_pago and not data.recibo_numero),
        "notas": data.notas,
        "logo_tipo": data.logo_tipo,
        "compras_pagos": [cp.dict() for cp in compras_pagos],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.pagos_proveedores.insert_one(doc)

    # Aplicar pagos parciales/totales a cada compra
    if compras_pagos:
        await _aplicar_pagos_a_compras(
            compras_pagos, pago_id, data.moneda, data.tipo_cambio, data.fecha_pago,
            cuenta_id=data.cuenta_id, cuenta_nombre=data.cuenta_nombre, recibo_numero=recibo_numero,
        )

    await log_auditoria(user, "pagos_proveedores", "crear", f"Pago a '{data.proveedor_nombre}': {data.concepto}", pago_id)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/pagos-proveedores/{pago_id}")
async def update_pago_proveedor(pago_id: str, data: PagoProveedorUpdate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "pagos_proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.pagos_proveedores.find_one({"id": pago_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    _validar_tipo_cambio(
        data.moneda or existing.get("moneda"),
        data.tipo_cambio if data.tipo_cambio is not None else existing.get("tipo_cambio"),
        data.monto_gs if data.monto_gs is not None else existing.get("monto_gs"),
        data.cuenta_pago or existing.get("cuenta_pago"),
    )

    update_fields = {k: v for k, v in data.dict(exclude_none=True).items() if k != "compras_pagos"}
    if "recibo_numero" in update_fields:
        recibo_numero = (update_fields.get("recibo_numero") or "").strip() or None
        await _ensure_recibo_proveedor_unico(
            recibo_numero,
            update_fields.get("logo_tipo", existing.get("logo_tipo", "arandujar")),
            update_fields.get("proveedor_id", existing.get("proveedor_id")),
            update_fields.get("proveedor_nombre", existing.get("proveedor_nombre")),
            ignore_id=pago_id,
        )
        update_fields["recibo_numero"] = recibo_numero
        update_fields["recibo_numero_normalizado"] = _numero_doc_normalizado(recibo_numero) if recibo_numero else None

    # Si vienen nuevos compras_pagos, revertir los anteriores y aplicar los nuevos
    if data.compras_pagos is not None:
        await _revertir_pagos_compras(pago_id)
        await _aplicar_pagos_a_compras(
            data.compras_pagos, pago_id,
            data.moneda or existing.get("moneda", "PYG"),
            data.tipo_cambio or existing.get("tipo_cambio"),
            data.fecha_pago or existing.get("fecha_pago"),
            cuenta_id=data.cuenta_id or existing.get("cuenta_id"),
            cuenta_nombre=data.cuenta_nombre or existing.get("cuenta_nombre"),
            recibo_numero=update_fields.get("recibo_numero", existing.get("recibo_numero")),
        )
        update_fields["compras_pagos"] = [cp.dict() for cp in data.compras_pagos]
        # Recalcular monto total desde los nuevos pagos
        nuevo_total = sum(cp.monto_pagado for cp in data.compras_pagos)
        if nuevo_total > 0:
            update_fields["monto"] = nuevo_total

    if update_fields:
        await db.pagos_proveedores.update_one({"id": pago_id}, {"$set": update_fields})

    updated = await db.pagos_proveedores.find_one({"id": pago_id}, {"_id": 0})
    return updated


@router.patch("/admin/pagos-proveedores/{pago_id}/marcar-pagado")
async def marcar_pagado(pago_id: str, fecha_pago: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "pagos_proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.pagos_proveedores.find_one({"id": pago_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    fp = fecha_pago or datetime.now(timezone.utc).date().isoformat()
    updates = {"fecha_pago": fp}
    if not existing.get("recibo_numero"):
        recibo_numero = await _next_recibo_proveedor_numero(existing.get("logo_tipo", "arandujar"))
        await _ensure_recibo_proveedor_unico(
            recibo_numero,
            existing.get("logo_tipo", "arandujar"),
            existing.get("proveedor_id"),
            existing.get("proveedor_nombre"),
            ignore_id=pago_id,
        )
        updates.update({
            "recibo_numero": recibo_numero,
            "recibo_numero_normalizado": _numero_doc_normalizado(recibo_numero),
            "recibo_auto": True,
        })
    await db.pagos_proveedores.update_one({"id": pago_id}, {"$set": updates})
    await log_auditoria(user, "pagos_proveedores", "pagar", f"Pago marcado como pagado: {existing.get('concepto')}", pago_id)
    return {"success": True, **updates}


@router.patch("/admin/pagos-proveedores/{pago_id}/desmarcar-pagado")
async def desmarcar_pagado(pago_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "pagos_proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.pagos_proveedores.find_one({"id": pago_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    await db.pagos_proveedores.update_one({"id": pago_id}, {"$set": {"fecha_pago": None}})
    return {"success": True}


@router.delete("/admin/pagos-proveedores/{pago_id}")
async def delete_pago_proveedor(pago_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "pagos_proveedores.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.pagos_proveedores.find_one({"id": pago_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    # Revertir los pagos aplicados a las compras antes de eliminar
    await _revertir_pagos_compras(pago_id)

    result = await db.pagos_proveedores.delete_one({"id": pago_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return {"success": True}
