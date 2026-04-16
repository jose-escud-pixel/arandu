import React, { useState, useEffect, useContext, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Receipt, Plus, X, Pencil, Trash2, ArrowLeft,
  CheckCircle, Clock, AlertCircle, ChevronLeft, ChevronRight,
  ArrowUpRight, ArrowDownLeft, Filter
} from "lucide-react";
import { toast } from "sonner";
import { AuthContext } from "../App";
import EmpresaSwitcher from "../components/EmpresaSwitcher";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Constantes ───────────────────────────────────────────────
const LOGO_LABEL = {
  arandujar: { label: "Arandu&JAR",      chip: "bg-blue-600/20 text-blue-300 border border-blue-600/30" },
  arandu:    { label: "Arandu",          chip: "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30" },
  jar:       { label: "JAR Informatica", chip: "bg-red-600/20 text-red-300 border border-red-600/30" },
};

const MONEDAS = ["PYG", "USD", "BRL", "ARS"];

const ESTADOS_BADGE = {
  pagada:   { label: "Pagada",   cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30", icon: CheckCircle },
  pendiente:{ label: "Pendiente",cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30",   icon: Clock },
  anulada:  { label: "Anulada",  cls: "bg-slate-500/20 text-slate-400 border border-slate-500/30",   icon: X },
  parcial:  { label: "Parcial",  cls: "bg-blue-500/15 text-blue-300 border border-blue-500/30",      icon: Clock },
};

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

function formatMonto(monto, moneda) {
  if (!monto && monto !== 0) return "-";
  if (moneda === "PYG") return `₲ ${Number(monto).toLocaleString("es-PY")}`;
  return `${moneda} ${Number(monto).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toFloat(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

const emptyForm = {
  logo_tipo: "arandujar",
  tipo: "emitida",
  forma_pago: "contado",
  numero: "",
  fecha: new Date().toISOString().slice(0, 10),
  razon_social: "",
  ruc: "",
  concepto: "",
  conceptos: [],           // lista de items: [{descripcion, monto}] cuando no hay vínculo
  monto: "",
  moneda: "PYG",
  tipo_cambio: "",
  estado: "pendiente",
  fecha_vencimiento: "",
  fecha_pago: "",
  notas: "",
  presupuesto_id: "",      // legacy (compat)
  presupuesto_ids: [],     // nuevo: lista de presupuestos vinculados
  contrato_id: "",
  _empresa_id: "",   // UI-only, not sent to API
};

// ═══════════════════════════════════════════════════════════════
export default function FacturasPage() {
  const { token, hasPermission, activeEmpresaPropia } = useContext(AuthContext);
  const navigate = useNavigate();

  // Siempre filtramos por empresa activa (logo_tipo)
  const logoFilter = activeEmpresaPropia?.slug || "todas";
  // Siempre emitidas (facturas recibidas se gestionan en compras)
  const tipoFilter = "emitida";
  const [estadoFilter, setEstadoFilter] = useState("todas");
  const [mes, setMes] = useState(getMesActual());
  const [filtrarMes, setFiltrarMes] = useState(false);  // Por defecto muestra todos los meses

  const [facturas, setFacturas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [presupuestosDisp, setPresupuestosDisp] = useState([]);
  const [contratosDisp, setContratosDisp] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editingFac, setEditingFac] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // guard extra contra doble-submit

  // Modal pago rápido
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoFac, setPagoFac] = useState(null);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  // Pago parcial
  const [showPagoParcialModal, setShowPagoParcialModal] = useState(false);
  const [pagoParcialFac, setPagoParcialFac] = useState(null);
  const [montoParcial, setMontoParcial] = useState("");
  const [fechaPagoParcial, setFechaPagoParcial] = useState(new Date().toISOString().slice(0, 10));

  const headers = { Authorization: `Bearer ${token}` };

  // ── Fetch ──────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let q = new URLSearchParams();
      if (logoFilter !== "todas") q.set("logo_tipo", logoFilter);
      q.set("tipo", "emitida");
      if (estadoFilter !== "todas") q.set("estado", estadoFilter);
      if (filtrarMes) q.set("mes", mes);

      let qR = new URLSearchParams();
      if (logoFilter !== "todas") qR.set("logo_tipo", logoFilter);
      if (filtrarMes) qR.set("mes", mes);

      const [facRes, resRes, empRes, presRes, contRes] = await Promise.all([
        fetch(`${API}/admin/facturas?${q}`, { headers }),
        fetch(`${API}/admin/facturas/resumen?${qR}`, { headers }),
        fetch(`${API}/admin/empresas`, { headers }),
        fetch(`${API}/admin/presupuestos`, { headers }),
        fetch(`${API}/admin/contratos`, { headers }),
      ]);
      if (empRes.ok) setEmpresas(await empRes.json());
      if (presRes.ok) setPresupuestosDisp(await presRes.json());
      if (contRes.ok) setContratosDisp(await contRes.json());
      const sanitizeDate = (v) => (v ? v.slice(0, 10) : null);
      if (facRes.ok) {
        const data = await facRes.json();
        setFacturas(data.map(f => ({
          ...f,
          fecha: sanitizeDate(f.fecha),
          fecha_vencimiento: sanitizeDate(f.fecha_vencimiento),
          fecha_pago: sanitizeDate(f.fecha_pago),
        })));
      }
      if (resRes.ok) setResumen(await resRes.json());
    } catch { toast.error("Error al cargar facturas"); }
    finally { setLoading(false); }
  }, [logoFilter, estadoFilter, mes, filtrarMes, activeEmpresaPropia]); // eslint-disable-line

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Abrir modales ──────────────────────────────────────────
  // Convierte cualquier fecha (ISO datetime o YYYY-MM-DD) a "YYYY-MM-DD" puro
  // para evitar el DOMException en Safari/Firefox con <input type="date">
  const toDateOnly = (v) => (v ? v.slice(0, 10) : "");

  const openCreate = () => {
    setEditingFac(null);
    setForm({
      ...emptyForm,
      fecha: new Date().toISOString().slice(0, 10),
      logo_tipo: activeEmpresaPropia?.slug || "arandujar",
      tipo: "emitida",
    });
    setShowModal(true);
  };

  const openEdit = (fac) => {
    setEditingFac(fac);
    setForm({
      logo_tipo: fac.logo_tipo || "arandujar",
      tipo: fac.tipo || "emitida",
      forma_pago: fac.forma_pago || "contado",
      numero: fac.numero || "",
      fecha: toDateOnly(fac.fecha) || new Date().toISOString().slice(0, 10),
      razon_social: fac.razon_social || "",
      ruc: fac.ruc || "",
      concepto: fac.concepto || "",
      conceptos: fac.conceptos?.length ? fac.conceptos : [],
      monto: fac.monto ?? "",
      moneda: fac.moneda || "PYG",
      tipo_cambio: fac.tipo_cambio ?? "",
      estado: fac.estado || "pendiente",
      fecha_vencimiento: toDateOnly(fac.fecha_vencimiento),
      fecha_pago: toDateOnly(fac.fecha_pago),
      notas: fac.notas || "",
      presupuesto_id: fac.presupuesto_id || "",
      presupuesto_ids: fac.presupuesto_ids?.length
        ? fac.presupuesto_ids
        : (fac.presupuesto_id ? [fac.presupuesto_id] : []),
      contrato_id: fac.contrato_id || "",
      _empresa_id: "",   // reset on edit; user can re-select if needed
    });
    setShowModal(true);
  };

  const openPago = (fac) => {
    setPagoFac(fac);
    setFechaPago(new Date().toISOString().slice(0, 10));
    setShowPagoModal(true);
  };

  // ── Guardar factura ────────────────────────────────────────
  const handleSave = async () => {
    if (savingRef.current) return; // guard contra doble-submit (doble-click)
    if (!form.numero.trim()) { toast.error("Número de factura requerido"); return; }
    if (!form.fecha) { toast.error("Fecha requerida"); return; }
    if (!form.razon_social.trim()) { toast.error("Razón social requerida"); return; }

    // Si hay conceptos múltiples, calcular monto desde ellos
    const tieneConceptos = form.tipo === "emitida" && (form.presupuesto_ids || []).length === 0 && !form.contrato_id && (form.conceptos || []).length > 0;
    const montoFinal = tieneConceptos
      ? (form.conceptos || []).reduce((s, c) => s + (parseFloat(c.monto) || 0), 0)
      : toFloat(form.monto);
    const conceptoPrincipal = tieneConceptos
      ? ((form.conceptos || []).map(c => c.descripcion).filter(Boolean).join("; ") || form.concepto || "")
      : form.concepto;

    if (!conceptoPrincipal.trim() && !(form.conceptos || []).length) { toast.error("Concepto requerido"); return; }
    if (!montoFinal && montoFinal !== 0) { toast.error("Monto requerido"); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      // eslint-disable-next-line no-unused-vars
      const { _empresa_id, ...formData } = form;
      const payload = {
        ...formData,
        logo_tipo: activeEmpresaPropia?.slug || formData.logo_tipo || "arandujar",
        tipo: "emitida",
        concepto: conceptoPrincipal,
        conceptos: tieneConceptos ? (form.conceptos || []) : [],
        monto: montoFinal ?? 0,
        tipo_cambio: toFloat(form.tipo_cambio),
        ruc: form.ruc || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        fecha_pago: form.fecha_pago || null,
        notas: form.notas || null,
        presupuesto_ids: form.presupuesto_ids || [],
        presupuesto_id: form.presupuesto_ids?.length === 1 ? form.presupuesto_ids[0] : (form.presupuesto_id || null),
        contrato_id: form.contrato_id || null,
      };
      const url = editingFac ? `${API}/admin/facturas/${editingFac.id}` : `${API}/admin/facturas`;
      const method = editingFac ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Error al guardar"); }
      toast.success(editingFac ? "Factura actualizada" : "Factura creada");
      setShowModal(false);  // cerrar modal primero
      fetchAll().catch(() => {}); // refrescar lista sin propagar errores al catch de arriba
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); savingRef.current = false; }
  };

  // ── Marcar pagada ──────────────────────────────────────────
  const handlePagar = async () => {
    if (!fechaPago) { toast.error("Fecha de pago requerida"); return; }
    try {
      const q = `estado=pagada&fecha_pago=${fechaPago}`;
      const res = await fetch(`${API}/admin/facturas/${pagoFac.id}/estado?${q}`, {
        method: "PATCH", headers,
      });
      if (!res.ok) throw new Error();
      toast.success("Factura marcada como pagada");
      setShowPagoModal(false);
      fetchAll().catch(() => {});
    } catch { toast.error("Error al actualizar estado"); }
  };

  // ── Pago contado (usa fecha de la factura) ────────────────
  const handlePagarContado = async (fac) => {
    try {
      const q = `estado=pagada&fecha_pago=${fac.fecha}`;
      const res = await fetch(`${API}/admin/facturas/${fac.id}/estado?${q}`, {
        method: "PATCH", headers,
      });
      if (!res.ok) throw new Error();
      toast.success("Factura marcada como pagada");
      fetchAll().catch(() => {});
    } catch { toast.error("Error al actualizar estado"); }
  };

  // ── Pago parcial ────────────────────────────────────────────
  const openPagoParcial = (fac) => {
    setPagoParcialFac(fac);
    const yaAbonado = fac.monto_pagado || 0;
    setMontoParcial(String(fac.monto - yaAbonado));
    setFechaPagoParcial(new Date().toISOString().slice(0, 10));
    setShowPagoParcialModal(true);
  };

  const handlePagoParcial = async () => {
    const monto = parseFloat(montoParcial);
    if (!monto || monto <= 0) { toast.error("Monto inválido"); return; }
    try {
      const res = await fetch(`${API}/admin/facturas/${pagoParcialFac.id}/pago-parcial`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ monto_pagado: monto, fecha_pago: fechaPagoParcial }),
      });
      if (!res.ok) throw new Error();
      toast.success(monto >= pagoParcialFac.monto ? "Factura pagada completamente" : "Pago parcial registrado");
      setShowPagoParcialModal(false);
      fetchAll().catch(() => {});
    } catch { toast.error("Error al registrar pago parcial"); }
  };

  const handleDeshacer = async (fac) => {
    try {
      const res = await fetch(`${API}/admin/facturas/${fac.id}/estado?estado=pendiente`, {
        method: "PATCH", headers,
      });
      if (!res.ok) throw new Error();
      toast.success("Factura vuelta a pendiente");
      fetchAll();
    } catch { toast.error("Error"); }
  };

  const handleAnular = async (fac) => {
    if (!window.confirm("¿Anular esta factura?")) return;
    try {
      const res = await fetch(`${API}/admin/facturas/${fac.id}/estado?estado=anulada`, {
        method: "PATCH", headers,
      });
      if (!res.ok) throw new Error();
      toast.success("Factura anulada");
      fetchAll().catch(() => {});
    } catch { toast.error("Error al anular"); }
  };

  const handleDelete = async (fac) => {
    if (!window.confirm(`¿Eliminar factura ${fac.numero}?`)) return;
    try {
      const res = await fetch(`${API}/admin/facturas/${fac.id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      toast.success("Factura eliminada");
      fetchAll().catch(() => {});
    } catch { toast.error("Error al eliminar"); }
  };

  // ── Helpers UI ─────────────────────────────────────────────
  const StateBadge = ({ estado }) => {
    const s = ESTADOS_BADGE[estado] || ESTADOS_BADGE.pendiente;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>
        <Icon className="w-3 h-3" /> {s.label}
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
            <button onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center">
                <Receipt className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-white text-xl">Facturas</h1>
                <p className="text-slate-500 text-xs">Facturas emitidas</p>
              </div>
            </div>
            <EmpresaSwitcher compact />
          </div>
          {hasPermission("facturas.crear") && (
            <button onClick={openCreate} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
              <Plus className="w-4 h-4" /> Nueva factura
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Filtros secundarios */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Estado */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {[
              { v: "todas",    l: "Todos" },
              { v: "pendiente",l: "Pendientes" },
              { v: "pagada",   l: "Pagadas" },
              { v: "anulada",  l: "Anuladas" },
            ].map(e => (
              <button key={e.v} onClick={() => setEstadoFilter(e.v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  estadoFilter === e.v ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"
                }`}>
                {e.l}
              </button>
            ))}
          </div>

          {/* Mes */}
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={filtrarMes} onChange={e => setFiltrarMes(e.target.checked)}
                className="accent-amber-500 w-3.5 h-3.5" />
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
        </div>

        {/* Cards resumen */}
        {resumen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="w-4 h-4 text-blue-400" />
                <p className="text-blue-400 text-xs">Emitidas</p>
              </div>
              <p className="text-blue-300 font-heading font-bold text-xl">{resumen.emitidas.cantidad}</p>
              <p className="text-blue-400/70 text-xs mt-0.5">{formatMonto(resumen.emitidas.monto_pyg, "PYG")}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <p className="text-emerald-400 text-xs">Cobradas</p>
              </div>
              <p className="text-emerald-300 font-heading font-bold text-xl">{resumen.emitidas_pagadas.cantidad}</p>
              <p className="text-emerald-400/70 text-xs mt-0.5">{formatMonto(resumen.emitidas_pagadas.monto_pyg, "PYG")}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownLeft className="w-4 h-4 text-red-400" />
                <p className="text-red-400 text-xs">Recibidas</p>
              </div>
              <p className="text-red-300 font-heading font-bold text-xl">{resumen.recibidas.cantidad}</p>
              <p className="text-red-400/70 text-xs mt-0.5">{formatMonto(resumen.recibidas.monto_pyg, "PYG")}</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <p className="text-amber-400 text-xs">Por cobrar</p>
              </div>
              <p className="text-amber-300 font-heading font-bold text-xl">{resumen.emitidas_pendientes.cantidad}</p>
              <p className="text-amber-400/70 text-xs mt-0.5">{formatMonto(resumen.emitidas_pendientes.monto_pyg, "PYG")}</p>
            </div>
          </div>
        )}

        {/* Totales por moneda */}
        {facturas.length > 0 && (() => {
          const emitidas = facturas.filter(f => f.tipo === "emitida" && ["pagada","parcial"].includes(f.estado));
          const byMoneda = {};
          emitidas.forEach(f => {
            const m = f.moneda || "PYG";
            if (!byMoneda[m]) byMoneda[m] = { cantidad: 0, total: 0 };
            byMoneda[m].cantidad++;
            byMoneda[m].total += f.moneda === "PYG" ? (f.monto || 0) : (f.monto_pagado || f.monto || 0);
          });
          const monedas = Object.keys(byMoneda).filter(m => m !== "PYG");
          if (monedas.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-3">
              {Object.entries(byMoneda).map(([m, data]) => (
                <div key={m} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                  <span className="text-slate-400">Cobrado en {m}:</span>
                  <span className="text-white font-semibold font-heading">
                    {m === "PYG"
                      ? `₲ ${Math.round(data.total).toLocaleString("es-PY")}`
                      : `${m} ${data.total.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                  <span className="text-slate-500 text-xs">({data.cantidad} fact.)</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Tabla facturas */}
        {loading ? (
          <div className="text-slate-500 text-center py-12">Cargando...</div>
        ) : facturas.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay facturas para los filtros seleccionados</p>
            {hasPermission("facturas.crear") && (
              <button onClick={openCreate} className="mt-4 text-amber-400 hover:text-amber-300 text-sm">+ Agregar la primera</button>
            )}
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Nro</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Razón social</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Fecha</th>
                  <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">Monto</th>
                  <th className="text-right text-slate-400 text-xs font-medium px-4 py-3">IVA</th>
                  <th className="text-center text-slate-400 text-xs font-medium px-4 py-3">Estado</th>
                  <th className="text-center text-slate-400 text-xs font-medium px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map(fac => (
                  <tr key={fac.id} className={`border-b border-white/5 transition-colors hover:bg-white/3 ${fac.estado === "anulada" ? "opacity-40" : ""}`}>
                    <td className="px-4 py-3">
                      <span className="text-white text-sm font-mono">{fac.numero}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white text-sm">{fac.razon_social}</p>
                      {fac.ruc && <p className="text-slate-500 text-xs">RUC: {fac.ruc}</p>}
                      <p className="text-slate-400 text-xs mt-0.5 truncate max-w-[180px]">{fac.concepto}</p>
                      {fac.forma_pago && (
                        <span className={`text-xs px-1.5 py-0.5 rounded mt-0.5 inline-block ${
                          fac.forma_pago === "credito"
                            ? "bg-orange-500/15 text-orange-300 border border-orange-500/30"
                            : "bg-slate-700/50 text-slate-400"
                        }`}>{fac.forma_pago === "credito" ? "Crédito" : "Contado"}</span>
                      )}
                      {((fac.presupuesto_ids?.length > 0) || fac.presupuesto_id) && (
                        <span className="text-xs text-blue-400 block mt-0.5">
                          📄 {fac.presupuesto_ids?.length > 1
                            ? `${fac.presupuesto_ids.length} presupuestos vinculados`
                            : "Presupuesto vinculado"}
                        </span>
                      )}
                      {fac.contrato_id && (
                        <span className="text-xs text-emerald-400 block mt-0.5">📋 Contrato vinculado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm whitespace-nowrap">{fac.fecha}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white text-sm font-semibold">{formatMonto(fac.monto, fac.moneda)}</span>
                      {fac.moneda !== "PYG" && fac.monto_pyg && (
                        <p className="text-slate-500 text-xs">≈ {formatMonto(fac.monto_pyg, "PYG")}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fac.monto ? (
                        <span className="text-slate-400 text-xs">
                          {fac.moneda === "PYG"
                            ? formatMonto(Math.round(fac.monto / 11), "PYG")
                            : `${fac.moneda} ${(fac.monto / 11).toFixed(2)}`
                          }
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StateBadge estado={fac.estado} />
                      {/* Historial de pagos: si hay varios mostrar cada uno con fecha+monto */}
                      {(fac.pagos || []).length > 1 ? (
                        <div className="mt-1 space-y-0.5">
                          {(fac.pagos || []).map((p, i) => (
                            <p key={p.id || i} className="text-xs leading-tight">
                              <span className="text-slate-500">{p.fecha}</span>
                              <span className="text-blue-300 ml-1">{formatMonto(p.monto, fac.moneda)}</span>
                            </p>
                          ))}
                        </div>
                      ) : fac.fecha_pago ? (
                        <p className="text-slate-500 text-xs mt-0.5">{fac.fecha_pago}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {/* Botón de pago según forma_pago */}
                        {(fac.estado === "pendiente" || fac.estado === "parcial") && hasPermission("facturas.editar") && (
                          <>
                            {fac.forma_pago === "credito" ? (
                              /* Crédito: pago parcial con fecha elegible */
                              <button onClick={() => openPagoParcial(fac)}
                                className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-600/30 px-2 py-1 rounded-lg transition-all">
                                Registrar pago
                              </button>
                            ) : (
                              /* Contado: pago total con fecha de la factura */
                              <button onClick={() => {
                                  // Para contado: pagar total con fecha de la factura
                                  handlePagarContado(fac);
                                }}
                                className="text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-600/30 px-2 py-1 rounded-lg transition-all">
                                Pagar
                              </button>
                            )}
                          </>
                        )}
                        {/* Deshacer pago */}
                        {(fac.estado === "pagada" || fac.estado === "parcial") && hasPermission("facturas.editar") && (
                          <button onClick={() => handleDeshacer(fac)}
                            className="text-xs bg-white/5 hover:bg-white/10 text-slate-400 px-2 py-1 rounded-lg transition-all">
                            Deshacer
                          </button>
                        )}
                        {/* Anular */}
                        {fac.estado !== "anulada" && hasPermission("facturas.editar") && (
                          <button onClick={() => handleAnular(fac)} title="Anular"
                            className="p-1.5 text-slate-500 hover:text-amber-400 rounded transition-all">
                            <AlertCircle className="w-4 h-4" />
                          </button>
                        )}
                        {/* Editar */}
                        {hasPermission("facturas.editar") && (
                          <button onClick={() => openEdit(fac)} title="Editar"
                            className="p-1.5 text-slate-500 hover:text-blue-400 rounded transition-all">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {/* Eliminar */}
                        {hasPermission("facturas.eliminar") && (
                          <button onClick={() => handleDelete(fac)} title="Eliminar"
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-all">
                            <Trash2 className="w-4 h-4" />
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

      {/* ══ MODAL FACTURA ══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-arandu-dark-light z-10">
              <h2 className="text-white font-heading font-bold text-lg">
                {editingFac ? "Editar factura" : "Nueva factura"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Número / Fecha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Nro. Factura *</label>
                  <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                    placeholder="001-001-0000001"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Forma de pago */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Forma de pago</label>
                <div className="flex gap-2">
                  {[{ value: "contado", label: "Contado" }, { value: "credito", label: "Crédito" }].map(fp => (
                    <button
                      key={fp.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, forma_pago: fp.value }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                        form.forma_pago === fp.value
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
                          : "border-white/10 text-slate-400 hover:border-white/30"
                      }`}
                    >
                      {fp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Empresa selector → auto-fill razón social + RUC */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Seleccionar empresa (opcional)</label>
                <select
                  value={form._empresa_id || ""}
                  onChange={e => {
                    const emp = empresas.find(x => x.id === e.target.value);
                    if (emp) {
                      setForm(f => ({
                        ...f,
                        _empresa_id: emp.id,
                        razon_social: emp.razon_social || emp.nombre || "",
                        ruc: emp.ruc || "",
                      }));
                    } else {
                      setForm(f => ({ ...f, _empresa_id: "" }));
                    }
                  }}
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value="">— Ingresar manualmente —</option>
                  {empresas.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}{emp.ruc ? ` · RUC ${emp.ruc}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Razón social / RUC */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Razón social *</label>
                  <input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                    placeholder="Empresa S.A."
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">RUC</label>
                  <input value={form.ruc} onChange={e => setForm(f => ({ ...f, ruc: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                    placeholder="80012345-6"
                  />
                </div>
              </div>

              {/* Concepto / Multi-conceptos */}
              {form.tipo === "emitida" && (form.presupuesto_ids || []).length === 0 && !form.contrato_id ? (
                /* Emitida sin vínculo → multi-conceptos */
                <div className="bg-white/3 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 text-xs font-medium">Conceptos (ítems de factura)</label>
                    <span className="text-amber-300 text-xs font-bold">
                      Total: {formatMonto((form.conceptos || []).reduce((s, c) => s + (parseFloat(c.monto) || 0), 0), form.moneda)}
                    </span>
                  </div>
                  {(form.conceptos || []).map((c, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        value={c.descripcion}
                        onChange={e => setForm(f => { const cs = [...(f.conceptos||[])]; cs[idx] = {...cs[idx], descripcion: e.target.value}; return {...f, conceptos: cs}; })}
                        className="flex-1 bg-arandu-dark border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500"
                        placeholder="Descripción del concepto"
                      />
                      <input
                        type="number"
                        value={c.monto}
                        onChange={e => setForm(f => { const cs = [...(f.conceptos||[])]; cs[idx] = {...cs[idx], monto: e.target.value}; return {...f, conceptos: cs}; })}
                        className="w-32 bg-arandu-dark border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500"
                        placeholder="0"
                      />
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, conceptos: (f.conceptos||[]).filter((_, i) => i !== idx) }))}
                        className="text-slate-500 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, conceptos: [...(f.conceptos||[]), {descripcion: "", monto: ""}] }))}
                    className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-xs transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Agregar concepto
                  </button>
                </div>
              ) : (
                /* Linked or recibida → single concepto */
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Concepto *</label>
                  <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                    placeholder="Servicio de soporte técnico mensual"
                  />
                </div>
              )}

              {/* Moneda row — siempre visible */}
              <div className="grid grid-cols-3 gap-3">
                {/* Monto solo cuando NO es multi-concepto */}
                {!(form.tipo === "emitida" && (form.presupuesto_ids || []).length === 0 && !form.contrato_id && (form.conceptos || []).length > 0) && (
                  <div className="col-span-2">
                    <label className="text-slate-400 text-xs block mb-1">Monto *</label>
                    <input type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                      placeholder="0"
                    />
                  </div>
                )}
                <div className={!(form.tipo === "emitida" && (form.presupuesto_ids || []).length === 0 && !form.contrato_id && (form.conceptos || []).length > 0) ? "" : "col-span-3"}>
                  <label className="text-slate-400 text-xs block mb-1">Moneda</label>
                  <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                    {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {form.moneda !== "PYG" && (
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Tipo de cambio (a PYG)</label>
                  <input type="number" value={form.tipo_cambio} onChange={e => setForm(f => ({ ...f, tipo_cambio: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                    placeholder="7500"
                  />
                </div>
              )}

              {/* Estado / Fecha vencimiento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                    <option value="pendiente">Pendiente</option>
                    <option value="pagada">Pagada</option>
                    <option value="anulada">Anulada</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Fecha vencimiento</label>
                  <input type="date" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {form.estado === "pagada" && (
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Fecha de cobro / pago</label>
                  <input type="date" value={form.fecha_pago} onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Vinculación a presupuestos o contrato (solo facturas emitidas) */}
              {form.tipo === "emitida" && (
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 space-y-3">
                  <p className="text-blue-300 text-xs font-medium">Vincular a presupuestos o contrato (opcional)</p>

                  {/* Presupuestos vinculados — multi-select con chips */}
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Presupuestos vinculados</label>
                    {/* Chips de presupuestos ya seleccionados */}
                    {(form.presupuesto_ids || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(form.presupuesto_ids || []).map(pid => {
                          const p = presupuestosDisp.find(x => x.id === pid);
                          return (
                            <span key={pid} className="flex items-center gap-1 bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs px-2 py-1 rounded-full">
                              {p ? `${p.numero}${p.nombre_archivo ? ` — ${p.nombre_archivo}` : ""}` : pid.slice(0, 8)}
                              <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, presupuesto_ids: f.presupuesto_ids.filter(x => x !== pid) }))}
                                className="text-blue-400 hover:text-red-400 ml-0.5 leading-none"
                              >✕</button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {/* Selector para agregar otro presupuesto */}
                    <select
                      value=""
                      onChange={e => {
                        const val = e.target.value;
                        if (!val) return;
                        setForm(f => ({
                          ...f,
                          presupuesto_ids: f.presupuesto_ids.includes(val)
                            ? f.presupuesto_ids
                            : [...f.presupuesto_ids, val],
                          contrato_id: "",
                        }));
                      }}
                      className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"
                    >
                      <option value="">+ Agregar presupuesto...</option>
                      {presupuestosDisp
                        .filter(p => !(form.presupuesto_ids || []).includes(p.id))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.numero}{p.nombre_archivo ? ` — ${p.nombre_archivo}` : ""} · {p.empresa_nombre || ""} ({p.moneda === "USD" ? `$${p.total}` : `₲${Number(p.total).toLocaleString("es-PY")}`})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Contrato (solo si no hay presupuestos vinculados) */}
                  {(form.presupuesto_ids || []).length === 0 && (
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Contrato</label>
                      <select
                        value={form.contrato_id || ""}
                        onChange={e => setForm(f => ({ ...f, contrato_id: e.target.value }))}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"
                      >
                        <option value="">— Sin vincular —</option>
                        {contratosDisp.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.numero || c.id.slice(0, 8)}{c.empresa_nombre ? ` — ${c.empresa_nombre}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {((form.presupuesto_ids || []).length > 0 || form.contrato_id) && (
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, presupuesto_ids: [], contrato_id: "" }))}
                      className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                      ✕ Quitar todas las vinculaciones
                    </button>
                  )}
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none"
                  placeholder="Notas adicionales..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all">
                  {saving ? "Guardando..." : (editingFac ? "Guardar cambios" : "Crear factura")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL PAGO RÁPIDO (total) ══ */}
      {showPagoModal && pagoFac && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-white font-heading font-bold text-lg">Marcar como pagada</h2>
                <p className="text-slate-400 text-sm mt-0.5">Factura {pagoFac.numero} — {pagoFac.razon_social}</p>
              </div>
              <button onClick={() => setShowPagoModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                <p className="text-emerald-300 font-heading font-bold text-xl">{formatMonto(pagoFac.monto, pagoFac.moneda)}</p>
                {pagoFac.monto_pagado > 0 && (
                  <p className="text-slate-400 text-xs mt-1">Ya abonado: {formatMonto(pagoFac.monto_pagado, pagoFac.moneda)}</p>
                )}
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Fecha de pago *</label>
                <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPagoModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handlePagar}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL PAGO PARCIAL ══ */}
      {showPagoParcialModal && pagoParcialFac && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-white font-heading font-bold text-lg">Pago parcial</h2>
                <p className="text-slate-400 text-sm mt-0.5">Factura {pagoParcialFac.numero} — {pagoParcialFac.razon_social}</p>
              </div>
              <button onClick={() => setShowPagoParcialModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Resumen total / abonado / pendiente */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <p className="text-slate-400 text-xs">Total factura</p>
                  <p className="text-white font-heading font-bold">{formatMonto(pagoParcialFac.monto, pagoParcialFac.moneda)}</p>
                </div>
                {pagoParcialFac.monto_pagado > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <p className="text-slate-400 text-xs">Ya abonado</p>
                      <p className="text-blue-300 font-body text-sm font-semibold">{formatMonto(pagoParcialFac.monto_pagado, pagoParcialFac.moneda)}</p>
                    </div>
                    <div className="flex justify-between items-center border-t border-white/10 pt-1 mt-1">
                      <p className="text-slate-400 text-xs">Saldo pendiente</p>
                      <p className="text-amber-300 font-body text-sm font-semibold">{formatMonto(pagoParcialFac.monto - pagoParcialFac.monto_pagado, pagoParcialFac.moneda)}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Historial de pagos anteriores */}
              {(pagoParcialFac.pagos || []).length > 0 && (
                <div>
                  <p className="text-slate-500 text-xs mb-2 uppercase tracking-wide">Historial de pagos</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {(pagoParcialFac.pagos || []).map((p, i) => (
                      <div key={p.id || i} className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-1.5 text-xs">
                        <div>
                          <span className="text-white font-body">Pago {i + 1}</span>
                          {p.fecha && <span className="text-slate-500 ml-2">{p.fecha}</span>}
                        </div>
                        <span className="text-blue-300 font-semibold">{formatMonto(p.monto, pagoParcialFac.moneda)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nuevo pago */}
              <div>
                <label className="text-slate-400 text-xs block mb-1">Monto que abona ahora *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={montoParcial}
                  onChange={e => setMontoParcial(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="0"
                />
                {/* Preview si completa la factura */}
                {(() => {
                  const nuevoMonto = parseFloat(montoParcial) || 0;
                  const acumulado = (pagoParcialFac.monto_pagado || 0) + nuevoMonto;
                  if (nuevoMonto > 0 && acumulado >= pagoParcialFac.monto) {
                    return <p className="text-emerald-400 text-xs mt-1">✓ Con este pago la factura quedará <strong>pagada</strong></p>;
                  }
                  if (nuevoMonto > 0) {
                    return <p className="text-slate-500 text-xs mt-1">Saldo restante: {formatMonto(pagoParcialFac.monto - acumulado, pagoParcialFac.moneda)}</p>;
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Fecha de pago *</label>
                <input type="date" value={fechaPagoParcial} onChange={e => setFechaPagoParcial(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPagoParcialModal(false)} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={handlePagoParcial}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all">
                  Registrar pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
