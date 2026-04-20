# Arandu&JAR Informática – PRD vivo

## Contexto
Jose Escudero opera 3 empresas propias desde un único sistema:
- **Arandu** (tema claro-azul, color #2563eb)
- **JAR** (tema claro-rojo, color #dc2626)
- **AranduJAR** (tema oscuro-azul, color #1e3a8a)

Objetivo central: separación total por empresa — al cambiar empresa activa, TODO el contenido y tema cambian (solo en `/admin`).

## Stack
- Backend: FastAPI + Motor (MongoDB) en `/app/backend`
- Frontend: React 18 + CRACO + Tailwind en `/app/frontend`
- Auth: JWT bcrypt

## Usuarios de prueba
Ver `/app/memory/test_credentials.md`

## ─── Implementado ───

### Fase 1 — Separación estricta por empresa
- Helper `apply_logo_filter()` aplicado en todos los endpoints de lista.
- Auto-seed de empresas_propias con colores y temas correctos + migración.
- AuthContext con auto-selección para usuario con 1 empresa.
- `logo_tipo` pasado como query param en todas las llamadas de listas.

### Fase 2 — UX limpia en Ventas
- Filtro temporal 3-modos (Todos / Por mes / Por año).
- Click en badge de estado → dropdown para cambiar estado inline.
- Vista previa inline (modal) al click en cualquier fila.
- Ordenamiento por columnas con indicador ▲▼.
- Chips cliqueables para navegación cruzada factura↔presupuesto↔contrato.
- Botón "Volver" (`navigate(-1)`) en todas las páginas.
- Removidos los links "Ver página completa".

### Fase 3 — Lógica contado/crédito + recibos + retención IVA
- Colección `recibos` con número consecutivo por `logo_tipo`.
- `PATCH /admin/facturas/{id}/pago-parcial`: factura contado exige monto total con fecha = fecha factura; crédito acepta pagos parciales con fecha real.
- Recibo auto-generado (o manual) por cada pago.
- Egreso automático por retención IVA en `ingresos_varios` (cliente con aplica_retencion).
- `POST /admin/facturas/migrar-credito` (admin): convierte facturas viejas a crédito + recibos + retenciones.
- Balance: pagos con `recibo_id` → ingreso completo; retenciones = egresos separados.
- Cada pago se imputa al mes de su fecha real.

### Sesión actual — Bancos, tema scope y limpieza
1. **Tema scoped a /admin**: `applyTheme()` ahora solo aplica `data-tema` y color de fondo claro cuando estamos en `/admin/*`. La landing page `/` y `/login` mantienen el tema oscuro original. `ThemeWatcher` observa cambios de ruta.
2. **Módulo Bancos** (`/admin/bancos`):
   - Colección `cuentas_bancarias`: {id, nombre, banco, numero_cuenta, moneda, logo_tipo, saldo_inicial, saldo_inicial_fecha, es_predeterminada, activo, notas}.
   - CRUD completo: `GET/POST/PUT/DELETE /admin/cuentas-bancarias` con filtro estricto por logo_tipo.
   - `GET /admin/cuentas-bancarias/saldos`: calcula saldo_actual = saldo_inicial + Σ(pagos de factura) + Σ(ingresos_varios) − Σ(pagos_costos_fijos) − Σ(compras pagadas) − Σ(pagos_proveedores).
   - Al marcar "es_predeterminada=true" se desmarcan otras del mismo logo+moneda.
   - Frontend: lista agrupada con totales por moneda, CRUD en modal, marcador ⭐ para predeterminadas.
   - Selector de cuenta destino agregado en: modal de pago de factura (total y parcial) + form de ingresos varios. Si no se elige, el backend auto-asigna la predeterminada del logo_tipo+moneda.
   - `cuenta_id` almacenado en pagos[] de factura, recibo, e ingresos_varios.
3. **Contratos removido del menú principal** (ya está dentro de Ventas).
4. **Contraste textos en temas claros** (index.css):
   - `.text-white` → `#0f172a` (slate-900) en temas claros.
   - `.text-slate-200/300/400/500` → slate apropiado para fondo blanco.
   - Fondos oscuros locales (`.bg-arandu-dark`, `.bg-slate-8*`, `.bg-slate-9*`) preservan `.text-white` en blanco.

## Arquitectura crítica actualizada
- Cada colección con datos por empresa tiene campo `logo_tipo`.
- Frontend pasa `activeEmpresaPropia.slug` como `?logo_tipo=…`.
- Backend valida con `apply_logo_filter()`.
- Pagos de factura guardan `{monto, fecha, cuenta_id, recibo_id, recibo_numero}` en `factura.pagos[]`.
- Saldos de cuentas se calculan sumando movimientos con el mismo `cuenta_id`.
- Balance cash-basis en mes de `pago.fecha`.
- Tema CSS `data-tema` se aplica solo al estar en `/admin`.

### Sesión 2026-01-20 — Fix impresión de presupuestos ("Imprimir completo")
Problema reportado por Jose con imágenes: al imprimir un presupuesto con el botón "Imprimir completo",
el logo tricolor (letras bandera PY) aparecía ilegible en Safari (y mal integrado en Chrome), el
encabezado mostraba textos pequeños (dirección, teléfono, email) que molestaban, el pie de página
repetía condiciones en letra chica, y en presupuestos largos cortaba filas en la mitad de la página.

Cambios acotados a `frontend/src/pages/PresupuestosPage.jsx` (la función "Imprimir por partes" NO se tocó):
1. **`buildLogoPngDataUrl(logoTipo, brandName)`**: nuevo helper que dibuja el logo en un `<canvas>`
   (ícono con gradiente por marca + letras tricolor recortadas por clip rectangular por franja +
   contorno sutil para contraste + subtítulo "INFORMÁTICA"). Devuelve un data URL PNG @ scale 3x.
   Esto reemplaza los `<clipPath>` SVG que Safari/Chrome renderizan inconsistentemente al imprimir.
   Incluye fallback automático para empresas nuevas (usa `brandName` cuando el slug no está en configs).
2. **`buildHeaderHTMLClean(...)`**: nuevo encabezado sin dirección/teléfono/email; solo logo + badge
   PRESUPUESTO con número/fecha/validez. Respeta el color de acento de cada marca (JAR=rojo, demás=azul).
3. **`handlePrintCompleto`** actualizado para usar `buildHeaderHTMLClean`, remover la sección
   "Condiciones" del pie, y agregar reglas CSS que evitan cortes: `page-break-inside:avoid` por fila,
   `thead { display: table-header-group }` para repetir la cabecera en cada página, y contenedores
   `.no-break` para los bloques Cliente / totales / Observaciones.
4. Verificado visualmente: las 3 marcas (JAR, Arandu, Arandu&JAR) y el caso fallback renderizan el
   logo tricolor nítido sobre fondo oscuro rojo/azul. Presupuestos de 25+ ítems fluyen sin cortar filas.

## Pendiente (backlog P1)
- Vínculo de `cuenta_id` también en pagos de costos fijos, compras, sueldos (backend soporta, falta UI).
- Vista de lista dedicada "Recibos emitidos" con link desde el menú.
- Recibos imprimibles/exportables a PDF con datos fiscales.
- Transferencias entre cuentas bancarias (movimiento interno sin afectar balance).
- Conversión USD→PYG automática al mostrar saldos consolidados.
- Click en link desde preview de factura → abrir directo el presupuesto/contrato vinculado.
- Ordenamiento por columnas también en páginas completas (Facturas, Presupuestos, Contratos).
- Búsqueda avanzada por monto/descripción en páginas completas.
