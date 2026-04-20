import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, ArrowLeft, Edit, Trash2, Shield, Save, X,
  ChevronDown, ChevronUp, Building2, Check, Lock, Star
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODULOS_LABELS = {
  empresas: "Empresas",
  presupuestos: "Presupuestos",
  inventario: "Inventario",
  credenciales: "Credenciales",
  reportes: "Reportes",
  alertas: "Alertas",
  costos: "Costos",
  estadisticas: "Estadísticas",
  contratos: "Contratos",
  proveedores: "Proveedores",
  costos_fijos: "Costos fijos",
  empleados: "Empleados",
  facturas: "Facturas",
  balance: "Balance",
  ingresos_varios: "Ingresos varios",
  pagos_proveedores: "Pagos a proveedores",
  compras: "Compras",
  recibos: "Recibos",
};

const ACCIONES_LABELS = {
  ver: "Ver",
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  exportar: "Exportar",
  afectar_stock: "Afectar Stock",
};

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

  const selectAllEmpresas = () => {
    const allIds = empresas.map(e => String(e.id));
    const selectedIds = (formData.empresas_asignadas || []).map(String);
    const allSelected = allIds.every(id => selectedIds.includes(id));

    setFormData(prev => ({
      ...prev,
      empresas_asignadas: allSelected ? [] : allIds
    }));
  };

  const toggleLogo = (logoId) => {
    setFormData(prev => {
      const current = (prev.logos_asignados || []).map(String);
      const id = String(logoId);
      return {
        ...prev,
        logos_asignados: current.includes(id)
          ? current.filter(x => x !== id)
          : [...current, id]
      };
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
        ...formData,
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

  return (
    <div className="min-h-screen bg-arandu-dark p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2">
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
                      <label className="text-slate-400 text-sm mb-1 block">Email *</label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="bg-arandu-dark border-white/10 text-white"
                        placeholder="correo@ejemplo.com"
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
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, role: "admin" })}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                          formData.role === "admin"
                            ? "border-arandu-red bg-arandu-red/10 text-arandu-red"
                            : "border-white/10 bg-arandu-dark text-slate-400 hover:border-white/20"
                        }`}
                        data-testid="role-admin-btn"
                      >
                        <Shield className="w-4 h-4" />
                        Administrador
                      </button>

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

                  {formData.role === "usuario" && (
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

                      {/* ── CLIENTES ASIGNADOS (empresas_asignadas) ── */}
                      <div className="border border-white/10 rounded-lg overflow-hidden">
                        <div
                          className="bg-arandu-dark p-3 flex items-center justify-between cursor-pointer"
                          onClick={selectAllEmpresas}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-purple-400" />
                            <span className="text-white font-medium text-sm">Clientes asignados</span>
                            <span className="text-slate-500 text-xs">
                              ({(formData.empresas_asignadas || []).length}/{empresas.length})
                            </span>
                          </div>

                          <button
                            type="button"
                            className="text-xs text-purple-400 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectAllEmpresas();
                            }}
                          >
                            {empresas.length === (formData.empresas_asignadas || []).length
                              ? "Deseleccionar todas"
                              : "Seleccionar todas"}
                          </button>
                        </div>

                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                          {empresas.map(emp => {
                            const isSelected = (formData.empresas_asignadas || [])
                              .map(String)
                              .includes(String(emp.id));

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
                          })}

                          {empresas.length === 0 && (
                            <p className="text-slate-500 text-sm col-span-2">
                              No hay clientes registrados
                            </p>
                          )}
                        </div>
                      </div>

                      {/* ── PERMISOS ── */}
                      <div className="border border-white/10 rounded-lg overflow-hidden">
                        <div className="bg-arandu-dark p-3 flex items-center gap-2">
                          <Shield className="w-4 h-4 text-arandu-blue" />
                          <span className="text-white font-medium text-sm">Permisos por Módulo</span>
                        </div>

                        <div className="p-3 space-y-2">
                          {Object.entries(permisosDisponibles).map(([modulo, acciones]) => {
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
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.role === "admin" && (
                    <div className="bg-arandu-red/10 border border-arandu-red/20 rounded-lg p-3">
                      <p className="text-arandu-red text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Los administradores tienen acceso total a todas las funciones y empresas.
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

        {loading ? (
          <div className="text-center py-12">
            <div className="text-arandu-blue animate-pulse">Cargando...</div>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="text-center py-12 bg-arandu-dark-light rounded-xl border border-white/5">
            <Users className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">No hay usuarios registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {usuarios.map((usuario, index) => (
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
                        usuario.role === "admin" ? "bg-arandu-red/20" : "bg-arandu-blue/20"
                      }`}
                    >
                      {usuario.role === "admin" ? (
                        <Shield className="w-5 h-5 text-arandu-red" />
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
                          : "bg-arandu-blue/20 text-arandu-blue border border-arandu-blue/30"
                      }`}
                    >
                      {usuario.role === "admin" ? "Administrador" : "Usuario"}
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
                      <Button
                        onClick={() => handleEdit(usuario)}
                        variant="ghost"
                        className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                        title="Editar"
                        data-testid={`edit-user-${usuario.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>

                      {usuario.id !== currentUser?.id && (
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
