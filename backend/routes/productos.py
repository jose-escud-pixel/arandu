from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from pydantic import BaseModel

from config import db
from auth import require_authenticated, has_permission, get_logos_acceso, apply_logo_filter, is_forbidden

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProductoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    sku: Optional[str] = None
    categoria: Optional[str] = None
    precio_costo: float = 0
    precio_venta: float = 0
    stock_actual: float = 0
    stock_minimo: float = 0
    unidad: str = "unidad"   # unidad | kg | litro | metro | caja | etc.
    logo_tipo: str = "arandujar"
    activo: bool = True

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
    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.productos.insert_one(doc)

    # Si se carga con stock inicial, registrar el movimiento de entrada
    if data.stock_actual > 0:
        await registrar_movimiento(
            producto_id=doc["id"],
            tipo="entrada",
            cantidad=data.stock_actual,
            motivo="stock_inicial",
            notas="Stock inicial al crear producto",
            usuario_id=user.get("id"),
            usuario_nombre=user.get("name"),
        )

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
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.productos.update_one({"id": producto_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    producto = await db.productos.find_one({"id": producto_id}, {"_id": 0})
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
    return mov


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
