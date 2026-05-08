import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Shield, Building2, FileText, Users,
  Clock, Search, Server, ShoppingCart, Receipt, X, Eye,
  ClipboardList, DollarSign, Package, Banknote, BarChart3
} from "lucide-react";
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
  notas_credito:     { icon: <Receipt className="w-4 h-4" />,      color: "text-rose-400",    bg: "bg-rose-500/10" },
  inventario_productos: { icon: <Package className="w-4 h-4" />,   color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  historial_stock:   { icon: <BarChart3 className="w-4 h-4" />,    color: "text-cyan-300",    bg: "bg-cyan-500/10" },
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
  movimiento_manual: { color: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30", label: "Movimiento" },
};

const AuditoriaPage = () => {
  const { token } = useContext(AuthContext);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chips, setChips] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
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
    const active = [...chips, searchTerm].filter(Boolean).map(t => String(t).toLowerCase());
    if (active.length === 0) return true;
    const texto = [log.usuario_nombre, log.usuario_email, log.accion, log.detalle, log.modulo, log.entidad_id, log.fecha].filter(Boolean).join(" ").toLowerCase();
    return active.every(term => texto.includes(term));
  });

  const addChip = () => {
    const v = searchTerm.trim();
    if (v && !chips.includes(v)) setChips(prev => [...prev, v]);
    setSearchTerm("");
  };

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

      {/* Buscador chip */}
      <div className="mb-6">
        <div className="relative bg-arandu-dark border border-white/10 rounded-xl px-3 py-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {chips.map(chip => (
              <span key={chip} className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/25 rounded-full px-2 py-0.5 text-xs">
                {chip}
                <button onClick={() => setChips(prev => prev.filter(c => c !== chip))}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <Search className="w-4 h-4 absolute left-3 bottom-3 text-slate-500" />
          <Input
            type="text"
            placeholder="Buscar por usuario, modulo, accion, detalle, fecha... (Enter para agregar filtro)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(); } }}
            className="bg-transparent border-0 text-white pl-7 focus-visible:ring-0"
            data-testid="audit-search"
          />
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
        <div className="bg-arandu-dark-light border border-white/5 rounded-xl overflow-hidden" data-testid="audit-logs-list">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Modulo</th>
                <th className="px-4 py-3 text-left">Accion</th>
                <th className="px-4 py-3 text-left">Detalle</th>
                <th className="px-4 py-3 text-center">Ver</th>
              </tr>
            </thead>
            <tbody>
          {filteredLogs.map((log, idx) => {
            const style = getModuleStyle(log.modulo);
            const action = getAccionStyle(log.accion);
            return (
              <motion.tr
                key={log.id || idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.02 }}
                onClick={() => setSelectedLog(log)}
                className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all"
                data-testid={`audit-log-${idx}`}
              >
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(log.fecha)}</td>
                <td className="px-4 py-3 text-white font-medium">{log.usuario_nombre || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`${style.color} ${style.bg} text-xs px-2 py-1 rounded-full inline-flex items-center gap-1`}>{style.icon}{log.modulo}</span>
                </td>
                <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${action.color}`}>{log.accion}</span></td>
                <td className="px-4 py-3 text-slate-400 max-w-[360px] truncate">{log.detalle || "—"}</td>
                <td className="px-4 py-3 text-center"><Eye className="w-4 h-4 text-slate-500 mx-auto" /></td>
              </motion.tr>
            );
          })}
            </tbody>
          </table>
        </div>
      )}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && setSelectedLog(null)}>
          <div className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-heading text-lg">Detalle de auditoria</h2>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              {Object.entries(selectedLog).map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-3 border-b border-white/5 pb-2">
                  <span className="text-slate-500">{k}</span>
                  <span className="col-span-2 text-slate-200 break-words">{typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? "—")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditoriaPage;
