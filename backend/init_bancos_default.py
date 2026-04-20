"""
init_bancos_default.py
======================
Script de inicialización — crea una cuenta bancaria "Cuenta Principal (₲)"
con saldo_inicial = 0 para cada empresa propia que aún no tenga ninguna cuenta
registrada en cuentas_bancarias.

Uso:
    cd backend
    python init_bancos_default.py

El saldo_inicial puede actualizarse desde la UI (Bancos) una vez ejecutado.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
db_name   = os.environ["DB_NAME"]

client = AsyncIOMotorClient(mongo_url)
db     = client[db_name]


async def main():
    # 1. Leer todas las empresas propias activas
    empresas = await db.empresas_propias.find(
        {"activo": {"$ne": False}}, {"_id": 0, "id": 1, "nombre": 1, "slug": 1}
    ).to_list(100)

    if not empresas:
        print("⚠  No se encontraron empresas propias en la colección 'empresas_propias'.")
        return

    creadas = 0
    omitidas = 0

    for emp in empresas:
        slug = emp.get("slug") or emp.get("id")
        nombre = emp.get("nombre", slug)

        # 2. Verificar si ya tiene cuentas bancarias
        existente = await db.cuentas_bancarias.find_one({"logo_tipo": slug, "activo": {"$ne": False}})

        if existente:
            print(f"  ✓  {nombre} ({slug}) — ya tiene cuentas, se omite")
            omitidas += 1
            continue

        # 3. Crear cuenta por defecto
        doc = {
            "id": str(uuid.uuid4()),
            "nombre": "Cuenta Principal",
            "banco": "",
            "numero_cuenta": "",
            "moneda": "PYG",
            "logo_tipo": slug,
            "saldo_inicial": 0.0,
            "saldo_inicial_fecha": None,
            "es_predeterminada": True,
            "activo": True,
            "notas": "Cuenta creada automáticamente por init_bancos_default.py",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cuentas_bancarias.insert_one(doc)
        print(f"  ✅ {nombre} ({slug}) — cuenta 'Cuenta Principal (₲)' creada con saldo_inicial=0")
        creadas += 1

    print(f"\nResumen: {creadas} cuenta(s) creada(s), {omitidas} empresa(s) omitida(s).")
    print("Acordate de actualizar el saldo_inicial desde la UI (Bancos) si corresponde.")


if __name__ == "__main__":
    asyncio.run(main())
