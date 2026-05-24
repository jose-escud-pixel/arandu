import React, { useState, useEffect, useContext, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Plus, Search, Edit, Trash2, Phone, Mail,
  MapPin, User, FileText, ArrowLeft, Save, X, Server, Download,
  Star, Upload, Palette
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { AuthContext } from "../App";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Helper: convert file to base64 ──────────────────────────────────────────
const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
});

function ChipSearch({ chips, setChips, inputVal, setInputVal, placeholder }) {
  const addChip = () => {
    const term = inputVal.trim().replace(/,$/, "");
    if (term && !chips.includes(term)) setChips(prev => [...prev, term]);
    setInputVal("");
  };
  return (
    <div className="space-y-2 flex-1">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip, idx) => (
            <span key={chip} className="inline-flex items-center gap-1.5 bg-arandu-blue/15 border border-arandu-blue/30 text-arandu-blue rounded-full px-2.5 py-1 text-xs">
              <Search className="w-3 h-3" />
              {chip}
              <button type="button" onClick={() => setChips(prev => prev.filter((_, i) => i !== idx))} className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button type="button" onClick={() => setChips([])} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-full border border-white/10">Limpiar</button>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => {
            if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) { e.preventDefault(); addChip(); }
            if (e.key === "Backspace" && !inputVal && chips.length) setChips(prev => prev.slice(0, -1));
          }}
          placeholder={placeholder}
          className="w-full bg-arandu-dark-light border border-white/10 rounded-lg pl-12 pr-3 py-3 text-white text-sm focus:outline-none focus:border-arandu-blue/60"
          data-testid="search-empresas"
        />
      </div>
    </div>
  );
}

function matchChips(chips, inputVal, texto) {
  const terms = [...chips, ...(inputVal.trim() ? [inputVal.trim()] : [])];
  if (!terms.length) return true;
  const haystack = texto.toLowerCase();
  return terms.every(term => haystack.includes(term.toLowerCase()));
}

const EmpresasPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, user, hasPermission, hasModule, activeEmpresaPropia } = useContext(AuthContext);
  const isAdmin = user?.role === "admin";
  const canCreate = isAdmin || hasPermission("empresas.crear");
  const canEdit   = isAdmin || hasPermission("empresas.editar");
  const canDelete = isAdmin || hasPermission("empresas.eliminar");

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("clientes");

  useEffect(() => {
    if (searchParams.get("nuevo") !== "cliente") return;
    if (canCreate) {
      setActiveTab("clientes");
      setEditingEmpresa(null);
      setFormData({
        nombre: "", razon_social: "", ruc: "", direccion: "", telefono: "", email: "", contacto: "",
        aplica_retencion: false, porcentaje_retencion: "", notas: "", logo_tipo: activeEmpresaPropia?.slug || "arandujar",
        personeria: "fisica", fecha_nacimiento: "", nacionalidad: "", pais: "", ciudad: "", municipio: "",
        con_inventario_tecnico: false
      });
      setShowForm(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
  }, [searchParams]); // eslint-disable-line

  // ── Clientes (empresas) ────────────────────────────────────────────────────
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchChips, setSearchChips] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState(null);
  const [formData, setFormData] = useState({
    nombre: "",
    razon_social: "",
    ruc: "",
    direccion: "",
    telefono: "",
    email: "",
    contacto: "",
    aplica_retencion: false,
    porcentaje_retencion: "",
    notas: "",
    logo_tipo: "arandujar",
    personeria: "fisica",
    fecha_nacimiento: "",
    nacionalidad: "",
    pais: "",
    ciudad: "",
    municipio: "",
    con_inventario_tecnico: false
  });

  // ── Nuestras Empresas (empresas_propias) ───────────────────────────────────
  const [propias, setPropias] = useState([]);
  const [loadingPropias, setLoadingPropias] = useState(false);
  const [showPropiaForm, setShowPropiaForm] = useState(false);
  const [editingPropia, setEditingPropia] = useState(null);
  const [propiaData, setPropiaData] = useState({
    nombre: "",
    slug: "",
    color: "#3B82F6",
    logo_url: null
  });
  const logoInputRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEmpresas();
    if (isAdmin) fetchPropias();
  }, [activeEmpresaPropia]); // eslint-disable-line

  const fetchEmpresas = async (search = "") => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (activeEmpresaPropia?.slug) params.set("logo_tipo", activeEmpresaPropia.slug);
      const url = `${API}/admin/empresas${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) setEmpresas(await response.json());
    } catch (error) {
      console.error("Error fetching empresas:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPropias = async () => {
    setLoadingPropias(true);
    try {
      const res = await fetch(`${API}/admin/empresas-propias`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setPropias(await res.json());
    } catch (err) {
      console.error("Error fetching propias:", err);
    } finally {
      setLoadingPropias(false);
    }
  };

  // ── Clientes CRUD ──────────────────────────────────────────────────────────
  const filteredEmpresas = empresas.filter(empresa => {
    const texto = [
      empresa.nombre, empresa.razon_social, empresa.ruc, empresa.direccion,
      empresa.telefono, empresa.email, empresa.contacto, empresa.notas,
      empresa.logo_tipo, empresa.aplica_retencion ? "retencion iva" : "",
      empresa.porcentaje_retencion
    ].filter(Boolean).join(" ");
    return matchChips(searchChips, searchInput, texto);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingEmpresa
        ? `${API}/admin/empresas/${editingEmpresa.id}`
        : `${API}/admin/empresas`;

      if (formData.aplica_retencion && (formData.porcentaje_retencion === "" || isNaN(formData.porcentaje_retencion))) {
        toast.error("Ingresá un porcentaje de retención válido");
        return;
      }

      const payload = { ...formData };
      if (formData.aplica_retencion) {
        payload.porcentaje_retencion = Number(formData.porcentaje_retencion);
      } else {
        delete payload.porcentaje_retencion;
      }

      const response = await fetch(url, {
        method: editingEmpresa ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success(editingEmpresa ? "Cliente actualizado" : "Cliente creado");
        resetForm();
        fetchEmpresas();
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar el cliente");
    }
  };

  const handleEdit = (empresa) => {
    setEditingEmpresa(empresa);
    setFormData({
      nombre: empresa.nombre || "",
      razon_social: empresa.razon_social || "",
      ruc: empresa.ruc || "",
      direccion: empresa.direccion || "",
      telefono: empresa.telefono || "",
      email: empresa.email || "",
      contacto: empresa.contacto || "",
      aplica_retencion: empresa.aplica_retencion || false,
      porcentaje_retencion: empresa.porcentaje_retencion ?? "",
      notas: empresa.notas || "",
      logo_tipo: empresa.logo_tipo || "arandujar",
      personeria: empresa.personeria || "fisica",
      fecha_nacimiento: empresa.fecha_nacimiento || "",
      nacionalidad: empresa.nacionalidad || "",
      pais: empresa.pais || "",
      ciudad: empresa.ciudad || "",
      municipio: empresa.municipio || "",
      // null/undefined → true (retrocompatibilidad: clientes viejos tienen IT habilitado)
      con_inventario_tecnico: empresa.con_inventario_tecnico ?? true
    });
    setShowForm(true);
  };

  const handleDelete = async (empresaId) => {
    if (!window.confirm("¿Está seguro de eliminar este cliente?")) return;
    try {
      const response = await fetch(`${API}/admin/empresas/${empresaId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        toast.success("Cliente eliminado");
        fetchEmpresas();
      }
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingEmpresa(null);
    setFormData({
      nombre: "",
      razon_social: "",
      ruc: "",
      direccion: "",
      telefono: "",
      email: "",
      contacto: "",
      aplica_retencion: false,
      porcentaje_retencion: "",
      notas: "",
      logo_tipo: activeEmpresaPropia?.slug || "arandujar",
      personeria: "fisica",
      fecha_nacimiento: "",
      nacionalidad: "",
      pais: "",
      ciudad: "",
      municipio: "",
      con_inventario_tecnico: false
    });
  };

  // ── Nuestras Empresas CRUD ─────────────────────────────────────────────────
  const handlePropiaSubmit = async (e) => {
    e.preventDefault();
    if (!propiaData.nombre.trim()) { toast.error("El nombre es requerido"); return; }

    try {
      const url = editingPropia
        ? `${API}/admin/empresas-propias/${editingPropia.id}`
        : `${API}/admin/empresas-propias`;

      const payload = {
        nombre: propiaData.nombre,
        slug: propiaData.slug || propiaData.nombre.toLowerCase().replace(/\s+/g, "-"),
        color: propiaData.color,
        ...(propiaData.logo_url ? { logo_url: propiaData.logo_url } : {})
      };

      const res = await fetch(url, {
        method: editingPropia ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingPropia ? "Empresa actualizada" : "Empresa creada");
        resetPropiaForm();
        fetchPropias();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al guardar");
      }
    } catch (err) {
      toast.error("Error de conexión");
    }
  };

  const handleEditPropia = (ep) => {
    setEditingPropia(ep);
    setPropiaData({
      nombre: ep.nombre || "",
      slug: ep.slug || "",
      color: ep.color || "#3B82F6",
      logo_url: ep.logo_url || null
    });
    setShowPropiaForm(true);
  };

  const handleDeletePropia = async (id) => {
    if (!window.confirm("¿Eliminar esta empresa? Esto puede afectar contratos y presupuestos.")) return;
    try {
      const res = await fetch(`${API}/admin/empresas-propias/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Empresa eliminada");
        fetchPropias();
      }
    } catch (err) {
      toast.error("Error al eliminar");
    }
  };

  const resetPropiaForm = () => {
    setShowPropiaForm(false);
    setEditingPropia(null);
    setPropiaData({ nombre: "", slug: "", color: "#3B82F6", logo_url: null });
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("El logo no puede superar 2MB"); return; }
    try {
      const base64 = await toBase64(file);
      setPropiaData(prev => ({ ...prev, logo_url: base64 }));
    } catch (err) {
      toast.error("Error al leer el archivo");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <Link to="/sistema" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2" data-testid="back-btn">
            <ArrowLeft className="w-4 h-4" />
            Volver al Dashboard
          </Link>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Building2 className="w-8 h-8 text-arandu-blue" />
            Clientes
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-arandu-dark-light border border-white/5 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveTab("clientes")}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "clientes"
              ? "bg-arandu-blue text-white shadow"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Clientes
        </button>
      </div>

      {/* ════════════════ TAB: CLIENTES ════════════════════════════════════════ */}
      {activeTab === "clientes" && (
        <>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <ChipSearch
              chips={searchChips}
              setChips={setSearchChips}
              inputVal={searchInput}
              setInputVal={setSearchInput}
              placeholder="Buscar cliente, RUC, contacto, email, empresa, retención... Enter para agregar"
            />
            {canCreate && (
              <Button
                onClick={() => {
                  setFormData(f => ({ ...f, logo_tipo: activeEmpresaPropia?.slug || f.logo_tipo || "arandujar" }));
                  setShowForm(true);
                }}
                className="bg-arandu-blue hover:bg-arandu-blue-dark text-white whitespace-nowrap"
                data-testid="new-empresa-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Cliente
              </Button>
            )}
          </div>

          {/* Form Modal - Clientes */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                onClick={(e) => e.target === e.currentTarget && resetForm()}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-arandu-dark-light border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-heading text-xl font-bold text-white">
                      {editingEmpresa ? "Editar Cliente" : "Nuevo Cliente"}
                    </h2>
                    <button onClick={resetForm} className="text-slate-400 hover:text-white">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Empresa propia a la que pertenece este cliente */}
                    {activeEmpresaPropia ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg border"
                        style={{
                          backgroundColor: `${activeEmpresaPropia.color || "#3b82f6"}15`,
                          borderColor: `${activeEmpresaPropia.color || "#3b82f6"}40`,
                        }}
                      >
                        {activeEmpresaPropia.logo_url ? (
                          <img src={activeEmpresaPropia.logo_url} alt={activeEmpresaPropia.nombre} className="h-7 object-contain" />
                        ) : (
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: activeEmpresaPropia.color || "#3b82f6" }} />
                        )}
                        <div className="flex-1">
                          <div className="text-xs text-slate-400">Cliente para nuestra empresa:</div>
                          <div className="text-white font-medium text-sm">{activeEmpresaPropia.nombre}</div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Empresa <span className="text-xs text-slate-500">(¿a cuál de nuestras empresas pertenece?)</span></label>
                        <div className="flex gap-2">
                          {[
                            { slug: "arandu",    label: "Arandu",     color: "bg-blue-600",   ring: "ring-blue-500" },
                            { slug: "jar",       label: "JAR",        color: "bg-red-600",    ring: "ring-red-500" },
                            { slug: "arandujar", label: "Arandu&JAR", color: "bg-purple-600", ring: "ring-purple-500" },
                          ].map(op => (
                            <button
                              key={op.slug}
                              type="button"
                              onClick={() => setFormData({ ...formData, logo_tipo: op.slug })}
                              className={`flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-all border-2 ${op.color} ${
                                formData.logo_tipo === op.slug ? `${op.ring} ring-2 scale-105` : "border-transparent opacity-50 hover:opacity-80"
                              }`}
                            >
                              {op.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Nombre comercial *</label>
                        <Input
                          value={formData.nombre}
                          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                          className="bg-arandu-dark border-white/10 text-white"
                          required
                          placeholder="Nombre corto / comercial"
                          data-testid="empresa-nombre"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Razón social</label>
                        <Input
                          value={formData.razon_social}
                          onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                          className="bg-arandu-dark border-white/10 text-white"
                          placeholder="Nombre legal para facturas"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-sm mb-2">RUC</label>
                      <Input
                        value={formData.ruc}
                        onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="RUC / Número fiscal"
                        data-testid="empresa-ruc"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-sm mb-2">Dirección</label>
                      <Input
                        value={formData.direccion}
                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white"
                        data-testid="empresa-direccion"
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Teléfono</label>
                        <Input
                          type="tel"
                          value={formData.telefono}
                          onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                          className="bg-arandu-dark border-white/10 text-white"
                          data-testid="empresa-telefono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Email</label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="bg-arandu-dark border-white/10 text-white"
                          data-testid="empresa-email"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-sm mb-2">Persona de Contacto</label>
                      <Input
                        value={formData.contacto}
                        onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white"
                        data-testid="empresa-contacto"
                      />
                    </div>

                    {/* Retención IVA */}
                    <div className="bg-amber-900/10 border border-amber-500/20 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-amber-300 text-sm font-medium">Retención de IVA</p>
                          <p className="text-slate-500 text-xs">Esta empresa retiene un % del IVA al pagarte</p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.aplica_retencion}
                            onChange={(e) => setFormData({
                              ...formData,
                              aplica_retencion: e.target.checked,
                              porcentaje_retencion: e.target.checked ? formData.porcentaje_retencion : ""
                            })}
                            className="w-4 h-4 accent-amber-500"
                          />
                          <span className="text-slate-300 text-sm">Aplica retención</span>
                        </label>
                      </div>
                      {formData.aplica_retencion && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="block text-slate-400 text-xs mb-1">% de retención sobre IVA</label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="1" max="100" step="0.01"
                                value={formData.porcentaje_retencion}
                                onChange={(e) => setFormData({ ...formData, porcentaje_retencion: e.target.value })}
                                className="bg-arandu-dark border-amber-500/30 text-white w-32"
                                placeholder="30"
                              />
                              <span className="text-amber-400 text-sm font-medium">% del IVA</span>
                            </div>
                            {formData.porcentaje_retencion && (
                              <p className="text-amber-400/60 text-xs mt-1">
                                Ej: factura ₲1.100.000 (IVA 10% = ₲100.000) → retienen ₲{Math.round(100000 * parseFloat(formData.porcentaje_retencion) / 100).toLocaleString("es-PY")}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Datos adicionales ─────────────────────────────── */}
                    <div className="border border-white/10 rounded-lg p-4 space-y-4">
                      <p className="text-slate-400 text-sm font-medium">Datos adicionales</p>

                      {/* Personería */}
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Personería</label>
                        <div className="flex gap-3">
                          {[{ val: "fisica", label: "Física" }, { val: "juridica", label: "Jurídica" }].map(op => (
                            <button
                              key={op.val}
                              type="button"
                              onClick={() => setFormData({ ...formData, personeria: op.val })}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                                formData.personeria === op.val
                                  ? "bg-arandu-blue/20 border-arandu-blue text-arandu-blue"
                                  : "border-white/10 text-slate-400 hover:border-white/30"
                              }`}
                            >
                              {op.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Fecha de nacimiento */}
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Fecha de nacimiento</label>
                        <Input
                          type="date"
                          value={formData.fecha_nacimiento}
                          onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                          className="bg-arandu-dark border-white/10 text-white"
                        />
                      </div>

                      {/* Nacionalidad */}
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Nacionalidad</label>
                        <Input
                          value={formData.nacionalidad}
                          onChange={(e) => setFormData({ ...formData, nacionalidad: e.target.value })}
                          className="bg-arandu-dark border-white/10 text-white"
                          placeholder="Ej: Paraguaya"
                        />
                      </div>

                      {/* País / Ciudad / Municipio */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-slate-400 text-sm mb-2">País</label>
                          <Input
                            value={formData.pais}
                            onChange={(e) => setFormData({ ...formData, pais: e.target.value })}
                            className="bg-arandu-dark border-white/10 text-white"
                            placeholder="Paraguay"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-sm mb-2">Ciudad</label>
                          <Input
                            value={formData.ciudad}
                            onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                            className="bg-arandu-dark border-white/10 text-white"
                            placeholder="Asunción"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-sm mb-2">Municipio</label>
                          <Input
                            value={formData.municipio}
                            onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                            className="bg-arandu-dark border-white/10 text-white"
                            placeholder=""
                          />
                        </div>
                      </div>

                      {/* Inventario técnico toggle — solo si tiene el módulo habilitado */}
                      {(isAdmin || (hasModule?.("inventario_tecnico") && hasPermission?.("inventario.ver"))) && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-900/10 border border-cyan-500/20">
                          <div>
                            <p className="text-cyan-300 text-sm font-medium">Inventario Técnico</p>
                            <p className="text-slate-500 text-xs">Habilitar acceso al módulo de inventario para este cliente</p>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!formData.con_inventario_tecnico}
                              onChange={(e) => setFormData({ ...formData, con_inventario_tecnico: e.target.checked })}
                              className="w-4 h-4 accent-cyan-500"
                            />
                            <span className="text-slate-300 text-sm">Habilitado</span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-slate-400 text-sm mb-2">Notas</label>
                      <Textarea
                        value={formData.notas}
                        onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white resize-none"
                        rows={3}
                        data-testid="empresa-notas"
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button type="button" onClick={resetForm} variant="outline" className="flex-1 border-white/20 text-slate-300">
                        Cancelar
                      </Button>
                      <Button type="submit" className="flex-1 bg-arandu-blue hover:bg-arandu-blue-dark text-white" data-testid="save-empresa-btn">
                        <Save className="w-4 h-4 mr-2" />
                        {editingEmpresa ? "Actualizar" : "Guardar"}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Clientes */}
          {loading ? (
            <div className="text-center py-12">
              <div className="text-arandu-blue animate-pulse">Cargando...</div>
            </div>
          ) : filteredEmpresas.length === 0 ? (
            <div className="text-center py-12 bg-arandu-dark-light border border-white/5 rounded-xl">
              <Building2 className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">
                {empresas.length === 0 ? "No hay clientes registrados" : "No hay clientes que coincidan"}
              </p>
              {canCreate && empresas.length === 0 && (
                <Button onClick={() => setShowForm(true)} className="bg-arandu-blue hover:bg-arandu-blue-dark">
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Primer Cliente
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-arandu-dark-light border border-white/5 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead className="bg-white/[0.03] border-b border-white/5">
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-medium">Cliente</th>
                      <th className="px-4 py-3 font-medium">RUC</th>
                      <th className="px-4 py-3 font-medium">Contacto</th>
                      <th className="px-4 py-3 font-medium">Direccion</th>
                      <th className="px-4 py-3 font-medium">IVA</th>
                      <th className="px-4 py-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredEmpresas.map((empresa) => (
                      <motion.tr
                        key={empresa.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setSelectedEmpresa(empresa)}
                        className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-arandu-blue/20 rounded-lg flex items-center justify-center shrink-0">
                              <Building2 className="w-5 h-5 text-arandu-blue" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-heading font-semibold text-white truncate">{empresa.nombre}</p>
                                {empresa.logo_tipo && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                    empresa.logo_tipo === "arandu" ? "bg-blue-500/20 text-blue-300" :
                                    empresa.logo_tipo === "jar" ? "bg-red-500/20 text-red-300" :
                                    "bg-purple-500/20 text-purple-300"
                                  }`}>
                                    {empresa.logo_tipo === "arandu" ? "Arandu" : empresa.logo_tipo === "jar" ? "JAR" : "Arandu&JAR"}
                                  </span>
                                )}
                              </div>
                              {empresa.razon_social && empresa.razon_social !== empresa.nombre && (
                                <p className="text-slate-400 text-xs truncate">{empresa.razon_social}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">{empresa.ruc || "-"}</td>
                        <td className="px-4 py-4">
                          <div className="space-y-1 text-sm">
                            <p className="text-white">{empresa.contacto || "-"}</p>
                            {empresa.telefono && <p className="text-slate-400">{empresa.telefono}</p>}
                            {empresa.email && <p className="text-slate-500 truncate max-w-[190px]">{empresa.email}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-400 max-w-[230px] truncate">{empresa.direccion || "-"}</td>
                        <td className="px-4 py-4">
                          {empresa.aplica_retencion ? (
                            <span className="inline-flex items-center bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs px-2 py-1 rounded-full font-medium">
                              Retencion {empresa.porcentaje_retencion}%
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">Sin retencion</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Link to={`/sistema/presupuestos?empresa=${empresa.id}`}>
                              <Button size="sm" variant="outline" className="border-arandu-blue/30 text-arandu-blue hover:bg-arandu-blue/10">
                                <FileText className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Link to={`/sistema/inventario?empresa=${empresa.id}`}>
                              <Button size="sm" variant="outline" className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                                <Server className="w-4 h-4" />
                              </Button>
                            </Link>
                            {canEdit && (
                              <Button size="sm" onClick={() => handleEdit(empresa)} variant="ghost" className="text-slate-400 hover:text-white hover:bg-white/10">
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button size="sm" onClick={() => handleDelete(empresa.id)} variant="ghost" className="text-slate-400 hover:text-arandu-red hover:bg-arandu-red/10">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <AnimatePresence>
            {selectedEmpresa && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                onClick={(e) => e.target === e.currentTarget && setSelectedEmpresa(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                >
                  <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-12 h-12 bg-arandu-blue/20 rounded-xl flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-arandu-blue" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-heading text-2xl font-bold text-white truncate">{selectedEmpresa.nombre}</h2>
                        {selectedEmpresa.razon_social && (
                          <p className="text-slate-400 text-sm mt-1">{selectedEmpresa.razon_social}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setSelectedEmpresa(null)} className="text-slate-400 hover:text-white">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="p-6 grid md:grid-cols-2 gap-4">
                    <div className="bg-arandu-dark border border-white/5 rounded-xl p-4">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Datos fiscales</p>
                      <div className="space-y-3 text-sm">
                        <p className="flex justify-between gap-4"><span className="text-slate-400">RUC</span><span className="text-white text-right">{selectedEmpresa.ruc || "-"}</span></p>
                        <p className="flex justify-between gap-4"><span className="text-slate-400">Personería</span><span className="text-white text-right capitalize">{selectedEmpresa.personeria || "física"}</span></p>
                        <p className="flex justify-between gap-4"><span className="text-slate-400">Empresa</span><span className="text-white text-right">{selectedEmpresa.logo_tipo || "-"}</span></p>
                        <p className="flex justify-between gap-4"><span className="text-slate-400">Retencion IVA</span><span className="text-white text-right">{selectedEmpresa.aplica_retencion ? `${selectedEmpresa.porcentaje_retencion}%` : "No aplica"}</span></p>
                      </div>
                    </div>
                    <div className="bg-arandu-dark border border-white/5 rounded-xl p-4">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Contacto</p>
                      <div className="space-y-3 text-sm">
                        <p className="flex items-start gap-2 text-slate-300"><User className="w-4 h-4 text-slate-600 mt-0.5" />{selectedEmpresa.contacto || "-"}</p>
                        <p className="flex items-start gap-2 text-slate-300"><Phone className="w-4 h-4 text-slate-600 mt-0.5" />{selectedEmpresa.telefono || "-"}</p>
                        <p className="flex items-start gap-2 text-slate-300 break-all"><Mail className="w-4 h-4 text-slate-600 mt-0.5" />{selectedEmpresa.email || "-"}</p>
                      </div>
                    </div>
                    <div className="bg-arandu-dark border border-white/5 rounded-xl p-4 md:col-span-2">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Ubicación</p>
                      <div className="space-y-2 text-sm">
                        <p className="flex items-start gap-2 text-slate-300">
                          <MapPin className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                          {selectedEmpresa.direccion || "-"}
                        </p>
                        {(selectedEmpresa.pais || selectedEmpresa.ciudad || selectedEmpresa.municipio) && (
                          <p className="text-slate-400 text-xs pl-6">
                            {[selectedEmpresa.municipio, selectedEmpresa.ciudad, selectedEmpresa.pais].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {selectedEmpresa.nacionalidad && (
                          <p className="text-slate-400 text-xs pl-6">Nacionalidad: {selectedEmpresa.nacionalidad}</p>
                        )}
                        {selectedEmpresa.fecha_nacimiento && (
                          <p className="text-slate-400 text-xs pl-6">Fecha nac.: {selectedEmpresa.fecha_nacimiento}</p>
                        )}
                      </div>
                    </div>
                    <div className="bg-arandu-dark border border-white/5 rounded-xl p-4 md:col-span-2">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Notas</p>
                      <p className="text-slate-300 text-sm whitespace-pre-wrap">{selectedEmpresa.notas || "Sin notas"}</p>
                    </div>
                  </div>

                  <div className="p-6 border-t border-white/10 flex flex-wrap gap-3 justify-end">
                    <Link to={`/sistema/presupuestos?empresa=${selectedEmpresa.id}`}>
                      <Button variant="outline" className="border-arandu-blue/30 text-arandu-blue hover:bg-arandu-blue/10">
                        <FileText className="w-4 h-4 mr-2" />
                        Presupuestos
                      </Button>
                    </Link>
                    <Link to={`/sistema/inventario?empresa=${selectedEmpresa.id}`}>
                      <Button variant="outline" className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                        <Server className="w-4 h-4 mr-2" />
                        Inventario
                      </Button>
                    </Link>
                    {canEdit && (
                      <Button
                        onClick={() => {
                          const empresa = selectedEmpresa;
                          setSelectedEmpresa(null);
                          handleEdit(empresa);
                        }}
                        className="bg-arandu-blue hover:bg-arandu-blue-dark text-white"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </Button>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* TAB: NUESTRAS EMPRESAS removed — managed via Mis Empresas in sidebar */}
      {false && isAdmin && (
        <>
          <div className="flex justify-between items-center mb-6">
            <p className="text-slate-400 text-sm">
              Empresas internas que aparecen como emisores en presupuestos y contratos.
            </p>
            <Button
              onClick={() => setShowPropiaForm(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar empresa
            </Button>
          </div>

          {/* Form Modal - Nuestras Empresas */}
          <AnimatePresence>
            {showPropiaForm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                onClick={(e) => e.target === e.currentTarget && resetPropiaForm()}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-arandu-dark-light border border-white/10 rounded-2xl p-6 w-full max-w-md"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-heading text-xl font-bold text-white">
                      {editingPropia ? "Editar Empresa" : "Nueva Empresa"}
                    </h2>
                    <button onClick={resetPropiaForm} className="text-slate-400 hover:text-white">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <form onSubmit={handlePropiaSubmit} className="space-y-4">
                    <div>
                      <label className="block text-slate-400 text-sm mb-2">Nombre *</label>
                      <Input
                        value={propiaData.nombre}
                        onChange={(e) => setPropiaData({ ...propiaData, nombre: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="Ej: Arandu, JAR, AranduJAR"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-sm mb-2">Slug (identificador interno)</label>
                      <Input
                        value={propiaData.slug}
                        onChange={(e) => setPropiaData({ ...propiaData, slug: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="arandu / jar / arandujar"
                      />
                      <p className="text-slate-600 text-xs mt-1">Si lo dejás vacío se genera automáticamente del nombre</p>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-sm mb-2 flex items-center gap-2">
                        <Palette className="w-4 h-4" /> Color de marca
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={propiaData.color}
                          onChange={(e) => setPropiaData({ ...propiaData, color: e.target.value })}
                          className="w-12 h-10 rounded border border-white/10 bg-transparent cursor-pointer"
                        />
                        <Input
                          value={propiaData.color}
                          onChange={(e) => setPropiaData({ ...propiaData, color: e.target.value })}
                          className="bg-arandu-dark border-white/10 text-white font-mono"
                          placeholder="#3B82F6"
                        />
                        <div
                          className="w-10 h-10 rounded-lg flex-shrink-0 border border-white/10"
                          style={{ backgroundColor: propiaData.color }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-sm mb-2 flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Logo
                      </label>
                      <div className="flex items-center gap-4">
                        {propiaData.logo_url ? (
                          <div className="relative">
                            <img
                              src={propiaData.logo_url}
                              alt="Logo"
                              className="w-16 h-16 object-contain rounded-lg border border-white/10 bg-arandu-dark p-1"
                            />
                            <button
                              type="button"
                              onClick={() => setPropiaData({ ...propiaData, logo_url: null })}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-arandu-red rounded-full flex items-center justify-center text-white text-xs"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className="w-16 h-16 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center"
                            style={{ backgroundColor: propiaData.color + "20" }}
                          >
                            <span className="text-white font-bold text-xl">
                              {propiaData.nombre?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                          </div>
                        )}
                        <div>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoChange}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/20 text-slate-300 text-sm"
                            onClick={() => logoInputRef.current?.click()}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Subir logo
                          </Button>
                          <p className="text-slate-600 text-xs mt-1">PNG, SVG, JPG — máx 2MB</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button type="button" onClick={resetPropiaForm} variant="outline" className="flex-1 border-white/20 text-slate-300">
                        Cancelar
                      </Button>
                      <Button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white">
                        <Save className="w-4 h-4 mr-2" />
                        {editingPropia ? "Actualizar" : "Guardar"}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grid de nuestras empresas */}
          {loadingPropias ? (
            <div className="text-center py-12">
              <div className="text-amber-400 animate-pulse">Cargando...</div>
            </div>
          ) : propias.length === 0 ? (
            <div className="text-center py-12 bg-arandu-dark-light border border-white/5 rounded-xl">
              <Star className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400 mb-2">No hay empresas propias registradas</p>
              <p className="text-slate-600 text-sm mb-4">
                Creá Arandu, JAR y AranduJAR para empezar
              </p>
              <Button onClick={() => setShowPropiaForm(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Agregar empresa
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {propias.map((ep) => (
                <motion.div
                  key={ep.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-arandu-dark-light border border-white/5 rounded-xl p-5 hover:border-amber-500/30 transition-all"
                >
                  <div className="flex items-center gap-4 mb-4">
                    {ep.logo_url ? (
                      <img
                        src={ep.logo_url}
                        alt={ep.nombre}
                        className="w-14 h-14 object-contain rounded-xl border border-white/10 bg-arandu-dark p-1"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-2xl font-bold border border-white/10 flex-shrink-0"
                        style={{ backgroundColor: (ep.color || "#3B82F6") + "30", borderColor: ep.color || "#3B82F6" }}
                      >
                        {ep.nombre?.charAt(0)?.toUpperCase()}
                      </div>
                    )}

                    <div>
                      <h3 className="font-heading font-bold text-white text-lg">{ep.nombre}</h3>
                      <p className="text-slate-500 text-xs font-mono">slug: {ep.slug}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div
                          className="w-4 h-4 rounded-full border border-white/10"
                          style={{ backgroundColor: ep.color || "#3B82F6" }}
                        />
                        <span className="text-slate-500 text-xs font-mono">{ep.color}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-white/5">
                    <Button
                      onClick={() => handleEditPropia(ep)}
                      variant="ghost"
                      className="flex-1 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      onClick={() => handleDeletePropia(ep.id)}
                      variant="ghost"
                      className="text-slate-400 hover:text-arandu-red hover:bg-arandu-red/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EmpresasPage;
