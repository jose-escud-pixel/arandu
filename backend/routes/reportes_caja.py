"""Reporte de movimientos por cuenta bancaria (caja/banco)."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional, List

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso, apply_logo_filter, is_forbidden

router = APIRouter()


def _tiene_permiso_reporte_caja(user: dict) -> bool:
    return (
        user.get("role") in ("admin", "super_admin", "gerente")
        or has_permission(user, "reportes.caja_banco")
    )


async def _listar_cuentas_reporte(user: dict, logo_tipo: Optional[str] = None) -> List[dict]:
    """Cuentas visibles en reporte caja/banco. Admin/gerente: todas. Usuario: las asignadas en Bancos."""
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(logo_q):
        return []

    base = {"activa": {"$ne": False}}
    if logo_q:
        base = {"$and": [base, logo_q]}

    if user.get("role") in ("admin", "super_admin", "gerente"):
        return await db.cuentas_bancarias.find(base, {"_id": 0}).sort("nombre", 1).to_list(500)

    if not has_permission(user, "reportes.caja_banco"):
        return []

    uid = str(user.get("id") or user.get("sub") or "")
    if not uid:
        return []
    or_clauses = [{"usuarios_reporte_ids": {"$in": [uid]}}]
    legacy_ids = list(user.get("cuentas_reporte_ids") or [])
    if legacy_ids:
        or_clauses.append({"id": {"$in": legacy_ids}})
    query = {"$and": [base, {"$or": or_clauses}]}
    return await db.cuentas_bancarias.find(query, {"_id": 0}).sort("nombre", 1).to_list(500)


def _puede_ver_cuenta(user: dict, cuenta_id: str, cuentas: List[dict]) -> bool:
    return any(c["id"] == cuenta_id for c in cuentas)


@router.get("/admin/reportes/caja-banco/cuentas")
async def listar_cuentas_caja_banco(
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    if not _tiene_permiso_reporte_caja(user):
        raise HTTPException(status_code=403, detail="No tiene permiso para reportes de caja/banco")
    return await _listar_cuentas_reporte(user, logo_tipo)


@router.get("/admin/reportes/caja-banco")
async def reporte_caja_banco(
    cuenta_id: str,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    if not _tiene_permiso_reporte_caja(user):
        raise HTTPException(status_code=403, detail="No tiene permiso para reportes de caja/banco")

    cuentas = await _listar_cuentas_reporte(user, logo_tipo)
    if not cuentas:
        q_total = {"activa": {"$ne": False}}
        logo_q = {}
        await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
        if not is_forbidden(logo_q) and logo_q:
            q_total.update(logo_q)
        total_logo = await db.cuentas_bancarias.count_documents(q_total)
        if total_logo == 0:
            raise HTTPException(
                status_code=400,
                detail="No hay ninguna cuenta bancaria creada. Creá una cuenta en el módulo Bancos antes de generar este reporte.",
            )
        raise HTTPException(
            status_code=400,
            detail="No tenés cuentas habilitadas para este reporte. Pedí al administrador que te asigne acceso en Bancos → Acceso reporte.",
        )
    if not _puede_ver_cuenta(user, cuenta_id, cuentas):
        raise HTTPException(status_code=403, detail="No tiene permiso para esta cuenta bancaria")

    cuenta = next((c for c in cuentas if c["id"] == cuenta_id), None)
    if not cuenta:
        raise HTTPException(status_code=400, detail="La cuenta bancaria seleccionada no existe o no está disponible")

    desde_d = desde or cuenta.get("saldo_inicial_fecha") or "2000-01-01"
    hasta_d = hasta or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ── Armar filtro de logos accesibles ────────────────────
    # logo_filter se usa en colecciones que SÍ tienen logo_tipo propio:
    # facturas, compras, ingresos_varios, pagos_proveedores.
    logo_filter = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        logo_filter["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        logo_filter["logo_tipo"] = logo_tipo

    # logo_tipo_efectivo se usa para filtrar colecciones SIN logo_tipo propio
    # (ej: pagos_costos_fijos) que requieren join con su colección padre.
    logo_tipo_efectivo = logo_tipo if logo_tipo and logo_tipo != "todas" else None

    # ── Helpers de filtro por fecha ──────────────────────────
    def antes_de_rango(fecha: str) -> bool:
        """Movimiento ocurrió ANTES de la fecha inicio → va al saldo inicial."""
        return bool(fecha) and fecha[:10] < desde_d

    def en_rango(fecha: str) -> bool:
        """Movimiento ocurrido dentro del rango desde→hasta seleccionado."""
        return bool(fecha) and desde_d <= fecha[:10] <= hasta_d

    todos_los_movimientos: list = []  # acumula TODO (previos + del período)

    # Filtro estándar para excluir registros eliminados (soft delete)
    NO_ELIMINADO = {"eliminada": {"$ne": True}}

    # ── VENTAS — cobros de facturas ──────────────────────────
    # Solo facturas NO eliminadas. Los pagos individuales eliminados
    # ya son removidos del array (hard delete en el pago), así que
    # filtrar la factura como no eliminada es suficiente.
    facturas = await db.facturas.find(
        {**logo_filter, **NO_ELIMINADO},
        {"_id": 0, "numero": 1, "razon_social": 1, "pagos": 1}
    ).to_list(10000)
    for fac in facturas:
        for p in fac.get("pagos") or []:
            if p.get("cuenta_id") != cuenta_id:
                continue
            fecha_mov = (p.get("fecha") or "")[:10]
            if not fecha_mov:
                continue
            todos_los_movimientos.append({
                "fecha": fecha_mov,
                "tipo": "ingreso",
                "categoria": "Venta",
                "concepto": f"Venta {fac.get('numero', '')} — {fac.get('razon_social', '')}",
                "monto": float(p.get("monto") or 0),
                "referencia": fac.get("numero"),
            })

    # ── INGRESOS VARIOS ──────────────────────────────────────
    ivs = await db.ingresos_varios.find(
        {**logo_filter, **NO_ELIMINADO, "cuenta_id": cuenta_id}, {"_id": 0}
    ).to_list(5000)
    for iv in ivs:
        fecha_mov = (iv.get("fecha") or "")[:10]
        if not fecha_mov:
            continue
        todos_los_movimientos.append({
            "fecha": fecha_mov,
            "tipo": "ingreso",
            "categoria": "Ingreso",
            "concepto": iv.get("concepto") or iv.get("descripcion") or "Ingreso vario",
            "monto": float(iv.get("monto") or 0),
            "referencia": iv.get("numero"),
        })

    # ── COMPRAS — pagos embebidos en el doc de compra ────────
    # Se traen campos extra para manejar el caso contado simple (sin array pagos).
    compras = await db.compras.find(
        {**logo_filter, **NO_ELIMINADO},
        {"_id": 0, "numero": 1, "proveedor_nombre": 1, "pagos": 1,
         "tipo_pago": 1, "cuenta_id": 1, "fecha_pago": 1, "monto_total": 1}
    ).to_list(5000)
    for comp in compras:
        pagos_comp = comp.get("pagos") or []

        # Caso 1: compra contado simple (pago directo en el doc, sin array pagos)
        if not pagos_comp and comp.get("tipo_pago") == "contado" and comp.get("cuenta_id") == cuenta_id:
            fecha_mov = (comp.get("fecha_pago") or "")[:10]
            if fecha_mov:
                todos_los_movimientos.append({
                    "fecha": fecha_mov,
                    "tipo": "egreso",
                    "categoria": "Compra",
                    "concepto": f"Compra {comp.get('numero', '')} — {comp.get('proveedor_nombre', '')}",
                    "monto": float(comp.get("monto_total") or 0),
                    "referencia": comp.get("numero"),
                })
            continue

        # Caso 2: compra con pagos parciales (array pagos embebido)
        for p in pagos_comp:
            if p.get("cuenta_id") != cuenta_id:
                continue
            fecha_mov = (p.get("fecha_pago") or p.get("fecha") or "")[:10]
            if not fecha_mov:
                continue
            # monto_gs = monto en PYG cuando se pagó en USD; sino usar monto_pagado (PYG directo)
            monto = float(p.get("monto_gs") or p.get("monto_pagado") or p.get("monto") or 0)
            todos_los_movimientos.append({
                "fecha": fecha_mov,
                "tipo": "egreso",
                "categoria": "Compra",
                "concepto": f"Compra {comp.get('numero', '')} — {comp.get('proveedor_nombre', '')}",
                "monto": monto,
                "referencia": comp.get("numero"),
            })

    # ── PAGOS A PROVEEDORES ──────────────────────────────────
    pp = await db.pagos_proveedores.find(
        {**logo_filter, **NO_ELIMINADO, "cuenta_id": cuenta_id}, {"_id": 0}
    ).to_list(5000)
    for p in pp:
        fecha_mov = (p.get("fecha_pago") or p.get("fecha") or "")[:10]
        if not fecha_mov:
            continue
        todos_los_movimientos.append({
            "fecha": fecha_mov,
            "tipo": "egreso",
            "categoria": "Pago proveedor",
            "concepto": f"Pago proveedor — {p.get('proveedor_nombre', p.get('concepto', ''))}",
            "monto": float(p.get("monto_gs") or p.get("monto") or 0),
            "referencia": p.get("recibo_numero"),
        })

    # ── COSTOS FIJOS ─────────────────────────────────────────
    # pagos_costos_fijos NO tiene logo_tipo propio ni soft delete.
    # costos_fijos SÍ tiene ambos → join manual para filtrar correctamente.
    # Paso 1: costos accesibles por logo y NO eliminados
    cf_query: dict = {**NO_ELIMINADO}
    await apply_logo_filter(cf_query, user, logo_tipo_efectivo)
    if not is_forbidden(cf_query):
        costos_ref = await db.costos_fijos.find(
            cf_query, {"_id": 0, "id": 1, "nombre": 1}
        ).to_list(2000)
        cf_ids_validos = {c["id"] for c in costos_ref}
        cf_nombres = {c["id"]: c.get("nombre", "Costo fijo") for c in costos_ref}

        # Paso 2: pagos de esos costos en la cuenta indicada
        # (pagos_costos_fijos usa hard delete → no necesita filtro eliminada)
        pcf = await db.pagos_costos_fijos.find(
            {"costo_fijo_id": {"$in": list(cf_ids_validos)}, "cuenta_id": cuenta_id},
            {"_id": 0}
        ).to_list(5000)
        for p in pcf:
            fecha_mov = (p.get("fecha_pago") or "")[:10]
            if not fecha_mov:
                continue
            nombre_cf = cf_nombres.get(p.get("costo_fijo_id", ""), "Costo fijo")
            todos_los_movimientos.append({
                "fecha": fecha_mov,
                "tipo": "egreso",
                "categoria": "Egreso",
                "concepto": nombre_cf,
                "monto": float(p.get("monto_pagado") or 0),
                "referencia": None,
            })

    # ── SUELDOS ──────────────────────────────────────────────
    # Solo sueldos que indicaron la cuenta bancaria desde la que se pagó.
    sueldos = await db.sueldos.find(
        {"cuenta_id": cuenta_id}, {"_id": 0}
    ).to_list(5000)
    for s in sueldos:
        fecha_mov = (s.get("fecha_pago") or "")[:10]
        if not fecha_mov:
            continue
        nombre_emp = s.get("empleado_nombre") or "Empleado"
        todos_los_movimientos.append({
            "fecha": fecha_mov,
            "tipo": "egreso",
            "categoria": "Sueldo",
            "concepto": f"Sueldo {s.get('periodo', '')} — {nombre_emp}",
            "monto": float(s.get("monto_pagado") or 0),
            "referencia": None,
        })

    # ── ADELANTOS DE SUELDO ──────────────────────────────────
    # Solo adelantos que indicaron la cuenta bancaria desde la que se pagó.
    adelantos = await db.adelantos_sueldos.find(
        {"cuenta_id": cuenta_id}, {"_id": 0}
    ).to_list(5000)
    for a in adelantos:
        fecha_mov = (a.get("fecha") or "")[:10]
        if not fecha_mov:
            continue
        nombre_emp = a.get("empleado_nombre") or "Empleado"
        todos_los_movimientos.append({
            "fecha": fecha_mov,
            "tipo": "egreso",
            "categoria": "Adelanto",
            "concepto": f"Adelanto {a.get('periodo', '')} — {nombre_emp}",
            "monto": float(a.get("monto") or 0),
            "referencia": None,
        })

    # ── NOTAS DE CRÉDITO — REEMBOLSOS ────────────────────────
    # tipo_cobro="reembolso" implica movimiento real de cuenta bancaria:
    #   - Nota de venta (devolvemos al cliente)  → EGRESO
    #   - Nota de compra (proveedor nos devuelve) → INGRESO
    notas_remb = await db.notas_credito.find(
        {**logo_filter, **NO_ELIMINADO, "tipo_cobro": "reembolso", "cuenta_id": cuenta_id},
        {"_id": 0, "numero": 1, "tipo": 1, "fecha": 1, "monto": 1, "moneda": 1,
         "tipo_cambio": 1, "razon_social": 1, "proveedor_nombre": 1}
    ).to_list(2000)
    for nr in notas_remb:
        fecha_mov = (nr.get("fecha") or "")[:10]
        if not fecha_mov:
            continue
        es_compra = nr.get("tipo") == "compra"
        nombre = nr.get("proveedor_nombre") if es_compra else nr.get("razon_social") or ""
        # Reembolso de compra: proveedor nos devuelve → ingreso al banco
        # Reembolso de venta: devolvemos al cliente → egreso del banco
        tipo_mov = "ingreso" if es_compra else "egreso"
        categoria = "Reembolso proveedor" if es_compra else "Reembolso a cliente"
        monto = float(nr.get("monto") or 0)
        # Convertir USD → PYG si aplica
        if nr.get("moneda") == "USD" and nr.get("tipo_cambio"):
            monto = monto * float(nr.get("tipo_cambio") or 0)
        todos_los_movimientos.append({
            "fecha": fecha_mov,
            "tipo": tipo_mov,
            "categoria": categoria,
            "concepto": f"NC {nr.get('numero', '')} — Reembolso {nombre}",
            "monto": monto,
            "referencia": nr.get("numero"),
        })

    # ── SALDO A FAVOR APLICADO ───────────────────────────────
    # Aplicaciones de notas de crédito vía saldo_favor.
    # No pasan por la cuenta bancaria → se muestran informativamente
    # para que el reporte refleje el total real cobrado por cada venta.
    movimientos_sf: list = []
    logo_q_sf: dict = {}
    await apply_logo_filter(logo_q_sf, user, logo_tipo_efectivo)
    if not is_forbidden(logo_q_sf):
        sfs = await db.saldos_favor.find(
            {**logo_q_sf, "estado": {"$ne": "anulado"}},
            {"_id": 0, "entidad_tipo": 1, "razon_social": 1, "proveedor_nombre": 1,
             "nota_credito_numero": 1, "aplicaciones": 1}
        ).to_list(2000)
        for sf in sfs:
            es_proveedor = sf.get("entidad_tipo") == "proveedor"
            nombre = sf.get("proveedor_nombre") if es_proveedor else sf.get("razon_social", "")
            categoria = "Saldo a favor proveedor" if es_proveedor else "Saldo a favor cliente"
            for ap in (sf.get("aplicaciones") or []):
                fecha_mov = (ap.get("fecha") or "")[:10]
                if not fecha_mov:
                    continue
                doc_ref = ap.get("compra_numero") or ap.get("factura_numero") or ""
                movimientos_sf.append({
                    "fecha": fecha_mov,
                    "tipo": "saldo_favor",
                    "categoria": categoria,
                    "concepto": (
                        f"NC {sf.get('nota_credito_numero', '')} — "
                        f"{nombre} → {'Compra' if es_proveedor else 'Fac.'} {doc_ref}"
                    ),
                    "monto": float(ap.get("monto") or 0),
                    "referencia": doc_ref,
                })

    # ── Calcular saldo inicial dinámico ──────────────────────
    # Saldo base configurado en la cuenta (al momento de su creación)
    saldo_base = float(cuenta.get("saldo_inicial") or 0)

    # Sumar/restar todos los movimientos ANTERIORES al período seleccionado
    # (solo ingresos/egresos reales — saldo_favor no afecta el banco)
    saldo_previo = sum(
        m["monto"] if m["tipo"] == "ingreso" else -m["monto"]
        for m in todos_los_movimientos
        if antes_de_rango(m["fecha"])
    )
    saldo_ini = saldo_base + saldo_previo

    # ── Filtrar solo los movimientos del período seleccionado ─
    movimientos = [m for m in todos_los_movimientos if en_rango(m["fecha"])]
    movimientos.sort(key=lambda m: m.get("fecha", ""))

    # Saldo a favor: filtrar por período (no afectan balance bancario)
    sf_del_periodo = [m for m in movimientos_sf if en_rango(m["fecha"])]
    sf_del_periodo.sort(key=lambda m: m.get("fecha", ""))

    total_ing = sum(m["monto"] for m in movimientos if m["tipo"] == "ingreso")
    total_egr = sum(m["monto"] for m in movimientos if m["tipo"] == "egreso")
    total_sf  = sum(m["monto"] for m in sf_del_periodo)

    return {
        "cuenta": cuenta,
        "desde": desde_d,
        "hasta": hasta_d,
        "saldo_inicial": saldo_ini,
        "total_ingresos": total_ing,
        "total_egresos": total_egr,
        "saldo_final": saldo_ini + total_ing - total_egr,
        "movimientos": movimientos,
        # Saldo a favor: informativos, no afectan el balance bancario
        "total_saldo_favor_aplicado": total_sf,
        "movimientos_saldo_favor": sf_del_periodo,
    }
