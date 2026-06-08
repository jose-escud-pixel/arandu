#!/usr/bin/env python3
"""
reconciliacion_bancaria.py
──────────────────────────────────────────────────────────────────────────────
Compara los movimientos de la cuenta BANCOP 0410272868 en Mayo 2026
registrados en el sistema Arandu contra el extracto bancario real.

EXTRACTO BANCARIO (BANCOP, Mayo 2026):
  Saldo inicial:  ₲ 56,025,009
  Créditos:       ₲ 69,327,850
  Débitos:        ₲ 69,200,643
  Saldo final:    ₲ 56,152,216

SISTEMA ARANDU:
  Saldo que muestra: ₲ 53,545,216
  Diferencia:        ₲ 2,607,000 (sistema < banco)

USO:
  1. Poner las credenciales de MongoDB abajo (MONGO_URL, DB_NAME)
     o se leen automáticamente desde el .env del backend
  2. python3 reconciliacion_bancaria.py

REQUIERE:
  pip install pymongo python-dotenv
──────────────────────────────────────────────────────────────────────────────
"""

import os
import sys
from pathlib import Path
from datetime import datetime

# ── Intentar cargar .env del backend ────────────────────────────────────────
try:
    from dotenv import load_dotenv
    # Buscar .env en el directorio del script o en el backend
    env_paths = [
        Path(__file__).parent / ".env",
        Path(__file__).parent / "backend" / ".env",
        Path(__file__).parent.parent / "backend" / ".env",
    ]
    for ep in env_paths:
        if ep.exists():
            load_dotenv(ep)
            print(f"[INFO] .env cargado desde: {ep}")
            break
except ImportError:
    pass

# ── Configuración ────────────────────────────────────────────────────────────
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.environ.get("DB_NAME", "arandu")

# Cuenta bancaria a reconciliar
NUMERO_CUENTA_TARGET = "0410272868"

# Período: Mayo 2026
PERIODO_DESDE = "2026-05-01"
PERIODO_HASTA = "2026-05-31"

# Datos reales del extracto bancario
BANCO_SALDO_INICIAL  = 56_025_009
BANCO_CREDITOS       = 69_327_850
BANCO_DEBITOS        = 69_200_643
BANCO_SALDO_FINAL    = 56_152_216

# ── Conexión ─────────────────────────────────────────────────────────────────
try:
    from pymongo import MongoClient
except ImportError:
    print("ERROR: pymongo no instalado. Ejecutá:  pip install pymongo python-dotenv")
    sys.exit(1)

print(f"\nConectando a MongoDB: {MONGO_URL[:40]}...")
client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
try:
    client.admin.command("ping")
    print("Conexión OK.")
except Exception as e:
    print(f"ERROR al conectar: {e}")
    sys.exit(1)

db = client[DB_NAME]

# ── Helpers ───────────────────────────────────────────────────────────────────

def fmt(n):
    """Formatea número como ₲ con separador de miles."""
    try:
        return f"₲ {int(round(float(n))):,}".replace(",", ".")
    except:
        return str(n)

def en_periodo(fecha_str):
    """True si la fecha está dentro de Mayo 2026."""
    if not fecha_str:
        return False
    f = str(fecha_str)[:10]
    return PERIODO_DESDE <= f <= PERIODO_HASTA

def to_float(v, default=0.0):
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default

# ── Paso 1: Encontrar la cuenta bancaria ─────────────────────────────────────
print(f"\n{'='*70}")
print(f"RECONCILIACIÓN BANCARIA — BANCOP {NUMERO_CUENTA_TARGET} — Mayo 2026")
print(f"{'='*70}")

cuenta = db.cuentas_bancarias.find_one(
    {"numero_cuenta": NUMERO_CUENTA_TARGET},
    {"_id": 0}
)
if not cuenta:
    # Buscar por número parcial
    cuenta = db.cuentas_bancarias.find_one(
        {"numero_cuenta": {"$regex": NUMERO_CUENTA_TARGET}},
        {"_id": 0}
    )

if not cuenta:
    print(f"\n⚠️  No se encontró la cuenta {NUMERO_CUENTA_TARGET} en cuentas_bancarias.")
    print("   Buscando todas las cuentas disponibles:\n")
    todas = list(db.cuentas_bancarias.find({"activa": {"$ne": False}}, {"_id": 0, "id": 1, "nombre": 1, "banco": 1, "numero_cuenta": 1, "logo_tipo": 1}))
    for c in todas:
        print(f"   - [{c.get('logo_tipo')}] {c.get('nombre')} | Banco: {c.get('banco')} | N°: {c.get('numero_cuenta')} | ID: {c.get('id')}")

    # Intentar buscar por ID si el usuario lo conoce
    cuenta_id_manual = input("\nIngresá el ID de la cuenta a analizar (o Enter para salir): ").strip()
    if not cuenta_id_manual:
        sys.exit(0)
    cuenta = db.cuentas_bancarias.find_one({"id": cuenta_id_manual}, {"_id": 0})
    if not cuenta:
        print("No encontrada.")
        sys.exit(1)

CUENTA_ID   = cuenta.get("id", "")
LOGO_TIPO   = cuenta.get("logo_tipo", "")
SALDO_INI   = to_float(cuenta.get("saldo_inicial", 0))
FECHA_INI   = cuenta.get("saldo_inicial_fecha", "")

print(f"\nCuenta encontrada:")
print(f"  Nombre:        {cuenta.get('nombre')}")
print(f"  Banco:         {cuenta.get('banco')}")
print(f"  N° Cuenta:     {cuenta.get('numero_cuenta')}")
print(f"  Empresa:       {LOGO_TIPO}")
print(f"  ID:            {CUENTA_ID}")
print(f"  Saldo inicial: {fmt(SALDO_INI)} (desde {FECHA_INI})")

# ── Paso 2: Recolectar todos los movimientos del período ─────────────────────

ingresos = []   # lista de dicts con tipo, concepto, fecha, monto
egresos  = []

# ─── 2a. INGRESOS: Pagos de facturas ─────────────────────────────────────────
facturas_q = {
    "logo_tipo": LOGO_TIPO,
    "tipo": "emitida",
    "estado": {"$in": ["pagada", "parcial", "cobrada"]},
    "eliminada": {"$ne": True},
}
facturas = list(db.facturas.find(facturas_q, {"_id": 0,
    "id": 1, "numero": 1, "razon_social": 1, "monto": 1, "monto_pagado": 1,
    "estado": 1, "pagos": 1, "cuenta_id": 1, "fecha": 1, "fecha_pago": 1,
    "moneda": 1, "tipo_cambio": 1
}))

for fac in facturas:
    pagos_fac = fac.get("pagos") or []
    if pagos_fac:
        for p in pagos_fac:
            if p.get("cuenta_id") != CUENTA_ID:
                continue
            fecha = p.get("fecha") or ""
            if not en_periodo(fecha):
                continue
            monto = to_float(p.get("monto", 0))
            ingresos.append({
                "tipo": "Cobro factura",
                "ref": f"Factura #{fac.get('numero', '?')}",
                "cliente": fac.get("razon_social", ""),
                "fecha": fecha,
                "monto": monto,
                "doc_id": fac.get("id"),
                "estado": fac.get("estado"),
            })
    else:
        # Factura sin array de pagos — el cobro es el total
        if fac.get("cuenta_id") != CUENTA_ID:
            continue
        fecha = fac.get("fecha_pago") or fac.get("fecha") or ""
        if not en_periodo(fecha):
            continue
        monto_base = fac.get("monto_pagado") if fac.get("estado") == "parcial" else fac.get("monto")
        monto = to_float(monto_base or 0)
        ingresos.append({
            "tipo": "Cobro factura",
            "ref": f"Factura #{fac.get('numero', '?')}",
            "cliente": fac.get("razon_social", ""),
            "fecha": fecha,
            "monto": monto,
            "doc_id": fac.get("id"),
            "estado": fac.get("estado"),
        })

# ─── 2b. INGRESOS: Ingresos varios ───────────────────────────────────────────
ivs = list(db.ingresos_varios.find(
    {"cuenta_id": CUENTA_ID, "eliminada": {"$ne": True}},
    {"_id": 0, "id": 1, "concepto": 1, "monto": 1, "fecha": 1}
))
for iv in ivs:
    if not en_periodo(iv.get("fecha", "")):
        continue
    ingresos.append({
        "tipo": "Ingreso varios",
        "ref": iv.get("concepto", "Sin concepto"),
        "cliente": "",
        "fecha": iv.get("fecha", ""),
        "monto": to_float(iv.get("monto", 0)),
        "doc_id": iv.get("id"),
        "estado": "",
    })

# ─── 2c. EGRESOS: Costos fijos ────────────────────────────────────────────────
pcf_list = list(db.pagos_costos_fijos.find({}, {"_id": 0,
    "costo_fijo_id": 1, "cuenta_id": 1, "monto_pagado": 1, "fecha_pago": 1
}))
cf_ids = list({p.get("costo_fijo_id") for p in pcf_list if p.get("costo_fijo_id")})
costos_map = {}
if cf_ids:
    costos_docs = list(db.costos_fijos.find(
        {"logo_tipo": LOGO_TIPO, "id": {"$in": cf_ids}, "eliminada": {"$ne": True}},
        {"_id": 0, "id": 1, "nombre": 1, "moneda": 1, "tipo_cambio": 1}
    ))
    costos_map = {c.get("id"): c for c in costos_docs}

for p in pcf_list:
    if p.get("cuenta_id") != CUENTA_ID:
        continue
    if not en_periodo(p.get("fecha_pago", "")):
        continue
    costo = costos_map.get(p.get("costo_fijo_id"))
    if not costo:
        continue
    egresos.append({
        "tipo": "Gasto fijo",
        "ref": costo.get("nombre", "Sin nombre"),
        "proveedor": "",
        "fecha": p.get("fecha_pago", ""),
        "monto": to_float(p.get("monto_pagado", 0)),
        "doc_id": p.get("costo_fijo_id"),
        "estado": "pagado",
    })

# ─── 2d. EGRESOS: Compras ────────────────────────────────────────────────────
compras = list(db.compras.find(
    {"logo_tipo": LOGO_TIPO, "eliminada": {"$ne": True}},
    {"_id": 0, "id": 1, "numero_factura": 1, "proveedor_nombre": 1,
     "pagos": 1, "cuenta_id": 1, "tipo_pago": 1, "monto_total": 1,
     "fecha": 1, "fecha_pago": 1, "moneda": 1, "tipo_cambio": 1, "solo_iva": 1}
))
for comp in compras:
    pagos_comp = comp.get("pagos") or []
    if pagos_comp:
        for p in pagos_comp:
            if p.get("pago_proveedor_id"):
                continue  # se cuenta desde pagos_proveedores
            if p.get("cuenta_id") != CUENTA_ID:
                continue
            fecha = p.get("fecha_pago") or p.get("fecha") or ""
            if not en_periodo(fecha):
                continue
            egresos.append({
                "tipo": "Pago compra",
                "ref": f"Factura compra #{comp.get('numero_factura', '?')}",
                "proveedor": comp.get("proveedor_nombre", ""),
                "fecha": fecha,
                "monto": to_float(p.get("monto_pagado", 0)),
                "doc_id": comp.get("id"),
                "estado": "pagado",
            })
    else:
        # Compra contado sin array de pagos
        if (
            not comp.get("solo_iva")
            and (comp.get("tipo_pago") or "contado") == "contado"
            and comp.get("cuenta_id") == CUENTA_ID
        ):
            fecha = comp.get("fecha_pago") or comp.get("fecha") or ""
            if not en_periodo(fecha):
                continue
            egresos.append({
                "tipo": "Pago compra (contado)",
                "ref": f"Factura compra #{comp.get('numero_factura', '?')}",
                "proveedor": comp.get("proveedor_nombre", ""),
                "fecha": fecha,
                "monto": to_float(comp.get("monto_total", 0)),
                "doc_id": comp.get("id"),
                "estado": "pagado",
            })

# ─── 2e. EGRESOS: Pagos a proveedores ────────────────────────────────────────
pp_list = list(db.pagos_proveedores.find(
    {"logo_tipo": LOGO_TIPO, "cuenta_id": CUENTA_ID, "eliminada": {"$ne": True}},
    {"_id": 0, "id": 1, "proveedor_nombre": 1, "concepto": 1,
     "monto": 1, "monto_gs": 1, "moneda": 1, "tipo_cambio": 1,
     "fecha": 1, "fecha_pago": 1}
))
for p in pp_list:
    fecha = p.get("fecha_pago") or p.get("fecha") or ""
    if not en_periodo(fecha):
        continue
    tiene_tc = to_float(p.get("tipo_cambio", 0)) > 0
    if tiene_tc:
        monto = to_float(p.get("monto_gs") or 0) or (to_float(p.get("monto", 0)) * to_float(p.get("tipo_cambio", 1)))
    else:
        monto = to_float(p.get("monto", 0))
    egresos.append({
        "tipo": "Pago proveedor",
        "ref": p.get("concepto", "Sin concepto"),
        "proveedor": p.get("proveedor_nombre", ""),
        "fecha": fecha,
        "monto": monto,
        "doc_id": p.get("id"),
        "estado": "pagado",
    })

# ─── 2f. EGRESOS: Sueldos ────────────────────────────────────────────────────
sueldos_all = list(db.sueldos.find({}, {"_id": 0,
    "empleado_id": 1, "empleado_nombre": 1, "monto_pagado": 1,
    "moneda": 1, "tipo_cambio": 1, "fecha_pago": 1, "periodo": 1, "cuenta_id": 1, "logo_tipo": 1
}))
# También por empleados del mismo logo
emp_ids_s = list({s.get("empleado_id") for s in sueldos_all if s.get("empleado_id") and not s.get("logo_tipo")})
emp_logo_map = {}
if emp_ids_s:
    emps = list(db.empleados.find(
        {"logo_tipo": LOGO_TIPO, "id": {"$in": emp_ids_s}},
        {"_id": 0, "id": 1, "logo_tipo": 1}
    ))
    emp_logo_map = {e.get("id"): e.get("logo_tipo", "") for e in emps}

for s in sueldos_all:
    slogo = s.get("logo_tipo") or emp_logo_map.get(s.get("empleado_id"), "")
    if slogo != LOGO_TIPO:
        continue
    if s.get("cuenta_id") != CUENTA_ID:
        continue
    fecha = s.get("fecha_pago") or f"{s.get('periodo', '2000-00')}-01"
    if not en_periodo(fecha):
        continue
    monto = to_float(s.get("monto_pagado", 0))
    egresos.append({
        "tipo": "Sueldo",
        "ref": s.get("empleado_nombre", "Empleado"),
        "proveedor": "",
        "fecha": fecha,
        "monto": monto,
        "doc_id": None,
        "estado": "pagado",
    })

# ─── 2g. EGRESOS: Adelantos de sueldo ────────────────────────────────────────
adelantos_all = list(db.adelantos_sueldos.find({}, {"_id": 0,
    "empleado_id": 1, "monto": 1, "moneda": 1, "tipo_cambio": 1, "fecha": 1, "cuenta_id": 1, "logo_tipo": 1
}))
for a in adelantos_all:
    alogo = a.get("logo_tipo") or emp_logo_map.get(a.get("empleado_id"), "")
    if alogo != LOGO_TIPO:
        continue
    if a.get("cuenta_id") != CUENTA_ID:
        continue
    if not en_periodo(a.get("fecha", "")):
        continue
    egresos.append({
        "tipo": "Adelanto sueldo",
        "ref": "Adelanto",
        "proveedor": "",
        "fecha": a.get("fecha", ""),
        "monto": to_float(a.get("monto", 0)),
        "doc_id": None,
        "estado": "pagado",
    })

# ─── 2h. EGRESOS: Pagos de IVA ───────────────────────────────────────────────
pagos_iva = list(db.pagos_iva.find(
    {"logo_tipo": LOGO_TIPO, "cuenta_id": CUENTA_ID, "eliminada": {"$ne": True}},
    {"_id": 0, "id": 1, "monto": 1, "fecha_pago": 1, "periodo": 1}
))
for p in pagos_iva:
    if not en_periodo(p.get("fecha_pago", "")):
        continue
    egresos.append({
        "tipo": "Pago IVA",
        "ref": f"IVA período {p.get('periodo', '')}",
        "proveedor": "SET",
        "fecha": p.get("fecha_pago", ""),
        "monto": to_float(p.get("monto", 0)),
        "doc_id": p.get("id"),
        "estado": "pagado",
    })

# ── Paso 3: Calcular totales del sistema ─────────────────────────────────────

total_ingresos_sistema = sum(i["monto"] for i in ingresos)
total_egresos_sistema  = sum(e["monto"] for e in egresos)
saldo_sistema_calculado = SALDO_INI + total_ingresos_sistema - total_egresos_sistema

# ── Paso 4: Mostrar resultados ────────────────────────────────────────────────

print(f"\n{'─'*70}")
print(f"EXTRACTO BANCARIO (real)")
print(f"{'─'*70}")
print(f"  Saldo inicial:  {fmt(BANCO_SALDO_INICIAL)}")
print(f"  Créditos:     + {fmt(BANCO_CREDITOS)}")
print(f"  Débitos:      - {fmt(BANCO_DEBITOS)}")
print(f"  Saldo final:    {fmt(BANCO_SALDO_FINAL)}")

print(f"\n{'─'*70}")
print(f"SISTEMA ARANDU (calculado desde base de datos)")
print(f"{'─'*70}")
print(f"  Saldo inicial:  {fmt(SALDO_INI)}")
print(f"  Ingresos:     + {fmt(total_ingresos_sistema)}  ({len(ingresos)} movs)")
print(f"  Egresos:      - {fmt(total_egresos_sistema)}  ({len(egresos)} movs)")
print(f"  Saldo calculado:{fmt(saldo_sistema_calculado)}")
print(f"  Saldo banco:    {fmt(BANCO_SALDO_FINAL)}")
diff = BANCO_SALDO_FINAL - saldo_sistema_calculado
print(f"  DIFERENCIA:     {fmt(diff)}  {'✅ OK' if abs(diff) < 100 else '⚠️  REVISAR'}")

# ── Paso 5: Detalle de ingresos ────────────────────────────────────────────────

print(f"\n{'─'*70}")
print(f"INGRESOS REGISTRADOS EN SISTEMA — Mayo 2026  ({fmt(total_ingresos_sistema)})")
print(f"{'─'*70}")
if ingresos:
    ingresos_sorted = sorted(ingresos, key=lambda x: x.get("fecha", ""))
    for i in ingresos_sorted:
        cliente = f" | {i['cliente'][:30]}" if i.get("cliente") else ""
        print(f"  {i['fecha'][:10]}  {i['tipo']:<22} {i['ref'][:35]:<35}{cliente}")
        print(f"            {fmt(i['monto']):>15}")
else:
    print("  (ninguno)")

# ── Paso 6: Detalle de egresos ─────────────────────────────────────────────────

print(f"\n{'─'*70}")
print(f"EGRESOS REGISTRADOS EN SISTEMA — Mayo 2026  ({fmt(total_egresos_sistema)})")
print(f"{'─'*70}")
if egresos:
    egresos_sorted = sorted(egresos, key=lambda x: x.get("fecha", ""))
    for e in egresos_sorted:
        prov = f" | {e.get('proveedor', '')[:30]}" if e.get("proveedor") else ""
        print(f"  {e['fecha'][:10]}  {e['tipo']:<22} {e['ref'][:35]:<35}{prov}")
        print(f"            {fmt(e['monto']):>15}")
else:
    print("  (ninguno)")

# ── Paso 7: Análisis de brecha ─────────────────────────────────────────────────

print(f"\n{'─'*70}")
print(f"ANÁLISIS DE BRECHA")
print(f"{'─'*70}")

brecha_ingresos = BANCO_CREDITOS - total_ingresos_sistema
brecha_egresos  = BANCO_DEBITOS  - total_egresos_sistema

print(f"\nDiferencia de ingresos (banco - sistema):")
print(f"  Banco:   {fmt(BANCO_CREDITOS)}")
print(f"  Sistema: {fmt(total_ingresos_sistema)}")
signo_i = "+" if brecha_ingresos >= 0 else ""
print(f"  BRECHA:  {signo_i}{fmt(brecha_ingresos)}  {'(banco tiene más ingresos que el sistema)' if brecha_ingresos > 0 else '(sistema tiene más ingresos que el banco)'}")

print(f"\nDiferencia de egresos (banco - sistema):")
print(f"  Banco:   {fmt(BANCO_DEBITOS)}")
print(f"  Sistema: {fmt(total_egresos_sistema)}")
signo_e = "+" if brecha_egresos >= 0 else ""
print(f"  BRECHA:  {signo_e}{fmt(brecha_egresos)}  {'(banco tiene más débitos que el sistema)' if brecha_egresos > 0 else '(sistema tiene más débitos que el banco — gastos ficticios)'}")

# ── Paso 8: Buscar facturas cobradas sin movimiento bancario real ──────────────

print(f"\n{'─'*70}")
print(f"FACTURAS COBRADAS EN SISTEMA vs INGRESOS EN BANCO")
print(f"{'─'*70}")
print("Buscando facturas marcadas como cobradas en Mayo 2026 vinculadas a esta cuenta...")

# Facturas cobradas en mayo con esta cuenta
facturas_cobradas_mayo = []
for fac in facturas:
    pagos_fac = fac.get("pagos") or []
    if pagos_fac:
        for p in pagos_fac:
            if p.get("cuenta_id") == CUENTA_ID and en_periodo(p.get("fecha", "")):
                facturas_cobradas_mayo.append({
                    "numero": fac.get("numero", "?"),
                    "cliente": fac.get("razon_social", ""),
                    "fecha_cobro": p.get("fecha", ""),
                    "monto": to_float(p.get("monto", 0)),
                    "estado": fac.get("estado"),
                    "id": fac.get("id"),
                })
    else:
        if fac.get("cuenta_id") == CUENTA_ID:
            fecha = fac.get("fecha_pago") or fac.get("fecha") or ""
            if en_periodo(fecha):
                monto_base = fac.get("monto_pagado") if fac.get("estado") == "parcial" else fac.get("monto")
                facturas_cobradas_mayo.append({
                    "numero": fac.get("numero", "?"),
                    "cliente": fac.get("razon_social", ""),
                    "fecha_cobro": fecha,
                    "monto": to_float(monto_base or 0),
                    "estado": fac.get("estado"),
                    "id": fac.get("id"),
                })

facturas_cobradas_mayo.sort(key=lambda x: x.get("fecha_cobro", ""))
total_fac_cobradas = sum(f["monto"] for f in facturas_cobradas_mayo)
print(f"\nFacturas cobradas en sistema ({len(facturas_cobradas_mayo)} registros, total {fmt(total_fac_cobradas)}):")
for f in facturas_cobradas_mayo:
    print(f"  {f['fecha_cobro'][:10]}  #{f['numero']:<10} {f['cliente'][:35]:<35}  {fmt(f['monto']):>15}")

# ── Paso 9: Buscar gastos en sistema sin correspondencia en banco ──────────────

print(f"\n{'─'*70}")
print(f"GASTOS FIJOS PAGADOS EN MAYO 2026 (posibles compensaciones ficticias)")
print(f"{'─'*70}")

gastos_fijos_mayo = [e for e in egresos if e["tipo"] == "Gasto fijo"]
total_gf = sum(e["monto"] for e in gastos_fijos_mayo)
print(f"  Total gastos fijos en sistema: {fmt(total_gf)} ({len(gastos_fijos_mayo)} registros)")
print()
for e in sorted(gastos_fijos_mayo, key=lambda x: x["fecha"]):
    print(f"  {e['fecha'][:10]}  {e['ref'][:45]:<45}  {fmt(e['monto']):>15}")

# ── Paso 10: Resumen final ─────────────────────────────────────────────────────

print(f"\n{'='*70}")
print(f"RESUMEN EJECUTIVO")
print(f"{'='*70}")
print(f"  Saldo banco (real):          {fmt(BANCO_SALDO_FINAL)}")
print(f"  Saldo sistema (calculado):   {fmt(saldo_sistema_calculado)}")
print(f"  Diferencia:                  {fmt(diff)}")
print()
if abs(diff) < 100:
    print("  ✅ Cuentas cuadradas — sistema y banco coinciden.")
else:
    print(f"  ⚠️  Hay una diferencia de {fmt(abs(diff))}.")
    print()
    print("  Posibles causas:")
    if brecha_ingresos > 0:
        print(f"    → El banco tiene {fmt(brecha_ingresos)} más en créditos que el sistema.")
        print(f"      Puede haber ingresos en el banco no registrados en el sistema.")
    if brecha_ingresos < 0:
        print(f"    → El sistema tiene {fmt(abs(brecha_ingresos))} más en ingresos que el banco.")
        print(f"      Hay facturas marcadas como cobradas pero el dinero no entró al banco.")
    if brecha_egresos < 0:
        print(f"    → El sistema tiene {fmt(abs(brecha_egresos))} más en egresos que el banco.")
        print(f"      Hay gastos registrados en el sistema que no salieron del banco (gastos ficticios).")
    if brecha_egresos > 0:
        print(f"    → El banco tiene {fmt(brecha_egresos)} más en débitos que el sistema.")
        print(f"      Hay salidas del banco no registradas en el sistema.")
    print()
    print("  ACCIÓN SUGERIDA:")
    print("    1. Revisá las facturas cobradas de arriba — verificá cuáles realmente")
    print("       entraron al banco comparando con los créditos del extracto.")
    print("    2. Revisá los gastos fijos — identificá cuáles fueron creados como")
    print("       'compensación' de facturas cobradas que no entraron al banco.")
    print("    3. Los documentos problemáticos son aquellos donde existe un par:")
    print("       [factura cobrada SIN ingreso real en banco] + [gasto fijo SIN salida real en banco]")

print(f"\n{'='*70}")
print("Script completado.")
print(f"{'='*70}\n")
