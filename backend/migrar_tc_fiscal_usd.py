"""
Completa una sola vez el tipo de cambio fiscal de documentos viejos en USD.

Uso desde la carpeta backend:
    python migrar_tc_fiscal_usd.py

El script consulta/guarda cotizaciones USD de Cambios Chaco en la colección
cotizaciones y luego actualiza documentos USD sin tipo_cambio. Si no existe
cotización exacta para una fecha vieja, usa la cotización histórica más cercana.
- facturas
- compras con factura
- notas de crédito
"""
import asyncio

from config import client
from routes.cotizaciones import ejecutar_backfill_tc_fiscal


async def main():
    resultado = await ejecutar_backfill_tc_fiscal()
    print("=== Migración TC fiscal USD ===")
    print(f"Fuente: {resultado['fuente']}")
    print(f"TC usado: {resultado['tipo_cambio_usado']}")
    print(f"Documentos encontrados: {resultado['total_encontrados']}")
    print(f"Documentos actualizados: {resultado['total_actualizados']}")
    for item in resultado["resultados"]:
        print(f"- {item['tipo']}: {item['actualizados']} de {item['encontrados']} actualizados")
    if resultado["sin_cotizacion"]:
        print("\nSin cotización encontrada:")
        for item in resultado["sin_cotizacion"]:
            print(f"- {item['tipo']} {item.get('numero') or item.get('id')} ({item.get('fecha')})")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
