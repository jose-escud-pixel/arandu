import React, { useState, useEffect, useContext, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Edit2, Trash2, Search, X, Save,
  Package, AlertTriangle, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, RotateCcw, BarChart3, Tag
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGOS = [
  { value: "todas",     label: "Todas" },
  { value: "arandujar", label: "Arandu&JAR" },
  { value: "arandu",    label: "Arandu" },
  { value: "jar",       label: "JAR" },
];
const LOGO_CHIP = {
  arandujar: "bg-blue-600/20 text-blue-300 border-blue-600/30",
  arandu:    "bg-emerald-600/20 text-emerald-300 border-emerald-600/30",
  jar:       "bg-red-600/20 text-red-300 border-red-600/30",
};
const LOGO_LABEL = { arandujar: "A&JAR", arandu: "Arandu", jar: "JAR" };

const UNIDADES = ["unidad", "kg", "litro", "metro", "caja", "par", "rollo", "otro"];
const CATEGORIAS_PRODUCTO = [
  "Hardware", "Software", "Consumibles", "Mercaderías",
  "Repuestos", "Cables", "Accesorios", "Servicios", "Otro"
];
const IVA_OPCIONES = [
  { value: "exenta", label: "Exenta (0%)" },
  { value: "5",      label: "IVA 5%" },
  { value: "10",     label: "IVA 10%" },
];

const emptyForm = {
  nombre: "", descripcion: "", sku: "", categoria: "",
  precio_costo: "", ganancia_pct: "", precio_venta: "",
  stock_actual: "0", stock_minimo: "0",
  unidad: "unidad", logo_tipo: "arandujar", activo: true,
  iva_tipo: "10",
};

const emptyMov = { tipo: "entrada", cantidad: "", motivo: "ajuste_manual", precio_unitario: "", notas: "" };

function fmtPYG(n) {
  if (!n && n !== 0) return "-";
  if (n >= 1_000_000) return `₲ ${(n / 1_000_000).toFixed(2)}M`;
  return `₲ ${Number(n).toLocaleString("es-PY")}`;
}

function calcSugerido(costo, pct) {
  const c = parseFloat(costo);
  const p = parseFloat(pct);
  if (!c || isNaN(c) || c <= 0 || isNaN(p) || p < 0) return null;
  return Math.round(c * (1 + p / 100));
}

export default function ProductosPage() {
  const { token, hasPermission, user, activeEmpresaPropia } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [productos, setProductos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [chips, setChips] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Movimientos modal
  const [selectedProducto, setSelectedProducto] = useState(null);
  const [movimientos, setMovimientos]   = useState([]);
  const [showMovModal, setShowMovModal] = useState(false);
  const [showMovForm, setShowMovForm]   = useState(false);
  const [movForm, setMovForm]           = useState(emptyMov);
  const [savingMov, setSavingMov]       = useState(false);
  const [loadingMov, setLoadingMov]     = useState(false);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchProductos = async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (activeEmpresaPropia?.slug) q.set("logo_tipo", activeEmpresaPropia.slug);
    const res = await fetch(`${API}/admin/productos?${q}`, { headers });
    if (res.ok) setProductos(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchProductos(); }, [activeEmpresaPropia?.slug]); // eslint-disable-line

  // ── Derived from form ─────────────────────────────────────────
  const esServicio = formData.categoria === "Servicios";
  const puedeCrearServicio = hasPermission("inventario_productos.crear_servicio");
  const puedeStockInicial = hasPermission("inventario_productos.stock_inicial");

  const precioSugerido = calcSugerido(formData.precio_costo, formData.ganancia_pct);

  // Auto-fill precio_venta when ganancia_pct or precio_costo changes
  const handleGananciaChange = (val) => {
    const sugerido = calcSugerido(formData.precio_costo, val);
    setFormData(f => ({
      ...f,
      ganancia_pct: val,
      ...(sugerido !== null ? { precio_venta: String(sugerido) } : {}),
    }));
  };
  const handleCostoChange = (val) => {
    const sugerido = calcSugerido(val, formData.ganancia_pct);
    setFormData(f => ({
      ...f,
      precio_costo: val,
      ...(sugerido !== null ? { precio_venta: String(sugerido) } : {}),
    }));
  };
  const handleCategoriaChange = (val) => {
    setFormData(f => ({
      ...f,
      categoria: val,
      // Si es Servicios, limpiar stock
      ...(val === "Servicios" ? { stock_actual: "0", stock_minimo: "0" } : {}),
    }));
  };

  // ── Form ─────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setFormData({ ...emptyForm, logo_tipo: activeEmpresaPropia?.slug || "arandujar" });
    setShowForm(true);
  };

  useEffect(() => {
    if (searchParams.get("nuevo") !== "producto") return;
    if (hasPermission("inventario_productos.crear")) openNew();
    const next = new URLSearchParams(searchParams);
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
  }, [searchParams]); // eslint-disable-line

  const openEdit = (p) => {
    setEditingId(p.id);
    setFormData({
      nombre: p.nombre,
      descripcion: p.descripcion || "",
      sku: p.sku || "",
      categoria: p.categoria || "",
      precio_costo: String(p.precio_costo || ""),
      ganancia_pct: "",
      precio_venta: String(p.precio_venta || ""),
      stock_actual: String(p.stock_actual || 0),
      stock_minimo: String(p.stock_minimo || 0),
      unidad: p.unidad || "unidad",
      logo_tipo: p.logo_tipo || "arandujar",
      activo: p.activo,
      iva_tipo: p.iva_tipo || "10",
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    // Validación frontend: Servicios requiere permiso
    if (formData.categoria === "Servicios" && !puedeCrearServicio) {
      toast.error("No tenés permiso para crear productos de tipo Servicios");
      return;
    }
    // SKU requerido
    if (!formData.sku?.trim()) {
      toast.error("El SKU es obligatorio");
      return;
    }

    setSaving(true);
    const isServicio = formData.categoria === "Servicios";
    const payload = {
      nombre: formData.nombre,
      descripcion: formData.descripcion || null,
      sku: formData.sku.trim(),
      categoria: formData.categoria || null,
      precio_costo: parseFloat(formData.precio_costo) || 0,
      precio_venta: parseFloat(formData.precio_venta) || 0,
      stock_minimo: isServicio ? 0 : (parseFloat(formData.stock_minimo) || 0),
      unidad: formData.unidad,
      logo_tipo: activeEmpresaPropia?.slug || formData.logo_tipo,
      activo: formData.activo,
      iva_tipo: formData.iva_tipo || "10",
      ...(!editingId && { stock_actual: isServicio ? 0 : (parseFloat(formData.stock_actual) || 0) }),
    };
    const url    = editingId ? `${API}/admin/productos/${editingId}` : `${API}/admin/productos`;
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(editingId ? "Producto actualizado" : "Producto creado");
      setShowForm(false);
      fetchProductos();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al guardar");
    }
    setSaving(false);
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`¿Eliminar producto "${p.nombre}"? Se eliminarán sus movimientos de stock.`)) return;
    const res = await fetch(`${API}/admin/productos/${p.id}`, { method: "DELETE", headers });
    if (res.ok) { toast.success("Producto eliminado"); fetchProductos(); }
    else toast.error("Error al eliminar");
  };

  // ── Movimientos ───────────────────────────────────────────────
  const openMovimientos = async (p) => {
    setSelectedProducto(p);
    setShowMovModal(true);
    setShowMovForm(false);
    setLoadingMov(true);
    const res = await fetch(`${API}/admin/productos/${p.id}/movimientos`, { headers });
    if (res.ok) setMovimientos(await res.json());
    setLoadingMov(false);
  };

  const handleSaveMov = async (e) => {
    e.preventDefault();
    if (!movForm.cantidad || parseFloat(movForm.cantidad) <= 0) {
      toast.error("Ingresá una cantidad válida"); return;
    }
    setSavingMov(true);
    const payload = {
      tipo: movForm.tipo,
      cantidad: parseFloat(movForm.cantidad),
      motivo: movForm.motivo,
      precio_unitario: movForm.precio_unitario ? parseFloat(movForm.precio_unitario) : null,
      notas: movForm.notas || null,
    };
    const res = await fetch(`${API}/admin/productos/${selectedProducto.id}/movimiento`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("Movimiento registrado");
      setShowMovForm(false);
      setMovForm(emptyMov);
      const logoParam = activeEmpresaPropia?.slug ? `logo_tipo=${activeEmpresaPropia.slug}` : "";
      const [rP, rM] = await Promise.all([
        fetch(`${API}/admin/productos?${logoParam}`, { headers }),
        fetch(`${API}/admin/productos/${selectedProducto.id}/movimientos`, { headers }),
      ]);
      if (rP.ok) setProductos(await rP.json());
      if (rM.ok) {
        const movs = await rM.json();
        setMovimientos(movs);
        const updated = await fetch(`${API}/admin/productos/${selectedProducto.id}`, { headers })
          .then(r => r.json()).catch(() => null);
        if (updated) setSelectedProducto(updated);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al registrar movimiento");
    }
    setSavingMov(false);
  };

  // ── Derived ───────────────────────────────────────────────────
  const stockBajo = productos.filter(p =>
    p.categoria !== "Servicios" && p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo
  ).length;
  const filteredProductos = productos.filter(p => {
    const active = [...chips, search].filter(Boolean);
    if (active.length === 0) return true;
    const text = [p.nombre, p.descripcion, p.sku, p.categoria, p.unidad, p.logo_tipo,
      String(p.stock_actual || ""), String(p.precio_venta || ""),
      p.activo ? "activo" : "inactivo", p.iva_tipo
    ].filter(Boolean).join(" ").toLowerCase();
    return active.every(ch => text.includes(String(ch).toLowerCase()));
  });
  const addChip = () => {
    const v = search.trim();
    if (v && !chips.includes(v)) setChips(prev => [...prev, v]);
    setSearch("");
  };

  const ivaLabel = { exenta: "Exenta", "5": "IVA 5%", "10": "IVA 10%" };

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/sistema" className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-heading text-2xl text-white flex items-center gap-2">
              <Package className="w-6 h-6 text-cyan-400" />
              Inventario Productos
            </h1>
            <p className="text-slate-400 text-sm font-body">Catálogo · Stock · Precios</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {stockBajo > 0 && (
            <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/25 font-body">
              <AlertTriangle className="w-3.5 h-3.5" />
              {stockBajo} bajo mínimo
            </span>
          )}
          {hasPermission("inventario_productos.crear") && (
            <button onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-body text-sm">
              <Plus className="w-4 h-4" /> Nuevo producto
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[260px] bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <div className="flex flex-wrap gap-2 mb-2">
              {chips.map(ch => (
                <span key={ch} className="inline-flex items-center gap-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 rounded-full px-2 py-0.5 text-xs">
                  {ch}
                  <button onClick={() => setChips(prev => prev.filter(x => x !== ch))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <Search className="absolute left-3 bottom-2.5 w-4 h-4 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addChip(); } }}
              placeholder="Buscar por nombre, SKU, categoria, precio, stock... (Enter para agregar filtro)"
              className="w-full bg-transparent pl-6 text-white text-sm font-body focus:outline-none" />
          </div>
          <span className="text-slate-500 text-sm font-body ml-auto">
            {filteredProductos.length} producto{filteredProductos.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="text-center py-12 text-slate-500 animate-pulse font-body">Cargando productos...</div>
        ) : filteredProductos.length === 0 ? (
          <div className="text-center py-16 text-slate-500 font-body">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{search ? "Sin coincidencias" : "No hay productos registrados"}</p>
            {hasPermission("inventario_productos.crear") && !search && (
              <button onClick={openNew} className="mt-3 text-cyan-400 hover:underline text-sm">
                Agregar el primer producto
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Producto</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs hidden md:table-cell">Categoría</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Precio costo</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Precio venta</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Margen</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Stock</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Empresa</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProductos.map(p => {
                  const margen = p.precio_costo > 0
                    ? ((p.precio_venta - p.precio_costo) / p.precio_costo * 100).toFixed(0)
                    : null;
                  const bajominimo = p.categoria !== "Servicios" && p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo;
                  const esServ = p.categoria === "Servicios";
                  return (
                    <tr key={p.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${!p.activo ? "opacity-40" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{p.nombre}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.sku && <span className="text-[10px] text-slate-500 font-mono">#{p.sku}</span>}
                          {p.iva_tipo && p.iva_tipo !== "10" && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                              p.iva_tipo === "exenta"
                                ? "bg-slate-500/20 text-slate-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}>
                              {ivaLabel[p.iva_tipo] || p.iva_tipo}
                            </span>
                          )}
                          {p.descripcion && <span className="text-slate-500 text-xs truncate max-w-[200px]">{p.descripcion}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {p.categoria ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            esServ
                              ? "bg-violet-500/15 text-violet-300 border border-violet-500/25"
                              : "bg-white/10 text-slate-300"
                          }`}>
                            {p.categoria}
                          </span>
                        ) : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{fmtPYG(p.precio_costo)}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">{fmtPYG(p.precio_venta)}</td>
                      <td className="px-4 py-3 text-right">
                        {margen !== null ? (
                          <span className={`text-xs font-semibold ${Number(margen) >= 20 ? "text-emerald-300" : Number(margen) >= 0 ? "text-amber-300" : "text-red-300"}`}>
                            {margen}%
                          </span>
                        ) : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {esServ ? (
                          <span className="text-xs text-slate-500 italic">Servicio</span>
                        ) : (
                          <>
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                              bajominimo ? "bg-orange-500/15 text-orange-300 border border-orange-500/25"
                              : p.stock_actual === 0 ? "bg-red-500/15 text-red-300 border border-red-500/25"
                              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                            }`}>
                              {bajominimo && <AlertTriangle className="w-3 h-3" />}
                              {p.stock_actual} {p.unidad}
                            </div>
                            {p.stock_minimo > 0 && (
                              <p className="text-slate-600 text-[10px] mt-0.5">mín. {p.stock_minimo}</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.logo_tipo && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${LOGO_CHIP[p.logo_tipo] || "bg-white/10 text-slate-300 border-white/10"}`}>
                            {LOGO_LABEL[p.logo_tipo] || p.logo_tipo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {!esServ && (
                            <button onClick={() => openMovimientos(p)} title="Ver movimientos / ajustar stock"
                              className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                              <BarChart3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {hasPermission("inventario_productos.editar") && (
                            <button onClick={() => openEdit(p)} title="Editar"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {hasPermission("inventario_productos.eliminar") && (
                            <button onClick={() => handleDelete(p)} title="Eliminar"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
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

      {/* ── Formulario ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="font-heading text-base text-white">{editingId ? "Editar producto" : "Nuevo producto"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Nombre *</label>
                <input required value={formData.nombre}
                  onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500" />
              </div>

              {/* SKU + Categoría */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">SKU *</label>
                  <input required value={formData.sku}
                    onChange={e => setFormData(f => ({ ...f, sku: e.target.value }))}
                    placeholder="Código único"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Categoría</label>
                  <select value={formData.categoria} onChange={e => handleCategoriaChange(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-slate-300 text-sm font-body focus:outline-none focus:border-cyan-500">
                    <option value="">Sin categoría</option>
                    {CATEGORIAS_PRODUCTO.map(c => (
                      <option key={c} value={c} disabled={c === "Servicios" && !puedeCrearServicio}>
                        {c}{c === "Servicios" && !puedeCrearServicio ? " (sin permiso)" : ""}
                      </option>
                    ))}
                  </select>
                  {esServicio && !puedeCrearServicio && (
                    <p className="text-red-400 text-[10px] mt-1">No tenés permiso para crear servicios</p>
                  )}
                </div>
              </div>

              {/* Alerta Servicios */}
              {esServicio && (
                <div className="bg-violet-500/10 border border-violet-500/25 rounded-lg px-3 py-2 text-violet-300 text-xs font-body">
                  Los servicios no afectan stock y no llevan stock mínimo.
                </div>
              )}

              {/* IVA */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Tipo de IVA
                </label>
                <div className="flex gap-2">
                  {IVA_OPCIONES.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFormData(f => ({ ...f, iva_tipo: opt.value }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-body border transition-colors ${
                        formData.iva_tipo === opt.value
                          ? "bg-cyan-600/30 border-cyan-500 text-cyan-200"
                          : "bg-white/5 border-white/10 text-slate-400 hover:border-white/25"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Precios */}
              <div className="border border-white/10 rounded-xl p-4 space-y-3 bg-white/3">
                <p className="text-slate-400 text-xs font-body font-semibold">Precios</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-body">Precio costo (₲)</label>
                    <input type="number" min="0" value={formData.precio_costo}
                      onChange={e => handleCostoChange(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-body">% Ganancia</label>
                    <input type="number" min="0" step="0.01" value={formData.ganancia_pct}
                      onChange={e => handleGananciaChange(e.target.value)}
                      placeholder="Ej: 30"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500" />
                  </div>
                </div>
                {precioSugerido !== null && (
                  <div className="flex items-center gap-2 text-xs font-body">
                    <span className="text-slate-500">Precio sugerido:</span>
                    <span className="text-emerald-300 font-semibold">₲ {precioSugerido.toLocaleString("es-PY")}</span>
                    <button type="button"
                      onClick={() => setFormData(f => ({ ...f, precio_venta: String(precioSugerido) }))}
                      className="ml-auto text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded hover:bg-emerald-500/25 transition-colors">
                      Aplicar
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Precio venta (₲)</label>
                  <input type="number" min="0" value={formData.precio_venta}
                    onChange={e => setFormData(f => ({ ...f, precio_venta: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500" />
                </div>
              </div>

              {/* Unidad */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Unidad</label>
                <select value={formData.unidad} onChange={e => setFormData(f => ({ ...f, unidad: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-slate-300 text-sm font-body focus:outline-none focus:border-cyan-500">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Stock — ocultar para Servicios */}
              {!esServicio && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-body">Stock mínimo</label>
                    <input type="number" min="0" value={formData.stock_minimo}
                      onChange={e => setFormData(f => ({ ...f, stock_minimo: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500" />
                  </div>
                  {!editingId && puedeStockInicial && (
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-body">Stock inicial</label>
                      <input type="number" min="0" value={formData.stock_actual}
                        onChange={e => setFormData(f => ({ ...f, stock_actual: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500" />
                    </div>
                  )}
                </div>
              )}

              {/* Descripción */}
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Descripción</label>
                <textarea value={formData.descripcion}
                  onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-cyan-500 resize-none" />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-body text-sm disabled:opacity-60">
                  <Save className="w-4 h-4" /> {saving ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm">
                  Cancelar
                </button>
                {editingId && (
                  <label className="flex items-center gap-2 ml-auto cursor-pointer">
                    <span className="text-slate-400 text-xs font-body">Activo</span>
                    <input type="checkbox" checked={formData.activo}
                      onChange={e => setFormData(f => ({ ...f, activo: e.target.checked }))}
                      className="rounded" />
                  </label>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Movimientos ───────────────────────────────────── */}
      {showMovModal && selectedProducto && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="font-heading text-base text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  {selectedProducto.nombre}
                </h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-sm font-semibold ${
                    selectedProducto.stock_actual === 0 ? "text-red-300"
                    : (selectedProducto.stock_minimo > 0 && selectedProducto.stock_actual <= selectedProducto.stock_minimo) ? "text-orange-300"
                    : "text-emerald-300"
                  }`}>
                    Stock actual: {selectedProducto.stock_actual} {selectedProducto.unidad}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasPermission("inventario_productos.editar") && (
                  <button onClick={() => setShowMovForm(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-body text-xs">
                    <Plus className="w-3.5 h-3.5" /> Ajuste manual
                  </button>
                )}
                <button onClick={() => setShowMovModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Form ajuste manual */}
              {showMovForm && (
                <form onSubmit={handleSaveMov} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <p className="text-slate-300 text-xs font-body font-semibold">Ajuste de stock manual</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-body">Tipo</label>
                      <select value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-2 py-2 text-white text-sm font-body focus:outline-none">
                        <option value="entrada">↑ Entrada</option>
                        <option value="salida">↓ Salida</option>
                        <option value="ajuste">= Ajuste absoluto</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-body">Cantidad *</label>
                      <input required type="number" min="0.01" step="0.01" value={movForm.cantidad}
                        onChange={e => setMovForm(f => ({ ...f, cantidad: e.target.value }))}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-2 py-2 text-white text-sm font-body focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-body">Precio unit. (₲)</label>
                      <input type="number" min="0" value={movForm.precio_unitario}
                        onChange={e => setMovForm(f => ({ ...f, precio_unitario: e.target.value }))}
                        className="w-full bg-arandu-dark border border-white/10 rounded-lg px-2 py-2 text-white text-sm font-body focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-body">Notas</label>
                    <input value={movForm.notas} onChange={e => setMovForm(f => ({ ...f, notas: e.target.value }))}
                      placeholder="Ej: Corrección inventario físico..."
                      className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingMov}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-body text-xs disabled:opacity-60">
                      <Save className="w-3.5 h-3.5" /> {savingMov ? "Guardando..." : "Registrar"}
                    </button>
                    <button type="button" onClick={() => setShowMovForm(false)}
                      className="px-4 py-1.5 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-xs">
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {/* Historial */}
              <div>
                <h3 className="text-slate-400 text-xs font-body font-semibold mb-2">Historial de movimientos</h3>
                {loadingMov ? (
                  <div className="text-center py-8 text-slate-500 animate-pulse font-body">Cargando...</div>
                ) : movimientos.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 font-body text-sm">Sin movimientos registrados</div>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {movimientos.map(m => (
                      <div key={m.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${
                            m.tipo === "entrada" ? "bg-emerald-500/20" : m.tipo === "salida" ? "bg-red-500/20" : "bg-blue-500/20"
                          }`}>
                            {m.tipo === "entrada"
                              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                              : m.tipo === "salida"
                              ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                              : <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                            }
                          </div>
                          <div>
                            <p className="text-white text-xs font-body">
                              <span className={`font-semibold ${
                                m.tipo === "entrada" ? "text-emerald-300" : m.tipo === "salida" ? "text-red-300" : "text-blue-300"
                              }`}>
                                {m.tipo === "entrada" ? "+" : m.tipo === "salida" ? "-" : "="}{m.cantidad}
                              </span>
                              {" "}{selectedProducto.unidad}
                              {m.motivo && <span className="text-slate-500 ml-1.5">({m.motivo.replace(/_/g, " ")})</span>}
                            </p>
                            {m.notas && <p className="text-slate-500 text-[10px]">{m.notas}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-400 text-xs">{m.stock_anterior} → <span className="text-white font-semibold">{m.stock_nuevo}</span></p>
                          <p className="text-slate-600 text-[10px]">{m.fecha} · {m.usuario_nombre || ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
