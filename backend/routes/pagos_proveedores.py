from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso

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
    notas: Optional[str] = None
    logo_tipo: Optional[str] = None
    compras_pagos: Optional[List[ComprasPagoItem]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _aplicar_pagos_a_compras(compras_pagos: List[ComprasPagoItem], pago_proveedor_id: str,
                                    moneda: str, tipo_cambio: Optional[float], fecha_pago: Optional[str]):
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
        saldo_actual = max(0, compra.get("monto_total", 0) - total_ya_pagado)
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
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.compras.update_one({"id": cp.compra_id}, {"$push": {"pagos": pago_doc}})


async def _revertir_pagos_compras(pago_proveedor_id: str):
    """Elimina todos los pagos de compras que fueron generados por este pago proveedor."""
    await db.compras.update_many(
        {"pagos.pago_proveedor_id": pago_proveedor_id},
        {"$pull": {"pagos": {"pago_proveedor_id": pago_proveedor_id}}}
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/admin/pagos-proveedores")
async def get_pagos_proveedores(
    logo_tipo: Optional[str] = None,
    proveedor_id: Optional[str] = None,
    estado: Optional[str] = None,   # pendiente | pagado | vencido
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "pagos_proveedores.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    query = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    if proveedor_id:
        query["proveedor_id"] = proveedor_id

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

    pago_id = str(uuid.uuid4())

    # Usar compras_pagos si viene, sino construir desde compras_ids (backward compat)
    compras_pagos = data.compras_pagos
    if not compras_pagos and data.compras_ids:
        # Fallback: marcar como pagado total (monto_pagado = saldo_pendiente de cada compra)
        compras_pagos = [ComprasPagoItem(compra_id=cid, monto_pagado=data.monto) for cid in data.compras_ids]

    doc = {
        "id": pago_id,
        "proveedor_id": data.proveedor_id,
        "proveedor_nombre": data.proveedor_nombre,
        "concepto": data.concepto,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "monto_gs": data.monto_gs,
        "cuenta_id": data.cuenta_id,
        "cuenta_nombre": data.cuenta_nombre,
        "cuenta_moneda": data.cuenta_moneda,
        "cuenta_pago": data.cuenta_pago,
        "fecha_vencimiento": data.fecha_vencimiento,
        "fecha_pago": data.fecha_pago,
        "notas": data.notas,
        "logo_tipo": data.logo_tipo,
        "compras_pagos": [cp.dict() for cp in compras_pagos],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.pagos_proveedores.insert_one(doc)

    # Aplicar pagos parciales/totales a cada compra
    if compras_pagos:
        await _aplicar_pagos_a_compras(compras_pagos, pago_id, data.moneda, data.tipo_cambio, data.fecha_pago)

    await log_auditoria(user, "pagos_proveedores", "crear", f"Pago a '{data.proveedor_nombre}': {data.concepto}", pago_id)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/pagos-proveedores/{pago_id}")
async def update_pago_proveedor(pago_id: str, data: PagoProveedorUpdate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "pagos_proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.pagos_proveedores.find_one({"id": pago_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    update_fields = {k: v for k, v in data.dict(exclude_none=True).items() if k != "compras_pagos"}

    # Si vienen nuevos compras_pagos, revertir los anteriores y aplicar los nuevos
    if data.compras_pagos is not None:
        await _revertir_pagos_compras(pago_id)
        await _aplicar_pagos_a_compras(
            data.compras_pagos, pago_id,
            data.moneda or existing.get("moneda", "PYG"),
            data.tipo_cambio or existing.get("tipo_cambio"),
            data.fecha_pago or existing.get("fecha_pago")
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
    await db.pagos_proveedores.update_one({"id": pago_id}, {"$set": {"fecha_pago": fp}})
    await log_auditoria(user, "pagos_proveedores", "pagar", f"Pago marcado como pagado: {existing.get('concepto')}", pago_id)
    return {"success": True, "fecha_pago": fp}


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
