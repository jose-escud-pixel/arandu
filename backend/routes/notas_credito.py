from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso, log_auditoria

router = APIRouter()


class NotaCreditoCreate(BaseModel):
    numero: str
    fecha: str
    tipo: str = "venta"  # venta | compra
    factura_id: Optional[str] = None
    factura_numero: Optional[str] = None
    compra_id: Optional[str] = None
    compra_numero_factura: Optional[str] = None
    empresa_id: Optional[str] = None
    razon_social: Optional[str] = None
    ruc: Optional[str] = None
    proveedor_id: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    motivo: str
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    logo_tipo: str = "arandujar"
    estado: str = "emitida"
    notas: Optional[str] = None


class NotaCreditoResponse(NotaCreditoCreate):
    id: str
    created_at: str
    updated_at: Optional[str] = None


def _monto_pyg(doc: dict) -> float:
    if doc.get("moneda", "PYG") == "PYG":
        return float(doc.get("monto") or 0)
    tc = float(doc.get("tipo_cambio") or 0)
    return float(doc.get("monto") or 0) * tc if tc > 0 else 0


@router.get("/admin/notas-credito", response_model=List[NotaCreditoResponse])
async def get_notas_credito(
    logo_tipo: Optional[str] = None,
    mes: Optional[str] = None,
    anio: Optional[str] = None,
    tipo: Optional[str] = None,
    factura_id: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "notas_credito.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}
    elif anio:
        query["fecha"] = {"$regex": f"^{anio}"}
    if tipo:
        if tipo == "venta":
            query["$or"] = [{"tipo": {"$exists": False}}, {"tipo": "venta"}]
        else:
            query["tipo"] = tipo
    if factura_id:
        query["factura_id"] = factura_id
    return await db.notas_credito.find(query, {"_id": 0}).sort("fecha", -1).to_list(2000)


@router.post("/admin/notas-credito", response_model=NotaCreditoResponse, status_code=201)
async def create_nota_credito(data: NotaCreditoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "notas_credito.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    if data.monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero")

    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "monto_pyg": _monto_pyg(data.dict()),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notas_credito.insert_one(doc)
    await log_auditoria(user, "notas_credito", "crear", f"Nota de crédito {data.numero} creada", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/notas-credito/{nota_id}", response_model=NotaCreditoResponse)
async def update_nota_credito(nota_id: str, data: NotaCreditoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "notas_credito.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    existing = await db.notas_credito.find_one({"id": nota_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    updates = {
        **data.dict(),
        "monto_pyg": _monto_pyg(data.dict()),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notas_credito.update_one({"id": nota_id}, {"$set": updates})
    await log_auditoria(user, "notas_credito", "editar", f"Nota de crédito {data.numero} actualizada", nota_id)
    return {**existing, **updates}


@router.delete("/admin/notas-credito/{nota_id}")
async def delete_nota_credito(nota_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "notas_credito.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    result = await db.notas_credito.delete_one({"id": nota_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    await log_auditoria(user, "notas_credito", "eliminar", f"Nota de crédito eliminada: {nota_id}", nota_id)
    return {"success": True}
