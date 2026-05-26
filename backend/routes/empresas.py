from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from datetime import datetime, timezone
import uuid
import re
from typing import List, Optional
import base64

from config import db, DEFAULT_EMPRESA_MODULOS, EMPRESA_MODULOS_DISPONIBLES, EMPRESA_MODULOS_OBLIGATORIOS
from auth import require_admin, require_authenticated, has_permission, can_access_empresa, get_logos_acceso, log_auditoria, apply_empresa_cliente_filter
from routes.cuentas_bancarias import ensure_cuenta_predeterminada
from routes.plan_cuentas import ensure_plan_cuentas_default
from models.schemas import (
    ContactMessage, ContactMessageResponse,
    EmpresaCreate, EmpresaResponse,
    EmpresaPropiaCreate, EmpresaPropiaResponse
)

router = APIRouter()


DATOS_FACTURACION_DEFAULT = {
    "arandu": {
        "razon_social": "Arandu Informática",
        "direccion": "De la Conquista 1132 c/ Isabel la Católica, Barrio Sajonia, Asunción, Paraguay",
        "telefono": "021-421330 / 0981 500 282",
        "email": "info@aranduinformatica.net",
    },
    "jar": {
        "razon_social": "JAR Informática",
        "direccion": "De la Conquista 1132 c/ Isabel la Católica, Barrio Sajonia, Asunción, Paraguay",
        "telefono": "021-421330 / 0981 500 282",
        "email": "info@aranduinformatica.net",
    },
    "arandujar": {
        "razon_social": "AranduJAR Informática",
        "direccion": "De la Conquista 1132 c/ Isabel la Católica, Barrio Sajonia, Asunción, Paraguay",
        "telefono": "021-421330 / 0981 500 282",
        "email": "info@aranduinformatica.net",
    },
}


def _datos_facturacion_fields(data: EmpresaPropiaCreate) -> dict:
    return {
        "razon_social": data.razon_social,
        "ruc": data.ruc,
        "direccion": data.direccion,
        "telefono": data.telefono,
        "email": data.email,
    }


async def _ensure_datos_facturacion_empresa_propia(empresa: dict) -> dict:
    slug = (empresa.get("slug") or "").lower()
    defaults = DATOS_FACTURACION_DEFAULT.get(slug, {})
    updates = {}
    if defaults and not empresa.get("datos_facturacion_migrados"):
        for key, value in defaults.items():
            if value and not empresa.get(key):
                updates[key] = value
                empresa[key] = value
        updates["datos_facturacion_migrados"] = True
        empresa["datos_facturacion_migrados"] = True
    for key in ("razon_social", "ruc", "direccion", "telefono", "email"):
        empresa.setdefault(key, None)
    if updates and empresa.get("id"):
        await db.empresas_propias.update_one({"id": empresa["id"]}, {"$set": updates})
    return empresa


def _normalizar_modulos(modulos: Optional[List[str]]) -> List[str]:
    validos = set(EMPRESA_MODULOS_DISPONIBLES.keys())
    if modulos is None:
        return list(DEFAULT_EMPRESA_MODULOS)
    legacy_aliases = {
        "ventas": ["ventas_base", "presupuestos", "ingresos_varios"],
        "facturas": ["ventas_base"],
        "recibos": ["ventas_base"],
        "notas_credito": ["ventas_base"],
        "egresos": ["egresos_base", "proveedores", "sueldos", "balance"],
        "compras": ["egresos_base"],
        "gastos": ["egresos_base"],
        "pagos_proveedores": ["proveedores"],
    }
    expandidos = []
    for modulo in modulos:
        expandidos.extend(legacy_aliases.get(modulo, [modulo]))
    normalizados = list(EMPRESA_MODULOS_OBLIGATORIOS)
    normalizados.extend([m for m in expandidos if m in validos])
    return list(dict.fromkeys(normalizados))


async def _require_manage_empresa_propia(empresa_id: str, user: dict) -> dict:
    empresa = await db.empresas_propias.find_one({"id": empresa_id}, {"_id": 0})
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa propia no encontrada")
    if user.get("role") == "admin":
        return empresa
    if user.get("role") == "gerente" and str(empresa_id) in set(map(str, user.get("logos_asignados", []) or [])):
        return empresa
    raise HTTPException(status_code=403, detail="No tenés permiso para administrar esta empresa")


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

    # Defaults con colores y temas correctos por empresa
    DEFAULT_CONFIG = {
        "arandu":    {"color": "#2563eb", "tema": "claro-azul"},
        "jar":       {"color": "#dc2626", "tema": "claro-rojo"},
        "arandujar": {"color": "#1e3a8a", "tema": "oscuro-azul"},
    }

    # Auto-seed las 3 empresas por defecto si la colección está vacía
    if not propias:
        defaults = [
            {"id": str(uuid.uuid4()), "nombre": "Arandu",    "slug": "arandu",    "color": DEFAULT_CONFIG["arandu"]["color"],    "tema": DEFAULT_CONFIG["arandu"]["tema"],    "logo_url": None, **DATOS_FACTURACION_DEFAULT.get("arandu", {}), "ruc": None, "modulos_habilitados": list(DEFAULT_EMPRESA_MODULOS), "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "nombre": "JAR",       "slug": "jar",       "color": DEFAULT_CONFIG["jar"]["color"],       "tema": DEFAULT_CONFIG["jar"]["tema"],       "logo_url": None, **DATOS_FACTURACION_DEFAULT.get("jar", {}), "ruc": None, "modulos_habilitados": list(DEFAULT_EMPRESA_MODULOS), "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "nombre": "AranduJAR", "slug": "arandujar", "color": DEFAULT_CONFIG["arandujar"]["color"], "tema": DEFAULT_CONFIG["arandujar"]["tema"], "logo_url": None, **DATOS_FACTURACION_DEFAULT.get("arandujar", {}), "ruc": None, "modulos_habilitados": list(DEFAULT_EMPRESA_MODULOS), "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.empresas_propias.insert_many(defaults)
        propias = await db.empresas_propias.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)
    else:
        # Migración: asignar tema/color por defecto a empresas conocidas si falta
        for p in propias:
            slug = (p.get("slug") or "").lower()
            if slug in DEFAULT_CONFIG:
                updates = {}
                if not p.get("tema"):
                    updates["tema"] = DEFAULT_CONFIG[slug]["tema"]
                    p["tema"] = DEFAULT_CONFIG[slug]["tema"]
                if not p.get("color") or p.get("color") in ("#3b82f6", "#3B82F6", "#10B981", "#8B5CF6"):
                    updates["color"] = DEFAULT_CONFIG[slug]["color"]
                    p["color"] = DEFAULT_CONFIG[slug]["color"]
                if updates:
                    await db.empresas_propias.update_one({"id": p["id"]}, {"$set": updates})
            elif not p.get("tema"):
                # empresas propias custom → dejar default oscuro-azul
                await db.empresas_propias.update_one({"id": p["id"]}, {"$set": {"tema": "oscuro-azul"}})
                p["tema"] = "oscuro-azul"
            if "modulos_habilitados" not in p or p.get("modulos_habilitados") is None:
                p["modulos_habilitados"] = list(DEFAULT_EMPRESA_MODULOS)
                await db.empresas_propias.update_one(
                    {"id": p["id"]},
                    {"$set": {"modulos_habilitados": p["modulos_habilitados"]}}
                )

    for propia in propias:
        await _ensure_datos_facturacion_empresa_propia(propia)
        if propia.get("slug"):
            await ensure_plan_cuentas_default(propia.get("slug"))

    if user.get("role") != "admin":
        asignadas = set(map(str, user.get("logos_asignados", []) or []))
        propias = [p for p in propias if str(p.get("id")) in asignadas]

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
        **_datos_facturacion_fields(data),
        "logo_url": data.logo_url,
        "color": data.color or "#3b82f6",
        "tema": data.tema or "oscuro-azul",
        "modulos_habilitados": _normalizar_modulos(data.modulos_habilitados),
        "datos_facturacion_migrados": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.empresas_propias.insert_one(doc)
    await ensure_cuenta_predeterminada(slug, data.nombre, "PYG")
    await ensure_plan_cuentas_default(slug)
    await log_auditoria(admin, "empresas_propias", "crear", f"Empresa propia creada: {data.nombre}", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/admin/empresas-propias/{empresa_id}", response_model=EmpresaPropiaResponse)
async def update_empresa_propia(empresa_id: str, data: EmpresaPropiaCreate, admin: dict = Depends(require_authenticated)):
    await _require_manage_empresa_propia(empresa_id, admin)
    slug = data.slug or data.nombre.lower().replace(" ", "-")
    existing = await db.empresas_propias.find_one({"slug": slug, "id": {"$ne": empresa_id}})
    if existing:
        raise HTTPException(status_code=400, detail=f"El slug '{slug}' ya está en uso")
    update_fields = {
        "nombre": data.nombre,
        "slug": slug,
        **_datos_facturacion_fields(data),
        "color": data.color or "#3b82f6",
        "tema": data.tema or "oscuro-azul",
        "modulos_habilitados": _normalizar_modulos(data.modulos_habilitados),
        "datos_facturacion_migrados": True,
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
    await log_auditoria(admin, "empresas_propias", "editar", f"Empresa propia actualizada: {doc.get('nombre', empresa_id)}", empresa_id)
    return doc

@router.post("/admin/empresas-propias/{empresa_id}/logo")
async def upload_logo_empresa_propia(empresa_id: str, file: UploadFile = File(...), admin: dict = Depends(require_authenticated)):
    await _require_manage_empresa_propia(empresa_id, admin)
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    logo_url = f"data:{file.content_type};base64,{b64}"
    result = await db.empresas_propias.update_one({"id": empresa_id}, {"$set": {"logo_url": logo_url}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Empresa propia no encontrada")
    await log_auditoria(admin, "empresas_propias", "subir_logo", f"Logo actualizado para empresa propia: {empresa_id}", empresa_id)
    return {"logo_url": logo_url}

@router.delete("/admin/empresas-propias/{empresa_id}")
async def delete_empresa_propia(empresa_id: str, admin: dict = Depends(require_admin)):
    result = await db.empresas_propias.delete_one({"id": empresa_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Empresa propia no encontrada")
    await log_auditoria(admin, "empresas_propias", "eliminar", f"Empresa propia eliminada: {empresa_id}", empresa_id)
    return {"success": True}


# ================== EMPRESAS ==================

def _norm_texto(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _norm_ruc(val: Optional[str]) -> Optional[str]:
    s = _norm_texto(val)
    if not s:
        return None
    return re.sub(r"[\s.\-]", "", s).upper()


async def _validar_empresa_sin_duplicados(
    data: EmpresaCreate,
    ignore_id: Optional[str] = None,
) -> None:
    """Evita clientes duplicados por nombre, razón social o RUC/cédula."""
    nombre = _norm_texto(data.nombre)
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre comercial es obligatorio")

    def _base_query():
        q = {}
        if ignore_id:
            q["id"] = {"$ne": ignore_id}
        return q

    existente = await db.empresas.find_one(
        {**_base_query(), "nombre": {"$regex": f"^{re.escape(nombre)}$", "$options": "i"}},
        {"_id": 0, "id": 1, "nombre": 1},
    )
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un cliente con el nombre comercial «{existente.get('nombre', nombre)}»",
        )

    razon = _norm_texto(data.razon_social)
    if razon:
        cursor = db.empresas.find({**_base_query(), "razon_social": {"$exists": True, "$nin": [None, ""]}}, {"_id": 0, "razon_social": 1})
        async for doc in cursor:
            if doc.get("razon_social") and doc["razon_social"].strip().lower() == razon.lower():
                raise HTTPException(
                    status_code=409,
                    detail=f"Ya existe un cliente con la razón social «{doc['razon_social']}»",
                )

    ruc_norm = _norm_ruc(data.ruc)
    if ruc_norm:
        cursor = db.empresas.find({**_base_query(), "ruc": {"$exists": True, "$nin": [None, ""]}}, {"_id": 0, "ruc": 1})
        async for doc in cursor:
            if _norm_ruc(doc.get("ruc")) == ruc_norm:
                raise HTTPException(
                    status_code=409,
                    detail=f"Ya existe un cliente con el RUC/cédula «{doc.get('ruc')}»",
                )


async def _count_ventas_activas_cliente(empresa_id: str) -> int:
    """Facturas emitidas no anuladas vinculadas al cliente."""
    return await db.facturas.count_documents({
        "empresa_id": empresa_id,
        "tipo": "emitida",
        "estado": {"$ne": "anulada"},
        "eliminada": {"$ne": True},
    })


def _parse_umbral_opcional(val) -> Optional[int]:
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _empresa_fields_from_create(data: EmpresaCreate) -> dict:
    """Campos persistidos de un cliente (empresa)."""
    return {
        "nombre": data.nombre,
        "razon_social": data.razon_social,
        "ruc": data.ruc,
        "direccion": data.direccion,
        "telefono": data.telefono,
        "email": data.email,
        "contacto": data.contacto,
        "aplica_retencion": data.aplica_retencion,
        "porcentaje_retencion": data.porcentaje_retencion if data.aplica_retencion else None,
        "notas": data.notas,
        "logo_tipo": data.logo_tipo or "arandujar",
        "personeria": data.personeria or "fisica",
        "fecha_nacimiento": data.fecha_nacimiento or None,
        "nacionalidad": data.nacionalidad,
        "pais": data.pais,
        "ciudad": data.ciudad,
        "municipio": data.municipio,
        "con_inventario_tecnico": data.con_inventario_tecnico,
        "cumpleanos_amarillo_dias": _parse_umbral_opcional(data.cumpleanos_amarillo_dias),
        "cumpleanos_urgente_dias": _parse_umbral_opcional(data.cumpleanos_urgente_dias),
    }


@router.post("/admin/empresas", response_model=EmpresaResponse)
async def create_empresa(data: EmpresaCreate, admin: dict = Depends(require_authenticated)):
    if not has_permission(admin, "empresas.crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso para crear empresas")
    await _validar_empresa_sin_duplicados(data)
    empresa_id = str(uuid.uuid4())
    empresa_doc = {
        "id": empresa_id,
        **_empresa_fields_from_create(data),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.empresas.insert_one(empresa_doc)
    await log_auditoria(admin, "empresas", "crear", f"Empresa creada: {data.nombre}", empresa_id)
    return EmpresaResponse(**{k: v for k, v in empresa_doc.items() if k != "_id"})

@router.get("/admin/empresas", response_model=List[EmpresaResponse])
async def get_empresas(search: Optional[str] = None, logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empresas.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver empresas")
    query = {}
    if search:
        query = {"$or": [
            {"nombre": {"$regex": search, "$options": "i"}},
            {"ruc": {"$regex": search, "$options": "i"}}
        ]}
    # Filtro estricto por empresa propia activa (si el usuario tiene acceso)
    from auth import apply_logo_filter, is_forbidden
    logo_q = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    if logo_q:
        query = {"$and": [logo_q, query]} if query else logo_q
    if not apply_empresa_cliente_filter(query, user):
        return []
    empresas = await db.empresas.find(query, {"_id": 0}).sort("nombre", 1).to_list(500)
    for e in empresas:
        if not e.get("created_at"):
            e["created_at"] = datetime.now(timezone.utc).isoformat()
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
    if not empresa.get("created_at"):
        empresa["created_at"] = datetime.now(timezone.utc).isoformat()
    empresa["ventas_activas_count"] = await _count_ventas_activas_cliente(empresa_id)
    return empresa

@router.put("/admin/empresas/{empresa_id}", response_model=EmpresaResponse)
async def update_empresa(empresa_id: str, data: EmpresaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empresas.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar empresas")
    if not can_access_empresa(user, empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    existing = await db.empresas.find_one({"id": empresa_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    ventas_activas = await _count_ventas_activas_cliente(empresa_id)
    # Sin ventas activas (anuladas no cuentan): se puede completar o corregir razón social y RUC
    if ventas_activas > 0:
        razon_social = existing.get("razon_social")
        ruc = existing.get("ruc")
    else:
        razon_social = (data.razon_social or "").strip() or None
        ruc = (data.ruc or "").strip() or None

    check_payload = data.model_copy(update={"razon_social": razon_social, "ruc": ruc})
    await _validar_empresa_sin_duplicados(check_payload, ignore_id=empresa_id)

    update_fields = {
        "nombre": data.nombre,
        "razon_social": razon_social,
        "ruc": ruc,
        "direccion": data.direccion,
        "telefono": data.telefono,
        "email": data.email,
        "contacto": data.contacto,
        "aplica_retencion": data.aplica_retencion,
        "porcentaje_retencion": data.porcentaje_retencion if data.aplica_retencion else None,
        "notas": data.notas,
        "logo_tipo": data.logo_tipo or "arandujar",
        "personeria": data.personeria or "fisica",
        "fecha_nacimiento": data.fecha_nacimiento or None,
        "nacionalidad": data.nacionalidad,
        "pais": data.pais,
        "ciudad": data.ciudad,
        "municipio": data.municipio,
        "con_inventario_tecnico": data.con_inventario_tecnico,
        "cumpleanos_amarillo_dias": _parse_umbral_opcional(data.cumpleanos_amarillo_dias),
        "cumpleanos_urgente_dias": _parse_umbral_opcional(data.cumpleanos_urgente_dias),
    }
    if not existing.get("created_at"):
        update_fields["created_at"] = datetime.now(timezone.utc).isoformat()

    await db.empresas.update_one({"id": empresa_id}, {"$set": update_fields})

    if update_fields.get("fecha_nacimiento"):
        try:
            from routes.alertas import sync_alertas_cumpleanos
            await sync_alertas_cumpleanos(update_fields.get("logo_tipo"))
        except Exception:
            pass

    # Solo propagar nombre comercial; razón social y RUC quedan fijos en facturas históricas
    fac_set = {"empresa_nombre": data.nombre}
    if ventas_activas == 0:
        fac_set["razon_social"] = razon_social
        fac_set["ruc"] = ruc
    await db.facturas.update_many({"empresa_id": empresa_id}, {"$set": fac_set})
    await db.presupuestos.update_many(
        {"empresa_id": empresa_id},
        {"$set": {"empresa_nombre": data.nombre, "empresa_ruc": ruc}},
    )
    empresa = await db.empresas.find_one({"id": empresa_id}, {"_id": 0})
    empresa["ventas_activas_count"] = ventas_activas
    return empresa

@router.delete("/admin/empresas/{empresa_id}")
async def delete_empresa(empresa_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empresas.eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar empresas")
    if not can_access_empresa(user, empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")

    facturas_activas = await db.facturas.find(
        {
            "empresa_id": empresa_id,
            "tipo": "emitida",
            "estado": {"$ne": "anulada"},
            "eliminada": {"$ne": True},
        },
        {"_id": 0, "numero": 1, "numero_boleta": 1, "estado": 1},
    ).to_list(500)

    if facturas_activas:
        numeros = [
            f.get("numero") or f.get("numero_boleta") or "(sin número)"
            for f in facturas_activas
        ]
        lista = ", ".join(numeros[:15])
        extra = f" y {len(numeros) - 15} más" if len(numeros) > 15 else ""
        raise HTTPException(
            status_code=400,
            detail=(
                f"No se puede eliminar el cliente: tiene {len(facturas_activas)} venta(s) registrada(s). "
                f"Facturas: {lista}{extra}. "
                "Solo puede eliminarse si todas las ventas están anuladas."
            ),
        )

    empresa = await db.empresas.find_one({"id": empresa_id}, {"_id": 0, "nombre": 1})
    result = await db.empresas.delete_one({"id": empresa_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    await log_auditoria(user, "empresas", "eliminar", f"Empresa eliminada: {empresa.get('nombre', empresa_id) if empresa else empresa_id}", empresa_id)
    return {"success": True}
