"""
Migración: vincular facturas y presupuestos viejos a su `empresa_id` y poblar
`empresa_nombre` con el nombre/apodo actual.

Estrategia de matching (en orden de preferencia):
  1. RUC exacto (si la factura/presupuesto tiene RUC y la empresa tiene el mismo).
  2. Razón social normalizada (lowercase + sin espacios extra) exacta.
  3. Razón social que matchee si "contiene" o "empieza con" el otro
     (para casos tipo "Constructora de Asunción" vs "Constructora de Asunción S.A.").

Cómo correr:
    cd backend
    python ../migrar_facturas_empresas.py            # modo dry-run (sólo informa)
    python ../migrar_facturas_empresas.py --apply    # aplica los cambios

Tip: corré primero sin --apply para ver qué va a pasar.
"""
import asyncio, os, sys, re
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

APPLY = "--apply" in sys.argv

load_dotenv(Path(".") / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def norm(s):
    if not s: return ""
    s = re.sub(r"\s+", " ", str(s)).strip().lower()
    return s


def match_empresa(target_rs, target_ruc, empresas):
    """Devuelve la empresa que mejor matchea, o None."""
    target_rs_n = norm(target_rs)
    target_ruc_n = norm(target_ruc)
    # 1. Por RUC
    if target_ruc_n:
        for e in empresas:
            if norm(e.get("ruc")) == target_ruc_n and target_ruc_n:
                return e, "ruc"
    if not target_rs_n:
        return None, None
    # 2. Por razón social exacta (normalizada)
    for e in empresas:
        if norm(e.get("razon_social")) == target_rs_n:
            return e, "razon_social_exacta"
    # 3. Por nombre exacto (por si guardaron el nombre como razón social)
    for e in empresas:
        if norm(e.get("nombre")) == target_rs_n:
            return e, "nombre_exacto"
    # 4. Substring match (si una contiene a la otra, suficientemente largo)
    if len(target_rs_n) >= 6:
        candidatos = []
        for e in empresas:
            rs_e = norm(e.get("razon_social"))
            n_e = norm(e.get("nombre"))
            for cand in (rs_e, n_e):
                if not cand or len(cand) < 6: continue
                if target_rs_n in cand or cand in target_rs_n:
                    candidatos.append(e)
                    break
        if len(candidatos) == 1:
            return candidatos[0], "substring"
    return None, None


async def main():
    print(f"\n=== Migración facturas/presupuestos → empresa_id  {'(APLICANDO)' if APPLY else '(DRY-RUN)'} ===\n")

    empresas = await db.empresas.find({}, {"_id": 0, "id": 1, "nombre": 1, "razon_social": 1, "ruc": 1}).to_list(2000)
    print(f"Empresas en BD: {len(empresas)}\n")

    # ── FACTURAS ──────────────────────────────────────────────────
    print("─── Facturas ───")
    facturas = await db.facturas.find(
        {"$or": [{"empresa_id": None}, {"empresa_id": ""}, {"empresa_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "numero": 1, "razon_social": 1, "ruc": 1}
    ).to_list(10000)
    print(f"Facturas sin empresa_id: {len(facturas)}")

    matcheadas, sin_match = 0, []
    for f in facturas:
        emp, motivo = match_empresa(f.get("razon_social"), f.get("ruc"), empresas)
        if emp:
            matcheadas += 1
            if APPLY:
                await db.facturas.update_one(
                    {"id": f["id"]},
                    {"$set": {
                        "empresa_id": emp["id"],
                        "empresa_nombre": emp.get("nombre"),
                    }}
                )
        else:
            sin_match.append(f)

    print(f"  ✓ Matcheadas: {matcheadas}")
    print(f"  ✗ Sin match : {len(sin_match)}")
    if sin_match[:8]:
        print("    Ejemplos sin match:")
        for f in sin_match[:8]:
            print(f"      #{f.get('numero')}  RZ='{f.get('razon_social') or '-'}'  RUC='{f.get('ruc') or '-'}'")

    # ── PRESUPUESTOS ───────────────────────────────────────────────
    # Los presupuestos ya tienen empresa_id desde su creación, pero por si
    # alguno quedó suelto, igual chequeamos. Lo más útil acá es repoblar
    # empresa_nombre con el actual, para que el snapshot no quede stale.
    print("\n─── Presupuestos ───")
    presupuestos = await db.presupuestos.find(
        {}, {"_id": 0, "id": 1, "numero": 1, "empresa_id": 1, "empresa_nombre": 1}
    ).to_list(10000)

    emp_map = {e["id"]: e for e in empresas}
    actualizados, sin_match_p = 0, []
    for p in presupuestos:
        eid = p.get("empresa_id")
        if not eid or eid not in emp_map:
            sin_match_p.append(p)
            continue
        nuevo_nombre = emp_map[eid].get("nombre")
        if nuevo_nombre and nuevo_nombre != p.get("empresa_nombre"):
            actualizados += 1
            if APPLY:
                await db.presupuestos.update_one(
                    {"id": p["id"]},
                    {"$set": {
                        "empresa_nombre": nuevo_nombre,
                        "empresa_ruc": emp_map[eid].get("ruc"),
                    }}
                )

    print(f"  ✓ Refrescado el snapshot empresa_nombre en: {actualizados} presupuestos")
    if sin_match_p:
        print(f"  ! {len(sin_match_p)} presupuestos con empresa_id apuntando a una empresa borrada (no se tocan)")

    # ── Resumen ─────────────────────────────────────────────────
    print("\n─── Resumen ───")
    print(f"Facturas vinculadas    : {matcheadas} de {len(facturas)}")
    print(f"Presupuestos refrescados: {actualizados}")
    if not APPLY:
        print("\nEsto fue un DRY-RUN. Volvé a correr con  --apply  para aplicar los cambios.")
    else:
        print("\n✓ Cambios aplicados.")
    print()


asyncio.run(main())
