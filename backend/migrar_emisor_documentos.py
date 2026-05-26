import asyncio
from config import db, client


def snapshot_emisor(emp: dict) -> dict:
    logo = emp.get("slug") or "arandujar"
    nombre = emp.get("razon_social") or emp.get("nombre") or (
        "JAR Informática" if logo == "jar" else "Arandu Informática" if logo == "arandu" else "AranduJAR Informática"
    )
    return {
        "emisor_razon_social": nombre,
        "emisor_ruc": emp.get("ruc"),
        "emisor_direccion": emp.get("direccion"),
        "emisor_telefono": emp.get("telefono"),
        "emisor_email": emp.get("email"),
    }


async def completar_coleccion(nombre: str, snapshots: dict) -> int:
    col = getattr(db, nombre)
    total = 0
    query = {"$or": [
        {"emisor_razon_social": {"$exists": False}},
        {"emisor_razon_social": None},
        {"emisor_razon_social": ""},
    ]}
    async for doc in col.find(query, {"_id": 0, "id": 1, "logo_tipo": 1}):
        logo = doc.get("logo_tipo") or "arandujar"
        snap = snapshots.get(logo) or snapshots.get("arandujar")
        if not snap:
            continue
        await col.update_one({"id": doc["id"]}, {"$set": snap})
        total += 1
    return total


async def main():
    empresas = await db.empresas_propias.find({}, {"_id": 0}).to_list(500)
    if not empresas:
        empresas = [{"slug": "arandujar", "nombre": "AranduJAR Informática"}]
    snapshots = {emp.get("slug") or "arandujar": snapshot_emisor(emp) for emp in empresas}

    facturas = await completar_coleccion("facturas", snapshots)
    presupuestos = await completar_coleccion("presupuestos", snapshots)
    recibos = await completar_coleccion("recibos", snapshots)

    print("Migración de datos del emisor completada")
    print(f"- Facturas/boletas actualizadas: {facturas}")
    print(f"- Presupuestos actualizados: {presupuestos}")
    print(f"- Recibos actualizados: {recibos}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
