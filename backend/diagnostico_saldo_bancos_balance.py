"""
diagnostico_saldo_bancos_balance.py
────────────────────────────────────────────────────────────────
Compara el saldo acumulado del balance contra los movimientos bancarios
por fuente para detectar qué rubro está generando diferencia.

Uso desde backend/:
    python3 diagnostico_saldo_bancos_balance.py 2026-05 arandu
"""

import asyncio
import sys
from datetime import datetime

from config import db
from routes.balance import _calc_balance, to_pyg


PERIODO = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m")
LOGO = sys.argv[2] if len(sys.argv) > 2 else "arandu"
ANIO = int(PERIODO[:4])
MES = int(PERIODO[5:7])
DESDE = f"{ANIO}-01-01"
HASTA = f"{ANIO}-{MES:02d}-31"


def fnum(n):
    return f"{round(n):,}".replace(",", ".")


def in_range(fecha):
    if not fecha:
        return False
    f = fecha[:10]
    return DESDE <= f <= HASTA


def add(bucket, key, amount):
    bucket[key] = bucket.get(key, 0.0) + float(amount or 0)


async def saldo_balance():
    bancos = await db.cuentas_bancarias.find(
        {"logo_tipo": LOGO, "activo": {"$ne": False}},
        {"_id": 0, "saldo_inicial": 1, "moneda": 1, "tipo_cambio": 1},
    ).to_list(200)
    saldo = sum(
        to_pyg(b.get("saldo_inicial") or 0, b.get("moneda", "PYG"), b.get("tipo_cambio"))
        for b in bancos
        if b.get("moneda", "PYG") == "PYG" or b.get("tipo_cambio")
    )
    detalle = {"saldo_inicial": saldo}
    for m in range(1, MES + 1):
        p = f"{ANIO}-{m:02d}"
        r = await _calc_balance(p, LOGO)
        add(detalle, f"{p} ingresos", r["total_ingresos"])
        add(detalle, f"{p} egresos", -r["total_egresos"])
        saldo += r["balance"]
    return saldo, detalle


async def saldo_bancos_por_fuente():
    cuentas = await db.cuentas_bancarias.find(
        {"logo_tipo": LOGO, "activa": {"$ne": False}},
        {"_id": 0, "id": 1, "nombre": 1, "moneda": 1, "saldo_inicial": 1, "es_predeterminada": 1},
    ).to_list(200)
    cuentas_pyg = {c["id"] for c in cuentas if c.get("moneda", "PYG") == "PYG"}
    pred = next((c["id"] for c in cuentas if c.get("moneda", "PYG") == "PYG" and c.get("es_predeterminada")), None)
    pred = pred or next(iter(cuentas_pyg), None)

    detalle = {}
    for c in cuentas:
        if c.get("moneda", "PYG") == "PYG":
            add(detalle, f"saldo_inicial::{c.get('nombre')}", c.get("saldo_inicial") or 0)

    # Facturas emitidas cobradas
    facturas = await db.facturas.find(
        {"logo_tipo": LOGO, "tipo": "emitida", "estado": {"$in": ["pagada", "parcial"]}, "eliminada": {"$ne": True}},
        {"_id": 0, "numero": 1, "pagos": 1, "moneda": 1, "tipo_cambio": 1},
    ).to_list(20000)
    for fac in facturas:
        for p in fac.get("pagos") or []:
            if not in_range(p.get("fecha") or ""):
                continue
            cid = p.get("cuenta_id") or pred
            if cid not in cuentas_pyg:
                continue
            monto = p.get("monto") or 0
            if fac.get("moneda") == "USD" and fac.get("tipo_cambio"):
                monto = monto * fac.get("tipo_cambio")
            add(detalle, "facturas_emitidas", monto)

    # Ingresos varios
    async for iv in db.ingresos_varios.find({"logo_tipo": LOGO}, {"_id": 0}):
        if not in_range(iv.get("fecha") or ""):
            continue
        add(detalle, "ingresos_varios", iv.get("monto") or 0)

    # Egresos bancarios principales
    async for p in db.pagos_iva.find({"logo_tipo": LOGO}, {"_id": 0}):
        if in_range(p.get("fecha_pago") or ""):
            add(detalle, "pago_iva", -(p.get("monto") or 0))

    async for p in db.pagos_costos_fijos.find({"logo_tipo": LOGO}, {"_id": 0}):
        if in_range(p.get("fecha_pago") or ""):
            add(detalle, "gastos", -(p.get("monto_pagado") or 0))

    compras = await db.compras.find({"logo_tipo": LOGO, "eliminada": {"$ne": True}}, {"_id": 0}).to_list(20000)
    for c in compras:
        if c.get("solo_iva"):
            continue
        for p in c.get("pagos") or []:
            if p.get("pago_proveedor_id") or not in_range(p.get("fecha_pago") or p.get("fecha") or ""):
                continue
            monto = p.get("monto_gs") or p.get("monto_pagado") or p.get("monto") or 0
            if (p.get("moneda") or c.get("moneda")) == "USD" and p.get("tipo_cambio") and not p.get("monto_gs"):
                monto *= p.get("tipo_cambio")
            add(detalle, "compras", -monto)

    async for p in db.pagos_proveedores.find({"logo_tipo": LOGO}, {"_id": 0}):
        if not in_range(p.get("fecha_pago") or p.get("fecha") or ""):
            continue
        monto = p.get("monto_gs") or p.get("monto") or 0
        if p.get("moneda") == "USD" and p.get("tipo_cambio") and not p.get("monto_gs"):
            monto *= p.get("tipo_cambio")
        add(detalle, "pagos_proveedores", -monto)

    total = sum(detalle.values())
    return total, detalle


async def main():
    bal, bal_det = await saldo_balance()
    ban, ban_det = await saldo_bancos_por_fuente()
    print(f"\nPeriodo: {PERIODO} | Empresa: {LOGO} | Rango bancos: {DESDE} a {HASTA}")
    print(f"Saldo acumulado balance: ₲ {fnum(bal)}")
    print(f"Saldo calculado bancos:  ₲ {fnum(ban)}")
    print(f"Diferencia bancos-balance: ₲ {fnum(ban - bal)}\n")

    print("Detalle bancos por fuente:")
    for k, v in sorted(ban_det.items()):
        print(f"  {k:<35} ₲ {fnum(v)}")

    print("\nDetalle balance mensual:")
    for k, v in sorted(bal_det.items()):
        print(f"  {k:<35} ₲ {fnum(v)}")


if __name__ == "__main__":
    asyncio.run(main())
