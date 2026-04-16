from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
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
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
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
    data: dict,   # { monto_pagado, fecha_pago, numero_recibo?, notas? }
    user: dict = Depends(require_authenticated)
):
    """Registra un pago (parcial o total) en una factura.
    - Factura contado → el frontend envía el monto total (la fecha de pago = fecha de la factura).
    - Factura crédito → se acepta cualquier monto parcial; la fecha de pago es la real.
    Genera siempre un recibo con número consecutivo por empresa (logo_tipo).
    Si el cliente tiene retención de IVA, genera un egreso automático por ese monto.
    """
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    monto_nuevo = float(data.get("monto_pagado", 0))
    fecha_pago = data.get("fecha_pago") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    numero_recibo = (data.get("numero_recibo") or "").strip() or None
    notas_recibo = data.get("notas") or ""

    if monto_nuevo <= 0:
        raise HTTPException(status_code=400, detail="El monto pagado debe ser mayor a 0")

    # Factura contado: no se permite pago parcial — debe pagar total exacto
    if (fac.get("forma_pago") or "").lower() == "contado":
        monto_pendiente = float(fac["monto"]) - float(fac.get("monto_pagado") or 0)
        if abs(monto_nuevo - monto_pendiente) > 0.01:
            raise HTTPException(status_code=400,
                detail="Factura contado: el monto debe coincidir con el total pendiente")
        # En contado la fecha de pago es la de la factura
        fecha_pago = fac.get("fecha") or fecha_pago

    # ── Generar recibo ─────────────────────────────────────────
    recibo_doc = await _crear_recibo(
        factura=fac,
        monto=monto_nuevo,
        fecha_pago=fecha_pago,
        user=user,
        numero_recibo=numero_recibo,
        notas=notas_recibo,
    )

    # ── Acumular pagos en array ──────────────────────────────────
    pagos_previos = fac.get("pagos") or []
    nuevo_pago = {
        "id": str(uuid.uuid4()),
        "monto": monto_nuevo,
        "fecha": fecha_pago,
        "recibo_id": recibo_doc["id"],
        "recibo_numero": recibo_doc["numero"],
        "registrado_por": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    pagos_actualizados = pagos_previos + [nuevo_pago]
    monto_acumulado = sum(p["monto"] for p in pagos_actualizados)

    # ── Determinar estado ────────────────────────────────────────
    monto_total = float(fac["monto"])
    if monto_acumulado >= monto_total:
        nuevo_estado = "pagada"
        monto_acumulado = monto_total   # no superar el total exacto
    else:
        nuevo_estado = "parcial"

    updates = {
        "estado": nuevo_estado,
        "monto_pagado": monto_acumulado,
        "fecha_pago": fecha_pago,
        "pagos": pagos_actualizados,
    }
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})
    await log_auditoria(user, "facturas", "pago",
                        f"Pago de {monto_nuevo} en factura {fac.get('numero')} "
                        f"(recibo {recibo_doc['numero']}, acumulado: {monto_acumulado})")

    # ── Retención IVA automática: si el cliente aplica retención, crear egreso ──
    await _crear_egreso_retencion(fac, monto_nuevo, fecha_pago, recibo_doc, user)

    # ── Si pagó completo, marcar presupuestos y contrato ─────────
    if nuevo_estado == "pagada":
        pids = list(fac.get("presupuesto_ids") or [])
        if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
            pids.append(fac["presupuesto_id"])
        for pid in pids:
            await db.presupuestos.update_one(
                {"id": pid},
                {"$set": {"estado": "cobrado"}}
            )
        if fac.get("contrato_id"):
            await db.contratos.update_one(
                {"id": fac["contrato_id"]},
                {"$set": {"estado": "cobrado"}}
            )
    return {**updates, "recibo": recibo_doc}


# ─────────────────────────────────────────────
#  RECIBOS – helpers y endpoints
# ─────────────────────────────────────────────

async def _crear_recibo(factura: dict, monto: float, fecha_pago: str,
                         user: dict, numero_recibo: str = None, notas: str = ""):
    """Crea un recibo con número consecutivo por empresa (logo_tipo).
    Si numero_recibo viene vacío, lo autogenera como next(max) + 1.
    """
    logo_tipo = factura.get("logo_tipo") or "arandujar"

    if not numero_recibo:
        # Buscar el último recibo de este logo_tipo y sumar 1
        last = await db.recibos.find_one(
            {"logo_tipo": logo_tipo, "numero": {"$regex": r"^\d+$"}},
            sort=[("numero", -1)],
            projection={"_id": 0, "numero": 1}
        )
        next_num = 1
        if last and last.get("numero"):
            try:
                next_num = int(last["numero"]) + 1
            except Exception:
                next_num = 1
        numero_recibo = f"{next_num:06d}"

    doc = {
        "id": str(uuid.uuid4()),
        "numero": numero_recibo,
        "factura_id": factura.get("id"),
        "factura_numero": factura.get("numero"),
        "empresa_id": factura.get("empresa_id") or factura.get("_empresa_id"),
        "razon_social": factura.get("razon_social") or factura.get("empresa_nombre"),
        "ruc": factura.get("ruc"),
        "monto": monto,
        "moneda": factura.get("moneda") or "PYG",
        "fecha_pago": fecha_pago,
        "logo_tipo": logo_tipo,
        "notas": notas,
        "created_by": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.recibos.insert_one(dict(doc))
    return doc


async def _crear_egreso_retencion(factura: dict, monto_pagado: float, fecha_pago: str,
                                    recibo: dict, user: dict):
    """Si el cliente aplica retención de IVA, genera un egreso automático.
    Busca la empresa cliente por razon_social+ruc o empresa_id y revisa aplica_retencion."""
    empresa = None
    if factura.get("empresa_id"):
        empresa = await db.empresas.find_one({"id": factura["empresa_id"]}, {"_id": 0})
    if not empresa and factura.get("ruc"):
        empresa = await db.empresas.find_one({"ruc": factura["ruc"]}, {"_id": 0})
    if not empresa or not empresa.get("aplica_retencion"):
        return
    pct = float(empresa.get("porcentaje_retencion") or 0)
    if pct <= 0:
        return
    # La retención se calcula sobre el IVA: si la factura tiene iva, tomar iva*pct/100
    # si no, usar monto_pagado*pct/100 (asumiendo que pct es sobre el monto pagado)
    iva_factura = float(factura.get("iva") or 0)
    if iva_factura > 0:
        # Prorrateo: porcentaje del pago sobre el total, aplicado al iva
        monto_total = float(factura.get("monto") or 1)
        ratio = monto_pagado / monto_total if monto_total else 1
        retencion = iva_factura * ratio * (pct / 100)
    else:
        retencion = monto_pagado * (pct / 100)
    if retencion <= 0:
        return
    egreso = {
        "id": str(uuid.uuid4()),
        "descripcion": f"Retención IVA {pct}% — Factura {factura.get('numero')} (recibo {recibo.get('numero')})",
        "categoria": "Retención IVA",
        "monto": -abs(retencion),   # negativo indica egreso en balance
        "moneda": factura.get("moneda") or "PYG",
        "tipo_cambio": factura.get("tipo_cambio"),
        "monto_pyg": -abs(retencion * float(factura.get("tipo_cambio") or 1)
                          if factura.get("moneda") != "PYG" else retencion),
        "fecha": fecha_pago,
        "logo_tipo": factura.get("logo_tipo") or "arandujar",
        "notas": f"Egreso automático generado al cobrar. Cliente: {empresa.get('nombre')}",
        "factura_id": factura.get("id"),
        "recibo_id": recibo.get("id"),
        "auto": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ingresos_varios.insert_one(dict(egreso))
    await log_auditoria(user, "ingresos_varios", "egreso_retencion_auto",
                        f"Retención IVA {pct}% auto-generada: {retencion} PYG")


@router.get("/admin/recibos")
async def get_recibos(
    factura_id: Optional[str] = None,
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query: dict = {}
    if factura_id:
        query["factura_id"] = factura_id
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    recibos = await db.recibos.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return recibos


@router.post("/admin/facturas/migrar-credito")
async def migrar_facturas_credito(user: dict = Depends(require_authenticated)):
    """Detecta facturas cuya fecha_pago != fecha de factura y las convierte a crédito,
    generando automáticamente un recibo con número consecutivo.
    Solo aplica a facturas emitidas ya pagadas."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo admin")

    facturas = await db.facturas.find({
        "tipo": "emitida",
        "estado": "pagada",
    }, {"_id": 0}).to_list(5000)

    migradas = 0
    for fac in facturas:
        fecha_factura = (fac.get("fecha") or "")[:10]
        fecha_pago = (fac.get("fecha_pago") or "")[:10]
        if not fecha_pago or fecha_pago == fecha_factura:
            continue
        # Si ya tiene pagos registrados con recibo, skip
        if any(p.get("recibo_id") for p in (fac.get("pagos") or [])):
            continue
        # Crear recibo por el total
        monto = float(fac.get("monto_pagado") or fac["monto"])
        recibo = await _crear_recibo(
            factura=fac,
            monto=monto,
            fecha_pago=fecha_pago,
            user=user,
            numero_recibo=None,
            notas="Recibo auto-generado por migración (contado → crédito)",
        )
        nuevo_pago = {
            "id": str(uuid.uuid4()),
            "monto": monto,
            "fecha": fecha_pago,
            "recibo_id": recibo["id"],
            "recibo_numero": recibo["numero"],
            "registrado_por": f"migración ({user.get('name','')})",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.facturas.update_one(
            {"id": fac["id"]},
            {"$set": {"forma_pago": "credito", "pagos": [nuevo_pago], "monto_pagado": monto}}
        )
        # Intentar crear egreso de retención también
        await _crear_egreso_retencion(fac, monto, fecha_pago, recibo, user)
        migradas += 1

    return {"migradas": migradas, "total_revisadas": len(facturas)}


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
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return {
            "emitidas": {"cantidad": 0, "monto_pyg": 0},
            "emitidas_pagadas": {"cantidad": 0, "monto_pyg": 0},
            "emitidas_pendientes": {"cantidad": 0, "monto_pyg": 0},
            "recibidas": {"cantidad": 0, "monto_pyg": 0},
            "recibidas_pagadas": {"cantidad": 0, "monto_pyg": 0},
            "recibidas_pendientes": {"cantidad": 0, "monto_pyg": 0},
        }
    query.update(logo_q)
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
