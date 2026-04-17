from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, apply_logo_filter, is_forbidden

router = APIRouter()

# ─────────────────────────────────────────────
#  CUENTAS BANCARIAS (por empresa propia)
# ─────────────────────────────────────────────

@router.get("/admin/cuentas-bancarias")
async def get_cuentas(
    logo_tipo: Optional[str] = None,
    moneda: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query = {"activo": {"$ne": False}}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if moneda:
        query["moneda"] = moneda
    cuentas = await db.cuentas_bancarias.find(query, {"_id": 0}).sort("nombre", 1).to_list(200)
    # Si no hay predeterminadas, marcar la primera por moneda+logo como fallback
    return cuentas


@router.post("/admin/cuentas-bancarias")
async def crear_cuenta(data: dict, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "balance.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Nombre requerido")
    moneda = data.get("moneda") or "PYG"
    logo_tipo = data.get("logo_tipo") or "arandujar"
    es_pred = bool(data.get("es_predeterminada", False))

    # Si se marca como predeterminada, desmarcar otras del mismo logo+moneda
    if es_pred:
        await db.cuentas_bancarias.update_many(
            {"logo_tipo": logo_tipo, "moneda": moneda},
            {"$set": {"es_predeterminada": False}}
        )

    doc = {
        "id": str(uuid.uuid4()),
        "nombre": nombre,
        "banco": (data.get("banco") or "").strip(),
        "numero_cuenta": (data.get("numero_cuenta") or "").strip(),
        "moneda": moneda,
        "logo_tipo": logo_tipo,
        "saldo_inicial": float(data.get("saldo_inicial") or 0),
        "saldo_inicial_fecha": data.get("saldo_inicial_fecha") or None,  # "YYYY-MM-DD"; si None = se considera desde siempre
        "es_predeterminada": es_pred,
        "activo": True,
        "notas": data.get("notas") or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cuentas_bancarias.insert_one(dict(doc))
    await log_auditoria(user, "cuentas_bancarias", "crear", f"Cuenta creada: {nombre} ({moneda})", doc["id"])
    return doc


@router.put("/admin/cuentas-bancarias/{cuenta_id}")
async def actualizar_cuenta(cuenta_id: str, data: dict, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "balance.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    cuenta = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    es_pred = bool(data.get("es_predeterminada", cuenta.get("es_predeterminada")))
    moneda = data.get("moneda") or cuenta.get("moneda")
    logo_tipo = data.get("logo_tipo") or cuenta.get("logo_tipo")

    if es_pred:
        await db.cuentas_bancarias.update_many(
            {"logo_tipo": logo_tipo, "moneda": moneda, "id": {"$ne": cuenta_id}},
            {"$set": {"es_predeterminada": False}}
        )

    updates = {
        "nombre": (data.get("nombre") or cuenta["nombre"]).strip(),
        "banco": (data.get("banco") or cuenta.get("banco", "")).strip(),
        "numero_cuenta": (data.get("numero_cuenta") or cuenta.get("numero_cuenta", "")).strip(),
        "moneda": moneda,
        "logo_tipo": logo_tipo,
        "saldo_inicial": float(data.get("saldo_inicial", cuenta.get("saldo_inicial", 0))),
        "saldo_inicial_fecha": data.get("saldo_inicial_fecha", cuenta.get("saldo_inicial_fecha")),
        "es_predeterminada": es_pred,
        "notas": data.get("notas", cuenta.get("notas", "")),
    }
    await db.cuentas_bancarias.update_one({"id": cuenta_id}, {"$set": updates})
    await log_auditoria(user, "cuentas_bancarias", "editar", f"Cuenta actualizada: {updates['nombre']}", cuenta_id)
    return {**cuenta, **updates}


@router.delete("/admin/cuentas-bancarias/{cuenta_id}")
async def eliminar_cuenta(cuenta_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "balance.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    cuenta = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    # Soft delete: marca inactiva para no romper referencias
    await db.cuentas_bancarias.update_one({"id": cuenta_id}, {"$set": {"activo": False}})
    await log_auditoria(user, "cuentas_bancarias", "eliminar", f"Cuenta desactivada: {cuenta.get('nombre')}", cuenta_id)
    return {"ok": True}


# ─────────────────────────────────────────────
#  SALDOS — calcula movimientos de cada cuenta
# ─────────────────────────────────────────────

@router.get("/admin/cuentas-bancarias/saldos")
async def get_saldos(
    logo_tipo: Optional[str] = None,
    hasta: Optional[str] = None,   # YYYY-MM-DD; por default hoy
    user: dict = Depends(require_authenticated)
):
    """Devuelve saldo actual de cada cuenta = saldo_inicial + ingresos - egresos."""
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []

    q = {"activo": {"$ne": False}}
    q.update(logo_q)
    cuentas = await db.cuentas_bancarias.find(q, {"_id": 0}).sort("nombre", 1).to_list(500)

    hasta_date = hasta or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    resultado = []

    for c in cuentas:
        cid = c["id"]
        saldo = float(c.get("saldo_inicial", 0))
        fecha_ini = c.get("saldo_inicial_fecha")

        # INGRESOS: pagos de factura con cuenta_id = cid
        # Recorremos facturas con pagos[] que incluyan este cid
        facturas = await db.facturas.find(
            {"pagos.cuenta_id": cid},
            {"_id": 0, "pagos": 1}
        ).to_list(5000)
        for fac in facturas:
            for p in (fac.get("pagos") or []):
                if p.get("cuenta_id") != cid:
                    continue
                fp = (p.get("fecha") or "")[:10]
                if fecha_ini and fp < fecha_ini:
                    continue
                if fp > hasta_date:
                    continue
                saldo += float(p.get("monto", 0))

        # INGRESOS VARIOS (manuales con cuenta_id) — también egresos si monto<0
        ivs = await db.ingresos_varios.find(
            {"cuenta_id": cid},
            {"_id": 0, "monto": 1, "fecha": 1}
        ).to_list(5000)
        for iv in ivs:
            fp = (iv.get("fecha") or "")[:10]
            if fecha_ini and fp < fecha_ini:
                continue
            if fp > hasta_date:
                continue
            saldo += float(iv.get("monto", 0))

        # EGRESOS: pagos_costos_fijos, pagos sueldos, compras pagadas (con cuenta_id)
        pcf = await db.pagos_costos_fijos.find({"cuenta_id": cid}, {"_id": 0, "monto_pagado": 1, "fecha_pago": 1}).to_list(5000)
        for p in pcf:
            fp = (p.get("fecha_pago") or "")[:10]
            if fecha_ini and fp < fecha_ini: continue
            if fp > hasta_date: continue
            saldo -= float(p.get("monto_pagado", 0))

        # Compras con pagos
        compras = await db.compras.find({"pagos.cuenta_id": cid}, {"_id": 0, "pagos": 1}).to_list(5000)
        for c2 in compras:
            for p in (c2.get("pagos") or []):
                if p.get("cuenta_id") != cid:
                    continue
                fp = (p.get("fecha") or "")[:10]
                if fecha_ini and fp < fecha_ini: continue
                if fp > hasta_date: continue
                saldo -= float(p.get("monto", 0))

        # Pagos proveedores
        pp = await db.pagos_proveedores.find({"cuenta_id": cid}, {"_id": 0, "monto": 1, "fecha": 1}).to_list(5000)
        for p in pp:
            fp = (p.get("fecha") or "")[:10]
            if fecha_ini and fp < fecha_ini: continue
            if fp > hasta_date: continue
            saldo -= float(p.get("monto", 0))

        resultado.append({
            "id": cid,
            "nombre": c.get("nombre"),
            "banco": c.get("banco", ""),
            "moneda": c.get("moneda"),
            "logo_tipo": c.get("logo_tipo"),
            "saldo_actual": saldo,
            "saldo_inicial": float(c.get("saldo_inicial", 0)),
            "es_predeterminada": bool(c.get("es_predeterminada")),
            "numero_cuenta": c.get("numero_cuenta", ""),
        })

    return resultado
