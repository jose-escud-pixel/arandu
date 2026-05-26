import asyncio
from datetime import datetime, timezone
from config import db, client
from routes.plan_cuentas import ensure_plan_cuentas_default, resolver_plan_cuenta_operacion

async def main():
    empresas = await db.empresas_propias.find({}, {"_id": 0, "slug": 1, "nombre": 1}).to_list(500)
    if not empresas:
        empresas = [{"slug": "arandujar", "nombre": "AranduJAR"}]
    resumen = []
    for emp in empresas:
        logo = emp.get("slug") or "arandujar"
        await ensure_plan_cuentas_default(logo)
        facturas_ok = 0
        compras_ok = 0
        async for fac in db.facturas.find({"logo_tipo": logo, "plan_cuenta_id": {"$in": [None, ""]}}, {"_id": 0}):
            uso = "venta_credito" if fac.get("forma_pago") == "credito" else "venta_contado"
            cuenta, venc = await resolver_plan_cuenta_operacion(logo, uso, None, fac.get("fecha"), fac.get("fecha_vencimiento"))
            await db.facturas.update_one({"id": fac["id"]}, {"$set": {"plan_cuenta_id": cuenta["id"], "plan_cuenta_nombre": cuenta["nombre"], "fecha_vencimiento": venc}})
            facturas_ok += 1
        async for compra in db.compras.find({"logo_tipo": logo, "solo_iva": {"$ne": True}, "plan_cuenta_id": {"$in": [None, ""]}}, {"_id": 0}):
            uso = "compra_credito" if compra.get("tipo_pago") == "credito" else "compra_contado"
            cuenta, venc = await resolver_plan_cuenta_operacion(logo, uso, None, compra.get("fecha"), compra.get("fecha_vencimiento"))
            await db.compras.update_one({"id": compra["id"]}, {"$set": {"plan_cuenta_id": cuenta["id"], "plan_cuenta_nombre": cuenta["nombre"], "fecha_vencimiento": venc}})
            compras_ok += 1
        resumen.append({"empresa": logo, "facturas_actualizadas": facturas_ok, "compras_actualizadas": compras_ok})
    print("Migración plan de cuentas completada")
    for row in resumen:
        print(f"- {row['empresa']}: facturas {row['facturas_actualizadas']}, compras {row['compras_actualizadas']}")
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
