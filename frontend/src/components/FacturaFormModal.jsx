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
  contratosDisp,     // todos los contratos disponibles
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
    contrato_id: "",
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
      // Try to find empresa_id from the linked presupuesto
      let empresaId = "";
      if (factura.presupuesto_ids?.length > 0) {
        const pres = presupuestosDisp.find(p => factura.presupuesto_ids.includes(p.id));
        if (pres) empresaId = String(pres.empresa_id || "");
      } else if (factura.contrato_id) {
        const cont = contratosDisp.find(c => c.id === factura.contrato_id);
        if (cont) empresaId = String(cont.empresa_id || "");
      }
      if (!empresaId && factura.razon_social) {
        const emp = empresas.find(e =>
          (e.razon_social || e.nombre) === factura.razon_social
        );
        if (emp) empresaId = String(emp.id || "");
      }

      // Conceptos: intentar reconstruir desde concepto string si no hay array
      let conceptos = [defaultConcepto()];
      if (factura.conceptos?.length > 0) {
        conceptos = factura.conceptos.map(c => ({
          descripcion: c.descripcion || "",
          cantidad: c.cantidad || 1,
          precio_unitario: c.precio_unitario || 0,
          subtotal: c.subtotal || c.monto || (c.cantidad * c.precio_unitario) || 0,
        }));
      } else if (factura.concepto) {
        conceptos = [{
          descripcion: factura.concepto,
          cantidad: 1,
          precio_unitario: factura.monto || 0,
          subtotal: factura.monto || 0,
        }];
      }

      setForm({
        numero: factura.numero || "",
        fecha: factura.fecha ? factura.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10),
        forma_pago: factura.forma_pago || "contado",
        razon_social: factura.razon_social || "",
        ruc: factura.ruc || "",
        moneda: factura.moneda || "PYG",
        tipo_cambio: factura.tipo_cambio || "",
        estado: factura.estado || "pendiente",
        fecha_vencimiento: factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : "",
        presupuesto_ids: factura.presupuesto_ids?.length > 0
          ? factura.presupuesto_ids
          : (factura.presupuesto_id ? [factura.presupuesto_id] : []),
        contrato_id: factura.contrato_id || "",
        notas: factura.notas || "",
        conceptos,
        _empresa_id: empresaId,
        _razon_social_locked: !!empresaId,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  // Escape key closes
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  // ── Client filter ──────────────────────────────────────────────
  const presupuestosFiltrados = useMemo(() => {
    if (!form._empresa_id) return presupuestosDisp;
    return presupuestosDisp.filter(
      (p) => String(p.empresa_id) === String(form._empresa_id) || !p.empresa_id
    );
  }, [presupuestosDisp, form._empresa_id]);

  const contratosFiltrados = useMemo(() => {
    if (!form._empresa_id) return contratosDisp;
    return contratosDisp.filter(
      (c) => String(c.empresa_id) === String(form._empresa_id) || !c.empresa_id
    );
  }, [contratosDisp, form._empresa_id]);

  // ── Helpers ────────────────────────────────────────────────────
  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const handleEmpresaChange = (empresaId) => {
    if (!empresaId) {
      // Deseleccionar — liberar razon_social y ruc para edición manual
      setForm(f => ({
        ...f,
        _empresa_id: "",
        _razon_social_locked: false,
        presupuesto_ids: [],
        contrato_id: "",
      }));
      return;
    }
    const emp = empresas.find((e) => String(e.id) === String(empresaId));
    setForm((f) => ({
      ...f,
      _empresa_id: empresaId,
      _razon_social_locked: true,
      razon_social: emp ? (emp.razon_social || emp.nombre || f.razon_social) : f.razon_social,
      ruc: emp ? (emp.ruc || f.ruc) : f.ruc,
      presupuesto_ids: [],
      contrato_id: "",
    }));
  };

  const handleConceptoChange = (idx, field, val) => {
    setForm((f) => {
      const conceptos = f.conceptos.map((c, i) => {
        if (i !== idx) return c;
        const updated = { ...c, [field]: val };
        if (field === "cantidad" || field === "precio_unitario") {
          const qty = field === "cantidad" ? parseFloat(val) || 0 : parseFloat(updated.cantidad) || 0;
          const price = field === "precio_unitario" ? parseFloat(val) || 0 : parseFloat(updated.precio_unitario) || 0;
          updated.subtotal = qty * price;
        }
        return updated;
      });
      return { ...f, conceptos };
    });
  };

  const addConcepto = () =>
    setForm((f) => ({ ...f, conceptos: [...f.conceptos, defaultConcepto()] }));

  const removeConcepto = (idx) =>
    setForm((f) => ({ ...f, conceptos: f.conceptos.filter((_, i) => i !== idx) }));

  const togglePresupuesto = (id) => {
    setForm((f) => {
      const ids = f.presupuesto_ids.includes(id)
        ? f.presupuesto_ids.filter((x) => x !== id)
        : [...f.presupuesto_ids, id];
      return { ...f, presupuesto_ids: ids, contrato_id: ids.length > 0 ? "" : f.contrato_id };
    });
  };

  const totalMonto = form.conceptos.reduce((s, c) => s + (parseFloat(c.subtotal) || 0), 0);

  const fmtMonto = (n, moneda = form.moneda) => {
    if (!n && n !== 0) return "-";
    if (moneda === "USD") return `USD ${Number(n).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
  };

  // ── Save ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.razon_social.trim()) {
      toast.error("La razón social es requerida");
      return;
    }
    if (!form.numero.trim()) {
      toast.error("El número de factura es requerido");
      return;
    }
    if (form.conceptos.length === 0 || !form.conceptos[0].descripcion.trim()) {
      toast.error("Debe agregar al menos un concepto con descripción");
      return;
    }

    setSaving(true);
    try {
      // Build payload
      const { _empresa_id, _razon_social_locked, conceptos, ...rest } = form;

      // concepto (string requerido por el backend) y monto total
      const concepto = conceptos.map(c => c.descripcion).filter(Boolean).join("; ") || "Servicio";
      const monto = totalMonto;

      const payload = {
        ...rest,
        logo_tipo: logoTipo,
        tipo: "emitida",
        concepto,
        monto,
        presupuesto_ids: form.presupuesto_ids,
        presupuesto_id: form.presupuesto_ids.length === 1 ? form.presupuesto_ids[0] : null,
      };

      // Clean optional fields
      if (!payload.contrato_id) delete payload.contrato_id;
      if (!payload.tipo_cambio) delete payload.tipo_cambio;
      if (!payload.fecha_vencimiento) delete payload.fecha_vencimiento;
      if (!payload.notas) delete payload.notas;
      if (!payload.ruc) delete payload.ruc;

      const url = isEdit
        ? `${API}/admin/facturas/${factura.id}`
        : `${API}/admin/facturas`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || "Error al guardar");
      }

      toast.success(isEdit ? "Factura actualizada" : "Factura creada");
      onSaved();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

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
                  Datos de empresa cargados. Presupuestos y contratos filtrados.
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

          {/* Vincular Contrato (XOR con presupuestos) */}
          {contratosFiltrados.length > 0 && form.presupuesto_ids.length === 0 && (
            <div className="border-t border-dashed border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Vincular Contrato
                {form._empresa_id && <span className="ml-1 text-blue-400 normal-case font-normal">(filtrado por empresa)</span>}
              </p>
              <select
                className={inputCls}
                value={form.contrato_id}
                onChange={(e) => set("contrato_id", e.target.value)}
              >
                <option value="">— Sin contrato —</option>
                {contratosFiltrados.map((c) => {
                  const monto = c.monto_mensual || c.monto || 0;
                  const monFmt = c.moneda === "USD"
                    ? `USD ${Number(monto).toLocaleString("es-PY", { minimumFractionDigits: 2 })}`
                    : `₲ ${Math.round(monto).toLocaleString("es-PY")}`;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.numero || `#${c.id.slice(-6)}`}
                      {c.descripcion ? ` · ${c.descripcion.slice(0, 30)}` : ""}
                      {monto ? ` · ${monFmt}` : ""}
                    </option>
                  );
                })}
              </select>
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
