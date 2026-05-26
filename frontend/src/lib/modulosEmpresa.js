export const EMPRESA_MODULOS = {
  clientes: {
    label: "Clientes",
    desc: "Base obligatoria para facturas, presupuestos, ingresos y reportes por cliente",
    permisos: ["empresas"],
    obligatorio: true,
  },
  bancos: {
    label: "Bancos",
    desc: "Base obligatoria para registrar dónde entra o sale el dinero",
    permisos: ["bancos"],
    obligatorio: true,
  },
  plan_cuentas: {
    label: "Plan de cuentas",
    desc: "Cuentas por cobrar y pagar para ventas/compras contado y crédito",
    permisos: ["plan_cuentas"],
    obligatorio: true,
  },
  ventas_base: {
    label: "Ventas base",
    desc: "Facturas, recibos/cobros de crédito y notas de crédito de ventas",
    permisos: ["facturas", "recibos", "notas_credito"],
  },
  presupuestos: {
    label: "Presupuestos",
    desc: "Presupuestos, costos estimados y vinculación con facturas",
    permisos: ["presupuestos", "costos"],
  },
  ingresos_varios: {
    label: "Ingresos sin factura",
    desc: "Ingresos directos sin emitir factura",
    permisos: ["ingresos_varios"],
  },
  egresos_base: {
    label: "Egresos base",
    desc: "Compras libres y gastos fijos/recurrentes",
    permisos: ["compras", "costos_fijos"],
  },
  proveedores: {
    label: "Proveedores",
    desc: "Directorio de proveedores, compras a crédito y pagos pendientes",
    permisos: ["proveedores", "pagos_proveedores"],
  },
  sueldos: {
    label: "Sueldos",
    desc: "Empleados, sueldos, extras, adelantos y descuentos",
    permisos: ["empleados"],
  },
  balance: {
    label: "Balance e IVA",
    desc: "Balance, tesorería, IVA fiscal y pagos de IVA",
    permisos: ["balance"],
  },
  inventario_tecnico: {
    label: "Inventario técnico",
    desc: "Activos técnicos, credenciales y alertas",
    permisos: ["inventario", "credenciales", "alertas"],
  },
  productos_stock: {
    label: "Productos y stock",
    desc: "Catálogo de productos, movimientos e historial de stock",
    permisos: ["inventario_productos", "historial_stock"],
  },
  reportes: {
    label: "Reportes",
    desc: "Reportes imprimibles y exportables",
    permisos: ["reportes"],
  },
  administracion: {
    label: "Administración delegada",
    desc: "Usuarios y auditoría limitados a las empresas asignadas",
    permisos: ["usuarios", "auditoria"],
  },
  mensajes: {
    label: "Mensajes",
    desc: "Mensajes recibidos desde la web",
    permisos: ["mensajes"],
  },
};

export const DEFAULT_EMPRESA_MODULOS = Object.keys(EMPRESA_MODULOS);
export const EMPRESA_MODULOS_OBLIGATORIOS = Object.entries(EMPRESA_MODULOS)
  .filter(([, config]) => config.obligatorio)
  .map(([key]) => key);

export const PERMISO_A_MODULO_EMPRESA = Object.fromEntries(
  Object.entries(EMPRESA_MODULOS).flatMap(([moduloEmpresa, config]) =>
    config.permisos.map(permisoModulo => [permisoModulo, moduloEmpresa])
  )
);

export const moduloEmpresaDePermiso = (permiso) => {
  const permisoModulo = String(permiso || "").split(".")[0];
  return PERMISO_A_MODULO_EMPRESA[permisoModulo] || null;
};

export const modulosHabilitadosEmpresa = (empresaPropia) => {
  const modulos = empresaPropia?.modulos_habilitados;
  if (!Array.isArray(modulos)) return DEFAULT_EMPRESA_MODULOS;
  const legacyAliases = {
    ventas: ["ventas_base", "presupuestos", "ingresos_varios"],
    facturas: ["ventas_base"],
    recibos: ["ventas_base"],
    notas_credito: ["ventas_base"],
    egresos: ["egresos_base", "proveedores", "sueldos", "balance"],
    compras: ["egresos_base"],
    gastos: ["egresos_base"],
    pagos_proveedores: ["proveedores"],
  };
  return [...new Set([
    ...EMPRESA_MODULOS_OBLIGATORIOS,
    ...modulos.flatMap(m => legacyAliases[m] || [m]),
  ])];
};

export const empresaTieneModulo = (empresaPropia, modulo) => {
  if (!empresaPropia || !modulo) return true;
  return modulosHabilitadosEmpresa(empresaPropia).includes(modulo);
};

export const permisoHabilitadoPorEmpresa = (empresaPropia, permiso) => {
  const modulo = moduloEmpresaDePermiso(permiso);
  return !modulo || empresaTieneModulo(empresaPropia, modulo);
};
