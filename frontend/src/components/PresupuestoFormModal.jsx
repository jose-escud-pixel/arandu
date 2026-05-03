import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Calculator, X, Plus, Trash2, Save
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

const PresupuestoFormModal = ({
  presupuesto,
  mode, // "edit", "copy", "new"
  onClose,
  onSaved,
  token,
  API,
  empresas,
  proveedores,
  productos,
  activeEmpresaPropia,
  isAdmin,
  hasPermission
}) => {
  const canModoLibre = isAdmin || hasPermission("presupuestos.modo_libre");
  const defaultModo = canModoLibre ? "libre" : "productos";

  const getDefaultLogo = () => {
    if (!activeEmpresaPropia) return "arandujar";
    return activeEmpresaPropia.slug || "arandujar";
  };

  const getDefaultFormData = () => ({
    empresa_id: "",
    numero: "",
    nombre_archivo: "",
    logo_tipo: getDefaultLogo(),
    moneda: "PYG",
    forma_pago: "contado",
    fecha: new Date().toISOString().split('T')[0],
    validez_dias: 15,
    tipo_cambio: "",
    modo: defaultModo,
    items: [{
      descripcion: "", observacion: "", observacion_oculta: "",
      cantidad: 1, costo: 0, margen: 30, precio_unitario: 0, subtotal: 0,
      moneda_item: "", tipo_cambio_item: "", proveedor_id: "", proveedor_nombre: "",
      producto_id: "", imagen: null, imagen_comentario: ""
    }],
    observaciones: "",
    condiciones: "- Precios expresados en Guaraníes (IVA incluido).\n- Validez de la oferta: 15 días.\n- Forma de pago: Al contado.\n- Tiempo de entrega: A confirmar según stock."
  });

  const [formData, setFormData] = useState(getDefaultFormData());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "new") {
      setFormData(getDefaultFormData());
      setEditingId(null);
    } else if (mode === "edit" && presupuesto) {
      const moneda = presupuesto.moneda || "PYG";
      const validez = presupuesto.validez_dias || 15;
      const formaPago = presupuesto.forma_pago || "contado";
      setEditingId(presupuesto.id);
      setFormData({
        empresa_id: presupuesto.empresa_id,
        numero: presupuesto.numero || "",
        nombre_archivo: presupuesto.nombre_archivo || "",
        logo_tipo: presupuesto.logo_tipo || "arandujar",
        moneda: moneda,
        forma_pago: formaPago,
        fecha: presupuesto.fecha,
        validez_dias: validez,
        tipo_cambio: presupuesto.tipo_cambio || "",
        modo: presupuesto.modo || "libre",
        items: presupuesto.items.map(item => ({
          ...item, moneda_item: item.moneda_item || "", tipo_cambio_item: item.tipo_cambio_item || "",
          proveedor_id: item.proveedor_id || "", proveedor_nombre: item.proveedor_nombre || "",
          producto_id: item.producto_id || "", imagen: item.imagen || null,
          imagen_comentario: item.imagen_comentario || ""
        })),
        observaciones: presupuesto.observaciones || "",
        condiciones: buildCondiciones(moneda, validez, formaPago)
      });
    } else if (mode === "copy" && presupuesto) {
      const moneda = presupuesto.moneda || "PYG";
      const validez = presupuesto.validez_dias || 15;
      const formaPago = presupuesto.forma_pago || "contado";
      setEditingId(null);
      setFormData({
        empresa_id: presupuesto.empresa_id,
        numero: "",
        nombre_archivo: presupuesto.nombre_archivo || "",
        logo_tipo: presupuesto.logo_tipo || "arandujar",
        moneda: moneda,
        forma_pago: formaPago,
        fecha: new Date().toISOString().split('T')[0],
        validez_dias: validez,
        tipo_cambio: presupuesto.tipo_cambio || "",
        modo: presupuesto.modo || "libre",
        items: presupuesto.items.map(item => ({
          ...item, moneda_item: item.moneda_item || "", tipo_cambio_item: item.tipo_cambio_item || "",
          proveedor_id: item.proveedor_id || "", proveedor_nombre: item.proveedor_nombre || "",
          producto_id: item.producto_id || "", imagen: item.imagen || null,
          imagen_comentario: item.imagen_comentario || ""
        })),
        observaciones: presupuesto.observaciones || "",
        condiciones: buildCondiciones(moneda, validez, formaPago)
      });
    }
  }, [presupuesto, mode]); // eslint-disable-line

  const buildCondiciones = (moneda, validezDias = 15, formaPago = "contado") => {
    const monedaText = moneda === "USD" ? "Dólares Americanos" : "Guaraníes";
    const pagoText = formaPago === "credito" ? "A crédito" : "Al contado";
    return `- Precios expresados en ${monedaText} (IVA incluido).\n- Validez de la oferta: ${validezDias} días.\n- Forma de pago: ${pagoText}.\n- Tiempo de entrega: A confirmar según stock.`;
  };

  const updateMoneda = (newMoneda) => {
    setFormData(prev => ({
      ...prev,
      moneda: newMoneda,
      items: prev.items.map(item => calculateItemFn(item, newMoneda, prev.tipo_cambio)),
      condiciones: buildCondiciones(newMoneda, prev.validez_dias, prev.forma_pago)
    }));
  };

  const updateTipoCambio = (newTC) => {
    setFormData(prev => ({
      ...prev,
      tipo_cambio: newTC,
      items: prev.items.map(item => calculateItemFn(item, prev.moneda, newTC))
    }));
  };

  const updateFormaPago = (newFormaPago) => {
    setFormData(prev => ({
      ...prev,
      forma_pago: newFormaPago,
      condiciones: buildCondiciones(prev.moneda, prev.validez_dias, newFormaPago)
    }));
  };

  const roundByMoneda = (value, moneda) => {
    const m = moneda || formData.moneda;
    if (m === "USD") return Math.round(value * 100) / 100;
    return Math.round(value);
  };

  const calculateItemFn = (item, docMoneda, globalTC) => {
    const costo = parseFloat(item.costo) || 0;
    const margen = parseFloat(item.margen) || 0;
    const cantidad = parseFloat(item.cantidad) || 0;
    const monedaItem = item.moneda_item || docMoneda;

    let costoConvertido = costo;
    if (monedaItem !== docMoneda) {
      const tc = parseFloat(item.tipo_cambio_item) || parseFloat(globalTC) || 1;
      if (docMoneda === "PYG" && monedaItem === "USD") {
        costoConvertido = costo * tc;
      } else if (docMoneda === "USD" && monedaItem === "PYG") {
        costoConvertido = tc > 0 ? costo / tc : 0;
      }
    }

    const round = (v) => roundByMoneda(v, docMoneda);
    const precio_unitario = round(costoConvertido * (1 + margen / 100));
    const subtotal = round(precio_unitario * cantidad);
    return { ...item, precio_unitario, subtotal };
  };

  const calculateItem = (item) => calculateItemFn(item, formData.moneda, formData.tipo_cambio);

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    if (field === "margen" || field === "costo" || field === "cantidad") {
      // Permitir string vacío temporalmente para que el usuario pueda borrar y escribir sin trabas
      newItems[index] = { ...newItems[index], [field]: value };
    } else if (field === "proveedor_id") {
      const prov = proveedores.find(p => p.id === value);
      newItems[index] = { ...newItems[index], proveedor_id: value, proveedor_nombre: prov ? prov.nombre : "" };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    newItems[index] = calculateItem(newItems[index]);
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        descripcion: "", observacion: "", observacion_oculta: "",
        cantidad: 1, costo: 0, margen: 30, precio_unitario: 0, subtotal: 0,
        moneda_item: "", tipo_cambio_item: "", proveedor_id: "", proveedor_nombre: "",
        producto_id: "", imagen: null, imagen_comentario: ""
      }]
    });
  };

  const selectProductoForItem = (index, productoId) => {
    const prod = productos.find(p => p.id === productoId);
    if (!prod) {
      updateItem(index, "producto_id", "");
      return;
    }
    const newItems = [...formData.items];
    const costo = prod.precio_costo || 0;
    const margen = newItems[index].margen || 30;
    const calculated = calculateItemFn({ ...newItems[index], descripcion: prod.nombre, costo, margen, producto_id: productoId }, formData.moneda, formData.tipo_cambio);
    newItems[index] = { ...calculated, descripcion: prod.nombre, costo, margen, producto_id: productoId };
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const calculateTotals = () => {
    const total = formData.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const isUSD = formData.moneda === "USD";
    const iva = isUSD ? Math.round((total / 11) * 100) / 100 : Math.round(total / 11);
    const subtotal = isUSD ? Math.round((total - iva) * 100) / 100 : total - iva;
    return { subtotal, iva, total };
  };

  const formatNumber = (num, moneda = "PYG") => {
    if (moneda === "USD") {
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    }
    return new Intl.NumberFormat('es-PY').format(num);
  };

  const getCurrencySymbol = (moneda) => {
    return moneda === "USD" ? "US$" : "₲";
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleItemImageUpload = async (index, file) => {
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const newItems = [...formData.items];
      newItems[index] = { ...newItems[index], imagen: base64 };
      setFormData({ ...formData, items: newItems });
    } catch (e) { console.error("Error al cargar imagen", e); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.empresa_id) {
      toast.error("Seleccione una empresa");
      return;
    }

    const totals = calculateTotals();
    setSaving(true);

    try {
      const url = editingId
        ? `${API}/admin/presupuestos/${editingId}`
        : `${API}/admin/presupuestos`;

      const toFloat = v => (v === "" || v === null || v === undefined) ? null : parseFloat(v) || null;
      const payload = {
        ...formData,
        ...totals,
        tipo_cambio: toFloat(formData.tipo_cambio),
        numero: formData.numero || null,
        items: formData.items.map(item => ({
          ...item,
          moneda_item: item.moneda_item || null,
          tipo_cambio_item: toFloat(item.tipo_cambio_item),
          proveedor_id: item.proveedor_id || null,
          proveedor_nombre: item.proveedor_nombre || null
        }))
      };

      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const savedPresupuesto = await response.json();
        toast.success(editingId ? "Presupuesto actualizado" : "Presupuesto creado");
        onSaved(savedPresupuesto);
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar el presupuesto");
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-arandu-dark-light border border-white/10 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-xl font-bold text-white flex items-center gap-2">
            <Calculator className="w-6 h-6 text-arandu-blue" />
            {editingId ? "Editar Presupuesto" : "Nuevo Presupuesto"}
          </h2>
          <button onMouseDown={(e) => e.target === e.currentTarget && onClose()} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Empresa & Logo Selection */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Empresa *</label>
              <select
                value={formData.empresa_id}
                onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                className="w-full bg-arandu-dark border border-white/10 text-white rounded-md px-4 py-3"
                required
              >
                <option value="">Seleccionar empresa...</option>
                {empresas
                  .filter(emp => !formData.logo_tipo || !emp.logo_tipo || emp.logo_tipo === formData.logo_tipo)
                  .map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Fecha del Presupuesto</label>
              <Input
                type="date"
                value={formData.fecha}
                onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                className="bg-arandu-dark border-white/10 text-white"
              />
            </div>
          </div>

          {/* Número de Presupuesto */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Número de Presupuesto
              <span className="ml-2 text-slate-500 text-xs">(dejar en blanco para asignar automáticamente)</span>
            </label>
            <Input
              type="text"
              value={formData.numero}
              onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
              placeholder={editingId ? formData.numero || "Ej: P2025-0042" : "Ej: P2025-0042"}
              className="bg-arandu-dark border-white/10 text-white placeholder:text-slate-600"
            />
          </div>

          {/* Nombre del archivo */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Nombre del presupuesto
              <span className="ml-2 text-slate-500 text-xs">(descripción corta para identificarlo fácilmente)</span>
            </label>
            <Input
              type="text"
              value={formData.nombre_archivo}
              onChange={(e) => setFormData({ ...formData, nombre_archivo: e.target.value })}
              placeholder="Ej: Renovación servidores, Soporte anual cliente..."
              className="bg-arandu-dark border-white/10 text-white placeholder:text-slate-600"
            />
          </div>

          {/* Empresa activa */}
          {activeEmpresaPropia && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-white/10 bg-white/3">
              {activeEmpresaPropia.logo_url ? (
                <img src={activeEmpresaPropia.logo_url} alt={activeEmpresaPropia.nombre} className="h-6 object-contain" />
              ) : (
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: activeEmpresaPropia.color || "#3b82f6" }} />
              )}
              <span className="text-white text-sm font-medium">{activeEmpresaPropia.nombre}</span>
              <span className="text-slate-500 text-xs ml-auto">Empresa activa</span>
            </div>
          )}

          {/* Moneda Selection */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">Moneda</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateMoneda("PYG")}
                className={`flex-1 p-3 rounded-lg border transition-all ${
                  formData.moneda === "PYG"
                    ? 'border-green-500 bg-green-500/20'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <span className={`text-sm font-medium ${formData.moneda === "PYG" ? 'text-green-400' : 'text-slate-400'}`}>
                  ₲ Guaraníes
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateMoneda("USD")}
                className={`flex-1 p-3 rounded-lg border transition-all ${
                  formData.moneda === "USD"
                    ? 'border-green-500 bg-green-500/20'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <span className={`text-sm font-medium ${formData.moneda === "USD" ? 'text-green-400' : 'text-slate-400'}`}>
                  US$ Dólares
                </span>
              </button>
            </div>
          </div>

          {/* Tipo de Cambio Global */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Tipo de cambio
              <span className="ml-2 text-slate-500 text-xs">
                {formData.moneda === "PYG" ? "USD 1 = ₲ ?" : "₲ ? = USD 1"} — usado cuando un ítem tiene moneda diferente al documento
              </span>
            </label>
            <Input
              type="number"
              value={formData.tipo_cambio}
              onChange={(e) => updateTipoCambio(e.target.value)}
              placeholder={formData.moneda === "PYG" ? "Ej: 7800" : "Ej: 7800"}
              className="bg-arandu-dark border-white/10 text-white"
            />
          </div>

          {/* Forma de Pago */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">Forma de Pago</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateFormaPago("contado")}
                className={`flex-1 p-3 rounded-lg border transition-all ${
                  formData.forma_pago === "contado"
                    ? 'border-arandu-blue bg-arandu-blue/20'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <span className={`text-sm font-medium ${formData.forma_pago === "contado" ? 'text-arandu-blue' : 'text-slate-400'}`}>
                  💵 Al contado
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateFormaPago("credito")}
                className={`flex-1 p-3 rounded-lg border transition-all ${
                  formData.forma_pago === "credito"
                    ? 'border-arandu-blue bg-arandu-blue/20'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <span className={`text-sm font-medium ${formData.forma_pago === "credito" ? 'text-arandu-blue' : 'text-slate-400'}`}>
                  💳 A crédito
                </span>
              </button>
            </div>
          </div>

          {/* Mode Toggle */}
          {(isAdmin || hasPermission("presupuestos.modo_libre")) ? (
            <div className="flex items-center gap-3 mb-1">
              <span className="text-slate-400 text-sm">Modo de carga:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, modo: "libre" }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    formData.modo !== "productos"
                      ? 'border-arandu-blue bg-arandu-blue/20 text-arandu-blue'
                      : 'border-white/10 text-slate-400 hover:border-white/30'
                  }`}
                >
                  ✏️ Libre
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, modo: "productos" }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    formData.modo === "productos"
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                      : 'border-white/10 text-slate-400 hover:border-white/30'
                  }`}
                >
                  📦 Por catálogo
                </button>
              </div>
            </div>
          ) : null}

          {/* Items Table */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">Productos / Servicios</label>
            <div className="bg-arandu-dark rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-3 text-slate-400 font-medium">Descripción</th>
                    <th className="text-center p-3 text-slate-400 font-medium w-20">Cant.</th>
                    <th className="text-right p-3 text-slate-400 font-medium w-36">
                      Costo
                      <span className="block text-xs text-slate-400 font-normal">moneda</span>
                    </th>
                    <th className="text-center p-3 text-slate-400 font-medium w-20">% Gan.</th>
                    <th className="text-right p-3 text-slate-400 font-medium w-32">
                      Precio Unit.
                      <span className="block text-xs text-slate-400 font-normal">{formData.moneda === "PYG" ? "₲" : "USD"}</span>
                    </th>
                    <th className="text-right p-3 text-slate-400 font-medium w-32">
                      Subtotal
                      <span className="block text-xs text-slate-400 font-normal">{formData.moneda === "PYG" ? "₲" : "USD"}</span>
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => (
                    <tr key={index} className="border-b border-white/5">
                      <td className="p-2">
                        {formData.modo === "productos" && (
                          <select
                            value={item.producto_id || ""}
                            onChange={e => selectProductoForItem(index, e.target.value)}
                            className="w-full mb-1 bg-arandu-panel border border-white/10 rounded text-sm text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">— Seleccionar del catálogo —</option>
                            {productos.filter(p => p.activo !== false).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}{p.sku ? ` (${p.sku})` : ""} — stock: {p.stock_actual ?? 0}
                              </option>
                            ))}
                          </select>
                        )}
                        <Input
                          type="text"
                          value={item.descripcion}
                          onChange={(e) => updateItem(index, "descripcion", e.target.value)}
                          className="bg-transparent border-white/10 text-white text-sm mb-1"
                          placeholder="Descripción del producto..."
                        />
                        <Input
                          type="text"
                          value={item.observacion || ""}
                          onChange={(e) => updateItem(index, "observacion", e.target.value)}
                          className="bg-transparent border-white/5 text-yellow-400/80 text-xs italic"
                          placeholder="Obs: destino, ubicación..."
                        />
                        <Input
                          type="text"
                          value={item.observacion_oculta || ""}
                          onChange={(e) => updateItem(index, "observacion_oculta", e.target.value)}
                          className="bg-transparent border-dashed border-white/5 text-orange-300/80 text-xs italic mt-1"
                          placeholder="🔒 Obs interna (solo visible en costos)"
                          title="Esta nota solo se ve en la vista de costos, no aparece en el presupuesto final"
                        />
                        {proveedores.filter(p => !p.logo_tipo || p.logo_tipo === formData.logo_tipo).length > 0 && (
                          <select
                            value={item.proveedor_id || ""}
                            onChange={e => updateItem(index, "proveedor_id", e.target.value)}
                            className="mt-1 w-full bg-transparent border-0 border-b border-white/10 text-slate-500 text-xs font-body focus:outline-none focus:border-arandu-blue hover:text-slate-300 transition-colors"
                          >
                            <option value="">— Proveedor (opcional) —</option>
                            {proveedores
                              .filter(p => !p.logo_tipo || p.logo_tipo === formData.logo_tipo)
                              .map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                              ))}
                          </select>
                        )}
                        {/* Imagen del ítem */}
                        <div className="mt-2">
                          {item.imagen ? (
                            <div className="border border-white/10 rounded-lg overflow-hidden">
                              <img src={item.imagen} alt="" className="w-full max-h-24 object-contain bg-black/20" />
                              <div className="flex gap-1 p-1">
                                <input
                                  type="text"
                                  value={item.imagen_comentario || ""}
                                  onChange={e => updateItem(index, "imagen_comentario", e.target.value)}
                                  className="flex-1 bg-transparent text-yellow-300/80 text-xs px-1 py-0.5 border-0 border-b border-white/10 focus:outline-none placeholder-slate-600"
                                  placeholder="Comentario de imagen..."
                                />
                                <button
                                  type="button"
                                  onClick={() => { updateItem(index, "imagen", null); updateItem(index, "imagen_comentario", ""); }}
                                  className="text-red-400 hover:text-red-300 text-xs px-1"
                                  title="Quitar imagen"
                                >✕</button>
                              </div>
                            </div>
                          ) : (
                            <label className="cursor-pointer flex items-center gap-1 text-slate-600 hover:text-slate-400 text-xs transition-colors">
                              <span>📷</span>
                              <span>Agregar imagen</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleItemImageUpload(index, e.target.files[0])}
                              />
                            </label>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) => updateItem(index, "cantidad", e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="bg-transparent border-white/10 text-white text-sm text-center"
                          min="1"
                        />
                      </td>
                      <td className="p-2">
                        {/* Selector de moneda del ítem */}
                        <div className="flex gap-1 mb-1 justify-end">
                          {["PYG", "USD"].map(m => {
                            const isActive = (item.moneda_item || formData.moneda) === m;
                            const isDocMoneda = m === formData.moneda;
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => updateItem(index, "moneda_item", isDocMoneda ? "" : m)}
                                className={`px-1.5 py-0.5 rounded text-xs font-semibold transition-all border ${
                                  isActive
                                    ? m === "PYG"
                                      ? "bg-green-500/25 text-green-300 border-green-500/50"
                                      : "bg-blue-500/25 text-blue-300 border-blue-500/50"
                                    : "bg-white/5 text-slate-500 border-white/10 hover:border-white/30"
                                }`}
                              >
                                {m === "PYG" ? "₲" : "$"}
                              </button>
                            );
                          })}
                        </div>
                        <Input
                          type="number"
                          value={item.costo}
                          onChange={(e) => updateItem(index, "costo", e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="bg-transparent border-white/10 text-white text-sm text-right"
                          placeholder="0"
                        />
                        {/* Override de TC por ítem, solo si la moneda difiere */}
                        {(item.moneda_item && item.moneda_item !== formData.moneda) && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-slate-500 whitespace-nowrap">TC:</span>
                            <Input
                              type="number"
                              value={item.tipo_cambio_item || ""}
                              onChange={(e) => updateItem(index, "tipo_cambio_item", e.target.value)}
                              className="bg-transparent border-white/5 text-slate-400 text-xs text-right"
                              placeholder={formData.tipo_cambio ? String(formData.tipo_cambio) : "global"}
                            />
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.margen}
                          onChange={(e) => updateItem(index, "margen", e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="bg-transparent border-white/10 text-arandu-blue text-sm text-center font-medium"
                          placeholder="30"
                        />
                      </td>
                      <td className="p-2 text-right text-slate-300">
                        {formatNumber(item.precio_unitario, formData.moneda)} {getCurrencySymbol(formData.moneda)}
                      </td>
                      <td className="p-2 text-right text-white font-medium">
                        {formatNumber(item.subtotal, formData.moneda)} {getCurrencySymbol(formData.moneda)}
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                          title="Eliminar item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add Item Button */}
              <div className="border-t border-white/10 p-3">
                <Button
                  type="button"
                  onClick={addItem}
                  variant="ghost"
                  className="text-arandu-blue hover:bg-arandu-blue/10"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Item
                </Button>
              </div>

              {/* Totals */}
              <div className="mt-4 flex justify-end p-3">
                <div className="bg-arandu-dark rounded-lg p-4 w-72">
                  <div className="flex justify-between text-white font-bold text-lg mb-2 pb-2 border-b border-white/10">
                    <span>TOTAL:</span>
                    <span className="text-arandu-blue">{formatNumber(totals.total, formData.moneda)} {getCurrencySymbol(formData.moneda)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-sm">
                    <span>Base imponible:</span>
                    <span>{formatNumber(totals.subtotal, formData.moneda)} {getCurrencySymbol(formData.moneda)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-sm">
                    <span>IVA incluido (10%):</span>
                    <span>{formatNumber(totals.iva, formData.moneda)} {getCurrencySymbol(formData.moneda)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">Observaciones</label>
              <Textarea
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                className="bg-arandu-dark border-white/10 text-white resize-none"
                rows={2}
                placeholder="Observaciones adicionales..."
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onMouseDown={(e) => e.target === e.currentTarget && onClose()}
              variant="outline"
              className="flex-1 border-white/20 text-slate-300"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-arandu-blue hover:bg-arandu-blue-dark text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Guardando..." : (editingId ? "Actualizar Presupuesto" : "Crear Presupuesto")}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default PresupuestoFormModal;
