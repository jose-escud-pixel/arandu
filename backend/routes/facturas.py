from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso
from models.schemas import FacturaCreate, FacturaResponse

router = APIRouter()


# ─────────────────────────────────────────────
#  FACTURAS – CRUD
# ─────────────────────────────────────────────

@router.get("/admin/facturas", response_model=List[FacturaResponse])
async def get_facturas(
    logo_tipo: Optional[str] = None,
    tipo: Optional[str] = None,          # emitida | recibida
    estado: Optional[str] = None,        # pendiente | pagada | anulada
    mes: Optional[str] = None,           # YYYY-MM  → filtra por fecha
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver facturas")
    query = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    if tipo and tipo != "todas":
        query["tipo"] = tipo
    if estado and estado != "todas":
        query["estado"] = estado
    if mes:
        # Filtra facturas cuya fecha empieza con YYYY-MM
        query["fecha"] = {"$regex": f"^{mes}"}
    facturas = await db.facturas.find(query, {"_id": 0}).sort("fecha", -1).to_list(1000)
    return facturas


async def _registrar_cobro_contrato(fac: dict, monto_pagado: float = None, fecha_pago: str = None):
    """
    Crea un cobro_contrato si la factura está vinculada a un contrato y no existe
    un cobro para ese periodo. Esto mantiene sincronizado el estado del contrato
    y el cálculo del balance.
    """
    contrato_id = fac.get("contrato_id")
    if not contrato_id:
        return
    fecha = fac.get("fecha_pago") or fecha_pago or fac.get("fecha", "")
    periodo = fecha[:7] if fecha else datetime.now(timezone.utc).strftime("%Y-%m")
    monto = monto_pagado or fac.get("monto_pagado") or fac.get("monto", 0)
    # Solo crear si no existe ya un cobro para este contrato en este periodo
    existing = await db.cobros_contratos.find_one({"contrato_id": contrato_id, "periodo": periodo})
    if not existing:
        cobro = {
            "id": str(uuid.uuid4()),
            "contrato_id": contrato_id,
            "periodo": periodo,
            "monto_pagado": float(monto),
            "fecha": fecha[:10] if fecha else datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "notas": f"Cobro auto-registrado desde factura {fac.get('numero', '')}",
            "from_factura_id": fac.get("id", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cobros_contratos.insert_one(cobro)


def _normalizar_presupuesto_ids(data_dict: dict) -> dict:
    """Garantiza consistencia entre presupuesto_id (legacy) y presupuesto_ids (nuevo)."""
    ids = list(data_dict.get("presupuesto_ids") or [])
    legacy = data_dict.get("presupuesto_id")
    # Si vino solo el campo legacy, migrarlo al array
    if legacy and legacy not in ids:
        ids.append(legacy)
    # Si el array tiene exactamente uno, mantener legacy en sync; si tiene 0 o >1, limpiar legacy
    data_dict["presupuesto_ids"] = ids
    data_dict["presupuesto_id"] = ids[0] if len(ids) == 1 else (None if not ids else None)
    return data_dict


@router.get("/admin/facturas/{factura_id}", response_model=FacturaResponse)
async def get_factura(factura_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return fac


@router.post("/admin/facturas", response_model=FacturaResponse)
async def create_factura(data: FacturaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear facturas")
    now = datetime.now(timezone.utc).isoformat()
    doc = _normalizar_presupuesto_ids({
        "id": str(uuid.uuid4()),
        **data.dict(),
        "created_at": now,
    })
    await db.facturas.insert_one(doc)
    await log_auditoria(user, "facturas", "crear_factura",
                        f"Factura {data.numero} ({data.tipo}) creada")
    return {**doc, "_id": None}


@router.put("/admin/facturas/{factura_id}", response_model=FacturaResponse)
async def update_factura(factura_id: str, data: FacturaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    updates = _normalizar_presupuesto_ids(data.dict())
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})
    await log_auditoria(user, "facturas", "editar_factura",
                        f"Factura {factura_id} actualizada")
    fac_actualizada = {**fac, **updates}
    # Si la factura está pagada y tiene contrato: solo marcar contrato como cobrado
    # (el balance lee las facturas con contrato_id en su propia sección, sin cobros duplicados)
    if fac_actualizada.get("estado") == "pagada" and fac_actualizada.get("tipo") == "emitida":
        if fac_actualizada.get("contrato_id"):
            await db.contratos.update_one(
                {"id": fac_actualizada["contrato_id"]},
                {"$set": {"estado": "cobrado"}}
            )
    return fac_actualizada


@router.patch("/admin/facturas/{factura_id}/estado")
async def update_estado_factura(
    factura_id: str,
    estado: str,                     # pagada | pendiente | anulada | parcial
    fecha_pago: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    updates: dict = {"estado": estado}
    if estado in ("pagada", "parcial"):
        updates["fecha_pago"] = fecha_pago or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    elif estado == "pendiente":
        updates["fecha_pago"] = None
        updates["monto_pagado"] = None
        updates["pagos"] = []        # limpiar historial de pagos al revertir
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})

    # Si la factura es emitida y se marca como pagada, auto-cobrar presupuestos y contratos vinculados
    if estado == "pagada" and fac.get("tipo") == "emitida":
        # Presupuestos vinculados
        pids = list(fac.get("presupuesto_ids") or [])
        if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
            pids.append(fac["presupuesto_id"])
        for pid in pids:
            await db.presupuestos.update_one(
                {"id": pid},
                {"$set": {"estado": "cobrado"}}
            )
        # Contrato vinculado: solo marcar como cobrado (el balance lo lee desde la factura directamente)
        if fac.get("contrato_id"):
            await db.contratos.update_one(
                {"id": fac["contrato_id"]},
                {"$set": {"estado": "cobrado"}}
            )

    return {"estado": estado, "fecha_pago": updates.get("fecha_pago")}


@router.patch("/admin/facturas/{factura_id}/pago-parcial")
async def pago_parcial_factura(
    factura_id: str,
    data: dict,   # { monto_pagado, fecha_pago, cuenta_id?, tipo_cambio?, numero_recibo? }
    user: dict = Depends(require_authenticated)
):
    """Registra un pago en una factura pendiente/parcial.
    Acumula pagos en pagos[], guarda cuenta bancaria y tipo de cambio,
    y auto-genera un recibo.
    """
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    monto_nuevo = float(data.get("monto_pagado", 0))
    fecha_pago  = data.get("fecha_pago") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cuenta_id   = data.get("cuenta_id")
    tipo_cambio = data.get("tipo_cambio")
    numero_recibo_manual = data.get("numero_recibo")

    if monto_nuevo <= 0:
        raise HTTPException(status_code=400, detail="El monto pagado debe ser mayor a 0")

    # ── Obtener nombre de la cuenta si se proveyó ────────────────
    cuenta_nombre = None
    if cuenta_id:
        cuenta_doc = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0, "nombre": 1})
        if cuenta_doc:
            cuenta_nombre = cuenta_doc.get("nombre")

    # ── Calcular monto en moneda de la cuenta (si hay tipo de cambio) ──
    monto_cuenta = None
    if tipo_cambio and tipo_cambio > 0:
        # Factura en moneda extranjera → convertir a PYG
        # o factura en PYG pagada a cuenta USD → convertir a USD
        monto_cuenta = round(monto_nuevo / tipo_cambio, 2)

    # ── Auto-generar número de recibo ────────────────────────────
    if numero_recibo_manual:
        recibo_numero = numero_recibo_manual
    else:
        ultimo_rec = await db.recibos.find_one(
            {}, {"numero": 1, "_id": 0}, sort=[("created_at", -1)]
        )
        if ultimo_rec and ultimo_rec.get("numero"):
            try:
                n = int(ultimo_rec["numero"].split("-")[-1]) + 1
            except Exception:
                n = 1
        else:
            n = (await db.recibos.count_documents({})) + 1
        recibo_numero = f"REC-{n:04d}"

    pago_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # ── Crear recibo en colección ────────────────────────────────
    recibo_doc = {
        "id": str(uuid.uuid4()),
        "numero": recibo_numero,
        "factura_id": factura_id,
        "factura_numero": fac.get("numero", ""),
        "razon_social": fac.get("razon_social", ""),
        "ruc": fac.get("ruc"),
        "monto": monto_nuevo,
        "moneda": fac.get("moneda", "PYG"),
        "fecha_pago": fecha_pago,
        "logo_tipo": fac.get("logo_tipo", "arandujar"),
        "cuenta_id": cuenta_id,
        "cuenta_nombre": cuenta_nombre,
        "tipo_cambio": tipo_cambio,
        "monto_cuenta": monto_cuenta,
        "pago_id": pago_id,
        "notas": None,
        "created_at": now,
    }
    await db.recibos.insert_one(recibo_doc)

    # ── Acumular pagos en array ──────────────────────────────────
    pagos_previos = fac.get("pagos") or []
    nuevo_pago = {
        "id": pago_id,
        "monto": monto_nuevo,
        "fecha": fecha_pago,
        "registrado_por": user.get("name", ""),
        "recibo_id": recibo_doc["id"],
        "recibo_numero": recibo_numero,
        "cuenta_id": cuenta_id,
        "cuenta_nombre": cuenta_nombre,
        "tipo_cambio": tipo_cambio,
        "monto_cuenta": monto_cuenta,
        "created_at": now,
    }
    pagos_actualizados = pagos_previos + [nuevo_pago]
    monto_acumulado = sum(p["monto"] for p in pagos_actualizados)

    # ── Determinar estado ────────────────────────────────────────
    monto_total = float(fac["monto"])
    if monto_acumulado >= monto_total:
        nuevo_estado = "pagada"
        monto_acumulado = monto_total
    else:
        nuevo_estado = "parcial"

    updates = {
        "estado": nuevo_estado,
        "monto_pagado": monto_acumulado,
        "fecha_pago": fecha_pago,
        "pagos": pagos_actualizados,
    }
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})
    await log_auditoria(user, "facturas", "pago_parcial",
                        f"Pago de {monto_nuevo} en factura {factura_id} · recibo {recibo_numero}")

    # ── Si pagó completo, marcar presupuestos y contrato ─────────
    if nuevo_estado == "pagada":
        pids = list(fac.get("presupuesto_ids") or [])
        if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
            pids.append(fac["presupuesto_id"])
        for pid in pids:
            await db.presupuestos.update_one(
                {"id": pid}, {"$set": {"estado": "cobrado"}}
            )
        if fac.get("contrato_id"):
            await db.contratos.update_one(
                {"id": fac["contrato_id"]}, {"$set": {"estado": "cobrado"}}
            )
    return {**updates, "recibo": {"id": recibo_doc["id"], "numero": recibo_numero}}


@router.patch("/admin/facturas/{factura_id}/pago/{pago_id}")
async def editar_pago(
    factura_id: str,
    pago_id: str,
    data: dict,   # { monto?, fecha?, cuenta_id?, tipo_cambio? }
    user: dict = Depends(require_authenticated)
):
    """Edita un pago individual dentro del historial de pagos de una factura."""
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    pagos = list(fac.get("pagos") or [])
    idx = next((i for i, p in enumerate(pagos) if p.get("id") == pago_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    pago = dict(pagos[idx])

    # Actualizar campos editables
    if "monto" in data:
        pago["monto"] = float(data["monto"])
    if "fecha" in data:
        pago["fecha"] = data["fecha"]
    if "cuenta_id" in data:
        pago["cuenta_id"] = data["cuenta_id"]
        # Refrescar nombre de cuenta
        if data["cuenta_id"]:
            c = await db.cuentas_bancarias.find_one({"id": data["cuenta_id"]}, {"nombre": 1, "_id": 0})
            pago["cuenta_nombre"] = c.get("nombre") if c else None
        else:
            pago["cuenta_nombre"] = None
    if "tipo_cambio" in data:
        tc = data["tipo_cambio"]
        pago["tipo_cambio"] = float(tc) if tc else None
        if pago["tipo_cambio"] and pago.get("monto"):
            pago["monto_cuenta"] = round(pago["monto"] / pago["tipo_cambio"], 2)

    pagos[idx] = pago

    # Recalcular monto acumulado
    monto_acumulado = sum(p["monto"] for p in pagos)
    monto_total = float(fac["monto"])
    if monto_acumulado >= monto_total:
        nuevo_estado = "pagada"
        monto_acumulado = monto_total
    elif monto_acumulado > 0:
        nuevo_estado = "parcial"
    else:
        nuevo_estado = "pendiente"

    await db.facturas.update_one(
        {"id": factura_id},
        {"$set": {"pagos": pagos, "monto_pagado": monto_acumulado, "estado": nuevo_estado}}
    )

    # Actualizar también el recibo vinculado si existe
    if pago.get("recibo_id"):
        recibo_updates = {}
        if "monto" in data:
            recibo_updates["monto"] = float(data["monto"])
        if "fecha" in data:
            recibo_updates["fecha_pago"] = data["fecha"]
        if "cuenta_id" in data:
            recibo_updates["cuenta_id"] = data["cuenta_id"]
            recibo_updates["cuenta_nombre"] = pago.get("cuenta_nombre")
        if "tipo_cambio" in data:
            recibo_updates["tipo_cambio"] = pago.get("tipo_cambio")
            recibo_updates["monto_cuenta"] = pago.get("monto_cuenta")
        if recibo_updates:
            await db.recibos.update_one({"id": pago["recibo_id"]}, {"$set": recibo_updates})

    await log_auditoria(user, "facturas", "editar_pago",
                        f"Pago {pago_id} de factura {factura_id} editado")
    return {"ok": True, "pago": pago, "nuevo_estado": nuevo_estado}


@router.delete("/admin/facturas/{factura_id}/pago/{pago_id}")
async def eliminar_pago(
    factura_id: str,
    pago_id: str,
    user: dict = Depends(require_authenticated)
):
    """Elimina un pago individual del historial. Actualiza el estado de la factura."""
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    pagos = list(fac.get("pagos") or [])
    pago = next((p for p in pagos if p.get("id") == pago_id), None)
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    pagos_restantes = [p for p in pagos if p.get("id") != pago_id]
    monto_acumulado = sum(p["monto"] for p in pagos_restantes)
    monto_total = float(fac["monto"])

    if monto_acumulado >= monto_total:
        nuevo_estado = "pagada"
    elif monto_acumulado > 0:
        nuevo_estado = "parcial"
    else:
        nuevo_estado = "pendiente"

    await db.facturas.update_one(
        {"id": factura_id},
        {"$set": {
            "pagos": pagos_restantes,
            "monto_pagado": monto_acumulado if monto_acumulado > 0 else None,
            "estado": nuevo_estado,
            "fecha_pago": pagos_restantes[-1]["fecha"] if pagos_restantes else None,
        }}
    )

    # Eliminar el recibo vinculado
    if pago.get("recibo_id"):
        await db.recibos.delete_one({"id": pago["recibo_id"]})

    await log_auditoria(user, "facturas", "eliminar_pago",
                        f"Pago {pago_id} eliminado de factura {factura_id}")
    return {"ok": True, "nuevo_estado": nuevo_estado}


@router.delete("/admin/facturas/{factura_id}")
async def delete_factura(factura_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    await db.facturas.delete_one({"id": factura_id})
    await log_auditoria(user, "facturas", "eliminar_factura",
                        f"Factura {factura_id} eliminada")
    return {"ok": True}


# ─────────────────────────────────────────────
#  RESUMEN por periodo y empresa
# ─────────────────────────────────────────────

@router.get("/admin/facturas/resumen")
async def get_resumen_facturas(
    mes: Optional[str] = None,           # YYYY-MM
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    """Devuelve totales por tipo y estado para el periodo/empresa seleccionados."""
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}

    facturas = await db.facturas.find(query, {"_id": 0,
        "tipo": 1, "estado": 1, "monto": 1, "moneda": 1}).to_list(5000)

    def totales(lst):
        return {
            "cantidad": len(lst),
            "monto_pyg": sum(
                f["monto"] * (f.get("tipo_cambio") or 1) if f.get("moneda") != "PYG"
                else f["monto"]
                for f in lst
            )
        }

    emitidas = [f for f in facturas if f["tipo"] == "emitida"]
    recibidas = [f for f in facturas if f["tipo"] == "recibida"]

    return {
        "emitidas":          totales(emitidas),
        "emitidas_pagadas":  totales([f for f in emitidas if f["estado"] == "pagada"]),
        "emitidas_pendientes": totales([f for f in emitidas if f["estado"] == "pendiente"]),
        "recibidas":         totales(recibidas),
        "recibidas_pagadas": totales([f for f in recibidas if f["estado"] == "pagada"]),
        "recibidas_pendientes": totales([f for f in recibidas if f["estado"] == "pendiente"]),
    }
