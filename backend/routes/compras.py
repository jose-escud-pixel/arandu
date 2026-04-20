from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CompraItemCreate(BaseModel):
    descripcion: str
    cantidad: float = 1
    precio_unitario: float
    subtotal: float = 0
    producto_id: Optional[str] = None   # referencia al catálogo de productos

class CompraCreate(BaseModel):
    logo_tipo: str = "arandujar"
    proveedor_id: Optional[str] = None
    proveedor_nombre: str
    fecha: str                             # YYYY-MM-DD
    tipo_pago: str = "contado"             # contado | credito
    tiene_factura: bool = False
    numero_factura: Optional[str] = None
    monto_total: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    monto_iva: Optional[float] = None      # IVA incluido en la compra
    tasa_iva: Optional[int] = 10           # 10 | 5 | 0
    items: List[CompraItemCreate] = []
    afecta_stock: bool = True               # Si los ítems suman al inventario
    notas: Optional[str] = None
    # crédito
    fecha_vencimiento: Optional[str] = None  # YYYY-MM-DD cuando vence el crédito

class CompraUpdate(BaseModel):
    logo_tipo: Optional[str] = None
    proveedor_id: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    fecha: Optional[str] = None
    tipo_pago: Optional[str] = None
    tiene_factura: Optional[bool] = None
    numero_factura: Optional[str] = None
    monto_total: Optional[float] = None
    moneda: Optional[str] = None
    tipo_cambio: Optional[float] = None
    monto_iva: Optional[float] = None
    tasa_iva: Optional[int] = None
    items: Optional[List[CompraItemCreate]] = None
    afecta_stock: Optional[bool] = None
    notas: Optional[str] = None
    fecha_vencimiento: Optional[str] = None

class PagoCompraCreate(BaseModel):
    monto_pagado: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    fecha_pago: str
    notas: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _estado_pago(compra: dict) -> str:
    """Calcula el estado de pago de una compra."""
    if compra.get("tipo_pago") == "contado":
        return "pagado"
    pagos = compra.get("pagos", [])
    total_pagado = sum(p.get("monto_pagado", 0) for p in pagos)
    if total_pagado >= compra.get("monto_total", 0):
        return "pagado"
    if pagos:
        return "parcial"
    fecha_venc = compra.get("fecha_vencimiento")
    if fecha_venc:
        hoy = datetime.now(timezone.utc).date().isoformat()
        if fecha_venc < hoy:
            return "vencido"
    return "pendiente"

def _fmt(compra: dict) -> dict:
    compra = {k: v for k, v in compra.items() if k != "_id"}
    compra["estado_pago"] = _estado_pago(compra)
    pagos = compra.get("pagos", [])
    compra["total_pagado"] = sum(p.get("monto_pagado", 0) for p in pagos)
    compra["saldo_pendiente"] = max(0, compra.get("monto_total", 0) - compra["total_pagado"])
    return compra


# ── CRUD Compras ──────────────────────────────────────────────────────────────

@router.get("/admin/compras")
async def get_compras(
    proveedor_id: Optional[str] = None,
    logo_tipo: Optional[str] = None,
    mes: Optional[str] = None,            # YYYY-MM
    anio: Optional[str] = None,           # YYYY (filtro anual)
    estado_pago: Optional[str] = None,    # pendiente | pagado | vencido | parcial
    tiene_factura: Optional[bool] = None,
    search: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "compras.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver compras")

    query = {}
    if proveedor_id:
        query["proveedor_id"] = proveedor_id

    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)

    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}
    elif anio:
        query["fecha"] = {"$regex": f"^{anio}"}
    if tiene_factura is not None:
        query["tiene_factura"] = tiene_factura
    if search:
        query["proveedor_nombre"] = {"$regex": search, "$options": "i"}

    compras = await db.compras.find(query, {"_id": 0}).sort("fecha", -1).to_list(1000)
    result = [_fmt(c) for c in compras]

    # Filtrar por estado_pago después (calculado)
    if estado_pago:
        result = [c for c in result if c["estado_pago"] == estado_pago]

    return result


@router.post("/admin/compras")
async def create_compra(data: CompraCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear compras")

    # Calcular subtotales de items
    items = []
    for item in data.items:
        subtotal = item.cantidad * item.precio_unitario
        items.append({**item.dict(), "subtotal": subtotal})

    doc = {
        "id": str(uuid.uuid4()),
        "logo_tipo": data.logo_tipo,
        "proveedor_id": data.proveedor_id,
        "proveedor_nombre": data.proveedor_nombre,
        "fecha": data.fecha,
        "tipo_pago": data.tipo_pago,
        "tiene_factura": data.tiene_factura,
        "numero_factura": data.numero_factura,
        "monto_total": data.monto_total,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "monto_iva": data.monto_iva,
        "tasa_iva": data.tasa_iva,
        "items": items,
        "afecta_stock": data.afecta_stock,
        "notas": data.notas,
        "fecha_vencimiento": data.fecha_vencimiento,
        "pagos": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("id"),
    }
    await db.compras.insert_one(doc)
    await log_auditoria(user, "compras", "crear", f"Compra a {data.proveedor_nombre} por {data.monto_total}", doc["id"])

    # ── Procesar stock automático para ítems vinculados a productos ──
    if data.afecta_stock:
        for item in items:
            pid = item.get("producto_id")
            if pid:
                from routes.productos import registrar_movimiento
                await registrar_movimiento(
                    producto_id=pid,
                    tipo="entrada",
                    cantidad=item["cantidad"],
                    motivo="compra",
                    referencia_id=doc["id"],
                    referencia_tipo="compra",
                    precio_unitario=item.get("precio_unitario"),
                    notas=f"Compra a {data.proveedor_nombre}",
                    usuario_id=user.get("id"),
                    usuario_nombre=user.get("name"),
                )

    return _fmt(doc)


@router.get("/admin/compras/{compra_id}")
async def get_compra(compra_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    return _fmt(compra)


@router.put("/admin/compras/{compra_id}")
async def update_compra(compra_id: str, data: CompraUpdate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")
    result = await db.compras.update_one({"id": compra_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    return _fmt(compra)


@router.delete("/admin/compras/{compra_id}")
async def delete_compra(compra_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    # Buscar antes de borrar para revertir stock
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    result = await db.compras.delete_one({"id": compra_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    await log_auditoria(user, "compras", "eliminar", f"Compra eliminada: {compra_id}", compra_id)
    # Revertir movimientos de stock originados por esta compra
    if compra:
        from routes.productos import registrar_movimiento
        for item in (compra.get("items") or []):
            pid = item.get("producto_id")
            if pid:
                await registrar_movimiento(
                    producto_id=pid,
                    tipo="salida",
                    cantidad=item.get("cantidad", 0),
                    motivo="devolucion",
                    referencia_id=compra_id,
                    referencia_tipo="compra_eliminada",
                    notas=f"Reversión por eliminación de compra",
                    usuario_id=user.get("id"),
                    usuario_nombre=user.get("name"),
                )
    return {"ok": True}


# ── Pagos de compras a crédito ────────────────────────────────────────────────

@router.post("/admin/compras/{compra_id}/pagos")
async def registrar_pago_compra(compra_id: str, data: PagoCompraCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    if compra.get("tipo_pago") == "contado":
        raise HTTPException(status_code=400, detail="Esta compra es al contado, no necesita pagos")

    pago = {
        "id": str(uuid.uuid4()),
        "monto_pagado": data.monto_pagado,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "fecha_pago": data.fecha_pago,
        "notas": data.notas,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.compras.update_one({"id": compra_id}, {"$push": {"pagos": pago}})
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    return _fmt(compra)


@router.delete("/admin/compras/{compra_id}/pagos/{pago_id}")
async def eliminar_pago_compra(compra_id: str, pago_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    result = await db.compras.update_one(
        {"id": compra_id},
        {"$pull": {"pagos": {"id": pago_id}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    return _fmt(compra)


# ── Resumen por proveedor (usado en ProveedoresPage) ─────────────────────────

@router.get("/admin/compras/resumen/por-proveedor")
async def resumen_compras_por_proveedor(
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    """Devuelve totales por proveedor: total_comprado, deuda_actual, cantidad_compras."""
    if not has_permission(user, "compras.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)

    compras = await db.compras.find(query, {"_id": 0}).to_list(5000)

    resumen = {}
    for c in compras:
        pid = c.get("proveedor_id") or c.get("proveedor_nombre")
        if pid not in resumen:
            resumen[pid] = {
                "proveedor_id": c.get("proveedor_id"),
                "proveedor_nombre": c.get("proveedor_nombre"),
                "total_comprado": 0,
                "deuda_actual": 0,
                "cantidad_compras": 0,
                "ultima_compra": None,
            }
        r = resumen[pid]
        r["total_comprado"] += c.get("monto_total", 0)
        r["cantidad_compras"] += 1
        fc = c.get("fecha", "")
        if not r["ultima_compra"] or fc > r["ultima_compra"]:
            r["ultima_compra"] = fc
        # Deuda: compras a crédito no totalmente pagadas
        cf = _fmt(c)
        if cf["estado_pago"] in ("pendiente", "parcial", "vencido"):
            r["deuda_actual"] += cf["saldo_pendiente"]

    return list(resumen.values())
