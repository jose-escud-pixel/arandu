import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../App";
import { toast } from "sonner";
import EmpresaSwitcher from "../components/EmpresaSwitcher";
import {
  ArrowLeft, Plus, Edit2, Trash2, Search, X, Save, Truck,
  ToggleLeft, ToggleRight, Phone, Mail, Tag, CheckCircle,
  Calendar, ChevronDown, ChevronLeft, ChevronRight
} from "lucide-react";

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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIAS = ["Hardware", "Software", "Servicios", "Telecom", "Impresión", "Eléctrico", "Otro"];

function fmt(n, moneda = "PYG") {
  if (n == null) return "-";
  if (moneda === "USD") return `$${Number(n).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

function fmtCompact(n) {
  if (!n) return "₲ 0";
  if (n >= 1_000_000) return `₲ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₲ ${Math.round(n / 1_000)}K`;
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

export default function ProveedoresPage() {
  const { token, hasPermission, activeEmpresaPropia } = useContext(AuthContext);

  // Estas deben ir ANTES de los useState que las usan
  const logoActivo = activeEmpresaPropia?.slug || "arandujar";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const emptyForm = () => ({
    nombre: "", ruc: "", contacto: "", telefono: "", email: "",
    direccion: "", categoria: "", notas: "", activo: true,
    logo_tipo: logoActivo,
  });

  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [showInactive, setShowInactive] = useState(false);
  const [comprasResumen, setComprasResumen] = useState({});
  const [pagosProvMap, setPagosProvMap] = useState({}); // proveedor_id → monto pagado directo

  // Filtro de período
  const [filtroTipo, setFiltroTipo] = useState("todos"); // "todos" | "mes" | "anio"
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));

  const fetchProveedores = async () => {
    const params = new URLSearchParams();
    if (activeEmpresaPropia?.slug) params.set("logo_tipo", activeEmpresaPropia.slug);
    const res = await fetch(`${API}/admin/proveedores?${params}`, { headers });
    if (res.ok) setProveedores(await res.json());
    setLoading(false);
  };

  const fetchComprasResumen = async () => {
    try {
      const params = new URLSearchParams();
      if (filtroTipo === "mes" && mes) params.set("mes", mes);
      if (filtroTipo === "anio" && anio) params.set("anio", anio);
      if (activeEmpresaPropia?.slug) params.set("logo_tipo", activeEmpresaPropia.slug);
      const res = await fetch(`${API}/admin/compras/resumen/por-proveedor?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const map = {};
        data.forEach(r => {
          if (r.proveedor_id) map[r.proveedor_id] = r;
          else if (r.proveedor_nombre) map[r.proveedor_nombre] = r;
        });
        setComprasResumen(map);
      }
    } catch (_) {}
  };

  const fetchPagosProvResumen = async () => {
    try {
      const params = new URLSearchParams();
      if (activeEmpresaPropia?.slug) params.set("logo_tipo", activeEmpresaPropia.slug);
      const res = await fetch(`${API}/admin/pagos-proveedores?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Sumar montos pagados (fecha_pago set = pagado) por proveedor_id
        const map = {};
        data.forEach(p => {
          if (!p.fecha_pago) return; // solo pagados
          const key = p.proveedor_id || p.proveedor_nombre;
          if (!key) return;
          // Convertir a PYG si es USD
          let montoGs = p.monto || 0;
          if (p.moneda === "USD") {
            montoGs = p.monto_gs || (p.monto * (p.tipo_cambio || 1));
          }
          map[key] = (map[key] || 0) + montoGs;
        });
        setPagosProvMap(map);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchProveedores();
    fetchComprasResumen();
    fetchPagosProvResumen();
  }, [activeEmpresaPropia]); // eslint-disable-line

  useEffect(() => {
    fetchComprasResumen();
  }, [filtroTipo, mes, anio]); // eslint-disable-line

  const filtered = proveedores.filter(p => {
    if (!showInactive && !p.activo) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.nombre || "").toLowerCase().includes(q) ||
      (p.ruc || "").toLowerCase().includes(q) ||
      (p.contacto || "").toLowerCase().includes(q) ||
      (p.categoria || "").toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditingId(null);
    setFormData({ ...emptyForm(), logo_tipo: logoActivo });
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setFormData({
      nombre: p.nombre, ruc: p.ruc || "", contacto: p.contacto || "",
      telefono: p.telefono || "", email: p.email || "",
      direccion: p.direccion || "", categoria: p.categoria || "",
      notas: p.notas || "", activo: p.activo,
      logo_tipo: p.logo_tipo || logoActivo,
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      logo_tipo: logoActivo,
      ruc: formData.ruc || null, contacto: formData.contacto || null,
      telefono: formData.telefono || null, email: formData.email || null,
      direccion: formData.direccion || null, categoria: formData.categoria || null,
      notas: formData.notas || null,
    };
    const url = editingId ? `${API}/admin/proveedores/${editingId}` : `${API}/admin/proveedores`;
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(editingId ? "Proveedor actualizado" : "Proveedor creado");
      setShowForm(false);
      fetchProveedores();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Error al guardar");
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`¿Eliminar proveedor "${p.nombre}"?`)) return;
    const res = await fetch(`${API}/admin/proveedores/${p.id}`, { method: "DELETE", headers });
    if (res.ok) { toast.success("Proveedor eliminado"); fetchProveedores(); }
  };

  const handleToggle = async (p) => {
    const payload = {
      ...p, activo: !p.activo,
      ruc: p.ruc || null, contacto: p.contacto || null,
      telefono: p.telefono || null, email: p.email || null,
      direccion: p.direccion || null, categoria: p.categoria || null,
      notas: p.notas || null, logo_tipo: p.logo_tipo || null,
    };
    const res = await fetch(`${API}/admin/proveedores/${p.id}`, { method: "PUT", headers, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(p.activo ? "Proveedor desactivado" : "Proveedor activado");
      fetchProveedores();
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-arandu-dark flex items-center justify-center">
      <div className="text-arandu-blue-light animate-pulse font-heading text-xl">Cargando proveedores...</div>
    </div>
  );

  const ANIOS = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-heading text-2xl text-white">Proveedores</h1>
            <p className="text-slate-400 text-sm font-body">Gestión de proveedores y vendedores</p>
          </div>
          <EmpresaSwitcher compact />
        </div>
        {hasPermission("proveedores.crear") && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo proveedor
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">

        {/* Filtro de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 text-xs font-body">Período:</span>
          {[
            { v: "todos", label: "Todo el tiempo" },
            { v: "mes",   label: "Por mes" },
            { v: "anio",  label: "Por año" },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setFiltroTipo(opt.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium border transition-all ${
                filtroTipo === opt.v
                  ? "bg-arandu-blue border-arandu-blue text-white"
                  : "border-white/10 text-slate-400 hover:text-white bg-white/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {filtroTipo === "mes" && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-1 py-0.5">
              <button onClick={() => setMes(prevMes(mes))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-white text-xs font-medium min-w-[80px] text-center px-1">{mesLabel(mes)}</span>
              <button onClick={() => setMes(nextMes(mes))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {filtroTipo === "anio" && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-1 py-0.5">
              <button onClick={() => setAnio(a => String(parseInt(a) - 1))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-white text-xs font-medium min-w-[50px] text-center px-1">{anio}</span>
              <button onClick={() => setAnio(a => String(parseInt(a) + 1))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Búsqueda + inactivos */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proveedor..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
            />
          </div>
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-body border transition-colors ${
              showInactive ? "border-arandu-blue bg-arandu-blue/10 text-arandu-blue-light" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Ver inactivos
          </button>
          <span className="text-slate-500 text-sm font-body">{filtered.length} proveedor{filtered.length !== 1 ? "es" : ""}</span>
        </div>

        {/* Tabla */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 font-body">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{search ? "No hay proveedores que coincidan" : "No hay proveedores registrados"}</p>
            {hasPermission("proveedores.crear") && !search && (
              <button onClick={openNew} className="mt-3 text-arandu-blue-light hover:underline text-sm">
                Agregar el primer proveedor
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Proveedor</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs hidden md:table-cell">Categoría</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs hidden lg:table-cell">Contacto</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Compras</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Total comprado</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Deuda actual</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Total pagado</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium text-xs">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const cr = comprasResumen[p.id] || comprasResumen[p.nombre];
                  // Total pagado = pagos de compras (contado + créditos saldados) + pagos directos registrados
                  const comprasPagado = cr ? (cr.total_comprado || 0) - (cr.deuda_actual || 0) : 0;
                  const directPagado = (pagosProvMap[p.id] || pagosProvMap[p.nombre]) || 0;
                  const totalPagado = (cr != null || directPagado > 0) ? comprasPagado + directPagado : null;
                  return (
                    <tr key={p.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${!p.activo ? "opacity-40" : ""}`}>

                      {/* Nombre */}
                      <td className="px-4 py-3">
                        <p className="text-white font-medium leading-tight">{p.nombre}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {p.ruc && <span className="text-slate-500 text-xs">RUC: {p.ruc}</span>}
                          {!p.activo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-500">Inactivo</span>
                          )}
                        </div>
                      </td>

                      {/* Categoría */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {p.categoria ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-arandu-blue/15 text-arandu-blue-light border border-arandu-blue/20">
                            {p.categoria}
                          </span>
                        ) : <span className="text-slate-600">-</span>}
                      </td>

                      {/* Contacto */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="text-xs text-slate-400 space-y-0.5">
                          {p.contacto && <p className="flex items-center gap-1"><Tag className="w-3 h-3" />{p.contacto}</p>}
                          {p.telefono && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefono}</p>}
                          {p.email && <p className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</p>}
                          {!p.contacto && !p.telefono && !p.email && <span className="text-slate-600">-</span>}
                        </div>
                      </td>

                      {/* Cantidad compras */}
                      <td className="px-4 py-3 text-center">
                        {cr ? (
                          <span className="text-blue-300 font-heading font-semibold">{cr.cantidad_compras}</span>
                        ) : <span className="text-slate-600 text-xs">-</span>}
                      </td>

                      {/* Total comprado */}
                      <td className="px-4 py-3 text-right">
                        {cr ? (
                          <span className="text-slate-200 font-medium">{fmtCompact(cr.total_comprado)}</span>
                        ) : <span className="text-slate-600 text-xs">-</span>}
                      </td>

                      {/* Deuda actual */}
                      <td className="px-4 py-3 text-right">
                        {cr ? (
                          cr.deuda_actual > 0 ? (
                            <span className="text-orange-300 font-semibold">{fmtCompact(cr.deuda_actual)}</span>
                          ) : (
                            <span className="text-green-400 text-xs flex items-center justify-end gap-1">
                              <CheckCircle className="w-3 h-3" /> Al día
                            </span>
                          )
                        ) : <span className="text-slate-600 text-xs">-</span>}
                      </td>

                      {/* Total pagado */}
                      <td className="px-4 py-3 text-right">
                        {totalPagado != null ? (
                          <span className="text-emerald-300 font-medium text-xs">{fmt(totalPagado)}</span>
                        ) : <span className="text-slate-600 text-xs">-</span>}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {hasPermission("proveedores.editar") && (
                            <>
                              <button onClick={() => openEdit(p)} title="Editar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleToggle(p)} title={p.activo ? "Desactivar" : "Activar"}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                                {p.activo ? <ToggleRight className="w-3.5 h-3.5 text-green-400" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          )}
                          {hasPermission("proveedores.eliminar") && (
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

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-arandu-dark-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="font-heading text-lg text-white">{editingId ? "Editar proveedor" : "Nuevo proveedor"}</h2>
                {activeEmpresaPropia && (
                  <p className="text-slate-400 text-xs font-body mt-0.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: activeEmpresaPropia.color || "#3b82f6" }} />
                    {activeEmpresaPropia.nombre}
                  </p>
                )}
              </div>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Nombre / Razón social *</label>
                <input required type="text" value={formData.nombre}
                  onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">RUC</label>
                  <input type="text" value={formData.ruc}
                    onChange={e => setFormData(f => ({ ...f, ruc: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Categoría</label>
                  <select value={formData.categoria}
                    onChange={e => setFormData(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  >
                    <option value="">Sin categoría</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Nombre de contacto</label>
                <input type="text" value={formData.contacto}
                  onChange={e => setFormData(f => ({ ...f, contacto: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Teléfono</label>
                  <input type="text" value={formData.telefono}
                    onChange={e => setFormData(f => ({ ...f, telefono: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-body">Email</label>
                  <input type="email" value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Dirección</label>
                <input type="text" value={formData.direccion}
                  onChange={e => setFormData(f => ({ ...f, direccion: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1 font-body">Notas</label>
                <textarea value={formData.notas}
                  onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-body focus:outline-none focus:border-arandu-blue resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-arandu-blue text-white rounded-lg hover:bg-arandu-blue/80 transition-colors font-body text-sm"
                >
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-body text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
