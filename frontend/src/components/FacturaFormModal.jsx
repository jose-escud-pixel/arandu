import React, { useState, useEffect, useMemo } from "react";
import { X, Save, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

const FacturaFormModal = ({
  factura,           // null = nueva, objeto = editar
  onClose,
  onSaved,
  token,
  API,
  empresas,          // lista de clientes/empresas
  presupuestosDisp,  // todos los presupuestos disponibles
  activeEmpresaPropia,
  hasPermission,
}) => {
  const isEdit = !!factura;

  const defaultConcepto = () => ({ descripcion: "", cantidad: 1, precio_unitario: 0, subtotal: 0 });

  const logoTipo = activeEmpresaPropia?.slug || "arandujar";

  const getDefaultForm = () => ({
    numero: "",
    fecha: new Date().toISOString().slice(0, 10),
    forma_pago: "contado",
    razon_social: "",
    ruc: "",
    moneda: "PYG",
    tipo_cambio: "",
    estado: "pendiente",
    fecha_vencimiento: "",
    presupuesto_ids: [],
    notas: "",
    conceptos: [defaultConcepto()],
    // internal — no se envía al backend
    _empresa_id: "",
    _razon_social_locked: false, // true cuando viene de empresa seleccionada
  });

  const [form, setForm] = useState(getDefaultForm());
  const [saving, setSaving] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (isEdit && factura) {
      let empresaId = "";
      if (factura.presupuesto_ids?.length > 0) {
        const pres = presupuestosDisp.find(p => factura.presupuesto_ids.includes(p.id));
        if (pres) empresaId = String(pres.empresa_id || "");
      }
      setForm({
        logo_tipo:          factura.logo_tipo || "arandujar",
        tipo:               factura.tipo || "emitida",
        forma_pago:         factura.forma_pago || "contado",
        numero:             factura.numero || "",
        fecha:              factura.fecha ? factura.fecha.slice(0, 10) : "",
        fecha_vencimiento:  factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : "",
        razon_social:       factura.razon_social || "",
        ruc:                factura.ruc || "",
        concepto:           factura.concepto || "",
        conceptos:          factura.conceptos || [],
        monto:              factura.monto ?? "",
        moneda:             factura.moneda || "PYG",
        tipo_cambio:        factura.tipo_cambio ?? "",
        estado:             factura.estado || "pendiente",
        notas:              factura.notas || "",
        presupuesto_ids:    factura.presupuesto_ids || (factura.presupuesto_id ? [factura.presupuesto_id] : []),
        _empresa_id:        empresaId,
      });
    }
  }, [isEdit, factura, presupuestosDisp]);

  // ── Render ─────────────────────────────────────────────────────
  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white";
  const inputReadonlyCls =
    "w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-600 bg-gray-50 cursor-not-allowed";
  const labelCls = "text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-6 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEdit ? `Editar Factura ${factura.numero}` : "Nueva Factura"}
              </h2>
              <p className="text-xs text-gray-400">
                {isEdit ? "Modificar datos de la factura" : "Crear nueva factura"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Row 1: Número, Fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Número *</label>
              <input
                className={inputCls}
                value={form.numero}
                onChange={(e) => set("numero", e.target.value)}
                placeholder="001-001-0001234"
              />
            </div>
            <div>
              <label className={labelCls}>Fecha *</label>
              <input
                type="date"
                className={inputCls}
                value={form.fecha}
                onChange={(e) => set("fecha", e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Forma pago, Estado, Vencimiento */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Forma de Pago</label>
              <select
                className={inputCls}
                value={form.forma_pago}
                onChange={(e) => set("forma_pago", e.target.value)}
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select
                className={inputCls}
                value={form.estado}
                onChange={(e) => set("estado", e.target.value)}
              >
                <option value="pendiente">Pendiente</option>
                <option value="pagada">Pagada</option>
                <option value="anulada">Anulada</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha de Vencimiento</label>
              <input
                type="date"
                className={inputCls}
                value={form.fecha_vencimiento}
                onChange={(e) => set("fecha_vencimiento", e.target.value)}
              />
            </div>
          </div>

          {/* Row 3: Moneda, Tipo de Cambio */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Moneda</label>
              <select
                className={inputCls}
                value={form.moneda}
                onChange={(e) => set("moneda", e.target.value)}
              >
                <option value="PYG">Guaraníes (₲)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
            {form.moneda === "USD" && (
              <div>
                <label className={labelCls}>Tipo de Cambio (₲ por USD)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.tipo_cambio}
                  onChange={(e) => set("tipo_cambio", e.target.value)}
                  placeholder="7500"
                />
              </div>
            )}
          </div>

          {/* Separator: Datos del Cliente */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Datos del Cliente
            </p>

            {/* Empresa selector */}
            <div className="mb-4">
              <label className={labelCls}>Empresa / Cliente (para filtrar y autocompletar)</label>
              <select
                className={inputCls}
                value={form._empresa_id}
                onChange={(e) => handleEmpresaChange(e.target.value)}
              >
                <option value="">— Seleccionar empresa (opcional) —</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.razon_social || e.nombre}
                    {e.ruc ? ` · ${e.ruc}` : ""}
                  </option>
                ))}
              </select>
              {form._empresa_id && (
                <p className="text-xs text-blue-500 mt-1">
                  Datos de empresa cargados. Presupuestos filtrados.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Razón Social *
                  {form._razon_social_locked && (
                    <span className="ml-1 text-blue-400 normal-case font-normal">(de empresa seleccionada)</span>
                  )}
                </label>
                {form._razon_social_locked ? (
                  <div className={inputReadonlyCls}>
                    {form.razon_social}
                  </div>
                ) : (
                  <input
                    className={inputCls}
                    value={form.razon_social}
                    onChange={(e) => set("razon_social", e.target.value)}
                    placeholder="Empresa S.A."
                  />
                )}
              </div>
              <div>
                <label className={labelCls}>
                  RUC
                  {form._razon_social_locked && (
                    <span className="ml-1 text-blue-400 normal-case font-normal">(de empresa seleccionada)</span>
                  )}
                </label>
                {form._razon_social_locked ? (
                  <div className={inputReadonlyCls}>
                    {form.ruc || <span className="text-gray-300">Sin RUC</span>}
                  </div>
                ) : (
                  <input
                    className={inputCls}
                    value={form.ruc}
                    onChange={(e) => set("ruc", e.target.value)}
                    placeholder="80123456-7"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Conceptos */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Conceptos / Ítems
              </p>
              <button
                onClick={addConcepto}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar ítem
              </button>
            </div>

            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400 px-1">
                <div className="col-span-6">Descripción</div>
                <div className="col-span-2 text-center">Cant.</div>
                <div className="col-span-2 text-right">P. Unitario</div>
                <div className="col-span-1 text-right">Subtotal</div>
                <div className="col-span-1"></div>
              </div>

              {form.conceptos.map((c, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    <input
                      className={inputCls}
                      value={c.descripcion}
                      onChange={(e) => handleConceptoChange(idx, "descripcion", e.target.value)}
                      placeholder="Descripción del ítem"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      className={inputCls + " text-center"}
                      value={c.cantidad}
                      onChange={(e) => handleConceptoChange(idx, "cantidad", e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      className={inputCls + " text-right"}
                      value={c.precio_unitario}
                      onChange={(e) => handleConceptoChange(idx, "precio_unitario", e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="col-span-1 text-right text-xs font-mono text-gray-600 px-1">
                    {fmtMonto(c.subtotal)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {form.conceptos.length > 1 && (
                      <button
                        onClick={() => removeConcepto(idx)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <div className="bg-gray-50 rounded-xl px-4 py-2 text-right">
                  <p className="text-xs text-gray-400 mb-0.5">Total factura</p>
                  <p className="text-lg font-bold text-gray-800">{fmtMonto(totalMonto)}</p>
                  {form.moneda === "USD" && form.tipo_cambio && (
                    <p className="text-xs text-gray-400">
                      ≈ ₲ {Math.round(totalMonto * parseFloat(form.tipo_cambio)).toLocaleString("es-PY")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Vincular Presupuestos */}
          {presupuestosFiltrados.length > 0 && (
            <div className="border-t border-dashed border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Vincular Presupuestos
                {form._empresa_id && <span className="ml-1 text-blue-400 normal-case font-normal">(filtrado por empresa)</span>}
              </p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {presupuestosFiltrados.slice(0, 60).map((p) => {
                  const selected = form.presupuesto_ids.includes(p.id);
                  const monFmt = p.moneda === "USD"
                    ? `USD ${Number(p.total).toLocaleString("es-PY", { minimumFractionDigits: 2 })}`
                    : `₲ ${Math.round(p.total).toLocaleString("es-PY")}`;
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePresupuesto(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all text-left ${
                        selected
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                      }`}
                    >
                      <span className="font-mono font-semibold">#{p.numero}</span>
                      {p.nombre_archivo && (
                        <span className={selected ? "text-blue-200" : "text-gray-400"}> · {p.nombre_archivo.slice(0, 18)}</span>
                      )}
                      <br />
                      <span className={selected ? "text-blue-200 text-[11px]" : "text-gray-400 text-[11px]"}>{monFmt}</span>
                    </button>
                  );
                })}
              </div>
              {form.presupuesto_ids.length > 0 && (
                <p className="text-xs text-blue-500 mt-2">
                  {form.presupuesto_ids.length} presupuesto(s) vinculado(s)
                </p>
              )}
            </div>
          )}


          {/* Notas */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <label className={labelCls}>Notas / Observaciones</label>
            <textarea
              className={inputCls + " min-h-[70px] resize-none"}
              value={form.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Observaciones adicionales..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow transition-all"
          >
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : isEdit ? "Guardar Cambios" : "Crear Factura"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FacturaFormModal;
