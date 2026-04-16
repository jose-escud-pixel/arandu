import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Edit2, Trash2, CheckCircle, Clock, AlertCircle,
  ChevronLeft, ChevronRight, X, Save, ToggleLeft, ToggleRight
} from "lucide-react";
import EmpresaSwitcher from "../components/EmpresaSwitcher";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FRECUENCIAS = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
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

const emptyForm = {
  empresa_id: "",
  logo_tipo: "arandujar",
  nombre: "",
  descripcion: "",
  monto: "",
  moneda: "PYG",
  tipo_cambio: "",
  frecuencia: "mensual",
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_fin: "",
  activo: true,
  notas: "",
};

export default function ContratosPage() {
  const { token, hasPermission, activeEmpresaPropia } = useContext(AuthContext);
  const navigate = useNavigate();
  const [contratos, setContratos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [periodo, setPeriodo] = useState(getCurrentPeriod());
  const [loading, setLoading] = useState(true);
  const [cobrosLoading, setCobrosLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [activeTab, setActiveTab] = useState("cobros"); // "cobros" | "contratos"
  // logoFilter: computed from active empresa (no longer a state)
  const logoFilter = activeEmpresaPropia?.slug || "todas";
  const [searchTerm, setSearchTerm] = useState("");
  const [vistaAnual, setVistaAnual] = useState(false);
  const [anioAnual, setAnioAnual] = useState(new Date().getFullYear());
  const [cobrosAnuales, setCobrosAnuales] = useState([]);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchEmpresas = async () => {
    const q = new URLSearchParams();
    if (logoFilter !== "todas") q.set("logo_tipo", logoFilter);
    const res = await fetch(`${API}/admin/empresas${q.toString() ? `?${q}` : ""}`, { headers });
    if (res.ok) setEmpresas(await res.json());
  };

  const fetchContratos = async () => {
    const q = new URLSearchParams();
    if (logoFilter !== "todas") q.set("logo_tipo", logoFilter);
    const res = await fetch(`${API}/admin/contratos${q.toString() ? `?${q}` : ""}`, { headers });
    if (res.ok) setContratos(await res.json());
  };

  const fetchCobros = async (p, search = "") => {
    setCobrosLoading(true);
    const q = new URLSearchParams({ periodo: p });
    if (search) q.set("search", search);
    if (logoFilter !== "todas") q.set("logo_tipo", logoFilter);
    const url = `${API}/admin/contratos/cobros?${q}`;
    const res = await fetch(url, { headers });
    if (res.ok) setCobros(await res.json());
    setCobrosLoading(false);
  };

  const loadCobrosAnuales = async () => {
    setCobrosLoading(true);
    try {
      const url = `${API}/admin/contratos/cobros-anuales?year=${anioAnual}${logoFilter !== "todas" ? `&logo_tipo=${logoFilter}` : ""}`;
      const res = await fetch(url, { headers });
      if (res.ok) setCobrosAnuales(await res.json());
    } catch (e) { console.error(e); } finally { setCobrosLoading(false); }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchEmpresas(), fetchContratos()]);
      await fetchCobros(periodo);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line
  }, [activeEmpresaPropia]);

  useEffect(() => {
    fetchCobros(periodo, searchTerm);
    // eslint-disable-next-line
  }, [periodo]);

  useEffect(() => {
    if (vistaAnual) {
      loadCobrosAnuales();
    }
    // eslint-disable-next-line
  }, [vistaAnual, anioAnual, logoFilter]);

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary = React.useMemo(() => {
    let esperadoPYG = 0, esperadoUSD = 0;
    let cobradoPYG = 0, cobradoUSD = 0;
    cobros.forEach(c => {
      const monto = c.monto || 0;
      if (c.moneda === "USD") esperadoUSD += monto;
      else esperadoPYG += monto;
      if (c.estado === "pagado" && c.cobro) {
        if (c.moneda === "USD") cobradoUSD += c.cobro.monto_pagado;
        else cobradoPYG += c.cobro.monto_pagado;
      }
    });
    return { esperadoPYG, esperadoUSD, cobradoPYG, cobradoUSD, pendientePYG: esperadoPYG - cobradoPYG, pendienteUSD: esperadoUSD - cobradoUSD };
  }, [cobros]);

  // ── Form handlers ─────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setFormData({
      empresa_id: c.empresa_id,
      logo_tipo: c.logo_tipo || "arandujar",
      nombre: c.nombre,
      descripcion: c.descripcion || "",
      monto: c.monto,
      moneda: c.moneda,
      tipo_cambio: c.tipo_cambio || "",
      frecuencia: c.frecuencia,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin || "",
      activo: c.activo,
      notas: c.notas || "",
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const toFloat = v => (v === "" || v === null || v === undefined) ? null : parseFloat(v) || null;
    const payload = {
      ...formData,
      logo_tipo: activeEmpresaPropia?.slug || formData.logo_tipo || "arandujar",
      monto: parseFloat(formData.monto) || 0,
      tipo_cambio: toFloat(formData.tipo_cambio),
      dia_cobro: 1, // default, not editable from UI
      fecha_fin: formData.fecha_fin || null,
      descripcion: formData.descripcion || null,
      notas: formData.notas || null,
    };
    const url = editingId ? `${API}/admin/contratos/${editingId}` : `${API}/admin/contratos`;
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(editingId ? "Contrato actualizado" : "Contrato creado");
      setShowForm(false);
      await Promise.all([fetchContratos(), fetchCobros(periodo)]);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al guardar");
    }
  };

  const handleToggle = async (c) => {
    const res = await fetch(`${API}/admin/contratos/${c.id}/toggle`, { method: "PATCH", headers });
    if (res.ok) {
      toast.success(c.activo ? "Contrato desactivado" : "Contrato activado");
      fetchContratos();
      fetchCobros(periodo);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`¿Eliminar contrato "${c.nombre}"? Se eliminarán también todos los cobros.`)) return;
    const res = await fetch(`${API}/admin/contratos/${c.id}`, { method: "DELETE", headers });
    if (res.ok) {
      toast.success("Contrato eliminado");
      fetchContratos();
      fetchCobros(periodo);
    }
  };

  // ── Estado badge ─────────────────────────────────────────────────────────
  const EstadoBadge = ({ estado }) => {
    if (estado === "pagado") return (
      <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
        <CheckCircle className="w-3.5 h-3.5" /> Pagado
      </span>
    );
    if (estado === "vencido") return (
      <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
        <AlertCircle className="w-3.5 h-3.5" /> Vencido
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-yellow-400 text-xs font-semibold">
        <Clock className="w-3.5 h-3.5" /> Pendiente
      </span>
    );
  };

  if (loading) return (
    <div className="min-h-screen bg-arandu-dark flex items-center justify-center">
      <div className="text-arandu-blue-light animate-pulse font-heading text-xl">Cargando contratos...</div>
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
            <h1 className="font-heading text-2xl text-white">Contratos</h1>
            <p className="text-slate-400 text-sm font-body">Gestión de contratos de servicio</p>
          </div>
          <EmpresaSwitcher compact />
        </div>
        {hasPermission("contratos.crear") && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo contrato
          </button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10">
          <button
            onClick={() => setActiveTab("cobros")}
            className={`px-4 py-2 text-sm font-body border-b-2 transition-colors ${activeTab === "cobros" ? "border-arandu-blue text-arandu-blue-light" : "border-transparent text-slate-400 hover:text-white"}`}
          >
            Cobros del periodo
          </button>
          <button
            onClick={() => setActiveTab("contratos")}
            className={`px-4 py-2 text-sm font-body border-b-2 transition-colors ${activeTab === "contratos" ? "border-arandu-blue text-arandu-blue-light" : "border-transparent text-slate-400 hover:text-white"}`}
          >
            Todos los contratos
          </button>
        </div>

        {activeTab === "cobros" && (
          <>
            {/* Search and View Toggle */}
            <div className="flex gap-4 flex-wrap items-center">
              <div className="flex-1 min-w-xs">
                <input
                  type="text"
                  placeholder="Buscar contrato..."
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    if (!vistaAnual) fetchCobros(periodo, e.target.value);
                  }}
                  className="w-full bg-arandu-dark-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-arandu-blue/50"
                />
              </div>
              <button
                onClick={() => setVistaAnual(!vistaAnual)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  vistaAnual
                    ? "bg-arandu-blue text-white border-arandu-blue"
                    : "bg-white/5 text-slate-400 border border-white/10 hover:text-white"
                }`}
              >
                {vistaAnual ? "Vista anual" : "Vista mensual"}
              </button>
            </div>

            {!vistaAnual && (
              <>
                {/* Period navigator */}
                <div className="flex items-center justify-between">
                  <button onClick={() => setPeriodo(p => navigatePeriod(p, -1))} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="font-heading text-xl text-white">{periodLabel(periodo)}</span>
                  <button onClick={() => setPeriodo(p => navigatePeriod(p, 1))} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {vistaAnual && (
              <>
                {/* Annual view year selector */}
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setAnioAnual(anioAnual - 1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="font-heading text-xl text-white">{anioAnual}</span>
                  <button onClick={() => setAnioAnual(anioAnual + 1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {!vistaAnual && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-slate-400 text-xs font-body mb-1">Esperado</p>
                    {summary.esperadoPYG > 0 && <p className="font-heading text-lg text-white">{fmtNum(summary.esperadoPYG, "PYG")}</p>}
                    {summary.esperadoUSD > 0 && <p className="font-heading text-lg text-white">{fmtNum(summary.esperadoUSD, "USD")}</p>}
                    {summary.esperadoPYG === 0 && summary.esperadoUSD === 0 && <p className="text-slate-500 text-sm">Sin contratos</p>}
                  </div>
                  <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                    <p className="text-green-400 text-xs font-body mb-1">Cobrado</p>
                    {summary.cobradoPYG > 0 && <p className="font-heading text-lg text-green-300">{fmtNum(summary.cobradoPYG, "PYG")}</p>}
                    {summary.cobradoUSD > 0 && <p className="font-heading text-lg text-green-300">{fmtNum(summary.cobradoUSD, "USD")}</p>}
                    {summary.cobradoPYG === 0 && summary.cobradoUSD === 0 && <p className="text-green-700 text-sm">₲ 0</p>}
                  </div>
                  <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20">
                    <p className="text-yellow-400 text-xs font-body mb-1">Pendiente</p>
                    {summary.pendientePYG > 0 && <p className="font-heading text-lg text-yellow-300">{fmtNum(summary.pendientePYG, "PYG")}</p>}
                    {summary.pendienteUSD > 0 && <p className="font-heading text-lg text-yellow-300">{fmtNum(summary.pendienteUSD, "USD")}</p>}
                    {summary.pendientePYG === 0 && summary.pendienteUSD === 0 && <p className="text-yellow-700 text-sm">₲ 0</p>}
                  </div>
                </div>
              </>
            )}

            {/* Cobros table */}
            {!vistaAnual && (
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              {cobrosLoading ? (
                <div className="p-8 text-center text-slate-400">Cargando...</div>
              ) : cobros.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-body">No hay contratos activos para este periodo</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                      <th className="px-4 py-3 text-left font-body">Empresa</th>
                      <th className="px-4 py-3 text-left font-body">Contrato</th>
                      <th className="px-4 py-3 text-left font-body">Frecuencia</th>
                      <th className="px-4 py-3 text-right font-body">Monto</th>
                      <th className="px-4 py-3 text-center font-body">Estado</th>
                      <th className="px-4 py-3 text-center font-body">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobros.filter(c => logoFilter === "todas" || c.logo_tipo === logoFilter).map((c, i) => (
                      <tr key={c.contrato_id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${i % 2 === 0 ? "" : "bg-white/2"}`}>
                        <td className="px-4 py-3 font-body text-slate-300">{c.empresa_nombre}</td>
                        <td className="px-4 py-3 font-body text-white">{c.nombre}</td>
                        <td className="px-4 py-3 font-body text-slate-400 capitalize">{c.frecuencia}</td>
                        <td className="px-4 py-3 font-heading text-right text-white">{fmtNum(c.monto, c.moneda)}</td>
                        <td className="px-4 py-3 text-center"><EstadoBadge estado={c.estado} /></td>
                        <td className="px-4 py-3 text-center text-slate-500 text-xs">
                          Gestionar en Facturas
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}

            {/* Annual view table */}
            {vistaAnual && (
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-x-auto">
                {cobrosLoading ? (
                  <div className="p-8 text-center text-slate-400">Cargando...</div>
                ) : cobrosAnuales.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-body">No hay contratos para este año</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 uppercase">
                        <th className="px-3 py-3 text-left font-body min-w-[120px]">Empresa</th>
                        <th className="px-3 py-3 text-left font-body min-w-[150px]">Contrato</th>
                        {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map(m => (
                          <th key={m} className="px-2 py-3 text-center font-body">{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cobrosAnuales.filter(c => logoFilter === "todas" || c.logo_tipo === logoFilter).map((c, i) => (
                        <tr key={c.contrato_id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${i % 2 === 0 ? "" : "bg-white/2"}`}>
                          <td className="px-3 py-3 font-body text-slate-300 truncate">{c.empresa_nombre}</td>
                          <td className="px-3 py-3 font-body text-white truncate">{c.nombre}</td>
                          {Object.values(c.meses).map((mes, idx) => {
                            let badgeColor = "bg-slate-700 text-slate-300";
                            if (mes.estado === "pagado") badgeColor = "bg-green-600 text-green-100";
                            else if (mes.estado === "vencido") badgeColor = "bg-red-600 text-red-100";
                            else if (mes.estado === "pendiente") badgeColor = "bg-yellow-600 text-yellow-100";
                            return (
                              <td key={idx} className="px-2 py-3 text-center">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${badgeColor}`}>
                                  {mes.estado === "no_aplica" ? "—" : mes.estado === "pagado" ? "✓" : mes.estado === "vencido" ? "!" : "○"}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "contratos" && (
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {contratos.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-body">No hay contratos registrados</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                    <th className="px-4 py-3 text-left font-body">Empresa</th>
                    <th className="px-4 py-3 text-left font-body">Contrato</th>
                    <th className="px-4 py-3 text-left font-body">Frecuencia</th>
                    <th className="px-4 py-3 text-right font-body">Monto</th>
                    <th className="px-4 py-3 text-left font-body">Inicio</th>
                    <th className="px-4 py-3 text-left font-body">Fin</th>
                    <th className="px-4 py-3 text-center font-body">Estado</th>
                    <th className="px-4 py-3 text-center font-body">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.filter(c => logoFilter === "todas" || c.logo_tipo === logoFilter).map((c, i) => (
                    <tr key={c.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${!c.activo ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 font-body text-slate-300">{c.empresa_nombre}</td>
                      <td className="px-4 py-3">
                        <div className="font-body text-white">{c.nombre}</div>
                        {c.descripcion && <div className="text-slate-500 text-xs">{c.descripcion}</div>}
                      </td>
                      <td className="px-4 py-3 font-body text-slate-400 capitalize">{c.frecuencia}</td>
                      <td className="px-4 py-3 font-heading text-right text-white">{fmtNum(c.monto, c.moneda)}</td>
                      <td className="px-4 py-3 font-body text-slate-400 text-xs">{c.fecha_inicio}</td>
                      <td className="px-4 py-3 font-body text-slate-400 text-xs">{c.fecha_fin || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${c.activo ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}`}>
                          {c.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {hasPermission("contratos.editar") && (
                            <>
                              <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleToggle(c)} className="text-slate-400 hover:text-yellow-400 transition-colors" title={c.activo ? "Desactivar" : "Activar"}>
                                {c.activo ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                              </button>
                            </>
                          )}
                          {hasPermission("contratos.eliminar") && (
                            <button onClick={() => handleDelete(c)} className="text-slate-400 hover:text-red-400 transition-colors" title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
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

      {/* ── Contrato Form Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-heading text-lg text-white">{editingId ? "Editar contrato" : "Nuevo contrato"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Empresa cliente *</label>
                <select
                  required
                  value={formData.empresa_id}
                  onChange={e => setFormData(f => ({ ...f, empresa_id: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                >
                  <option value="">Seleccionar...</option>
                  {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Nombre del servicio *</label>
                <input
                  required
                  type="text"
                  value={formData.nombre}
                  onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Soporte mensual, Hosting, etc."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Descripción</label>
                <input
                  type="text"
                  value={formData.descripcion}
                  onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Monto *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={formData.monto}
                    onChange={e => setFormData(f => ({ ...f, monto: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Moneda</label>
                  <select
                    value={formData.moneda}
                    onChange={e => setFormData(f => ({ ...f, moneda: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  >
                    <option value="PYG">₲ Guaraníes</option>
                    <option value="USD">$ Dólares</option>
                  </select>
                </div>
              </div>
              {formData.moneda === "USD" && (
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Tipo de cambio (opcional)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.tipo_cambio}
                    onChange={e => setFormData(f => ({ ...f, tipo_cambio: e.target.value }))}
                    placeholder="Ej: 7600"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Frecuencia</label>
                <select
                  value={formData.frecuencia}
                  onChange={e => setFormData(f => ({ ...f, frecuencia: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                >
                  {FRECUENCIAS.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Fecha inicio *</label>
                  <input
                    required
                    type="date"
                    value={formData.fecha_inicio}
                    onChange={e => setFormData(f => ({ ...f, fecha_inicio: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Fecha fin (opcional)</label>
                  <input
                    type="date"
                    value={formData.fecha_fin}
                    onChange={e => setFormData(f => ({ ...f, fecha_fin: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Notas</label>
                <textarea
                  value={formData.notas}
                  onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm"
                >
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
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
