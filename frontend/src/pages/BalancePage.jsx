import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Scale, ArrowLeft, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Wallet, Settings, X,
  ArrowUpRight, ArrowDownLeft, CheckCircle, RefreshCw, Plus, Trash2, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { AuthContext } from "../App";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Constantes ───────────────────────────────────────────────

const MONEDAS = ["PYG", "USD", "BRL", "ARS"];

const MESES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const FUENTE_COLOR = {
  "Contratos":           "text-blue-400",
  "Facturas emitidas":   "text-cyan-400",
  "Costos fijos":        "text-orange-400",
  "Sueldos":             "text-violet-400",
  "Facturas recibidas":  "text-red-400",
};

function getMesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getAnioActual() {
  return new Date().getFullYear();
}

function mesLabel(p) {
  const [y, m] = p.split("-");
  return `${MESES_LABEL[parseInt(m, 10) - 1]} ${y}`;
}

function prevMes(p) {
  const [y, m] = p.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMes(p) {
  const [y, m] = p.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function fmtPYG(n) {
  if (!n && n !== 0) return "₲ 0";
  const abs = Math.abs(n);
  const fmt = `₲ ${Number(abs).toLocaleString("es-PY", { maximumFractionDigits: 0 })}`;
  return n < 0 ? `−${fmt}` : fmt;
}

function fmtUSD(n) {
  if (!n && n !== 0) return "$ 0.00";
  const abs = Math.abs(n);
  const fmt = `$ ${Number(abs).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `−${fmt}` : fmt;
}

function toFloat(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// Barra proporcional
function PropBar({ ingreso, egreso }) {
  const total = ingreso + egreso;
  if (!total) return null;
  const pct = Math.round((ingreso / total) * 100);
  return (
    <div className="h-2 rounded-full bg-white/10 overflow-hidden flex">
      <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      <div className="h-full bg-red-500 flex-1" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
export default function BalancePage() {
  const { token, empresasPropias } = useContext(AuthContext);
  // Build dynamic LOGOS list from context
  const LOGOS = [
    { value: "todas", label: "Todas las empresas", color: "bg-slate-700 text-slate-200" },
    ...empresasPropias.map(e => ({ value: e.slug, label: e.nombre, color: "bg-arandu-blue text-white" })),
  ];
  const navigate = useNavigate();

  const [vista, setVista] = useState("mes");  // "mes" | "anual" | "iva"
  const [logoFilter, setLogoFilter] = useState("todas");
  const [periodo, setPeriodo] = useState(getMesActual());
  const [anio, setAnio] = useState(getAnioActual());

  const [balanceMes, setBalanceMes] = useState(null);
  const [balanceAnual, setBalanceAnual] = useState(null);
  const [loading, setLoading] = useState(false);

  const [ivaData, setIvaData] = useState(null);
  const [loadingIva, setLoadingIva] = useState(false);

  // Superávit modal
  const [showSuperavit, setShowSuperavit] = useState(false);
  const [superavitConfig, setSuperavitConfig] = useState([]);
  const [superavitForm, setSuperavitForm] = useState({
    logo_tipo: "todas", monto: "", moneda: "PYG", tipo_cambio: "", notas: "", monto_usd: ""
  });
  const [savingSuperavit, setSavingSuperavit] = useState(false);

  // Conversiones de divisas
  const [conversiones, setConversiones] = useState([]);
  const [showConvModal, setShowConvModal] = useState(false);
  const emptyConvForm = { fecha: new Date().toISOString().slice(0, 10), moneda_origen: "USD", monto_origen: "", tipo_cambio: "", notas: "", logo_tipo: logoFilter !== "todas" ? logoFilter : "todas" };
  const [convForm, setConvForm] = useState(emptyConvForm);
  const [savingConv, setSavingConv] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  // ── Fetch ──────────────────────────────────────────────────
  const fetchMes = useCallback(async () => {
    setLoading(true);
    try {
      let q = `?periodo=${periodo}`;
      if (logoFilter !== "todas") q += `&logo_tipo=${logoFilter}`;
      const res = await fetch(`${API}/admin/balance${q}`, { headers });
      if (res.ok) setBalanceMes(await res.json());
    } catch { toast.error("Error al cargar balance"); }
    finally { setLoading(false); }
  }, [periodo, logoFilter]); // eslint-disable-line

  const fetchAnual = useCallback(async () => {
    setLoading(true);
    try {
      let q = `?anio=${anio}`;
      if (logoFilter !== "todas") q += `&logo_tipo=${logoFilter}`;
      const res = await fetch(`${API}/admin/balance/anual${q}`, { headers });
      if (res.ok) setBalanceAnual(await res.json());
    } catch { toast.error("Error al cargar balance anual"); }
    finally { setLoading(false); }
  }, [anio, logoFilter]); // eslint-disable-line

  const fetchSuperavitConfig = async () => {
    const res = await fetch(`${API}/admin/balance/superavit`, { headers });
    if (res.ok) setSuperavitConfig(await res.json());
  };

  const fetchConversiones = useCallback(async () => {
    try {
      let q = `?periodo=${periodo}`;
      if (logoFilter !== "todas") q += `&logo_tipo=${logoFilter}`;
      const res = await fetch(`${API}/admin/balance/conversiones${q}`, { headers });
      if (res.ok) setConversiones(await res.json());
    } catch { /* silent */ }
  }, [periodo, logoFilter]); // eslint-disable-line

  const fetchIva = useCallback(async () => {
    setLoadingIva(true);
    try {
      let q = `?periodo=${periodo}`;
      if (logoFilter !== "todas") q += `&logo_tipo=${logoFilter}`;
      const res = await fetch(`${API}/admin/balance/iva${q}`, { headers });
      if (res.ok) setIvaData(await res.json());
    } catch { toast.error("Error al cargar IVA"); }
    finally { setLoadingIva(false); }
  }, [periodo, logoFilter]); // eslint-disable-line

  useEffect(() => {
    if (vista === "mes") { fetchMes(); fetchConversiones(); }
    else if (vista === "anual") fetchAnual();
    else if (vista === "iva") fetchIva();
  }, [vista, fetchMes, fetchAnual, fetchConversiones, fetchIva]);

  // ── Superávit ──────────────────────────────────────────────
  const openSuperavit = async () => {
    await fetchSuperavitConfig();
    setSuperavitForm({ logo_tipo: "todas", monto: "", moneda: "PYG", tipo_cambio: "", notas: "", monto_usd: "" });
    setShowSuperavit(true);
  };

  const handleSaveSuperavit = async () => {
    if (!superavitForm.monto) { toast.error("Monto requerido"); return; }
    setSavingSuperavit(true);
    try {
      const payload = {
        logo_tipo: superavitForm.logo_tipo,
        monto: toFloat(superavitForm.monto) ?? 0,
        moneda: superavitForm.moneda,
        tipo_cambio: toFloat(superavitForm.tipo_cambio),
        notas: superavitForm.notas || null,
        monto_usd: toFloat(superavitForm.monto_usd),
      };
      const res = await fetch(`${API}/admin/balance/superavit`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Superávit guardado");
      await fetchSuperavitConfig();
      if (vista === "mes") fetchMes(); else fetchAnual();
    } catch { toast.error("Error al guardar"); }
    finally { setSavingSuperavit(false); }
  };

  const handleDeleteSuperavit = async (logo_tipo) => {
    if (!window.confirm(`¿Eliminar el superávit de "${logo_tipo === "todas" ? "Todas las empresas" : logo_tipo}"?`)) return;
    try {
      const res = await fetch(`${API}/admin/balance/superavit/${logo_tipo}`, {
        method: "DELETE", headers,
      });
      if (!res.ok) throw new Error();
      toast.success("Superávit eliminado");
      await fetchSuperavitConfig();
      if (vista === "mes") fetchMes(); else fetchAnual();
    } catch { toast.error("Error al eliminar"); }
  };

  // ── Conversiones ──────────────────────────────────────────
  const openConvModal = () => {
    setConvForm({
      fecha: new Date().toISOString().slice(0, 10),
      moneda_origen: "USD",
      monto_origen: "",
      tipo_cambio: "",
      notas: "",
      logo_tipo: logoFilter !== "todas" ? logoFilter : "todas",
    });
    setShowConvModal(true);
  };

  const handleSaveConversion = async () => {
    if (!convForm.monto_origen || !convForm.tipo_cambio) { toast.error("Monto y tipo de cambio requeridos"); return; }
    setSavingConv(true);
    try {
      const payload = {
        ...convForm,
        periodo: convForm.fecha.slice(0, 7),
        monto_origen: parseFloat(convForm.monto_origen),
        tipo_cambio: parseFloat(convForm.tipo_cambio),
      };
      const res = await fetch(`${API}/admin/balance/conversiones`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Conversión registrada");
      setShowConvModal(false);
      fetchConversiones();
    } catch { toast.error("Error al guardar conversión"); }
    finally { setSavingConv(false); }
  };

  const handleDeleteConversion = async (id) => {
    if (!window.confirm("¿Eliminar esta conversión?")) return;
    try {
      await fetch(`${API}/admin/balance/conversiones/${id}`, { method: "DELETE", headers });
      toast.success("Conversión eliminada");
      fetchConversiones();
    } catch { toast.error("Error al eliminar"); }
  };

  // ─── Helper UI ────────────────────────────────────────────
  const BalanceChip = ({ valor, big = false }) => {
    const pos = valor >= 0;
    return (
      <span className={`font-heading font-bold ${big ? "text-3xl" : "text-lg"} ${pos ? "text-emerald-400" : "text-red-400"}`}>
        {pos ? "+" : ""}{fmtPYG(valor)}
      </span>
    );
  };

  // ═══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-arandu-dark">

      {/* Header */}
      <header className="bg-arandu-dark-light border-b border-white/5 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/admin")} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center">
                <Scale className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-white text-xl">Balance & Tesorería</h1>
                <p className="text-slate-500 text-xs">Ingresos, egresos y saldo acumulado</p>
              </div>
            </div>
          </div>
          <button onClick={openSuperavit} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 text-sm px-4 py-2 rounded-lg border border-white/10 transition-all">
            <Settings className="w-4 h-4" /> Superávit inicial
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Filtro empresa */}
        <div className="flex flex-wrap gap-2 items-center">
          {LOGOS.map(l => (
            <button key={l.value} onClick={() => setLogoFilter(l.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                logoFilter === l.value ? `${l.color} border-transparent shadow-lg` : "bg-transparent border-white/10 text-slate-400 hover:text-white hover:border-white/20"
              }`}>
              {l.label}
            </button>
          ))}
        </div>

        {/* Vista tabs */}
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
            {[{ key: "mes", label: "Mensual" }, { key: "anual", label: "Anual" }, { key: "iva", label: "🧾 IVA Fiscal" }].map(v => (
              <button key={v.key} onClick={() => setVista(v.key)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  vista === v.key
                    ? v.key === "iva" ? "bg-amber-600 text-white shadow" : "bg-teal-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Navegación periodo */}
          {vista === "mes" ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setPeriodo(prevMes(periodo))} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-white font-heading font-semibold min-w-[110px] text-center">{mesLabel(periodo)}</span>
              <button onClick={() => setPeriodo(nextMes(periodo))} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                <ChevronRight className="w-5 h-5" />
              </button>
              <button onClick={() => setPeriodo(getMesActual())} className="text-xs text-slate-500 hover:text-white px-3 py-1 rounded border border-white/10 hover:border-white/20 transition-all">
                Hoy
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setAnio(a => a - 1)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-white font-heading font-semibold text-lg min-w-[60px] text-center">{anio}</span>
              <button onClick={() => setAnio(a => a + 1)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-slate-500 text-center py-16">Calculando balance...</div>
        ) : (

          <>
          {/* ══ VISTA MENSUAL ══ */}
          {vista === "mes" && balanceMes && (
            <div className="space-y-6">

              {/* Cards principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 text-xs">Ingresos</span>
                  </div>
                  <p className="text-emerald-300 font-heading font-bold text-2xl">{fmtPYG(balanceMes.total_ingresos)}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 text-xs">Egresos</span>
                  </div>
                  <p className="text-red-300 font-heading font-bold text-2xl">{fmtPYG(balanceMes.total_egresos)}</p>
                </div>
                <div className={`border rounded-xl p-4 ${balanceMes.balance >= 0 ? "bg-teal-500/10 border-teal-500/20" : "bg-orange-500/10 border-orange-500/20"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Scale className={`w-4 h-4 ${balanceMes.balance >= 0 ? "text-teal-400" : "text-orange-400"}`} />
                    <span className={`text-xs ${balanceMes.balance >= 0 ? "text-teal-400" : "text-orange-400"}`}>Balance del mes</span>
                  </div>
                  <BalanceChip valor={balanceMes.balance} big />
                </div>
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-violet-400" />
                    <span className="text-violet-400 text-xs">Saldo acumulado</span>
                  </div>
                  <p className={`font-heading font-bold text-2xl ${balanceMes.saldo_acumulado >= 0 ? "text-violet-300" : "text-red-400"}`}>
                    {fmtPYG(balanceMes.saldo_acumulado)}
                  </p>
                  {balanceMes.superavit_inicial > 0 && (
                    <p className="text-slate-500 text-xs mt-1">Superávit inicial: {fmtPYG(balanceMes.superavit_inicial)}</p>
                  )}
                </div>
              </div>

              {/* Mini-cards USD (solo si hay movimientos en USD o saldo acumulado USD) */}
              {((balanceMes.total_ingresos_usd || 0) > 0 || (balanceMes.total_egresos_usd || 0) > 0 || (balanceMes.saldo_acumulado_usd || 0) !== 0) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400 text-xs">Ingresos USD</span>
                    </div>
                    <p className="text-amber-300 font-heading font-semibold text-xl">{fmtUSD(balanceMes.total_ingresos_usd || 0)}</p>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-orange-400 text-xs">Egresos USD</span>
                    </div>
                    <p className="text-orange-300 font-heading font-semibold text-xl">{fmtUSD(balanceMes.total_egresos_usd || 0)}</p>
                  </div>
                  {(() => {
                    const balUSD = (balanceMes.total_ingresos_usd || 0) - (balanceMes.total_egresos_usd || 0);
                    return (
                      <div className={`border rounded-xl p-3 ${balUSD >= 0 ? "bg-teal-500/10 border-teal-500/20" : "bg-orange-500/10 border-orange-500/20"}`}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Scale className={`w-3.5 h-3.5 ${balUSD >= 0 ? "text-teal-400" : "text-orange-400"}`} />
                          <span className={`text-xs ${balUSD >= 0 ? "text-teal-400" : "text-orange-400"}`}>Balance USD mes</span>
                        </div>
                        <p className={`font-heading font-semibold text-xl ${balUSD >= 0 ? "text-teal-300" : "text-orange-300"}`}>
                          {balUSD >= 0 ? "+" : "−"}{fmtUSD(Math.abs(balUSD))}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wallet className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400 text-xs">Saldo acumulado USD</span>
                    </div>
                    <p className={`font-heading font-semibold text-xl ${(balanceMes.saldo_acumulado_usd || 0) >= 0 ? "text-amber-300" : "text-red-400"}`}>
                      {fmtUSD(balanceMes.saldo_acumulado_usd || 0)}
                    </p>
                    {(balanceMes.superavit_inicial_usd || 0) > 0 && (
                      <p className="text-slate-500 text-xs mt-0.5">Superávit: {fmtUSD(balanceMes.superavit_inicial_usd)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Barra proporcional */}
              <PropBar ingreso={balanceMes.total_ingresos} egreso={balanceMes.total_egresos} />

              {/* Detalle ingresos / egresos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Ingresos */}
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-emerald-500/5">
                    <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300 font-medium text-sm">Ingresos</span>
                    <span className="ml-auto text-emerald-400 font-heading font-bold">{fmtPYG(balanceMes.total_ingresos)}</span>
                  </div>
                  {balanceMes.ingresos_detalle.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-6">Sin ingresos registrados</p>
                  ) : (
                    balanceMes.ingresos_detalle.map(d => (
                      <div key={d.fuente} className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <div>
                          <span className={`text-sm font-medium ${FUENTE_COLOR[d.fuente] || "text-slate-300"}`}>{d.fuente}</span>
                          <span className="text-slate-500 text-xs ml-2">({d.cantidad})</span>
                        </div>
                        <span className="text-emerald-300 font-heading font-semibold text-sm">{fmtPYG(d.monto_pyg)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Egresos */}
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-red-500/5">
                    <ArrowDownLeft className="w-4 h-4 text-red-400" />
                    <span className="text-red-300 font-medium text-sm">Egresos</span>
                    <span className="ml-auto text-red-400 font-heading font-bold">{fmtPYG(balanceMes.total_egresos)}</span>
                  </div>
                  {balanceMes.egresos_detalle.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-6">Sin egresos registrados</p>
                  ) : (
                    balanceMes.egresos_detalle.map(d => (
                      <div key={d.fuente} className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <div>
                          <span className={`text-sm font-medium ${FUENTE_COLOR[d.fuente] || "text-slate-300"}`}>{d.fuente}</span>
                          <span className="text-slate-500 text-xs ml-2">({d.cantidad})</span>
                        </div>
                        <span className="text-red-300 font-heading font-semibold text-sm">{fmtPYG(d.monto_pyg)}</span>
                      </div>
                    ))
                  )}
                </div>

              </div>

              {/* ── Panel USD ── */}
              {((balanceMes.total_ingresos_usd || 0) > 0 || (balanceMes.total_egresos_usd || 0) > 0) && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/20">
                    <span className="text-amber-300 font-medium text-sm">💵 Movimientos en USD</span>
                    <span className="text-slate-500 text-xs ml-1">en moneda de origen</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-x divide-white/5">
                    {/* Ingresos USD */}
                    <div>
                      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-emerald-500/5">
                        <span className="text-emerald-300 text-xs font-medium">Ingresos USD</span>
                        <span className="text-emerald-300 font-heading font-bold">
                          $ {Number(balanceMes.total_ingresos_usd || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {(balanceMes.ingresos_usd_detalle || []).length === 0 ? (
                        <p className="text-slate-600 text-xs text-center py-3">Sin ingresos USD</p>
                      ) : (
                        (balanceMes.ingresos_usd_detalle || []).map(d => (
                          <div key={d.fuente} className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                            <span className={`text-xs font-medium ${FUENTE_COLOR[d.fuente] || "text-slate-300"}`}>{d.fuente}</span>
                            <span className="text-emerald-300 text-xs font-heading">
                              $ {Number(d.monto_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Egresos USD */}
                    <div>
                      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-red-500/5">
                        <span className="text-red-300 text-xs font-medium">Egresos USD</span>
                        <span className="text-red-300 font-heading font-bold">
                          $ {Number(balanceMes.total_egresos_usd || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {(balanceMes.egresos_usd_detalle || []).length === 0 ? (
                        <p className="text-slate-600 text-xs text-center py-3">Sin egresos USD</p>
                      ) : (
                        (balanceMes.egresos_usd_detalle || []).map(d => (
                          <div key={d.fuente} className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                            <span className={`text-xs font-medium ${FUENTE_COLOR[d.fuente] || "text-slate-300"}`}>{d.fuente}</span>
                            <span className="text-red-300 text-xs font-heading">
                              $ {Number(d.monto_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-2 border-t border-amber-500/20 flex items-center justify-between">
                    <span className="text-slate-500 text-xs">Neto USD del mes</span>
                    <span className={`font-heading font-bold text-sm ${
                      (balanceMes.total_ingresos_usd || 0) - (balanceMes.total_egresos_usd || 0) >= 0
                        ? "text-emerald-300" : "text-red-300"
                    }`}>
                      $ {(((balanceMes.total_ingresos_usd || 0) - (balanceMes.total_egresos_usd || 0)) >= 0 ? "" : "−")}
                      {Math.abs((balanceMes.total_ingresos_usd || 0) - (balanceMes.total_egresos_usd || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Conversiones de divisas ── */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-amber-500/5">
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300 font-medium text-sm">Conversiones de divisas</span>
                  <span className="text-slate-500 text-xs ml-1">(registros del período)</span>
                  <button onClick={openConvModal}
                    className="ml-auto flex items-center gap-1 text-xs bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-600/30 px-2.5 py-1 rounded-lg transition-all">
                    <Plus className="w-3 h-3" /> Registrar
                  </button>
                </div>
                {conversiones.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-5">Sin conversiones registradas este mes</p>
                ) : (
                  conversiones.map(c => {
                    const montoResultado = c.monto_pyg_resultado || (c.monto_origen * c.tipo_cambio);
                    return (
                      <div key={c.id} className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <div>
                          <span className="text-white text-sm font-medium">
                            {c.moneda_origen} {Number(c.monto_origen).toLocaleString("es-PY", { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-slate-400 text-xs mx-2">× {Number(c.tipo_cambio).toLocaleString("es-PY")} =</span>
                          <span className="text-amber-300 text-sm font-heading font-semibold">
                            ₲ {Math.round(montoResultado).toLocaleString("es-PY")}
                          </span>
                          {c.notas && <p className="text-slate-500 text-xs mt-0.5">{c.notas}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 text-xs">{c.fecha}</span>
                          <button onClick={() => handleDeleteConversion(c.id)}
                            className="p-1 text-slate-600 hover:text-red-400 rounded transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
                {conversiones.length > 0 && (
                  <div className="px-4 py-2 bg-amber-500/5 border-t border-white/5 text-right">
                    <span className="text-slate-400 text-xs">Total convertido: </span>
                    <span className="text-amber-300 text-sm font-heading font-semibold">
                      ₲ {Math.round(conversiones.reduce((s, c) => s + (c.monto_pyg_resultado || (c.monto_origen * c.tipo_cambio)), 0)).toLocaleString("es-PY")}
                    </span>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ══ VISTA ANUAL ══ */}
          {vista === "anual" && balanceAnual && (
            <div className="space-y-6">

              {/* Resumen anual */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-emerald-400 text-xs mb-1">Ingresos {anio}</p>
                  <p className="text-emerald-300 font-heading font-bold text-xl">{fmtPYG(balanceAnual.total_anual_ingresos)}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <p className="text-red-400 text-xs mb-1">Egresos {anio}</p>
                  <p className="text-red-300 font-heading font-bold text-xl">{fmtPYG(balanceAnual.total_anual_egresos)}</p>
                </div>
                <div className={`border rounded-xl p-4 ${balanceAnual.balance_anual >= 0 ? "bg-teal-500/10 border-teal-500/20" : "bg-orange-500/10 border-orange-500/20"}`}>
                  <p className={`text-xs mb-1 ${balanceAnual.balance_anual >= 0 ? "text-teal-400" : "text-orange-400"}`}>Balance {anio}</p>
                  <BalanceChip valor={balanceAnual.balance_anual} />
                </div>
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                  <p className="text-violet-400 text-xs mb-1">Superávit inicial</p>
                  <p className="text-violet-300 font-heading font-bold text-xl">{fmtPYG(balanceAnual.superavit_inicial)}</p>
                </div>
              </div>

              {/* Tabla mensual */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Mes</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">Ingresos</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">Egresos</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">Balance</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">Acumulado</th>
                      <th className="px-4 py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceAnual.meses.map(m => {
                      const bal = m.balance;
                      const isCurrentMes = m.periodo === getMesActual();
                      return (
                        <tr key={m.periodo}
                          className={`border-b border-white/5 transition-colors ${isCurrentMes ? "bg-teal-500/5" : "hover:bg-white/3"}`}
                        >
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${isCurrentMes ? "text-teal-300" : "text-white"}`}>
                              {mesLabel(m.periodo)}
                            </span>
                            {isCurrentMes && <span className="ml-2 text-xs text-teal-500">◀ actual</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-300 text-sm font-medium">
                            {m.total_ingresos ? fmtPYG(m.total_ingresos) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-red-300 text-sm font-medium">
                            {m.total_egresos ? fmtPYG(m.total_egresos) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {bal === 0 ? (
                              <span className="text-slate-600 text-sm">—</span>
                            ) : (
                              <span className={`text-sm font-heading font-semibold ${bal > 0 ? "text-teal-400" : "text-orange-400"}`}>
                                {bal > 0 ? "+" : ""}{fmtPYG(bal)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-heading font-semibold ${m.acumulado >= 0 ? "text-violet-300" : "text-red-400"}`}>
                              {fmtPYG(m.acumulado)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <PropBar ingreso={m.total_ingresos} egreso={m.total_egresos} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/20 bg-white/5">
                      <td className="px-4 py-3 text-slate-300 text-sm font-medium">Total</td>
                      <td className="px-4 py-3 text-right text-emerald-300 font-heading font-bold">{fmtPYG(balanceAnual.total_anual_ingresos)}</td>
                      <td className="px-4 py-3 text-right text-red-300 font-heading font-bold">{fmtPYG(balanceAnual.total_anual_egresos)}</td>
                      <td className="px-4 py-3 text-right">
                        <BalanceChip valor={balanceAnual.balance_anual} />
                      </td>
                      <td className="px-4 py-3" colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

            </div>
          )}

          {/* ══ VISTA IVA FISCAL ══ */}
          {vista === "iva" && (
            <div className="space-y-6">
              {loadingIva ? (
                <div className="text-slate-500 text-center py-16">Calculando IVA fiscal...</div>
              ) : ivaData ? (
                <>
                  {/* Cards resumen */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-5">
                      <p className="text-cyan-400 text-xs mb-1">IVA Débito Fiscal</p>
                      <p className="text-xs text-slate-500 mb-2">De facturas emitidas</p>
                      <p className="text-cyan-300 font-heading font-bold text-2xl">{fmtPYG(ivaData.iva_debito)}</p>
                    </div>
                    <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-5">
                      <p className="text-violet-400 text-xs mb-1">IVA Crédito Fiscal</p>
                      <p className="text-violet-300 font-heading font-bold text-2xl">{fmtPYG(ivaData.iva_credito)}</p>
                      {ivaData.iva_credito_retenciones > 0 && (
                        <div className="mt-2 space-y-0.5">
                          <p className="text-xs text-slate-500">Compras: {fmtPYG(ivaData.iva_credito_compras)}</p>
                          <p className="text-xs text-amber-400">+ Retenciones: {fmtPYG(ivaData.iva_credito_retenciones)}</p>
                        </div>
                      )}
                      {!ivaData.iva_credito_retenciones && (
                        <p className="text-xs text-slate-500 mt-1">De compras con factura</p>
                      )}
                    </div>
                    <div className={`rounded-xl p-5 border ${ivaData.a_favor ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                      <p className={`text-xs mb-1 ${ivaData.a_favor ? "text-emerald-400" : "text-red-400"}`}>IVA Neto</p>
                      <p className="text-xs text-slate-500 mb-2">{ivaData.a_favor ? "A favor del contribuyente" : "A pagar a la SET"}</p>
                      <p className={`font-heading font-bold text-2xl ${ivaData.a_favor ? "text-emerald-300" : "text-red-300"}`}>
                        {fmtPYG(Math.abs(ivaData.iva_neto))}
                      </p>
                      <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-semibold ${ivaData.a_favor ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {ivaData.a_favor ? "✓ A favor" : "⚠ A pagar"}
                      </span>
                    </div>
                  </div>

                  {/* Detalle débito */}
                  {ivaData.detalle_debito && ivaData.detalle_debito.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                        <span className="text-cyan-400 font-medium text-sm">📄 Facturas Emitidas (Débito Fiscal)</span>
                        <span className="ml-auto text-cyan-300 font-heading font-bold text-sm">{fmtPYG(ivaData.iva_debito)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] text-sm">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left text-slate-400 text-xs font-medium px-4 py-2">Nº / Empresa</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">Monto</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">IVA</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">Tasa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ivaData.detalle_debito.map((d, i) => (
                              <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                                <td className="px-4 py-2">
                                  <p className="text-white">{d.numero || d.descripcion || "—"}</p>
                                  {d.empresa_nombre && <p className="text-slate-500 text-xs">{d.empresa_nombre}</p>}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-300">{fmtPYG(d.monto)}</td>
                                <td className="px-4 py-2 text-right text-cyan-300 font-medium">{fmtPYG(d.iva)}</td>
                                <td className="px-4 py-2 text-right text-slate-400 text-xs">{d.tasa ? `${d.tasa}%` : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Detalle crédito */}
                  {ivaData.detalle_credito && ivaData.detalle_credito.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                        <span className="text-violet-400 font-medium text-sm">🛒 Compras con Factura (Crédito Fiscal)</span>
                        <span className="ml-auto text-violet-300 font-heading font-bold text-sm">{fmtPYG(ivaData.iva_credito)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] text-sm">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left text-slate-400 text-xs font-medium px-4 py-2">Descripción / Proveedor</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">Monto</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">IVA</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">Tasa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ivaData.detalle_credito.map((d, i) => (
                              <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                                <td className="px-4 py-2">
                                  <p className="text-white">{d.descripcion || "—"}</p>
                                  {d.proveedor_nombre && <p className="text-slate-500 text-xs">{d.proveedor_nombre}</p>}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-300">{fmtPYG(d.monto)}</td>
                                <td className="px-4 py-2 text-right text-violet-300 font-medium">{fmtPYG(d.iva)}</td>
                                <td className="px-4 py-2 text-right text-slate-400 text-xs">{d.tasa ? `${d.tasa}%` : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Detalle retenciones */}
                  {ivaData.detalle_retenciones && ivaData.detalle_retenciones.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                        <span className="text-amber-400 font-medium text-sm">🔒 Retenciones de IVA (Clientes que retienen)</span>
                        <span className="ml-auto text-amber-300 font-heading font-bold text-sm">{fmtPYG(ivaData.iva_credito_retenciones)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] text-sm">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left text-slate-400 text-xs font-medium px-4 py-2">Cliente</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">Factura</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">IVA factura</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">% Ret.</th>
                              <th className="text-right text-slate-400 text-xs font-medium px-4 py-2">Retenido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ivaData.detalle_retenciones.map((r, i) => (
                              <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                                <td className="px-4 py-2 text-white">{r.razon_social || "—"}</td>
                                <td className="px-4 py-2 text-right text-slate-400 text-xs">{r.numero_factura || "—"}</td>
                                <td className="px-4 py-2 text-right text-slate-300">{fmtPYG(r.iva_factura)}</td>
                                <td className="px-4 py-2 text-right text-slate-400 text-xs">{r.porcentaje_retencion}%</td>
                                <td className="px-4 py-2 text-right text-amber-300 font-medium">{fmtPYG(r.monto_retenido)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-2 text-xs text-slate-500 border-t border-white/5">
                        Las retenciones de IVA aplicadas por clientes se suman al crédito fiscal del período
                      </div>
                    </div>
                  )}

                  {ivaData.detalle_debito?.length === 0 && ivaData.detalle_credito?.length === 0 && (!ivaData.detalle_retenciones || ivaData.detalle_retenciones.length === 0) && (
                    <div className="text-center py-12 text-slate-500">No hay movimientos de IVA para este período</div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-500">Sin datos de IVA para este período</div>
              )}
            </div>
          )}

          </>
        )}
      </div>

      {/* ══ MODAL SUPERÁVIT INICIAL ══ */}
      {showSuperavit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-white font-heading font-bold text-lg">Superávit inicial</h2>
                <p className="text-slate-400 text-sm mt-0.5">Saldo de inicio de año para el balance acumulado</p>
              </div>
              <button onClick={() => setShowSuperavit(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">

              {/* Configs existentes */}
              {superavitConfig.length > 0 && (
                <div className="space-y-2">
                  <p className="text-slate-400 text-xs uppercase tracking-wider">Configurados</p>
                  {superavitConfig.map(cfg => (
                    <div key={cfg.logo_tipo} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                      <span className="text-slate-300 text-sm capitalize">{cfg.logo_tipo === "todas" ? "Todas las empresas" : cfg.logo_tipo}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-violet-300 font-heading font-semibold text-sm">{fmtPYG(cfg.monto_pyg)}</span>
                        {cfg.monto_usd > 0 && (
                          <span className="text-amber-300 font-heading font-semibold text-sm">{fmtUSD(cfg.monto_usd)}</span>
                        )}
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <button
                          onClick={() => handleDeleteSuperavit(cfg.logo_tipo)}
                          title="Eliminar superávit"
                          className="p-1 text-slate-600 hover:text-red-400 rounded transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-white/10 pt-5 space-y-4">
                <p className="text-slate-300 text-sm font-medium">Agregar / actualizar superávit</p>

                {/* Empresa */}
                <div>
                  <label className="text-slate-400 text-xs block mb-2">Empresa</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { value: "todas",     label: "Todas" },
                      { value: "arandujar", label: "Arandu&JAR" },
                      { value: "arandu",    label: "Arandu" },
                      { value: "jar",       label: "JAR" },
                    ].map(l => (
                      <button key={l.value} type="button"
                        onClick={() => setSuperavitForm(f => ({ ...f, logo_tipo: l.value }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                          superavitForm.logo_tipo === l.value
                            ? "bg-violet-600 border-transparent text-white"
                            : "border-white/10 text-slate-400 hover:text-white"
                        }`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Monto */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-slate-400 text-xs block mb-1">Monto *</label>
                    <input type="number" value={superavitForm.monto} onChange={e => setSuperavitForm(f => ({ ...f, monto: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Moneda</label>
                    <select value={superavitForm.moneda} onChange={e => setSuperavitForm(f => ({ ...f, moneda: e.target.value }))}
                      className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500">
                      {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                {superavitForm.moneda !== "PYG" && (
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Tipo de cambio (a PYG)</label>
                    <input type="number" value={superavitForm.tipo_cambio} onChange={e => setSuperavitForm(f => ({ ...f, tipo_cambio: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                      placeholder="7500"
                    />
                  </div>
                )}

                {/* Superávit en USD */}
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2">
                  <label className="text-amber-400 text-xs font-semibold block">Superávit en USD (opcional)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-sm font-bold">$</span>
                    <input type="number" min="0" step="any" value={superavitForm.monto_usd}
                      onChange={e => setSuperavitForm(f => ({ ...f, monto_usd: e.target.value }))}
                      className="w-full bg-white/5 border border-amber-500/30 rounded-lg pl-7 pr-3 py-2 text-amber-200 text-sm focus:outline-none focus:border-amber-500"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-slate-500 text-xs">Se usa para calcular el saldo acumulado en USD</p>
                </div>

                {/* Notas */}
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Notas</label>
                  <input value={superavitForm.notas} onChange={e => setSuperavitForm(f => ({ ...f, notas: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="Ej: Saldo al 31/12/2025"
                  />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setShowSuperavit(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                    Cerrar
                  </button>
                  <button onClick={handleSaveSuperavit} disabled={savingSuperavit}
                    className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all">
                    {savingSuperavit ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CONVERSIÓN DE DIVISAS ══ */}
      {showConvModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-white font-heading font-bold text-lg">Registrar conversión</h2>
                <p className="text-slate-400 text-sm mt-0.5">USD (u otra moneda) → PYG</p>
              </div>
              <button onClick={() => setShowConvModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Empresa */}
              <div>
                <label className="text-slate-400 text-xs block mb-2">Empresa</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: "todas", label: "Todas" },
                    { value: "arandujar", label: "Arandu&JAR" },
                    { value: "arandu", label: "Arandu" },
                    { value: "jar", label: "JAR" },
                  ].map(l => (
                    <button key={l.value} type="button"
                      onClick={() => setConvForm(f => ({ ...f, logo_tipo: l.value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        convForm.logo_tipo === l.value
                          ? "bg-amber-600 border-transparent text-white"
                          : "border-white/10 text-slate-400 hover:text-white"
                      }`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Fecha *</label>
                <input type="date" value={convForm.fecha} onChange={e => setConvForm(f => ({ ...f, fecha: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Moneda origen + monto */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Moneda</label>
                  <select value={convForm.moneda_origen} onChange={e => setConvForm(f => ({ ...f, moneda_origen: e.target.value }))}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                    {["USD", "BRL", "ARS", "EUR"].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-400 text-xs block mb-1">Monto ({convForm.moneda_origen}) *</label>
                  <input type="number" value={convForm.monto_origen} onChange={e => setConvForm(f => ({ ...f, monto_origen: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Tipo de cambio */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Tipo de cambio (1 {convForm.moneda_origen} = ? PYG) *</label>
                <input type="number" value={convForm.tipo_cambio} onChange={e => setConvForm(f => ({ ...f, tipo_cambio: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="7500"
                />
              </div>

              {/* Preview */}
              {convForm.monto_origen && convForm.tipo_cambio && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs mb-0.5">Resultado de la conversión</p>
                  <p className="text-amber-300 font-heading font-bold text-lg">
                    ₲ {Math.round(parseFloat(convForm.monto_origen) * parseFloat(convForm.tipo_cambio)).toLocaleString("es-PY")}
                  </p>
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas</label>
                <input value={convForm.notas} onChange={e => setConvForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="Banco Itaú, transferencia..."
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowConvModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveConversion} disabled={savingConv}
                  className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all">
                  {savingConv ? "Guardando..." : "Registrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
