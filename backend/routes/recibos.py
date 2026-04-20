"""
Recibos de pago — colección separada que referencia facturas.pagos
Los recibos se crean automáticamente al registrar pagos parciales o totales.
También se pueden gestionar directamente desde aquí.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso

router = APIRouter()


# ─────────────────────────────────────────────
#  SCHEMAS
# ─────────────────────────────────────────────

class ReciboCreate(BaseModel):
    factura_id: str
    factura_numero: str
    razon_social: str
    ruc: Optional[str] = None
    monto: float
    moneda: str = "PYG"
    fecha_pago: str
    logo_tipo: str = "arandujar"
    cuenta_id: Optional[str] = None
    notas: Optional[str] = None
    pago_id: Optional[str] = None        # id del pago en facturas.pagos


class ReciboResponse(BaseModel):
    id: str
    numero: str
    factura_id: str
    factura_numero: str
    razon_social: str
    ruc: Optional[str] = None
    monto: float
    moneda: str
    fecha_pago: str
    logo_tipo: str
    cuenta_id: Optional[str] = None
    notas: Optional[str] = None
    pago_id: Optional[str] = None
    created_at: str


# ─────────────────────────────────────────────
#  CRUD
# ─────────────────────────────────────────────

@router.get("/admin/recibos", response_model=List[ReciboResponse])
async def get_recibos(
    logo_tipo: Optional[str] = None,
    mes: Optional[str] = None,
    factura_id: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    query = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    if mes:
        query["fecha_pago"] = {"$regex": f"^{mes}"}
    if factura_id:
        query["factura_id"] = factura_id
    recibos = await db.recibos.find(query, {"_id": 0}).sort("fecha_pago", -1).to_list(2000)
    return recibos


@router.get("/admin/recibos/{recibo_id}", response_model=ReciboResponse)
async def get_recibo(recibo_id: str, user: dict = Depends(require_authenticated)):
    r = await db.recibos.find_one({"id": recibo_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    return r


@router.post("/admin/recibos", response_model=ReciboResponse)
async def create_recibo(data: ReciboCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    # Auto-número de recibo
    ultimo = await db.recibos.find_one(
        {}, {"numero": 1, "_id": 0}, sort=[("created_at", -1)]
    )
    if ultimo and ultimo.get("numero"):
        try:
            n = int(ultimo["numero"].split("-")[-1]) + 1
        except Exception:
            n = 1
    else:
        n = 1
    numero = f"REC-{n:04d}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "numero": numero,
        **data.dict(),
        "created_at": now,
    }
    await db.recibos.insert_one(doc)
    return {**doc, "_id": None}


@router.put("/admin/recibos/{recibo_id}", response_model=ReciboResponse)
async def update_recibo(recibo_id: str, data: ReciboCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    r = await db.recibos.find_one({"id": recibo_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    updates = data.dict()
    await db.recibos.update_one({"id": recibo_id}, {"$set": updates})
    return {**r, **updates}


@router.delete("/admin/recibos/{recibo_id}")
async def delete_recibo(recibo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    r = await db.recibos.find_one({"id": recibo_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    await db.recibos.delete_one({"id": recibo_id})
    return {"ok": True}
