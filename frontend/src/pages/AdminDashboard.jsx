import React, { useState, useEffect, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Home, Mail, MailOpen, Trash2, LogOut, Menu, X,
  MessageSquare, CheckCircle, Clock, User, Phone,
  ChevronRight, BarChart3, Inbox, Building2, FileText, Users, Shield, Eye, Server,
  ClipboardList, DollarSign, AlertCircle, Truck, TrendingDown, UserCheck, Receipt, Scale, TrendingUp, ShoppingBag, Package
} from "lucide-react";
import { Button } from "../components/ui/button";
import { AuthContext } from "../App";
import { toast } from "sonner";
import EmpresaSwitcher from "../components/EmpresaSwitcher";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Logo genérico Arandu&JAR (fallback)
const LogoAranduJAR = () => (
  <div className="flex items-center gap-2">
    <div className="w-10 h-10 bg-gradient-to-br from-arandu-blue to-arandu-red rounded-lg flex items-center justify-center">
      <Server className="w-5 h-5 text-white" />
    </div>
    <div className="flex flex-col leading-none">
      <span className="font-heading font-bold text-lg">
        <span className="text-arandu-blue">ARANDU</span>
        <span className="text-arandu-red">&JAR</span>
      </span>
      <span className="text-slate-400 text-[10px] tracking-wider">INFORMATICA</span>
    </div>
  </div>
);

// Logo dinámico según empresa activa
const LogoDisplay = ({ activeEmpresaPropia }) => {
  // Si tiene logo_url: mostrar la imagen
  if (activeEmpresaPropia?.logo_url) {
    return (
      <img
        src={activeEmpresaPropia.logo_url}
        alt={activeEmpresaPropia.nombre}
        className="h-10 max-w-[160px] object-contain"
      />
    );
  }
  // Sin logo_url: logo de texto según slug
  const slug = activeEmpresaPropia?.slug;
  if (slug === "jar") {
    return (
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-800 rounded-lg flex items-center justify-center">
          <Server className="w-5 h-5 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-heading font-bold text-lg text-red-400">JAR</span>
          <span className="text-slate-400 text-[10px] tracking-wider">INFORMATICA</span>
        </div>
      </div>
    );
  }
  if (slug === "arandu") {
    return (
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
          <Server className="w-5 h-5 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-heading font-bold text-lg text-blue-500">ARANDU</span>
          <span className="text-slate-400 text-[10px] tracking-wider">INFORMATICA</span>
        </div>
      </div>
    );
  }
  // arandujar o sin empresa seleccionada
  return <LogoAranduJAR />;
};


const AdminDashboard = () => {
  const { user, token, logout, hasPermission, empresasPropias, activeEmpresaPropia } = useContext(AuthContext);
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ total_messages: 0, unread_messages: 0, read_messages: 0, total_empresas: 0, total_presupuestos: 0, presupuestos_borrador: 0, presupuestos_aprobados: 0, presupuestos_facturados: 0, presupuestos_cobrados: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeEmpresaPropia]); // eslint-disable-line

  const fetchData = async () => {
    try {
      const q = activeEmpresaPropia?.slug ? `?logo_tipo=${activeEmpresaPropia.slug}` : "";
      const [messagesRes, statsRes] = await Promise.all([
        fetch(`${API}/admin/messages`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/stats${q}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (messagesRes.ok) {
        const messagesData = await messagesRes.json();
        setMessages(messagesData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success("Sesión cerrada");
    navigate("/");
  };

  const markAsRead = async (messageId) => {
    try {
      const response = await fetch(`${API}/admin/messages/${messageId}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setMessages(messages.map(m => 
          m.id === messageId ? { ...m, read: true } : m
        ));
        setStats({ ...stats, unread_messages: stats.unread_messages - 1, read_messages: stats.read_messages + 1 });
      }
    } catch (error) {
      toast.error("Error al marcar como leído");
    }
  };

  const deleteMessage = async (messageId) => {
    if (!window.confirm("¿Está seguro de eliminar este mensaje?")) return;

    try {
      const response = await fetch(`${API}/admin/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const deletedMsg = messages.find(m => m.id === messageId);
        setMessages(messages.filter(m => m.id !== messageId));
        setStats({
          ...stats,
          total_messages: stats.total_messages - 1,
          unread_messages: deletedMsg?.read ? stats.unread_messages : stats.unread_messages - 1,
          read_messages: deletedMsg?.read ? stats.read_messages - 1 : stats.read_messages
        });
        setSelectedMessage(null);
        toast.success("Mensaje eliminado");
      }
    } catch (error) {
      toast.error("Error al eliminar mensaje");
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-PY", { 
      day: "numeric", 
      month: "short", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const openMessage = (message) => {
    setSelectedMessage(message);
    if (!message.read) {
      markAsRead(message.id);
    }
  };

  return (
    <div className="min-h-screen bg-arandu-dark flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-arandu-dark-light border-r border-white/5 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-white/5">
            <Link to="/" className="flex items-center gap-3">
              <LogoDisplay activeEmpresaPropia={activeEmpresaPropia} />
            </Link>
          </div>
          {/* Empresa switcher */}
          <div className="pt-3 border-b border-white/5">
            <EmpresaSwitcher />
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <div className="px-4 py-3 bg-arandu-blue/10 border border-arandu-blue/20 rounded-lg flex items-center gap-3 text-arandu-blue">
              <BarChart3 className="w-5 h-5" />
              <span className="font-body font-medium">Dashboard</span>
            </div>
            {user?.role === "admin" && (
              <button className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all">
                <Inbox className="w-5 h-5" />
                <span className="font-body">Mensajes</span>
                {stats.unread_messages > 0 && (
                  <span className="ml-auto bg-arandu-red text-white text-xs px-2 py-1 rounded-full">
                    {stats.unread_messages}
                  </span>
                )}
              </button>
            )}
            {hasPermission("empresas.ver") && (
              <Link 
                to="/admin/empresas"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Building2 className="w-5 h-5" />
                <span className="font-body">Clientes</span>
                {stats.total_empresas > 0 && (
                  <span className="ml-auto text-slate-600 text-xs">{stats.total_empresas}</span>
                )}
              </Link>
            )}
            {hasPermission("presupuestos.ver") && (
              <Link
                to="/admin/ventas"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <BarChart3 className="w-5 h-5" />
                <span className="font-body">Ventas</span>
                {stats.total_presupuestos > 0 && (
                  <span className="ml-auto text-slate-600 text-xs">{stats.total_presupuestos}</span>
                )}
              </Link>
            )}
            {hasPermission("proveedores.ver") && (
              <Link
                to="/admin/proveedores"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Truck className="w-5 h-5" />
                <span className="font-body">Proveedores</span>
              </Link>
            )}
            {hasPermission("compras.ver") && (
              <Link
                to="/admin/egresos"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="font-body">Egresos</span>
              </Link>
            )}
            {hasPermission("estadisticas.ver") && (
              <Link
                to="/admin/balance"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Scale className="w-5 h-5" />
                <span className="font-body">Balance</span>
              </Link>
            )}
            {hasPermission("balance.ver") && (
              <Link
                to="/admin/bancos"
                data-testid="menu-bancos"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Building2 className="w-5 h-5" />
                <span className="font-body">Bancos</span>
              </Link>
            )}
            {hasPermission("estadisticas.ver") && (
              <Link
                to="/admin/estadisticas"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <BarChart3 className="w-5 h-5" />
                <span className="font-body">Estadisticas</span>
              </Link>
            )}
            {hasPermission("inventario.ver") && (
              <Link
                to="/admin/inventario"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-inventario"
              >
                <Server className="w-5 h-5" />
                <span className="font-body">Inventario Técnico</span>
              </Link>
            )}
            {hasPermission("inventario_productos.ver") && (
              <Link
                to="/admin/productos"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-productos"
              >
                <Package className="w-5 h-5 text-cyan-500" />
                <span className="font-body">Catálogo Productos</span>
              </Link>
            )}
            {hasPermission("reportes.ver") && (
              <Link 
                to="/admin/reportes"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-reportes"
              >
                <FileText className="w-5 h-5" />
                <span className="font-body">Reportes</span>
              </Link>
            )}
            {user?.role === "admin" && (
              <Link 
                to="/admin/usuarios"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-usuarios"
              >
                <Users className="w-5 h-5" />
                <span className="font-body">Usuarios</span>
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                to="/admin/auditoria"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-auditoria"
              >
                <Shield className="w-5 h-5" />
                <span className="font-body">Auditoria</span>
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                to="/admin/empresas-propias"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-empresas-propias"
              >
                <Building2 className="w-5 h-5 text-violet-400" />
                <span className="font-body">Mis Empresas</span>
              </Link>
            )}
          </nav>

          <div className="p-4 border-t border-white/5">
            <div className="flex items-center gap-3 mb-3 px-2">
              <Link to="/admin/perfil" className="shrink-0">
                <div className="w-10 h-10 rounded-full bg-arandu-blue/20 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-arandu-blue/40 transition-all cursor-pointer">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-arandu-blue" />
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-white font-body text-sm truncate">{user?.name}</p>
                <p className="text-slate-500 text-xs truncate">{user?.email}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded mt-0.5 inline-block ${
                  user?.role === "admin" ? "bg-arandu-red/20 text-arandu-red" : "bg-arandu-blue/20 text-arandu-blue"
                }`}>
                  {user?.role === "admin" ? "Admin" : "Usuario"}
                </span>
              </div>
            </div>
            <Link
              to="/admin/perfil"
              className="w-full px-4 py-2 text-slate-400 hover:text-arandu-blue hover:bg-arandu-blue/10 rounded-lg flex items-center gap-2 transition-all mb-1"
              data-testid="nav-perfil"
            >
              <User className="w-4 h-4" />
              <span className="font-body text-sm">Mi Perfil</span>
            </Link>
            <button 
              onClick={handleLogout}
              className="w-full px-4 py-2 text-slate-400 hover:text-arandu-red hover:bg-arandu-red/10 rounded-lg flex items-center gap-2 transition-all"
              data-testid="logout-btn"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-body text-sm">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-arandu-dark/80 backdrop-blur-lg border-b border-white/5">
          <div className="px-4 md:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden text-white"
              >
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <div>
                <h1 className="font-heading text-xl md:text-2xl font-bold text-white">
                  Panel de Administración
                </h1>
                <p className="text-slate-500 text-sm font-body">
                  Bienvenido, {user?.name?.split(" ")[0]}
                </p>
              </div>
            </div>
            <Link 
              to="/"
              className="flex items-center gap-2 text-slate-400 hover:text-arandu-blue transition-colors"
            >
              <Home className="w-5 h-5" />
              <span className="hidden md:inline font-body">Ver Sitio</span>
            </Link>
          </div>
        </header>

        <div className="p-4 md:p-8">
          {/* Empresa activa banner */}
          {activeEmpresaPropia && (
            <div
              className="flex items-center gap-2 mb-5 px-4 py-2 rounded-xl border text-sm font-body"
              style={{
                backgroundColor: `${activeEmpresaPropia.color || "#3b82f6"}15`,
                borderColor: `${activeEmpresaPropia.color || "#3b82f6"}30`,
              }}
            >
              {activeEmpresaPropia.logo_url ? (
                <img src={activeEmpresaPropia.logo_url} alt={activeEmpresaPropia.nombre} className="h-6 object-contain" />
              ) : (
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: activeEmpresaPropia.color || "#3b82f6" }} />
              )}
              <span className="text-white font-medium">{activeEmpresaPropia.nombre}</span>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" data-testid="stats-grid">
            {user?.role === "admin" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-arandu-dark-light border border-white/5 rounded-xl p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-body mb-1">Total Mensajes</p>
                  <p className="text-3xl font-heading font-bold text-white">{stats.total_messages}</p>
                </div>
                <div className="w-12 h-12 bg-arandu-blue/20 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-arandu-blue" />
                </div>
              </div>
            </motion.div>
            )}

            {user?.role === "admin" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-arandu-dark-light border border-white/5 rounded-xl p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-body mb-1">Sin Leer</p>
                  <p className="text-3xl font-heading font-bold text-arandu-red">{stats.unread_messages}</p>
                </div>
                <div className="w-12 h-12 bg-arandu-red/20 rounded-xl flex items-center justify-center">
                  <Mail className="w-6 h-6 text-arandu-red" />
                </div>
              </div>
            </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-arandu-dark-light border border-white/5 rounded-xl p-6"
            >
              <Link to="/admin/empresas" className="block">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-body mb-1">Clientes</p>
                    <p className="text-3xl font-heading font-bold text-purple-400">{stats.total_empresas}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-purple-400" />
                  </div>
                </div>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-arandu-dark-light border border-white/5 rounded-xl p-6"
            >
              <Link to={`/admin/presupuestos${activeEmpresaPropia ? `?logo_tipo=${activeEmpresaPropia.slug}` : ""}`} className="block">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-body mb-1">
                      Presupuestos{activeEmpresaPropia ? ` · ${activeEmpresaPropia.nombre}` : ""}
                    </p>
                    <p className="text-3xl font-heading font-bold text-green-400">{stats.total_presupuestos}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-green-400" />
                  </div>
                </div>
              </Link>
            </motion.div>
          </div>

          {/* Presupuestos por Estado Cards */}
          {hasPermission("presupuestos.ver") && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { estado: "borrador",  label: "En Borrador",  sub: "Pendiente aprobación", color: "yellow",  icon: <AlertCircle className="w-6 h-6 text-yellow-400" />,  count: stats.presupuestos_borrador },
                { estado: "aprobado",  label: "Aprobados",    sub: "Por facturar",          color: "blue",    icon: <CheckCircle className="w-6 h-6 text-blue-400" />,    count: stats.presupuestos_aprobados },
                { estado: "facturado", label: "Facturados",   sub: "Por cobrar",            color: "orange",  icon: <FileText className="w-6 h-6 text-orange-400" />,     count: stats.presupuestos_facturados },
                { estado: "cobrado",   label: "Cobrados",     sub: "Completados",           color: "emerald", icon: <DollarSign className="w-6 h-6 text-emerald-400" />,  count: stats.presupuestos_cobrados || 0 },
              ].map((item, i) => {
                const logoQ = activeEmpresaPropia ? `&logo_tipo=${activeEmpresaPropia.slug}` : "";
                return (
                  <motion.div
                    key={item.estado}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    className={`bg-arandu-dark-light border border-${item.color}-500/20 rounded-xl p-5 cursor-pointer hover:border-${item.color}-500/50 hover:bg-${item.color}-500/5 transition-all`}
                    onClick={() => navigate(`/admin/presupuestos?estado=${item.estado}${logoQ}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-10 h-10 bg-${item.color}-500/20 rounded-lg flex items-center justify-center`}>
                        {item.icon}
                      </div>
                      <p className={`text-3xl font-heading font-bold text-${item.color}-400`}>{item.count}</p>
                    </div>
                    <p className="text-slate-300 text-sm font-body">{item.label}</p>
                    <p className="text-slate-500 text-xs font-body mt-0.5">{item.sub}</p>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Accesos Rápidos */}
          <div className="mb-2">
            <h2 className="font-heading text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-arandu-blue" />
              Accesos Rápidos
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: "Ventas",            icon: BarChart3,     color: "emerald", path: "/admin/ventas",            perm: "presupuestos.ver" },
                { label: "Nuevo Contrato",    icon: ClipboardList,  color: "violet",  path: "/admin/contratos",         perm: "contratos.crear" },
                { label: "Egresos / Compras",  icon: ShoppingBag,    color: "red",     path: "/admin/egresos",           perm: "compras.ver" },
                { label: "Nuevo Dispositivo", icon: Server,         color: "cyan",    path: "/admin/inventario",        perm: "inventario.crear" },
                { label: "Nuevo Empleado",    icon: UserCheck,      color: "purple",  path: "/admin/empleados",         perm: "empleados.crear" },
                { label: "Balance",           icon: Scale,          color: "teal",    path: "/admin/balance",           perm: "estadisticas.ver" },
              ].filter(item => hasPermission(item.perm)).map((item, i) => {
                const Icon = item.icon;
                const colorMap = {
                  emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40",
                  blue:    "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/40",
                  violet:  "bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/40",
                  red:     "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40",
                  orange:  "bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/40",
                  cyan:    "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/40",
                  purple:  "bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40",
                  teal:    "bg-teal-500/10 border-teal-500/20 text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/40",
                };
                return (
                  <motion.div
                    key={item.path}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                  >
                    <button
                      onClick={() => navigate(item.path)}
                      className={`w-full border rounded-xl p-4 flex flex-col items-center gap-2 transition-all cursor-pointer ${colorMap[item.color]}`}
                    >
                      <Icon className="w-7 h-7" />
                      <span className="font-body text-sm font-medium text-center leading-tight">{item.label}</span>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
