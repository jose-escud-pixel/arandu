"""
routes/cuentas_bancarias.py
────────────────────────────────────────────────────────────────
CRUD completo para cuentas bancarias.
Incluye endpoint de saldos calculados desde los pagos registrados.

Colección MongoDB: cuentas_bancarias
Campos principales:
  id, nombre, banco, numero_cuenta, moneda, logo_tipo,
  es_predeterminada, activa, descripcion, created_at
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso

router = APIRouter()


# ─────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────

def _limpiar_id(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def _ensure_solo_una_predeterminada(logo_tipo: str, moneda: str, excluir_id: str = None):
    """Si se marca una cuenta como predeterminada, quitar el flag de las demás
    del mismo logo_tipo + moneda."""
    query = {"logo_tipo": logo_tipo, "moneda": moneda, "es_predeterminada": True}
    if excluir_id:
        query["id"] = {"$ne": excluir_id}
    await db.cuentas_bancarias.update_many(query, {"$set": {"es_predeterminada": False}})


# ─────────────────────────────────────────────
#  GET  /admin/cuentas-bancarias
# ─────────────────────────────────────────────
@router.get("/admin/cuentas-bancarias")
async def get_cuentas_bancarias(
    logo_tipo: Optional[str] = None,
    moneda: Optional[str] = None,
    activa: Optional[bool] = None,
    user: dict = Depends(require_authenticated),
):
    query = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo

    if moneda:
        query["moneda"] = moneda
    if activa is not None:
        query["activa"] = activa

    cuentas = await db.cuentas_bancarias.find(query, {"_id": 0}).sort("nombre", 1).to_list(500)
    return cuentas


# ─────────────────────────────────────────────
#  GET  /admin/cuentas-bancarias/saldos
#  Calcula saldo de cada cuenta sumando los pagos registrados
# ─────────────────────────────────────────────
@router.get("/admin/cuentas-bancarias/saldos")
async def get_saldos_cuentas(
    logo_tipo: Optional[str] = None,
    hasta: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    """Saldo real por cuenta = saldo_inicial + movimientos.
    Movimientos sin cuenta_id asignada van a la cuenta predeterminada de esa moneda."""
    logos_acceso = await get_logos_acceso(user)

    # ── Cuentas accesibles ───────────────────────────────────────
    query_cuentas: dict = {}
    if logos_acceso is not None:
        query_cuentas["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query_cuentas["logo_tipo"] = logo_tipo

    cuentas = await db.cuentas_bancarias.find(query_cuentas, {"_id": 0}).sort("nombre", 1).to_list(500)
    if not cuentas:
        return []

    hasta_date = hasta or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Índices
    cid_set = {c["id"] for c in cuentas}
    fechas_ini: dict = {c["id"]: c.get("saldo_inicial_fecha") for c in cuentas}

    # Cuenta predeterminada por (logo_tipo, moneda) — fallback a la primera en lista
    pred_map: dict = {}
    for c in cuentas:
        key = (c.get("logo_tipo"), c.get("moneda", "PYG"))
        if key not in pred_map:
            pred_map[key] = c["id"]          # primera como fallback
    for c in cuentas:
        if c.get("es_predeterminada"):
            pred_map[(c.get("logo_tipo"), c.get("moneda", "PYG"))] = c["id"]

    def default_cid(logo, moneda):
        return pred_map.get((logo, moneda))

    def resolve(tagged_cid, logo, moneda):
        """Devuelve el cuenta_id a usar: el taggeado si existe y es válido, sino el default."""
        if tagged_cid and tagged_cid in cid_set:
            return tagged_cid
        return default_cid(logo, moneda)

    def en_rango(cid, fp, use_fecha_ini=True):
        if not fp:
            return True
        fp10 = fp[:10]
        if use_fecha_ini:
            fi = fechas_ini.get(cid)
            if fi and fp10 < fi:
                return False
        return fp10 <= hasta_date

    # Filtro de logo para colecciones de movimientos
    logo_filter: dict = {}
    if logos_acceso is not None:
        logo_filter["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        logo_filter["logo_tipo"] = logo_tipo

    # Inicializar saldo = saldo_inicial
    saldos: dict = {}
    saldos_ini: dict = {}
    for c in cuentas:
        cid = c["id"]
        si_raw = c.get("saldo_inicial")
        try:
            si = float(si_raw) if si_raw is not None else 0.0
        except (TypeError, ValueError):
            si = 0.0
        saldos[cid] = si
        saldos_ini[cid] = si

    # ── INGRESOS: pagos de facturas ──────────────────────────────
    try:
        facturas = await db.facturas.find(
            logo_filter, {"_id": 0, "pagos": 1, "logo_tipo": 1, "moneda": 1}
        ).to_list(10000)
        for fac in facturas:
            flogo = fac.get("logo_tipo", "")
            fmoneda = fac.get("moneda", "PYG")
            for p in (fac.get("pagos") or []):
                tagged = p.get("cuenta_id")
                cid = resolve(tagged, flogo, fmoneda)
                if not cid:
                    continue
                if not en_rango(cid, p.get("fecha") or "", use_fecha_ini=bool(tagged)):
                    continue
                saldos[cid] += float(p.get("monto") or 0)
    except Exception:
        pass

    # ── INGRESOS VARIOS ──────────────────────────────────────────
    try:
        ivs = await db.ingresos_varios.find(
            logo_filter, {"_id": 0, "cuenta_id": 1, "monto": 1, "fecha": 1, "logo_tipo": 1, "moneda": 1}
        ).to_list(5000)
        for iv in ivs:
            tagged = iv.get("cuenta_id")
            cid = resolve(tagged, iv.get("logo_tipo", ""), iv.get("moneda", "PYG"))
            if not cid:
                continue
            if not en_rango(cid, iv.get("fecha") or "", use_fecha_ini=bool(tagged)):
                continue
            saldos[cid] += float(iv.get("monto") or 0)
    except Exception:
        pass

    # ── EGRESOS: costos fijos ────────────────────────────────────
    try:
        pcf = await db.pagos_costos_fijos.find(
            logo_filter, {"_id": 0, "cuenta_id": 1, "monto_pagado": 1, "fecha_pago": 1, "logo_tipo": 1}
        ).to_list(5000)
        for p in pcf:
            tagged = p.get("cuenta_id")
            cid = resolve(tagged, p.get("logo_tipo", ""), "PYG")
            if not cid:
                continue
            if not en_rango(cid, p.get("fecha_pago") or "", use_fecha_ini=bool(tagged)):
                continue
            saldos[cid] -= float(p.get("monto_pagado") or 0)
    except Exception:
        pass

    # ── EGRESOS: compras ─────────────────────────────────────────
    try:
        compras = await db.compras.find(
            logo_filter, {"_id": 0, "pagos": 1, "logo_tipo": 1, "moneda": 1}
        ).to_list(5000)
        for comp in compras:
            clogo = comp.get("logo_tipo", "")
            cmoneda = comp.get("moneda", "PYG")
            for p in (comp.get("pagos") or []):
                tagged = p.get("cuenta_id")
                # Si el pago tiene tipo_cambio fue pagado en PYG aunque la compra sea en USD
                tiene_tc = float(p.get("tipo_cambio") or 0) > 0
                if tiene_tc:
                    moneda_real = "PYG"
                    monto_real = float(p.get("monto_gs") or 0) or (float(p.get("monto") or 0) * float(p.get("tipo_cambio") or 1))
                else:
                    moneda_real = p.get("moneda") or cmoneda
                    monto_real = float(p.get("monto") or 0)
                cid = resolve(tagged, clogo, moneda_real)
                if not cid:
                    continue
                if not en_rango(cid, p.get("fecha") or "", use_fecha_ini=bool(tagged)):
                    continue
                saldos[cid] -= monto_real
    except Exception:
        pass

    # ── EGRESOS: pagos a proveedores ─────────────────────────────
    try:
        pp = await db.pagos_proveedores.find(
            logo_filter, {"_id": 0, "cuenta_id": 1, "monto": 1, "monto_gs": 1,
                          "fecha": 1, "fecha_pago": 1, "logo_tipo": 1, "moneda": 1, "tipo_cambio": 1}
        ).to_list(5000)
        for p in pp:
            tagged = p.get("cuenta_id")
            # Si tiene tipo_cambio fue pagado en PYG aunque moneda sea USD
            tiene_tc = float(p.get("tipo_cambio") or 0) > 0
            if tiene_tc:
                moneda_real = "PYG"
                monto_real = float(p.get("monto_gs") or 0) or (float(p.get("monto") or 0) * float(p.get("tipo_cambio") or 1))
            else:
                moneda_real = p.get("moneda", "PYG")
                monto_real = float(p.get("monto") or 0)
            cid = resolve(tagged, p.get("logo_tipo", ""), moneda_real)
            if not cid:
                continue
            fp = p.get("fecha_pago") or p.get("fecha") or ""
            if not en_rango(cid, fp, use_fecha_ini=bool(tagged)):
                continue
            saldos[cid] -= monto_real
    except Exception:
        pass

    resultado = []
    for cuenta in cuentas:
        cid = cuenta["id"]
        resultado.append({
            **cuenta,
            "saldo_actual": round(saldos[cid], 2),
            "saldo_inicial": saldos_ini[cid],
        })
    return resultado




# ─────────────────────────────────────────────
#  GET  /admin/cuentas-bancarias/{id}
# ─────────────────────────────────────────────
@router.get("/admin/cuentas-bancarias/{cuenta_id}")
async def get_cuenta_bancaria(
    cuenta_id: str,
    user: dict = Depends(require_authenticated),
):
    c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada")
    return c


# ─────────────────────────────────────────────
#  POST /admin/cuentas-bancarias
# ─────────────────────────────────────────────
@router.post("/admin/cuentas-bancarias", status_code=201)
async def create_cuenta_bancaria(
    data: dict,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "bancos.crear"):
        # Si no tiene permiso específico, verificar al menos admin
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Sin permiso para crear cuentas")

    now = datetime.now(timezone.utc).isoformat()
    si_raw = data.get("saldo_inicial")
    try:
        saldo_ini = float(si_raw) if si_raw is not None and si_raw != "" else 0.0
    except (TypeError, ValueError):
        saldo_ini = 0.0
    doc = {
        "id": str(uuid.uuid4()),
        "nombre": data.get("nombre", "").strip(),
        "banco": data.get("banco", "").strip(),
        "numero_cuenta": data.get("numero_cuenta", "").strip(),
        "moneda": data.get("moneda", "PYG"),
        "logo_tipo": data.get("logo_tipo", ""),
        "es_predeterminada": bool(data.get("es_predeterminada", False)),
        "activa": bool(data.get("activa", True)),
        "descripcion": data.get("descripcion", ""),
        "saldo_inicial": saldo_ini,
        "saldo_inicial_fecha": data.get("saldo_inicial_fecha") or None,
        "notas": data.get("notas") or "",
        "created_at": now,
        "updated_at": now,
    }

    if not doc["nombre"]:
        raise HTTPException(status_code=400, detail="El nombre de la cuenta es requerido")
    if not doc["logo_tipo"]:
        raise HTTPException(status_code=400, detail="El logo_tipo (empresa) es requerido")

    # Si se marca como predeterminada, quitar el flag de las demás
    if doc["es_predeterminada"]:
        await _ensure_solo_una_predeterminada(doc["logo_tipo"], doc["moneda"])

    await db.cuentas_bancarias.insert_one(doc)
    return _limpiar_id(doc)


# ─────────────────────────────────────────────
#  PUT  /admin/cuentas-bancarias/{id}
# ─────────────────────────────────────────────
@router.put("/admin/cuentas-bancarias/{cuenta_id}")
async def update_cuenta_bancaria(
    cuenta_id: str,
    data: dict,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "bancos.editar"):
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Sin permiso para editar cuentas")

    c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada")

    # Parsear saldo_inicial de forma robusta
    si_raw = data.get("saldo_inicial")
    if si_raw is not None and si_raw != "":
        try:
            saldo_ini = float(si_raw)
        except (TypeError, ValueError):
            saldo_ini = float(c.get("saldo_inicial") or 0)
    else:
        saldo_ini = float(c.get("saldo_inicial") or 0)

    # saldo_inicial_fecha: respetar None si viene vacío
    si_fecha = data.get("saldo_inicial_fecha")
    if si_fecha == "":
        si_fecha = None
    elif si_fecha is None:
        si_fecha = c.get("saldo_inicial_fecha")

    updates = {
        "nombre": data.get("nombre", c["nombre"]).strip(),
        "banco": data.get("banco", c.get("banco", "")).strip(),
        "numero_cuenta": data.get("numero_cuenta", c.get("numero_cuenta", "")).strip(),
        "moneda": data.get("moneda", c.get("moneda", "PYG")),
        "logo_tipo": data.get("logo_tipo", c.get("logo_tipo", "")),
        "es_predeterminada": bool(data.get("es_predeterminada", c.get("es_predeterminada", False))),
        "activa": bool(data.get("activa", c.get("activa", True))),
        "descripcion": data.get("descripcion", c.get("descripcion", "")),
        "saldo_inicial": saldo_ini,
        "saldo_inicial_fecha": si_fecha,
        "notas": data.get("notas") if data.get("notas") is not None else c.get("notas") or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Si se marca como predeterminada, quitar el flag de las demás
    if updates["es_predeterminada"]:
        await _ensure_solo_una_predeterminada(updates["logo_tipo"], updates["moneda"], excluir_id=cuenta_id)

    result = await db.cuentas_bancarias.update_one({"id": cuenta_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta para actualizar")
    updated = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    return updated or {**c, **updates}


# ─────────────────────────────────────────────
#  PATCH /admin/cuentas-bancarias/{id}/predeterminada
#  Marcar como predeterminada para su logo+moneda
# ─────────────────────────────────────────────
@router.patch("/admin/cuentas-bancarias/{cuenta_id}/predeterminada")
async def set_predeterminada(
    cuenta_id: str,
    user: dict = Depends(require_authenticated),
):
    if user.get("role") != "admin" and not has_permission(user, "bancos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    await _ensure_solo_una_predeterminada(c["logo_tipo"], c["moneda"], excluir_id=cuenta_id)
    await db.cuentas_bancarias.update_one(
        {"id": cuenta_id},
        {"$set": {"es_predeterminada": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"ok": True, "cuenta_id": cuenta_id}


# ─────────────────────────────────────────────
#  DELETE /admin/cuentas-bancarias/{id}
# ─────────────────────────────────────────────
@router.delete("/admin/cuentas-bancarias/{cuenta_id}")
async def delete_cuenta_bancaria(
    cuenta_id: str,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "bancos.eliminar"):
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Sin permiso para eliminar cuentas")

    c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada")

    # Verificar si tiene pagos vinculados
    pagos_vinculados = await db.facturas.count_documents({"pagos.cuenta_id": cuenta_id})
    if pagos_vinculados > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar: tiene {pagos_vinculados} factura(s) con pagos vinculados. Desvinculá los pagos primero."
        )

    await db.cuentas_bancarias.delete_one({"id": cuenta_id})
    return {"ok": True}
