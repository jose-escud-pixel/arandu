from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone
import jwt
import bcrypt
import uuid

from config import db, JWT_SECRET, JWT_ALGORITHM

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc).timestamp() + 86400 * 7
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalido")


async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado - Se requiere rol de administrador")
    return current_user

async def require_authenticated(current_user: dict = Depends(get_current_user)):
    return current_user


def has_permission(user: dict, permiso: str) -> bool:
    if user.get("role") == "admin":
        return True
    return permiso in user.get("permisos", [])

def can_access_empresa(user: dict, empresa_id: str) -> bool:
    if user.get("role") == "admin":
        return True
    asignadas = user.get("empresas_asignadas", [])
    if not asignadas:
        return False
    return empresa_id in asignadas

def require_permiso(permiso: str):
    async def checker(current_user: dict = Depends(get_current_user)):
        if not has_permission(current_user, permiso):
            raise HTTPException(status_code=403, detail=f"No tiene permiso: {permiso}")
        return current_user
    return checker


async def log_historial(activo_id: str, usuario: dict, accion: str, detalle: str = ""):
    await db.historial.insert_one({
        "id": str(uuid.uuid4()),
        "activo_id": activo_id,
        "usuario_id": usuario["id"],
        "usuario_nombre": usuario.get("name", ""),
        "accion": accion,
        "detalle": detalle,
        "fecha": datetime.now(timezone.utc).isoformat()
    })

async def log_auditoria(usuario: dict, modulo: str, accion: str, detalle: str = "", entidad_id: str = ""):
    await db.auditoria.insert_one({
        "id": str(uuid.uuid4()),
        "usuario_id": usuario["id"],
        "usuario_nombre": usuario.get("name", ""),
        "modulo": modulo,
        "accion": accion,
        "detalle": detalle,
        "entidad_id": entidad_id,
        "fecha": datetime.now(timezone.utc).isoformat()
    })


async def get_logos_acceso(user: dict):
    """
    Returns the logo_tipo slugs the user can access.
    - Admin → None  (no restriction, sees everything)
    - User with logos_asignados → list of slugs (e.g. ["arandu", "jar"])
    - User with NO logos_asignados → []  (sees nothing — must have at least one assigned)
    """
    if user.get("role") == "admin":
        return None
    logos_ids = user.get("logos_asignados", [])
    if not logos_ids:
        return []
    propias = await db.empresas_propias.find({"id": {"$in": logos_ids}}, {"_id": 0, "slug": 1}).to_list(100)
    return [p["slug"] for p in propias]


async def apply_logo_filter(query: dict, user: dict, logo_tipo: str = None) -> dict:
    """
    Aplica filtro por logo_tipo (empresa propia activa) a una query mongo.
    Reglas:
      - Si el usuario pasa logo_tipo específico Y tiene acceso: filtra solo por ese.
      - Si el usuario pasa logo_tipo="todas" o None:
          * Admin → sin restricción
          * Usuario normal → intersección con sus logos_asignados
      - Si pasa logo_tipo al que no tiene acceso → devuelve una query imposible.
    Devuelve la query mutada (se agrega la clave "logo_tipo" o "__forbid__").
    """
    logos_acceso = await get_logos_acceso(user)  # None | [] | [slugs]

    # Usuario sin ningún logo asignado
    if logos_acceso == []:
        query["__forbid__"] = True  # señaliza "no retornar nada"
        return query

    effective = logo_tipo if logo_tipo and logo_tipo != "todas" else None

    if effective:
        # Usuario pide un logo específico
        if logos_acceso is not None and effective not in logos_acceso:
            query["__forbid__"] = True
            return query
        query["logo_tipo"] = effective
    else:
        # Sin filtro específico → mostrar todos los accesibles
        if logos_acceso is not None:
            query["logo_tipo"] = {"$in": logos_acceso}
        # admin sin filtro → no agregamos nada
    return query


def is_forbidden(query: dict) -> bool:
    """True si la query fue marcada como 'no accesible'."""
    return query.pop("__forbid__", False) if "__forbid__" in query else False
