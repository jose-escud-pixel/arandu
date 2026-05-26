from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from config import db
from auth import require_authenticated, has_permission, log_auditoria, apply_logo_filter, is_forbidden

router = APIRouter()

USOS_PLAN_CUENTA = {"venta_contado", "venta_credito", "compra_contado", "compra_credito"}
TIPOS_PLAN_CUENTA = {"cobrar", "pagar"}

DEFAULT_PLAN_CUENTAS = [
    {"nombre": "Venta contado",  "tipo": "cobrar", "uso": "venta_contado",  "dias_vencimiento": 0,  "predeterminada": True},
    {"nombre": "Venta 30 dias",  "tipo": "cobrar", "uso": "venta_credito",  "dias_vencimiento": 30, "predeterminada": True},
    {"nombre": "Compra contado", "tipo": "pagar",  "uso": "compra_contado", "dias_vencimiento": 0,  "predeterminada": True},
    {"nombre": "Compra 30 dias", "tipo": "pagar",  "uso": "compra_credito", "dias_vencimiento": 30, "predeterminada": True},
]


class PlanCuentaCreate(BaseModel):
    logo_tipo: str = "arandujar"
    nombre: str
    tipo: str
    uso: str
    dias_vencimiento: int = 0
    predeterminada: bool = False
    activa: bool = True
    notas: Optional[str] = None


class PlanCuentaResponse(BaseModel):
    id: str
    logo_tipo: str
    nombre: str
    tipo: str
    uso: str
    dias_vencimiento: int = 0
    predeterminada: bool = False
    activa: bool = True
    notas: Optional[str] = None
    sistema: bool = False                          # True → cuenta base blindada
    usuarios_acceso_ids: List[str] = []            # vacío = acceso para todos
    created_at: str
    updated_at: Optional[str] = None


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _hoy_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def calcular_vencimiento(fecha_base: Optional[str], dias: int) -> str:
    base = (fecha_base or _hoy_iso())[:10]
    try:
        d = datetime.fromisoformat(base).date()
    except Exception:
        d = datetime.now(timezone.utc).date()
    return (d + timedelta(days=max(int(dias or 0), 0))).isoformat()


def _validar_payload(data: PlanCuentaCreate):
    if data.tipo not in TIPOS_PLAN_CUENTA:
        raise HTTPException(status_code=400, detail="Tipo de cuenta inválido")
    if data.uso not in USOS_PLAN_CUENTA:
        raise HTTPException(status_code=400, detail="Uso de cuenta inválido")
    if (data.uso.startswith("venta") and data.tipo != "cobrar") or \
       (data.uso.startswith("compra") and data.tipo != "pagar"):
        raise HTTPException(status_code=400, detail="El tipo no coincide con el uso de la cuenta")
    if int(data.dias_vencimiento or 0) < 0:
        raise HTTPException(status_code=400, detail="Los días de vencimiento no pueden ser negativos")


def _es_admin_o_gerente(user: dict) -> bool:
    return user.get("role") in ("admin", "super_admin", "gerente")


def _puede_asignar_acceso(user: dict) -> bool:
    return _es_admin_o_gerente(user) or has_permission(user, "plan_cuentas.asignar_cuentas")


def _puede_ver_cuenta(user: dict, cuenta: dict) -> bool:
    """Una cuenta es visible si:
       - es del sistema (las 4 base), o
       - el usuario es admin/gerente, o
       - usuarios_acceso_ids está vacío (acceso libre), o
       - el id del usuario está en la lista.
    """
    if cuenta.get("sistema"):
        return True
    if _es_admin_o_gerente(user):
        return True
    acceso = cuenta.get("usuarios_acceso_ids") or []
    if not acceso:          # lista vacía → todos pueden ver
        return True
    return str(user.get("id", "")) in [str(x) for x in acceso]


# ─────────────────────────────────────────────
# Inicialización de cuentas base
# ─────────────────────────────────────────────

async def ensure_plan_cuentas_default(logo_tipo: str):
    """Crea las 4 cuentas base si no existen. Marca sistema=True en las existentes que aún no lo tengan."""
    logo = logo_tipo or "arandujar"
    now = datetime.now(timezone.utc).isoformat()
    for cfg in DEFAULT_PLAN_CUENTAS:
        existente = await db.plan_cuentas.find_one(
            {"logo_tipo": logo, "uso": cfg["uso"], "nombre": cfg["nombre"]},
            {"_id": 0, "id": 1, "sistema": 1},
        )
        if existente:
            # Retrocompat: marcar como sistema si todavía no lo tiene
            if not existente.get("sistema"):
                await db.plan_cuentas.update_one(
                    {"id": existente["id"]},
                    {"$set": {"sistema": True, "predeterminada": True}},
                )
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "logo_tipo": logo,
            "nombre": cfg["nombre"],
            "tipo": cfg["tipo"],
            "uso": cfg["uso"],
            "dias_vencimiento": cfg["dias_vencimiento"],
            "predeterminada": True,
            "activa": True,
            "sistema": True,                         # ← blindada
            "usuarios_acceso_ids": [],
            "notas": "Cuenta base creada automáticamente",
            "created_at": now,
        }
        await db.plan_cuentas.insert_one(doc)


# ─────────────────────────────────────────────
# Resolver cuenta para operaciones (facturas/compras)
# ─────────────────────────────────────────────

async def resolver_plan_cuenta_operacion(
    logo_tipo: str,
    uso: str,
    cuenta_id: Optional[str] = None,
    fecha_base: Optional[str] = None,
    fecha_vencimiento: Optional[str] = None,
):
    logo = logo_tipo or "arandujar"
    if uso not in USOS_PLAN_CUENTA:
        raise HTTPException(status_code=400, detail="Uso de plan de cuenta inválido")
    await ensure_plan_cuentas_default(logo)
    query = {"logo_tipo": logo, "uso": uso, "activa": {"$ne": False}}
    cuenta = None
    if cuenta_id:
        cuenta = await db.plan_cuentas.find_one({**query, "id": cuenta_id}, {"_id": 0})
        if not cuenta:
            raise HTTPException(status_code=400, detail="La cuenta del plan seleccionada no existe o no aplica a esta operación.")
    else:
        cuenta = await db.plan_cuentas.find_one({**query, "predeterminada": True}, {"_id": 0})
        if not cuenta:
            cuenta = await db.plan_cuentas.find_one(query, {"_id": 0})
    if not cuenta:
        raise HTTPException(status_code=400, detail="No hay cuenta del plan disponible para esta operación.")
    vencimiento = fecha_vencimiento or calcular_vencimiento(fecha_base, cuenta.get("dias_vencimiento", 0))
    return cuenta, vencimiento


# ─────────────────────────────────────────────
# CRUD endpoints
# ─────────────────────────────────────────────

@router.get("/admin/plan-cuentas", response_model=List[PlanCuentaResponse])
async def get_plan_cuentas(
    logo_tipo: Optional[str] = None,
    uso: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "plan_cuentas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver plan de cuentas")
    query = {}
    logo_q = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if logo_tipo and logo_tipo != "todas":
        await ensure_plan_cuentas_default(logo_tipo)
    if uso:
        query["uso"] = uso
    cuentas = await db.plan_cuentas.find(query, {"_id": 0}).sort([("uso", 1), ("nombre", 1)]).to_list(1000)
    # Filtrar acceso: cuentas sistema siempre visibles; no-sistema según usuarios_acceso_ids
    return [c for c in cuentas if _puede_ver_cuenta(user, c)]


@router.post("/admin/plan-cuentas", response_model=PlanCuentaResponse, status_code=201)
async def create_plan_cuenta(data: PlanCuentaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "plan_cuentas.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear cuentas")
    _validar_payload(data)
    existing = await db.plan_cuentas.find_one(
        {"logo_tipo": data.logo_tipo, "nombre": data.nombre.strip()}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese nombre en la empresa activa")
    now = datetime.now(timezone.utc).isoformat()
    doc = data.dict()
    doc.update({
        "id": str(uuid.uuid4()),
        "nombre": data.nombre.strip(),
        "sistema": False,           # las creadas por usuarios nunca son del sistema
        "usuarios_acceso_ids": [],
        "created_at": now,
    })
    # Las cuentas creadas por usuarios nunca son predeterminadas
    doc["predeterminada"] = False
    await db.plan_cuentas.insert_one(doc)
    await log_auditoria(user, "plan_cuentas", "crear", f"Cuenta creada: {doc['nombre']}", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/plan-cuentas/{cuenta_id}", response_model=PlanCuentaResponse)
async def update_plan_cuenta(cuenta_id: str, data: PlanCuentaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "plan_cuentas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso para editar cuentas")
    _validar_payload(data)
    actual = await db.plan_cuentas.find_one({"id": cuenta_id}, {"_id": 0})
    if not actual:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    # Validar que días de vencimiento no supere el valor original
    if int(data.dias_vencimiento) > int(actual.get("dias_vencimiento", 9999)):
        raise HTTPException(400, detail=f"Los días de vencimiento no pueden superar el valor configurado ({actual.get('dias_vencimiento')} días). Contactá al administrador para aumentarlo.")
    dup = await db.plan_cuentas.find_one(
        {"logo_tipo": data.logo_tipo, "nombre": data.nombre.strip(), "id": {"$ne": cuenta_id}},
        {"_id": 0, "id": 1},
    )
    if dup:
        raise HTTPException(status_code=400, detail="Ya existe otra cuenta con ese nombre")

    update = data.dict()
    update["nombre"] = data.nombre.strip()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Cuentas del sistema: predeterminada siempre forzada a True, uso/tipo no cambia
    if actual.get("sistema"):
        update["predeterminada"] = True
        update["sistema"] = True
        # Preservar usuarios_acceso_ids y otros campos blindados
        update["uso"] = actual["uso"]
        update["tipo"] = actual["tipo"]
    else:
        # Los usuarios no pueden cambiar predeterminada; se preserva el valor actual
        update["predeterminada"] = actual.get("predeterminada", False)

    await db.plan_cuentas.update_one({"id": cuenta_id}, {"$set": update})
    doc = await db.plan_cuentas.find_one({"id": cuenta_id}, {"_id": 0})
    await log_auditoria(user, "plan_cuentas", "editar", f"Cuenta actualizada: {doc.get('nombre')}", cuenta_id)
    return doc


@router.delete("/admin/plan-cuentas/{cuenta_id}")
async def delete_plan_cuenta(cuenta_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "plan_cuentas.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar cuentas")
    cuenta = await db.plan_cuentas.find_one({"id": cuenta_id}, {"_id": 0, "sistema": 1, "nombre": 1})
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    if cuenta.get("sistema"):
        raise HTTPException(status_code=400, detail="Las cuentas base del sistema no se pueden eliminar.")
    used = (
        await db.facturas.find_one({"plan_cuenta_id": cuenta_id}, {"_id": 0, "numero": 1})
        or await db.compras.find_one({"plan_cuenta_id": cuenta_id}, {"_id": 0, "numero_factura": 1})
    )
    if used:
        raise HTTPException(status_code=400, detail="No se puede eliminar una cuenta con documentos asociados. Desactivala en su lugar.")
    result = await db.plan_cuentas.delete_one({"id": cuenta_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    await log_auditoria(user, "plan_cuentas", "eliminar", f"Cuenta eliminada: {cuenta_id}", cuenta_id)
    return {"ok": True}


# ─────────────────────────────────────────────
# Asignar acceso a usuarios (plan_cuentas.asignar_cuentas)
# ─────────────────────────────────────────────

@router.patch("/admin/plan-cuentas/{cuenta_id}/acceso")
async def set_acceso_cuenta(
    cuenta_id: str,
    data: dict,
    user: dict = Depends(require_authenticated),
):
    """Asigna qué usuarios restringidos pueden ver esta cuenta.
       Lista vacía = todos la ven. Solo aplica a cuentas no-sistema.
    """
    if not _puede_asignar_acceso(user):
        raise HTTPException(status_code=403, detail="Sin permiso para asignar acceso a cuentas (plan_cuentas.asignar_cuentas)")

    cuenta = await db.plan_cuentas.find_one({"id": cuenta_id}, {"_id": 0})
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    if cuenta.get("sistema"):
        raise HTTPException(status_code=400, detail="Las cuentas base del sistema son visibles para todos y no requieren asignación de acceso.")

    ids = [str(x) for x in (data.get("usuarios_acceso_ids") or []) if x]
    logo_cuenta = cuenta.get("logo_tipo", "")

    if ids:
        # Validar que los usuarios existan y pertenezcan al mismo logo
        propias = await db.empresas_propias.find({}, {"_id": 0, "id": 1, "slug": 1}).to_list(100)
        id_to_slug = {str(p["id"]): (p.get("slug") or "") for p in propias if p.get("id")}
        ids_del_slug = {i for i, s in id_to_slug.items() if s == logo_cuenta}

        candidatos = await db.users.find(
            {"id": {"$in": ids}, "role": "usuario"},
            {"_id": 0, "id": 1, "logos_asignados": 1, "name": 1},
        ).to_list(500)
        ids_validos = {str(c["id"]) for c in candidatos}
        for uid in ids:
            if uid not in ids_validos:
                raise HTTPException(status_code=400, detail=f"Usuario {uid} no encontrado o no es un usuario restringido.")
        for c in candidatos:
            logos_usuario = [str(x) for x in (c.get("logos_asignados") or [])]
            tiene_acceso = bool(ids_del_slug & set(logos_usuario)) or logo_cuenta in logos_usuario
            if logo_cuenta and not tiene_acceso:
                raise HTTPException(
                    status_code=400,
                    detail=f"El usuario '{c.get('name')}' no pertenece a la empresa de esta cuenta. Solo se pueden asignar usuarios de la misma empresa.",
                )

    await db.plan_cuentas.update_one(
        {"id": cuenta_id},
        {"$set": {
            "usuarios_acceso_ids": ids,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.plan_cuentas.find_one({"id": cuenta_id}, {"_id": 0})
    await log_auditoria(user, "plan_cuentas", "editar", f"Acceso actualizado en cuenta: {cuenta.get('nombre')} → {len(ids)} usuario(s)", cuenta_id)
    return updated
