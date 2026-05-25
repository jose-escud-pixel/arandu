from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
from typing import Optional, List

from config import db
from auth import require_admin, require_authenticated, has_permission, can_access_empresa, log_auditoria, apply_logo_filter, is_forbidden
from models.schemas import AlertaCreate

router = APIRouter()

CUMPLEANOS_DEFAULTS = {
    "notificar_dias_amarillo": 10,
    "notificar_dias_urgente": 0,
}


def _parse_fecha_iso(fecha_str: str) -> Optional[datetime]:
    if not fecha_str:
        return None
    try:
        if "T" in fecha_str:
            return datetime.fromisoformat(fecha_str.replace("Z", "+00:00"))
        return datetime.fromisoformat(fecha_str[:10] + "T00:00:00+00:00")
    except Exception:
        return None


def _proximo_cumpleanos_iso(fecha_nacimiento: str) -> Optional[str]:
    """Próxima fecha de cumpleaños (YYYY-MM-DD) desde fecha_nacimiento."""
    base = _parse_fecha_iso(fecha_nacimiento)
    if not base:
        return None
    now = datetime.now(timezone.utc)
    year = now.year
    try:
        prox = base.replace(year=year)
        if prox.date() < now.date():
            prox = base.replace(year=year + 1)
        return prox.strftime("%Y-%m-%d")
    except ValueError:
        # 29-feb en año no bisiesto
        prox = base.replace(year=year, day=28)
        if prox.date() < now.date():
            prox = base.replace(year=year + 1, day=28)
        return prox.strftime("%Y-%m-%d")


def _dias_hasta(fecha_iso: str) -> int:
    venc = _parse_fecha_iso(fecha_iso)
    if not venc:
        return 9999
    now = datetime.now(timezone.utc)
    return (venc.date() - now.date()).days


def _color_cumpleanos(dias: int, amarillo: int, urgente: int) -> str:
    if dias <= urgente:
        return "rojo"
    if dias <= amarillo:
        return "amarillo"
    return "verde"


def _umbrales_cumpleanos_cliente(emp: dict, cfg: dict) -> tuple:
    amarillo = emp.get("cumpleanos_amarillo_dias")
    urgente = emp.get("cumpleanos_urgente_dias")
    if amarillo is None:
        amarillo = int(cfg["notificar_dias_amarillo"])
    else:
        amarillo = int(amarillo)
    if urgente is None:
        urgente = int(cfg["notificar_dias_urgente"])
    else:
        urgente = int(urgente)
    return amarillo, urgente


async def _get_config_cumpleanos() -> dict:
    doc = await db.configuracion.find_one({"id": "alertas_cumpleanos"}, {"_id": 0})
    if not doc:
        return dict(CUMPLEANOS_DEFAULTS)
    return {
        "notificar_dias_amarillo": doc.get("notificar_dias_amarillo", CUMPLEANOS_DEFAULTS["notificar_dias_amarillo"]),
        "notificar_dias_urgente": doc.get("notificar_dias_urgente", CUMPLEANOS_DEFAULTS["notificar_dias_urgente"]),
    }


async def sync_alertas_cumpleanos(logo_tipo: Optional[str] = None) -> int:
    """Genera/actualiza alertas tipo cumpleanos desde clientes con fecha_nacimiento."""
    cfg = await _get_config_cumpleanos()

    query_emp = {"fecha_nacimiento": {"$exists": True, "$nin": [None, ""]}}
    if logo_tipo and logo_tipo != "todas":
        query_emp["logo_tipo"] = logo_tipo

    clientes = await db.empresas.find(query_emp, {"_id": 0}).to_list(2000)
    creadas = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for emp in clientes:
        fn = (emp.get("fecha_nacimiento") or "").strip()
        prox = _proximo_cumpleanos_iso(fn)
        if not prox:
            continue
        alerta_key = f"cumpleanos:{emp['id']}"
        nombre = f"Cumpleaños — {emp.get('nombre', 'Cliente')}"
        amarillo, urgente = _umbrales_cumpleanos_cliente(emp, cfg)
        doc = {
            "empresa_id": emp["id"],
            "tipo": "cumpleanos",
            "nombre": nombre,
            "descripcion": f"Fecha de nacimiento: {fn[:10]}. Próximo cumpleaños: {prox}.",
            "fecha_vencimiento": prox,
            "activo_id": None,
            "notificar_dias": amarillo,
            "notificar_dias_urgente": urgente,
            "auto_generada": True,
            "alerta_key": alerta_key,
            "estado": "activa",
        }
        existing = await db.alertas.find_one({"alerta_key": alerta_key}, {"_id": 0, "id": 1})
        if existing:
            await db.alertas.update_one(
                {"alerta_key": alerta_key},
                {"$set": {**doc, "updated_at": now_iso}},
            )
        else:
            await db.alertas.insert_one({
                "id": str(uuid.uuid4()),
                **doc,
                "created_at": now_iso,
            })
            creadas += 1

    # Eliminar auto-generadas de clientes que ya no tienen fecha
    keys_validas = {f"cumpleanos:{e['id']}" for e in clientes if _proximo_cumpleanos_iso((e.get("fecha_nacimiento") or "").strip())}
    stale_q = {"tipo": "cumpleanos", "auto_generada": True, "alerta_key": {"$nin": list(keys_validas)}}
    if logo_tipo and logo_tipo != "todas":
        emp_ids = [e["id"] for e in clientes]
        stale_q["empresa_id"] = {"$nin": emp_ids}
    await db.alertas.delete_many(stale_q)

    return creadas


async def _empresa_ids_por_logo(user: dict, logo_tipo: Optional[str]):
    if not logo_tipo or logo_tipo == "todas":
        return None
    logo_query = {}
    await apply_logo_filter(logo_query, user, logo_tipo)
    if is_forbidden(logo_query):
        return []
    empresas = await db.empresas.find(logo_query, {"_id": 0, "id": 1}).to_list(1000)
    return [e["id"] for e in empresas]


def _aplicar_acceso_usuario(query: dict, user: dict):
    if user.get("role") in ("admin", "gerente", "super_admin"):
        return True
    if user.get("empresas_todos_clientes"):
        return True
    asignadas = user.get("empresas_asignadas") or []
    if not asignadas:
        return False
    if "empresa_id" not in query:
        query["empresa_id"] = {"$in": asignadas}
    elif isinstance(query["empresa_id"], dict) and "$in" in query["empresa_id"]:
        query["empresa_id"]["$in"] = [eid for eid in query["empresa_id"]["$in"] if eid in asignadas]
        if not query["empresa_id"]["$in"]:
            return False
    elif query["empresa_id"] not in asignadas:
        return False
    return True


async def _get_alerta_accessible(alerta_id: str, user: dict):
    alerta = await db.alertas.find_one({"id": alerta_id}, {"_id": 0})
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    if not can_access_empresa(user, alerta.get("empresa_id")):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta alerta")
    return alerta


@router.get("/admin/alertas")
async def get_alertas(empresa_id: Optional[str] = None, logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver alertas")
    query = {}
    empresas_logo = await _empresa_ids_por_logo(user, logo_tipo)
    if empresas_logo == []:
        return []
    if empresa_id:
        if not can_access_empresa(user, empresa_id):
            return []
        if empresas_logo is not None and empresa_id not in empresas_logo:
            return []
        query["empresa_id"] = empresa_id
    elif empresas_logo is not None:
        query["empresa_id"] = {"$in": empresas_logo}
    if not _aplicar_acceso_usuario(query, user):
        return []
    alertas = await db.alertas.find(query, {"_id": 0}).sort("fecha_vencimiento", 1).to_list(500)
    emp_ids = list(set(a["empresa_id"] for a in alertas))
    empresas_list = await db.empresas.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)
    emp_map = {e["id"]: e["nombre"] for e in empresas_list}
    activo_ids = [a["activo_id"] for a in alertas if a.get("activo_id")]
    act_map = {}
    if activo_ids:
        activos_list = await db.activos.find({"id": {"$in": activo_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
        act_map = {a["id"]: a["nombre"] for a in activos_list}
    for a in alertas:
        a["empresa_nombre"] = emp_map.get(a["empresa_id"], "")
        a["activo_nombre"] = act_map.get(a.get("activo_id", ""), "")
    return alertas

@router.post("/admin/alertas")
async def create_alerta(data: AlertaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso para crear alertas")
    if not can_access_empresa(user, data.empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    alerta_id = str(uuid.uuid4())
    payload = data.dict()
    if payload.get("notificar_dias_urgente") is None:
        payload["notificar_dias_urgente"] = 0
    doc = {"id": alerta_id, **payload, "estado": "activa", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.alertas.insert_one(doc)
    await log_auditoria(user, "alertas", "crear", f"Alerta creada: {data.nombre}", alerta_id)
    doc.pop("_id", None)
    return doc

@router.put("/admin/alertas/{alerta_id}")
async def update_alerta(alerta_id: str, data: AlertaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar alertas")
    await _get_alerta_accessible(alerta_id, user)
    if not can_access_empresa(user, data.empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    await db.alertas.update_one({"id": alerta_id}, {"$set": data.dict()})
    await log_auditoria(user, "alertas", "editar", f"Alerta editada: {data.nombre}", alerta_id)
    return {"success": True}

@router.put("/admin/alertas/{alerta_id}/estado")
async def update_alerta_estado(alerta_id: str, body: dict, user: dict = Depends(require_authenticated)):
    await _get_alerta_accessible(alerta_id, user)
    estado = body.get("estado", "activa")
    await db.alertas.update_one({"id": alerta_id}, {"$set": {"estado": estado}})
    await log_auditoria(user, "alertas", "cambiar_estado", f"Estado: {estado}", alerta_id)
    return {"success": True}

@router.delete("/admin/alertas/{alerta_id}")
async def delete_alerta(alerta_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar alertas")
    await _get_alerta_accessible(alerta_id, user)
    await db.alertas.delete_one({"id": alerta_id})
    await log_auditoria(user, "alertas", "eliminar", "Alerta eliminada", alerta_id)
    return {"success": True}

@router.post("/admin/alertas/sync-cumpleanos")
async def sync_cumpleanos_endpoint(logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    n = await sync_alertas_cumpleanos(logo_tipo)
    return {"success": True, "creadas": n}


@router.get("/admin/alertas/cumpleanos/config")
async def get_cumpleanos_config(user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    return await _get_config_cumpleanos()


@router.put("/admin/alertas/cumpleanos/config")
async def update_cumpleanos_config(body: dict, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    amarillo = int(body.get("notificar_dias_amarillo", CUMPLEANOS_DEFAULTS["notificar_dias_amarillo"]))
    urgente = int(body.get("notificar_dias_urgente", CUMPLEANOS_DEFAULTS["notificar_dias_urgente"]))
    await db.configuracion.update_one(
        {"id": "alertas_cumpleanos"},
        {"$set": {
            "id": "alertas_cumpleanos",
            "notificar_dias_amarillo": amarillo,
            "notificar_dias_urgente": urgente,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"success": True, "notificar_dias_amarillo": amarillo, "notificar_dias_urgente": urgente}


@router.get("/admin/alertas/cumpleanos/resumen")
async def get_cumpleanos_resumen(logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    await sync_alertas_cumpleanos(logo_tipo)
    cfg = await _get_config_cumpleanos()
    amarillo = int(cfg["notificar_dias_amarillo"])
    urgente = int(cfg["notificar_dias_urgente"])

    query = {"estado": "activa", "tipo": "cumpleanos"}
    empresas_logo = await _empresa_ids_por_logo(user, logo_tipo)
    if empresas_logo == []:
        return {"total": 0, "hoy": 0, "proximos": 0, "items": [], "config": cfg}
    if empresas_logo is not None:
        query["empresa_id"] = {"$in": empresas_logo}
    if not _aplicar_acceso_usuario(query, user):
        return {"total": 0, "hoy": 0, "proximos": 0, "items": [], "config": cfg}

    alertas = await db.alertas.find(query, {"_id": 0}).to_list(500)
    items = []
    hoy = 0
    proximos = 0
    for a in alertas:
        dias = _dias_hasta(a.get("fecha_vencimiento", ""))
        a_amarillo = int(a.get("notificar_dias", amarillo))
        a_urgente = int(a.get("notificar_dias_urgente") if a.get("notificar_dias_urgente") is not None else urgente)
        color = _color_cumpleanos(dias, a_amarillo, a_urgente)
        if dias > a_amarillo:
            continue
        if dias <= a_urgente:
            hoy += 1
        else:
            proximos += 1
        items.append({
            **a,
            "dias_restantes": dias,
            "color_alerta": color,
        })

    emp_ids = list({a["empresa_id"] for a in items})
    if emp_ids:
        empresas_list = await db.empresas.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
        emp_map = {e["id"]: e["nombre"] for e in empresas_list}
        for it in items:
            it["empresa_nombre"] = emp_map.get(it["empresa_id"], "")

    items.sort(key=lambda x: x.get("dias_restantes", 999))
    return {
        "total": len(items),
        "hoy": hoy,
        "proximos": proximos,
        "items": items,
        "config": cfg,
    }


@router.get("/admin/alertas/proximas")
async def get_alertas_proximas(logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    await sync_alertas_cumpleanos(logo_tipo)
    now = datetime.now(timezone.utc)
    query = {"estado": "activa"}
    empresas_logo = await _empresa_ids_por_logo(user, logo_tipo)
    if empresas_logo == []:
        return []
    if empresas_logo is not None:
        query["empresa_id"] = {"$in": empresas_logo}
    if not _aplicar_acceso_usuario(query, user):
        return []
    alertas = await db.alertas.find(query, {"_id": 0}).to_list(500)
    proximas = []
    for a in alertas:
        try:
            dias_restantes = _dias_hasta(a.get("fecha_vencimiento", ""))
            notificar = a.get("notificar_dias", 30)
            if a.get("tipo") == "cumpleanos":
                urgente = int(a.get("notificar_dias_urgente") if a.get("notificar_dias_urgente") is not None else 0)
                if dias_restantes > notificar:
                    continue
                a["color_alerta"] = _color_cumpleanos(dias_restantes, notificar, urgente)
            elif dias_restantes <= notificar:
                a["color_alerta"] = "amarillo" if dias_restantes <= 7 else "verde"
            else:
                continue
            a["dias_restantes"] = dias_restantes
            proximas.append(a)
        except Exception:
            pass
    emp_ids = list(set(a["empresa_id"] for a in proximas))
    if emp_ids:
        empresas_list = await db.empresas.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)
        emp_map = {e["id"]: e["nombre"] for e in empresas_list}
        for a in proximas:
            a["empresa_nombre"] = emp_map.get(a["empresa_id"], "")
    proximas.sort(key=lambda x: x.get("dias_restantes", 999))
    return proximas
