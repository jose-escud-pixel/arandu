from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from models.schemas import CostoFijoCreate, CostoFijoResponse, PagoCostoFijoCreate, PagoCostoFijoResponse

router = APIRouter()


def es_due_en_periodo(costo: dict, periodo: str) -> bool:
    try:
        year, month = int(periodo[:4]), int(periodo[5:7])
        fecha_inicio = costo.get("fecha_inicio", "")
        if not fecha_inicio:
            return False
        fi_year, fi_month = int(fecha_inicio[:4]), int(fecha_inicio[5:7])
        fecha_fin = costo.get("fecha_fin")
        if fecha_fin:
            ff_year, ff_month = int(fecha_fin[:4]), int(fecha_fin[5:7])
            if (year, month) > (ff_year, ff_month):
                return False
        if (year, month) < (fi_year, fi_month):
            return False
        frecuencia = costo.get("frecuencia", "mensual")
        diff_months = (year - fi_year) * 12 + (month - fi_month)
        if frecuencia == "unica":
            return (year, month) == (fi_year, fi_month)
        elif frecuencia == "mensual":
            return True
        elif frecuencia == "trimestral":
            return diff_months % 3 == 0
        elif frecuencia == "semestral":
            return diff_months % 6 == 0
        elif frecuencia == "anual":
            return diff_months % 12 == 0
        return False
    except Exception:
        return False


@router.get("/admin/costos-fijos", response_model=List[CostoFijoResponse])
async def get_costos_fijos(logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos_fijos.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver costos fijos")
    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    costos = await db.costos_fijos.find(query, {"_id": 0}).sort("nombre", 1).to_list(500)
    return costos


@router.post("/admin/costos-fijos", response_model=CostoFijoResponse)
async def create_costo_fijo(data: CostoFijoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos_fijos.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear costos fijos")
    costo_id = str(uuid.uuid4())
    doc = {
        "id": costo_id,
        "logo_tipo": data.logo_tipo,
        "nombre": data.nombre,
        "descripcion": data.descripcion,
        "categoria": data.categoria,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "frecuencia": data.frecuencia,
        "dia_vencimiento": data.dia_vencimiento,
        "fecha_inicio": data.fecha_inicio,
        "fecha_fin": data.fecha_fin,
        "activo": data.activo,
        "notas": data.notas,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.costos_fijos.insert_one(doc)
    await log_auditoria(user, "costos_fijos", "crear", f"Costo fijo '{data.nombre}' creado", costo_id)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/costos-fijos/{costo_id}", response_model=CostoFijoResponse)
async def update_costo_fijo(costo_id: str, data: CostoFijoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos_fijos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso para editar costos fijos")
    existing = await db.costos_fijos.find_one({"id": costo_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Costo fijo no encontrado")
    update_fields = {
        "logo_tipo": data.logo_tipo,
        "nombre": data.nombre,
        "descripcion": data.descripcion,
        "categoria": data.categoria,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "frecuencia": data.frecuencia,
        "dia_vencimiento": data.dia_vencimiento,
        "fecha_inicio": data.fecha_inicio,
        "fecha_fin": data.fecha_fin,
        "activo": data.activo,
        "notas": data.notas,
    }
    await db.costos_fijos.update_one({"id": costo_id}, {"$set": update_fields})
    updated = await db.costos_fijos.find_one({"id": costo_id}, {"_id": 0})
    return updated


@router.patch("/admin/costos-fijos/{costo_id}/toggle")
async def toggle_costo_fijo(costo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos_fijos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso para editar costos fijos")
    costo = await db.costos_fijos.find_one({"id": costo_id})
    if not costo:
        raise HTTPException(status_code=404, detail="Costo fijo no encontrado")
    new_activo = not costo.get("activo", True)
    await db.costos_fijos.update_one({"id": costo_id}, {"$set": {"activo": new_activo}})
    return {"success": True, "activo": new_activo}


@router.delete("/admin/costos-fijos/{costo_id}")
async def delete_costo_fijo(costo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos_fijos.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar costos fijos")
    result = await db.costos_fijos.delete_one({"id": costo_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Costo fijo no encontrado")
    await db.pagos_costos_fijos.delete_many({"costo_fijo_id": costo_id})
    return {"success": True}


@router.get("/admin/costos-fijos/vencimientos")
async def get_vencimientos_periodo(periodo: str, logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    """Retorna los costos fijos que vencen en el periodo YYYY-MM con estado pagado/pendiente/vencido."""
    if not has_permission(user, "costos_fijos.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver costos fijos")

    query = {"activo": True}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)

    costos = await db.costos_fijos.find(query, {"_id": 0}).to_list(500)
    costos_periodo = [c for c in costos if es_due_en_periodo(c, periodo)]

    costo_ids = [c["id"] for c in costos_periodo]
    pagos_existentes = await db.pagos_costos_fijos.find(
        {"costo_fijo_id": {"$in": costo_ids}, "periodo": periodo}, {"_id": 0}
    ).to_list(500)
    pagos_map = {p["costo_fijo_id"]: p for p in pagos_existentes}

    try:
        year, month = int(periodo[:4]), int(periodo[5:7])
        now = datetime.now(timezone.utc)
        periodo_vencido = (year, month) < (now.year, now.month)
    except Exception:
        periodo_vencido = False

    result = []
    for c in costos_periodo:
        pago = pagos_map.get(c["id"])
        if pago:
            estado = "pagado"
        elif periodo_vencido:
            estado = "vencido"
        else:
            estado = "pendiente"
        result.append({
            "costo_id": c["id"],
            "logo_tipo": c.get("logo_tipo", "arandujar"),
            "nombre": c["nombre"],
            "descripcion": c.get("descripcion"),
            "categoria": c.get("categoria"),
            "monto": c["monto"],
            "moneda": c["moneda"],
            "tipo_cambio": c.get("tipo_cambio"),
            "frecuencia": c["frecuencia"],
            "dia_vencimiento": c.get("dia_vencimiento", 1),
            "estado": estado,
            "pago": pago,
        })
    # Ordenar: vencidos primero, luego pendientes, luego pagados
    orden = {"vencido": 0, "pendiente": 1, "pagado": 2}
    result.sort(key=lambda x: orden.get(x["estado"], 9))
    return result


@router.post("/admin/costos-fijos/{costo_id}/pagos", response_model=PagoCostoFijoResponse)
async def registrar_pago_costo(costo_id: str, data: PagoCostoFijoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos_fijos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso para registrar pagos")
    costo = await db.costos_fijos.find_one({"id": costo_id})
    if not costo:
        raise HTTPException(status_code=404, detail="Costo fijo no encontrado")
    existing = await db.pagos_costos_fijos.find_one({"costo_fijo_id": costo_id, "periodo": data.periodo})
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un pago para el periodo {data.periodo}")
    pago_id = str(uuid.uuid4())
    doc = {
        "id": pago_id,
        "costo_fijo_id": costo_id,
        "periodo": data.periodo,
        "monto_pagado": data.monto_pagado,
        "fecha_pago": data.fecha_pago,
        "notas": data.notas,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.pagos_costos_fijos.insert_one(doc)
    await log_auditoria(user, "costos_fijos", "pago", f"Pago registrado para '{costo.get('nombre')}' periodo {data.periodo}", costo_id)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/admin/pagos-costos/{pago_id}")
async def anular_pago_costo(pago_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos_fijos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso para anular pagos")
    result = await db.pagos_costos_fijos.delete_one({"id": pago_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return {"success": True}
