from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
from typing import Optional

from config import db
from auth import require_admin, require_authenticated, has_permission, can_access_empresa, log_auditoria
from models.schemas import AlertaCreate

router = APIRouter()


@router.get("/admin/alertas")
async def get_alertas(empresa_id: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver alertas")
    query = {}
    if empresa_id:
        if not can_access_empresa(user, empresa_id):
            return []
        query["empresa_id"] = empresa_id
    elif user.get("role") != "admin" and user.get("empresas_asignadas"):
        query["empresa_id"] = {"$in": user["empresas_asignadas"]}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
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
    doc = {"id": alerta_id, **data.dict(), "estado": "activa", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.alertas.insert_one(doc)
    await log_auditoria(user, "alertas", "crear", f"Alerta creada: {data.nombre}", alerta_id)
    doc.pop("_id", None)
    return doc

@router.put("/admin/alertas/{alerta_id}")
async def update_alerta(alerta_id: str, data: AlertaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar alertas")
    await db.alertas.update_one({"id": alerta_id}, {"$set": data.dict()})
    await log_auditoria(user, "alertas", "editar", f"Alerta editada: {data.nombre}", alerta_id)
    return {"success": True}

@router.put("/admin/alertas/{alerta_id}/estado")
async def update_alerta_estado(alerta_id: str, body: dict, user: dict = Depends(require_authenticated)):
    estado = body.get("estado", "activa")
    await db.alertas.update_one({"id": alerta_id}, {"$set": {"estado": estado}})
    await log_auditoria(user, "alertas", "cambiar_estado", f"Estado: {estado}", alerta_id)
    return {"success": True}

@router.delete("/admin/alertas/{alerta_id}")
async def delete_alerta(alerta_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "alertas.eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar alertas")
    await db.alertas.delete_one({"id": alerta_id})
    await log_auditoria(user, "alertas", "eliminar", "Alerta eliminada", alerta_id)
    return {"success": True}

@router.get("/admin/alertas/proximas")
async def get_alertas_proximas(user: dict = Depends(require_authenticated)):
    now = datetime.now(timezone.utc)
    query = {"estado": "activa"}
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        query["empresa_id"] = {"$in": user["empresas_asignadas"]}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return []
    alertas = await db.alertas.find(query, {"_id": 0}).to_list(500)
    proximas = []
    for a in alertas:
        try:
            venc = datetime.fromisoformat(a["fecha_vencimiento"].replace("Z", "+00:00")) if "T" in a["fecha_vencimiento"] else datetime.fromisoformat(a["fecha_vencimiento"] + "T00:00:00+00:00")
            dias_restantes = (venc - now).days
            notificar = a.get("notificar_dias", 30)
            if dias_restantes <= notificar:
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
