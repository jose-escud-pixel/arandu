from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime, timezone
import uuid

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso, log_auditoria, apply_logo_filter, is_forbidden
from routes.cotizaciones import tipo_cambio_usd_sugerido

router = APIRouter()


class NotaCreditoCreate(BaseModel):
    numero: str
    fecha: str
    tipo: str = "venta"                  # venta | compra
    factura_id: Optional[str] = None
    factura_numero: Optional[str] = None
    compra_id: Optional[str] = None
    compra_numero_factura: Optional[str] = None
    empresa_id: Optional[str] = None
    razon_social: Optional[str] = None
    ruc: Optional[str] = None
    proveedor_id: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    motivo: str
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    logo_tipo: str = "arandujar"
    estado: str = "emitida"
    notas: Optional[str] = None
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    # Tipo de motivo: descuento no toca stock; devolucion restaura stock
    tipo_motivo: str = "descuento"
    motivo_detalle: Optional[str] = None
    items_devueltos: List[Any] = []
    # Reservado para compatibilidad — ya no se usa en el formulario (siempre se genera saldo_favor para ventas)
    tipo_cobro: Optional[str] = None


class NotaCreditoResponse(NotaCreditoCreate):
    id: str
    created_at: str
    updated_at: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Helpers de monto
# ─────────────────────────────────────────────────────────────

def _monto_pyg(doc: dict) -> float:
    if doc.get("moneda", "PYG") == "PYG":
        return float(doc.get("monto") or 0)
    tc = float(doc.get("tipo_cambio") or 0)
    return float(doc.get("monto") or 0) * tc if tc > 0 else 0


async def _asegurar_tc_fiscal_nota(data: dict) -> dict:
    if (data.get("moneda") or "PYG").upper() != "USD":
        return data
    try:
        tc = float(data.get("tipo_cambio") or 0)
    except (TypeError, ValueError):
        tc = 0
    if tc > 0:
        return data
    sugerido = await tipo_cambio_usd_sugerido((data.get("fecha") or "")[:10])
    if not sugerido:
        raise HTTPException(status_code=400, detail="Falta el tipo de cambio fiscal para esta nota de crédito USD.")
    data["tipo_cambio"] = sugerido
    data["tipo_cambio_fuente"] = "Cambios Chaco"
    data["tipo_cambio_fecha"] = (data.get("fecha") or "")[:10]
    data["tipo_cambio_fiscal_auto"] = True
    return data


# ─────────────────────────────────────────────────────────────
# Stock — devoluciones
# ─────────────────────────────────────────────────────────────

async def _restaurar_stock_devolucion(doc: dict):
    """Incrementa stock_actual en db.productos para cada ítem con producto_id
    cuando tipo_motivo == 'devolucion'. Silencioso si el módulo no existe."""
    if doc.get("tipo_motivo") != "devolucion":
        return
    for item in (doc.get("items_devueltos") or []):
        pid = item.get("producto_id")
        cantidad = float(item.get("cantidad") or 0)
        if not pid or cantidad <= 0:
            continue
        try:
            await db.productos.update_one({"id": pid}, {"$inc": {"stock_actual": cantidad}})
        except Exception:
            pass


async def _revertir_stock_devolucion(doc: dict):
    """Decrementa stock_actual al eliminar o editar una nota de devolución."""
    if doc.get("tipo_motivo") != "devolucion":
        return
    for item in (doc.get("items_devueltos") or []):
        pid = item.get("producto_id")
        cantidad = float(item.get("cantidad") or 0)
        if not pid or cantidad <= 0:
            continue
        try:
            await db.productos.update_one({"id": pid}, {"$inc": {"stock_actual": -cantidad}})
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────
# Crédito sobre COMPRA (plan de cuentas pagar)
# ─────────────────────────────────────────────────────────────

def _credito_compra_entry(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "numero": doc.get("numero"),
        "fecha": doc.get("fecha"),
        "monto": doc.get("monto") or 0,
        "moneda": doc.get("moneda", "PYG"),
        "tipo_cambio": doc.get("tipo_cambio"),
        "motivo": doc.get("motivo"),
    }


async def _aplicar_credito_compra(doc: dict):
    """Registra esta nota en compra.creditos[] reduciendo el saldo pendiente a pagar."""
    if doc.get("tipo") != "compra" or not (doc.get("compra_id") or doc.get("compra_numero_factura")):
        return
    compra_query = {"id": doc["compra_id"]} if doc.get("compra_id") else {"numero_factura": doc.get("compra_numero_factura")}
    compra = await db.compras.find_one(compra_query, {"_id": 0, "id": 1, "numero_factura": 1, "proveedor_id": 1, "proveedor_nombre": 1, "moneda": 1})
    if not compra:
        raise HTTPException(status_code=400, detail="La compra vinculada no existe")
    proveedor_ok = (
        not doc.get("proveedor_id")
        or not compra.get("proveedor_id")
        or doc.get("proveedor_id") == compra.get("proveedor_id")
    )
    nombre_ok = (
        not doc.get("proveedor_nombre")
        or not compra.get("proveedor_nombre")
        or doc.get("proveedor_nombre") == compra.get("proveedor_nombre")
    )
    if not proveedor_ok and not nombre_ok:
        raise HTTPException(status_code=400, detail="La compra vinculada pertenece a otro proveedor")
    if doc.get("moneda") and compra.get("moneda") and doc.get("moneda") != compra.get("moneda"):
        raise HTTPException(status_code=400, detail="La nota y la compra vinculada deben tener la misma moneda")
    await db.compras.update_one({"id": compra["id"]}, {"$pull": {"creditos": {"id": doc["id"]}}})
    await db.compras.update_one({"id": compra["id"]}, {"$push": {"creditos": _credito_compra_entry(doc)}})
    if not doc.get("compra_id"):
        doc["compra_id"] = compra["id"]
    if not doc.get("compra_numero_factura"):
        doc["compra_numero_factura"] = compra.get("numero_factura")


async def _revertir_credito_compra(doc: dict):
    if doc.get("tipo") != "compra" or not doc.get("compra_id"):
        return
    await db.compras.update_one({"id": doc["compra_id"]}, {"$pull": {"creditos": {"id": doc["id"]}}})


# ─────────────────────────────────────────────────────────────
# Crédito sobre FACTURA DE VENTA (plan de cuentas cobrar)
# ─────────────────────────────────────────────────────────────

def _credito_factura_entry(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "numero": doc.get("numero"),
        "fecha": doc.get("fecha"),
        "monto": doc.get("monto") or 0,
        "moneda": doc.get("moneda", "PYG"),
        "tipo_cambio": doc.get("tipo_cambio"),
        "motivo": doc.get("motivo"),
    }


async def _aplicar_credito_factura(doc: dict):
    """Registra esta nota en factura.notas_credito[] reduciendo el saldo pendiente a cobrar.
    Aplica siempre que haya factura_id, independientemente del estado de la factura:
    - Si está pendiente/parcial: reduce el saldo en el plan de cuentas (cobrar)
    - Si ya está pagada: queda registrada la vinculación (saldo a favor se gestiona aparte)
    """
    if doc.get("tipo") not in (None, "venta") or not doc.get("factura_id"):
        return
    factura = await db.facturas.find_one(
        {"id": doc["factura_id"]},
        {"_id": 0, "id": 1, "numero": 1, "empresa_id": 1, "moneda": 1, "estado": 1}
    )
    if not factura:
        return  # silencioso — la factura puede haberse eliminado
    if doc.get("moneda") and factura.get("moneda") and doc.get("moneda") != factura.get("moneda"):
        raise HTTPException(status_code=400, detail="La nota y la factura vinculada deben tener la misma moneda")
    # Primero eliminar la entrada anterior (si existe) para evitar duplicados en edición
    await db.facturas.update_one({"id": factura["id"]}, {"$pull": {"notas_credito": {"id": doc["id"]}}})
    await db.facturas.update_one({"id": factura["id"]}, {"$push": {"notas_credito": _credito_factura_entry(doc)}})


async def _revertir_credito_factura(doc: dict):
    if doc.get("tipo") not in (None, "venta") or not doc.get("factura_id"):
        return
    await db.facturas.update_one({"id": doc["factura_id"]}, {"$pull": {"notas_credito": {"id": doc["id"]}}})


# ─────────────────────────────────────────────────────────────
# Saldo a favor del cliente
# ─────────────────────────────────────────────────────────────

async def _gestionar_saldo_favor(doc: dict):
    """Crea/actualiza un registro en saldos_favor cuando tipo_cobro == 'saldo_favor'.
    Solo aplica cuando la factura vinculada ya fue pagada y el usuario eligió generar
    saldo a favor del cliente (en lugar de reembolso directo).
    """
    if doc.get("tipo_cobro") != "saldo_favor":
        return  # solo cuando el usuario eligió esta opción
    if doc.get("tipo") not in (None, "venta"):
        return  # saldo a favor solo aplica a ventas (crédito al cliente)
    if not doc.get("empresa_id"):
        return  # sin empresa identificada no se puede rastrear el saldo

    # Buscar si ya existe un saldo_favor para esta nota (edición)
    existing_sf = await db.saldos_favor.find_one({"nota_credito_id": doc["id"]}, {"_id": 0})
    if existing_sf:
        # Actualizar el monto disponible (puede haber cambiado en edición)
        aplicado = float(existing_sf.get("monto_aplicado") or 0)
        nuevo_disponible = max(float(doc.get("monto") or 0) - aplicado, 0)
        await db.saldos_favor.update_one(
            {"nota_credito_id": doc["id"]},
            {"$set": {
                "monto_total": float(doc.get("monto") or 0),
                "monto_disponible": nuevo_disponible,
                "estado": "disponible" if nuevo_disponible > 0 else "aplicado",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        return

    sf_doc = {
        "id": str(uuid.uuid4()),
        "logo_tipo": doc.get("logo_tipo", "arandujar"),
        # Datos del cliente
        "empresa_id": doc.get("empresa_id"),
        "razon_social": doc.get("razon_social"),
        "ruc": doc.get("ruc"),
        # Monto
        "moneda": doc.get("moneda", "PYG"),
        "tipo_cambio": doc.get("tipo_cambio"),
        "monto_total": float(doc.get("monto") or 0),
        "monto_disponible": float(doc.get("monto") or 0),
        "monto_aplicado": 0.0,
        # Origen
        "nota_credito_id": doc["id"],
        "nota_credito_numero": doc.get("numero"),
        "factura_origen_id": doc.get("factura_id"),
        "factura_origen_numero": doc.get("factura_numero"),
        # Estado
        "estado": "disponible",   # disponible | parcial | aplicado | anulado
        "aplicaciones": [],       # [{factura_id, factura_numero, monto, fecha, registrado_por}]
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.saldos_favor.insert_one(sf_doc)


async def _revertir_saldo_favor(doc: dict):
    """Marca como anulado el saldo_favor vinculado a esta nota al eliminar/editar."""
    if doc.get("tipo_cobro") != "saldo_favor":
        return
    sf = await db.saldos_favor.find_one({"nota_credito_id": doc.get("id")}, {"_id": 0})
    if not sf:
        return
    await db.saldos_favor.update_one(
        {"nota_credito_id": doc["id"]},
        {"$set": {
            "estado": "anulado",
            "monto_disponible": 0.0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )


# ─────────────────────────────────────────────────────────────
# Saldo a favor del proveedor
# ─────────────────────────────────────────────────────────────

async def _gestionar_saldo_favor_proveedor(doc: dict):
    """Crea/actualiza un registro en saldos_favor cuando tipo_cobro == 'saldo_favor'
    en notas de tipo compra. Solo cuando la compra ya fue pagada y el usuario eligió
    registrar saldo a favor con el proveedor (en lugar de reembolso)."""
    if doc.get("tipo_cobro") != "saldo_favor":
        return
    if doc.get("tipo") != "compra":
        return
    if not doc.get("proveedor_id") and not doc.get("proveedor_nombre"):
        return

    existing_sf = await db.saldos_favor.find_one(
        {"nota_credito_id": doc["id"], "entidad_tipo": "proveedor"}, {"_id": 0}
    )
    if existing_sf:
        aplicado = float(existing_sf.get("monto_aplicado") or 0)
        nuevo_disponible = max(float(doc.get("monto") or 0) - aplicado, 0)
        await db.saldos_favor.update_one(
            {"nota_credito_id": doc["id"], "entidad_tipo": "proveedor"},
            {"$set": {
                "monto_total": float(doc.get("monto") or 0),
                "monto_disponible": nuevo_disponible,
                "estado": "disponible" if nuevo_disponible > 0 else "aplicado",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        return

    sf_doc = {
        "id": str(uuid.uuid4()),
        "logo_tipo": doc.get("logo_tipo", "arandujar"),
        "entidad_tipo": "proveedor",      # distingue de saldos de clientes
        # Datos del proveedor
        "proveedor_id": doc.get("proveedor_id"),
        "proveedor_nombre": doc.get("proveedor_nombre"),
        "empresa_id": doc.get("proveedor_id"),   # para compatibilidad con queries genéricas
        "razon_social": doc.get("proveedor_nombre"),
        "ruc": None,
        # Monto
        "moneda": doc.get("moneda", "PYG"),
        "tipo_cambio": doc.get("tipo_cambio"),
        "monto_total": float(doc.get("monto") or 0),
        "monto_disponible": float(doc.get("monto") or 0),
        "monto_aplicado": 0.0,
        # Origen
        "nota_credito_id": doc["id"],
        "nota_credito_numero": doc.get("numero"),
        "compra_origen_id": doc.get("compra_id"),
        "compra_origen_numero": doc.get("compra_numero_factura"),
        # Estado
        "estado": "disponible",
        "aplicaciones": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.saldos_favor.insert_one(sf_doc)


async def _revertir_saldo_favor_proveedor(doc: dict):
    """Marca como anulado el saldo_favor de proveedor al eliminar/editar la nota."""
    if doc.get("tipo_cobro") != "saldo_favor":
        return
    if doc.get("tipo") != "compra":
        return
    sf = await db.saldos_favor.find_one(
        {"nota_credito_id": doc.get("id"), "entidad_tipo": "proveedor"}, {"_id": 0}
    )
    if not sf:
        return
    await db.saldos_favor.update_one(
        {"nota_credito_id": doc["id"], "entidad_tipo": "proveedor"},
        {"$set": {
            "estado": "anulado",
            "monto_disponible": 0.0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )


# ─────────────────────────────────────────────────────────────
# Validación de monto vs. saldo disponible del documento
# ─────────────────────────────────────────────────────────────

async def _validar_monto_vs_factura(data_dict: dict, nota_id: Optional[str] = None):
    """Verifica que el monto de la nota no supere el saldo pendiente de la factura
    considerando todas las notas de crédito ya aplicadas (excepto la que se está editando)."""
    factura_id = data_dict.get("factura_id")
    if not factura_id:
        return
    factura = await db.facturas.find_one(
        {"id": factura_id},
        {"_id": 0, "numero": 1, "monto": 1, "notas_credito": 1}
    )
    if not factura:
        return
    monto_factura = float(factura.get("monto") or 0)
    notas_existentes = [
        n for n in (factura.get("notas_credito") or [])
        if n.get("id") != nota_id  # excluir la nota actual en edición
    ]
    ya_acreditado = sum(float(n.get("monto") or 0) for n in notas_existentes)
    disponible = monto_factura - ya_acreditado
    if float(data_dict.get("monto") or 0) > disponible + 0.01:  # 0.01 tolerancia de redondeo
        raise HTTPException(
            status_code=400,
            detail=(
                f"El monto de la nota ({float(data_dict['monto']):,.0f}) supera el saldo disponible "
                f"de la factura {factura.get('numero', '')} ({disponible:,.0f}). "
                f"Ya fue acreditado: {ya_acreditado:,.0f}."
            )
        )


async def _validar_monto_vs_compra(data_dict: dict, nota_id: Optional[str] = None):
    """Verifica que el monto de la nota no supere el saldo disponible de la compra
    considerando todos los créditos ya aplicados (excepto el que se está editando)."""
    compra_id = data_dict.get("compra_id")
    if not compra_id:
        return
    compra = await db.compras.find_one(
        {"id": compra_id},
        {"_id": 0, "numero_factura": 1, "monto_total": 1, "creditos": 1}
    )
    if not compra:
        return
    monto_compra = float(compra.get("monto_total") or 0)
    creditos_existentes = [
        c for c in (compra.get("creditos") or [])
        if c.get("id") != nota_id  # excluir el crédito actual en edición
    ]
    ya_acreditado = sum(float(c.get("monto") or 0) for c in creditos_existentes)
    disponible = monto_compra - ya_acreditado
    if float(data_dict.get("monto") or 0) > disponible + 0.01:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El monto de la nota ({float(data_dict['monto']):,.0f}) supera el saldo disponible "
                f"de la compra {compra.get('numero_factura', '')} ({disponible:,.0f}). "
                f"Ya fue acreditado: {ya_acreditado:,.0f}."
            )
        )


# ─────────────────────────────────────────────────────────────
# CRUD endpoints — Notas de crédito
# ─────────────────────────────────────────────────────────────

@router.get("/admin/notas-credito")
async def get_notas_credito(
    logo_tipo: Optional[str] = None,
    mes: Optional[str] = None,
    anio: Optional[str] = None,
    tipo: Optional[str] = None,
    factura_id: Optional[str] = None,
    incluir_eliminadas: Optional[bool] = False,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "notas_credito.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    if incluir_eliminadas and user.get("role") not in ("admin", "gerente", "super_admin") and not has_permission(user, "notas_credito.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver notas eliminadas")
    query: dict = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if not incluir_eliminadas:
        query["eliminada"] = {"$ne": True}
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}
    elif anio:
        query["fecha"] = {"$regex": f"^{anio}"}
    if tipo:
        if tipo == "venta":
            query["$or"] = [{"tipo": {"$exists": False}}, {"tipo": "venta"}]
        else:
            query["tipo"] = tipo
    if factura_id:
        query["factura_id"] = factura_id
    return await db.notas_credito.find(query, {"_id": 0}).sort("fecha", -1).to_list(2000)


@router.post("/admin/notas-credito", response_model=NotaCreditoResponse, status_code=201)
async def create_nota_credito(data: NotaCreditoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "notas_credito.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    if data.monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero")

    data_dict = await _asegurar_tc_fiscal_nota(data.dict())
    # Validar que el monto no supere el saldo disponible del documento vinculado
    await _validar_monto_vs_factura(data_dict)
    await _validar_monto_vs_compra(data_dict)

    doc = {
        "id": str(uuid.uuid4()),
        **data_dict,
        "monto_pyg": _monto_pyg(data_dict),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _aplicar_credito_compra(doc)
    await _aplicar_credito_factura(doc)
    await db.notas_credito.insert_one(doc)
    await _restaurar_stock_devolucion(doc)
    await _gestionar_saldo_favor(doc)
    await _gestionar_saldo_favor_proveedor(doc)
    await log_auditoria(user, "notas_credito", "crear", f"Nota de crédito {data.numero} creada", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/notas-credito/{nota_id}", response_model=NotaCreditoResponse)
async def update_nota_credito(nota_id: str, data: NotaCreditoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "notas_credito.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    existing = await db.notas_credito.find_one({"id": nota_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    data_dict = await _asegurar_tc_fiscal_nota(data.dict())
    # Validar monto vs. saldo disponible excluyendo la nota que se está editando
    await _validar_monto_vs_factura(data_dict, nota_id=nota_id)
    await _validar_monto_vs_compra(data_dict, nota_id=nota_id)
    updates = {
        **data_dict,
        "monto_pyg": _monto_pyg(data_dict),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    updated_doc = {**existing, **updates}
    # Revertir vínculos anteriores
    await _revertir_credito_compra(existing)
    await _revertir_credito_factura(existing)
    await _revertir_stock_devolucion(existing)
    await _revertir_saldo_favor(existing)
    await _revertir_saldo_favor_proveedor(existing)
    # Aplicar nuevos vínculos
    await _aplicar_credito_compra(updated_doc)
    await _aplicar_credito_factura(updated_doc)
    await _restaurar_stock_devolucion(updated_doc)
    updates["compra_id"] = updated_doc.get("compra_id")
    updates["compra_numero_factura"] = updated_doc.get("compra_numero_factura")
    await db.notas_credito.update_one({"id": nota_id}, {"$set": updates})
    await _gestionar_saldo_favor(updated_doc)
    await _gestionar_saldo_favor_proveedor(updated_doc)
    await log_auditoria(user, "notas_credito", "editar", f"Nota de crédito {data.numero} actualizada", nota_id)
    return {**existing, **updates}


@router.delete("/admin/notas-credito/{nota_id}")
async def delete_nota_credito(nota_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "notas_credito.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    existing = await db.notas_credito.find_one({"id": nota_id}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    result = await db.notas_credito.update_one(
        {"id": nota_id},
        {"$set": {
            "eliminada": True,
            "eliminada_at": now,
            "eliminada_por": user.get("name", user.get("id", "sistema")),
            "eliminada_por_id": user.get("id"),
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    if existing:
        await _revertir_credito_compra(existing)
        await _revertir_credito_factura(existing)
        await _revertir_stock_devolucion(existing)
        await _revertir_saldo_favor(existing)
        await _revertir_saldo_favor_proveedor(existing)
    await log_auditoria(user, "notas_credito", "eliminar", f"Nota de crédito eliminada: {nota_id}", nota_id)
    return {"success": True}


# ─────────────────────────────────────────────────────────────
# Endpoints — Saldos a favor
# ─────────────────────────────────────────────────────────────

@router.get("/admin/saldos-favor")
async def get_saldos_favor(
    logo_tipo: Optional[str] = None,
    empresa_id: Optional[str] = None,
    estado: Optional[str] = None,           # disponible | parcial | aplicado | anulado
    incluir_anulados: Optional[bool] = False,
    user: dict = Depends(require_authenticated),
):
    """Lista los saldos a favor de clientes registrados como crédito para aplicar en futuras ventas."""
    if not has_permission(user, "notas_credito.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    query: dict = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    if not incluir_anulados:
        query["estado"] = {"$ne": "anulado"}
    if estado:
        query["estado"] = estado
    if empresa_id:
        query["empresa_id"] = empresa_id
    return await db.saldos_favor.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/admin/saldos-favor/empresa/{empresa_id}")
async def get_saldo_favor_empresa(
    empresa_id: str,
    logo_tipo: Optional[str] = None,
    moneda: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    """Devuelve el saldo total disponible de un cliente para aplicar en una nueva venta."""
    if not has_permission(user, "notas_credito.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(logo_q):
        return {"empresa_id": empresa_id, "saldos": []}
    query: dict = {**logo_q, "empresa_id": empresa_id, "estado": {"$in": ["disponible", "parcial"]}}
    if moneda:
        query["moneda"] = moneda
    saldos = await db.saldos_favor.find(query, {"_id": 0}).to_list(200)
    # Agrupar por moneda
    resumen: dict = {}
    for sf in saldos:
        mon = sf.get("moneda", "PYG")
        resumen[mon] = resumen.get(mon, 0) + float(sf.get("monto_disponible") or 0)
    return {
        "empresa_id": empresa_id,
        "saldos": [{"moneda": m, "monto_disponible": v} for m, v in resumen.items()],
        "detalle": saldos,
    }


@router.post("/admin/saldos-favor/{saldo_id}/aplicar")
async def aplicar_saldo_favor(
    saldo_id: str,
    data: dict,
    user: dict = Depends(require_authenticated),
):
    """Aplica (total o parcialmente) un saldo a favor a una factura de venta.
    Body: { factura_id, factura_numero, monto }
    """
    if not has_permission(user, "notas_credito.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    sf = await db.saldos_favor.find_one({"id": saldo_id}, {"_id": 0})
    if not sf:
        raise HTTPException(status_code=404, detail="Saldo a favor no encontrado")
    if sf.get("estado") in ("anulado", "aplicado"):
        raise HTTPException(status_code=400, detail="Este saldo ya fue aplicado o fue anulado")

    monto_a_aplicar = float(data.get("monto") or 0)
    if monto_a_aplicar <= 0:
        raise HTTPException(status_code=400, detail="El monto a aplicar debe ser mayor a cero")
    disponible = float(sf.get("monto_disponible") or 0)
    if monto_a_aplicar > disponible:
        raise HTTPException(status_code=400, detail=f"El monto a aplicar ({monto_a_aplicar}) supera el saldo disponible ({disponible})")

    nuevo_disponible = disponible - monto_a_aplicar
    nuevo_aplicado = float(sf.get("monto_aplicado") or 0) + monto_a_aplicar
    nuevo_estado = "aplicado" if nuevo_disponible <= 0 else "parcial"

    aplicacion = {
        "factura_id": data.get("factura_id"),
        "factura_numero": data.get("factura_numero"),
        "monto": monto_a_aplicar,
        "fecha": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "registrado_por": user.get("name", user.get("id", "sistema")),
    }
    await db.saldos_favor.update_one(
        {"id": saldo_id},
        {"$set": {
            "monto_disponible": nuevo_disponible,
            "monto_aplicado": nuevo_aplicado,
            "estado": nuevo_estado,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, "$push": {"aplicaciones": aplicacion}}
    )
    await log_auditoria(user, "saldos_favor", "aplicar", f"Saldo {saldo_id} aplicado ₲{monto_a_aplicar:,.0f} a factura {data.get('factura_numero')}", saldo_id)
    return {"ok": True, "monto_disponible_restante": nuevo_disponible, "estado": nuevo_estado}
