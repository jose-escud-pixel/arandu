from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import re
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from routes.cotizaciones import tipo_cambio_usd_sugerido
from routes.plan_cuentas import resolver_plan_cuenta_operacion

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CompraItemCreate(BaseModel):
    descripcion: str
    cantidad: float = 1
    precio_unitario: float
    subtotal: float = 0
    producto_id: Optional[str] = None   # referencia al catálogo de productos
    producto_sku: Optional[str] = None  # código SKU del producto (solo referencia)
    iva: Optional[int] = 10             # tasa IVA del ítem: 0, 5 ó 10

class CompraCreate(BaseModel):
    logo_tipo: str = "arandujar"
    proveedor_id: Optional[str] = None
    proveedor_nombre: str
    proveedor_ruc: Optional[str] = None
    crear_proveedor: bool = False
    fecha: str                             # YYYY-MM-DD
    tipo_pago: str = "contado"             # contado | credito
    tiene_factura: bool = False
    numero_factura: Optional[str] = None
    nro_timbrado: Optional[str] = None              # Timbrado del proveedor (SET)
    fecha_vigencia_timbrado: Optional[str] = None   # Vigencia del timbrado YYYY-MM-DD
    monto_total: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    monto_iva: Optional[float] = None      # IVA incluido en la compra
    tasa_iva: Optional[int] = 10           # 10 | 5 | 0
    solo_iva: bool = False                 # factura recibida que solo impacta IVA, no gasto/deuda
    items: List[CompraItemCreate] = []
    afecta_stock: bool = True               # Si los ítems suman al inventario
    notas: Optional[str] = None
    # crédito
    fecha_vencimiento: Optional[str] = None  # YYYY-MM-DD cuando vence el crédito
    fecha_pago: Optional[str] = None         # YYYY-MM-DD cuando se pagó una compra contado
    # cuenta bancaria desde la que se pagó (solo aplica a contado)
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    plan_cuenta_id: Optional[str] = None
    plan_cuenta_nombre: Optional[str] = None

class CompraUpdate(BaseModel):
    logo_tipo: Optional[str] = None
    proveedor_id: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    proveedor_ruc: Optional[str] = None
    crear_proveedor: Optional[bool] = None
    fecha: Optional[str] = None
    tipo_pago: Optional[str] = None
    tiene_factura: Optional[bool] = None
    numero_factura: Optional[str] = None
    nro_timbrado: Optional[str] = None
    fecha_vigencia_timbrado: Optional[str] = None
    monto_total: Optional[float] = None
    moneda: Optional[str] = None
    tipo_cambio: Optional[float] = None
    monto_iva: Optional[float] = None
    tasa_iva: Optional[int] = None
    solo_iva: Optional[bool] = None
    items: Optional[List[CompraItemCreate]] = None
    afecta_stock: Optional[bool] = None
    notas: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    fecha_pago: Optional[str] = None
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    plan_cuenta_id: Optional[str] = None
    plan_cuenta_nombre: Optional[str] = None

class PagoCompraCreate(BaseModel):
    monto_pagado: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    fecha_pago: str
    notas: Optional[str] = None
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _estado_pago(compra: dict) -> str:
    """Calcula el estado de pago de una compra."""
    if compra.get("solo_iva"):
        return "registrado"
    pagos = compra.get("pagos", [])
    creditos = compra.get("creditos", [])
    total_pagado = sum(p.get("monto_pagado", 0) for p in pagos)
    if compra.get("tipo_pago") == "contado" and not pagos and (compra.get("fecha_pago") or compra.get("cuenta_id")):
        total_pagado = compra.get("monto_total", 0)
    total_creditos = sum(c.get("monto", 0) for c in creditos)
    if total_pagado + total_creditos >= compra.get("monto_total", 0):
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
    creditos = compra.get("creditos", [])
    total_pagado = sum(p.get("monto_pagado", 0) for p in pagos)
    if compra.get("tipo_pago") == "contado" and not pagos and (compra.get("fecha_pago") or compra.get("cuenta_id")):
        total_pagado = compra.get("monto_total", 0)
    compra["total_pagado"] = total_pagado
    compra["total_creditos"] = sum(c.get("monto", 0) for c in creditos)
    compra["saldo_pendiente"] = max(0, compra.get("monto_total", 0) - compra["total_pagado"] - compra["total_creditos"])
    return compra


async def _aplicar_notas_credito_a_compras(compras: List[dict]) -> List[dict]:
    compra_ids = [c.get("id") for c in compras if c.get("id")]
    facturas = [c.get("numero_factura") for c in compras if c.get("numero_factura")]
    if not compra_ids:
        return compras
    nota_query = {
        "tipo": "compra",
        "estado": {"$ne": "anulada"},
        "$or": [{"compra_id": {"$in": compra_ids}}],
    }
    if facturas:
        nota_query["$or"].append({"compra_numero_factura": {"$in": facturas}})
    notas = await db.notas_credito.find(
        nota_query,
        {"_id": 0, "id": 1, "numero": 1, "fecha": 1, "compra_id": 1, "compra_numero_factura": 1, "proveedor_id": 1, "proveedor_nombre": 1, "monto": 1, "moneda": 1, "tipo_cambio": 1, "motivo": 1},
    ).to_list(5000)
    notas_por_compra = {}
    compras_por_factura = {c.get("numero_factura"): c for c in compras if c.get("numero_factura")}
    for n in notas:
        compra_key = n.get("compra_id")
        if not compra_key and n.get("compra_numero_factura"):
            compra_match = compras_por_factura.get(n.get("compra_numero_factura"))
            if compra_match:
                proveedor_ok = (
                    not n.get("proveedor_id")
                    or not compra_match.get("proveedor_id")
                    or n.get("proveedor_id") == compra_match.get("proveedor_id")
                )
                nombre_ok = (
                    not n.get("proveedor_nombre")
                    or not compra_match.get("proveedor_nombre")
                    or n.get("proveedor_nombre") == compra_match.get("proveedor_nombre")
                )
                if proveedor_ok or nombre_ok:
                    compra_key = compra_match.get("id")
        if not compra_key:
            continue
        notas_por_compra.setdefault(compra_key, []).append({
            "id": n.get("id"),
            "numero": n.get("numero"),
            "fecha": n.get("fecha"),
            "monto": n.get("monto") or 0,
            "moneda": n.get("moneda", "PYG"),
            "tipo_cambio": n.get("tipo_cambio"),
            "motivo": n.get("motivo"),
        })
    enriched = []
    for c in compras:
        dynamic_creditos = notas_por_compra.get(c.get("id"), [])
        existing_creditos = [cr for cr in (c.get("creditos") or []) if cr.get("id") not in {n.get("id") for n in dynamic_creditos}]
        enriched.append({**c, "creditos": [*existing_creditos, *dynamic_creditos]})
    return enriched


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
    incluir_eliminadas: Optional[bool] = False,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "compras.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver compras")

    query = {}
    if not incluir_eliminadas:
        query["eliminada"] = {"$ne": True}
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
    compras = await _aplicar_notas_credito_a_compras(compras)
    result = [_fmt(c) for c in compras]

    # Filtrar por estado_pago después (calculado)
    if estado_pago:
        result = [c for c in result if c["estado_pago"] == estado_pago]

    return result


async def _asegurar_tc_fiscal_compra(moneda: Optional[str], tipo_cambio: Optional[float],
                                     tipo_pago: Optional[str], tiene_factura: Optional[bool],
                                     fecha: Optional[str]) -> Optional[float]:
    """Completa/valida el TC de USD.

    - Compras contado USD: TC requerido para balance/caja.
    - Compras USD con factura: TC fiscal requerido para IVA, aunque sean a crédito.
    Si falta, se intenta cargar desde la cotización local/cacheada de Cambios Chaco.
    """
    if (moneda or "PYG").upper() != "USD":
        return tipo_cambio
    try:
        tc = float(tipo_cambio or 0)
    except (TypeError, ValueError):
        tc = 0
    if tc > 0:
        return tc
    requiere_tc = (tipo_pago or "contado") == "contado" or bool(tiene_factura)
    if not requiere_tc:
        return tipo_cambio
    sugerido = await tipo_cambio_usd_sugerido((fecha or "")[:10])
    if sugerido:
        return sugerido
    if bool(tiene_factura):
        raise HTTPException(
            status_code=400,
            detail="Falta el tipo de cambio fiscal para esta compra USD con factura.",
        )
    raise HTTPException(status_code=400, detail="Falta el tipo de cambio para una compra al contado en USD.")


def _numero_doc_normalizado(numero: Optional[str]) -> str:
    return "".join((numero or "").strip().lower().split())


def _normalizar_texto(valor: Optional[str]) -> str:
    return " ".join((valor or "").strip().lower().split())


def _normalizar_ruc(valor: Optional[str]) -> str:
    return "".join(ch for ch in (valor or "").strip().lower() if ch.isalnum())


async def _crear_proveedor_desde_compra(data: CompraCreate, user: dict) -> Optional[str]:
    if not data.crear_proveedor or data.proveedor_id:
        return data.proveedor_id
    if not has_permission(user, "proveedores.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear proveedores")
    nombre_norm = _normalizar_texto(data.proveedor_nombre)
    ruc_norm = _normalizar_ruc(data.proveedor_ruc)
    or_terms = []
    if nombre_norm:
        or_terms.extend([
            {"nombre_normalizado": nombre_norm},
            {"nombre": {"$regex": f"^{re.escape(nombre_norm)}$", "$options": "i"}},
        ])
    if ruc_norm:
        or_terms.extend([
            {"ruc_normalizado": ruc_norm},
            {"ruc": data.proveedor_ruc},
        ])
    if or_terms:
        existente = await db.proveedores.find_one(
            {"logo_tipo": data.logo_tipo or "arandujar", "$or": or_terms},
            {"_id": 0, "id": 1},
        )
        if existente:
            raise HTTPException(status_code=400, detail="Ya existe un proveedor con esa razón social o RUC.")
    prov_id = str(uuid.uuid4())
    doc = {
        "id": prov_id,
        "nombre": data.proveedor_nombre,
        "nombre_normalizado": nombre_norm,
        "ruc": data.proveedor_ruc,
        "ruc_normalizado": ruc_norm,
        "contacto": None,
        "telefono": None,
        "email": None,
        "direccion": None,
        "categoria": None,
        "notas": "Creado desde una compra",
        "activo": True,
        "logo_tipo": data.logo_tipo,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.proveedores.insert_one(doc)
    await log_auditoria(user, "proveedores", "crear", f"Proveedor '{data.proveedor_nombre}' creado desde compra", prov_id)
    return prov_id


async def _ensure_numero_factura_compra_unico(
    numero: Optional[str],
    proveedor_id: Optional[str],
    proveedor_nombre: Optional[str],
    logo_tipo: Optional[str],
    ignore_id: Optional[str] = None,
):
    normalizado = _numero_doc_normalizado(numero)
    if not normalizado:
        raise HTTPException(status_code=400, detail="El número de factura es obligatorio cuando la compra tiene factura.")
    query: dict = {
        "logo_tipo": logo_tipo or "arandujar",
        "tiene_factura": True,
        "$or": [
            {"numero_factura": (numero or "").strip()},
            {"numero_factura_normalizado": normalizado},
        ],
    }
    proveedor_or = []
    if proveedor_id:
        proveedor_or.append({"proveedor_id": proveedor_id})
    if proveedor_nombre:
        proveedor_or.append({"proveedor_nombre": proveedor_nombre})
    if proveedor_or:
        query["$and"] = [{"$or": proveedor_or}]
    if ignore_id:
        query["id"] = {"$ne": ignore_id}
    existente = await db.compras.find_one(query, {"_id": 0, "id": 1, "numero_factura": 1})
    if existente:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe una compra con la factura {numero} para este proveedor.",
        )


def _tiene_productos_vinculados_items(items: List[dict]) -> bool:
    return any(item.get("producto_id") for item in (items or []))


async def _validar_productos_items_logo(items: List[dict], logo_tipo: str):
    producto_ids = list({item.get("producto_id") for item in (items or []) if item.get("producto_id")})
    if not producto_ids:
        return
    productos = await db.productos.find(
        {"id": {"$in": producto_ids}},
        {"_id": 0, "id": 1, "nombre": 1, "logo_tipo": 1},
    ).to_list(500)
    prod_map = {p["id"]: p for p in productos}
    for pid in producto_ids:
        prod = prod_map.get(pid)
        if not prod:
            raise HTTPException(status_code=400, detail="Uno de los productos seleccionados no existe.")
        if prod.get("logo_tipo") != logo_tipo:
            raise HTTPException(
                status_code=400,
                detail=f"El producto '{prod.get('nombre', pid)}' pertenece a otra empresa y no puede usarse en esta compra.",
            )


@router.post("/admin/compras")
async def create_compra(data: CompraCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear compras")

    tipo_cambio_final = await _asegurar_tc_fiscal_compra(
        data.moneda, data.tipo_cambio, data.tipo_pago, data.tiene_factura, data.fecha
    )
    if data.tiene_factura:
        await _ensure_numero_factura_compra_unico(
            data.numero_factura, data.proveedor_id, data.proveedor_nombre, data.logo_tipo
        )
    if data.solo_iva and not data.tiene_factura:
        raise HTTPException(status_code=400, detail="Una compra Solo IVA debe tener factura.")

    plan_cuenta = None
    fecha_vencimiento_plan = None
    if not data.solo_iva:
        uso_plan = "compra_credito" if data.tipo_pago == "credito" else "compra_contado"
        plan_cuenta, fecha_vencimiento_plan = await resolver_plan_cuenta_operacion(
            data.logo_tipo, uso_plan, data.plan_cuenta_id, data.fecha, data.fecha_vencimiento
        )
    proveedor_id_final = await _crear_proveedor_desde_compra(data, user)

    # Calcular subtotales de items
    items = []
    for item in data.items:
        subtotal = item.cantidad * item.precio_unitario
        items.append({**item.dict(), "subtotal": subtotal})
    await _validar_productos_items_logo(items, data.logo_tipo)
    afecta_stock = data.afecta_stock
    if _tiene_productos_vinculados_items(items) and not has_permission(user, "compras.afectar_stock"):
        afecta_stock = True

    doc = {
        "id": str(uuid.uuid4()),
        "logo_tipo": data.logo_tipo,
        "proveedor_id": proveedor_id_final,
        "proveedor_nombre": data.proveedor_nombre,
        "proveedor_ruc": data.proveedor_ruc,
        "fecha": data.fecha,
        "tipo_pago": data.tipo_pago,
        "tiene_factura": data.tiene_factura,
        "numero_factura": data.numero_factura.strip() if data.numero_factura else None,
        "nro_timbrado": data.nro_timbrado if data.tiene_factura else None,
        "fecha_vigencia_timbrado": data.fecha_vigencia_timbrado if data.tiene_factura else None,
        "monto_total": data.monto_total,
        "moneda": data.moneda,
        "tipo_cambio": tipo_cambio_final,
        "monto_iva": data.monto_iva,
        "tasa_iva": data.tasa_iva,
        "solo_iva": data.solo_iva,
        "numero_factura_normalizado": _numero_doc_normalizado(data.numero_factura) if data.tiene_factura else None,
        "items": items,
        "afecta_stock": False if data.solo_iva else afecta_stock,
        "notas": data.notas,
        "fecha_vencimiento": fecha_vencimiento_plan if not data.solo_iva else data.fecha_vencimiento,
        "plan_cuenta_id": plan_cuenta.get("id") if plan_cuenta else None,
        "plan_cuenta_nombre": plan_cuenta.get("nombre") if plan_cuenta else None,
        "fecha_pago": (data.fecha_pago or data.fecha) if data.tipo_pago == "contado" and data.cuenta_id else None,
        "cuenta_id": data.cuenta_id if data.tipo_pago == "contado" and data.cuenta_id and not data.solo_iva else None,
        "cuenta_nombre": data.cuenta_nombre if data.tipo_pago == "contado" and data.cuenta_id and not data.solo_iva else None,
        "pagos": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("id"),
    }
    await db.compras.insert_one(doc)
    await log_auditoria(user, "compras", "crear", f"Compra a {data.proveedor_nombre} por {data.monto_total}", doc["id"])

    # ── Procesar stock automático para ítems vinculados a productos ──
    if afecta_stock and not data.solo_iva:
        for item in items:
            pid = item.get("producto_id")
            if pid:
                from routes.productos import registrar_movimiento
                # Leer stock y costo actual ANTES del movimiento para costo promedio
                prod_antes = await db.productos.find_one(
                    {"id": pid}, {"_id": 0, "stock_actual": 1, "precio_costo": 1}
                )
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
                # Actualizar precio_costo con costo promedio ponderado
                # Fórmula: (stock_ant × costo_ant + qty_nueva × precio_nuevo) / (stock_ant + qty_nueva)
                # Solo actualiza precio_costo; NO modifica movimientos históricos
                if prod_antes:
                    stock_ant = prod_antes.get("stock_actual", 0) or 0
                    costo_ant = prod_antes.get("precio_costo", 0) or 0
                    qty_nueva = item["cantidad"]
                    precio_nuevo = item.get("precio_unitario") or 0
                    total_qty = stock_ant + qty_nueva
                    if precio_nuevo > 0 and total_qty > 0:
                        costo_promedio = (stock_ant * costo_ant + qty_nueva * precio_nuevo) / total_qty
                        await db.productos.update_one(
                            {"id": pid},
                            {"$set": {
                                "precio_costo": round(costo_promedio, 2),
                                "updated_at": datetime.now(timezone.utc).isoformat()
                            }}
                        )

    return _fmt(doc)


@router.get("/admin/compras/{compra_id}")
async def get_compra(compra_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    compra = (await _aplicar_notas_credito_a_compras([compra]))[0]
    return _fmt(compra)


@router.put("/admin/compras/{compra_id}")
async def update_compra(compra_id: str, data: CompraUpdate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data.pop("crear_proveedor", None)
    if not update_data:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    # Validar TC si se está editando la moneda/tc o la compra ya está en USD
    existing_compra = await db.compras.find_one(
        {"id": compra_id},
        {"moneda": 1, "tipo_cambio": 1, "tipo_pago": 1, "tiene_factura": 1, "fecha": 1,
         "numero_factura": 1, "proveedor_id": 1, "proveedor_nombre": 1, "logo_tipo": 1, "fecha_pago": 1, "fecha_vencimiento": 1, "plan_cuenta_id": 1, "solo_iva": 1}
    ) or {}
    moneda_final = update_data.get("moneda", existing_compra.get("moneda"))
    tc_final = update_data.get("tipo_cambio", existing_compra.get("tipo_cambio"))
    tipo_pago_final = update_data.get("tipo_pago", existing_compra.get("tipo_pago"))
    tiene_factura_final = update_data.get("tiene_factura", existing_compra.get("tiene_factura"))
    solo_iva_final = update_data.get("solo_iva", existing_compra.get("solo_iva", False))
    fecha_final = update_data.get("fecha", existing_compra.get("fecha"))
    update_data["tipo_cambio"] = await _asegurar_tc_fiscal_compra(
        moneda_final, tc_final, tipo_pago_final, tiene_factura_final, fecha_final
    )
    if solo_iva_final and not tiene_factura_final:
        raise HTTPException(status_code=400, detail="Una compra Solo IVA debe tener factura.")
    numero_final = update_data.get("numero_factura", existing_compra.get("numero_factura"))
    proveedor_id_final = update_data.get("proveedor_id", existing_compra.get("proveedor_id"))
    proveedor_nombre_final = update_data.get("proveedor_nombre", existing_compra.get("proveedor_nombre"))
    logo_final = update_data.get("logo_tipo", existing_compra.get("logo_tipo", "arandujar"))
    if tiene_factura_final:
        await _ensure_numero_factura_compra_unico(
            numero_final, proveedor_id_final, proveedor_nombre_final, logo_final, ignore_id=compra_id
        )
        update_data["numero_factura"] = numero_final.strip() if isinstance(numero_final, str) else numero_final
        update_data["numero_factura_normalizado"] = _numero_doc_normalizado(numero_final)
    else:
        update_data["numero_factura"] = None
        update_data["numero_factura_normalizado"] = None
        update_data["nro_timbrado"] = None
        update_data["fecha_vigencia_timbrado"] = None
    if solo_iva_final:
        update_data["afecta_stock"] = False
        update_data["cuenta_id"] = None
        update_data["cuenta_nombre"] = None
        update_data["plan_cuenta_id"] = None
        update_data["plan_cuenta_nombre"] = None

    if not solo_iva_final:
        uso_plan = "compra_credito" if tipo_pago_final == "credito" else "compra_contado"
        plan_cuenta, fecha_vencimiento_plan = await resolver_plan_cuenta_operacion(
            logo_final,
            uso_plan,
            update_data.get("plan_cuenta_id") or existing_compra.get("plan_cuenta_id"),
            fecha_final,
            update_data.get("fecha_vencimiento") or existing_compra.get("fecha_vencimiento"),
        )
        update_data["plan_cuenta_id"] = plan_cuenta.get("id")
        update_data["plan_cuenta_nombre"] = plan_cuenta.get("nombre")
        update_data["fecha_vencimiento"] = fecha_vencimiento_plan
    if tipo_pago_final == "contado" and not update_data.get("fecha_pago") and not existing_compra.get("fecha_pago"):
        update_data["fecha_pago"] = fecha_final
    if tipo_pago_final != "contado":
        update_data["fecha_pago"] = None
    if not solo_iva_final and "items" in update_data and "afecta_stock" in update_data and not has_permission(user, "compras.afectar_stock"):
        if _tiene_productos_vinculados_items(update_data.get("items") or []):
            update_data["afecta_stock"] = True
    if "items" in update_data:
        await _validar_productos_items_logo(update_data.get("items") or [], logo_final)

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
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    # Revertir movimientos de stock originados por esta compra
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
    # Soft-delete (igual que facturas)
    now = datetime.now(timezone.utc).isoformat()
    await db.compras.update_one(
        {"id": compra_id},
        {"$set": {
            "eliminada": True,
            "eliminada_at": now,
            "eliminada_por": user.get("name", user.get("id", "sistema")),
            "eliminada_por_id": user.get("id"),
        }}
    )
    await log_auditoria(user, "compras", "eliminar", f"Compra eliminada: {compra_id}", compra_id)
    return {"ok": True}


# ── Pagos de compras a crédito ────────────────────────────────────────────────

@router.post("/admin/compras/{compra_id}/pagos")
async def registrar_pago_compra(compra_id: str, data: PagoCompraCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "compras.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    if compra.get("solo_iva"):
        raise HTTPException(status_code=400, detail="Una compra Solo IVA no necesita pagos")

    pago = {
        "id": str(uuid.uuid4()),
        "monto_pagado": data.monto_pagado,
        "moneda": data.moneda,
        "tipo_cambio": data.tipo_cambio,
        "fecha_pago": data.fecha_pago,
        "notas": data.notas,
        "cuenta_id": data.cuenta_id,
        "cuenta_nombre": data.cuenta_nombre,
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
    mes: Optional[str] = None,   # YYYY-MM
    anio: Optional[str] = None,  # YYYY
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
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}
    elif anio:
        query["fecha"] = {"$regex": f"^{anio}"}

    compras = await db.compras.find(query, {"_id": 0}).to_list(5000)
    compras = await _aplicar_notas_credito_a_compras(compras)

    resumen = {}
    for c in compras:
        if c.get("solo_iva"):
            continue
        pid = c.get("proveedor_id") or c.get("proveedor_nombre")
        if pid not in resumen:
            resumen[pid] = {
                "proveedor_id": c.get("proveedor_id"),
                "proveedor_nombre": c.get("proveedor_nombre"),
                "total_comprado": 0,
                "total_comprado_usd": 0,
                "deuda_actual": 0,
                "deuda_actual_usd": 0,
                "cantidad_compras": 0,
                "ultima_compra": None,
                "moneda_principal": c.get("moneda", "PYG"),
            }
        r = resumen[pid]
        moneda = c.get("moneda", "PYG")
        monto = c.get("monto_total", 0)
        if moneda == "USD":
            r["total_comprado_usd"] += monto
            r["moneda_principal"] = "USD"
        else:
            r["total_comprado"] += monto
        r["cantidad_compras"] += 1
        fc = c.get("fecha", "")
        if not r["ultima_compra"] or fc > r["ultima_compra"]:
            r["ultima_compra"] = fc
        # Deuda: compras a crédito no totalmente pagadas
        cf = _fmt(c)
        if cf["estado_pago"] in ("pendiente", "parcial", "vencido"):
            if moneda == "USD":
                r["deuda_actual_usd"] += cf["saldo_pendiente"]
            else:
                r["deuda_actual"] += cf["saldo_pendiente"]

    return list(resumen.values())
