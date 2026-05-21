from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional
import asyncio
import re
import urllib.request

from config import db
from auth import require_authenticated, has_permission

router = APIRouter()

CAMBIOS_CHACO_USD_URL = "https://www.cambioschaco.com.py/en/perfil-de-moneda/?currency=usd"
FUENTE_CAMBIOS_CHACO = "Cambios Chaco"


def _parse_numero(valor: str) -> Optional[float]:
    if valor is None:
        return None
    limpio = str(valor).strip().replace(".", "").replace(",", ".")
    try:
        return float(limpio)
    except (TypeError, ValueError):
        return None


def _fetch_cambios_chaco_usd_html() -> str:
    req = urllib.request.Request(
        CAMBIOS_CHACO_USD_URL,
        headers={"User-Agent": "Mozilla/5.0 Arandu/1.0"},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.read().decode("utf-8", errors="ignore")


def _parse_cambios_chaco_historial(html: str) -> dict:
    texto = re.sub(r"<[^>]+>", " ", html)
    texto = re.sub(r"\s+", " ", texto)
    rows = re.findall(r"(\d{2}/\d{2}/\d{4})\s+([\d.,]+)\s+([\d.,]+)", texto)
    historial = {}
    for fecha_py, compra_txt, venta_txt in rows:
        try:
            fecha_iso = datetime.strptime(fecha_py, "%d/%m/%Y").strftime("%Y-%m-%d")
        except ValueError:
            continue
        compra = _parse_numero(compra_txt)
        venta = _parse_numero(venta_txt)
        if compra and venta:
            historial[fecha_iso] = {"compra": compra, "venta": venta}
    return historial


async def _guardar_cotizacion(fecha: str, compra: float, venta: float, fuente: str = FUENTE_CAMBIOS_CHACO) -> dict:
    doc = {
        "moneda": "USD",
        "fecha": fecha,
        "compra": compra,
        "venta": venta,
        "tipo_cambio_sugerido": venta,
        "fuente": fuente,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cotizaciones.update_one(
        {"moneda": "USD", "fecha": fecha, "fuente": fuente},
        {"$set": doc, "$setOnInsert": {"created_at": doc["updated_at"]}},
        upsert=True,
    )
    return doc


async def cargar_historial_usd_cambios_chaco() -> int:
    html = await asyncio.to_thread(_fetch_cambios_chaco_usd_html)
    historial = _parse_cambios_chaco_historial(html)
    for fecha, valores in historial.items():
        await _guardar_cotizacion(fecha, valores["compra"], valores["venta"])
    return len(historial)


async def obtener_cotizacion_usd(fecha: str, refrescar: bool = False) -> Optional[dict]:
    if not fecha:
        return None
    cached = await db.cotizaciones.find_one(
        {"moneda": "USD", "fecha": fecha},
        {"_id": 0},
    )
    if cached and not refrescar:
        cached["cached"] = True
        return cached

    try:
        await cargar_historial_usd_cambios_chaco()
    except Exception:
        if cached:
            cached["cached"] = True
            return cached
        return None

    doc = await db.cotizaciones.find_one(
        {"moneda": "USD", "fecha": fecha},
        {"_id": 0},
    )
    if doc:
        doc["cached"] = False
        doc["exacta"] = True
        return doc

    docs = await db.cotizaciones.find({"moneda": "USD"}, {"_id": 0}).to_list(5000)
    if docs:
        try:
            objetivo = datetime.strptime(fecha, "%Y-%m-%d").date()
            docs_ordenados = sorted(
                docs,
                key=lambda d: (
                    abs((datetime.strptime(d.get("fecha"), "%Y-%m-%d").date() - objetivo).days),
                    0 if d.get("fecha") <= fecha else 1,
                ),
            )
            doc = docs_ordenados[0]
            doc["cached"] = False
            doc["exacta"] = False
            doc["fecha_solicitada"] = fecha
            return doc
        except Exception:
            return None
    return doc


async def tipo_cambio_usd_sugerido(fecha: str) -> Optional[float]:
    cot = await obtener_cotizacion_usd(fecha)
    if not cot:
        return None
    return float(cot.get("tipo_cambio_sugerido") or cot.get("venta") or 0) or None


def _sin_tc_query(base: dict) -> dict:
    return {
        **base,
        "moneda": "USD",
        "$or": [
            {"tipo_cambio": {"$exists": False}},
            {"tipo_cambio": None},
            {"tipo_cambio": ""},
            {"tipo_cambio": 0},
        ],
    }


async def _backfill_collection(collection, query: dict, label: str, monto_field: str = "monto") -> dict:
    docs = await collection.find(query, {"_id": 0}).to_list(5000)
    actualizados = 0
    sin_cotizacion = []
    for doc in docs:
        fecha = (doc.get("fecha") or "")[:10]
        cot = await obtener_cotizacion_usd(fecha)
        tc = float((cot or {}).get("tipo_cambio_sugerido") or (cot or {}).get("venta") or 0)
        if not tc:
            sin_cotizacion.append({
                "tipo": label,
                "id": doc.get("id"),
                "numero": doc.get("numero") or doc.get("numero_factura"),
                "fecha": fecha,
            })
            continue
        set_data = {
            "tipo_cambio": tc,
            "tipo_cambio_fuente": FUENTE_CAMBIOS_CHACO,
            "tipo_cambio_fecha": fecha,
            "tipo_cambio_fecha_referencia": (cot or {}).get("fecha"),
            "tipo_cambio_exacta": bool((cot or {}).get("exacta", True)),
            "tipo_cambio_fiscal_auto": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if collection.name == "notas_credito":
            set_data["monto_pyg"] = round(float(doc.get(monto_field) or 0) * tc)
        result = await collection.update_one({"id": doc.get("id")}, {"$set": set_data})
        if result.modified_count:
            actualizados += 1
    return {"tipo": label, "encontrados": len(docs), "actualizados": actualizados, "sin_cotizacion": sin_cotizacion}


@router.get("/admin/cotizaciones/usd")
async def get_cotizacion_usd(
    fecha: str,
    refrescar: bool = False,
    user: dict = Depends(require_authenticated),
):
    if not has_permission(user, "balance.ver"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    cot = await obtener_cotizacion_usd(fecha, refrescar)
    if not cot:
        raise HTTPException(status_code=404, detail="No se encontró cotización USD para esa fecha")
    return cot


async def ejecutar_backfill_tc_fiscal() -> dict:
    resultados = []
    resultados.append(await _backfill_collection(
        db.facturas,
        _sin_tc_query({"estado": {"$ne": "anulada"}}),
        "facturas",
        "monto",
    ))
    resultados.append(await _backfill_collection(
        db.compras,
        _sin_tc_query({"tiene_factura": True}),
        "compras",
        "monto_total",
    ))
    resultados.append(await _backfill_collection(
        db.notas_credito,
        _sin_tc_query({"estado": {"$ne": "anulada"}}),
        "notas_credito",
        "monto",
    ))

    total_encontrados = sum(r["encontrados"] for r in resultados)
    total_actualizados = sum(r["actualizados"] for r in resultados)
    sin_cotizacion = [item for r in resultados for item in r["sin_cotizacion"]]
    return {
        "ok": True,
        "fuente": FUENTE_CAMBIOS_CHACO,
        "tipo_cambio_usado": "venta",
        "total_encontrados": total_encontrados,
        "total_actualizados": total_actualizados,
        "sin_cotizacion": sin_cotizacion,
        "resultados": resultados,
    }
