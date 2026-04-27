from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from datetime import datetime, timezone
import uuid
from typing import List, Optional
import base64

from config import db
from auth import require_admin, require_authenticated, has_permission, can_access_empresa, log_auditoria
from models.schemas import (
    ContactMessage, ContactMessageResponse,
    EmpresaCreate, EmpresaResponse,
    EmpresaPropiaCreate, EmpresaPropiaResponse
)

router = APIRouter()


# ================== CONTACT ==================

@router.post("/contact", response_model=ContactMessageResponse)
async def submit_contact(data: ContactMessage):
    message_id = str(uuid.uuid4())
    message_doc = {
        "id": message_id, "name": data.name, "email": data.email,
        "phone": data.phone, "subject": data.subject, "message": data.message,
        "read": False, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.contact_messages.insert_one(message_doc)
    return ContactMessageResponse(**{k: v for k, v in message_doc.items() if k != "_id"})

@router.get("/admin/messages", response_model=List[ContactMessageResponse])
async def get_messages(admin: dict = Depends(require_admin)):
    messages = await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return messages

@router.get("/admin/messages/unread-count")
async def get_unread_count(admin: dict = Depends(require_admin)):
    count = await db.contact_messages.count_documents({"read": False})
    return {"unread_count": count}

@router.put("/admin/messages/{message_id}/read")
async def mark_as_read(message_id: str, admin: dict = Depends(require_admin)):
    result = await db.contact_messages.update_one({"id": message_id}, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    return {"success": True}

@router.delete("/admin/messages/{message_id}")
async def delete_message(message_id: str, admin: dict = Depends(require_admin)):
    result = await db.contact_messages.delete_one({"id": message_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    return {"success": True}


# ================== EMPRESAS PROPIAS ==================

@router.get("/admin/empresas-propias", response_model=List[EmpresaPropiaResponse])
async def get_empresas_propias(user: dict = Depends(require_authenticated)):
    propias = await db.empresas_propias.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)

    # Auto-seed las 3 empresas por defecto si la colección está vacía
    if not propias:
        defaults = [
            {"id": str(uuid.uuid4()), "nombre": "Arandu",    "slug": "arandu",    "color": "#3B82F6", "tema": "oscuro-azul", "logo_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "nombre": "JAR",       "slug": "jar",       "color": "#10B981", "tema": "oscuro-azul", "logo_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "nombre": "AranduJAR", "slug": "arandujar", "color": "#8B5CF6", "tema": "oscuro-azul", "logo_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.empresas_propias.insert_many(defaults)
        propias = await db.empresas_propias.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)

    return propias

@router.post("/admin/empresas-propias", response_model=EmpresaPropiaResponse)
async def create_empresa_propia(data: EmpresaPropiaCreate, admin: dict = Depends(require_admin)):
    slug = data.slug or data.nombre.lower().replace(" ", "-")
    existing = await db.empresas_propias.find_one({"slug": slug})
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe una empresa con slug '{slug}'")
    doc = {
        "id": str(uuid.uuid4()),
        "nombre": data.nombre,
        "slug": slug,
        "logo_url": data.logo_url,
        "color": data.color or "#3b82f6",
        "tema": data.tema or "oscuro-azul",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.empresas_propias.insert_one(doc)
    await log_auditoria(admin, "empresas_propias", "crear", f"Empresa propia creada: {data.nombre}", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/admin/empresas-propias/{empresa_id}", response_model=EmpresaPropiaResponse)
async def update_empresa_propia(empresa_id: str, data: EmpresaPropiaCreate, admin: dict = Depends(require_admin)):
    current = await db.empresas_propias.find_one({"id": empresa_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Empresa propia no encontrada")
    slug = data.slug or data.nombre.lower().replace(" ", "-")
    existing = await db.empresas_propias.find_one({"slug": slug, "id": {"$ne": empresa_id}})
    if existing:
        raise HTTPException(status_code=400, detail=f"El slug '{slug}' ya está en uso")
    update_fields = {
        "nombre": data.nombre,
        "slug": slug,
        "color": data.color or "#3b82f6",
        "tema": data.tema or "oscuro-azul",
    }
    if data.logo_url is not None:
        update_fields["logo_url"] = data.logo_url
    result = await db.empresas_propias.update_one(
        {"id": empresa_id},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Empresa propia no encontrada")
    doc = await db.empresas_propias.find_one({"id": empresa_id}, {"_id": 0})
    return doc

@router.post("/admin/empresas-propias/{empresa_id}/logo")
async def upload_logo_empresa_propia(empresa_id: str, file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    logo_url = f"data:{file.content_type};base64,{b64}"
    result = await db.empresas_propias.update_one({"id": empresa_id}, {"$set": {"logo_url": logo_url}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Empresa propia no encontrada")
    return {"logo_url": logo_url}

@router.delete("/admin/empresas-propias/{empresa_id}")
async def delete_empresa_propia(empresa_id: str, admin: dict = Depends(require_admin)):
    result = await db.empresas_propias.delete_one({"id": empresa_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Empresa propia no encontrada")
    await log_auditoria(admin, "empresas_propias", "eliminar", f"Empresa propia eliminada: {empresa_id}", empresa_id)
    return {"success": True}


# ================== EMPRESAS ==================

@router.post("/admin/empresas", response_model=EmpresaResponse)
async def create_empresa(data: EmpresaCreate, admin: dict = Depends(require_authenticated)):
    if not has_permission(admin, "empresas.crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso para crear empresas")
    empresa_id = str(uuid.uuid4())
    empresa_doc = {
        "id": empresa_id, "nombre": data.nombre,
        "razon_social": data.razon_social, "ruc": data.ruc,
        "direccion": data.direccion, "telefono": data.telefono, "email": data.email,
        "contacto": data.contacto,
        "aplica_retencion": data.aplica_retencion,
        "porcentaje_retencion": data.porcentaje_retencion,
        "notas": data.notas,
        "logo_tipo": data.logo_tipo or "arandujar",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.empresas.insert_one(empresa_doc)
    await log_auditoria(admin, "empresas", "crear", f"Empresa creada: {data.nombre}", empresa_id)
    return EmpresaResponse(**{k: v for k, v in empresa_doc.items() if k != "_id"})

@router.get("/admin/empresas", response_model=List[EmpresaResponse])
async def get_empresas(search: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empresas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver empresas")
    query = {}
    if search:
        query = {"$or": [
            {"nombre": {"$regex": search, "$options": "i"}},
            {"ruc": {"$regex": search, "$options": "i"}}
        ]}
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        emp_filter = {"id": {"$in": user["empresas_asignadas"]}}
        if query:
            query = {"$and": [emp_filter, query]}
        else:
            query = emp_filter
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return []
    empresas = await db.empresas.find(query, {"_id": 0}).sort("nombre", 1).to_list(500)
    return empresas

@router.get("/admin/empresas/{empresa_id}", response_model=EmpresaResponse)
async def get_empresa(empresa_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empresas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver empresas")
    if not can_access_empresa(user, empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": empresa_id}, {"_id": 0})
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return empresa

@router.put("/admin/empresas/{empresa_id}", response_model=EmpresaResponse)
async def update_empresa(empresa_id: str, data: EmpresaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empresas.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar empresas")
    if not can_access_empresa(user, empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    result = await db.empresas.update_one(
        {"id": empresa_id},
        {"$set": {"nombre": data.nombre, "razon_social": data.razon_social, "ruc": data.ruc,
                  "direccion": data.direccion, "telefono": data.telefono, "email": data.email,
                  "contacto": data.contacto, "aplica_retencion": data.aplica_retencion,
                  "porcentaje_retencion": data.porcentaje_retencion, "notas": data.notas,
                  "logo_tipo": data.logo_tipo or "arandujar"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    empresa = await db.empresas.find_one({"id": empresa_id}, {"_id": 0})
    return empresa

@router.delete("/admin/empresas/{empresa_id}")
async def delete_empresa(empresa_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empresas.eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar empresas")
    if not can_access_empresa(user, empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": empresa_id}, {"_id": 0, "nombre": 1})
    result = await db.empresas.delete_one({"id": empresa_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    await log_auditoria(user, "empresas", "eliminar", f"Empresa eliminada: {empresa.get('nombre', empresa_id) if empresa else empresa_id}", empresa_id)
    return {"success": True}
