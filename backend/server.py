from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import os
import logging
import uuid

from config import db, client, EMPRESA_MODULOS_OBLIGATORIOS, DEFAULT_EMPRESA_MODULOS
from auth import hash_password

from routes.auth import router as auth_router
from routes.usuarios import router as usuarios_router
from routes.empresas import router as empresas_router
from routes.presupuestos import router as presupuestos_router
from routes.inventario import router as inventario_router
from routes.alertas import router as alertas_router
from routes.estadisticas import router as estadisticas_router
from routes.proveedores import router as proveedores_router
from routes.costos_fijos import router as costos_fijos_router
from routes.empleados import router as empleados_router
from routes.facturas import router as facturas_router
from routes.balance import router as balance_router
from routes.pagos_proveedores import router as pagos_proveedores_router
from routes.ingresos_varios import router as ingresos_varios_router
from routes.recibos import router as recibos_router
from routes.cuentas_bancarias import router as cuentas_bancarias_router
from routes.compras import router as compras_router
from routes.notas_credito import router as notas_credito_router
from routes.productos import router as productos_router
from routes.cotizaciones import router as cotizaciones_router
from routes.timbrado import router as timbrado_router
from routes.reportes_caja import router as reportes_caja_router
from routes.plan_cuentas import router as plan_cuentas_router

app = FastAPI(title="Arandu&JAR Informatica API")

# CORS - must be before routers
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base routes
api_base = APIRouter(prefix="/api")

@api_base.get("/")
async def root():
    return {"message": "Arandu&JAR Informatica API", "version": "2.0.0"}

@api_base.get("/health")
async def health():
    return {"status": "healthy"}

# Include all module routers under /api
app.include_router(api_base)
app.include_router(auth_router, prefix="/api")
app.include_router(usuarios_router, prefix="/api")
app.include_router(empresas_router, prefix="/api")
app.include_router(estadisticas_router, prefix="/api")
app.include_router(presupuestos_router, prefix="/api")
app.include_router(inventario_router, prefix="/api")
app.include_router(alertas_router, prefix="/api")
app.include_router(proveedores_router, prefix="/api")
app.include_router(costos_fijos_router, prefix="/api")
app.include_router(pagos_proveedores_router, prefix="/api")
app.include_router(empleados_router, prefix="/api")
app.include_router(facturas_router, prefix="/api")
app.include_router(recibos_router, prefix="/api")
app.include_router(cuentas_bancarias_router, prefix="/api")
app.include_router(balance_router, prefix="/api")
app.include_router(ingresos_varios_router, prefix="/api")
app.include_router(compras_router, prefix="/api")
app.include_router(notas_credito_router, prefix="/api")
app.include_router(productos_router, prefix="/api")
app.include_router(cotizaciones_router, prefix="/api")
app.include_router(timbrado_router, prefix="/api")
app.include_router(reportes_caja_router, prefix="/api")
app.include_router(plan_cuentas_router, prefix="/api")


async def init_admin_user():
    admin_email = "jose@aranduinformatica.net"
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Jose Administrador",
            "password": hash_password("secreto2026**"),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logging.info(f"Admin user created: {admin_email}")


async def marcar_plan_cuentas_sistema():
    """
    Marca con sistema=True las 4 cuentas base del plan de cuentas en todas las empresas.
    Retrocompat: documentos creados antes de que existiera el campo 'sistema'.
    """
    from routes.plan_cuentas import DEFAULT_PLAN_CUENTAS
    actualizadas = 0
    for cfg in DEFAULT_PLAN_CUENTAS:
        result = await db.plan_cuentas.update_many(
            {
                "nombre": cfg["nombre"],
                "uso": cfg["uso"],
                "sistema": {"$ne": True},
            },
            {"$set": {"sistema": True, "predeterminada": True}},
        )
        actualizadas += result.modified_count
    if actualizadas:
        logging.info(f"[startup] {actualizadas} cuenta(s) base del plan de cuentas marcadas como sistema=True")


async def sincronizar_modulos_obligatorios():
    """
    Al iniciar, recorre todas las empresas propias y se asegura de que cada una
    tenga en modulos_habilitados todos los módulos marcados como OBLIGATORIOS.
    Así, si se agrega un nuevo módulo obligatorio en config.py, se propaga
    automáticamente a todas las empresas existentes sin intervención manual.
    """
    propias = await db.empresas_propias.find({}, {"_id": 0, "id": 1, "modulos_habilitados": 1}).to_list(1000)
    actualizadas = 0
    for ep in propias:
        modulos_actuales = ep.get("modulos_habilitados")
        # Si no tiene lista explícita, no hace falta tocarla (el runtime usa DEFAULT)
        if not isinstance(modulos_actuales, list):
            continue
        modulos_faltantes = [m for m in EMPRESA_MODULOS_OBLIGATORIOS if m not in modulos_actuales]
        if modulos_faltantes:
            nuevos_modulos = modulos_actuales + modulos_faltantes
            await db.empresas_propias.update_one(
                {"id": ep["id"]},
                {"$set": {"modulos_habilitados": nuevos_modulos}}
            )
            actualizadas += 1
    if actualizadas:
        logging.info(f"[startup] Módulos obligatorios sincronizados en {actualizadas} empresa(s) propia(s): {EMPRESA_MODULOS_OBLIGATORIOS}")


@app.on_event("startup")
async def startup_event():
    await init_admin_user()
    await marcar_plan_cuentas_sistema()
    await sincronizar_modulos_obligatorios()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
