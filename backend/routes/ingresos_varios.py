from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import Optional, List

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso, apply_logo_filter, is_forbidden

router = APIRouter()

# Categorías sugeridas para ingresos sin factura
CATEGORIAS = [
    "Pago en efectivo",
    "Transferencia",
    "Reembolso",
    "Anticipo recibido",
    "Donación",
    "Venta de activo",
    "Otro",
]


@router.get("/admin/ingresos-varios")
async def get_ingresos_varios(
    logo_tipo: Optional[str] = None,
    mes: Optional[str] = None,   # YYYY-MM
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "ingresos_varios.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}
    docs = await db.ingresos_varios.find(query, {"_id": 0}).sort("fecha", -1).to_list(1000)
    return docs


@router.post("/admin/ingresos-varios")
async def create_ingreso_varios(
    data: dict,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "ingresos_varios.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    monto = float(data.get("monto", 0))
    if monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    moneda = data.get("moneda", "PYG")
    tipo_cambio = float(data["tipo_cambio"]) if data.get("tipo_cambio") else None
    monto_pyg = monto * (tipo_cambio or 1) if moneda != "PYG" else monto

    # Cuenta bancaria destino (si no viene, usar predeterminada)
    cuenta_id = (data.get("cuenta_id") or "").strip() or None
    if not cuenta_id:
        pred = await db.cuentas_bancarias.find_one(
            {"logo_tipo": data.get("logo_tipo", "arandujar"), "moneda": moneda,
             "es_predeterminada": True, "activo": {"$ne": False}},
            {"_id": 0, "id": 1}
        )
        cuenta_id = pred["id"] if pred else None

    doc = {
        "id": str(uuid.uuid4()),
        "descripcion": data.get("descripcion", "").strip(),
        "categoria": data.get("categoria", "Otro"),
        "monto": monto,
        "moneda": moneda,
        "tipo_cambio": tipo_cambio,
        "monto_pyg": monto_pyg,
        "fecha": data.get("fecha", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "logo_tipo": data.get("logo_tipo", "arandujar"),
        "cuenta_id": cuenta_id,
        "notas": data.get("notas") or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ingresos_varios.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/ingresos-varios/{ingreso_id}")
async def update_ingreso_varios(
    ingreso_id: str,
    data: dict,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "ingresos_varios.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    doc = await db.ingresos_varios.find_one({"id": ingreso_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrado")
    monto = float(data.get("monto", 0))
    moneda = data.get("moneda", "PYG")
    tipo_cambio = float(data["tipo_cambio"]) if data.get("tipo_cambio") else None
    monto_pyg = monto * (tipo_cambio or 1) if moneda != "PYG" else monto

    updates = {
        "descripcion": data.get("descripcion", "").strip(),
        "categoria": data.get("categoria", "Otro"),
        "monto": monto,
        "moneda": moneda,
        "tipo_cambio": tipo_cambio,
        "monto_pyg": monto_pyg,
        "fecha": data.get("fecha", doc["fecha"]),
        "logo_tipo": data.get("logo_tipo", doc["logo_tipo"]),
        "cuenta_id": data.get("cuenta_id", doc.get("cuenta_id")),
        "notas": data.get("notas") or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ingresos_varios.update_one({"id": ingreso_id}, {"$set": updates})
    return {**doc, **updates}


@router.delete("/admin/ingresos-varios/{ingreso_id}")
async def delete_ingreso_varios(
    ingreso_id: str,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "ingresos_varios.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    result = await db.ingresos_varios.delete_one({"id": ingreso_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}
