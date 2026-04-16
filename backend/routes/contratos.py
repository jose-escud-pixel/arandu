from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, can_access_empresa, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from models.schemas import ContratoCreate, ContratoResponse, PagoContratoCreate, PagoContratoResponse

router = APIRouter()


def es_due_en_periodo(contrato: dict, periodo: str) -> bool:
    """Determina si un contrato tiene un cobro pendiente en el periodo YYYY-MM dado."""
    try:
        year, month = int(periodo[:4]), int(periodo[5:7])
        fecha_inicio = contrato.get("fecha_inicio", "")
        if not fecha_inicio:
            return False
        fi_year, fi_month = int(fecha_inicio[:4]), int(fecha_inicio[5:7])
        fecha_fin = contrato.get("fecha_fin")
        if fecha_fin:
            ff_year, ff_month = int(fecha_fin[:4]), int(fecha_fin[5:7])
            if (year, month) > (ff_year, ff_month):
                return False
        if (year, month) < (fi_year, fi_month):
            return False
        frecuencia = contrato.get("frecuencia", "mensual")
        diff_months = (year - fi_year) * 12 + (month - fi_month)
        if frecuencia == "mensual":
            return True
        elif frecuencia == "trimestral":
            return diff_months % 3 == 0
        elif frecuencia == "semestral":
            return diff_months % 6 == 0
        elif frecuencia == "anual":
            return diff_months % 12 == 0
        return False
    except Exception:
        return False


@router.get("/admin/contratos", response_model=List[ContratoResponse])
async def get_contratos(empresa_id: Optional[str] = None, search: Optional[str] = None, logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver contratos")
    query = {}
    if empresa_id:
        if not can_access_empresa(user, empresa_id):
            return []
        query["empresa_id"] = empresa_id
    elif user.get("role") != "admin" and user.get("empresas_asignadas"):
        query["empresa_id"] = {"$in": user["empresas_asignadas"]}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return []

    # Filtro estricto por empresa propia activa
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)

    # Search by nombre or monto
    if search:
        search_strip = search.strip()
        try:
            monto_val = float(search_strip.replace(",", "."))
            query["$or"] = [
                {"nombre": {"$regex": search_strip, "$options": "i"}},
                {"monto": monto_val}
            ]
        except ValueError:
            if "$and" in query:
                query["$and"].append({"nombre": {"$regex": search_strip, "$options": "i"}})
            else:
                query["nombre"] = {"$regex": search_strip, "$options": "i"}

    contratos = await db.contratos.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    empresa_ids = list(set(c["empresa_id"] for c in contratos))
    empresas_list = await db.empresas.find({"id": {"$in": empresa_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
    empresa_map = {e["id"]: e for e in empresas_list}
    for c in contratos:
        emp = empresa_map.get(c["empresa_id"], {})
        c["empresa_nombre"] = emp.get("nombre", "Desconocida")
    return contratos


@router.post("/admin/contratos", response_model=ContratoResponse)
async def create_contrato(data: ContratoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso para crear contratos")
    if not can_access_empresa(user, data.empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": data.empresa_id}, {"_id": 0})
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    contrato_id = str(uuid.uuid4())
    doc = {
        "id": contrato_id,
        "empresa_id": data.empresa_id,
        "logo_tipo": data.logo_tipo,
        "nombre": data.nombre,
        "descripcion": data.descripcion,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "frecuencia": data.frecuencia,
        "dia_cobro": data.dia_cobro,
        "fecha_inicio": data.fecha_inicio,
        "fecha_fin": data.fecha_fin,
        "activo": data.activo,
        "notas": data.notas,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.contratos.insert_one(doc)
    await log_auditoria(user, "contratos", "crear", f"Contrato '{data.nombre}' creado para {empresa['nombre']}", contrato_id)
    return {**{k: v for k, v in doc.items() if k != "_id"}, "empresa_nombre": empresa["nombre"]}


@router.put("/admin/contratos/{contrato_id}", response_model=ContratoResponse)
async def update_contrato(contrato_id: str, data: ContratoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar contratos")
    existing = await db.contratos.find_one({"id": contrato_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if not can_access_empresa(user, data.empresa_id):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    empresa = await db.empresas.find_one({"id": data.empresa_id}, {"_id": 0})
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    update_fields = {
        "empresa_id": data.empresa_id,
        "logo_tipo": data.logo_tipo,
        "nombre": data.nombre,
        "descripcion": data.descripcion,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "frecuencia": data.frecuencia,
        "dia_cobro": data.dia_cobro,
        "fecha_inicio": data.fecha_inicio,
        "fecha_fin": data.fecha_fin,
        "activo": data.activo,
        "notas": data.notas,
    }
    await db.contratos.update_one({"id": contrato_id}, {"$set": update_fields})
    updated = await db.contratos.find_one({"id": contrato_id}, {"_id": 0})
    updated["empresa_nombre"] = empresa["nombre"]
    return updated


@router.patch("/admin/contratos/{contrato_id}/toggle")
async def toggle_contrato(contrato_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar contratos")
    contrato = await db.contratos.find_one({"id": contrato_id}, {"_id": 0})
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    new_activo = not contrato.get("activo", True)
    await db.contratos.update_one({"id": contrato_id}, {"$set": {"activo": new_activo}})
    await log_auditoria(user, "contratos", "toggle", f"Contrato {'activado' if new_activo else 'desactivado'}", contrato_id)
    return {"success": True, "activo": new_activo}


@router.delete("/admin/contratos/{contrato_id}")
async def delete_contrato(contrato_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.eliminar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar contratos")
    result = await db.contratos.delete_one({"id": contrato_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    # Cascade delete cobros
    await db.cobros_contratos.delete_many({"contrato_id": contrato_id})
    return {"success": True}


@router.get("/admin/contratos/cobros-anuales")
async def get_cobros_anuales(year: int, empresa_id: Optional[str] = None, logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    """Returns all 12 months of the year showing paid/unpaid for each contract."""
    if not has_permission(user, "contratos.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver contratos")

    query = {"activo": True}
    if empresa_id:
        if not can_access_empresa(user, empresa_id):
            query["empresa_id"] = empresa_id
        else:
            query["empresa_id"] = empresa_id
    elif user.get("role") != "admin" and user.get("empresas_asignadas"):
        query["empresa_id"] = {"$in": user["empresas_asignadas"]}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return []

    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return {"contratos": [], "year": year, "cobros_totales": {}, "deuda_total": 0}
    query.update(logo_q)

    contratos = await db.contratos.find(query, {"_id": 0}).to_list(500)
    empresa_ids = list(set(c["empresa_id"] for c in contratos))
    empresas_list = await db.empresas.find({"id": {"$in": empresa_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
    empresa_map = {e["id"]: e for e in empresas_list}

    # Get all cobros for this year
    all_periods = [f"{year}-{str(m).zfill(2)}" for m in range(1, 13)]
    cobros = await db.cobros_contratos.find(
        {"periodo": {"$regex": f"^{year}-"}},
        {"_id": 0}
    ).to_list(5000)
    # cobros_map: {contrato_id: {periodo: cobro}}
    cobros_map = {}
    for cb in cobros:
        cid = cb["contrato_id"]
        if cid not in cobros_map:
            cobros_map[cid] = {}
        cobros_map[cid][cb["periodo"]] = cb

    now = datetime.now(timezone.utc)
    result = []
    for c in contratos:
        emp = empresa_map.get(c["empresa_id"], {})
        meses = {}
        for periodo in all_periods:
            y, m = int(periodo[:4]), int(periodo[5:7])
            is_due = es_due_en_periodo(c, periodo)
            cobro = cobros_map.get(c["id"], {}).get(periodo)
            periodo_vencido = (y, m) < (now.year, now.month)
            if not is_due:
                estado = "no_aplica"
            elif cobro:
                estado = "pagado"
            elif periodo_vencido:
                estado = "vencido"
            else:
                estado = "pendiente"
            meses[periodo] = {"estado": estado, "cobro": cobro}
        result.append({
            "contrato_id": c["id"],
            "empresa_id": c["empresa_id"],
            "empresa_nombre": emp.get("nombre", "Desconocida"),
            "logo_tipo": c.get("logo_tipo", "arandujar"),
            "nombre": c["nombre"],
            "monto": c["monto"],
            "moneda": c["moneda"],
            "frecuencia": c["frecuencia"],
            "meses": meses,
        })
    return result


@router.get("/admin/contratos/cobros")
async def get_cobros_periodo(periodo: str, user: dict = Depends(require_authenticated)):
    """Retorna los cobros del periodo YYYY-MM con estado pagado/pendiente/vencido."""
    if not has_permission(user, "contratos.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver contratos")

    query = {"activo": True}
    if user.get("role") != "admin" and user.get("empresas_asignadas"):
        query["empresa_id"] = {"$in": user["empresas_asignadas"]}
    elif user.get("role") != "admin" and not user.get("empresas_asignadas"):
        return []

    contratos = await db.contratos.find(query, {"_id": 0}).to_list(500)
    empresa_ids = list(set(c["empresa_id"] for c in contratos))
    empresas_list = await db.empresas.find({"id": {"$in": empresa_ids}}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
    empresa_map = {e["id"]: e for e in empresas_list}

    # Filtrar contratos que tienen cobro en este periodo
    contratos_periodo = [c for c in contratos if es_due_en_periodo(c, periodo)]

    # Obtener cobros ya registrados para este periodo
    contrato_ids = [c["id"] for c in contratos_periodo]
    cobros_existentes = await db.cobros_contratos.find(
        {"contrato_id": {"$in": contrato_ids}, "periodo": periodo}, {"_id": 0}
    ).to_list(500)
    cobros_map = {cb["contrato_id"]: cb for cb in cobros_existentes}

    # Determinar si el periodo ya venció
    try:
        year, month = int(periodo[:4]), int(periodo[5:7])
        now = datetime.now(timezone.utc)
        periodo_vencido = (year, month) < (now.year, now.month)
    except Exception:
        periodo_vencido = False

    result = []
    for c in contratos_periodo:
        cobro = cobros_map.get(c["id"])
        if cobro:
            estado = "pagado"
        elif periodo_vencido:
            estado = "vencido"
        else:
            estado = "pendiente"
        emp = empresa_map.get(c["empresa_id"], {})
        result.append({
            "contrato_id": c["id"],
            "empresa_id": c["empresa_id"],
            "empresa_nombre": emp.get("nombre", "Desconocida"),
            "logo_tipo": c.get("logo_tipo", "arandujar"),
            "nombre": c["nombre"],
            "monto": c["monto"],
            "moneda": c["moneda"],
            "tipo_cambio": c.get("tipo_cambio"),
            "frecuencia": c["frecuencia"],
            "dia_cobro": c.get("dia_cobro", 1),
            "estado": estado,
            "cobro": cobro,
        })
    return result


@router.post("/admin/contratos/{contrato_id}/cobros", response_model=PagoContratoResponse)
async def register_cobro(contrato_id: str, data: PagoContratoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para registrar cobros")
    contrato = await db.contratos.find_one({"id": contrato_id}, {"_id": 0})
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    # Verificar que no haya cobro duplicado para el mismo periodo
    existing = await db.cobros_contratos.find_one({"contrato_id": contrato_id, "periodo": data.periodo})
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un cobro registrado para el periodo {data.periodo}")
    pago_id = str(uuid.uuid4())
    doc = {
        "id": pago_id,
        "contrato_id": contrato_id,
        "periodo": data.periodo,
        "monto_pagado": data.monto_pagado,
        "fecha_pago": data.fecha_pago,
        "notas": data.notas,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.cobros_contratos.insert_one(doc)
    await log_auditoria(user, "contratos", "registrar_cobro", f"Cobro registrado para {contrato.get('nombre')} periodo {data.periodo}", contrato_id)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/admin/cobros/{pago_id}")
async def delete_cobro(pago_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para anular cobros")
    result = await db.cobros_contratos.delete_one({"id": pago_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    return {"success": True}
