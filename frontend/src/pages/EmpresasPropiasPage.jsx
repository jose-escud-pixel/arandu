import React, { useState, useEffect, useContext, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Building2, Plus, Edit, Trash2, Save, X,
  Upload, Image, Palette, Check, Globe, RefreshCw,
  Download, FileText
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";
import { toast } from "sonner";
import { DEFAULT_EMPRESA_MODULOS, EMPRESA_MODULOS, EMPRESA_MODULOS_OBLIGATORIOS, modulosHabilitadosEmpresa } from "../lib/modulosEmpresa";
import { resolveLogoForContext, logoSizePx } from "../lib/logoUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const readApiError = async (res, fallback) => {
  try {
    const err = await res.json();
    const detail = err.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg || JSON.stringify(item)).join(" · ");
    if (detail) return String(detail);
  } catch (_) {
    // The backend may return an empty or non-JSON error body.
  }
  return `${fallback} (${res.status})`;
};

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

// ── Constantes para gestión de logos ─────────────────────────────────────────
const SIZE_OPTIONS = [
  { key: "xs", label: "XS", px: 32 },
  { key: "s",  label: "S",  px: 44 },
  { key: "m",  label: "M",  px: 56 },
  { key: "l",  label: "L",  px: 72 },
  { key: "xl", label: "XL", px: 88 },
];
const ETIQUETA_OPTS = [
  { value: "general", label: "General" },
  { value: "oscuro",  label: "Oscuro"  },
  { value: "claro",   label: "Claro"   },
];

// ── ContextConfig: configuración por contexto (panel / docs) ──────────────────
const ContextConfig = ({ title, icon, mode, setMode, selectedId, setSelectedId, size, setSize, logos, preferEtiqueta }) => {
  const previewUrl = (() => {
    if (mode === "manual" && selectedId) return logos.find(l => l.id === selectedId)?.url || null;
    if (logos.length === 0) return null;
    return logos.find(l => l.etiqueta === preferEtiqueta)?.url
      || logos.find(l => l.etiqueta === "general")?.url
      || logos[0]?.url
      || null;
  })();
  const previewPx = logoSizePx(size);

  return (
    <div className="bg-arandu-dark/60 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-slate-400">{icon}</span>
        <h4 className="text-slate-200 text-sm font-semibold">{title}</h4>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        {["auto", "manual"].map(m => (
          <button key={m} type="button"
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === m
                ? "bg-arandu-blue text-white"
                : "bg-arandu-dark text-slate-400 hover:text-slate-200 border border-white/10"
            }`}
          >
            {m === "auto" ? "Auto (por etiqueta)" : "Manual (elegir logo)"}
          </button>
        ))}
      </div>

      {/* Auto: info */}
      {mode === "auto" && (
        <p className="text-slate-500 text-xs mb-4">
          Buscará logo con etiqueta <span className="text-slate-300 font-mono">"{preferEtiqueta}"</span>, luego "general", luego el primero disponible.
        </p>
      )}

      {/* Manual: logo picker */}
      {mode === "manual" && (
        <div className="mb-4">
          {logos.length === 0 ? (
            <p className="text-slate-500 text-xs">Primero subí logos a la librería de arriba.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {logos.map(l => (
                <button key={l.id} type="button"
                  onClick={() => setSelectedId(l.id)}
                  title={l.nombre || l.etiqueta}
                  className={`rounded-xl border p-1.5 transition-all ${
                    selectedId === l.id
                      ? "border-arandu-blue ring-1 ring-arandu-blue"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <img src={l.url} alt={l.nombre} className="w-12 h-12 object-contain rounded" />
                  <p className="text-[10px] text-slate-500 mt-1 text-center w-12 truncate">{l.etiqueta}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Size selector */}
      <div className="mb-3">
        <p className="text-slate-400 text-xs mb-2">Tamaño:</p>
        <div className="flex gap-1.5">
          {SIZE_OPTIONS.map(s => (
            <button key={s.key} type="button"
              onClick={() => setSize(s.key)}
              className={`w-9 py-1 rounded text-xs font-medium transition-all ${
                size === s.key
                  ? "bg-arandu-blue text-white"
                  : "bg-arandu-dark text-slate-400 border border-white/10 hover:border-white/30"
              }`}
            >{s.label}</button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-3 p-3 bg-arandu-dark rounded-lg border border-white/5">
        <div className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
          style={{ width: previewPx, height: previewPx }}>
          {previewUrl ? (
            <img src={previewUrl} alt="preview"
              style={{ maxWidth: previewPx, maxHeight: previewPx, objectFit: "contain" }} />
          ) : (
            <div className="w-full h-full rounded-lg bg-slate-700/40 flex items-center justify-center">
              <Image className="w-5 h-5 text-slate-600" />
            </div>
          )}
        </div>
        <div>
          <p className="text-slate-400 text-xs">{previewUrl ? "Vista previa del logo" : "Sin logo (usará marca de texto)"}</p>
          <p className="text-slate-600 text-[11px]">{previewPx}px de alto</p>
        </div>
      </div>
    </div>
  );
};

// ── LogoManagerModal ──────────────────────────────────────────────────────────
const LogoManagerModal = ({ empresa, token, onClose, onSaved }) => {
  const [logos, setLogos] = useState(empresa.logos || []);
  const [panelMode, setPanelMode] = useState(empresa.logo_panel_mode || "auto");
  const [panelLogoId, setPanelLogoId] = useState(empresa.logo_panel_id || null);
  const [panelSize, setPanelSize] = useState(empresa.logo_panel_size || "m");
  const [docsMode, setDocsMode] = useState(empresa.logo_docs_mode || "auto");
  const [docsLogoId, setDocsLogoId] = useState(empresa.logo_docs_id || null);
  const [docsSize, setDocsSize] = useState(empresa.logo_docs_size || "m");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLogo, setEditingLogo] = useState(null); // { id, nombre, etiqueta }
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Máximo 2 MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("nombre", file.name.replace(/\.[^.]+$/, ""));
      fd.append("etiqueta", "general");
      const res = await fetch(`${API}/admin/empresas-propias/${empresa.id}/logos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) { const data = await res.json(); setLogos(data.logos || []); onSaved(); toast.success("Logo subido"); }
      else toast.error(await readApiError(res, "Error al subir logo"), { duration: 8000 });
    } catch (error) {
      console.error("Error al subir logo:", error);
      toast.error("Error de conexión al subir logo. Revisá que el backend esté activo.");
    }
    finally { setUploading(false); e.target.value = ""; }
  };

  const handleDeleteLogo = async (logoId) => {
    if (!window.confirm("¿Eliminar este logo de la librería?")) return;
    try {
      const res = await fetch(`${API}/admin/empresas-propias/${empresa.id}/logos/${logoId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogos(data.logos || []);
        if (panelLogoId === logoId) setPanelLogoId(null);
        if (docsLogoId === logoId) setDocsLogoId(null);
        onSaved();
        toast.success("Logo eliminado");
      } else toast.error(await readApiError(res, "Error al eliminar logo"), { duration: 8000 });
    } catch (error) {
      console.error("Error al eliminar logo:", error);
      toast.error("Error de conexión al eliminar logo");
    }
  };

  const handleSaveLogoEdit = async () => {
    if (!editingLogo) return;
    try {
      const res = await fetch(`${API}/admin/empresas-propias/${empresa.id}/logos/${editingLogo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: editingLogo.nombre, etiqueta: editingLogo.etiqueta }),
      });
      if (res.ok) { const data = await res.json(); setLogos(data.logos || []); setEditingLogo(null); onSaved(); toast.success("Actualizado"); }
      else toast.error(await readApiError(res, "Error al actualizar logo"), { duration: 8000 });
    } catch (error) {
      console.error("Error al actualizar logo:", error);
      toast.error("Error de conexión al actualizar logo");
    }
  };

  const handleDownload = (logo) => {
    const a = document.createElement("a");
    a.href = logo.url;
    a.download = `${logo.nombre || "logo"}.png`;
    a.click();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/empresas-propias/${empresa.id}/logo-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          logo_panel_mode: panelMode,
          logo_panel_id: panelLogoId || null,
          logo_panel_size: panelSize,
          logo_docs_mode: docsMode,
          logo_docs_id: docsLogoId || null,
          logo_docs_size: docsSize,
        }),
      });
      if (res.ok) { toast.success("Configuración guardada"); onSaved(); onClose(); }
      else toast.error(await readApiError(res, "Error al guardar configuración"), { duration: 8000 });
    } catch (error) {
      console.error("Error al guardar configuración de logos:", error);
      toast.error("Error de conexión al guardar configuración");
    }
    finally { setSaving(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-arandu-dark-light border border-white/10 rounded-2xl w-full max-w-2xl p-6 my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Image className="w-5 h-5 text-arandu-blue" />
            <div>
              <h2 className="font-heading text-xl font-bold text-white">Gestionar logos</h2>
              <p className="text-slate-400 text-xs mt-0.5">{empresa.nombre}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>

        {/* ── Librería de logos ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-300 text-sm font-semibold">Librería de logos</h3>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              <Button type="button" size="sm" onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="bg-arandu-blue hover:bg-arandu-blue-dark text-white text-xs">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? "Subiendo..." : "Subir logo"}
              </Button>
            </div>
          </div>

          {logos.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-white/10 rounded-xl">
              <Image className="w-10 h-10 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No hay logos en la librería</p>
              <p className="text-slate-600 text-xs mt-1">Subí imágenes para asignarlas a cada contexto</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logos.map(logo => (
                <div key={logo.id}
                  className="flex items-center gap-3 bg-arandu-dark/60 border border-white/10 rounded-xl p-3">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-lg border border-white/10 bg-arandu-dark flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src={logo.url} alt={logo.nombre} className="w-full h-full object-contain p-1" />
                  </div>

                  {editingLogo?.id === logo.id ? (
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <Input value={editingLogo.nombre}
                        onChange={e => setEditingLogo(prev => ({ ...prev, nombre: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white text-sm h-8 flex-1 min-w-0"
                        placeholder="Nombre" />
                      <select value={editingLogo.etiqueta}
                        onChange={e => setEditingLogo(prev => ({ ...prev, etiqueta: e.target.value }))}
                        className="bg-arandu-dark border border-white/10 rounded-lg text-slate-300 text-xs px-2 h-8">
                        {ETIQUETA_OPTS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button onClick={handleSaveLogoEdit} className="text-emerald-400 hover:text-emerald-300">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingLogo(null)} className="text-slate-500 hover:text-slate-300">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm truncate">{logo.nombre || "Logo"}</p>
                        <span className={`inline-block text-[10px] rounded px-1.5 py-0.5 mt-1 font-medium ${
                          logo.etiqueta === "oscuro" ? "bg-slate-700 text-slate-300"
                          : logo.etiqueta === "claro" ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-600/40 text-slate-400"
                        }`}>{logo.etiqueta}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button type="button" title="Editar etiqueta/nombre"
                          onClick={() => setEditingLogo({ id: logo.id, nombre: logo.nombre || "", etiqueta: logo.etiqueta })}
                          className="text-slate-400 hover:text-yellow-400 p-1.5 rounded hover:bg-yellow-500/10 transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" title="Descargar"
                          onClick={() => handleDownload(logo)}
                          className="text-slate-400 hover:text-arandu-blue p-1.5 rounded hover:bg-arandu-blue/10 transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" title="Eliminar"
                          onClick={() => handleDeleteLogo(logo.id)}
                          className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Configuración por contexto ── */}
        <div className="space-y-4 mb-6">
          <h3 className="text-slate-300 text-sm font-semibold">Uso por contexto</h3>
          <ContextConfig
            title="Panel / Sidebar"
            icon={<Globe className="w-4 h-4" />}
            mode={panelMode} setMode={setPanelMode}
            selectedId={panelLogoId} setSelectedId={setPanelLogoId}
            size={panelSize} setSize={setPanelSize}
            logos={logos}
            preferEtiqueta="oscuro"
          />
          <ContextConfig
            title="Documentos impresos (facturas, presupuestos)"
            icon={<FileText className="w-4 h-4" />}
            mode={docsMode} setMode={setDocsMode}
            selectedId={docsLogoId} setSelectedId={setDocsLogoId}
            size={docsSize} setSize={setDocsSize}
            logos={logos}
            preferEtiqueta="claro"
          />
        </div>

        {/* Footer */}
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose}
            className="flex-1 border-white/10 text-slate-400">
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={handleSave}
            className="flex-1 bg-arandu-blue hover:bg-arandu-blue-dark text-white">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────
const EmpresasPropiasPage = () => {
  const { token, refreshEmpresasPropias, user } = useContext(AuthContext);
  const isSuperAdmin = user?.role === "admin";
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);
  const [showLogoManager, setShowLogoManager] = useState(false);
  const [logoManagerEmpresa, setLogoManagerEmpresa] = useState(null);

  const emptyForm = () => ({
    nombre: "",
    slug: "",
    razon_social: "",
    ruc: "",
    direccion: "",
    telefono: "",
    email: "",
    color: "#3b82f6",
    tema: "oscuro-azul",
    modulos_habilitados: [...DEFAULT_EMPRESA_MODULOS],
  });
  const [form, setForm] = useState(emptyForm());
  const [logoPreview, setLogoPreview] = useState(null); // base64 preview antes de subir

  useEffect(() => { fetchEmpresas(); }, []);

  const fetchEmpresas = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/empresas-propias`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (!isSuperAdmin) {
          const asignados = user?.logos_asignados || [];
          setEmpresas(data.filter(e => asignados.includes(e.id)));
        } else {
          setEmpresas(data);
        }
      }
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
    setForm({
      nombre: ep.nombre || "",
      slug: ep.slug || "",
      razon_social: ep.razon_social || "",
      ruc: ep.ruc || "",
      direccion: ep.direccion || "",
      telefono: ep.telefono || "",
      email: ep.email || "",
      color: ep.color || "#3b82f6",
      tema: ep.tema || "oscuro-azul",
      modulos_habilitados: modulosHabilitadosEmpresa(ep),
    });
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
        body: JSON.stringify({
          ...form,
          modulos_habilitados: [...new Set([...EMPRESA_MODULOS_OBLIGATORIOS, ...(form.modulos_habilitados || [])])],
        }),
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
        let msg = "Error al guardar";
        try {
          const err = await res.json();
          const d = err.detail;
          if (typeof d === "string") msg = d;
          else if (Array.isArray(d)) msg = d.map((x) => x.msg || JSON.stringify(x)).join(" · ");
          else if (d) msg = String(d);
          else msg = `${msg} (${res.status})`;
        } catch {
          msg = `Error ${res.status}`;
        }
        toast.error(msg);
      }
    } catch (ex) {
      console.error(ex);
      toast.error("Error de conexión");
    }
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
  const toggleModulo = (modulo) => {
    if (EMPRESA_MODULOS_OBLIGATORIOS.includes(modulo)) return;
    setForm(prev => {
      const current = prev.modulos_habilitados || [];
      return {
        ...prev,
        modulos_habilitados: current.includes(modulo)
          ? current.filter(m => m !== modulo)
          : [...current, modulo],
      };
    });
  };

  return (
    <div className="min-h-screen bg-arandu-dark p-4 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link to="/sistema" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-3 text-sm w-fit">
            <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
          </Link>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-arandu-blue" />
              <div>
                <h1 className="font-heading text-3xl font-bold text-white">Empresas Propias</h1>
                <p className="text-slate-400 text-sm">
                  {isSuperAdmin
                    ? "Configurá tus empresas con logo, tema de color y acceso multi-empresa"
                    : "Las empresas que administrás"}
                </p>
              </div>
            </div>
            {isSuperAdmin && (
              <Button onClick={openNew} className="bg-arandu-blue hover:bg-arandu-blue-dark text-white">
                <Plus className="w-4 h-4 mr-2" /> Nueva Empresa
              </Button>
            )}
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
                      {(() => {
                        const panelLogoUrl = resolveLogoForContext(ep, "panel");
                        return (
                          <div className="w-16 h-16 rounded-xl border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden"
                            style={{ backgroundColor: `${ep.color || "#3b82f6"}18` }}>
                            {panelLogoUrl ? (
                              <img src={panelLogoUrl} alt={ep.nombre} className="w-full h-full object-contain p-1" />
                            ) : (
                              <Building2 className="w-8 h-8" style={{ color: ep.color || "#3b82f6" }} />
                            )}
                          </div>
                        );
                      })()}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold text-lg">{ep.nombre}</h3>
                        <p className="text-slate-500 text-xs font-mono mt-0.5">slug: <span className="text-slate-300">{ep.slug}</span></p>
                        {(ep.razon_social || ep.ruc) && (
                          <p className="text-slate-400 text-xs mt-1 truncate">
                            {ep.razon_social || ep.nombre}{ep.ruc ? ` · RUC ${ep.ruc}` : ""}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1.5 bg-arandu-dark rounded-lg px-2.5 py-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tema.preview.accent }} />
                            <span className="text-xs text-slate-400">{tema.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-arandu-dark rounded-lg px-2.5 py-1">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-xs text-slate-400">{modulosHabilitadosEmpresa(ep).length} módulos</span>
                          </div>
                        </div>
                      </div>

                      {/* Acciones */}
                      <div className="flex gap-1 flex-shrink-0">
                        <Button onClick={() => { setLogoManagerEmpresa(ep); setShowLogoManager(true); }}
                          variant="ghost" title="Gestionar logos"
                          className="text-slate-400 hover:text-arandu-blue hover:bg-arandu-blue/10">
                          <Image className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => openEdit(ep)} variant="ghost"
                          className="text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10">
                          <Edit className="w-4 h-4" />
                        </Button>
                        {isSuperAdmin && (
                          <Button onClick={() => handleDelete(ep.id, ep.nombre)} variant="ghost"
                            className="text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {empresas.length === 0 && (
              <div className="col-span-2 text-center py-16 bg-arandu-dark-light border border-white/5 rounded-xl">
                <Building2 className="w-14 h-14 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 mb-4">
                  {isSuperAdmin ? "No hay empresas propias creadas" : "No tenés empresas asignadas"}
                </p>
                {isSuperAdmin && (
                  <Button onClick={openNew} className="bg-arandu-blue hover:bg-arandu-blue-dark text-white">
                    <Plus className="w-4 h-4 mr-2" /> Crear primera empresa
                  </Button>
                )}
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
                    <p className="text-slate-400 text-xs mt-1">Solo letras minúsculas, números y guiones. Se auto-genera del nombre.</p>
                  </div>
                </div>

                {/* Datos fiscales / facturación */}
                <div className="bg-arandu-dark/60 border border-white/10 rounded-xl p-4 space-y-4">
                  <div>
                    <h3 className="text-slate-200 text-sm font-semibold">Datos fiscales para facturación</h3>
                    <p className="text-slate-500 text-xs mt-0.5">Estos datos se usan como emisor en facturas, boletas y comprobantes.</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Razón social</label>
                      <Input value={form.razon_social}
                        onChange={e => setForm(p => ({ ...p, razon_social: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="Ej: Mi Empresa S.A." />
                    </div>
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">RUC</label>
                      <Input value={form.ruc}
                        onChange={e => setForm(p => ({ ...p, ruc: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="Ej: 80000000-1" />
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">Dirección</label>
                    <Input value={form.direccion}
                      onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
                      className="bg-arandu-dark border-white/10 text-white"
                      placeholder="Dirección que aparecerá en la factura" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Teléfono</label>
                      <Input value={form.telefono}
                        onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="Ej: 0981 000 000" />
                    </div>
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Email</label>
                      <Input value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="facturacion@empresa.com" />
                    </div>
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

                {/* Logo → remitir al gestor */}
                {editingId && (
                  <div className="bg-arandu-dark/60 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-slate-300 text-sm font-medium">Logos de la empresa</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        Subí, etiquetá y asigná logos para el panel y los documentos impresos.
                      </p>
                    </div>
                    <Button type="button"
                      onClick={() => {
                        const ep = empresas.find(e => e.id === editingId);
                        if (ep) { setLogoManagerEmpresa(ep); setShowLogoManager(true); }
                      }}
                      variant="outline"
                      className="border-white/10 text-slate-300 hover:text-white whitespace-nowrap flex-shrink-0">
                      <Image className="w-4 h-4 mr-2" />
                      Gestionar logos
                    </Button>
                  </div>
                )}

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

                {/* Módulos habilitados */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <label className="text-slate-300 text-sm font-semibold block">Módulos habilitados</label>
                      <p className="text-slate-500 text-xs mt-0.5">
                        Desactivar un módulo oculta menú, dashboard, accesos directos, reportes y opciones relacionadas para esta empresa.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({
                        ...p,
                        modulos_habilitados: (p.modulos_habilitados || []).length === DEFAULT_EMPRESA_MODULOS.length
                          ? [...EMPRESA_MODULOS_OBLIGATORIOS]
                          : [...DEFAULT_EMPRESA_MODULOS],
                      }))}
                      className="text-xs text-arandu-blue hover:underline whitespace-nowrap"
                    >
                      {(form.modulos_habilitados || []).length === DEFAULT_EMPRESA_MODULOS.length ? "Quitar todos" : "Activar todos"}
                    </button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-2">
                    {Object.entries(EMPRESA_MODULOS).map(([key, modulo]) => {
                      const active = (form.modulos_habilitados || []).includes(key);
                      const obligatorio = !!modulo.obligatorio;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleModulo(key)}
                          className={`text-left rounded-xl border px-3 py-3 transition-all ${
                            active
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-white/10 bg-arandu-dark text-slate-500 hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${active ? "bg-emerald-500 border-emerald-500" : "border-white/20"}`}>
                              {active && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span>
                              <span className={`block text-sm font-medium ${active ? "text-emerald-200" : "text-slate-400"}`}>{modulo.label}</span>
                              {obligatorio && <span className="inline-block text-[10px] text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded px-1.5 py-0.5 mt-1">Obligatorio</span>}
                              <span className="block text-xs text-slate-500 mt-0.5">{modulo.desc}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
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

      {/* ══ MODAL: Gestionar logos ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {showLogoManager && logoManagerEmpresa && (
          <LogoManagerModal
            key={logoManagerEmpresa.id}
            empresa={logoManagerEmpresa}
            token={token}
            onClose={() => { setShowLogoManager(false); setLogoManagerEmpresa(null); }}
            onSaved={() => { fetchEmpresas(); refreshEmpresasPropias(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default EmpresasPropiasPage;
