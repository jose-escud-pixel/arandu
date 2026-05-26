"""
fix_fecha_pago_compras.py
────────────────────────────────────────────────────────────────
Completa fechas de pago históricas en compras pagadas que no tienen
fecha_pago guardada, usando la fecha de la compra como fallback.

Regla:
  - Si la compra tiene pagos[] y algún pago no tiene fecha_pago, se copia
    compra.fecha a ese pago y se marca fecha_pago_inferida=True.
  - Si la compra quedó marcada como pagada por campos legacy directos
    (cuenta_id/fecha_pago) pero no tiene fecha_pago, se copia compra.fecha
    a compra.fecha_pago y se marca fecha_pago_inferida=True.
  - No cambia fechas ya existentes.

Ejecutar desde backend/:
    python3 fix_fecha_pago_compras.py
"""

import asyncio
from datetime import datetime, timezone

from config import db


def _fecha_doc(compra: dict) -> str:
    return (compra.get("fecha") or compra.get("created_at") or "")[:10]


async def fix_pagos_anidados() -> tuple[int, int]:
    compras = await db.compras.find(
        {"pagos": {"$exists": True, "$ne": []}},
        {"_id": 1, "fecha": 1, "created_at": 1, "pagos": 1},
    ).to_list(20000)

    docs_actualizados = 0
    pagos_actualizados = 0
    now = datetime.now(timezone.utc).isoformat()

    for compra in compras:
        fecha = _fecha_doc(compra)
        if not fecha:
            continue

        changed = False
        pagos = []
        for pago in compra.get("pagos") or []:
            if not pago.get("fecha_pago") and not pago.get("fecha"):
                pago = {**pago, "fecha_pago": fecha, "fecha_pago_inferida": True}
                changed = True
                pagos_actualizados += 1
            pagos.append(pago)

        if changed:
            await db.compras.update_one(
                {"_id": compra["_id"]},
                {"$set": {"pagos": pagos, "updated_at": now}},
            )
            docs_actualizados += 1

    return docs_actualizados, pagos_actualizados


async def fix_campos_directos_legacy() -> int:
    compras = await db.compras.find(
        {
            "tipo_pago": {"$in": ["contado", None]},
            "cuenta_id": {"$nin": [None, ""]},
            "$or": [
                {"fecha_pago": {"$exists": False}},
                {"fecha_pago": None},
                {"fecha_pago": ""},
            ],
        },
        {"_id": 1, "fecha": 1, "created_at": 1},
    ).to_list(20000)

    actualizadas = 0
    now = datetime.now(timezone.utc).isoformat()

    for compra in compras:
        fecha = _fecha_doc(compra)
        if not fecha:
            continue
        result = await db.compras.update_one(
            {"_id": compra["_id"]},
            {"$set": {"fecha_pago": fecha, "fecha_pago_inferida": True, "updated_at": now}},
        )
        actualizadas += result.modified_count

    return actualizadas


async def main():
    docs_pagos, pagos = await fix_pagos_anidados()
    directas = await fix_campos_directos_legacy()
    print("Fix fecha de pago de compras completado")
    print(f"- pagos[] actualizados: {pagos} en {docs_pagos} compra(s)")
    print(f"- compras legacy con fecha_pago directa: {directas}")


if __name__ == "__main__":
    asyncio.run(main())
