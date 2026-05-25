#!/usr/bin/env python3
"""
Migra acceso al reporte caja/banco desde usuarios.cuentas_reporte_ids
hacia cuentas_bancarias.usuarios_reporte_ids (asignación por cuenta en Bancos).

También quita el permiso obsoleto bancos.reporte_caja y agrega reportes.caja_banco si faltaba.

Ejecutar desde backend/:
    python scripts/migrar_acceso_reporte_bancos.py
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config import db  # noqa: E402


async def main():
    print("=" * 60)
    print("Migración: acceso reporte caja/banco por cuenta")
    print("=" * 60)

    usuarios = await db.users.find(
        {"cuentas_reporte_ids": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "cuentas_reporte_ids": 1, "permisos": 1},
    ).to_list(500)

    movidos = 0
    for u in usuarios:
        uid = u.get("id")
        for cid in u.get("cuentas_reporte_ids") or []:
            if not cid:
                continue
            r = await db.cuentas_bancarias.update_one(
                {"id": cid},
                {"$addToSet": {"usuarios_reporte_ids": uid}},
            )
            if r.modified_count:
                movidos += 1

    print(f"  Asignaciones usuario→cuenta: {movidos}")

    perm_fix = 0
    async for u in db.users.find({"permisos": {"$in": ["bancos.reporte_caja"]}}, {"_id": 1, "permisos": 1}):
        perms = list(u.get("permisos") or [])
        if "bancos.reporte_caja" not in perms:
            continue
        perms = [p for p in perms if p != "bancos.reporte_caja"]
        if "reportes.caja_banco" not in perms:
            perms.append("reportes.caja_banco")
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"permisos": perms}})
        perm_fix += 1

    print(f"  Usuarios con permiso corregido: {perm_fix}")
    print("Listo. Reiniciá el backend si estaba corriendo.")


if __name__ == "__main__":
    asyncio.run(main())
