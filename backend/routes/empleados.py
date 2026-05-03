from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria
from models.schemas import EmpleadoCreate, EmpleadoResponse, SueldoCreate, SueldoResponse, AdelantoCreate, AdelantoResponse

router = APIRouter()


def _periodo_to_tuple(periodo: str):
    """Convierte 'YYYY-MM' a (int, int) para comparaciones."""
    try:
        return int(periodo[:4]), int(periodo[5:7])
    except Exception:
        return (0, 0)


# ─────────────────────────────────────────────
#  EMPLEADOS – CRUD
# ─────────────────────────────────────────────

@router.get("/admin/empleados", response_model=List[EmpleadoResponse])
async def get_empleados(
    logo_tipo: Optional[str] = None,
    activo: Optional[bool] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "empleados.ver"):
        raise HTTPException(status_code=403, detail="No tiene permiso para ver empleados")
    query = {}
    if logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    if activo is not None:
        query["activo"] = activo
    empleados = await db.empleados.find(query, {"_id": 0}).sort("apellido", 1).to_list(500)
    return empleados


@router.post("/admin/empleados", response_model=EmpleadoResponse)
async def create_empleado(data: EmpleadoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.crear"):
        raise HTTPException(status_code=403, detail="No tiene permiso para crear empleados")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "created_at": now,
    }
    await db.empleados.insert_one(doc)
    await log_auditoria(user, "empleados", "crear_empleado",
                        f"Empleado {data.nombre} {data.apellido} creado")
    return {**doc, "_id": None}


@router.put("/admin/empleados/{empleado_id}", response_model=EmpleadoResponse)
async def update_empleado(empleado_id: str, data: EmpleadoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="No tiene permiso para editar empleados")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    updates = data.dict()
    # Si el sueldo cambió, dejamos rastro en historial_sueldos
    sueldo_anterior = emp.get("sueldo_base")
    sueldo_nuevo = updates.get("sueldo_base")
    push_op = None
    if sueldo_anterior is not None and sueldo_nuevo is not None and float(sueldo_anterior) != float(sueldo_nuevo):
        push_op = {
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "sueldo_anterior": float(sueldo_anterior),
            "sueldo_nuevo": float(sueldo_nuevo),
            "moneda": updates.get("moneda") or emp.get("moneda", "PYG"),
            "motivo": "Modificación desde edición de empleado",
            "usuario_id": user.get("id"),
            "usuario_nombre": user.get("name"),
        }
    update_payload = {"$set": updates}
    if push_op:
        update_payload["$push"] = {"historial_sueldos": push_op}
    await db.empleados.update_one({"id": empleado_id}, update_payload)
    await log_auditoria(user, "empleados", "editar_empleado",
                        f"Empleado {empleado_id} actualizado")
    refreshed = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    return refreshed


class AumentoSueldoIn(BaseModel):
    sueldo_nuevo: float
    moneda: Optional[str] = None
    motivo: Optional[str] = None
    fecha: Optional[str] = None   # YYYY-MM-DD; defaults a hoy


@router.post("/admin/empleados/{empleado_id}/aumento-sueldo", response_model=EmpleadoResponse)
async def aumentar_sueldo(empleado_id: str, data: AumentoSueldoIn,
                            user: dict = Depends(require_authenticated)):
    """Endpoint dedicado a subir (o ajustar) el sueldo dejando registro
    en el historial. Más explícito que un PUT genérico."""
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    if data.sueldo_nuevo is None or data.sueldo_nuevo <= 0:
        raise HTTPException(status_code=400, detail="Sueldo nuevo inválido")
    sueldo_anterior = float(emp.get("sueldo_base") or 0)
    moneda = data.moneda or emp.get("moneda", "PYG")
    fecha = data.fecha or datetime.now(timezone.utc).date().isoformat()
    entry = {
        "fecha": fecha,
        "sueldo_anterior": sueldo_anterior,
        "sueldo_nuevo": float(data.sueldo_nuevo),
        "moneda": moneda,
        "motivo": data.motivo or "Aumento de sueldo",
        "usuario_id": user.get("id"),
        "usuario_nombre": user.get("name"),
    }
    await db.empleados.update_one(
        {"id": empleado_id},
        {"$set": {"sueldo_base": float(data.sueldo_nuevo), "moneda": moneda},
         "$push": {"historial_sueldos": entry}},
    )
    await log_auditoria(user, "empleados", "aumento_sueldo",
                        f"Sueldo {emp.get('nombre')} {emp.get('apellido')}: {sueldo_anterior} → {data.sueldo_nuevo} ({moneda})")
    refreshed = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    return refreshed


@router.get("/admin/empleados/{empleado_id}/historial-sueldos")
async def get_historial_sueldos(empleado_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0, "historial_sueldos": 1, "sueldo_base": 1, "moneda": 1, "fecha_ingreso": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    return {
        "sueldo_actual": emp.get("sueldo_base"),
        "moneda": emp.get("moneda", "PYG"),
        "fecha_ingreso": emp.get("fecha_ingreso"),
        "historial": emp.get("historial_sueldos") or [],
    }


@router.patch("/admin/empleados/{empleado_id}/toggle")
async def toggle_empleado(empleado_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    nuevo = not emp.get("activo", True)
    await db.empleados.update_one({"id": empleado_id}, {"$set": {"activo": nuevo}})
    return {"activo": nuevo}


@router.delete("/admin/empleados/{empleado_id}")
async def delete_empleado(empleado_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    await db.empleados.delete_one({"id": empleado_id})
    # Borrar también todos sus sueldos registrados
    await db.sueldos.delete_many({"empleado_id": empleado_id})
    await log_auditoria(user, "empleados", "eliminar_empleado",
                        f"Empleado {empleado_id} eliminado")
    return {"ok": True}


# ─────────────────────────────────────────────
#  SUELDOS – vencimientos por periodo
# ─────────────────────────────────────────────

@router.get("/admin/empleados/sueldos")
async def get_sueldos_periodo(
    periodo: str,                          # YYYY-MM obligatorio
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    """
    Devuelve todos los empleados activos que corresponden al periodo dado
    (ingresaron antes o durante ese mes y aún no egresaron),
    junto con el estado de cobro de su sueldo:
      - pagado   → existe un registro de sueldo para ese periodo
      - pendiente → no existe registro y el periodo es el actual o futuro
      - vencido  → no existe registro y el periodo ya pasó
    """
    if not has_permission(user, "empleados.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    try:
        p_year, p_month = int(periodo[:4]), int(periodo[5:7])
    except Exception:
        raise HTTPException(status_code=400, detail="Periodo inválido. Use YYYY-MM")

    # Empleados activos (o que estaban activos en ese periodo)
    query: dict = {}
    if logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo

    empleados = await db.empleados.find(query, {"_id": 0}).to_list(500)

    # Filtrar por periodo: fecha_ingreso <= periodo y (no fecha_egreso o fecha_egreso >= periodo)
    def aplica_en_periodo(emp: dict) -> bool:
        fi = emp.get("fecha_ingreso", "")
        if not fi:
            return False
        fi_y, fi_m = int(fi[:4]), int(fi[5:7])
        if (p_year, p_month) < (fi_y, fi_m):
            return False
        fe = emp.get("fecha_egreso")
        if fe:
            fe_y, fe_m = int(fe[:4]), int(fe[5:7])
            if (p_year, p_month) > (fe_y, fe_m):
                return False
        return True

    empleados_periodo = [e for e in empleados if aplica_en_periodo(e)]
    empleado_ids = [e["id"] for e in empleados_periodo]

    # Cargar sueldos ya registrados para ese periodo
    sueldos_raw = await db.sueldos.find(
        {"empleado_id": {"$in": empleado_ids}, "periodo": periodo},
        {"_id": 0}
    ).to_list(500)
    sueldos_map = {s["empleado_id"]: s for s in sueldos_raw}

    # Determinar periodo actual
    now = datetime.now(timezone.utc)
    cur_year, cur_month = now.year, now.month

    resultado = []
    for emp in empleados_periodo:
        sueldo = sueldos_map.get(emp["id"])
        if sueldo:
            estado = "pagado"
        elif (p_year, p_month) <= (cur_year, cur_month):
            # periodo ya pasó o es el corriente → pendiente/vencido
            if (p_year, p_month) < (cur_year, cur_month):
                estado = "vencido"
            else:
                estado = "pendiente"
        else:
            estado = "pendiente"

        resultado.append({
            **emp,
            "estado": estado,
            "sueldo_registrado": sueldo,
        })

    # Ordenar: vencidos primero → pendientes → pagados
    orden = {"vencido": 0, "pendiente": 1, "pagado": 2}
    resultado.sort(key=lambda x: orden.get(x["estado"], 9))

    return resultado


# ─────────────────────────────────────────────
#  SUELDOS – registro y eliminación
# ─────────────────────────────────────────────

@router.post("/admin/empleados/{empleado_id}/sueldos", response_model=SueldoResponse)
async def create_sueldo(
    empleado_id: str,
    data: SueldoCreate,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Verificar que no exista ya un pago en ese periodo
    existente = await db.sueldos.find_one({"empleado_id": empleado_id, "periodo": data.periodo})
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un sueldo registrado para ese periodo")

    now = datetime.now(timezone.utc).isoformat()
    sueldo_id = str(uuid.uuid4())
    doc = {
        "id": sueldo_id,
        "empleado_id": empleado_id,
        "empleado_nombre": f"{emp.get('nombre', '')} {emp.get('apellido', '')}".strip(),
        **data.dict(),
        "created_at": now,
    }
    await db.sueldos.insert_one(doc)
    # Marcar todos los adelantos y extras de ese período como consumidos por
    # este sueldo, para que no aparezcan más en próximos meses.
    await db.adelantos_sueldos.update_many(
        {"empleado_id": empleado_id, "periodo": data.periodo,
         "consumido_por_sueldo": {"$in": [None, False]}},
        {"$set": {"consumido_por_sueldo": sueldo_id}},
    )
    await db.extras_sueldos.update_many(
        {"empleado_id": empleado_id, "periodo": data.periodo,
         "consumido_por_sueldo": {"$in": [None, False]}},
        {"$set": {"consumido_por_sueldo": sueldo_id}},
    )
    await log_auditoria(user, "empleados", "registrar_sueldo",
                        f"Sueldo de {doc['empleado_nombre']} periodo {data.periodo}")
    return {**doc, "_id": None}


@router.delete("/admin/sueldos/{sueldo_id}")
async def delete_sueldo(sueldo_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    s = await db.sueldos.find_one({"id": sueldo_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    await db.sueldos.delete_one({"id": sueldo_id})
    # Liberar adelantos y extras que estaban marcados como consumidos por este sueldo
    await db.adelantos_sueldos.update_many(
        {"consumido_por_sueldo": sueldo_id},
        {"$set": {"consumido_por_sueldo": None}},
    )
    await db.extras_sueldos.update_many(
        {"consumido_por_sueldo": sueldo_id},
        {"$set": {"consumido_por_sueldo": None}},
    )
    return {"ok": True}


@router.get("/admin/empleados/{empleado_id}/sueldos", response_model=List[SueldoResponse])
async def get_sueldos_empleado(empleado_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    sueldos = await db.sueldos.find(
        {"empleado_id": empleado_id}, {"_id": 0}
    ).sort("periodo", -1).to_list(200)
    return sueldos


# ─────────────────────────────────────────────
#  ADELANTOS DE SUELDO
# ─────────────────────────────────────────────

@router.get("/admin/empleados/{empleado_id}/adelantos", response_model=List[AdelantoResponse])
async def get_adelantos_empleado(
    empleado_id: str,
    periodo: Optional[str] = None,
    incluir_consumidos: bool = False,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "empleados.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query: dict = {"empleado_id": empleado_id}
    if periodo:
        # Estrategia estricta:
        #  - Si el adelanto TIENE periodo cargado, exigimos que coincida exactamente.
        #  - Si NO tiene periodo (registros viejos), aceptamos por fecha del mes.
        # Antes era un $or "abierto", lo que hacía que un adelanto cargado un día
        # de marzo pero asignado al período febrero apareciera en los DOS meses.
        query["$or"] = [
            {"periodo": periodo},
            {"$and": [
                {"$or": [{"periodo": None}, {"periodo": ""}, {"periodo": {"$exists": False}}]},
                {"fecha": {"$regex": f"^{periodo}"}},
            ]},
        ]
    if not incluir_consumidos:
        # Por default ocultamos adelantos ya descontados en un sueldo pagado.
        query["consumido_por_sueldo"] = {"$in": [None, False]}
    adelantos = await db.adelantos_sueldos.find(query, {"_id": 0}).sort("fecha", 1).to_list(200)
    return adelantos


@router.post("/admin/empleados/{empleado_id}/adelantos", response_model=AdelantoResponse)
async def create_adelanto(
    empleado_id: str,
    data: AdelantoCreate,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "empleado_id": empleado_id,
        "empleado_nombre": f"{emp.get('nombre', '')} {emp.get('apellido', '')}".strip(),
        "periodo": data.periodo,
        "monto": data.monto,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "fecha": data.fecha,
        "notas": data.notas,
        "created_at": now,
    }
    await db.adelantos_sueldos.insert_one(doc)
    await log_auditoria(user, "empleados", "registrar_adelanto",
                        f"Adelanto de {doc['empleado_nombre']} periodo {data.periodo}: {data.monto}")
    return {**doc, "_id": None}


@router.delete("/admin/adelantos/{adelanto_id}")
async def delete_adelanto(adelanto_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    a = await db.adelantos_sueldos.find_one({"id": adelanto_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Adelanto no encontrado")
    await db.adelantos_sueldos.delete_one({"id": adelanto_id})
    return {"ok": True}


# ─────────────────────────────────────────────
#  EXTRAS DE SUELDO (horas extra, bonificaciones, etc.)
# ─────────────────────────────────────────────

@router.get("/admin/empleados/{empleado_id}/extras")
async def get_extras_empleado(
    empleado_id: str,
    periodo: Optional[str] = None,
    incluir_consumidos: bool = False,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "empleados.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query: dict = {"empleado_id": empleado_id}
    if periodo:
        query["$or"] = [
            {"periodo": periodo},
            {"$and": [
                {"$or": [{"periodo": None}, {"periodo": ""}, {"periodo": {"$exists": False}}]},
                {"fecha": {"$regex": f"^{periodo}"}},
            ]},
        ]
    if not incluir_consumidos:
        query["consumido_por_sueldo"] = {"$in": [None, False]}
    extras = await db.extras_sueldos.find(query, {"_id": 0}).sort("fecha", 1).to_list(200)
    return extras


@router.post("/admin/empleados/{empleado_id}/extras")
async def create_extra(
    empleado_id: str,
    data: dict,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    emp = await db.empleados.find_one({"id": empleado_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "empleado_id": empleado_id,
        "empleado_nombre": f"{emp.get('nombre', '')} {emp.get('apellido', '')}".strip(),
        "periodo": data.get("periodo"),
        "monto": float(data.get("monto", 0)),
        "moneda": data.get("moneda", "PYG"),
        "tipo_cambio": data.get("tipo_cambio"),
        "fecha": data.get("fecha", now[:10]),
        "descripcion": data.get("descripcion", "Extra"),
        "notas": data.get("notas"),
        "created_at": now,
    }
    await db.extras_sueldos.insert_one(doc)
    await log_auditoria(user, "empleados", "registrar_extra",
                        f"Extra de {doc['empleado_nombre']} periodo {doc['periodo']}: {doc['monto']}")
    return {**doc, "_id": None}


@router.delete("/admin/extras/{extra_id}")
async def delete_extra(extra_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "empleados.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    e = await db.extras_sueldos.find_one({"id": extra_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Extra no encontrado")
    await db.extras_sueldos.delete_one({"id": extra_id})
    return {"ok": True}
