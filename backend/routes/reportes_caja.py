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

    movimientos = []

    def en_rango(fecha: str) -> bool:
        if not fecha:
            return False
        f = fecha[:10]
        return desde_d <= f <= hasta_d

    logo_filter = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        logo_filter["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        logo_filter["logo_tipo"] = logo_tipo

    facturas = await db.facturas.find(logo_filter or {}, {"_id": 0, "numero": 1, "razon_social": 1, "pagos": 1, "logo_tipo": 1}).to_list(10000)
    for fac in facturas:
        for p in fac.get("pagos") or []:
            if p.get("cuenta_id") != cuenta_id:
                continue
            if not en_rango(p.get("fecha") or ""):
                continue
            movimientos.append({
                "fecha": (p.get("fecha") or "")[:10],
                "tipo": "ingreso",
                "concepto": f"Pago factura {fac.get('numero', '')} — {fac.get('razon_social', '')}",
                "monto": float(p.get("monto") or 0),
                "referencia": fac.get("numero"),
            })

    ivs = await db.ingresos_varios.find({**logo_filter, "cuenta_id": cuenta_id}, {"_id": 0}).to_list(5000)
    for iv in ivs:
        if not en_rango(iv.get("fecha") or ""):
            continue
        movimientos.append({
            "fecha": (iv.get("fecha") or "")[:10],
            "tipo": "ingreso",
            "concepto": iv.get("concepto") or iv.get("descripcion") or "Ingreso vario",
            "monto": float(iv.get("monto") or 0),
            "referencia": iv.get("numero"),
        })

    compras = await db.compras.find(logo_filter or {}, {"_id": 0, "numero": 1, "proveedor_nombre": 1, "pagos": 1}).to_list(5000)
    for comp in compras:
        for p in comp.get("pagos") or []:
            if p.get("cuenta_id") != cuenta_id:
                continue
            if not en_rango(p.get("fecha") or ""):
                continue
            monto = float(p.get("monto_gs") or p.get("monto") or 0)
            movimientos.append({
                "fecha": (p.get("fecha") or "")[:10],
                "tipo": "egreso",
                "concepto": f"Pago compra {comp.get('numero', '')} — {comp.get('proveedor_nombre', '')}",
                "monto": monto,
                "referencia": comp.get("numero"),
            })

    pp = await db.pagos_proveedores.find({**logo_filter, "cuenta_id": cuenta_id}, {"_id": 0}).to_list(5000)
    for p in pp:
        fp = p.get("fecha_pago") or p.get("fecha") or ""
        if not en_rango(fp):
            continue
        monto = float(p.get("monto_gs") or p.get("monto") or 0)
        movimientos.append({
            "fecha": fp[:10],
            "tipo": "egreso",
            "concepto": f"Pago proveedor — {p.get('proveedor_nombre', p.get('concepto', ''))}",
            "monto": monto,
            "referencia": p.get("numero"),
        })

    pcf = await db.pagos_costos_fijos.find({**logo_filter, "cuenta_id": cuenta_id}, {"_id": 0}).to_list(5000)
    for p in pcf:
        if not en_rango(p.get("fecha_pago") or ""):
            continue
        movimientos.append({
            "fecha": (p.get("fecha_pago") or "")[:10],
            "tipo": "egreso",
            "concepto": p.get("concepto") or "Costo fijo",
            "monto": float(p.get("monto_pagado") or 0),
            "referencia": None,
        })

    movimientos.sort(key=lambda m: m.get("fecha", ""))

    saldo_ini = float(cuenta.get("saldo_inicial") or 0)
    total_ing = sum(m["monto"] for m in movimientos if m["tipo"] == "ingreso")
    total_egr = sum(m["monto"] for m in movimientos if m["tipo"] == "egreso")

    return {
        "cuenta": cuenta,
        "desde": desde_d,
        "hasta": hasta_d,
        "saldo_inicial": saldo_ini,
        "total_ingresos": total_ing,
        "total_egresos": total_egr,
        "saldo_final": saldo_ini + total_ing - total_egr,
        "movimientos": movimientos,
    }
