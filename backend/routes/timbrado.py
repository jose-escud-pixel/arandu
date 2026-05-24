"""
Gestión de timbrado (autorización SET) por empresa propia.

Estructura del documento en MongoDB (colección: configuracion_timbrado):
{
  "logo_tipo": "arandu",
  "modo_numeracion": "manual" | "automatico",
  "timbrado_activo": {
    "id": "<uuid>",
    "nro_timbrado": "12345678",
    "establecimiento": "001",
    "fecha_inicio": "2024-01-01",
    "fecha_vigencia": "2026-12-31",
    "puntos_expedicion": [
      {
        "codigo": "001",
        "descripcion": "Oficina central",
        "numero_desde": 900,    # primer número del rango asignado por SET
        "numero_hasta": 1500,   # último número del rango asignado por SET
        "ultimo_numero": 920    # último número usado (0 = ninguno emitido aún)
      }
    ],
    "fecha_registro": "2024-01-01T..."
  },
  "historial_timbrados": [
    {
      "id": "<uuid>",
      "nro_timbrado": "...",
      "establecimiento": "...",
      "fecha_inicio": "...",
      "fecha_vigencia": "...",
      "puntos_expedicion": [...],
      "motivo_cierre": "vencido" | "agotado" | "reemplazado",
      "fecha_cierre": "..."
    }
  ]
}
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel
import uuid

from config import db
from auth import require_authenticated, has_permission

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PuntoExpedicionInput(BaseModel):
    codigo: str            # "001", "002", etc.
    descripcion: str = ""
    numero_desde: int = 1
    numero_hasta: int = 9999999

class TimbradoActivoInput(BaseModel):
    nro_timbrado: str
    establecimiento: str = "001"
    fecha_inicio: str           # YYYY-MM-DD
    fecha_vigencia: str         # YYYY-MM-DD
    puntos_expedicion: List[PuntoExpedicionInput] = []

class ConfigTimbradoUpsert(BaseModel):
    modo_numeracion: str = "manual"   # "manual" | "automatico"
    timbrado: TimbradoActivoInput

class SiguienteNumeroRequest(BaseModel):
    punto_expedicion: str = "001"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hoy() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()

def _vigente(fecha_vigencia: Optional[str]) -> bool:
    if not fecha_vigencia:
        return False
    return fecha_vigencia >= _hoy()

def _fmt_numero(establecimiento: str, punto: str, numero: int) -> str:
    """XXX-YYY-NNNNNNN"""
    return f"{str(establecimiento).zfill(3)}-{str(punto).zfill(3)}-{str(numero).zfill(7)}"

def _config_vacio(logo_tipo: str) -> dict:
    return {
        "logo_tipo": logo_tipo,
        "modo_numeracion": "manual",
        "timbrado_activo": None,
        "historial_timbrados": [],
    }

def _alertas_timbrado(timbrado: dict) -> list:
    """Genera lista de alertas sobre el estado del timbrado activo."""
    alertas = []
    if not timbrado:
        return alertas

    hoy = _hoy()
    vigencia = timbrado.get("fecha_vigencia", "")

    # Alerta de vencimiento próximo (≤ 30 días)
    if vigencia:
        from datetime import date
        try:
            dias = (date.fromisoformat(vigencia) - date.fromisoformat(hoy)).days
            if dias < 0:
                alertas.append({ "tipo": "error", "mensaje": f"Timbrado vencido el {vigencia}." })
            elif dias <= 30:
                alertas.append({ "tipo": "warning", "mensaje": f"El timbrado vence en {dias} día(s) ({vigencia})." })
        except ValueError:
            pass

    # Alertas de rango por punto de expedición
    for pto in timbrado.get("puntos_expedicion", []):
        codigo = pto.get("codigo", "?")
        desde = pto.get("numero_desde", 1)
        hasta = pto.get("numero_hasta", 9999999)
        ultimo = pto.get("ultimo_numero", 0)
        total = hasta - desde + 1
        usados = max(0, ultimo - desde + 1) if ultimo >= desde else 0
        restantes = hasta - max(ultimo, desde - 1)

        if ultimo >= hasta:
            alertas.append({
                "tipo": "error",
                "mensaje": f"Punto {codigo}: rango agotado (último: {_fmt_numero(timbrado.get('establecimiento','001'), codigo, hasta)}).",
            })
        elif total > 0 and restantes / total <= 0.1:
            alertas.append({
                "tipo": "warning",
                "mensaje": f"Punto {codigo}: quedan {restantes} números disponibles ({restantes}/{total}).",
            })

    return alertas


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/admin/configuracion-timbrado/{logo_tipo}")
async def get_configuracion_timbrado(logo_tipo: str, user: dict = Depends(require_authenticated)):
    """Obtiene config de timbrado con alertas calculadas."""
    if not (has_permission(user, "facturas.ver") or has_permission(user, "facturas.timbrado")):
        raise HTTPException(status_code=403, detail="Sin permiso para ver timbrado")

    config = await db.configuracion_timbrado.find_one({"logo_tipo": logo_tipo}, {"_id": 0})
    if not config:
        return _config_vacio(logo_tipo)

    timbrado = config.get("timbrado_activo")
    config["alertas"] = _alertas_timbrado(timbrado)
    config["vigente"] = _vigente(timbrado.get("fecha_vigencia") if timbrado else None)
    return config


@router.put("/admin/configuracion-timbrado/{logo_tipo}")
async def upsert_configuracion_timbrado(
    logo_tipo: str,
    data: ConfigTimbradoUpsert,
    user: dict = Depends(require_authenticated),
):
    """
    Crea o actualiza la configuración de timbrado.
    Si ya existe un timbrado_activo diferente, lo pasa al historial.
    """
    if not has_permission(user, "facturas.timbrado"):
        raise HTTPException(status_code=403, detail="Sin permiso: facturas.timbrado")

    propia = await db.empresas_propias.find_one({"slug": logo_tipo}, {"_id": 0, "id": 1})
    if not propia:
        raise HTTPException(status_code=404, detail=f"Empresa propia '{logo_tipo}' no encontrada")

    t = data.timbrado
    if t.fecha_inicio > t.fecha_vigencia:
        raise HTTPException(status_code=400, detail="fecha_inicio no puede ser posterior a fecha_vigencia")

    codigos = [p.codigo for p in t.puntos_expedicion]
    if len(codigos) != len(set(codigos)):
        raise HTTPException(status_code=400, detail="Los códigos de punto de expedición deben ser únicos")

    for pto in t.puntos_expedicion:
        if pto.numero_desde > pto.numero_hasta:
            raise HTTPException(status_code=400,
                detail=f"Punto {pto.codigo}: numero_desde ({pto.numero_desde}) mayor que numero_hasta ({pto.numero_hasta})")

    existing = await db.configuracion_timbrado.find_one({"logo_tipo": logo_tipo}, {"_id": 0})
    historial = (existing or {}).get("historial_timbrados", [])

    # Si hay timbrado activo distinto → pasarlo al historial
    old_timbrado = (existing or {}).get("timbrado_activo")
    if old_timbrado and old_timbrado.get("nro_timbrado") != t.nro_timbrado:
        motivo = "reemplazado"
        # Determinar motivo más preciso
        if not _vigente(old_timbrado.get("fecha_vigencia")):
            motivo = "vencido"
        else:
            # Chequear si algún punto estaba agotado
            for pto in old_timbrado.get("puntos_expedicion", []):
                if pto.get("ultimo_numero", 0) >= pto.get("numero_hasta", 9999999):
                    motivo = "agotado"
                    break
        historial.insert(0, {**old_timbrado, "motivo_cierre": motivo, "fecha_cierre": _ahora()})
        historial = historial[:20]  # Máximo 20 en historial

    # Construir nuevo timbrado_activo — preservar ultimo_numero si es el MISMO timbrado (solo edición)
    puntos_con_estado = []
    for pto in t.puntos_expedicion:
        ultimo = 0
        if old_timbrado and old_timbrado.get("nro_timbrado") == t.nro_timbrado:
            # Mismo timbrado — preservar el contador de cada punto
            for old_pto in old_timbrado.get("puntos_expedicion", []):
                if old_pto.get("codigo") == pto.codigo:
                    ultimo = old_pto.get("ultimo_numero", 0)
                    break
        puntos_con_estado.append({
            "codigo": pto.codigo,
            "descripcion": pto.descripcion,
            "numero_desde": pto.numero_desde,
            "numero_hasta": pto.numero_hasta,
            "ultimo_numero": max(ultimo, pto.numero_desde - 1),  # nunca menor que desde-1
        })

    nuevo_timbrado = {
        "id": str(uuid.uuid4()) if not (old_timbrado and old_timbrado.get("nro_timbrado") == t.nro_timbrado) else (old_timbrado.get("id") or str(uuid.uuid4())),
        "nro_timbrado": t.nro_timbrado,
        "establecimiento": t.establecimiento,
        "fecha_inicio": t.fecha_inicio,
        "fecha_vigencia": t.fecha_vigencia,
        "puntos_expedicion": puntos_con_estado,
        "fecha_registro": old_timbrado.get("fecha_registro", _ahora()) if old_timbrado and old_timbrado.get("nro_timbrado") == t.nro_timbrado else _ahora(),
    }

    update_doc = {
        "logo_tipo": logo_tipo,
        "modo_numeracion": data.modo_numeracion,
        "timbrado_activo": nuevo_timbrado,
        "historial_timbrados": historial,
        "updated_at": _ahora(),
    }

    await db.configuracion_timbrado.update_one(
        {"logo_tipo": logo_tipo},
        {"$set": update_doc},
        upsert=True,
    )

    update_doc["alertas"] = _alertas_timbrado(nuevo_timbrado)
    update_doc["vigente"] = _vigente(nuevo_timbrado["fecha_vigencia"])
    return update_doc


@router.get("/admin/timbrado-vigente/{logo_tipo}")
async def verificar_timbrado_vigente(logo_tipo: str, user: dict = Depends(require_authenticated)):
    """Info del timbrado activo + alertas. Usado por FacturaFormModal al abrir."""
    if not has_permission(user, "facturas.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso: facturas.ver")

    config = await db.configuracion_timbrado.find_one({"logo_tipo": logo_tipo}, {"_id": 0})
    if not config or not config.get("timbrado_activo"):
        return {
            "tiene_config": False,
            "vigente": False,
            "modo_numeracion": "manual",
            "alertas": [],
            "mensaje": "Sin timbrado configurado.",
        }

    t = config["timbrado_activo"]
    vigente = _vigente(t.get("fecha_vigencia"))
    alertas = _alertas_timbrado(t)

    return {
        "tiene_config": True,
        "vigente": vigente,
        "modo_numeracion": config.get("modo_numeracion", "manual"),
        "nro_timbrado": t.get("nro_timbrado"),
        "establecimiento": t.get("establecimiento", "001"),
        "fecha_inicio": t.get("fecha_inicio"),
        "fecha_vigencia": t.get("fecha_vigencia"),
        "puntos_expedicion": t.get("puntos_expedicion", []),
        "alertas": alertas,
        "mensaje": alertas[0]["mensaje"] if alertas else None,
    }


@router.post("/admin/siguiente-numero-factura/{logo_tipo}")
async def siguiente_numero_factura(
    logo_tipo: str,
    data: SiguienteNumeroRequest,
    user: dict = Depends(require_authenticated),
):
    """
    Genera y reserva el siguiente número de factura para un punto de expedición.
    Solo aplica en modo automático.
    Valida: timbrado vigente + número dentro del rango asignado por SET.
    """
    if not has_permission(user, "facturas.crear"):
        raise HTTPException(status_code=403, detail="Sin permiso: facturas.crear")

    config = await db.configuracion_timbrado.find_one({"logo_tipo": logo_tipo}, {"_id": 0})
    if not config or not config.get("timbrado_activo"):
        raise HTTPException(status_code=404, detail="Sin timbrado configurado para esta empresa")

    if config.get("modo_numeracion") != "automatico":
        raise HTTPException(status_code=400, detail="Esta empresa usa numeración manual")

    t = config["timbrado_activo"]

    if not _vigente(t.get("fecha_vigencia")):
        raise HTTPException(
            status_code=400,
            detail=f"Timbrado vencido (vigencia: {t.get('fecha_vigencia')}). Configurá un nuevo timbrado."
        )

    punto = data.punto_expedicion
    pto_data = next((p for p in t.get("puntos_expedicion", []) if p["codigo"] == punto), None)
    if not pto_data:
        raise HTTPException(status_code=400, detail=f"Punto de expedición '{punto}' no configurado")

    # Calcular el siguiente número
    ultimo = pto_data.get("ultimo_numero", 0)
    numero_desde = pto_data.get("numero_desde", 1)
    numero_hasta = pto_data.get("numero_hasta", 9999999)

    # Primer número a emitir
    siguiente = max(ultimo + 1, numero_desde)

    if siguiente > numero_hasta:
        raise HTTPException(
            status_code=400,
            detail=f"Rango agotado para el punto {punto}. El rango asignado era {numero_desde}-{numero_hasta}. Configurá un nuevo timbrado."
        )

    # Actualización atómica del contador usando arrayFilters
    result = await db.configuracion_timbrado.update_one(
        {
            "logo_tipo": logo_tipo,
            "timbrado_activo.puntos_expedicion.codigo": punto,
            "timbrado_activo.puntos_expedicion.ultimo_numero": {"$lt": numero_hasta},
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
        # Rango agotado por concurrencia
        raise HTTPException(
            status_code=409,
            detail="No se pudo reservar el número (rango agotado o concurrencia). Intentá de nuevo."
        )

    numero_formateado = _fmt_numero(t.get("establecimiento", "001"), punto, siguiente)

    # Calcular alertas post-emisión
    restantes = numero_hasta - siguiente
    alerta_post = None
    if restantes == 0:
        alerta_post = f"⚠️ Rango del punto {punto} agotado. Configurá un nuevo timbrado."
    elif restantes <= max(10, int((numero_hasta - numero_desde + 1) * 0.1)):
        alerta_post = f"Quedan solo {restantes} número(s) disponibles en el punto {punto}."

    return {
        "numero": numero_formateado,
        "numero_raw": siguiente,
        "punto_expedicion": punto,
        "establecimiento": t.get("establecimiento", "001"),
        "nro_timbrado": t.get("nro_timbrado"),
        "fecha_vigencia": t.get("fecha_vigencia"),
        "restantes": restantes,
        "alerta": alerta_post,
    }
