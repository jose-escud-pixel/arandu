from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
from typing import List, Optional
import re

TEMAS_EMPRESA = frozenset({
    "oscuro-azul", "oscuro-rojo", "claro-rojo", "claro-dorado", "claro-azul",
})

_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
_USER_RE  = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._\-]{1,49}$')

def _validate_login_id(v: str) -> str:
    """Acepta email completo o nombre de usuario simple (sin @)."""
    v = (v or "").strip().lower()
    if not v:
        raise ValueError("El usuario/email no puede estar vacío")
    if "@" in v:
        if not _EMAIL_RE.match(v):
            raise ValueError(
                "El formato del email no es válido. "
                "Ejemplo correcto: usuario@dominio.com"
            )
    else:
        if not _USER_RE.match(v):
            raise ValueError(
                "El usuario debe tener al menos 2 caracteres y solo puede "
                "contener letras, números, puntos, guiones y guión bajo"
            )
    return v


# ================== USER MODELS ==================

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return _validate_login_id(v)

class AdminUserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "usuario"
    permisos: List[str] = []
    empresas_asignadas: List[str] = []
    empresas_todos_clientes: bool = True
    logos_asignados: List[str] = []
    empresa_default: Optional[str] = None
    cuentas_reporte_ids: List[str] = []

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return _validate_login_id(v)

class UserLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return _validate_login_id(v)

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    avatar: Optional[str] = None
    permisos: List[str] = []
    empresas_asignadas: List[str] = []
    empresas_todos_clientes: bool = True
    logos_asignados: List[str] = []
    empresa_default: Optional[str] = None
    cuentas_reporte_ids: List[str] = []
    created_at: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if v is None:
            return v
        return _validate_login_id(v)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ================== CONTACT MODELS ==================

class ContactMessage(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    subject: str
    message: str

class ContactMessageResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    subject: str
    message: str
    read: bool
    created_at: str

class SiteContent(BaseModel):
    section: str
    content: dict


# ================== EMPRESA MODELS ==================

class EmpresaCreate(BaseModel):
    nombre: str
    razon_social: Optional[str] = None   # Razón social formal (para facturas)
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    contacto: Optional[str] = None
    aplica_retencion: bool = False        # Si esta empresa retiene IVA al pagar
    porcentaje_retencion: Optional[float] = None  # % de retención sobre el IVA (ej: 30)
    notas: Optional[str] = None
    logo_tipo: Optional[str] = "arandujar"  # arandu | arandujar | jar
    # Datos adicionales del cliente
    personeria: Optional[str] = "fisica"    # fisica | juridica
    fecha_nacimiento: Optional[str] = None  # YYYY-MM-DD
    cumpleanos_amarillo_dias: Optional[int] = None  # None = usar valor global
    cumpleanos_urgente_dias: Optional[int] = None   # None = usar valor global
    nacionalidad: Optional[str] = None
    pais: Optional[str] = None
    ciudad: Optional[str] = None
    municipio: Optional[str] = None
    con_inventario_tecnico: Optional[bool] = None  # None = habilitado (compat. retroactiva)

class EmpresaResponse(BaseModel):
    id: str
    nombre: str
    razon_social: Optional[str] = None
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    contacto: Optional[str] = None
    aplica_retencion: bool = False
    porcentaje_retencion: Optional[float] = None
    notas: Optional[str] = None
    logo_tipo: Optional[str] = "arandujar"
    # Datos adicionales del cliente
    personeria: Optional[str] = "fisica"
    fecha_nacimiento: Optional[str] = None
    cumpleanos_amarillo_dias: Optional[int] = None
    cumpleanos_urgente_dias: Optional[int] = None
    nacionalidad: Optional[str] = None
    pais: Optional[str] = None
    ciudad: Optional[str] = None
    municipio: Optional[str] = None
    con_inventario_tecnico: Optional[bool] = None
    created_at: str
    ventas_activas_count: Optional[int] = 0


# ================== EMPRESA PROPIA MODELS ==================

class EmpresaPropiaCreate(BaseModel):
    nombre: str
    slug: Optional[str] = None  # e.g. "arandu", "jar", "arandujar" — auto-generated if omitted
    razon_social: Optional[str] = None
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    color: Optional[str] = "#3b82f6"
    tema: Optional[str] = "oscuro-azul"
    modulos_habilitados: List[str] = []

    @field_validator("tema", mode="before")
    @classmethod
    def validate_tema(cls, v):
        if v is None or str(v).strip() == "":
            return "oscuro-azul"
        s = str(v).strip()
        return s if s in TEMAS_EMPRESA else "oscuro-azul"


class EmpresaPropiaResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    nombre: str
    slug: str
    razon_social: Optional[str] = None
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    color: Optional[str] = "#3b82f6"
    tema: str = "oscuro-azul"
    modulos_habilitados: List[str] = []
    created_at: str


# ================== PRESUPUESTO MODELS ==================

class PresupuestoItem(BaseModel):
    descripcion: str
    cantidad: int = 1
    costo: float
    margen: float = 0
    precio_unitario: float
    subtotal: float
    producto_id: Optional[str] = None
    observacion: Optional[str] = None
    observacion_oculta: Optional[str] = None
    imagen: Optional[str] = None
    imagen_comentario: Optional[str] = None
    moneda_item: Optional[str] = None
    tipo_cambio_item: Optional[float] = None
    proveedor_id: Optional[str] = None
    proveedor_nombre: Optional[str] = None

class CostoRealItem(BaseModel):
    descripcion: str
    cantidad: float = 1
    costo_estimado: float = 0
    costo_real: float = 0
    observacion: Optional[str] = None
    proveedor: str = ""
    es_nuevo: bool = False
    moneda_item: Optional[str] = None        # moneda del costo estimado (del presupuesto)
    tipo_cambio_item: Optional[float] = None  # TC del estimado (override por item)
    moneda_costo: Optional[str] = None        # moneda del costo real (puede diferir)
    tipo_cambio_costo: Optional[float] = None # TC override para el costo real

class ProveedorPago(BaseModel):
    proveedor: str
    monto_total: float = 0
    pagado: bool = False
    fecha_pago: Optional[str] = None

class CostosReales(BaseModel):
    items: List[CostoRealItem]
    total_costos: float
    total_facturado: float
    ganancia: float
    proveedores_pagos: List[ProveedorPago] = []

class PresupuestoCreate(BaseModel):
    empresa_id: str
    logo_tipo: str = "arandujar"
    moneda: str = "PYG"
    forma_pago: str = "contado"
    numero: Optional[str] = None
    nombre_archivo: Optional[str] = None
    fecha: Optional[str] = None
    validez_dias: int = 15
    tipo_cambio: Optional[float] = None
    modo: Optional[str] = "libre"
    items: List[PresupuestoItem]
    observaciones: Optional[str] = None
    condiciones: Optional[str] = None
    subtotal: float
    iva: float = 0
    total: float

class PresupuestoResponse(BaseModel):
    id: str
    empresa_id: str
    empresa_nombre: Optional[str] = None
    empresa_ruc: Optional[str] = None

    emisor_razon_social: Optional[str] = None
    emisor_ruc: Optional[str] = None
    emisor_direccion: Optional[str] = None
    emisor_telefono: Optional[str] = None
    emisor_email: Optional[str] = None
    logo_tipo: str
    moneda: str = "PYG"
    forma_pago: str = "contado"
    numero: str
    nombre_archivo: Optional[str] = None
    fecha: str
    validez_dias: int
    tipo_cambio: Optional[float] = None
    modo: Optional[str] = "libre"
    items: List[PresupuestoItem]
    observaciones: Optional[str] = None
    condiciones: Optional[str] = None
    subtotal: float
    iva: float
    total: float
    estado: str
    costos_reales: Optional[CostosReales] = None
    facturas_count: int = 0  # cantidad de facturas vinculadas a este presupuesto
    created_at: str


# ================== INVENTARIO MODELS ==================

class CategoriaCreate(BaseModel):
    nombre: str
    subtipos: List[str] = []

class CategoriaResponse(BaseModel):
    id: str
    nombre: str
    subtipos: List[str] = []

class ActivoCreate(BaseModel):
    empresa_id: str
    categoria: str
    subtipo: str = ""
    nombre: str
    descripcion: str = ""
    ubicacion: str = ""
    ip_local: str = ""
    ip_publica: str = ""
    ips_locales: List[str] = []
    ips_publicas: List[str] = []
    dominio: str = ""
    puerto_local: str = ""
    puerto_externo: str = ""
    version: str = ""
    estado: str = "activo"
    ultima_revision: str = ""
    observaciones: str = ""
    campos_personalizados: dict = {}
    activos_asignados: List[str] = []
    nvr_dvr_id: Optional[str] = None

class ActivoResponse(BaseModel):
    id: str
    empresa_id: str
    empresa_nombre: Optional[str] = None
    categoria: str
    subtipo: str = ""
    nombre: str
    descripcion: str = ""
    ubicacion: str = ""
    ip_local: str = ""
    ip_publica: str = ""
    ips_locales: List[str] = []
    ips_publicas: List[str] = []
    dominio: str = ""
    puerto_local: str = ""
    puerto_externo: str = ""
    version: str = ""
    estado: str = "activo"
    ultima_revision: str = ""
    observaciones: str = ""
    campos_personalizados: dict = {}
    activos_asignados: List[str] = []
    nvr_dvr_id: Optional[str] = None
    nvr_dvr_nombre: Optional[str] = None
    credenciales_count: int = 0
    created_at: str

class CredencialCreate(BaseModel):
    activo_id: str
    tipo_acceso: str = ""
    usuario: str = ""
    password: str = ""
    url_acceso: str = ""
    observaciones: str = ""
    dispositivos_asignados: List[str] = []

class CredencialResponse(BaseModel):
    id: str
    activo_id: str
    tipo_acceso: str = ""
    usuario: str = ""
    password: str = ""
    url_acceso: str = ""
    observaciones: str = ""
    dispositivos_asignados: List[str] = []
    created_at: str

class HistorialResponse(BaseModel):
    id: str
    activo_id: str
    usuario_id: str
    usuario_nombre: str = ""
    accion: str
    detalle: str = ""
    fecha: str


# ================== PROVEEDOR MODELS ==================

class ProveedorCreate(BaseModel):
    nombre: str
    ruc: Optional[str] = None
    contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    categoria: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True
    logo_tipo: Optional[str] = None  # arandu | arandujar | jar | None=todas

class ProveedorResponse(BaseModel):
    id: str
    nombre: str
    ruc: Optional[str] = None
    contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    categoria: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True
    logo_tipo: Optional[str] = None
    created_at: str

class PagoProveedorCreate(BaseModel):
    monto_pagado: float
    moneda: str = "PYG"
    tipo_cambio_real: Optional[float] = None
    fecha_pago: str
    notas: Optional[str] = None
    presupuesto_ids: List[str] = []

class PagoProveedorResponse(BaseModel):
    id: str
    proveedor_id: str
    proveedor_nombre: Optional[str] = None
    monto_pagado: float
    moneda: str
    tipo_cambio_real: Optional[float] = None
    monto_pyg: float = 0
    fecha_pago: str
    notas: Optional[str] = None
    presupuesto_ids: List[str] = []
    created_at: str


# ================== COSTO FIJO MODELS ==================

class CostoFijoCreate(BaseModel):
    logo_tipo: str = "arandujar"       # arandu | arandujar | jar
    nombre: str
    descripcion: Optional[str] = None
    categoria: Optional[str] = None   # hosting, dominio, servicios, impuestos, etc.
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    frecuencia: str = "mensual"        # mensual | trimestral | semestral | anual
    dia_vencimiento: int = 1
    fecha_inicio: str
    fecha_fin: Optional[str] = None
    activo: bool = True
    notas: Optional[str] = None

class CostoFijoResponse(BaseModel):
    id: str
    logo_tipo: str
    nombre: str
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    monto: float
    moneda: str
    tipo_cambio: Optional[float] = None
    frecuencia: str
    dia_vencimiento: int
    fecha_inicio: str
    fecha_fin: Optional[str] = None
    activo: bool = True
    notas: Optional[str] = None
    created_at: str

class PagoCostoFijoCreate(BaseModel):
    periodo: str          # YYYY-MM
    monto_pagado: float
    fecha_pago: str
    notas: Optional[str] = None
    tiene_factura: bool = False
    nro_factura: Optional[str] = None       # Nro. de factura para IVA crédito fiscal
    nro_timbrado: Optional[str] = None      # Número de timbrado del proveedor (SET)
    fecha_vigencia_timbrado: Optional[str] = None  # Vigencia del timbrado YYYY-MM-DD
    cuenta_id: Optional[str] = None         # cuenta bancaria desde la que se pagó
    cuenta_nombre: Optional[str] = None     # nombre desnormalizado para display

class PagoCostoFijoResponse(BaseModel):
    id: str
    costo_fijo_id: str
    periodo: str
    monto_pagado: float
    fecha_pago: str
    notas: Optional[str] = None
    tiene_factura: bool = False
    nro_factura: Optional[str] = None
    nro_timbrado: Optional[str] = None
    fecha_vigencia_timbrado: Optional[str] = None
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    created_at: str


# ================== CONTRATO MODELS ==================

class ContratoCreate(BaseModel):
    empresa_id: str
    logo_tipo: str = "arandujar"          # arandu | arandujar | jar
    nombre: str
    numero: Optional[str] = None
    descripcion: Optional[str] = None
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    frecuencia: str = "mensual"
    dia_cobro: int = 1
    fecha_inicio: str
    fecha_fin: Optional[str] = None
    activo: bool = True
    notas: Optional[str] = None

class ContratoResponse(BaseModel):
    id: str
    empresa_id: str
    empresa_nombre: Optional[str] = None
    logo_tipo: str = "arandujar"
    numero: Optional[str] = None
    nombre: str
    descripcion: Optional[str] = None
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    frecuencia: str
    dia_cobro: int
    fecha_inicio: str
    fecha_fin: Optional[str] = None
    activo: bool = True
    notas: Optional[str] = None
    created_at: str

class PagoContratoCreate(BaseModel):
    periodo: str  # YYYY-MM
    monto_pagado: float
    fecha_pago: str
    notas: Optional[str] = None

class PagoContratoResponse(BaseModel):
    id: str
    contrato_id: str
    periodo: str
    monto_pagado: float
    fecha_pago: str
    notas: Optional[str] = None
    created_at: str


# ================== EMPLEADO MODELS ==================

class EmpleadoCreate(BaseModel):
    logo_tipo: str = "arandujar"          # arandu | arandujar | jar
    nombre: str
    apellido: str
    cargo: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    fecha_ingreso: str                    # YYYY-MM-DD
    fecha_egreso: Optional[str] = None
    activo: bool = True
    sueldo_base: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None  # solo si moneda != PYG
    aplica_ips: bool = True
    base_calculo_ips: str = "minimo"     # "minimo" | "sueldo" | "manual"
    sueldo_minimo_vigente: Optional[float] = None
    ips_monto_manual: Optional[float] = None
    notas: Optional[str] = None

class HistorialSueldoEntry(BaseModel):
    fecha: str                   # YYYY-MM-DD del cambio
    sueldo_anterior: float
    sueldo_nuevo: float
    moneda: str = "PYG"
    motivo: Optional[str] = None
    usuario_id: Optional[str] = None
    usuario_nombre: Optional[str] = None


class EmpleadoResponse(BaseModel):
    id: str
    logo_tipo: str
    nombre: str
    apellido: str
    cargo: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    fecha_ingreso: str
    fecha_egreso: Optional[str] = None
    activo: bool
    sueldo_base: float
    moneda: str
    tipo_cambio: Optional[float] = None
    aplica_ips: bool = True
    base_calculo_ips: str = "minimo"
    sueldo_minimo_vigente: Optional[float] = None
    ips_monto_manual: Optional[float] = None
    notas: Optional[str] = None
    historial_sueldos: List[HistorialSueldoEntry] = []
    created_at: str

class SueldoCreate(BaseModel):
    periodo: str              # YYYY-MM
    monto_pagado: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    fecha_pago: str           # YYYY-MM-DD
    horas_extra: Optional[float] = None          # deprecated, kept for compat
    monto_horas_extra: Optional[float] = None    # deprecated, kept for compat
    total_extras: Optional[float] = None
    total_adelantos: Optional[float] = None
    descuento_ips: Optional[float] = None
    descuentos_adicionales: Optional[float] = None  # suma total de descuentos extra
    notas: Optional[str] = None

class SueldoResponse(BaseModel):
    id: str
    empleado_id: str
    empleado_nombre: Optional[str] = None
    periodo: str
    monto_pagado: float
    moneda: str
    tipo_cambio: Optional[float] = None
    fecha_pago: str
    horas_extra: Optional[float] = None
    monto_horas_extra: Optional[float] = None
    total_extras: Optional[float] = None
    total_adelantos: Optional[float] = None
    descuento_ips: Optional[float] = None
    descuentos_adicionales: Optional[float] = None
    notas: Optional[str] = None
    created_at: str

class AdelantoCreate(BaseModel):
    periodo: str              # YYYY-MM
    monto: float
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    fecha: str                # YYYY-MM-DD
    notas: Optional[str] = None

class AdelantoResponse(BaseModel):
    id: str
    empleado_id: str
    empleado_nombre: Optional[str] = None
    periodo: str
    monto: float
    moneda: str
    tipo_cambio: Optional[float] = None
    fecha: str
    notas: Optional[str] = None
    created_at: str


# ================== ALERTA MODELS ==================

class AlertaCreate(BaseModel):
    empresa_id: str
    tipo: str
    nombre: str
    descripcion: str = ""
    fecha_vencimiento: str
    activo_id: Optional[str] = None
    notificar_dias: int = 30
    notificar_dias_urgente: Optional[int] = 0
    auto_generada: bool = False

class AlertaResponse(BaseModel):
    id: str
    empresa_id: str
    empresa_nombre: Optional[str] = None
    tipo: str
    nombre: str
    descripcion: str = ""
    fecha_vencimiento: str
    activo_id: Optional[str] = None
    activo_nombre: Optional[str] = None
    notificar_dias: int = 30
    notificar_dias_urgente: Optional[int] = 0
    auto_generada: bool = False
    estado: str = "activa"
    created_at: str



# ================== FACTURA MODELS ==================

class FacturaCreate(BaseModel):
    logo_tipo: str = "arandujar"          # arandu | arandujar | jar

    emisor_razon_social: Optional[str] = None
    emisor_ruc: Optional[str] = None
    emisor_direccion: Optional[str] = None
    emisor_telefono: Optional[str] = None
    emisor_email: Optional[str] = None
    tipo: str = "emitida"                 # emitida | recibida
    sin_factura: bool = False             # True = boleta (venta sin comprobante fiscal)
    numero: Optional[str] = None         # Nro de factura (vacío si sin_factura=True)
    fecha: str                            # YYYY-MM-DD
    forma_pago: str = "contado"           # contado | credito
    razon_social: str                     # cliente o proveedor (razón social formal)
    ruc: Optional[str] = None
    # Vínculo con la empresa para poder mostrar siempre el nombre/apodo actual
    empresa_id: Optional[str] = None
    empresa_nombre: Optional[str] = None  # snapshot del nombre/apodo al crear
    concepto: str
    conceptos: Optional[List[dict]] = None  # detalle de ítems (cuando viene del form nuevo)
    modo: str = "libre"                     # libre | productos
    afecta_stock: bool = False              # descuenta inventario si hay producto_id
    monto: float
    iva: Optional[float] = None
    moneda: str = "PYG"
    tipo_cambio: Optional[float] = None
    estado: str = "pendiente"             # pendiente | pagada | parcial | anulada
    fecha_vencimiento: Optional[str] = None
    plan_cuenta_id: Optional[str] = None
    plan_cuenta_nombre: Optional[str] = None
    fecha_pago: Optional[str] = None
    monto_pagado: Optional[float] = None  # para pagos parciales
    presupuesto_id: Optional[str] = None # DEPRECATED: usar presupuesto_ids
    presupuesto_ids: List[str] = []      # lista de presupuestos vinculados (muchos-a-muchos)
    notas: Optional[str] = None
    # Timbrado (autorización SET para emitir comprobantes)
    nro_timbrado: Optional[str] = None          # Número de timbrado
    fecha_inicio_timbrado: Optional[str] = None  # YYYY-MM-DD inicio vigencia
    fecha_vigencia_timbrado: Optional[str] = None # YYYY-MM-DD fin de vigencia
    punto_expedicion: Optional[str] = None       # formato: "XXX-YYY" ej: "001-001"
    # Cuenta bancaria a la que entró (o de la que salió) la plata,
    # cuando se crea/edita la factura ya marcada como pagada.
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    # Boleta (venta sin comprobante fiscal)
    numero_boleta: Optional[str] = None  # Auto-generado: BOL-YYYYMM-NNNNNN

class PagoItem(BaseModel):
    """Un pago individual dentro del historial de pagos de una factura."""
    id: Optional[str] = None
    monto: float
    fecha: str
    registrado_por: Optional[str] = None
    recibo_id: Optional[str] = None
    recibo_numero: Optional[str] = None
    cuenta_id: Optional[str] = None        # cuenta bancaria destino
    cuenta_nombre: Optional[str] = None    # nombre de cuenta (desnormalizado para display)
    tipo_cambio: Optional[float] = None    # solo si moneda factura != moneda cuenta
    monto_cuenta: Optional[float] = None   # monto en la moneda de la cuenta (ej: USD equivalente)
    created_at: Optional[str] = None

class FacturaResponse(BaseModel):
    id: str
    logo_tipo: str

    emisor_razon_social: Optional[str] = None
    emisor_ruc: Optional[str] = None
    emisor_direccion: Optional[str] = None
    emisor_telefono: Optional[str] = None
    emisor_email: Optional[str] = None
    tipo: str
    sin_factura: bool = False
    numero: Optional[str] = None
    numero_boleta: Optional[str] = None
    fecha: str
    forma_pago: str = "contado"
    razon_social: str
    ruc: Optional[str] = None
    empresa_id: Optional[str] = None
    empresa_nombre: Optional[str] = None
    concepto: str
    conceptos: Optional[List[dict]] = None
    modo: str = "libre"
    afecta_stock: bool = False
    monto: float
    iva: Optional[float] = None
    moneda: str
    tipo_cambio: Optional[float] = None
    estado: str
    fecha_vencimiento: Optional[str] = None
    plan_cuenta_id: Optional[str] = None
    plan_cuenta_nombre: Optional[str] = None
    fecha_pago: Optional[str] = None
    monto_pagado: Optional[float] = None
    pagos: List[PagoItem] = []            # historial de pagos parciales/totales
    presupuesto_id: Optional[str] = None  # DEPRECATED: usar presupuesto_ids
    presupuesto_ids: List[str] = []       # lista de presupuestos vinculados
    notas: Optional[str] = None
    nro_timbrado: Optional[str] = None
    fecha_inicio_timbrado: Optional[str] = None
    fecha_vigencia_timbrado: Optional[str] = None
    punto_expedicion: Optional[str] = None
    cuenta_id: Optional[str] = None
    cuenta_nombre: Optional[str] = None
    created_at: str
    # Soft delete
    eliminada: bool = False
    eliminada_at: Optional[str] = None
    eliminada_por: Optional[str] = None
    eliminada_por_id: Optional[str] = None
