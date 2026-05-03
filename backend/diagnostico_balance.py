"""
Diagnóstico del bug de balance: encuentra movimientos en USD que no tienen
tipo_cambio cargado. Cuando esto pasa, balance.py los suma a los egresos
en Gs como si fueran guaraníes (1 USD = 1 ₲) e infla doblemente los totales.

Cómo correr (desde la carpeta backend del proyecto):
    cd backend
    python ../diagnostico_balance.py 2026-01

Reemplazá 2026-01 por el periodo (YYYY-MM) que querés revisar.
"""
import asyncio, os, sys
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(".") / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

PERIODO = sys.argv[1] if len(sys.argv) > 1 else "2026-01"
PREFIX = f"^{PERIODO}"


def _es_usd(doc):
    return (doc.get("moneda") or "").upper() == "USD"


def _sin_tc(doc):
    tc = doc.get("tipo_cambio")
    return not tc or tc in (0, 0.0, "")


async def main():
    print(f"\n=== Diagnóstico de balance — período {PERIODO} ===\n")
    total_sospechoso_usd = 0.0
    hallazgos = []

    # 1) Compras del periodo en USD
    async for c in db.compras.find({"fecha": {"$regex": PREFIX}, "moneda": "USD"}):
        monto = c.get("monto_total") or c.get("monto", 0)
        if _sin_tc(c):
            hallazgos.append(("compras", c.get("id"), c.get("fecha"),
                              c.get("proveedor_nombre"), monto, "SIN TC"))
            total_sospechoso_usd += monto

    # 2) Pagos a proveedores en USD pagados desde cuenta Gs sin TC ni monto_gs
    async for p in db.pagos_proveedores.find({"fecha_pago": {"$regex": PREFIX}, "moneda": "USD"}):
        if (p.get("cuenta_pago") or "guaranies") == "dolares":
            continue
        if _sin_tc(p) and not p.get("monto_gs") and not p.get("monto_pyg"):
            hallazgos.append(("pagos_proveedores", p.get("id"), p.get("fecha_pago"),
                              p.get("proveedor_nombre"), p.get("monto"), "SIN TC ni monto_gs"))
            total_sospechoso_usd += p.get("monto", 0)

    # 3) Costos fijos USD pagados en el periodo, sin TC en el costo
    pagos_cf = [p async for p in db.pagos_costos_fijos.find({"periodo": PERIODO})]
    if pagos_cf:
        cf_ids = list({p["costo_fijo_id"] for p in pagos_cf})
        cfs = {c["id"]: c async for c in db.costos_fijos.find({"id": {"$in": cf_ids}})}
        for p in pagos_cf:
            cf = cfs.get(p["costo_fijo_id"], {})
            if _es_usd(cf) and _sin_tc(cf):
                hallazgos.append(("costos_fijos", cf.get("id"), p.get("fecha_pago"),
                                  cf.get("nombre"), p.get("monto_pagado"), "SIN TC en costo"))
                total_sospechoso_usd += p.get("monto_pagado", 0)

    # 4) Sueldos USD del periodo sin TC
    async for s in db.sueldos.find({"periodo": PERIODO, "moneda": "USD"}):
        if _sin_tc(s):
            hallazgos.append(("sueldos", s.get("id"), s.get("fecha_pago"),
                              s.get("empleado_nombre"), s.get("monto_pagado"), "SIN TC"))
            total_sospechoso_usd += s.get("monto_pagado", 0)

    # 5) Adelantos USD del periodo sin TC
    async for a in db.adelantos_sueldos.find({"fecha": {"$regex": PREFIX}, "moneda": "USD"}):
        if _sin_tc(a):
            hallazgos.append(("adelantos_sueldos", a.get("id"), a.get("fecha"),
                              a.get("empleado_nombre"), a.get("monto"), "SIN TC"))
            total_sospechoso_usd += a.get("monto", 0)

    # 6) Facturas recibidas USD del periodo sin TC
    async for f in db.facturas.find({"tipo": "recibida", "estado": "pagada",
                                     "fecha": {"$regex": PREFIX}, "moneda": "USD"}):
        if _sin_tc(f):
            hallazgos.append(("facturas_recibidas", f.get("id"), f.get("fecha"),
                              f.get("razon_social"), f.get("monto"), "SIN TC"))
            total_sospechoso_usd += f.get("monto", 0)

    # 7) Ingresos varios negativos (egresos) en USD sin TC
    async for iv in db.ingresos_varios.find({"fecha": {"$regex": PREFIX}, "moneda": "USD"}):
        if (iv.get("monto") or 0) < 0 and _sin_tc(iv):
            hallazgos.append(("ingresos_varios", iv.get("id"), iv.get("fecha"),
                              iv.get("descripcion"), iv.get("monto"), "SIN TC (egreso)"))
            total_sospechoso_usd += abs(iv.get("monto", 0))

    if not hallazgos:
        print("✓ No se encontraron movimientos USD sin tipo_cambio en este período.")
        print("  El bug viene de otro lado — pasame igual el listado de USD del mes y lo revisamos.\n")
    else:
        print(f"⚠ {len(hallazgos)} movimiento(s) sospechoso(s):\n")
        print(f"{'Colección':<22}{'Fecha':<14}{'Descripción':<30}{'USD':>12}  Motivo")
        print("-" * 100)
        for col, _id, fecha, desc, monto, motivo in hallazgos:
            desc = (desc or "")[:28]
            print(f"{col:<22}{(fecha or '')[:10]:<14}{desc:<30}{monto:>12.2f}  {motivo}")
        print("-" * 100)
        print(f"{'TOTAL USD sospechoso:':>78}{total_sospechoso_usd:>12.2f}\n")
        print("→ Estos son los que están inflando el balance. Editalos y agregales tipo_cambio.")
        print("→ También conviene aplicar el fix defensivo en backend/routes/balance.py (to_pyg).\n")


asyncio.run(main())
