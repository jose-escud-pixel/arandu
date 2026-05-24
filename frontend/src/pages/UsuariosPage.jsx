import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, ArrowLeft, Edit, Trash2, Shield, Save, X,
  ChevronDown, ChevronUp, Building2, Check, Lock, Star, Search, UserCog
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";
import { toast } from "sonner";
import { DEFAULT_EMPRESA_MODULOS, PERMISO_A_MODULO_EMPRESA, modulosHabilitadosEmpresa } from "../lib/modulosEmpresa";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODULOS_LABELS = {
  empresas: "Clientes",
  presupuestos: "Presupuestos",
  inventario: "Inventario",
  credenciales: "Credenciales",
  reportes: "Reportes",
  alertas: "Alertas",
  costos: "Costos",
  proveedores: "Proveedores",
  costos_fijos: "Costos fijos",
  empleados: "Empleados",
  facturas: "Facturas",
  balance: "Balance",
  ingresos_varios: "Ingresos varios",
  pagos_proveedores: "Pagos a proveedores",
  compras: "Compras",
  recibos: "Recibos",
  notas_credito: "Notas de crédito",
  inventario_productos: "Inventario productos",
  historial_stock: "Historial de stock",
  bancos: "Bancos",
  usuarios: "Usuarios",
  auditoria: "Auditoría",
};

const ACCIONES_LABELS = {
  ver: "Ver",
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  exportar: "Exportar",
  afectar_stock: "Cambiar afectación stock",
  ajustar_stock: "Ajustar stock",
  crear_servicio: "Crear servicios",
  stock_inicial: "Stock inicial",
  modo_libre: "Modo libre",
};

function ChipSearch({ chips, setChips, inputVal, setInputVal, placeholder }) {
  const addChip = () => {
    const term = inputVal.trim().replace(/,$/, "");
    if (term && !chips.includes(term)) setChips(prev => [...prev, term]);
    setInputVal("");
  };
  return (
    <div className="space-y-2">
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => {
            if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) { e.preventDefault(); addChip(); }
            if (e.key === "Backspace" && !inputVal && chips.length) setChips(prev => prev.slice(0, -1));
          }}
          placeholder={placeholder}
          className="w-full bg-arandu-dark-light border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-arandu-blue/60"
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

const UsuariosPage = () => {
  const { token, user: currentUser } = useContext(AuthContext);
  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresasPropias, setEmpresasPropias] = useState([]);
  const [permisosDisponibles, setPermisosDisponibles] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    role: "usuario",
    permisos: [],
    empresas_asignadas: [],
    logos_asignados: []
  });
  const [expandedUser, setExpandedUser] = useState(null);
  const [searchChips, setSearchChips] = useState([]);
  const [searchInput, setSearchInput] = useState("");

  const getModulosPermitidosPorLogos = (logos) => {
    const ids = (logos || []).map(String);
    if (!ids.length) return [];
    const seleccionadas = empresasPropias.filter(ep => ids.includes(String(ep.id)));
    return [...new Set(seleccionadas.flatMap(ep => modulosHabilitadosEmpresa(ep) || DEFAULT_EMPRESA_MODULOS))];
  };

  const modulosPermitidosForm = getModulosPermitidosPorLogos(formData.logos_asignados);
  const permisoPermitidoPorEmpresa = (permiso) => {
    const permisoModulo = String(permiso || "").split(".")[0];
    const moduloEmpresa = PERMISO_A_MODULO_EMPRESA[permisoModulo];
    if (!moduloEmpresa || !modulosPermitidosForm.includes(moduloEmpresa)) return false;
    return currentUser?.role === "admin" || currentUser?.role === "gerente" || (currentUser?.permisos || []).includes(permiso);
  };

  const limpiarPermisosFueraDeModulos = (next) => ({
    ...next,
    permisos: (next.permisos || []).filter(permiso => {
      const permisoModulo = String(permiso || "").split(".")[0];
      const moduloEmpresa = PERMISO_A_MODULO_EMPRESA[permisoModulo];
      const habilitado = !!moduloEmpresa && getModulosPermitidosPorLogos(next.logos_asignados).includes(moduloEmpresa);
      return habilitado && (currentUser?.role === "admin" || currentUser?.role === "gerente" || (currentUser?.permisos || []).includes(permiso));
    }),
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [usersRes, empresasRes, permisosRes, propRes] = await Promise.all([
        fetch(`${API}/admin/usuarios`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/empresas`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/permisos-disponibles`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/empresas-propias`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
      ]);

      if (usersRes.ok) setUsuarios(await usersRes.json());
      if (empresasRes.ok) setEmpresas(await empresasRes.json());
      if (permisosRes.ok) setPermisosDisponibles(await permisosRes.json());
      if (propRes.ok) setEmpresasPropias(await propRes.json());
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: "",
      name: "",
      password: "",
      role: "usuario",
      permisos: [],
      empresas_asignadas: [],
      logos_asignados: []
    });
    setEditingId(null);
    setShowForm(false);
  };

  const togglePermiso = (modulo, accion) => {
    const perm = `${modulo}.${accion}`;
    if (!permisoPermitidoPorEmpresa(perm)) return;
    setFormData(prev => ({
      ...prev,
      permisos: prev.permisos.includes(perm)
        ? prev.permisos.filter(p => p !== perm)
        : [...prev.permisos, perm]
    }));
  };

  const toggleAllModule = (modulo) => {
    const acciones = permisosDisponibles[modulo] || [];
    const modulePerms = acciones.map(a => `${modulo}.${a}`);
    if (!modulePerms.some(permisoPermitidoPorEmpresa)) return;
    const allSelected = modulePerms.every(p => formData.permisos.includes(p));

    setFormData(prev => ({
      ...prev,
      permisos: allSelected
        ? prev.permisos.filter(p => !modulePerms.includes(p))
        : [...new Set([...prev.permisos, ...modulePerms])]
    }));
  };

  const toggleEmpresa = (empresaId) => {
    setFormData(prev => {
      const empresasActuales = (prev.empresas_asignadas || []).map(String);
      const id = String(empresaId);
      const exists = empresasActuales.includes(id);

      return {
        ...prev,
        empresas_asignadas: exists
          ? empresasActuales.filter(empId => empId !== id)
          : [...empresasActuales, id]
      };
    });
  };

  // Calcula los slugs de las empresas propias seleccionadas actualmente
  const getSlugsSeleccionados = (logos_asignados) => {
    const ids = (logos_asignados || []).map(String);
    return empresasPropias
      .filter(ep => ids.includes(String(ep.id)))
      .map(ep => ep.slug);
  };

  // Empresas (clientes) que pertenecen a las logos seleccionadas
  const getEmpresasFiltradas = (logos_asignados) => {
    const slugs = getSlugsSeleccionados(logos_asignados);
    if (!slugs.length) return [];
    return empresas.filter(e => slugs.includes(e.logo_tipo));
  };

  const selectAllEmpresas = () => {
    const empresasFiltradas = getEmpresasFiltradas(formData.logos_asignados);
    const allIds = empresasFiltradas.map(e => String(e.id));
    const selectedIds = (formData.empresas_asignadas || []).map(String);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.includes(id));

    setFormData(prev => ({
      ...prev,
      empresas_asignadas: allSelected ? [] : allIds
    }));
  };

  const toggleLogo = (logoId) => {
    setFormData(prev => {
      const current = (prev.logos_asignados || []).map(String);
      const id = String(logoId);
      const isAdding = !current.includes(id);
      const newLogos = isAdding ? [...current, id] : current.filter(x => x !== id);

      // Gestión automática de clientes según empresa propia
      const empresaPropia = empresasPropias.find(ep => String(ep.id) === id);
      let newEmpresas = (prev.empresas_asignadas || []).map(String);

      if (empresaPropia) {
        const clientesDeEsta = empresas
          .filter(e => e.logo_tipo === empresaPropia.slug)
          .map(e => String(e.id));

        if (isAdding) {
          // Al agregar empresa propia → auto-seleccionar todos sus clientes
          newEmpresas = [...new Set([...newEmpresas, ...clientesDeEsta])];
        } else {
          // Al quitar empresa propia → remover sus clientes de la selección
          newEmpresas = newEmpresas.filter(empId => !clientesDeEsta.includes(empId));
        }
      }

      return limpiarPermisosFueraDeModulos({
        ...prev,
        logos_asignados: newLogos,
        empresas_asignadas: newEmpresas,
      });
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.name || (!editingId && !formData.password)) {
      toast.error("Complete todos los campos requeridos");
      return;
    }

    try {
      const payload = {
        ...limpiarPermisosFueraDeModulos(formData),
        empresas_asignadas: (formData.empresas_asignadas || []).map(String),
        logos_asignados: (formData.logos_asignados || []).map(String)
      };

      const url = editingId
        ? `${API}/admin/usuarios/${editingId}`
        : `${API}/admin/usuarios`;

      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingId ? "Usuario actualizado" : "Usuario creado");
        resetForm();
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al guardar");
      }
    } catch (err) {
      toast.error("Error de conexion");
    }
  };

  const handleEdit = (usuario) => {
    setEditingId(usuario.id);
    setFormData({
      email: usuario.email,
      name: usuario.name,
      password: "",
      role: usuario.role,
      permisos: usuario.permisos || [],
      empresas_asignadas: (usuario.empresas_asignadas || []).map(String),
      logos_asignados: (usuario.logos_asignados || []).map(String)
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Seguro que desea eliminar este usuario?")) return;

    try {
      const res = await fetch(`${API}/admin/usuarios/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success("Usuario eliminado");
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al eliminar");
      }
    } catch (err) {
      toast.error("Error de conexion");
    }
  };

  const getPermisosSummary = (permisos) => {
    if (!permisos || !permisos.length) return "Sin permisos";
    const modulos = [...new Set(permisos.map(p => p.split(".")[0]))];
    return modulos.map(m => MODULOS_LABELS[m] || m).join(", ");
  };

  const getEmpresasSummary = (asignadas) => {
    if (!asignadas || !asignadas.length) return "Sin clientes asignados";
    const found = empresas.filter(e => asignadas.map(String).includes(String(e.id)));
    if (!found.length) return `${asignadas.length} clientes`;
    return found.map(e => e.nombre).join(", ");
  };

  const getLogosSummary = (logos) => {
    if (!logos || !logos.length) return "Sin empresas asignadas";
    const found = empresasPropias.filter(e => logos.map(String).includes(String(e.id)));
    if (!found.length) return `${logos.length} empresa(s)`;
    return found.map(e => e.nombre).join(", ");
  };


  const ROLE_RANK = { usuario: 1, gerente: 2, admin: 3 };
  const rankOf = (role) => ROLE_RANK[role] || 1;
  const canManageUser = (targetUsuario) => {
    if (!currentUser) return false;
    if (targetUsuario.id === currentUser.id) return false; // no editarse a sí mismo
    return rankOf(currentUser.role) > rankOf(targetUsuario.role);
  };
  const filteredUsuarios = usuarios.filter(usuario => {
    const texto = [
      usuario.name, usuario.email, usuario.role,
      getLogosSummary(usuario.logos_asignados),
      getEmpresasSummary(usuario.empresas_asignadas),
      getPermisosSummary(usuario.permisos),
      ...(usuario.permisos || [])
    ].filter(Boolean).join(" ");
    return matchChips(searchChips, searchInput, texto);
  });

  return (
    <div className="min-h-screen bg-arandu-dark p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/sistema" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-arandu-blue" />
                <h1 className="font-heading text-3xl font-bold text-white">Usuarios</h1>
              </div>
              <p className="text-slate-400 text-sm mt-1">Gestión de usuarios y permisos</p>
            </div>
          </div>

          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-arandu-red hover:bg-arandu-red-dark text-white"
            data-testid="new-user-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Usuario
          </Button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto"
              onClick={(e) => e.target === e.currentTarget && resetForm()}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-2xl p-6 my-8"
              >
                <h2 className="font-heading text-xl font-bold text-white mb-6">
                  {editingId ? "Editar Usuario" : "Nuevo Usuario"}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">Nombre *</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="Nombre completo"
                        data-testid="user-name-input"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 text-sm mb-1 block">
                        Usuario / Email *
                        <span className="text-slate-600 font-normal ml-1 text-xs">(nombre de usuario o correo completo)</span>
                      </label>
                      <Input
                        type="text"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value.trim() })}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="usuario o correo@dominio.com"
                        autoComplete="off"
                        data-testid="user-email-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-sm mb-1 block">
                      Contraseña {editingId ? "(dejar vacío para no cambiar)" : "*"}
                    </label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="bg-arandu-dark border-white/10 text-white"
                      placeholder="********"
                      data-testid="user-password-input"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 text-sm mb-2 block">Rol *</label>
                    <div className="flex gap-3 flex-wrap">
                      {currentUser?.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, role: "admin" })}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                            formData.role === "admin"
                              ? "border-arandu-red bg-arandu-red/10 text-arandu-red"
                              : "border-white/10 bg-arandu-dark text-slate-400 hover:border-white/20"
                          }`}
                          data-testid="role-superadmin-btn"
                        >
                          <Shield className="w-4 h-4" />
                          Super Admin
                        </button>
                      )}

                      {currentUser?.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, role: "gerente" })}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                            formData.role === "gerente"
                              ? "border-amber-500 bg-amber-500/10 text-amber-400"
                              : "border-white/10 bg-arandu-dark text-slate-400 hover:border-white/20"
                          }`}
                          data-testid="role-admin-btn"
                        >
                          <UserCog className="w-4 h-4" />
                          Administrador
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, role: "usuario" })}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                          formData.role === "usuario"
                            ? "border-arandu-blue bg-arandu-blue/10 text-arandu-blue"
                            : "border-white/10 bg-arandu-dark text-slate-400 hover:border-white/20"
                        }`}
                        data-testid="role-usuario-btn"
                      >
                        <Lock className="w-4 h-4" />
                        Usuario Restringido
                      </button>
                    </div>
                  </div>

                  {(formData.role === "usuario" || formData.role === "gerente") && (
                    <div className="space-y-4 pt-2">

                      {/* ── NUESTRAS EMPRESAS (logos_asignados) ── */}
                      {empresasPropias.length > 0 && (
                        <div className="border border-white/10 rounded-lg overflow-hidden">
                          <div className="bg-arandu-dark p-3 flex items-center gap-2">
                            <Star className="w-4 h-4 text-amber-400" />
                            <span className="text-white font-medium text-sm">Nuestras Empresas</span>
                            <span className="text-slate-500 text-xs">
                              ({(formData.logos_asignados || []).length}/{empresasPropias.length})
                            </span>
                          </div>

                          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {empresasPropias.map(ep => {
                              const isSelected = (formData.logos_asignados || [])
                                .map(String)
                                .includes(String(ep.id));

                              return (
                                <label
                                  key={ep.id}
                                  onClick={() => toggleLogo(String(ep.id))}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                                    isSelected
                                      ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                                      : "border-white/5 bg-arandu-dark text-slate-400 hover:border-white/10"
                                  }`}
                                >
                                  <div
                                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                      isSelected
                                        ? "bg-amber-500 border-amber-500"
                                        : "border-white/20"
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </div>

                                  {ep.logo ? (
                                    <img src={ep.logo} alt={ep.nombre} className="w-5 h-5 object-contain rounded" />
                                  ) : (
                                    <div
                                      className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                      style={{ backgroundColor: ep.color || "#64748b" }}
                                    >
                                      {ep.nombre.charAt(0)}
                                    </div>
                                  )}

                                  <span className="truncate">{ep.nombre}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── CLIENTES ASIGNADOS (empresas_asignadas) — solo para usuario ── */}
                      {formData.role === "usuario" && (() => {
                        const empresasFiltradas = getEmpresasFiltradas(formData.logos_asignados);
                        const selectedIds = (formData.empresas_asignadas || []).map(String);
                        const allFilteredSelected = empresasFiltradas.length > 0 && empresasFiltradas.every(e => selectedIds.includes(String(e.id)));
                        const noLogosSelected = (formData.logos_asignados || []).length === 0;
                        return (
                          <div className="border border-white/10 rounded-lg overflow-hidden">
                            <div className="bg-arandu-dark p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-purple-400" />
                                <span className="text-white font-medium text-sm">Clientes asignados</span>
                                <span className="text-slate-500 text-xs">
                                  ({selectedIds.filter(id => empresasFiltradas.map(e => String(e.id)).includes(id)).length}/{empresasFiltradas.length})
                                </span>
                              </div>
                              {empresasFiltradas.length > 0 && (
                                <button
                                  type="button"
                                  className="text-xs text-purple-400 hover:underline"
                                  onClick={(e) => { e.stopPropagation(); selectAllEmpresas(); }}
                                >
                                  {allFilteredSelected ? "Deseleccionar todas" : "Seleccionar todas"}
                                </button>
                              )}
                            </div>

                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                              {noLogosSelected ? (
                                <p className="text-slate-500 text-sm col-span-2 py-2">
                                  Seleccioná primero una empresa propia para ver sus clientes.
                                </p>
                              ) : empresasFiltradas.length === 0 ? (
                                <p className="text-slate-500 text-sm col-span-2 py-2">
                                  Esta empresa no tiene clientes registrados.
                                </p>
                              ) : (
                                empresasFiltradas.map(emp => {
                                  const isSelected = selectedIds.includes(String(emp.id));
                                  return (
                                    <label
                                      key={emp.id}
                                      onClick={() => toggleEmpresa(String(emp.id))}
                                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                                        isSelected
                                          ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
                                          : "border-white/5 bg-arandu-dark text-slate-400 hover:border-white/10"
                                      }`}
                                      data-testid={`empresa-assign-${emp.id}`}
                                    >
                                      <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                          isSelected
                                            ? "bg-purple-500 border-purple-500"
                                            : "border-white/20"
                                        }`}
                                      >
                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                      </div>
                                      <span className="truncate">{emp.nombre}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── PERMISOS — solo para usuario ── */}
                      {formData.role === "usuario" && <div className="border border-white/10 rounded-lg overflow-hidden">
                        <div className="bg-arandu-dark p-3 flex items-center gap-2">
                          <Shield className="w-4 h-4 text-arandu-blue" />
                          <span className="text-white font-medium text-sm">Permisos por Módulo</span>
                        </div>

                        <div className="p-3 space-y-2">
                          {Object.entries(permisosDisponibles).filter(([modulo]) => {
                            const moduloEmpresa = PERMISO_A_MODULO_EMPRESA[modulo];
                            return !!moduloEmpresa && modulosPermitidosForm.includes(moduloEmpresa);
                          }).map(([modulo, acciones]) => {
                            const modulePerms = acciones.map(a => `${modulo}.${a}`);
                            const selectedCount = modulePerms.filter(p => formData.permisos.includes(p)).length;
                            const allSelected = selectedCount === modulePerms.length;

                            return (
                              <div key={modulo} className="border border-white/5 rounded-lg overflow-hidden">
                                <div
                                  className="flex items-center justify-between px-3 py-2 bg-arandu-dark cursor-pointer hover:bg-white/5 transition-all"
                                  onClick={() => toggleAllModule(modulo)}
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                        allSelected
                                          ? "bg-arandu-blue border-arandu-blue"
                                          : selectedCount > 0
                                          ? "bg-arandu-blue/50 border-arandu-blue"
                                          : "border-white/20"
                                      }`}
                                    >
                                      {(allSelected || selectedCount > 0) && (
                                        <Check className="w-3 h-3 text-white" />
                                      )}
                                    </div>

                                    <span className="text-white text-sm font-medium">
                                      {MODULOS_LABELS[modulo] || modulo}
                                    </span>
                                  </div>

                                  <span className="text-slate-500 text-xs">
                                    {selectedCount}/{acciones.length}
                                  </span>
                                </div>

                                <div className="flex flex-wrap gap-2 px-3 py-2">
                                  {acciones.map(accion => {
                                    const perm = `${modulo}.${accion}`;
                                    const active = formData.permisos.includes(perm);

                                    return (
                                      <button
                                        key={perm}
                                        type="button"
                                        onClick={() => togglePermiso(modulo, accion)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                                          active
                                            ? "bg-arandu-blue/20 border-arandu-blue/50 text-arandu-blue"
                                            : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
                                        }`}
                                        data-testid={`perm-${perm}`}
                                      >
                                        {ACCIONES_LABELS[accion] || accion}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                          {modulosPermitidosForm.length === 0 && (
                            <div className="text-slate-500 text-sm bg-arandu-dark rounded-lg border border-white/5 px-3 py-4">
                              Seleccioná al menos una empresa propia para habilitar permisos.
                            </div>
                          )}
                        </div>
                      </div>}
                    </div>
                  )}

                  {formData.role === "admin" && (
                    <div className="bg-arandu-red/10 border border-arandu-red/20 rounded-lg p-3">
                      <p className="text-arandu-red text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Super Admin: acceso total a todas las empresas y funciones.
                      </p>
                    </div>
                  )}
                  {formData.role === "gerente" && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                      <p className="text-amber-400 text-sm flex items-center gap-2">
                        <UserCog className="w-4 h-4" />
                        Administrador de empresa: puede gestionar usuarios de sus empresas asignadas.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetForm}
                      className="flex-1 border-white/10 text-slate-400"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>

                    <Button
                      type="submit"
                      className="flex-1 bg-arandu-blue hover:bg-arandu-blue-dark text-white"
                      data-testid="save-user-btn"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {editingId ? "Guardar Cambios" : "Crear Usuario"}
                    </Button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-4">
          <ChipSearch
            chips={searchChips}
            setChips={setSearchChips}
            inputVal={searchInput}
            setInputVal={setSearchInput}
            placeholder="Buscar usuario, email, rol, cliente, empresa o permiso... Enter para agregar"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-arandu-blue animate-pulse">Cargando...</div>
          </div>
        ) : filteredUsuarios.length === 0 ? (
          <div className="text-center py-12 bg-arandu-dark-light rounded-xl border border-white/5">
            <Users className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">{usuarios.length ? "No hay usuarios que coincidan" : "No hay usuarios registrados"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUsuarios.map((usuario, index) => (
              <motion.div
                key={usuario.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-arandu-dark-light border border-white/5 rounded-xl overflow-hidden"
                data-testid={`user-card-${usuario.id}`}
              >
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        usuario.role === "admin" ? "bg-arandu-red/20"
                        : usuario.role === "gerente" ? "bg-amber-500/20"
                        : "bg-arandu-blue/20"
                      }`}
                    >
                      {usuario.role === "admin" ? (
                        <Shield className="w-5 h-5 text-arandu-red" />
                      ) : usuario.role === "gerente" ? (
                        <UserCog className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Lock className="w-5 h-5 text-arandu-blue" />
                      )}
                    </div>

                    <div>
                      <h3 className="text-white font-medium">{usuario.name}</h3>
                      <p className="text-slate-400 text-sm">{usuario.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        usuario.role === "admin"
                          ? "bg-arandu-red/20 text-arandu-red border border-arandu-red/30"
                          : usuario.role === "gerente"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-arandu-blue/20 text-arandu-blue border border-arandu-blue/30"
                      }`}
                    >
                      {usuario.role === "admin" ? "Super Admin"
                       : usuario.role === "gerente" ? "Administrador"
                       : "Usuario"}
                    </span>

                    {usuario.role === "usuario" && (
                      <button
                        onClick={() => setExpandedUser(expandedUser === usuario.id ? null : usuario.id)}
                        className="text-slate-400 hover:text-white transition-colors"
                        data-testid={`expand-user-${usuario.id}`}
                      >
                        {expandedUser === usuario.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    <div className="flex gap-1">
                      {canManageUser(usuario) && (
                        <Button
                          onClick={() => handleEdit(usuario)}
                          variant="ghost"
                          className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                          title="Editar"
                          data-testid={`edit-user-${usuario.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}

                      {canManageUser(usuario) && (
                        <Button
                          onClick={() => handleDelete(usuario.id)}
                          variant="ghost"
                          className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                          title="Eliminar"
                          data-testid={`delete-user-${usuario.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedUser === usuario.id && usuario.role === "usuario" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/5 overflow-hidden"
                    >
                      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Nuestras Empresas */}
                        <div>
                          <p className="text-slate-500 text-xs mb-2 flex items-center gap-1">
                            <Star className="w-3 h-3" /> Nuestras Empresas
                          </p>
                          <p className="text-amber-300 text-sm">
                            {getLogosSummary(usuario.logos_asignados)}
                          </p>
                        </div>

                        {/* Clientes */}
                        <div>
                          <p className="text-slate-500 text-xs mb-2 flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> Clientes
                          </p>
                          <p className="text-purple-300 text-sm">
                            {getEmpresasSummary(usuario.empresas_asignadas)}
                          </p>
                        </div>

                        {/* Permisos */}
                        <div>
                          <p className="text-slate-500 text-xs mb-2 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Permisos
                          </p>

                          {(usuario.permisos || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(usuario.permisos || []).map(p => (
                                <span
                                  key={p}
                                  className="px-2 py-0.5 bg-arandu-blue/10 border border-arandu-blue/20 rounded text-arandu-blue text-xs"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-600 text-sm">Sin permisos asignados</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UsuariosPage;
