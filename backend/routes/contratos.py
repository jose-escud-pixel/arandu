from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
from typing import List, Optional

from config import db
from auth import require_authenticated, has_permission, log_auditoria, get_logos_acceso
from models.schemas import ContratoCreate, ContratoResponse

router = APIRouter()


# ─────────────────────────────────────────────
#  CONTRATOS – CRUD
# ─────────────────────────────────────────────

@router.get("/admin/contratos", response_model=dict)
async def get_contratos(
    logo_tipo: Optional[str] = None,
    user: dict = Depends(require_authenticated)
):
    if not has_permission(user, "contratos.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso para ver contratos")
    query = {}
    logos_acceso = await get_logos_acceso(user)
    if logos_acceso is not None:
        query["logo_tipo"] = {"$in": logos_acceso}
    elif logo_tipo and logo_tipo != "todas":
        query["logo_tipo"] = logo_tipo
    contratos = await db.contratos.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Enriquecer con nombre de empresa
    for c in contratos:
        if c.get("empresa_id"):
            empresa = await db.empresas.find_one({"id": c["empresa_id"]}, {"_id": 0})
            if empresa:
                c["empresa_nombre"] = empresa.get("nombre") or empresa.get("razon_social") or "-"
    return {"contratos": contratos}


@router.get("/admin/contratos/{contrato_id}", response_model=ContratoResponse)
async def get_contrato(contrato_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    c = await db.contratos.find_one({"id": contrato_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    # Enriquecer con nombre de empresa
    if c.get("empresa_id"):
        empresa = await db.empresas.find_one({"id": c["empresa_id"]}, {"_id": 0})
        if empresa:
            c["empresa_nombre"] = empresa.get("nombre") or empresa.get("razon_social") or "-"
    return c


@router.post("/admin/contratos", response_model=ContratoResponse)
async def create_contrato(data: ContratoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso para crear contratos")
    now = datetime.now(timezone.utc).isoformat()

    # Auto-numbering: CON-001, CON-002, etc.
    numero = data.numero
    if not numero:
        ultimo = await db.contratos.find_one({}, {"numero": 1, "_id": 0}, sort=[("created_at", -1)])
        if ultimo and ultimo.get("numero"):
            try:
                n = int(ultimo["numero"].split("-")[-1]) + 1
            except Exception:
                n = 1
        else:
            count = await db.contratos.count_documents({})
            n = count + 1
        numero = f"CON-{n:03d}"

    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "numero": numero,
        "created_at": now,
    }
    await db.contratos.insert_one(doc)
    await log_auditoria(user, "contratos", "crear_contrato",
                        f"Contrato {numero} creado")

    # Enriquecer con nombre de empresa
    if doc.get("empresa_id"):
        empresa = await db.empresas.find_one({"id": doc["empresa_id"]}, {"_id": 0})
        if empresa:
            doc["empresa_nombre"] = empresa.get("nombre") or empresa.get("razon_social") or "-"

    return doc


@router.put("/admin/contratos/{contrato_id}", response_model=ContratoResponse)
async def update_contrato(contrato_id: str, data: ContratoCreate, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.editar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    c = await db.contratos.find_one({"id": contrato_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    updates = data.dict()
    await db.contratos.update_one({"id": contrato_id}, {"$set": updates})
    await log_auditoria(user, "contratos", "editar_contrato",
                        f"Contrato {contrato_id} actualizado")
    c_actualizado = {**c, **updates}

    # Enriquecer con nombre de empresa
    if c_actualizado.get("empresa_id"):
        empresa = await db.empresas.find_one({"id": c_actualizado["empresa_id"]}, {"_id": 0})
        if empresa:
            c_actualizado["empresa_nombre"] = empresa.get("nombre") or empresa.get("razon_social") or "-"

    return c_actualizado


@router.delete("/admin/contratos/{contrato_id}")
async def delete_contrato(contrato_id: str, user: dict = Depends(require_authenticated)):
    if not has_permission(user, "contratos.eliminar"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    c = await db.contratos.find_one({"id": contrato_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    await db.contratos.delete_one({"id": contrato_id})
    await log_auditoria(user, "contratos", "eliminar_contrato",
                        f"Contrato {c.get('numero', contrato_id)} eliminado")
    return {"detail": "Contrato eliminado"}
