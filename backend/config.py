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
    "reportes": ["ver", "exportar"],
    "alertas": ["ver", "crear", "editar", "eliminar"],
    "costos": ["ver", "editar"],
    "estadisticas": ["ver"],
    "contratos": ["ver", "crear", "editar", "eliminar"],
    "proveedores": ["ver", "crear", "editar", "eliminar"],
    "costos_fijos": ["ver", "crear", "editar", "eliminar"],
    "empleados": ["ver", "crear", "editar", "eliminar"],
    "facturas": ["ver", "crear", "editar", "eliminar", "modo_libre"],
    "balance": ["ver", "editar"],
    "ingresos_varios": ["ver", "crear", "editar", "eliminar"],
    "pagos_proveedores": ["ver", "crear", "editar", "eliminar"],
    "compras": ["ver", "crear", "editar", "eliminar", "afectar_stock"],
    "recibos": ["ver", "crear", "editar", "eliminar"],
    "inventario_productos": ["ver", "crear", "editar", "eliminar"],
}

CATEGORIAS_DEFAULT = [
    {"nombre": "Servidores", "subtipos": ["Windows Server", "Linux", "Virtual", "NAS", "Proxmox", "VMware", "Otro"]},
    {"nombre": "Dispositivos", "subtipos": ["PC Escritorio", "Notebook", "Impresora", "Router", "Switch", "Mikrotik", "Access Point", "DVR", "Camara IP", "UPS", "Firewall", "Otro"]},
    {"nombre": "Cuentas de Acceso", "subtipos": ["AnyDesk", "Office 365", "Correo", "Zimbra", "SSH", "RDP", "VPN", "WiFi", "Panel Web", "Base de Datos", "Winbox", "FTP", "Personalizada"]},
    {"nombre": "Dominios y Servicios", "subtipos": ["Dominio Web", "DNS", "Hosting", "NIC", "SSL", "Otro"]},
]
