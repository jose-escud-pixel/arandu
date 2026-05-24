from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from config import db
from auth import require_admin, require_authenticated, has_permission, apply_logo_filter, is_forbidden

router = APIRouter()


def _period_query(field: str, periodo_tipo: str = "todos", mes: Optional[str] = None, anio: Optional[str] = None) -> dict:
    if periodo_tipo == "mes" and mes:
        return {field: {"$regex": f"^{mes}"}}
    if periodo_tipo == "anio" and anio:
        return {field: {"$regex": f"^{anio}"}}
    return {}


def _period_or_query(fields: list, periodo_tipo: str = "todos", mes: Optional[str] = None, anio: Optional[str] = None) -> dict:
    prefix = mes if periodo_tipo == "mes" else anio if periodo_tipo == "anio" else None
    if not prefix:
        return {}
    return {"$or": [{field: {"$regex": f"^{prefix}"}} for field in fields]}


def _to_pyg(monto, moneda="PYG", tipo_cambio=None):
    try:
        monto = float(monto or 0)
    except (TypeError, ValueError):
        return 0
    if (moneda or "PYG") == "PYG":
        return monto
    try:
        tc = float(tipo_cambio or 0)
    except (TypeError, ValueError):
        tc = 0
    return monto * tc if tc > 0 else 0


def _sum_pyg(docs, field="monto", moneda_field="moneda", tc_field="tipo_cambio"):
    return round(sum(_to_pyg(d.get(field), d.get(moneda_field, "PYG"), d.get(tc_field)) for d in docs))


def _sum_usd_without_tc(docs, field="monto", moneda_field="moneda", tc_field="tipo_cambio"):
    total = 0
    for d in docs:
        if (d.get(moneda_field) or "PYG") != "USD":
            continue
        try:
            tc = float(d.get(tc_field) or 0)
        except (TypeError, ValueError):
            tc = 0
        if tc <= 0:
            total += float(d.get(field) or 0)
    return round(total, 2)


def _sum_usd(docs, field="monto", moneda_field="moneda"):
    total = 0
    for d in docs:
        if (d.get(moneda_field) or "PYG") != "USD":
            continue
        total += float(d.get(field) or 0)
    return round(total, 2)


def _iva_incluido(monto, tasa=10):
    try:
        monto = float(monto or 0)
        tasa = int(tasa or 10)
    except (TypeError, ValueError):
        return 0
    if tasa == 10:
        return monto / 11
    if tasa == 5:
        return monto / 21
    return 0


async def _docs(col, query, projection=None, limit=5000, sort_field=None):
    cursor = col.find(query, projection or {"_id": 0})
    if sort_field:
        cursor = cursor.sort(sort_field, -1)
    return await cursor.to_list(limit)


@router.get("/admin/dashboard/resumen")
async def get_dashboard_resumen(
    periodo_tipo: str = "todos",
    mes: Optional[str] = None,
    anio: Optional[str] = None,
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    """Resumen compacto para el panel principal."""
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        logo_q = {"id": "__forbidden__"}

    emp_query = dict(logo_q)
    clientes_total = await db.empresas.count_documents(emp_query)

    msg_q = _period_query("created_at", periodo_tipo, mes, anio)
    mensajes_total = await db.contact_messages.count_documents(msg_q) if user.get("role") == "admin" else 0
    mensajes_sin_leer = await db.contact_messages.count_documents({**msg_q, "read": False}) if user.get("role") == "admin" else 0

    per_fecha = _period_query("fecha", periodo_tipo, mes, anio)
    per_fecha_pago = _period_query("fecha_pago", periodo_tipo, mes, anio)
    per_periodo = _period_query("periodo", periodo_tipo, mes, anio)
    per_periodo_iva = _period_query("periodo_iva", periodo_tipo, mes, anio)

    presupuestos = await _docs(db.presupuestos, {**logo_q, **per_fecha}, {"_id": 0, "estado": 1, "total": 1, "moneda": 1, "tipo_cambio": 1})
    pres_estados = {}
    for p in presupuestos:
        estado = p.get("estado") or "borrador"
        pres_estados[estado] = pres_estados.get(estado, 0) + 1

    facturas = await _docs(
        db.facturas,
        {**logo_q, **per_fecha, "tipo": "emitida", "estado": {"$ne": "anulada"}, "eliminada": {"$ne": True}},
        {"_id": 0, "estado": 1, "monto": 1, "monto_pagado": 1, "iva": 1, "conceptos": 1, "sin_factura": 1, "moneda": 1, "tipo_cambio": 1, "pagos": 1},
    )
    fact_pagado = 0
    fact_pagado_usd = 0
    fact_pendiente = 0
    fact_pendiente_usd = 0
    for f in facturas:
        pagos = f.get("pagos") or []
        pagado = sum(_to_pyg(p.get("monto") or p.get("monto_pagado"), f.get("moneda", "PYG"), p.get("tipo_cambio") or f.get("tipo_cambio")) for p in pagos)
        pagado_raw = sum(float(p.get("monto") or p.get("monto_pagado") or 0) for p in pagos)
        if not pagado:
            pagado = _to_pyg(f.get("monto_pagado"), f.get("moneda", "PYG"), f.get("tipo_cambio"))
        if not pagado_raw:
            pagado_raw = float(f.get("monto_pagado") or 0)
        if not pagado and f.get("estado") == "pagada":
            pagado = _to_pyg(f.get("monto"), f.get("moneda", "PYG"), f.get("tipo_cambio"))
        if not pagado_raw and f.get("estado") == "pagada":
            pagado_raw = float(f.get("monto") or 0)
        fact_pagado += pagado
        if (f.get("moneda") or "PYG") == "USD":
            fact_pagado_usd += pagado_raw
        if f.get("estado") == "pendiente":
            fact_pendiente += _to_pyg(f.get("monto"), f.get("moneda", "PYG"), f.get("tipo_cambio"))
            if (f.get("moneda") or "PYG") == "USD":
                fact_pendiente_usd += float(f.get("monto") or 0)
        elif f.get("estado") == "parcial":
            fact_pendiente += max(0, _to_pyg(f.get("monto"), f.get("moneda", "PYG"), f.get("tipo_cambio")) - pagado)
            if (f.get("moneda") or "PYG") == "USD":
                fact_pendiente_usd += max(0, float(f.get("monto") or 0) - pagado_raw)
    fact_total = _sum_pyg(facturas, "monto")
    fact_total_usd = _sum_usd(facturas, "monto")

    ingresos = await _docs(db.ingresos_varios, {**logo_q, **per_fecha, "categoria": {"$ne": "Pago IVA"}}, {"_id": 0, "monto": 1, "moneda": 1, "tipo_cambio": 1})
    recibos = await _docs(db.recibos, {**logo_q, **per_fecha_pago}, {"_id": 0, "monto": 1, "moneda": 1, "tipo_cambio": 1})

    compras = await _docs(db.compras, {**logo_q, **per_fecha}, {"_id": 0, "monto_total": 1, "monto_iva": 1, "tasa_iva": 1, "moneda": 1, "tipo_cambio": 1, "tipo_pago": 1, "pagos": 1, "fecha_vencimiento": 1})
    compras_total = _sum_pyg(compras, "monto_total")
    compras_total_usd = _sum_usd(compras, "monto_total")
    compras_contado = [c for c in compras if (c.get("tipo_pago") or "contado") == "contado"]
    compras_credito = [c for c in compras if c.get("tipo_pago") == "credito"]
    compras_pagado = _sum_pyg(compras_contado, "monto_total")
    compras_pendiente = 0
    compras_pendiente_usd = 0
    for c in compras_credito:
        pagado = sum(p.get("monto_pagado", 0) or 0 for p in c.get("pagos", []))
        saldo = max(0, (c.get("monto_total") or 0) - pagado)
        saldo_pyg = _to_pyg(saldo, c.get("moneda", "PYG"), c.get("tipo_cambio"))
        compras_pendiente += saldo_pyg
        if (c.get("moneda") or "PYG") == "USD":
            compras_pendiente_usd += saldo

    pagos_prov = await _docs(db.pagos_proveedores, {**logo_q, **_period_or_query(["fecha_pago", "fecha_vencimiento"], periodo_tipo, mes, anio)}, {"_id": 0, "monto": 1, "monto_gs": 1, "moneda": 1, "tipo_cambio": 1, "estado": 1, "fecha_pago": 1})
    prov_pagado = round(sum((p.get("monto_gs") if p.get("monto_gs") is not None else _to_pyg(p.get("monto"), p.get("moneda", "PYG"), p.get("tipo_cambio"))) for p in pagos_prov if p.get("fecha_pago") or p.get("estado") == "pagado"))
    prov_pendiente = round(sum((p.get("monto_gs") if p.get("monto_gs") is not None else _to_pyg(p.get("monto"), p.get("moneda", "PYG"), p.get("tipo_cambio"))) for p in pagos_prov if not p.get("fecha_pago") and p.get("estado") != "pagado"))
    prov_pagado_usd = round(sum(float(p.get("monto") or 0) for p in pagos_prov if (p.get("moneda") or "PYG") == "USD" and (p.get("fecha_pago") or p.get("estado") == "pagado")), 2)
    prov_pendiente_usd = round(sum(float(p.get("monto") or 0) for p in pagos_prov if (p.get("moneda") or "PYG") == "USD" and not p.get("fecha_pago") and p.get("estado") != "pagado"), 2)

    sueldo_query = dict(per_periodo)
    if logo_q.get("logo_tipo"):
        emp_ids = [e["id"] for e in await db.empleados.find({"logo_tipo": logo_q["logo_tipo"]}, {"_id": 0, "id": 1}).to_list(1000)]
        sueldo_query["empleado_id"] = {"$in": emp_ids}
    sueldos = await _docs(db.sueldos, sueldo_query, {"_id": 0, "monto_pagado": 1, "total_extras": 1, "total_adelantos": 1, "descuento_ips": 1, "descuentos_adicionales": 1, "moneda": 1, "tipo_cambio": 1})
    sueldos_total = _sum_pyg(sueldos, "monto_pagado")
    sueldos_extras = _sum_pyg(sueldos, "total_extras")
    sueldos_adelantos = _sum_pyg(sueldos, "total_adelantos")
    sueldos_descuentos = round(sum((s.get("descuento_ips") or 0) + (s.get("descuentos_adicionales") or 0) for s in sueldos))

    notas = await _docs(db.notas_credito, {**logo_q, **per_fecha, "estado": {"$ne": "anulada"}}, {"_id": 0, "tipo": 1, "monto": 1, "monto_pyg": 1, "moneda": 1, "tipo_cambio": 1})
    notas_venta = [n for n in notas if (n.get("tipo") or "venta") == "venta"]
    notas_compra = [n for n in notas if n.get("tipo") == "compra"]
    notas_total = round(sum(n.get("monto_pyg") if n.get("monto_pyg") is not None else _to_pyg(n.get("monto"), n.get("moneda", "PYG"), n.get("tipo_cambio")) for n in notas))
    notas_total_usd = _sum_usd(notas, "monto")

    from routes.balance import _iva_factura_emitida
    iva_debito_usd = sum(_iva_factura_emitida(f) for f in facturas if (f.get("moneda") or "PYG") == "USD")
    iva_debito_usd -= sum(_iva_incluido(n.get("monto")) for n in notas_venta if (n.get("moneda") or "PYG") == "USD")
    iva_credito_usd = 0
    for c in compras:
        if (c.get("moneda") or "PYG") != "USD":
            continue
        iva_credito_usd += float(c.get("monto_iva") or _iva_incluido(c.get("monto_total"), c.get("tasa_iva", 10)))
    iva_credito_usd -= sum(_iva_incluido(n.get("monto")) for n in notas_compra if (n.get("moneda") or "PYG") == "USD")
    iva_saldo_usd = round(iva_debito_usd - iva_credito_usd, 2)

    costos_query = dict(logo_q)
    costos_ids = [c["id"] for c in await db.costos_fijos.find(costos_query, {"_id": 0, "id": 1}).to_list(5000)]
    pagos_costos_q = dict(per_periodo)
    if costos_ids:
        pagos_costos_q["costo_fijo_id"] = {"$in": costos_ids}
    elif logo_q:
        pagos_costos_q["costo_fijo_id"] = "__sin_costos__"
    pagos_costos = await _docs(db.pagos_costos_fijos, pagos_costos_q, {"_id": 0, "monto_pagado": 1, "moneda": 1, "tipo_cambio": 1})
    gastos_pagados = _sum_pyg(pagos_costos, "monto_pagado")
    gastos_pagados_usd = _sum_usd(pagos_costos, "monto_pagado")
    gastos_count = len(pagos_costos)

    pagos_iva = await _docs(db.pagos_iva, {**logo_q, **per_periodo_iva}, {"_id": 0, "monto": 1})
    iva_pagado = round(sum(p.get("monto") or 0 for p in pagos_iva))
    iva_mes = mes or ""
    iva_resumen = {"a_pagar": 0, "pagado": iva_pagado, "saldo": 0}
    from routes.balance import _calc_iva_periodo
    if periodo_tipo == "mes" and iva_mes:
        iva_calc = await _calc_iva_periodo(iva_mes, logo_tipo)
        iva_resumen["a_pagar"] = round(max(0, iva_calc.get("neto", 0)))
        iva_resumen["saldo"] = round(iva_calc.get("neto", 0) - iva_calc.get("pagos_iva", 0))
    elif periodo_tipo == "anio" and anio:
        total_neto = 0
        total_pagos = 0
        for i in range(1, 13):
            r = await _calc_iva_periodo(f"{anio}-{i:02d}", logo_tipo)
            total_neto += r.get("neto", 0)
            total_pagos += r.get("pagos_iva", 0)
        iva_resumen = {"a_pagar": round(max(0, total_neto)), "pagado": round(total_pagos), "saldo": round(total_neto - total_pagos)}
    elif periodo_tipo == "todos":
        periods = set()
        for col, field, extra in [
            (db.facturas, "fecha", {"tipo": "emitida", "estado": {"$ne": "anulada"}, "eliminada": {"$ne": True}}),
            (db.compras, "fecha", {"tiene_factura": True}),
            (db.pagos_iva, "periodo_iva", {}),
            (db.notas_credito, "fecha", {"estado": {"$ne": "anulada"}}),
        ]:
            vals = await col.distinct(field, {**logo_q, **extra})
            for v in vals:
                if isinstance(v, str) and len(v) >= 7:
                    periods.add(v[:7])
        total_neto = 0
        total_pagos = 0
        for periodo in sorted(periods):
            r = await _calc_iva_periodo(periodo, logo_tipo)
            total_neto += r.get("neto", 0)
            total_pagos += r.get("pagos_iva", 0)
        iva_resumen = {"a_pagar": round(max(0, total_neto)), "pagado": round(total_pagos), "saldo": round(total_neto - total_pagos)}

    return {
        "periodo_tipo": periodo_tipo,
        "mensajes": {"total": mensajes_total, "sin_leer": mensajes_sin_leer},
        "clientes": {"total": clientes_total},
        "presupuestos": {"total": len(presupuestos), "aprobados": pres_estados.get("aprobado", 0), "rechazados": pres_estados.get("rechazado", 0), "cobrados": pres_estados.get("cobrado", 0), "faltantes": pres_estados.get("facturado", 0) + pres_estados.get("aprobado", 0)},
        "facturacion": {"cantidad": len(facturas), "total": fact_total, "total_usd": fact_total_usd, "cobrado": round(fact_pagado), "cobrado_usd": round(fact_pagado_usd, 2), "pendiente": round(max(0, fact_pendiente)), "pendiente_usd": round(max(0, fact_pendiente_usd), 2)},
        "ingresos": {"cantidad": len(ingresos), "total": _sum_pyg(ingresos, "monto"), "total_usd": _sum_usd(ingresos, "monto")},
        "recibos": {"cantidad": len(recibos), "total": _sum_pyg(recibos, "monto"), "total_usd": _sum_usd(recibos, "monto")},
        "compras": {"cantidad": len(compras), "total": compras_total, "total_usd": compras_total_usd, "contado": len(compras_contado), "credito": len(compras_credito), "pagado": compras_pagado, "pendiente": round(compras_pendiente), "pendiente_usd": round(compras_pendiente_usd, 2)},
        "proveedores": {"pagado": prov_pagado, "pagado_usd": prov_pagado_usd, "pendiente": prov_pendiente, "pendiente_usd": prov_pendiente_usd, "pagos": len(pagos_prov)},
        "sueldos": {"cantidad": len(sueldos), "total": sueldos_total, "total_usd": _sum_usd(sueldos, "monto_pagado"), "extras": sueldos_extras, "extras_usd": _sum_usd(sueldos, "total_extras"), "adelantos": sueldos_adelantos, "adelantos_usd": _sum_usd(sueldos, "total_adelantos"), "descuentos": sueldos_descuentos},
        "notas_credito": {"cantidad": len(notas), "total": notas_total, "total_usd": notas_total_usd, "ventas": len(notas_venta), "compras": len(notas_compra)},
        "gastos": {"cantidad": gastos_count, "pagado": gastos_pagados, "pagado_usd": gastos_pagados_usd},
        "iva": {**iva_resumen, "a_pagar_usd": round(max(0, iva_saldo_usd), 2), "saldo_usd": iva_saldo_usd},
    }


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
    limit: int = 100, admin: dict = Depends(require_authenticated)
):
    if admin.get("role") != "admin" and not has_permission(admin, "auditoria.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso: auditoria.ver")
    query = {}
    if modulo:
        query["modulo"] = modulo
    if usuario_id:
        query["usuario_id"] = usuario_id
    elif admin.get("role") != "admin":
        logos = list(map(str, admin.get("logos_asignados", []) or []))
        users = await db.users.find({"logos_asignados": {"$in": logos}}, {"_id": 0, "id": 1}).to_list(500)
        query["usuario_id"] = {"$in": [u["id"] for u in users] or ["__none__"]}
    logs = await db.auditoria.find(query, {"_id": 0}).sort("fecha", -1).to_list(limit)
    return logs
