#!/usr/bin/env python3
"""
Migración única: crea cuenta PYG predeterminada por empresa propia y
asigna cuenta_id a movimientos históricos sin cuenta.

Ejecutar desde backend/:
    python scripts/migrar_cuentas_predeterminadas.py

Equivalente a: python migrate_cuenta_id.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from migrate_cuenta_id import main  # noqa: E402
import asyncio

if __name__ == "__main__":
    asyncio.run(main())
