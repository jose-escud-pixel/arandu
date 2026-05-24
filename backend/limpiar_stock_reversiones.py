"""
MIGRACIÓN: Limpiar movimientos de stock huérfanos de facturas eliminadas.

El comportamiento viejo al eliminar una factura con stock dejaba:
  - Un movimiento "salida" (motivo: "factura") — del momento de creación
  - Un movimiento "entrada" (motivo: "reversion_factura") — del momento de borrado

Estos dos se cancelan entre sí, así que el stock actual en 'productos' ya es correcto.
Este script solo elimina esos pares de registros del historial sin tocar el stock.

Uso:
    cd backend
    python migrations/limpiar_stock_reversiones.py

    # Para solo ver qué se va a limpiar sin borrar nada:
    python migrations/limpiar_stock_reversiones.py --dry-run
"""

import asyncio
import sys
import os

# Para poder importar config desde la raíz del backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import db


async def limpiar_reversiones(dry_run: bool = False):
    print(f"{'[DRY RUN] ' if dry_run else ''}Iniciando limpieza de movimientos de stock huérfanos...\n")

    # 1. Encontrar todos los movimientos de reversión (creados por el viejo delete)
    reversiones = await db.movimientos_stock.find(
        {"motivo": "reversion_factura"},
        {"_id": 0}
    ).to_list(10000)

    if not reversiones:
        print("✅ No se encontraron movimientos de reversión. Nada que limpiar.")
        return

    print(f"Encontrados {len(reversiones)} movimientos 'reversion_factura'.")

    # 2. Agrupar por referencia_id (id de la factura eliminada)
    factura_ids = list({r["referencia_id"] for r in reversiones if r.get("referencia_id")})
    print(f"Corresponden a {len(factura_ids)} facturas eliminadas.\n")

    total_eliminados = 0

    for factura_id in factura_ids:
        # Movimientos de salida originales de esa factura
        salidas = await db.movimientos_stock.find(
            {
                "referencia_id": factura_id,
                "referencia_tipo": "factura",
                "motivo": "factura",
                "tipo": "salida",
            },
            {"_id": 0, "id": 1, "producto_nombre": 1, "cantidad": 1}
        ).to_list(100)

        # Movimientos de reversión de esa factura
        entradas_rev = await db.movimientos_stock.find(
            {
                "referencia_id": factura_id,
                "motivo": "reversion_factura",
                "tipo": "entrada",
            },
            {"_id": 0, "id": 1, "producto_nombre": 1, "cantidad": 1}
        ).to_list(100)

        todos = salidas + entradas_rev
        if not todos:
            continue

        print(f"  Factura {factura_id}:")
        for m in todos:
            print(f"    - [{m.get('tipo', '?')}] {m.get('producto_nombre', '?')} x{m.get('cantidad', '?')} (motivo: {m.get('motivo', '?')})")

        if not dry_run:
            result = await db.movimientos_stock.delete_many({
                "referencia_id": factura_id,
                "$or": [
                    {"motivo": "factura",           "tipo": "salida"},
                    {"motivo": "reversion_factura", "tipo": "entrada"},
                ]
            })
            total_eliminados += result.deleted_count
            print(f"    → {result.deleted_count} movimientos eliminados.\n")
        else:
            print(f"    → [DRY RUN] Se eliminarían {len(todos)} movimientos.\n")
            total_eliminados += len(todos)

    if dry_run:
        print(f"\n[DRY RUN] Se eliminarían {total_eliminados} movimientos en total.")
        print("Ejecutá sin --dry-run para aplicar los cambios.")
    else:
        print(f"\n✅ Limpieza completada. {total_eliminados} movimientos huérfanos eliminados.")
        print("El stock de productos no fue modificado (ya estaba correcto).")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(limpiar_reversiones(dry_run=dry_run))
