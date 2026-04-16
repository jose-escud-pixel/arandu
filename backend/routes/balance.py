from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional, List

from config import db
from auth import require_authenticated, has_permission

router = APIRouter()


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def to_pyg(monto: float, moneda: str, tipo_cambio: Optional[float]) -> float:
    """Convierte monto a PYG usando el tipo de cambio almacenado."""
    if moneda == "PYG" or not moneda:
        return monto
    tc = tipo_cambio or 1.0
    return monto * tc


def mes_range(periodo: str):
    """Devuelve el prefijo YYYY-MM para filtrar por mes."""
    return f"^{periodo}"


# ─────────────────────────────────────────────
#  Superávit inicial
# ─────────────────────────────────────────────

@router.get("/admin/balance/superavit")
async def get_superavit(
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    """Devuelve el superávit inicial configurado (global o por empresa)."""
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query = {}
    if logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    docs = await db.config_balance.find(query, {"_id": 0}).to_list(10)
    return docs


@router.post("/admin/balance/superavit")
async def set_superavit(
    data: dict,   # { logo_tipo, monto, moneda, notas }
    user: dict = Depends(require_authenticated)
):
    """Crea o actualiza el superávit inicial para una empresa."""
    if not has_permission(user, "balance.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    logo_tipo = data.get("logo_tipo", "todas")
    monto = float(data.get("monto", 0))
    moneda = data.get("moneda", "PYG")
    tipo_cambio = float(data["tipo_cambio"]) if data.get("tipo_cambio") else None
    notas = data.get("notas")
    monto_usd = float(data["monto_usd"]) if data.get("monto_usd") else None  # Superávit en USD

    await db.config_balance.update_one(
        {"logo_tipo": logo_tipo},
        {"$set": {
            "logo_tipo": logo_tipo,
            "monto": monto,
            "moneda": moneda,
            "tipo_cambio": tipo_cambio,
            "monto_pyg": to_pyg(monto, moneda, tipo_cambio),
            "monto_usd": monto_usd,
            "notas": notas,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )
    return {"ok": True}


@router.delete("/admin/balance/superavit/{logo_tipo}")
async def delete_superavit(
    logo_tipo: str,
    user: dict = Depends(require_authenticated)
):
    """Elimina el superávit inicial de una empresa."""
    if not has_permission(user, "balance.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    result = await db.config_balance.delete_one({"logo_tipo": logo_tipo})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}


# ─────────────────────────────────────────────
#  Balance de un periodo (YYYY-MM)
# ─────────────────────────────────────────────

async def _calc_balance(periodo: str, logo_tipo: Optional[str]):
    """
    Agrega ingresos y egresos de todas las fuentes para el periodo dado.
    Retorna dict con ingresos, egresos y detalles por fuente.
    """
    lt_query = {}
    if logo_tipo and logo_tipo != "todas":
        lt_query["logo_tipo"] = logo_tipo

    ingresos = []
    egresos = []
    ingresos_usd = []
    egresos_usd = []

    # ── EMPRESAS CON RETENCIÓN ────────────────────────────────────
    # Se construye primero para poder aplicarlo a contratos Y facturas emitidas
    empresas_retention = await db.empresas.find(
        {"aplica_retencion": True},
        {"_id": 0, "razon_social": 1, "nombre": 1, "porcentaje_retencion": 1}
    ).to_list(200)
    retencion_map: dict = {}
    for e in empresas_retention:
        pct = e.get("porcentaje_retencion") or 0
        if e.get("razon_social"):
            retencion_map[e["razon_social"]] = pct
        if e.get("nombre"):
            retencion_map[e["nombre"]] = pct

    # ── COBROS DE CONTRATOS ──────────────────────────────────────
    cobros = await db.cobros_contratos.find({"periodo": periodo}, {"_id": 0}).to_list(1000)
    if cobros:
        contrato_ids = list({c["contrato_id"] for c in cobros})
        contratos = await db.contratos.find(
            {"id": {"$in": contrato_ids}},
            {"_id": 0, "id": 1, "logo_tipo": 1, "moneda": 1, "tipo_cambio": 1, "empresa_id": 1}
        ).to_list(500)
        ct_map = {c["id"]: c for c in contratos}

        # Retención por empresa-cliente del contrato (empresa_id → % retención IVA)
        empresa_ids_ct = list({c["empresa_id"] for c in contratos if c.get("empresa_id")})
        if empresa_ids_ct:
            empresas_ct = await db.empresas.find(
                {"id": {"$in": empresa_ids_ct}, "aplica_retencion": True},
                {"_id": 0, "id": 1, "porcentaje_retencion": 1}
            ).to_list(200)
            empresa_ret_map = {e["id"]: (e.get("porcentaje_retencion") or 0) for e in empresas_ct}
        else:
            empresa_ret_map = {}

        for cobro in cobros:
            ct = ct_map.get(cobro["contrato_id"], {})
            if logo_tipo and logo_tipo != "todas" and ct.get("logo_tipo") != logo_tipo:
                continue
            moneda_ct = ct.get("moneda", "PYG")
            monto_base = cobro["monto_pagado"]
            # Retención IVA: busca por empresa_id del contrato (empresa cliente)
            pct_retencion = empresa_ret_map.get(ct.get("empresa_id", ""), 0)
            if pct_retencion and monto_base:
                iva = monto_base / 11.0
                monto_efectivo = monto_base - iva * (pct_retencion / 100.0)
            else:
                monto_efectivo = monto_base
            monto_pyg = to_pyg(monto_efectivo, moneda_ct, ct.get("tipo_cambio"))
            ingresos.append({"fuente": "Contratos", "descripcion": cobro.get("notas", ""), "monto_pyg": monto_pyg})
            if moneda_ct == "USD":
                ingresos_usd.append({"fuente": "Contratos", "monto_usd": monto_efectivo})

    # ── FACTURAS EMITIDAS COBRADAS (cash-basis) ──────────────────────────────
    # Cada cobro se cuenta en el MES en que se recibió el dinero, no cuando se emitió.
    # - Facturas con pagos[]: usamos cada entrada del array (soporta pagos múltiples/parciales)
    # - Facturas sin pagos[] (pago único / datos legacy): usamos fecha_pago directamente
    # Las facturas vinculadas a contratos se descartan; su ingreso ya está en cobros_contratos.

    def _registrar_ingreso_fac(fac, monto_base, fuente):
        """Aplica retención si corresponde y agrega el ingreso a la lista."""
        razon_social = fac.get("razon_social", "")
        pct_retencion = retencion_map.get(razon_social, 0)
        if pct_retencion and monto_base:
            iva = monto_base / 11.0
            monto_efectivo = monto_base - iva * (pct_retencion / 100.0)
        else:
            monto_efectivo = monto_base
        moneda_fac = fac.get("moneda", "PYG")
        monto_pyg = to_pyg(monto_efectivo, moneda_fac, fac.get("tipo_cambio"))
        ingresos.append({"fuente": fuente, "descripcion": f"{fac['numero']} – {razon_social}", "monto_pyg": monto_pyg})
        if moneda_fac == "USD":
            ingresos_usd.append({"fuente": fuente, "monto_usd": monto_efectivo})

    # Rama 1: facturas que tienen al menos un pago del período en el array pagos[]
    fac_con_pagos = await db.facturas.find(
        {**lt_query, "tipo": "emitida", "estado": {"$in": ["pagada", "parcial"]},
         "pagos": {"$elemMatch": {"fecha": {"$regex": mes_range(periodo)}}}},
        {"_id": 0}
    ).to_list(1000)
    for fac in fac_con_pagos:
        if fac.get("contrato_id"):
            continue  # excluir facturas de contratos
        for pago in (fac.get("pagos") or []):
            if not (pago.get("fecha") or "").startswith(periodo):
                continue  # solo los pagos de este mes
            _registrar_ingreso_fac(fac, pago.get("monto", 0), "Facturas emitidas")

    # Rama 2: facturas SIN pagos[] (pago único o datos legacy)
    # Si tiene fecha_pago → cash-basis: contar en el mes en que se cobró.
    # Si NO tiene fecha_pago (datos viejos) → usar fecha de emisión como proxy.
    fac_legacy = await db.facturas.find(
        {**lt_query, "tipo": "emitida", "estado": {"$in": ["pagada", "parcial"]},
         "$and": [
             # Sin array pagos[] (o vacío)
             {"$or": [
                 {"pagos": {"$exists": False}},
                 {"pagos": None},
                 {"pagos": {"$size": 0}},
             ]},
             # Cobrada en este período (fecha_pago si existe, si no fecha de emisión)
             {"$or": [
                 {"fecha_pago": {"$regex": mes_range(periodo)}},
                 {"fecha_pago": {"$in": [None, ""]},    "fecha": {"$regex": mes_range(periodo)}},
                 {"fecha_pago": {"$exists": False},      "fecha": {"$regex": mes_range(periodo)}},
             ]},
         ]},
        {"_id": 0}
    ).to_list(1000)
    for fac in fac_legacy:
        if fac.get("contrato_id"):
            continue  # excluir facturas de contratos
        if fac.get("estado") == "parcial" and fac.get("monto_pagado") is not None:
            monto_base = fac["monto_pagado"]
        else:
            monto_base = fac["monto"]
        _registrar_ingreso_fac(fac, monto_base, "Facturas emitidas")

    # ── COSTOS FIJOS PAGADOS ─────────────────────────────────────
    pagos_cf = await db.pagos_costos_fijos.find({"periodo": periodo}, {"_id": 0}).to_list(1000)
    if pagos_cf:
        cf_ids = list({p["costo_fijo_id"] for p in pagos_cf})
        costos = await db.costos_fijos.find(
            {"id": {"$in": cf_ids}}, {"_id": 0, "id": 1, "logo_tipo": 1, "moneda": 1, "tipo_cambio": 1, "nombre": 1}
        ).to_list(500)
        cf_map = {c["id"]: c for c in costos}
        for pago in pagos_cf:
            cf = cf_map.get(pago["costo_fijo_id"], {})
            if logo_tipo and logo_tipo != "todas" and cf.get("logo_tipo") != logo_tipo:
                continue
            moneda_cf = cf.get("moneda", "PYG")
            monto_pyg = to_pyg(pago["monto_pagado"], moneda_cf, cf.get("tipo_cambio"))
            egresos.append({"fuente": "Costos fijos", "descripcion": cf.get("nombre", ""), "monto_pyg": monto_pyg})
            if moneda_cf == "USD":
                egresos_usd.append({"fuente": "Costos fijos", "monto_usd": pago["monto_pagado"]})

    # ── SUELDOS PAGADOS ──────────────────────────────────────────
    sueldos = await db.sueldos.find({"periodo": periodo}, {"_id": 0}).to_list(1000)
    if sueldos:
        emp_ids = list({s["empleado_id"] for s in sueldos})
        empleados = await db.empleados.find(
            {"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "logo_tipo": 1, "nombre": 1, "apellido": 1}
        ).to_list(500)
        emp_map = {e["id"]: e for e in empleados}
        for sueldo in sueldos:
            emp = emp_map.get(sueldo["empleado_id"], {})
            if logo_tipo and logo_tipo != "todas" and emp.get("logo_tipo") != logo_tipo:
                continue
            moneda_s = sueldo.get("moneda", "PYG")
            monto_pyg = to_pyg(sueldo["monto_pagado"], moneda_s, sueldo.get("tipo_cambio"))
            nombre = f"{emp.get('nombre', '')} {emp.get('apellido', '')}".strip() or sueldo.get("empleado_nombre", "")
            egresos.append({"fuente": "Sueldos", "descripcion": nombre, "monto_pyg": monto_pyg})
            if moneda_s == "USD":
                egresos_usd.append({"fuente": "Sueldos", "monto_usd": sueldo["monto_pagado"]})

    # ── ADELANTOS DE SUELDO ──────────────────────────────────────
    adelantos = await db.adelantos_sueldos.find({"fecha": {"$regex": mes_range(periodo)}}, {"_id": 0}).to_list(1000)
    if adelantos:
        emp_ids_adel = list({a["empleado_id"] for a in adelantos})
        empleados_adel = await db.empleados.find(
            {"id": {"$in": emp_ids_adel}}, {"_id": 0, "id": 1, "logo_tipo": 1, "nombre": 1, "apellido": 1}
        ).to_list(500)
        emp_adel_map = {e["id"]: e for e in empleados_adel}
        for adelanto in adelantos:
            emp = emp_adel_map.get(adelanto["empleado_id"], {})
            if logo_tipo and logo_tipo != "todas" and emp.get("logo_tipo") != logo_tipo:
                continue
            moneda_a = adelanto.get("moneda", "PYG")
            monto_pyg = to_pyg(adelanto["monto"], moneda_a, adelanto.get("tipo_cambio"))
            nombre = f"{emp.get('nombre', '')} {emp.get('apellido', '')}".strip() or adelanto.get("empleado_nombre", "")
            egresos.append({"fuente": "Adelantos sueldo", "descripcion": nombre, "monto_pyg": monto_pyg})
            if moneda_a == "USD":
                egresos_usd.append({"fuente": "Adelantos sueldo", "monto_usd": adelanto["monto"]})

    # ── FACTURAS RECIBIDAS PAGADAS ───────────────────────────────
    fac_recibidas = await db.facturas.find(
        {**lt_query, "tipo": "recibida", "estado": "pagada", "fecha": {"$regex": mes_range(periodo)}},
        {"_id": 0}
    ).to_list(1000)
    for fac in fac_recibidas:
        moneda_fr = fac.get("moneda", "PYG")
        monto_pyg = to_pyg(fac["monto"], moneda_fr, fac.get("tipo_cambio"))
        egresos.append({"fuente": "Facturas recibidas", "descripcion": f"{fac['numero']} – {fac['razon_social']}", "monto_pyg": monto_pyg})
        if moneda_fr == "USD":
            egresos_usd.append({"fuente": "Facturas recibidas", "monto_usd": fac["monto"]})

    # ── PAGOS A PROVEEDORES ──────────────────────────────────────
    pagos_prov = await db.pagos_proveedores.find(
        {"fecha_pago": {"$regex": mes_range(periodo)}},
        {"_id": 0}
    ).to_list(1000)
    if pagos_prov:
        prov_ids = list({p["proveedor_id"] for p in pagos_prov})
        proveedores = await db.proveedores.find(
            {"id": {"$in": prov_ids}}, {"_id": 0, "id": 1, "logo_tipo": 1, "nombre": 1}
        ).to_list(500)
        prov_map = {p["id"]: p for p in proveedores}
        for pago in pagos_prov:
            prov = prov_map.get(pago["proveedor_id"], {})
            if logo_tipo and logo_tipo != "todas" and prov.get("logo_tipo") != logo_tipo:
                continue
            moneda_pp = pago.get("moneda", "PYG")
            cuenta_pago = pago.get("cuenta_pago", "guaranies")
            nombre_prov = prov.get("nombre", pago.get("proveedor_id", ""))
            monto_usd = pago.get("monto", 0)

            if moneda_pp == "USD" and cuenta_pago == "dolares":
                # Pagado desde cuenta USD → descuenta saldo USD, NO el saldo en Gs
                egresos_usd.append({"fuente": "Pagos proveedores", "monto_usd": monto_usd})
                # No se suma a egresos en PYG (el dinero salió de la cuenta USD)
            elif moneda_pp == "USD":
                # Pagado desde cuenta guaraníes (convertido) → descuenta PYG, NO el saldo USD
                monto_pyg = pago.get("monto_gs") or to_pyg(monto_usd, "USD", pago.get("tipo_cambio"))
                egresos.append({"fuente": "Pagos proveedores", "descripcion": nombre_prov, "monto_pyg": monto_pyg})
            else:
                # Pago en guaraníes
                monto_pyg = pago.get("monto_gs") or pago.get("monto_pyg") or to_pyg(
                    pago.get("monto") or pago.get("monto_pagado", 0),
                    moneda_pp,
                    pago.get("tipo_cambio") or pago.get("tipo_cambio_real")
                )
                egresos.append({"fuente": "Pagos proveedores", "descripcion": nombre_prov, "monto_pyg": monto_pyg})

    # ── INGRESOS VARIOS (sin factura) ────────────────────────────
    ingresos_varios = await db.ingresos_varios.find(
        {**lt_query, "fecha": {"$regex": mes_range(periodo)}},
        {"_id": 0}
    ).to_list(1000)
    for iv in ingresos_varios:
        moneda_iv = iv.get("moneda", "PYG")
        monto_pyg = to_pyg(iv.get("monto", 0), moneda_iv, iv.get("tipo_cambio"))
        ingresos.append({"fuente": "Ingresos varios", "descripcion": iv.get("descripcion", ""), "monto_pyg": monto_pyg})
        if moneda_iv == "USD":
            ingresos_usd.append({"fuente": "Ingresos varios", "monto_usd": iv["monto"]})

    # ── Totales ──────────────────────────────────────────────────
    total_ingresos = sum(i["monto_pyg"] for i in ingresos)
    total_egresos = sum(e["monto_pyg"] for e in egresos)

    # Agrupar por fuente
    def agrupar(items):
        grupos = {}
        for item in items:
            f = item["fuente"]
            if f not in grupos:
                grupos[f] = {"fuente": f, "cantidad": 0, "monto_pyg": 0.0, "items": []}
            grupos[f]["cantidad"] += 1
            grupos[f]["monto_pyg"] += item["monto_pyg"]
            grupos[f]["items"].append(item.get("descripcion", ""))
        return list(grupos.values())

    def agrupar_usd(items):
        grupos = {}
        for item in items:
            f = item["fuente"]
            if f not in grupos:
                grupos[f] = {"fuente": f, "monto_usd": 0.0}
            grupos[f]["monto_usd"] += item["monto_usd"]
        return list(grupos.values())

    return {
        "periodo": periodo,
        "total_ingresos": total_ingresos,
        "total_egresos": total_egresos,
        "balance": total_ingresos - total_egresos,
        "ingresos_detalle": agrupar(ingresos),
        "egresos_detalle": agrupar(egresos),
        "total_ingresos_usd": sum(i["monto_usd"] for i in ingresos_usd),
        "total_egresos_usd": sum(e["monto_usd"] for e in egresos_usd),
        "ingresos_usd_detalle": agrupar_usd(ingresos_usd),
        "egresos_usd_detalle": agrupar_usd(egresos_usd),
    }


@router.get("/admin/balance")
async def get_balance(
    periodo: str,                          # YYYY-MM  requerido
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    result = await _calc_balance(periodo, logo_tipo)

    # Superávit inicial (acumulado desde inicio hasta el mes anterior)
    # Lo obtenemos de config_balance y sumamos balances previos
    cfg_query = {}
    if logo_tipo and logo_tipo != "todas":
        cfg_query["logo_tipo"] = logo_tipo
    else:
        cfg_query["logo_tipo"] = "todas"

    cfg = await db.config_balance.find_one(cfg_query, {"_id": 0})
    superavit_inicial = cfg["monto_pyg"] if cfg else 0.0
    superavit_inicial_usd = (cfg.get("monto_usd") or 0.0) if cfg else 0.0

    result["superavit_inicial"] = superavit_inicial
    result["superavit_inicial_usd"] = superavit_inicial_usd

    # Saldo acumulado PYG = superávit + balance de todos los meses desde enero hasta el mes actual
    anio = int(periodo[:4])
    mes_actual = int(periodo[5:7])
    acumulado = superavit_inicial
    acumulado_usd = superavit_inicial_usd

    for m in range(1, mes_actual):   # meses anteriores al actual
        mes_str = f"{anio}-{str(m).zfill(2)}"
        r_prev = await _calc_balance(mes_str, logo_tipo)
        acumulado += r_prev["balance"]
        acumulado_usd += r_prev["total_ingresos_usd"] - r_prev["total_egresos_usd"]

    acumulado += result["balance"]   # mes actual
    acumulado_usd += result["total_ingresos_usd"] - result["total_egresos_usd"]

    result["saldo_acumulado"] = acumulado
    result["saldo_acumulado_usd"] = acumulado_usd

    return result


# ─────────────────────────────────────────────
#  Conversiones de divisas (USD → PYG etc.)
# ─────────────────────────────────────────────

@router.get("/admin/balance/conversiones")
async def get_conversiones(
    periodo: Optional[str] = None,
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    """Lista las conversiones de divisas registradas."""
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query = {}
    if periodo:
        query["periodo"] = periodo
    if logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    docs = await db.conversiones_divisas.find(query, {"_id": 0}).sort("fecha", -1).to_list(500)
    return docs


@router.post("/admin/balance/conversiones")
async def create_conversion(
    data: dict,
    user: dict = Depends(require_authenticated)
):
    """
    Registra una conversión de divisas.
    Campos: fecha, periodo, logo_tipo, moneda_origen, monto_origen, tipo_cambio, monto_pyg_resultado, notas
    """
    if not has_permission(user, "balance.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    import uuid
    fecha = data.get("fecha", datetime.now(timezone.utc).isoformat()[:10])
    periodo = data.get("periodo") or fecha[:7]
    monto_origen = float(data.get("monto_origen", 0))
    tipo_cambio = float(data.get("tipo_cambio", 1))
    monto_pyg_resultado = monto_origen * tipo_cambio
    doc = {
        "id": str(uuid.uuid4()),
        "fecha": fecha,
        "periodo": periodo,
        "logo_tipo": data.get("logo_tipo", "todas"),
        "moneda_origen": data.get("moneda_origen", "USD"),
        "monto_origen": monto_origen,
        "tipo_cambio": tipo_cambio,
        "monto_pyg_resultado": monto_pyg_resultado,
        "notas": data.get("notas"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.conversiones_divisas.insert_one(doc)
    return doc


@router.delete("/admin/balance/conversiones/{conv_id}")
async def delete_conversion(
    conv_id: str,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "balance.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    result = await db.conversiones_divisas.delete_one({"id": conv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}


# ─────────────────────────────────────────────
#  Balance anual (12 meses)
# ─────────────────────────────────────────────

@router.get("/admin/balance/anual")
async def get_balance_anual(
    anio: int,
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    meses = [f"{anio}-{str(m).zfill(2)}" for m in range(1, 13)]
    resultados = []
    acumulado = 0.0

    # Superávit inicial
    cfg_query = {"logo_tipo": logo_tipo if (logo_tipo and logo_tipo != "todas") else "todas"}
    cfg = await db.config_balance.find_one(cfg_query, {"_id": 0})
    superavit_inicial = cfg["monto_pyg"] if cfg else 0.0
    acumulado = superavit_inicial

    for mes in meses:
        r = await _calc_balance(mes, logo_tipo)
        acumulado += r["balance"]
        resultados.append({
            "periodo": mes,
            "total_ingresos": r["total_ingresos"],
            "total_egresos": r["total_egresos"],
            "balance": r["balance"],
            "acumulado": acumulado,
        })

    return {
        "anio": anio,
        "logo_tipo": logo_tipo or "todas",
        "superavit_inicial": superavit_inicial,
        "meses": resultados,
        "total_anual_ingresos": sum(r["total_ingresos"] for r in resultados),
        "total_anual_egresos": sum(r["total_egresos"] for r in resultados),
        "balance_anual": sum(r["balance"] for r in resultados),
    }


# ─────────────────────────────────────────────
#  IVA mensual (crédito fiscal vs débito fiscal)
# ─────────────────────────────────────────────

@router.get("/admin/balance/iva")
async def get_iva_mensual(
    periodo: str,               # YYYY-MM
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    """
    Calcula el IVA del período:
    - Débito fiscal: IVA de facturas emitidas (ventas)
    - Crédito fiscal: IVA de compras con factura del proveedor
    - IVA a pagar = débito − crédito
    """
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    lt_query = {}
    if logo_tipo and logo_tipo != "todas":
        lt_query["logo_tipo"] = logo_tipo

    # ── Débito fiscal: facturas emitidas del período ─────────────
    facturas = await db.facturas.find(
        {**lt_query, "tipo": "emitida", "estado": {"$ne": "anulada"},
         "fecha": {"$regex": f"^{periodo}"}},
        {"_id": 0, "numero": 1, "razon_social": 1, "monto": 1, "iva": 1, "moneda": 1,
         "tipo_cambio": 1, "tasa_iva": 1, "logo_tipo": 1}
    ).to_list(1000)

    debito_detalle = []
    for f in facturas:
        moneda = f.get("moneda", "PYG")
        monto = f.get("monto", 0) or 0
        iva_fac = f.get("iva")
        if iva_fac is None:
            # Calcular IVA incluido (tasa 10% por defecto)
            tasa = f.get("tasa_iva", 10) or 10
            iva_fac = monto / (10 if tasa == 10 else 21) if tasa else 0
        iva_pyg = to_pyg(iva_fac, moneda, f.get("tipo_cambio"))
        debito_detalle.append({
            "numero": f.get("numero", ""),
            "razon_social": f.get("razon_social", ""),
            "monto_factura": monto,
            "iva": iva_fac,
            "iva_pyg": iva_pyg,
            "moneda": moneda,
            "logo_tipo": f.get("logo_tipo", ""),
        })

    # ── Crédito fiscal: compras con factura del período ──────────
    compras = await db.compras.find(
        {**lt_query, "tiene_factura": True,
         "fecha": {"$regex": f"^{periodo}"}},
        {"_id": 0, "numero_factura": 1, "proveedor_nombre": 1, "monto_total": 1,
         "monto_iva": 1, "tasa_iva": 1, "moneda": 1, "tipo_cambio": 1, "logo_tipo": 1}
    ).to_list(1000)

    credito_detalle = []
    for c in compras:
        moneda = c.get("moneda", "PYG")
        monto = c.get("monto_total", 0) or 0
        iva_comp = c.get("monto_iva")
        if iva_comp is None:
            tasa = c.get("tasa_iva", 10) or 10
            iva_comp = monto / (10 if tasa == 10 else 21) if tasa else 0
        iva_pyg = to_pyg(iva_comp, moneda, c.get("tipo_cambio"))
        credito_detalle.append({
            "numero_factura": c.get("numero_factura", ""),
            "proveedor": c.get("proveedor_nombre", ""),
            "monto_compra": monto,
            "iva": iva_comp,
            "iva_pyg": iva_pyg,
            "moneda": moneda,
            "logo_tipo": c.get("logo_tipo", ""),
        })

    # ── Retenciones de IVA: clientes que retienen IVA en el período ─
    # Buscar facturas emitidas donde el cliente (razon_social/empresa) aplica retención
    empresas_con_retencion = await db.empresas.find(
        {"aplica_retencion": True},
        {"_id": 0, "id": 1, "razon_social": 1, "nombre": 1, "porcentaje_retencion": 1}
    ).to_list(500)

    ret_map = {}
    for e in empresas_con_retencion:
        pct = e.get("porcentaje_retencion") or 0
        if e.get("razon_social"):
            ret_map[e["razon_social"]] = pct
        if e.get("nombre"):
            ret_map[e["nombre"]] = pct

    retenciones_detalle = []
    for d in debito_detalle:
        razon = d.get("razon_social", "")
        pct = ret_map.get(razon, 0)
        if pct and d.get("iva_pyg", 0):
            monto_retenido = d["iva_pyg"] * (pct / 100.0)
            retenciones_detalle.append({
                "razon_social": razon,
                "numero_factura": d.get("numero", ""),
                "iva_factura": d["iva_pyg"],
                "porcentaje_retencion": pct,
                "monto_retenido": monto_retenido,
            })

    total_retenciones = sum(r["monto_retenido"] for r in retenciones_detalle)

    total_debito = sum(d["iva_pyg"] for d in debito_detalle)
    total_credito = sum(c["iva_pyg"] for c in credito_detalle) + total_retenciones
    iva_neto = total_debito - total_credito

    return {
        "periodo": periodo,
        "logo_tipo": logo_tipo or "todas",
        "iva_debito": total_debito,
        "iva_credito": total_credito,
        "iva_credito_compras": sum(c["iva_pyg"] for c in credito_detalle),
        "iva_credito_retenciones": total_retenciones,
        "iva_neto": iva_neto,
        "a_favor": iva_neto < 0,
        "detalle_debito": debito_detalle,
        "detalle_credito": credito_detalle,
        "detalle_retenciones": retenciones_detalle,
        "cantidad_facturas": len(debito_detalle),
        "cantidad_compras_con_factura": len(credito_detalle),
        "cantidad_retenciones": len(retenciones_detalle),
    }
