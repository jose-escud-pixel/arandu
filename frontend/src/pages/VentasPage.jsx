import React, { useState, useEffect, useContext, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, FileText, Receipt, TrendingUp,
  ChevronDown, ChevronLeft, ChevronRight, ExternalLink,
  CheckCircle, Clock, X, AlertCircle, Search,
  DollarSign, BarChart3, ShoppingCart, ClipboardList
} from "lucide-react";
import EmpresaSwitcher from "../components/EmpresaSwitcher";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Helpers ──────────────────────────────────────────────────
function getMesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function prevMes(m) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
function nextMes(m) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
function mesLabel(m) {
  const [y, mo] = m.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[parseInt(mo, 10) - 1]} ${y}`;
}
function fmtPYG(n) {
  if (n == null || isNaN(n)) return "-";
  if (Math.abs(n) >= 1_000_000)
    return `₲ ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)
    return `₲ ${Math.round(n / 1_000)}K`;
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}
function fmtMonto(monto, moneda = "PYG") {
  if (monto == null) return "-";
  if (moneda === "PYG") return `₲ ${Math.round(monto).toLocaleString("es-PY")}`;
  return `${moneda} ${Number(monto).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LOGO_CHIP = {
  arandujar: "bg-blue-600/20 text-blue-300 border-blue-600/30",
  arandu:    "bg-emerald-600/20 text-emerald-300 border-emerald-600/30",
  jar:       "bg-red-600/20 text-red-300 border-red-600/30",
};
const LOGO_LABEL = { arandujar: "A&JAR", arandu: "Arandu", jar: "JAR" };

const ESTADO_BADGE = {
  borrador:   { cls: "bg-slate-500/20 text-slate-400 border-slate-500/30",     label: "Borrador",   icon: Clock },
  aprobado:   { cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",        label: "Aprobado",   icon: CheckCircle },
  facturado:  { cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",  label: "Facturado",  icon: Receipt },
  cobrado:    { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",label: "Cobrado",   icon: CheckCircle },
  cancelado:  { cls: "bg-red-500/15 text-red-300 border-red-500/30",           label: "Cancelado",  icon: X },
  pagada:     { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",label: "Pagada",    icon: CheckCircle },
  pendiente:  { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",     label: "Pendiente",  icon: Clock },
  parcial:    { cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",        label: "Parcial",    icon: Clock },
  anulada:    { cls: "bg-slate-500/20 text-slate-400 border-slate-500/30",     label: "Anulada",    icon: X },
};

function StateBadge({ estado }) {
  const s = ESTADO_BADGE[estado] || ESTADO_BADGE.pendiente;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-body border ${s.cls}`}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

// Dropdown editable de estado (para cambiar el estado al hacer click)
function StateDropdown({ estado, options, onChange, disabled = false }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  if (disabled) return <StateBadge estado={estado} />;
  return (
    <span className="relative inline-block" ref={ref} onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}>
      <span className="cursor-pointer">
        <StateBadge estado={estado} />
      </span>
      {open && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-[100] bg-arandu-dark border border-white/20 rounded-lg shadow-xl overflow-hidden min-w-[130px]">
          {options.map(op => (
            <button
              key={op}
              onClick={(e) => { e.stopPropagation(); setOpen(false); if (op !== estado) onChange(op); }}
              className={`w-full text-left px-3 py-1.5 text-xs font-body transition-all ${
                op === estado
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {ESTADO_BADGE[op]?.label || op}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

const TABS = [
  { id: "presupuestos", label: "Presupuestos", icon: FileText,      color: "blue" },
  { id: "facturas",     label: "Facturas",     icon: Receipt,       color: "emerald" },
  { id: "contratos",    label: "Contratos",    icon: ClipboardList, color: "purple" },
  { id: "ingresos",     label: "Ingresos",     icon: TrendingUp,    color: "violet" },
];

export default function VentasPage() {
  const { token, user, hasPermission, empresasPropias, activeEmpresaPropia } = useContext(AuthContext);
  const navigate = useNavigate();
  const [tab, setTab] = useState("presupuestos");
  // Filtro temporal: "todos" | "mes" | "anio"
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [mes, setMes] = useState(getMesActual());
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const newBtnRef = useRef(null);

  // logo_tipo activo basado en empresa seleccionada
  const logoFilter = activeEmpresaPropia?.slug || "todas";

  // Data
  const [presupuestos, setPresupuestos] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (newBtnRef.current && !newBtnRef.current.contains(e.target)) setShowNew(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const logoQ = logoFilter !== "todas" ? `&logo_tipo=${logoFilter}` : "";
      const logoQc = logoFilter !== "todas" ? `?logo_tipo=${logoFilter}` : "";
      // Armar filtro de mes según selección del usuario
      const mesParam = filtroTipo === "mes" ? mes : "";
      const [rPres, rFac, rIng, rCon] = await Promise.all([
        fetch(`${API}/admin/presupuestos?${mesParam ? `mes=${mesParam}` : ""}${logoQ}`, { headers }),
        fetch(`${API}/admin/facturas?${mesParam ? `mes=${mesParam}` : ""}${logoQ}`, { headers }),
        fetch(`${API}/admin/ingresos-varios?${mesParam ? `mes=${mesParam}&` : ""}logo_tipo=${logoFilter !== "todas" ? logoFilter : ""}`, { headers }),
        fetch(`${API}/admin/contratos${logoQc}`, { headers }),
      ]);
      if (rPres.ok) setPresupuestos(await rPres.json());
      if (rFac.ok)  setFacturas(await rFac.json());
      if (rIng.ok)  setIngresos(await rIng.json());
      if (rCon.ok)  { const d = await rCon.json(); setContratos(d.contratos || d || []); }
    } catch (e) {
      toast.error("Error al cargar datos");
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [mes, filtroTipo, activeEmpresaPropia]); // eslint-disable-line

  // ── Cambiar estado de presupuesto/factura inline ──
  const PRESUP_ESTADOS = ["borrador", "aprobado", "rechazado", "facturado", "cobrado"];
  const FACT_ESTADOS   = ["pendiente", "pagada", "parcial", "anulada"];

  const cambiarEstadoPresupuesto = async (id, estado) => {
    try {
      const res = await fetch(`${API}/admin/presupuestos/${id}/estado?estado=${estado}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast.success(`Estado actualizado: ${estado}`);
        setPresupuestos(list => list.map(p => p.id === id ? { ...p, estado } : p));
      } else {
        toast.error("No se pudo cambiar el estado");
      }
    } catch (e) { toast.error("Error de red"); }
  };

  const cambiarEstadoFactura = async (id, estado) => {
    try {
      const res = await fetch(`${API}/admin/facturas/${id}/estado?estado=${estado}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast.success(`Factura ${estado}`);
        setFacturas(list => list.map(f => f.id === id ? { ...f, estado } : f));
      } else {
        toast.error("No se pudo cambiar el estado");
      }
    } catch (e) { toast.error("Error de red"); }
  };

  // Filtrar por año en frontend cuando filtroTipo === "anio"
  const matchesYear = (fechaStr) => {
    if (filtroTipo !== "anio") return true;
    return (fechaStr || "").startsWith(anio);
  };

  // logos accesibles (usado internamente para otros filtros)
  const logosAccesibles = React.useMemo(() => {
    if (user?.role === "admin") return empresasPropias;
    const ids = user?.logos_asignados || [];
    return empresasPropias.filter(ep => ids.includes(ep.id));
  }, [user, empresasPropias]);

  // ─── Filtros locales ─────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredPres = presupuestos
    .filter(p => matchesYear(p.fecha))
    .filter(p =>
      !q || (p.numero && String(p.numero).includes(q)) ||
      (p.empresa_nombre || "").toLowerCase().includes(q)
    );
  const filteredFac = facturas
    .filter(f => matchesYear(f.fecha))
    .filter(f =>
      !q || (f.numero || "").toLowerCase().includes(q) ||
      (f.razon_social || "").toLowerCase().includes(q) ||
      (f.concepto || "").toLowerCase().includes(q)
    );
  const filteredIng = ingresos
    .filter(i => matchesYear(i.fecha))
    .filter(i =>
      !q || (i.descripcion || "").toLowerCase().includes(q) ||
      (i.categoria || "").toLowerCase().includes(q)
    ).filter(i => logoFilter === "todas" || (i.logo_tipo || "arandujar") === logoFilter);
  const filteredCon = contratos.filter(c =>
    !q || (c.numero || "").toLowerCase().includes(q) ||
    (c.empresa_nombre || "").toLowerCase().includes(q) ||
    (c.descripcion || "").toLowerCase().includes(q)
  );

  // ─── Stats ───────────────────────────────────────────────────
  const totalFacturadoPYG = facturas
    .filter(f => f.tipo === "emitida" && f.estado !== "anulada")
    .reduce((s, f) => s + (f.monto_pyg || f.monto || 0), 0);

  const totalCobradoPYG = facturas
    .filter(f => f.tipo === "emitida" && f.estado === "pagada")
    .reduce((s, f) => s + (f.monto_pyg || f.monto || 0), 0);

  const presAprobados = presupuestos.filter(p => p.estado === "aprobado").length;
  const presBorrador  = presupuestos.filter(p => p.estado === "borrador").length;

  const totalIngresosPYG = ingresos
    .reduce((s, i) => s + (i.monto_pyg || (i.moneda === "PYG" ? i.monto : 0) || 0), 0);

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white transition-colors" data-testid="back-btn" title="Volver">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-heading text-2xl text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-emerald-400" />
              Ventas
            </h1>
            <p className="text-slate-400 text-sm font-body">Presupuestos · Facturas · Ingresos</p>
          </div>
          <EmpresaSwitcher compact />
        </div>

        {/* + Nuevo dropdown */}
        <div className="relative" ref={newBtnRef}>
          <button
            onClick={() => setShowNew(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-body text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo
            <ChevronDown className={`w-4 h-4 transition-transform ${showNew ? "rotate-180" : ""}`} />
          </button>
          {showNew && (
            <div className="absolute right-0 mt-2 w-52 bg-arandu-dark-card border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
              {hasPermission("presupuestos.crear") && (
                <button
                  onClick={() => { setShowNew(false); navigate("/admin/presupuestos"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-body text-sm text-left"
                >
                  <FileText className="w-4 h-4 text-blue-400" />
                  Nuevo presupuesto
                </button>
              )}
              {hasPermission("facturas.crear") && (
                <button
                  onClick={() => { setShowNew(false); navigate("/admin/facturas"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-body text-sm text-left"
                >
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  Nueva factura
                </button>
              )}
              {hasPermission("facturas.crear") && (
                <button
                  onClick={() => { setShowNew(false); navigate("/admin/ingresos-varios"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-body text-sm text-left"
                >
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  Ingreso sin factura
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Filtro: tipo de rango + mes/año */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
            {[
              { v: "todos", label: "Todos los meses" },
              { v: "mes",   label: "Por mes" },
              { v: "anio",  label: "Por año" },
            ].map(op => (
              <button
                key={op.v}
                onClick={() => setFiltroTipo(op.v)}
                data-testid={`filtro-${op.v}`}
                className={`px-3 py-1.5 rounded-md font-body transition-all ${
                  filtroTipo === op.v
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
          {filtroTipo === "mes" && (
            <div className="flex items-center gap-1">
              <button onClick={() => setMes(prevMes(mes))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-body text-sm px-2 min-w-[90px] text-center">{mesLabel(mes)}</span>
              <button onClick={() => setMes(nextMes(mes))}
                disabled={mes >= getMesActual()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {filtroTipo === "anio" && (
            <div className="flex items-center gap-1">
              <button onClick={() => setAnio(String(Number(anio) - 1))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-body text-sm px-3 min-w-[60px] text-center">{anio}</span>
              <button onClick={() => setAnio(String(Number(anio) + 1))}
                disabled={Number(anio) >= new Date().getFullYear()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-slate-400 text-xs font-body mb-1">Facturado</p>
            <p className="text-emerald-300 font-heading font-bold text-lg">{fmtPYG(totalFacturadoPYG)}</p>
            <p className="text-slate-500 text-xs font-body mt-0.5">Cobrado: {fmtPYG(totalCobradoPYG)}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-slate-400 text-xs font-body mb-1">Presupuestos</p>
            <p className="text-blue-300 font-heading font-bold text-lg">{presupuestos.length}</p>
            <p className="text-slate-500 text-xs font-body mt-0.5">{presAprobados} aprobados · {presBorrador} borrador</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-slate-400 text-xs font-body mb-1">Facturas</p>
            <p className="text-orange-300 font-heading font-bold text-lg">{facturas.filter(f => f.tipo === "emitida").length}</p>
            <p className="text-slate-500 text-xs font-body mt-0.5">
              {facturas.filter(f => f.estado === "pendiente" || f.estado === "parcial").length} pendientes de cobro
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-slate-400 text-xs font-body mb-1">Ingresos varios</p>
            <p className="text-violet-300 font-heading font-bold text-lg">{fmtPYG(totalIngresosPYG)}</p>
            <p className="text-slate-500 text-xs font-body mt-0.5">{ingresos.length} registros</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 pb-0">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSearch(""); }}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-body font-medium border-b-2 transition-all -mb-px ${
                  active
                    ? `text-${t.color}-300 border-${t.color}-400`
                    : "text-slate-400 border-transparent hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                <span className={`text-xs px-1.5 rounded-full ${
                  active ? `bg-${t.color}-500/20 text-${t.color}-300` : "bg-white/10 text-slate-500"
                }`}>
                  {t.id === "presupuestos" ? filteredPres.length
                   : t.id === "facturas" ? filteredFac.length
                   : t.id === "contratos" ? filteredCon.length
                   : filteredIng.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={
              tab === "presupuestos" ? "Buscar por nº, empresa..." :
              tab === "facturas" ? "Buscar por nº, razón social..." :
              tab === "contratos" ? "Buscar por nº, empresa, descripción..." :
              "Buscar descripción..."
            }
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm font-body focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* ── Tab: Presupuestos ─────────────────────────────────── */}
        {tab === "presupuestos" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-xs font-body">{filteredPres.length} presupuesto{filteredPres.length !== 1 ? "s" : ""}</span>
            </div>
            {loading ? (
              <div className="text-center py-10 text-slate-500 animate-pulse font-body">Cargando...</div>
            ) : filteredPres.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-body">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sin presupuestos para este período</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm font-body">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">N°</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Empresa</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Fecha</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Total</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Utilidad</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Estado</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Empresa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPres.map(p => {
                      const total = p.total || 0;
                      const costo = p.items
                        ? p.items.reduce((s, i) => s + ((i.costo || 0) * (i.cantidad || 1)), 0)
                        : null;
                      const utilidad = costo != null ? total - costo : null;
                      const utilPct = total > 0 && utilidad != null ? (utilidad / total * 100).toFixed(0) : null;
                      return (
                        <tr key={p.id}
                          onClick={() => navigate("/admin/presupuestos")}
                          className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-blue-300">#{p.numero}</span>
                            {p.facturas_count > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/facturas?presupuesto_id=${p.id}`);
                                }}
                                title="Ver factura vinculada"
                                data-testid={`pres-${p.id}-fact-link`}
                                className="ml-2 text-[10px] bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/20 px-1.5 py-0.5 rounded-full transition-all"
                              >
                                🧾 fact.
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-300 max-w-[160px] truncate">{p.empresa_nombre || "-"}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{p.fecha || "-"}</td>
                          <td className="px-4 py-3 text-right text-white font-medium">
                            {fmtMonto(total, p.moneda)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {utilidad != null ? (
                              <span className={utilidad >= 0 ? "text-emerald-300" : "text-red-300"}>
                                {fmtMonto(utilidad, p.moneda)}
                                {utilPct && <span className="text-xs text-slate-500 ml-1">({utilPct}%)</span>}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StateDropdown
                              estado={p.estado}
                              options={PRESUP_ESTADOS}
                              onChange={(nuevo) => cambiarEstadoPresupuesto(p.id, nuevo)}
                              disabled={!hasPermission("presupuestos.editar")}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.logo_tipo && (
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${LOGO_CHIP[p.logo_tipo] || "bg-white/10 text-slate-300 border-white/10"}`}>
                                {LOGO_LABEL[p.logo_tipo] || p.logo_tipo}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Facturas ─────────────────────────────────────── */}
        {tab === "facturas" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-xs font-body">{filteredFac.length} factura{filteredFac.length !== 1 ? "s" : ""}</span>
            </div>
            {loading ? (
              <div className="text-center py-10 text-slate-500 animate-pulse font-body">Cargando...</div>
            ) : filteredFac.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-body">
                <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sin facturas para este período</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm font-body">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">N° Factura</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Razón Social</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Tipo</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Fecha</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Monto</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">IVA</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Estado</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Empresa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFac.map(f => (
                      <tr key={f.id}
                        onClick={() => navigate("/admin/facturas")}
                        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-emerald-300">{f.numero || "-"}</span>
                          {(f.presupuesto_ids?.length > 0 || f.presupuesto_id) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const pid = (f.presupuesto_ids && f.presupuesto_ids[0]) || f.presupuesto_id;
                                navigate(`/admin/presupuestos?focus=${pid}`);
                              }}
                              title="Ver presupuesto vinculado"
                              data-testid={`fact-${f.id}-pres-link`}
                              className="ml-2 text-[10px] bg-blue-500/15 text-blue-300 hover:bg-blue-500/30 border border-blue-500/20 px-1.5 py-0.5 rounded-full transition-all"
                            >
                              📄 pres.
                            </button>
                          )}
                          {f.contrato_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/contratos?focus=${f.contrato_id}`);
                              }}
                              title="Ver contrato vinculado"
                              data-testid={`fact-${f.id}-contrato-link`}
                              className="ml-2 text-[10px] bg-violet-500/15 text-violet-300 hover:bg-violet-500/30 border border-violet-500/20 px-1.5 py-0.5 rounded-full transition-all"
                            >
                              📎 contr.
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-[160px] truncate">{f.razon_social || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            f.tipo === "emitida"
                              ? "bg-blue-500/15 text-blue-300"
                              : "bg-red-500/15 text-red-300"
                          }`}>
                            {f.tipo === "emitida" ? "↑ Emitida" : "↓ Recibida"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{f.fecha || "-"}</td>
                        <td className="px-4 py-3 text-right text-white font-medium">
                          {fmtMonto(f.monto, f.moneda)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 text-xs">
                          {f.iva ? fmtMonto(f.iva, f.moneda) : "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StateDropdown
                            estado={f.estado}
                            options={FACT_ESTADOS}
                            onChange={(nuevo) => cambiarEstadoFactura(f.id, nuevo)}
                            disabled={!hasPermission("facturas.editar")}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {f.logo_tipo && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${LOGO_CHIP[f.logo_tipo] || "bg-white/10 text-slate-300 border-white/10"}`}>
                              {LOGO_LABEL[f.logo_tipo] || f.logo_tipo}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Contratos ──────────────────────────────────── */}
        {tab === "contratos" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-xs font-body">{filteredCon.length} contrato{filteredCon.length !== 1 ? "s" : ""}</span>
              <Link to="/admin/contratos"
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-purple-300 transition-colors font-body">
                Gestionar contratos <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            {loading ? (
              <div className="text-center py-10 text-slate-500 animate-pulse font-body">Cargando...</div>
            ) : filteredCon.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-body">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sin contratos registrados</p>
                <Link to="/admin/contratos" className="text-purple-400 hover:text-purple-300 text-sm mt-2 inline-block">Ir a Contratos →</Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm font-body">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Número / Empresa</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Descripción</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Período</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Monto</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCon.map(c => (
                      <tr key={c.id}
                        onClick={() => navigate("/admin/contratos")}
                        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{c.numero || c.id?.slice(0,8)}</p>
                          <p className="text-slate-400 text-xs">{c.empresa_nombre || c.cliente_nombre || "-"}</p>
                          {c.logo_tipo && (
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${LOGO_CHIP[c.logo_tipo] || "bg-white/10 text-slate-400 border-white/10"}`}>
                              {LOGO_LABEL[c.logo_tipo] || c.logo_tipo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs max-w-[200px]">
                          <p className="truncate">{c.descripcion || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {c.fecha_inicio && <p>{c.fecha_inicio}</p>}
                          {c.fecha_fin && <p className="text-slate-500">→ {c.fecha_fin}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-purple-300 font-medium">
                          {fmtMonto(c.monto || c.valor || 0, c.moneda || "PYG")}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StateBadge estado={c.estado || "activo"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Ingresos Varios ─────────────────────────────── */}
        {tab === "ingresos" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-xs font-body">{filteredIng.length} ingreso{filteredIng.length !== 1 ? "s" : ""}</span>
            </div>
            {loading ? (
              <div className="text-center py-10 text-slate-500 animate-pulse font-body">Cargando...</div>
            ) : filteredIng.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-body">
                <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sin ingresos varios para este período</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm font-body">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Descripción</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Categoría</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Fecha</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Monto</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Empresa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIng.map(i => (
                      <tr key={i.id}
                        onClick={() => navigate("/admin/ingresos-varios")}
                        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-slate-200 max-w-[200px]">
                          <p className="truncate">{i.descripcion || "-"}</p>
                          {i.notas && <p className="text-slate-500 text-xs truncate">{i.notas}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                            {i.categoria || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{i.fecha || "-"}</td>
                        <td className="px-4 py-3 text-right text-violet-300 font-medium">
                          {fmtMonto(i.monto, i.moneda)}
                          {i.moneda !== "PYG" && i.tipo_cambio && (
                            <p className="text-slate-500 text-xs">≈ {fmtMonto(i.monto * i.tipo_cambio, "PYG")}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {i.logo_tipo && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${LOGO_CHIP[i.logo_tipo] || "bg-white/10 text-slate-300 border-white/10"}`}>
                              {LOGO_LABEL[i.logo_tipo] || i.logo_tipo}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
