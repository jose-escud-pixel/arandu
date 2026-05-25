"""
routes/ingresos_varios.py
──────────────────────────────────────────────────────────────
CRUD para ingresos varios (sin factura).
Incluye cuenta_id/cuenta_nombre para vincular a cuentas bancarias.

IMPORTANTE: si ya tenés un ingresos_varios.py en producción, comparar
y SOLO agregar los campos cuenta_id, cuenta_nombre, tipo_cambio
a los modelos IngresosCreate / IngresosResponse y al doc de insert/update.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from config import db
from routes.cuentas_bancarias import resolver_cuenta_id
from auth import require_authenticated, has_permission, get_logos_acceso, apply_logo_filter, is_forbidden

router = APIRouter()


def puede_crear_ingreso(user: dict) -> bool:
    return (
        user.get("role") == "admin"
        or has_permission(user, "ingresos_varios.crear")
        or has_permission(user, "balance.editar")
        or has_permission(user, "facturas.crear")
    )


def puede_editar_ingreso(user: dict) -> bool:
    return (
        user.get("role") == "admin"
        or has_permission(user, "ingresos_varios.editar")
        or has_permission(user, "balance.editar")
        or has_permission(user, "facturas.editar")
    )


def puede_eliminar_ingreso(user: dict) -> bool:
    return (
        user.get("role") == "admin"
        or has_permission(user, "ingresos_varios.eliminar")
        or has_permission(user, "balance.editar")
        or has_permission(user, "facturas.eliminar")
    )


class IngresoCreate(BaseModel):
    descripcion: str
    categoria: Optional[str] = "Transferencia"
    fecha: str
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    logo_tipo: Optional[str] = "arandujar"
    cuenta_id: Optional[str] = None        # ← NUEVO: cuenta bancaria destino
    cuenta_nombre: Optional[str] = None    # ← NUEVO: nombre desnormalizado
    notas: Optional[str] = None


class IngresoResponse(BaseModel):
    id: str
    descripcion: str
    categoria: Optional[str] = None
    fecha: str
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    logo_tipo: Optional[str] = None
    cuenta_id: Optional[str] = None        # ← NUEVO
    cuenta_nombre: Optional[str] = None    # ← NUEVO
    notas: Optional[str] = None
    created_at: str


# ─────────────────────────────────────────────
#  GET  /admin/ingresos-varios
# ─────────────────────────────────────────────
@router.get("/admin/ingresos-varios")
async def get_ingresos_varios(
    logo_tipo: Optional[str] = None,
    mes: Optional[str] = None,   # YYYY-MM
    user: dict = Depends(require_authenticated)
):
    query = {"categoria": {"$ne": "Pago IVA"}}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo not in ("todas", "") else None)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}

    docs = await db.ingresos_varios.find(query, {"_id": 0}).sort("fecha", -1).to_list(5000)
    return docs


# ─────────────────────────────────────────────
#  GET  /admin/ingresos-varios/{id}
# ─────────────────────────────────────────────
@router.get("/admin/ingresos-varios/{ingreso_id}")
async def get_ingreso(
    ingreso_id: str,
    user: dict = Depends(require_authenticated)
):
    doc = await db.ingresos_varios.find_one({"id": ingreso_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")
    return doc


# ─────────────────────────────────────────────
#  POST /admin/ingresos-varios
# ─────────────────────────────────────────────
@router.post("/admin/ingresos-varios", status_code=201)
async def create_ingreso(
    data: IngresoCreate,
    user: dict = Depends(require_authenticated)
):
    if not puede_crear_ingreso(user):
        raise HTTPException(status_code=403, detail="Sin permiso")

    now = datetime.now(timezone.utc).isoformat()

    moneda_real = "PYG" if (data.tipo_cambio and float(data.tipo_cambio) > 0) else (data.moneda or "PYG")
    cuenta_id = await resolver_cuenta_id(data.logo_tipo, moneda_real, data.cuenta_id)
    if not cuenta_id:
        raise HTTPException(status_code=400, detail="No hay cuenta bancaria predeterminada. Creá una en Bancos.")
    cuenta_nombre = data.cuenta_nombre
    if not cuenta_nombre:
        c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"nombre": 1, "_id": 0})
        if c:
            cuenta_nombre = c.get("nombre")

    doc = {
        "id": str(uuid.uuid4()),
        "descripcion": data.descripcion,
        "categoria": data.categoria,
        "fecha": data.fecha,
        "monto": float(data.monto),
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "logo_tipo": data.logo_tipo,
        "cuenta_id": cuenta_id,
        "cuenta_nombre": cuenta_nombre,
        "notas": data.notas,
        "created_at": now,
    }
    await db.ingresos_varios.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ─────────────────────────────────────────────
#  PUT  /admin/ingresos-varios/{id}
# ─────────────────────────────────────────────
@router.put("/admin/ingresos-varios/{ingreso_id}")
async def update_ingreso(
    ingreso_id: str,
    data: IngresoCreate,
    user: dict = Depends(require_authenticated)
):
    if not puede_editar_ingreso(user):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.ingresos_varios.find_one({"id": ingreso_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")

    logo = data.logo_tipo or existing.get("logo_tipo", "arandujar")
    moneda_real = "PYG" if (data.tipo_cambio and float(data.tipo_cambio) > 0) else (data.moneda or "PYG")
    cuenta_id = await resolver_cuenta_id(logo, moneda_real, data.cuenta_id or existing.get("cuenta_id"))
    if not cuenta_id:
        raise HTTPException(status_code=400, detail="No hay cuenta bancaria predeterminada. Creá una en Bancos.")
    cuenta_nombre = data.cuenta_nombre
    if not cuenta_nombre:
        c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"nombre": 1, "_id": 0})
        if c:
            cuenta_nombre = c.get("nombre")

    updates = {
        "descripcion": data.descripcion,
        "categoria": data.categoria,
        "fecha": data.fecha,
        "monto": float(data.monto),
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "logo_tipo": data.logo_tipo or existing.get("logo_tipo"),
        "cuenta_id": cuenta_id,
        "cuenta_nombre": cuenta_nombre,
        "notas": data.notas,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ingresos_varios.update_one({"id": ingreso_id}, {"$set": updates})
    return {**existing, **updates}


# ─────────────────────────────────────────────
#  DELETE /admin/ingresos-varios/{id}
# ─────────────────────────────────────────────
@router.delete("/admin/ingresos-varios/{ingreso_id}")
async def delete_ingreso(
    ingreso_id: str,
    user: dict = Depends(require_authenticated)
):
    if not puede_eliminar_ingreso(user):
        raise HTTPException(status_code=403, detail="Sin permiso")

    existing = await db.ingresos_varios.find_one({"id": ingreso_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")

    await db.ingresos_varios.delete_one({"id": ingreso_id})
    return {"ok": True}
