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
  rechazado:  { cls: "bg-red-500/15 text-red-300 border-red-500/30",           label: "Rechazado",  icon: X },
  facturado:  { cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",  label: "Facturado",  icon: Receipt },
  cobrado:    { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",label: "Cobrado",   icon: CheckCircle },
  cancelado:  { cls: "bg-red-500/15 text-red-300 border-red-500/30",           label: "Cancelado",  icon: X },
  pagada:     { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",label: "Pagada",    icon: CheckCircle },
  pendiente:  { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",     label: "Pendiente",  icon: Clock },
  parcial:    { cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",        label: "Parcial",    icon: Clock },
  anulada:    { cls: "bg-slate-500/20 text-slate-400 border-slate-500/30",     label: "Anulada",    icon: X },
};

// Header de tabla cliqueable para ordenar
function SortTh({ label, sortKey, currentSort, onClick, className = "" }) {
  const isActive = currentSort.key === sortKey;
  return (
    <th className={`px-4 py-2.5 text-slate-400 font-body uppercase text-[11px] tracking-wider cursor-pointer select-none hover:text-white transition-all ${className}`}
        onClick={() => onClick(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentSort.dir === "asc"
            ? <span className="text-emerald-400">▲</span>
            : <span className="text-emerald-400">▼</span>
        ) : (
          <span className="opacity-30">⇅</span>
        )}
      </span>
    </th>
  );
}

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

  // Ordenamiento por tab: { [tab]: { key, dir: "asc"|"desc" } }
  const [sortBy, setSortBy] = useState({
    presupuestos: { key: "fecha", dir: "desc" },
    facturas:     { key: "fecha", dir: "desc" },
    contratos:    { key: "numero", dir: "desc" },
    ingresos:     { key: "fecha", dir: "desc" },
  });
  const toggleSort = (tabName, key) => {
    setSortBy(prev => ({
      ...prev,
      [tabName]: prev[tabName].key === key
        ? { key, dir: prev[tabName].dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    }));
  };
  const sortList = (list, sort) => {
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[key] ?? "";
      const bv = b[key] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv), "es", { numeric: true }) * mult;
    });
  };

  // Vista previa inline al click en fila
  const [previewItem, setPreviewItem] = useState(null); // { kind, data }
  const openPreview = (kind, data) => setPreviewItem({ kind, data });
  const closePreview = () => setPreviewItem(null);

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
  const filteredPres = sortList(presupuestos
    .filter(p => matchesYear(p.fecha))
    .filter(p =>
      !q || (p.numero && String(p.numero).includes(q)) ||
      (p.empresa_nombre || "").toLowerCase().includes(q) ||
      String(p.total_pyg || p.total || "").includes(q)
    ), sortBy.presupuestos);
  const filteredFac = sortList(facturas
    .filter(f => matchesYear(f.fecha))
    .filter(f =>
      !q || (f.numero || "").toLowerCase().includes(q) ||
      (f.razon_social || "").toLowerCase().includes(q) ||
      (f.concepto || "").toLowerCase().includes(q) ||
      String(f.monto_pyg || f.monto || "").includes(q)
    ), sortBy.facturas);
  const filteredIng = sortList(ingresos
    .filter(i => matchesYear(i.fecha))
    .filter(i =>
      !q || (i.descripcion || "").toLowerCase().includes(q) ||
      (i.categoria || "").toLowerCase().includes(q) ||
      String(i.monto_pyg || i.monto || "").includes(q)
    ).filter(i => logoFilter === "todas" || (i.logo_tipo || "arandujar") === logoFilter), sortBy.ingresos);
  const filteredCon = sortList(contratos.filter(c =>
    !q || (c.numero || "").toLowerCase().includes(q) ||
    (c.empresa_nombre || "").toLowerCase().includes(q) ||
    (c.descripcion || "").toLowerCase().includes(q)
  ), sortBy.contratos);

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
                      <SortTh label="N°"       sortKey="numero"    currentSort={sortBy.presupuestos} onClick={(k) => toggleSort("presupuestos", k)} className="text-left" />
                      <SortTh label="Empresa"  sortKey="empresa_nombre" currentSort={sortBy.presupuestos} onClick={(k) => toggleSort("presupuestos", k)} className="text-left" />
                      <SortTh label="Fecha"    sortKey="fecha"     currentSort={sortBy.presupuestos} onClick={(k) => toggleSort("presupuestos", k)} className="text-left" />
                      <SortTh label="Total"    sortKey="total"     currentSort={sortBy.presupuestos} onClick={(k) => toggleSort("presupuestos", k)} className="text-right" />
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Utilidad</th>
                      <SortTh label="Estado"   sortKey="estado"    currentSort={sortBy.presupuestos} onClick={(k) => toggleSort("presupuestos", k)} className="text-center" />
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
                          onClick={() => openPreview("presupuesto", p)}
                          data-testid={`pres-row-${p.id}`}
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
                      <SortTh label="N° Factura"  sortKey="numero"       currentSort={sortBy.facturas} onClick={(k) => toggleSort("facturas", k)} className="text-left" />
                      <SortTh label="Razón Social" sortKey="razon_social" currentSort={sortBy.facturas} onClick={(k) => toggleSort("facturas", k)} className="text-left" />
                      <SortTh label="Fecha"       sortKey="fecha"        currentSort={sortBy.facturas} onClick={(k) => toggleSort("facturas", k)} className="text-left" />
                      <SortTh label="Monto"       sortKey="monto"        currentSort={sortBy.facturas} onClick={(k) => toggleSort("facturas", k)} className="text-right" />
                      <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">IVA</th>
                      <SortTh label="Estado"      sortKey="estado"       currentSort={sortBy.facturas} onClick={(k) => toggleSort("facturas", k)} className="text-center" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFac.map(f => (
                      <tr key={f.id}
                        onClick={() => openPreview("factura", f)}
                        data-testid={`fact-row-${f.id}`}
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
                      <SortTh label="Número"       sortKey="numero"          currentSort={sortBy.contratos} onClick={(k) => toggleSort("contratos", k)} className="text-left" />
                      <SortTh label="Cliente"      sortKey="empresa_nombre"  currentSort={sortBy.contratos} onClick={(k) => toggleSort("contratos", k)} className="text-left" />
                      <SortTh label="Descripción"  sortKey="descripcion"     currentSort={sortBy.contratos} onClick={(k) => toggleSort("contratos", k)} className="text-left" />
                      <SortTh label="Período"      sortKey="fecha_inicio"    currentSort={sortBy.contratos} onClick={(k) => toggleSort("contratos", k)} className="text-left" />
                      <SortTh label="Monto"        sortKey="monto"           currentSort={sortBy.contratos} onClick={(k) => toggleSort("contratos", k)} className="text-right" />
                      <SortTh label="Estado"       sortKey="estado"          currentSort={sortBy.contratos} onClick={(k) => toggleSort("contratos", k)} className="text-center" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCon.map(c => (
                      <tr key={c.id}
                        onClick={() => openPreview("contrato", c)}
                        data-testid={`con-row-${c.id}`}
                        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-white font-mono">{c.numero || c.id?.slice(0,8)}</td>
                        <td className="px-4 py-3 text-slate-300">{c.empresa_nombre || c.cliente_nombre || "-"}</td>
                        <td className="px-4 py-3 text-slate-300 text-xs max-w-[200px]">
                          <p className="truncate">{c.descripcion || c.nombre || "-"}</p>
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
                      <SortTh label="Descripción" sortKey="descripcion" currentSort={sortBy.ingresos} onClick={(k) => toggleSort("ingresos", k)} className="text-left" />
                      <SortTh label="Categoría"   sortKey="categoria"   currentSort={sortBy.ingresos} onClick={(k) => toggleSort("ingresos", k)} className="text-left" />
                      <SortTh label="Fecha"       sortKey="fecha"       currentSort={sortBy.ingresos} onClick={(k) => toggleSort("ingresos", k)} className="text-left" />
                      <SortTh label="Monto"       sortKey="monto"       currentSort={sortBy.ingresos} onClick={(k) => toggleSort("ingresos", k)} className="text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIng.map(i => (
                      <tr key={i.id}
                        onClick={() => openPreview("ingreso", i)}
                        data-testid={`ing-row-${i.id}`}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vista previa inline ─────────────────────────────────── */}
      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={closePreview}
          navigate={navigate}
          token={token}
          onUpdated={() => { closePreview(); fetchAll(); }}
        />
      )}
    </div>
  );
}

// ═══ Vista previa inline (modal) ════════════════════════════════════════
function PreviewModal({ item, onClose, navigate, token, onUpdated }) {
  const { kind, data } = item;
  const d = data || {};
  React.useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const title = {
    presupuesto: `Presupuesto #${d.numero || ""}`,
    factura:     `Factura ${d.numero || ""}`,
    contrato:    `Contrato ${d.numero || d.id?.slice(0, 8) || ""}`,
    ingreso:     `Ingreso: ${d.descripcion || ""}`,
  }[kind] || "Detalle";

  const editUrl = {
    presupuesto: "/admin/presupuestos",
    factura:     "/admin/facturas",
    contrato:    "/admin/contratos",
    ingreso:     "/admin/ingresos-varios",
  }[kind];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-arandu-dark rounded-2xl border border-white/15 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-arandu-dark border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <h3 className="font-heading text-white text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm font-body text-slate-200">
          {kind === "presupuesto" && <PresupuestoPreview p={d} />}
          {kind === "factura"     && <FacturaPreview f={d} />}
          {kind === "contrato"    && <ContratoPreview c={d} />}
          {kind === "ingreso"     && <IngresoPreview i={d} />}
        </div>
        <div className="border-t border-white/10 px-6 py-3 flex justify-end gap-2">
          <button
            onClick={() => navigate(editUrl)}
            data-testid="preview-edit-btn"
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-all"
          >
            Abrir módulo completo
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const PreviewRow = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-2">
    <span className="text-slate-400 text-xs uppercase tracking-wider min-w-[100px]">{label}</span>
    <span className={`text-white ${mono ? "font-mono" : ""} text-right flex-1`}>{value || <span className="text-slate-500">—</span>}</span>
  </div>
);

function PresupuestoPreview({ p }) {
  return (
    <>
      <PreviewRow label="Número"   value={`#${p.numero || ""}`} mono />
      <PreviewRow label="Nombre"   value={p.nombre} />
      <PreviewRow label="Cliente"  value={p.empresa_nombre} />
      <PreviewRow label="Fecha"    value={p.fecha} />
      <PreviewRow label="Moneda"   value={p.moneda} />
      <PreviewRow label="Forma pago" value={p.forma_pago} />
      <PreviewRow label="Total"    value={fmtMonto(p.total || 0, p.moneda)} />
      <PreviewRow label="Estado"   value={<StateBadge estado={p.estado} />} />
      {p.items?.length > 0 && (
        <div className="mt-3">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Ítems ({p.items.length})</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {p.items.map((it, idx) => (
              <div key={idx} className="flex justify-between text-xs border-b border-white/5 py-1">
                <span className="text-slate-300 truncate max-w-[60%]">{it.descripcion || it.nombre}</span>
                <span className="text-white">{fmtMonto((it.precio_unitario || it.precio || 0) * (it.cantidad || 1), p.moneda)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {p.observaciones && <PreviewRow label="Observ." value={p.observaciones} />}
    </>
  );
}

function FacturaPreview({ f }) {
  return (
    <>
      <PreviewRow label="Número"   value={f.numero} mono />
      <PreviewRow label="Razón soc." value={f.razon_social} />
      <PreviewRow label="RUC"      value={f.ruc} mono />
      <PreviewRow label="Concepto" value={f.concepto} />
      <PreviewRow label="Fecha"    value={f.fecha} />
      <PreviewRow label="Forma pago" value={f.forma_pago} />
      <PreviewRow label="Moneda"   value={f.moneda} />
      <PreviewRow label="Monto"    value={fmtMonto(f.monto || 0, f.moneda)} />
      <PreviewRow label="IVA"      value={f.iva ? fmtMonto(f.iva, f.moneda) : "—"} />
      <PreviewRow label="Estado"   value={<StateBadge estado={f.estado} />} />
      {f.notas && <PreviewRow label="Notas" value={f.notas} />}
    </>
  );
}

function ContratoPreview({ c }) {
  return (
    <>
      <PreviewRow label="Número"     value={c.numero} mono />
      <PreviewRow label="Cliente"    value={c.empresa_nombre || c.cliente_nombre} />
      <PreviewRow label="Nombre"     value={c.nombre || c.descripcion} />
      <PreviewRow label="Frecuencia" value={c.frecuencia} />
      <PreviewRow label="Monto"      value={fmtMonto(c.monto || c.valor || 0, c.moneda || "PYG")} />
      <PreviewRow label="Inicio"     value={c.fecha_inicio} />
      <PreviewRow label="Fin"        value={c.fecha_fin} />
      <PreviewRow label="Estado"     value={<StateBadge estado={c.estado || "activo"} />} />
      {c.notas && <PreviewRow label="Notas" value={c.notas} />}
    </>
  );
}

function IngresoPreview({ i }) {
  return (
    <>
      <PreviewRow label="Descripción" value={i.descripcion} />
      <PreviewRow label="Categoría"   value={i.categoria} />
      <PreviewRow label="Fecha"       value={i.fecha} />
      <PreviewRow label="Moneda"      value={i.moneda} />
      <PreviewRow label="Monto"       value={fmtMonto(i.monto || 0, i.moneda)} />
      {i.notas && <PreviewRow label="Notas" value={i.notas} />}
    </>
  );
}
