import React, { useState, useEffect, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Home, Mail, MailOpen, Trash2, LogOut, Menu, X,
  MessageSquare, CheckCircle, Clock, User, Phone,
  ChevronRight, BarChart3, Inbox, Building2, FileText, Users, Shield, Eye, Server,
  ClipboardList, DollarSign, AlertCircle, Truck, TrendingDown, UserCheck, Receipt, Scale, TrendingUp, ShoppingBag, Package,
  ChevronLeft, Bell
} from "lucide-react";
import { Button } from "../components/ui/button";
import { AuthContext } from "../App";
import { toast } from "sonner";
import EmpresaSwitcher from "../components/EmpresaSwitcher";
import { LogoMarcaArandu, LogoMarcaJar, LogoMarcaAranduJar } from "../components/MarcaLogos";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const subCompact = "text-slate-400 text-[10px] tracking-wider font-body";

// Logo genérico Arandu&JAR (fallback)
const LogoAranduJAR = () => <LogoMarcaAranduJar compact sublabelClass={subCompact} />;

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
    return <LogoMarcaJar compact sublabelClass={subCompact} />;
  }
  if (slug === "arandu") {
    return <LogoMarcaArandu compact sublabelClass={subCompact} />;
  }
  // arandujar o sin empresa seleccionada
  return <LogoAranduJAR />;
};

const mesActual = () => new Date().toISOString().slice(0, 7);
const prevMes = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};
const nextMes = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
const fmtPYG = (n) => `₲ ${Math.round(Number(n || 0)).toLocaleString("es-PY")}`;
const fmtUSD = (n) => `USD ${Number(n || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMixed = (pyg, usd) => {
  const usdNum = Number(usd || 0);
  return `${fmtPYG(pyg)}${usdNum ? ` / ${fmtUSD(usdNum)}` : ""}`;
};
const mesLabel = (m) => {
  if (!m) return "";
  const d = new Date(`${m}-02T00:00:00`);
  return d.toLocaleDateString("es-PY", { month: "short", year: "numeric" });
};


const AdminDashboard = () => {
  const { user, token, logout, hasPermission, hasModule, empresasPropias, activeEmpresaPropia } = useContext(AuthContext);
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ total_messages: 0, unread_messages: 0, read_messages: 0, total_empresas: 0, total_presupuestos: 0, presupuestos_borrador: 0, presupuestos_aprobados: 0, presupuestos_facturados: 0, presupuestos_cobrados: 0 });
  const [resumen, setResumen] = useState(null);
  const [periodoTipo, setPeriodoTipo] = useState("todos");
  const [periodoMes, setPeriodoMes] = useState(mesActual());
  const [periodoAnio, setPeriodoAnio] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cumpleanosResumen, setCumpleanosResumen] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeEmpresaPropia, periodoTipo, periodoMes, periodoAnio]); // eslint-disable-line

  const fetchData = async () => {
    try {
      const q = activeEmpresaPropia?.slug ? `?logo_tipo=${activeEmpresaPropia.slug}` : "";
      const resumenParams = new URLSearchParams({ periodo_tipo: periodoTipo });
      if (periodoTipo === "mes") resumenParams.set("mes", periodoMes);
      if (periodoTipo === "anio") resumenParams.set("anio", periodoAnio);
      if (activeEmpresaPropia?.slug) resumenParams.set("logo_tipo", activeEmpresaPropia.slug);
      const fetches = [
        fetch(`${API}/admin/messages`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/stats${q}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/dashboard/resumen?${resumenParams}`, { headers: { Authorization: `Bearer ${token}` } }),
      ];
      if (hasPermission("alertas.ver")) {
        fetches.push(fetch(`${API}/admin/alertas/cumpleanos/resumen${q}`, { headers: { Authorization: `Bearer ${token}` } }));
      }
      const results = await Promise.all(fetches);
      const [messagesRes, statsRes, resumenRes, cumpleanosRes] = results;

      if (messagesRes.ok) {
        const messagesData = await messagesRes.json();
        setMessages(messagesData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (resumenRes.ok) {
        setResumen(await resumenRes.json());
      }
      if (cumpleanosRes?.ok) {
        setCumpleanosResumen(await cumpleanosRes.json());
      } else {
        setCumpleanosResumen(null);
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
            {hasModule("mensajes") && (
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
                to="/sistema/empresas"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Building2 className="w-5 h-5" />
                <span className="font-body">Clientes</span>
                {stats.total_empresas > 0 && (
                  <span className="ml-auto text-slate-600 text-xs">{stats.total_empresas}</span>
                )}
              </Link>
            )}
            {(hasPermission("presupuestos.ver") || hasPermission("facturas.ver") || hasPermission("ingresos_varios.ver") || hasPermission("recibos.ver") || hasPermission("notas_credito.ver")) && (
              <Link
                to="/sistema/ventas"
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
                to="/sistema/proveedores"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Truck className="w-5 h-5" />
                <span className="font-body">Proveedores</span>
              </Link>
            )}
            {(hasPermission("compras.ver") || hasPermission("costos_fijos.ver") || hasPermission("empleados.ver") || hasPermission("pagos_proveedores.ver") || hasPermission("balance.ver")) && (
              <Link
                to="/sistema/egresos"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="font-body">Egresos</span>
              </Link>
            )}
            {hasPermission("balance.ver") && (
              <Link
                to="/sistema/balance"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Scale className="w-5 h-5" />
                <span className="font-body">Balance</span>
              </Link>
            )}
            {hasPermission("bancos.ver") && (
              <Link
                to="/sistema/bancos"
                data-testid="menu-bancos"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
              >
                <Building2 className="w-5 h-5" />
                <span className="font-body">Bancos</span>
              </Link>
            )}
            {hasPermission("inventario.ver") && (
              <Link
                to="/sistema/inventario"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-inventario"
              >
                <Server className="w-5 h-5" />
                <span className="font-body">Inventario Técnico</span>
              </Link>
            )}
            {hasPermission("inventario_productos.ver") && (
              <Link
                to="/sistema/productos"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-productos"
              >
                <Package className="w-5 h-5 text-cyan-500" />
                <span className="font-body">Catálogo Productos</span>
              </Link>
            )}
            {hasPermission("historial_stock.ver") && (
              <Link
                to="/sistema/historial-stock"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-historial-stock"
              >
                <BarChart3 className="w-5 h-5 text-cyan-500" />
                <span className="font-body">Historial Stock</span>
              </Link>
            )}
            {hasPermission("reportes.ver") && (
              <Link 
                to="/sistema/reportes"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-reportes"
              >
                <FileText className="w-5 h-5" />
                <span className="font-body">Reportes</span>
              </Link>
            )}
            {hasPermission("auditoria.ver") && (
              <Link 
                to="/sistema/usuarios"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-usuarios"
              >
                <Users className="w-5 h-5" />
                <span className="font-body">Usuarios</span>
              </Link>
            )}
            {(user?.role === "admin" || user?.role === "gerente") && (
              <Link
                to="/sistema/auditoria"
                className="w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-3 transition-all"
                data-testid="nav-auditoria"
              >
                <Shield className="w-5 h-5" />
                <span className="font-body">Auditoria</span>
              </Link>
            )}
            {(user?.role === "admin" || user?.role === "gerente") && (
              <Link
                to="/sistema/empresas-propias"
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
              <Link to="/sistema/perfil" className="shrink-0">
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
                  user?.role === "admin" ? "bg-arandu-red/20 text-arandu-red" :
                  user?.role === "gerente" ? "bg-violet-500/20 text-violet-400" :
                  "bg-arandu-blue/20 text-arandu-blue"
                }`}>
                  {user?.role === "admin" ? "Admin" : user?.role === "gerente" ? "Administrador" : "Usuario"}
                </span>
              </div>
            </div>
            <Link
              to="/sistema/perfil"
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

          {/* Periodo estadísticas */}
          <div className="flex items-center gap-2 flex-wrap mb-5 bg-arandu-dark-light border border-white/10 rounded-xl px-4 py-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-sm mr-1">Periodo:</span>
            {[
              ["todos", "Todo el tiempo"],
              ["mes", "Por mes"],
              ["anio", "Por año"],
            ].map(([v, label]) => (
              <button key={v} onClick={() => setPeriodoTipo(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${periodoTipo === v ? "bg-arandu-blue border-arandu-blue text-white" : "border-white/10 text-slate-400 hover:text-white bg-white/5"}`}>
                {label}
              </button>
            ))}
            {periodoTipo === "mes" && (
              <div className="flex items-center gap-1 bg-arandu-dark border border-white/10 rounded-lg px-1 py-0.5">
                <button onClick={() => setPeriodoMes(prevMes(periodoMes))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-white text-sm font-medium min-w-[110px] text-center px-2 capitalize">{mesLabel(periodoMes)}</span>
                <button onClick={() => setPeriodoMes(nextMes(periodoMes))} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-all">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            {periodoTipo === "anio" && (
              <input type="number" value={periodoAnio} onChange={e => setPeriodoAnio(e.target.value)}
                className="bg-arandu-dark border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm w-24" />
            )}
            <span className="ml-auto text-slate-500 text-xs">
              {periodoTipo === "todos" ? "Resumen completo" : periodoTipo === "mes" ? mesLabel(periodoMes) : periodoAnio}
            </span>
          </div>

          {/* Estadísticas operativas */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8" data-testid="stats-grid">
            {[
              { perm: hasPermission("alertas.ver") && cumpleanosResumen, title: "Cumpleaños", icon: Bell, color: "text-pink-400", value: cumpleanosResumen?.hoy ?? 0, lines: [`Hoy (rojo): ${cumpleanosResumen?.hoy ?? 0}`, `Próximos (amarillo): ${cumpleanosResumen?.proximos ?? 0}`, `En ventana: ${cumpleanosResumen?.total ?? 0}`], link: "/sistema/reportes?tab=alertas" },
              { perm: hasModule("mensajes"), title: "Mensajes", icon: MessageSquare, color: "text-blue-400", value: resumen?.mensajes?.total || 0, lines: [`Sin leer: ${resumen?.mensajes?.sin_leer || 0}`] },
              { perm: hasPermission("empresas.ver"), title: "Clientes", icon: Building2, color: "text-purple-400", value: resumen?.clientes?.total || 0, lines: ["clientes registrados"] },
              { perm: hasPermission("presupuestos.ver"), title: "Presupuestos", icon: FileText, color: "text-green-400", value: resumen?.presupuestos?.total || 0, lines: [`Aprobados: ${resumen?.presupuestos?.aprobados || 0}`, `Rechazados: ${resumen?.presupuestos?.rechazados || 0}`, `Cobrados: ${resumen?.presupuestos?.cobrados || 0}`, `Faltantes: ${resumen?.presupuestos?.faltantes || 0}`] },
              { perm: hasPermission("facturas.ver"), title: "Facturación", icon: Receipt, color: "text-cyan-400", value: fmtMixed(resumen?.facturacion?.total, resumen?.facturacion?.total_usd), lines: [`Facturas: ${resumen?.facturacion?.cantidad || 0}`, `Cobrado: ${fmtMixed(resumen?.facturacion?.cobrado, resumen?.facturacion?.cobrado_usd)}`, `Pendiente: ${fmtMixed(resumen?.facturacion?.pendiente, resumen?.facturacion?.pendiente_usd)}`] },
              { perm: hasPermission("ingresos_varios.ver"), title: "Ingresos", icon: TrendingUp, color: "text-emerald-400", value: fmtMixed(resumen?.ingresos?.total, resumen?.ingresos?.total_usd), lines: [`Registros: ${resumen?.ingresos?.cantidad || 0}`] },
              { perm: hasPermission("compras.ver"), title: "Compras", icon: ShoppingBag, color: "text-orange-400", value: fmtMixed(resumen?.compras?.total, resumen?.compras?.total_usd), lines: [`Contado: ${resumen?.compras?.contado || 0}`, `Crédito: ${resumen?.compras?.credito || 0}`, `Pendiente: ${fmtMixed(resumen?.compras?.pendiente, resumen?.compras?.pendiente_usd)}`] },
              { perm: hasPermission("proveedores.ver"), title: "Proveedores", icon: Truck, color: "text-amber-400", value: fmtMixed(resumen?.proveedores?.pagado, resumen?.proveedores?.pagado_usd), lines: [`Pagos: ${resumen?.proveedores?.pagos || 0}`, `Debe: ${fmtMixed(resumen?.proveedores?.pendiente, resumen?.proveedores?.pendiente_usd)}`] },
              { perm: hasPermission("empleados.ver"), title: "Sueldos", icon: Users, color: "text-pink-400", value: fmtMixed(resumen?.sueldos?.total, resumen?.sueldos?.total_usd), lines: [`Extras: ${fmtMixed(resumen?.sueldos?.extras, resumen?.sueldos?.extras_usd)}`, `Adelantos: ${fmtMixed(resumen?.sueldos?.adelantos, resumen?.sueldos?.adelantos_usd)}`, `Descuentos: ${fmtPYG(resumen?.sueldos?.descuentos)}`] },
              { perm: hasPermission("notas_credito.ver"), title: "Notas crédito", icon: AlertCircle, color: "text-rose-400", value: fmtMixed(resumen?.notas_credito?.total, resumen?.notas_credito?.total_usd), lines: [`Ventas: ${resumen?.notas_credito?.ventas || 0}`, `Compras: ${resumen?.notas_credito?.compras || 0}`] },
              { perm: hasPermission("recibos.ver"), title: "Recibos", icon: DollarSign, color: "text-lime-400", value: fmtMixed(resumen?.recibos?.total, resumen?.recibos?.total_usd), lines: [`Recibos: ${resumen?.recibos?.cantidad || 0}`] },
              { perm: hasPermission("costos_fijos.ver"), title: "Gastos", icon: DollarSign, color: "text-red-400", value: fmtMixed(resumen?.gastos?.pagado, resumen?.gastos?.pagado_usd), lines: [`Pagos registrados: ${resumen?.gastos?.cantidad || 0}`] },
              { perm: hasPermission("balance.ver"), title: "IVA", icon: Scale, color: "text-violet-400", value: fmtMixed(resumen?.iva?.saldo, resumen?.iva?.saldo_usd), lines: [`A pagar: ${fmtMixed(resumen?.iva?.a_pagar, resumen?.iva?.a_pagar_usd)}`, `Pagado: ${fmtPYG(resumen?.iva?.pagado)}`] },
            ].filter(card => card.perm).map((card, i) => {
              const Icon = card.icon;
              const inner = (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-slate-400 text-sm font-body">{card.title}</p>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <p className={`font-heading font-bold text-xl leading-snug break-words ${card.color}`}>{card.value}</p>
                  <div className="mt-2 space-y-0.5">
                    {card.lines.map(line => <p key={line} className="text-slate-500 text-xs">{line}</p>)}
                  </div>
                </>
              );
              return (
                <motion.div key={card.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="bg-arandu-dark-light border border-white/5 rounded-xl p-4 min-h-[150px]">
                  {card.link ? (
                    <Link to={card.link} className="block hover:opacity-90 transition-opacity">{inner}</Link>
                  ) : inner}
                </motion.div>
              );
            })}
          </div>

          {/* Accesos Directos */}
          <div className="space-y-5">
            <h2 className="font-heading text-lg font-semibold text-white flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-arandu-blue" />
              Accesos Directos
            </h2>
            {[
              { title: "Ingresos", items: [
                { label: "Nuevo presupuesto", icon: FileText, path: "/sistema/ventas?nuevo=presupuesto", perm: "presupuestos.crear", color: "emerald" },
                { label: "Nueva factura", icon: Receipt, path: "/sistema/ventas?nuevo=factura", perm: "facturas.crear", color: "cyan" },
                { label: "Nueva nota crédito", icon: AlertCircle, path: "/sistema/ventas?nuevo=nota_credito", perm: "notas_credito.crear", color: "rose" },
                { label: "Nuevo ingreso", icon: TrendingUp, path: "/sistema/ventas?nuevo=ingreso", perm: "ingresos_varios.crear", color: "green" },
              ]},
              { title: "Egresos", items: [
                { label: "Nuevo gasto", icon: DollarSign, path: "/sistema/egresos?nuevo=gasto", perm: "costos_fijos.crear", color: "red" },
                { label: "Nueva compra", icon: ShoppingBag, path: "/sistema/egresos?nuevo=compra", perm: "compras.crear", color: "orange" },
                { label: "Nuevo pago proveedor", icon: Truck, path: "/sistema/egresos?nuevo=pago_proveedor", perm: "pagos_proveedores.crear", color: "amber" },
                { label: "Nuevo pago IVA", icon: Scale, path: "/sistema/egresos?nuevo=pago_iva", perm: "balance.editar", color: "violet" },
              ]},
              { title: "Administrativo", items: [
                { label: "Nuevo cliente", icon: Building2, path: "/sistema/empresas?nuevo=cliente", perm: "empresas.crear", color: "purple" },
                { label: "Nuevo proveedor", icon: Package, path: "/sistema/proveedores?nuevo=proveedor", perm: "proveedores.crear", color: "yellow" },
                { label: "Nuevo empleado", icon: UserCheck, path: "/sistema/egresos?nuevo=empleado", perm: "empleados.crear", color: "pink" },
                { label: "Nuevo dispositivo", icon: Server, path: "/sistema/inventario?nuevo=dispositivo", perm: "inventario.crear", color: "blue" },
                { label: "Nuevo producto", icon: Package, path: "/sistema/productos?nuevo=producto", perm: "inventario_productos.crear", color: "teal" },
                { label: "Nueva alerta", icon: Bell, path: "/sistema/reportes?nuevo=alerta", perm: "alertas.crear", color: "red" },
              ]},
            ].map(section => {
              const items = section.items.filter(item => hasPermission(item.perm));
              if (items.length === 0) return null;
              return (
                <div key={section.title} className="bg-arandu-dark-light border border-white/5 rounded-xl p-4">
                  <p className="text-slate-300 text-sm font-semibold mb-3">{section.title}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {items.map(item => {
                      const Icon = item.icon;
                      const colorMap = {
                        emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/45",
                        cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/45",
                        rose: "border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/45",
                        green: "border-green-500/25 bg-green-500/10 text-green-300 hover:bg-green-500/20 hover:border-green-500/45",
                        red: "border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/45",
                        orange: "border-orange-500/25 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 hover:border-orange-500/45",
                        amber: "border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/45",
                        violet: "border-violet-500/25 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/45",
                        purple: "border-purple-500/25 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/45",
                        yellow: "border-yellow-500/25 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 hover:border-yellow-500/45",
                        pink: "border-pink-500/25 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 hover:border-pink-500/45",
                        blue: "border-blue-500/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/45",
                        teal: "border-teal-500/25 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 hover:border-teal-500/45"
                      };
                      const colorClass = colorMap[item.color] || "border-white/10 bg-white/5 text-slate-300 hover:bg-arandu-blue/10 hover:border-arandu-blue/40";
                      return (
                        <button key={item.path} onClick={() => navigate(item.path)}
                          className={`border rounded-xl p-3 flex flex-col items-center gap-2 hover:text-white transition-all min-h-[92px] ${colorClass}`}>
                          <Icon className="w-6 h-6" />
                          <span className="font-body text-xs font-medium text-center leading-tight">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
