import React, { useState, useEffect, useContext, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Building2, Plus, Edit, Trash2, Save, X,
  Upload, Image, Palette, Check, Globe, RefreshCw
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Catálogo de temas disponibles ─────────────────────────────────────────────
const TEMAS = [
  {
    id: "oscuro-azul",
    label: "Oscuro Azul",
    desc: "Tema por defecto. Fondo oscuro con acento azul.",
    preview: { bg: "#0a1628", card: "#0f1e37", accent: "#3b82f6", text: "#f1f5f9" },
  },
  {
    id: "oscuro-rojo",
    label: "Oscuro Rojo",
    desc: "Fondo oscuro con acento rojo. Ideal para empresas de seguridad.",
    preview: { bg: "#0a1628", card: "#0f1e37", accent: "#ef4444", text: "#f1f5f9" },
  },
  {
    id: "claro-rojo",
    label: "Claro Rojo",
    desc: "Fondo blanco/gris claro con acento rojo corporativo.",
    preview: { bg: "#f8fafc", card: "#ffffff", accent: "#dc2626", text: "#1e293b" },
  },
  {
    id: "claro-dorado",
    label: "Claro Dorado",
    desc: "Fondo claro amarillo cálido con acento dorado. Look premium.",
    preview: { bg: "#fefce8", card: "#ffffff", accent: "#d97706", text: "#1c1917" },
  },
  {
    id: "claro-azul",
    label: "Claro Azul",
    desc: "Fondo blanco/azul claro con acento azul. Look moderno y profesional.",
    preview: { bg: "#f0f9ff", card: "#ffffff", accent: "#2563eb", text: "#0f172a" },
  },
];

// Mini preview de tema
const TemaPreview = ({ tema, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative p-0.5 rounded-xl transition-all ${
      selected ? "ring-2 ring-offset-2 ring-offset-arandu-dark-light" : "hover:scale-105"
    }`}
    style={{ ringColor: tema.preview.accent }}
    title={tema.label}
  >
    {selected && (
      <div className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center"
        style={{ backgroundColor: tema.preview.accent }}>
        <Check className="w-3 h-3 text-white" />
      </div>
    )}
    {/* Mini UI mockup */}
    <div className="w-28 h-20 rounded-lg overflow-hidden border border-white/10"
      style={{ backgroundColor: tema.preview.bg }}>
      {/* Sidebar strip */}
      <div className="flex h-full">
        <div className="w-6 flex flex-col gap-1 p-1" style={{ backgroundColor: tema.preview.card }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-4 h-1.5 rounded-sm"
              style={{ backgroundColor: i === 0 ? tema.preview.accent : "rgba(128,128,128,0.3)" }} />
          ))}
        </div>
        <div className="flex-1 p-1.5 space-y-1">
          <div className="h-2 rounded" style={{ backgroundColor: tema.preview.card }} />
          <div className="h-2 rounded w-3/4" style={{ backgroundColor: tema.preview.card }} />
          <div className="h-4 rounded mt-1 flex items-center justify-center"
            style={{ backgroundColor: `${tema.preview.accent}25` }}>
            <div className="w-8 h-1.5 rounded" style={{ backgroundColor: tema.preview.accent }} />
          </div>
          <div className="h-2 rounded w-1/2" style={{ backgroundColor: tema.preview.card }} />
        </div>
      </div>
    </div>
    <p className="text-center text-xs mt-1.5"
      style={{ color: selected ? tema.preview.accent : "#94a3b8" }}>
      {tema.label}
    </p>
  </button>
);

// ── Componente principal ──────────────────────────────────────────────────────
const EmpresasPropiasPage = () => {
  const { token, refreshEmpresasPropias } = useContext(AuthContext);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);

  const emptyForm = () => ({
    nombre: "",
    slug: "",
    color: "#3b82f6",
    tema: "oscuro-azul",
  });
  const [form, setForm] = useState(emptyForm());
  const [logoPreview, setLogoPreview] = useState(null); // base64 preview antes de subir

  useEffect(() => { fetchEmpresas(); }, []);

  const fetchEmpresas = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/empresas-propias`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEmpresas(await res.json());
    } catch (e) { toast.error("Error al cargar empresas"); }
    finally { setLoading(false); }
  };

  const openNew = () => {
    setForm(emptyForm());
    setLogoPreview(null);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (ep) => {
    setForm({ nombre: ep.nombre, slug: ep.slug, color: ep.color || "#3b82f6", tema: ep.tema || "oscuro-azul" });
    setLogoPreview(ep.logo_url || null);
    setEditingId(ep.id);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      const url = editingId ? `${API}/admin/empresas-propias/${editingId}` : `${API}/admin/empresas-propias`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const saved = await res.json();
        // Si hay un logo nuevo seleccionado (base64 aún no subido), subirlo
        if (logoPreview && logoPreview !== saved.logo_url && logoPreview.startsWith("data:")) {
          await uploadLogoFromBase64(saved.id, logoPreview);
        }
        toast.success(editingId ? "Empresa actualizada" : "Empresa creada");
        setShowForm(false);
        await fetchEmpresas();
        refreshEmpresasPropias();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al guardar");
      }
    } catch { toast.error("Error de conexión"); }
    finally { setSaving(false); }
  };

  const uploadLogoFromBase64 = async (id, dataUrl) => {
    // Convertir base64 data URL a File y subir via /logo endpoint
    try {
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const blob = new Blob([u8arr], { type: mime });
      const fd = new FormData();
      fd.append("file", blob, "logo.png");
      await fetch(`${API}/admin/empresas-propias/${id}/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
    } catch (e) { console.error("Error subiendo logo:", e); }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("La imagen debe pesar menos de 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id, nombre) => {
    if (!window.confirm(`¿Eliminar la empresa "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`${API}/admin/empresas-propias/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { toast.success("Empresa eliminada"); fetchEmpresas(); refreshEmpresasPropias(); }
      else toast.error("No se pudo eliminar");
    } catch { toast.error("Error"); }
  };

  const temaInfo = (slug) => TEMAS.find(t => t.id === slug) || TEMAS[0];

  return (
    <div className="min-h-screen bg-arandu-dark p-4 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link to="/admin" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-3 text-sm w-fit">
            <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
          </Link>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-arandu-blue" />
              <div>
                <h1 className="font-heading text-3xl font-bold text-white">Empresas Propias</h1>
                <p className="text-slate-400 text-sm">Configurá tus empresas con logo, tema de color y acceso multi-empresa</p>
              </div>
            </div>
            <Button onClick={openNew} className="bg-arandu-blue hover:bg-arandu-blue-dark text-white">
              <Plus className="w-4 h-4 mr-2" /> Nueva Empresa
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-arandu-blue/10 border border-arandu-blue/20 rounded-xl p-4 mb-6 text-sm text-slate-300">
          <p className="font-medium text-arandu-blue mb-1">¿Cómo funciona el sistema multi-empresa?</p>
          <p>Cada empresa tiene su propio <strong>slug</strong> (identificador único) que se asigna a usuarios y documenntos.
          El <strong>logo</strong> aparece en el panel y en los presupuestos. El <strong>tema</strong> se aplica automáticamente
          cuando un usuario de esa empresa inicia sesión.</p>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-arandu-blue animate-pulse">Cargando...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {empresas.map(ep => {
              const tema = temaInfo(ep.tema);
              return (
                <motion.div key={ep.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-arandu-dark-light border border-white/5 rounded-xl overflow-hidden hover:border-arandu-blue/20 transition-all"
                >
                  {/* Color strip */}
                  <div className="h-1.5" style={{ backgroundColor: ep.color || "#3b82f6" }} />
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Logo */}
                      <div className="w-16 h-16 rounded-xl border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: `${ep.color || "#3b82f6"}18` }}>
                        {ep.logo_url ? (
                          <img src={ep.logo_url} alt={ep.nombre} className="w-full h-full object-contain p-1" />
                        ) : (
                          <Building2 className="w-8 h-8" style={{ color: ep.color || "#3b82f6" }} />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold text-lg">{ep.nombre}</h3>
                        <p className="text-slate-500 text-xs font-mono mt-0.5">slug: <span className="text-slate-300">{ep.slug}</span></p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1.5 bg-arandu-dark rounded-lg px-2.5 py-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tema.preview.accent }} />
                            <span className="text-xs text-slate-400">{tema.label}</span>
                          </div>
                        </div>
                      </div>

                      {/* Acciones */}
                      <div className="flex gap-1 flex-shrink-0">
                        <Button onClick={() => openEdit(ep)} variant="ghost"
                          className="text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => handleDelete(ep.id, ep.nombre)} variant="ghost"
                          className="text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {empresas.length === 0 && (
              <div className="col-span-2 text-center py-16 bg-arandu-dark-light border border-white/5 rounded-xl">
                <Building2 className="w-14 h-14 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 mb-4">No hay empresas propias creadas</p>
                <Button onClick={openNew} className="bg-arandu-blue hover:bg-arandu-blue-dark text-white">
                  <Plus className="w-4 h-4 mr-2" /> Crear primera empresa
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ MODAL: Formulario ════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto"
            onClick={e => e.target === e.currentTarget && setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-2xl p-6 my-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-heading text-xl font-bold text-white">
                  {editingId ? "Editar Empresa" : "Nueva Empresa"}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">

                {/* Nombre + slug */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Nombre *</label>
                    <Input value={form.nombre}
                      onChange={e => setForm(p => ({
                        ...p,
                        nombre: e.target.value,
                        slug: !editingId ? e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") : p.slug
                      }))}
                      className="bg-arandu-dark border-white/10 text-white"
                      placeholder="Ej: Mi Empresa S.A." required />
                  </div>
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Slug (identificador)</label>
                    <Input value={form.slug}
                      onChange={e => setForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                      className="bg-arandu-dark border-white/10 text-white font-mono"
                      placeholder="mi-empresa" />
                    <p className="text-slate-600 text-xs mt-1">Solo letras minúsculas, números y guiones. Se auto-genera del nombre.</p>
                  </div>
                </div>

                {/* Color de acento */}
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Color de acento</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.color}
                      onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      className="w-12 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                    <Input value={form.color}
                      onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      className="bg-arandu-dark border-white/10 text-white font-mono w-36"
                      placeholder="#3b82f6" />
                    <p className="text-slate-500 text-xs">Se usa en listados y badges de empresa</p>
                  </div>
                </div>

                {/* Logo upload */}
                <div>
                  <label className="text-slate-400 text-sm mb-2 block">Logo de la empresa</label>
                  <div className="flex items-start gap-4">
                    {/* Preview */}
                    <div className="w-20 h-20 rounded-xl border border-white/10 bg-arandu-dark flex items-center justify-center overflow-hidden flex-shrink-0">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Image className="w-8 h-8 text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                        onChange={handleFileSelect} />
                      <Button type="button" onClick={() => fileInputRef.current?.click()}
                        variant="outline" className="border-white/10 text-slate-300 hover:text-white mb-2">
                        <Upload className="w-4 h-4 mr-2" />
                        {logoPreview ? "Cambiar imagen" : "Subir logo (JPG/PNG)"}
                      </Button>
                      {logoPreview && (
                        <button type="button" onClick={() => setLogoPreview(null)}
                          className="ml-2 text-slate-500 hover:text-red-400 text-xs underline">
                          Quitar logo
                        </button>
                      )}
                      <p className="text-slate-600 text-xs mt-1">Máximo 2 MB. Se mostrará en el panel y en los presupuestos.</p>
                    </div>
                  </div>
                </div>

                {/* Selector de tema */}
                <div>
                  <label className="text-slate-400 text-sm mb-3 block flex items-center gap-2">
                    <Palette className="w-4 h-4" /> Tema de color del panel
                  </label>
                  <div className="flex flex-wrap gap-4 justify-start">
                    {TEMAS.map(tema => (
                      <TemaPreview key={tema.id} tema={tema}
                        selected={form.tema === tema.id}
                        onClick={() => setForm(p => ({ ...p, tema: tema.id }))} />
                    ))}
                  </div>
                  {/* Descripción del tema seleccionado */}
                  <div className="mt-3 p-3 bg-arandu-dark rounded-lg border border-white/5">
                    <p className="text-slate-400 text-xs">{temaInfo(form.tema).desc}</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}
                    className="flex-1 border-white/10 text-slate-400">
                    <X className="w-4 h-4 mr-2" /> Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}
                    className="flex-1 bg-arandu-blue hover:bg-arandu-blue-dark text-white">
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear empresa"}
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

export default EmpresasPropiasPage;
