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

    # Parsear saldo_inicial de forma robusta
    si_raw = data.get("saldo_inicial")
    if si_raw is not None and si_raw != "":
        try:
            saldo_inicial_val = float(si_raw)
        except (TypeError, ValueError):
            saldo_inicial_val = float(cuenta.get("saldo_inicial") or 0)
    else:
        saldo_inicial_val = float(cuenta.get("saldo_inicial") or 0)

    # saldo_inicial_fecha: guardar None si viene vacío
    si_fecha = data.get("saldo_inicial_fecha") or cuenta.get("saldo_inicial_fecha") or None
    if si_fecha == "":
        si_fecha = None

    updates = {
        "nombre": (data.get("nombre") or cuenta["nombre"]).strip(),
        "banco": (data.get("banco") or cuenta.get("banco") or "").strip(),
        "numero_cuenta": (data.get("numero_cuenta") or cuenta.get("numero_cuenta") or "").strip(),
        "moneda": moneda,
        "logo_tipo": logo_tipo,
        "saldo_inicial": saldo_inicial_val,
        "saldo_inicial_fecha": si_fecha,
        "es_predeterminada": es_pred,
        "notas": data.get("notas") if data.get("notas") is not None else cuenta.get("notas") or "",
    }
    result = await db.cuentas_bancarias.update_one({"id": cuenta_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta para actualizar")
    updated = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    await log_auditoria(user, "cuentas_bancarias", "editar", f"Cuenta actualizada: {updates['nombre']}", cuenta_id)
    return updated or {**cuenta, **updates}


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
    hasta: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    """Devuelve saldo_inicial de cada cuenta como saldo_actual (sin cálculo de movimientos)."""
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []

    q = {"activo": {"$ne": False}}
    q.update(logo_q)
    cuentas = await db.cuentas_bancarias.find(q, {"_id": 0}).sort("nombre", 1).to_list(500)

    resultado = []
    for c in cuentas:
        saldo_ini_raw = c.get("saldo_inicial")
        try:
            saldo = float(saldo_ini_raw) if saldo_ini_raw is not None else 0.0
        except (TypeError, ValueError):
            saldo = 0.0

        resultado.append({
            "id": c["id"],
            "nombre": c.get("nombre", ""),
            "banco": c.get("banco") or "",
            "moneda": c.get("moneda") or "PYG",
            "logo_tipo": c.get("logo_tipo", ""),
            "saldo_actual": saldo,
            "saldo_inicial": saldo,
            "es_predeterminada": bool(c.get("es_predeterminada")),
            "numero_cuenta": c.get("numero_cuenta") or "",
            "saldo_inicial_fecha": c.get("saldo_inicial_fecha"),
            "notas": c.get("notas") or "",
        })

    return resultado
