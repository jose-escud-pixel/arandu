from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso, log_auditoria
from routes.cotizaciones import tipo_cambio_usd_sugerido

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


async def _asegurar_tc_fiscal_nota(data: dict) -> dict:
    if (data.get("moneda") or "PYG").upper() != "USD":
        return data
    try:
        tc = float(data.get("tipo_cambio") or 0)
    except (TypeError, ValueError):
        tc = 0
    if tc > 0:
        return data
    sugerido = await tipo_cambio_usd_sugerido((data.get("fecha") or "")[:10])
    if not sugerido:
        raise HTTPException(status_code=400, detail="Falta el tipo de cambio fiscal para esta nota de crédito USD.")
    data["tipo_cambio"] = sugerido
    data["tipo_cambio_fuente"] = "Cambios Chaco"
    data["tipo_cambio_fecha"] = (data.get("fecha") or "")[:10]
    data["tipo_cambio_fiscal_auto"] = True
    return data


def _credito_compra_entry(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "numero": doc.get("numero"),
        "fecha": doc.get("fecha"),
        "monto": doc.get("monto") or 0,
        "moneda": doc.get("moneda", "PYG"),
        "tipo_cambio": doc.get("tipo_cambio"),
        "motivo": doc.get("motivo"),
    }


async def _aplicar_credito_compra(doc: dict):
    if doc.get("tipo") != "compra" or not (doc.get("compra_id") or doc.get("compra_numero_factura")):
        return
    compra_query = {"id": doc["compra_id"]} if doc.get("compra_id") else {"numero_factura": doc.get("compra_numero_factura")}
    compra = await db.compras.find_one(compra_query, {"_id": 0, "id": 1, "numero_factura": 1, "proveedor_id": 1, "proveedor_nombre": 1, "moneda": 1})
    if not compra:
        raise HTTPException(status_code=400, detail="La compra vinculada no existe")
    proveedor_ok = (
        not doc.get("proveedor_id")
        or not compra.get("proveedor_id")
        or doc.get("proveedor_id") == compra.get("proveedor_id")
    )
    nombre_ok = (
        not doc.get("proveedor_nombre")
        or not compra.get("proveedor_nombre")
        or doc.get("proveedor_nombre") == compra.get("proveedor_nombre")
    )
    if not proveedor_ok and not nombre_ok:
        raise HTTPException(status_code=400, detail="La compra vinculada pertenece a otro proveedor")
    if doc.get("moneda") and compra.get("moneda") and doc.get("moneda") != compra.get("moneda"):
        raise HTTPException(status_code=400, detail="La nota y la compra vinculada deben tener la misma moneda")
    await db.compras.update_one(
        {"id": compra["id"]},
        {
            "$pull": {"creditos": {"id": doc["id"]}},
        },
    )
    await db.compras.update_one(
        {"id": compra["id"]},
        {"$push": {"creditos": _credito_compra_entry(doc)}},
    )
    if not doc.get("compra_id"):
        doc["compra_id"] = compra["id"]
    if not doc.get("compra_numero_factura"):
        doc["compra_numero_factura"] = compra.get("numero_factura")


async def _revertir_credito_compra(doc: dict):
    if doc.get("tipo") != "compra" or not doc.get("compra_id"):
        return
    await db.compras.update_one(
        {"id": doc["compra_id"]},
        {"$pull": {"creditos": {"id": doc["id"]}}},
    )


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

    data_dict = await _asegurar_tc_fiscal_nota(data.dict())
    doc = {
        "id": str(uuid.uuid4()),
        **data_dict,
        "monto_pyg": _monto_pyg(data_dict),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _aplicar_credito_compra(doc)
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
    data_dict = await _asegurar_tc_fiscal_nota(data.dict())
    updates = {
        **data_dict,
        "monto_pyg": _monto_pyg(data_dict),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    updated_doc = {**existing, **updates}
    await _revertir_credito_compra(existing)
    await _aplicar_credito_compra(updated_doc)
    updates["compra_id"] = updated_doc.get("compra_id")
    updates["compra_numero_factura"] = updated_doc.get("compra_numero_factura")
    await db.notas_credito.update_one({"id": nota_id}, {"$set": updates})
    await log_auditoria(user, "notas_credito", "editar", f"Nota de crédito {data.numero} actualizada", nota_id)
    return {**existing, **updates}


@router.delete("/admin/notas-credito/{nota_id}")
async def delete_nota_credito(nota_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "notas_credito.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    existing = await db.notas_credito.find_one({"id": nota_id}, {"_id": 0})
    result = await db.notas_credito.delete_one({"id": nota_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    if existing:
        await _revertir_credito_compra(existing)
    await log_auditoria(user, "notas_credito", "eliminar", f"Nota de crédito eliminada: {nota_id}", nota_id)
    return {"success": True}
