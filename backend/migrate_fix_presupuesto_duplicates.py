"""
Corrige números de presupuesto duplicados.
Estrategia:
  - Agrupa por número.
  - Para cada grupo con >1 documento, conserva el más antiguo (created_at asc)
    con el número original y reasigna a los otros un número nuevo libre.
Seguro de correr múltiples veces: si no hay duplicados no hace nada.
"""
import asyncio
from datetime import datetime
from config import db


async def _next_free_numero(year: int, used: set[str]) -> str:
    prefix = f"P{year}-"
    n = 1
    while True:
        candidate = f"{prefix}{str(n).zfill(4)}"
        if candidate not in used:
            existing = await db.presupuestos.find_one({"numero": candidate}, {"_id": 0, "id": 1})
            if not existing:
                return candidate
        n += 1


async def run():
    # Agrupar por número y encontrar duplicados
    pipeline = [
        {"$match": {"numero": {"$ne": None}}},
        {"$group": {"_id": "$numero", "ids": {"$push": {"id": "$id", "created_at": "$created_at"}}, "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    dup_groups = await db.presupuestos.aggregate(pipeline).to_list(length=None)
    if not dup_groups:
        print("No se encontraron presupuestos con número duplicado.")
        return

    # Cargar todos los números en uso para evitar colisiones
    all_numeros = set()
    async for doc in db.presupuestos.find({}, {"_id": 0, "numero": 1}):
        if doc.get("numero"):
            all_numeros.add(doc["numero"])

    total_fixed = 0
    for grp in dup_groups:
        numero_original = grp["_id"]
        docs = sorted(grp["ids"], key=lambda d: d.get("created_at") or "")
        keep = docs[0]                 # mantener el más antiguo con el número original
        duplicados = docs[1:]
        print(f"Número duplicado: {numero_original} → {len(docs)} presupuestos. Mantengo {keep['id']} y reasigno los demás.")
        for d in duplicados:
            # Inferir el año del número original si se puede, si no usar el año actual
            try:
                year = int(numero_original.split("-")[0][1:])
            except Exception:
                year = datetime.now().year
            nuevo = await _next_free_numero(year, all_numeros)
            all_numeros.add(nuevo)
            await db.presupuestos.update_one({"id": d["id"]}, {"$set": {"numero": nuevo}})
            total_fixed += 1
            print(f"  • {d['id']}  {numero_original} → {nuevo}")

    print(f"\nListo. Se reasignaron {total_fixed} presupuestos.")


if __name__ == "__main__":
    asyncio.run(run())
