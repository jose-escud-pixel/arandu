from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class PagoProveedorCreate(BaseModel):
    proveedor_id: str
    proveedor_nombre: str
    concepto: str
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    monto_gs: Optional[float] = None          # equivalente en guaraníes (USD → PYG)
    cuenta_pago: str = "guaranies"            # "guaranies" | "dolares"
    fecha_vencimiento: str                    # YYYY-MM-DD
    fecha_pago: Optional[str] = None
    notas: Optional[str] = None
    logo_tipo: str = "arandujar"


class PagoProveedorUpdate(BaseModel):
    concepto: Optional[str] = None
    monto: Optional[float] = None
    moneda: Optional[str] = None
    tipo_cambio: Optional[float] = None
    monto_gs: Optional[float] = None
    cuenta_pago: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    fecha_pago: Optional[str] = None
    notas: Optional[str] = None
    logo_tipo: Optional[str] = None


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
    doc = {
        "id": pago_id,
        "proveedor_id": data.proveedor_id,
        "proveedor_nombre": data.proveedor_nombre,
        "concepto": data.concepto,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "monto_gs": data.monto_gs,
        "cuenta_pago": data.cuenta_pago,
        "fecha_vencimiento": data.fecha_vencimiento,
        "fecha_pago": data.fecha_pago,
        "notas": data.notas,
        "logo_tipo": data.logo_tipo,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.pagos_proveedores.insert_one(doc)
    await log_auditoria(user, "pagos_proveedores", "crear", f"Pago a '{data.proveedor_nombre}': {data.concepto}", pago_id)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/pagos-proveedores/{pago_id}")
async def update_pago_proveedor(pago_id: str, data: PagoProveedorUpdate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "pagos_proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.pagos_proveedores.find_one({"id": pago_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    update_fields = {k: v for k, v in data.dict().items() if v is not None}
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

    result = await db.pagos_proveedores.delete_one({"id": pago_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return {"success": True}
