from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT
JWT_SECRET = os.environ.get('JWT_SECRET', 'arandujar-secret-2024')
JWT_ALGORITHM = "HS256"

# Permisos
PERMISOS_DISPONIBLES = {
    "empresas": ["ver", "crear", "editar", "eliminar"],
    "presupuestos": ["ver", "crear", "editar", "eliminar", "modo_libre"],
    "inventario": ["ver", "crear", "editar", "eliminar"],
    "credenciales": ["ver", "editar"],
    "reportes": [
        "ver", "exportar",
        # Reportes financieros individuales
        "balance_mensual", "balance_anual", "balance_detallado",
        "facturas", "cliente_detallado",
        "ingresos", "recibos", "notas_credito",
        "presupuestos", "compras", "gastos",
        "proveedores", "iva", "caja_banco",
        # Reportes de inventario
        "productos_stock", "stock_historial",
        # Reporte técnico
        "inventario_tecnico",
    ],
    "alertas": ["ver", "crear", "editar", "eliminar"],
    "costos": ["ver", "editar"],
    "proveedores": ["ver", "crear", "editar", "eliminar"],
    "costos_fijos": ["ver", "crear", "editar", "eliminar"],
    "empleados": ["ver", "crear", "editar", "eliminar"],
    "facturas": ["ver", "crear", "editar", "eliminar", "anular", "modo_libre", "afectar_stock", "timbrado"],
    "balance": ["ver", "editar"],
    "ingresos_varios": ["ver", "crear", "editar", "eliminar"],
    "pagos_proveedores": ["ver", "crear", "editar", "eliminar"],
    "compras": ["ver", "crear", "editar", "eliminar", "afectar_stock"],
    "recibos": ["ver", "crear", "editar", "eliminar"],
    "notas_credito": ["ver", "crear", "editar", "eliminar"],
    "inventario_productos": ["ver", "crear", "editar", "eliminar", "crear_servicio", "stock_inicial", "ajustar_stock"],
    "historial_stock": ["ver"],
    "bancos": ["ver", "crear", "editar", "eliminar", "asignar_acceso_reporte"],
    "plan_cuentas": ["ver", "crear", "editar", "eliminar"],
    "usuarios": ["ver", "crear", "editar", "eliminar"],
    "auditoria": ["ver"],
}

# Módulos que se pueden habilitar/deshabilitar por empresa propia.
# Cada módulo agrupa uno o más módulos/permisos granulares existentes.
EMPRESA_MODULOS_DISPONIBLES = {
    "clientes": ["empresas"],
    "bancos": ["bancos"],
    "plan_cuentas": ["plan_cuentas"],
    "ventas_base": ["facturas", "recibos", "notas_credito"],
    "presupuestos": ["presupuestos", "costos"],
    "ingresos_varios": ["ingresos_varios"],
    "egresos_base": ["compras", "costos_fijos"],
    "proveedores": ["proveedores", "pagos_proveedores"],
    "sueldos": ["empleados"],
    "balance": ["balance"],
    "inventario_tecnico": ["inventario", "credenciales", "alertas"],
    "productos_stock": ["inventario_productos", "historial_stock"],
    "reportes": ["reportes"],
    "administracion": ["usuarios", "auditoria"],
    "mensajes": ["mensajes"],
}

DEFAULT_EMPRESA_MODULOS = list(EMPRESA_MODULOS_DISPONIBLES.keys())
EMPRESA_MODULOS_OBLIGATORIOS = ["clientes", "bancos", "plan_cuentas"]

PERMISO_A_MODULO_EMPRESA = {
    permiso_modulo: modulo_empresa
    for modulo_empresa, permisos_modulos in EMPRESA_MODULOS_DISPONIBLES.items()
    for permiso_modulo in permisos_modulos
}

CATEGORIAS_DEFAULT = [
    {"nombre": "Servidores", "subtipos": ["Windows Server", "Linux", "Virtual", "NAS", "Proxmox", "VMware", "Otro"]},
    {"nombre": "Dispositivos", "subtipos": ["PC Escritorio", "Notebook", "Impresora", "Router", "Switch", "Mikrotik", "Access Point", "DVR", "Camara IP", "UPS", "Firewall", "Otro"]},
    {"nombre": "Cuentas de Acceso", "subtipos": ["AnyDesk", "Office 365", "Correo", "Zimbra", "SSH", "RDP", "VPN", "WiFi", "Panel Web", "Base de Datos", "Winbox", "FTP", "Personalizada"]},
    {"nombre": "Dominios y Servicios", "subtipos": ["Dominio Web", "DNS", "Hosting", "NIC", "SSL", "Otro"]},
]
