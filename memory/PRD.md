# Arandu&JAR Informática – PRD vivo

## Contexto
Jose Escudero (jose@aranduinformatica.net) opera 3 empresas propias desde un único sistema:
- **Arandu** (tema claro-azul, color #2563eb)
- **JAR** (tema claro-rojo, color #dc2626)
- **AranduJAR** (tema oscuro-azul, color #1e3a8a)

Objetivo central: **separación total por empresa** — al cambiar empresa activa, TODO el contenido y tema cambian.

## Stack
- Backend: FastAPI + Motor (MongoDB) en `/app/backend`
- Frontend: React 18 + CRACO + Tailwind en `/app/frontend`
- Auth: JWT bcrypt

## Usuarios de prueba
Ver `/app/memory/test_credentials.md`

## Implementado – Sesión 16/04/2026

### Fase 1 — Separación estricta por empresa
- Helper `apply_logo_filter()` en `auth.py` con semántica estricta.
- Aplicado en todos los endpoints de lista: empresas, presupuestos, facturas (+resumen), contratos (+cobros anuales), ingresos_varios, compras (+resumen proveedor), productos, proveedores, costos_fijos (+vencimientos), estadisticas (stats dashboard).
- Auto-seed de empresas_propias con colores y temas correctos + migración on-GET para registros antiguos con slug conocido.
- `GET /admin/empresas` acepta `logo_tipo=…` y aplica filtro estricto.
- `POST/PUT /admin/empresas-propias` persisten campo `tema`.
- `AuthContext`: usuario con 1 empresa asignada → auto-selecciona al login; persistencia de `empresa_default`.
- `EmpresasPage` (Clientes): filtra por empresa activa; form oculta selector y muestra banner informativo.

### Fase 2 — UX limpia en Ventas
- VentasPage: filtro temporal "Todos los meses / Por mes / Por año".
- Click en badge de estado → dropdown para cambiar estado inline (presupuestos y facturas).
- Chips cliqueables `📄 pres.` / `🧾 fact.` / `📎 contr.` para navegación cruzada.
- Removidos los links "Ver página completa" en las 4 tabs.
- Vista previa inline (modal) al hacer click en cualquier fila — presupuesto, factura, contrato, ingreso.
- Ordenamiento por columnas (numero, fecha, monto, estado, etc.) con indicador ▲▼ clicable.
- Columnas redundantes "Empresa" (logo chip) removidas ya que el filtro por empresa activa ya restringe.
- Botón "Volver" (`navigate(-1)`) en Ventas/Clientes/Facturas/Presupuestos/Contratos/Ingresos.

### Fase 3 — Lógica nueva de facturación + recibos + retención IVA
- **Colección `recibos`** con número consecutivo por `logo_tipo` (formato 000001, 000002, …).
- `PATCH /admin/facturas/{id}/pago-parcial` ahora:
  - Factura **contado** → exige monto = pendiente exacto; fecha de pago = fecha de la factura (bloqueada).
  - Factura **crédito** → acepta monto parcial; fecha de pago real editable.
  - Genera SIEMPRE un recibo (numero_recibo manual o autogenerado consecutivo).
  - Si el cliente tiene `aplica_retencion=true`, genera automáticamente un egreso en `ingresos_varios` con monto negativo, categoría "Retención IVA", en la fecha del pago.
- `GET /admin/recibos` listado de recibos (filtrable por factura_id y logo_tipo).
- `POST /admin/facturas/migrar-credito` (solo admin): detecta facturas viejas con `fecha_pago ≠ fecha` y las convierte a crédito generando recibos y egresos de retención automáticamente.
- **Balance** ajustado:
  - Pagos con `recibo_id` → ingreso por el **monto completo** (sin descontar retención en el ingreso).
  - Retenciones aparecen como egresos separados (desde `ingresos_varios` con monto < 0).
  - Pagos legacy (sin recibo_id) siguen descontando retención como antes → compatibilidad.
- FacturasPage:
  - Modal de pago total/parcial ahora pide número de recibo (opcional — autogenera si vacío).
  - Fecha bloqueada para contado, editable para crédito.
  - Toast muestra el nº de recibo emitido.
- IngresoVarioPage:
  - Monto negativo se muestra en rojo con badge "EGRESO".
  - Totales excluyen egresos (solo suma ingresos reales).

### Mejoras complementarias
- Permiso nuevo `presupuestos.modo_libre` y `facturas.modo_libre` (config.py).
- PresupuestosPage: si usuario no tiene `modo_libre` → modo inicial es "catálogo" y selector oculto.
- Campo `observacion_oculta` en items de presupuesto (solo visible en vista de costos, no en el presupuesto final que se imprime/envía).
- ContratosPage: campo "Descripción" removido (el "Nombre del servicio" cumple esa función); campo "Día de cobro" ya no estaba.
- FacturasPage form: `tipo` (emitida/recibida) ya hardcoded como "emitida".
- FacturasPage vinculación: XOR estricto entre presupuestos[] y contrato_id. Al elegir contrato se auto-completa concepto/monto/moneda/empresa_id. Filtrado por cliente activo.

## Pendiente (backlog)
### P1
- Migración one-time automática (al arrancar): detectar facturas viejas con `fecha_pago ≠ fecha` y correr `/migrar-credito` para el admin principal. Actualmente hay que llamarlo manualmente.
- Vista de lista dedicada de "Recibos emitidos" con link desde el menú.
- Link desde preview de factura al presupuesto/contrato vinculado (actualmente va a la página de lista).
- Ordenamiento por columnas en las páginas completas (Facturas/Presupuestos/Contratos), actualmente solo en Ventas.
- Búsqueda avanzada por monto y descripción en todas las páginas completas.

### P2
- Click en "factura vinculada" dentro de preview de presupuesto → abrir directamente esa factura.
- Permitir vincular presupuesto a un "ingreso sin factura" (hoy no hay link bidireccional).
- Obs oculta también en items de factura (actualmente solo presupuesto).

## Arquitectura crítica
- Cada colección con datos por empresa tiene campo `logo_tipo` ("arandu" | "jar" | "arandujar" | …).
- Frontend pasa `activeEmpresaPropia.slug` como `?logo_tipo=…` en cada llamada de listas.
- Backend con `apply_logo_filter()` valida acceso y restringe query al slug solicitado.
- Pagos de facturas se guardan en `factura.pagos[]` como array (soporta pagos parciales múltiples).
- Cada pago tiene su `recibo_id` y `recibo_numero` referenciando la colección `recibos`.
- Balance se calcula en base a `pagos[]` (cash-basis), en el mes de `pago.fecha`, no en el mes de emisión.
