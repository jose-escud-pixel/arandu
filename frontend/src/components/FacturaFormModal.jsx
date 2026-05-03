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
  cuentasDisp = [],  // cuentas bancarias disponibles
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
    fecha_pago: "",
    cuenta_id: "",
    cuenta_nombre: "",
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
      // Si la factura no tiene conceptos[] (legacy), reconstruimos uno desde concepto/monto
      const conceptosFromFac = (factura.conceptos && factura.conceptos.length > 0)
        ? factura.conceptos
        : [{
            descripcion: factura.concepto || "",
            cantidad: 1,
            precio_unitario: factura.monto || 0,
            subtotal: factura.monto || 0,
          }];
      // Si la factura ya tiene pagos[], heredamos cuenta del primero
      const primerPago = (factura.pagos || [])[0] || {};
      // Resolver empresa: prefiero la guardada en factura.empresa_id, sino la inferida del presupuesto
      const empIdFinal = factura.empresa_id || empresaId || "";
      const empData = empIdFinal ? empresas.find(e => String(e.id) === String(empIdFinal)) : null;
      setForm({
        logo_tipo:          factura.logo_tipo || "arandujar",
        tipo:               factura.tipo || "emitida",
        forma_pago:         factura.forma_pago || "contado",
        numero:             factura.numero || "",
        fecha:              factura.fecha ? factura.fecha.slice(0, 10) : "",
        fecha_vencimiento:  factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : "",
        fecha_pago:         factura.fecha_pago ? factura.fecha_pago.slice(0, 10) : "",
        cuenta_id:          factura.cuenta_id || primerPago.cuenta_id || "",
        cuenta_nombre:      factura.cuenta_nombre || primerPago.cuenta_nombre || "",
        razon_social:       factura.razon_social || "",
        ruc:                factura.ruc || "",
        empresa_id:         empIdFinal,
        empresa_nombre:     empData?.nombre || factura.empresa_nombre || "",
        concepto:           factura.concepto || "",
        conceptos:          conceptosFromFac,
        monto:              factura.monto ?? "",
        moneda:             factura.moneda || "PYG",
        tipo_cambio:        factura.tipo_cambio ?? "",
        estado:             factura.estado || "pendiente",
        notas:              factura.notas || "",
        presupuesto_ids:    factura.presupuesto_ids || (factura.presupuesto_id ? [factura.presupuesto_id] : []),
        _empresa_id:        empIdFinal,
        _razon_social_locked: !!empIdFinal,
      });
    }
  }, [isEdit, factura, presupuestosDisp]);

  // ── Helpers / handlers ─────────────────────────────────────────
  // Setter genérico para campos planos del form
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  // Format helper (₲ o USD según moneda actual)
  const fmtMonto = (n) => {
    const num = Number(n) || 0;
    if (form.moneda === "USD") {
      return `USD ${num.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `₲ ${Math.round(num).toLocaleString("es-PY")}`;
  };

  // Conceptos / ítems
  const addConcepto = () => {
    setForm(prev => ({ ...prev, conceptos: [...(prev.conceptos || []), defaultConcepto()] }));
  };
  const removeConcepto = (idx) => {
    setForm(prev => ({ ...prev, conceptos: prev.conceptos.filter((_, i) => i !== idx) }));
  };
  const handleConceptoChange = (idx, key, value) => {
    setForm(prev => {
      const conceptos = (prev.conceptos || []).map((c, i) => {
        if (i !== idx) return c;
        const nuevo = { ...c, [key]: value };
        // Recalcular subtotal si cambió cantidad o precio_unitario
        if (key === "cantidad" || key === "precio_unitario") {
          const cant = parseFloat(key === "cantidad" ? value : c.cantidad) || 0;
          const precio = parseFloat(key === "precio_unitario" ? value : c.precio_unitario) || 0;
          nuevo.subtotal = cant * precio;
        }
        return nuevo;
      });
      return { ...prev, conceptos };
    });
  };

  // Total derivado
  const totalMonto = useMemo(() => {
    return (form.conceptos || []).reduce((s, c) => s + (Number(c.subtotal) || 0), 0);
  }, [form.conceptos]);

  // Cliente / empresa
  const handleEmpresaChange = (empresaId) => {
    if (!empresaId) {
      setForm(prev => ({
        ...prev,
        _empresa_id: "",
        _razon_social_locked: false,
        razon_social: "",
        ruc: "",
        empresa_id: "",
        empresa_nombre: "",
      }));
      return;
    }
    const emp = empresas.find(e => String(e.id) === String(empresaId));
    setForm(prev => ({
      ...prev,
      _empresa_id: empresaId,
      _razon_social_locked: true,
      razon_social: emp?.razon_social || emp?.nombre || prev.razon_social,
      ruc: emp?.ruc || "",
      empresa_id: empresaId,
      empresa_nombre: emp?.nombre || emp?.razon_social || "",
      presupuesto_ids: [], // limpiar selección al cambiar de empresa
    }));
  };

  // Presupuestos vinculables (filtrados por empresa si hay)
  const presupuestosFiltrados = useMemo(() => {
    if (!presupuestosDisp) return [];
    let list = presupuestosDisp.filter(p => p.estado !== "anulado");
    if (form._empresa_id) {
      list = list.filter(p => String(p.empresa_id) === String(form._empresa_id));
    }
    return list;
  }, [presupuestosDisp, form._empresa_id]);

  const togglePresupuesto = (id) => {
    setForm(prev => {
      const yaEsta = prev.presupuesto_ids.includes(id);
      return {
        ...prev,
        presupuesto_ids: yaEsta
          ? prev.presupuesto_ids.filter(x => x !== id)
          : [...prev.presupuesto_ids, id],
      };
    });
  };

  // Submit
  const handleSave = async () => {
    if (!form.numero || !form.fecha || !form.razon_social) {
      toast.error("Número, fecha y razón social son obligatorios");
      return;
    }
    const conceptosValidos = (form.conceptos || []).filter(c =>
      c.descripcion && (parseFloat(c.cantidad) || 0) > 0 && (parseFloat(c.precio_unitario) || 0) > 0
    );
    if (conceptosValidos.length === 0) {
      toast.error("Agregá al menos un ítem con descripción, cantidad y precio");
      return;
    }
    if (form.moneda === "USD" && (!form.tipo_cambio || parseFloat(form.tipo_cambio) <= 0)) {
      toast.error("Falta el tipo de cambio para una factura en USD");
      return;
    }
    if (form.estado === "pagada" && !form.cuenta_id) {
      toast.error("Si la factura está pagada, indicá en qué cuenta entró la plata");
      return;
    }

    const conceptosOut = conceptosValidos.map(c => ({
      descripcion: c.descripcion,
      cantidad: parseFloat(c.cantidad) || 1,
      precio_unitario: parseFloat(c.precio_unitario) || 0,
      subtotal: (parseFloat(c.cantidad) || 1) * (parseFloat(c.precio_unitario) || 0),
    }));
    const montoTotal = conceptosOut.reduce((s, c) => s + c.subtotal, 0);
    const conceptoTexto = conceptosOut.length === 1
      ? conceptosOut[0].descripcion
      : `${conceptosOut.length} ítems`;

    const payload = {
      logo_tipo: form.logo_tipo || logoTipo,
      tipo: form.tipo || "emitida",
      numero: form.numero,
      fecha: form.fecha,
      forma_pago: form.forma_pago || "contado",
      razon_social: form.razon_social,
      ruc: form.ruc || null,
      empresa_id: form.empresa_id || form._empresa_id || null,
      empresa_nombre: form.empresa_nombre || null,
      concepto: conceptoTexto,
      conceptos: conceptosOut,
      monto: montoTotal,
      moneda: form.moneda || "PYG",
      tipo_cambio: form.tipo_cambio !== "" && form.tipo_cambio != null ? Number(form.tipo_cambio) : null,
      estado: form.estado || "pendiente",
      fecha_vencimiento: form.fecha_vencimiento || null,
      fecha_pago: form.estado === "pagada" ? (form.fecha_pago || form.fecha) : null,
      cuenta_id: form.estado === "pagada" ? (form.cuenta_id || null) : null,
      cuenta_nombre: form.estado === "pagada" ? (form.cuenta_nombre || null) : null,
      presupuesto_ids: form.presupuesto_ids || [],
      notas: form.notas || null,
    };

    try {
      setSaving(true);
      const url = isEdit
        ? `${API}/admin/facturas/${factura.id}`
        : `${API}/admin/facturas`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      toast.success(isEdit ? "Factura actualizada" : "Factura creada");
      if (onSaved) onSaved();
    } catch (e) {
      toast.error(e.message || "No se pudo guardar la factura");
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
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
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
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
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

          {/* Row 2.5: Datos de cobro — solo si estado=pagada */}
          {form.estado === "pagada" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                💰 Datos de cobro
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Cuenta donde entró la plata *</label>
                  <select
                    className={inputCls}
                    value={form.cuenta_id}
                    onChange={(e) => {
                      const c = (cuentasDisp || []).find(c => c.id === e.target.value);
                      setForm(prev => ({ ...prev, cuenta_id: e.target.value, cuenta_nombre: c?.nombre || "" }));
                    }}
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {(cuentasDisp || []).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda}){c.es_predeterminada ? " ★" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fecha de cobro</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.fecha_pago || form.fecha}
                    onChange={(e) => set("fecha_pago", e.target.value)}
                  />
                  <p className="text-[11px] text-emerald-700 mt-1">Si lo dejás vacío usamos la fecha de la factura.</p>
                </div>
              </div>
            </div>
          )}

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
                    {e.nombre || e.razon_social}
                    {e.razon_social && e.nombre && e.razon_social !== e.nombre ? ` (${e.razon_social})` : ""}
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
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
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
