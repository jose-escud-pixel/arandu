from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso, apply_logo_filter, is_forbidden, log_auditoria

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProductoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    sku: str                              # SKU obligatorio
    categoria: Optional[str] = None
    precio_costo: float = 0
    precio_venta: float = 0
    stock_actual: float = 0
    stock_minimo: float = 0
    unidad: str = "unidad"   # unidad | kg | litro | metro | caja | etc.
    logo_tipo: str = "arandujar"
    activo: bool = True
    iva_tipo: str = "10"                  # exenta | 5 | 10

class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    sku: Optional[str] = None
    categoria: Optional[str] = None
    precio_costo: Optional[float] = None
    precio_venta: Optional[float] = None
    stock_minimo: Optional[float] = None
    unidad: Optional[str] = None
    logo_tipo: Optional[str] = None
    activo: Optional[bool] = None
    iva_tipo: Optional[str] = None        # exenta | 5 | 10

class MovimientoManualCreate(BaseModel):
    tipo: str           # "entrada" | "salida" | "ajuste"
    cantidad: float
    motivo: str = "ajuste_manual"
    precio_unitario: Optional[float] = None
    notas: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def registrar_movimiento(
    producto_id: str,
    tipo: str,         # entrada | salida | ajuste
    cantidad: float,
    motivo: str,       # compra | venta | ajuste_manual | devolucion
    referencia_id: Optional[str] = None,
    referencia_tipo: Optional[str] = None,
    precio_unitario: Optional[float] = None,
    notas: Optional[str] = None,
    usuario_id: Optional[str] = None,
    usuario_nombre: Optional[str] = None,
) -> dict:
    """
    Registra un movimiento de stock y actualiza el stock del producto.
    Retorna el nuevo stock_actual.
    """
    producto = await db.productos.find_one({"id": producto_id}, {"_id": 0})
    if not producto:
        return {}

    stock_anterior = producto.get("stock_actual", 0)
    if tipo == "entrada":
        stock_nuevo = stock_anterior + cantidad
    elif tipo == "salida":
        stock_nuevo = max(0, stock_anterior - cantidad)
    else:  # ajuste: fija el valor absoluto
        stock_nuevo = cantidad

    await db.productos.update_one(
        {"id": producto_id},
        {"$set": {"stock_actual": stock_nuevo, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    mov = {
        "id": str(uuid.uuid4()),
        "producto_id": producto_id,
        "producto_nombre": producto.get("nombre", ""),
        "tipo": tipo,
        "cantidad": cantidad,
        "stock_anterior": stock_anterior,
        "stock_nuevo": stock_nuevo,
        "motivo": motivo,
        "referencia_id": referencia_id,
        "referencia_tipo": referencia_tipo,
        "precio_unitario": precio_unitario,
        "notas": notas,
        "usuario_id": usuario_id,
        "usuario_nombre": usuario_nombre,
        "fecha": datetime.now(timezone.utc).isoformat()[:10],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.movimientos_stock.insert_one(mov)
    return {k: v for k, v in mov.items() if k != "_id"}


# ── CRUD Productos ────────────────────────────────────────────────────────────

@router.get("/admin/productos")
async def get_productos(
    logo_tipo: Optional[str] = None,
    search: Optional[str] = None,
    categoria: Optional[str] = None,
    activo: Optional[bool] = None,
    user: dict = Depends(require_authenticated),
):
    query = {}
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)

    if search:
        query["$or"] = [
            {"nombre":      {"$regex": search, "$options": "i"}},
            {"sku":         {"$regex": search, "$options": "i"}},
            {"descripcion": {"$regex": search, "$options": "i"}},
            {"categoria":   {"$regex": search, "$options": "i"}},
        ]
    if categoria:
        query["categoria"] = categoria
    if activo is not None:
        query["activo"] = activo

    productos = await db.productos.find(query, {"_id": 0}).sort("nombre", 1).to_list(1000)
    return productos


@router.post("/admin/productos")
async def create_producto(data: ProductoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "inventario_productos.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    # Validar SKU único
    sku_trimmed = (data.sku or "").strip()
    if not sku_trimmed:
        raise HTTPException(status_code=400, detail="El SKU es obligatorio")
    existe_sku = await db.productos.find_one({"sku": sku_trimmed}, {"_id": 0, "id": 1})
    if existe_sku:
        raise HTTPException(status_code=400, detail=f"Ya existe un producto con el SKU '{sku_trimmed}'")

    # Validar nombre único (case-insensitive)
    nombre_trimmed = (data.nombre or "").strip()
    if not nombre_trimmed:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    existe_nombre = await db.productos.find_one(
        {"nombre": {"$regex": f"^{nombre_trimmed}$", "$options": "i"}}, {"_id": 0, "id": 1}
    )
    if existe_nombre:
        raise HTTPException(status_code=400, detail=f"Ya existe un producto con el nombre '{nombre_trimmed}'")

    # Validar permiso para crear servicios
    es_servicio = (data.categoria or "").strip() == "Servicios"
    if es_servicio and not has_permission(user, "inventario_productos.crear_servicio"):
        raise HTTPException(status_code=403, detail="No tenés permiso para crear productos de tipo Servicios")

    # Los servicios no manejan stock
    stock_actual = 0 if es_servicio else data.stock_actual
    stock_minimo = 0 if es_servicio else data.stock_minimo

    # Validar permiso para cargar stock inicial
    if stock_actual > 0 and not has_permission(user, "inventario_productos.stock_inicial"):
        raise HTTPException(status_code=403, detail="No tenés permiso para cargar stock inicial")

    data_dict = data.dict()
    data_dict["sku"] = sku_trimmed
    data_dict["stock_actual"] = stock_actual
    data_dict["stock_minimo"] = stock_minimo

    doc = {
        "id": str(uuid.uuid4()),
        **data_dict,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.productos.insert_one(doc)

    # Si se carga con stock inicial, registrar el movimiento de entrada
    if stock_actual > 0:
        await registrar_movimiento(
            producto_id=doc["id"],
            tipo="entrada",
            cantidad=stock_actual,
            motivo="stock_inicial",
            notas="Stock inicial al crear producto",
            usuario_id=user.get("id"),
            usuario_nombre=user.get("name"),
        )

    await log_auditoria(user, "inventario_productos", "crear", f"Producto creado: {data.nombre}", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/productos/{producto_id}")
async def update_producto(
    producto_id: str,
    data: ProductoUpdate,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "inventario_productos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    update_fields = {k: v for k, v in data.dict().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="Sin campos para actualizar")

    # Validar SKU único al editar (debe ser distinto al del mismo producto)
    if "sku" in update_fields:
        sku_trimmed = (update_fields["sku"] or "").strip()
        if not sku_trimmed:
            raise HTTPException(status_code=400, detail="El SKU es obligatorio")
        update_fields["sku"] = sku_trimmed
        existe_sku = await db.productos.find_one(
            {"sku": sku_trimmed, "id": {"$ne": producto_id}}, {"_id": 0, "id": 1}
        )
        if existe_sku:
            raise HTTPException(status_code=400, detail=f"Ya existe otro producto con el SKU '{sku_trimmed}'")

    # Validar nombre único al editar (case-insensitive, excluyendo el mismo)
    if "nombre" in update_fields:
        nombre_trimmed = (update_fields["nombre"] or "").strip()
        if not nombre_trimmed:
            raise HTTPException(status_code=400, detail="El nombre es obligatorio")
        update_fields["nombre"] = nombre_trimmed
        existe_nombre = await db.productos.find_one(
            {"nombre": {"$regex": f"^{nombre_trimmed}$", "$options": "i"}, "id": {"$ne": producto_id}},
            {"_id": 0, "id": 1}
        )
        if existe_nombre:
            raise HTTPException(status_code=400, detail=f"Ya existe otro producto con el nombre '{nombre_trimmed}'")

    # Validar permiso de servicios si se está cambiando la categoría
    if "categoria" in update_fields:
        es_servicio = (update_fields.get("categoria") or "").strip() == "Servicios"
        if es_servicio and not has_permission(user, "inventario_productos.crear_servicio"):
            raise HTTPException(status_code=403, detail="No tenés permiso para asignar categoría Servicios")
        # Los servicios no manejan stock mínimo
        if es_servicio:
            update_fields["stock_minimo"] = 0

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.productos.update_one({"id": producto_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    producto = await db.productos.find_one({"id": producto_id}, {"_id": 0})
    await log_auditoria(user, "inventario_productos", "editar", f"Producto actualizado: {producto.get('nombre', producto_id)}", producto_id)
    return producto


@router.delete("/admin/productos/{producto_id}")
async def delete_producto(producto_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "inventario_productos.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    result = await db.productos.delete_one({"id": producto_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    # Limpiar movimientos huérfanos
    await db.movimientos_stock.delete_many({"producto_id": producto_id})
    await log_auditoria(user, "inventario_productos", "eliminar", f"Producto eliminado: {producto_id}", producto_id)
    return {"ok": True}


# ── Movimientos de stock ──────────────────────────────────────────────────────

@router.get("/admin/productos/{producto_id}/movimientos")
async def get_movimientos(
    producto_id: str,
    user: dict = Depends(require_authenticated),
):
    movs = await db.movimientos_stock.find(
        {"producto_id": producto_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return movs


@router.post("/admin/productos/{producto_id}/movimiento")
async def add_movimiento_manual(
    producto_id: str,
    data: MovimientoManualCreate,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "inventario_productos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    producto = await db.productos.find_one({"id": producto_id}, {"_id": 0})
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    mov = await registrar_movimiento(
        producto_id=producto_id,
        tipo=data.tipo,
        cantidad=data.cantidad,
        motivo=data.motivo,
        precio_unitario=data.precio_unitario,
        notas=data.notas,
        usuario_id=user.get("id"),
        usuario_nombre=user.get("name"),
    )
    await log_auditoria(user, "historial_stock", "movimiento_manual", f"Movimiento {data.tipo} de stock", mov.get("id", ""))
    return mov


@router.get("/admin/stock-movimientos")
async def get_stock_movimientos(
    logo_tipo: Optional[str] = None,
    tipo: Optional[str] = None,
    motivo: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "historial_stock.ver") and not has_permission(user, "inventario_productos.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []

    prod_query = dict(logo_q)
    productos = await db.productos.find(prod_query, {"_id": 0, "id": 1, "logo_tipo": 1, "sku": 1, "categoria": 1}).to_list(2000)
    prod_map = {p["id"]: p for p in productos}
    query = {"producto_id": {"$in": list(prod_map.keys())}}
    if tipo:
        query["tipo"] = tipo
    if motivo:
        query["motivo"] = motivo
    if desde or hasta:
        query["fecha"] = {}
        if desde:
            query["fecha"]["$gte"] = desde
        if hasta:
            query["fecha"]["$lte"] = hasta
    if search:
        query["$or"] = [
            {"producto_nombre": {"$regex": search, "$options": "i"}},
            {"motivo": {"$regex": search, "$options": "i"}},
            {"notas": {"$regex": search, "$options": "i"}},
            {"usuario_nombre": {"$regex": search, "$options": "i"}},
        ]

    movs = await db.movimientos_stock.find(query, {"_id": 0}).sort("created_at", -1).to_list(3000)
    for m in movs:
        p = prod_map.get(m.get("producto_id"), {})
        m["logo_tipo"] = p.get("logo_tipo")
        m["sku"] = p.get("sku")
        m["categoria"] = p.get("categoria")
    return movs


# ── Resumen de stock bajo mínimo ──────────────────────────────────────────────

@router.get("/admin/productos/alertas/stock-bajo")
async def get_stock_bajo(user: dict = Depends(require_authenticated)):
    logos_acceso = await get_logos_acceso(user)
    query = {"activo": True}
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}

    productos = await db.productos.find(query, {"_id": 0}).to_list(1000)
    bajo_minimo = [
        p for p in productos
        if p.get("stock_minimo", 0) > 0 and p.get("stock_actual", 0) <= p.get("stock_minimo", 0)
    ]
    return bajo_minimo
