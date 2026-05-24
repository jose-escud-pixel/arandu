"""
Corrige productos afectados por el bug viejo de stock inicial duplicado.

Caso detectado:
  - El producto se guardaba con stock_actual = N.
  - Luego se registraba el movimiento "stock_inicial" de entrada N.
  - Resultado: el stock quedaba en 2N.

Este script:
  - Detecta movimientos "stock_inicial" donde stock_anterior=N y stock_nuevo=2N.
  - Corrige ese movimiento a stock_anterior=0 y stock_nuevo=N.
  - Resta N del stock_actual del producto, salvo que un ajuste absoluto posterior
    ya haya redefinido el stock.

Uso:
  cd backend
  python3 corregir_stock_inicial_duplicado.py --dry-run
  python3 corregir_stock_inicial_duplicado.py --apply
"""

import asyncio
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone

from config import db


def casi_igual(a, b, tol=0.000001):
    try:
        return math.isclose(float(a or 0), float(b or 0), rel_tol=tol, abs_tol=tol)
    except (TypeError, ValueError):
        return False


def fecha_mov(mov):
    return mov.get("created_at") or mov.get("fecha") or ""


async def corregir_stock_inicial_duplicado(apply: bool = False):
    print(("APLICANDO" if apply else "DRY RUN") + " correccion de stock inicial duplicado\n")

    movimientos = await db.movimientos_stock.find(
        {"tipo": "entrada", "motivo": "stock_inicial"},
        {"_id": 0},
    ).sort("created_at", 1).to_list(20000)

    candidatos = []
    for mov in movimientos:
        cantidad = float(mov.get("cantidad") or 0)
        if cantidad <= 0:
            continue
        if casi_igual(mov.get("stock_anterior"), cantidad) and casi_igual(mov.get("stock_nuevo"), cantidad * 2):
            candidatos.append(mov)

    if not candidatos:
        print("No se encontraron movimientos de stock inicial duplicado.")
        return

    por_producto = defaultdict(list)
    for mov in candidatos:
        por_producto[mov.get("producto_id")].append(mov)

    productos_corregidos = 0
    movimientos_corregidos = 0
    total_resta = 0

    for producto_id, movs in por_producto.items():
        producto = await db.productos.find_one({"id": producto_id}, {"_id": 0})
        nombre = producto.get("nombre", producto_id) if producto else producto_id
        stock_actual = float((producto or {}).get("stock_actual") or 0)

        todos_movs = await db.movimientos_stock.find(
            {"producto_id": producto_id},
            {"_id": 0, "tipo": 1, "created_at": 1, "fecha": 1},
        ).sort("created_at", 1).to_list(20000)

        resta_producto = 0
        for mov in movs:
            cantidad = float(mov.get("cantidad") or 0)
            hay_ajuste_posterior = any(
                m.get("tipo") == "ajuste" and fecha_mov(m) > fecha_mov(mov)
                for m in todos_movs
            )
            if not hay_ajuste_posterior:
                resta_producto += cantidad

        nuevo_stock = max(0, stock_actual - resta_producto)
        print(f"- {nombre} ({producto_id})")
        print(f"  movimientos duplicados: {len(movs)}")
        print(f"  stock actual: {stock_actual:g} -> {nuevo_stock:g}")
        if resta_producto and stock_actual - resta_producto < 0:
            print("  aviso: la resta dejaba stock negativo; se ajusta a 0.")

        if apply:
            now = datetime.now(timezone.utc).isoformat()
            for mov in movs:
                cantidad = float(mov.get("cantidad") or 0)
                await db.movimientos_stock.update_one(
                    {"id": mov["id"]},
                    {"$set": {
                        "stock_anterior": 0,
                        "stock_nuevo": cantidad,
                        "corregido_stock_inicial_duplicado": True,
                        "corregido_at": now,
                    }},
                )
                movimientos_corregidos += 1

            if producto and resta_producto:
                await db.productos.update_one(
                    {"id": producto_id},
                    {"$set": {
                        "stock_actual": nuevo_stock,
                        "updated_at": now,
                        "corregido_stock_inicial_duplicado_at": now,
                    }},
                )
                productos_corregidos += 1
                total_resta += resta_producto
        else:
            movimientos_corregidos += len(movs)
            if resta_producto:
                productos_corregidos += 1
                total_resta += resta_producto

    print("\nResumen")
    print(f"  productos a corregir/corregidos: {productos_corregidos}")
    print(f"  movimientos a corregir/corregidos: {movimientos_corregidos}")
    print(f"  unidades duplicadas a restar/restadas: {total_resta:g}")
    if not apply:
        print("\nEsto fue solo una simulacion. Ejecuta con --apply para aplicar los cambios.")


if __name__ == "__main__":
    apply_changes = "--apply" in sys.argv
    if "--dry-run" not in sys.argv and not apply_changes:
        print("Falta indicar modo: usa --dry-run o --apply")
        sys.exit(1)
    asyncio.run(corregir_stock_inicial_duplicado(apply=apply_changes))
