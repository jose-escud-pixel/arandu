import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Edit2, Trash2, Search, X, Save, Truck,
  ToggleLeft, ToggleRight, Phone, Mail, MapPin, Tag,
  DollarSign, CreditCard, AlertCircle, CheckCircle, Clock, ChevronDown, ChevronRight
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIAS = ["Hardware", "Software", "Servicios", "Telecom", "Impresión", "Eléctrico", "Otro"];

const LOGOS = [
  { value: "todas",     label: "Todas" },
  { value: "arandujar", label: "Arandu&JAR" },
  { value: "arandu",    label: "Arandu" },
  { value: "jar",       label: "JAR" },
];

const LOGO_LABEL = { arandujar: "Arandu&JAR", arandu: "Arandu", jar: "JAR" };

const emptyForm = {
  nombre: "",
  ruc: "",
  contacto: "",
  telefono: "",
  email: "",
  direccion: "",
  categoria: "",
  notas: "",
  activo: true,
  logo_tipo: "arandujar",
};

const emptyPagoForm = {
  monto_pagado: "",
  moneda: "PYG",
  tipo_cambio_real: "",
  fecha_pago: new Date().toISOString().split("T")[0],
  notas: "",
  presupuesto_ids: [],
};

function fmt(n, moneda = "PYG") {
  if (n == null) return "-";
  if (moneda === "USD") return `$${Number(n).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

export default function ProveedoresPage() {
  const { token, hasPermission } = useContext(AuthContext);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [showInactive, setShowInactive] = useState(false);
  const [logoFilter, setLogoFilter] = useState("todas");
  const [comprasResumen, setComprasResumen] = useState({}); // keyed by proveedor_id or nombre

  // Deuda / pagos modal
  const [showDeudaModal, setShowDeudaModal] = useState(false);
  const [selectedProv, setSelectedProv] = useState(null);
  const [deudaData, setDeudaData] = useState(null);
  const [pagosData, setPagosData] = useState([]);
  const [loadingDeuda, setLoadingDeuda] = useState(false);
  const [showDetalleItems, setShowDetalleItems] = useState(false);

  // Pago modal
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoForm, setPagoForm] = useState(emptyPagoForm);
  const [savingPago, setSavingPago] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchProveedores = async () => {
    const res = await fetch(`${API}/admin/proveedores`, { headers });
    if (res.ok) setProveedores(await res.json());
    setLoading(false);
  };

  const fetchComprasResumen = async () => {
    try {
      const res = await fetch(`${API}/admin/compras/resumen/por-proveedor`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Index by proveedor_id (primary) or proveedor_nombre (fallback)
        const map = {};
        data.forEach(r => {
          if (r.proveedor_id) map[r.proveedor_id] = r;
          else if (r.proveedor_nombre) map[r.proveedor_nombre] = r;
        });
        setComprasResumen(map);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchProveedores();
    fetchComprasResumen();
  }, []); // eslint-disable-line

  const filtered = proveedores.filter(p => {
    if (!showInactive && !p.activo) return false;
    if (logoFilter !== "todas" && (p.logo_tipo || "arandujar") !== logoFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.nombre || "").toLowerCase().includes(q) ||
      (p.ruc || "").toLowerCase().includes(q) ||
      (p.contacto || "").toLowerCase().includes(q) ||
      (p.categoria || "").toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setFormData({
      nombre: p.nombre,
      ruc: p.ruc || "",
      contacto: p.contacto || "",
      telefono: p.telefono || "",
      email: p.email || "",
      direccion: p.direccion || "",
      categoria: p.categoria || "",
      notas: p.notas || "",
      activo: p.activo,
      logo_tipo: p.logo_tipo || "arandujar",
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      ruc: formData.ruc || null,
      contacto: formData.contacto || null,
      telefono: formData.telefono || null,
      email: formData.email || null,
      direccion: formData.direccion || null,
      categoria: formData.categoria || null,
      notas: formData.notas || null,
    };
    const url = editingId ? `${API}/admin/proveedores/${editingId}` : `${API}/admin/proveedores`;
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(editingId ? "Proveedor actualizado" : "Proveedor creado");
      setShowForm(false);
      fetchProveedores();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al guardar");
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`¿Eliminar proveedor "${p.nombre}"?`)) return;
    const res = await fetch(`${API}/admin/proveedores/${p.id}`, { method: "DELETE", headers });
    if (res.ok) {
      toast.success("Proveedor eliminado");
      fetchProveedores();
    }
  };

  const handleToggle = async (p) => {
    const payload = { ...p, activo: !p.activo, ruc: p.ruc || null, contacto: p.contacto || null, telefono: p.telefono || null, email: p.email || null, direccion: p.direccion || null, categoria: p.categoria || null, notas: p.notas || null, logo_tipo: p.logo_tipo || null };
    const res = await fetch(`${API}/admin/proveedores/${p.id}`, { method: "PUT", headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(p.activo ? "Proveedor desactivado" : "Proveedor activado");
      fetchProveedores();
    }
  };

  // ── Deuda & pagos ─────────────────────────────────────────────
  const openDeuda = async (prov) => {
    setSelectedProv(prov);
    setShowDeudaModal(true);
    setLoadingDeuda(true);
    setDeudaData(null);
    setPagosData([]);
    setShowDetalleItems(false);
    try {
      const [resD, resP] = await Promise.all([
        fetch(`${API}/admin/proveedores/${prov.id}/deuda`, { headers }),
        fetch(`${API}/admin/proveedores/${prov.id}/pagos`, { headers }),
      ]);
      if (resD.ok) setDeudaData(await resD.json());
      if (resP.ok) setPagosData(await resP.json());
    } catch (err) {
      toast.error("Error al cargar deuda");
    }
    setLoadingDeuda(false);
  };

  const openPagoModal = () => {
    setPagoForm({
      ...emptyPagoForm,
      fecha_pago: new Date().toISOString().split("T")[0],
      presupuesto_ids: [],
    });
    setShowPagoModal(true);
  };

  // Monto PYG calculado en tiempo real
  const montoPYGCalc = () => {
    const monto = parseFloat(pagoForm.monto_pagado) || 0;
    if (pagoForm.moneda === "PYG") return monto;
    const tc = parseFloat(pagoForm.tipo_cambio_real) || 1;
    return monto * tc;
  };

  const handleSavePago = async (e) => {
    e.preventDefault();
    if (!pagoForm.monto_pagado || parseFloat(pagoForm.monto_pagado) <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setSavingPago(true);
    const payload = {
      monto_pagado: parseFloat(pagoForm.monto_pagado),
      moneda: pagoForm.moneda,
      tipo_cambio_real: pagoForm.moneda !== "PYG" && pagoForm.tipo_cambio_real ? parseFloat(pagoForm.tipo_cambio_real) : null,
      fecha_pago: pagoForm.fecha_pago,
      notas: pagoForm.notas || null,
      presupuesto_ids: pagoForm.presupuesto_ids,
    };
    const res = await fetch(`${API}/admin/proveedores/${selectedProv.id}/pagos`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("Pago registrado");
      setShowPagoModal(false);
      openDeuda(selectedProv); // refresh
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al guardar pago");
    }
    setSavingPago(false);
  };

  const handleDeletePago = async (pagoId) => {
    if (!window.confirm("¿Eliminar este pago?")) return;
    const res = await fetch(`${API}/admin/pagos_proveedores/${pagoId}`, { method: "DELETE", headers });
    if (res.ok) {
      toast.success("Pago eliminado");
      openDeuda(selectedProv); // refresh
    }
  };

  // Toggle presupuesto_ids selection
  const togglePresupuestoId = (id) => {
    setPagoForm(f => ({
      ...f,
      presupuesto_ids: f.presupuesto_ids.includes(id)
        ? f.presupuesto_ids.filter(x => x !== id)
        : [...f.presupuesto_ids, id],
    }));
  };

  if (loading) return (
    <div className="min-h-screen bg-arandu-dark flex items-center justify-center">
      <div className="text-arandu-blue-light animate-pulse font-heading text-xl">Cargando proveedores...</div>
    </div>
  );

  // Unique presupuestos from deuda items
  const presupuestosEnDeuda = deudaData
    ? [...new Map((deudaData.items || []).filter(i => !i.pagado).map(i => [i.presupuesto_id, i])).values()]
    : [];

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-heading text-2xl text-white">Proveedores</h1>
            <p className="text-slate-400 text-sm font-body">Gestión de proveedores y vendedores</p>
          </div>
        </div>
        {hasPermission("proveedores.crear") && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo proveedor
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Logo filter */}
        <div className="flex flex-wrap gap-2">
          {LOGOS.map(l => (
            <button key={l.value} onClick={() => setLogoFilter(l.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${logoFilter === l.value ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
              {l.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proveedor..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
            />
          </div>
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-body border transition-colors ${showInactive ? "border-arandu-blue bg-arandu-blue/10 text-arandu-blue-light" : "border-white/10 text-slate-400 hover:text-white"}`}
          >
            {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Ver inactivos
          </button>
          <span className="text-slate-500 text-sm font-body">{filtered.length} proveedor{filtered.length !== 1 ? "es" : ""}</span>
        </div>

        {/* Lista tabla */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 font-body">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{search ? "No hay proveedores que coincidan" : "No hay proveedores registrados"}</p>
            {hasPermission("proveedores.crear") && !search && (
              <button onClick={openNew} className="mt-3 text-arandu-blue-light hover:underline text-sm">
                Agregar el primer proveedor
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Proveedor</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs hidden md:table-cell">Categoría</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs hidden lg:table-cell">Contacto</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Compras</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Total comprado</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Deuda actual</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs hidden lg:table-cell">Última compra</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const cr = comprasResumen[p.id] || comprasResumen[p.nombre];
                  const fmtC = (n) => {
                    if (!n) return "₲ 0";
                    if (n >= 1_000_000) return `₲ ${(n / 1_000_000).toFixed(1)}M`;
                    if (n >= 1_000) return `₲ ${Math.round(n / 1_000)}K`;
                    return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
                  };
                  return (
                    <tr key={p.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${!p.activo ? "opacity-40" : ""}`}>
                      {/* Nombre + empresa + RUC */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-white font-medium leading-tight">{p.nombre}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {p.ruc && <span className="text-slate-500 text-xs">RUC: {p.ruc}</span>}
                              {p.logo_tipo && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300">
                                  {LOGO_LABEL[p.logo_tipo] || p.logo_tipo}
                                </span>
                              )}
                              {!p.activo && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-500">Inactivo</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Categoría */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {p.categoria ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-arandu-blue/15 text-arandu-blue-light border border-arandu-blue/20">
                            {p.categoria}
                          </span>
                        ) : <span className="text-slate-600">-</span>}
                      </td>

                      {/* Contacto */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="text-xs text-slate-400 space-y-0.5">
                          {p.contacto && <p className="flex items-center gap-1"><Tag className="w-3 h-3" />{p.contacto}</p>}
                          {p.telefono && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefono}</p>}
                          {p.email && <p className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</p>}
                          {!p.contacto && !p.telefono && !p.email && <span className="text-slate-600">-</span>}
                        </div>
                      </td>

                      {/* Cantidad compras */}
                      <td className="px-4 py-3 text-center">
                        {cr ? (
                          <span className="text-blue-300 font-heading font-semibold">{cr.cantidad_compras}</span>
                        ) : <span className="text-slate-600 text-xs">-</span>}
                      </td>

                      {/* Total comprado */}
                      <td className="px-4 py-3 text-right">
                        {cr ? (
                          <span className="text-slate-200 font-medium">{fmtC(cr.total_comprado)}</span>
                        ) : <span className="text-slate-600 text-xs">-</span>}
                      </td>

                      {/* Deuda actual */}
                      <td className="px-4 py-3 text-right">
                        {cr ? (
                          cr.deuda_actual > 0 ? (
                            <span className="text-orange-300 font-semibold">{fmtC(cr.deuda_actual)}</span>
                          ) : (
                            <span className="text-green-400 text-xs flex items-center justify-end gap-1">
                              <CheckCircle className="w-3 h-3" /> Al día
                            </span>
                          )
                        ) : <span className="text-slate-600 text-xs">-</span>}
                      </td>

                      {/* Última compra */}
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs">
                        {cr?.ultima_compra || "-"}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {hasPermission("proveedores.ver") && (
                            <button
                              onClick={() => openDeuda(p)}
                              title="Ver deuda y pagos"
                              className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {hasPermission("proveedores.editar") && (
                            <>
                              <button onClick={() => openEdit(p)} title="Editar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleToggle(p)} title={p.activo ? "Desactivar" : "Activar"}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                                {p.activo ? <ToggleRight className="w-3.5 h-3.5 text-green-400" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          )}
                          {hasPermission("proveedores.eliminar") && (
                            <button onClick={() => handleDelete(p)} title="Eliminar"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-heading text-lg text-white">{editingId ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Empresa *</label>
                <div className="flex gap-2">
                  {LOGOS.filter(l => l.value !== "todas").map(l => (
                    <button key={l.value} type="button"
                      onClick={() => setFormData(f => ({ ...f, logo_tipo: l.value }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${formData.logo_tipo === l.value ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Nombre / Razón social *</label>
                <input required type="text" value={formData.nombre}
                  onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">RUC</label>
                  <input type="text" value={formData.ruc}
                    onChange={e => setFormData(f => ({ ...f, ruc: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Categoría</label>
                  <select value={formData.categoria}
                    onChange={e => setFormData(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  >
                    <option value="">Sin categoría</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Nombre de contacto</label>
                <input type="text" value={formData.contacto}
                  onChange={e => setFormData(f => ({ ...f, contacto: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Teléfono</label>
                  <input type="text" value={formData.telefono}
                    onChange={e => setFormData(f => ({ ...f, telefono: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Email</label>
                  <input type="email" value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Dirección</label>
                <input type="text" value={formData.direccion}
                  onChange={e => setFormData(f => ({ ...f, direccion: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Notas</label>
                <textarea value={formData.notas}
                  onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm"
                >
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Deuda & Pagos Modal ──────────────────────────────────────────────── */}
      {showDeudaModal && selectedProv && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="font-heading text-lg text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-orange-400" />
                  Deuda con {selectedProv.nombre}
                </h2>
                <p className="text-slate-400 text-xs font-body mt-0.5">Costos reales pendientes de pago</p>
              </div>
              <div className="flex items-center gap-2">
                {hasPermission("proveedores.editar") && (
                  <button
                    onClick={openPagoModal}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-body text-xs"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Registrar pago
                  </button>
                )}
                <button onClick={() => setShowDeudaModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {loadingDeuda ? (
                <div className="text-center py-10 text-slate-400 font-body animate-pulse">Calculando deuda...</div>
              ) : deudaData ? (
                <>
                  {/* Resumen deuda */}
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(deudaData.deuda_por_moneda || {}).length === 0 ? (
                      <div className="col-span-2 flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                        <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                        <div>
                          <p className="text-green-300 font-heading text-base">Sin deuda pendiente</p>
                          <p className="text-green-400/60 text-xs font-body">Todos los costos están pagados</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {Object.entries(deudaData.deuda_por_moneda).map(([moneda, monto]) => (
                          <div key={moneda} className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                            <p className="text-orange-300 font-heading text-lg">{fmt(monto, moneda)}</p>
                            <p className="text-orange-400/60 text-xs font-body">Deuda en {moneda}</p>
                          </div>
                        ))}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <p className="text-slate-200 font-heading text-lg">{fmt(deudaData.total_pyg_estimado, "PYG")}</p>
                          <p className="text-slate-500 text-xs font-body">Total estimado en PYG (TC estimado)</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Detalle de ítems */}
                  {(deudaData.items || []).length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowDetalleItems(v => !v)}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors font-body w-full text-left"
                      >
                        {showDetalleItems ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        Detalle por presupuesto ({deudaData.items.filter(i => !i.pagado).length} ítems pendientes)
                      </button>
                      {showDetalleItems && (
                        <div className="mt-2 space-y-1.5">
                          {deudaData.items.map((item, idx) => (
                            <div key={idx} className={`flex items-start justify-between rounded-lg px-3 py-2 text-xs font-body ${item.pagado ? "bg-green-500/5 border border-green-500/10" : "bg-orange-500/5 border border-orange-500/10"}`}>
                              <div className="flex-1 min-w-0">
                                <span className={`inline-flex items-center gap-1 ${item.pagado ? "text-green-400" : "text-orange-400"}`}>
                                  {item.pagado ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                  {item.pagado ? "Pagado" : "Pendiente"}
                                </span>
                                <span className="text-slate-400 mx-1">·</span>
                                <span className="text-slate-300">{item.presupuesto_numero || item.presupuesto_id}</span>
                                {item.presupuesto_nombre && <span className="text-slate-500"> — {item.presupuesto_nombre}</span>}
                                {item.descripcion && <span className="text-slate-500 ml-1">· {item.descripcion}</span>}
                              </div>
                              <span className="ml-3 shrink-0 text-slate-200 font-medium">{fmt(item.monto, item.moneda)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Historial de pagos */}
                  <div>
                    <h3 className="font-heading text-sm text-slate-300 mb-2">Historial de pagos registrados</h3>
                    {pagosData.length === 0 ? (
                      <p className="text-slate-500 text-xs font-body italic">Sin pagos registrados aún</p>
                    ) : (
                      <div className="space-y-2">
                        {pagosData.map(pago => (
                          <div key={pago.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-body text-sm font-medium">{fmt(pago.monto_pagado, pago.moneda)}</span>
                                {pago.moneda !== "PYG" && pago.tipo_cambio_real && (
                                  <span className="text-slate-500 text-xs">× {pago.tipo_cambio_real.toLocaleString("es-PY")} = {fmt(pago.monto_pyg, "PYG")}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-slate-500 text-xs font-body">{pago.fecha_pago}</span>
                                {pago.notas && <span className="text-slate-600 text-xs">· {pago.notas}</span>}
                                {pago.presupuesto_ids && pago.presupuesto_ids.length > 0 && (
                                  <span className="text-slate-600 text-xs">· {pago.presupuesto_ids.length} presup.</span>
                                )}
                              </div>
                            </div>
                            {hasPermission("proveedores.editar") && (
                              <button
                                onClick={() => handleDeletePago(pago.id)}
                                className="text-slate-600 hover:text-red-400 transition-colors ml-2"
                                title="Eliminar pago"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-10 text-red-400 font-body">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60" />
                  Error al cargar datos de deuda
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Registrar Pago Modal ────────────────────────────────────────────── */}
      {showPagoModal && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="font-heading text-base text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-green-400" />
                Registrar pago a {selectedProv?.nombre}
              </h2>
              <button onClick={() => setShowPagoModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePago} className="p-5 space-y-4">
              {/* Moneda */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Moneda del pago</label>
                <div className="flex gap-2">
                  {["PYG", "USD"].map(m => (
                    <button key={m} type="button"
                      onClick={() => setPagoForm(f => ({ ...f, moneda: m, tipo_cambio_real: "" }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-body font-medium border transition-all ${pagoForm.moneda === m ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
                      {m === "PYG" ? "₲ Guaraníes" : "$ Dólares"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto pagado */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">
                  Monto pagado {pagoForm.moneda === "USD" ? "(USD)" : "(PYG)"} *
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  step={pagoForm.moneda === "USD" ? "0.01" : "1"}
                  value={pagoForm.monto_pagado}
                  onChange={e => setPagoForm(f => ({ ...f, monto_pagado: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  placeholder={pagoForm.moneda === "USD" ? "0.00" : "0"}
                />
              </div>

              {/* TC real (solo si USD) */}
              {pagoForm.moneda === "USD" && (
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Tipo de cambio real (USD → PYG) *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={pagoForm.tipo_cambio_real}
                    onChange={e => setPagoForm(f => ({ ...f, tipo_cambio_real: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                    placeholder="Ej: 7800"
                  />
                  {pagoForm.monto_pagado && pagoForm.tipo_cambio_real && (
                    <p className="text-slate-400 text-xs mt-1 font-body">
                      = {fmt(montoPYGCalc(), "PYG")} en guaraníes
                    </p>
                  )}
                </div>
              )}

              {/* Fecha */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Fecha de pago *</label>
                <input
                  required
                  type="date"
                  value={pagoForm.fecha_pago}
                  onChange={e => setPagoForm(f => ({ ...f, fecha_pago: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>

              {/* Presupuestos vinculados */}
              {presupuestosEnDeuda.length > 0 && (
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Presupuestos que cubre este pago (opcional)</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {presupuestosEnDeuda.map(item => (
                      <label key={item.presupuesto_id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={pagoForm.presupuesto_ids.includes(item.presupuesto_id)}
                          onChange={() => togglePresupuestoId(item.presupuesto_id)}
                          className="rounded"
                        />
                        <span className="text-slate-300 text-xs font-body group-hover:text-white transition-colors">
                          #{item.presupuesto_numero || item.presupuesto_id}
                          {item.presupuesto_nombre && ` — ${item.presupuesto_nombre}`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Notas</label>
                <input
                  type="text"
                  value={pagoForm.notas}
                  onChange={e => setPagoForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  placeholder="Ej: Transferencia, número de cheque..."
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={savingPago}
                  className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-body text-sm disabled:opacity-60"
                >
                  <Save className="w-4 h-4" /> {savingPago ? "Guardando..." : "Guardar pago"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPagoModal(false)}
                  className="px-5 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
