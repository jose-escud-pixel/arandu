from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_admin, require_authenticated, has_permission, can_access_empresa, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from models.schemas import PresupuestoCreate, PresupuestoResponse, CostosReales

router = APIRouter()


async def get_next_presupuesto_number():
    year = datetime.now().year
    count = await db.presupuestos.count_documents({"numero": {"$regex": f"^P{year}"}})
    return f"P{year}-{str(count + 1).zfill(4)}"

@router.post("/admin/presupuestos", response_model=PresupuestoResponse)
async def create_presupuesto(data: PresupuestoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "presupuestos.crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso para crear presupuestos")
    if not can_access_empresa(user, data.empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": data.empresa_id}, {"_id": 0})
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    presupuesto_id = str(uuid.uuid4())
    numero = data.numero or await get_next_presupuesto_number()
    fecha = data.fecha or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    moneda_text = "Dolares Americanos" if data.moneda == "USD" else "Guaranies"
    pago_text = "A credito" if (data.forma_pago or "contado") == "credito" else "Al contado"
    presupuesto_doc = {
        "id": presupuesto_id, "empresa_id": data.empresa_id, "logo_tipo": data.logo_tipo,
        "moneda": data.moneda, "forma_pago": data.forma_pago or "contado",
        "numero": numero, "nombre_archivo": data.nombre_archivo or None,
        "fecha": fecha, "tipo_cambio": data.tipo_cambio,
        "validez_dias": data.validez_dias, "items": [item.dict() for item in data.items],
        "observaciones": data.observaciones,
        "condiciones": data.condiciones or f"- Precios expresados en {moneda_text} (IVA incluido).\n- Validez de la oferta: {data.validez_dias} dias.\n- Forma de pago: {pago_text}.\n- Tiempo de entrega: A confirmar segun stock.",
        "subtotal": data.subtotal, "iva": data.iva, "total": data.total,
        "estado": "borrador", "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.presupuestos.insert_one(presupuesto_doc)
    await log_auditoria(user, "presupuestos", "crear", f"Presupuesto {numero} creado para {empresa['nombre']}", presupuesto_id)
    response = {**{k: v for k, v in presupuesto_doc.items() if k != "_id"}, "empresa_nombre": empresa["nombre"], "empresa_ruc": empresa.get("ruc")}
    return response

@router.get("/admin/presupuestos", response_model=List[PresupuestoResponse])
async def get_presupuestos(empresa_id: Optional[str] = None, estado: Optional[str] = None, logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "presupuestos.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver presupuestos")
    query = {}
    if empresa_id:
        if not can_access_empresa(user, empresa_id):
            return []
        query["empresa_id"] = empresa_id
    elif user.get("role") != "admin" and user.get("empresas_asignadas"):
        query["empresa_id"] = {"$in": user["empresas_asignadas"]}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return []
    if estado:
        query["estado"] = estado
    # Filtro estricto por logo_tipo activo (respeta logos_asignados y selección del usuario)
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    presupuestos = await db.presupuestos.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    empresa_ids = list(set(p["empresa_id"] for p in presupuestos))
    empresas_list = await db.empresas.find({"id": {"$in": empresa_ids}}, {"_id": 0, "id": 1, "nombre": 1, "ruc": 1}).to_list(500)
    empresa_map = {e["id"]: e for e in empresas_list}
    # Contar facturas vinculadas por presupuesto (soporta campo legacy y nuevo array)
    presupuesto_ids = [p["id"] for p in presupuestos]
    facturas_vinculadas = await db.facturas.find(
        {
            "$or": [
                {"presupuesto_ids": {"$elemMatch": {"$in": presupuesto_ids}}},
                {"presupuesto_id": {"$in": presupuesto_ids}},
            ],
            "estado": {"$ne": "anulada"},
        },
        {"_id": 0, "presupuesto_id": 1, "presupuesto_ids": 1}
    ).to_list(5000)
    facturas_count_map: dict = {}
    for f in facturas_vinculadas:
        # Recolectar todos los IDs referenciados por esta factura
        pids_fac = list(f.get("presupuesto_ids") or [])
        if f.get("presupuesto_id") and f["presupuesto_id"] not in pids_fac:
            pids_fac.append(f["presupuesto_id"])
        for pid in pids_fac:
            if pid in presupuesto_ids:
                facturas_count_map[pid] = facturas_count_map.get(pid, 0) + 1
    for p in presupuestos:
        emp = empresa_map.get(p["empresa_id"], {})
        p["empresa_nombre"] = emp.get("nombre", "Desconocida")
        p["empresa_ruc"] = emp.get("ruc")
        if "forma_pago" not in p:
            p["forma_pago"] = "contado"
        p["facturas_count"] = facturas_count_map.get(p["id"], 0)
    return presupuestos

@router.get("/admin/presupuestos/{presupuesto_id}", response_model=PresupuestoResponse)
async def get_presupuesto(presupuesto_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "presupuestos.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    presupuesto = await db.presupuestos.find_one({"id": presupuesto_id}, {"_id": 0})
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    if not can_access_empresa(user, presupuesto["empresa_id"]):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": presupuesto["empresa_id"]}, {"_id": 0})
    presupuesto["empresa_nombre"] = empresa["nombre"] if empresa else "Desconocida"
    presupuesto["empresa_ruc"] = empresa.get("ruc") if empresa else None
    if "forma_pago" not in presupuesto:
        presupuesto["forma_pago"] = "contado"
    return presupuesto

@router.put("/admin/presupuestos/{presupuesto_id}/estado")
async def update_presupuesto_estado(presupuesto_id: str, estado: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "presupuestos.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar presupuestos")
    valid_estados = ["borrador", "enviado", "aprobado", "rechazado", "facturado", "cobrado"]
    if estado not in valid_estados:
        raise HTTPException(status_code=400, detail=f"Estado invalido. Use: {valid_estados}")
    update_fields = {"estado": estado}
    if estado == "facturado":
        update_fields["fecha_facturado"] = datetime.now(timezone.utc).isoformat()
        presupuesto = await db.presupuestos.find_one({"id": presupuesto_id}, {"_id": 0})
        if presupuesto and not presupuesto.get("costos_reales"):
            items = presupuesto.get("items", [])
            doc_moneda = presupuesto.get("moneda", "PYG")
            doc_tc = presupuesto.get("tipo_cambio") or 1
            costos_items = []
            total_costos = 0
            for item in items:
                moneda_item = item.get("moneda_item") or doc_moneda
                tc_item = item.get("tipo_cambio_item") or doc_tc
                costo_orig = item["costo"]
                # Convertir costo a moneda del documento para el total
                if moneda_item != doc_moneda and tc_item:
                    if doc_moneda == "PYG" and moneda_item == "USD":
                        costo_en_doc = costo_orig * tc_item
                    elif doc_moneda == "USD" and moneda_item == "PYG":
                        costo_en_doc = costo_orig / tc_item if tc_item else 0
                    else:
                        costo_en_doc = costo_orig
                else:
                    costo_en_doc = costo_orig
                total_costos += costo_en_doc * item["cantidad"]
                costos_items.append({
                    "descripcion": item["descripcion"], "cantidad": item["cantidad"],
                    "costo_estimado": costo_orig,       # en moneda_item original
                    "costo_real": costo_orig,            # empieza igual, usuario lo ajusta
                    "observacion": item.get("observacion", ""),
                    "proveedor": "",
                    "es_nuevo": False,
                    "moneda_item": moneda_item,
                    "tipo_cambio_item": item.get("tipo_cambio_item"),
                    "moneda_costo": moneda_item,          # real empieza en la misma moneda
                    "tipo_cambio_costo": item.get("tipo_cambio_item")
                })
            total_facturado = presupuesto.get("total", 0)
            update_fields["costos_reales"] = {
                "items": costos_items, "total_costos": round(total_costos),
                "total_facturado": total_facturado, "ganancia": total_facturado - round(total_costos),
                "proveedores_pagos": []
            }
    elif estado == "cobrado":
        update_fields["fecha_cobrado"] = datetime.now(timezone.utc).isoformat()
    result = await db.presupuestos.update_one({"id": presupuesto_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    await log_auditoria(user, "presupuestos", "cambiar_estado", f"Estado cambiado a {estado}", presupuesto_id)
    return {"success": True}

@router.put("/admin/presupuestos/{presupuesto_id}/costos")
async def update_costos_reales(presupuesto_id: str, data: CostosReales, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "costos.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar costos")
    presupuesto = await db.presupuestos.find_one({"id": presupuesto_id}, {"_id": 0})
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    await db.presupuestos.update_one({"id": presupuesto_id}, {"$set": {"costos_reales": data.dict()}})
    await log_auditoria(user, "presupuestos", "actualizar_costos", f"Costos actualizados para {presupuesto.get('numero', presupuesto_id)}", presupuesto_id)
    return {"success": True}

@router.put("/admin/presupuestos/{presupuesto_id}", response_model=PresupuestoResponse)
async def update_presupuesto(presupuesto_id: str, data: PresupuestoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "presupuestos.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar presupuestos")
    if not can_access_empresa(user, data.empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": data.empresa_id}, {"_id": 0})
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    existing = await db.presupuestos.find_one({"id": presupuesto_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    await db.presupuestos.update_one(
        {"id": presupuesto_id},
        {"$set": {
            "empresa_id": data.empresa_id, "logo_tipo": data.logo_tipo, "moneda": data.moneda,
            "forma_pago": data.forma_pago or "contado",
            "numero": data.numero or existing.get("numero"),
            "nombre_archivo": data.nombre_archivo if data.nombre_archivo is not None else existing.get("nombre_archivo"),
            "tipo_cambio": data.tipo_cambio,
            "fecha": data.fecha or existing["fecha"], "validez_dias": data.validez_dias,
            "items": [item.dict() for item in data.items], "observaciones": data.observaciones,
            "condiciones": data.condiciones, "subtotal": data.subtotal, "iva": data.iva, "total": data.total
        }}
    )
    updated = await db.presupuestos.find_one({"id": presupuesto_id}, {"_id": 0})
    updated["empresa_nombre"] = empresa["nombre"]
    updated["empresa_ruc"] = empresa.get("ruc")
    if "forma_pago" not in updated:
        updated["forma_pago"] = "contado"
    return updated

@router.delete("/admin/presupuestos/{presupuesto_id}")
async def delete_presupuesto(presupuesto_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "presupuestos.eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar presupuestos")
    result = await db.presupuestos.delete_one({"id": presupuesto_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return {"success": True}
