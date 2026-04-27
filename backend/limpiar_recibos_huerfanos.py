"""
Script de limpieza única — ejecutar UNA SOLA VEZ en el servidor:
  cd /var/www/arandujar/backend
  python3 limpiar_recibos_huerfanos.py

Elimina:
  1. Recibos sin pago_id (migración) o cuyo pago ya no existe en la factura
  2. cobros_contratos cuya factura de origen fue eliminada o está pendiente
"""
import asyncio
from config import db

async def limpiar():
    print("=== Iniciando limpieza ===")

    # 1. Recibos huérfanos
    todos_recibos = await db.recibos.find({}, {"_id": 0}).to_list(10000)
    recibos_eliminados = 0
    for r in todos_recibos:
        pago_id   = r.get("pago_id")
        factura_id = r.get("factura_id")

        if not pago_id:
            # Sin pago_id → huérfano de migración
            await db.recibos.delete_one({"id": r["id"]})
            recibos_eliminados += 1
            print(f"  Recibo huérfano (sin pago_id): {r.get('numero', r['id'])}")
            continue

        # Verificar que el pago existe en la factura
        if factura_id:
            fac = await db.facturas.find_one(
                {"id": factura_id, "pagos.id": pago_id}, {"_id": 0, "id": 1}
            )
            if not fac:
                await db.recibos.delete_one({"id": r["id"]})
                recibos_eliminados += 1
                print(f"  Recibo sin pago válido: {r.get('numero', r['id'])}")

    print(f"\nRecibos eliminados: {recibos_eliminados}")

    # 2. cobros_contratos huérfanos
    cobros = await db.cobros_contratos.find({}, {"_id": 0}).to_list(10000)
    cobros_eliminados = 0
    for cobro in cobros:
        factura_id = cobro.get("from_factura_id")
        if not factura_id:
            continue  # cobro manual, no tocar
        fac = await db.facturas.find_one(
            {"id": factura_id}, {"_id": 0, "id": 1, "estado": 1}
        )
        if not fac or fac.get("estado") in ("pendiente", "anulada"):
            await db.cobros_contratos.delete_one({"id": cobro["id"]})
            cobros_eliminados += 1
            print(f"  Cobro contrato huérfano: contrato={cobro.get('contrato_id', '?')} periodo={cobro.get('periodo', '?')}")

    print(f"Cobros contratos eliminados: {cobros_eliminados}")
    print("\n=== Limpieza completada ===")

if __name__ == "__main__":
    asyncio.run(limpiar())
