from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from config import db
from auth import require_admin, require_authenticated, has_permission, apply_logo_filter, is_forbidden

router = APIRouter()


@router.get("/admin/stats")
async def get_stats(logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    emp_query: dict = {}
    presup_query: dict = {}
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        emp_query = {"id": {"$in": user["empresas_asignadas"]}}
        presup_query = {"empresa_id": {"$in": user["empresas_asignadas"]}}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return {"total_messages": 0, "unread_messages": 0, "read_messages": 0, "total_empresas": 0, "total_presupuestos": 0}
    # Filtro estricto por logo_tipo para clientes y presupuestos
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return {"total_messages": 0, "unread_messages": 0, "read_messages": 0, "total_empresas": 0, "total_presupuestos": 0}
    emp_query.update(logo_q)
    presup_query.update(logo_q)
    total_messages = await db.contact_messages.count_documents({}) if user.get("role") == "admin" else 0
    unread_messages = await db.contact_messages.count_documents({"read": False}) if user.get("role") == "admin" else 0
    total_empresas = await db.empresas.count_documents(emp_query)
    total_presupuestos = await db.presupuestos.count_documents(presup_query)
    presupuestos_borrador = await db.presupuestos.count_documents({**presup_query, "estado": "borrador"})
    presupuestos_aprobados = await db.presupuestos.count_documents({**presup_query, "estado": "aprobado"})
    presupuestos_facturados = await db.presupuestos.count_documents({**presup_query, "estado": "facturado"})
    presupuestos_cobrados = await db.presupuestos.count_documents({**presup_query, "estado": "cobrado"})
    return {
        "total_messages": total_messages, "unread_messages": unread_messages,
        "read_messages": total_messages - unread_messages,
        "total_empresas": total_empresas, "total_presupuestos": total_presupuestos,
        "presupuestos_borrador": presupuestos_borrador,
        "presupuestos_aprobados": presupuestos_aprobados,
        "presupuestos_facturados": presupuestos_facturados,
        "presupuestos_cobrados": presupuestos_cobrados
    }

@router.get("/admin/presupuestos/estadisticas")
async def get_presupuesto_stats(logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "estadisticas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver estadisticas")
    match_stage = {}
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        match_stage = {"empresa_id": {"$in": user["empresas_asignadas"]}}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return {"total": 0, "por_estado": {}, "por_estado_moneda": {}}
    if logo_tipo and logo_tipo != "todas":
        match_stage["logo_tipo"] = logo_tipo
    pipeline_by_estado = []
    if match_stage:
        pipeline_by_estado.append({"$match": match_stage})
    pipeline_by_estado.append({"$group": {"_id": "$estado", "count": {"$sum": 1}, "total_monto": {"$sum": "$total"}}})
    pipeline_by_moneda = []
    if match_stage:
        pipeline_by_moneda.append({"$match": match_stage})
    pipeline_by_moneda.extend([
        {"$addFields": {"moneda_norm": {"$ifNull": ["$moneda", "PYG"]}}},
        {"$group": {"_id": {"estado": "$estado", "moneda": "$moneda_norm"}, "count": {"$sum": 1}, "total_monto": {"$sum": "$total"}}}
    ])
    stats_estado = await db.presupuestos.aggregate(pipeline_by_estado).to_list(20)
    stats_moneda = await db.presupuestos.aggregate(pipeline_by_moneda).to_list(50)
    estado_summary = {}
    for s in stats_estado:
        estado_summary[s["_id"] or "borrador"] = {"count": s["count"], "total_monto": s["total_monto"]}
    moneda_detail = {}
    for s in stats_moneda:
        estado = s["_id"]["estado"] or "borrador"
        moneda = s["_id"].get("moneda", "PYG") or "PYG"
        if estado not in moneda_detail:
            moneda_detail[estado] = {}
        moneda_detail[estado][moneda] = {"count": s["count"], "total_monto": s["total_monto"]}
    total_general = await db.presupuestos.count_documents(match_stage if match_stage else {})
    return {"total": total_general, "por_estado": estado_summary, "por_estado_moneda": moneda_detail}

@router.get("/admin/estadisticas/empresas")
async def get_stats_by_empresa(logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "estadisticas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver estadisticas")
    base_match = {}
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        base_match["empresa_id"] = {"$in": user["empresas_asignadas"]}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return []
    if logo_tipo and logo_tipo != "todas":
        base_match["logo_tipo"] = logo_tipo
    pipeline = []
    if base_match:
        pipeline.append({"$match": base_match})
    pipeline.extend([
        {"$addFields": {"moneda_norm": {"$ifNull": ["$moneda", "PYG"]}}},
        {"$group": {"_id": {"empresa_id": "$empresa_id", "estado": "$estado", "moneda": "$moneda_norm"},
            "count": {"$sum": 1}, "total_monto": {"$sum": "$total"}, "total_ganancia": {"$sum": "$costos_reales.ganancia"}}}
    ])
    raw = await db.presupuestos.aggregate(pipeline).to_list(500)
    empresas_data = {}
    for r in raw:
        emp_id = r["_id"]["empresa_id"]
        estado = r["_id"]["estado"]
        moneda = r["_id"]["moneda"]
        if emp_id not in empresas_data:
            empresas_data[emp_id] = {"estados": {}, "total_count": 0, "total_monto_pyg": 0, "total_monto_usd": 0, "total_ganancia": 0}
        empresas_data[emp_id]["total_count"] += r["count"]
        if moneda == "USD":
            empresas_data[emp_id]["total_monto_usd"] += r["total_monto"]
        else:
            empresas_data[emp_id]["total_monto_pyg"] += r["total_monto"]
        empresas_data[emp_id]["total_ganancia"] += r.get("total_ganancia", 0) or 0
        if estado not in empresas_data[emp_id]["estados"]:
            empresas_data[emp_id]["estados"][estado] = {"count": 0, "monto_pyg": 0, "monto_usd": 0}
        empresas_data[emp_id]["estados"][estado]["count"] += r["count"]
        if moneda == "USD":
            empresas_data[emp_id]["estados"][estado]["monto_usd"] += r["total_monto"]
        else:
            empresas_data[emp_id]["estados"][estado]["monto_pyg"] += r["total_monto"]
    empresa_ids = list(empresas_data.keys())
    empresas_list = await db.empresas.find({"id": {"$in": empresa_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)
    empresa_names = {e["id"]: e["nombre"] for e in empresas_list}
    result = []
    for emp_id, data in empresas_data.items():
        result.append({"empresa_id": emp_id, "empresa_nombre": empresa_names.get(emp_id, "Desconocida"), **data})
    result.sort(key=lambda x: x["total_count"], reverse=True)
    return result

@router.get("/admin/estadisticas/proveedores")
async def get_proveedor_stats(admin: dict = Depends(require_admin)):
    presupuestos = await db.presupuestos.find(
        {"costos_reales": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "numero": 1, "empresa_id": 1, "moneda": 1, "costos_reales": 1}
    ).to_list(1000)
    emp_ids = list(set(p["empresa_id"] for p in presupuestos))
    empresas_list = await db.empresas.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)
    emp_map = {e["id"]: e["nombre"] for e in empresas_list}
    proveedores = {}
    for p in presupuestos:
        costos = p.get("costos_reales", {})
        items = costos.get("items", [])
        moneda = p.get("moneda", "PYG")
        pagos_map = {pp["proveedor"]: pp for pp in costos.get("proveedores_pagos", [])}
        for item in items:
            prov = item.get("proveedor", "") or "Gastos Comunes"
            monto = item.get("costo_real", 0) * item.get("cantidad", 1)
            key = f"{prov}_{moneda}"
            if key not in proveedores:
                proveedores[key] = {"proveedor": prov, "moneda": moneda, "monto_total": 0, "pagado_total": 0, "pendiente_total": 0, "presupuestos": []}
            proveedores[key]["monto_total"] += monto
        prov_totals = {}
        for item in items:
            prov = item.get("proveedor", "") or "Gastos Comunes"
            monto = item.get("costo_real", 0) * item.get("cantidad", 1)
            prov_totals[prov] = prov_totals.get(prov, 0) + monto
        for prov, total in prov_totals.items():
            key = f"{prov}_{moneda}"
            pago_info = pagos_map.get(prov, {})
            is_paid = pago_info.get("pagado", False)
            if is_paid:
                proveedores[key]["pagado_total"] += total
            else:
                proveedores[key]["pendiente_total"] += total
            proveedores[key]["presupuestos"].append({
                "presupuesto_id": p["id"], "numero": p.get("numero", ""),
                "empresa": emp_map.get(p["empresa_id"], ""), "monto": total,
                "pagado": is_paid, "fecha_pago": pago_info.get("fecha_pago")
            })
    result = sorted(proveedores.values(), key=lambda x: x["pendiente_total"], reverse=True)
    return result

@router.get("/admin/auditoria")
async def get_auditoria(
    modulo: Optional[str] = None, usuario_id: Optional[str] = None,
    limit: int = 100, admin: dict = Depends(require_admin)
):
    query = {}
    if modulo:
        query["modulo"] = modulo
    if usuario_id:
        query["usuario_id"] = usuario_id
    logs = await db.auditoria.find(query, {"_id": 0}).sort("fecha", -1).to_list(limit)
    return logs
