import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Edit2, Trash2, CheckCircle, Clock, AlertCircle,
  X, Save, DollarSign, Search
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGOS = [
  { value: "todas",     label: "Todas" },
  { value: "arandujar", label: "Arandu&JAR" },
  { value: "arandu",    label: "Arandu" },
  { value: "jar",       label: "JAR" },
];

const LOGO_LABEL = { arandujar: "Arandu&JAR", arandu: "Arandu", jar: "JAR" };

const fmtNum = (n, moneda) => {
  if (n == null || isNaN(n)) return "-";
  if (moneda === "USD") return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "₲" + Math.round(n).toLocaleString("es-PY");
};

const emptyForm = {
  proveedor_id: "",
  proveedor_nombre: "",
  concepto: "",
  monto: "",
  moneda: "PYG",
  tipo_cambio: "",
  monto_gs: "",          // equivalente en guaraníes (auto-calculado o manual)
  cuenta_pago: "guaranies", // "guaranies" | "dolares" (solo aplica si moneda=USD)
  fecha_vencimiento: new Date().toISOString().slice(0, 10),
  fecha_pago: "",
  notas: "",
  logo_tipo: "arandujar",
};

export default function PagosProveedoresPage() {
  const { token, hasPermission } = useContext(AuthContext);
  const [pagos, setPagos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logoFilter, setLogoFilter] = useState("todas");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [showPagarModal, setShowPagarModal] = useState(null);
  const [fechaPagoInput, setFechaPagoInput] = useState(new Date().toISOString().slice(0, 10));

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchPagos = async () => {
    const q = new URLSearchParams();
    if (logoFilter !== "todas") q.set("logo_tipo", logoFilter);
    if (estadoFilter) q.set("estado", estadoFilter);
    const res = await fetch(`${API}/admin/pagos-proveedores?${q}`, { headers });
    if (res.ok) setPagos(await res.json());
  };

  const fetchProveedores = async () => {
    const res = await fetch(`${API}/admin/proveedores`, { headers });
    if (res.ok) setProveedores(await res.json());
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchPagos(), fetchProveedores()]);
      setLoading(false);
    };
    init();
  }, [logoFilter, estadoFilter]); // eslint-disable-line

  // ── Filtered pagos ───────────────────────────────────────────────────────
  const pagosFiltrados = React.useMemo(() => {
    if (!searchTerm.trim()) return pagos;
    const q = searchTerm.toLowerCase();
    return pagos.filter(p =>
      (p.proveedor_nombre || "").toLowerCase().includes(q) ||
      (p.concepto || "").toLowerCase().includes(q)
    );
  }, [pagos, searchTerm]);

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary = React.useMemo(() => {
    let totalPYG = 0, totalUSD = 0, pagadoPYG = 0, pagadoUSD = 0, vencidos = 0;
    pagos.forEach(p => {
      if (p.moneda === "USD") {
        totalUSD += p.monto;
        if (p.estado === "pagado") pagadoUSD += p.monto;
      } else {
        totalPYG += p.monto;
        if (p.estado === "pagado") pagadoPYG += p.monto;
      }
      if (p.estado === "vencido") vencidos++;
    });
    return { totalPYG, totalUSD, pagadoPYG, pagadoUSD,
      pendientePYG: totalPYG - pagadoPYG, pendienteUSD: totalUSD - pagadoUSD, vencidos };
  }, [pagos]);

  // ── Form ─────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setFormData({ ...emptyForm, logo_tipo: logoFilter !== "todas" ? logoFilter : "arandujar" });
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setFormData({
      proveedor_id: p.proveedor_id,
      proveedor_nombre: p.proveedor_nombre,
      concepto: p.concepto,
      monto: p.monto,
      moneda: p.moneda,
      tipo_cambio: p.tipo_cambio || "",
      monto_gs: p.monto_gs
        ? p.monto_gs
        : (p.moneda === "USD" && p.tipo_cambio ? Math.round(p.monto * p.tipo_cambio) : ""),
      cuenta_pago: p.cuenta_pago || "guaranies",
      fecha_vencimiento: p.fecha_vencimiento,
      fecha_pago: p.fecha_pago || "",
      notas: p.notas || "",
      logo_tipo: p.logo_tipo || "arandujar",
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.proveedor_id || !formData.concepto || !formData.monto) {
      toast.error("Completá los campos obligatorios"); return;
    }
    const payload = {
      ...formData,
      monto: parseFloat(formData.monto) || 0,
      tipo_cambio: formData.tipo_cambio ? parseFloat(formData.tipo_cambio) : null,
      monto_gs: formData.monto_gs ? parseFloat(formData.monto_gs) : null,
      cuenta_pago: formData.moneda === "USD" ? formData.cuenta_pago : "guaranies",
      fecha_pago: formData.fecha_pago || null,
      notas: formData.notas || null,
    };
    const url = editingId ? `${API}/admin/pagos-proveedores/${editingId}` : `${API}/admin/pagos-proveedores`;
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(editingId ? "Pago actualizado" : "Pago registrado");
      setShowForm(false);
      fetchPagos();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al guardar");
    }
  };

  const handleMarcarPagado = async () => {
    const res = await fetch(
      `${API}/admin/pagos-proveedores/${showPagarModal.id}/marcar-pagado?fecha_pago=${fechaPagoInput}`,
      { method: "PATCH", headers }
    );
    if (res.ok) { toast.success("Marcado como pagado"); setShowPagarModal(null); fetchPagos(); }
    else toast.error("Error al marcar pago");
  };

  const handleDesmarcar = async (p) => {
    if (!window.confirm("¿Desmarcar este pago?")) return;
    const res = await fetch(`${API}/admin/pagos-proveedores/${p.id}/desmarcar-pagado`, { method: "PATCH", headers });
    if (res.ok) { toast.success("Pago desmarcado"); fetchPagos(); }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`¿Eliminar el pago "${p.concepto}"?`)) return;
    const res = await fetch(`${API}/admin/pagos-proveedores/${p.id}`, { method: "DELETE", headers });
    if (res.ok) { toast.success("Eliminado"); fetchPagos(); }
  };

  const EstadoBadge = ({ estado }) => {
    if (estado === "pagado") return <span className="flex items-center gap-1 text-green-400 text-xs font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Pagado</span>;
    if (estado === "vencido") return <span className="flex items-center gap-1 text-red-400 text-xs font-semibold"><AlertCircle className="w-3.5 h-3.5" /> Vencido</span>;
    return <span className="flex items-center gap-1 text-yellow-400 text-xs font-semibold"><Clock className="w-3.5 h-3.5" /> Pendiente</span>;
  };

  if (loading) return <div className="min-h-screen bg-arandu-dark flex items-center justify-center"><div className="text-arandu-blue-light animate-pulse font-heading text-xl">Cargando...</div></div>;

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-slate-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="font-heading text-2xl text-white flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-yellow-400" /> Pagos a Proveedores
            </h1>
            <p className="text-slate-400 text-sm font-body">Cuentas a pagar y pagos registrados</p>
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm">
          <Plus className="w-4 h-4" /> Nuevo pago
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-slate-500 text-xs font-body">Empresa:</span>
            {LOGOS.map(l => (
              <button key={l.value} onClick={() => setLogoFilter(l.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${logoFilter === l.value ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center ml-auto">
            <span className="text-slate-500 text-xs font-body">Estado:</span>
            {[["", "Todos"], ["pendiente", "Pendiente"], ["vencido", "Vencido"], ["pagado", "Pagado"]].map(([v, l]) => (
              <button key={v} onClick={() => setEstadoFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${estadoFilter === v ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-slate-400 text-xs font-body mb-1">Total registrado</p>
            {summary.totalPYG > 0 && <p className="font-heading text-lg text-white">{fmtNum(summary.totalPYG, "PYG")}</p>}
            {summary.totalUSD > 0 && <p className="font-heading text-lg text-white">{fmtNum(summary.totalUSD, "USD")}</p>}
            {summary.totalPYG === 0 && summary.totalUSD === 0 && <p className="text-slate-500 text-sm">Sin pagos</p>}
            {summary.vencidos > 0 && <p className="text-red-400 text-xs mt-1 font-body">{summary.vencidos} vencido{summary.vencidos !== 1 ? "s" : ""}</p>}
          </div>
          <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
            <p className="text-red-400 text-xs font-body mb-1">Pendiente / Vencido</p>
            {summary.pendientePYG > 0 && <p className="font-heading text-lg text-red-300">{fmtNum(summary.pendientePYG, "PYG")}</p>}
            {summary.pendienteUSD > 0 && <p className="font-heading text-lg text-red-300">{fmtNum(summary.pendienteUSD, "USD")}</p>}
            {summary.pendientePYG === 0 && summary.pendienteUSD === 0 && <p className="text-red-800 text-sm">₲ 0</p>}
          </div>
          <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
            <p className="text-green-400 text-xs font-body mb-1">Pagado</p>
            {summary.pagadoPYG > 0 && <p className="font-heading text-lg text-green-300">{fmtNum(summary.pagadoPYG, "PYG")}</p>}
            {summary.pagadoUSD > 0 && <p className="font-heading text-lg text-green-300">{fmtNum(summary.pagadoUSD, "USD")}</p>}
            {summary.pagadoPYG === 0 && summary.pagadoUSD === 0 && <p className="text-green-800 text-sm">₲ 0</p>}
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por proveedor o concepto..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-white/30 placeholder-slate-500"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabla */}
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          {pagosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-body">
              {searchTerm ? `Sin resultados para "${searchTerm}"` : "No hay pagos registrados"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                  <th className="px-4 py-3 text-left font-body">Proveedor</th>
                  <th className="px-4 py-3 text-left font-body">Concepto</th>
                  <th className="px-4 py-3 text-left font-body">Empresa</th>
                  <th className="px-4 py-3 text-right font-body">Monto</th>
                  <th className="px-4 py-3 text-center font-body">Vcto.</th>
                  <th className="px-4 py-3 text-center font-body">Fecha pago</th>
                  <th className="px-4 py-3 text-center font-body">Estado</th>
                  <th className="px-4 py-3 text-center font-body">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltrados.map((p) => (
                  <tr key={p.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${p.estado === "vencido" ? "bg-red-500/5" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-body text-white">{p.proveedor_nombre}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-body text-slate-300">{p.concepto}</p>
                      {p.notas && <p className="text-slate-500 text-xs">{p.notas}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-body">{LOGO_LABEL[p.logo_tipo] || p.logo_tipo}</span>
                    </td>
                    <td className="px-4 py-3 font-heading text-right text-white">
                      {fmtNum(p.monto, p.moneda)}
                      {p.moneda === "USD" && p.monto_gs && (
                        <p className="text-slate-500 text-xs font-body font-normal">≈ {fmtNum(p.monto_gs, "PYG")}</p>
                      )}
                      {p.moneda === "USD" && (
                        <p className={`text-xs font-body font-normal ${p.cuenta_pago === "dolares" ? "text-amber-500" : "text-slate-600"}`}>
                          {p.cuenta_pago === "dolares" ? "$ cuenta USD" : "₲ cuenta Gs"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400 text-xs">{p.fecha_vencimiento}</td>
                    <td className="px-4 py-3 text-center text-slate-400 text-xs">{p.fecha_pago || "—"}</td>
                    <td className="px-4 py-3 text-center"><EstadoBadge estado={p.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {p.estado === "pagado" ? (
                          <button onClick={() => handleDesmarcar(p)} title="Desmarcar pago" className="text-slate-400 hover:text-yellow-400 transition-colors text-xs font-body"><X className="w-4 h-4" /></button>
                        ) : (
                          <button onClick={() => { setShowPagarModal(p); setFechaPagoInput(new Date().toISOString().slice(0, 10)); }} className="flex items-center gap-1 px-2 py-1 bg-green-600/30 text-green-300 rounded-lg hover:bg-green-600/50 transition-colors text-xs font-body">
                            <CheckCircle className="w-3 h-3" /> Pagar
                          </button>
                        )}
                        <button onClick={() => openEdit(p)} title="Editar" className="text-slate-400 hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(p)} title="Eliminar" className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Form Modal ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-heading text-lg text-white">{editingId ? "Editar pago" : "Registrar pago a proveedor"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Empresa */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Empresa *</label>
                <div className="flex gap-2">
                  {LOGOS.filter(l => l.value !== "todas").map(l => (
                    <button key={l.value} type="button"
                      onClick={() => setFormData(f => ({ ...f, logo_tipo: l.value, proveedor_id: "", proveedor_nombre: "" }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${formData.logo_tipo === l.value ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Proveedor — filtrado por empresa seleccionada */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Proveedor *</label>
                <select required value={formData.proveedor_id}
                  onChange={e => {
                    const prov = proveedores.find(p => p.id === e.target.value);
                    setFormData(f => ({ ...f, proveedor_id: e.target.value, proveedor_nombre: prov?.nombre || "" }));
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue">
                  <option value="">Seleccioná un proveedor...</option>
                  {proveedores
                    .filter(p => !formData.logo_tipo || p.logo_tipo === formData.logo_tipo)
                    .map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {proveedores.filter(p => p.logo_tipo === formData.logo_tipo).length === 0 && (
                  <p className="text-slate-500 text-xs mt-1">No hay proveedores registrados para esta empresa.</p>
                )}
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Concepto *</label>
                <input required type="text" value={formData.concepto}
                  onChange={e => setFormData(f => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Factura #123 - Servicios de hosting"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
              </div>

              {/* Monto y moneda */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">
                    Monto * {formData.moneda === "USD" ? "(en USD)" : ""}
                  </label>
                  <input required type="number" min="0" step="any" value={formData.monto}
                    onChange={e => {
                      const val = e.target.value;
                      if (formData.moneda === "USD" && formData.tipo_cambio) {
                        const gs = Math.round(parseFloat(val || 0) * parseFloat(formData.tipo_cambio));
                        setFormData(f => ({ ...f, monto: val, monto_gs: gs || "" }));
                      } else {
                        setFormData(f => ({ ...f, monto: val }));
                      }
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Moneda</label>
                  <select value={formData.moneda}
                    onChange={e => setFormData(f => ({ ...f, moneda: e.target.value, monto_gs: "", tipo_cambio: "", cuenta_pago: "guaranies" }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue">
                    <option value="PYG">₲ Guaraníes</option>
                    <option value="USD">$ Dólares</option>
                  </select>
                </div>
              </div>

              {/* Panel USD: tipo de cambio, equivalente en Gs, cuenta */}
              {formData.moneda === "USD" && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
                  <p className="text-amber-400 text-xs font-semibold font-body">Detalle en USD</p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Tipo de cambio */}
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-body">Tipo de cambio</label>
                      <input type="number" min="0" step="any" value={formData.tipo_cambio}
                        onChange={e => {
                          const tc = e.target.value;
                          const gs = formData.monto
                            ? Math.round(parseFloat(formData.monto || 0) * parseFloat(tc || 0))
                            : "";
                          setFormData(f => ({ ...f, tipo_cambio: tc, monto_gs: gs }));
                        }}
                        placeholder="Ej: 7800"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-amber-500" />
                    </div>
                    {/* Equivalente en Gs */}
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-body">Equivalente en ₲</label>
                      <input type="number" min="0" step="1" value={formData.monto_gs}
                        onChange={e => {
                          const gs = e.target.value;
                          const tc = formData.monto && parseFloat(formData.monto) > 0
                            ? Math.round(parseFloat(gs || 0) / parseFloat(formData.monto))
                            : formData.tipo_cambio;
                          setFormData(f => ({ ...f, monto_gs: gs, tipo_cambio: tc || "" }));
                        }}
                        placeholder="Auto-calculado"
                        className="w-full bg-white/5 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-200 text-sm font-body focus:outline-none focus:border-amber-500" />
                    </div>
                  </div>

                  {/* Selector de cuenta */}
                  <div>
                    <label className="block text-slate-400 text-xs mb-1.5 font-body">¿Con qué cuenta se paga?</label>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => setFormData(f => ({ ...f, cuenta_pago: "guaranies" }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all font-body ${
                          formData.cuenta_pago === "guaranies"
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-white/10 text-slate-400 hover:text-white bg-white/5"
                        }`}>
                        ₲ Cuenta guaraníes
                      </button>
                      <button type="button"
                        onClick={() => setFormData(f => ({ ...f, cuenta_pago: "dolares" }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all font-body ${
                          formData.cuenta_pago === "dolares"
                            ? "bg-amber-600 border-amber-600 text-white"
                            : "border-white/10 text-slate-400 hover:text-white bg-white/5"
                        }`}>
                        $ Cuenta dólares
                      </button>
                    </div>
                    <p className="text-slate-500 text-xs mt-1.5 font-body">
                      {formData.cuenta_pago === "dolares"
                        ? "⚠ Descuenta de tu saldo USD (no afecta el saldo en guaraníes)"
                        : "Se convierte a guaraníes al tipo de cambio indicado"}
                    </p>
                  </div>
                </div>
              )}

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Fecha vencimiento *</label>
                  <input required type="date" value={formData.fecha_vencimiento}
                    onChange={e => setFormData(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Fecha pago (si ya pagaste)</label>
                  <input type="date" value={formData.fecha_pago}
                    onChange={e => setFormData(f => ({ ...f, fecha_pago: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
                </div>
              </div>

              {/* Notas */}
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

      {/* ── Marcar Pagado Modal ───────────────────────────────────────────── */}
      {showPagarModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-heading text-lg text-white">Registrar pago</h2>
              <button onClick={() => setShowPagarModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-white/5 rounded-lg p-3 text-sm font-body space-y-1">
                <p className="text-slate-400">Proveedor: <span className="text-white">{showPagarModal.proveedor_nombre}</span></p>
                <p className="text-slate-400">Concepto: <span className="text-white">{showPagarModal.concepto}</span></p>
                <p className="text-slate-400">Monto: <span className="text-white font-heading">{fmtNum(showPagarModal.monto, showPagarModal.moneda)}</span></p>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Fecha de pago</label>
                <input type="date" value={fechaPagoInput} onChange={e => setFechaPagoInput(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue" />
              </div>
              <div className="flex gap-3">
                <button onClick={handleMarcarPagado} className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-body text-sm">
                  <CheckCircle className="w-4 h-4" /> Confirmar pago
                </button>
                <button onClick={() => setShowPagarModal(null)} className="px-4 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
