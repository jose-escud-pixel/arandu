import React, { useState, useEffect, useContext, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, FileText, Receipt, TrendingUp,
  ChevronDown, ChevronLeft, ChevronRight, ExternalLink,
  CheckCircle, Clock, X, AlertCircle, Search,
  DollarSign, BarChart3, ShoppingCart, ClipboardList,
  Edit, Trash2, Copy, Wallet, Printer, Banknote, Save
} from "lucide-react";
import EmpresaSwitcher from "../components/EmpresaSwitcher";
import PresupuestoFormModal from "../components/PresupuestoFormModal";
import PresupuestoCostosModal from "../components/PresupuestoCostosModal";
import FacturaFormModal from "../components/FacturaFormModal";
import { LogoMarcaArandu, LogoMarcaJar, LogoMarcaAranduJar } from "../components/MarcaLogos";
import { normalizeLogoTipo, svgMarcaIcon, svgPrintLogoName, svgLogoMarcaRow, svgDocumentHeaderLogoHtml } from "../lib/marcaLogoSvg";

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
  { id: "ingresos",     label: "Ingresos",     icon: TrendingUp,    color: "violet" },
  { id: "recibos",      label: "Recibos",      icon: Banknote,      color: "amber" },
];

export default function VentasPage() {
  const { token, user, hasPermission, empresasPropias, activeEmpresaPropia } = useContext(AuthContext);
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return t && ["presupuestos", "facturas", "ingresos", "recibos"].includes(t) ? t : "presupuestos";
  });
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
    ingresos:     { key: "fecha", dir: "desc" },
    recibos:      { key: "fecha_pago", dir: "desc" },
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

  // Vista previa inline al click en fila (contratos/ingresos)
  const [previewItem, setPreviewItem] = useState(null); // { kind, data }
  const openPreview = (kind, data) => setPreviewItem({ kind, data });
  const closePreview = () => setPreviewItem(null);

  // Presupuesto: documento completo con vista previa y acciones
  const [presDoc, setPresDoc] = useState(null);
  const [presDocLoading, setPresDocLoading] = useState(false);

  // Factura: chips search + visual doc + form modal + pago modals
  const [facChips, setFacChips] = useState([]);
  const [facInput, setFacInput] = useState("");
  const [facDoc, setFacDoc] = useState(null);           // factura en doc-view
  const [facDocLoading, setFacDocLoading] = useState(false);
  const [facFormItem, setFacFormItem] = useState(null); // { factura|null } — null = nueva
  const [showFacForm, setShowFacForm] = useState(false);

  // Contrato: chips search + visual doc + form modal
  // Pago modals
  const [pagoFac, setPagoFac] = useState(null);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [showPagoParcialModal, setShowPagoParcialModal] = useState(false);
  const [pagoParcialFac, setPagoParcialFac] = useState(null);
  const [montoParcial, setMontoParcial] = useState("");
  const [fechaPagoParcial, setFechaPagoParcial] = useState(new Date().toISOString().slice(0, 10));
  const [numeroReciboManual, setNumeroReciboManual] = useState("");
  // Cuentas bancarias multi-moneda
  const [cuentasDisp, setCuentasDisp] = useState([]);
  const [cuentasPYG, setCuentasPYG] = useState([]);   // seleccionadas PYG
  const [cuentasUSD, setCuentasUSD] = useState([]);   // seleccionadas USD (cuando moneda difiere)
  const [tcPago, setTcPago] = useState("");           // tipo de cambio para monto en USD
  const [montoUSD, setMontoUSD] = useState("");       // monto en USD (para derivar TC)
  // Editar pago individual
  const [editPagoCtx, setEditPagoCtx] = useState(null); // { factura, pago }
  // Recibos
  const [recibos, setRecibos] = useState([]);
  const [reciboDoc, setReciboDoc] = useState(null);
  const [reciboChips, setReciboChips] = useState([]);
  const [reciboInput, setReciboInput] = useState("");
  const openPresDoc = async (id) => {
    setPresDocLoading(true);
    try {
      const res = await fetch(`${API}/admin/presupuestos/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPresDoc(await res.json());
      else toast.error("Error al cargar presupuesto");
    } catch (e) { toast.error("Error de red"); }
    setPresDocLoading(false);
  };

  // Chips de búsqueda para presupuestos
  const [presChips, setPresChips] = useState([]);
  const [presInput, setPresInput] = useState("");

  // Acciones de presupuesto inline
  const deletePresupuesto = async (id) => {
    if (!window.confirm("¿Eliminar este presupuesto?")) return;
    try {
      const res = await fetch(`${API}/admin/presupuestos/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { toast.success("Presupuesto eliminado"); fetchAll(); if (presDoc?.id === id) setPresDoc(null); }
      else toast.error("Error al eliminar");
    } catch (e) { toast.error("Error de red"); }
  };

  const duplicatePresupuesto = async (p) => {
    try {
      const res = await fetch(`${API}/admin/presupuestos/${p.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al cargar datos para duplicar"); return; }
      const full = await res.json();
      const { id, numero, ...rest } = full; // eslint-disable-line
      const payload = { ...rest, numero: null, fecha: new Date().toISOString().split("T")[0] };
      const createRes = await fetch(`${API}/admin/presupuestos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (createRes.ok) { toast.success("Presupuesto duplicado"); fetchAll(); }
      else toast.error("Error al duplicar");
    } catch (e) { toast.error("Error de red"); }
  };

  const formatNumber = (num, moneda = "PYG") => {
    if (moneda === "USD") return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    return new Intl.NumberFormat('es-PY').format(num);
  };
  const getCurrencySymbol = (moneda) => moneda === "USD" ? "US$" : "₲";

  // logo_tipo activo basado en empresa seleccionada
  const logoFilter = activeEmpresaPropia?.slug || "todas";

  // Data
  const [presupuestos, setPresupuestos] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showIngForm, setShowIngForm] = useState(false);  // modal nuevo ingreso
  const [ingFormItem, setIngFormItem] = useState(null);   // ingreso a editar

  // Presupuesto form/costos modals
  const [presFormItem, setPresFormItem] = useState(null); // { presupuesto, mode }
  const [presCostosItem, setPresCostosItem] = useState(null); // presupuesto object
  const [presFacturarItem, setPresFacturarItem] = useState(null); // presupuesto for facturar modal
  // Facturar modal state
  const [facturaForm, setFacturaForm] = useState({ numero: "", fecha: new Date().toISOString().split('T')[0], forma_pago: "contado", notas: "" });
  const [facturaMode, setFacturaMode] = useState("nueva");
  const [facturaSearch, setFacturaSearch] = useState("");
  const [facturasDisponibles, setFacturasDisponibles] = useState([]);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [savingFactura, setSavingFactura] = useState(false);
  // Additional data for form
  const [empresas, setEmpresas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);

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
      const logoQc = logoFilter !== "todas" ? `?logo_tipo=${logoFilter}` : "";
      const mesParam = filtroTipo === "mes" ? mes : "";
      const buildQ = (params) => { const p = Object.entries(params).filter(([,v]) => v != null && v !== "").map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join("&"); return p ? `?${p}` : ""; };
      const [rPres, rFac, rIng, rEmp, rProv, rProd, rCuentas, rRecibos] = await Promise.all([
        fetch(`${API}/admin/presupuestos${buildQ({ mes: mesParam || null, logo_tipo: logoFilter !== "todas" ? logoFilter : null })}`, { headers }),
        fetch(`${API}/admin/facturas${buildQ({ mes: mesParam || null, logo_tipo: logoFilter !== "todas" ? logoFilter : null })}`, { headers }),
        fetch(`${API}/admin/ingresos-varios${buildQ({ mes: mesParam || null, logo_tipo: logoFilter !== "todas" ? logoFilter : null })}`, { headers }),
        fetch(`${API}/admin/empresas${logoQc}`, { headers }),
        fetch(`${API}/admin/proveedores?activo=true`, { headers }),
        fetch(`${API}/admin/productos`, { headers }),
        fetch(`${API}/admin/cuentas-bancarias${logoQc}`, { headers }),
        fetch(`${API}/admin/recibos${buildQ({ mes: mesParam || null, logo_tipo: logoFilter !== "todas" ? logoFilter : null })}`, { headers }),
      ]);
      if (rPres.ok) setPresupuestos(await rPres.json());
      if (rFac.ok) {
        const data = await rFac.json();
        // Sanitize dates
        setFacturas(data.map(f => ({
          ...f,
          fecha: f.fecha ? f.fecha.slice(0, 10) : null,
          fecha_vencimiento: f.fecha_vencimiento ? f.fecha_vencimiento.slice(0, 10) : null,
          fecha_pago: f.fecha_pago ? f.fecha_pago.slice(0, 10) : null,
        })));
      }
      if (rIng.ok) { const dIng = await rIng.json(); setIngresos(Array.isArray(dIng) ? dIng : []); }
      if (rEmp.ok) setEmpresas(await rEmp.json());
      if (rProv.ok) setProveedores(await rProv.json());
      if (rProd.ok) setProductos(await rProd.json());
      if (rCuentas.ok) setCuentasDisp(await rCuentas.json());
      if (rRecibos.ok) setRecibos(await rRecibos.json());
    } catch (e) {
      toast.error("Error al cargar datos");
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [mes, filtroTipo, activeEmpresaPropia]); // eslint-disable-line



  // ── Al entrar con ?empresa=<id> desde Clientes, pre-llenar el buscador chip ──
  // (ruta vieja era /admin/presupuestos?empresa=X; ahora es /admin/ventas?tab=presupuestos&empresa=X
  //  y también /admin/presupuestos?empresa=X sigue funcionando porque apunta a este mismo componente)
  useEffect(() => {
    const empresaId = searchParams.get("empresa");
    if (!empresaId || empresas.length === 0) return;
    const emp = empresas.find(e => e.id === empresaId);
    if (!emp) return;
    // Colocar el nombre del cliente como chip de búsqueda si no está ya
    setPresChips(prev => (prev.includes(emp.nombre) ? prev : [...prev, emp.nombre]));
    setTab("presupuestos");
    // Limpiar el param para que recargas manuales no lo vuelvan a poner dos veces
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("empresa");
    setSearchParams(nextParams, { replace: true });
    // eslint-disable-next-line
  }, [empresas]);

  // ── Cambiar estado de presupuesto/factura inline ──
  const PRESUP_ESTADOS = ["aprobado", "rechazado"];
  const FACT_ESTADOS   = ["pendiente", "pagada", "anulada"];

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

  // Load facturas when facturar modal opens
  useEffect(() => {
    if (presFacturarItem) {
      setFacturaMode("nueva");
      setFacturaSearch("");
      setFacturaSeleccionada(null);
      setFacturaForm({ numero: "", fecha: new Date().toISOString().split('T')[0], forma_pago: "contado", notas: "" });
      fetch(`${API}/admin/facturas?tipo=emitida`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => setFacturasDisponibles(data))
        .catch(() => setFacturasDisponibles([]));
    }
  }, [presFacturarItem]); // eslint-disable-line

  const handleFacturar = async () => {
    if (!facturaForm.numero.trim()) { toast.error("El número de factura es requerido"); return; }
    const presupuesto = presFacturarItem;
    setSavingFactura(true);
    try {
      const facturaPayload = {
        logo_tipo: presupuesto.logo_tipo,
        tipo: "emitida",
        forma_pago: facturaForm.forma_pago,
        numero: facturaForm.numero,
        fecha: facturaForm.fecha,
        razon_social: presupuesto.empresa_nombre || "",
        ruc: presupuesto.empresa_ruc || "",
        concepto: presupuesto.nombre_archivo ? `${presupuesto.numero} - ${presupuesto.nombre_archivo}` : `Presupuesto ${presupuesto.numero}`,
        monto: presupuesto.total,
        moneda: presupuesto.moneda,
        tipo_cambio: presupuesto.tipo_cambio || null,
        estado: "pendiente",
        notas: facturaForm.notas || null,
        presupuesto_ids: [presupuesto.id],
        presupuesto_id: presupuesto.id,
      };
      const resFactura = await fetch(`${API}/admin/facturas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(facturaPayload)
      });
      if (!resFactura.ok) { toast.error("Error al crear la factura"); setSavingFactura(false); return; }
      const yaFacturado = presupuesto.estado === "facturado" || presupuesto.estado === "cobrado";
      if (!yaFacturado) {
        await fetch(`${API}/admin/presupuestos/${presupuesto.id}/estado?estado=facturado`, {
          method: "PUT", headers: { Authorization: `Bearer ${token}` }
        });
      }
      toast.success("Factura creada");
      setPresFacturarItem(null);
      fetchAll();
    } catch { toast.error("Error al facturar"); }
    finally { setSavingFactura(false); }
  };

  const handleVincularExistente = async () => {
    if (!facturaSeleccionada) { toast.error("Seleccioná una factura"); return; }
    const presupuesto = presFacturarItem;
    setSavingFactura(true);
    try {
      const idsActuales = facturaSeleccionada.presupuesto_ids?.length ? facturaSeleccionada.presupuesto_ids : (facturaSeleccionada.presupuesto_id ? [facturaSeleccionada.presupuesto_id] : []);
      const nuevosIds = idsActuales.includes(presupuesto.id) ? idsActuales : [...idsActuales, presupuesto.id];
      const res = await fetch(`${API}/admin/facturas/${facturaSeleccionada.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...facturaSeleccionada, presupuesto_ids: nuevosIds, presupuesto_id: nuevosIds.length === 1 ? nuevosIds[0] : facturaSeleccionada.presupuesto_id }),
      });
      if (!res.ok) { toast.error("Error al vincular factura"); setSavingFactura(false); return; }
      const yaFacturado = presupuesto.estado === "facturado" || presupuesto.estado === "cobrado";
      if (!yaFacturado) {
        await fetch(`${API}/admin/presupuestos/${presupuesto.id}/estado?estado=facturado`, {
          method: "PUT", headers: { Authorization: `Bearer ${token}` }
        });
      }
      toast.success("Factura vinculada");
      setPresFacturarItem(null);
      fetchAll();
    } catch { toast.error("Error al vincular"); }
    finally { setSavingFactura(false); }
  };

  // ── Abrir factura doc view ────────────────────────────────────
  const openFacDoc = (id) => {
    // Buscar en el estado local (ya cargado en fetchAll) para evitar llamada extra a la API
    const fac = facturas.find(f => f.id === id);
    if (fac) {
      setFacDoc({
        ...fac,
        fecha: fac.fecha ? fac.fecha.slice(0, 10) : null,
        fecha_vencimiento: fac.fecha_vencimiento ? fac.fecha_vencimiento.slice(0, 10) : null,
        fecha_pago: fac.fecha_pago ? fac.fecha_pago.slice(0, 10) : null,
      });
    } else {
      toast.error("Factura no encontrada — recargue la página");
    }
  };

  // ── Factura: delete ──────────────────────────────────────────
  const handleDeleteFac = async (fac) => {
    if (!window.confirm(`¿Eliminar factura ${fac.numero}?`)) return;
    try {
      const res = await fetch(`${API}/admin/facturas/${fac.id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      toast.success("Factura eliminada");
      if (facDoc?.id === fac.id) setFacDoc(null);
      fetchAll();
    } catch { toast.error("Error al eliminar"); }
  };

  // ── Factura: deshacer pago ───────────────────────────────────
  const handleDeshacerFac = async (fac) => {
    if (!window.confirm("¿Deshacer el pago? Se eliminarán todos los pagos y recibos registrados de esta factura.")) return;
    try {
      const pagos = fac.pagos || [];
      if (pagos.length > 0) {
        // Eliminar cada pago (y su recibo vinculado) uno por uno
        for (const pago of pagos) {
          await fetch(`${API}/admin/facturas/${fac.id}/pago/${pago.id}`, { method: "DELETE", headers });
        }
      } else {
        // Factura sin array pagos (legacy) — solo cambiar estado
        await fetch(`${API}/admin/facturas/${fac.id}/estado?estado=pendiente`, { method: "PATCH", headers });
      }
      toast.success("Pago deshecho");
      fetchAll();
    } catch { toast.error("Error"); }
  };

  // ── Factura: anular ──────────────────────────────────────────
  const handleAnularFac = async (fac) => {
    if (!window.confirm("¿Anular esta factura?")) return;
    try {
      const res = await fetch(`${API}/admin/facturas/${fac.id}/estado?estado=anulada`, { method: "PATCH", headers });
      if (!res.ok) throw new Error();
      toast.success("Factura anulada");
      fetchAll();
    } catch { toast.error("Error al anular"); }
  };

  // ── Pago contado: abre modal ─────────────────────────────────
  const openPagoContado = (fac) => {
    setPagoFac(fac);
    setFechaPago(fac.fecha || new Date().toISOString().slice(0, 10));
    setNumeroReciboManual("");
    // Pre-seleccionar cuenta predeterminada
    const def = cuentasDisp.find(c => c.logo_tipo === fac.logo_tipo && c.moneda === fac.moneda && c.es_predeterminada)
      || cuentasDisp.find(c => c.logo_tipo === fac.logo_tipo && c.moneda === fac.moneda);
    setCuentasPYG(def ? [def.id] : []);
    setCuentasUSD([]);
    setTcPago("");
    setMontoUSD("");
    setShowPagoModal(true);
  };

  // ── Pago parcial crédito ─────────────────────────────────────
  const openPagoParcial = (fac) => {
    setPagoParcialFac(fac);
    const pendiente = (fac.monto || 0) - (fac.monto_pagado || 0);
    setMontoParcial(String(pendiente > 0 ? pendiente : fac.monto));
    setFechaPagoParcial(new Date().toISOString().slice(0, 10));
    setNumeroReciboManual("");
    const def = cuentasDisp.find(c => c.logo_tipo === fac.logo_tipo && c.moneda === fac.moneda && c.es_predeterminada)
      || cuentasDisp.find(c => c.logo_tipo === fac.logo_tipo && c.moneda === fac.moneda);
    setCuentasPYG(def ? [def.id] : []);
    setCuentasUSD([]);
    setTcPago("");
    setMontoUSD("");
    setShowPagoParcialModal(true);
  };

  // Construir cuenta_id para pago (simplificado: primera cuenta PYG, si hay USD la consideramos)
  const getCuentaIdPago = (fac) => {
    const monedaFac = fac?.moneda || "PYG";
    if (monedaFac === "PYG") return cuentasPYG[0] || null;
    // Moneda extranjera: usar la cuenta USD/moneda si está seleccionada
    return cuentasUSD[0] || cuentasPYG[0] || null;
  };

  // ── Confirmar pago total (contado) ───────────────────────────
  const handlePagarContado = async () => {
    if (!fechaPago) { toast.error("Fecha requerida"); return; }
    try {
      const montoPendiente = (pagoFac.monto || 0) - (pagoFac.monto_pagado || 0);
      const tcFinal = tcPago ? parseFloat(tcPago) : null;
      const res = await fetch(`${API}/admin/facturas/${pagoFac.id}/pago-parcial`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_pagado: montoPendiente,
          fecha_pago: fechaPago,
          numero_recibo: numeroReciboManual || null,
          cuenta_id: getCuentaIdPago(pagoFac),
          tipo_cambio: tcFinal,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Error"); }
      const data = await res.json();
      toast.success(`Pagada · Recibo ${data.recibo?.numero || ""}`);
      setShowPagoModal(false);
      fetchAll();
    } catch (e) { toast.error(e.message || "Error al registrar pago"); }
  };

  // ── Confirmar pago parcial (crédito) ─────────────────────────
  const handlePagoParcial = async () => {
    const monto = parseFloat(montoParcial);
    if (!monto || monto <= 0) { toast.error("Monto inválido"); return; }
    try {
      const tcFinal = tcPago ? parseFloat(tcPago) : null;
      const res = await fetch(`${API}/admin/facturas/${pagoParcialFac.id}/pago-parcial`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_pagado: monto,
          fecha_pago: fechaPagoParcial,
          numero_recibo: numeroReciboManual || null,
          cuenta_id: getCuentaIdPago(pagoParcialFac),
          tipo_cambio: tcFinal,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Error"); }
      const data = await res.json();
      const pendiente = (pagoParcialFac.monto || 0) - (pagoParcialFac.monto_pagado || 0);
      const msg = monto >= pendiente
        ? `Pagada completamente · Recibo ${data.recibo?.numero || ""}`
        : `Pago parcial registrado · Recibo ${data.recibo?.numero || ""}`;
      toast.success(msg);
      setShowPagoParcialModal(false);
      fetchAll();
    } catch (e) { toast.error(e.message || "Error al registrar pago"); }
  };

  // ── Editar pago individual ────────────────────────────────────
  const handleSaveEditPago = async (factura, pago, cambios) => {
    try {
      const res = await fetch(`${API}/admin/facturas/${factura.id}/pago/${pago.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Error"); }
      toast.success("Pago actualizado");
      setEditPagoCtx(null);
      fetchAll();
    } catch (e) { toast.error(e.message || "Error al editar pago"); }
  };

  // ── Eliminar pago individual ──────────────────────────────────
  const handleDeletePago = async (factura, pago) => {
    if (!window.confirm(`¿Eliminar este pago de ${fmtMonto(pago.monto, factura.moneda)}? Se eliminará también el recibo vinculado.`)) return;
    try {
      const res = await fetch(`${API}/admin/facturas/${factura.id}/pago/${pago.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Error"); }
      toast.success("Pago eliminado");
      // Actualizar facDoc en memoria si está abierta
      setFacDoc(prev => prev && prev.id === factura.id ? {
        ...prev,
        pagos: (prev.pagos || []).filter(p => p.id !== pago.id),
      } : prev);
      fetchAll();
    } catch (e) { toast.error(e.message || "Error al eliminar pago"); }
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
  // Presupuestos: filtro por chips (AND lógico)
  const presAllChips = [...presChips, ...(presInput.trim() ? [presInput.trim()] : [])];
  const filteredPres = sortList(presupuestos
    .filter(p => matchesYear(p.fecha))
    .filter(p => {
      if (presAllChips.length === 0) return true;
      const texto = [
        p.numero, p.nombre_archivo, p.empresa_nombre, p.observaciones,
        ...(p.items || []).map(i => i.descripcion)
      ].filter(Boolean).join(" ").toLowerCase();
      return presAllChips.every(chip => texto.includes(chip.toLowerCase()));
    }), sortBy.presupuestos);
  // Facturas: chips search (AND lógico)
  const facAllChips = [...facChips, ...(facInput.trim() ? [facInput.trim()] : [])];
  const filteredFac = sortList(facturas
    .filter(f => matchesYear(f.fecha))
    .filter(f => {
      if (facAllChips.length === 0) return true;
      const texto = [
        f.numero, f.razon_social, f.ruc, f.concepto, f.notas,
        ...(f.conceptos || []).map(c => c.descripcion),
        String(f.monto || ""), f.estado, f.forma_pago
      ].filter(Boolean).join(" ").toLowerCase();
      return facAllChips.every(chip => texto.includes(chip.toLowerCase()));
    }), sortBy.facturas);
  // Recibos: chips search
  const reciboAllChips = [...reciboChips, ...(reciboInput.trim() ? [reciboInput.trim()] : [])];
  const filteredRecibos = sortList(recibos
    .filter(r => matchesYear(r.fecha_pago))
    .filter(r => {
      if (reciboAllChips.length === 0) return true;
      const texto = [r.numero, r.factura_numero, r.razon_social, r.ruc, r.notas].filter(Boolean).join(" ").toLowerCase();
      return reciboAllChips.every(chip => texto.includes(chip.toLowerCase()));
    }), sortBy.recibos);
  const filteredIng = sortList((Array.isArray(ingresos) ? ingresos : [])
    .filter(i => i && matchesYear(i.fecha))
    .filter(i =>
      !q || (i.descripcion || "").toLowerCase().includes(q) ||
      (i.categoria || "").toLowerCase().includes(q) ||
      String(i.monto_pyg || i.monto || "").includes(q)
    ).filter(i => logoFilter === "todas" || (i.logo_tipo || "arandujar") === logoFilter), sortBy.ingresos || { key: "fecha", dir: "desc" });
  // ─── Stats ───────────────────────────────────────────────────
  const totalFacturadoPYG = facturas
    .filter(f => f.tipo === "emitida" && f.estado !== "anulada")
    .reduce((s, f) => s + (f.monto_pyg || f.monto || 0), 0);

  const totalCobradoPYG = facturas
    .filter(f => f.tipo === "emitida" && (f.estado === "pagada" || f.estado === "parcial"))
    .reduce((s, f) => {
      // Para parcial: sumar solo lo cobrado (monto_pagado o suma de pagos del período)
      if (f.estado === "parcial") {
        // Si tiene pagos array, sumar los del período filtrado
        const pagosArr = f.pagos || [];
        if (pagosArr.length > 0) {
          const mesFiltro = filtroTipo === "mes" ? mes : null;
          const montoPagos = pagosArr
            .filter(p => !mesFiltro || (p.fecha || "").startsWith(mesFiltro))
            .reduce((ps, p) => ps + (p.monto || 0), 0);
          return s + montoPagos;
        }
        return s + (f.monto_pagado || 0);
      }
      return s + (f.monto_pyg || f.monto || 0);
    }, 0);

  const presAprobados = presupuestos.filter(p => p.estado === "aprobado").length;
  const presBorrador  = presupuestos.filter(p => p.estado === "borrador").length;

  const totalIngresosPYG = ingresos
    .reduce((s, i) => s + (i.monto_pyg || (i.moneda === "PYG" ? i.monto : 0) || 0), 0);

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-slate-400 hover:text-white transition-colors" data-testid="back-btn" title="Volver al Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-heading text-2xl text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-emerald-400" />
              Ventas
            </h1>
            <p className="text-slate-400 text-sm font-body">Presupuestos · Facturas · Ingresos</p>
          </div>
          <EmpresaSwitcher compact />
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
                   : t.id === "recibos" ? filteredRecibos.length
                   : filteredIng.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search — chips para presupuestos, facturas y recibos; simple para otros */}
        {(tab === "presupuestos" || tab === "facturas" || tab === "recibos") ? (() => {
          const isPresupuestos = tab === "presupuestos";
          const isFacturas = tab === "facturas";
          const chips = isPresupuestos ? presChips : isFacturas ? facChips : reciboChips;
          const setChips = isPresupuestos ? setPresChips : isFacturas ? setFacChips : setReciboChips;
          const inputVal = isPresupuestos ? presInput : isFacturas ? facInput : reciboInput;
          const setInputVal = isPresupuestos ? setPresInput : isFacturas ? setFacInput : setReciboInput;
          const accentColor = isPresupuestos ? "blue" : isFacturas ? "emerald" : "amber";
          return (
            <div className="space-y-2">
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  {chips.map((chip, idx) => (
                    <span key={idx} className={`flex items-center gap-1.5 bg-${accentColor}-500/20 text-${accentColor}-300 border border-${accentColor}-500/40 rounded-full px-3 py-1 text-xs font-body`}>
                      <Search className="w-3 h-3" />
                      {chip}
                      <button onClick={() => setChips(prev => prev.filter((_, i) => i !== idx))} className="ml-1 hover:text-white transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <button onClick={() => setChips([])} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-full border border-white/10 hover:border-white/20 transition-all font-body">
                    Limpiar
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-lg">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) {
                        e.preventDefault();
                        const term = inputVal.trim().replace(/,$/, "");
                        if (term && !chips.includes(term)) setChips(prev => [...prev, term]);
                        setInputVal("");
                      }
                      if (e.key === "Backspace" && inputVal === "" && chips.length > 0) {
                        setChips(prev => prev.slice(0, -1));
                      }
                    }}
                    placeholder={
                      isPresupuestos ? "Buscar por nº, empresa, descripción… (Enter para agregar filtro)" :
                      isFacturas ? "Buscar por nº, razón social, concepto… (Enter para agregar filtro)" :
                      "Buscar por nº recibo, factura, empresa… (Enter para agregar filtro)"
                    }
                    className={`w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm font-body focus:outline-none focus:border-${accentColor}-500`}
                  />
                </div>
                {isPresupuestos && hasPermission("presupuestos.crear") && (
                  <button
                    onClick={() => setPresFormItem({ presupuesto: null, mode: "create" })}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-all font-body whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" /> Nuevo presupuesto
                  </button>
                )}
                {isFacturas && hasPermission("facturas.crear") && (
                  <button
                    onClick={() => { setFacFormItem(null); setShowFacForm(true); }}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg transition-all font-body whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" /> Nueva factura
                  </button>
                )}
              </div>
            </div>
          );
        })() : (
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar descripción..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm font-body focus:outline-none focus:border-violet-500"
              />
            </div>
            {tab === "ingresos" && hasPermission("facturas.crear") && (
              <button
                onClick={() => setShowIngForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition-all font-body whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Nuevo ingreso
              </button>
            )}
          </div>
        )}

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
                      <th className="px-4 py-3 text-slate-400 font-medium text-xs text-right">Acciones</th>
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
                          onClick={() => openPresDoc(p.id)}
                          data-testid={`pres-row-${p.id}`}
                          className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-blue-300">#{p.numero}</span>
                            {p.nombre_archivo && (
                              <p className="text-slate-500 text-xs truncate max-w-[130px]">{p.nombre_archivo}</p>
                            )}
                            {p.facturas_count > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Buscar la factura vinculada y abrir su doc view
                                  const facVinc = facturas.find(f =>
                                    (f.presupuesto_ids || []).includes(p.id) || f.presupuesto_id === p.id
                                  );
                                  if (facVinc) {
                                    openFacDoc(facVinc.id);
                                    setTab("facturas");
                                  } else {
                                    setTab("facturas");
                                  }
                                }}
                                title="Ver factura vinculada"
                                data-testid={`pres-${p.id}-fact-link`}
                                className="mt-0.5 text-[10px] bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/20 px-1.5 py-0.5 rounded-full transition-all"
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
                          <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                            <StateDropdown
                              estado={p.estado}
                              options={PRESUP_ESTADOS}
                              onChange={(nuevo) => cambiarEstadoPresupuesto(p.id, nuevo)}
                              disabled={!hasPermission("presupuestos.editar")}
                            />
                          </td>
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {hasPermission("presupuestos.editar") && (
                                <button
                                  onClick={async () => {
                                    const res = await fetch(`${API}/admin/presupuestos/${p.id}`, { headers });
                                    if (res.ok) {
                                      const full = await res.json();
                                      setPresFormItem({ presupuesto: full, mode: "edit" });
                                    } else {
                                      toast.error("Error al cargar presupuesto");
                                    }
                                  }}
                                  title="Editar"
                                  className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-all"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {hasPermission("presupuestos.crear") && (
                                <button
                                  onClick={async () => {
                                    const res = await fetch(`${API}/admin/presupuestos/${p.id}`, { headers });
                                    if (res.ok) {
                                      const full = await res.json();
                                      setPresFormItem({ presupuesto: full, mode: "copy" });
                                    } else {
                                      toast.error("Error al cargar presupuesto");
                                    }
                                  }}
                                  title="Duplicar"
                                  className="p-1.5 rounded-lg text-purple-400 hover:bg-purple-500/10 transition-all"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {hasPermission("costos.editar") && (
                                <button
                                  onClick={async () => {
                                    const res = await fetch(`${API}/admin/presupuestos/${p.id}`, { headers });
                                    if (res.ok) {
                                      const full = await res.json();
                                      setPresCostosItem(full);
                                    } else {
                                      toast.error("Error al cargar presupuesto");
                                    }
                                  }}
                                  title="Costos"
                                  className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 transition-all"
                                >
                                  <Wallet className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {p.estado === "aprobado" && hasPermission("presupuestos.editar") && (
                                <button
                                  onClick={() => setPresFacturarItem(p)}
                                  title="Facturar/Vincular"
                                  className="p-1.5 rounded-lg text-orange-400 hover:bg-orange-500/10 transition-all"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {hasPermission("presupuestos.eliminar") && (
                                <button
                                  onClick={() => deletePresupuesto(p.id)}
                                  title="Eliminar"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                >
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
                {hasPermission("facturas.crear") && (
                  <button onClick={() => { setFacFormItem(null); setShowFacForm(true); }}
                    className="mt-3 text-amber-400 hover:text-amber-300 text-sm">+ Nueva factura</button>
                )}
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
                      <SortTh label="Estado"      sortKey="estado"       currentSort={sortBy.facturas} onClick={(k) => toggleSort("facturas", k)} className="text-center" />
                      <th className="px-4 py-3 text-slate-400 font-medium text-xs text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFac.map(f => (
                      <tr key={f.id}
                        onClick={() => openFacDoc(f.id)}
                        data-testid={`fact-row-${f.id}`}
                        className={`border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors ${f.estado === "anulada" ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-emerald-300">{f.numero || "-"}</span>
                          {f.forma_pago === "credito" && (
                            <span className="ml-2 text-[10px] bg-orange-500/15 text-orange-300 border border-orange-500/20 px-1.5 py-0.5 rounded-full">crédito</span>
                          )}
                          {(f.presupuesto_ids?.length > 0 || f.presupuesto_id) && (
                            <span className="ml-1 text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/20 px-1.5 py-0.5 rounded-full">📄 pres.</span>
                          )}
</td>
                        <td className="px-4 py-3 max-w-[160px]">
                          <p className="text-slate-300 truncate">{f.razon_social || "-"}</p>
                          {f.ruc && <p className="text-slate-500 text-xs">RUC: {f.ruc}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                          {f.fecha || "-"}
                          {f.fecha_vencimiento && f.estado !== "pagada" && (
                            <p className={`text-[10px] ${new Date(f.fecha_vencimiento) < new Date() ? "text-red-400" : "text-slate-500"}`}>
                              Vence: {f.fecha_vencimiento}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-white font-medium">{fmtMonto(f.monto, f.moneda)}</span>
                          {f.monto_pagado > 0 && f.estado !== "pagada" && (
                            <p className="text-blue-400 text-xs">Abonado: {fmtMonto(f.monto_pagado, f.moneda)}</p>
                          )}
                          {f.moneda !== "PYG" && f.tipo_cambio && (
                            <p className="text-slate-500 text-xs">TC: {f.tipo_cambio}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <StateBadge estado={f.estado} />
                          {/* Historial de pagos si hay varios */}
                          {(f.pagos || []).length > 1 && (
                            <div className="mt-1 space-y-0.5">
                              {(f.pagos || []).map((p, i) => (
                                <p key={p.id || i} className="text-[10px]">
                                  <span className="text-slate-500">{p.fecha}</span>
                                  <span className="text-blue-300 ml-1">{fmtMonto(p.monto, f.moneda)}</span>
                                </p>
                              ))}
                            </div>
                          )}
                          {(f.pagos || []).length === 0 && f.fecha_pago && (
                            <p className="text-slate-500 text-[10px] mt-0.5">{f.fecha_pago}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {/* Pagar / Registrar pago */}
                            {(f.estado === "pendiente" || f.estado === "parcial") && hasPermission("facturas.editar") && (
                              f.forma_pago === "credito" ? (
                                <button onClick={() => openPagoParcial(f)} title="Registrar pago"
                                  className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-600/30 px-2 py-1 rounded-lg transition-all">
                                  Registrar pago
                                </button>
                              ) : (
                                <button onClick={() => openPagoContado(f)} title="Pagar"
                                  className="text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-600/30 px-2 py-1 rounded-lg transition-all">
                                  Pagar
                                </button>
                              )
                            )}
                            {/* Deshacer pago */}
                            {(f.estado === "pagada" || f.estado === "parcial") && hasPermission("facturas.editar") && (
                              <button onClick={() => handleDeshacerFac(f)} title="Deshacer pago"
                                className="text-xs bg-white/5 hover:bg-white/10 text-slate-400 px-2 py-1 rounded-lg transition-all">
                                Deshacer
                              </button>
                            )}
                            {/* Editar */}
                            {hasPermission("facturas.editar") && (
                              <button onClick={() => { setFacFormItem(f); setShowFacForm(true); }} title="Editar"
                                className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-all">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Anular */}
                            {f.estado !== "anulada" && hasPermission("facturas.editar") && (
                              <button onClick={() => handleAnularFac(f)} title="Anular"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
                                <AlertCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Eliminar */}
                            {hasPermission("facturas.eliminar") && (
                              <button onClick={() => handleDeleteFac(f)} title="Eliminar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIng.filter(i => i && i.id).map(i => (
                      <tr key={i.id}
                        data-testid={`ing-row-${i.id}`}
                        className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3 text-slate-200 max-w-[220px] cursor-pointer" onClick={() => openPreview("ingreso", i)}>
                          <p className="truncate">{i.descripcion || "-"}</p>
                          {i.cuenta_nombre && <p className="text-blue-400 text-xs truncate">🏦 {i.cuenta_nombre}</p>}
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
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setIngFormItem(i); setShowIngForm(true); }}
                              className="text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={async () => {
                              if (!window.confirm("¿Eliminar este ingreso?")) return;
                              const res = await fetch(`${API}/admin/ingresos-varios/${i.id}`, { method: "DELETE", headers });
                              if (res.ok) { toast.success("Ingreso eliminado"); fetchAll(); }
                              else toast.error("Error al eliminar");
                            }} className="text-slate-400 hover:text-red-400 transition-colors" title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Recibos ─────────────────────────────────────── */}
        {tab === "recibos" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-xs font-body">{filteredRecibos.length} recibo{filteredRecibos.length !== 1 ? "s" : ""}</span>
            </div>
            {loading ? (
              <div className="text-center py-10 text-slate-500 animate-pulse font-body">Cargando...</div>
            ) : filteredRecibos.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-body">
                <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No hay recibos para este período</p>
                <p className="text-xs mt-1 text-slate-600">Los recibos se generan al registrar pagos de facturas</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm font-body">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <SortTh label="Nº Recibo"     sortKey="numero"        currentSort={sortBy.recibos} onClick={(k) => toggleSort("recibos", k)} className="text-left" />
                      <SortTh label="Factura"        sortKey="factura_numero" currentSort={sortBy.recibos} onClick={(k) => toggleSort("recibos", k)} className="text-left" />
                      <SortTh label="Empresa / RZ"   sortKey="razon_social"   currentSort={sortBy.recibos} onClick={(k) => toggleSort("recibos", k)} className="text-left" />
                      <SortTh label="Fecha de pago"  sortKey="fecha_pago"     currentSort={sortBy.recibos} onClick={(k) => toggleSort("recibos", k)} className="text-left" />
                      <SortTh label="Monto"          sortKey="monto"          currentSort={sortBy.recibos} onClick={(k) => toggleSort("recibos", k)} className="text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecibos.map(r => (
                      <tr key={r.id}
                        onClick={() => setReciboDoc(r)}
                        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-amber-300">#{r.numero}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-300 font-mono text-xs">{r.factura_numero || "-"}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-slate-200 truncate">{r.razon_social || "-"}</p>
                          {r.ruc && <p className="text-slate-500 text-xs">RUC: {r.ruc}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{r.fecha_pago || "-"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-white font-medium">{fmtMonto(r.monto, r.moneda)}</span>
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

      {/* Carga de documento presupuesto */}
      {presDocLoading && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-white font-body text-sm animate-pulse">Cargando presupuesto…</div>
        </div>
      )}

      {/* Documento completo de presupuesto */}
      {presDoc && !presDocLoading && (
        <PresupuestoDocModal
          presupuesto={presDoc}
          onClose={() => setPresDoc(null)}
          onEdit={() => { setPresDoc(null); setPresFormItem({ presupuesto: presDoc, mode: "edit" }); }}
          onDelete={() => deletePresupuesto(presDoc.id)}
          onDuplicate={() => duplicatePresupuesto(presDoc)}
          onCostos={() => { setPresDoc(null); setPresCostosItem(presDoc); }}
          onEstadoChange={(nuevo) => { cambiarEstadoPresupuesto(presDoc.id, nuevo); setPresDoc(p => ({ ...p, estado: nuevo })); }}
          canEdit={hasPermission("presupuestos.editar")}
          canDelete={hasPermission("presupuestos.eliminar")}
          canCreate={hasPermission("presupuestos.crear")}
          canCostos={hasPermission("costos.editar")}
          formatNumber={formatNumber}
          getCurrencySymbol={getCurrencySymbol}
          PRESUP_ESTADOS={PRESUP_ESTADOS}
        />
      )}

      {/* ── Nuevo / Editar Ingreso ── */}
      {showIngForm && (
        <IngresosFormModal
          ingreso={ingFormItem}
          cuentasDisp={cuentasDisp}
          activeLogoTipo={activeEmpresaPropia?.slug || "arandujar"}
          token={token}
          API={API}
          onClose={() => { setShowIngForm(false); setIngFormItem(null); }}
          onSaved={() => { setShowIngForm(false); setIngFormItem(null); fetchAll(); toast.success("Ingreso guardado"); }}
        />
      )}

      {/* Vista previa inline (facturas/ingresos) */}
      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={closePreview}
          navigate={navigate}
          token={token}
          onUpdated={() => { closePreview(); fetchAll(); }}
          cuentasDisp={cuentasDisp}
        />
      )}


      {/* Presupuesto Edit/Copy Form */}
      {presFormItem && (
        <PresupuestoFormModal
          presupuesto={presFormItem.presupuesto}
          mode={presFormItem.mode}
          onClose={() => setPresFormItem(null)}
          onSaved={() => { setPresFormItem(null); fetchAll(); }}
          token={token}
          API={API}
          empresas={empresas}
          proveedores={proveedores}
          productos={productos}
          activeEmpresaPropia={activeEmpresaPropia}
          isAdmin={user?.role === "admin"}
          hasPermission={hasPermission}
        />
      )}

      {/* Costos Modal */}
      {presCostosItem && (
        <PresupuestoCostosModal
          presupuesto={presCostosItem}
          onClose={() => setPresCostosItem(null)}
          onSaved={() => { setPresCostosItem(null); fetchAll(); }}
          token={token}
          API={API}
          proveedores={proveedores}
        />
      )}

      {/* Facturar/Vincular Modal */}
      {presFacturarItem && (
        <FacturarModal
          presupuesto={presFacturarItem}
          onClose={() => setPresFacturarItem(null)}
          facturaForm={facturaForm}
          setFacturaForm={setFacturaForm}
          facturaMode={facturaMode}
          setFacturaMode={setFacturaMode}
          facturaSearch={facturaSearch}
          setFacturaSearch={setFacturaSearch}
          facturasDisponibles={facturasDisponibles}
          facturaSeleccionada={facturaSeleccionada}
          setFacturaSeleccionada={setFacturaSeleccionada}
          savingFactura={savingFactura}
          onFacturar={handleFacturar}
          onVincular={handleVincularExistente}
        />
      )}

      {/* ── Documento visual de factura ── */}
      {facDoc && (
        <FacturaDocModal
          factura={facDoc}
          presupuestos={presupuestos}
          onClose={() => setFacDoc(null)}
          onEdit={() => { setFacFormItem(facDoc); setShowFacForm(true); setFacDoc(null); }}
          onDelete={() => { handleDeleteFac(facDoc); setFacDoc(null); }}
          onPagar={() => {
            if (facDoc.forma_pago === "credito") { openPagoParcial(facDoc); setFacDoc(null); }
            else { openPagoContado(facDoc); setFacDoc(null); }
          }}
          onDeshacer={() => { handleDeshacerFac(facDoc); setFacDoc(null); }}
          canEdit={hasPermission("facturas.editar")}
          canDelete={hasPermission("facturas.eliminar")}
          onReciboClick={(r) => setReciboDoc(r)}
          onPresClick={(presId) => { setFacDoc(null); openPresDoc(presId); }}
          onEditPago={(fac, pago) => setEditPagoCtx({ factura: fac, pago })}
          onDeletePago={handleDeletePago}
          cuentasDisp={cuentasDisp}
        />
      )}

      {/* ── Factura Form Modal (nueva/editar) ── */}
      {showFacForm && (
        <FacturaFormModal
          factura={facFormItem || null}
          onClose={() => { setShowFacForm(false); setFacFormItem(null); }}
          onSaved={() => { setShowFacForm(false); setFacFormItem(null); fetchAll(); }}
          token={token}
          API={API}
          empresas={empresas}
          presupuestosDisp={presupuestos}
          activeEmpresaPropia={activeEmpresaPropia}
          hasPermission={hasPermission}
        />
      )}

      {/* ── Modal Pago Contado ── */}
      {showPagoModal && pagoFac && (
        <PagoModal
          fac={pagoFac}
          fechaPago={fechaPago}
          setFechaPago={setFechaPago}
          numeroReciboManual={numeroReciboManual}
          setNumeroReciboManual={setNumeroReciboManual}
          cuentasDisp={cuentasDisp}
          cuentasPYG={cuentasPYG}
          setCuentasPYG={setCuentasPYG}
          cuentasUSD={cuentasUSD}
          setCuentasUSD={setCuentasUSD}
          tcPago={tcPago}
          setTcPago={setTcPago}
          montoUSD={montoUSD}
          setMontoUSD={setMontoUSD}
          onClose={() => setShowPagoModal(false)}
          onConfirm={handlePagarContado}
          fmtMonto={fmtMonto}
        />
      )}

      {/* ── Modal Pago Parcial (crédito) ── */}
      {showPagoParcialModal && pagoParcialFac && (
        <PagoParcialModal
          fac={pagoParcialFac}
          montoParcial={montoParcial}
          setMontoParcial={setMontoParcial}
          fechaPagoParcial={fechaPagoParcial}
          setFechaPagoParcial={setFechaPagoParcial}
          numeroReciboManual={numeroReciboManual}
          setNumeroReciboManual={setNumeroReciboManual}
          cuentasDisp={cuentasDisp}
          cuentasPYG={cuentasPYG}
          setCuentasPYG={setCuentasPYG}
          cuentasUSD={cuentasUSD}
          setCuentasUSD={setCuentasUSD}
          tcPago={tcPago}
          setTcPago={setTcPago}
          montoUSD={montoUSD}
          setMontoUSD={setMontoUSD}
          onClose={() => setShowPagoParcialModal(false)}
          onConfirm={handlePagoParcial}
          fmtMonto={fmtMonto}
        />
      )}

      {/* ── Editar Pago Individual ── */}
      {editPagoCtx && (
        <EditPagoModal
          factura={editPagoCtx.factura}
          pago={editPagoCtx.pago}
          cuentasDisp={cuentasDisp}
          onClose={() => setEditPagoCtx(null)}
          onSave={(cambios) => handleSaveEditPago(editPagoCtx.factura, editPagoCtx.pago, cambios)}
          fmtMonto={fmtMonto}
        />
      )}

      {/* ── Recibo visual ── */}
      {reciboDoc && (
        <ReciboDocModal
          recibo={reciboDoc}
          onClose={() => setReciboDoc(null)}
          fmtMonto={fmtMonto}
          cuentasDisp={cuentasDisp}
        />
      )}
    </div>
  );
}

// ═══ Logos (letras tricolor PY; cuadrado sólido por marca) ════════════════
const LogoArandu = () => <LogoMarcaArandu />;
const LogoJar = () => <LogoMarcaJar />;
const LogoAranduJarDoc = () => <LogoMarcaAranduJar />;

// ═══ Documento completo de presupuesto ══════════════════════════════════
function PresupuestoDocModal({
  presupuesto: p, onClose, onEdit, onDelete, onDuplicate, onCostos,
  onEstadoChange, canEdit, canDelete, canCreate, canCostos,
  formatNumber, getCurrencySymbol, PRESUP_ESTADOS
}) {
  const [printFileName, setPrintFileName] = React.useState(
    p.nombre_archivo ? `${p.numero} - ${p.nombre_archivo}` : `Presupuesto ${p.numero}`
  );

  React.useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const fmt = (num) => formatNumber(num, p.moneda);
  const sym = getCurrencySymbol(p.moneda);
  const accentColor = p.logo_tipo === "jar" ? "#dc2626" : "#2563eb";

  const buildLogoHTML = (logoTipo) => svgLogoMarcaRow(logoTipo);

  // ── Imprimir por partes: máx 15 ítems por hoja (diseño colorido) ─────────
  const handlePrintPorPartes = () => {
    const moneda = p.moneda || "PYG";
    const isUSD = moneda === "USD";
    const formaPagoLabel = (p.forma_pago || "contado") === "credito" ? "A crédito" : "Al contado";
    const roundVal = v => isUSD ? Math.round(v * 100) / 100 : Math.round(v);
    const ITEMS_POR_HOJA = 15;
    const allItems = p.items || [];
    const chunks = allItems.length > 0
      ? Array.from({ length: Math.ceil(allItems.length / ITEMS_POR_HOJA) }, (_, i) => allItems.slice(i * ITEMS_POR_HOJA, (i + 1) * ITEMS_POR_HOJA))
      : [[]];
    const totalHojas = chunks.length;

    const isJar = p.logo_tipo === "jar";
    const headerBg = isJar ? "#7f1d1d" : "#1e3a5f";
    const headerAccent = isJar ? "#ef4444" : "#3b82f6";
    const printUid = Math.random().toString(36).slice(2, 11);
    const marca = normalizeLogoTipo(p.logo_tipo);
    const iconBox = `<div style="width:44px;height:44px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;margin-right:8px">${svgMarcaIcon(marca, printUid, 44)}</div>`;
    const logoName = `<div style="line-height:1">${svgPrintLogoName(p.logo_tipo, printUid, { darkHeader: true })}</div>`;

    const pagesHTML = chunks.map((chunkItems, idx) => {
      const partNum = idx + 1;
      const numero = partNum === 1 ? p.numero : `${p.numero}-${partNum}`;
      const isLastHoja = idx === totalHojas - 1;
      const chunkTotal = chunkItems.reduce((s, item) => s + (parseFloat(item.subtotal) || 0), 0);
      const chunkIva = roundVal(chunkTotal / 11);
      const chunkSubtotal = roundVal(chunkTotal - chunkIva);

      const itemsRows = chunkItems.map((item, i) => `
        <tr style="background:${i % 2 === 0 ? "white" : "#f8fafc"}">
          <td style="border:1px solid #e2e8f0;padding:5px 8px;color:#1e293b;font-size:11px">
            ${item.descripcion || ""}
            ${item.observacion ? `<div style="color:#64748b;font-size:10px;font-style:italic;margin-top:1px">Obs: ${item.observacion}</div>` : ""}
          </td>
          <td style="border:1px solid #e2e8f0;padding:5px 4px;text-align:center;color:#334155;font-size:11px">${item.cantidad}</td>
          <td style="border:1px solid #e2e8f0;padding:5px 6px;text-align:right;color:#334155;font-size:11px">${fmt(item.precio_unitario)} ${sym}</td>
          <td style="border:1px solid #e2e8f0;padding:5px 6px;text-align:right;color:#1e293b;font-size:11px;font-weight:600">${fmt(item.subtotal)} ${sym}</td>
        </tr>`).join("");

      const footerSection = isLastHoja ? `
        ${p.observaciones || p.condiciones ? `<div style="margin-top:10px">
          ${p.observaciones ? `<div style="background:#fefce8;padding:7px 10px;border-left:3px solid #eab308;border-radius:0 4px 4px 0;margin-bottom:6px;font-size:10px"><strong style="color:#92400e">OBSERVACIONES:</strong><br><span style="color:#713f12">${p.observaciones.replace(/\n/g, "<br>")}</span></div>` : ""}
          ${p.condiciones ? `<div style="background:#f0fdf4;padding:7px 10px;border-left:3px solid #22c55e;border-radius:0 4px 4px 0;font-size:10px"><strong style="color:#166534">CONDICIONES:</strong><br><span style="color:#15803d">${p.condiciones.replace(/\n/g, "<br>")}</span></div>` : ""}
        </div>` : ""}` :
        `<div style="text-align:right;font-size:10px;color:#64748b;margin-top:6px;font-style:italic">Hoja ${partNum} de ${totalHojas} — continúa en siguiente hoja →</div>`;

      return `
        <div style="page-break-after:${isLastHoja ? "avoid" : "always"};page-break-inside:avoid;padding:10mm 12mm 8mm;background:white;min-height:0">
          <!-- ENCABEZADO OSCURO -->
          <div style="background:${headerBg};border-radius:8px;padding:12px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center">
              ${iconBox}
              <div>
                ${logoName}
                <div style="font-size:8px;color:#cbd5e1;letter-spacing:2px;margin-top:1px">INFORMÁTICA</div>
                <div style="margin-top:6px;font-size:9px;color:#94a3b8;line-height:1.5">
                  <div>De la Conquista 1132 c/ Isabel la Católica</div>
                  <div>Barrio Sajonia, Asunción, Paraguay</div>
                  <div>Tel: 021-421330 · WhatsApp: 0981 500 282</div>
                  <div>info@aranduinformatica.net</div>
                </div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="background:${headerAccent};color:white;font-size:13px;font-weight:800;letter-spacing:2px;padding:4px 14px;border-radius:5px;margin-bottom:6px;display:inline-block">PRESUPUESTO</div>
              <div style="font-size:17px;font-weight:700;color:white;margin-bottom:2px">${numero}</div>
              ${totalHojas > 1 ? `<div style="font-size:9px;color:#94a3b8;margin-bottom:2px">Hoja ${partNum} de ${totalHojas}</div>` : ""}
              <div style="font-size:10px;color:#94a3b8">Fecha: <span style="color:#e2e8f0">${p.fecha}</span></div>
              <div style="font-size:9px;color:#94a3b8;margin-top:1px">Validez: ${p.validez_dias || 15} días</div>
            </div>
          </div>
          <!-- CLIENTE (solo en primera hoja) -->
          ${partNum === 1 ? `
          <div style="background:#f0f7ff;border-left:4px solid ${headerAccent};padding:7px 12px;border-radius:0 5px 5px 0;margin-bottom:10px">
            <div style="font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Cliente</div>
            <div style="font-size:13px;font-weight:700;color:#1e293b">${p.empresa_nombre || ""}</div>
            ${p.empresa_ruc ? `<div style="font-size:10px;color:#475569;margin-top:1px">RUC: ${p.empresa_ruc}</div>` : ""}
            <div style="font-size:10px;color:#475569;margin-top:1px">Forma de pago: <strong>${formaPagoLabel}</strong></div>
          </div>` : ""}
          <!-- TABLA -->
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:${headerBg}">
                <th style="border:1px solid ${headerBg};padding:6px 8px;text-align:left;font-size:10px;color:white;font-weight:700">Descripción</th>
                <th style="border:1px solid ${headerBg};padding:6px 4px;text-align:center;width:40px;font-size:10px;color:white;font-weight:700">Cant.</th>
                <th style="border:1px solid ${headerBg};padding:6px;text-align:right;width:110px;font-size:10px;color:white;font-weight:700">Precio Unit.</th>
                <th style="border:1px solid ${headerBg};padding:6px;text-align:right;width:110px;font-size:10px;color:white;font-weight:700">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
            <tfoot>
              <tr style="background:${headerBg}">
                <td colspan="3" style="border:1px solid ${headerBg};padding:6px 8px;text-align:right;font-weight:800;font-size:12px;color:white">${isLastHoja ? "TOTAL A PAGAR:" : `SUBTOTAL hoja ${partNum}:`}</td>
                <td style="border:1px solid ${headerBg};padding:6px 8px;text-align:right;font-weight:800;font-size:12px;color:white">${fmt(chunkTotal)} ${sym}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td colspan="3" style="border:1px solid #e2e8f0;padding:4px 8px;text-align:right;font-size:10px;color:#64748b">Base imponible:</td>
                <td style="border:1px solid #e2e8f0;padding:4px 8px;text-align:right;font-size:10px;color:#64748b">${fmt(chunkSubtotal)} ${sym}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td colspan="3" style="border:1px solid #e2e8f0;padding:4px 8px;text-align:right;font-size:10px;color:#64748b">IVA incluido (10%):</td>
                <td style="border:1px solid #e2e8f0;padding:4px 8px;text-align:right;font-size:10px;color:#64748b">${fmt(chunkIva)} ${sym}</td>
              </tr>
            </tfoot>
          </table>
          ${footerSection}
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${printFileName}</title>
      <style>
        @page{size:A4;margin:0}
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{height:auto;overflow:visible;font-family:Arial,Helvetica,sans-serif;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        tr{page-break-inside:avoid;break-inside:avoid}
        @media print{@page{size:A4;margin:0}html,body{height:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{page-break-inside:avoid;break-inside:avoid}}
      </style>
      </head><body>${pagesHTML}</body></html>`;

    const pw = window.open("", "_blank", "width=900,height=700");
    if (!pw) { alert("Permita ventanas emergentes para imprimir."); return; }
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    setTimeout(() => pw.print(), 700);
  };

  // handlePrint — presupuesto completo en una sola pasada, sin cortes forzados
  // El browser maneja los saltos de página naturalmente; page-break-inside:avoid evita cortar filas
  const handlePrint = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Permita ventanas emergentes para imprimir."); return; }
    const isJar = p.logo_tipo === "jar";
    const headerBg = isJar ? "#7f1d1d" : "#1e3a5f";
    const headerAccent = isJar ? "#ef4444" : "#3b82f6";
    const printUid2 = Math.random().toString(36).slice(2, 11);
    const marca2 = normalizeLogoTipo(p.logo_tipo);
    const iconBox = `<div style="width:46px;height:46px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;margin-right:10px">${svgMarcaIcon(marca2, printUid2, 46)}</div>`;
    const logoName = `<div style="line-height:1">${svgPrintLogoName(p.logo_tipo, printUid2, { darkHeader: true })}</div>`;
    const rows = (p.items || []).map((item, idx) => `
      <tr style="background:${idx % 2 === 0 ? "white" : "#f8fafc"};page-break-inside:avoid">
        <td style="border:1px solid #e2e8f0;padding:6px 9px;color:#1e293b;font-size:11.5px">
          ${item.descripcion || ""}
          ${item.observacion ? `<div style="color:#64748b;font-size:10px;font-style:italic;margin-top:2px">Obs: ${item.observacion}</div>` : ""}
        </td>
        <td style="border:1px solid #e2e8f0;padding:6px 5px;text-align:center;color:#334155;font-size:11.5px">${item.cantidad}</td>
        <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;color:#334155;font-size:11.5px">${fmt(item.precio_unitario)} ${sym}</td>
        <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;color:#1e293b;font-size:11.5px;font-weight:600">${fmt(item.subtotal)} ${sym}</td>
      </tr>`).join("");
    const total = p.total || 0;
    const iva = p.moneda === "USD" ? Math.round((total/11)*100)/100 : Math.round(total/11);
    const subtotal = total - iva;
    const formaPagoLabel = (p.forma_pago||"contado")==="credito" ? "A crédito" : "Al contado";
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${printFileName}</title>
      <style>
        @page{size:A4;margin:0}
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{height:auto;overflow:visible;font-family:Arial,Helvetica,sans-serif;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        table{border-collapse:collapse;width:100%}
        tr{page-break-inside:avoid;break-inside:avoid}
        thead{display:table-header-group}
        tfoot{display:table-footer-group}
        @media print{@page{size:A4;margin:0}html,body{height:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{page-break-inside:avoid;break-inside:avoid}}
      </style></head><body>
      <div style="padding:11mm 13mm 9mm">
        <!-- ENCABEZADO -->
        <div style="background:${headerBg};border-radius:9px;padding:14px 18px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center">
            ${iconBox}
            <div>
              ${logoName}
              <div style="font-size:8px;color:#cbd5e1;letter-spacing:2px;margin-top:1px">INFORMÁTICA</div>
              <div style="margin-top:7px;font-size:9.5px;color:#94a3b8;line-height:1.5">
                <div>De la Conquista 1132 c/ Isabel la Católica</div>
                <div>Barrio Sajonia, Asunción, Paraguay</div>
                <div>Tel: 021-421330 · WhatsApp: 0981 500 282</div>
                <div>info@aranduinformatica.net</div>
              </div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="background:${headerAccent};color:white;font-size:15px;font-weight:800;letter-spacing:3px;padding:5px 16px;border-radius:5px;margin-bottom:7px;display:inline-block">PRESUPUESTO</div>
            <div style="font-size:19px;font-weight:700;color:white;margin-bottom:2px">${p.numero}</div>
            <div style="font-size:10.5px;color:#94a3b8">Fecha: <span style="color:#e2e8f0">${p.fecha}</span></div>
            <div style="font-size:9.5px;color:#94a3b8;margin-top:2px">Validez: ${p.validez_dias || 15} días</div>
          </div>
        </div>
        <!-- CLIENTE -->
        <div style="background:#f0f7ff;border-left:4px solid ${headerAccent};padding:8px 12px;border-radius:0 5px 5px 0;margin-bottom:12px">
          <div style="font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Cliente</div>
          <div style="font-size:14px;font-weight:700;color:#1e293b">${p.empresa_nombre || ""}</div>
          ${p.empresa_ruc ? `<div style="font-size:10.5px;color:#475569;margin-top:1px">RUC: ${p.empresa_ruc}</div>` : ""}
          <div style="font-size:10.5px;color:#475569;margin-top:1px">Forma de pago: <strong>${formaPagoLabel}</strong></div>
        </div>
        <!-- TABLA COMPLETA (sin cortes forzados entre filas) -->
        <table>
          <thead>
            <tr style="background:${headerBg}">
              <th style="border:1px solid ${headerBg};padding:7px 9px;text-align:left;font-size:10.5px;color:white;font-weight:700">Descripción</th>
              <th style="border:1px solid ${headerBg};padding:7px 5px;text-align:center;width:45px;font-size:10.5px;color:white;font-weight:700">Cant.</th>
              <th style="border:1px solid ${headerBg};padding:7px;text-align:right;width:115px;font-size:10.5px;color:white;font-weight:700">Precio Unit.</th>
              <th style="border:1px solid ${headerBg};padding:7px;text-align:right;width:115px;font-size:10.5px;color:white;font-weight:700">Subtotal</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:${headerBg};page-break-inside:avoid">
              <td colspan="3" style="border:1px solid ${headerBg};padding:8px 9px;text-align:right;font-weight:800;font-size:13px;color:white">TOTAL A PAGAR:</td>
              <td style="border:1px solid ${headerBg};padding:8px 9px;text-align:right;font-weight:800;font-size:13px;color:white">${fmt(total)} ${sym}</td>
            </tr>
            <tr style="background:#f8fafc;page-break-inside:avoid">
              <td colspan="3" style="border:1px solid #e2e8f0;padding:4px 9px;text-align:right;font-size:10.5px;color:#64748b">Base imponible:</td>
              <td style="border:1px solid #e2e8f0;padding:4px 9px;text-align:right;font-size:10.5px;color:#64748b">${fmt(subtotal)} ${sym}</td>
            </tr>
            <tr style="background:#f8fafc;page-break-inside:avoid">
              <td colspan="3" style="border:1px solid #e2e8f0;padding:4px 9px;text-align:right;font-size:10.5px;color:#64748b">IVA incluido (10%):</td>
              <td style="border:1px solid #e2e8f0;padding:4px 9px;text-align:right;font-size:10.5px;color:#64748b">${fmt(iva)} ${sym}</td>
            </tr>
          </tfoot>
        </table>
        ${p.observaciones || p.condiciones ? `
        <div style="margin-top:12px;page-break-inside:avoid;break-inside:avoid">
          ${p.observaciones ? `<div style="background:#fefce8;padding:9px 11px;border-left:4px solid #eab308;border-radius:0 5px 5px 0;margin-bottom:7px;page-break-inside:avoid;break-inside:avoid"><strong style="color:#92400e;font-size:10.5px">OBSERVACIONES:</strong><br><span style="font-size:10.5px;color:#713f12">${p.observaciones.replace(/\n/g,"<br>")}</span></div>` : ""}
          ${p.condiciones ? `<div style="background:#f0fdf4;padding:9px 11px;border-left:4px solid #22c55e;border-radius:0 5px 5px 0;page-break-inside:avoid;break-inside:avoid"><strong style="color:#166534;font-size:10.5px">CONDICIONES:</strong><br><span style="font-size:10.5px;color:#15803d">${p.condiciones.replace(/\n/g,"<br>")}</span></div>` : ""}
        </div>` : ""}
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 700);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 font-medium text-sm">Vista previa del presupuesto</span>
            <div className="flex items-center gap-2">
              <label className="text-gray-500 text-xs whitespace-nowrap">Nombre:</label>
              <input type="text" value={printFileName} onChange={e => setPrintFileName(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 w-48 focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1.5">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-all">
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              {(p.items || []).length > 0 && (
                <button onClick={handlePrintPorPartes}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-lg transition-all"
                  title="Divide en hojas de máx. 15 ítems con IVA y totales por hoja">
                  <Printer className="w-3.5 h-3.5" /> Por partes
                </button>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {canEdit && (
                <button onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-700 text-xs rounded-lg border border-yellow-500/30 transition-all">
                  <Edit className="w-3.5 h-3.5" /> Editar
                </button>
              )}
              {canCreate && (
                <button onClick={onDuplicate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-700 text-xs rounded-lg border border-purple-500/30 transition-all">
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </button>
              )}
              {canCostos && (
                <button onClick={onCostos}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-700 text-xs rounded-lg border border-cyan-500/30 transition-all">
                  <Wallet className="w-3.5 h-3.5" /> Costos
                </button>
              )}
              {canEdit && (
                <div onClick={e => e.stopPropagation()}>
                  <StateDropdown
                    estado={p.estado}
                    options={PRESUP_ESTADOS}
                    onChange={onEstadoChange}
                  />
                </div>
              )}
              {canDelete && (
                <button onClick={onDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 text-xs rounded-lg border border-red-500/20 transition-all">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              )}
              <button onClick={onClose}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg transition-all">
                <X className="w-3.5 h-3.5" /> Cerrar
              </button>
            </div>
          </div>
        </div>

        {/* Header del documento */}
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              {p.logo_tipo === "arandu" && <LogoArandu />}
              {p.logo_tipo === "jar" && <LogoJar />}
              {(!p.logo_tipo || p.logo_tipo === "arandujar") && <LogoAranduJarDoc />}
              <div className="mt-4 text-sm text-gray-600">
                <p>De la Conquista 1132 c/ Isabel la Católica</p>
                <p>Barrio Sajonia, Asunción - Paraguay</p>
                <p>Tel: 021-421330 | WhatsApp: 0981 500 282</p>
                <p>info@aranduinformatica.net</p>
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-bold text-gray-800">PRESUPUESTO</h1>
              <p className="text-lg font-semibold" style={{ color: accentColor }}>{p.numero}</p>
              {p.nombre_archivo && <p className="text-gray-500 text-sm">{p.nombre_archivo}</p>}
              <p className="text-gray-600">Fecha: {p.fecha}</p>
              <p className="text-gray-500 text-sm">Validez: {p.validez_dias || 15} días</p>
            </div>
          </div>
        </div>

        {/* Cliente */}
        <div className="p-6 bg-gray-50">
          <h3 className="font-semibold text-gray-700 mb-2">CLIENTE:</h3>
          <p className="text-lg font-medium text-gray-800">{p.empresa_nombre}</p>
          {p.empresa_ruc && <p className="text-sm text-gray-600">RUC: {p.empresa_ruc}</p>}
          <p className="text-sm text-gray-600 mt-1">Forma de pago: <strong>{(p.forma_pago || "contado") === "credito" ? "A crédito" : "Al contado"}</strong></p>
        </div>

        {/* Items */}
        <div className="p-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-gray-400 p-2 text-left text-gray-800 font-bold">Descripción</th>
                <th className="border border-gray-400 p-2 text-center w-20 text-gray-800 font-bold">Cant.</th>
                <th className="border border-gray-400 p-2 text-right w-32 text-gray-800 font-bold">Precio Unit.</th>
                <th className="border border-gray-400 p-2 text-right w-32 text-gray-800 font-bold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(p.items || []).map((item, idx) => (
                <tr key={idx} className="bg-white">
                  <td className="border border-gray-400 p-2 text-gray-800">
                    {item.descripcion}
                    {item.observacion && <p className="text-gray-500 text-xs italic mt-1">Obs: {item.observacion}</p>}
                  </td>
                  <td className="border border-gray-400 p-2 text-center text-gray-800">{item.cantidad}</td>
                  <td className="border border-gray-400 p-2 text-right text-gray-800">{fmt(item.precio_unitario)} {sym}</td>
                  <td className="border border-gray-400 p-2 text-right text-gray-800">{fmt(item.subtotal)} {sym}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#dbeafe" }}>
                <td colSpan="3" className="border border-gray-400 p-2 text-right font-bold text-lg text-gray-900">TOTAL:</td>
                <td className="border border-gray-400 p-2 text-right font-bold text-lg" style={{ color: accentColor }}>
                  {fmt(p.total || 0)} {sym}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td colSpan="3" className="border border-gray-400 p-2 text-right text-sm text-gray-600">Base imponible:</td>
                <td className="border border-gray-400 p-2 text-right text-sm text-gray-600">{fmt(p.subtotal || 0)} {sym}</td>
              </tr>
              <tr className="bg-gray-50">
                <td colSpan="3" className="border border-gray-400 p-2 text-right text-sm text-gray-600">IVA incluido (10%):</td>
                <td className="border border-gray-400 p-2 text-right text-sm text-gray-600">{fmt(p.iva || 0)} {sym}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Observaciones y Condiciones */}
        {(p.observaciones || p.condiciones) && (
          <div className="px-6 pb-6 space-y-3">
            {p.observaciones && (
              <div className="bg-yellow-50 p-3 border-l-4 border-yellow-400 rounded-r">
                <strong className="text-yellow-800 text-sm">Observaciones:</strong>
                <p className="text-gray-700 text-sm mt-1 whitespace-pre-line">{p.observaciones}</p>
              </div>
            )}
            {p.condiciones && (
              <div>
                <strong className="text-gray-700 text-sm">Condiciones:</strong>
                <p className="text-gray-600 text-sm mt-1 whitespace-pre-line">{p.condiciones}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Vista previa inline (modal) ════════════════════════════════════════
function PreviewModal({ item, onClose, navigate, token, onUpdated, cuentasDisp = [] }) {
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
    ingreso:     `Ingreso: ${d.descripcion || ""}`,
  }[kind] || "Detalle";

  const editUrl = {
    presupuesto: "/admin/presupuestos",
    factura:     "/admin/facturas",
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
          {kind === "ingreso"     && <IngresoPreview i={d} cuentasDisp={cuentasDisp} />}
        </div>
        <div className="border-t border-white/10 px-6 py-3 flex justify-end gap-2">
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


function IngresoPreview({ i, cuentasDisp = [] }) {
  const moneda = i.moneda || "PYG";
  const montoConvertido = moneda !== "PYG" && i.tipo_cambio
    ? i.monto * i.tipo_cambio
    : null;

  return (
    <>
      {/* Monto destacado */}
      <div className="flex flex-col items-center justify-center bg-violet-500/10 border border-violet-500/20 rounded-xl py-5 mb-4">
        <p className="text-violet-300 text-xs uppercase tracking-widest mb-1 font-body">Monto ingresado</p>
        <p className="font-heading font-bold text-3xl text-violet-200">
          {fmtMonto(i.monto || 0, moneda)}
        </p>
        {montoConvertido && (
          <p className="text-slate-400 text-sm mt-1">
            ≈ {fmtMonto(montoConvertido, "PYG")} <span className="text-slate-500 text-xs">TC {i.tipo_cambio}</span>
          </p>
        )}
      </div>

      {/* Categoría badge */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-1">
        <span className="text-slate-400 text-xs uppercase tracking-wider">Categoría</span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 font-body">
          {i.categoria || "—"}
        </span>
      </div>

      <PreviewRow label="Descripción" value={i.descripcion} />
      <PreviewRow label="Fecha"       value={i.fecha} />
      <PreviewRow label="Moneda"      value={moneda} />

      {/* Cuenta bancaria — con fallback a predeterminada si el registro es viejo */}
      {(() => {
        const cuentaEf = i.cuenta_nombre
          || cuentasDisp.find(c => c.logo_tipo === i.logo_tipo && c.moneda === moneda && c.es_predeterminada)?.nombre
          || cuentasDisp.find(c => c.logo_tipo === i.logo_tipo && c.moneda === moneda)?.nombre
          || null;
        if (!cuentaEf) return null;
        return (
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-slate-400 text-xs uppercase tracking-wider">Cuenta</span>
            <span className="text-blue-300 text-sm flex items-center gap-1 font-body">
              🏦 {cuentaEf}
            </span>
          </div>
        );
      })()}

      {/* Empresa */}
      {i.logo_tipo && (
        <PreviewRow label="Empresa" value={
          i.logo_tipo === "arandu" ? "Arandu Informática"
          : i.logo_tipo === "jar"  ? "JAR Informática"
          : "Arandu&JAR"
        } />
      )}

      {i.notas && (
        <div className="mt-3 bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-3">
          <p className="text-amber-400 text-xs uppercase tracking-wider mb-1">Notas</p>
          <p className="text-slate-200 text-sm font-body">{i.notas}</p>
        </div>
      )}

      {/* Fecha de carga */}
      {i.created_at && (
        <p className="text-slate-600 text-xs text-right mt-3 font-body">
          Registrado: {i.created_at.slice(0, 10)}
        </p>
      )}
    </>
  );
}

function FacturarModal({
  presupuesto, onClose, facturaForm, setFacturaForm, facturaMode, setFacturaMode,
  facturaSearch, setFacturaSearch, facturasDisponibles, facturaSeleccionada,
  setFacturaSeleccionada, savingFactura, onFacturar, onVincular
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-arandu-dark-light border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-heading text-lg text-white mb-1">Facturar presupuesto</h2>
        <p className="text-slate-400 text-sm mb-4">
          <span className="text-white font-medium">{presupuesto.numero}</span>
          {presupuesto.nombre_archivo && <span className="text-slate-300"> — {presupuesto.nombre_archivo}</span>}
          <br/>
          <span className="text-slate-500">{presupuesto.empresa_nombre} · {presupuesto.moneda === "USD" ? `USD ${presupuesto.total}` : `₲ ${Number(presupuesto.total).toLocaleString("es-PY")}`}</span>
        </p>

        {/* Tabs: Nueva / Existente */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-4">
          {[
            { key: "nueva",     label: "Crear nueva factura" },
            { key: "existente", label: "Vincular existente" },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFacturaMode(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                facturaMode === t.key ? "bg-orange-500 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: NUEVA ── */}
        {facturaMode === "nueva" && (
          <div className="space-y-3">
            <div>
              <label className="text-slate-400 text-xs block mb-1">Número de factura *</label>
              <input
                type="text"
                value={facturaForm.numero}
                onChange={e => setFacturaForm(f => ({ ...f, numero: e.target.value }))}
                placeholder="001-001-0000001"
                className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
                autoFocus
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Fecha de factura</label>
              <input
                type="date"
                value={facturaForm.fecha}
                onChange={e => setFacturaForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Forma de pago</label>
              <div className="flex gap-2">
                {[{ value: "contado", label: "Contado" }, { value: "credito", label: "Crédito" }].map(fp => (
                  <button
                    key={fp.value}
                    type="button"
                    onClick={() => setFacturaForm(f => ({ ...f, forma_pago: fp.value }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                      facturaForm.forma_pago === fp.value
                        ? "border-orange-400 bg-orange-500/20 text-orange-300"
                        : "border-white/10 text-slate-400 hover:border-white/30"
                    }`}
                  >
                    {fp.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Notas (opcional)</label>
              <input
                type="text"
                value={facturaForm.notas}
                onChange={e => setFacturaForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones de la factura..."
                className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>
        )}

        {/* ── TAB: EXISTENTE ── */}
        {facturaMode === "existente" && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={facturaSearch}
                onChange={e => setFacturaSearch(e.target.value)}
                placeholder="Buscar por número, empresa o concepto..."
                className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {facturasDisponibles
                .filter(f => {
                  if (f.presupuesto_id && f.presupuesto_id !== presupuesto.id) return false;
                  if (!facturaSearch.trim()) return true;
                  const q = facturaSearch.toLowerCase();
                  return (f.numero || "").toLowerCase().includes(q)
                    || (f.razon_social || "").toLowerCase().includes(q)
                    || (f.concepto || "").toLowerCase().includes(q);
                })
                .map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFacturaSeleccionada(prev => prev?.id === f.id ? null : f)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      facturaSeleccionada?.id === f.id
                        ? "border-orange-400 bg-orange-500/15 text-white"
                        : "border-white/10 text-slate-300 hover:border-white/25 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{f.numero}</span>
                      <span className={`text-xs ${f.estado === "pagada" ? "text-emerald-400" : f.estado === "anulada" ? "text-red-400" : "text-amber-400"}`}>
                        {f.estado}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{f.razon_social} · {f.fecha}</p>
                    {f.concepto && <p className="text-xs text-slate-500 truncate">{f.concepto}</p>}
                    {f.presupuesto_id === presupuesto.id && (
                      <p className="text-xs text-orange-400 mt-0.5">✓ Ya vinculada a este presupuesto</p>
                    )}
                  </button>
                ))}
              {facturasDisponibles.filter(f => {
                if (f.presupuesto_id && f.presupuesto_id !== presupuesto.id) return false;
                if (!facturaSearch.trim()) return true;
                const q = facturaSearch.toLowerCase();
                return (f.numero || "").toLowerCase().includes(q)
                  || (f.razon_social || "").toLowerCase().includes(q)
                  || (f.concepto || "").toLowerCase().includes(q);
              }).length === 0 && (
                <p className="text-slate-500 text-sm text-center py-6">
                  {facturaSearch ? "Sin resultados" : "No hay facturas emitidas disponibles"}
                </p>
              )}
            </div>
            {facturaSeleccionada && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-xs text-orange-300">
                Seleccionada: <strong>{facturaSeleccionada.numero}</strong> — {facturaSeleccionada.razon_social}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-slate-300 hover:text-white hover:border-white/30 transition-all text-sm font-body"
          >
            Cancelar
          </button>
          <button
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-all text-sm font-body flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={facturaMode === "nueva" ? onFacturar : onVincular}
            disabled={savingFactura || (facturaMode === "existente" && !facturaSeleccionada)}
          >
            <Receipt className="w-4 h-4" />
            {savingFactura
              ? "Guardando..."
              : facturaMode === "nueva" ? "Crear y vincular" : "Vincular factura"
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FacturaDocModal — vista visual de factura (estilo documento)
// ═══════════════════════════════════════════════════════════════
function FacturaDocModal({ factura: f, presupuestos = [], onClose, onEdit, onDelete, onPagar, onDeshacer, canEdit, canDelete, onReciboClick, onPresClick, onEditPago, onDeletePago, cuentasDisp = [] }) {
  React.useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const accentColor = f.logo_tipo === "jar" ? "#dc2626" : "#2563eb";
  const monedaSym = f.moneda === "PYG" ? "₲" : f.moneda;
  const fmt = (n) => {
    if (n == null) return "-";
    if (f.moneda === "PYG") return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
    return `${f.moneda} ${Number(n).toLocaleString("es-PY", { minimumFractionDigits: 2 })}`;
  };
  const total = f.monto || 0;
  const iva = f.moneda === "PYG" ? Math.round(total / 11) : Math.round((total / 11) * 100) / 100;
  const base = total - iva;

  const ESTADO_STYLE = {
    pagada:   { bg: "#d1fae5", text: "#065f46", border: "#a7f3d0" },
    pendiente:{ bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
    parcial:  { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
    anulada:  { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0" },
  };
  const est = ESTADO_STYLE[f.estado] || ESTADO_STYLE.pendiente;

  // Cuenta predeterminada por moneda/empresa (fallback para registros viejos sin cuenta asignada)
  const getCuentaFallback = (moneda, logo_tipo) =>
    cuentasDisp.find(c => c.logo_tipo === logo_tipo && c.moneda === moneda && c.es_predeterminada)?.nombre
    || cuentasDisp.find(c => c.logo_tipo === logo_tipo && c.moneda === moneda)?.nombre
    || null;

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const docLogo = svgDocumentHeaderLogoHtml(f.logo_tipo);
    const itemRows = (f.conceptos || []).length > 0
      ? (f.conceptos || []).map(c => `
          <tr>
            <td style="border:1px solid #d1d5db;padding:8px">${c.descripcion || ""}</td>
            <td style="border:1px solid #d1d5db;padding:8px;text-align:right">${f.moneda === "PYG" ? "₲ " + Math.round(c.monto || 0).toLocaleString("es-PY") : f.moneda + " " + (c.monto || 0)}</td>
          </tr>`).join("")
      : `<tr><td style="border:1px solid #d1d5db;padding:8px" colspan="2">${f.concepto || ""}</td></tr>`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Factura ${f.numero}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:20px;max-width:800px;margin:0 auto}</style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid ${accentColor};padding-bottom:16px">
        <div>
          ${docLogo}
          <div style="margin-top:12px;font-size:12px;color:#6b7280">
            <p>De la Conquista 1132 c/ Isabel la Católica</p><p>Barrio Sajonia, Asunción - Paraguay</p>
            <p>Tel: 021-421330 | info@aranduinformatica.net</p>
          </div>
        </div>
        <div style="text-align:right">
          <h1 style="font-size:22px;font-weight:700;color:#1f2937;margin:0">FACTURA</h1>
          <p style="font-size:18px;font-weight:600;color:${accentColor};margin:4px 0">${f.numero}</p>
          <p style="color:#6b7280;margin:2px 0;font-size:13px">Fecha: ${f.fecha || "-"}</p>
          <p style="font-size:12px;color:#9ca3af">Forma de pago: ${f.forma_pago === "credito" ? "A crédito" : "Al contado"}</p>
          ${f.fecha_vencimiento ? `<p style="font-size:11px;color:#9ca3af">Vencimiento: ${f.fecha_vencimiento}</p>` : ""}
        </div>
      </div>
      <div style="background:#f9fafb;padding:12px;border-radius:4px;margin-bottom:20px">
        <strong style="color:#374151">CLIENTE:</strong>
        <p style="font-size:16px;font-weight:600;margin:4px 0">${f.razon_social || ""}</p>
        ${f.ruc ? `<p style="font-size:12px;color:#6b7280">RUC: ${f.ruc}</p>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead><tr style="background:#e5e7eb">
          <th style="border:1px solid #d1d5db;padding:8px;text-align:left">Descripción / Concepto</th>
          <th style="border:1px solid #d1d5db;padding:8px;text-align:right;width:140px">Monto</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:#f9fafb"><td style="border:1px solid #d1d5db;padding:6px;text-align:right;font-size:12px;color:#6b7280">Base imponible:</td><td style="border:1px solid #d1d5db;padding:6px;text-align:right;font-size:12px;color:#6b7280">${fmt(base)}</td></tr>
          <tr style="background:#f9fafb"><td style="border:1px solid #d1d5db;padding:6px;text-align:right;font-size:12px;color:#6b7280">IVA 10%:</td><td style="border:1px solid #d1d5db;padding:6px;text-align:right;font-size:12px;color:#6b7280">${fmt(iva)}</td></tr>
          <tr style="background:#dbeafe"><td style="border:1px solid #d1d5db;padding:8px;text-align:right;font-weight:700;font-size:16px">TOTAL:</td><td style="border:1px solid #d1d5db;padding:8px;text-align:right;font-weight:700;font-size:16px;color:${accentColor}">${fmt(total)}</td></tr>
        </tfoot>
      </table>
      ${f.notas ? `<div style="background:#fefce8;padding:10px;border-left:3px solid #ca8a04;"><strong style="color:#92400e">Notas:</strong><br>${f.notas}</div>` : ""}
      ${f.estado === "pagada" ? `<div style="margin-top:16px;text-align:center;border:2px solid #16a34a;padding:8px;border-radius:4px;color:#16a34a;font-weight:bold;font-size:18px">PAGADA</div>` : ""}
      ${(() => { const fb=getCuentaFallback(f.moneda,f.logo_tipo); const cs=[...new Set((f.pagos||[]).map(p=>p.cuenta_nombre||fb).filter(Boolean))]; if(!cs.length&&fb) cs.push(fb); return cs.length ? `<div style="margin-top:8px;text-align:center;font-size:13px;color:#1d4ed8">🏦 ${cs.join(' · ')}</div>` : ""; })()}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-gray-600 font-medium text-sm">Vista previa · Factura</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-all">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            {canEdit && (f.estado === "pendiente" || f.estado === "parcial") && (
              <button onClick={onPagar}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg transition-all">
                <Banknote className="w-3.5 h-3.5" /> {f.forma_pago === "credito" ? "Registrar pago" : "Pagar"}
              </button>
            )}
            {canEdit && (f.estado === "pagada" || f.estado === "parcial") && (
              <button onClick={onDeshacer}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-slate-100 text-gray-600 text-xs rounded-lg border border-gray-200 transition-all">
                Deshacer pago
              </button>
            )}
            {canEdit && (
              <button onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-xs rounded-lg border border-yellow-200 transition-all">
                <Edit className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs rounded-lg border border-red-200 transition-all">
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            )}
            <button onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg transition-all">
              <X className="w-3.5 h-3.5" /> Cerrar
            </button>
          </div>
        </div>

        {/* Cabecera del documento */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              {f.logo_tipo === "arandu" && <LogoArandu />}
              {f.logo_tipo === "jar" && <LogoJar />}
              {(!f.logo_tipo || f.logo_tipo === "arandujar") && <LogoAranduJarDoc />}
              <div className="mt-4 text-sm text-gray-500">
                <p>De la Conquista 1132 c/ Isabel la Católica</p>
                <p>Barrio Sajonia, Asunción - Paraguay</p>
                <p>Tel: 021-421330 | info@aranduinformatica.net</p>
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-bold text-gray-800">FACTURA</h1>
              <p className="text-xl font-semibold mt-1" style={{ color: accentColor }}>{f.numero}</p>
              <p className="text-gray-500 text-sm mt-1">Fecha: <strong className="text-gray-700">{f.fecha || "-"}</strong></p>
              <p className="text-gray-500 text-sm">Forma de pago: <strong className="text-gray-700">{f.forma_pago === "credito" ? "A crédito" : "Al contado"}</strong></p>
              {f.fecha_vencimiento && (
                <p className="text-gray-500 text-sm">Vencimiento: <strong className={new Date(f.fecha_vencimiento) < new Date() && f.estado !== "pagada" ? "text-red-600" : "text-gray-700"}>{f.fecha_vencimiento}</strong></p>
              )}
              {/* Estado badge */}
              <div className="mt-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold" style={{ background: est.bg, color: est.text, border: `1px solid ${est.border}` }}>
                  {f.estado?.toUpperCase()}
                </span>
              </div>
              {/* Cuenta bancaria — visible sin scroll (usa fallback si el pago no tiene cuenta) */}
              {(() => {
                const pagos = f.pagos || [];
                const cuentas = [...new Set(
                  pagos.length > 0
                    ? pagos.map(p => p.cuenta_nombre || getCuentaFallback(f.moneda, f.logo_tipo)).filter(Boolean)
                    : [getCuentaFallback(f.moneda, f.logo_tipo)].filter(Boolean)
                )];
                if (!cuentas.length) return null;
                return (
                  <div className="mt-2 flex flex-col items-end gap-1">
                    {cuentas.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                        🏦 {c}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Cliente */}
        <div className="p-6 bg-gray-50 border-b">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">CLIENTE</p>
          <p className="text-xl font-semibold text-gray-800">{f.razon_social || "-"}</p>
          {f.ruc && <p className="text-sm text-gray-500 mt-0.5">RUC: {f.ruc}</p>}
        </div>

        {/* Conceptos / Items */}
        <div className="p-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-gray-300 p-2 text-left text-gray-700 font-bold text-sm">Concepto / Descripción</th>
                <th className="border border-gray-300 p-2 text-right text-gray-700 font-bold text-sm w-40">Monto</th>
              </tr>
            </thead>
            <tbody>
              {(f.conceptos || []).length > 0 ? (
                (f.conceptos || []).map((c, idx) => (
                  <tr key={idx} className="bg-white">
                    <td className="border border-gray-300 p-2 text-gray-800 text-sm">{c.descripcion || ""}</td>
                    <td className="border border-gray-300 p-2 text-right text-gray-800 text-sm">{fmt(c.monto)}</td>
                  </tr>
                ))
              ) : (
                <tr className="bg-white">
                  <td className="border border-gray-300 p-3 text-gray-800" colSpan={2}>{f.concepto || "-"}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td className="border border-gray-300 p-2 text-right text-sm text-gray-500">Base imponible:</td>
                <td className="border border-gray-300 p-2 text-right text-sm text-gray-500">{fmt(base)}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-300 p-2 text-right text-sm text-gray-500">IVA incluido (10%):</td>
                <td className="border border-gray-300 p-2 text-right text-sm text-gray-500">{fmt(iva)}</td>
              </tr>
              <tr style={{ background: "#dbeafe" }}>
                <td className="border border-gray-300 p-2 text-right font-bold text-lg text-gray-900">TOTAL:</td>
                <td className="border border-gray-300 p-2 text-right font-bold text-lg" style={{ color: accentColor }}>{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
          {f.moneda !== "PYG" && f.tipo_cambio && (
            <p className="text-gray-500 text-xs mt-2">TC: 1 {f.moneda} = ₲ {Number(f.tipo_cambio).toLocaleString("es-PY")} · Equivalente ≈ ₲ {Math.round(total * f.tipo_cambio).toLocaleString("es-PY")}</p>
          )}
        </div>

        {/* Historial de pagos */}
        {(f.pagos || []).length > 0 && (
          <div className="px-6 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">Historial de pagos</p>
            <div className="space-y-1.5">
              {(f.pagos || []).map((p, i) => (
                <div key={p.id || i} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-700 font-medium">Pago {i + 1}</span>
                      {p.fecha && <span className="text-gray-500 text-xs">{p.fecha}</span>}
                      {(p.cuenta_nombre || getCuentaFallback(f.moneda, f.logo_tipo)) && (
                        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">
                          🏦 {p.cuenta_nombre || getCuentaFallback(f.moneda, f.logo_tipo)}
                        </span>
                      )}
                      {p.tipo_cambio && (
                        <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                          TC {p.tipo_cambio} → ₲ {Math.round((p.monto_cuenta || p.monto) * p.tipo_cambio).toLocaleString("es-PY")}
                        </span>
                      )}
                    </div>
                    {p.recibo_numero && (
                      <button
                        onClick={() => {
                          const rec = { numero: p.recibo_numero, id: p.recibo_id, factura_numero: f.numero, razon_social: f.razon_social, ruc: f.ruc, monto: p.monto, moneda: f.moneda, fecha_pago: p.fecha, logo_tipo: f.logo_tipo, cuenta_id: p.cuenta_id, cuenta_nombre: p.cuenta_nombre };
                          onReciboClick(rec);
                        }}
                        className="mt-0.5 text-amber-600 hover:text-amber-700 text-xs underline"
                      >
                        📄 Recibo #{p.recibo_numero}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-emerald-700 font-semibold">{fmt(p.monto)}</span>
                    {canEdit && onEditPago && (
                      <button
                        onClick={() => onEditPago(f, p)}
                        className="text-slate-400 hover:text-blue-500 transition-colors"
                        title="Editar pago"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canEdit && onDeletePago && (
                      <button
                        onClick={() => onDeletePago(f, p)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        title="Eliminar pago"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presupuestos vinculados */}
        {(() => {
          const allIds = [...(f.presupuesto_ids || []), ...(f.presupuesto_id ? [f.presupuesto_id] : [])];
          const unique = [...new Set(allIds)];
          const vinculados = unique.map(id => presupuestos.find(p => p.id === id)).filter(Boolean);
          if (vinculados.length === 0) return null;
          const fmtP = (n, mon) => mon === "PYG" ? `₲ ${Math.round(n).toLocaleString("es-PY")}` : `${mon} ${Number(n).toFixed(2)}`;
          return (
            <div className="px-6 pb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">
                Presupuesto{vinculados.length > 1 ? "s" : ""} vinculado{vinculados.length > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {vinculados.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onPresClick && onPresClick(p.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs text-blue-700 transition-all"
                  >
                    <FileText className="w-3 h-3" />
                    #{p.numero}
                    {p.nombre_archivo && <span className="text-blue-400">· {p.nombre_archivo.slice(0, 18)}</span>}
                    <span className="font-semibold ml-1">{fmtP(p.total, p.moneda)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Notas */}
        {f.notas && (
          <div className="px-6 pb-6">
            <div className="bg-yellow-50 p-3 border-l-4 border-yellow-400 rounded-r">
              <strong className="text-yellow-800 text-sm">Notas:</strong>
              <p className="text-gray-700 text-sm mt-1 whitespace-pre-line">{f.notas}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PagoModal — pago total (contado) con multi-cuentas
// ═══════════════════════════════════════════════════════════════
function PagoModal({ fac, fechaPago, setFechaPago, numeroReciboManual, setNumeroReciboManual,
  cuentasDisp, cuentasPYG, setCuentasPYG, cuentasUSD, setCuentasUSD,
  tcPago, setTcPago, montoUSD, setMontoUSD,
  onClose, onConfirm, fmtMonto }) {

  React.useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const monedaFac = fac.moneda || "PYG";
  const total = (fac.monto || 0) - (fac.monto_pagado || 0);

  // Cuentas en la misma moneda que la factura (primarias)
  const cuentasMoneda = cuentasDisp.filter(c => c.logo_tipo === fac.logo_tipo && c.moneda === monedaFac);
  // Cuentas en moneda diferente (secundarias para conversión)
  const cuentasOtraMoneda = cuentasDisp.filter(c => c.logo_tipo === fac.logo_tipo && c.moneda !== monedaFac);

  // La cuenta seleccionada actualmente (cuentasPYG = [id] del principal)
  const cuentaSeleccionadaId = cuentasPYG[0] || null;
  const cuentaSeleccionada = cuentasDisp.find(c => c.id === cuentaSeleccionadaId);

  // Mostrar TC solo si la cuenta seleccionada tiene moneda diferente a la factura
  // O si hay cuentas alternativas de otra moneda seleccionadas (cuentasUSD)
  const cuentaAltSeleccionadaId = cuentasUSD[0] || null;
  const hasCurrencyMismatch = (cuentaSeleccionada && cuentaSeleccionada.moneda !== monedaFac) ||
                               !!cuentaAltSeleccionadaId;

  // Label para la sección de TC
  const monedaAlterna = monedaFac === "PYG" ? "USD" : "PYG";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-white font-heading font-bold">Registrar pago</h2>
            <p className="text-slate-400 text-sm mt-0.5">Factura {fac.numero} — {fac.razon_social}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
            <p className="text-emerald-300 font-heading font-bold text-xl">{fmtMonto(total, monedaFac)}</p>
            <p className="text-slate-500 text-xs mt-0.5">{monedaFac === "PYG" ? "Al contado" : `En ${monedaFac}`}</p>
          </div>
          <div>
            <label className="text-slate-400 text-xs block mb-1">Fecha de pago *</label>
            <input type="date" value={fechaPago}
              onChange={e => setFechaPago(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60"
            />
          </div>
          {fac.forma_pago !== "contado" && (
          <div>
            <label className="text-slate-400 text-xs block mb-1">Nº Recibo <span className="text-slate-500 text-[10px]">(opcional — autogenera si vacío)</span></label>
            <input type="text" value={numeroReciboManual} onChange={e => setNumeroReciboManual(e.target.value)}
              placeholder="000123"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          )}
          {/* Cuentas bancarias — en moneda de la factura (primarias) */}
          {cuentasMoneda.length > 0 && (
            <div>
              <label className="text-slate-400 text-xs block mb-1">Cuenta bancaria ({monedaFac})</label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {cuentasMoneda.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-all">
                    <input type="checkbox" checked={cuentasPYG.includes(c.id)}
                      onChange={e => {
                        if (e.target.checked) setCuentasPYG([c.id]);
                        else setCuentasPYG([]);
                      }}
                      className="accent-emerald-500 w-3.5 h-3.5"
                    />
                    <span className="text-white text-xs flex-1">{c.nombre}{c.banco ? ` · ${c.banco}` : ""}</span>
                    {c.es_predeterminada && <span className="text-amber-400 text-[10px]">★ predeterminada</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          {/* Cuentas en moneda diferente — opcional, activa TC */}
          {cuentasOtraMoneda.length > 0 && (
            <div>
              <label className="text-slate-400 text-xs block mb-1">
                Depositar en cuenta {monedaAlterna} <span className="text-slate-500 text-[10px]">(opcional — requiere tipo de cambio)</span>
              </label>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {cuentasOtraMoneda.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/5 transition-all">
                    <input type="checkbox" checked={cuentasUSD.includes(c.id)}
                      onChange={e => {
                        setCuentasUSD(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id));
                        if (!e.target.checked) { setTcPago(""); setMontoUSD(""); }
                      }}
                      className="accent-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-white text-xs flex-1">{c.nombre}{c.banco ? ` · ${c.banco}` : ""}</span>
                    {c.es_predeterminada && <span className="text-amber-400 text-[10px]">★ predeterminada</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          {/* Tipo de cambio — solo si hay una cuenta de moneda diferente seleccionada */}
          {hasCurrencyMismatch && cuentaAltSeleccionadaId && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 space-y-2">
              <p className="text-blue-300 text-xs font-medium">
                Tipo de cambio {monedaFac === "PYG" ? "(Gs → USD)" : "(USD → Gs)"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">
                    {monedaFac === "PYG" ? "TC (1 USD = ? PYG)" : "TC (1 USD = ? PYG)"}
                  </label>
                  <input type="number" value={tcPago} onChange={e => {
                    setTcPago(e.target.value);
                    if (e.target.value && total) {
                      const tc = parseFloat(e.target.value);
                      setMontoUSD(monedaFac === "PYG"
                        ? String((total / tc).toFixed(2))
                        : String((total * tc).toFixed(0)));
                    }
                  }}
                    placeholder="7500"
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">
                    {monedaFac === "PYG" ? "Equivalente USD" : "Equivalente PYG"}
                  </label>
                  <input type="number" value={montoUSD} onChange={e => {
                    setMontoUSD(e.target.value);
                    if (e.target.value && total) {
                      const eq = parseFloat(e.target.value);
                      setTcPago(monedaFac === "PYG"
                        ? String((total / eq).toFixed(2))
                        : String((eq / total).toFixed(2)));
                    }
                  }}
                    placeholder="0"
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              {tcPago && total && (
                <p className="text-blue-300 text-xs">
                  {monedaFac === "PYG"
                    ? `₲ ${Math.round(total).toLocaleString("es-PY")} ÷ TC ${tcPago} = USD ${(total / parseFloat(tcPago)).toFixed(2)}`
                    : `USD ${total} × TC ${tcPago} = ₲ ${Math.round(total * parseFloat(tcPago)).toLocaleString("es-PY")}`}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
              Cancelar
            </button>
            <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all">
              Confirmar y emitir recibo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PagoParcialModal — pago parcial (crédito) con multi-cuentas
// ═══════════════════════════════════════════════════════════════
function PagoParcialModal({ fac, montoParcial, setMontoParcial, fechaPagoParcial, setFechaPagoParcial,
  numeroReciboManual, setNumeroReciboManual, cuentasDisp, cuentasPYG, setCuentasPYG,
  cuentasUSD, setCuentasUSD, tcPago, setTcPago, montoUSD, setMontoUSD,
  onClose, onConfirm, fmtMonto }) {

  React.useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const monedaFac = fac.moneda || "PYG";
  const pendiente = (fac.monto || 0) - (fac.monto_pagado || 0);
  const nuevoMonto = parseFloat(montoParcial) || 0;
  const quedaria = pendiente - nuevoMonto;

  // Cuentas en la misma moneda que la factura (primarias)
  const cuentasMoneda = cuentasDisp.filter(c => c.logo_tipo === fac.logo_tipo && c.moneda === monedaFac);
  // Cuentas en moneda diferente (secundarias)
  const cuentasOtraMoneda = cuentasDisp.filter(c => c.logo_tipo === fac.logo_tipo && c.moneda !== monedaFac);

  const cuentaAltSeleccionadaId = cuentasUSD[0] || null;
  const hasCurrencyMismatch = !!cuentaAltSeleccionadaId;
  const monedaAlterna = monedaFac === "PYG" ? "USD" : "PYG";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-white font-heading font-bold">Registrar pago parcial</h2>
            <p className="text-slate-400 text-sm mt-0.5">Factura {fac.numero} — {fac.razon_social}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Resumen */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Total factura</span>
              <span className="text-white font-semibold">{fmtMonto(fac.monto, monedaFac)}</span>
            </div>
            {(fac.monto_pagado || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Ya abonado</span>
                <span className="text-blue-300">{fmtMonto(fac.monto_pagado, monedaFac)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs border-t border-white/10 pt-1">
              <span className="text-slate-400">Saldo pendiente</span>
              <span className="text-amber-300 font-semibold">{fmtMonto(pendiente, monedaFac)}</span>
            </div>
          </div>
          {/* Historial de pagos anteriores */}
          {(fac.pagos || []).length > 0 && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Pagos anteriores</p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {(fac.pagos || []).map((p, i) => (
                  <div key={p.id || i} className="flex justify-between bg-white/5 rounded-lg px-2 py-1.5 text-xs">
                    <span className="text-slate-300">Pago {i + 1}{p.fecha ? ` · ${p.fecha}` : ""}</span>
                    <span className="text-blue-300">{fmtMonto(p.monto, monedaFac)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-slate-400 text-xs block mb-1">Monto que abona ahora *</label>
            <input type="number" min="0" step="any" value={montoParcial}
              onChange={e => setMontoParcial(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            {nuevoMonto > 0 && (
              quedaria <= 0
                ? <p className="text-emerald-400 text-xs mt-1">✓ Con este pago la factura quedará <strong>pagada</strong></p>
                : <p className="text-slate-500 text-xs mt-1">Quedará pendiente: {fmtMonto(quedaria, monedaFac)}</p>
            )}
          </div>
          <div>
            <label className="text-slate-400 text-xs block mb-1">Fecha de pago *</label>
            <input type="date" value={fechaPagoParcial}
              onChange={e => setFechaPagoParcial(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs block mb-1">Nº Recibo <span className="text-slate-500 text-[10px]">(autogenera si vacío)</span></label>
            <input type="text" value={numeroReciboManual} onChange={e => setNumeroReciboManual(e.target.value)}
              placeholder="000123"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {/* Cuentas */}
          {cuentasMoneda.length > 0 && (
            <div>
              <label className="text-slate-400 text-xs block mb-1">Cuenta bancaria ({monedaFac})</label>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {cuentasMoneda.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/5 transition-all">
                    <input type="checkbox" checked={cuentasPYG.includes(c.id)}
                      onChange={e => { if (e.target.checked) setCuentasPYG([c.id]); else setCuentasPYG([]); }}
                      className="accent-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-white text-xs flex-1">{c.nombre}{c.banco ? ` · ${c.banco}` : ""}</span>
                    {c.es_predeterminada && <span className="text-amber-400 text-[10px]">★</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          {/* Cuentas en moneda diferente — activa TC cuando se selecciona */}
          {cuentasOtraMoneda.length > 0 && (
            <div>
              <label className="text-slate-400 text-xs block mb-1">
                Cuenta {monedaAlterna} <span className="text-slate-500 text-[10px]">(opcional — requiere tipo de cambio)</span>
              </label>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {cuentasOtraMoneda.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/5 transition-all">
                    <input type="checkbox" checked={cuentasUSD.includes(c.id)}
                      onChange={e => {
                        setCuentasUSD(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id));
                        if (!e.target.checked) { setTcPago(""); setMontoUSD(""); }
                      }}
                      className="accent-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-white text-xs flex-1">{c.nombre}{c.banco ? ` · ${c.banco}` : ""}</span>
                    {c.es_predeterminada && <span className="text-amber-400 text-[10px]">★</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          {/* TC — solo si se seleccionó una cuenta de moneda diferente */}
          {hasCurrencyMismatch && cuentaAltSeleccionadaId && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 space-y-2">
              <p className="text-blue-300 text-xs font-medium">
                Tipo de cambio {monedaFac === "PYG" ? "(Gs → USD)" : "(USD → Gs)"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">TC (1 USD = ? PYG)</label>
                  <input type="number" value={tcPago} onChange={e => {
                    setTcPago(e.target.value);
                    if (e.target.value && nuevoMonto) {
                      const tc = parseFloat(e.target.value);
                      setMontoUSD(monedaFac === "PYG"
                        ? String((nuevoMonto / tc).toFixed(2))
                        : String((nuevoMonto * tc).toFixed(0)));
                    }
                  }}
                    placeholder="7500"
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">
                    {monedaFac === "PYG" ? "Equiv. USD" : "Equiv. PYG"}
                  </label>
                  <input type="number" value={montoUSD} onChange={e => {
                    setMontoUSD(e.target.value);
                    if (e.target.value && nuevoMonto) {
                      const eq = parseFloat(e.target.value);
                      setTcPago(monedaFac === "PYG"
                        ? String((nuevoMonto / eq).toFixed(2))
                        : String((eq / nuevoMonto).toFixed(2)));
                    }
                  }}
                    placeholder="0"
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              {tcPago && nuevoMonto > 0 && (
                <p className="text-blue-300 text-xs">
                  {monedaFac === "PYG"
                    ? `₲ ${Math.round(nuevoMonto).toLocaleString("es-PY")} ÷ TC ${tcPago} = USD ${(nuevoMonto / parseFloat(tcPago)).toFixed(2)}`
                    : `USD ${nuevoMonto} × TC ${tcPago} = ₲ ${Math.round(nuevoMonto * parseFloat(tcPago)).toLocaleString("es-PY")}`}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
              Cancelar
            </button>
            <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all">
              Registrar y emitir recibo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ReciboDocModal — vista visual de recibo de pago
// ═══════════════════════════════════════════════════════════════
function ReciboDocModal({ recibo: r, onClose, fmtMonto, cuentasDisp = [] }) {
  React.useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const accentColor = r.logo_tipo === "jar" ? "#dc2626" : r.logo_tipo === "arandu" ? "#2563eb" : "#1d4ed8";
  const fmt = (n) => fmtMonto(n, r.moneda);

  // Cuenta efectiva: la guardada en el recibo o la predeterminada por moneda/empresa
  const cuentaEfectiva = r.cuenta_nombre
    || cuentasDisp.find(c => c.logo_tipo === r.logo_tipo && c.moneda === (r.moneda || "PYG") && c.es_predeterminada)?.nombre
    || cuentasDisp.find(c => c.logo_tipo === r.logo_tipo && c.moneda === (r.moneda || "PYG"))?.nombre
    || null;

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const docLogo = svgDocumentHeaderLogoHtml(r.logo_tipo);
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recibo ${r.numero}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:20px;max-width:600px;margin:0 auto;border:2px solid ${accentColor};border-radius:8px}</style></head><body>
      <div style="display:flex;justify-content:center;margin-bottom:16px">${docLogo}</div>
      <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid ${accentColor};padding-bottom:16px">
        <h1 style="font-size:28px;font-weight:900;color:${accentColor};margin:0">RECIBO DE PAGO</h1>
        <p style="font-size:20px;font-weight:700;color:#1f2937;margin:4px 0">N° ${r.numero}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px">
        <tr><td style="padding:8px 4px;color:#6b7280;width:40%">Empresa:</td><td style="padding:8px 4px;font-weight:600">${r.logo_tipo === "jar" ? "JAR Informática" : r.logo_tipo === "arandu" ? "Arandu Informática" : "Arandu&JAR Informática"}</td></tr>
        <tr style="background:#f9fafb"><td style="padding:8px 4px;color:#6b7280">Recibido de:</td><td style="padding:8px 4px;font-weight:600">${r.razon_social || "-"}</td></tr>
        ${r.ruc ? `<tr><td style="padding:8px 4px;color:#6b7280">RUC:</td><td style="padding:8px 4px">${r.ruc}</td></tr>` : ""}
        <tr style="background:#f9fafb"><td style="padding:8px 4px;color:#6b7280">Por factura:</td><td style="padding:8px 4px;font-family:monospace;font-weight:600">${r.factura_numero || "-"}</td></tr>
        <tr><td style="padding:8px 4px;color:#6b7280">Fecha de pago:</td><td style="padding:8px 4px;font-weight:600">${r.fecha_pago || "-"}</td></tr>
        ${cuentaEfectiva ? `<tr style="background:#f9fafb"><td style="padding:8px 4px;color:#6b7280">Cuenta bancaria:</td><td style="padding:8px 4px;font-weight:600">🏦 ${cuentaEfectiva}</td></tr>` : ""}
      </table>
      <div style="background:${accentColor}10;border:2px solid ${accentColor};border-radius:8px;padding:16px;text-align:center;margin:20px 0">
        <p style="color:#6b7280;font-size:12px;margin:0 0 4px">MONTO RECIBIDO</p>
        <p style="font-size:32px;font-weight:900;color:${accentColor};margin:0">${fmt(r.monto)}</p>
      </div>
      ${r.notas ? `<p style="font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px">Notas: ${r.notas}</p>` : ""}
      <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px">De la Conquista 1132 c/ Isabel la Católica · Barrio Sajonia, Asunción - Paraguay · Tel: 021-421330</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-gray-600 font-medium text-sm">Recibo de pago</span>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-all">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg transition-all">
              Cerrar
            </button>
          </div>
        </div>

        {/* Header del recibo */}
        <div className="p-6 text-center border-b-4" style={{ borderColor: accentColor }}>
          <div className="mb-3 flex justify-center">
            {r.logo_tipo === "arandu" && <LogoArandu />}
            {r.logo_tipo === "jar" && <LogoJar />}
            {(!r.logo_tipo || r.logo_tipo === "arandujar") && <LogoAranduJarDoc />}
          </div>
          <h2 className="text-2xl font-black text-gray-800 tracking-wider">RECIBO DE PAGO</h2>
          <p className="text-4xl font-black mt-1" style={{ color: accentColor }}>N° {r.numero}</p>
        </div>

        {/* Datos del recibo */}
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Recibido de</p>
              <p className="text-gray-800 font-semibold">{r.razon_social || "-"}</p>
              {r.ruc && <p className="text-gray-500 text-xs mt-0.5">RUC: {r.ruc}</p>}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Factura</p>
              <p className="text-gray-800 font-mono font-semibold">{r.factura_numero || "-"}</p>
              <p className="text-gray-400 text-xs mt-0.5">{r.fecha_pago || "-"}</p>
            </div>
          </div>

          {/* Monto destacado */}
          <div className="rounded-xl p-5 text-center" style={{ background: `${accentColor}15`, border: `2px solid ${accentColor}40` }}>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Monto recibido</p>
            <p className="text-4xl font-black" style={{ color: accentColor }}>{fmt(r.monto)}</p>
          </div>

          {cuentaEfectiva && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
              <span className="text-blue-600 text-xs uppercase tracking-wide font-semibold">Cuenta bancaria</span>
              <span className="text-blue-800 font-medium flex items-center gap-1">🏦 {cuentaEfectiva}</span>
            </div>
          )}
          {r.notas && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-r text-sm text-gray-600">
              <strong className="text-yellow-800">Notas:</strong> {r.notas}
            </div>
          )}
        </div>
        <div className="px-6 pb-4 text-center">
          <p className="text-gray-400 text-xs">De la Conquista 1132 c/ Isabel la Católica · Barrio Sajonia, Asunción · Tel: 021-421330</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
//  EditPagoModal — editar un pago individual de una factura
// ─────────────────────────────────────────────────────────────
function EditPagoModal({ factura: fac, pago, cuentasDisp, onClose, onSave, fmtMonto }) {
  const [monto, setMonto] = React.useState(String(pago.monto || ""));
  const [fecha, setFecha] = React.useState(pago.fecha || "");
  const [cuentaId, setCuentaId] = React.useState(pago.cuenta_id || "");
  const [tipoCambio, setTipoCambio] = React.useState(pago.tipo_cambio ? String(pago.tipo_cambio) : "");
  const [saving, setSaving] = React.useState(false);

  const monedaFac = fac?.moneda || "PYG";
  // Cuentas de la empresa de la factura
  const cuentasFac = cuentasDisp.filter(c => c.logo_tipo === fac?.logo_tipo);
  const cuentaSeleccionada = cuentasFac.find(c => c.id === cuentaId);
  const mismatch = cuentaSeleccionada && cuentaSeleccionada.moneda !== monedaFac;

  const montoNum = parseFloat(monto) || 0;
  const tcNum = parseFloat(tipoCambio) || 0;

  const handleSave = async () => {
    if (!monto || parseFloat(monto) <= 0) { alert("Monto inválido"); return; }
    setSaving(true);
    const cambios = {
      monto: parseFloat(monto),
      fecha,
      cuenta_id: cuentaId || null,
      tipo_cambio: tipoCambio ? parseFloat(tipoCambio) : null,
    };
    await onSave(cambios);
    setSaving(false);
  };

  const inp = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800";
  const lbl = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Editar pago</h2>
            <p className="text-xs text-gray-400 mt-0.5">Factura {fac?.numero} · {fac?.razon_social}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Monto */}
          <div>
            <label className={lbl}>Monto ({monedaFac})</label>
            <input type="number" className={inp} value={monto}
              onChange={e => setMonto(e.target.value)} min="0" step="any"
              placeholder="0" />
          </div>

          {/* Fecha */}
          <div>
            <label className={lbl}>Fecha de pago</label>
            <input type="date" className={inp} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          {/* Cuenta bancaria */}
          <div>
            <label className={lbl}>Cuenta bancaria</label>
            <select className={inp} value={cuentaId} onChange={e => { setCuentaId(e.target.value); setTipoCambio(""); }}>
              <option value="">— Sin especificar —</option>
              {cuentasFac.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda}){c.es_predeterminada ? " ★" : ""}
                </option>
              ))}
            </select>
            {cuentaSeleccionada && (
              <p className="mt-1 text-xs text-gray-400">
                Moneda cuenta: <strong>{cuentaSeleccionada.moneda}</strong>
                {!mismatch && " · misma moneda que la factura"}
              </p>
            )}
          </div>

          {/* Tipo de cambio (solo si hay mismatch de moneda) */}
          {mismatch && (
            <div>
              <label className={lbl}>Tipo de cambio ({cuentaSeleccionada.moneda} → {monedaFac})</label>
              <input type="number" className={inp} value={tipoCambio}
                onChange={e => setTipoCambio(e.target.value)}
                min="0" step="any" placeholder="Ej: 7500" />
              {tcNum > 0 && montoNum > 0 && (
                <p className="mt-1 text-xs text-emerald-600 font-medium">
                  {fmtMonto(montoNum, monedaFac)} ÷ {tcNum} = {cuentaSeleccionada.moneda} {(montoNum / tcNum).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Info recibo */}
          {pago.recibo_numero && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              📄 Recibo <strong>{pago.recibo_numero}</strong> se actualizará automáticamente
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow transition-all">
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  IngresosFormModal — crear / editar un ingreso varios
// ─────────────────────────────────────────────────────────────
const CATEGORIAS_INGRESO = [
  "Transferencia", "Efectivo", "Cheque", "Préstamo", "Cobro deuda",
  "Devolución", "Subsidio", "Otro",
];

function IngresosFormModal({ ingreso, cuentasDisp, activeLogoTipo, token, API, onClose, onSaved }) {
  const isEdit = !!ingreso;
  const [form, setForm] = React.useState({
    descripcion: ingreso?.descripcion || "",
    categoria:   ingreso?.categoria || "Transferencia",
    fecha:       ingreso?.fecha || new Date().toISOString().slice(0, 10),
    monto:       ingreso?.monto ? String(ingreso.monto) : "",
    moneda:      ingreso?.moneda || "PYG",
    tipo_cambio: ingreso?.tipo_cambio ? String(ingreso.tipo_cambio) : "",
    cuenta_id:   ingreso?.cuenta_id || "",
    notas:       ingreso?.notas || "",
  });
  const [saving, setSaving] = React.useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Cuentas disponibles para el logo activo
  const cuentasFiltradas = cuentasDisp.filter(c =>
    c.logo_tipo === (ingreso?.logo_tipo || activeLogoTipo)
  );

  // Auto-seleccionar cuenta predeterminada de la moneda al cambiar moneda
  React.useEffect(() => {
    if (!form.cuenta_id) {
      const def = cuentasFiltradas.find(c => c.moneda === form.moneda && c.es_predeterminada)
               || cuentasFiltradas.find(c => c.moneda === form.moneda);
      if (def) set("cuenta_id", def.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.moneda]);

  const cuentaSeleccionada = cuentasFiltradas.find(c => c.id === form.cuenta_id);
  const mismatch = cuentaSeleccionada && cuentaSeleccionada.moneda !== form.moneda;
  const montoNum = parseFloat(form.monto) || 0;
  const tcNum = parseFloat(form.tipo_cambio) || 0;

  const handleSave = async () => {
    if (!form.descripcion.trim()) { alert("La descripción es requerida"); return; }
    if (!form.monto || parseFloat(form.monto) <= 0) { alert("El monto debe ser mayor a 0"); return; }
    setSaving(true);
    try {
      const body = {
        descripcion: form.descripcion.trim(),
        categoria:   form.categoria,
        fecha:       form.fecha,
        monto:       parseFloat(form.monto),
        moneda:      form.moneda,
        tipo_cambio: form.tipo_cambio ? parseFloat(form.tipo_cambio) : null,
        cuenta_id:   form.cuenta_id || null,
        cuenta_nombre: cuentaSeleccionada?.nombre || null,
        notas:       form.notas || null,
        logo_tipo:   ingreso?.logo_tipo || activeLogoTipo,
      };
      const url = isEdit
        ? `${API}/admin/ingresos-varios/${ingreso.id}`
        : `${API}/admin/ingresos-varios`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Error al guardar"); }
      onSaved();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const inp = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-gray-800";
  const lbl = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-800 text-base">
              {isEdit ? "Editar ingreso" : "Nuevo ingreso"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Ingresos varios / sin factura</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Descripción */}
          <div>
            <label className={lbl}>Descripción *</label>
            <input className={inp} value={form.descripcion}
              onChange={e => set("descripcion", e.target.value)}
              placeholder="Ej: Cobro deuda anterior EDB..." />
          </div>

          {/* Categoría */}
          <div>
            <label className={lbl}>Categoría</label>
            <select className={inp} value={form.categoria} onChange={e => set("categoria", e.target.value)}>
              {CATEGORIAS_INGRESO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Fecha */}
          <div>
            <label className={lbl}>Fecha</label>
            <input type="date" className={inp} value={form.fecha} onChange={e => set("fecha", e.target.value)} />
          </div>

          {/* Moneda + Monto */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Moneda</label>
              <select className={inp} value={form.moneda} onChange={e => { set("moneda", e.target.value); set("tipo_cambio", ""); set("cuenta_id", ""); }}>
                <option value="PYG">₲ PYG</option>
                <option value="USD">$ USD</option>
                <option value="BRL">R$ BRL</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={lbl}>Monto *</label>
              <input type="number" className={inp} value={form.monto}
                onChange={e => set("monto", e.target.value)}
                min="0" step="any" placeholder="0" />
            </div>
          </div>

          {/* Cuenta bancaria */}
          <div>
            <label className={lbl}>Cuenta bancaria donde ingresó</label>
            <select className={inp} value={form.cuenta_id} onChange={e => set("cuenta_id", e.target.value)}>
              <option value="">— Sin especificar —</option>
              {cuentasFiltradas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda}){c.es_predeterminada ? " ★" : ""}
                </option>
              ))}
            </select>
            {cuentaSeleccionada && (
              <p className="mt-1 text-xs text-gray-400">
                Cuenta en <strong>{cuentaSeleccionada.moneda}</strong>
                {!mismatch ? " · misma moneda" : " · ⚠ moneda diferente al ingreso"}
              </p>
            )}
          </div>

          {/* Tipo de cambio si hay mismatch */}
          {mismatch && (
            <div>
              <label className={lbl}>Tipo de cambio ({form.moneda} → {cuentaSeleccionada.moneda})</label>
              <input type="number" className={inp} value={form.tipo_cambio}
                onChange={e => set("tipo_cambio", e.target.value)}
                min="0" step="any" placeholder="Ej: 7500" />
              {tcNum > 0 && montoNum > 0 && (
                <p className="mt-1 text-xs text-emerald-600 font-medium">
                  {form.moneda} {montoNum.toLocaleString()} ÷ {tcNum} = {cuentaSeleccionada.moneda} {(montoNum / tcNum).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Notas */}
          <div>
            <label className={lbl}>Notas</label>
            <textarea className={inp + " resize-none min-h-[60px]"} value={form.notas}
              onChange={e => set("notas", e.target.value)}
              placeholder="Observaciones opcionales..." />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow transition-all">
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear ingreso"}
          </button>
        </div>
      </div>
    </div>
  );
}
