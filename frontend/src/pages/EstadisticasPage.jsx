import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3, ArrowLeft, FileText, CheckCircle, Receipt,
  DollarSign, XCircle, Clock, TrendingUp, AlertTriangle,
  Building2, Wallet, Truck, Check, Cpu, Server
} from "lucide-react";
import { Button } from "../components/ui/button";
import { AuthContext } from "../App";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGOS = [
  { value: "todas",    label: "Todas",       color: "bg-slate-600",                    dot: "bg-slate-400" },
  { value: "arandujar",label: "Arandu&JAR",  color: "bg-gradient-to-r from-blue-600 to-red-600", dot: "bg-blue-400" },
  { value: "arandu",   label: "Arandu",      color: "bg-blue-600",                     dot: "bg-blue-300" },
  { value: "jar",      label: "JAR",         color: "bg-red-600",                      dot: "bg-red-300" },
];

const EstadisticasPage = () => {
  const { token } = useContext(AuthContext);
  const [stats, setStats] = useState(null);
  const [empresaStats, setEmpresaStats] = useState([]);
  const [proveedorStats, setProveedorStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("general");
  const [logoFilter, setLogoFilter] = useState("todas");

  useEffect(() => {
    fetchStats(logoFilter);
  }, [logoFilter]); // eslint-disable-line

  const fetchStats = async (filtro = "todas") => {
    setLoading(true);
    try {
      const q = filtro !== "todas" ? `?logo_tipo=${filtro}` : "";
      const [statsRes, empRes, provRes] = await Promise.all([
        fetch(`${API}/admin/presupuestos/estadisticas${q}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/estadisticas/empresas${q}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/estadisticas/proveedores`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (empRes.ok) setEmpresaStats(await empRes.json());
      if (provRes.ok) setProveedorStats(await provRes.json());
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num, moneda = "PYG") => {
    if (moneda === "USD") {
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    }
    return new Intl.NumberFormat('es-PY').format(num);
  };

  const getCount = (estado) => stats?.por_estado?.[estado]?.count || 0;
  const getMonto = (estado, moneda) => stats?.por_estado_moneda?.[estado]?.[moneda]?.total_monto || 0;
  const getMonedaCount = (estado, moneda) => stats?.por_estado_moneda?.[estado]?.[moneda]?.count || 0;

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="text-center py-12">
          <div className="text-arandu-blue animate-pulse">Cargando estadísticas...</div>
        </div>
      </div>
    );
  }

  const pendienteFacturar = getCount("aprobado");
  const pendienteCobrar = getCount("facturado");

  const presupuestosLink = (estado) => {
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (logoFilter !== "todas") params.set("logo_tipo", logoFilter);
    const qs = params.toString();
    return `/admin/presupuestos${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <Link to="/admin/presupuestos" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2">
            <ArrowLeft className="w-4 h-4" />
            Volver a Presupuestos
          </Link>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-arandu-blue" />
            Estadísticas
          </h1>
        </div>
      </div>

      {/* Empresa propia switcher */}
      <div className="flex flex-wrap gap-2 mb-5">
        {LOGOS.map(l => (
          <button
            key={l.value}
            onClick={() => setLogoFilter(l.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body font-medium transition-all border ${
              logoFilter === l.value
                ? "border-white/30 text-white shadow-lg " + l.color
                : "border-white/10 text-slate-400 hover:text-white bg-arandu-dark-light"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${logoFilter === l.value ? "bg-white" : l.dot}`} />
            {l.label}
          </button>
        ))}
        {logoFilter !== "todas" && (
          <span className="self-center text-xs text-slate-500 font-body ml-1">
            Mostrando solo presupuestos de <span className="text-white">{LOGOS.find(l => l.value === logoFilter)?.label}</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("general")}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            tab === "general" ? "bg-arandu-blue text-white" : "bg-arandu-dark-light text-slate-400 hover:text-white border border-white/5"
          }`}
          data-testid="tab-general"
        >
          <BarChart3 className="w-4 h-4" />
          General
        </button>
        <button
          onClick={() => setTab("empresas")}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            tab === "empresas" ? "bg-arandu-blue text-white" : "bg-arandu-dark-light text-slate-400 hover:text-white border border-white/5"
          }`}
          data-testid="tab-empresas"
        >
          <Building2 className="w-4 h-4" />
          Por Empresa
        </button>
        <button
          onClick={() => setTab("proveedores")}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            tab === "proveedores" ? "bg-arandu-blue text-white" : "bg-arandu-dark-light text-slate-400 hover:text-white border border-white/5"
          }`}
          data-testid="tab-proveedores"
        >
          <Truck className="w-4 h-4" />
          Proveedores
        </button>
      </div>

      {/* TAB: General */}
      {tab === "general" && (
        <>
          {/* Alert Cards */}
          {(pendienteFacturar > 0 || pendienteCobrar > 0) && (
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {pendienteFacturar > 0 && (
                <Link to={presupuestosLink("aprobado")} data-testid="alert-pending-invoice">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-5 hover:border-orange-500/50 transition-all cursor-pointer">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="w-6 h-6 text-orange-400" />
                      <h3 className="font-heading font-bold text-orange-400 text-lg">Pendiente de Facturar</h3>
                    </div>
                    <p className="text-3xl font-heading font-bold text-white mb-1">{pendienteFacturar}</p>
                    <p className="text-orange-400/70 text-sm">presupuestos aprobados sin facturar</p>
                    {["PYG", "USD"].map(m => {
                      const monto = getMonto("aprobado", m);
                      return monto > 0 && <p key={m} className="text-slate-400 text-sm mt-1">{m === "USD" ? "US$" : "₲"} {formatNumber(monto, m)}</p>;
                    })}
                  </motion.div>
                </Link>
              )}
              {pendienteCobrar > 0 && (
                <Link to={presupuestosLink("facturado")} data-testid="alert-pending-collect">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5 hover:border-yellow-500/50 transition-all cursor-pointer">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="w-6 h-6 text-yellow-400" />
                      <h3 className="font-heading font-bold text-yellow-400 text-lg">Pendiente de Cobrar</h3>
                    </div>
                    <p className="text-3xl font-heading font-bold text-white mb-1">{pendienteCobrar}</p>
                    <p className="text-yellow-400/70 text-sm">presupuestos facturados sin cobrar</p>
                    {["PYG", "USD"].map(m => {
                      const monto = getMonto("facturado", m);
                      return monto > 0 && <p key={m} className="text-slate-400 text-sm mt-1">{m === "USD" ? "US$" : "₲"} {formatNumber(monto, m)}</p>;
                    })}
                  </motion.div>
                </Link>
              )}
            </div>
          )}

          {/* Status Summary Cards */}
          <h2 className="font-heading text-lg font-semibold text-white mb-4">Resumen por Estado</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {[
              { estado: "borrador", label: "Borradores", icon: <Clock className="w-5 h-5" />, color: "slate" },
              { estado: "aprobado", label: "Aprobados", icon: <CheckCircle className="w-5 h-5" />, color: "green" },
              { estado: "facturado", label: "Facturados", icon: <Receipt className="w-5 h-5" />, color: "orange" },
              { estado: "cobrado", label: "Cobrados", icon: <DollarSign className="w-5 h-5" />, color: "emerald" },
              { estado: "rechazado", label: "Rechazados", icon: <XCircle className="w-5 h-5" />, color: "red" },
              { estado: "total", label: "Total", icon: <FileText className="w-5 h-5" />, color: "blue" },
            ].map((item, index) => (
              <Link key={item.estado} to={item.estado !== "total" ? presupuestosLink(item.estado) : presupuestosLink(null)}>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
                  className={`bg-arandu-dark-light border border-white/5 rounded-xl p-4 hover:border-${item.color}-500/30 transition-all cursor-pointer`}
                  data-testid={`stat-${item.estado}`}>
                  <div className={`text-${item.color}-400 mb-2`}>{item.icon}</div>
                  <p className="text-2xl font-heading font-bold text-white">
                    {item.estado === "total" ? (stats?.total || 0) : getCount(item.estado)}
                  </p>
                  <p className="text-slate-400 text-sm">{item.label}</p>
                </motion.div>
              </Link>
            ))}
          </div>

          {/* Breakdown by Currency */}
          <h2 className="font-heading text-lg font-semibold text-white mb-4">Montos por Estado y Moneda</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {["PYG", "USD"].map(moneda => {
              const symbol = moneda === "USD" ? "US$" : "₲";
              const estados = ["aprobado", "facturado", "cobrado"];
              const hasData = estados.some(e => getMonedaCount(e, moneda) > 0);
              if (!hasData && moneda === "USD") return null;
              return (
                <motion.div key={moneda} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-arandu-dark-light border border-white/5 rounded-xl p-6">
                  <h3 className="font-heading font-bold text-white text-lg mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-arandu-blue" />
                    {moneda === "USD" ? "Dólares (US$)" : "Guaraníes (₲)"}
                  </h3>
                  <div className="space-y-3">
                    {[
                      { estado: "aprobado", label: "Aprobados (por facturar)", color: "text-green-400", bg: "bg-green-500/10" },
                      { estado: "facturado", label: "Facturados (por cobrar)", color: "text-orange-400", bg: "bg-orange-500/10" },
                      { estado: "cobrado", label: "Cobrados", color: "text-emerald-400", bg: "bg-emerald-500/10" },
                      { estado: "rechazado", label: "Rechazados", color: "text-red-400", bg: "bg-red-500/10" },
                    ].map(item => {
                      const count = getMonedaCount(item.estado, moneda);
                      const monto = getMonto(item.estado, moneda);
                      if (count === 0) return null;
                      return (
                        <div key={item.estado} className={`${item.bg} rounded-lg p-3 flex justify-between items-center`}>
                          <div>
                            <p className={`${item.color} font-medium text-sm`}>{item.label}</p>
                            <p className="text-slate-500 text-xs">{count} presupuesto{count !== 1 ? 's' : ''}</p>
                          </div>
                          <p className="text-white font-heading font-bold">{symbol} {formatNumber(monto, moneda)}</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* TAB: Por Empresa */}
      {tab === "empresas" && (
        <div className="space-y-4">
          {empresaStats.length === 0 ? (
            <div className="text-center py-12 bg-arandu-dark-light rounded-xl border border-white/5">
              <Building2 className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400">No hay datos por empresa</p>
            </div>
          ) : (
            empresaStats.map((emp, index) => (
              <motion.div
                key={emp.empresa_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-arandu-dark-light border border-white/5 rounded-xl p-5"
                data-testid={`empresa-stat-${emp.empresa_id}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-heading font-bold text-white text-lg flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-arandu-blue" />
                      {emp.empresa_nombre}
                    </h3>
                    <p className="text-slate-500 text-sm">{emp.total_count} presupuesto{emp.total_count !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex gap-4 text-right">
                    {emp.total_monto_pyg > 0 && (
                      <div>
                        <p className="text-slate-500 text-xs">Total ₲</p>
                        <p className="text-white font-heading font-bold">₲ {formatNumber(emp.total_monto_pyg)}</p>
                      </div>
                    )}
                    {emp.total_monto_usd > 0 && (
                      <div>
                        <p className="text-slate-500 text-xs">Total US$</p>
                        <p className="text-white font-heading font-bold">US$ {formatNumber(emp.total_monto_usd, "USD")}</p>
                      </div>
                    )}
                    {emp.total_ganancia > 0 && (
                      <div>
                        <p className="text-slate-500 text-xs">Ganancia</p>
                        <p className="text-emerald-400 font-heading font-bold flex items-center gap-1">
                          <Wallet className="w-4 h-4" />
                          ₲ {formatNumber(emp.total_ganancia)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Status breakdown */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "borrador", label: "Borr.", color: "bg-slate-500/20 text-slate-400" },
                    { key: "aprobado", label: "Aprob.", color: "bg-green-500/20 text-green-400" },
                    { key: "facturado", label: "Fact.", color: "bg-orange-500/20 text-orange-400" },
                    { key: "cobrado", label: "Cobr.", color: "bg-emerald-500/20 text-emerald-400" },
                    { key: "rechazado", label: "Rech.", color: "bg-red-500/20 text-red-400" },
                  ].map(s => {
                    const data = emp.estados[s.key];
                    if (!data) return null;
                    return (
                      <Link key={s.key} to={`/admin/presupuestos?empresa=${emp.empresa_id}&estado=${s.key}`}>
                        <span className={`${s.color} px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80`}>
                          {s.label}: {data.count}
                          {data.monto_pyg > 0 && ` (₲${formatNumber(data.monto_pyg)})`}
                          {data.monto_usd > 0 && ` (US$${formatNumber(data.monto_usd, "USD")})`}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}
      {/* TAB: Proveedores */}
      {tab === "proveedores" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {(() => {
            const totalPendiente = proveedorStats.reduce((sum, p) => sum + (p.moneda === "PYG" ? p.pendiente_total : 0), 0);
            const totalPendienteUSD = proveedorStats.reduce((sum, p) => sum + (p.moneda === "USD" ? p.pendiente_total : 0), 0);
            const totalPagado = proveedorStats.reduce((sum, p) => sum + (p.moneda === "PYG" ? p.pagado_total : 0), 0);
            const totalPagadoUSD = proveedorStats.reduce((sum, p) => sum + (p.moneda === "USD" ? p.pagado_total : 0), 0);
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-5">
                  <p className="text-slate-400 text-xs mb-1">Deuda Pendiente (Gs)</p>
                  <p className="text-2xl font-heading font-bold text-orange-400">
                    {formatNumber(totalPendiente)} &#8370;
                  </p>
                </motion.div>
                {totalPendienteUSD > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                    className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-5">
                    <p className="text-slate-400 text-xs mb-1">Deuda Pendiente (US$)</p>
                    <p className="text-2xl font-heading font-bold text-orange-400">
                      US$ {formatNumber(totalPendienteUSD, "USD")}
                    </p>
                  </motion.div>
                )}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
                  <p className="text-slate-400 text-xs mb-1">Total Pagado (Gs)</p>
                  <p className="text-2xl font-heading font-bold text-emerald-400">
                    {formatNumber(totalPagado)} &#8370;
                  </p>
                </motion.div>
                {totalPagadoUSD > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
                    <p className="text-slate-400 text-xs mb-1">Total Pagado (US$)</p>
                    <p className="text-2xl font-heading font-bold text-emerald-400">
                      US$ {formatNumber(totalPagadoUSD, "USD")}
                    </p>
                  </motion.div>
                )}
              </div>
            );
          })()}

          {/* Proveedor List */}
          {proveedorStats.length === 0 ? (
            <div className="text-center py-12 bg-arandu-dark-light rounded-xl border border-white/5">
              <Truck className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400">No hay datos de proveedores todavia</p>
              <p className="text-slate-500 text-sm mt-1">Asigna proveedores en los Costos Reales de cada presupuesto</p>
            </div>
          ) : (
            proveedorStats.map((prov, index) => {
              const symbol = prov.moneda === "USD" ? "US$" : "₲";
              const isPending = prov.pendiente_total > 0;
              return (
                <motion.div
                  key={`${prov.proveedor}-${prov.moneda}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-arandu-dark-light border rounded-xl p-5 ${
                    isPending ? "border-orange-500/20" : "border-emerald-500/20"
                  }`}
                  data-testid={`prov-stat-${index}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isPending ? "bg-orange-500/20" : "bg-emerald-500/20"
                      }`}>
                        <Truck className={`w-5 h-5 ${isPending ? "text-orange-400" : "text-emerald-400"}`} />
                      </div>
                      <div>
                        <h3 className="font-heading font-bold text-white text-lg">{prov.proveedor}</h3>
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{prov.moneda}</span>
                      </div>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <p className="text-slate-500 text-xs">Total</p>
                        <p className="text-white font-heading font-bold">{symbol} {formatNumber(prov.monto_total, prov.moneda)}</p>
                      </div>
                      {prov.pendiente_total > 0 && (
                        <div>
                          <p className="text-orange-400/70 text-xs">Pendiente</p>
                          <p className="text-orange-400 font-heading font-bold">{symbol} {formatNumber(prov.pendiente_total, prov.moneda)}</p>
                        </div>
                      )}
                      {prov.pagado_total > 0 && (
                        <div>
                          <p className="text-emerald-400/70 text-xs">Pagado</p>
                          <p className="text-emerald-400 font-heading font-bold">{symbol} {formatNumber(prov.pagado_total, prov.moneda)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Presupuestos detail */}
                  {prov.presupuestos && prov.presupuestos.length > 0 && (
                    <div className="border-t border-white/5 pt-3 space-y-2">
                      {prov.presupuestos.map((det, dIdx) => (
                        <div key={dIdx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Link to={`/admin/presupuestos?empresa=${det.presupuesto_id}`} className="text-arandu-blue hover:underline">
                              {det.numero}
                            </Link>
                            <span className="text-slate-500">{det.empresa}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-medium">{symbol} {formatNumber(det.monto, prov.moneda)}</span>
                            {det.pagado ? (
                              <span className="flex items-center gap-1 text-emerald-400 text-xs">
                                <Check className="w-3 h-3" /> Pagado
                              </span>
                            ) : (
                              <span className="text-orange-400 text-xs">Pendiente</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default EstadisticasPage;
