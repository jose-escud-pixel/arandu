# Arandu&JAR Informática – PRD vivo

## Contexto
Jose Escudero (jose@aranduinformatica.net) opera 3 empresas propias desde un único sistema:
- **Arandu** (tema claro-azul)
- **JAR** (tema claro-rojo)
- **AranduJAR** (tema oscuro-azul)

El objetivo es **separar completamente** los datos de cada empresa: clientes, presupuestos, facturas, contratos, ingresos, etc.
Al cambiar la empresa activa (selector en sidebar), TODO el contenido y el tema deben cambiar.

## Stack
- Backend: FastAPI + Motor (MongoDB) — `/app/backend`
- Frontend: React 18 + CRACO + Tailwind — `/app/frontend`
- Auth: JWT bcrypt (secret en env `JWT_SECRET`)

## Usuarios de prueba
Ver `/app/memory/test_credentials.md`

## Implementado en esta sesión (16/04/2026)
### Backend
- `apply_logo_filter()` helper en `auth.py` con semántica estricta:
  - Admin + sin param → sin filtro
  - Admin + param → filtro exacto
  - Usuario + sin param → intersección `logos_asignados`
  - Usuario + param (accesible) → filtro exacto
  - Usuario + param (no accesible) → vacío
- Aplicado en: empresas, presupuestos, facturas (+resumen), contratos (+cobros anuales), ingresos_varios, compras (+resumen proveedor), productos, proveedores, costos_fijos (+vencimientos), estadisticas (stats dashboard).
- Auto-seed de empresas_propias con colores y temas correctos + migración on-GET para registros antiguos con slug conocido.
- `GET /admin/empresas` ahora acepta `logo_tipo=…` y aplica filtro estricto.
- `POST/PUT /admin/empresas-propias` persisten campo `tema`.

### Frontend
- `AuthContext`:
  - Usuario con 1 empresa asignada → auto-selecciona al login (no muestra switcher).
  - Persistencia de `empresa_default` en localStorage y backend.
- `EmpresasPage` (Clientes):
  - Filtra por `activeEmpresaPropia.slug`.
  - Form "Nuevo Cliente" oculta selector de empresa propia cuando hay empresa activa (muestra banner informativo).
  - Botón "Volver" (navigate -1) en lugar de "Volver al Dashboard".
- `VentasPage`:
  - Filtro temporal: "Todos los meses" (default) / "Por mes" / "Por año".
  - Click en badge de estado (presupuestos y facturas) abre dropdown para cambiar estado inline.
  - Chips cliqueables para navegar de factura → presupuesto y de presupuesto → factura.
  - Removidos los links "Ver página completa" en las 4 tabs.
  - Botón "Volver" con navigate(-1).
- `ContratosPage`: pasa `logo_tipo` estricto al backend en fetchContratos y fetchEmpresas.
- `AdminDashboard`: Logo "ARANDU" en azul (antes era verde emerald).
- `index.css`: mejoras de contraste de textos `text-*-300` y `text-slate-400` en temas claros.

## Pendiente (backlog P0/P1)
### P0 — Pedido explícito por usuario
1. **Vista previa inline** al click en ítem (factura/presupuesto/contrato/ingreso) — actualmente se navega a otra página.
2. **Formularios mejorados** (quitar selector empresa, quitar "logo para presupuesto", quitar "descripción" de contrato, "día de cobro" de contrato, "tipo" de factura, "empresa" de factura).
3. **Restricción XOR de vinculación**: presupuesto ↔ (factura XOR ingreso sin factura); factura ↔ (contrato XOR presupuesto).
4. **Lógica nueva de facturación contado/crédito**:
   - Factura contado → sólo "pagar total" con fecha = fecha factura.
   - Factura crédito → pagos parciales con fecha real, generando recibo con número consecutivo automático.
5. **Migración de facturas existentes**: detectar facturas con `fecha_pago ≠ fecha` y mover a crédito con recibo auto-generado.
6. **Permisos por usuario — modo carga libre/catálogo**: permiso nuevo `productos.modo_libre`; default catálogo si no tiene.
7. **Obs oculta en items de presupuesto** (visible sólo en vista de costos, no en presupuesto final).
8. **Retención IVA como egreso automático** al cobrar facturas de clientes con `aplica_retencion=true`.
9. **Ordenamiento por columnas** en todas las listas (nombre, monto, fecha, nº).
10. **Filtrado por cliente + mes + año** en Contratos, Facturas, Ingresos.

### P1
- Click en "factura vinculada" dentro de un presupuesto → abre directo esa factura (hoy: abre la lista completa de facturas).
- Auto-completar campos de factura al vincular contrato (nombre, monto, mes).
- Search avanzada (monto, descripcion) en presupuestos/facturas/ingresos.

## Arquitectura de filtrado por empresa activa
- Cada colección mongo con datos por empresa tiene campo `logo_tipo: "arandu" | "jar" | "arandujar" | …`.
- Frontend lee `activeEmpresaPropia.slug` del AuthContext y lo pasa como `?logo_tipo=…` en cada llamada.
- Backend aplica `apply_logo_filter()` que:
  1. Valida acceso del usuario.
  2. Restringe la query exacta al slug solicitado.
  3. Devuelve `[]` si el usuario no tiene acceso al slug pedido.
