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
from auth import require_authenticated, has_permission, get_logos_acceso, apply_logo_filter, is_forbidden

router = APIRouter()


# ─────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────

def _limpiar_id(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def ensure_cuenta_predeterminada(
    logo_tipo: str,
    nombre_empresa: str = "",
    moneda: str = "PYG",
) -> dict:
    """Crea cuenta predeterminada si no existe para logo+moneda."""
    logo_tipo = (logo_tipo or "").strip()
    if not logo_tipo:
        raise ValueError("logo_tipo requerido")
    moneda = moneda or "PYG"
    existente = await db.cuentas_bancarias.find_one(
        {"logo_tipo": logo_tipo, "moneda": moneda, "es_predeterminada": True, "activa": {"$ne": False}},
        {"_id": 0},
    )
    if existente:
        return existente
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "nombre": f"Caja principal{' — ' + nombre_empresa if nombre_empresa else ''}",
        "banco": "Caja",
        "numero_cuenta": "",
        "moneda": moneda,
        "logo_tipo": logo_tipo,
        "es_predeterminada": True,
        "activa": True,
        "descripcion": "Cuenta predeterminada generada automáticamente",
        "saldo_inicial": 0.0,
        "saldo_inicial_fecha": now[:10],
        "notas": "",
        "usuarios_reporte_ids": [],
        "created_at": now,
        "updated_at": now,
    }
    await _ensure_solo_una_predeterminada(logo_tipo, moneda)
    await db.cuentas_bancarias.insert_one(doc)
    return _limpiar_id(doc)


async def resolver_cuenta_id(
    logo_tipo: str,
    moneda: str = "PYG",
    cuenta_id: Optional[str] = None,
    nombre_empresa: str = "",
) -> Optional[str]:
    """Devuelve cuenta_id válido o la predeterminada del logo/moneda."""
    if cuenta_id:
        c = await db.cuentas_bancarias.find_one(
            {"id": cuenta_id, "logo_tipo": logo_tipo, "activa": {"$ne": False}},
            {"_id": 0, "id": 1},
        )
        if c:
            return cuenta_id
    pred = await ensure_cuenta_predeterminada(logo_tipo, nombre_empresa, moneda)
    return pred.get("id")


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
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)

    if moneda:
        query["moneda"] = moneda
    if activa is not None:
        query["activa"] = activa
    else:
        query["activa"] = {"$ne": False}

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
    # ── Cuentas accesibles ───────────────────────────────────────
    query_cuentas: dict = {}
    await apply_logo_filter(query_cuentas, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(query_cuentas):
        return []

    query_cuentas["activa"] = {"$ne": False}
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
    logos_acceso = await get_logos_acceso(user)
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

    # ── EGRESOS: pagos de IVA ───────────────────────────────────────
    try:
        pagos_iva = await db.pagos_iva.find(
            logo_filter, {"_id": 0, "cuenta_id": 1, "monto": 1, "fecha_pago": 1, "logo_tipo": 1}
        ).to_list(5000)
        for p in pagos_iva:
            tagged = p.get("cuenta_id")
            cid = resolve(tagged, p.get("logo_tipo", ""), "PYG")
            if not cid:
                continue
            if not en_rango(cid, p.get("fecha_pago") or "", use_fecha_ini=bool(tagged)):
                continue
            saldos[cid] -= float(p.get("monto") or 0)
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
#  GET  /admin/cuentas-bancarias/usuarios-acceso-reporte
#  IMPORTANTE: debe ir ANTES de /{cuenta_id} o FastAPI lo captura como parámetro
# ─────────────────────────────────────────────
@router.get("/admin/cuentas-bancarias/usuarios-acceso-reporte")
async def listar_usuarios_acceso_reporte(
    logo_tipo: Optional[str] = None,
    cuenta_id: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    """
    Usuarios con permiso reportes.caja_banco filtrados por la empresa de la cuenta.
    Solo se muestran usuarios de la misma empresa (logo_tipo) que la cuenta bancaria.
    Un admin de JAR nunca ve usuarios de Arandu y viceversa.
    """
    if not _puede_asignar_acceso_reporte(user):
        raise HTTPException(status_code=403, detail="Sin permiso")

    # Determinar el slug de la cuenta
    slug = (logo_tipo or "").strip()
    if cuenta_id:
        c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0, "logo_tipo": 1})
        if c and c.get("logo_tipo"):
            slug = c["logo_tipo"]

    id_to_slug = await _mapa_empresas_propias()

    # Tres estrategias de query para máxima compatibilidad con versiones de Mongo
    todos_raw = await db.users.find(
        {"role": "usuario", "permisos": "reportes.caja_banco"},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "permisos": 1, "logos_asignados": 1},
    ).to_list(500)

    if not todos_raw:
        todos_raw = await db.users.find(
            {"role": "usuario", "permisos": {"$elemMatch": {"$eq": "reportes.caja_banco"}}},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "permisos": 1, "logos_asignados": 1},
        ).to_list(500)

    if not todos_raw:
        todos_raw = await db.users.find(
            {"role": "usuario"},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "permisos": 1, "logos_asignados": 1},
        ).to_list(500)
        todos_raw = [u for u in todos_raw if "reportes.caja_banco" in (u.get("permisos") or [])]

    total_con_permiso = len(todos_raw)

    # Filtrar por empresa de la cuenta — JAR no ve usuarios de Arandu ni viceversa
    out = []
    sin_empresa = 0
    for u in todos_raw:
        if slug:
            if not await _usuario_acceso_logo(u, slug, id_to_slug):
                sin_empresa += 1
                continue
        out.append({
            "id": u["id"],
            "name": u.get("name") or u.get("email"),
            "email": u.get("email"),
        })

    aviso = None
    if not out:
        if total_con_permiso == 0:
            aviso = (
                "Ningún usuario tiene el permiso Reportes → Caja/Banco. "
                "Andá a Usuarios y Permisos, activá el permiso en el usuario correspondiente, "
                "guardá, y pedile que cierre sesión y vuelva a entrar."
            )
        elif sin_empresa:
            aviso = (
                f"Hay {total_con_permiso} usuario(s) con permiso de reporte, pero ninguno "
                f"tiene asignada la empresa «{slug}» en Nuestras Empresas. "
                f"Verificá que el usuario tenga marcada esta empresa en Usuarios y Permisos."
            )
        else:
            aviso = "No hay usuarios elegibles para esta cuenta."

    return {"usuarios": out, "aviso": aviso, "total_con_permiso": total_con_permiso}


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
        "usuarios_reporte_ids": list(data.get("usuarios_reporte_ids") or []),
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

    if "usuarios_reporte_ids" in data:
        updates["usuarios_reporte_ids"] = list(data.get("usuarios_reporte_ids") or [])

    result = await db.cuentas_bancarias.update_one({"id": cuenta_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta para actualizar")
    updated = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    return updated or {**c, **updates}


# ─────────────────────────────────────────────
#  PATCH /admin/cuentas-bancarias/{id}/predeterminada
#  Marcar como predeterminada para su logo+moneda
# ─────────────────────────────────────────────
def _puede_asignar_acceso_reporte(user: dict) -> bool:
    # Solo admin/gerente o quien tenga el permiso específico de asignar acceso.
    # bancos.editar NO da acceso a esta función (es solo para editar datos de la cuenta).
    return (
        user.get("role") in ("admin", "super_admin", "gerente")
        or has_permission(user, "bancos.asignar_acceso_reporte")
    )


async def _mapa_empresas_propias() -> dict:
    """id -> slug y set de ids/slugs válidos."""
    propias = await db.empresas_propias.find({}, {"_id": 0, "id": 1, "slug": 1}).to_list(100)
    id_to_slug = {str(p["id"]): (p.get("slug") or "") for p in propias if p.get("id")}
    return id_to_slug


async def _usuario_acceso_logo(u: dict, logo_tipo: str, id_to_slug: dict = None) -> bool:
    if not logo_tipo:
        return True
    logos = [str(x) for x in (u.get("logos_asignados") or [])]
    if not logos:
        return False
    if id_to_slug is None:
        id_to_slug = await _mapa_empresas_propias()
    slug = (logo_tipo or "").strip()
    ids_del_slug = {i for i, s in id_to_slug.items() if s == slug}
    if ids_del_slug & set(logos):
        return True
    if slug in logos:
        return True
    slugs_del_usuario = {id_to_slug.get(l, l) for l in logos}
    return slug in slugs_del_usuario


@router.patch("/admin/cuentas-bancarias/{cuenta_id}/acceso-reporte")
async def set_acceso_reporte_cuenta(
    cuenta_id: str,
    data: dict,
    user: dict = Depends(require_authenticated),
):
    """Usuarios que pueden ver esta cuenta en Reportes → Caja/Banco."""
    if not _puede_asignar_acceso_reporte(user):
        raise HTTPException(status_code=403, detail="Sin permiso para asignar acceso al reporte")

    c = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    ids = [str(x) for x in (data.get("usuarios_reporte_ids") or []) if x]
    logo_cuenta = c.get("logo_tipo", "")
    if ids:
        id_to_slug = await _mapa_empresas_propias()
        candidatos = await db.users.find(
            {"id": {"$in": ids}, "role": "usuario"},
            {"_id": 0, "id": 1, "permisos": 1, "logos_asignados": 1},
        ).to_list(500)
        for u in candidatos:
            if "reportes.caja_banco" not in (u.get("permisos") or []):
                raise HTTPException(
                    status_code=400,
                    detail="El usuario no tiene el permiso Reportes → Caja/Banco. Asignáselo primero en Usuarios.",
                )
            # Validar que el usuario pertenezca a la misma empresa que la cuenta
            if logo_cuenta and not await _usuario_acceso_logo(u, logo_cuenta, id_to_slug):
                raise HTTPException(
                    status_code=400,
                    detail=f"El usuario no pertenece a la empresa de esta cuenta ({logo_cuenta}). Solo se pueden asignar usuarios de la misma empresa.",
                )

    await db.cuentas_bancarias.update_one(
        {"id": cuenta_id},
        {"$set": {
            "usuarios_reporte_ids": ids,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0})
    return updated


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
