from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from config import db
from auth import (
    get_current_user, require_admin, require_authenticated,
    hash_password, verify_password, create_token,
    has_permission, can_access_empresa, log_auditoria
)
from models.schemas import (
    UserLogin, UserResponse, TokenResponse, AdminUserCreate,
    ProfileUpdate, PasswordChange
)
from pydantic import BaseModel
from config import PERMISOS_DISPONIBLES

router = APIRouter()


@router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if user.get("status") == "disabled":
        raise HTTPException(status_code=403, detail="Tu cuenta está deshabilitada. Contactá al administrador.")
    # Sesión única: generamos un session_id nuevo y lo guardamos en el usuario.
    # Cualquier token previo deja de ser válido.
    session_id = str(uuid.uuid4())
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "active_session_id": session_id,
            "last_login_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    token = create_token(user["id"], session_id)
    await log_auditoria(user, "auth", "login", f"Inicio de sesion: {user['email']}", user["id"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"], email=user["email"], name=user["name"],
            role=user.get("role", "user"), avatar=user.get("avatar"),
            permisos=user.get("permisos", []),
            empresas_asignadas=user.get("empresas_asignadas", []),
            logos_asignados=user.get("logos_asignados", []),
            empresa_default=user.get("empresa_default"),
            created_at=user["created_at"]
        )
    )

@router.post("/auth/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Cierra la sesión actual: limpia active_session_id en el usuario."""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"active_session_id": ""}}
    )
    await log_auditoria(current_user, "auth", "logout", f"Cierre de sesion: {current_user['email']}", current_user["id"])
    return {"success": True}


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"], email=current_user["email"], name=current_user["name"],
        role=current_user.get("role", "user"), avatar=current_user.get("avatar"),
        permisos=current_user.get("permisos", []),
        empresas_asignadas=current_user.get("empresas_asignadas", []),
        logos_asignados=current_user.get("logos_asignados", []),
        empresa_default=current_user.get("empresa_default"),
        created_at=current_user["created_at"]
    )

class EmpresaDefaultUpdate(BaseModel):
    empresa_id: str

@router.put("/auth/empresa-default")
async def set_empresa_default(data: EmpresaDefaultUpdate, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"empresa_default": data.empresa_id}}
    )
    return {"success": True, "empresa_default": data.empresa_id}

@router.put("/auth/profile", response_model=UserResponse)
async def update_profile(data: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    update_fields = {}
    if data.name:
        update_fields["name"] = data.name
    if data.email and data.email != current_user["email"]:
        existing = await db.users.find_one({"email": data.email, "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
        update_fields["email"] = data.email
    if not update_fields:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")
    await db.users.update_one({"id": current_user["id"]}, {"$set": update_fields})
    updated = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    return updated

@router.put("/auth/password")
async def change_password(data: PasswordChange, current_user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, current_user["password"]):
        raise HTTPException(status_code=400, detail="Contrasena actual incorrecta")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="La nueva contrasena debe tener al menos 6 caracteres")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"password": hash_password(data.new_password)}})
    return {"success": True, "message": "Contrasena actualizada correctamente"}

class AvatarUpdate(BaseModel):
    avatar: str

@router.put("/auth/avatar")
async def update_avatar(data: AvatarUpdate, current_user: dict = Depends(get_current_user)):
    if len(data.avatar) > 700000:
        raise HTTPException(status_code=400, detail="La imagen es demasiado grande. Maximo 500KB")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"avatar": data.avatar}})
    return {"success": True}

@router.get("/admin/permisos-disponibles")
async def get_permisos_disponibles(admin: dict = Depends(require_admin)):
    return PERMISOS_DISPONIBLES
