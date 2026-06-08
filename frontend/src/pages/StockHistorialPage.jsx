import React, { useContext, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Package, Search, X, TrendingUp, TrendingDown, RotateCcw, Loader2 } from "lucide-react";
import { AuthContext } from "../App";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO_LABEL = { arandujar: "A&JAR", arandu: "Arandu", jar: "JAR" };

const fmt = (n) => Number(n || 0).toLocaleString("es-PY");

// Primer y último día del mes actual
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const primerDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

export default function StockHistorialPage() {
  const { token, activeEmpresaPropia } = useContext(AuthContext);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState([]);
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState(primerDiaMes);
  const [hasta, setHasta] = useState(hoy);

  const headers = { Authorization: `Bearer ${token}` };

  const buscar = async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    setBuscado(true);
    const q = new URLSearchParams();
    if (activeEmpresaPropia?.slug) q.set("logo_tipo", activeEmpresaPropia.slug);
    if (tipo) q.set("tipo", tipo);
    q.set("desde", desde);
    q.set("hasta", hasta);
    const res = await fetch(`${API}/admin/stock-movimientos?${q}`, { headers });
    if (res.ok) setMovimientos(await res.json());
    setLoading(false);
  };

  const addChip = () => {
    const v = search.trim();
    if (v && !chips.includes(v)) setChips(prev => [...prev, v]);
    setSearch("");
  };

  const filtered = useMemo(() => movimientos.filter(m => {
    const active = [...chips, search].filter(Boolean);
    if (active.length === 0) return true;
    const text = [m.producto_nombre, m.sku, m.categoria, m.tipo, m.motivo, m.notas, m.usuario_nombre, m.fecha, m.logo_tipo].filter(Boolean).join(" ").toLowerCase();
    return active.every(ch => text.includes(String(ch).toLowerCase()));
  }), [movimientos, chips, search]);

  const totalEntradas = filtered.filter(m => m.tipo === "entrada").reduce((s, m) => s + (m.cantidad || 0), 0);
  const totalSalidas = filtered.filter(m => m.tipo === "salida").reduce((s, m) => s + (m.cantidad || 0), 0);

  return (
    <div className="min-h-screen bg-arandu-dark text-white">
      <div className="border-b border-white/10 px-6 py-4">
        <Link to="/sistema" className="text-slate-400 hover:text-white flex items-center gap-2 text-sm w-fit mb-3">
          <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
        </Link>
        <h1 className="font-heading text-2xl text-white flex items-center gap-2">
          <Package className="w-6 h-6 text-cyan-400" /> Historial de stock
        </h1>
        <p className="text-slate-400 text-sm">Seleccioná un periodo y presioná Buscar para ver los movimientos</p>
      </div>

      <div className="p-6 space-y-5">

        {/* Filtros + botón buscar */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-slate-500 text-xs">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-slate-500 text-xs">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-slate-500 text-xs">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
              <option value="ajuste">Ajustes</option>
            </select>
          </div>
          <button onClick={buscar} disabled={!desde || !hasta || loading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 whitespace-nowrap">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        {/* Resultados */}
        {buscado && !loading && (
          <>
            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Movimientos", filtered.length, "text-cyan-300"],
                ["Entradas", fmt(totalEntradas), "text-emerald-300"],
                ["Salidas", fmt(totalSalidas), "text-red-300"],
                ["Ajustes", filtered.filter(m => m.tipo === "ajuste").length, "text-blue-300"],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-slate-500 text-xs mb-1">{label}</p>
                  <p className={`font-heading font-bold text-xl ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Búsqueda texto */}
            <div className="relative bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <div className="flex flex-wrap gap-2 mb-2">
                {chips.map(ch => (
                  <span key={ch} className="inline-flex items-center gap-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 rounded-full px-2 py-0.5 text-xs">
                    {ch}<button onClick={() => setChips(prev => prev.filter(x => x !== ch))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <Search className="absolute left-3 bottom-2.5 w-4 h-4 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addChip(); } }}
                placeholder="Filtrar por producto, SKU, motivo, usuario… (Enter para agregar filtro)"
                className="w-full bg-transparent pl-6 text-sm text-white focus:outline-none" />
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-500">No hay movimientos en el periodo seleccionado</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-slate-400 text-xs uppercase">
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Producto</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-right">Cantidad</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-left">Motivo</th>
                      <th className="px-4 py-3 text-left">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(m => {
                      const Icon = m.tipo === "entrada" ? TrendingUp : m.tipo === "salida" ? TrendingDown : RotateCcw;
                      const color = m.tipo === "entrada" ? "text-emerald-300" : m.tipo === "salida" ? "text-red-300" : "text-blue-300";
                      return (
                        <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                          <td className="px-4 py-3 text-slate-300 text-xs">{m.fecha}</td>
                          <td className="px-4 py-3">
                            <p className="text-white font-medium">{m.producto_nombre}</p>
                            <p className="text-slate-500 text-xs">{m.sku || "sin SKU"} · {m.categoria || "sin categoria"} · {LOGO_LABEL[m.logo_tipo] || m.logo_tipo || ""}</p>
                          </td>
                          <td className={`px-4 py-3 ${color}`}><span className="inline-flex items-center gap-1"><Icon className="w-4 h-4" /> {m.tipo}</span></td>
                          <td className={`px-4 py-3 text-right font-bold ${color}`}>{fmt(m.cantidad)}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{fmt(m.stock_anterior)} → <span className="text-white">{fmt(m.stock_nuevo)}</span></td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{String(m.motivo || "").replace(/_/g, " ")}{m.notas ? ` · ${m.notas}` : ""}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{m.usuario_nombre || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!buscado && !loading && (
          <div className="text-center py-20 text-slate-500">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Seleccioná un periodo y presioná <span className="text-cyan-400">Buscar</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
