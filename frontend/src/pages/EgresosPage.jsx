import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, TrendingDown, ShoppingCart, Calendar, Users, Clock,
  Plus, Search, Edit, Trash2, Save, X, Check, ChevronDown,
  AlertTriangle, FileText, DollarSign, Building2, Filter,
  CreditCard, Receipt, ExternalLink, Banknote, Package, ToggleLeft, ToggleRight,
  Wallet, HandCoins, Eye, ChevronRight, ChevronLeft, Loader2
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

const fmtPYG = (n) => fmt(n, "PYG");

const hoy = () => new Date().toISOString().slice(0, 10);
const mesActual = () => new Date().toISOString().slice(0, 7);

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
function mesLabel(m) {
  const [y, mo] = m.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[parseInt(mo, 10) - 1]} ${y}`;
}

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
  cuenta_id: "",
  cuenta_nombre: "",
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
  iva: 10,          // % IVA del ítem (0, 5, 10)
  producto_id: "",
});

// IVA de un ítem a partir de su subtotal (precio incluye IVA)
const calcItemIva = (it, moneda = "PYG") => {
  const sub = parseFloat(it.subtotal) || 0;
  const tasa = Number(it.iva ?? 10);
  const raw = tasa === 10 ? sub / 11 : tasa === 5 ? sub / 21 : 0;
  return moneda === "PYG" ? Math.round(raw) : Math.round(raw * 100) / 100;
};

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

// ─── Componente búsqueda con chips (Enter para agregar filtro) ───────────────
function ChipSearch({ chips, setChips, inputVal, setInputVal, placeholder, accentColor = "orange", actionButton = null }) {
  const addChip = () => {
    const term = inputVal.trim().replace(/,$/, "");
    if (term && !chips.includes(term)) setChips(prev => [...prev, term]);
    setInputVal("");
  };
  return (
    <div className="space-y-2 flex-1">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {chips.map((chip, idx) => (
            <span key={idx} className={`flex items-center gap-1.5 bg-${accentColor}-500/20 text-${accentColor}-300 border border-${accentColor}-500/40 rounded-full px-3 py-1 text-xs`}>
              <Search className="w-3 h-3" />
              {chip}
              <button onClick={() => setChips(prev => prev.filter((_, i) => i !== idx))} className="ml-1 hover:text-white transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button onClick={() => setChips([])} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-full border border-white/10 hover:border-white/20 transition-all">
            Limpiar
          </button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => {
              if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) { e.preventDefault(); addChip(); }
              if (e.key === "Backspace" && inputVal === "" && chips.length > 0) setChips(prev => prev.slice(0, -1));
            }}
            placeholder={placeholder}
            className={`w-full bg-arandu-dark-light border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-${accentColor}-500/60 placeholder-slate-500`}
          />
        </div>
        {actionButton}
      </div>
    </div>
  );
}

// Helper para filtrar con chips (AND lógico — todos los chips deben matchear)
function matchChips(chips, inputVal, texto) {
  const allChips = [...chips, ...(inputVal.trim() ? [inputVal.trim()] : [])];
  if (allChips.length === 0) return true;
  const t = texto.toLowerCase();
  return allChips.every(chip => t.includes(chip.toLowerCase()));
}

// ─────────────────────────────────────────────────────────────────────────────
const EgresosPage = () => {
  const { token, user, hasPermission, activeEmpresaPropia } = useContext(AuthContext);
  const isAdmin = user?.role === "admin";

  // ── Tab activo ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("compras");

  // ── Logos accesibles ────────────────────────────────────────────────────────
  const [empresasPropias, setEmpresasPropias] = useState([]);

  // ── Compras state ───────────────────────────────────────────────────────────
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [filtroMes, setFiltroMes] = useState(mesActual());
  const [filtroTipo, setFiltroTipo] = useState("mes"); // "todos" | "mes" | "anio"
  const [filtroAnio, setFiltroAnio] = useState(String(new Date().getFullYear()));
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

  // ── Pagos Proveedores state (lista plana de todos los registros) ────────────
  const [listaProveedores, setListaProveedores] = useState([]);           // para dropdown en form
  const [todosPagosProveedores, setTodosPagosProveedores] = useState([]); // lista plana
  const [loadingTodosPagos, setLoadingTodosPagos] = useState(false);
  const [showPagoProvForm, setShowPagoProvForm] = useState(false);
  // compras_pagos: [{compra_id, monto_pagado}] — soporta pago parcial por compra
  const emptyPagoProvForm = () => ({ proveedor_id: "", proveedor_nombre: "", cuenta_id: "", cuenta_nombre: "", cuenta_moneda: "PYG", tipo_cambio: "", fecha_pago: hoy(), notas: "", compras_pagos: [] });
  const [pagoProvForm, setPagoProvForm] = useState(emptyPagoProvForm());
  const [editingPagoProv, setEditingPagoProv] = useState(null);
  const [comprasProvList, setComprasProvList] = useState([]);   // compras pendientes del prov seleccionado
  const [loadingComprasProv, setLoadingComprasProv] = useState(false);
  const [selectedPagoView, setSelectedPagoView] = useState(null);

  // ── Cuentas bancarias ───────────────────────────────────────────────────────
  const [cuentasDisp, setCuentasDisp] = useState([]);

  // ── Búsquedas por pestaña (chips = filtros activos, input = texto en curso) ──
  const [comprasChips, setComprasChips]     = useState([]);
  const [comprasInput, setComprasInput]     = useState("");
  const [costosChips, setCostosChips]       = useState([]);
  const [costosInput, setCostosInput]       = useState("");
  const [sueldosChips, setSueldosChips]     = useState([]);
  const [sueldosInput, setSueldosInput]     = useState("");
  const [pagPendChips, setPagPendChips]     = useState([]);
  const [pagPendInput, setPagPendInput]     = useState("");
  const [pagoProvChips, setPagoProvChips]   = useState([]);
  const [pagoProvInput, setPagoProvInput]   = useState("");
  const [ivaChips, setIvaChips]             = useState([]);
  const [ivaInput, setIvaInput]             = useState("");

  // ── Pago IVA state ──────────────────────────────────────────────────────────
  const [ivaBalance, setIvaBalance] = useState(null);
  const [pagosIvaList, setPagosIvaList] = useState([]);
  const [loadingIva, setLoadingIva] = useState(false);
  const [periodoIva, setPeriodoIva] = useState(mesActual());
  const [showPagoIvaForm, setShowPagoIvaForm] = useState(false);
  const [pagoIvaForm, setPagoIvaForm] = useState({ monto: "", fecha: hoy(), notas: "", descripcion: "" });

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEmpresasPropias();
    fetchProveedores();
    fetchProductos();
    fetchCuentasDisp();
  }, []);

  useEffect(() => {
    if (tab === "compras") fetchCompras();
    if (tab === "costos") fetchCostos();
    if (tab === "sueldos") fetchEmpleados();
    if (tab === "pagos") fetchPagosPendientes();
    if (tab === "proveedores-pagos") fetchTodosPagosProveedores();
    if (tab === "pago-iva") fetchIvaData();
  }, [tab]);

  // ── Fetches ─────────────────────────────────────────────────────────────────
  const fetchCuentasDisp = async () => {
    try {
      const logo = activeEmpresaPropia?.slug;
      const res = await fetch(`${API}/admin/cuentas-bancarias${logo ? `?logo_tipo=${logo}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCuentasDisp(await res.json());
    } catch (e) {}
  };

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
      if (filtroTipo === "mes" && filtroMes) params.set("mes", filtroMes);
      if (filtroTipo === "anio" && filtroAnio) params.set("anio", filtroAnio);
      if (activeEmpresaPropia?.slug) params.set("logo_tipo", activeEmpresaPropia.slug);
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

  const fetchTodosPagosProveedores = async () => {
    setLoadingTodosPagos(true);
    try {
      // Carga lista plana de todos los pagos + proveedores filtrados por empresa activa
      const logo = activeEmpresaPropia?.slug;
      const provParams = new URLSearchParams({ activo: "true" });
      if (logo) provParams.set("logo_tipo", logo);
      const [pagosRes, provRes] = await Promise.all([
        fetch(`${API}/admin/pagos-proveedores${logo ? `?logo_tipo=${logo}` : ""}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/proveedores?${provParams}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (pagosRes.ok) setTodosPagosProveedores(await pagosRes.json());
      if (provRes.ok) setListaProveedores(await provRes.json());
    } catch (e) {}
    finally { setLoadingTodosPagos(false); }
  };

  // Cargar compras pendientes de un proveedor (para el form de pago)
  const fetchComprasProveedor = async (provId) => {
    if (!provId) { setComprasProvList([]); return; }
    setLoadingComprasProv(true);
    try {
      const logo = activeEmpresaPropia?.slug;
      const res = await fetch(
        `${API}/admin/compras?logo_tipo=${logo || ""}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const all = await res.json();
        setComprasProvList(
          all.filter(c => c.proveedor_id === provId && ["pendiente", "parcial", "vencido"].includes(c.estado_pago))
        );
      }
    } catch (e) {}
    finally { setLoadingComprasProv(false); }
  };

  const handlePagoProveedor = async (e) => {
    e.preventDefault();
    const { compras_pagos } = pagoProvForm;
    if (!pagoProvForm.proveedor_id) { toast.error("Seleccioná un proveedor"); return; }
    if (compras_pagos.length === 0) { toast.error("Seleccioná al menos una compra a pagar"); return; }
    if (compras_pagos.some(cp => !cp.monto_pagado || cp.monto_pagado <= 0)) {
      toast.error("Todos los montos a pagar deben ser mayores a 0"); return;
    }
    if (!pagoProvForm.cuenta_id) { toast.error("Seleccioná la cuenta bancaria"); return; }
    if (!pagoProvForm.fecha_pago) { toast.error("La fecha de pago es requerida"); return; }

    // Moneda y total desde compras_pagos
    const firstCompra = comprasProvList.find(c => c.id === compras_pagos[0]?.compra_id);
    const monedaCompra = firstCompra?.moneda || "USD";
    const totalCompra = compras_pagos.reduce((s, cp) => s + (Number(cp.monto_pagado) || 0), 0);
    const needsTc = monedaCompra !== pagoProvForm.cuenta_moneda;

    if (needsTc && !pagoProvForm.tipo_cambio) { toast.error("Ingresá el tipo de cambio"); return; }

    const montoEquiv = needsTc ? totalCompra * Number(pagoProvForm.tipo_cambio) : null;
    const comprasRef = comprasProvList.filter(c => compras_pagos.some(cp => cp.compra_id === c.id));
    const concepto = `Pago por ${comprasRef.length} compra${comprasRef.length > 1 ? "s" : ""}: ${comprasRef.map(c => c.fecha).join(", ")}`;

    try {
      const payload = {
        proveedor_id: pagoProvForm.proveedor_id,
        proveedor_nombre: pagoProvForm.proveedor_nombre,
        concepto,
        monto: totalCompra,
        moneda: monedaCompra,
        tipo_cambio: needsTc ? Number(pagoProvForm.tipo_cambio) : null,
        monto_gs: needsTc ? Math.round(montoEquiv) : null,
        cuenta_id: pagoProvForm.cuenta_id,
        cuenta_nombre: pagoProvForm.cuenta_nombre,
        cuenta_moneda: pagoProvForm.cuenta_moneda,
        cuenta_pago: pagoProvForm.cuenta_moneda === "PYG" ? "guaranies" : "dolares",
        fecha_vencimiento: pagoProvForm.fecha_pago,
        fecha_pago: pagoProvForm.fecha_pago,
        compras_pagos: compras_pagos.map(cp => ({ compra_id: cp.compra_id, monto_pagado: Number(cp.monto_pagado) })),
        notas: pagoProvForm.notas || null,
        logo_tipo: activeEmpresaPropia?.slug || "arandujar",
      };
      const url = editingPagoProv
        ? `${API}/admin/pagos-proveedores/${editingPagoProv.id}`
        : `${API}/admin/pagos-proveedores`;
      const res = await fetch(url, {
        method: editingPagoProv ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(editingPagoProv ? "Pago actualizado" : "Pago registrado correctamente");
        setShowPagoProvForm(false);
        setEditingPagoProv(null);
        setPagoProvForm(emptyPagoProvForm());
        setComprasProvList([]);
        fetchTodosPagosProveedores();
        if (tab === "compras") fetchCompras();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al registrar pago");
      }
    } catch (e) { toast.error("Error de conexión"); }
  };

  const handleDeletePagoProv = async (pagoId) => {
    if (!window.confirm("¿Eliminar este pago? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`${API}/admin/pagos-proveedores/${pagoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Pago eliminado");
        setSelectedPagoView(null);
        fetchTodosPagosProveedores();
      } else {
        toast.error("Error al eliminar");
      }
    } catch (e) { toast.error("Error de conexión"); }
  };

  const openEditPagoProv = (pago) => {
    // Pre-llenar el form con los datos del pago existente
    // Mapear compras_pagos existentes o convertir compras_ids al nuevo formato
    let compras_pagos = [];
    if (pago.compras_pagos && pago.compras_pagos.length > 0) {
      compras_pagos = pago.compras_pagos.map(cp => ({ compra_id: cp.compra_id, monto_pagado: cp.monto_pagado }));
    } else if (pago.compras_ids && pago.compras_ids.length > 0) {
      // Fallback para pagos viejos sin compras_pagos
      const montoUnitario = pago.monto / pago.compras_ids.length;
      compras_pagos = pago.compras_ids.map(id => ({ compra_id: id, monto_pagado: montoUnitario }));
    }
    setPagoProvForm({
      proveedor_id: pago.proveedor_id || "",
      proveedor_nombre: pago.proveedor_nombre || "",
      cuenta_id: pago.cuenta_id || "",
      cuenta_nombre: pago.cuenta_nombre || "",
      cuenta_moneda: pago.cuenta_moneda || (pago.cuenta_pago === "dolares" ? "USD" : "PYG"),
      tipo_cambio: pago.tipo_cambio ? String(pago.tipo_cambio) : "",
      fecha_pago: pago.fecha_pago || hoy(),
      notas: pago.notas || "",
      compras_pagos,
    });
    if (pago.proveedor_id) fetchComprasProveedor(pago.proveedor_id);
    setEditingPagoProv(pago);
    setSelectedPagoView(null);
    setShowPagoProvForm(true);
  };

  const handleMarcarPagado = async (pagoId) => {
    try {
      const res = await fetch(`${API}/admin/pagos-proveedores/${pagoId}/marcar-pagado`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Marcado como pagado");
        setSelectedPagoView(null);
        fetchTodosPagosProveedores();
      }
    } catch (e) { toast.error("Error"); }
  };

  // ── IVA ──────────────────────────────────────────────────────────────────────
  const fetchIvaData = async () => {
    setLoadingIva(true);
    try {
      const logo = activeEmpresaPropia?.slug;
      const [ivaRes, pagosRes] = await Promise.all([
        fetch(`${API}/admin/balance/iva?periodo=${periodoIva}${logo ? `&logo_tipo=${logo}` : ""}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/ingresos-varios?mes=${periodoIva}${logo ? `&logo_tipo=${logo}` : ""}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (ivaRes.ok) setIvaBalance(await ivaRes.json());
      if (pagosRes.ok) {
        const todos = await pagosRes.json();
        setPagosIvaList(todos.filter(i => i.categoria === "Pago IVA" && i.monto < 0));
      }
    } catch (e) {}
    finally { setLoadingIva(false); }
  };

  const handlePagoIva = async (e) => {
    e.preventDefault();
    if (!pagoIvaForm.monto) { toast.error("Completá el monto"); return; }
    try {
      const res = await fetch(`${API}/admin/ingresos-varios`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          descripcion: pagoIvaForm.descripcion || `Pago IVA ${periodoIva}`,
          categoria: "Pago IVA",
          fecha: pagoIvaForm.fecha,
          monto: -Math.abs(Number(pagoIvaForm.monto)),  // negativo = egreso
          moneda: "PYG",
          logo_tipo: activeEmpresaPropia?.slug || "arandujar",
          notas: pagoIvaForm.notas || null,
        }),
      });
      if (res.ok) {
        toast.success("Pago IVA registrado — figura en balance como egreso");
        setShowPagoIvaForm(false);
        setPagoIvaForm({ monto: "", fecha: hoy(), notas: "", descripcion: "" });
        fetchIvaData();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al registrar");
      }
    } catch (e) { toast.error("Error de conexión"); }
  };

  useEffect(() => {
    if (tab === "compras") fetchCompras();
  }, [filtroMes, filtroTipo, filtroAnio]); // eslint-disable-line

  useEffect(() => {
    if (tab === "pago-iva") fetchIvaData();
  }, [periodoIva]); // eslint-disable-line

  // ── Logos accesibles para selector ─────────────────────────────────────────
  const logosAccesibles = isAdmin
    ? empresasPropias
    : empresasPropias.filter(ep => (user?.logos_asignados || []).map(String).includes(String(ep.id)));

  // ── Compras CRUD ────────────────────────────────────────────────────────────
  const openNewCompra = () => {
    const logo = activeEmpresaPropia?.slug || "arandujar";
    setCompraForm({ ...emptyCompra(), logo_tipo: logo });
    setEditingCompra(null);
    fetchProveedores(logo);
    setShowCompraForm(true);
  };

  const openEditCompra = (c) => {
    setCompraForm({
      logo_tipo: c.logo_tipo || activeEmpresaPropia?.slug || "arandujar",
      proveedor_id: c.proveedor_id || "",
      proveedor_nombre: c.proveedor_nombre || "",
      fecha: c.fecha || hoy(),
      tipo_pago: c.tipo_pago || "contado",
      tiene_factura: c.tiene_factura || false,
      numero_factura: c.numero_factura || "",
      monto_total: c.monto_total ?? "",
      moneda: c.moneda || "PYG",
      tipo_cambio: c.tipo_cambio || "",
      cuenta_id: c.cuenta_id || "",
      cuenta_nombre: c.cuenta_nombre || "",
      items: (c.items || []).map(it => ({ ...it, iva: it.iva ?? 10 })),
      afecta_stock: c.afecta_stock !== false,
      notas: c.notas || "",
      fecha_vencimiento: c.fecha_vencimiento || "",
    });
    setEditingCompra(c);
    fetchProveedores(c.logo_tipo || activeEmpresaPropia?.slug || "arandujar");
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
    const itemsNorm = (compraForm.items || []).map(it => ({
      ...it,
      cantidad: Number(it.cantidad) || 1,
      precio_unitario: parseFloat(it.precio_unitario) || 0,
      subtotal: parseFloat(it.subtotal) || 0,
      iva: Number(it.iva ?? 10),
    }));
    const totalIvaAuto = itemsNorm.reduce((s, it) => s + calcItemIva(it, compraForm.moneda), 0);
    const payload = {
      ...compraForm,
      items: itemsNorm,
      monto_total: montoFinal,
      monto_iva: totalIvaAuto > 0 ? totalIvaAuto : null,
      tasa_iva: null, // ahora es por ítem
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

        {/* Selector de período global */}
        <div className="flex items-center gap-2 flex-wrap mb-5 bg-arandu-dark-light border border-white/10 rounded-xl px-4 py-3">
          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-slate-400 text-sm mr-1">Período:</span>
          {[
            { v: "todos", label: "Todo el tiempo" },
            { v: "mes",   label: "Por mes" },
            { v: "anio",  label: "Por año" },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setFiltroTipo(opt.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filtroTipo === opt.v
                  ? "bg-arandu-blue border-arandu-blue text-white"
                  : "border-white/10 text-slate-400 hover:text-white bg-white/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {filtroTipo === "mes" && (
            <div className="flex items-center gap-1 bg-arandu-dark border border-white/10 rounded-lg px-1 py-0.5">
              <button
                onClick={() => { const m = prevMes(filtroMes); setFiltroMes(m); setPeriodoIva(m); }}
                className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white text-sm font-medium min-w-[90px] text-center px-1">{mesLabel(filtroMes)}</span>
              <button
                onClick={() => { const m = nextMes(filtroMes); setFiltroMes(m); setPeriodoIva(m); }}
                className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {filtroTipo === "anio" && (
            <div className="flex items-center gap-1 bg-arandu-dark border border-white/10 rounded-lg px-1 py-0.5">
              <button onClick={() => setFiltroAnio(a => String(parseInt(a) - 1))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white text-sm font-medium min-w-[50px] text-center px-1">{filtroAnio}</span>
              <button onClick={() => setFiltroAnio(a => String(parseInt(a) + 1))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => { setFiltroTipo("mes"); setFiltroMes(mesActual()); setPeriodoIva(mesActual()); }}
            className="ml-auto text-xs text-slate-500 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-all"
          >
            Mes actual
          </button>
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
            { id: "proveedores-pagos", label: "Pag. Proveedores", icon: Wallet, color: "bg-violet-600" },
            { id: "pago-iva", label: "IVA", icon: Receipt, color: "bg-amber-600" },
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
            {/* Buscador chips + acción */}
            <div className="flex flex-col md:flex-row gap-3 mb-5">
              <ChipSearch
                chips={comprasChips} setChips={setComprasChips}
                inputVal={comprasInput} setInputVal={setComprasInput}
                placeholder="Buscar por proveedor, monto, fecha, estado, factura, notas… (Enter para agregar filtro)"
                accentColor="orange"
                actionButton={hasPermission("compras.crear") ? (
                  <Button onClick={openNewCompra} className="bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap">
                    <Plus className="w-4 h-4 mr-2" /> Nueva Compra
                  </Button>
                ) : null}
              />
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
                {compras.filter(c => {
                  const texto = [
                    c.proveedor_nombre, c.fecha, String(c.monto_total||""),
                    c.notas, c.numero_factura, c.moneda, c.estado_pago, c.tipo_pago
                  ].filter(Boolean).join(" ");
                  return matchChips(comprasChips, comprasInput, texto);
                }).map(c => (
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
            {/* Buscador chips + acción */}
            <div className="flex flex-col md:flex-row gap-3 mb-5">
              <ChipSearch
                chips={costosChips} setChips={setCostosChips}
                inputVal={costosInput} setInputVal={setCostosInput}
                placeholder="Buscar por nombre, monto, moneda, frecuencia, activo… (Enter para agregar filtro)"
                accentColor="blue"
                actionButton={
                  <Link to="/admin/costos-fijos">
                    <Button variant="outline" className="border-white/10 text-slate-300 gap-2 whitespace-nowrap">
                      <ExternalLink className="w-4 h-4" /> Gestionar completo
                    </Button>
                  </Link>
                }
              />
            </div>
            {costosChips.length === 0 && !costosInput && <p className="text-slate-500 text-xs mb-3">{costos.length} costos fijos registrados</p>}
            {loadingCostos ? (
              <div className="text-center py-12 text-blue-400 animate-pulse">Cargando...</div>
            ) : (
              <div className="space-y-2">
                {costos.filter(c => {
                  const texto = [c.nombre, String(c.monto||""), c.moneda, c.frecuencia, c.activo ? "activo" : "inactivo"].filter(Boolean).join(" ");
                  return matchChips(costosChips, costosInput, texto);
                }).map(c => (
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
            {/* Buscador chips + acción */}
            <div className="flex flex-col md:flex-row gap-3 mb-5">
              <ChipSearch
                chips={sueldosChips} setChips={setSueldosChips}
                inputVal={sueldosInput} setInputVal={setSueldosInput}
                placeholder="Buscar por nombre, apellido, cargo, sueldo, activo… (Enter para agregar filtro)"
                accentColor="purple"
                actionButton={
                  <Link to="/admin/empleados">
                    <Button variant="outline" className="border-white/10 text-slate-300 gap-2 whitespace-nowrap">
                      <ExternalLink className="w-4 h-4" /> Gestionar empleados
                    </Button>
                  </Link>
                }
              />
            </div>
            {sueldosChips.length === 0 && !sueldosInput && <p className="text-slate-500 text-xs mb-3">{empleados.filter(e => e.activo).length} empleados activos</p>}
            {loadingEmpleados ? (
              <div className="text-center py-12 text-purple-400 animate-pulse">Cargando...</div>
            ) : (
              <div className="space-y-2">
                {empleados.filter(e => {
                  const texto = [e.nombre, e.apellido, e.cargo, String(e.sueldo_base||""), e.activo ? "activo" : "inactivo"].filter(Boolean).join(" ");
                  return matchChips(sueldosChips, sueldosInput, texto);
                }).map(e => (
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
            {/* Buscador chips */}
            <div className="mb-5">
              <ChipSearch
                chips={pagPendChips} setChips={setPagPendChips}
                inputVal={pagPendInput} setInputVal={setPagPendInput}
                placeholder="Buscar por proveedor, monto, fecha, vencido, pendiente… (Enter para agregar filtro)"
                accentColor="red"
              />
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
                {pagosPendientes.filter(item => {
                  const texto = [
                    item.proveedor_nombre, item.nombre,
                    String(item.saldo_pendiente||item.monto||""),
                    item.fecha, item.estado_pago, item.estado, item._tipo
                  ].filter(Boolean).join(" ");
                  return matchChips(pagPendChips, pagPendInput, texto);
                }).map((item, i) => (
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

        {/* ═══════════════ TAB: PAGO IVA ══════════════════════════════════════ */}
        {tab === "pago-iva" && (
          <div>
            {/* Selector de período + buscador */}
            <div className="flex flex-col gap-3 mb-5">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="month"
                  value={periodoIva}
                  onChange={e => setPeriodoIva(e.target.value)}
                  className="bg-arandu-dark-light border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                />
                <span className="text-slate-500 text-sm">Período IVA</span>
                {hasPermission("ingresos_varios.crear") && (
                  <button
                    onClick={() => { setPagoIvaForm({ monto: ivaBalance?.iva_neto > 0 ? String(Math.round(ivaBalance.iva_neto)) : "", fecha: hoy(), notas: "", descripcion: `Pago IVA ${periodoIva}` }); setShowPagoIvaForm(true); }}
                    className="ml-auto flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
                  >
                    <Plus className="w-4 h-4" /> Registrar pago IVA
                  </button>
                )}
              </div>
              <ChipSearch
                chips={ivaChips} setChips={setIvaChips}
                inputVal={ivaInput} setInputVal={setIvaInput}
                placeholder="Buscar en pagos IVA por descripción, fecha, monto… (Enter para agregar filtro)"
                accentColor="amber"
              />
            </div>

            {loadingIva ? (
              <div className="flex items-center justify-center py-16 text-amber-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Calculando IVA...
              </div>
            ) : (
              <div className="space-y-5">
                {/* Cards IVA */}
                {ivaBalance && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
                        <p className="text-cyan-400 text-xs mb-1">IVA Débito (ventas)</p>
                        <p className="text-cyan-300 font-heading font-bold text-xl">{fmtPYG(ivaBalance.iva_debito)}</p>
                        <p className="text-slate-500 text-xs mt-1">{ivaBalance.cantidad_facturas || 0} factura{ivaBalance.cantidad_facturas !== 1 ? "s" : ""} emitida{ivaBalance.cantidad_facturas !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                        <p className="text-violet-400 text-xs mb-1">IVA Crédito (compras)</p>
                        <p className="text-violet-300 font-heading font-bold text-xl">{fmtPYG(ivaBalance.iva_credito)}</p>
                        <p className="text-slate-500 text-xs mt-1">{ivaBalance.cantidad_compras_con_factura || 0} compra{ivaBalance.cantidad_compras_con_factura !== 1 ? "s" : ""} con factura</p>
                      </div>
                      <div className={`rounded-xl p-4 border ${ivaBalance.iva_neto > 0 ? "bg-red-500/10 border-red-500/20" : ivaBalance.iva_neto < 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-slate-500/10 border-slate-500/20"}`}>
                        <p className={`text-xs mb-1 ${ivaBalance.iva_neto > 0 ? "text-red-400" : ivaBalance.iva_neto < 0 ? "text-emerald-400" : "text-slate-400"}`}>
                          {ivaBalance.iva_neto > 0 ? "⚠ A pagar a la SET" : ivaBalance.iva_neto < 0 ? "✓ A favor" : "Sin movimientos"}
                        </p>
                        <p className={`font-heading font-bold text-xl ${ivaBalance.iva_neto > 0 ? "text-red-300" : ivaBalance.iva_neto < 0 ? "text-emerald-300" : "text-slate-400"}`}>
                          {fmtPYG(Math.abs(ivaBalance.iva_neto))}
                        </p>
                      </div>
                    </div>

                    {/* Saldo acumulado desde enero */}
                    {(ivaBalance.saldo_pendiente_acumulado > 0 || ivaBalance.saldo_a_favor_acumulado > 0) && (
                      <div className={`rounded-xl p-4 border flex items-center justify-between ${
                        ivaBalance.saldo_pendiente_acumulado > 0
                          ? "bg-orange-500/10 border-orange-500/30"
                          : "bg-emerald-500/10 border-emerald-500/30"
                      }`}>
                        <div>
                          <p className={`text-xs font-medium mb-0.5 ${ivaBalance.saldo_pendiente_acumulado > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {ivaBalance.saldo_pendiente_acumulado > 0 ? "⚠ Saldo IVA acumulado a pagar (enero → ahora)" : "✓ Saldo IVA acumulado a favor"}
                          </p>
                          <p className="text-slate-500 text-xs">
                            Débito acum.: {fmtPYG(ivaBalance.iva_debito_acumulado)} · Crédito acum.: {fmtPYG(ivaBalance.iva_credito_acumulado)}
                            {ivaBalance.iva_pagado_acumulado > 0 && ` · Ya pagado: ${fmtPYG(ivaBalance.iva_pagado_acumulado)}`}
                          </p>
                        </div>
                        <p className={`font-heading font-bold text-2xl ml-4 ${ivaBalance.saldo_pendiente_acumulado > 0 ? "text-orange-300" : "text-emerald-300"}`}>
                          {fmtPYG(ivaBalance.saldo_pendiente_acumulado > 0 ? ivaBalance.saldo_pendiente_acumulado : ivaBalance.saldo_a_favor_acumulado)}
                        </p>
                      </div>
                    )}

                    {/* Aviso cuando no hay datos para el período */}
                    {ivaBalance.iva_debito === 0 && ivaBalance.iva_credito === 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-amber-300 text-sm font-medium">Sin facturas ni compras para este período</p>
                          <p className="text-slate-400 text-xs mt-1">
                            Si tenés facturas emitidas, revisá que el mes del selector coincida con la fecha de esas facturas.
                            El IVA se calcula por fecha de emisión de la factura, no por fecha de cobro.
                          </p>
                          <p className="text-slate-500 text-xs mt-1">
                            Para ver el crédito fiscal de compras, asegurate de marcar "Tiene factura" al registrar una compra.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Pagos IVA registrados para este período */}
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-amber-500/5">
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-300 font-medium text-sm">Pagos IVA registrados — {periodoIva}</span>
                    {pagosIvaList.length > 0 && (
                      <span className="ml-auto text-amber-300 font-heading font-bold text-sm">
                        {fmtPYG(pagosIvaList.reduce((s, p) => s + Math.abs(p.monto), 0))}
                      </span>
                    )}
                  </div>
                  {pagosIvaList.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      <p>No hay pagos IVA registrados para este período</p>
                      {ivaBalance?.iva_neto > 0 && (
                        <p className="text-amber-500 text-xs mt-1">Tenés {fmtPYG(ivaBalance.iva_neto)} a pagar a la SET</p>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {pagosIvaList.filter(pago => {
                        const texto = [pago.descripcion, pago.fecha, String(Math.abs(pago.monto)||""), pago.notas].filter(Boolean).join(" ");
                        return matchChips(ivaChips, ivaInput, texto);
                      }).map(pago => (
                        <div key={pago.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-white text-sm font-medium">{pago.descripcion}</p>
                            <p className="text-slate-500 text-xs">{pago.fecha}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-red-300 font-heading font-semibold">{fmtPYG(Math.abs(pago.monto))}</p>
                            {pago.notas && <p className="text-slate-500 text-xs">{pago.notas}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal registrar pago IVA */}
            {showPagoIvaForm && (
              <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                onClick={e => e.target === e.currentTarget && setShowPagoIvaForm(false)}>
                <div className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-white">Registrar pago IVA</h3>
                      <p className="text-slate-400 text-sm">Período: {periodoIva}</p>
                    </div>
                    <button onClick={() => setShowPagoIvaForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                  </div>
                  {ivaBalance?.iva_neto > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 flex justify-between">
                      <span className="text-red-300 text-sm">IVA a pagar este período</span>
                      <span className="text-red-400 font-bold">{fmtPYG(ivaBalance.iva_neto)}</span>
                    </div>
                  )}
                  <form onSubmit={handlePagoIva} className="space-y-4">
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Descripción</label>
                      <input value={pagoIvaForm.descripcion} onChange={e => setPagoIvaForm(p => ({ ...p, descripcion: e.target.value }))}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
                        placeholder={`Pago IVA ${periodoIva}`} />
                    </div>
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Monto (₲) *</label>
                      <input type="number" min="0" step="any" value={pagoIvaForm.monto}
                        onChange={e => setPagoIvaForm(p => ({ ...p, monto: e.target.value }))}
                        onFocus={e => e.target.select()}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
                        placeholder="0" required />
                    </div>
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Fecha *</label>
                      <input type="date" value={pagoIvaForm.fecha} onChange={e => setPagoIvaForm(p => ({ ...p, fecha: e.target.value }))}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50" required />
                    </div>
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Notas</label>
                      <input value={pagoIvaForm.notas} onChange={e => setPagoIvaForm(p => ({ ...p, notas: e.target.value }))}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
                        placeholder="Nº de comprobante, banco, etc." />
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button type="button" onClick={() => setShowPagoIvaForm(false)}
                        className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-400 text-sm hover:text-white">Cancelar</button>
                      <button type="submit"
                        className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" /> Registrar pago
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ TAB: PAGOS PROVEEDORES ═════════════════════════════ */}
        {tab === "proveedores-pagos" && (
          <div>
            {/* Toolbar chips */}
            <div className="mb-5">
              <ChipSearch
                chips={pagoProvChips} setChips={setPagoProvChips}
                inputVal={pagoProvInput} setInputVal={setPagoProvInput}
                placeholder="Buscar por proveedor, concepto, monto, fecha, pagado, pendiente, vencido… (Enter para agregar filtro)"
                accentColor="violet"
                actionButton={hasPermission("pagos_proveedores.crear") ? (
                  <button
                    onClick={() => {
                      setPagoProvForm(emptyPagoProvForm());
                      setEditingPagoProv(null);
                      setComprasProvList([]);
                      setShowPagoProvForm(true);
                    }}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" /> Nuevo pago
                  </button>
                ) : null}
              />
            </div>

            {/* Resumen rápido */}
            {todosPagosProveedores.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: "Pendientes", val: todosPagosProveedores.filter(p => p.estado === "pendiente").length, color: "text-blue-400" },
                  { label: "Vencidos", val: todosPagosProveedores.filter(p => p.estado === "vencido").length, color: "text-red-400" },
                  { label: "Pagados", val: todosPagosProveedores.filter(p => p.estado === "pagado").length, color: "text-emerald-400" },
                ].map(s => (
                  <div key={s.label} className="bg-arandu-dark-light border border-white/5 rounded-xl p-3 text-center">
                    <p className={`font-heading font-bold text-2xl ${s.color}`}>{s.val}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {loadingTodosPagos ? (
              <div className="flex items-center justify-center py-16 text-violet-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando pagos...
              </div>
            ) : todosPagosProveedores.length === 0 ? (
              <div className="text-center py-16 bg-arandu-dark-light border border-white/5 rounded-xl">
                <Wallet className="w-14 h-14 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 mb-2">No hay pagos a proveedores registrados</p>
                {hasPermission("pagos_proveedores.crear") && (
                  <button onClick={() => setShowPagoProvForm(true)} className="text-sm text-violet-400 hover:underline">
                    Registrar primer pago
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {todosPagosProveedores
                  .filter(p => {
                    const texto = [
                      p.proveedor_nombre, p.concepto, String(p.monto||""),
                      p.fecha_pago, p.fecha_vencimiento, p.cuenta_nombre,
                      p.moneda, p.estado
                    ].filter(Boolean).join(" ");
                    return matchChips(pagoProvChips, pagoProvInput, texto);
                  })
                  .map((pago, i) => {
                    const estadoBadge = {
                      pagado:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                      pendiente:"bg-blue-500/15 text-blue-400 border-blue-500/30",
                      vencido:  "bg-red-500/15 text-red-400 border-red-500/30",
                    }[pago.estado] || "bg-slate-500/15 text-slate-400 border-slate-500/30";
                    return (
                      <motion.div
                        key={pago.id || i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-arandu-dark-light border border-white/5 rounded-xl p-4 hover:border-violet-500/20 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 bg-violet-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Banknote className="w-5 h-5 text-violet-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-medium truncate">{pago.proveedor_nombre}</p>
                              <p className="text-slate-400 text-sm truncate">{pago.concepto}</p>
                              <p className="text-slate-600 text-xs mt-0.5">
                                Vence: {pago.fecha_vencimiento}
                                {pago.fecha_pago && <span className="ml-2 text-emerald-600">· Pagado: {pago.fecha_pago}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-white font-bold">{fmt(pago.monto, pago.moneda)}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${estadoBadge}`}>
                                {pago.estado}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => setSelectedPagoView(pago)}
                                className="text-slate-500 hover:text-violet-400 transition-colors"
                                title="Ver detalle"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {hasPermission("pagos_proveedores.editar") && (
                                <button
                                  onClick={() => openEditPagoProv(pago)}
                                  className="text-slate-500 hover:text-yellow-400 transition-colors"
                                  title="Editar pago"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}
                              {hasPermission("pagos_proveedores.eliminar") && (
                                <button
                                  onClick={() => handleDeletePagoProv(pago.id)}
                                  className="text-slate-500 hover:text-red-400 transition-colors"
                                  title="Eliminar pago"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              {(pago.estado === "pendiente" || pago.estado === "vencido") && (
                                <button
                                  onClick={() => handleMarcarPagado(pago.id)}
                                  className="text-slate-500 hover:text-emerald-400 transition-colors"
                                  title="Marcar como pagado"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
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
                            <th className="text-center text-slate-500 font-normal px-2 py-2 w-14">Cant.</th>
                            <th className="text-right text-slate-500 font-normal px-2 py-2 w-24">P. Unit.</th>
                            <th className="text-center text-slate-500 font-normal px-2 py-2 w-16">IVA%</th>
                            <th className="text-right text-slate-500 font-normal px-2 py-2 w-24">Subtotal</th>
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
                              <td className="px-1 py-1.5">
                                <select
                                  value={item.iva ?? 10}
                                  onChange={e => {
                                    const items = [...compraForm.items];
                                    items[idx] = { ...items[idx], iva: Number(e.target.value) };
                                    setCompraForm(p => ({ ...p, items }));
                                  }}
                                  className="w-full bg-arandu-dark border border-white/10 rounded px-1 py-1 text-white text-xs focus:outline-none focus:border-orange-500/50"
                                >
                                  <option value={10}>10%</option>
                                  <option value={5}>5%</option>
                                  <option value={0}>0% Exenta</option>
                                </select>
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
                          {(() => {
                            const totalItems = compraForm.items.reduce((s, it) => s + (parseFloat(it.subtotal) || 0), 0);
                            const totalIva = compraForm.items.reduce((s, it) => s + calcItemIva(it, compraForm.moneda), 0);
                            const fmtV = (n) => compraForm.moneda === "USD" ? `USD ${n.toFixed(2)}` : `₲ ${Math.round(n).toLocaleString("es-PY")}`;
                            return (
                              <>
                                <tr className="border-t border-white/10">
                                  <td colSpan={4} className="px-3 py-1.5 text-slate-400 text-xs text-right">IVA incluido</td>
                                  <td className="px-2 py-1.5 text-right text-slate-500 text-xs">{fmtV(totalIva)}</td>
                                  <td></td>
                                </tr>
                                <tr>
                                  <td colSpan={4} className="px-3 py-2 text-slate-300 text-xs text-right font-bold">TOTAL</td>
                                  <td className="px-2 py-2 text-right">
                                    <span className="text-white font-bold text-sm">{fmtV(totalItems)}</span>
                                  </td>
                                  <td></td>
                                </tr>
                              </>
                            );
                          })()}
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-slate-500 text-sm mb-2">Usá los botones de arriba para agregar ítems y calcular el total automáticamente.</p>
                      <p className="text-slate-600 text-xs mb-3">O ingresá el monto directamente si no necesitás detalle de ítems:</p>
                      <Input type="number" min="0" step="any" value={compraForm.monto_total}
                        onChange={e => setCompraForm(p => ({ ...p, monto_total: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white max-w-xs mx-auto" placeholder="Monto total" />
                    </div>
                  )}
                </div>

                {/* Afecta stock toggle — visible para admin o usuarios con permiso */}
                {(user?.role === "admin" || hasPermission("compras.afectar_stock")) && (
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
                )}

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

                {/* Cuenta bancaria — solo contado */}
                {compraForm.tipo_pago === "contado" && (
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Cuenta bancaria *</label>
                    {cuentasDisp.length > 0 ? (
                      <select
                        value={compraForm.cuenta_id}
                        onChange={e => {
                          const c = cuentasDisp.find(c => c.id === e.target.value);
                          setCompraForm(p => ({ ...p, cuenta_id: e.target.value, cuenta_nombre: c?.nombre || "" }));
                        }}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">Seleccionar cuenta...</option>
                        {cuentasDisp
                          .filter(c => !compraForm.logo_tipo || c.logo_tipo === compraForm.logo_tipo || c.logo_tipo === "arandujar")
                          .map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda}){c.es_predeterminada ? " ★" : ""}</option>)}
                      </select>
                    ) : (
                      <Input value={compraForm.cuenta_nombre}
                        onChange={e => setCompraForm(p => ({ ...p, cuenta_nombre: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white" placeholder="Nombre de la cuenta" />
                    )}
                  </div>
                )}

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

      {/* ═══ MODAL: Registrar pago a proveedor ════════════════════════════════ */}
      <AnimatePresence>
        {showPagoProvForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 overflow-y-auto"
            onClick={e => e.target === e.currentTarget && setShowPagoProvForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-md p-6 my-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-heading text-lg font-bold text-white">
                  {editingPagoProv ? "Editar pago a proveedor" : "Nuevo pago a proveedor"}
                </h3>
                <button onClick={() => { setShowPagoProvForm(false); setEditingPagoProv(null); setPagoProvForm(emptyPagoProvForm()); setComprasProvList([]); }} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handlePagoProveedor} className="space-y-4">
                {/* 1. Proveedor */}
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Proveedor *</label>
                  <select
                    value={pagoProvForm.proveedor_id}
                    onChange={e => {
                      const prov = listaProveedores.find(p => p.id === e.target.value);
                      setPagoProvForm(p => ({ ...p, proveedor_id: e.target.value, proveedor_nombre: prov?.nombre || "", compras_pagos: [] }));
                      fetchComprasProveedor(e.target.value);
                    }}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                    required
                  >
                    <option value="">Seleccionar proveedor...</option>
                    {listaProveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>

                {/* 2. Compras pendientes del proveedor */}
                {pagoProvForm.proveedor_id && (
                  <div>
                    <label className="text-slate-400 text-sm mb-2 flex items-center gap-2">
                      Compras pendientes
                      {loadingComprasProv && <Loader2 className="w-3 h-3 animate-spin" />}
                    </label>
                    {comprasProvList.length === 0 && !loadingComprasProv ? (
                      <div className="bg-arandu-dark border border-white/10 rounded-lg px-4 py-3 text-slate-500 text-sm">
                        Sin compras pendientes para este proveedor
                      </div>
                    ) : (
                      <div className="bg-arandu-dark border border-white/10 rounded-lg overflow-hidden divide-y divide-white/5">
                        {comprasProvList.map(c => {
                          const cpEntry = pagoProvForm.compras_pagos.find(cp => cp.compra_id === c.id);
                          const checked = !!cpEntry;
                          const saldoMax = c.saldo_pendiente || c.monto_total || 0;
                          return (
                            <div key={c.id} className={`px-3 py-2.5 transition-all ${checked ? "bg-violet-500/5" : ""}`}>
                              {/* Fila superior: checkbox + info compra */}
                              <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={checked}
                                  onChange={() => {
                                    if (checked) {
                                      setPagoProvForm(p => ({ ...p, compras_pagos: p.compras_pagos.filter(cp => cp.compra_id !== c.id) }));
                                    } else {
                                      setPagoProvForm(p => ({ ...p, compras_pagos: [...p.compras_pagos, { compra_id: c.id, monto_pagado: saldoMax }] }));
                                    }
                                  }}
                                  className="w-4 h-4 accent-violet-500 flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-xs font-medium">{c.fecha} · {c.numero_factura ? `Fac. ${c.numero_factura}` : "Sin factura"}</p>
                                  <p className="text-slate-500 text-xs">{c.notas || c.items?.[0]?.descripcion || "Sin descripción"}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-slate-400 text-xs">Saldo: <span className="text-violet-300 font-bold">{fmt(saldoMax, c.moneda)}</span></p>
                                  <p className="text-slate-600 text-xs capitalize">{c.estado_pago}</p>
                                </div>
                              </label>

                              {/* Fila inferior: input de monto a pagar (solo si está seleccionada) */}
                              {checked && (
                                <div className="mt-2 ml-7 flex items-center gap-2">
                                  <span className="text-slate-500 text-xs whitespace-nowrap">Pagar:</span>
                                  <input
                                    type="number"
                                    min="0.01"
                                    max={saldoMax}
                                    step="any"
                                    value={cpEntry.monto_pagado}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                      const val = Math.min(Number(e.target.value) || 0, saldoMax);
                                      setPagoProvForm(p => ({
                                        ...p,
                                        compras_pagos: p.compras_pagos.map(cp =>
                                          cp.compra_id === c.id ? { ...cp, monto_pagado: Number(e.target.value) || 0 } : cp
                                        )
                                      }));
                                    }}
                                    onBlur={e => {
                                      // Al salir del campo, asegurar que no supere el saldo
                                      const val = Math.min(Number(e.target.value) || 0, saldoMax);
                                      setPagoProvForm(p => ({
                                        ...p,
                                        compras_pagos: p.compras_pagos.map(cp =>
                                          cp.compra_id === c.id ? { ...cp, monto_pagado: val } : cp
                                        )
                                      }));
                                    }}
                                    className="flex-1 bg-arandu-dark-light border border-violet-500/30 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
                                  />
                                  <span className="text-slate-600 text-xs">{c.moneda}</span>
                                  {cpEntry.monto_pagado < saldoMax && (
                                    <span className="text-amber-400 text-xs whitespace-nowrap">
                                      queda {fmt(saldoMax - (Number(cpEntry.monto_pagado) || 0), c.moneda)}
                                    </span>
                                  )}
                                  {cpEntry.monto_pagado >= saldoMax && (
                                    <span className="text-emerald-400 text-xs">✓ total</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Resumen total a pagar */}
                    {pagoProvForm.compras_pagos.length > 0 && (() => {
                      const monedaC = comprasProvList.find(c => c.id === pagoProvForm.compras_pagos[0]?.compra_id)?.moneda || "USD";
                      const totalC = pagoProvForm.compras_pagos.reduce((s, cp) => s + (Number(cp.monto_pagado) || 0), 0);
                      const totalSaldo = comprasProvList
                        .filter(c => pagoProvForm.compras_pagos.some(cp => cp.compra_id === c.id))
                        .reduce((s, c) => s + (c.saldo_pendiente || c.monto_total || 0), 0);
                      const esParcial = totalC < totalSaldo;
                      return (
                        <div className={`mt-2 rounded-lg px-4 py-2.5 flex justify-between items-center border ${esParcial ? "bg-amber-500/10 border-amber-500/30" : "bg-violet-500/10 border-violet-500/30"}`}>
                          <div>
                            <span className={`text-sm font-medium ${esParcial ? "text-amber-300" : "text-violet-300"}`}>
                              {pagoProvForm.compras_pagos.length} compra{pagoProvForm.compras_pagos.length > 1 ? "s" : ""} · {esParcial ? "Pago parcial" : "Pago total"}
                            </span>
                            {esParcial && (
                              <p className="text-xs text-amber-500 mt-0.5">Quedará saldo pendiente en algunas compras</p>
                            )}
                          </div>
                          <span className={`font-heading font-bold text-lg ${esParcial ? "text-amber-200" : "text-violet-200"}`}>
                            {fmt(totalC, monedaC)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 3. Cuenta bancaria (solo si hay compras seleccionadas) */}
                {pagoProvForm.compras_pagos.length > 0 && (
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Cuenta bancaria *</label>
                    <select
                      value={pagoProvForm.cuenta_id}
                      onChange={e => {
                        const c = cuentasDisp.find(c => c.id === e.target.value);
                        setPagoProvForm(p => ({ ...p, cuenta_id: e.target.value, cuenta_nombre: c?.nombre || "", cuenta_moneda: c?.moneda || "PYG", tipo_cambio: "" }));
                      }}
                      className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                      required
                    >
                      <option value="">Seleccionar cuenta...</option>
                      {cuentasDisp.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda}){c.es_predeterminada ? " ★" : ""}</option>)}
                    </select>
                  </div>
                )}

                {/* 4. Tipo de cambio (si moneda compra ≠ moneda cuenta) */}
                {pagoProvForm.cuenta_id && pagoProvForm.compras_pagos.length > 0 && (() => {
                  const firstCompra = comprasProvList.find(c => c.id === pagoProvForm.compras_pagos[0]?.compra_id);
                  const monedaC = firstCompra?.moneda || "USD";
                  const totalC = pagoProvForm.compras_pagos.reduce((s, cp) => s + (Number(cp.monto_pagado) || 0), 0);
                  const needsTc = monedaC !== pagoProvForm.cuenta_moneda;
                  if (!needsTc) return null;
                  const equiv = pagoProvForm.tipo_cambio ? totalC * Number(pagoProvForm.tipo_cambio) : null;
                  return (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-3">
                      <p className="text-amber-300 text-xs">Las compras son en <strong>{monedaC}</strong> pero la cuenta es en <strong>{pagoProvForm.cuenta_moneda}</strong> — ingresá el tipo de cambio.</p>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">Tipo de cambio (₲ por USD) *</label>
                        <input type="number" min="0" step="any" value={pagoProvForm.tipo_cambio}
                          onChange={e => setPagoProvForm(p => ({ ...p, tipo_cambio: e.target.value }))}
                          onFocus={e => e.target.select()}
                          className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                          placeholder="7500" required
                        />
                      </div>
                      {equiv && (
                        <div className="bg-arandu-dark rounded-lg px-3 py-2 flex justify-between text-sm">
                          <span className="text-slate-400">Monto a debitar de la cuenta:</span>
                          <span className="text-white font-bold">{fmt(Math.round(equiv), pagoProvForm.cuenta_moneda)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5. Fecha de pago */}
                {pagoProvForm.compras_pagos.length > 0 && (
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Fecha de pago * <span className="text-slate-600 text-xs">(es la fecha que afecta al balance)</span></label>
                    <input type="date" value={pagoProvForm.fecha_pago}
                      onChange={e => setPagoProvForm(p => ({ ...p, fecha_pago: e.target.value }))}
                      className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                      required
                    />
                  </div>
                )}

                {/* 6. Notas */}
                {pagoProvForm.compras_pagos.length > 0 && (
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Notas</label>
                    <input value={pagoProvForm.notas} onChange={e => setPagoProvForm(p => ({ ...p, notas: e.target.value }))}
                      className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50 placeholder-slate-600"
                      placeholder="Información adicional (opcional)" />
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setShowPagoProvForm(false); setEditingPagoProv(null); setPagoProvForm(emptyPagoProvForm()); setComprasProvList([]); }}
                    className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-400 text-sm hover:text-white transition-all">
                    Cancelar
                  </button>
                  <button type="submit"
                    disabled={pagoProvForm.compras_pagos.length === 0}
                    className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> {editingPagoProv ? "Actualizar pago" : "Registrar pago"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MODAL: Ver detalle de un pago a proveedor ════════════════════════ */}
      <AnimatePresence>
        {selectedPagoView && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setSelectedPagoView(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-sm p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-3 py-1 font-medium">
                  Pago a proveedor
                </span>
                <button onClick={() => setSelectedPagoView(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Proveedor + estado */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-400 text-xs">Proveedor</p>
                  <p className="text-white font-semibold truncate">{selectedPagoView.proveedor_nombre || selectedPagoView._proveedor_nombre}</p>
                </div>
                {selectedPagoView.estado && (
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${
                    { pagado:"bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                      pendiente:"bg-blue-500/15 text-blue-400 border-blue-500/30",
                      vencido:"bg-red-500/15 text-red-400 border-red-500/30"
                    }[selectedPagoView.estado] || ""
                  }`}>
                    {selectedPagoView.estado}
                  </span>
                )}
              </div>

              {/* Concepto */}
              <div className="bg-arandu-dark/60 border border-white/5 rounded-xl p-3 mb-4">
                <p className="text-slate-500 text-xs mb-0.5">Concepto</p>
                <p className="text-white text-sm font-medium">{selectedPagoView.concepto || "Sin concepto"}</p>
              </div>

              {/* Monto destacado */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 text-center mb-4">
                <p className="text-slate-400 text-xs mb-1">Monto</p>
                <p className="font-heading text-3xl font-bold text-emerald-400">
                  {fmt(selectedPagoView.monto, selectedPagoView.moneda)}
                </p>
                {selectedPagoView.moneda === "USD" && selectedPagoView.tipo_cambio && (
                  <p className="text-slate-500 text-xs mt-1">
                    TC: ₲ {Number(selectedPagoView.tipo_cambio).toLocaleString("es-PY")} / USD
                  </p>
                )}
                {selectedPagoView.moneda === "USD" && selectedPagoView.monto_gs && (
                  <p className="text-slate-400 text-sm mt-1">{fmtPYG(selectedPagoView.monto_gs)} equivalente</p>
                )}
              </div>

              {/* Grid de fechas + cuenta */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-arandu-dark/60 rounded-xl p-3">
                  <p className="text-slate-500 text-xs mb-0.5">Fecha vencimiento</p>
                  <p className="text-white text-sm font-medium">{selectedPagoView.fecha_vencimiento || "—"}</p>
                </div>
                <div className="bg-arandu-dark/60 rounded-xl p-3">
                  <p className="text-slate-500 text-xs mb-0.5">Fecha de pago</p>
                  <p className={`text-sm font-medium ${selectedPagoView.fecha_pago ? "text-emerald-400" : "text-slate-500"}`}>
                    {selectedPagoView.fecha_pago || "Pendiente"}
                  </p>
                </div>
                <div className="bg-arandu-dark/60 rounded-xl p-3">
                  <p className="text-slate-500 text-xs mb-0.5">Moneda</p>
                  <p className="text-white text-sm font-medium">{selectedPagoView.moneda === "USD" ? "Dólar (USD)" : "Guaraní (₲)"}</p>
                </div>
                <div className="bg-arandu-dark/60 rounded-xl p-3">
                  <p className="text-slate-500 text-xs mb-0.5">Cuenta de pago</p>
                  <p className="text-white text-sm font-medium capitalize">{selectedPagoView.cuenta_pago || "guaranies"}</p>
                </div>
              </div>

              {/* Notas */}
              {selectedPagoView.notas && (
                <div className="bg-arandu-dark/60 border border-white/5 rounded-xl p-3 mb-4">
                  <p className="text-slate-500 text-xs mb-1 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Notas
                  </p>
                  <p className="text-slate-300 text-sm">{selectedPagoView.notas}</p>
                </div>
              )}

              {/* Acción marcar pagado */}
              {(selectedPagoView.estado === "pendiente" || selectedPagoView.estado === "vencido") && (
                <button
                  onClick={() => { handleMarcarPagado(selectedPagoView.id); setSelectedPagoView(null); }}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-all flex items-center justify-center gap-2 mb-2"
                >
                  <Check className="w-4 h-4" /> Marcar como pagado
                </button>
              )}

              {/* Editar / Eliminar */}
              <div className="flex gap-2 mb-2">
                {hasPermission("pagos_proveedores.editar") && (
                  <button
                    onClick={() => openEditPagoProv(selectedPagoView)}
                    className="flex-1 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm hover:bg-yellow-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Edit className="w-4 h-4" /> Editar
                  </button>
                )}
                {hasPermission("pagos_proveedores.eliminar") && (
                  <button
                    onClick={() => handleDeletePagoProv(selectedPagoView.id)}
                    className="flex-1 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedPagoView(null)}
                className="w-full py-2.5 rounded-lg bg-arandu-dark border border-white/10 text-slate-400 text-sm hover:text-white transition-all"
              >
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EgresosPage;
