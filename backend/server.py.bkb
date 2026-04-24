from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import os
import logging
import uuid

from config import db, client
from auth import hash_password

from routes.auth import router as auth_router
from routes.usuarios import router as usuarios_router
from routes.empresas import router as empresas_router
from routes.presupuestos import router as presupuestos_router
from routes.inventario import router as inventario_router
from routes.alertas import router as alertas_router
from routes.estadisticas import router as estadisticas_router
from routes.contratos import router as contratos_router
from routes.proveedores import router as proveedores_router
from routes.costos_fijos import router as costos_fijos_router
from routes.empleados import router as empleados_router
from routes.facturas import router as facturas_router
from routes.balance import router as balance_router
from routes.pagos_proveedores import router as pagos_proveedores_router
from routes.ingresos_varios import router as ingresos_varios_router
from routes.recibos import router as recibos_router
from routes.cuentas_bancarias import router as cuentas_bancarias_router

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
app.include_router(contratos_router, prefix="/api")
app.include_router(proveedores_router, prefix="/api")
app.include_router(costos_fijos_router, prefix="/api")
app.include_router(pagos_proveedores_router, prefix="/api")
app.include_router(empleados_router, prefix="/api")
app.include_router(facturas_router, prefix="/api")
app.include_router(recibos_router, prefix="/api")
app.include_router(cuentas_bancarias_router, prefix="/api")
app.include_router(balance_router, prefix="/api")
app.include_router(ingresos_varios_router, prefix="/api")


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


@app.on_event("startup")
async def startup_event():
    await init_admin_user()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
