import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Shield, User, Building2, FileText, Users,
  Filter, Clock, Search, Server, ShoppingCart, Receipt,
  ClipboardList, DollarSign, Package, Banknote, BarChart3
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const moduloConfig = {
  presupuestos:      { icon: <FileText className="w-4 h-4" />,     color: "text-blue-400",    bg: "bg-blue-500/10" },
  facturas:          { icon: <Receipt className="w-4 h-4" />,      color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  contratos:         { icon: <ClipboardList className="w-4 h-4" />,color: "text-indigo-400",  bg: "bg-indigo-500/10" },
  empresas:          { icon: <Building2 className="w-4 h-4" />,    color: "text-emerald-400", bg: "bg-emerald-500/10" },
  usuarios:          { icon: <Users className="w-4 h-4" />,        color: "text-purple-400",  bg: "bg-purple-500/10" },
  inventario:        { icon: <Server className="w-4 h-4" />,       color: "text-teal-400",    bg: "bg-teal-500/10" },
  compras:           { icon: <ShoppingCart className="w-4 h-4" />, color: "text-orange-400",  bg: "bg-orange-500/10" },
  proveedores:       { icon: <Package className="w-4 h-4" />,      color: "text-amber-400",   bg: "bg-amber-500/10" },
  balance:           { icon: <BarChart3 className="w-4 h-4" />,    color: "text-violet-400",  bg: "bg-violet-500/10" },
  costos_fijos:      { icon: <DollarSign className="w-4 h-4" />,   color: "text-red-400",     bg: "bg-red-500/10" },
  empleados:         { icon: <Users className="w-4 h-4" />,        color: "text-pink-400",    bg: "bg-pink-500/10" },
  ingresos_varios:   { icon: <Banknote className="w-4 h-4" />,     color: "text-lime-400",    bg: "bg-lime-500/10" },
  pagos_proveedores: { icon: <Banknote className="w-4 h-4" />,     color: "text-yellow-400",  bg: "bg-yellow-500/10" },
};

const accionConfig = {
  crear:    { color: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", label: "Crear" },
  editar:   { color: "bg-amber-500/20 text-amber-400 border border-amber-500/30",     label: "Editar" },
  eliminar: { color: "bg-red-500/20 text-red-400 border border-red-500/30",           label: "Eliminar" },
  ver:      { color: "bg-slate-500/20 text-slate-400 border border-slate-500/30",     label: "Ver" },
  login:    { color: "bg-blue-500/20 text-blue-400 border border-blue-500/30",        label: "Login" },
  logout:   { color: "bg-slate-500/20 text-slate-300 border border-slate-500/30",     label: "Logout" },
  exportar: { color: "bg-violet-500/20 text-violet-400 border border-violet-500/30",  label: "Exportar" },
  pagar:    { color: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",        label: "Pagar" },
};

const AuditoriaPage = () => {
  const { token } = useContext(AuthContext);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterModulo, setFilterModulo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchLogs();
  }, [filterModulo]);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (filterModulo) params.set("modulo", filterModulo);
      params.set("limit", "200");
      const res = await fetch(`${API}/admin/auditoria?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
  };

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (log.usuario_nombre || "").toLowerCase().includes(term) ||
      (log.accion || "").toLowerCase().includes(term) ||
      (log.detalle || "").toLowerCase().includes(term) ||
      (log.modulo || "").toLowerCase().includes(term)
    );
  });

  const getModuleStyle = (modulo) => moduloConfig[modulo] || { icon: <Shield className="w-4 h-4" />, color: "text-slate-400", bg: "bg-slate-500/10" };
  const getAccionStyle = (accion) => {
    const k = Object.keys(accionConfig).find(k => accion?.toLowerCase().includes(k));
    return accionConfig[k] || { color: "bg-slate-700/50 text-slate-400 border border-white/10", label: accion };
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <Link to="/admin" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2">
            <ArrowLeft className="w-4 h-4" />
            Volver al Dashboard
          </Link>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-white flex items-center gap-3" data-testid="auditoria-title">
            <Shield className="w-8 h-8 text-amber-400" />
            Auditoria
          </h1>
          <p className="text-slate-400 text-sm mt-1">Registro de todas las acciones administrativas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            type="text"
            placeholder="Buscar por usuario, accion..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-arandu-dark border-white/10 text-white pl-10"
            data-testid="audit-search"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "", label: "Todos", icon: <Filter className="w-3 h-3" /> },
            { value: "presupuestos", label: "Presupuestos", icon: <FileText className="w-3 h-3" /> },
            { value: "facturas", label: "Facturas", icon: <Receipt className="w-3 h-3" /> },
            { value: "contratos", label: "Contratos", icon: <ClipboardList className="w-3 h-3" /> },
            { value: "compras", label: "Compras", icon: <ShoppingCart className="w-3 h-3" /> },
            { value: "empresas", label: "Empresas", icon: <Building2 className="w-3 h-3" /> },
            { value: "proveedores", label: "Proveedores", icon: <Package className="w-3 h-3" /> },
            { value: "inventario", label: "Inventario", icon: <Server className="w-3 h-3" /> },
            { value: "balance", label: "Balance", icon: <BarChart3 className="w-3 h-3" /> },
            { value: "costos_fijos", label: "Costos Fijos", icon: <DollarSign className="w-3 h-3" /> },
            { value: "empleados", label: "Empleados", icon: <Users className="w-3 h-3" /> },
            { value: "usuarios", label: "Usuarios", icon: <Users className="w-3 h-3" /> },
            { value: "auth", label: "Sesiones", icon: <Shield className="w-3 h-3" /> },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setFilterModulo(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filterModulo === f.value
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                  : "bg-arandu-dark-lighter text-slate-400 border border-white/5 hover:border-white/20"
              }`}
              data-testid={`audit-filter-${f.value || "all"}`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-arandu-blue animate-pulse">Cargando...</div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 bg-arandu-dark-light border border-white/5 rounded-xl">
          <Shield className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400">No hay registros de auditoria</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="audit-logs-list">
          {filteredLogs.map((log, idx) => {
            const style = getModuleStyle(log.modulo);
            return (
              <motion.div
                key={log.id || idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="bg-arandu-dark-light border border-white/5 rounded-lg p-4 hover:border-white/10 transition-all"
                data-testid={`audit-log-${idx}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className={style.color}>{style.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm">{log.usuario_nombre}</span>
                      <span className={`${style.color} text-xs font-medium ${style.bg} px-2 py-0.5 rounded-full flex items-center gap-1`}>
                        {style.icon}
                        {log.modulo}
                      </span>
                      {(() => {
                        const as = getAccionStyle(log.accion);
                        return (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${as.color}`}>
                            {log.accion}
                          </span>
                        );
                      })()}
                    </div>
                    {log.detalle && (
                      <p className="text-slate-400 text-sm truncate">{log.detalle}</p>
                    )}
                  </div>
                  <div className="text-slate-500 text-xs whitespace-nowrap flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {formatDate(log.fecha)}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuditoriaPage;
