from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List

from config import db
from auth import require_admin, require_authenticated, has_permission, can_access_empresa, hash_password, log_auditoria
from models.schemas import AdminUserCreate, UserResponse

router = APIRouter()


@router.get("/admin/usuarios", response_model=List[UserResponse])
async def get_usuarios(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(100)
    return users

@router.post("/admin/usuarios", response_model=UserResponse)
async def create_usuario(data: AdminUserCreate, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
    if data.role not in ["admin", "usuario"]:
        raise HTTPException(status_code=400, detail="Rol invalido. Use: admin o usuario")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id, "email": data.email, "name": data.name,
        "password": hash_password(data.password), "role": data.role,
        "permisos": data.permisos if data.role == "usuario" else [],
        "empresas_asignadas": data.empresas_asignadas if data.role == "usuario" else [],
        "logos_asignados": data.logos_asignados if data.role == "usuario" else [],
        "empresa_default": data.empresa_default or None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    await log_auditoria(admin, "usuarios", "crear", f"Usuario creado: {data.name} ({data.email}) - Rol: {data.role}", user_id)
    return UserResponse(
        id=user_id, email=data.email, name=data.name, role=data.role,
        permisos=user_doc["permisos"], empresas_asignadas=user_doc["empresas_asignadas"],
        logos_asignados=user_doc["logos_asignados"],
        empresa_default=user_doc.get("empresa_default"),
        created_at=user_doc["created_at"]
    )

@router.put("/admin/usuarios/{user_id}", response_model=UserResponse)
async def update_usuario(user_id: str, data: AdminUserCreate, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if data.email != existing["email"]:
        email_taken = await db.users.find_one({"email": data.email, "id": {"$ne": user_id}})
        if email_taken:
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
    update_fields = {
        "email": data.email, "name": data.name, "role": data.role,
        "permisos": data.permisos if data.role == "usuario" else [],
        "empresas_asignadas": data.empresas_asignadas if data.role == "usuario" else [],
        "logos_asignados": data.logos_asignados if data.role == "usuario" else [],
        "empresa_default": data.empresa_default or None,
    }
    if data.password:
        update_fields["password"] = hash_password(data.password)
    await db.users.update_one({"id": user_id}, {"$set": update_fields})
    await log_auditoria(admin, "usuarios", "editar", f"Usuario editado: {data.name} ({data.email})", user_id)
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return updated

@router.delete("/admin/usuarios/{user_id}")
async def delete_usuario(user_id: str, admin: dict = Depends(require_admin)):
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="No puede eliminarse a si mismo")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await log_auditoria(admin, "usuarios", "eliminar", f"Usuario eliminado: {user_id}", user_id)
    return {"success": True}
