import React, { useState, useEffect, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Edit2, Trash2, Building2, Star, X, Check } from "lucide-react";
import { AuthContext } from "../App";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n, moneda = "PYG") => {
  // Protección contra null, undefined y NaN
  const raw = Number(n);
  const num = (n === null || n === undefined || isNaN(raw)) ? 0 : raw;
  if (moneda === "USD") return `$ ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₲ ${Math.round(num).toLocaleString("es-PY")}`;
};

const emptyForm = {
  nombre: "",
  banco: "",
  numero_cuenta: "",
  moneda: "PYG",
  saldo_inicial: "",
  saldo_inicial_fecha: "",
  es_predeterminada: false,
  notas: "",
};

export default function BancosPage() {
  const navigate = useNavigate();
  const { token, activeEmpresaPropia, user, hasPermission } = useContext(AuthContext);
  const canEdit = user?.role === "admin" || hasPermission("balance.editar");

  const [cuentas, setCuentas] = useState([]);
  const [balanceTotales, setBalanceTotales] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchCuentas = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (activeEmpresaPropia?.slug) q.set("logo_tipo", activeEmpresaPropia.slug);
      const res = await fetch(`${API}/admin/cuentas-bancarias/saldos${q.toString() ? `?${q}` : ""}`, { headers });
      if (res.ok) setCuentas(await res.json());
    } catch { toast.error("Error al cargar cuentas"); }
    setLoading(false);
  };

  const fetchBalanceTotales = async () => {
    try {
      const hoy = new Date();
      const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const q = new URLSearchParams({ periodo });
      if (activeEmpresaPropia?.slug) q.set("logo_tipo", activeEmpresaPropia.slug);
      const res = await fetch(`${API}/admin/balance?${q}`, { headers });
      if (res.ok) setBalanceTotales(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchCuentas();
    fetchBalanceTotales();
  }, [activeEmpresaPropia]); // eslint-disable-line

  const openNew = () => {
    setEditingId(null);
    setFormData({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setFormData({
      nombre: c.nombre || "",
      banco: c.banco || "",
      numero_cuenta: c.numero_cuenta || "",
      moneda: c.moneda || "PYG",
      // Usar != null para no descartar el valor 0 con || ""
      saldo_inicial: c.saldo_inicial != null ? String(c.saldo_inicial) : "",
      saldo_inicial_fecha: c.saldo_inicial_fecha || "",
      es_predeterminada: !!c.es_predeterminada,
      notas: c.notas || "",
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nombre) { toast.error("Nombre requerido"); return; }
    try {
      const payload = {
        ...formData,
        saldo_inicial: parseFloat(formData.saldo_inicial) || 0,
        logo_tipo: activeEmpresaPropia?.slug || "arandujar",
      };
      const url = editingId
        ? `${API}/admin/cuentas-bancarias/${editingId}`
        : `${API}/admin/cuentas-bancarias`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success(editingId ? "Cuenta actualizada" : "Cuenta creada");
      setShowForm(false);
      fetchCuentas();
    } catch { toast.error("Error al guardar"); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`¿Desactivar la cuenta "${c.nombre}"?`)) return;
    try {
      const res = await fetch(`${API}/admin/cuentas-bancarias/${c.id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      toast.success("Cuenta desactivada");
      fetchCuentas();
    } catch { toast.error("Error"); }
  };

  // Totales reales: vienen del mismo cálculo que Balance page (evita recalcular dos veces)
  const totalPYG = balanceTotales?.saldo_acumulado ?? cuentas.filter(c => c.moneda === "PYG").reduce((s, c) => s + (c.saldo_actual || 0), 0);
  const totalUSD = balanceTotales?.saldo_acumulado_usd ?? cuentas.filter(c => c.moneda === "USD").reduce((s, c) => s + (c.saldo_actual || 0), 0);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} data-testid="back-btn"
            className="text-slate-400 hover:text-white p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="font-heading text-2xl text-white font-bold">Bancos y Cuentas</h1>
              <p className="text-slate-400 text-sm">Saldo por cuenta · PYG y USD</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {activeEmpresaPropia && (
              <span className="text-xs px-3 py-1 rounded-full border"
                style={{ backgroundColor: `${activeEmpresaPropia.color || "#3b82f6"}15`, borderColor: `${activeEmpresaPropia.color || "#3b82f6"}40`, color: activeEmpresaPropia.color || "#3b82f6" }}>
                {activeEmpresaPropia.nombre}
              </span>
            )}
            {canEdit && (
              <button onClick={openNew} data-testid="new-cuenta-btn"
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> Nueva cuenta
              </button>
            )}
          </div>
        </div>

        {/* Totales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <p className="text-emerald-300 text-xs uppercase tracking-wider font-body">Saldo total PYG</p>
            <p className="text-white font-heading text-2xl mt-1">{fmt(totalPYG, "PYG")}</p>
            <p className="text-slate-400 text-xs mt-1">{cuentas.filter(c => c.moneda === "PYG").length} cuenta(s)</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <p className="text-blue-300 text-xs uppercase tracking-wider font-body">Saldo total USD</p>
            <p className="text-white font-heading text-2xl mt-1">{fmt(totalUSD, "USD")}</p>
            <p className="text-slate-400 text-xs mt-1">{cuentas.filter(c => c.moneda === "USD").length} cuenta(s)</p>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-slate-500 animate-pulse">Cargando...</div>
        ) : cuentas.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 font-body">Sin cuentas bancarias</p>
            {canEdit && <button onClick={openNew} className="text-blue-400 hover:text-blue-300 text-sm mt-3 underline">Crear la primera cuenta</button>}
          </div>
        ) : (
          <div className="space-y-2">
            {cuentas.map(c => (
              <div key={c.id} data-testid={`cuenta-${c.id}`}
                className="group flex items-center gap-4 p-4 bg-white/3 hover:bg-white/5 border border-white/10 rounded-xl transition-all">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  c.moneda === "USD" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"
                }`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-body text-white font-medium">{c.nombre}</p>
                    {c.es_predeterminada && (
                      <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" /> Predeterminada
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs">
                    {c.banco || "—"}{c.numero_cuenta ? ` · N° ${c.numero_cuenta}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-heading text-lg font-bold ${(c.saldo_actual ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {fmt(c.saldo_actual, c.moneda)}
                  </p>
                  <p className="text-slate-500 text-[10px]">saldo actual</p>
                  {c.saldo_inicial != null && c.saldo_inicial !== c.saldo_actual && (
                    <p className="text-slate-600 text-[10px]">inicial: {fmt(c.saldo_inicial, c.moneda)}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-blue-400 p-1">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(c)} className="text-slate-400 hover:text-red-400 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()}
            className="bg-arandu-dark border border-white/10 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="font-heading text-white text-lg">{editingId ? "Editar cuenta" : "Nueva cuenta bancaria"}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Nombre *</label>
                <input required value={formData.nombre} onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Ej: Cuenta principal PYG"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Banco</label>
                  <input value={formData.banco} onChange={e => setFormData(f => ({ ...f, banco: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Itaú, Continental, …"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">N° cuenta</label>
                  <input value={formData.numero_cuenta} onChange={e => setFormData(f => ({ ...f, numero_cuenta: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="123-456-789"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Moneda *</label>
                  <select value={formData.moneda} onChange={e => setFormData(f => ({ ...f, moneda: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    <option value="PYG">₲ PYG</option>
                    <option value="USD">$ USD</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Saldo inicial</label>
                  <input type="number" step="any" value={formData.saldo_inicial}
                    onChange={e => setFormData(f => ({ ...f, saldo_inicial: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Desde fecha</label>
                  <input type="date" value={formData.saldo_inicial_fecha || ""}
                    onChange={e => setFormData(f => ({ ...f, saldo_inicial_fecha: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input type="checkbox" checked={formData.es_predeterminada}
                  onChange={e => setFormData(f => ({ ...f, es_predeterminada: e.target.checked }))}
                  className="accent-amber-500"
                />
                <span className="text-slate-300 text-sm inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400" /> Predeterminada para esta moneda</span>
              </label>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas</label>
                <textarea value={formData.notas} onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))}
                  rows="2"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/10">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm">Cancelar</button>
              <button type="submit" data-testid="save-cuenta-btn"
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm inline-flex items-center justify-center gap-1">
                <Check className="w-4 h-4" /> {editingId ? "Guardar" : "Crear cuenta"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
