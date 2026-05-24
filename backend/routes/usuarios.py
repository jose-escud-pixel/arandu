from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List

from config import db, DEFAULT_EMPRESA_MODULOS, PERMISO_A_MODULO_EMPRESA
from auth import require_authenticated, has_permission, hash_password, log_auditoria
from models.schemas import AdminUserCreate, UserResponse

router = APIRouter()


ROLE_RANK = {"usuario": 1, "gerente": 2, "admin": 3}

def _rank(user: dict) -> int:
    return ROLE_RANK.get(user.get("role", "usuario"), 1)

def _puede_administrar_usuarios(user: dict, accion: str = "ver") -> bool:
    return user.get("role") in ("admin", "gerente") or has_permission(user, f"usuarios.{accion}")


def _logos_permitidos_admin(user: dict, requested: List[str]) -> List[str]:
    requested = list(map(str, requested or []))
    if user.get("role") == "admin":
        return requested  # admin global puede asignar cualquier logo
    permitidos = set(map(str, user.get("logos_asignados", []) or []))
    return [logo for logo in requested if logo in permitidos]  # gerente: solo sus logos


def _permisos_permitidos_admin(user: dict, requested: List[str]) -> List[str]:
    requested = list(map(str, requested or []))
    if user.get("role") in ("admin", "gerente"):
        return requested  # admin y gerente pueden asignar cualquier permiso
    disponibles = set(user.get("permisos", []) or [])
    return [permiso for permiso in requested if permiso in disponibles]


async def _filtrar_permisos_por_empresas_propias(permisos: List[str], logos_asignados: List[str]) -> List[str]:
    """Evita asignar permisos de módulos que ninguna empresa propia seleccionada tiene habilitados."""
    if not logos_asignados:
        return []
    propias = await db.empresas_propias.find(
        {"id": {"$in": list(map(str, logos_asignados))}},
        {"_id": 0, "modulos_habilitados": 1},
    ).to_list(100)
    modulos_habilitados = set()
    for ep in propias:
        modulos_habilitados.update(ep.get("modulos_habilitados") if ep.get("modulos_habilitados") is not None else DEFAULT_EMPRESA_MODULOS)
    filtrados = []
    for permiso in permisos or []:
        permiso_modulo = permiso.split(".", 1)[0]
        modulo_empresa = PERMISO_A_MODULO_EMPRESA.get(permiso_modulo)
        if modulo_empresa and modulo_empresa in modulos_habilitados:
            filtrados.append(permiso)
    return sorted(set(filtrados))


@router.get("/admin/usuarios", response_model=List[UserResponse])
async def get_usuarios(admin: dict = Depends(require_authenticated)):
    if not _puede_administrar_usuarios(admin, "ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso: usuarios.ver")
    query = {}
    actor_role = admin.get("role", "usuario")
    if actor_role == "admin":
        # Admin global: ve todos los usuarios (gerentes y usuarios de todas las empresas)
        query = {"role": {"$in": ["admin", "gerente", "usuario"]}}
    elif actor_role == "gerente":
        # Gerente: ve solo los usuarios de sus propias empresas
        logos = list(map(str, admin.get("logos_asignados", []) or []))
        query = {"role": "usuario", "logos_asignados": {"$in": logos}} if logos else {"id": "__none__"}
    else:
        # Usuario con permiso usuarios.ver: misma restricción que gerente
        logos = list(map(str, admin.get("logos_asignados", []) or []))
        query = {"role": "usuario", "logos_asignados": {"$in": logos}} if logos else {"id": "__none__"}
    users = await db.users.find(query, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(100)
    return users

@router.post("/admin/usuarios", response_model=UserResponse)
async def create_usuario(data: AdminUserCreate, admin: dict = Depends(require_authenticated)):
    if not _puede_administrar_usuarios(admin, "crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso: usuarios.crear")
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
    actor_role = admin.get("role", "usuario")
    # Roles que cada nivel puede crear
    if actor_role == "admin":
        allowed_target_roles = ["gerente", "usuario"]  # admin puede crear gerentes y usuarios
    elif actor_role == "gerente":
        allowed_target_roles = ["usuario"]  # gerente solo puede crear usuarios
    else:
        allowed_target_roles = []
    if data.role not in allowed_target_roles:
        raise HTTPException(status_code=403, detail=f"No puede crear usuarios con rol '{data.role}'")
    user_id = str(uuid.uuid4())
    logos_asignados = _logos_permitidos_admin(admin, data.logos_asignados) if data.role in ("usuario", "gerente") else []
    permisos_solicitados = _permisos_permitidos_admin(admin, data.permisos)
    permisos = await _filtrar_permisos_por_empresas_propias(permisos_solicitados, logos_asignados) if data.role == "usuario" else []
    empresa_default = data.empresa_default if data.empresa_default in logos_asignados else (logos_asignados[0] if logos_asignados else None)
    user_doc = {
        "id": user_id, "email": data.email, "name": data.name,
        "password": hash_password(data.password), "role": data.role,
        "permisos": permisos,
        "empresas_asignadas": data.empresas_asignadas if data.role == "usuario" else [],
        "logos_asignados": logos_asignados,
        "empresa_default": empresa_default,
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
async def update_usuario(user_id: str, data: AdminUserCreate, admin: dict = Depends(require_authenticated)):
    if not _puede_administrar_usuarios(admin, "editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso: usuarios.editar")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if admin.get("role") == "gerente":
        # Gerente: solo puede editar usuarios dentro de sus logos
        admin_logos = set(map(str, admin.get("logos_asignados", []) or []))
        existing_logos = set(map(str, existing.get("logos_asignados", []) or []))
        if existing.get("role") in ("admin", "gerente") or not existing_logos.intersection(admin_logos):
            raise HTTPException(status_code=403, detail="No puede editar este usuario")
        if data.role in ("admin", "gerente"):
            raise HTTPException(status_code=403, detail="No puede asignar este rol")
    if data.email != existing["email"]:
        email_taken = await db.users.find_one({"email": data.email, "id": {"$ne": user_id}})
        if email_taken:
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
    logos_asignados = _logos_permitidos_admin(admin, data.logos_asignados) if data.role in ("usuario", "gerente") else []
    permisos_solicitados = _permisos_permitidos_admin(admin, data.permisos)
    permisos = await _filtrar_permisos_por_empresas_propias(permisos_solicitados, logos_asignados) if data.role == "usuario" else []
    empresa_default = data.empresa_default if data.empresa_default in logos_asignados else (logos_asignados[0] if logos_asignados else None)
    update_fields = {
        "email": data.email, "name": data.name, "role": data.role,
        "permisos": permisos,
        "empresas_asignadas": data.empresas_asignadas if data.role == "usuario" else [],
        "logos_asignados": logos_asignados,
        "empresa_default": empresa_default,
    }
    if data.password:
        update_fields["password"] = hash_password(data.password)
    await db.users.update_one({"id": user_id}, {"$set": update_fields})
    await log_auditoria(admin, "usuarios", "editar", f"Usuario editado: {data.name} ({data.email})", user_id)
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return updated

@router.delete("/admin/usuarios/{user_id}")
async def delete_usuario(user_id: str, admin: dict = Depends(require_authenticated)):
    if not _puede_administrar_usuarios(admin, "eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso: usuarios.eliminar")
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="No puede eliminarse a si mismo")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    target_role = (existing or {}).get("role", "usuario")
    if _rank({"role": target_role}) >= _rank(admin):
        raise HTTPException(status_code=403, detail="No puede eliminar a un usuario de igual o mayor jerarquía")
    if admin.get("role") == "gerente":
        # Gerente solo puede eliminar usuarios dentro de sus logos
        admin_logos = set(map(str, admin.get("logos_asignados", []) or []))
        existing_logos = set(map(str, (existing or {}).get("logos_asignados", []) or []))
        if not existing_logos.intersection(admin_logos):
            raise HTTPException(status_code=403, detail="No puede eliminar este usuario")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await log_auditoria(admin, "usuarios", "eliminar", f"Usuario eliminado: {user_id}", user_id)
    return {"success": True}
