from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from models.schemas import FacturaCreate, FacturaResponse

router = APIRouter()


# ─────────────────────────────────────────────
#  FACTURAS – CRUD
# ─────────────────────────────────────────────

@router.get("/admin/facturas", response_model=List[FacturaResponse])
async def get_facturas(
    logo_tipo: Optional[str] = None,
    tipo: Optional[str] = None,          # emitida | recibida
    estado: Optional[str] = None,        # pendiente | pagada | anulada
    mes: Optional[str] = None,           # YYYY-MM  → filtra por fecha
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver facturas")
    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if tipo and tipo != "todas":
        query["tipo"] = tipo
    if estado and estado != "todas":
        query["estado"] = estado
    if mes:
        # Filtra facturas cuya fecha empieza con YYYY-MM
        query["fecha"] = {"$regex": f"^{mes}"}
    facturas = await db.facturas.find(query, {"_id": 0}).sort("fecha", -1).to_list(1000)
    return facturas


async def _registrar_cobro_contrato(fac: dict, monto_pagado: float = None, fecha_pago: str = None):
    """
    Crea un cobro_contrato si la factura está vinculada a un contrato y no existe
    un cobro para ese periodo. Esto mantiene sincronizado el estado del contrato
    y el cálculo del balance.
    """
    contrato_id = fac.get("contrato_id")
    if not contrato_id:
        return
    fecha = fac.get("fecha_pago") or fecha_pago or fac.get("fecha", "")
    periodo = fecha[:7] if fecha else datetime.now(timezone.utc).strftime("%Y-%m")
    monto = monto_pagado or fac.get("monto_pagado") or fac.get("monto", 0)
    # Solo crear si no existe ya un cobro para este contrato en este periodo
    existing = await db.cobros_contratos.find_one({"contrato_id": contrato_id, "periodo": periodo})
    if not existing:
        cobro = {
            "id": str(uuid.uuid4()),
            "contrato_id": contrato_id,
            "periodo": periodo,
            "monto_pagado": float(monto),
            "fecha": fecha[:10] if fecha else datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "notas": f"Cobro auto-registrado desde factura {fac.get('numero', '')}",
            "from_factura_id": fac.get("id", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cobros_contratos.insert_one(cobro)


def _normalizar_presupuesto_ids(data_dict: dict) -> dict:
    """Garantiza consistencia entre presupuesto_id (legacy) y presupuesto_ids (nuevo)."""
    ids = list(data_dict.get("presupuesto_ids") or [])
    legacy = data_dict.get("presupuesto_id")
    # Si vino solo el campo legacy, migrarlo al array
    if legacy and legacy not in ids:
        ids.append(legacy)
    # Si el array tiene exactamente uno, mantener legacy en sync; si tiene 0 o >1, limpiar legacy
    data_dict["presupuesto_ids"] = ids
    data_dict["presupuesto_id"] = ids[0] if len(ids) == 1 else (None if not ids else None)
    return data_dict


@router.post("/admin/facturas", response_model=FacturaResponse)
async def create_factura(data: FacturaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear facturas")
    now = datetime.now(timezone.utc).isoformat()
    doc = _normalizar_presupuesto_ids({
        "id": str(uuid.uuid4()),
        **data.dict(),
        "created_at": now,
    })
    await db.facturas.insert_one(doc)
    await log_auditoria(user, "facturas", "crear_factura",
                        f"Factura {data.numero} ({data.tipo}) creada")
    return {**doc, "_id": None}


@router.put("/admin/facturas/{factura_id}", response_model=FacturaResponse)
async def update_factura(factura_id: str, data: FacturaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    updates = _normalizar_presupuesto_ids(data.dict())
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})
    await log_auditoria(user, "facturas", "editar_factura",
                        f"Factura {factura_id} actualizada")
    fac_actualizada = {**fac, **updates}
    # Si la factura está pagada y tiene contrato: solo marcar contrato como cobrado
    # (el balance lee las facturas con contrato_id en su propia sección, sin cobros duplicados)
    if fac_actualizada.get("estado") == "pagada" and fac_actualizada.get("tipo") == "emitida":
        if fac_actualizada.get("contrato_id"):
            await db.contratos.update_one(
                {"id": fac_actualizada["contrato_id"]},
                {"$set": {"estado": "cobrado"}}
            )
    return fac_actualizada


@router.patch("/admin/facturas/{factura_id}/estado")
async def update_estado_factura(
    factura_id: str,
    estado: str,                     # pagada | pendiente | anulada | parcial
    fecha_pago: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    updates: dict = {"estado": estado}
    if estado in ("pagada", "parcial"):
        updates["fecha_pago"] = fecha_pago or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    elif estado == "pendiente":
        updates["fecha_pago"] = None
        updates["monto_pagado"] = None
        updates["pagos"] = []        # limpiar historial de pagos al revertir
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})

    # Si la factura es emitida y se marca como pagada, auto-cobrar presupuestos y contratos vinculados
    if estado == "pagada" and fac.get("tipo") == "emitida":
        # Presupuestos vinculados
        pids = list(fac.get("presupuesto_ids") or [])
        if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
            pids.append(fac["presupuesto_id"])
        for pid in pids:
            await db.presupuestos.update_one(
                {"id": pid},
                {"$set": {"estado": "cobrado"}}
            )
        # Contrato vinculado: solo marcar como cobrado (el balance lo lee desde la factura directamente)
        if fac.get("contrato_id"):
            await db.contratos.update_one(
                {"id": fac["contrato_id"]},
                {"$set": {"estado": "cobrado"}}
            )

    return {"estado": estado, "fecha_pago": updates.get("fecha_pago")}


@router.patch("/admin/facturas/{factura_id}/pago-parcial")
async def pago_parcial_factura(
    factura_id: str,
    data: dict,   # { monto_pagado, fecha_pago }
    user: dict = Depends(require_authenticated)
):
    """Registra un pago parcial en una factura pendiente o ya con pago parcial.
    Los pagos se acumulan en el array 'pagos' y monto_pagado refleja el total acumulado.
    """
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    monto_nuevo = float(data.get("monto_pagado", 0))
    fecha_pago = data.get("fecha_pago") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if monto_nuevo <= 0:
        raise HTTPException(status_code=400, detail="El monto pagado debe ser mayor a 0")

    # ── Acumular pagos en array ──────────────────────────────────
    pagos_previos = fac.get("pagos") or []
    nuevo_pago = {
        "id": str(uuid.uuid4()),
        "monto": monto_nuevo,
        "fecha": fecha_pago,
        "registrado_por": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    pagos_actualizados = pagos_previos + [nuevo_pago]
    monto_acumulado = sum(p["monto"] for p in pagos_actualizados)

    # ── Determinar estado ────────────────────────────────────────
    monto_total = float(fac["monto"])
    if monto_acumulado >= monto_total:
        nuevo_estado = "pagada"
        monto_acumulado = monto_total   # no superar el total exacto
    else:
        nuevo_estado = "parcial"

    updates = {
        "estado": nuevo_estado,
        "monto_pagado": monto_acumulado,
        "fecha_pago": fecha_pago,
        "pagos": pagos_actualizados,
    }
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})
    await log_auditoria(user, "facturas", "pago_parcial",
                        f"Pago de {monto_nuevo} en factura {factura_id} (acumulado: {monto_acumulado})")

    # ── Si pagó completo, marcar presupuestos y contrato ─────────
    if nuevo_estado == "pagada":
        pids = list(fac.get("presupuesto_ids") or [])
        if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
            pids.append(fac["presupuesto_id"])
        for pid in pids:
            await db.presupuestos.update_one(
                {"id": pid},
                {"$set": {"estado": "cobrado"}}
            )
        if fac.get("contrato_id"):
            await db.contratos.update_one(
                {"id": fac["contrato_id"]},
                {"$set": {"estado": "cobrado"}}
            )
    return {**updates}


@router.delete("/admin/facturas/{factura_id}")
async def delete_factura(factura_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    await db.facturas.delete_one({"id": factura_id})
    await log_auditoria(user, "facturas", "eliminar_factura",
                        f"Factura {factura_id} eliminada")
    return {"ok": True}


# ─────────────────────────────────────────────
#  RESUMEN por periodo y empresa
# ─────────────────────────────────────────────

@router.get("/admin/facturas/resumen")
async def get_resumen_facturas(
    mes: Optional[str] = None,           # YYYY-MM
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    """Devuelve totales por tipo y estado para el periodo/empresa seleccionados."""
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return {
            "emitidas": {"cantidad": 0, "monto_pyg": 0},
            "emitidas_pagadas": {"cantidad": 0, "monto_pyg": 0},
            "emitidas_pendientes": {"cantidad": 0, "monto_pyg": 0},
            "recibidas": {"cantidad": 0, "monto_pyg": 0},
            "recibidas_pagadas": {"cantidad": 0, "monto_pyg": 0},
            "recibidas_pendientes": {"cantidad": 0, "monto_pyg": 0},
        }
    query.update(logo_q)
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}

    facturas = await db.facturas.find(query, {"_id": 0,
        "tipo": 1, "estado": 1, "monto": 1, "moneda": 1}).to_list(5000)

    def totales(lst):
        return {
            "cantidad": len(lst),
            "monto_pyg": sum(
                f["monto"] * (f.get("tipo_cambio") or 1) if f.get("moneda") != "PYG"
                else f["monto"]
                for f in lst
            )
        }

    emitidas = [f for f in facturas if f["tipo"] == "emitida"]
    recibidas = [f for f in facturas if f["tipo"] == "recibida"]

    return {
        "emitidas":          totales(emitidas),
        "emitidas_pagadas":  totales([f for f in emitidas if f["estado"] == "pagada"]),
        "emitidas_pendientes": totales([f for f in emitidas if f["estado"] == "pendiente"]),
        "recibidas":         totales(recibidas),
        "recibidas_pagadas": totales([f for f in recibidas if f["estado"] == "pagada"]),
        "recibidas_pendientes": totales([f for f in recibidas if f["estado"] == "pendiente"]),
    }
