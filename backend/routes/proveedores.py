from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso, apply_logo_filter, is_forbidden
from models.schemas import ProveedorCreate, ProveedorResponse, PagoProveedorCreate, PagoProveedorResponse

router = APIRouter()


@router.get("/admin/proveedores", response_model=List[ProveedorResponse])
async def get_proveedores(activo: Optional[bool] = None, logo_tipo: Optional[str] = None, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "proveedores.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver proveedores")
    query = {}
    if activo is not None:
        query["activo"] = activo
    logo_q: dict = {}
    await apply_logo_filter(logo_q, user, logo_tipo)
    if is_forbidden(logo_q):
        return []
    query.update(logo_q)
    proveedores = await db.proveedores.find(query, {"_id": 0}).sort("nombre", 1).to_list(500)
    return proveedores


@router.post("/admin/proveedores", response_model=ProveedorResponse)
async def create_proveedor(data: ProveedorCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "proveedores.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear proveedores")
    prov_id = str(uuid.uuid4())
    doc = {
        "id": prov_id,
        "nombre": data.nombre,
        "ruc": data.ruc,
        "contacto": data.contacto,
        "telefono": data.telefono,
        "email": data.email,
        "direccion": data.direccion,
        "categoria": data.categoria,
        "notas": data.notas,
        "activo": data.activo,
        "logo_tipo": data.logo_tipo,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.proveedores.insert_one(doc)
    await log_auditoria(user, "proveedores", "crear", f"Proveedor '{data.nombre}' creado", prov_id)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/admin/proveedores/{prov_id}", response_model=ProveedorResponse)
async def update_proveedor(prov_id: str, data: ProveedorCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso para editar proveedores")
    existing = await db.proveedores.find_one({"id": prov_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    update_fields = {
        "nombre": data.nombre,
        "ruc": data.ruc,
        "contacto": data.contacto,
        "telefono": data.telefono,
        "email": data.email,
        "direccion": data.direccion,
        "categoria": data.categoria,
        "notas": data.notas,
        "activo": data.activo,
        "logo_tipo": data.logo_tipo,
    }
    await db.proveedores.update_one({"id": prov_id}, {"$set": update_fields})
    updated = await db.proveedores.find_one({"id": prov_id}, {"_id": 0})
    return updated


@router.delete("/admin/proveedores/{prov_id}")
async def delete_proveedor(prov_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "proveedores.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar proveedores")
    result = await db.proveedores.delete_one({"id": prov_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return {"success": True}


# ─────────────────────────────────────────────────────────────────
#  DEUDA: suma costos reales no pagados de todos los presupuestos
# ─────────────────────────────────────────────────────────────────

def _to_pyg(monto: float, moneda: str, tc: Optional[float]) -> float:
    if moneda == "PYG" or not moneda:
        return monto
    return monto * (tc or 1.0)


@router.get("/admin/proveedores/{prov_id}/deuda")
async def get_deuda_proveedor(prov_id: str, user: dict = Depends(require_authenticated)):
    """
    Calcula la deuda pendiente con un proveedor:
    suma los costos_reales de todos los presupuestos donde el proveedor
    aparece como nombre y el ítem NO está marcado como pagado en proveedores_pagos.
    Devuelve desglose por moneda original + total PYG estimado.
    """
    if not has_permission(user, "proveedores.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    proveedor = await db.proveedores.find_one({"id": prov_id}, {"_id": 0})
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    nombre = proveedor["nombre"]

    # Buscamos todos los presupuestos con costos_reales que involucren este proveedor
    presupuestos = await db.presupuestos.find(
        {"costos_reales.items.proveedor": nombre},
        {"_id": 0, "id": 1, "numero": 1, "nombre_archivo": 1, "empresa_nombre": 1,
         "costos_reales": 1, "moneda": 1, "tipo_cambio": 1}
    ).to_list(500)

    items_deuda = []
    total_pyg = 0.0

    for p in presupuestos:
        cr = p.get("costos_reales") or {}
        items = cr.get("items") or []
        pagos = {pg["proveedor"]: pg for pg in (cr.get("proveedores_pagos") or [])}

        # ¿Está marcado como pagado en proveedores_pagos?
        pago_info = pagos.get(nombre, {})
        ya_pagado = pago_info.get("pagado", False)

        for item in items:
            if (item.get("proveedor") or "") != nombre:
                continue
            costo = item.get("costo_real") or item.get("costo_estimado") or 0
            if costo <= 0:
                continue

            # Moneda del ítem (puede ser distinta a la del presupuesto)
            moneda_item = item.get("moneda_costo") or item.get("moneda_item") or p.get("moneda", "PYG")
            tc_item = item.get("tipo_cambio_costo") or item.get("tipo_cambio_item") or p.get("tipo_cambio") or 1.0
            pyg_est = _to_pyg(costo, moneda_item, tc_item)

            items_deuda.append({
                "presupuesto_id": p["id"],
                "presupuesto_numero": p.get("numero", ""),
                "presupuesto_nombre": p.get("nombre_archivo", ""),
                "empresa": p.get("empresa_nombre", ""),
                "descripcion": item.get("descripcion", ""),
                "monto": costo,
                "moneda": moneda_item,
                "tipo_cambio_estimado": tc_item,
                "monto_pyg_estimado": round(pyg_est),
                "pagado": ya_pagado,
            })
            if not ya_pagado:
                total_pyg += pyg_est

    # Agrupar deuda pendiente por moneda original
    deuda_por_moneda = {}
    for it in items_deuda:
        if it["pagado"]:
            continue
        m = it["moneda"]
        deuda_por_moneda[m] = deuda_por_moneda.get(m, 0) + it["monto"]

    return {
        "proveedor_id": prov_id,
        "proveedor_nombre": nombre,
        "items": items_deuda,
        "deuda_por_moneda": deuda_por_moneda,   # { "USD": 500, "PYG": 300000 }
        "total_pyg_estimado": round(total_pyg),
    }


# ─────────────────────────────────────────────────────────────────
#  PAGOS A PROVEEDOR
# ─────────────────────────────────────────────────────────────────

@router.get("/admin/proveedores/{prov_id}/pagos", response_model=List[PagoProveedorResponse])
async def get_pagos_proveedor(prov_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "proveedores.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    proveedor = await db.proveedores.find_one({"id": prov_id}, {"_id": 0, "nombre": 1})
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    pagos = await db.pagos_proveedores.find({"proveedor_id": prov_id}, {"_id": 0}).sort("fecha_pago", -1).to_list(200)
    for p in pagos:
        p["proveedor_nombre"] = proveedor["nombre"]
    return pagos


@router.post("/admin/proveedores/{prov_id}/pagos", response_model=PagoProveedorResponse)
async def create_pago_proveedor(prov_id: str, data: PagoProveedorCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso para registrar pagos")
    proveedor = await db.proveedores.find_one({"id": prov_id}, {"_id": 0, "nombre": 1})
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Calcular monto en PYG usando TC real del día
    if data.moneda == "PYG":
        monto_pyg = data.monto_pagado
    else:
        tc = data.tipo_cambio_real or 1.0
        monto_pyg = data.monto_pagado * tc

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "proveedor_id": prov_id,
        "monto_pagado": data.monto_pagado,
        "moneda": data.moneda,
        "tipo_cambio_real": data.tipo_cambio_real,
        "monto_pyg": round(monto_pyg),
        "fecha_pago": data.fecha_pago,
        "notas": data.notas,
        "presupuesto_ids": data.presupuesto_ids,
        "created_at": now,
    }
    await db.pagos_proveedores.insert_one(doc)
    await log_auditoria(user, "proveedores", "pago", f"Pago de {data.monto_pagado} {data.moneda} a {proveedor['nombre']}", prov_id)
    return {**doc, "proveedor_nombre": proveedor["nombre"]}


@router.delete("/admin/pagos_proveedores/{pago_id}")
async def delete_pago_proveedor(pago_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "proveedores.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    result = await db.pagos_proveedores.delete_one({"id": pago_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return {"success": True}
