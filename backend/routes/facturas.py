from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from models.schemas import FacturaCreate, FacturaResponse
from routes.cotizaciones import tipo_cambio_usd_sugerido
from routes.cuentas_bancarias import resolver_cuenta_id
from routes.plan_cuentas import resolver_plan_cuenta_operacion

router = APIRouter()


def _resolve_docs_logo_url(empresa: dict) -> str | None:
    logos = empresa.get("logos") if isinstance(empresa.get("logos"), list) else []
    if empresa.get("logo_docs_mode") == "manual" and empresa.get("logo_docs_id"):
        for logo in logos:
            if logo.get("id") == empresa.get("logo_docs_id") and logo.get("url"):
                return logo.get("url")
    for etiqueta in ("claro", "general"):
        for logo in logos:
            if logo.get("etiqueta") == etiqueta and logo.get("url"):
                return logo.get("url")
    if logos and logos[0].get("url"):
        return logos[0].get("url")
    return empresa.get("logo_url")




async def _snapshot_emisor(logo_tipo: Optional[str]) -> dict:
    logo = logo_tipo or "arandujar"
    empresa = await db.empresas_propias.find_one({"slug": logo}, {"_id": 0}) or {}
    nombre = empresa.get("razon_social") or empresa.get("nombre") or (
        "JAR Informática" if logo == "jar" else "Arandu Informática" if logo == "arandu" else "AranduJAR Informática"
    )
    return {
        "emisor_razon_social": nombre,
        "emisor_ruc": empresa.get("ruc"),
        "emisor_direccion": empresa.get("direccion"),
        "emisor_telefono": empresa.get("telefono"),
        "emisor_email": empresa.get("email"),
        "emisor_logo_url": _resolve_docs_logo_url(empresa),
    }

async def _cuenta_pago_resuelta(logo_tipo: str, moneda: str, cuenta_id: Optional[str] = None) -> tuple:
    """(cuenta_id, cuenta_nombre) usando predeterminada si falta cuenta."""
    cid = await resolver_cuenta_id(logo_tipo or "arandujar", moneda or "PYG", cuenta_id)
    if not cid:
        return None, None
    c = await db.cuentas_bancarias.find_one({"id": cid}, {"_id": 0, "nombre": 1})
    return cid, (c.get("nombre") if c else None)


# ─────────────────────────────────────────────
#  FACTURAS – CRUD
# ─────────────────────────────────────────────

def _numero_doc_normalizado(numero: Optional[str]) -> str:
    return "".join((numero or "").strip().lower().split())


async def _generar_numero_boleta(logo_tipo: str) -> str:
    """
    Genera un número de boleta único y no repetible usando un contador atómico en MongoDB.
    Formato: BOL-YYYYMM-NNNNNN (ej: BOL-202605-000001)
    El contador es por (logo_tipo, periodo YYYYMM).
    """
    periodo = datetime.now(timezone.utc).strftime("%Y%m")
    key = f"{logo_tipo}:{periodo}"
    result = await db.contadores.find_one_and_update(
        {"_id": f"boleta:{key}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,  # motor usa ReturnDocument.AFTER equivalent
    )
    seq = result.get("seq", 1)
    return f"BOL-{periodo}-{str(seq).zfill(6)}"


async def _ensure_factura_numero_unico(doc_data: dict, ignore_id: Optional[str] = None):
    normalizado = _numero_doc_normalizado(doc_data.get("numero"))
    if not normalizado:
        return
    logo_tipo = doc_data.get("logo_tipo") or "arandujar"
    tipo = doc_data.get("tipo") or "emitida"
    query: dict = {
        "logo_tipo": logo_tipo,
        "tipo": tipo,
        "eliminada": {"$ne": True},
        "$or": [
            {"numero": (doc_data.get("numero") or "").strip()},
            {"numero_normalizado": normalizado},
        ],
    }
    if tipo == "recibida":
        tercero_or = []
        if doc_data.get("ruc"):
            tercero_or.append({"ruc": doc_data.get("ruc")})
        if doc_data.get("razon_social"):
            tercero_or.append({"razon_social": doc_data.get("razon_social")})
        if tercero_or:
            query["$and"] = [{"$or": tercero_or}]
    if ignore_id:
        query["id"] = {"$ne": ignore_id}
    existente = await db.facturas.find_one(query, {"_id": 0, "id": 1, "numero": 1})
    if existente:
        raise HTTPException(status_code=400, detail=f"Ya existe una factura con el número {doc_data.get('numero')}.")


async def _ensure_recibo_numero_unico(numero: Optional[str], logo_tipo: str, ignore_id: Optional[str] = None):
    normalizado = _numero_doc_normalizado(numero)
    if not normalizado:
        return
    query: dict = {
        "logo_tipo": logo_tipo or "arandujar",
        "$or": [
            {"numero": (numero or "").strip()},
            {"numero_normalizado": normalizado},
        ],
    }
    if ignore_id:
        query["id"] = {"$ne": ignore_id}
    existente = await db.recibos.find_one(query, {"_id": 0, "id": 1, "numero": 1})
    if existente:
        raise HTTPException(status_code=400, detail=f"Ya existe un recibo con el número {numero}.")


async def _reservar_numero_timbrado_si_corresponde(doc_data: dict):
    if doc_data.get("sin_factura"):
        return
    logo_tipo = doc_data.get("logo_tipo") or "arandujar"
    punto = doc_data.get("punto_expedicion")
    numero = (doc_data.get("numero") or "").strip()
    if not punto or not numero:
        return

    from routes.timbrado import _ahora, _fmt_numero, _vigente

    config = await db.configuracion_timbrado.find_one({"logo_tipo": logo_tipo}, {"_id": 0})
    if not config or config.get("modo_numeracion") != "automatico":
        return
    timbrado = config.get("timbrado_activo") or {}
    if not _vigente(timbrado.get("fecha_vigencia")):
        raise HTTPException(status_code=400, detail=f"Timbrado vencido (vigencia: {timbrado.get('fecha_vigencia')}).")
    pto_data = next((p for p in timbrado.get("puntos_expedicion", []) if p.get("codigo") == punto), None)
    if not pto_data:
        raise HTTPException(status_code=400, detail=f"Punto de expedición '{punto}' no configurado")

    ultimo = int(pto_data.get("ultimo_numero") or 0)
    numero_desde = int(pto_data.get("numero_desde") or 1)
    numero_hasta = int(pto_data.get("numero_hasta") or 9999999)
    siguiente = max(ultimo + 1, numero_desde)
    esperado = _fmt_numero(timbrado.get("establecimiento", "001"), punto, siguiente)

    if siguiente > numero_hasta:
        raise HTTPException(status_code=400, detail=f"Rango agotado para el punto {punto}.")
    if numero != esperado:
        raise HTTPException(
            status_code=409,
            detail=f"El número {numero} ya no está disponible. Actualizá el número sugerido e intentá de nuevo.",
        )

    result = await db.configuracion_timbrado.update_one(
        {
            "logo_tipo": logo_tipo,
            "timbrado_activo.puntos_expedicion.codigo": punto,
            "timbrado_activo.puntos_expedicion.ultimo_numero": ultimo,
        },
        {
            "$set": {
                "timbrado_activo.puntos_expedicion.$[pto].ultimo_numero": siguiente,
                "updated_at": _ahora(),
            }
        },
        array_filters=[{"pto.codigo": punto}],
    )
    if result.modified_count == 0:
        raise HTTPException(
            status_code=409,
            detail="No se pudo reservar el número por concurrencia. Actualizá el número sugerido e intentá de nuevo.",
        )

@router.get("/admin/facturas")
async def get_facturas(
    logo_tipo: Optional[str] = None,
    tipo: Optional[str] = None,          # emitida | recibida
    estado: Optional[str] = None,        # pendiente | pagada | anulada
    mes: Optional[str] = None,           # YYYY-MM  → filtra por fecha
    modo_boleta: Optional[str] = None,   # "con_factura" | "sin_factura" | None=todas
    incluir_eliminadas: Optional[bool] = False,  # True = mostrar también las eliminadas (para reportes)
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver facturas")
    if incluir_eliminadas and user.get("role") not in ("admin", "gerente", "super_admin") and not has_permission(user, "facturas.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver facturas eliminadas")
    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
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
    if modo_boleta == "con_factura":
        query["sin_factura"] = {"$ne": True}
    elif modo_boleta == "sin_factura":
        query["sin_factura"] = True
    # Por defecto excluir eliminadas; solo mostrarlas si se pide explícitamente (reportes)
    if not incluir_eliminadas:
        query["eliminada"] = {"$ne": True}
    facturas = await db.facturas.find(query, {"_id": 0}).sort("fecha", -1).to_list(1000)
    # Enriquecemos con el nombre actual de la empresa vinculada (apodo) para
    # que cualquier cambio en empresas se refleje sin tocar las facturas.
    empresa_ids = list({f.get("empresa_id") for f in facturas if f.get("empresa_id")})
    if empresa_ids:
        empresas_docs = await db.empresas.find(
            {"id": {"$in": empresa_ids}},
            {"_id": 0, "id": 1, "nombre": 1, "razon_social": 1, "ruc": 1},
        ).to_list(500)
        emp_map = {e["id"]: e for e in empresas_docs}
        for f in facturas:
            eid = f.get("empresa_id")
            if eid and eid in emp_map:
                f["empresa_nombre"] = emp_map[eid].get("nombre") or f.get("empresa_nombre")
    return facturas




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
    # Enriquecer con nombre actual de empresa
    if fac.get("empresa_id"):
        emp = await db.empresas.find_one(
            {"id": fac["empresa_id"]},
            {"_id": 0, "nombre": 1, "razon_social": 1, "ruc": 1},
        )
        if emp and emp.get("nombre"):
            fac["empresa_nombre"] = emp["nombre"]
    return fac


def _build_pago_entry(monto: float, fecha: str, cuenta_id: Optional[str],
                       cuenta_nombre: Optional[str], tipo_cambio: Optional[float]) -> dict:
    """Crea una entrada uniforme de pagos[] que cuadra con el resto del sistema."""
    return {
        "id": str(uuid.uuid4()),
        "monto": monto,
        "fecha": fecha,
        "cuenta_id": cuenta_id,
        "cuenta_nombre": cuenta_nombre,
        "tipo_cambio": tipo_cambio,
        "monto_cuenta": (round(monto / tipo_cambio, 2) if tipo_cambio and tipo_cambio > 0 else None),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def _asegurar_tc_fiscal_factura(doc_data: dict) -> dict:
    if (doc_data.get("moneda") or "PYG").upper() != "USD":
        return doc_data
    try:
        tc = float(doc_data.get("tipo_cambio") or 0)
    except (TypeError, ValueError):
        tc = 0
    if tc > 0:
        return doc_data
    sugerido = await tipo_cambio_usd_sugerido((doc_data.get("fecha") or "")[:10])
    if not sugerido:
        raise HTTPException(status_code=400, detail="Falta el tipo de cambio fiscal para esta factura USD.")
    doc_data["tipo_cambio"] = sugerido
    doc_data["tipo_cambio_fuente"] = "Cambios Chaco"
    doc_data["tipo_cambio_fecha"] = (doc_data.get("fecha") or "")[:10]
    doc_data["tipo_cambio_fiscal_auto"] = True
    return doc_data


def _debe_afectar_stock(doc: dict) -> bool:
    return bool(doc.get("afecta_stock")) and doc.get("tipo", "emitida") == "emitida" and doc.get("estado") != "anulada"


def _tiene_productos_vinculados(doc: dict) -> bool:
    return any(item.get("producto_id") for item in (doc.get("conceptos") or []))


def _iva_incluido_por_conceptos(doc: dict) -> float:
    if doc.get("sin_factura"):
        return 0.0
    conceptos = doc.get("conceptos") or []
    if not conceptos:
        return float(doc.get("iva") or 0)
    total_iva = 0.0
    for item in conceptos:
        subtotal = item.get("subtotal")
        if subtotal is None:
            subtotal = (float(item.get("precio_unitario") or 0) * float(item.get("cantidad") or 1))
        subtotal = float(subtotal or 0)
        iva_tipo = str(item.get("iva_tipo") or "10").lower()
        if iva_tipo in ("exenta", "exento", "0"):
            continue
        if iva_tipo == "5":
            total_iva += subtotal / 21.0
        else:
            total_iva += subtotal / 11.0
    if (doc.get("moneda") or "PYG") == "PYG":
        return round(total_iva)
    return round(total_iva, 2)


async def _validar_productos_conceptos_logo(doc: dict):
    producto_ids = list({item.get("producto_id") for item in (doc.get("conceptos") or []) if item.get("producto_id")})
    if not producto_ids:
        return
    logo_tipo = doc.get("logo_tipo") or "arandujar"
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
                detail=f"El producto '{prod.get('nombre', pid)}' pertenece a otra empresa y no puede usarse en este comprobante.",
            )


def _cantidades_productos_factura(doc: dict) -> dict:
    cantidades = {}
    for item in doc.get("conceptos") or []:
        producto_id = item.get("producto_id")
        cantidad = float(item.get("cantidad") or 0)
        if producto_id and cantidad > 0:
            cantidades[producto_id] = cantidades.get(producto_id, 0) + cantidad
    return cantidades


async def _validar_stock_factura(doc: dict, doc_actual: Optional[dict] = None):
    if not _debe_afectar_stock(doc):
        return
    requeridos = _cantidades_productos_factura(doc)
    if not requeridos:
        return
    reservas_actuales = _cantidades_productos_factura(doc_actual) if doc_actual and _debe_afectar_stock(doc_actual) else {}
    productos = await db.productos.find(
        {"id": {"$in": list(requeridos.keys())}},
        {"_id": 0, "id": 1, "nombre": 1, "stock_actual": 1},
    ).to_list(500)
    prod_map = {p["id"]: p for p in productos}
    for producto_id, cantidad in requeridos.items():
        prod = prod_map.get(producto_id)
        if not prod:
            raise HTTPException(status_code=400, detail="Uno de los productos seleccionados no existe.")
        disponible = float(prod.get("stock_actual") or 0) + float(reservas_actuales.get(producto_id) or 0)
        if cantidad > disponible:
            nombre = prod.get("nombre") or producto_id
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{nombre}'. Disponible: {disponible:g}, solicitado: {cantidad:g}.",
            )


async def _registrar_stock_factura(doc: dict, tipo_mov: str, motivo: str, user: dict):
    if not _debe_afectar_stock(doc):
        return
    from routes.productos import registrar_movimiento
    for item in doc.get("conceptos") or []:
        producto_id = item.get("producto_id")
        cantidad = float(item.get("cantidad") or 0)
        if not producto_id or cantidad <= 0:
            continue
        await registrar_movimiento(
            producto_id=producto_id,
            tipo=tipo_mov,
            cantidad=cantidad,
            motivo=motivo,
            referencia_id=doc.get("id"),
            referencia_tipo="factura",
            precio_unitario=item.get("precio_unitario"),
            notas=f"Factura {doc.get('numero', '')}",
            usuario_id=user.get("id"),
            usuario_nombre=user.get("name", ""),
        )


async def _revertir_stock_factura_fallida(factura_id: str):
    movs = await db.movimientos_stock.find(
        {"referencia_id": factura_id, "referencia_tipo": "factura"},
        {"_id": 0, "producto_id": 1, "tipo": 1, "cantidad": 1},
    ).to_list(500)
    for mov in movs:
        producto_id = mov.get("producto_id")
        cantidad = float(mov.get("cantidad") or 0)
        if not producto_id or cantidad <= 0:
            continue
        if mov.get("tipo") == "salida":
            await db.productos.update_one(
                {"id": producto_id},
                {"$inc": {"stock_actual": cantidad}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        elif mov.get("tipo") == "entrada":
            await db.productos.update_one(
                {"id": producto_id},
                {"$inc": {"stock_actual": -cantidad}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
            )
    if movs:
        await db.movimientos_stock.delete_many({"referencia_id": factura_id, "referencia_tipo": "factura"})


@router.post("/admin/facturas", response_model=FacturaResponse)
async def create_factura(data: FacturaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear facturas")
    now = datetime.now(timezone.utc).isoformat()
    doc_data = data.dict()
    doc_data.update(await _snapshot_emisor(doc_data.get("logo_tipo", "arandujar")))
    doc_data = await _asegurar_tc_fiscal_factura(doc_data)

    uso_plan = "venta_credito" if doc_data.get("forma_pago") == "credito" else "venta_contado"
    plan_cuenta, vencimiento = await resolver_plan_cuenta_operacion(
        doc_data.get("logo_tipo", "arandujar"),
        uso_plan,
        doc_data.get("plan_cuenta_id"),
        doc_data.get("fecha"),
        doc_data.get("fecha_vencimiento"),
    )
    doc_data["plan_cuenta_id"] = plan_cuenta.get("id")
    doc_data["plan_cuenta_nombre"] = plan_cuenta.get("nombre")
    doc_data["fecha_vencimiento"] = vencimiento

    if doc_data.get("sin_factura"):
        # Boleta: auto-generar número único, no requiere timbrado, no afecta IVA fiscal
        numero_boleta = await _generar_numero_boleta(doc_data.get("logo_tipo", "arandujar"))
        doc_data["numero_boleta"] = numero_boleta
        doc_data["numero"] = numero_boleta  # usar boleta como identificador de display
        doc_data["numero_normalizado"] = _numero_doc_normalizado(numero_boleta)
        # Limpiar campos de timbrado si vinieron por error
        doc_data["nro_timbrado"] = None
        doc_data["fecha_inicio_timbrado"] = None
        doc_data["fecha_vigencia_timbrado"] = None
        doc_data["punto_expedicion"] = None
    else:
        # Factura normal: validar número único y timbrado
        if not doc_data.get("numero"):
            raise HTTPException(status_code=400, detail="El número de factura es requerido")
        await _ensure_factura_numero_unico(doc_data)
        doc_data["numero_normalizado"] = _numero_doc_normalizado(doc_data.get("numero"))

    if _tiene_productos_vinculados(doc_data) and not has_permission(user, "facturas.afectar_stock"):
        doc_data["afecta_stock"] = True
    await _validar_productos_conceptos_logo(doc_data)
    doc_data["iva"] = _iva_incluido_por_conceptos(doc_data)
    await _validar_stock_factura(doc_data)
    await _reservar_numero_timbrado_si_corresponde(doc_data)
    # Si se crea ya pagada y se proveyó cuenta, armamos el array pagos[]
    # para que el balance / saldo de cuentas lo registre correctamente.
    if doc_data.get("estado") == "pagada":
        cid, cuenta_nombre = await _cuenta_pago_resuelta(
            doc_data.get("logo_tipo", "arandujar"),
            doc_data.get("moneda", "PYG"),
            doc_data.get("cuenta_id"),
        )
        if not cid:
            raise HTTPException(status_code=400, detail="No hay cuenta bancaria predeterminada. Creá una en Bancos.")
        doc_data["cuenta_id"] = cid
        doc_data["cuenta_nombre"] = cuenta_nombre or doc_data.get("cuenta_nombre")
        doc_data["pagos"] = [_build_pago_entry(
            monto=doc_data.get("monto", 0),
            fecha=doc_data.get("fecha_pago") or doc_data.get("fecha"),
            cuenta_id=cid,
            cuenta_nombre=doc_data["cuenta_nombre"],
            tipo_cambio=doc_data.get("tipo_cambio"),
        )]
        # Asegurar fecha_pago seteada
        if not doc_data.get("fecha_pago"):
            doc_data["fecha_pago"] = doc_data.get("fecha")
    doc = _normalizar_presupuesto_ids({
        "id": str(uuid.uuid4()),
        **doc_data,
        "created_at": now,
    })
    await db.facturas.insert_one(doc)
    try:
        await _registrar_stock_factura(doc, "salida", "factura", user)
    except Exception:
        await _revertir_stock_factura_fallida(doc["id"])
        await db.facturas.delete_one({"id": doc["id"]})
        raise
    ref = doc.get("numero_boleta") or doc.get("numero") or "-"
    tipo_label = "Boleta" if doc.get("sin_factura") else "Factura"
    try:
        await log_auditoria(user, "facturas", "crear_factura",
                            f"{tipo_label} {ref} ({data.tipo}) creada")
    except Exception:
        pass
    return {**doc, "_id": None}


@router.put("/admin/facturas/{factura_id}", response_model=FacturaResponse)
async def update_factura(factura_id: str, data: FacturaCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    update_data = data.dict()
    emisor_keys = ("emisor_razon_social", "emisor_ruc", "emisor_direccion", "emisor_telefono", "emisor_email", "emisor_logo_url")
    if any(k in fac for k in emisor_keys):
        for k in emisor_keys:
            update_data[k] = fac.get(k)
    else:
        update_data.update(await _snapshot_emisor(update_data.get("logo_tipo") or fac.get("logo_tipo", "arandujar")))
    update_data = await _asegurar_tc_fiscal_factura(update_data)

    uso_plan = "venta_credito" if update_data.get("forma_pago") == "credito" else "venta_contado"
    plan_cuenta, vencimiento = await resolver_plan_cuenta_operacion(
        update_data.get("logo_tipo") or fac.get("logo_tipo", "arandujar"),
        uso_plan,
        update_data.get("plan_cuenta_id"),
        update_data.get("fecha") or fac.get("fecha"),
        update_data.get("fecha_vencimiento"),
    )
    update_data["plan_cuenta_id"] = plan_cuenta.get("id")
    update_data["plan_cuenta_nombre"] = plan_cuenta.get("nombre")
    update_data["fecha_vencimiento"] = vencimiento
    if not update_data.get("sin_factura"):
        await _ensure_factura_numero_unico(update_data, ignore_id=factura_id)
    update_data["numero_normalizado"] = _numero_doc_normalizado(update_data.get("numero") or fac.get("numero_boleta", ""))
    if (_tiene_productos_vinculados(update_data) or _tiene_productos_vinculados(fac)) and not has_permission(user, "facturas.afectar_stock"):
        update_data["afecta_stock"] = True
    await _validar_productos_conceptos_logo(update_data)
    update_data["iva"] = _iva_incluido_por_conceptos(update_data)
    await _validar_stock_factura(update_data, fac)
    # Si se está marcando como pagada (estaba pendiente o sin pagos) y se dio cuenta,
    # registramos el pago como entrada en pagos[].
    if update_data.get("estado") == "pagada":
        cid, cuenta_nombre = await _cuenta_pago_resuelta(
            update_data.get("logo_tipo") or fac.get("logo_tipo", "arandujar"),
            update_data.get("moneda") or fac.get("moneda", "PYG"),
            update_data.get("cuenta_id") or fac.get("cuenta_id"),
        )
        if not cid:
            raise HTTPException(status_code=400, detail="No hay cuenta bancaria predeterminada. Creá una en Bancos.")
        update_data["cuenta_id"] = cid
        update_data["cuenta_nombre"] = cuenta_nombre or update_data.get("cuenta_nombre")
        existing_pagos = fac.get("pagos") or []
        already_has_full_pago = any(
            (p.get("monto", 0) >= update_data.get("monto", 0) - 0.01) for p in existing_pagos
        )
        if not already_has_full_pago:
            entry = _build_pago_entry(
                monto=update_data.get("monto", 0),
                fecha=update_data.get("fecha_pago") or update_data.get("fecha"),
                cuenta_id=cid,
                cuenta_nombre=update_data["cuenta_nombre"],
                tipo_cambio=update_data.get("tipo_cambio"),
            )
            update_data["pagos"] = existing_pagos + [entry]
            if not update_data.get("fecha_pago"):
                update_data["fecha_pago"] = update_data.get("fecha")
    updates = _normalizar_presupuesto_ids(update_data)
    if _debe_afectar_stock(fac):
        await _registrar_stock_factura(fac, "entrada", "reversion_factura", user)
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})
    fac_actualizada = {**fac, **updates}
    await _registrar_stock_factura(fac_actualizada, "salida", "factura", user)
    await log_auditoria(user, "facturas", "editar_factura",
                        f"Factura {factura_id} actualizada")
    return fac_actualizada


@router.patch("/admin/facturas/{factura_id}/estado")
async def update_estado_factura(
    factura_id: str,
    estado: str,                     # pagada | pendiente | anulada | parcial
    fecha_pago: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if estado == "anulada":
        if not has_permission(user, "facturas.anular"):
            raise HTTPException(status_code=403, detail="No tiene permiso para anular facturas")
    elif not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    fac = await db.facturas.find_one({"id": factura_id}, {"_id": 0})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    # Revertir stock si se anula una factura que afectaba stock
    if estado == "anulada" and _debe_afectar_stock(fac):
        await _registrar_stock_factura(fac, "entrada", "anulacion_factura", user)
    updates: dict = {"estado": estado}
    if estado in ("pagada", "parcial"):
        updates["fecha_pago"] = fecha_pago or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    elif estado == "pendiente":
        updates["fecha_pago"] = None
        updates["monto_pagado"] = None
        updates["pagos"] = []        # limpiar historial de pagos al revertir
    await db.facturas.update_one({"id": factura_id}, {"$set": updates})
    # Mover pagos a pagos_anulados para que no cuenten en saldos bancarios
    if estado == "anulada":
        await db.facturas.update_one(
            {"id": factura_id},
            {"$set": {"pagos_anulados": fac.get("pagos", []), "pagos": []}}
        )

    # Presupuestos vinculados
    pids = list(fac.get("presupuesto_ids") or [])
    if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
        pids.append(fac["presupuesto_id"])
    for pid in pids:
        await db.presupuestos.update_one(
            {"id": pid},
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

    moneda_pago = "PYG" if (tipo_cambio and float(tipo_cambio) > 0) else fac.get("moneda", "PYG")
    cuenta_id, cuenta_nombre = await _cuenta_pago_resuelta(
        fac.get("logo_tipo", "arandujar"), moneda_pago, cuenta_id
    )
    if not cuenta_id:
        raise HTTPException(status_code=400, detail="No hay cuenta bancaria predeterminada. Creá una en Bancos.")

    # ── Calcular monto en moneda de la cuenta (si hay tipo de cambio) ──
    monto_cuenta = None
    if tipo_cambio and tipo_cambio > 0:
        # Factura en moneda extranjera → convertir a PYG
        # o factura en PYG pagada a cuenta USD → convertir a USD
        monto_cuenta = round(monto_nuevo / tipo_cambio, 2)

    # ── Auto-generar número de recibo (solo para crédito) ────────
    forma_pago = fac.get("forma_pago", "contado")
    recibo_doc = None
    recibo_numero = None

    if forma_pago != "contado":
        if numero_recibo_manual:
            recibo_numero = numero_recibo_manual
        else:
            ultimo_rec = await db.recibos.find_one(
                {"logo_tipo": fac.get("logo_tipo", "arandujar"), "numero": {"$regex": r"^REC-\d+$"}},
                {"numero": 1, "_id": 0},
                sort=[("created_at", -1)]
            )
            if ultimo_rec and ultimo_rec.get("numero"):
                try:
                    n = int(ultimo_rec["numero"].split("-")[-1]) + 1
                except Exception:
                    n = 1
            else:
                n = (await db.recibos.count_documents({"logo_tipo": fac.get("logo_tipo", "arandujar")})) + 1
            while await db.recibos.find_one({"logo_tipo": fac.get("logo_tipo", "arandujar"), "numero": f"REC-{n:04d}"}):
                n += 1
            recibo_numero = f"REC-{n:04d}"
        await _ensure_recibo_numero_unico(recibo_numero, fac.get("logo_tipo", "arandujar"))

        pago_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # ── Crear recibo en colección ────────────────────────────────
        recibo_doc = {
            "id": str(uuid.uuid4()),
            "numero": recibo_numero,
            "numero_normalizado": _numero_doc_normalizado(recibo_numero),
            "factura_id": factura_id,
            "factura_numero": fac.get("numero", ""),
            "razon_social": fac.get("razon_social", ""),
            "ruc": fac.get("ruc"),
            "monto": monto_nuevo,
            "moneda": fac.get("moneda", "PYG"),
            "fecha_pago": fecha_pago,
            "logo_tipo": fac.get("logo_tipo", "arandujar"),
            **{k: fac.get(k) for k in ("emisor_razon_social", "emisor_ruc", "emisor_direccion", "emisor_telefono", "emisor_email", "emisor_logo_url")},
            "cuenta_id": cuenta_id,
            "cuenta_nombre": cuenta_nombre,
            "tipo_cambio": tipo_cambio,
            "monto_cuenta": monto_cuenta,
            "pago_id": pago_id,
            "notas": None,
            "created_at": now,
        }
        await db.recibos.insert_one(recibo_doc)
    else:
        pago_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

    # ── Acumular pagos en array ──────────────────────────────────
    pagos_previos = fac.get("pagos") or []
    nuevo_pago = {
        "id": pago_id,
        "monto": monto_nuevo,
        "fecha": fecha_pago,
        "registrado_por": user.get("name", ""),
        "recibo_id": recibo_doc["id"] if recibo_doc else None,
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
                        f"Pago de {monto_nuevo} en factura {factura_id}" + (f" · recibo {recibo_numero}" if recibo_numero else ""))

    # ── Si pagó completo, marcar presupuestos y contrato ─────────
    if nuevo_estado == "pagada":
        pids = list(fac.get("presupuesto_ids") or [])
        if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
            pids.append(fac["presupuesto_id"])
        for pid in pids:
            await db.presupuestos.update_one(
                {"id": pid}, {"$set": {"estado": "cobrado"}}
            )
    return {**updates, "recibo": {"id": recibo_doc["id"], "numero": recibo_numero} if recibo_doc else None}


@router.post("/admin/facturas/pago-bulk")
async def pago_bulk_facturas(
    data: dict,   # { factura_ids: [], fecha_pago, cuenta_id?, tipo_cambio? }
    user: dict = Depends(require_authenticated)
):
    """Registra pagos en lote agrupando por cliente.
    Por cada grupo de facturas del mismo cliente genera UN solo recibo.
    Facturas de clientes distintos generan recibos separados.
    """
    if not has_permission(user, "facturas.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    factura_ids  = data.get("factura_ids") or []
    fecha_pago   = data.get("fecha_pago") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cuenta_id    = data.get("cuenta_id")
    tipo_cambio  = data.get("tipo_cambio")

    if not factura_ids:
        raise HTTPException(status_code=400, detail="No se enviaron facturas")

    # Obtener nombre de la cuenta una sola vez
    cuenta_nombre = None
    if cuenta_id:
        cuenta_doc = await db.cuentas_bancarias.find_one({"id": cuenta_id}, {"_id": 0, "nombre": 1})
        if cuenta_doc:
            cuenta_nombre = cuenta_doc.get("nombre")

    # Cargar facturas — solo pendientes o parciales
    facturas = []
    for fid in factura_ids:
        fac = await db.facturas.find_one({"id": fid}, {"_id": 0})
        if fac and fac.get("estado") in ("pendiente", "parcial"):
            facturas.append(fac)

    if not facturas:
        raise HTTPException(status_code=400, detail="No hay facturas pendientes válidas")

    # ── Agrupar por cliente (empresa_id o razon_social si no hay empresa_id) ──
    grupos: dict = {}
    for fac in facturas:
        clave = fac.get("empresa_id") or fac.get("razon_social") or fac["id"]
        grupos.setdefault(clave, []).append(fac)

    recibos_creados = []
    ok = 0
    errors = 0
    error_details = []

    for clave_cliente, grupo in grupos.items():
        try:
            now = datetime.now(timezone.utc).isoformat()
            logo_tipo = grupo[0].get("logo_tipo", "arandujar")

            # ── Generar número de recibo único para este grupo ──────────
            # Usamos count + while-loop para evitar dependencia de sort en find_one
            n = (await db.recibos.count_documents({"logo_tipo": logo_tipo})) + 1
            while await db.recibos.find_one({"logo_tipo": logo_tipo, "numero": f"REC-{n:04d}"}):
                n += 1
            recibo_numero = f"REC-{n:04d}"

            # ── Construir items del recibo (una línea por factura) ──────
            monto_total_grupo = 0.0
            items_recibo = []
            for fac in grupo:
                pendiente = float(fac.get("monto") or 0) - float(fac.get("monto_pagado") or 0)
                if pendiente <= 0:
                    pendiente = float(fac.get("monto") or 0)
                monto_total_grupo += pendiente
                items_recibo.append({
                    "factura_id":     fac["id"],
                    "factura_numero": fac.get("numero") or fac.get("numero_boleta") or "",
                    "monto":          pendiente,
                    "moneda":         fac.get("moneda", "PYG"),
                })

            monto_cuenta = None
            if tipo_cambio and tipo_cambio > 0:
                monto_cuenta = round(monto_total_grupo / tipo_cambio, 2)

            # ── Crear recibo único para el grupo ────────────────────────
            recibo_doc = {
                "id":                str(uuid.uuid4()),
                "numero":            recibo_numero,
                "numero_normalizado": _numero_doc_normalizado(recibo_numero),
                # Primer factura como referencia principal (compat. con vistas existentes)
                "factura_id":        grupo[0]["id"],
                "factura_numero":    grupo[0].get("numero") or grupo[0].get("numero_boleta") or "",
                # Lista completa de facturas cubiertas
                "facturas":          items_recibo,
                "razon_social":      grupo[0].get("razon_social", ""),
                "ruc":               grupo[0].get("ruc"),
                "monto":             monto_total_grupo,
                "moneda":            grupo[0].get("moneda", "PYG"),
                "fecha_pago":        fecha_pago,
                "logo_tipo":         logo_tipo,
                **{k: grupo[0].get(k) for k in ("emisor_razon_social", "emisor_ruc", "emisor_direccion", "emisor_telefono", "emisor_email", "emisor_logo_url")},
                "cuenta_id":         cuenta_id,
                "cuenta_nombre":     cuenta_nombre,
                "tipo_cambio":       tipo_cambio,
                "monto_cuenta":      monto_cuenta,
                "notas":             None,
                "created_at":        now,
                "bulk": True,
            }
            await db.recibos.insert_one(recibo_doc)

            # ── Actualizar cada factura del grupo ───────────────────────
            pago_id_grupo = str(uuid.uuid4())
            for fac in grupo:
                pendiente = float(fac.get("monto") or 0) - float(fac.get("monto_pagado") or 0)
                if pendiente <= 0:
                    pendiente = float(fac.get("monto") or 0)
                pagos_previos   = fac.get("pagos") or []
                nuevo_pago = {
                    "id":            str(uuid.uuid4()),
                    "monto":         pendiente,
                    "fecha":         fecha_pago,
                    "registrado_por": user.get("name", ""),
                    "recibo_id":     recibo_doc["id"],
                    "recibo_numero": recibo_numero,
                    "cuenta_id":     cuenta_id,
                    "cuenta_nombre": cuenta_nombre,
                    "tipo_cambio":   tipo_cambio,
                    "monto_cuenta":  round(pendiente / tipo_cambio, 2) if tipo_cambio and tipo_cambio > 0 else None,
                    "created_at":    now,
                    "bulk": True,
                }
                pagos_actualizados = pagos_previos + [nuevo_pago]
                monto_acumulado    = sum(p["monto"] for p in pagos_actualizados)
                monto_total_fac    = float(fac.get("monto") or 0)
                nuevo_estado       = "pagada" if monto_acumulado >= monto_total_fac else "parcial"
                monto_acumulado    = min(monto_acumulado, monto_total_fac)

                await db.facturas.update_one({"id": fac["id"]}, {"$set": {
                    "estado":       nuevo_estado,
                    "monto_pagado": monto_acumulado,
                    "fecha_pago":   fecha_pago,
                    "pagos":        pagos_actualizados,
                }})

                # Marcar presupuestos como cobrados si aplica
                if nuevo_estado == "pagada":
                    pids = list(fac.get("presupuesto_ids") or [])
                    if fac.get("presupuesto_id") and fac["presupuesto_id"] not in pids:
                        pids.append(fac["presupuesto_id"])
                    for pid in pids:
                        await db.presupuestos.update_one({"id": pid}, {"$set": {"estado": "cobrado"}})

                ok += 1

            await log_auditoria(user, "facturas", "pago_bulk",
                f"Pago bulk: {len(grupo)} factura(s) de cliente '{clave_cliente}' · recibo {recibo_numero}")

            recibos_creados.append({
                "recibo_id":     recibo_doc["id"],
                "recibo_numero": recibo_numero,
                "cliente":       grupo[0].get("razon_social") or clave_cliente,
                "facturas_count": len(grupo),
                "monto_total":   monto_total_grupo,
            })

        except Exception as exc:
            errors += len(grupo)
            detalle = f"Cliente '{clave_cliente}': {type(exc).__name__}: {str(exc)}"
            error_details.append(detalle)
            try:
                await log_auditoria(user, "facturas", "pago_bulk_error", detalle)
            except Exception:
                pass

    return {
        "ok":           ok,
        "errors":       errors,
        "recibos":      recibos_creados,
        "error_details": error_details,
    }


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

    # Limpiar recibos vinculados a pagos de esta factura
    for pago in (fac.get("pagos") or []):
        if pago.get("recibo_id"):
            await db.recibos.delete_one({"id": pago["recibo_id"]})

    # Revertir stock SIN dejar rastro en historial:
    # 1. Eliminar los movimientos de salida originales vinculados a esta factura
    # 2. Ajustar el stock directamente (sin registrar un movimiento nuevo)
    if _debe_afectar_stock(fac):
        for item in (fac.get("conceptos") or []):
            producto_id = item.get("producto_id")
            cantidad = float(item.get("cantidad") or 0)
            if not producto_id or cantidad <= 0:
                continue
            # Borrar los movimientos de salida de esta factura
            await db.movimientos_stock.delete_many({
                "producto_id": producto_id,
                "referencia_id": factura_id,
                "referencia_tipo": "factura",
            })
            # Restaurar stock directamente sin generar nuevo movimiento
            await db.productos.update_one(
                {"id": producto_id},
                {"$inc": {"stock_actual": cantidad},
                 "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
            )

    # Soft delete: marcar como eliminada, NO borrar el documento
    now = datetime.now(timezone.utc).isoformat()
    await db.facturas.update_one(
        {"id": factura_id},
        {"$set": {
            "eliminada": True,
            "eliminada_at": now,
            "eliminada_por": user.get("name", user.get("id", "sistema")),
            "eliminada_por_id": user.get("id"),
        }}
    )
    await log_auditoria(user, "facturas", "eliminar_factura",
                        f"Factura {fac.get('numero', factura_id)} eliminada por {user.get('name', '?')}")
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
    await apply_logo_filter(logo_q, user, logo_tipo if logo_tipo and logo_tipo != "todas" else None)
    if is_forbidden(logo_q):
        return {"emitidas": {"cantidad": 0, "monto_pyg": 0}, "emitidas_pagadas": {"cantidad": 0, "monto_pyg": 0}, "emitidas_pendientes": {"cantidad": 0, "monto_pyg": 0}, "recibidas": {"cantidad": 0, "monto_pyg": 0}, "recibidas_pagadas": {"cantidad": 0, "monto_pyg": 0}, "recibidas_pendientes": {"cantidad": 0, "monto_pyg": 0}}
    query.update(logo_q)
    if mes:
        query["fecha"] = {"$regex": f"^{mes}"}
    query["eliminada"] = {"$ne": True}

    facturas = await db.facturas.find(query, {"_id": 0,
        "tipo": 1, "estado": 1, "monto": 1, "moneda": 1, "tipo_cambio": 1}).to_list(5000)

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
