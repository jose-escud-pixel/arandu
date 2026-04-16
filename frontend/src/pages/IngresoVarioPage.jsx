import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Edit2, Trash2, X, Save,
  TrendingUp, Search, ChevronLeft, ChevronRight, Filter
} from "lucide-react";
import EmpresaSwitcher from "../components/EmpresaSwitcher";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getMesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function mesLabel(m) {
  const [y, mo] = m.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[parseInt(mo, 10) - 1]} ${y}`;
}
function prevMes(m) {
  const [y, mo] = m.split("-").map(Number);
  if (mo === 1) return `${y - 1}-12`;
  return `${y}-${String(mo - 1).padStart(2, "0")}`;
}
function nextMes(m) {
  const [y, mo] = m.split("-").map(Number);
  if (mo === 12) return `${y + 1}-01`;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}

const CATEGORIAS = [
  "Pago en efectivo",
  "Transferencia",
  "Reembolso",
  "Anticipo recibido",
  "Donación",
  "Venta de activo",
  "Otro",
];

const fmtNum = (n, moneda) => {
  if (n == null || isNaN(n)) return "-";
  if (moneda === "USD")
    return "$ " + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "₲ " + Math.round(n).toLocaleString("es-PY");
};

const emptyForm = {
  descripcion: "",
  categoria: "Transferencia",
  monto: "",
  moneda: "PYG",
  tipo_cambio: "",
  fecha: new Date().toISOString().slice(0, 10),
  notas: "",
};

export default function IngresoVarioPage() {
  const { token, hasPermission, activeEmpresaPropia } = useContext(AuthContext);
  const navigate = useNavigate();
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const logoFilter = activeEmpresaPropia?.slug || "todas";
  const [mes, setMes] = useState(getMesActual());
  const [filtrarMes, setFiltrarMes] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchIngresos = useCallback(async () => {
    const q = new URLSearchParams();
    if (logoFilter !== "todas") q.set("logo_tipo", logoFilter);
    if (filtrarMes) q.set("mes", mes);
    const res = await fetch(`${API}/admin/ingresos-varios?${q}`, { headers });
    if (res.ok) setIngresos(await res.json());
  }, [logoFilter, mes, filtrarMes, activeEmpresaPropia]); // eslint-disable-line

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchIngresos();
      setLoading(false);
    };
    init();
  }, [fetchIngresos]); // eslint-disable-line

  const ingresosFiltrados = React.useMemo(() => {
    if (!searchTerm.trim()) return ingresos;
    const q = searchTerm.toLowerCase();
    return ingresos.filter(i =>
      (i.descripcion || "").toLowerCase().includes(q) ||
      (i.categoria || "").toLowerCase().includes(q) ||
      (i.notas || "").toLowerCase().includes(q)
    );
  }, [ingresos, searchTerm]);

  const totalPYG = React.useMemo(() =>
    ingresos.filter(i => i.moneda === "PYG" && i.monto > 0).reduce((s, i) => s + i.monto, 0), [ingresos]);
  const totalUSD = React.useMemo(() =>
    ingresos.filter(i => i.moneda === "USD" && i.monto > 0).reduce((s, i) => s + i.monto, 0), [ingresos]);
  const totalEgresosPYG = React.useMemo(() =>
    ingresos.filter(i => i.moneda === "PYG" && i.monto < 0).reduce((s, i) => s + Math.abs(i.monto), 0), [ingresos]);

  const openNew = () => {
    setEditingId(null);
    setFormData({ ...emptyForm, fecha: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const openEdit = (iv) => {
    setEditingId(iv.id);
    setFormData({
      descripcion: iv.descripcion,
      categoria: iv.categoria || "Otro",
      monto: iv.monto,
      moneda: iv.moneda || "PYG",
      tipo_cambio: iv.tipo_cambio || "",
      fecha: iv.fecha,
      notas: iv.notas || "",
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.descripcion || !formData.monto) {
      toast.error("Completá descripción y monto"); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        logo_tipo: activeEmpresaPropia?.slug || "arandujar",
        monto: parseFloat(formData.monto) || 0,
        tipo_cambio: formData.tipo_cambio ? parseFloat(formData.tipo_cambio) : null,
        notas: formData.notas || null,
      };
      const url = editingId
        ? `${API}/admin/ingresos-varios/${editingId}`
        : `${API}/admin/ingresos-varios`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      if (res.ok) {
        toast.success(editingId ? "Ingreso actualizado" : "Ingreso registrado");
        setShowForm(false);
        fetchIngresos();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Error al guardar");
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (iv) => {
    if (!window.confirm(`¿Eliminar "${iv.descripcion}"?`)) return;
    const res = await fetch(`${API}/admin/ingresos-varios/${iv.id}`, { method: "DELETE", headers });
    if (res.ok) { toast.success("Eliminado"); fetchIngresos(); }
    else toast.error("Error al eliminar");
  };

  if (loading) return (
    <div className="min-h-screen bg-arandu-dark flex items-center justify-center">
      <div className="text-arandu-blue-light animate-pulse font-heading text-xl">Cargando...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-arandu-dark text-white">

      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-heading text-2xl text-white flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-400" /> Ingresos varios
            </h1>
            <p className="text-slate-400 text-sm font-body">Ingresos sin factura — efectivo, transferencias, reembolsos, etc.</p>
          </div>
          <EmpresaSwitcher compact />
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-body text-sm">
          <Plus className="w-4 h-4" /> Nuevo ingreso
        </button>
      </div>

      <div className="p-6 space-y-5">

        {/* Filtro por mes */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={filtrarMes} onChange={e => setFiltrarMes(e.target.checked)}
              className="accent-emerald-500 w-3.5 h-3.5" />
            <Filter className="w-3.5 h-3.5" /> Filtrar por mes
          </label>
          {filtrarMes && (
            <div className="flex items-center gap-1">
              <button onClick={() => setMes(prevMes(mes))} className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white text-sm font-medium min-w-[90px] text-center">{mesLabel(mes)}</span>
              <button onClick={() => setMes(nextMes(mes))} className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <p className="text-emerald-400 text-xs font-body mb-1">Total en guaraníes</p>
            <p className="font-heading text-xl text-emerald-300">{fmtNum(totalPYG, "PYG")}</p>
          </div>
          {totalUSD > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-amber-400 text-xs font-body mb-1">Total en USD</p>
              <p className="font-heading text-xl text-amber-300">{fmtNum(totalUSD, "USD")}</p>
            </div>
          )}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-slate-400 text-xs font-body mb-1">Registros</p>
            <p className="font-heading text-xl text-white">{ingresos.length}</p>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por descripción, categoría o notas..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-white/30 placeholder-slate-500 font-body"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabla */}
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          {ingresosFiltrados.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-body">
              {searchTerm
                ? `Sin resultados para "${searchTerm}"`
                : "No hay ingresos registrados. ¡Agregá el primero!"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                  <th className="px-4 py-3 text-left font-body">Descripción</th>
                  <th className="px-4 py-3 text-left font-body">Categoría</th>
                  <th className="px-4 py-3 text-center font-body">Fecha</th>
                  <th className="px-4 py-3 text-right font-body">Monto</th>
                  <th className="px-4 py-3 text-center font-body">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ingresosFiltrados.map(iv => (
                  <tr key={iv.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-body text-white">{iv.descripcion}</p>
                      {iv.notas && <p className="text-slate-500 text-xs">{iv.notas}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-body">
                        {iv.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400 text-xs font-body">{iv.fecha}</td>
                    <td className="px-4 py-3 text-right">
                      {iv.monto < 0 ? (
                        <span className="font-heading text-red-400 font-semibold">
                          -{fmtNum(Math.abs(iv.monto), iv.moneda)}
                          <span className="ml-1 text-[10px] bg-red-500/15 text-red-300 border border-red-500/20 px-1.5 py-0.5 rounded uppercase">egreso</span>
                        </span>
                      ) : (
                        <span className="font-heading text-emerald-300 font-semibold">{fmtNum(iv.monto, iv.moneda)}</span>
                      )}
                      {iv.moneda === "USD" && iv.tipo_cambio && (
                        <p className="text-slate-500 text-xs">≈ {fmtNum(iv.monto_pyg, "PYG")}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(iv)} title="Editar"
                          className="text-slate-400 hover:text-blue-400 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(iv)} title="Eliminar"
                          className="text-slate-400 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Modal formulario ─────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-heading text-lg text-white">
                {editingId ? "Editar ingreso" : "Registrar ingreso sin factura"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">

              {/* Descripción */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Descripción *</label>
                <input required type="text" value={formData.descripcion}
                  onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej: Pago efectivo cliente XYZ"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500" />
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Categoría</label>
                <select value={formData.categoria}
                  onChange={e => setFormData(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500">
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Monto y moneda */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Monto *</label>
                  <input required type="number" min="0" step="any" value={formData.monto}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(f => ({ ...f, monto: val }));
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Moneda</label>
                  <select value={formData.moneda}
                    onChange={e => setFormData(f => ({ ...f, moneda: e.target.value, tipo_cambio: "" }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500">
                    <option value="PYG">₲ Guaraníes</option>
                    <option value="USD">$ Dólares</option>
                  </select>
                </div>
              </div>

              {/* Tipo de cambio (solo USD) */}
              {formData.moneda === "USD" && (
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Tipo de cambio (opcional)</label>
                  <input type="number" min="0" step="any" value={formData.tipo_cambio}
                    onChange={e => setFormData(f => ({ ...f, tipo_cambio: e.target.value }))}
                    placeholder="Ej: 7800"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500" />
                </div>
              )}

              {/* Fecha */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Fecha *</label>
                <input required type="date" value={formData.fecha}
                  onChange={e => setFormData(f => ({ ...f, fecha: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500" />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Notas (opcional)</label>
                <textarea value={formData.notas}
                  onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))}
                  rows={2} placeholder="Detalle adicional..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500 resize-none" />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-body text-sm">
                  <Save className="w-4 h-4" /> {saving ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm">
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
