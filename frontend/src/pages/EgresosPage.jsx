import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, TrendingDown, ShoppingCart, Calendar, Users, Clock,
  Plus, Search, Edit, Trash2, Save, X, Check, ChevronDown,
  AlertTriangle, FileText, DollarSign, Building2, Filter,
  CreditCard, Receipt, ExternalLink, Banknote, Package, ToggleLeft, ToggleRight
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n, moneda = "PYG") => {
  if (n == null) return "−";
  if (moneda === "USD") return `USD ${Number(n).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
};

const hoy = () => new Date().toISOString().slice(0, 10);
const mesActual = () => new Date().toISOString().slice(0, 7);

// ─── Estado inicial del form de compra ────────────────────────────────────────
const emptyCompra = () => ({
  logo_tipo: "arandujar",
  proveedor_id: "",
  proveedor_nombre: "",
  fecha: hoy(),
  tipo_pago: "contado",
  tiene_factura: false,
  numero_factura: "",
  monto_total: "",
  moneda: "PYG",
  tipo_cambio: "",
  monto_iva: "",
  tasa_iva: 10,
  items: [],
  afecta_stock: true,
  notas: "",
  fecha_vencimiento: "",
});

const emptyItem = () => ({
  descripcion: "",
  cantidad: 1,
  precio_unitario: "",
  subtotal: 0,
  producto_id: "",
});

// ─── Colores de estado ────────────────────────────────────────────────────────
const ESTADO_STYLES = {
  pagado:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  parcial:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  pendiente:"bg-blue-500/15 text-blue-400 border-blue-500/30",
  vencido:  "bg-red-500/15 text-red-400 border-red-500/30",
};

const ESTADO_LABELS = {
  pagado: "Pagado", parcial: "Parcial", pendiente: "Pendiente", vencido: "Vencido",
};

// ─────────────────────────────────────────────────────────────────────────────
const EgresosPage = () => {
  const { token, user, hasPermission } = useContext(AuthContext);
  const isAdmin = user?.role === "admin";

  // ── Tab activo ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("compras");

  // ── Logos accesibles ────────────────────────────────────────────────────────
  const [empresasPropias, setEmpresasPropias] = useState([]);

  // ── Compras state ───────────────────────────────────────────────────────────
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [searchCompras, setSearchCompras] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [showCompraForm, setShowCompraForm] = useState(false);
  const [editingCompra, setEditingCompra] = useState(null);
  const [compraForm, setCompraForm] = useState(emptyCompra());
  const [showPagoModal, setShowPagoModal] = useState(null); // compra object
  const [pagoForm, setPagoForm] = useState({ monto_pagado: "", fecha_pago: hoy(), notas: "" });
  const [productos, setProductos] = useState([]);
  const [showProductoBrowser, setShowProductoBrowser] = useState(false);
  const [productoSearch, setProductoSearch] = useState("");

  // ── Costos Fijos state ──────────────────────────────────────────────────────
  const [costos, setCostos] = useState([]);
  const [loadingCostos, setLoadingCostos] = useState(false);

  // ── Sueldos state ───────────────────────────────────────────────────────────
  const [empleados, setEmpleados] = useState([]);
  const [loadingEmpleados, setLoadingEmpleados] = useState(false);

  // ── Pagos pendientes state ──────────────────────────────────────────────────
  const [pagosPendientes, setPagosPendientes] = useState([]);
  const [loadingPagos, setLoadingPagos] = useState(false);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEmpresasPropias();
    fetchProveedores();
    fetchProductos();
  }, []);

  useEffect(() => {
    if (tab === "compras") fetchCompras();
    if (tab === "costos") fetchCostos();
    if (tab === "sueldos") fetchEmpleados();
    if (tab === "pagos") fetchPagosPendientes();
  }, [tab]);

  // ── Fetches ─────────────────────────────────────────────────────────────────
  const fetchEmpresasPropias = async () => {
    try {
      const res = await fetch(`${API}/admin/empresas-propias`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEmpresasPropias(await res.json());
    } catch (e) {}
  };

  const fetchProveedores = async (logoTipo = null) => {
    try {
      const params = new URLSearchParams({ activo: "true" });
      if (logoTipo && logoTipo !== "todas") params.set("logo_tipo", logoTipo);
      const res = await fetch(`${API}/admin/proveedores?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setProveedores(await res.json());
    } catch (e) {}
  };

  const fetchProductos = async () => {
    try {
      const res = await fetch(`${API}/admin/productos?limit=500`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setProductos(d.productos || d || []); }
    } catch (e) {}
  };

  const fetchCompras = async () => {
    setLoadingCompras(true);
    try {
      const params = new URLSearchParams();
      if (searchCompras) params.set("search", searchCompras);
      if (filtroEstado) params.set("estado_pago", filtroEstado);
      if (filtroMes) params.set("mes", filtroMes);
      const res = await fetch(`${API}/admin/compras?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCompras(await res.json());
    } catch (e) { toast.error("Error al cargar compras"); }
    finally { setLoadingCompras(false); }
  };

  const fetchCostos = async () => {
    setLoadingCostos(true);
    try {
      const res = await fetch(`${API}/admin/costos-fijos`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCostos(await res.json());
    } catch (e) {}
    finally { setLoadingCostos(false); }
  };

  const fetchEmpleados = async () => {
    setLoadingEmpleados(true);
    try {
      const res = await fetch(`${API}/admin/empleados`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEmpleados(await res.json());
    } catch (e) {}
    finally { setLoadingEmpleados(false); }
  };

  const fetchPagosPendientes = async () => {
    setLoadingPagos(true);
    try {
      const [comprasRes, costosRes] = await Promise.all([
        fetch(`${API}/admin/compras?estado_pago=pendiente`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/costos-fijos/vencimientos?periodo=${mesActual()}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const pendCompras = comprasRes.ok ? await comprasRes.json() : [];
      const pendCostos = costosRes.ok ? await costosRes.json() : [];
      const vencidos = await fetch(`${API}/admin/compras?estado_pago=vencido`, { headers: { Authorization: `Bearer ${token}` } });
      const vencCompras = vencidos.ok ? await vencidos.json() : [];
      setPagosPendientes([
        ...pendCompras.map(c => ({ ...c, _tipo: "compra" })),
        ...vencCompras.map(c => ({ ...c, _tipo: "compra" })),
        ...pendCostos.filter(c => c.estado !== "pagado").map(c => ({ ...c, _tipo: "costo" })),
      ]);
    } catch (e) {}
    finally { setLoadingPagos(false); }
  };

  useEffect(() => {
    if (tab === "compras") fetchCompras();
  }, [searchCompras, filtroEstado, filtroMes]);

  // ── Logos accesibles para selector ─────────────────────────────────────────
  const logosAccesibles = isAdmin
    ? empresasPropias
    : empresasPropias.filter(ep => (user?.logos_asignados || []).map(String).includes(String(ep.id)));

  // ── Compras CRUD ────────────────────────────────────────────────────────────
  const openNewCompra = () => {
    const defaultLogo = logosAccesibles.length === 1 ? logosAccesibles[0].slug : "arandujar";
    setCompraForm({ ...emptyCompra(), logo_tipo: defaultLogo });
    setEditingCompra(null);
    fetchProveedores(defaultLogo);
    setShowCompraForm(true);
  };

  const openEditCompra = (c) => {
    setCompraForm({
      logo_tipo: c.logo_tipo || "arandujar",
      proveedor_id: c.proveedor_id || "",
      proveedor_nombre: c.proveedor_nombre || "",
      fecha: c.fecha || hoy(),
      tipo_pago: c.tipo_pago || "contado",
      tiene_factura: c.tiene_factura || false,
      numero_factura: c.numero_factura || "",
      monto_total: c.monto_total ?? "",
      moneda: c.moneda || "PYG",
      tipo_cambio: c.tipo_cambio || "",
      monto_iva: c.monto_iva ?? "",
      tasa_iva: c.tasa_iva ?? 10,
      items: c.items || [],
      afecta_stock: c.afecta_stock !== false, // default true
      notas: c.notas || "",
      fecha_vencimiento: c.fecha_vencimiento || "",
    });
    setEditingCompra(c);
    fetchProveedores(c.logo_tipo || "arandujar");
    setShowCompraForm(true);
  };

  const handleSaveCompra = async (e) => {
    e.preventDefault();
    const tieneItems = (compraForm.items || []).length > 0;
    const montoFinal = tieneItems
      ? compraForm.items.reduce((s, it) => s + (parseFloat(it.subtotal) || 0), 0)
      : parseFloat(compraForm.monto_total) || 0;
    if (!compraForm.proveedor_nombre) {
      toast.error("Completá el proveedor");
      return;
    }
    if (montoFinal <= 0) {
      toast.error("El monto total debe ser mayor a 0");
      return;
    }
    const payload = {
      ...compraForm,
      items: (compraForm.items || []).map(it => ({
        ...it,
        cantidad: Number(it.cantidad) || 1,
        precio_unitario: parseFloat(it.precio_unitario) || 0,
        subtotal: parseFloat(it.subtotal) || 0,
      })),
      monto_total: montoFinal,
      monto_iva: compraForm.monto_iva !== "" ? Number(compraForm.monto_iva) : null,
      tipo_cambio: compraForm.tipo_cambio !== "" ? Number(compraForm.tipo_cambio) : null,
    };
    try {
      const url = editingCompra ? `${API}/admin/compras/${editingCompra.id}` : `${API}/admin/compras`;
      const res = await fetch(url, {
        method: editingCompra ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(editingCompra ? "Compra actualizada" : "Compra registrada");
        setShowCompraForm(false);
        fetchCompras();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al guardar");
      }
    } catch (e) { toast.error("Error de conexión"); }
  };

  const handleDeleteCompra = async (id) => {
    if (!window.confirm("¿Eliminar esta compra?")) return;
    try {
      const res = await fetch(`${API}/admin/compras/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { toast.success("Compra eliminada"); fetchCompras(); }
    } catch (e) { toast.error("Error"); }
  };

  const handlePagoCompra = async (e) => {
    e.preventDefault();
    if (!pagoForm.monto_pagado || !pagoForm.fecha_pago) { toast.error("Completá monto y fecha"); return; }
    try {
      const res = await fetch(`${API}/admin/compras/${showPagoModal.id}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...pagoForm, monto_pagado: Number(pagoForm.monto_pagado) }),
      });
      if (res.ok) {
        toast.success("Pago registrado");
        setShowPagoModal(null);
        setPagoForm({ monto_pagado: "", fecha_pago: hoy(), notas: "" });
        fetchCompras();
      }
    } catch (e) { toast.error("Error"); }
  };

  // ── Totales resumen ─────────────────────────────────────────────────────────
  const totalComprasMes = compras
    .filter(c => c.fecha?.startsWith(mesActual()))
    .reduce((s, c) => s + (c.monto_total || 0), 0);
  const totalDeuda = compras.reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const totalSueldos = empleados
    .filter(e => e.activo)
    .reduce((s, e) => s + (e.sueldo_base || 0), 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-arandu-dark p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link to="/admin" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-3 text-sm w-fit">
            <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-400" />
            <div>
              <h1 className="font-heading text-3xl font-bold text-white">Egresos</h1>
              <p className="text-slate-400 text-sm">Compras, costos fijos, sueldos y pagos pendientes</p>
            </div>
          </div>
        </div>

        {/* Resumen cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Compras este mes", value: fmt(totalComprasMes), icon: ShoppingCart, color: "text-orange-400" },
            { label: "Deuda proveedores", value: fmt(totalDeuda), icon: CreditCard, color: "text-red-400" },
            { label: "Sueldos mensuales", value: fmt(totalSueldos), icon: Users, color: "text-blue-400" },
            { label: "Pagos pendientes", value: pagosPendientes.length || "−", icon: Clock, color: "text-amber-400", isCount: true },
          ].map(({ label, value, icon: Icon, color, isCount }) => (
            <div key={label} className="bg-arandu-dark-light border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-slate-500 text-xs">{label}</span>
              </div>
              <p className={`font-heading font-bold text-lg ${isCount ? color : "text-white"}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-arandu-dark-light border border-white/5 rounded-xl p-1 mb-6 flex-wrap">
          {[
            { id: "compras", label: "Compras", icon: ShoppingCart, color: "bg-orange-500" },
            { id: "costos", label: "Costos Fijos", icon: Calendar, color: "bg-blue-600" },
            { id: "sueldos", label: "Sueldos", icon: Users, color: "bg-purple-600" },
            { id: "pagos", label: "Pagos Pendientes", icon: AlertTriangle, color: "bg-red-600" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? `${t.color} text-white shadow` : "text-slate-400 hover:text-white"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.id === "pagos" && pagosPendientes.length > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {pagosPendientes.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════ TAB: COMPRAS ═══════════════════════════════════════ */}
        {tab === "compras" && (
          <div>
            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={searchCompras}
                  onChange={e => setSearchCompras(e.target.value)}
                  placeholder="Buscar proveedor..."
                  className="w-full bg-arandu-dark-light border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50 placeholder-slate-500"
                />
              </div>
              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                className="bg-arandu-dark-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="">Todos los estados</option>
                <option value="pendiente">Pendiente</option>
                <option value="parcial">Parcial</option>
                <option value="vencido">Vencido</option>
                <option value="pagado">Pagado</option>
              </select>
              <input
                type="month"
                value={filtroMes}
                onChange={e => setFiltroMes(e.target.value)}
                className="bg-arandu-dark-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              />
              {hasPermission("compras.crear") && (
                <Button onClick={openNewCompra} className="bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap">
                  <Plus className="w-4 h-4 mr-2" /> Nueva Compra
                </Button>
              )}
            </div>

            {/* Lista */}
            {loadingCompras ? (
              <div className="text-center py-12 text-orange-400 animate-pulse">Cargando...</div>
            ) : compras.length === 0 ? (
              <div className="text-center py-16 bg-arandu-dark-light border border-white/5 rounded-xl">
                <ShoppingCart className="w-14 h-14 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 mb-4">No hay compras registradas</p>
                {hasPermission("compras.crear") && (
                  <Button onClick={openNewCompra} className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Plus className="w-4 h-4 mr-2" /> Registrar primera compra
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {compras.map(c => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-arandu-dark-light border border-white/5 rounded-xl p-4 hover:border-orange-500/20 transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                          <ShoppingCart className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-white font-medium">{c.proveedor_nombre}</h3>
                            {c.tiene_factura && (
                              <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 flex items-center gap-1">
                                <Receipt className="w-3 h-3" /> {c.numero_factura || "c/factura"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-slate-500 text-xs mt-0.5">
                            <span>{c.fecha}</span>
                            <span className={`capitalize px-2 py-0.5 rounded-full border text-xs ${ESTADO_STYLES[c.tipo_pago === "contado" ? "pagado" : "pendiente"]}`}>
                              {c.tipo_pago}
                            </span>
                            {c.notas && <span className="truncate max-w-[200px]">{c.notas}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-white font-bold">{fmt(c.monto_total, c.moneda)}</p>
                          {c.tipo_pago === "credito" && (
                            <p className={`text-xs ${c.saldo_pendiente > 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {c.saldo_pendiente > 0 ? `Debe ${fmt(c.saldo_pendiente)}` : "Saldado"}
                            </p>
                          )}
                          {c.monto_iva > 0 && (
                            <p className="text-slate-500 text-xs">IVA: {fmt(c.monto_iva)}</p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs border ${ESTADO_STYLES[c.estado_pago]}`}>
                          {ESTADO_LABELS[c.estado_pago]}
                        </span>
                        <div className="flex gap-1">
                          {c.tipo_pago === "credito" && c.estado_pago !== "pagado" && (
                            <Button
                              onClick={() => { setShowPagoModal(c); setPagoForm({ monto_pagado: c.saldo_pendiente || "", fecha_pago: hoy(), notas: "" }); }}
                              variant="ghost"
                              className="text-emerald-400 hover:bg-emerald-500/10 text-xs px-2"
                            >
                              <Banknote className="w-4 h-4 mr-1" /> Pagar
                            </Button>
                          )}
                          {hasPermission("compras.editar") && (
                            <Button onClick={() => openEditCompra(c)} variant="ghost" className="text-yellow-400 hover:bg-yellow-500/10">
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasPermission("compras.eliminar") && (
                            <Button onClick={() => handleDeleteCompra(c.id)} variant="ghost" className="text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ TAB: COSTOS FIJOS ══════════════════════════════════ */}
        {tab === "costos" && (
          <div>
            <div className="flex justify-between items-center mb-5">
              <p className="text-slate-400 text-sm">{costos.length} costos fijos registrados</p>
              <Link to="/admin/costos-fijos">
                <Button variant="outline" className="border-white/10 text-slate-300 gap-2">
                  <ExternalLink className="w-4 h-4" /> Gestionar completo
                </Button>
              </Link>
            </div>
            {loadingCostos ? (
              <div className="text-center py-12 text-blue-400 animate-pulse">Cargando...</div>
            ) : (
              <div className="space-y-2">
                {costos.map(c => (
                  <div key={c.id} className="bg-arandu-dark-light border border-white/5 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-medium">{c.nombre}</h3>
                      <p className="text-slate-500 text-xs capitalize">{c.frecuencia} · vence día {c.dia_vencimiento}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">{fmt(c.monto, c.moneda)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${c.activo ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-white/10 text-slate-500"}`}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                ))}
                {costos.length === 0 && (
                  <div className="text-center py-12 text-slate-500">No hay costos fijos. <Link to="/admin/costos-fijos" className="text-arandu-blue hover:underline">Ir a Costos Fijos</Link></div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ TAB: SUELDOS ════════════════════════════════════════ */}
        {tab === "sueldos" && (
          <div>
            <div className="flex justify-between items-center mb-5">
              <p className="text-slate-400 text-sm">{empleados.filter(e => e.activo).length} empleados activos</p>
              <Link to="/admin/empleados">
                <Button variant="outline" className="border-white/10 text-slate-300 gap-2">
                  <ExternalLink className="w-4 h-4" /> Gestionar empleados
                </Button>
              </Link>
            </div>
            {loadingEmpleados ? (
              <div className="text-center py-12 text-purple-400 animate-pulse">Cargando...</div>
            ) : (
              <div className="space-y-2">
                {empleados.map(e => (
                  <div key={e.id} className={`bg-arandu-dark-light border rounded-xl p-4 flex items-center justify-between ${e.activo ? "border-white/5" : "border-white/5 opacity-50"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-500/15 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{e.nombre} {e.apellido}</h3>
                        <p className="text-slate-500 text-xs">{e.cargo || "Sin cargo"} · {e.aplica_ips ? "Con IPS" : "Sin IPS"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">{fmt(e.sueldo_base, e.moneda)}</p>
                      <span className={`text-xs ${e.activo ? "text-emerald-400" : "text-slate-500"}`}>
                        {e.activo ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                ))}
                {empleados.length === 0 && (
                  <div className="text-center py-12 text-slate-500">No hay empleados. <Link to="/admin/empleados" className="text-arandu-blue hover:underline">Ir a Empleados</Link></div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ TAB: PAGOS PENDIENTES ══════════════════════════════ */}
        {tab === "pagos" && (
          <div>
            <div className="flex justify-between items-center mb-5">
              <p className="text-slate-400 text-sm">{pagosPendientes.length} pagos pendientes este mes</p>
            </div>
            {loadingPagos ? (
              <div className="text-center py-12 text-red-400 animate-pulse">Cargando...</div>
            ) : pagosPendientes.length === 0 ? (
              <div className="text-center py-12 bg-arandu-dark-light border border-white/5 rounded-xl">
                <Check className="w-14 h-14 text-emerald-600 mx-auto mb-3" />
                <p className="text-slate-400">Todo al día, sin pagos pendientes</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pagosPendientes.map((item, i) => (
                  <div key={i} className={`bg-arandu-dark-light border rounded-xl p-4 flex items-center justify-between ${item.estado_pago === "vencido" || item.estado === "vencido" ? "border-red-500/30" : "border-white/5"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item._tipo === "compra" ? "bg-orange-500/15" : "bg-blue-500/15"}`}>
                        {item._tipo === "compra" ? <ShoppingCart className="w-5 h-5 text-orange-400" /> : <Calendar className="w-5 h-5 text-blue-400" />}
                      </div>
                      <div>
                        <h3 className="text-white font-medium">
                          {item._tipo === "compra" ? item.proveedor_nombre : item.nombre}
                        </h3>
                        <p className="text-slate-500 text-xs">
                          {item._tipo === "compra" ? `Compra · ${item.fecha}` : `Costo fijo · vence día ${item.dia_vencimiento}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-white font-bold">
                          {item._tipo === "compra" ? fmt(item.saldo_pendiente, item.moneda) : fmt(item.monto, item.moneda)}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${ESTADO_STYLES[item.estado_pago || (item.estado === "vencido" ? "vencido" : "pendiente")]}`}>
                          {ESTADO_LABELS[item.estado_pago] || item.estado}
                        </span>
                      </div>
                      {item._tipo === "compra" && (
                        <Button
                          onClick={() => { setShowPagoModal(item); setTab("compras"); fetchCompras(); setTimeout(() => setShowPagoModal(item), 100); }}
                          variant="ghost"
                          className="text-emerald-400 hover:bg-emerald-500/10 text-xs px-2"
                        >
                          <Banknote className="w-4 h-4 mr-1" /> Pagar
                        </Button>
                      )}
                      {item._tipo === "costo" && (
                        <Link to="/admin/costos-fijos">
                          <Button variant="ghost" className="text-blue-400 hover:bg-blue-500/10 text-xs px-2">
                            <ExternalLink className="w-4 h-4 mr-1" /> Ver
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ MODAL: Formulario Compra ══════════════════════════════════════════ */}
      <AnimatePresence>
        {showCompraForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto"
            onClick={e => e.target === e.currentTarget && setShowCompraForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-2xl p-6 my-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-heading text-xl font-bold text-white">
                  {editingCompra ? "Editar Compra" : "Nueva Compra"}
                </h2>
                <button onClick={() => setShowCompraForm(false)} className="text-slate-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveCompra} className="space-y-4">
                {/* Empresa interna */}
                {logosAccesibles.length > 1 && (
                  <div>
                    <label className="text-slate-400 text-sm mb-2 block">Empresa</label>
                    <div className="flex gap-2">
                      {logosAccesibles.map(ep => (
                        <button key={ep.slug} type="button"
                          onClick={() => {
                            setCompraForm(p => ({ ...p, logo_tipo: ep.slug, proveedor_id: "", proveedor_nombre: "" }));
                            fetchProveedores(ep.slug);
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${compraForm.logo_tipo === ep.slug ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-white/10 text-slate-400 hover:border-white/20"}`}
                        >
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: ep.color || "#64748b" }} />
                          {ep.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Proveedor */}
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Proveedor *</label>
                    {proveedores.length > 0 ? (
                      <select
                        value={compraForm.proveedor_id}
                        onChange={e => {
                          const prov = proveedores.find(p => p.id === e.target.value);
                          setCompraForm(prev => ({ ...prev, proveedor_id: e.target.value, proveedor_nombre: prov?.nombre || "" }));
                        }}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">Seleccionar o escribir...</option>
                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    ) : null}
                    {(!compraForm.proveedor_id) && (
                      <Input
                        value={compraForm.proveedor_nombre}
                        onChange={e => setCompraForm(p => ({ ...p, proveedor_nombre: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white mt-1"
                        placeholder="Nombre del proveedor"
                      />
                    )}
                  </div>

                  {/* Fecha */}
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Fecha *</label>
                    <Input type="date" value={compraForm.fecha}
                      onChange={e => setCompraForm(p => ({ ...p, fecha: e.target.value }))}
                      className="bg-arandu-dark border-white/10 text-white" />
                  </div>
                </div>

                {/* Moneda */}
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Moneda</label>
                  <div className="flex gap-2">
                    {[{ val: "PYG", label: "₲ Guaraní" }, { val: "USD", label: "$ Dólar" }].map(m => (
                      <button key={m.val} type="button"
                        onClick={() => setCompraForm(p => ({ ...p, moneda: m.val }))}
                        className={`flex-1 py-2 rounded-lg border text-sm transition-all ${compraForm.moneda === m.val ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-white/10 text-slate-400 hover:border-white/20"}`}
                      >{m.label}</button>
                    ))}
                  </div>
                </div>

                {/* ── Items / Conceptos ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-slate-400 text-sm">Ítems de la compra</label>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => setShowProductoBrowser(true)}
                        className="flex items-center gap-1.5 text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-lg px-3 py-1.5 hover:bg-blue-500/25 transition-all"
                      >
                        <Package className="w-3.5 h-3.5" /> Buscar producto
                      </button>
                      <button type="button"
                        onClick={() => setCompraForm(p => ({ ...p, items: [...(p.items || []), emptyItem()] }))}
                        className="flex items-center gap-1.5 text-xs bg-orange-500/15 text-orange-400 border border-orange-500/30 rounded-lg px-3 py-1.5 hover:bg-orange-500/25 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Agregar ítem
                      </button>
                    </div>
                  </div>

                  {(compraForm.items || []).length > 0 ? (
                    <div className="bg-arandu-dark rounded-lg border border-white/5 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="text-left text-slate-500 font-normal px-3 py-2">Descripción</th>
                            <th className="text-center text-slate-500 font-normal px-2 py-2 w-16">Cant.</th>
                            <th className="text-right text-slate-500 font-normal px-2 py-2 w-28">P. Unit.</th>
                            <th className="text-right text-slate-500 font-normal px-2 py-2 w-28">Subtotal</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {compraForm.items.map((item, idx) => (
                            <tr key={idx} className="border-b border-white/5 last:border-0">
                              <td className="px-2 py-1.5">
                                <input
                                  value={item.descripcion}
                                  onChange={e => {
                                    const items = [...compraForm.items];
                                    items[idx] = { ...items[idx], descripcion: e.target.value };
                                    setCompraForm(p => ({ ...p, items }));
                                  }}
                                  className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-orange-500/50"
                                  placeholder="Descripción..."
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  type="number" min="1" step="1"
                                  value={item.cantidad}
                                  onChange={e => {
                                    const items = [...compraForm.items];
                                    const cant = parseFloat(e.target.value) || 1;
                                    const sub = cant * (parseFloat(items[idx].precio_unitario) || 0);
                                    items[idx] = { ...items[idx], cantidad: e.target.value, subtotal: sub };
                                    setCompraForm(p => ({ ...p, items }));
                                  }}
                                  className="w-full bg-transparent border border-white/10 rounded px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-orange-500/50"
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  type="number" min="0" step="any"
                                  value={item.precio_unitario}
                                  onChange={e => {
                                    const items = [...compraForm.items];
                                    const pu = parseFloat(e.target.value) || 0;
                                    const sub = (parseFloat(items[idx].cantidad) || 1) * pu;
                                    items[idx] = { ...items[idx], precio_unitario: e.target.value, subtotal: sub };
                                    setCompraForm(p => ({ ...p, items }));
                                  }}
                                  className="w-full bg-transparent border border-white/10 rounded px-1 py-1 text-white text-xs text-right focus:outline-none focus:border-orange-500/50"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <span className="text-orange-300 font-medium text-xs">
                                  {compraForm.moneda === "USD"
                                    ? `USD ${Number(item.subtotal || 0).toFixed(2)}`
                                    : `₲ ${Math.round(item.subtotal || 0).toLocaleString("es-PY")}`}
                                </span>
                              </td>
                              <td className="px-1 py-1.5">
                                <button type="button"
                                  onClick={() => {
                                    const items = compraForm.items.filter((_, i) => i !== idx);
                                    setCompraForm(p => ({ ...p, items }));
                                  }}
                                  className="text-slate-500 hover:text-red-400 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-white/10">
                            <td colSpan={3} className="px-3 py-2 text-slate-400 text-xs text-right font-medium">TOTAL</td>
                            <td className="px-2 py-2 text-right">
                              <span className="text-white font-bold text-sm">
                                {compraForm.moneda === "USD"
                                  ? `USD ${compraForm.items.reduce((s, it) => s + (parseFloat(it.subtotal) || 0), 0).toFixed(2)}`
                                  : `₲ ${Math.round(compraForm.items.reduce((s, it) => s + (parseFloat(it.subtotal) || 0), 0)).toLocaleString("es-PY")}`}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Monto total *</label>
                      <Input type="number" min="0" step="any" value={compraForm.monto_total}
                        onChange={e => setCompraForm(p => ({ ...p, monto_total: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white" placeholder="0" />
                      <p className="text-slate-600 text-xs mt-1">O agregá ítems individuales con el botón de arriba</p>
                    </div>
                  )}
                </div>

                {/* Afecta stock toggle */}
                <div className="bg-arandu-dark rounded-lg p-3 border border-white/5">
                  <button type="button"
                    onClick={() => setCompraForm(p => ({ ...p, afecta_stock: !p.afecta_stock }))}
                    className="flex items-center gap-3 w-full"
                  >
                    {compraForm.afecta_stock
                      ? <ToggleRight className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                      : <ToggleLeft className="w-6 h-6 text-slate-500 flex-shrink-0" />}
                    <div className="text-left">
                      <p className={`text-sm font-medium ${compraForm.afecta_stock ? "text-emerald-300" : "text-slate-400"}`}>
                        {compraForm.afecta_stock ? "Afecta stock" : "No afecta stock"}
                      </p>
                      <p className="text-slate-500 text-xs">
                        {compraForm.afecta_stock
                          ? "Los ítems con producto vinculado sumarán al inventario"
                          : "Compra de servicio o gasto sin movimiento de inventario"}
                      </p>
                    </div>
                  </button>
                </div>

                {/* IVA */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">IVA incluido (monto)</label>
                    <Input type="number" min="0" step="any" value={compraForm.monto_iva}
                      onChange={e => setCompraForm(p => ({ ...p, monto_iva: e.target.value }))}
                      className="bg-arandu-dark border-white/10 text-white" placeholder="0 (opcional)" />
                  </div>
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Tasa IVA</label>
                    <select value={compraForm.tasa_iva}
                      onChange={e => setCompraForm(p => ({ ...p, tasa_iva: Number(e.target.value) }))}
                      className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                      <option value={10}>10%</option>
                      <option value={5}>5%</option>
                      <option value={0}>Exenta</option>
                    </select>
                  </div>
                </div>

                {/* Tipo de pago */}
                <div>
                  <label className="text-slate-400 text-sm mb-2 block">Tipo de pago</label>
                  <div className="flex gap-3">
                    {["contado", "credito"].map(tipo => (
                      <button key={tipo} type="button"
                        onClick={() => setCompraForm(p => ({ ...p, tipo_pago: tipo }))}
                        className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-all capitalize ${compraForm.tipo_pago === tipo ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-white/10 text-slate-400 hover:border-white/20"}`}
                      >
                        {tipo === "contado" ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                        {tipo}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fecha vencimiento (solo crédito) */}
                {compraForm.tipo_pago === "credito" && (
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Fecha de vencimiento del crédito</label>
                    <Input type="date" value={compraForm.fecha_vencimiento}
                      onChange={e => setCompraForm(p => ({ ...p, fecha_vencimiento: e.target.value }))}
                      className="bg-arandu-dark border-white/10 text-white" />
                  </div>
                )}

                {/* Factura */}
                <div className="bg-arandu-dark rounded-lg p-3 border border-white/5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={compraForm.tiene_factura}
                      onChange={e => setCompraForm(p => ({ ...p, tiene_factura: e.target.checked }))}
                      className="w-4 h-4 accent-emerald-500" />
                    <span className="text-slate-300 text-sm flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-emerald-400" />
                      Tiene factura del proveedor (IVA crédito fiscal)
                    </span>
                  </label>
                  {compraForm.tiene_factura && (
                    <Input value={compraForm.numero_factura}
                      onChange={e => setCompraForm(p => ({ ...p, numero_factura: e.target.value }))}
                      className="bg-arandu-dark border-white/10 text-white mt-2"
                      placeholder="Número de factura" />
                  )}
                </div>

                {/* Notas */}
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Notas</label>
                  <Input value={compraForm.notas}
                    onChange={e => setCompraForm(p => ({ ...p, notas: e.target.value }))}
                    className="bg-arandu-dark border-white/10 text-white" placeholder="Descripción, detalle..." />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCompraForm(false)}
                    className="flex-1 border-white/10 text-slate-400">
                    <X className="w-4 h-4 mr-2" /> Cancelar
                  </Button>
                  <Button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    {editingCompra ? "Actualizar" : "Registrar compra"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MODAL: Buscador de productos ════════════════════════════════════ */}
      <AnimatePresence>
        {showProductoBrowser && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setShowProductoBrowser(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-lg p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-lg font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" /> Buscar producto
                </h3>
                <button onClick={() => setShowProductoBrowser(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={productoSearch}
                  onChange={e => setProductoSearch(e.target.value)}
                  placeholder="Buscar por nombre o código..."
                  autoFocus
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 placeholder-slate-500"
                />
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {productos
                  .filter(p => !productoSearch || p.nombre?.toLowerCase().includes(productoSearch.toLowerCase()) || p.codigo?.toLowerCase().includes(productoSearch.toLowerCase()))
                  .slice(0, 40)
                  .map(prod => (
                    <button key={prod.id} type="button"
                      onClick={() => {
                        const newItem = {
                          descripcion: prod.nombre,
                          cantidad: 1,
                          precio_unitario: prod.precio_costo || prod.precio_venta || "",
                          subtotal: prod.precio_costo || prod.precio_venta || 0,
                          producto_id: prod.id,
                        };
                        setCompraForm(p => ({ ...p, items: [...(p.items || []), newItem] }));
                        setShowProductoBrowser(false);
                        setProductoSearch("");
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-arandu-dark border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all text-left"
                    >
                      <div>
                        <p className="text-white text-sm font-medium">{prod.nombre}</p>
                        <p className="text-slate-500 text-xs">{prod.codigo || "Sin código"} · Stock: {prod.stock ?? "−"}</p>
                      </div>
                      <div className="text-right">
                        {prod.precio_costo ? (
                          <p className="text-orange-300 text-sm font-medium">
                            {prod.moneda === "USD"
                              ? `USD ${Number(prod.precio_costo).toFixed(2)}`
                              : `₲ ${Math.round(prod.precio_costo).toLocaleString("es-PY")}`}
                          </p>
                        ) : (
                          <p className="text-slate-600 text-xs">Sin costo</p>
                        )}
                      </div>
                    </button>
                  ))}
                {productos.filter(p => !productoSearch || p.nombre?.toLowerCase().includes(productoSearch.toLowerCase())).length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">No se encontraron productos</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MODAL: Registrar pago de compra a crédito ════════════════════════ */}
      <AnimatePresence>
        {showPagoModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setShowPagoModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-lg font-bold text-white">Registrar Pago</h3>
                <button onClick={() => setShowPagoModal(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-arandu-dark rounded-lg p-3 mb-4 border border-white/5">
                <p className="text-slate-400 text-sm">{showPagoModal.proveedor_nombre}</p>
                <p className="text-white font-bold">Saldo: {fmt(showPagoModal.saldo_pendiente, showPagoModal.moneda)}</p>
              </div>

              <form onSubmit={handlePagoCompra} className="space-y-3">
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Monto pagado *</label>
                  <Input type="number" min="0" step="any"
                    value={pagoForm.monto_pagado}
                    onChange={e => setPagoForm(p => ({ ...p, monto_pagado: e.target.value }))}
                    className="bg-arandu-dark border-white/10 text-white" />
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Fecha de pago *</label>
                  <Input type="date"
                    value={pagoForm.fecha_pago}
                    onChange={e => setPagoForm(p => ({ ...p, fecha_pago: e.target.value }))}
                    className="bg-arandu-dark border-white/10 text-white" />
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Notas</label>
                  <Input value={pagoForm.notas}
                    onChange={e => setPagoForm(p => ({ ...p, notas: e.target.value }))}
                    className="bg-arandu-dark border-white/10 text-white" placeholder="Opcional" />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowPagoModal(null)}
                    className="flex-1 border-white/10 text-slate-400">Cancelar</Button>
                  <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Check className="w-4 h-4 mr-2" /> Registrar pago
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EgresosPage;
