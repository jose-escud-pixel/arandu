import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Plus, X, ChevronLeft, ChevronRight,
  CheckCircle, Clock, AlertCircle, Pencil, Trash2,
  UserCheck, UserX, DollarSign, ArrowLeft, Star
} from "lucide-react";
import { toast } from "sonner";
import { AuthContext } from "../App";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Constantes ───────────────────────────────────────────────
const LOGOS = [
  { value: "todas",     label: "Todas las empresas", color: "bg-slate-700 text-slate-200" },
  { value: "arandujar", label: "Arandu&JAR",          color: "bg-blue-600 text-white" },
  { value: "arandu",    label: "Arandu",              color: "bg-emerald-600 text-white" },
  { value: "jar",       label: "JAR Informatica",     color: "bg-red-600 text-white" },
];

const LOGO_LABEL = {
  arandujar: { label: "Arandu&JAR",      chip: "bg-blue-600/20 text-blue-300 border border-blue-600/30" },
  arandu:    { label: "Arandu",          chip: "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30" },
  jar:       { label: "JAR Informatica", chip: "bg-red-600/20 text-red-300 border border-red-600/30" },
};

const CARGOS = [
  "Técnico IT", "Desarrollador", "Soporte", "Administrador", "Gerente",
  "Contador", "Recepcionista", "Ventas", "Otro"
];

const MONEDAS = ["PYG", "USD", "BRL", "ARS"];

function getPeriodoActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function periodoLabel(p) {
  const [y, m] = p.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[parseInt(m, 10) - 1]} ${y}`;
}

function prevPeriodo(p) {
  const [y, m] = p.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextPeriodo(p) {
  const [y, m] = p.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function formatMonto(monto, moneda) {
  if (!monto && monto !== 0) return "-";
  if (moneda === "PYG") return `₲ ${Number(monto).toLocaleString("es-PY")}`;
  return `${moneda} ${Number(monto).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SUELDO_MINIMO_DEFAULT = 2899048; // Salario mínimo PY vigente en PYG

const emptyEmpleado = {
  logo_tipo: "arandujar",
  nombre: "",
  apellido: "",
  cargo: "",
  email: "",
  telefono: "",
  fecha_ingreso: "",
  fecha_egreso: "",
  activo: true,
  sueldo_base: "",
  moneda: "PYG",
  tipo_cambio: "",
  aplica_ips: true,
  base_calculo_ips: "minimo",  // "minimo" | "sueldo" | "manual"
  sueldo_minimo_vigente: SUELDO_MINIMO_DEFAULT,
  ips_monto_manual: "",        // cuando base_calculo_ips === "manual": sueldo base para calcular 9%
  notas: "",
};

const emptySueldo = {
  periodo: getPeriodoActual(),
  moneda: "PYG",
  tipo_cambio: "",
  fecha_pago: new Date().toISOString().slice(0, 10),
  descuento_ips: "",
  notas: "",
  descuentos_adicionales: [],  // lista de { descripcion, monto }
};

// Calcula IPS: 9% sobre la base (mínimo o sueldo), o 9% sobre el monto manual ingresado
function calcularIPS(empleado) {
  if (!empleado.aplica_ips) return 0;
  if (empleado.base_calculo_ips === "manual") {
    // "manual" ahora significa: ingresar sueldo base y calcular 9%
    return Math.round((parseFloat(empleado.ips_monto_manual) || 0) * 0.09);
  }
  const base = empleado.base_calculo_ips === "sueldo"
    ? (parseFloat(empleado.sueldo_base) || 0)
    : (parseFloat(empleado.sueldo_minimo_vigente) || SUELDO_MINIMO_DEFAULT);
  return Math.round(base * 0.09);
}

// Calcula el monto a pagar: base + extras - IPS - adelantos - descuentos
function calcMontoAPagar(emp, adelantos, extras, descuentos) {
  const base = parseFloat(emp.sueldo_base) || 0;
  const ips = emp.aplica_ips !== false ? calcularIPS(emp) : 0;
  const totalAdelantos = adelantos.reduce((s, a) => s + (a.monto || 0), 0);
  const totalExtras = extras.reduce((s, e) => s + (e.monto || 0), 0);
  const totalDescuentos = descuentos.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
  return Math.max(0, base + totalExtras - ips - totalAdelantos - totalDescuentos);
}

// ─── Helpers ───────────────────────────────────────────────────
function toFloat(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ═══════════════════════════════════════════════════════════════
export default function EmpleadosPage() {
  const { token, hasPermission } = useContext(AuthContext);
  const navigate = useNavigate();

  const [tab, setTab] = useState("sueldos"); // "sueldos" | "empleados"
  const [logoFilter, setLogoFilter] = useState("todas");
  const [periodo, setPeriodo] = useState(getPeriodoActual());

  // Data
  const [empleados, setEmpleados] = useState([]);
  const [vencimientos, setVencimientos] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modales empleado
  const [showEmpleadoModal, setShowEmpleadoModal] = useState(false);
  const [editingEmpleado, setEditingEmpleado] = useState(null);
  const [formEmp, setFormEmp] = useState(emptyEmpleado);
  const [savingEmp, setSavingEmp] = useState(false);

  // Modal sueldo
  const [showSueldoModal, setShowSueldoModal] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState(null);
  const [formSueldo, setFormSueldo] = useState(emptySueldo);
  const [savingSueldo, setSavingSueldo] = useState(false);

  // Adelantos
  const [showAdelantoModal, setShowAdelantoModal] = useState(false);
  const [adelantoEmp, setAdelantoEmp] = useState(null);
  const [formAdelanto, setFormAdelanto] = useState({ monto: "", fecha: new Date().toISOString().slice(0, 10), notas: "" });
  const [savingAdelanto, setSavingAdelanto] = useState(false);
  const [adelantosPeriodo, setAdelantosPeriodo] = useState([]);
  const [adelantosMap, setAdelantosMap] = useState({});

  // Extras
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraEmp, setExtraEmp] = useState(null);
  const [formExtra, setFormExtra] = useState({ monto: "", descripcion: "Extra", fecha: new Date().toISOString().slice(0, 10), notas: "" });
  const [savingExtra, setSavingExtra] = useState(false);
  const [extrasPeriodo, setExtrasPeriodo] = useState([]);  // extras cargados al abrir modal sueldo
  const [extrasMap, setExtrasMap] = useState({});           // { empleado_id: [extras] } para mostrar en tabla

  const headers = { Authorization: `Bearer ${token}` };

  // ── Fetch ──────────────────────────────────────────────────
  const fetchEmpleados = async () => {
    setLoading(true);
    try {
      const q = logoFilter !== "todas" ? `?logo_tipo=${logoFilter}` : "";
      const res = await fetch(`${API}/admin/empleados${q}`, { headers });
      if (res.ok) setEmpleados(await res.json());
    } catch { toast.error("Error al cargar empleados"); }
    finally { setLoading(false); }
  };

  const fetchVencimientos = async () => {
    setLoading(true);
    try {
      let q = `?periodo=${periodo}`;
      if (logoFilter !== "todas") q += `&logo_tipo=${logoFilter}`;
      const res = await fetch(`${API}/admin/empleados/sueldos${q}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setVencimientos(data);
        // Cargar adelantos y extras de todos los empleados del periodo
        const adMap = {};
        const exMap = {};
        await Promise.all(
          data.map(async (emp) => {
            try {
              const [rAd, rEx] = await Promise.all([
                fetch(`${API}/admin/empleados/${emp.id}/adelantos?periodo=${periodo}`, { headers }),
                fetch(`${API}/admin/empleados/${emp.id}/extras?periodo=${periodo}`, { headers }),
              ]);
              if (rAd.ok) {
                const ads = await rAd.json();
                if (ads.length > 0) adMap[emp.id] = ads;
              }
              if (rEx.ok) {
                const exs = await rEx.json();
                if (exs.length > 0) exMap[emp.id] = exs;
              }
            } catch { /* ignorar */ }
          })
        );
        setAdelantosMap(adMap);
        setExtrasMap(exMap);
      }
    } catch { toast.error("Error al cargar sueldos"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (tab === "empleados") fetchEmpleados();
    else fetchVencimientos();
  }, [tab, logoFilter, periodo]); // eslint-disable-line

  // ── Summary cards ──────────────────────────────────────────
  const totalSueldo = vencimientos.reduce((s, e) => s + (e.sueldo_base || 0), 0);
  const pagados = vencimientos.filter(e => e.estado === "pagado");
  const pendientes = vencimientos.filter(e => e.estado === "pendiente");
  const vencidos = vencimientos.filter(e => e.estado === "vencido");
  const montoPagado = pagados.reduce((s, e) => s + (e.sueldo_registrado?.monto_pagado || e.sueldo_base || 0), 0);

  // ── Empleado CRUD ──────────────────────────────────────────
  const openCreate = () => {
    setEditingEmpleado(null);
    setFormEmp({ ...emptyEmpleado });
    setShowEmpleadoModal(true);
  };

  const openEdit = (emp) => {
    setEditingEmpleado(emp);
    setFormEmp({
      logo_tipo: emp.logo_tipo || "arandujar",
      nombre: emp.nombre || "",
      apellido: emp.apellido || "",
      cargo: emp.cargo || "",
      email: emp.email || "",
      telefono: emp.telefono || "",
      fecha_ingreso: emp.fecha_ingreso || "",
      fecha_egreso: emp.fecha_egreso || "",
      activo: emp.activo !== false,
      sueldo_base: emp.sueldo_base ?? "",
      moneda: emp.moneda || "PYG",
      tipo_cambio: emp.tipo_cambio ?? "",
      aplica_ips: emp.aplica_ips !== false,
      base_calculo_ips: emp.base_calculo_ips || "minimo",
      sueldo_minimo_vigente: emp.sueldo_minimo_vigente ?? SUELDO_MINIMO_DEFAULT,
      ips_monto_manual: emp.ips_monto_manual ?? "",
      notas: emp.notas || "",
    });
    setShowEmpleadoModal(true);
  };

  const handleSaveEmpleado = async () => {
    if (!formEmp.nombre.trim() || !formEmp.apellido.trim()) {
      toast.error("Nombre y apellido son obligatorios"); return;
    }
    if (!formEmp.fecha_ingreso) { toast.error("Fecha de ingreso requerida"); return; }
    if (!formEmp.sueldo_base) { toast.error("Sueldo base requerido"); return; }
    setSavingEmp(true);
    try {
      const payload = {
        ...formEmp,
        sueldo_base: toFloat(formEmp.sueldo_base) ?? 0,
        tipo_cambio: toFloat(formEmp.tipo_cambio),
        fecha_egreso: formEmp.fecha_egreso || null,
        cargo: formEmp.cargo || null,
        email: formEmp.email || null,
        telefono: formEmp.telefono || null,
        notas: formEmp.notas || null,
      };
      const url = editingEmpleado
        ? `${API}/admin/empleados/${editingEmpleado.id}`
        : `${API}/admin/empleados`;
      const method = editingEmpleado ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Error"); }
      toast.success(editingEmpleado ? "Empleado actualizado" : "Empleado creado");
      setShowEmpleadoModal(false);
      fetchEmpleados();
    } catch (e) { toast.error(e.message); }
    finally { setSavingEmp(false); }
  };

  const handleToggle = async (emp) => {
    try {
      const res = await fetch(`${API}/admin/empleados/${emp.id}/toggle`, {
        method: "PATCH", headers,
      });
      if (!res.ok) throw new Error();
      toast.success(emp.activo ? "Empleado desactivado" : "Empleado activado");
      fetchEmpleados();
    } catch { toast.error("Error al cambiar estado"); }
  };

  const handleDeleteEmpleado = async (emp) => {
    if (!window.confirm(`¿Eliminar a ${emp.nombre} ${emp.apellido}? También se eliminarán todos sus registros de sueldo.`)) return;
    try {
      const res = await fetch(`${API}/admin/empleados/${emp.id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      toast.success("Empleado eliminado");
      fetchEmpleados();
    } catch { toast.error("Error al eliminar"); }
  };

  // ── Sueldo ─────────────────────────────────────────────────
  const openSueldo = async (emp) => {
    setSelectedEmpleado(emp);
    const ipsCalc = emp.aplica_ips !== false ? calcularIPS(emp) : 0;

    // Cargar adelantos y extras del periodo
    let adelantos = [];
    let extras = [];
    try {
      const [rAd, rEx] = await Promise.all([
        fetch(`${API}/admin/empleados/${emp.id}/adelantos?periodo=${periodo}`, { headers }),
        fetch(`${API}/admin/empleados/${emp.id}/extras?periodo=${periodo}`, { headers }),
      ]);
      if (rAd.ok) adelantos = await rAd.json();
      if (rEx.ok) extras = await rEx.json();
    } catch { /* ignorar */ }

    setAdelantosPeriodo(adelantos);
    setExtrasPeriodo(extras);

    setFormSueldo({
      ...emptySueldo,
      periodo,
      moneda: emp.moneda || "PYG",
      tipo_cambio: emp.tipo_cambio ?? "",
      descuento_ips: String(ipsCalc),
      descuentos_adicionales: [],
    });
    setShowSueldoModal(true);
  };

  // ── Adelanto handlers ──────────────────────────────────────
  const openAdelanto = (emp) => {
    setAdelantoEmp(emp);
    setFormAdelanto({ monto: "", fecha: new Date().toISOString().slice(0, 10), notas: "" });
    setShowAdelantoModal(true);
  };

  const handleSaveAdelanto = async () => {
    if (!formAdelanto.monto) { toast.error("Monto requerido"); return; }
    if (!formAdelanto.fecha) { toast.error("Fecha requerida"); return; }
    setSavingAdelanto(true);
    try {
      const payload = {
        periodo,
        monto: parseFloat(formAdelanto.monto) || 0,
        moneda: adelantoEmp.moneda || "PYG",
        tipo_cambio: adelantoEmp.tipo_cambio || null,
        fecha: formAdelanto.fecha,
        notas: formAdelanto.notas || null,
      };
      const res = await fetch(`${API}/admin/empleados/${adelantoEmp.id}/adelantos`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Error"); }
      const nuevoAdelanto = await res.json();
      toast.success("Adelanto registrado");
      setShowAdelantoModal(false);
      setAdelantosMap(prev => ({
        ...prev,
        [adelantoEmp.id]: [...(prev[adelantoEmp.id] || []), nuevoAdelanto],
      }));
      fetchVencimientos();
    } catch (e) { toast.error(e.message); }
    finally { setSavingAdelanto(false); }
  };

  const handleDeleteAdelanto = async (adelantoId) => {
    if (!window.confirm("¿Eliminar este adelanto?")) return;
    try {
      const res = await fetch(`${API}/admin/adelantos/${adelantoId}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      const nuevosAdelantos = adelantosPeriodo.filter(a => a.id !== adelantoId);
      setAdelantosPeriodo(nuevosAdelantos);
      toast.success("Adelanto eliminado");
    } catch { toast.error("Error al eliminar adelanto"); }
  };

  // ── Extra handlers ─────────────────────────────────────────
  const openExtra = (emp) => {
    setExtraEmp(emp);
    setFormExtra({ monto: "", descripcion: "Extra", fecha: new Date().toISOString().slice(0, 10), notas: "" });
    setShowExtraModal(true);
  };

  const handleSaveExtra = async () => {
    if (!formExtra.monto) { toast.error("Monto requerido"); return; }
    if (!formExtra.fecha) { toast.error("Fecha requerida"); return; }
    setSavingExtra(true);
    try {
      const payload = {
        periodo,
        monto: parseFloat(formExtra.monto) || 0,
        moneda: extraEmp.moneda || "PYG",
        tipo_cambio: extraEmp.tipo_cambio || null,
        fecha: formExtra.fecha,
        descripcion: formExtra.descripcion || "Extra",
        notas: formExtra.notas || null,
      };
      const res = await fetch(`${API}/admin/empleados/${extraEmp.id}/extras`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Error"); }
      const nuevoExtra = await res.json();
      toast.success("Extra registrado");
      setShowExtraModal(false);
      setExtrasMap(prev => ({
        ...prev,
        [extraEmp.id]: [...(prev[extraEmp.id] || []), nuevoExtra],
      }));
      fetchVencimientos();
    } catch (e) { toast.error(e.message); }
    finally { setSavingExtra(false); }
  };

  const handleDeleteExtra = async (extraId) => {
    if (!window.confirm("¿Eliminar este extra?")) return;
    try {
      const res = await fetch(`${API}/admin/extras/${extraId}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      setExtrasPeriodo(prev => prev.filter(e => e.id !== extraId));
      toast.success("Extra eliminado");
    } catch { toast.error("Error al eliminar extra"); }
  };

  // ── Descuentos adicionales helpers ────────────────────────
  const agregarDescuento = () => {
    setFormSueldo(f => ({
      ...f,
      descuentos_adicionales: [...f.descuentos_adicionales, { descripcion: "", monto: "" }],
    }));
  };

  const eliminarDescuento = (idx) => {
    setFormSueldo(f => ({
      ...f,
      descuentos_adicionales: f.descuentos_adicionales.filter((_, i) => i !== idx),
    }));
  };

  const updateDescuento = (idx, field, value) => {
    setFormSueldo(f => {
      const arr = [...f.descuentos_adicionales];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...f, descuentos_adicionales: arr };
    });
  };

  const handleSaveSueldo = async () => {
    if (!formSueldo.fecha_pago) { toast.error("Fecha de pago requerida"); return; }
    setSavingSueldo(true);
    try {
      const ipsAmt = toFloat(formSueldo.descuento_ips) ?? 0;
      const montoPagadoCalc = calcMontoAPagar(
        selectedEmpleado,
        adelantosPeriodo,
        extrasPeriodo,
        formSueldo.descuentos_adicionales
      );
      const totalDescuentosAdicionales = formSueldo.descuentos_adicionales.reduce(
        (s, d) => s + (parseFloat(d.monto) || 0), 0
      );
      const payload = {
        periodo: formSueldo.periodo,
        monto_pagado: montoPagadoCalc,
        moneda: formSueldo.moneda,
        tipo_cambio: toFloat(formSueldo.tipo_cambio),
        fecha_pago: formSueldo.fecha_pago,
        descuento_ips: ipsAmt,
        horas_extra: 0,
        monto_horas_extra: 0,
        descuentos_adicionales: totalDescuentosAdicionales || null,
        notas: formSueldo.notas || null,
      };
      const res = await fetch(`${API}/admin/empleados/${selectedEmpleado.id}/sueldos`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Error"); }
      toast.success("Sueldo registrado");
      setShowSueldoModal(false);
      fetchVencimientos();
    } catch (e) { toast.error(e.message); }
    finally { setSavingSueldo(false); }
  };

  const handleDeleteSueldo = async (sueldoId) => {
    if (!window.confirm("¿Eliminar este registro de sueldo?")) return;
    try {
      const res = await fetch(`${API}/admin/sueldos/${sueldoId}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      toast.success("Registro eliminado");
      fetchVencimientos();
    } catch { toast.error("Error al eliminar"); }
  };

  // ── Estado badge ───────────────────────────────────────────
  const estadoBadge = (estado) => {
    if (estado === "pagado")   return <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium"><CheckCircle className="w-3.5 h-3.5" /> Pagado</span>;
    if (estado === "vencido")  return <span className="flex items-center gap-1 text-red-400 text-xs font-medium"><AlertCircle className="w-3.5 h-3.5" /> Vencido</span>;
    return <span className="flex items-center gap-1 text-amber-400 text-xs font-medium"><Clock className="w-3.5 h-3.5" /> Pendiente</span>;
  };

  // Computed: monto a pagar para el modal sueldo (reactivo)
  const montoAPagarCalculado = selectedEmpleado
    ? calcMontoAPagar(selectedEmpleado, adelantosPeriodo, extrasPeriodo, formSueldo.descuentos_adicionales)
    : 0;

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
              <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-white text-xl">Empleados</h1>
                <p className="text-slate-500 text-xs">Gestión de personal y sueldos</p>
              </div>
            </div>
          </div>
          {hasPermission("empleados.crear") && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
            >
              <Plus className="w-4 h-4" /> Nuevo empleado
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Filtro empresa */}
        <div className="flex flex-wrap gap-2">
          {LOGOS.map(l => (
            <button
              key={l.value}
              onClick={() => setLogoFilter(l.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                logoFilter === l.value
                  ? `${l.color} border-transparent shadow-lg`
                  : "bg-transparent border-white/10 text-slate-400 hover:text-white hover:border-white/20"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          {[
            { key: "sueldos",   label: "Sueldos del periodo" },
            { key: "empleados", label: "Todos los empleados" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB SUELDOS ── */}
        {tab === "sueldos" && (
          <div className="space-y-6">
            {/* Navegación de periodo */}
            <div className="flex items-center gap-4">
              <button onClick={() => setPeriodo(prevPeriodo(periodo))} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-white font-heading font-semibold text-lg min-w-[120px] text-center">
                {periodoLabel(periodo)}
              </span>
              <button onClick={() => setPeriodo(nextPeriodo(periodo))} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                <ChevronRight className="w-5 h-5" />
              </button>
              <button onClick={() => setPeriodo(getPeriodoActual())} className="text-xs text-slate-500 hover:text-white px-3 py-1 rounded border border-white/10 hover:border-white/20 transition-all">
                Hoy
              </button>
            </div>

            {/* Cards resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">Empleados</p>
                <p className="text-white font-heading font-bold text-2xl">{vencimientos.length}</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <p className="text-emerald-400 text-xs mb-1">Pagados</p>
                <p className="text-emerald-300 font-heading font-bold text-2xl">{pagados.length}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <p className="text-amber-400 text-xs mb-1">Pendientes</p>
                <p className="text-amber-300 font-heading font-bold text-2xl">{pendientes.length + vencidos.length}</p>
                {vencidos.length > 0 && (
                  <p className="text-red-400 text-xs mt-0.5">{vencidos.length} vencido{vencidos.length > 1 ? "s" : ""}</p>
                )}
              </div>
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                <p className="text-violet-400 text-xs mb-1">Total pagado (PYG)</p>
                <p className="text-violet-300 font-heading font-bold text-lg">
                  {formatMonto(montoPagado, "PYG")}
                </p>
              </div>
            </div>

            {/* Tabla vencimientos */}
            {loading ? (
              <div className="text-slate-500 text-center py-12">Cargando...</div>
            ) : vencimientos.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No hay empleados para este periodo</p>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Empleado</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Empresa</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Cargo</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">Sueldo base</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">Pagado</th>
                      <th className="text-center text-slate-400 text-xs font-medium px-4 py-3">Estado</th>
                      <th className="text-center text-slate-400 text-xs font-medium px-4 py-3">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vencimientos.map((emp) => (
                      <tr
                        key={emp.id}
                        className={`border-b border-white/5 transition-colors ${
                          emp.estado === "vencido" ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-white/3"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-white text-sm font-medium">{emp.nombre} {emp.apellido}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {adelantosMap[emp.id] && (
                              <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs px-2 py-0.5 rounded-full font-medium">
                                <DollarSign className="w-3 h-3" />
                                Adelanto: {formatMonto(
                                  adelantosMap[emp.id].reduce((s, a) => s + (a.monto || 0), 0),
                                  adelantosMap[emp.id][0]?.moneda || "PYG"
                                )}
                              </span>
                            )}
                            {extrasMap[emp.id] && (
                              <span className="inline-flex items-center gap-1 bg-green-500/15 border border-green-500/30 text-green-300 text-xs px-2 py-0.5 rounded-full font-medium">
                                <Star className="w-3 h-3" />
                                Extra: {formatMonto(
                                  extrasMap[emp.id].reduce((s, e) => s + (e.monto || 0), 0),
                                  extrasMap[emp.id][0]?.moneda || "PYG"
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {emp.logo_tipo && LOGO_LABEL[emp.logo_tipo] && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LOGO_LABEL[emp.logo_tipo].chip}`}>
                              {LOGO_LABEL[emp.logo_tipo].label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{emp.cargo || "-"}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-300">
                          {formatMonto(emp.sueldo_base, emp.moneda)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {emp.estado === "pagado" && emp.sueldo_registrado?.monto_pagado != null
                            ? <span className="text-emerald-300 font-medium">{formatMonto(emp.sueldo_registrado.monto_pagado, emp.sueldo_registrado?.moneda || emp.moneda)}</span>
                            : <span className="text-slate-600">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-center">{estadoBadge(emp.estado)}</td>
                        <td className="px-4 py-3 text-center">
                          {emp.estado === "pagado" ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-slate-500 text-xs">
                                {emp.sueldo_registrado?.fecha_pago || ""}
                              </span>
                              {hasPermission("empleados.editar") && (
                                <button
                                  onClick={() => handleDeleteSueldo(emp.sueldo_registrado?.id)}
                                  className="text-slate-500 hover:text-red-400 transition-colors"
                                  title="Deshacer pago"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ) : (
                            hasPermission("empleados.editar") && (
                              <div className="flex flex-col items-center gap-1.5">
                                <button
                                  onClick={() => openSueldo(emp)}
                                  className="flex items-center gap-1.5 mx-auto bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-all border border-violet-600/30"
                                >
                                  <DollarSign className="w-3.5 h-3.5" /> Registrar pago
                                </button>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => openAdelanto(emp)}
                                    className="flex items-center gap-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all border border-amber-600/30"
                                  >
                                    <DollarSign className="w-3 h-3" /> Adelanto
                                  </button>
                                  <button
                                    onClick={() => openExtra(emp)}
                                    className="flex items-center gap-1 bg-green-600/20 hover:bg-green-600/40 text-green-300 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all border border-green-600/30"
                                  >
                                    <Star className="w-3 h-3" /> Extra
                                  </button>
                                </div>
                              </div>
                            )
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

        {/* ── TAB EMPLEADOS ── */}
        {tab === "empleados" && (
          <div className="space-y-4">
            {loading ? (
              <div className="text-slate-500 text-center py-12">Cargando...</div>
            ) : empleados.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No hay empleados registrados</p>
                {hasPermission("empleados.crear") && (
                  <button onClick={openCreate} className="mt-4 text-violet-400 hover:text-violet-300 text-sm">+ Agregar el primero</button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {empleados.map(emp => {
                  const ipsAmt = emp.aplica_ips !== false ? calcularIPS(emp) : 0;
                  return (
                    <div key={emp.id} className={`bg-white/5 border rounded-xl p-4 transition-all ${emp.activo ? "border-white/10 hover:border-white/20" : "border-white/5 opacity-60"}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-heading font-bold text-sm ${
                            emp.activo ? "bg-violet-600/30 text-violet-300" : "bg-slate-700 text-slate-500"
                          }`}>
                            {emp.nombre?.[0]}{emp.apellido?.[0]}
                          </div>
                          <div>
                            <p className="text-white font-medium text-sm">{emp.nombre} {emp.apellido}</p>
                            <p className="text-slate-500 text-xs">{emp.cargo || "Sin cargo"}</p>
                          </div>
                        </div>
                        {!emp.activo && <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded">Inactivo</span>}
                      </div>

                      {emp.logo_tipo && LOGO_LABEL[emp.logo_tipo] && (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${LOGO_LABEL[emp.logo_tipo].chip}`}>
                          {LOGO_LABEL[emp.logo_tipo].label}
                        </span>
                      )}

                      <div className="space-y-1 text-xs text-slate-400 mb-3">
                        {emp.email && <p>✉ {emp.email}</p>}
                        {emp.telefono && <p>📞 {emp.telefono}</p>}
                        <p>Ingreso: {emp.fecha_ingreso}</p>
                        {emp.fecha_egreso && <p className="text-red-400">Egreso: {emp.fecha_egreso}</p>}
                        {emp.aplica_ips !== false && (
                          <p className="text-blue-400/70">IPS: {formatMonto(ipsAmt, "PYG")}
                            <span className="text-slate-600 ml-1">
                              ({emp.base_calculo_ips === "manual"
                                ? `9% de ${formatMonto(parseFloat(emp.ips_monto_manual) || 0, "PYG")}`
                                : emp.base_calculo_ips === "sueldo" ? "9% sueldo" : "9% mínimo"})
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-3">
                        <span className="text-violet-300 text-sm font-semibold">
                          {formatMonto(emp.sueldo_base, emp.moneda)}
                          <span className="text-slate-500 font-normal text-xs">/mes</span>
                        </span>
                        <div className="flex items-center gap-1">
                          {hasPermission("empleados.editar") && (
                            <button onClick={() => handleToggle(emp)} className="p-1.5 text-slate-500 hover:text-slate-300 rounded transition-all" title={emp.activo ? "Desactivar" : "Activar"}>
                              {emp.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                          )}
                          {hasPermission("empleados.editar") && (
                            <button onClick={() => openEdit(emp)} className="p-1.5 text-slate-500 hover:text-blue-400 rounded transition-all">
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {hasPermission("empleados.eliminar") && (
                            <button onClick={() => handleDeleteEmpleado(emp)} className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ MODAL EMPLEADO ══ */}
      {showEmpleadoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-white font-heading font-bold text-lg">
                {editingEmpleado ? "Editar empleado" : "Nuevo empleado"}
              </h2>
              <button onClick={() => setShowEmpleadoModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Empresa */}
              <div>
                <label className="text-slate-400 text-xs block mb-2">Empresa</label>
                <div className="flex gap-2 flex-wrap">
                  {LOGOS.filter(l => l.value !== "todas").map(l => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setFormEmp(f => ({ ...f, logo_tipo: l.value }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                        formEmp.logo_tipo === l.value
                          ? `${l.color} border-transparent`
                          : "border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre / Apellido */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Nombre *</label>
                  <input value={formEmp.nombre} onChange={e => setFormEmp(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="Juan"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Apellido *</label>
                  <input value={formEmp.apellido} onChange={e => setFormEmp(f => ({ ...f, apellido: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="Pérez"
                  />
                </div>
              </div>

              {/* Cargo */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Cargo</label>
                <select value={formEmp.cargo} onChange={e => setFormEmp(f => ({ ...f, cargo: e.target.value }))}
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500">
                  <option value="">— Sin cargo —</option>
                  {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Email / Teléfono */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Email</label>
                  <input type="email" value={formEmp.email} onChange={e => setFormEmp(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="juan@ejemplo.com"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Teléfono</label>
                  <input value={formEmp.telefono} onChange={e => setFormEmp(f => ({ ...f, telefono: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="0981 000000"
                  />
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Fecha de ingreso *</label>
                  <input type="date" value={formEmp.fecha_ingreso} onChange={e => setFormEmp(f => ({ ...f, fecha_ingreso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Fecha de egreso</label>
                  <input type="date" value={formEmp.fecha_egreso} onChange={e => setFormEmp(f => ({ ...f, fecha_egreso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Sueldo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-slate-400 text-xs block mb-1">Sueldo base *</label>
                  <input type="number" value={formEmp.sueldo_base} onChange={e => setFormEmp(f => ({ ...f, sueldo_base: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Moneda</label>
                  <select value={formEmp.moneda} onChange={e => setFormEmp(f => ({ ...f, moneda: e.target.value }))}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500">
                    {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {formEmp.moneda !== "PYG" && (
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Tipo de cambio (a PYG)</label>
                  <input type="number" value={formEmp.tipo_cambio} onChange={e => setFormEmp(f => ({ ...f, tipo_cambio: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="7500"
                  />
                </div>
              )}

              {/* IPS */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-blue-300 text-xs font-medium">Configuración IPS</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-slate-400 text-xs">Aplica IPS</span>
                    <input type="checkbox" checked={formEmp.aplica_ips} onChange={e => setFormEmp(f => ({ ...f, aplica_ips: e.target.checked }))}
                      className="w-4 h-4 accent-blue-500"
                    />
                  </label>
                </div>
                {formEmp.aplica_ips && (
                  <>
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Base de cálculo IPS</label>
                      <div className="flex gap-1.5">
                        {[
                          { value: "minimo", label: "Mín. vigente" },
                          { value: "sueldo",  label: "Sueldo (9%)" },
                          { value: "manual",  label: "Base manual" },
                        ].map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => setFormEmp(f => ({ ...f, base_calculo_ips: opt.value }))}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              formEmp.base_calculo_ips === opt.value
                                ? "border-blue-400 bg-blue-500/20 text-blue-300"
                                : "border-white/10 text-slate-400 hover:border-white/30"
                            }`}
                          >{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    {formEmp.base_calculo_ips === "minimo" && (
                      <div>
                        <label className="text-slate-400 text-xs block mb-1">Salario mínimo vigente (PYG)</label>
                        <input type="number" value={formEmp.sueldo_minimo_vigente} onChange={e => setFormEmp(f => ({ ...f, sueldo_minimo_vigente: parseFloat(e.target.value) || SUELDO_MINIMO_DEFAULT }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"
                          placeholder={String(SUELDO_MINIMO_DEFAULT)}
                        />
                        <p className="text-blue-400/60 text-xs mt-1">IPS calculado: ₲ {Math.round((parseFloat(formEmp.sueldo_minimo_vigente) || SUELDO_MINIMO_DEFAULT) * 0.09).toLocaleString("es-PY")}</p>
                      </div>
                    )}
                    {formEmp.base_calculo_ips === "sueldo" && (
                      <p className="text-blue-400/60 text-xs">IPS calculado: ₲ {Math.round((parseFloat(formEmp.sueldo_base) || 0) * 0.09).toLocaleString("es-PY")}</p>
                    )}
                    {formEmp.base_calculo_ips === "manual" && (
                      <div>
                        <label className="text-slate-400 text-xs block mb-1">Sueldo base para IPS (PYG) — se calculará el 9%</label>
                        <input type="number" value={formEmp.ips_monto_manual} onChange={e => setFormEmp(f => ({ ...f, ips_monto_manual: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"
                          placeholder="Ej: 2850000"
                        />
                        {formEmp.ips_monto_manual && (
                          <p className="text-blue-400/60 text-xs mt-1">
                            IPS calculado: ₲ {Math.round((parseFloat(formEmp.ips_monto_manual) || 0) * 0.09).toLocaleString("es-PY")}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas</label>
                <textarea value={formEmp.notas} onChange={e => setFormEmp(f => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 resize-none"
                  placeholder="Notas adicionales..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowEmpleadoModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveEmpleado} disabled={savingEmp}
                  className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all">
                  {savingEmp ? "Guardando..." : (editingEmpleado ? "Guardar cambios" : "Crear empleado")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL SUELDO ══ */}
      {showSueldoModal && selectedEmpleado && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-white font-heading font-bold text-lg">Registrar sueldo</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {selectedEmpleado.nombre} {selectedEmpleado.apellido} — {periodoLabel(formSueldo.periodo)}
                </p>
              </div>
              <button onClick={() => setShowSueldoModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Periodo</label>
                <input type="month" value={formSueldo.periodo} onChange={e => setFormSueldo(f => ({ ...f, periodo: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Resumen de cálculo */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2 text-sm">
                <p className="text-slate-400 text-xs font-medium mb-1">Desglose del pago</p>
                <div className="flex justify-between text-slate-300">
                  <span>Sueldo base</span>
                  <span>{formatMonto(parseFloat(selectedEmpleado.sueldo_base) || 0, selectedEmpleado.moneda || "PYG")}</span>
                </div>
                {extrasPeriodo.length > 0 && (
                  <div className="flex justify-between text-green-300">
                    <span>+ Extras ({extrasPeriodo.length})</span>
                    <span>+ {formatMonto(extrasPeriodo.reduce((s, e) => s + (e.monto || 0), 0), selectedEmpleado.moneda || "PYG")}</span>
                  </div>
                )}
                {selectedEmpleado.aplica_ips !== false && (
                  <div className="flex justify-between text-blue-300">
                    <span>− IPS</span>
                    <span>− {formatMonto(parseFloat(formSueldo.descuento_ips) || 0, "PYG")}</span>
                  </div>
                )}
                {adelantosPeriodo.length > 0 && (
                  <div className="flex justify-between text-amber-300">
                    <span>− Adelantos ({adelantosPeriodo.length})</span>
                    <span>− {formatMonto(adelantosPeriodo.reduce((s, a) => s + (a.monto || 0), 0), selectedEmpleado.moneda || "PYG")}</span>
                  </div>
                )}
                {formSueldo.descuentos_adicionales.length > 0 && (
                  <div className="flex justify-between text-red-300">
                    <span>− Descuentos adicionales</span>
                    <span>− {formatMonto(formSueldo.descuentos_adicionales.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0), "PYG")}</span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-2 flex justify-between font-semibold">
                  <span className="text-white">Total a pagar</span>
                  <span className="text-emerald-300">{formatMonto(montoAPagarCalculado, selectedEmpleado.moneda || "PYG")}</span>
                </div>
              </div>

              {/* Moneda y tipo de cambio */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Moneda</label>
                  <select value={formSueldo.moneda} onChange={e => setFormSueldo(f => ({ ...f, moneda: e.target.value }))}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500">
                    {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Fecha de pago *</label>
                  <input type="date" value={formSueldo.fecha_pago} onChange={e => setFormSueldo(f => ({ ...f, fecha_pago: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {formSueldo.moneda !== "PYG" && (
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Tipo de cambio (a PYG)</label>
                  <input type="number" value={formSueldo.tipo_cambio} onChange={e => setFormSueldo(f => ({ ...f, tipo_cambio: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="7500"
                  />
                </div>
              )}

              {/* IPS */}
              {selectedEmpleado?.aplica_ips !== false && (
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-blue-300 text-xs font-medium mb-2">
                    IPS — {selectedEmpleado?.base_calculo_ips === "manual"
                      ? `9% de ${formatMonto(parseFloat(selectedEmpleado?.ips_monto_manual) || 0, "PYG")}`
                      : `9% sobre ${selectedEmpleado?.base_calculo_ips === "sueldo" ? "sueldo base" : "salario mínimo vigente"}`}
                  </p>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Descuento IPS</label>
                    <input type="number" value={formSueldo.descuento_ips} onChange={e => setFormSueldo(f => ({ ...f, descuento_ips: e.target.value }))}
                      className="w-full bg-white/5 border border-blue-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              )}

              {/* Extras del periodo */}
              {extrasPeriodo.length > 0 && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 space-y-2">
                  <p className="text-green-300 text-xs font-medium">Extras pre-registrados este periodo</p>
                  {extrasPeriodo.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{e.fecha} — {e.descripcion || "Extra"} {e.notas ? `(${e.notas})` : ""}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-green-300 font-medium">{formatMonto(e.monto, e.moneda)}</span>
                        <button onClick={() => handleDeleteExtra(e.id)} className="text-red-400 hover:text-red-300 transition-colors" title="Eliminar extra">
                          <span className="text-xs">✕</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-green-500/20 pt-2 flex justify-between text-xs">
                    <span className="text-green-400 font-medium">Total extras</span>
                    <span className="text-green-300 font-bold">
                      {formatMonto(extrasPeriodo.reduce((s, e) => s + (e.monto || 0), 0), selectedEmpleado?.moneda || "PYG")}
                    </span>
                  </div>
                </div>
              )}

              {/* Adelantos del periodo */}
              {adelantosPeriodo.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 space-y-2">
                  <p className="text-amber-300 text-xs font-medium">Adelantos ya entregados este periodo</p>
                  {adelantosPeriodo.map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{a.fecha} {a.notas ? `— ${a.notas}` : ""}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-300 font-medium">{formatMonto(a.monto, a.moneda)}</span>
                        <button onClick={() => handleDeleteAdelanto(a.id)} className="text-red-400 hover:text-red-300 transition-colors" title="Eliminar adelanto">
                          <span className="text-xs">✕</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-amber-500/20 pt-2 flex justify-between text-xs">
                    <span className="text-amber-400 font-medium">Total adelantado</span>
                    <span className="text-amber-300 font-bold">
                      {formatMonto(adelantosPeriodo.reduce((s, a) => s + a.monto, 0), selectedEmpleado?.moneda || "PYG")}
                    </span>
                  </div>
                </div>
              )}

              {/* Descuentos adicionales */}
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-red-300 text-xs font-medium">Descuentos adicionales</p>
                  <button
                    type="button"
                    onClick={agregarDescuento}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Agregar
                  </button>
                </div>
                {formSueldo.descuentos_adicionales.length === 0 && (
                  <p className="text-slate-600 text-xs">Sin descuentos adicionales</p>
                )}
                {formSueldo.descuentos_adicionales.map((d, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={d.descripcion}
                      onChange={e => updateDescuento(idx, "descripcion", e.target.value)}
                      placeholder="Descripción"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-red-400"
                    />
                    <input
                      type="number"
                      value={d.monto}
                      onChange={e => updateDescuento(idx, "monto", e.target.value)}
                      placeholder="Monto"
                      className="w-28 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-red-400"
                    />
                    <button onClick={() => eliminarDescuento(idx)} className="text-red-400 hover:text-red-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas</label>
                <textarea value={formSueldo.notas} onChange={e => setFormSueldo(f => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 resize-none"
                  placeholder="Opcional..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSueldoModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveSueldo} disabled={savingSueldo}
                  className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all">
                  {savingSueldo ? "Guardando..." : `Confirmar — ${formatMonto(montoAPagarCalculado, formSueldo.moneda)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ADELANTO ══ */}
      {showAdelantoModal && adelantoEmp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-white font-heading font-bold text-lg">Registrar adelanto</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {adelantoEmp.nombre} {adelantoEmp.apellido} — {periodoLabel(periodo)}
                </p>
              </div>
              <button onClick={() => setShowAdelantoModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
                Sueldo neto: <strong>{formatMonto(
                  (parseFloat(adelantoEmp.sueldo_base) || 0) - (adelantoEmp.aplica_ips !== false ? calcularIPS(adelantoEmp) : 0),
                  adelantoEmp.moneda || "PYG"
                )}</strong>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Monto del adelanto *</label>
                <input
                  type="number" min="0" step="any"
                  value={formAdelanto.monto}
                  onChange={e => setFormAdelanto(f => ({ ...f, monto: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Fecha *</label>
                <input
                  type="date"
                  value={formAdelanto.fecha}
                  onChange={e => setFormAdelanto(f => ({ ...f, fecha: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={formAdelanto.notas}
                  onChange={e => setFormAdelanto(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="Ej: anticipo quincena..."
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAdelantoModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveAdelanto} disabled={savingAdelanto}
                  className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all">
                  {savingAdelanto ? "Guardando..." : "Registrar adelanto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL EXTRA ══ */}
      {showExtraModal && extraEmp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-white font-heading font-bold text-lg">Registrar extra</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {extraEmp.nombre} {extraEmp.apellido} — {periodoLabel(periodo)}
                </p>
              </div>
              <button onClick={() => setShowExtraModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs text-green-300">
                Los extras se <strong>suman</strong> al sueldo base al momento del registro de pago.
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Descripción</label>
                <input
                  type="text"
                  value={formExtra.descripcion}
                  onChange={e => setFormExtra(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  placeholder="Ej: Horas extra, bonificación..."
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Monto *</label>
                <input
                  type="number" min="0" step="any"
                  value={formExtra.monto}
                  onChange={e => setFormExtra(f => ({ ...f, monto: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Fecha *</label>
                <input
                  type="date"
                  value={formExtra.fecha}
                  onChange={e => setFormExtra(f => ({ ...f, fecha: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={formExtra.notas}
                  onChange={e => setFormExtra(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  placeholder="Ej: x horas..."
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowExtraModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveExtra} disabled={savingExtra}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all">
                  {savingExtra ? "Guardando..." : "Registrar extra"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
