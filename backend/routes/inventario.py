from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
from typing import Optional

from config import db
from auth import require_admin, require_authenticated, has_permission, can_access_empresa, log_auditoria, log_historial
from models.schemas import (
    ActivoCreate, CredencialCreate, CategoriaCreate
)
from config import CATEGORIAS_DEFAULT

router = APIRouter()


# ================== CATEGORIAS ==================

@router.get("/admin/categorias")
async def get_categorias(user: dict = Depends(require_authenticated)):
    cats = await db.categorias.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)
    if not cats:
        for cat in CATEGORIAS_DEFAULT:
            cat["id"] = str(uuid.uuid4())
            await db.categorias.insert_one(cat)
        cats = await db.categorias.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)
    return cats

@router.post("/admin/categorias")
async def create_categoria(data: CategoriaCreate, admin: dict = Depends(require_admin)):
    cat = {"id": str(uuid.uuid4()), "nombre": data.nombre, "subtipos": data.subtipos}
    await db.categorias.insert_one(cat)
    return {"id": cat["id"], "nombre": cat["nombre"], "subtipos": cat["subtipos"]}

@router.put("/admin/categorias/{cat_id}")
async def update_categoria(cat_id: str, data: CategoriaCreate, admin: dict = Depends(require_admin)):
    await db.categorias.update_one({"id": cat_id}, {"$set": {"nombre": data.nombre, "subtipos": data.subtipos}})
    return {"success": True}

@router.delete("/admin/categorias/{cat_id}")
async def delete_categoria(cat_id: str, admin: dict = Depends(require_admin)):
    await db.categorias.delete_one({"id": cat_id})
    return {"success": True}


# ================== MIGRACION CATEGORIAS ==================

MIGRATION_MAP = {
    "Access Point": {"categoria": "Dispositivos", "subtipo": "Access Point"},
    "Correo": {"categoria": "Cuentas de Acceso", "subtipo": "Correo"},
    "Cámara IP": {"categoria": "Dispositivos", "subtipo": "Camara IP"},
    "Camara IP": {"categoria": "Dispositivos", "subtipo": "Camara IP"},
    "DVR": {"categoria": "Dispositivos", "subtipo": "DVR"},
    "Dispositivo de Red": {"categoria": "Dispositivos", "subtipo": "Otro"},
    "Dominio": {"categoria": "Dominios y Servicios", "subtipo": "Dominio Web"},
    "GRANDSTREAM": {"categoria": "Dispositivos", "subtipo": "Otro"},
    "Hikconnet": {"categoria": "Dispositivos", "subtipo": "Otro"},
    "Mikrotik": {"categoria": "Dispositivos", "subtipo": "Mikrotik"},
    "RELOJ MARCADOR": {"categoria": "Dispositivos", "subtipo": "Otro"},
    "Router": {"categoria": "Dispositivos", "subtipo": "Router"},
    "Servidor": {"categoria": "Servidores", "subtipo": "Otro"},
    "VPN": {"categoria": "Cuentas de Acceso", "subtipo": "VPN"},
    "SSH": {"categoria": "Cuentas de Acceso", "subtipo": "SSH"},
    "RDP": {"categoria": "Cuentas de Acceso", "subtipo": "RDP"},
    "WiFi": {"categoria": "Cuentas de Acceso", "subtipo": "WiFi"},
    "AnyDesk": {"categoria": "Cuentas de Acceso", "subtipo": "AnyDesk"},
    "Office 365": {"categoria": "Cuentas de Acceso", "subtipo": "Office 365"},
    "Zimbra": {"categoria": "Cuentas de Acceso", "subtipo": "Zimbra"},
    "FTP": {"categoria": "Cuentas de Acceso", "subtipo": "FTP"},
    "Winbox": {"categoria": "Cuentas de Acceso", "subtipo": "Winbox"},
    "Panel Web": {"categoria": "Cuentas de Acceso", "subtipo": "Panel Web"},
    "Base de Datos": {"categoria": "Cuentas de Acceso", "subtipo": "Base de Datos"},
    "DNS": {"categoria": "Dominios y Servicios", "subtipo": "DNS"},
    "Hosting": {"categoria": "Dominios y Servicios", "subtipo": "Hosting"},
    "NIC": {"categoria": "Dominios y Servicios", "subtipo": "NIC"},
    "SSL": {"categoria": "Dominios y Servicios", "subtipo": "SSL"},
    "PC Escritorio": {"categoria": "Dispositivos", "subtipo": "PC Escritorio"},
    "Notebook": {"categoria": "Dispositivos", "subtipo": "Notebook"},
    "Impresora": {"categoria": "Dispositivos", "subtipo": "Impresora"},
    "Switch": {"categoria": "Dispositivos", "subtipo": "Switch"},
    "UPS": {"categoria": "Dispositivos", "subtipo": "UPS"},
    "Firewall": {"categoria": "Dispositivos", "subtipo": "Firewall"},
    "Otro": {"categoria": "Dispositivos", "subtipo": "Otro"},
}

@router.post("/admin/migrar-categorias")
async def migrar_categorias(admin: dict = Depends(require_admin)):
    """One-time migration: convert old flat categories to new 4-category structure.
    Updates all existing activos to use the new category/subtipo mapping."""
    migrated_count = 0
    unmapped = []

    # Get all activos with old categories
    activos = await db.activos.find({}, {"_id": 0, "id": 1, "categoria": 1, "subtipo": 1}).to_list(10000)

    for activo in activos:
        old_cat = activo.get("categoria", "")
        mapping = MIGRATION_MAP.get(old_cat)

        if mapping:
            # Only update if the category is an old one (not already migrated)
            new_cats = ["Servidores", "Dispositivos", "Cuentas de Acceso", "Dominios y Servicios"]
            if old_cat not in new_cats:
                update_fields = {"categoria": mapping["categoria"]}
                # Only set subtipo if it's empty or matches old category name
                if not activo.get("subtipo") or activo.get("subtipo") == old_cat:
                    update_fields["subtipo"] = mapping["subtipo"]
                await db.activos.update_one({"id": activo["id"]}, {"$set": update_fields})
                migrated_count += 1
        else:
            # If already using new categories, skip
            new_cats = ["Servidores", "Dispositivos", "Cuentas de Acceso", "Dominios y Servicios"]
            if old_cat not in new_cats and old_cat not in unmapped:
                unmapped.append(old_cat)

    # Replace categories collection with new defaults
    await db.categorias.delete_many({})
    for cat in CATEGORIAS_DEFAULT:
        await db.categorias.insert_one({
            "id": str(uuid.uuid4()),
            "nombre": cat["nombre"],
            "subtipos": cat["subtipos"]
        })

    new_cats = await db.categorias.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)

    await log_auditoria(admin, "inventario", "migrar_categorias",
        f"Migracion completada: {migrated_count} activos actualizados")

    return {
        "success": True,
        "activos_migrados": migrated_count,
        "categorias_no_mapeadas": unmapped,
        "nuevas_categorias": [c["nombre"] for c in new_cats],
        "mensaje": f"Migracion completada. {migrated_count} activos actualizados a las nuevas categorias."
    }


# ================== ACTIVOS ==================

@router.get("/admin/activos")
async def get_activos(
    empresa_id: Optional[str] = None, categoria: Optional[str] = None,
    estado: Optional[str] = None, ubicacion: Optional[str] = None,
    search: Optional[str] = None, user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "inventario.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver inventario")
    query = {}
    if empresa_id:
        query["empresa_id"] = empresa_id
    if categoria:
        query["categoria"] = categoria
    if estado:
        query["estado"] = estado
    if ubicacion:
        query["ubicacion"] = {"$regex": ubicacion, "$options": "i"}
    if search:
        query["$or"] = [
            {"nombre": {"$regex": search, "$options": "i"}},
            {"descripcion": {"$regex": search, "$options": "i"}},
            {"ip_local": {"$regex": search, "$options": "i"}},
            {"ip_publica": {"$regex": search, "$options": "i"}},
            {"dominio": {"$regex": search, "$options": "i"}},
            {"ubicacion": {"$regex": search, "$options": "i"}},
        ]
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        if "empresa_id" not in query:
            query["empresa_id"] = {"$in": user["empresas_asignadas"]}
        elif query["empresa_id"] not in user["empresas_asignadas"]:
            return []
    activos = await db.activos.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    emp_ids = list(set(a["empresa_id"] for a in activos))
    empresas_list = await db.empresas.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)
    emp_map = {e["id"]: e["nombre"] for e in empresas_list}
    activo_ids = [a["id"] for a in activos]
    cred_pipeline = [
        {"$match": {"activo_id": {"$in": activo_ids}}},
        {"$group": {"_id": "$activo_id", "count": {"$sum": 1}}}
    ]
    cred_counts = {r["_id"]: r["count"] for r in await db.credenciales.aggregate(cred_pipeline).to_list(1000)}
    # Mapa id→nombre para resolver nvr_dvr_nombre en cada cámara
    activo_nombre_map = {a["id"]: a["nombre"] for a in activos}
    for a in activos:
        a["empresa_nombre"] = emp_map.get(a["empresa_id"], "")
        a["credenciales_count"] = cred_counts.get(a["id"], 0)
        if a.get("nvr_dvr_id"):
            a["nvr_dvr_nombre"] = activo_nombre_map.get(a["nvr_dvr_id"], "")
    return activos

@router.get("/admin/activos/{activo_id}")
async def get_activo(activo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "inventario.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    activo = await db.activos.find_one({"id": activo_id}, {"_id": 0})
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    if not can_access_empresa(user, activo["empresa_id"]):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": activo["empresa_id"]}, {"_id": 0, "nombre": 1})
    activo["empresa_nombre"] = empresa["nombre"] if empresa else ""
    cred_count = await db.credenciales.count_documents({"activo_id": activo_id})
    activo["credenciales_count"] = cred_count
    if activo.get("nvr_dvr_id"):
        nvr = await db.activos.find_one({"id": activo["nvr_dvr_id"]}, {"_id": 0, "nombre": 1})
        activo["nvr_dvr_nombre"] = nvr["nombre"] if nvr else ""
    return activo

@router.post("/admin/activos")
async def create_activo(data: ActivoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "inventario.crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso para crear activos")
    if not can_access_empresa(user, data.empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    activo_id = str(uuid.uuid4())
    doc = {"id": activo_id, **data.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.activos.insert_one(doc)
    await log_historial(activo_id, user, "crear", f"Activo creado: {data.nombre}")
    await log_auditoria(user, "inventario", "crear_activo", f"Activo creado: {data.nombre}", activo_id)
    doc.pop("_id", None)
    return doc

@router.put("/admin/activos/{activo_id}")
async def update_activo(activo_id: str, data: ActivoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "inventario.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar activos")
    existing = await db.activos.find_one({"id": activo_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    if not can_access_empresa(user, existing["empresa_id"]):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    update = data.dict()
    await db.activos.update_one({"id": activo_id}, {"$set": update})
    changes = [k for k in update if str(update[k]) != str(existing.get(k, ""))]
    if changes:
        await log_historial(activo_id, user, "editar", f"Campos modificados: {', '.join(changes)}")
        await log_auditoria(user, "inventario", "editar_activo", f"Activo editado: {existing.get('nombre', activo_id)} - Campos: {', '.join(changes)}", activo_id)
    return {"success": True}

@router.delete("/admin/activos/{activo_id}")
async def delete_activo(activo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "inventario.eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar activos")
    existing = await db.activos.find_one({"id": activo_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    if not can_access_empresa(user, existing["empresa_id"]):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    await db.activos.delete_one({"id": activo_id})
    await db.credenciales.delete_many({"activo_id": activo_id})
    await db.historial.delete_many({"activo_id": activo_id})
    await log_auditoria(user, "inventario", "eliminar_activo", f"Activo eliminado: {existing.get('nombre', activo_id)}", activo_id)
    return {"success": True}


# ================== CREDENCIALES ==================

@router.get("/admin/activos/{activo_id}/credenciales")
async def get_credenciales(activo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "credenciales.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver credenciales")
    activo = await db.activos.find_one({"id": activo_id}, {"_id": 0, "empresa_id": 1})
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    if not can_access_empresa(user, activo["empresa_id"]):
        raise HTTPException(status_code=403, detail="No tiene acceso")
    creds = await db.credenciales.find({"activo_id": activo_id}, {"_id": 0}).to_list(100)
    await log_historial(activo_id, user, "ver_credenciales", "Credenciales consultadas")
    return creds

@router.post("/admin/activos/{activo_id}/credenciales")
async def create_credencial(activo_id: str, data: CredencialCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "credenciales.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    activo = await db.activos.find_one({"id": activo_id}, {"_id": 0, "empresa_id": 1})
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    if not can_access_empresa(user, activo["empresa_id"]):
        raise HTTPException(status_code=403, detail="No tiene acceso")
    cred_id = str(uuid.uuid4())
    doc = {"id": cred_id, "activo_id": activo_id, **{k: v for k, v in data.dict().items() if k != "activo_id"}, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.credenciales.insert_one(doc)
    await log_historial(activo_id, user, "crear_credencial", f"Credencial agregada: {data.tipo_acceso} - {data.usuario}")
    await log_auditoria(user, "inventario", "crear_credencial", f"Credencial agregada: {data.tipo_acceso} - {data.usuario}", activo_id)
    doc.pop("_id", None)
    return doc

@router.put("/admin/credenciales/{cred_id}")
async def update_credencial(cred_id: str, data: CredencialCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "credenciales.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    cred = await db.credenciales.find_one({"id": cred_id}, {"_id": 0})
    if not cred:
        raise HTTPException(status_code=404, detail="Credencial no encontrada")
    update = {k: v for k, v in data.dict().items() if k != "activo_id"}
    await db.credenciales.update_one({"id": cred_id}, {"$set": update})
    await log_historial(cred["activo_id"], user, "editar_credencial", f"Credencial modificada: {data.tipo_acceso}")
    await log_auditoria(user, "inventario", "editar_credencial", f"Credencial modificada: {data.tipo_acceso}", cred["activo_id"])
    return {"success": True}

@router.delete("/admin/credenciales/{cred_id}")
async def delete_credencial(cred_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "credenciales.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    cred = await db.credenciales.find_one({"id": cred_id}, {"_id": 0})
    if not cred:
        raise HTTPException(status_code=404, detail="Credencial no encontrada")
    await db.credenciales.delete_one({"id": cred_id})
    await log_historial(cred["activo_id"], user, "eliminar_credencial", "Credencial eliminada")
    await log_auditoria(user, "inventario", "eliminar_credencial", "Credencial eliminada", cred["activo_id"])
    return {"success": True}


# ================== HISTORIAL ==================

@router.get("/admin/activos/{activo_id}/historial")
async def get_historial(activo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "inventario.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    historial = await db.historial.find({"activo_id": activo_id}, {"_id": 0}).sort("fecha", -1).to_list(200)
    return historial


# ================== REPORTES ==================

@router.get("/admin/reportes/inventario")
async def export_inventario(
    empresa_id: Optional[str] = None, empresa_ids: Optional[str] = None,
    incluir_credenciales: bool = False, ordenar_por: str = "nombre",
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "inventario.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso")
    if incluir_credenciales and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden exportar con credenciales")
    query = {}
    if empresa_ids:
        ids_list = [eid.strip() for eid in empresa_ids.split(",") if eid.strip()]
        if ids_list:
            query["empresa_id"] = {"$in": ids_list}
    elif empresa_id:
        query["empresa_id"] = empresa_id
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        if "empresa_id" not in query:
            query["empresa_id"] = {"$in": user["empresas_asignadas"]}
    sort_field = "nombre"
    if ordenar_por == "fecha": sort_field = "created_at"
    elif ordenar_por == "categoria": sort_field = "categoria"
    elif ordenar_por == "empresa": sort_field = "empresa_id"

    if ordenar_por == "ip":
        activos = await db.activos.find(query, {"_id": 0}).to_list(5000)
        def ip_sort_key(activo):
            ip = activo.get("ip_local", "") or ""
            try:
                partes = ip.strip().split(".")
                if len(partes) == 4:
                    return tuple(int(p) for p in partes)
            except (ValueError, AttributeError):
                pass
            return (999, 999, 999, 999)
        activos.sort(key=ip_sort_key)
    else:
        activos = await db.activos.find(query, {"_id": 0}).sort(sort_field, 1).to_list(5000)

    emp_ids = list(set(a["empresa_id"] for a in activos))
    empresas_list = await db.empresas.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)
    emp_map = {e["id"]: e["nombre"] for e in empresas_list}

    # Mapa de id → activo para lookup rápido (usado en secciones 3 y 4)
    activo_map = {a["id"]: a for a in activos}

    result = []
    for a in activos:
        # Responsable: campo directo o desde campos_personalizados
        responsable = (
            a.get("responsable", "")
            or a.get("campos_personalizados", {}).get("responsable", "")
        )
        entry = {
            "empresa":        emp_map.get(a["empresa_id"], ""),
            "categoria":      a.get("categoria", ""),
            "subtipo":        a.get("subtipo", ""),
            "nombre":         a.get("nombre", ""),
            "descripcion":    a.get("descripcion", ""),
            "ubicacion":      a.get("ubicacion", ""),
            "ip_local":       a.get("ip_local", ""),
            "ips_locales":    a.get("ips_locales", []),
            "ip_publica":     a.get("ip_publica", ""),
            "ips_publicas":   a.get("ips_publicas", []),
            "dominio":        a.get("dominio", ""),
            "puerto_local":   a.get("puerto_local", ""),
            "puerto_externo": a.get("puerto_externo", ""),
            "version":        a.get("version", ""),
            "estado":         a.get("estado", ""),
            "observaciones":  a.get("observaciones", ""),
            "responsable":    responsable,
        }
        if incluir_credenciales:
            creds = await db.credenciales.find({"activo_id": a["id"]}, {"_id": 0}).to_list(50)
            entry["credenciales"] = [
                {
                    "tipo_acceso":  c.get("tipo_acceso", ""),
                    "servicio":     c.get("servicio", "") or c.get("tipo_acceso", ""),
                    "usuario":      c.get("usuario", ""),
                    "password":     c.get("password", ""),
                    "url_acceso":   c.get("url_acceso", ""),
                    "sensibilidad": c.get("sensibilidad", ""),
                    "observaciones": c.get("observaciones", ""),
                }
                for c in creds
            ]
        result.append(entry)

    # ── Sección 3: Cuentas Asociadas a Dispositivos ──────────────────────────
    # Cuentas de Acceso que tienen activos_asignados (vinculadas a dispositivos)
    cuentas_asociadas_list = []
    cuentas_de_acceso = [a for a in activos if a.get("categoria") == "Cuentas de Acceso"]

    # Para dispositivos que podrían estar fuera del scope del filtro actual,
    # pre-cargamos sus nombres en caso de que activo_map no los tenga.
    all_assigned_ids = []
    for cuenta in cuentas_de_acceso:
        all_assigned_ids.extend(cuenta.get("activos_asignados", []))
    missing_ids = [aid for aid in set(all_assigned_ids) if aid not in activo_map]
    if missing_ids:
        extra_activos = await db.activos.find(
            {"id": {"$in": missing_ids}}, {"_id": 0, "id": 1, "nombre": 1}
        ).to_list(500)
        for ea in extra_activos:
            activo_map[ea["id"]] = ea

    for cuenta in cuentas_de_acceso:
        assigned_ids = cuenta.get("activos_asignados", [])
        if not assigned_ids:
            continue
        # Obtener credenciales de esta cuenta de acceso
        creds = await db.credenciales.find({"activo_id": cuenta["id"]}, {"_id": 0}).to_list(50)
        # Usar la primera credencial como representativa (o valores vacíos)
        first_cred = creds[0] if creds else {}
        for device_id in assigned_ids:
            device = activo_map.get(device_id, {})
            device_name = device.get("nombre", device_id)
            cuentas_asociadas_list.append({
                "dispositivo": device_name,
                "tipo_cuenta": cuenta.get("subtipo", ""),
                "nombre":      cuenta.get("nombre", ""),
                "usuario":     first_cred.get("usuario", "") if incluir_credenciales else "",
                "password":    first_cred.get("password", "") if incluir_credenciales else "",
                "detalles":    first_cred.get("observaciones", "") or cuenta.get("observaciones", ""),
            })

    # ── Sección 4: Detalle de Cuentas de Acceso ──────────────────────────────
    # Una fila por cada cuenta de acceso, con resumen de sus credenciales
    detalle_cuentas_list = []
    for cuenta in cuentas_de_acceso:
        creds = await db.credenciales.find({"activo_id": cuenta["id"]}, {"_id": 0}).to_list(50)
        first_cred = creds[0] if creds else {}
        detalle_cuentas_list.append({
            "nombre":             cuenta.get("nombre", ""),
            "subtipo":            cuenta.get("subtipo", ""),
            "usuario":            first_cred.get("usuario", "") if incluir_credenciales else "",
            "correo_servidor":    first_cred.get("url_acceso", "") if incluir_credenciales else "",
            "password":           first_cred.get("password", "") if incluir_credenciales else "",
            "detalles":           first_cred.get("observaciones", "") or cuenta.get("observaciones", ""),
            "dispositivos_count": len(cuenta.get("activos_asignados", [])),
        })

    return {
        "activos":           result,
        "cuentas_asociadas": cuentas_asociadas_list,
        "detalle_cuentas":   detalle_cuentas_list,
    }
