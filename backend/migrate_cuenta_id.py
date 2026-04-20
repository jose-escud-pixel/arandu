"""
migrate_cuenta_id.py
────────────────────────────────────────────────────────────────
Migración única: asigna cuenta_id a todos los movimientos que
no lo tienen, usando la cuenta predeterminada de esa moneda.

Regla para pagos con tipo_cambio (USD pagado desde guaraníes):
  → cuenta_id = predeterminada PYG  (no USD)

Colecciones afectadas:
  - facturas           (campo anidado: pagos[].cuenta_id)
  - compras            (campo anidado: pagos[].cuenta_id)
  - ingresos_varios    (campo directo: cuenta_id)
  - pagos_costos_fijos (campo directo: cuenta_id)
  - pagos_proveedores  (campo directo: cuenta_id)

Ejecutar UNA sola vez desde el directorio backend/:
    python migrate_cuenta_id.py
"""

import asyncio
from config import db


async def get_pred_map():
    """Devuelve { (logo_tipo, moneda): cuenta_id } con la cuenta predeterminada."""
    cuentas = await db.cuentas_bancarias.find(
        {"activa": {"$ne": False}},
        {"_id": 0, "id": 1, "logo_tipo": 1, "moneda": 1, "es_predeterminada": 1, "nombre": 1}
    ).to_list(500)

    first_map = {}
    pred_map = {}

    for c in sorted(cuentas, key=lambda x: x.get("nombre", "")):
        key = (c.get("logo_tipo"), c.get("moneda", "PYG"))
        if key not in first_map:
            first_map[key] = c["id"]
        if c.get("es_predeterminada"):
            pred_map[key] = c["id"]

    result = {k: pred_map.get(k, first_map[k]) for k in first_map}
    print(f"  Cuentas predeterminadas encontradas: {len(result)}")
    for (logo, moneda), cid in result.items():
        print(f"    [{logo}] {moneda} → {cid}")
    return result


def resolver_cid(pred_map, logo, moneda):
    return pred_map.get((logo, moneda)) or pred_map.get((logo, "PYG"))


# ─────────────────────────────────────────────────────────────────
#  FACTURAS — pagos anidados
# ─────────────────────────────────────────────────────────────────
async def migrate_facturas(pred_map):
    facturas = await db.facturas.find(
        {"pagos": {"$exists": True, "$ne": []}},
        {"_id": 1, "logo_tipo": 1, "moneda": 1, "pagos": 1}
    ).to_list(10000)

    updated_docs = updated_pagos = 0
    for fac in facturas:
        logo   = fac.get("logo_tipo", "")
        moneda = fac.get("moneda", "PYG")
        cid    = resolver_cid(pred_map, logo, moneda)
        if not cid:
            continue

        new_pagos, changed = [], False
        for p in (fac.get("pagos") or []):
            if not p.get("cuenta_id"):
                p = {**p, "cuenta_id": cid}
                changed = True
                updated_pagos += 1
            new_pagos.append(p)

        if changed:
            await db.facturas.update_one({"_id": fac["_id"]}, {"$set": {"pagos": new_pagos}})
            updated_docs += 1

    print(f"  facturas: {updated_docs} docs, {updated_pagos} pagos asignados")


# ─────────────────────────────────────────────────────────────────
#  COMPRAS — pagos anidados (con tipo_cambio → cuenta PYG)
# ─────────────────────────────────────────────────────────────────
async def migrate_compras(pred_map):
    compras = await db.compras.find(
        {"pagos": {"$exists": True, "$ne": []}},
        {"_id": 1, "logo_tipo": 1, "moneda": 1, "pagos": 1}
    ).to_list(10000)

    updated_docs = updated_pagos = 0
    for comp in compras:
        logo    = comp.get("logo_tipo", "")
        cmoneda = comp.get("moneda", "PYG")

        new_pagos, changed = [], False
        for p in (comp.get("pagos") or []):
            if not p.get("cuenta_id"):
                # Si tiene tipo_cambio fue pagado en guaraníes aunque la compra sea en USD
                tiene_tc = float(p.get("tipo_cambio") or 0) > 0
                moneda_real = "PYG" if tiene_tc else (p.get("moneda") or cmoneda)
                cid = resolver_cid(pred_map, logo, moneda_real)
                if cid:
                    p = {**p, "cuenta_id": cid}
                    changed = True
                    updated_pagos += 1
            new_pagos.append(p)

        if changed:
            await db.compras.update_one({"_id": comp["_id"]}, {"$set": {"pagos": new_pagos}})
            updated_docs += 1

    print(f"  compras: {updated_docs} docs, {updated_pagos} pagos asignados")


# ─────────────────────────────────────────────────────────────────
#  INGRESOS VARIOS — campo directo
# ─────────────────────────────────────────────────────────────────
async def migrate_ingresos_varios(pred_map):
    docs = await db.ingresos_varios.find(
        {"cuenta_id": {"$in": [None, "", 0, False]}},
        {"_id": 1, "logo_tipo": 1, "moneda": 1}
    ).to_list(10000)

    updated = 0
    for doc in docs:
        cid = resolver_cid(pred_map, doc.get("logo_tipo", ""), doc.get("moneda", "PYG"))
        if not cid:
            continue
        await db.ingresos_varios.update_one({"_id": doc["_id"]}, {"$set": {"cuenta_id": cid}})
        updated += 1

    print(f"  ingresos_varios: {updated}/{len(docs)} documentos actualizados")


# ─────────────────────────────────────────────────────────────────
#  PAGOS COSTOS FIJOS — campo directo, siempre PYG
# ─────────────────────────────────────────────────────────────────
async def migrate_costos_fijos(pred_map):
    docs = await db.pagos_costos_fijos.find(
        {"cuenta_id": {"$in": [None, "", 0, False]}},
        {"_id": 1, "logo_tipo": 1}
    ).to_list(10000)

    updated = 0
    for doc in docs:
        cid = resolver_cid(pred_map, doc.get("logo_tipo", ""), "PYG")
        if not cid:
            continue
        await db.pagos_costos_fijos.update_one({"_id": doc["_id"]}, {"$set": {"cuenta_id": cid}})
        updated += 1

    print(f"  pagos_costos_fijos: {updated}/{len(docs)} documentos actualizados")


# ─────────────────────────────────────────────────────────────────
#  PAGOS PROVEEDORES — campo directo (con tipo_cambio → cuenta PYG)
# ─────────────────────────────────────────────────────────────────
async def migrate_pagos_proveedores(pred_map):
    docs = await db.pagos_proveedores.find(
        {"cuenta_id": {"$in": [None, "", 0, False]}},
        {"_id": 1, "logo_tipo": 1, "moneda": 1, "tipo_cambio": 1}
    ).to_list(10000)

    updated = 0
    for doc in docs:
        # Si tiene tipo_cambio fue pagado en guaraníes aunque moneda sea USD
        tiene_tc = float(doc.get("tipo_cambio") or 0) > 0
        moneda_real = "PYG" if tiene_tc else doc.get("moneda", "PYG")
        cid = resolver_cid(pred_map, doc.get("logo_tipo", ""), moneda_real)
        if not cid:
            continue
        await db.pagos_proveedores.update_one({"_id": doc["_id"]}, {"$set": {"cuenta_id": cid}})
        updated += 1

    print(f"  pagos_proveedores: {updated}/{len(docs)} documentos actualizados")


# ─────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────
async def main():
    print("=" * 60)
    print("MIGRACIÓN: asignando cuenta_id a movimientos sin cuenta")
    print("=" * 60)

    print("\n[1/6] Obteniendo cuentas predeterminadas...")
    pred_map = await get_pred_map()
    if not pred_map:
        print("  ERROR: No se encontraron cuentas bancarias. Abortando.")
        return

    print("\n[2/6] Migrando facturas (pagos anidados)...")
    await migrate_facturas(pred_map)

    print("\n[3/6] Migrando compras (pagos anidados + tipo_cambio)...")
    await migrate_compras(pred_map)

    print("\n[4/6] Migrando ingresos_varios...")
    await migrate_ingresos_varios(pred_map)

    print("\n[5/6] Migrando pagos_costos_fijos...")
    await migrate_costos_fijos(pred_map)

    print("\n[6/6] Migrando pagos_proveedores (tipo_cambio → PYG)...")
    await migrate_pagos_proveedores(pred_map)

    print("\n" + "=" * 60)
    print("MIGRACIÓN COMPLETADA")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
