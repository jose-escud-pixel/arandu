import React, { useState, useEffect, useContext, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Download, FileText, Lock, Plus, X, Save, Edit, Trash2,
  Bell, AlertTriangle, Clock, Check, Globe, Calendar, Printer, Table, Eye,
  BarChart3, Package, Server, TrendingUp, TrendingDown, Receipt, ClipboardList,
  DollarSign, Search, ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";
import { toast } from "sonner";
import { svgDocumentHeaderLogoHtml } from "../lib/marcaLogoSvg";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const mesActual = () => new Date().toISOString().slice(0, 7);
const fmtPYG = (n) => `₲ ${Math.round(Number(n || 0)).toLocaleString("es-PY")}`;
const fmtUSD = (n) => `$ ${Number(n || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mesLabel = (m) => {
  if (!m) return "";
  const d = new Date(`${m}-02T00:00:00`);
  return d.toLocaleDateString("es-PY", { month: "long", year: "numeric" });
};
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const addMonths = (periodo, delta) => {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const setMonthPart = (periodo, monthIdx) => `${periodo.slice(0, 5)}${String(monthIdx + 1).padStart(2, "0")}`;
const endOfMonthDate = (periodo) => {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
};

// ─── Helpers para el reporte (PDF + Excel) ───────────────────────────────────
const COLORS = {
  inv:   { bg: "#1e3a5f", border: "#152b47", rowAlt: "#f0f4f8", title: "#1e3a5f" },
  cred:  { bg: "#7c3aed", border: "#5b21b6", rowAlt: "#faf5ff", title: "#047857" },
  ctas:  { bg: "#0f766e", border: "#0d5e57", rowAlt: "#f0fdfa", title: "#0f766e" },
  det:   { bg: "#ea580c", border: "#c2410c", rowAlt: "#fff7ed", title: "#ea580c" },
};

// Estilo <th> con color sólido (inline, sin Tailwind)
const thStyle = (c) => ({
  backgroundColor: c.bg,
  color: "#ffffff",
  border: `1px solid ${c.border}`,
  padding: "5px 7px",
  textAlign: "left",
  fontWeight: "bold",
  fontSize: "9px",
  whiteSpace: "nowrap",
});

// Estilo <td> con filas alternadas
const tdStyle = (even, c, extra = {}) => ({
  backgroundColor: even ? "#ffffff" : c.rowAlt,
  border: "1px solid #d1d5db",
  padding: "3px 6px",
  fontSize: "9px",
  verticalAlign: "middle",
  wordBreak: "normal",
  overflowWrap: "break-word",
  ...extra,
});

// Título de sección
const SecTitle = ({ color, children }) => (
  <div style={{
    color,
    fontWeight: "bold",
    fontSize: "13px",
    marginTop: "22px",
    marginBottom: "5px",
    borderBottom: `2px solid ${color}`,
    paddingBottom: "2px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  }}>
    {children}
  </div>
);

// ─── Cargador de xlsx-js-style (con soporte de colores en celdas) ─────────────
const loadXLSX = () =>
  new Promise((resolve, reject) => {
    // Si ya cargamos la versión con estilos, reusar
    if (window._XLSX_STYLED && window.XLSX) { resolve(window.XLSX); return; }
    // Borrar versión base anterior (misma variable global) para forzar recarga
    delete window.XLSX;
    const tryLoad = (urls, i) => {
      if (i >= urls.length) { reject(new Error("No se pudo cargar la librería Excel")); return; }
      const s = document.createElement("script");
      s.src = urls[i];
      s.onload  = () => {
        if (window.XLSX) { window._XLSX_STYLED = true; resolve(window.XLSX); }
        else tryLoad(urls, i + 1);
      };
      s.onerror = () => tryLoad(urls, i + 1);
      document.head.appendChild(s);
    };
    tryLoad([
      "https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js",
      "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js",
    ], 0);
  });

const ChipSearch = ({ value, onChange, chips, onChipsChange, placeholder }) => {
  const addChip = () => {
    const term = value.trim();
    if (!term || chips.some(c => c.toLowerCase() === term.toLowerCase())) return;
    onChipsChange([...chips, term]);
    onChange("");
  };
  const removeChip = (chip) => onChipsChange(chips.filter(c => c !== chip));

  return (
    <div className="flex-1 bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 min-h-[44px] flex flex-wrap items-center gap-2 focus-within:border-arandu-blue/60">
      <Search className="w-4 h-4 text-slate-500 shrink-0" />
      {chips.map(chip => (
        <span key={chip} className="inline-flex items-center gap-1 bg-red-500/15 text-red-200 border border-red-500/25 rounded-full px-2 py-1 text-xs">
          {chip}
          <button type="button" onClick={() => removeChip(chip)} className="text-red-200 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); addChip(); }
          if (e.key === "Backspace" && !value && chips.length) onChipsChange(chips.slice(0, -1));
        }}
        className="bg-transparent text-white placeholder:text-slate-500 outline-none flex-1 min-w-[220px] text-sm"
        placeholder={placeholder}
      />
    </div>
  );
};

const matchesChips = (text, chips, inputValue) => {
  const terms = [...chips, inputValue.trim()].filter(Boolean).map(t => t.toLowerCase());
  if (!terms.length) return true;
  const haystack = text.toLowerCase();
  return terms.every(term => haystack.includes(term));
};

// ─── Componente principal ─────────────────────────────────────────────────────
const ReportesPage = () => {
  const { token, user, activeEmpresaPropia, hasPermission, hasModule } = useContext(AuthContext);
  const isAdmin = user?.role === "admin";
  const [searchParams] = useSearchParams();
  const empresaFromUrl = searchParams.get("empresa") || "";
  const nuevoFromUrl = searchParams.get("nuevo") || "";

  const [empresas, setEmpresas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [alertasProximas, setAlertasProximas] = useState([]);
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("reportes");
  const [reporteCategoria, setReporteCategoria] = useState("tecnico"); // "financiero" | "inventario" | "tecnico"

  const [selectedEmpresas, setSelectedEmpresas] = useState(empresaFromUrl ? [empresaFromUrl] : []);
  const [sortBy, setSortBy] = useState("nombre");

  const [showAlertForm, setShowAlertForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [alertForm, setAlertForm] = useState({
    empresa_id: empresaFromUrl || "", tipo: "dominio", nombre: "", descripcion: "",
    fecha_vencimiento: "", activo_id: "", notificar_dias: 30
  });
  const [alertSearch, setAlertSearch] = useState("");
  const [alertSearchChips, setAlertSearchChips] = useState([]);
  const [handledNuevo, setHandledNuevo] = useState(false);

  // Estado del preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);       // lista de activos
  const [previewWithCreds, setPreviewWithCreds] = useState(false);
  const [cuentasAsociadas, setCuentasAsociadas] = useState([]); // sección 3
  const [detalleCuentas, setDetalleCuentas] = useState([]);     // sección 4
  const [reportMonth, setReportMonth] = useState(mesActual());
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportCurrency, setReportCurrency] = useState("PYG");
  const [genericReport, setGenericReport] = useState(null);
  const [genericReportLoading, setGenericReportLoading] = useState(false);

  // Inyectar CSS de impresión una sola vez
  useEffect(() => {
    const id = "arandu-print-css";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = `
        @media print {
          @page { size: landscape; margin: 1.2cm 1cm; }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          #inventario-print {
            display: block !important;
            padding: 0 !important; margin: 0 !important;
            max-width: 100% !important; box-shadow: none !important;
          }
          #inventario-print table { page-break-inside: auto; width: 100%; }
          #inventario-print tr    { page-break-inside: avoid; page-break-after: auto; }
          #inventario-print thead { display: table-header-group; }
        }
      `;
      document.head.appendChild(s);
    }
    return () => { /* no removemos: puede usarse en otra sesión */ };
  }, []);

  // ── Imprimir en ventana nueva — evita el problema del modal/overflow ──────────
  const handlePrint = () => {
    const content = document.getElementById("inventario-print");
    if (!content) return;

    const printWin = window.open("", "_blank");
    if (!printWin) {
      toast.error("El navegador bloqueó la ventana emergente. Habilitala e intentá de nuevo.");
      return;
    }

    // Clonar el nodo para no afectar el DOM visible, y limpiar estilos inline
    // que impedirían que el contenido use el ancho completo del papel
    const clone = content.cloneNode(true);
    clone.style.maxWidth  = "none";
    clone.style.width     = "100%";
    clone.style.padding   = "0";
    clone.style.margin    = "0";
    clone.style.boxShadow = "none";

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Inventario Técnico — Arandu&JAR</title>
  <style>
    @page { size: landscape; margin: 1.2cm 1cm; }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px; line-height: 1.3;
      margin: 0; padding: 0;
      background: white; color: #000;
    }
    table { border-collapse: collapse; width: 100%; }
    /* thead como grupo — repite título + columnas en cada página nueva */
    thead { display: table-header-group !important; }
    /* tbody puede cortar libremente entre filas — sin esto el thead NO repite */
    tbody { display: table-row-group !important; }
    /* Solo las FILAS no se parten al medio */
    tbody tr { break-inside: avoid !important; page-break-inside: avoid !important; }
    td { overflow: hidden; }
    /* Cada sección arranca en página nueva */
    .section-page-break { page-break-before: always; break-before: page; }
    @media screen { body { padding: 16px; } }
  </style>
</head>
<body>
  ${clone.outerHTML}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); window.close(); }, 400);
    });
  <\/script>
</body>
</html>`);
    printWin.document.close();
    printWin.focus();
  };

  const printNode = (nodeId, title = "Reporte") => {
    const content = document.getElementById(nodeId);
    if (!content) return;
    const printWin = window.open("", "_blank");
    if (!printWin) {
      toast.error("El navegador bloqueó la ventana emergente.");
      return;
    }
    const clone = content.cloneNode(true);
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: landscape; margin: 0.8cm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; margin:0; color:#0f172a; background:white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table { border-collapse: separate; border-spacing: 0; width: 100%; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      .no-print { display:none !important; }
      .modern-report { box-shadow:none !important; }
      .report-section { break-inside: avoid; page-break-inside: avoid; }
    </style></head><body>${clone.outerHTML}<script>window.onload=function(){setTimeout(function(){window.print();window.close();},300)}<\/script></body></html>`);
    printWin.document.close();
    printWin.focus();
  };

  const fetchAll = async () => {
    try {
      const logo = activeEmpresaPropia?.slug || "";
      const buildUrl = (path, entries = {}) => {
        const q = new URLSearchParams();
        if (logo) q.set("logo_tipo", logo);
        Object.entries(entries).forEach(([key, val]) => { if (val) q.set(key, val); });
        const qs = q.toString();
        return `${API}${path}${qs ? `?${qs}` : ""}`;
      };
      const [empRes, alertRes, proxRes, actRes] = await Promise.all([
        fetch(buildUrl("/admin/empresas"), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildUrl("/admin/alertas", { empresa_id: empresaFromUrl }), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildUrl("/admin/alertas/proximas"), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildUrl("/admin/activos"), { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (empRes.ok) setEmpresas(await empRes.json());
      if (alertRes.ok) setAlertas(await alertRes.json());
      if (proxRes.ok) setAlertasProximas(await proxRes.json());
      if (actRes.ok) setActivos(await actRes.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [activeEmpresaPropia?.slug]); // eslint-disable-line

  const toggleEmpresa = (id) => {
    setSelectedEmpresas(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const fetchReportData = async (withCreds) => {
    if (withCreds && !isAdmin) { toast.error("Solo administradores pueden ver credenciales"); return; }
    try {
      const params = new URLSearchParams();
      if (selectedEmpresas.length > 0) params.set("empresa_ids", selectedEmpresas.join(","));
      if (activeEmpresaPropia?.slug) params.set("logo_tipo", activeEmpresaPropia.slug);
      if (withCreds) params.set("incluir_credenciales", "true");
      params.set("ordenar_por", sortBy);
      const res = await fetch(`${API}/admin/reportes/inventario?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        // El backend siempre devuelve { activos, cuentas_asociadas, detalle_cuentas }
        // Las contraseñas están vacías cuando incluir_credenciales=false
        if (Array.isArray(data)) {
          // compatibilidad con versiones viejas que devuelvan lista
          setPreviewData(data);
          setCuentasAsociadas([]);
          setDetalleCuentas([]);
        } else {
          setPreviewData(data.activos || []);
          setCuentasAsociadas(data.cuentas_asociadas || []);
          setDetalleCuentas(data.detalle_cuentas || []);
        }
        setPreviewWithCreds(withCreds);
        setShowPreview(true);
      } else { const e = await res.json(); toast.error(e.detail || "Error"); }
    } catch { toast.error("Error"); }
  };

  const fetchJson = async (path, params = {}) => {
    const q = new URLSearchParams();
    if (activeEmpresaPropia?.slug) q.set("logo_tipo", activeEmpresaPropia.slug);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, v);
    });
    const res = await fetch(`${API}${path}${q.toString() ? `?${q.toString()}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || "No se pudo generar el reporte");
    }
    return res.json();
  };

  const rowsOf = (items, columns) => (items || []).map(item => columns.map(col => {
    const val = typeof col.value === "function" ? col.value(item) : item[col.value];
    return val === undefined || val === null || val === "" ? "-" : val;
  }));

  const montoReportePYG = (item, fields = ["monto", "monto_total", "monto_pagado", "total_pagado"]) => {
    const raw = fields.map(f => item?.[f]).find(v => v !== undefined && v !== null && v !== "");
    const monto = Number(raw || 0);
    if ((item?.moneda || "PYG") === "USD") {
      return Number(item?.monto_gs || item?.monto_pyg || 0) || monto * Number(item?.tipo_cambio || 0);
    }
    return monto;
  };

  const sectionTotal = (items, amountFn) => (items || []).reduce((sum, item) => sum + Number(amountFn(item) || 0), 0);
  const fmtCuentaMonto = (n, cuenta) => (cuenta?.moneda === "USD" ? fmtUSD(n) : fmtPYG(n));
  const fmtMixto = (pyg = 0, usd = 0) => {
    const parts = [];
    if (Number(pyg || 0) > 0) parts.push(fmtPYG(pyg));
    if (Number(usd || 0) > 0) parts.push(fmtUSD(usd));
    return parts.length ? parts.join(" / ") : "-";
  };
  const montoCuenta = (item, fields) => {
    const raw = fields.map(f => item?.[f]).find(v => v !== undefined && v !== null && v !== "");
    return Number(raw || 0);
  };

  const normalizarMovimientoCuenta = (item, fields = ["monto", "monto_total", "monto_pagado"]) => {
    const raw = montoCuenta(item, fields);
    const tc = Number(item?.tipo_cambio || item?.tipo_cambio_real || 0);
    const monedaDoc = item?.moneda || "PYG";
    const cuentaMoneda = item?.cuenta_moneda || item?.moneda_cuenta || (tc > 0 ? "PYG" : monedaDoc);
    const montoConvertido = cuentaMoneda === "PYG" && (monedaDoc === "USD" || tc > 0)
      ? Number(item?.monto_gs || item?.monto_pyg || 0) || raw * (tc || 1)
      : raw;
    return {
      ...item,
      moneda: cuentaMoneda,
      cuenta_moneda: cuentaMoneda,
      monto_movimiento: montoConvertido,
    };
  };

  const movimientosDeCompras = (compras = []) => (
    (compras || []).flatMap(compra => {
      if ((compra.tipo_pago || "contado") === "contado") {
        return [normalizarMovimientoCuenta(compra, ["monto_total", "monto"])];
      }
      const pagos = compra.pagos || [];
      return pagos.map(pago => normalizarMovimientoCuenta({
        ...compra,
        ...pago,
        fecha: pago.fecha_pago || pago.fecha || compra.fecha,
        proveedor_nombre: compra.proveedor_nombre,
        factura_numero: compra.factura_numero || compra.numero_factura,
        tipo_pago: "credito",
        estado_pago: compra.estado_pago,
        moneda: pago.moneda || compra.moneda,
        monto: pago.monto_pagado ?? pago.monto,
      }, ["monto", "monto_pagado"]));
    })
  );

  const cuentaTexto = (item) => item?.cuenta_nombre || item?.banco_nombre || item?.cuenta_id || "-";
  const cuentaIdDeItem = (item) => item?.cuenta_id || item?.banco_id || null;
  const monedaDeItem = (item) => item?.cuenta_moneda || item?.moneda_cuenta || item?.moneda || "PYG";
  const cuentasFactura = (fac) => {
    const names = [
      fac?.cuenta_nombre,
      ...(fac?.pagos || []).map(p => p.cuenta_nombre || p.cuenta_id),
    ].filter(Boolean);
    return names.length ? [...new Set(names)].join(", ") : "-";
  };
  const formaFactura = (fac) => {
    const forma = fac?.forma_pago || fac?.tipo_pago;
    if (forma) return forma;
    return fac?.estado === "pendiente" || fac?.estado === "parcial" ? "credito" : "contado";
  };

  const buildCuentaResolver = (cuentas = []) => {
    const byId = new Map(cuentas.map(c => [c.id, c]));
    const defaults = {};
    cuentas.forEach(c => {
      const moneda = c.moneda || "PYG";
      if (!defaults[moneda] || c.es_predeterminada) defaults[moneda] = c;
    });
    return {
      resolve(item = {}) {
        const tagged = cuentaIdDeItem(item);
        const cuenta = tagged ? byId.get(tagged) : null;
        const moneda = monedaDeItem(item);
        if (cuenta && (!moneda || (cuenta.moneda || "PYG") === moneda)) return cuenta;
        return defaults[moneda] || defaults.PYG || cuentas[0] || { id: "sin-cuenta", nombre: "Cuenta predeterminada", moneda };
      },
      include(cuenta) {
        if (reportCurrency === "AMBOS") return true;
        return (cuenta?.moneda || "PYG") === reportCurrency;
      },
    };
  };

  const sectionsPorCuenta = (items, base, resolver, rowBuilder, amountFn) => {
    const grouped = new Map();
    (items || []).forEach(item => {
      const cuenta = resolver.resolve(item);
      if (!resolver.include(cuenta)) return;
      const key = `${cuenta.id || cuenta.nombre || "sin-cuenta"}-${cuenta.moneda || "PYG"}`;
      if (!grouped.has(key)) grouped.set(key, { cuenta, rows: [], items: [] });
      grouped.get(key).rows.push(rowBuilder(item, cuenta));
      grouped.get(key).items.push(item);
    });
    if (grouped.size === 0) {
      return [{
        ...base,
        title: `${base.title} - ${reportCurrency === "USD" ? "Dolares" : reportCurrency === "PYG" ? "Guaranies" : "Sin movimientos"}`,
        total: reportCurrency === "USD" ? fmtUSD(0) : fmtPYG(0),
        rows: [],
      }];
    }
    return Array.from(grouped.values()).map(({ cuenta, rows, items }) => ({
      ...base,
      title: `${base.title} - ${cuenta.nombre || cuenta.id || "Cuenta predeterminada"} (${cuenta.moneda || "PYG"})`,
      total: fmtCuentaMonto(sectionTotal(items, amountFn), cuenta),
      rows,
    }));
  };

  const resumenCuentasDesdeItems = (items, resolver, amountFn, title = "Resumen por cuenta") => {
    const grouped = new Map();
    (items || []).forEach(item => {
      const cuenta = resolver.resolve(item);
      if (!resolver.include(cuenta)) return;
      const key = `${cuenta.id || cuenta.nombre || "sin-cuenta"}-${cuenta.moneda || "PYG"}`;
      if (!grouped.has(key)) grouped.set(key, { cuenta, total: 0, count: 0 });
      const current = grouped.get(key);
      current.total += Number(amountFn(item) || 0);
      current.count += 1;
    });
    return {
      title,
      rows: Array.from(grouped.values()).map(({ cuenta, total, count }) => ({
        label: `${cuenta.nombre || cuenta.id || "Cuenta predeterminada"} (${cuenta.moneda || "PYG"})`,
        value: fmtCuentaMonto(total, cuenta),
        note: `${count} mov.`,
      })),
    };
  };

  const resumenSaldosCuentas = (cuentas = [], title = "Saldo actual por cuenta") => ({
    title,
    rows: (cuentas || [])
      .filter(cuenta => reportCurrency === "AMBOS" || (cuenta.moneda || "PYG") === reportCurrency)
      .map(cuenta => ({
        label: `${cuenta.nombre || cuenta.id || "Cuenta"} (${cuenta.moneda || "PYG"})`,
        value: fmtCuentaMonto(cuenta.saldo_actual || 0, cuenta),
        note: cuenta.es_predeterminada ? "Predeterminada" : "",
      })),
  });

  const generarReporte = async (tipo) => {
    setGenericReportLoading(true);
    try {
      let report = null;
      const periodoSub = `Empresa activa: ${activeEmpresaPropia?.nombre || "Todas"} · Generado: ${nowFull}`;
      const cuentasReporte = await fetchJson("/admin/cuentas-bancarias").catch(() => []);
      const cuentaResolver = buildCuentaResolver(cuentasReporte);
      const fetchSaldosCuentas = (hasta) => fetchJson("/admin/cuentas-bancarias/saldos", { hasta }).catch(() => cuentasReporte);
      const currencyLabel = reportCurrency === "USD" ? "Dolares" : reportCurrency === "AMBOS" ? "Guaranies y dolares" : "Guaranies";
      const showPYG = reportCurrency === "PYG" || reportCurrency === "AMBOS";
      const showUSD = reportCurrency === "USD" || reportCurrency === "AMBOS";
      if (tipo === "balance_mensual") {
        const [b, saldosCuentas] = await Promise.all([
          fetchJson("/admin/balance", { periodo: reportMonth }),
          fetchSaldosCuentas(endOfMonthDate(reportMonth)),
        ]);
        const summary = [];
        const sections = [];
        if (showPYG) {
          summary.push(
            ["Ingresos Gs", fmtPYG(b.total_ingresos)],
            ["Egresos Gs", fmtPYG(b.total_egresos)],
            ["Balance Gs", fmtPYG(b.balance)],
            ["Saldo acum. Gs", fmtPYG(b.saldo_acumulado)]
          );
          sections.push(
            { group: "Guaranies", title: "Ingresos Gs", columns: ["Concepto", "Cantidad", "Monto"], rows: (b.ingresos_detalle || []).map(v => [v.fuente || "-", v.cantidad || "-", fmtPYG(v.monto_pyg || v.total || 0)]) },
            { group: "Guaranies", title: "Egresos Gs", columns: ["Concepto", "Cantidad", "Monto"], rows: (b.egresos_detalle || []).map(v => [v.fuente || "-", v.cantidad || "-", fmtPYG(v.monto_pyg || v.total || 0)]) }
          );
        }
        if (showUSD) {
          summary.push(
            ["Ingresos USD", fmtUSD(b.total_ingresos_usd)],
            ["Egresos USD", fmtUSD(b.total_egresos_usd)],
            ["Balance USD", fmtUSD(b.balance_usd)],
            ["Saldo acum. USD", fmtUSD(b.saldo_acumulado_usd)]
          );
          sections.push(
            { group: "Dolares", title: "Ingresos USD", columns: ["Concepto", "Cantidad", "Monto"], rows: (b.ingresos_usd_detalle || []).map(v => [v.fuente || "-", v.cantidad || "-", fmtUSD(v.monto_usd || v.total || 0)]) },
            { group: "Dolares", title: "Egresos USD", columns: ["Concepto", "Cantidad", "Monto"], rows: (b.egresos_usd_detalle || []).map(v => [v.fuente || "-", v.cantidad || "-", fmtUSD(v.monto_usd || v.total || 0)]) }
          );
        }
        report = {
          title: `Balance mensual - ${mesLabel(reportMonth)} - ${currencyLabel}`,
          subtitle: periodoSub,
          summary,
          accountSummary: resumenSaldosCuentas(saldosCuentas, `Saldo por banco/cuenta al cierre de ${mesLabel(reportMonth)}`),
          sections,
        };
      } else if (tipo === "balance_anual") {
        const [b, mesesBalance, saldosCuentas] = await Promise.all([
          fetchJson("/admin/balance/anual", { anio: reportYear }),
          showUSD
            ? Promise.all(Array.from({ length: 12 }, (_, idx) => fetchJson("/admin/balance", { periodo: `${reportYear}-${String(idx + 1).padStart(2, "0")}` }).catch(() => null)))
            : Promise.resolve([]),
          fetchSaldosCuentas(`${reportYear}-12-31`),
        ]);
        const usdRows = (mesesBalance || []).filter(Boolean).map((m, idx) => ({
          periodo: `${reportYear}-${String(idx + 1).padStart(2, "0")}`,
          ingresos: Number(m.total_ingresos_usd || 0),
          egresos: Number(m.total_egresos_usd || 0),
          balance: Number(m.balance_usd || 0),
          acumulado: Number(m.saldo_acumulado_usd || 0),
        }));
        const summary = [];
        const sections = [];
        if (showPYG) {
          summary.push(["Ingresos Gs", fmtPYG(b.total_anual_ingresos)], ["Egresos Gs", fmtPYG(b.total_anual_egresos)], ["Balance Gs", fmtPYG(b.balance_anual)], ["Saldo inicial Gs", fmtPYG(b.superavit_inicial)]);
          sections.push({ group: "Guaranies", title: "Meses Gs", columns: ["Mes", "Ingresos", "Egresos", "Balance", "Acumulado"], rows: (b.meses || []).map(m => [m.periodo, fmtPYG(m.total_ingresos), fmtPYG(m.total_egresos), fmtPYG(m.balance), fmtPYG(m.acumulado)]) });
        }
        if (showUSD) {
          summary.push(["Ingresos USD", fmtUSD(sectionTotal(usdRows, r => r.ingresos))], ["Egresos USD", fmtUSD(sectionTotal(usdRows, r => r.egresos))], ["Balance USD", fmtUSD(sectionTotal(usdRows, r => r.balance))], ["Saldo final USD", fmtUSD(usdRows.at(-1)?.acumulado || 0)]);
          sections.push({ group: "Dolares", title: "Meses USD", columns: ["Mes", "Ingresos", "Egresos", "Balance", "Acumulado"], rows: usdRows.map(m => [m.periodo, fmtUSD(m.ingresos), fmtUSD(m.egresos), fmtUSD(m.balance), fmtUSD(m.acumulado)]) });
        }
        report = {
          title: `Balance anual - ${reportYear} - ${currencyLabel}`,
          subtitle: periodoSub,
          summary,
          accountSummary: resumenSaldosCuentas(saldosCuentas, `Saldo por banco/cuenta al cierre de ${reportYear}`),
          sections,
        };
      } else if (tipo === "balance_detallado") {
        const [b, facturas, ingresosVarios, recibos, notasCredito, compras, pagos, gastos, sueldos, iva, saldosCuentas] = await Promise.all([
          fetchJson("/admin/balance", { periodo: reportMonth }),
          fetchJson("/admin/facturas", { mes: reportMonth }),
          fetchJson("/admin/ingresos-varios", { mes: reportMonth }).catch(() => []),
          fetchJson("/admin/recibos", { mes: reportMonth }).catch(() => []),
          fetchJson("/admin/notas-credito", { mes: reportMonth }).catch(() => []),
          fetchJson("/admin/compras", { mes: reportMonth }),
          fetchJson("/admin/pagos-proveedores", { mes: reportMonth }),
          fetchJson("/admin/costos-fijos-pagos", { mes: reportMonth }).catch(() => []),
          fetchJson("/admin/empleados/sueldos", { periodo: reportMonth }).catch(() => []),
          fetchJson("/admin/balance/iva", { periodo: reportMonth }).catch(() => ({ pagos_iva_detalle: [] })),
          fetchSaldosCuentas(endOfMonthDate(reportMonth)),
        ]);
        const sueldosPagados = (sueldos || []).filter(s => s.sueldo_registrado);
        const montoSueldo = (row) => montoReportePYG(row.sueldo_registrado || row, ["monto_pagado"]);
        const sueldosCuenta = sueldosPagados.map(s => ({
          ...s,
          cuenta_id: s.sueldo_registrado?.cuenta_id || s.cuenta_id,
          cuenta_nombre: s.sueldo_registrado?.cuenta_nombre || s.cuenta_nombre,
          cuenta_moneda: s.sueldo_registrado?.cuenta_moneda || s.sueldo_registrado?.moneda || s.moneda || "PYG",
        }));
        const comprasMov = movimientosDeCompras(compras);
        const comprasContado = comprasMov.filter(c => (c.tipo_pago || "contado") === "contado");
        const comprasCredito = (compras || []).filter(c => c.tipo_pago === "credito");
        const notasVenta = (notasCredito || []).filter(n => !n.tipo || n.tipo === "venta" || n.origen === "venta");
        const notasCompra = (notasCredito || []).filter(n => n.tipo === "compra" || n.origen === "compra");
        const pagosIva = iva.pagos_iva_detalle || [];
        const pagosProveedoresPagados = (pagos || []).filter(p => p.estado === "pagado" || p.fecha_pago);
        const facturasCuenta = (facturas || []).map(f => {
          const p = (f.pagos || [])[0] || {};
          return { ...f, cuenta_id: p.cuenta_id || f.cuenta_id, cuenta_nombre: p.cuenta_nombre || f.cuenta_nombre, cuenta_moneda: p.cuenta_moneda || f.cuenta_moneda || f.moneda };
        });
        report = {
          title: `Balance detallado - ${mesLabel(reportMonth)} - ${currencyLabel}`,
          subtitle: periodoSub,
          summary: [
            ...(showPYG ? [["Ingresos Gs", fmtPYG(b.total_ingresos)], ["Egresos Gs", fmtPYG(b.total_egresos)], ["Balance Gs", fmtPYG(b.balance)], ["Saldo acum. Gs", fmtPYG(b.saldo_acumulado)]] : []),
            ...(showUSD ? [["Ingresos USD", fmtUSD(b.total_ingresos_usd)], ["Egresos USD", fmtUSD(b.total_egresos_usd)], ["Balance USD", fmtUSD(b.balance_usd)], ["Saldo acum. USD", fmtUSD(b.saldo_acumulado_usd)]] : []),
          ],
          accountSummary: resumenSaldosCuentas(saldosCuentas, `Saldo por banco/cuenta al cierre de ${mesLabel(reportMonth)}`),
          sections: [
            ...sectionsPorCuenta(facturasCuenta, { group: "Ingresos", title: "Facturas cobradas / emitidas", totalLabel: "Total facturas", columns: ["Fecha", "Cliente", "Nro", "Tipo", "Estado", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha || "-", r.empresa_nombre || r.razon_social || "-", r.numero || "-", formaFactura(r), r.estado || "-", fmtCuentaMonto(montoCuenta(r, ["monto"]), cuenta)], r => montoCuenta(r, ["monto"])),
            ...sectionsPorCuenta(ingresosVarios, { group: "Ingresos", title: "Ingresos varios sin factura", totalLabel: "Total ingresos varios", columns: ["Fecha", "Cliente", "Categoria", "Concepto", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha || "-", r.empresa_nombre || r.razon_social || "-", r.categoria || "-", r.descripcion || r.concepto || "-", fmtCuentaMonto(montoCuenta(r, ["monto"]), cuenta)], r => montoCuenta(r, ["monto"])),
            ...sectionsPorCuenta(recibos, { group: "Ingresos", title: "Recibos / cobros registrados", totalLabel: "Total recibos", columns: ["Fecha", "Cliente", "Factura", "Metodo", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha_pago || "-", r.empresa_nombre || r.cliente_nombre || "-", r.factura_numero || r.factura_id || "-", r.metodo_pago || "-", fmtCuentaMonto(montoCuenta(r, ["monto"]), cuenta)], r => montoCuenta(r, ["monto"])),
            { group: "Ingresos", title: "Notas de credito ventas", totalLabel: "Total notas venta", total: fmtPYG(sectionTotal(notasVenta, r => montoReportePYG(r, ["monto"]))), columns: ["Fecha", "Cliente", "Factura", "Motivo", "Monto"], rows: rowsOf(notasVenta, [{value:"fecha"}, {value: r => r.empresa_nombre || r.razon_social}, {value: r => r.factura_numero || r.factura_id}, {value:"motivo"}, {value: r => fmtPYG(montoReportePYG(r, ["monto"]))}]) },
            ...sectionsPorCuenta(comprasContado, { group: "Egresos", title: "Compras contado", totalLabel: "Total contado", columns: ["Fecha", "Proveedor", "Factura", "Estado", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha || "-", r.proveedor_nombre || "-", r.factura_numero || r.numero_factura || "-", r.estado_pago || "-", fmtCuentaMonto(r.monto_movimiento, cuenta)], r => r.monto_movimiento),
            { group: "Egresos", title: "Compras credito generadas", totalLabel: "Total credito", total: fmtPYG(sectionTotal(comprasCredito, r => montoReportePYG(r, ["monto_total", "monto"]))), columns: ["Fecha", "Proveedor", "Factura", "Estado", "Monto"], rows: rowsOf(comprasCredito, [{value:"fecha"}, {value:"proveedor_nombre"}, {value:"factura_numero"}, {value:"estado_pago"}, {value: r => fmtPYG(montoReportePYG(r, ["monto_total", "monto"]))}]) },
            ...sectionsPorCuenta(pagosProveedoresPagados.map(p => normalizarMovimientoCuenta(p, ["monto"])), { group: "Egresos", title: "Pagos proveedores de compras credito", totalLabel: "Total pagado", columns: ["Fecha pago", "Proveedor", "Concepto", "Estado", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha_pago || "-", r.proveedor_nombre || "-", r.concepto || "-", r.estado || "-", fmtCuentaMonto(r.monto_movimiento, cuenta)], r => r.monto_movimiento),
            ...sectionsPorCuenta(gastos, { group: "Egresos", title: "Gastos pagados", totalLabel: "Total gastos", columns: ["Fecha", "Concepto", "Categoria", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha_pago || r.fecha || r.periodo || "-", r.costo_nombre || r.nombre || "-", r.categoria || "-", fmtCuentaMonto(montoCuenta(r, ["monto_pagado", "monto"]), cuenta)], r => montoCuenta(r, ["monto_pagado", "monto"])),
            ...sectionsPorCuenta(sueldosCuenta, { group: "Egresos", title: "Sueldos pagados", totalLabel: "Total sueldos", columns: ["Fecha", "Empleado", "Extras", "Adelantos", "Descuentos", "Total pagado"] }, cuentaResolver, (r, cuenta) => [r.sueldo_registrado?.fecha_pago || r.sueldo_registrado?.periodo || r.periodo || "-", r.empleado_nombre || `${r.nombre || ""} ${r.apellido || ""}`, fmtCuentaMonto(r.sueldo_registrado?.total_extras || 0, cuenta), fmtCuentaMonto(r.sueldo_registrado?.total_adelantos || 0, cuenta), fmtCuentaMonto(Number(r.sueldo_registrado?.descuento_ips || 0) + Number(r.sueldo_registrado?.descuentos_adicionales || 0), cuenta), fmtCuentaMonto(montoCuenta(r.sueldo_registrado || r, ["monto_pagado"]), cuenta)], r => montoCuenta(r.sueldo_registrado || r, ["monto_pagado"])),
            ...sectionsPorCuenta(pagosIva, { group: "Egresos", title: "Pago IVA", totalLabel: "Total IVA pagado", columns: ["Fecha", "Periodo IVA", "Descripcion", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha_pago || "-", r.periodo_iva || "-", r.descripcion || "-", fmtCuentaMonto(montoCuenta(r, ["monto"]), cuenta)], r => montoCuenta(r, ["monto"])),
            { group: "Egresos", title: "Notas de credito compras", totalLabel: "Total notas compra", total: fmtPYG(sectionTotal(notasCompra, r => montoReportePYG(r, ["monto"]))), columns: ["Fecha", "Proveedor", "Factura", "Motivo", "Monto"], rows: rowsOf(notasCompra, [{value:"fecha"}, {value: r => r.proveedor_nombre || r.razon_social}, {value: r => r.factura_numero || r.factura_id}, {value:"motivo"}, {value: r => fmtPYG(montoReportePYG(r, ["monto"]))}]) },
          ],
        };
      } else if (tipo === "facturas") {
        const data = await fetchJson("/admin/facturas", { mes: reportMonth });
        const total = sectionTotal(data, x => montoReportePYG(x, ["monto"]));
        const cobrado = sectionTotal(data, x => {
          const pagado = Number(x.monto_pagado ?? 0);
          if (pagado > 0) return montoReportePYG({ ...x, monto: pagado }, ["monto"]);
          return x.estado === "pagada" ? montoReportePYG(x, ["monto"]) : 0;
        });
        const pendiente = Math.max(0, total - cobrado);
        const dataCuenta = (data || []).map(f => {
          const p = (f.pagos || [])[0] || {};
          return { ...f, cuenta_id: p.cuenta_id || f.cuenta_id, cuenta_nombre: p.cuenta_nombre || f.cuenta_nombre, cuenta_moneda: p.cuenta_moneda || f.cuenta_moneda || f.moneda };
        });
        const cobrosCuenta = (data || []).flatMap(f => {
          const pagos = f.pagos || [];
          if (pagos.length) {
            return pagos.map(p => ({ ...p, cuenta_moneda: p.cuenta_moneda || f.moneda || "PYG", moneda: p.moneda || f.moneda || "PYG" }));
          }
          return f.estado === "pagada" ? [f] : [];
        });
        report = {
          title: `Facturas - ${mesLabel(reportMonth)}`,
          subtitle: periodoSub,
          summary: [["Emitidas", data.length], ["Total emitido", fmtPYG(total)], ["Cobrado", fmtPYG(cobrado)], ["Pendiente", fmtPYG(pendiente)]],
          accountSummary: resumenCuentasDesdeItems(cobrosCuenta, cuentaResolver, r => montoCuenta(r, ["monto"]), "Cobros de facturas por banco/cuenta"),
          sections: sectionsPorCuenta(dataCuenta, { title: "Facturas por cuenta", totalLabel: "Total emitido", columns: ["Fecha", "Cliente", "Nro", "Tipo", "Estado", "Emitido", "Cobrado", "Pendiente"] }, cuentaResolver, (r, cuenta) => {
            const emitido = montoCuenta(r, ["monto"]);
            const pagado = Number(r.monto_pagado ?? 0);
            const cobro = pagado > 0 ? pagado : (r.estado === "pagada" ? emitido : 0);
            return [r.fecha || "-", r.empresa_nombre || r.razon_social || "-", r.numero || "-", formaFactura(r), r.estado || "-", fmtCuentaMonto(emitido, cuenta), fmtCuentaMonto(cobro, cuenta), fmtCuentaMonto(Math.max(0, emitido - cobro), cuenta)];
          }, r => montoCuenta(r, ["monto"])),
        };
      } else if (tipo === "ingresos") {
        const data = await fetchJson("/admin/ingresos-varios", { mes: reportMonth });
        const total = data.reduce((s, x) => s + Number(x.monto || 0), 0);
        report = { title: `Ingresos varios - ${mesLabel(reportMonth)}`, subtitle: periodoSub, summary: [["Registros", data.length], ["Total", fmtPYG(total)], ["Categorias", new Set(data.map(x => x.categoria).filter(Boolean)).size], ["Clientes", new Set(data.map(x => x.empresa_id).filter(Boolean)).size]], accountSummary: resumenCuentasDesdeItems(data, cuentaResolver, r => montoCuenta(r, ["monto"]), "Ingresos por banco/cuenta"), sections: sectionsPorCuenta(data, { title: "Ingresos por cuenta", totalLabel: "Total", columns: ["Fecha", "Cliente", "Categoria", "Concepto", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha || "-", r.empresa_nombre || r.razon_social || "-", r.categoria || "-", r.descripcion || r.concepto || "-", fmtCuentaMonto(montoCuenta(r, ["monto"]), cuenta)], r => montoCuenta(r, ["monto"])) };
      } else if (tipo === "recibos") {
        const data = await fetchJson("/admin/recibos", { mes: reportMonth });
        const total = data.reduce((s, x) => s + Number(x.monto || 0), 0);
        report = { title: `Recibos - ${mesLabel(reportMonth)}`, subtitle: periodoSub, summary: [["Recibos", data.length], ["Total", fmtPYG(total)], ["Facturas", new Set(data.map(x => x.factura_id).filter(Boolean)).size], ["Clientes", new Set(data.map(x => x.empresa_id).filter(Boolean)).size]], accountSummary: resumenCuentasDesdeItems(data, cuentaResolver, r => montoCuenta(r, ["monto"]), "Recibos por banco/cuenta"), sections: sectionsPorCuenta(data, { title: "Recibos por cuenta", totalLabel: "Total", columns: ["Fecha", "Cliente", "Factura", "Metodo", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha_pago || "-", r.empresa_nombre || r.cliente_nombre || "-", r.factura_numero || r.factura_id || "-", r.metodo_pago || "-", fmtCuentaMonto(montoCuenta(r, ["monto"]), cuenta)], r => montoCuenta(r, ["monto"])) };
      } else if (tipo === "notas_credito") {
        const data = await fetchJson("/admin/notas-credito", { mes: reportMonth });
        const total = data.reduce((s, x) => s + Number(x.monto || 0), 0);
        report = { title: `Notas de credito - ${mesLabel(reportMonth)}`, subtitle: periodoSub, summary: [["Notas", data.length], ["Total", fmtPYG(total)], ["Ventas", data.filter(x => x.tipo === "venta").length], ["Compras", data.filter(x => x.tipo === "compra").length]], sections: [{ title: "Detalle", columns: ["Fecha", "Tipo", "Cliente/Proveedor", "Factura", "Motivo", "Monto"], rows: rowsOf(data, [{value:"fecha"}, {value:"tipo"}, {value: r => r.empresa_nombre || r.proveedor_nombre || r.razon_social}, {value: r => r.factura_numero || r.factura_id}, {value:"motivo"}, {value: r => fmtPYG(r.monto)}]) }] };
      } else if (tipo === "presupuestos") {
        const data = await fetchJson("/admin/presupuestos");
        report = { title: "Presupuestos", subtitle: periodoSub, summary: [["Total", data.length], ["Aprobados", data.filter(x => x.estado === "aprobado").length], ["Rechazados", data.filter(x => x.estado === "rechazado").length], ["Facturados", data.filter(x => x.facturado).length]], sections: [{ title: "Detalle", columns: ["Fecha", "Cliente", "Estado", "Total", "Facturas"], rows: rowsOf(data, [{value: r => (r.created_at || "").slice(0,10)}, {value:"empresa_nombre"}, {value:"estado"}, {value: r => fmtPYG(r.total)}, {value:"facturas_count"}]) }] };
      } else if (tipo === "compras") {
        const data = await fetchJson("/admin/compras", { mes: reportMonth });
        const movimientos = movimientosDeCompras(data);
        const totalMovPYG = sectionTotal(movimientos.filter(x => (x.cuenta_moneda || x.moneda) !== "USD"), x => x.monto_movimiento);
        const totalMovUSD = sectionTotal(movimientos.filter(x => (x.cuenta_moneda || x.moneda) === "USD"), x => x.monto_movimiento);
        const totalUSDOriginal = sectionTotal(data.filter(x => x.moneda === "USD"), x => montoCuenta(x, ["monto_total", "monto"]));
        const pendientesCredito = data.filter(x => x.tipo_pago === "credito" && x.estado_pago !== "pagado");
        const pendientesPYG = sectionTotal(pendientesCredito.filter(x => (x.moneda || "PYG") !== "USD"), x => montoCuenta(x, ["saldo_pendiente", "monto_total", "monto"]));
        const pendientesUSD = sectionTotal(pendientesCredito.filter(x => x.moneda === "USD"), x => montoCuenta(x, ["saldo_pendiente", "monto_total", "monto"]));
        report = {
          title: `Compras - ${mesLabel(reportMonth)}`,
          subtitle: periodoSub,
          summary: [
            ["Compras", data.length],
            ["Pagado Gs", fmtPYG(totalMovPYG)],
            ["Pagado USD", fmtUSD(totalMovUSD)],
            ["Compras USD", fmtUSD(totalUSDOriginal)],
            ["Pendiente Gs", fmtPYG(pendientesPYG)],
            ["Pendiente USD", fmtUSD(pendientesUSD)],
          ],
          accountSummary: resumenCuentasDesdeItems(movimientos, cuentaResolver, r => r.monto_movimiento, "Pagos/compras por banco/cuenta"),
          sections: [
            ...sectionsPorCuenta(movimientos, { title: "Compras pagadas por cuenta", totalLabel: "Total", columns: ["Fecha", "Proveedor", "Tipo", "Factura", "Estado", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha || "-", r.proveedor_nombre || "-", r.tipo_pago || "-", r.factura_numero || r.numero_factura || "-", r.estado_pago || "-", fmtCuentaMonto(r.monto_movimiento, cuenta)], r => r.monto_movimiento),
            { title: "Compras credito pendientes", totalLabel: "Pendiente", total: `${fmtPYG(pendientesPYG)} / ${fmtUSD(pendientesUSD)}`, columns: ["Fecha", "Proveedor", "Factura", "Moneda", "Saldo pendiente"], rows: rowsOf(pendientesCredito, [{value:"fecha"}, {value:"proveedor_nombre"}, {value: r => r.factura_numero || r.numero_factura}, {value:"moneda"}, {value: r => r.moneda === "USD" ? fmtUSD(r.saldo_pendiente || r.monto_total || 0) : fmtPYG(r.saldo_pendiente || r.monto_total || 0)}]) },
          ],
        };
      } else if (tipo === "gastos") {
        const data = await fetchJson("/admin/costos-fijos-pagos", { mes: reportMonth });
        const total = data.reduce((s, x) => s + Number(x.monto_pagado || x.monto || 0), 0);
        report = { title: `Gastos - ${mesLabel(reportMonth)}`, subtitle: periodoSub, summary: [["Pagos", data.length], ["Total", fmtPYG(total)], ["Categorias", new Set(data.map(x => x.categoria).filter(Boolean)).size], ["Pendientes", data.filter(x => x.estado && x.estado !== "pagado").length]], accountSummary: resumenCuentasDesdeItems(data, cuentaResolver, r => montoCuenta(r, ["monto_pagado", "monto"]), "Gastos por banco/cuenta"), sections: sectionsPorCuenta(data, { title: "Gastos por cuenta", totalLabel: "Total", columns: ["Periodo", "Gasto", "Categoria", "Estado", "Monto"] }, cuentaResolver, (r, cuenta) => [r.periodo || r.fecha_pago || r.fecha || "-", r.costo_nombre || r.nombre || "-", r.categoria || "-", r.estado || "-", fmtCuentaMonto(montoCuenta(r, ["monto_pagado", "monto"]), cuenta)], r => montoCuenta(r, ["monto_pagado", "monto"])) };
      } else if (tipo === "proveedores") {
        const [proveedores, resumenProveedores] = await Promise.all([
          fetchJson("/admin/proveedores"),
          fetchJson("/admin/compras/resumen/por-proveedor", { anio: reportYear }),
        ]);
        const resumenMap = {};
        (resumenProveedores || []).forEach(r => {
          if (r.proveedor_id) resumenMap[r.proveedor_id] = r;
          if (r.proveedor_nombre) resumenMap[r.proveedor_nombre] = r;
        });
        const filasProveedor = (proveedores || []).map(p => {
          const cr = resumenMap[p.id] || resumenMap[p.nombre] || {};
          const totalPYG = Number(cr.total_comprado || 0);
          const totalUSD = Number(cr.total_comprado_usd || 0);
          const deudaPYG = Number(cr.deuda_actual || 0);
          const deudaUSD = Number(cr.deuda_actual_usd || 0);
          return {
            proveedor: p,
            compras: Number(cr.cantidad_compras || 0),
            totalPYG,
            totalUSD,
            deudaPYG,
            deudaUSD,
            pagadoPYG: Math.max(0, totalPYG - deudaPYG),
            pagadoUSD: Math.max(0, totalUSD - deudaUSD),
            ultima: cr.ultima_compra || "-",
          };
        }).sort((a, b) => (
          (b.deudaPYG + b.deudaUSD) - (a.deudaPYG + a.deudaUSD)
          || b.compras - a.compras
          || (a.proveedor.nombre || "").localeCompare(b.proveedor.nombre || "")
        ));
        const totalCompras = sectionTotal(filasProveedor, r => r.compras);
        const totalCompradoPYG = sectionTotal(filasProveedor, r => r.totalPYG);
        const totalCompradoUSD = sectionTotal(filasProveedor, r => r.totalUSD);
        const deudaPYG = sectionTotal(filasProveedor, r => r.deudaPYG);
        const deudaUSD = sectionTotal(filasProveedor, r => r.deudaUSD);
        const pagadoPYG = sectionTotal(filasProveedor, r => r.pagadoPYG);
        const pagadoUSD = sectionTotal(filasProveedor, r => r.pagadoUSD);
        report = {
          title: `Proveedores y deudas - ${reportYear}`,
          subtitle: periodoSub,
          summary: [["Proveedores", proveedores.length], ["Compras", totalCompras], ["Comprado Gs", fmtPYG(totalCompradoPYG)], ["Comprado USD", fmtUSD(totalCompradoUSD)], ["Deuda Gs", fmtPYG(deudaPYG)], ["Deuda USD", fmtUSD(deudaUSD)], ["Pagado Gs", fmtPYG(pagadoPYG)], ["Pagado USD", fmtUSD(pagadoUSD)]],
          sections: [
            {
              title: "Resumen por proveedor",
              totalLabel: "Deuda total",
              total: fmtMixto(deudaPYG, deudaUSD),
              columns: ["Proveedor", "Categoria", "Contacto", "Compras", "Total comprado", "Deuda actual", "Total pagado", "Ultima compra"],
              rows: filasProveedor.map(({ proveedor, compras, totalPYG, totalUSD, deudaPYG, deudaUSD, pagadoPYG, pagadoUSD, ultima }) => [
                proveedor.ruc ? `${proveedor.nombre}\nRUC: ${proveedor.ruc}` : proveedor.nombre,
                proveedor.categoria || "-",
                [proveedor.contacto, proveedor.telefono, proveedor.email].filter(Boolean).join(" / ") || "-",
                compras || "-",
                fmtMixto(totalPYG, totalUSD),
                deudaPYG > 0 || deudaUSD > 0 ? fmtMixto(deudaPYG, deudaUSD) : "Al dia",
                fmtMixto(pagadoPYG, pagadoUSD),
                ultima,
              ]),
            },
          ],
        };
      } else if (tipo === "iva") {
        const data = await fetchJson("/admin/balance/iva", { periodo: reportMonth });
        report = {
          title: `IVA fiscal - ${mesLabel(reportMonth)}`,
          subtitle: periodoSub,
          summary: [["Debito", fmtPYG(data.iva_debito)], ["Credito", fmtPYG(data.iva_credito)], ["Pagado", fmtPYG(data.pagos_iva_mes)], ["Saldo actual", fmtPYG(data.saldo_pendiente_acumulado)]],
          accountSummary: resumenCuentasDesdeItems(data.pagos_iva_detalle || [], cuentaResolver, r => montoCuenta(r, ["monto"]), "Pagos IVA por banco/cuenta"),
          sections: [
            { title: "Debito fiscal", columns: ["Factura", "Cliente", "Monto factura", "IVA"], rows: rowsOf(data.detalle_debito || [], [{value:"numero"}, {value:"razon_social"}, {value: r => fmtPYG(r.monto_factura)}, {value: r => fmtPYG(r.iva_pyg)}]) },
            { title: "Credito fiscal", columns: ["Factura", "Proveedor", "Monto compra", "IVA"], rows: rowsOf(data.detalle_credito || [], [{value:"factura_numero"}, {value:"proveedor_nombre"}, {value: r => fmtPYG(r.monto_compra)}, {value: r => fmtPYG(r.iva_pyg)}]) },
            ...sectionsPorCuenta(data.pagos_iva_detalle || [], { title: "Pagos IVA por cuenta", totalLabel: "Total pagado", columns: ["Fecha", "Periodo IVA", "Descripcion", "Monto"] }, cuentaResolver, (r, cuenta) => [r.fecha_pago || r.fecha || "-", r.periodo_iva || "-", r.descripcion || "-", fmtCuentaMonto(montoCuenta(r, ["monto"]), cuenta)], r => montoCuenta(r, ["monto"])),
            { title: "Historial anual", columns: ["Periodo", "Debito", "Credito", "Neto", "Pagado"], rows: rowsOf(data.historial_meses || [], [{value:"periodo"}, {value: r => fmtPYG(r.debito)}, {value: r => fmtPYG(r.credito)}, {value: r => fmtPYG(r.neto)}, {value: r => fmtPYG(r.pagos_iva)}]) },
          ],
        };
      } else if (tipo === "stock_historial") {
        const data = await fetchJson("/admin/stock-movimientos");
        report = { title: "Historial de stock", subtitle: periodoSub, summary: [["Movimientos", data.length], ["Entradas", data.filter(x => x.tipo === "entrada").length], ["Salidas", data.filter(x => x.tipo === "salida").length], ["Ajustes", data.filter(x => x.tipo === "ajuste").length]], sections: [{ title: "Movimientos", columns: ["Fecha", "Producto", "SKU", "Tipo", "Cantidad", "Stock", "Motivo", "Usuario"], rows: rowsOf(data, [{value:"fecha"}, {value:"producto_nombre"}, {value:"sku"}, {value:"tipo"}, {value:"cantidad"}, {value: r => `${r.stock_anterior ?? "-"} -> ${r.stock_nuevo ?? "-"}`}, {value:"motivo"}, {value:"usuario_nombre"}]) }] };
      } else if (tipo === "productos_stock") {
        const data = await fetchJson("/admin/productos");
        const valor = data.reduce((s, p) => s + Number(p.stock_actual || 0) * Number(p.precio_costo || 0), 0);
        report = {
          title: "Productos y stock",
          subtitle: periodoSub,
          summary: [["Productos", data.length], ["Activos", data.filter(x => x.activo !== false).length], ["Stock bajo", data.filter(x => Number(x.stock_actual || 0) <= Number(x.stock_minimo || 0)).length], ["Valor costo", fmtPYG(valor)]],
          sections: [{ title: "Inventario actual", columns: ["Producto", "SKU", "Categoria", "Stock", "Minimo", "Costo", "Precio venta"], rows: rowsOf(data, [{value:"nombre"}, {value:"sku"}, {value:"categoria"}, {value:"stock_actual"}, {value:"stock_minimo"}, {value: r => fmtPYG(r.precio_costo)}, {value: r => fmtPYG(r.precio_venta)}]) }],
        };
      }
      if (report) {
        report.periodLabel = ["balance_anual", "proveedores"].includes(tipo) ? reportYear : mesLabel(reportMonth);
      }
      setGenericReport(report);
    } catch (e) {
      toast.error(e.message || "Error al generar reporte");
    } finally {
      setGenericReportLoading(false);
    }
  };

  // ── CSV ──────────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!previewData) return;
    let csv = "Empresa,Categoria,Subtipo,Nombre,Descripcion,Ubicacion,IP Local,IPs Locales,IP Publica,IPs Publicas,Dominio,Puerto Local,Puerto Externo,Version,Estado,Observaciones";
    if (previewWithCreds) csv += ",Tipo Acceso,Usuario,Password,URL Acceso,Obs.";
    csv += "\n";
    previewData.forEach(row => {
      const base = `"${row.empresa}","${row.categoria}","${row.subtipo}","${row.nombre}","${row.descripcion}","${row.ubicacion}","${row.ip_local}","${(row.ips_locales||[]).join('; ')}","${row.ip_publica}","${(row.ips_publicas||[]).join('; ')}","${row.dominio}","${row.puerto_local}","${row.puerto_externo}","${row.version}","${row.estado}","${row.observaciones}"`;
      if (previewWithCreds && row.credenciales?.length > 0) {
        row.credenciales.forEach(c => { csv += `${base},"${c.tipo_acceso}","${c.usuario}","${c.password}","${c.url_acceso}","${c.observaciones}"\n`; });
      } else { csv += base + (previewWithCreds ? `,"","","","",""` : "") + "\n"; }
    });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `inventario_reporte.csv`; a.click();
    toast.success("CSV exportado");
  };

  // ── Excel — 4 hojas reales .xlsx con celdas estiladas (xlsx-js-style) ────────
  const exportExcel = async () => {
    if (!previewData) return;
    toast.info("Preparando Excel...", { id: "excel-loading" });
    let XLSX;
    try {
      XLSX = await loadXLSX();
      if (!XLSX?.utils) throw new Error("API inválida");
    } catch (err) {
      toast.dismiss("excel-loading");
      toast.error("No se pudo cargar la librería. Verificá tu conexión a internet.");
      console.error("SheetJS load error:", err);
      return;
    }
    toast.dismiss("excel-loading");

    // ── Helpers de estilo para xlsx-js-style ──────────────────────────────────
    const rgb = (hex) => hex.replace("#", "").toUpperCase();

    // Celda de cabecera: fondo sólido con el color de sección, texto blanco negrita
    const hCell = (v, bgHex) => ({
      v, t: "s",
      s: {
        fill: { patternType: "solid", fgColor: { rgb: rgb(bgHex) } },
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 9, name: "Arial" },
        border: {
          top:    { style: "thin", color: { rgb: "CCCCCC" } },
          bottom: { style: "thin", color: { rgb: "CCCCCC" } },
          left:   { style: "thin", color: { rgb: "CCCCCC" } },
          right:  { style: "thin", color: { rgb: "CCCCCC" } },
        },
        alignment: { horizontal: "left", vertical: "top", wrapText: false },
      }
    });

    // Celda de datos: filas alternadas (blanco / color suave de sección)
    const dCell = (v, even, altHex) => ({
      v: v ?? "", t: typeof (v ?? "") === "number" ? "n" : "s",
      s: {
        fill: even
          ? { patternType: "solid", fgColor: { rgb: "FFFFFF" } }
          : { patternType: "solid", fgColor: { rgb: rgb(altHex) } },
        font: { sz: 9, name: "Arial" },
        border: {
          top:    { style: "thin", color: { rgb: "D1D5DB" } },
          bottom: { style: "thin", color: { rgb: "D1D5DB" } },
          left:   { style: "thin", color: { rgb: "D1D5DB" } },
          right:  { style: "thin", color: { rgb: "D1D5DB" } },
        },
        alignment: { horizontal: "left", vertical: "top", wrapText: true },
      }
    });

    // Construye la hoja a partir de cabeceras + filas de datos ya estiladas
    const makeSheet = (headers, bgHex, dataRows, colWidths, altHex) => {
      const aoa = [
        headers.map(h => hCell(h, bgHex)),
        ...dataRows.map((row, ri) => row.map(v => dCell(v, ri % 2 === 0, altHex)))
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = colWidths.map(w => ({ wch: w }));
      ws["!tabColor"] = { rgb: rgb(bgHex) };
      ws["!views"] = [{ state: "frozen", ySplit: 1 }];
      return ws;
    };

    const wb = XLSX.utils.book_new();
    const fecha = new Date().toLocaleDateString("es-PY");

    // ── Hoja 1 · Inventario (sin Cuentas de Acceso — evita duplicados) ──────────
    XLSX.utils.book_append_sheet(wb,
      makeSheet(
        ["Nombre","Empresa","Categoría","Subtipo","Estado","IP Privada","IP Pública","Dominio","Ubicación","Marca/Modelo","Responsable","Observaciones"],
        COLORS.inv.bg,
        inventarioActivos.map(r => [
          r.nombre, r.empresa, r.categoria, r.subtipo, r.estado,
          [r.ip_local, ...(r.ips_locales||[])].filter(Boolean).join(", "),
          [r.ip_publica, ...(r.ips_publicas||[])].filter(Boolean).join(", "),
          r.dominio, r.ubicacion, r.version, r.responsable||"", r.observaciones||""
        ]),
        [24,18,14,14,10,20,20,20,14,14,14,26],
        COLORS.inv.rowAlt
      ),
      "Inventario"
    );

    // ── Hoja 2 · Credenciales (solo si se exportó con credenciales) ─────────────
    if (previewWithCreds) {
      const credRows = [];
      previewData.forEach(r => {
        (r.credenciales || []).forEach(c => {
          credRows.push([r.nombre, c.servicio||c.tipo_acceso||"", c.usuario||"", c.password||"", c.sensibilidad||"normal", c.observaciones||""]);
        });
      });
      if (credRows.length > 0) {
        XLSX.utils.book_append_sheet(wb,
          makeSheet(
            ["Activo","Servicio","Usuario","Contraseña","Sensibilidad","Notas"],
            COLORS.cred.bg,
            credRows,
            [26,18,18,18,12,30],
            COLORS.cred.rowAlt
          ),
          "Credenciales"
        );
      }
    }

    // ── Hoja 3 · Cuentas Asociadas a Dispositivos ────────────────────────────────
    if (cuentasAsociadas.length > 0) {
      XLSX.utils.book_append_sheet(wb,
        makeSheet(
          ["Dispositivo","Tipo Cuenta","Nombre","ID / Usuario","Contraseña","Detalles"],
          COLORS.ctas.bg,
          cuentasAsociadas.map(r => [r.dispositivo, r.tipo_cuenta, r.nombre, r.usuario||"", r.password||"", r.detalles||""]),
          [24,16,24,18,18,30],
          COLORS.ctas.rowAlt
        ),
        "Cuentas Asociadas"
      );
    }

    // ── Hoja 4 · Detalle de Cuentas de Acceso ────────────────────────────────────
    if (detalleCuentas.length > 0) {
      XLSX.utils.book_append_sheet(wb,
        makeSheet(
          ["Nombre","Subtipo","ID / Usuario","Correo / Servidor","Contraseña","Detalles","Dispositivos"],
          COLORS.det.bg,
          detalleCuentas.map(r => [r.nombre, r.subtipo, r.usuario||"", r.correo_servidor||"", r.password||"", r.detalles||"", `${r.dispositivos_count} disp.`]),
          [26,16,18,24,18,28,13],
          COLORS.det.rowAlt
        ),
        "Detalle Cuentas"
      );
    }

    try {
      XLSX.writeFile(wb, `inventario_${fecha.replace(/\//g,"-")}.xlsx`);
      toast.success("Excel exportado correctamente");
    } catch (e) {
      console.error("writeFile error:", e);
      toast.error("Error al generar el archivo Excel.");
    }
  };

  // ── Alert CRUD ───────────────────────────────────────────────────────────────
  const openNewAlert = () => {
    setEditingAlert(null);
    setAlertForm({ empresa_id: empresaFromUrl || "", tipo: "dominio", nombre: "", descripcion: "", fecha_vencimiento: "", activo_id: "", notificar_dias: 30 });
    setShowAlertForm(true);
  };
  const openEditAlert = (alerta) => {
    setEditingAlert(alerta);
    setAlertForm({ empresa_id: alerta.empresa_id, tipo: alerta.tipo, nombre: alerta.nombre, descripcion: alerta.descripcion || "", fecha_vencimiento: alerta.fecha_vencimiento?.split("T")[0] || "", activo_id: alerta.activo_id || "", notificar_dias: alerta.notificar_dias || 30 });
    setShowAlertForm(true);
  };
  const saveAlert = async () => {
    if (!alertForm.empresa_id || !alertForm.nombre || !alertForm.fecha_vencimiento) { toast.error("Campos requeridos"); return; }
    try {
      const url = editingAlert ? `${API}/admin/alertas/${editingAlert.id}` : `${API}/admin/alertas`;
      const res = await fetch(url, { method: editingAlert ? "PUT" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(alertForm) });
      if (res.ok) { toast.success(editingAlert ? "Actualizada" : "Creada"); setShowAlertForm(false); fetchAll(); }
    } catch { toast.error("Error"); }
  };
  const toggleAlertEstado = async (alerta) => {
    try { await fetch(`${API}/admin/alertas/${alerta.id}/estado`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ estado: alerta.estado === "activa" ? "resuelta" : "activa" }) }); fetchAll(); } catch {}
  };
  const deleteAlert = async (id) => {
    if (!window.confirm("¿Eliminar?")) return;
    try { await fetch(`${API}/admin/alertas/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); fetchAll(); } catch {}
  };

  useEffect(() => {
    if (handledNuevo || nuevoFromUrl !== "alerta") return;
    setTab("alertas");
    openNewAlert();
    setHandledNuevo(true);
  }, [nuevoFromUrl, handledNuevo]); // eslint-disable-line

  const empresaIdsVisibles = useMemo(() => new Set(empresas.map(e => e.id)), [empresas]);
  const perteneceAEmpresaActiva = (empresaId) => !activeEmpresaPropia?.slug || empresaIdsVisibles.has(empresaId);
  const alertasDeEmpresaActiva = useMemo(() => (
    alertas.filter(a => perteneceAEmpresaActiva(a.empresa_id))
  ), [alertas, empresaIdsVisibles, activeEmpresaPropia?.slug]); // eslint-disable-line
  const alertasProximasVisibles = useMemo(() => (
    alertasProximas.filter(a => perteneceAEmpresaActiva(a.empresa_id))
  ), [alertasProximas, empresaIdsVisibles, activeEmpresaPropia?.slug]); // eslint-disable-line
  const activosDeEmpresaActiva = useMemo(() => (
    activos.filter(a => perteneceAEmpresaActiva(a.empresa_id))
  ), [activos, empresaIdsVisibles, activeEmpresaPropia?.slug]); // eslint-disable-line
  const filteredAlertas = useMemo(() => alertasDeEmpresaActiva.filter(a => {
    const texto = [
      a.nombre, a.descripcion, a.tipo, a.estado, a.empresa_nombre, a.activo_nombre,
      a.fecha_vencimiento, String(a.notificar_dias || "")
    ].filter(Boolean).join(" ");
    return matchesChips(texto, alertSearchChips, alertSearch);
  }), [alertasDeEmpresaActiva, alertSearchChips, alertSearch]);

  const getDaysColor = (dias) => {
    if (dias < 0) return "text-red-400 bg-red-500/10 border-red-500/20";
    if (dias <= 7) return "text-orange-400 bg-orange-500/10 border-orange-500/20";
    if (dias <= 30) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  };

  const empresaName = empresaFromUrl ? empresas.find(e => e.id === empresaFromUrl)?.nombre : null;
  const now = new Date().toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
  const nowFull = new Date().toLocaleString("es-PY");
  const currentYear = new Date().getFullYear();
  const reportYears = Array.from({ length: 9 }, (_, i) => String(currentYear + 2 - i));
  const reportMonthIndex = Math.max(0, Math.min(11, Number(reportMonth.slice(5, 7)) - 1));
  const updateReportMonth = (next) => {
    setReportMonth(next);
    setReportYear(next.slice(0, 4));
  };

  useEffect(() => {
    if (tab === "alertas" && !hasPermission?.("alertas.ver")) {
      setTab("reportes");
    }
  }, [tab, activeEmpresaPropia?.id, user?.permisos]); // eslint-disable-line

  useEffect(() => {
    const financieroVisible = hasPermission?.("balance.ver") || hasPermission?.("facturas.ver") || hasPermission?.("ingresos_varios.ver") || hasPermission?.("recibos.ver") || hasPermission?.("notas_credito.ver") || hasPermission?.("presupuestos.ver") || hasPermission?.("compras.ver") || hasPermission?.("costos_fijos.ver") || hasPermission?.("proveedores.ver") || hasPermission?.("pagos_proveedores.ver") || hasPermission?.("empleados.ver");
    const visibles = [
      financieroVisible && "financiero",
      (hasModule?.("productos_stock") && (hasPermission?.("inventario_productos.ver") || hasPermission?.("historial_stock.ver"))) && "inventario",
      (hasModule?.("inventario_tecnico") && hasPermission?.("inventario.ver")) && "tecnico",
    ].filter(Boolean);
    if (visibles.length && !visibles.includes(reporteCategoria)) {
      setReporteCategoria(visibles[0]);
    }
  }, [reporteCategoria, activeEmpresaPropia?.id, user?.permisos]); // eslint-disable-line

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-arandu-blue animate-pulse">Cargando...</div></div>;

  const selectedEmpresasNombres = selectedEmpresas.map(id => empresas.find(e => e.id === id)?.nombre).filter(Boolean).join(", ");
  // Excluimos "Cuentas de Acceso" de la sección INVENTARIO para evitar duplicados
  // (esas cuentas ya aparecen en las secciones 3 y 4)
  const inventarioActivos = previewData ? previewData.filter(r => r.categoria !== "Cuentas de Acceso") : [];
  const activosConCreds = inventarioActivos.filter(r => r.credenciales?.length > 0);

  // Agrupación NVR/DVR para los modos "por_dispositivo" e "ip_agrupado"
  const inventarioGrouped = sortBy === "ip_agrupado" && inventarioActivos.length > 0
    ? (() => {
        // Cámaras con NVR/DVR asignado
        const camerasWithNvr = inventarioActivos.filter(a => a.nvr_dvr_id);
        const nvrIdsSet = new Set(camerasWithNvr.map(c => c.nvr_dvr_id));
        // NVR/DVR que tienen al menos una cámara asignada
        const nvrEntries = inventarioActivos.filter(a => nvrIdsSet.has(a.activo_id));
        const nvrActivoIds = new Set(nvrEntries.map(n => n.activo_id));
        // Activos sin agrupamiento: ni cámara con NVR, ni NVR con cámaras
        const standaloneItems = inventarioActivos.filter(a =>
          !a.nvr_dvr_id && !nvrActivoIds.has(a.activo_id)
        );
        const groups = nvrEntries.map(nvr => ({
          nvr,
          cameras: camerasWithNvr.filter(c => c.nvr_dvr_id === nvr.activo_id)
        }));
        return { groups, standaloneItems };
      })()
    : null;

  // Inline style for the section-title row inside <thead> — repeats automatically on every print page break
  const secTitleInThead = (color) => ({
    color, fontWeight: "bold", fontSize: "12px",
    paddingTop: "16px", paddingBottom: "3px", paddingLeft: "0", paddingRight: "0",
    borderTop: "none", borderLeft: "none", borderRight: "none",
    borderBottom: `2px solid ${color}`,
    textTransform: "uppercase", letterSpacing: "0.04em",
    backgroundColor: "#ffffff",
  });
  const reportLogoAlt = String(activeEmpresaPropia?.nombre || "Logo").replace(/"/g, "&quot;");
  const reportLogoHtml = activeEmpresaPropia?.logo_url
    ? `<div style="display:flex;align-items:center;gap:12px"><img src="${activeEmpresaPropia.logo_url}" alt="${reportLogoAlt}" style="height:54px;width:auto;max-width:190px;object-fit:contain"/><div style="font-size:11px;color:#64748b;letter-spacing:2px;text-transform:uppercase">INFORMÁTICA</div></div>`
    : svgDocumentHeaderLogoHtml(activeEmpresaPropia?.slug || "arandujar");

  return (
    <div className="p-4 md:p-8">

      {genericReport && (
        <div className="fixed inset-0 bg-black/85 z-50 overflow-y-auto">
          <div className="no-print sticky top-0 z-10 bg-arandu-dark/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-white font-heading font-bold">{genericReport.title}</h3>
              <p className="text-slate-400 text-xs">{genericReport.subtitle}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => printNode("generic-report-print", genericReport.title)} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Printer className="w-4 h-4 mr-2" /> Imprimir / Guardar PDF
              </Button>
              <Button onClick={() => setGenericReport(null)} className="bg-red-600 hover:bg-red-700 text-white">
                <X className="w-4 h-4 mr-2" /> Cerrar
              </Button>
            </div>
          </div>
          <div
            id="generic-report-print"
            className="modern-report"
            style={{
              maxWidth: "1220px",
              margin: "16px auto",
              background: "#fff",
              color: "#0f172a",
              padding: 0,
              fontFamily: "Arial, Helvetica, sans-serif",
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow: "0 24px 70px rgba(15,23,42,0.35)",
            }}
          >
            <style>{`
              #generic-report-print table { border-collapse: separate; border-spacing: 0; width: 100%; overflow: hidden; border-radius: 10px; }
              #generic-report-print th { background: #0f172a; color: #fff; font-size: 10px; padding: 9px 10px; text-align: left; border: 0; letter-spacing: .03em; text-transform: uppercase; }
              #generic-report-print td { font-size: 10.5px; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #334155; white-space: pre-line; }
              #generic-report-print tbody tr:nth-child(odd) td { background: #f8fafc; }
              #generic-report-print tbody tr:nth-child(even) td { background: #fff; }
              #generic-report-print tbody tr:last-child td { border-bottom: 0; }
              #generic-report-print .summary-card:nth-child(4n+1) { border-color: #14b8a6; }
              #generic-report-print .summary-card:nth-child(4n+2) { border-color: #38bdf8; }
              #generic-report-print .summary-card:nth-child(4n+3) { border-color: #f59e0b; }
              #generic-report-print .summary-card:nth-child(4n+4) { border-color: #a78bfa; }
              @media print {
                #generic-report-print { border-radius: 0 !important; box-shadow: none !important; }
                #generic-report-print .report-section { page-break-inside: avoid; break-inside: avoid; }
              }
            `}</style>
            <div style={{
              background: "linear-gradient(135deg, #0f172a 0%, #12364a 48%, #0f766e 100%)",
              color: "#fff",
              padding: "22px 26px",
              display: "flex",
              justifyContent: "space-between",
              gap: "20px",
              alignItems: "flex-start",
            }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ background: "#fff", borderRadius: 14, padding: "10px 14px", minWidth: 210 }} dangerouslySetInnerHTML={{ __html: reportLogoHtml }} />
                <div>
                  <div style={{ fontSize: 11, color: "#99f6e4", textTransform: "uppercase", letterSpacing: 2, marginBottom: 5 }}>Reporte administrativo</div>
                  <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.1, letterSpacing: 0 }}>{genericReport.title}</h1>
                  <p style={{ margin: "7px 0 0", color: "#cbd5e1", fontSize: 11 }}>{genericReport.subtitle}</p>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 10, color: "#dbeafe", minWidth: 150 }}>
                <div style={{ color: "#99f6e4", textTransform: "uppercase", letterSpacing: 1.4 }}>Periodo</div>
                <strong style={{ display: "block", fontSize: 15, marginTop: 4 }}>{genericReport.periodLabel || mesLabel(reportMonth) || reportYear}</strong>
                <div style={{ marginTop: 10 }}>Generado: {nowFull}</div>
              </div>
            </div>
            <div style={{ padding: "24px 26px 26px" }}>
              <div className="summary" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, margin: "0 0 18px" }}>
                {(genericReport.summary || []).map(([label, value], idx) => (
                  <div key={label} className="summary-card" style={{ border: "1px solid #14b8a6", borderLeftWidth: 5, borderRadius: 12, padding: "12px 13px", background: idx % 2 ? "#f8fafc" : "#ffffff" }}>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
                    <strong style={{ display: "block", marginTop: 5, fontSize: 19, color: "#0f172a", lineHeight: 1.15 }}>{value}</strong>
                  </div>
                ))}
              </div>
              {genericReport.accountSummary?.rows?.length > 0 && (
                <div style={{ margin: "0 0 20px", border: "1px solid #dbeafe", borderRadius: 14, overflow: "hidden", background: "#f8fafc" }}>
                  <div style={{ padding: "10px 13px", background: "#eff6ff", borderBottom: "1px solid #dbeafe", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ margin: 0, color: "#1e3a8a", fontSize: 13, letterSpacing: 0 }}>{genericReport.accountSummary.title || "Resumen por cuenta"}</h2>
                    <span style={{ color: "#64748b", fontSize: 10 }}>{genericReport.accountSummary.rows.length} cuenta(s)</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: 12 }}>
                    {genericReport.accountSummary.rows.map((row, idx) => (
                      <div key={`${row.label}-${idx}`} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 11, padding: "9px 10px" }}>
                        <p style={{ margin: 0, color: "#475569", fontSize: 10, lineHeight: 1.25 }}>{row.label}</p>
                        <strong style={{ display: "block", marginTop: 4, color: "#0f172a", fontSize: 16, lineHeight: 1.15 }}>{row.value}</strong>
                        {row.note && <span style={{ display: "block", marginTop: 3, color: "#94a3b8", fontSize: 9 }}>{row.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(genericReport.sections || []).map((section, sectionIdx) => {
                const showGroup = section.group && section.group !== genericReport.sections?.[sectionIdx - 1]?.group;
                const groupColor = section.group === "Ingresos" ? "#10b981" : "#ef4444";
                return (
                  <React.Fragment key={section.title}>
                    {showGroup && (
                      <div style={{ margin: sectionIdx === 0 ? "2px 0 12px" : "26px 0 12px", padding: "10px 14px", borderRadius: 12, background: section.group === "Ingresos" ? "#ecfdf5" : "#fef2f2", color: groupColor, border: `1px solid ${section.group === "Ingresos" ? "#a7f3d0" : "#fecaca"}`, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.4 }}>
                        {section.group}
                      </div>
                    )}
                    <section className="report-section" style={{ marginTop: sectionIdx === 0 || showGroup ? 0 : 22 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
                        <span style={{ display: "inline-block", width: 8, height: 22, borderRadius: 99, background: section.group === "Egresos" ? "#ef4444" : sectionIdx % 2 ? "#38bdf8" : "#14b8a6" }} />
                        <h2 style={{ margin: 0, fontSize: 15, color: "#0f172a", letterSpacing: 0 }}>{section.title}</h2>
                        <span style={{ color: "#94a3b8", fontSize: 10 }}>({(section.rows || []).length} registros)</span>
                        {section.total && (
                          <span style={{ marginLeft: "auto", background: section.group === "Egresos" ? "#fef2f2" : "#ecfdf5", color: section.group === "Egresos" ? "#b91c1c" : "#047857", border: `1px solid ${section.group === "Egresos" ? "#fecaca" : "#a7f3d0"}`, borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 700 }}>
                            {section.totalLabel || "Total"}: {section.total}
                          </span>
                        )}
                      </div>
                      <table>
                        <thead>
                          <tr>{section.columns.map(c => <th key={c}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {(section.rows || []).length === 0 ? (
                            <tr><td colSpan={section.columns.length} style={{ color: "#64748b", textAlign: "center", padding: 20 }}>Sin datos para este reporte</td></tr>
                          ) : section.rows.map((row, idx) => (
                            <tr key={idx}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  </React.Fragment>
                );
              })}
              <div style={{ marginTop: 22, paddingTop: 10, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: 9 }}>
                <span>{activeEmpresaPropia?.nombre || "Arandu&JAR Informática"}</span>
                <span>Documento generado desde el sistema administrativo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ PRINT PREVIEW ══════════════════ */}
      {showPreview && previewData && (
        <div id="report-modal-overlay" className="fixed inset-0 bg-black/90 z-50 overflow-y-auto">

          {/* Barra de acciones — se oculta al imprimir */}
          <div className="no-print sticky top-0 z-10 bg-arandu-dark/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-white font-heading font-bold">Vista Previa del Reporte</h3>
              <span className="text-slate-400 text-sm">{previewData.length} activos</span>
              {previewWithCreds && <span className="text-amber-400 text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Con Credenciales</span>}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="print-report-btn">
                <Printer className="w-4 h-4 mr-2" /> Imprimir / Guardar PDF
              </Button>
              <Button onClick={exportCSV} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                <Download className="w-4 h-4 mr-2" /> CSV
              </Button>
              <Button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Table className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button onClick={() => setShowPreview(false)} className="bg-red-600 hover:bg-red-700 text-white">
                <X className="w-4 h-4 mr-2" /> Cerrar
              </Button>
            </div>
          </div>

          {/* ── Contenido del reporte (todo inline styles para que imprima bien) ── */}
          <div
            id="inventario-print"
            style={{
              maxWidth: "1200px", margin: "16px auto",
              backgroundColor: "#fff", color: "#000",
              padding: "24px",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "10px", lineHeight: "1.4",
            }}
          >

            {/* ─ Encabezado ─ */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "2px solid #1e3a5f", paddingBottom: "10px", marginBottom: "14px" }}>
              <div
                style={{ minWidth: "190px", maxWidth: "260px" }}
                dangerouslySetInnerHTML={{ __html: reportLogoHtml }}
              />
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: "17px", fontWeight: "bold", color: "#111" }}>Informe de Inventario Tecnico</div>
              </div>
              <div style={{ textAlign: "right", fontSize: "9px", color: "#555", minWidth: "200px" }}>
                <div>Fecha de emisión: {now} | Total: {inventarioActivos.length} activos</div>
                {selectedEmpresasNombres && <div style={{ marginTop: "2px" }}>Filtros — <b>Cliente:</b> {selectedEmpresasNombres}</div>}
                {sortBy === "ip_agrupado" && <div style={{ marginTop: "2px", color: "#60a5fa" }}>Modo: NVR/DVR agrupado por IP</div>}
              </div>
            </div>

            {/* ─ 1. INVENTARIO ─ */}
            {(() => {
              const camColors = { bg: "#f0f9ff", border: "#bae6fd", rowAlt: "#e0f2fe" };
              const tblStyle = { width: "100%", borderCollapse: "collapse", marginBottom: "4px", tableLayout: "fixed" };
              const colgroup = (
                <colgroup>
                  <col style={{ width: "16%" }} /><col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} /><col style={{ width: "11%" }} />
                  <col style={{ width: "6%" }} /><col style={{ width: "12%" }} />
                  <col style={{ width: "9%" }} /><col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} /><col style={{ width: "9%" }} />
                  <col style={{ width: "4%" }} />
                </colgroup>
              );
              const colHeaders = (
                <tr>
                  {["Nombre","Empresa","Categoría","Subtipo","Estado","IP Privada","IP Pública","Dominio","Ubicación","Marca/Modelo","Resp."].map(h => (
                    <th key={h} style={thStyle(COLORS.inv)}>{h}</th>
                  ))}
                </tr>
              );
              const invRow = (row, idx, colors = COLORS.inv, firstExtra = {}) => {
                const e = idx % 2 === 0;
                return (
                  <tr key={idx}>
                    <td style={tdStyle(e, colors, { fontWeight: "500", ...firstExtra })}>{row.nombre}</td>
                    <td style={tdStyle(e, colors)}>{row.empresa}</td>
                    <td style={tdStyle(e, colors)}>{row.categoria}</td>
                    <td style={tdStyle(e, colors)}>{row.subtipo}</td>
                    <td style={tdStyle(e, colors)}>{row.estado}</td>
                    <td style={tdStyle(e, colors, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{[row.ip_local, ...(row.ips_locales||[])].filter(Boolean).join(", ")}</td>
                    <td style={tdStyle(e, colors, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{[row.ip_publica, ...(row.ips_publicas||[])].filter(Boolean).join(", ")}</td>
                    <td style={tdStyle(e, colors)}>{row.dominio}</td>
                    <td style={tdStyle(e, colors)}>{row.ubicacion}</td>
                    <td style={tdStyle(e, colors)}>{row.version}</td>
                    <td style={tdStyle(e, colors)}>{row.responsable || ""}</td>
                  </tr>
                );
              };

              if (inventarioGrouped) {
                return (
                  <>
                    {/* ── Tabla 1: NVR/DVR y Cámaras — thead con título repite en cada página ── */}
                    {inventarioGrouped.groups.length > 0 && (
                      <table style={tblStyle}>
                        {colgroup}
                        <thead>
                          <tr>
                            <td colSpan={11} style={secTitleInThead(COLORS.inv.title)}>
                              Inventario de Activos — NVR/DVR y Cámaras Asociadas
                            </td>
                          </tr>
                          {colHeaders}
                        </thead>
                        <tbody>
                          {inventarioGrouped.groups.map(({ nvr, cameras }, gi) => (
                            <React.Fragment key={nvr.activo_id || nvr.nombre}>
                              {gi > 0 && <tr><td colSpan={11} style={{ backgroundColor: "#e2e8f0", padding: "2px", border: "none" }} /></tr>}
                              {/* Fila NVR destacada */}
                              <tr>
                                <td colSpan={11} style={{ backgroundColor: "#1e3a5f", color: "#ffffff", fontWeight: "bold", fontSize: "9px", padding: "5px 7px", border: "1px solid #152b47" }}>
                                  ▶ {nvr.nombre}
                                  <span style={{ fontWeight: "normal", marginLeft: "8px", color: "#93c5fd" }}>{nvr.subtipo}</span>
                                  {[nvr.ip_local, ...(nvr.ips_locales||[])].filter(Boolean).length > 0 && (
                                    <span style={{ fontFamily: "monospace", marginLeft: "8px", color: "#67e8f9" }}>{[nvr.ip_local, ...(nvr.ips_locales||[])].filter(Boolean).join(", ")}</span>
                                  )}
                                  <span style={{ marginLeft: "8px", color: "#94a3b8", fontWeight: "normal" }}>• {nvr.empresa}</span>
                                  <span style={{ marginLeft: "8px", color: "#86efac", fontWeight: "normal" }}>{nvr.estado}</span>
                                  <span style={{ marginLeft: "8px", color: "#fde68a" }}>{cameras.length} cám.</span>
                                </td>
                              </tr>
                              {/* Fila de datos del NVR */}
                              {invRow(nvr, 0, COLORS.inv, { fontWeight: "600" })}
                              {/* Cámaras asociadas */}
                              {cameras.map((cam, ci) => {
                                const e = ci % 2 !== 0;
                                return (
                                  <tr key={`cam-${ci}`}>
                                    <td style={tdStyle(e, camColors, { fontWeight: "500", paddingLeft: "18px" })}>
                                      <span style={{ color: "#0369a1", marginRight: "4px" }}>↳</span>{cam.nombre}
                                    </td>
                                    <td style={tdStyle(e, camColors)}>{cam.empresa}</td>
                                    <td style={tdStyle(e, camColors)}>{cam.categoria}</td>
                                    <td style={tdStyle(e, camColors)}>{cam.subtipo}</td>
                                    <td style={tdStyle(e, camColors)}>{cam.estado}</td>
                                    <td style={tdStyle(e, camColors, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{[cam.ip_local, ...(cam.ips_locales||[])].filter(Boolean).join(", ")}</td>
                                    <td style={tdStyle(e, camColors, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{[cam.ip_publica, ...(cam.ips_publicas||[])].filter(Boolean).join(", ")}</td>
                                    <td style={tdStyle(e, camColors)}>{cam.dominio}</td>
                                    <td style={tdStyle(e, camColors)}>{cam.ubicacion}</td>
                                    <td style={tdStyle(e, camColors)}>{cam.version}</td>
                                    <td style={tdStyle(e, camColors)}>{cam.responsable || ""}</td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* ── Tabla 2: Otros Activos — thead con título repite en cada página ── */}
                    {inventarioGrouped.standaloneItems.length > 0 && (
                      <table style={{ ...tblStyle, marginTop: "10px" }}>
                        {colgroup}
                        <thead>
                          <tr>
                            <td colSpan={11} style={secTitleInThead(COLORS.inv.title)}>
                              Inventario de Activos — Otros Activos
                            </td>
                          </tr>
                          {colHeaders}
                        </thead>
                        <tbody>
                          {inventarioGrouped.standaloneItems.map((row, idx) => invRow(row, idx))}
                        </tbody>
                      </table>
                    )}
                  </>
                );
              }

              // Modo plano (sin agrupación)
              return (
                <table style={tblStyle}>
                  {colgroup}
                  <thead>
                    <tr>
                      <td colSpan={11} style={secTitleInThead(COLORS.inv.title)}>Inventario de Activos</td>
                    </tr>
                    {colHeaders}
                  </thead>
                  <tbody>
                    {inventarioActivos.map((row, idx) => invRow(row, idx))}
                  </tbody>
                </table>
              );
            })()}

            {/* ─ 2. CREDENCIALES ─ */}
            {previewWithCreds && activosConCreds.length > 0 && (
              <div className="section-page-break">
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "18%" }} /><col style={{ width: "15%" }} />
                    <col style={{ width: "16%" }} /><col style={{ width: "16%" }} />
                    <col style={{ width: "10%" }} /><col style={{ width: "25%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <td colSpan={6} style={secTitleInThead(COLORS.cred.title)}>Credenciales</td>
                    </tr>
                    <tr>
                      {["Activo","Servicio","Usuario","Contraseña","Sensibilidad","Notas"].map(h => (
                        <th key={h} style={thStyle(COLORS.cred)}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activosConCreds.map(row =>
                      (row.credenciales || []).map((c, ci) => {
                        const e = ci % 2 === 0;
                        return (
                          <tr key={`${row.nombre}-${ci}`}>
                            <td style={tdStyle(e, COLORS.cred, { fontWeight: "500" })}>{row.nombre}</td>
                            <td style={tdStyle(e, COLORS.cred)}>{c.servicio || c.tipo_acceso || ""}</td>
                            <td style={tdStyle(e, COLORS.cred, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{c.usuario}</td>
                            <td style={tdStyle(e, COLORS.cred, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{c.password}</td>
                            <td style={tdStyle(e, COLORS.cred)}>{c.sensibilidad || "normal"}</td>
                            <td style={tdStyle(e, COLORS.cred)}>{c.observaciones}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ─ 3. CUENTAS ASOCIADAS A DISPOSITIVOS ─ */}
            {cuentasAsociadas.length > 0 && (
              <div className="section-page-break">
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "18%" }} /><col style={{ width: "12%" }} />
                    <col style={{ width: "20%" }} /><col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} /><col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <td colSpan={6} style={secTitleInThead(COLORS.ctas.title)}>Cuentas Asociadas a Dispositivos</td>
                    </tr>
                    <tr>
                      {["Dispositivo","Tipo Cuenta","Nombre","ID / Usuario","Contraseña","Detalles"].map(h => (
                        <th key={h} style={thStyle(COLORS.ctas)}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasAsociadas.map((row, idx) => {
                      const e = idx % 2 === 0;
                      return (
                        <tr key={idx}>
                          <td style={tdStyle(e, COLORS.ctas, { fontWeight: "500" })}>{row.dispositivo}</td>
                          <td style={tdStyle(e, COLORS.ctas)}>{row.tipo_cuenta}</td>
                          <td style={tdStyle(e, COLORS.ctas)}>{row.nombre}</td>
                          <td style={tdStyle(e, COLORS.ctas, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{row.usuario}</td>
                          <td style={tdStyle(e, COLORS.ctas, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{row.password}</td>
                          <td style={tdStyle(e, COLORS.ctas)}>{row.detalles}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ─ 4. DETALLE DE CUENTAS DE ACCESO ─ */}
            {detalleCuentas.length > 0 && (
              <div className="section-page-break">
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "22%" }} /><col style={{ width: "12%" }} />
                    <col style={{ width: "14%" }} /><col style={{ width: "22%" }} />
                    <col style={{ width: "14%" }} /><col style={{ width: "16%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <td colSpan={6} style={secTitleInThead(COLORS.det.title)}>Detalle de Cuentas de Acceso</td>
                    </tr>
                    <tr>
                      {["Nombre","Subtipo","ID / Usuario","Correo / Servidor","Contraseña","Detalles"].map(h => (
                        <th key={h} style={thStyle(COLORS.det)}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detalleCuentas.map((row, idx) => {
                      const e = idx % 2 === 0;
                      return (
                        <tr key={idx}>
                          <td style={tdStyle(e, COLORS.det, { fontWeight: "500" })}>{row.nombre}</td>
                          <td style={tdStyle(e, COLORS.det)}>{row.subtipo}</td>
                          <td style={tdStyle(e, COLORS.det, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{row.usuario}</td>
                          <td style={tdStyle(e, COLORS.det)}>{row.correo_servidor}</td>
                          <td style={tdStyle(e, COLORS.det, { fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden" })}>{row.password}</td>
                          <td style={{ ...tdStyle(e, COLORS.det), fontWeight: "bold" }}>{row.dispositivos_count} disp.</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ─ Pie de página ─ */}
            <div style={{ borderTop: "2px solid #1e3a5f", marginTop: "20px", paddingTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#6b7280" }}>
              <span>Arandu&JAR Informatica - Inventario Tecnico{previewWithCreds ? " - CONFIDENCIAL" : ""}</span>
              <span>Generado: {nowFull}</span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ ENCABEZADO DE PÁGINA ══════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <Link to={empresaFromUrl ? "/admin/empresas" : "/admin"} className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2">
            <ArrowLeft className="w-4 h-4" /> {empresaFromUrl ? "Volver a Empresas" : "Volver al Dashboard"}
          </Link>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-white flex items-center gap-3" data-testid="reportes-title">
            <FileText className="w-8 h-8 text-amber-400" /> Reportes & Alertas
            {empresaName && <span className="text-arandu-blue text-lg font-normal">- {empresaName}</span>}
          </h1>
        </div>
      </div>

      {/* ══════════════════ BANNER ALERTAS PRÓXIMAS ══════════════════ */}
      {alertasProximasVisibles.length > 0 && (
        <div className="mb-6 bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <h3 className="text-red-400 font-semibold text-sm flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4" /> Alertas Proximas ({alertasProximasVisibles.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {alertasProximasVisibles.map(a => (
              <div key={a.id} className={`flex items-center justify-between p-2 rounded-lg border ${getDaysColor(a.dias_restantes)}`}>
                <div><p className="text-white text-sm font-medium">{a.nombre}</p><p className="text-slate-400 text-xs">{a.empresa_nombre}</p></div>
                <span className="text-xs font-bold">{a.dias_restantes < 0 ? `Vencido ${Math.abs(a.dias_restantes)}d` : `${a.dias_restantes}d`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════ TABS ══════════════════ */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("reportes")} className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${tab === "reportes" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-arandu-dark-lighter text-slate-400 border border-white/5"}`} data-testid="tab-reportes"><Download className="w-4 h-4" /> Reportes</button>
        {hasPermission?.("alertas.ver") && (
          <button onClick={() => setTab("alertas")} className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${tab === "alertas" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-arandu-dark-lighter text-slate-400 border border-white/5"}`} data-testid="tab-alertas">
            <Bell className="w-4 h-4" /> Alertas {alertasProximasVisibles.length > 0 && <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{alertasProximasVisibles.length}</span>}
          </button>
        )}
      </div>

      {/* ══════════════════ TAB: Reportes ══════════════════ */}
      {tab === "reportes" && (
        <div className="space-y-6">

          {/* ── Categorías de reportes ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: "financiero", visible: hasPermission?.("balance.ver") || hasPermission?.("facturas.ver") || hasPermission?.("ingresos_varios.ver") || hasPermission?.("recibos.ver") || hasPermission?.("notas_credito.ver") || hasPermission?.("presupuestos.ver") || hasPermission?.("compras.ver") || hasPermission?.("costos_fijos.ver") || hasPermission?.("proveedores.ver") || hasPermission?.("pagos_proveedores.ver") || hasPermission?.("empleados.ver"), label: "Financiero", icon: BarChart3, desc: "Balance, facturas, presupuestos e ingresos", activeClass: "bg-emerald-500/15 border-emerald-500/40", iconClass: "bg-emerald-500/20 text-emerald-300" },
              { id: "inventario", visible: hasModule?.("productos_stock") && (hasPermission?.("inventario_productos.ver") || hasPermission?.("historial_stock.ver")), label: "Inventario", icon: Package, desc: "Stock de productos y movimientos", activeClass: "bg-blue-500/15 border-blue-500/40", iconClass: "bg-blue-500/20 text-blue-300" },
              { id: "tecnico", visible: hasModule?.("inventario_tecnico") && hasPermission?.("inventario.ver"), label: "Inventario técnico", icon: Server, desc: "Activos técnicos, clientes y credenciales", activeClass: "bg-amber-500/15 border-amber-500/40", iconClass: "bg-amber-500/20 text-amber-300" },
            ].filter(cat => cat.visible).map(cat => {
              const Icon = cat.icon;
              const active = reporteCategoria === cat.id;
              return (
                <button key={cat.id} onClick={() => setReporteCategoria(cat.id)}
                  className={`text-left p-4 rounded-xl border transition-all ${active
                    ? cat.activeClass
                    : "bg-arandu-dark-light border-white/5 hover:border-white/20"}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? cat.iconClass : "bg-white/5 text-slate-400"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-white">{cat.label}</p>
                    </div>
                  </div>
                  <p className="text-slate-500 text-xs">{cat.desc}</p>
                </button>
              );
            })}
          </div>

          {/* ── Panel financiero ───────────────────────────────────────────── */}
          {reporteCategoria === "financiero" && (
            <div className="bg-arandu-dark-light border border-emerald-500/20 rounded-xl p-5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
                <h3 className="text-emerald-400 font-semibold text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Reportes financieros imprimibles
                </h3>
                <div className="flex flex-wrap items-center gap-2 lg:ml-auto bg-arandu-dark border border-white/10 rounded-xl p-2">
                  <span className="text-slate-400 text-sm px-1 flex items-center gap-2"><Calendar className="w-4 h-4" /> Periodo</span>
                  <button onClick={() => updateReportMonth(addMonths(reportMonth, -1))} className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center" title="Mes anterior">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <select
                    value={reportMonthIndex}
                    onChange={e => updateReportMonth(setMonthPart(reportMonth, Number(e.target.value)))}
                    className="bg-arandu-dark-lighter border border-white/10 text-white rounded-lg px-3 py-2 text-sm"
                  >
                    {MESES.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
                  </select>
                  <select
                    value={reportYear}
                    onChange={e => { setReportYear(e.target.value); setReportMonth(`${e.target.value}-${reportMonth.slice(5, 7)}`); }}
                    className="bg-arandu-dark-lighter border border-white/10 text-white rounded-lg px-3 py-2 text-sm"
                  >
                    {reportYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <button onClick={() => updateReportMonth(addMonths(reportMonth, 1))} className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center" title="Mes siguiente">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => updateReportMonth(mesActual())} className="px-3 h-9 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/25 text-sm">
                    Mes actual
                  </button>
                  <div className="h-7 w-px bg-white/10 mx-1" />
                  {[
                    { id: "PYG", label: "Guaranies" },
                    { id: "USD", label: "Dolares" },
                    { id: "AMBOS", label: "Ambos" },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setReportCurrency(opt.id)}
                      className={`px-3 h-9 rounded-lg border text-sm transition-colors ${reportCurrency === opt.id ? "bg-emerald-500 text-white border-emerald-400" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {[
                  { visible: hasPermission?.("balance.ver"), title: "Balance mensual", desc: `Resumen de ${mesLabel(reportMonth)} con ingresos, egresos y saldo`, tipo: "balance_mensual", color: "text-emerald-400", icon: TrendingUp },
                  { visible: hasPermission?.("balance.ver"), title: "Balance anual", desc: `Resumen por meses del año ${reportYear}`, tipo: "balance_anual", color: "text-lime-400", icon: BarChart3 },
                  { visible: hasPermission?.("balance.ver") || hasPermission?.("facturas.ver") || hasPermission?.("compras.ver") || hasPermission?.("costos_fijos.ver") || hasPermission?.("empleados.ver"), title: "Balance detallado", desc: "Facturas, compras, pagos proveedores, gastos y sueldos del mes", tipo: "balance_detallado", color: "text-teal-400", icon: FileText },
                  { visible: hasPermission?.("facturas.ver"), title: "Facturas", desc: "Facturas emitidas, cobradas y pendientes del periodo mensual", tipo: "facturas", color: "text-cyan-400", icon: Receipt },
                  { visible: hasPermission?.("ingresos_varios.ver"), title: "Ingresos varios", desc: "Ingresos directos del periodo, categorias y clientes", tipo: "ingresos", color: "text-green-400", icon: TrendingUp },
                  { visible: hasPermission?.("recibos.ver"), title: "Recibos", desc: "Cobros registrados contra facturas en el periodo", tipo: "recibos", color: "text-lime-400", icon: Receipt },
                  { visible: hasPermission?.("notas_credito.ver"), title: "Notas de credito", desc: "Notas de ventas y compras, con motivo y monto", tipo: "notas_credito", color: "text-rose-400", icon: AlertTriangle },
                  { visible: hasPermission?.("presupuestos.ver"), title: "Presupuestos", desc: "Presupuestos con estados, montos y facturación", tipo: "presupuestos", color: "text-blue-400", icon: ClipboardList },
                  { visible: hasPermission?.("compras.ver"), title: "Compras", desc: "Compras contado/crédito, facturas y estado de pago del mes", tipo: "compras", color: "text-orange-400", icon: TrendingDown },
                  { visible: hasPermission?.("costos_fijos.ver"), title: "Gastos", desc: "Pagos de gastos fijos del periodo", tipo: "gastos", color: "text-red-400", icon: Calendar },
                  { visible: hasPermission?.("proveedores.ver") || hasPermission?.("pagos_proveedores.ver"), title: "Proveedores y deudas", desc: `Proveedores, pagos y pendientes del año ${reportYear}`, tipo: "proveedores", color: "text-amber-400", icon: DollarSign },
                  { visible: hasPermission?.("balance.ver"), title: "IVA fiscal", desc: "Debito, credito, pagos y saldo actual acumulado", tipo: "iva", color: "text-purple-400", icon: Table },
                ].filter(r => r.visible).map(r => {
                  const RIcon = r.icon;
                  return (
                    <button key={r.title} onClick={() => generarReporte(r.tipo)} disabled={genericReportLoading}
                      className="flex items-start gap-3 p-4 bg-arandu-dark rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/10 transition-colors">
                        <RIcon className={`w-5 h-5 ${r.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm">{r.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{r.desc}</p>
                      </div>
                      <Printer className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors mt-0.5 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Panel inventario ───────────────────────────────────────────── */}
          {reporteCategoria === "inventario" && (
            <div className="bg-arandu-dark-light border border-blue-500/20 rounded-xl p-5">
              <h3 className="text-blue-400 font-semibold text-sm mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" /> Reportes de inventario de productos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { title: "Productos y stock", desc: "Estado actual del inventario, niveles de stock y valorización", tipo: "productos_stock", icon: Package, color: "text-blue-400" },
                  { title: "Historial de stock", desc: "Entradas, salidas, ajustes, stock anterior/nuevo y usuario", tipo: "stock_historial", icon: Table, color: "text-cyan-400" },
                ].map(r => {
                  const RIcon = r.icon;
                  return (
                    <button key={r.title} onClick={() => generarReporte(r.tipo)} disabled={genericReportLoading}
                      className="flex items-start gap-3 p-4 bg-arandu-dark rounded-xl border border-white/5 hover:border-blue-500/30 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/10 transition-colors">
                        <RIcon className={`w-5 h-5 ${r.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm">{r.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{r.desc}</p>
                      </div>
                      <Printer className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors mt-0.5 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Panel técnico (inventario activos) ────────────────────────── */}
          {reporteCategoria === "tecnico" && (
          <div className="bg-arandu-dark-light border border-white/5 rounded-xl p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-2 mb-4">
              <h3 className="text-white font-heading font-semibold">Seleccionar clientes</h3>
              <p className="text-slate-500 text-xs md:ml-auto">
                Mostrando clientes de {activeEmpresaPropia?.nombre || "la empresa activa"}. Sin seleccionar clientes genera el reporte completo de la empresa activa.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-4 max-h-64 overflow-y-auto">
              {empresas.map(emp => (
                <button key={emp.id} onClick={() => toggleEmpresa(emp.id)}
                  className={`flex items-center gap-2 p-3 rounded-lg text-left text-sm transition-all ${selectedEmpresas.includes(emp.id) ? "bg-amber-500/10 border border-amber-500/30 text-amber-400" : "bg-arandu-dark border border-white/5 text-slate-400 hover:border-white/20"}`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selectedEmpresas.includes(emp.id) ? "bg-amber-500 border-amber-500" : "border-slate-600"}`}>
                    {selectedEmpresas.includes(emp.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="truncate">{emp.nombre}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-white/10">
              <div>
                <label className="text-slate-500 text-xs mb-1 block">Ordenar por</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-arandu-dark border border-white/10 text-white rounded-lg px-3 py-2 text-sm">
                  <option value="nombre">Nombre</option>
                  <option value="fecha">Fecha</option>
                  <option value="ip">IP</option>
                  <option value="categoria">Categoria</option>
                  <option value="empresa">Cliente</option>
                  <option value="ip_agrupado">NVR/DVR agrupado (camaras por IP)</option>
                </select>
              </div>
              <div className="flex gap-2 ml-auto flex-wrap">
                <Button onClick={() => fetchReportData(false)} className="bg-cyan-600 hover:bg-cyan-700 text-white" data-testid="preview-no-cred">
                  <Eye className="w-4 h-4 mr-2" /> Inventario técnico
                </Button>
                {isAdmin && (
                  <Button onClick={() => fetchReportData(true)} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="preview-with-cred">
                    <Lock className="w-4 h-4 mr-2" /> Con credenciales
                  </Button>
                )}
              </div>
            </div>
          </div>
          )} {/* fin reporteCategoria === "tecnico" */}

        </div>
      )}

      {/* ══════════════════ TAB: Alertas ══════════════════ */}
      {tab === "alertas" && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 mb-4">
            <ChipSearch
              value={alertSearch}
              onChange={setAlertSearch}
              chips={alertSearchChips}
              onChipsChange={setAlertSearchChips}
              placeholder="Buscar por cliente, alerta, tipo, fecha, estado... (Enter para agregar filtro)"
            />
            <Button onClick={openNewAlert} className="bg-red-600 hover:bg-red-700 text-white lg:ml-auto" data-testid="new-alert-btn"><Plus className="w-4 h-4 mr-2" /> Nueva Alerta</Button>
          </div>
          {filteredAlertas.length === 0 ? (
            <div className="text-center py-12 bg-arandu-dark-light rounded-xl border border-white/5">
              <Bell className="w-12 h-12 text-slate-600 mx-auto mb-3" /><p className="text-slate-400">No hay alertas</p>
            </div>
          ) : filteredAlertas.map((alerta, idx) => {
            const isR = alerta.estado === "resuelta";
            const venc = alerta.fecha_vencimiento?.split("T")[0];
            const dias = alerta.dias_restantes ?? Math.floor((new Date(venc) - new Date()) / 86400000);
            return (
              <motion.div key={alerta.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`bg-arandu-dark-light border rounded-xl p-4 ${isR ? "border-white/5 opacity-60" : dias < 0 ? "border-red-500/30" : dias <= 30 ? "border-amber-500/20" : "border-white/5"}`} data-testid={`alert-item-${idx}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <button onClick={() => toggleAlertEstado(alerta)} className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${isR ? "bg-emerald-500 border-emerald-500" : "border-slate-500 hover:border-amber-400"}`}>
                      {isR && <Check className="w-4 h-4 text-white" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className={`font-semibold text-sm ${isR ? "text-slate-500 line-through" : "text-white"}`}>{alerta.nombre}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded border ${alerta.tipo === "dominio" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" : alerta.tipo === "nic" ? "text-purple-400 bg-purple-500/10 border-purple-500/20" : "text-slate-400 bg-slate-500/10 border-slate-500/20"}`}>{alerta.tipo}</span>
                        <span className="text-slate-500 text-xs">{alerta.empresa_nombre}</span>
                      </div>
                      {alerta.descripcion && <p className="text-slate-400 text-xs">{alerta.descripcion}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {venc}</span>
                        <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> {alerta.notificar_dias}d antes</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isR && <span className={`text-xs font-bold px-2 py-1 rounded border ${getDaysColor(dias)}`}>{dias < 0 ? "Vencido" : `${dias}d`}</span>}
                    <button onClick={() => openEditAlert(alerta)} className="p-1 text-slate-400 hover:text-amber-400"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteAlert(alerta.id)} className="p-1 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ══════════════════ MODAL: Alerta ══════════════════ */}
      <AnimatePresence>
        {showAlertForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowAlertForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-lg">
              <div className="border-b border-white/10 p-4 flex justify-between items-center">
                <h2 className="font-heading text-lg font-bold text-white">{editingAlert ? "Editar" : "Nueva"} Alerta</h2>
                <Button onClick={() => setShowAlertForm(false)} variant="ghost" className="text-slate-400"><X className="w-4 h-4" /></Button>
              </div>
              <div className="p-4 space-y-3">
                <div><label className="text-slate-400 text-xs mb-1 block">Cliente *</label>
                  <select value={alertForm.empresa_id} onChange={(e) => setAlertForm({...alertForm, empresa_id: e.target.value, activo_id: ""})} className="w-full bg-arandu-dark border border-white/10 text-white rounded-lg px-3 py-2 text-sm" data-testid="alert-empresa"><option value="">Seleccionar cliente...</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-slate-400 text-xs mb-1 block">Tipo</label>
                    <select value={alertForm.tipo} onChange={(e) => setAlertForm({...alertForm, tipo: e.target.value})} className="w-full bg-arandu-dark border border-white/10 text-white rounded-lg px-3 py-2 text-sm" data-testid="alert-tipo"><option value="dominio">Dominio</option><option value="nic">NIC</option><option value="licencia">Licencia</option><option value="personalizado">Personalizado</option></select></div>
                  <div><label className="text-slate-400 text-xs mb-1 block">Notificar dias antes</label><Input type="number" value={alertForm.notificar_dias} onChange={(e) => setAlertForm({...alertForm, notificar_dias: parseInt(e.target.value) || 30})} className="bg-arandu-dark border-white/10 text-white" /></div>
                </div>
                <div><label className="text-slate-400 text-xs mb-1 block">Nombre *</label><Input value={alertForm.nombre} onChange={(e) => setAlertForm({...alertForm, nombre: e.target.value})} className="bg-arandu-dark border-white/10 text-white" placeholder="Dominio empresa.com.py" data-testid="alert-nombre" /></div>
                <div><label className="text-slate-400 text-xs mb-1 block">Vencimiento *</label><Input type="date" value={alertForm.fecha_vencimiento} onChange={(e) => setAlertForm({...alertForm, fecha_vencimiento: e.target.value})} className="bg-arandu-dark border-white/10 text-white" data-testid="alert-fecha" /></div>
                <div><label className="text-slate-400 text-xs mb-1 block">Activo (opcional)</label>
                  <select value={alertForm.activo_id} onChange={(e) => setAlertForm({...alertForm, activo_id: e.target.value})} className="w-full bg-arandu-dark border border-white/10 text-white rounded-lg px-3 py-2 text-sm"><option value="">Ninguno</option>{activosDeEmpresaActiva.filter(a => !alertForm.empresa_id || a.empresa_id === alertForm.empresa_id).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
                <div><label className="text-slate-400 text-xs mb-1 block">Descripcion</label><textarea value={alertForm.descripcion} onChange={(e) => setAlertForm({...alertForm, descripcion: e.target.value})} className="w-full bg-arandu-dark border border-white/10 text-white rounded-lg px-3 py-2 text-sm min-h-[50px]" /></div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button onClick={() => setShowAlertForm(false)} variant="ghost" className="text-slate-400">Cancelar</Button>
                  <Button onClick={saveAlert} className="bg-red-600 hover:bg-red-700 text-white" data-testid="save-alert-btn"><Save className="w-4 h-4 mr-2" /> Guardar</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReportesPage;
