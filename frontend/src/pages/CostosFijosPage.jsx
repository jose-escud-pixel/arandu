import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Edit2, Trash2, CheckCircle, Clock, AlertCircle,
  ChevronLeft, ChevronRight, X, Save, ToggleLeft, ToggleRight, TrendingDown
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGOS = [
  { value: "todas",     label: "Todas" },
  { value: "arandujar", label: "Arandu&JAR" },
  { value: "arandu",    label: "Arandu" },
  { value: "jar",       label: "JAR" },
];

const FRECUENCIAS = [
  { value: "unica",       label: "Única vez" },
  { value: "mensual",     label: "Mensual" },
  { value: "trimestral",  label: "Trimestral" },
  { value: "semestral",   label: "Semestral" },
  { value: "anual",       label: "Anual" },
];

const CATEGORIAS_COSTO = [
  "Hosting / Servidores", "Dominios", "Software / Licencias",
  "Telefonía / Internet", "Servicios Básicos", "Impuestos / Tasas",
  "Alquiler", "Publicidad", "Seguros", "Otros",
];

const fmtNum = (n, moneda) => {
  if (n == null || isNaN(n)) return "-";
  if (moneda === "USD") return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "₲" + Math.round(n).toLocaleString("es-PY");
};

const getCurrentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const navigatePeriod = (periodo, delta) => {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const periodLabel = (periodo) => {
  const [y, m] = periodo.split("-").map(Number);
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${months[m - 1]} ${y}`;
};

const LOGO_LABEL = { arandujar: "Arandu&JAR", arandu: "Arandu", jar: "JAR" };

const emptyForm = {
  logo_tipo: "arandujar",
  nombre: "",
  descripcion: "",
  categoria: "",
  monto: "",
  moneda: "PYG",
  tipo_cambio: "",
  frecuencia: "mensual",
  dia_vencimiento: 1,
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_fin: "",
  activo: true,
  notas: "",
};

export default function CostosFijosPage() {
  const { token, hasPermission } = useContext(AuthContext);
  const [costos, setCostos] = useState([]);
  const [vencimientos, setVencimientos] = useState([]);
  const [periodo, setPeriodo] = useState(getCurrentPeriod());
  const [logoFilter, setLogoFilter] = useState("todas");
  const [loading, setLoading] = useState(true);
  const [vencLoading, setVencLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("vencimientos");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [showPagoModal, setShowPagoModal] = useState(null);
  const [pagoForm, setPagoForm] = useState({ monto_pagado: "", fecha_pago: new Date().toISOString().slice(0, 10), notas: "" });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchCostos = async () => {
    const q = logoFilter !== "todas" ? `?logo_tipo=${logoFilter}` : "";
    const res = await fetch(`${API}/admin/costos-fijos${q}`, { headers });
    if (res.ok) setCostos(await res.json());
  };

  const fetchVencimientos = async (p, lf) => {
    setVencLoading(true);
    const q = new URLSearchParams({ periodo: p });
    if (lf && lf !== "todas") q.set("logo_tipo", lf);
    const res = await fetch(`${API}/admin/costos-fijos/vencimientos?${q}`, { headers });
    if (res.ok) setVencimientos(await res.json());
    setVencLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchCostos(), fetchVencimientos(periodo, logoFilter)]);
      setLoading(false);
    };
    init();
  }, [logoFilter]); // eslint-disable-line

  useEffect(() => {
    fetchVencimientos(periodo, logoFilter);
  }, [periodo]); // eslint-disable-line

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary = React.useMemo(() => {
    let totalPYG = 0, totalUSD = 0, pagadoPYG = 0, pagadoUSD = 0;
    vencimientos.forEach(v => {
      if (v.moneda === "USD") { totalUSD += v.monto; if (v.estado === "pagado") pagadoUSD += v.pago?.monto_pagado || 0; }
      else { totalPYG += v.monto; if (v.estado === "pagado") pagadoPYG += v.pago?.monto_pagado || 0; }
    });
    return { totalPYG, totalUSD, pagadoPYG, pagadoUSD, pendientePYG: totalPYG - pagadoPYG, pendienteUSD: totalUSD - pagadoUSD };
  }, [vencimientos]);

  const vencidos = vencimientos.filter(v => v.estado === "vencido").length;

  // ── Form ─────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    // Si estamos en la pestaña de vencimientos, pre-llenar fecha_inicio con el 1° del período visible
    const defaultFechaInicio = activeTab === "vencimientos" ? `${periodo}-01` : new Date().toISOString().slice(0, 10);
    setFormData({ ...emptyForm, logo_tipo: logoFilter !== "todas" ? logoFilter : "arandujar", fecha_inicio: defaultFechaInicio });
    setShowForm(true);
  };
  const openEdit = (c) => {
    setEditingId(c.id);
    setFormData({ logo_tipo: c.logo_tipo || "arandujar", nombre: c.nombre, descripcion: c.descripcion || "", categoria: c.categoria || "", monto: c.monto, moneda: c.moneda, tipo_cambio: c.tipo_cambio || "", frecuencia: c.frecuencia, dia_vencimiento: c.dia_vencimiento, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin || "", activo: c.activo, notas: c.notas || "" });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const toFloat = v => (v === "" || v == null) ? null : parseFloat(v) || null;
    const payload = { ...formData, monto: parseFloat(formData.monto) || 0, tipo_cambio: toFloat(formData.tipo_cambio), dia_vencimiento: parseInt(formData.dia_vencimiento) || 1, fecha_fin: formData.fecha_fin || null, descripcion: formData.descripcion || null, categoria: formData.categoria || null, notas: formData.notas || null };
    const url = editingId ? `${API}/admin/costos-fijos/${editingId}` : `${API}/admin/costos-fijos`;
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(editingId ? "Costo actualizado" : "Costo creado");
      setShowForm(false);
      await Promise.all([fetchCostos(), fetchVencimientos(periodo, logoFilter)]);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al guardar");
    }
  };

  const handleToggle = async (c) => {
    const res = await fetch(`${API}/admin/costos-fijos/${c.id}/toggle`, { method: "PATCH", headers });
    if (res.ok) { toast.success(c.activo ? "Desactivado" : "Activado"); fetchCostos(); fetchVencimientos(periodo, logoFilter); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`¿Eliminar "${c.nombre}"? Se eliminarán también todos los pagos.`)) return;
    const res = await fetch(`${API}/admin/costos-fijos/${c.id}`, { method: "DELETE", headers });
    if (res.ok) { toast.success("Eliminado"); fetchCostos(); fetchVencimientos(periodo, logoFilter); }
  };

  // ── Pago ─────────────────────────────────────────────────────────────────
  const openPago = (v) => { setPagoForm({ monto_pagado: v.monto, fecha_pago: new Date().toISOString().slice(0, 10), notas: "" }); setShowPagoModal(v); };

  const handleRegistrarPago = async (e) => {
    e.preventDefault();
    const v = showPagoModal;
    const payload = { periodo, monto_pagado: parseFloat(pagoForm.monto_pagado) || v.monto, fecha_pago: pagoForm.fecha_pago, notas: pagoForm.notas || null };
    const res = await fetch(`${API}/admin/costos-fijos/${v.costo_id}/pagos`, { method: "POST", headers, body: JSON.stringify(payload) });
    if (res.ok) { toast.success("Pago registrado"); setShowPagoModal(null); fetchVencimientos(periodo, logoFilter); }
    else { const err = await res.json().catch(() => ({})); toast.error(err.detail || "Error al registrar pago"); }
  };

  const handleAnularPago = async (v) => {
    if (!window.confirm("¿Anular este pago?")) return;
    const res = await fetch(`${API}/admin/pagos-costos/${v.pago.id}`, { method: "DELETE", headers });
    if (res.ok) { toast.success("Pago anulado"); fetchVencimientos(periodo, logoFilter); }
  };

  const EstadoBadge = ({ estado }) => {
    if (estado === "pagado") return <span className="flex items-center gap-1 text-green-400 text-xs font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Pagado</span>;
    if (estado === "vencido") return <span className="flex items-center gap-1 text-red-400 text-xs font-semibold"><AlertCircle className="w-3.5 h-3.5" /> Vencido</span>;
    return <span className="flex items-center gap-1 text-yellow-400 text-xs font-semibold"><Clock className="w-3.5 h-3.5" /> Pendiente</span>;
  };

  if (loading) return <div className="min-h-screen bg-arandu-dark flex items-center justify-center"><div className="text-arandu-blue-light animate-pulse font-heading text-xl">Cargando costos fijos...</div></div>;

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-slate-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="font-heading text-2xl text-white flex items-center gap-2">
              <TrendingDown className="w-6 h-6 text-red-400" /> Costos Fijos
            </h1>
            <p className="text-slate-400 text-sm font-body">Gastos recurrentes con seguimiento de pago</p>
          </div>
        </div>
        {hasPermission("costos_fijos.crear") && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm">
            <Plus className="w-4 h-4" /> Nuevo costo
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        {/* Empresa filter */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-slate-500 text-xs font-body">Empresa:</span>
          {LOGOS.map(l => (
            <button key={l.value} onClick={() => setLogoFilter(l.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${logoFilter === l.value ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
              {l.label}
            </button>
          ))}
          {vencidos > 0 && (
            <span className="ml-auto flex items-center gap-1 text-red-400 text-xs font-body font-semibold bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5" /> {vencidos} vencido{vencidos !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10">
          {[["vencimientos", "Vencimientos del periodo"], ["costos", "Todos los costos"]].map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v)}
              className={`px-4 py-2 text-sm font-body border-b-2 transition-colors ${activeTab === v ? "border-arandu-blue text-arandu-blue-light" : "border-transparent text-slate-400 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>

        {activeTab === "vencimientos" && (
          <>
            {/* Period nav */}
            <div className="flex items-center justify-between">
              <button onClick={() => setPeriodo(p => navigatePeriod(p, -1))} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronLeft className="w-5 h-5" /></button>
              <span className="font-heading text-xl text-white">{periodLabel(periodo)}</span>
              <button onClick={() => setPeriodo(p => navigatePeriod(p, 1))} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronRight className="w-5 h-5" /></button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-slate-400 text-xs font-body mb-1">Total del periodo</p>
                {summary.totalPYG > 0 && <p className="font-heading text-lg text-white">{fmtNum(summary.totalPYG, "PYG")}</p>}
                {summary.totalUSD > 0 && <p className="font-heading text-lg text-white">{fmtNum(summary.totalUSD, "USD")}</p>}
                {summary.totalPYG === 0 && summary.totalUSD === 0 && <p className="text-slate-500 text-sm">Sin costos</p>}
              </div>
              <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                <p className="text-green-400 text-xs font-body mb-1">Pagado</p>
                {summary.pagadoPYG > 0 && <p className="font-heading text-lg text-green-300">{fmtNum(summary.pagadoPYG, "PYG")}</p>}
                {summary.pagadoUSD > 0 && <p className="font-heading text-lg text-green-300">{fmtNum(summary.pagadoUSD, "USD")}</p>}
                {summary.pagadoPYG === 0 && summary.pagadoUSD === 0 && <p className="text-green-700 text-sm">₲ 0</p>}
              </div>
              <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                <p className="text-red-400 text-xs font-body mb-1">Pendiente / Vencido</p>
                {summary.pendientePYG > 0 && <p className="font-heading text-lg text-red-300">{fmtNum(summary.pendientePYG, "PYG")}</p>}
                {summary.pendienteUSD > 0 && <p className="font-heading text-lg text-red-300">{fmtNum(summary.pendienteUSD, "USD")}</p>}
                {summary.pendientePYG === 0 && summary.pendienteUSD === 0 && <p className="text-red-800 text-sm">₲ 0</p>}
              </div>
            </div>

            {/* Vencimientos table */}
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              {vencLoading ? (
                <div className="p-8 text-center text-slate-400">Cargando...</div>
              ) : vencimientos.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-body">No hay costos activos para este periodo</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                      <th className="px-4 py-3 text-left font-body">Costo</th>
                      <th className="px-4 py-3 text-left font-body">Empresa</th>
                      <th className="px-4 py-3 text-left font-body">Categoría</th>
                      <th className="px-4 py-3 text-right font-body">Monto</th>
                      <th className="px-4 py-3 text-center font-body">Día vcto.</th>
                      <th className="px-4 py-3 text-center font-body">Estado</th>
                      <th className="px-4 py-3 text-center font-body">Pago</th>
                      <th className="px-4 py-3 text-center font-body">Editar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vencimientos.map((v, i) => (
                      <tr key={v.costo_id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${v.estado === "vencido" ? "bg-red-500/5" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-body text-white">{v.nombre}</p>
                          {v.descripcion && <p className="text-slate-500 text-xs">{v.descripcion}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-body">{LOGO_LABEL[v.logo_tipo] || v.logo_tipo}</span>
                        </td>
                        <td className="px-4 py-3 font-body text-slate-400 text-xs">{v.categoria || "—"}</td>
                        <td className="px-4 py-3 font-heading text-right text-white">{fmtNum(v.monto, v.moneda)}</td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs">{v.dia_vencimiento}</td>
                        <td className="px-4 py-3 text-center">
                          <EstadoBadge estado={v.estado} />
                          {v.estado === "pagado" && v.pago?.fecha_pago && (
                            <p className="text-slate-500 text-xs mt-1">{new Date(v.pago.fecha_pago + "T00:00:00").toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" })}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {v.estado === "pagado" ? (
                            hasPermission("costos_fijos.editar") && (
                              <button onClick={() => handleAnularPago(v)} title="Anular pago" className="text-red-400 hover:text-red-300 transition-colors"><X className="w-4 h-4" /></button>
                            )
                          ) : (
                            hasPermission("costos_fijos.editar") && (
                              <button onClick={() => openPago(v)} className="flex items-center gap-1 mx-auto px-3 py-1 bg-green-600/30 text-green-300 rounded-lg hover:bg-green-600/50 transition-colors text-xs font-body">
                                <CheckCircle className="w-3.5 h-3.5" /> Pagar
                              </button>
                            )
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {hasPermission("costos_fijos.editar") && (
                              <button onClick={() => { const c = costos.find(c => c.id === v.costo_id); if (c) openEdit(c); }} title="Editar" className="text-slate-400 hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                            )}
                            {hasPermission("costos_fijos.eliminar") && (
                              <button onClick={() => { const c = costos.find(c => c.id === v.costo_id); if (c) handleDelete(c); }} title="Eliminar" className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === "costos" && (
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {costos.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-body">No hay costos fijos registrados</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                    <th className="px-4 py-3 text-left font-body">Costo</th>
                    <th className="px-4 py-3 text-left font-body">Empresa</th>
                    <th className="px-4 py-3 text-left font-body">Categoría</th>
                    <th className="px-4 py-3 text-left font-body">Frecuencia</th>
                    <th className="px-4 py-3 text-right font-body">Monto</th>
                    <th className="px-4 py-3 text-center font-body">Estado</th>
                    <th className="px-4 py-3 text-center font-body">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {costos.map((c) => (
                    <tr key={c.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${!c.activo ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-body text-white">{c.nombre}</p>
                        {c.descripcion && <p className="text-slate-500 text-xs">{c.descripcion}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-body">{LOGO_LABEL[c.logo_tipo] || c.logo_tipo}</span>
                      </td>
                      <td className="px-4 py-3 font-body text-slate-400 text-xs">{c.categoria || "—"}</td>
                      <td className="px-4 py-3 font-body text-slate-400 text-xs capitalize">{c.frecuencia === "unica" ? "Única vez" : c.frecuencia}{c.frecuencia !== "unica" && <span className="text-slate-600"> (día {c.dia_vencimiento})</span>}</td>
                      <td className="px-4 py-3 font-heading text-right text-white">{fmtNum(c.monto, c.moneda)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.activo ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}`}>
                          {c.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {hasPermission("costos_fijos.editar") && (
                            <>
                              <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => handleToggle(c)} className="text-slate-400 hover:text-yellow-400 transition-colors">
                                {c.activo ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                              </button>
                            </>
                          )}
                          {hasPermission("costos_fijos.eliminar") && (
                            <button onClick={() => handleDelete(c)} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-heading text-lg text-white">{editingId ? "Editar costo fijo" : "Nuevo costo fijo"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Empresa */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Empresa *</label>
                <div className="flex gap-2">
                  {LOGOS.filter(l => l.value !== "todas").map(l => (
                    <button key={l.value} type="button" onClick={() => setFormData(f => ({ ...f, logo_tipo: l.value }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${formData.logo_tipo === l.value ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Nombre *</label>
                <input required type="text" value={formData.nombre} onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Hosting VPS, Dominio .com, Netflix..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Categoría</label>
                  <input
                    type="text"
                    list="categorias-costo-list"
                    value={formData.categoria}
                    onChange={e => setFormData(f => ({ ...f, categoria: e.target.value }))}
                    placeholder="Seleccioná o escribí una nueva..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                  <datalist id="categorias-costo-list">
                    {CATEGORIAS_COSTO.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Descripción</label>
                  <input type="text" value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Monto *</label>
                  <input required type="number" min="0" step="any" value={formData.monto} onChange={e => setFormData(f => ({ ...f, monto: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Moneda</label>
                  <select value={formData.moneda} onChange={e => setFormData(f => ({ ...f, moneda: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue">
                    <option value="PYG">₲ Guaraníes</option>
                    <option value="USD">$ Dólares</option>
                  </select>
                </div>
              </div>
              {formData.moneda === "USD" && (
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Tipo de cambio referencial (opcional)</label>
                  <input type="number" min="0" step="any" value={formData.tipo_cambio} onChange={e => setFormData(f => ({ ...f, tipo_cambio: e.target.value }))}
                    placeholder="Ej: 7600" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Frecuencia</label>
                  <select value={formData.frecuencia} onChange={e => setFormData(f => ({ ...f, frecuencia: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue">
                    {FRECUENCIAS.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
                  </select>
                </div>
                {formData.frecuencia !== "unica" && (
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-body">Día de vencimiento</label>
                    <input type="number" min="1" max="31" value={formData.dia_vencimiento} onChange={e => setFormData(f => ({ ...f, dia_vencimiento: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Fecha inicio *</label>
                  <input required type="date" value={formData.fecha_inicio} onChange={e => setFormData(f => ({ ...f, fecha_inicio: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Fecha fin (opcional)</label>
                  <input type="date" value={formData.fecha_fin} onChange={e => setFormData(f => ({ ...f, fecha_fin: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Notas</label>
                <textarea value={formData.notas} onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))} rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue resize-none" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" className="flex items-center gap-2 px-5 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm">
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Pago Modal ───────────────────────────────────────────────────────── */}
      {showPagoModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-heading text-lg text-white">Registrar pago</h2>
              <button onClick={() => setShowPagoModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleRegistrarPago} className="p-6 space-y-4">
              <div className="bg-white/5 rounded-lg p-3 text-sm font-body space-y-1">
                <p className="text-slate-400">Costo: <span className="text-white">{showPagoModal.nombre}</span></p>
                <p className="text-slate-400">Empresa: <span className="text-white">{LOGO_LABEL[showPagoModal.logo_tipo] || showPagoModal.logo_tipo}</span></p>
                <p className="text-slate-400">Periodo: <span className="text-white">{periodLabel(periodo)}</span></p>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Monto pagado ({showPagoModal.moneda === "USD" ? "$" : "₲"})</label>
                <input required type="number" min="0" step="any" value={pagoForm.monto_pagado} onChange={e => setPagoForm(f => ({ ...f, monto_pagado: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Fecha de pago</label>
                <input required type="date" value={pagoForm.fecha_pago} onChange={e => setPagoForm(f => ({ ...f, fecha_pago: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Notas (referencia, nro. de transferencia...)</label>
                <input type="text" value={pagoForm.notas} onChange={e => setPagoForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-body text-sm">
                  <CheckCircle className="w-4 h-4" /> Confirmar pago
                </button>
                <button type="button" onClick={() => setShowPagoModal(null)} className="px-5 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm">
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
