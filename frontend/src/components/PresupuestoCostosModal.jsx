import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Wallet, X, Plus, Trash2, Save, CheckCircle, Building2
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";

const PresupuestoCostosModal = ({
  presupuesto,
  onClose,
  onSaved,
  token,
  API,
  proveedores
}) => {
  const [costosData, setCostosData] = useState(null);
  const [provMonedaDisplay, setProvMonedaDisplay] = useState({});
  const [savingCostos, setSavingCostos] = useState(false);

  useEffect(() => {
    openCostos();
  }, [presupuesto]); // eslint-disable-line

  const openCostos = async () => {
    try {
      const res = await fetch(`${API}/admin/presupuestos/${presupuesto.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const full = await res.json();
        setProvMonedaDisplay({});
        if (full.costos_reales) {
          const itemsNorm = full.costos_reales.items.map(i => ({
            ...i,
            moneda_item: i.moneda_item || full.moneda,
            tipo_cambio_item: i.tipo_cambio_item || null,
            moneda_costo: i.moneda_costo || i.moneda_item || full.moneda,
            tipo_cambio_costo: i.tipo_cambio_costo || i.tipo_cambio_item || null
          }));
          setCostosData({ ...full.costos_reales, items: itemsNorm });
        } else {
          const docMoneda = full.moneda || "PYG";
          const docTC = full.tipo_cambio;
          const items = full.items.map(item => {
            const mItem = item.moneda_item || docMoneda;
            const tcItem = item.tipo_cambio_item || null;
            return {
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              costo_estimado: item.costo,
              costo_real: item.costo,
              observacion: item.observacion || "",
              observacion_oculta: item.observacion_oculta || "",
              proveedor: "",
              es_nuevo: false,
              moneda_item: mItem,
              tipo_cambio_item: tcItem,
              moneda_costo: mItem,
              tipo_cambio_costo: tcItem
            };
          });
          const total_costos = items.reduce((sum, i) => {
            const mOrig = i.moneda_costo || docMoneda;
            let realConv = parseFloat(i.costo_real) || 0;
            if (mOrig !== docMoneda) {
              const tc = parseFloat(i.tipo_cambio_costo) || parseFloat(docTC) || 1;
              realConv = docMoneda === "PYG" ? realConv * tc : (tc > 0 ? realConv / tc : 0);
            }
            return sum + realConv * i.cantidad;
          }, 0);
          setCostosData({
            items,
            total_costos: Math.round(total_costos),
            total_facturado: full.total,
            ganancia: full.total - Math.round(total_costos),
            proveedores_pagos: []
          });
        }
      }
    } catch (err) {
      toast.error("Error al cargar costos");
    }
  };

  const formatNumber = (num, moneda = "PYG") => {
    if (moneda === "USD") {
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    }
    return new Intl.NumberFormat('es-PY').format(num);
  };

  const getCurrencySymbol = (moneda) => {
    return moneda === "USD" ? "US$" : "₲";
  };

  const fmtMonto = (monto, moneda = "PYG") => {
    if (monto == null) return "-";
    if (moneda === "PYG") return `₲ ${Math.round(monto).toLocaleString("es-PY")}`;
    return `${moneda} ${Number(monto).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const convertToDocMoneda = (amount, monedaOrigen, tcOverride, docMoneda, docTC) => {
    const mOrig = monedaOrigen || docMoneda;
    if (mOrig === docMoneda) return amount;
    const tc = parseFloat(tcOverride) || parseFloat(docTC) || 1;
    if (docMoneda === "PYG" && mOrig === "USD") return amount * tc;
    if (docMoneda === "USD" && mOrig === "PYG") return tc > 0 ? amount / tc : 0;
    return amount;
  };

  const recalcCostos = (items, proveedoresPagos) => {
    const docMoneda = presupuesto?.moneda || "PYG";
    const docTC = presupuesto?.tipo_cambio;
    const isUSD = docMoneda === "USD";

    const total_costos = items.reduce((sum, i) => {
      const realConv = convertToDocMoneda(
        parseFloat(i.costo_real) || 0,
        i.moneda_costo || docMoneda,
        i.tipo_cambio_costo,
        docMoneda, docTC
      ) * (parseFloat(i.cantidad) || 1);
      return sum + (isUSD ? Math.round(realConv * 100) / 100 : Math.round(realConv));
    }, 0);

    const total_facturado = costosData?.total_facturado || presupuesto?.total || 0;
    const ganancia = isUSD
      ? Math.round((total_facturado - total_costos) * 100) / 100
      : Math.round(total_facturado - total_costos);

    const provTotals = {};
    items.forEach(i => {
      const prov = i.proveedor || "Gastos Comunes";
      const monto = convertToDocMoneda(
        (parseFloat(i.costo_real) || 0) * (parseFloat(i.cantidad) || 1),
        i.moneda_costo || docMoneda,
        i.tipo_cambio_costo,
        docMoneda, docTC
      );
      provTotals[prov] = (provTotals[prov] || 0) + monto;
    });

    const updatedPagos = Object.entries(provTotals).map(([prov, total]) => {
      const existing = (proveedoresPagos || []).find(p => p.proveedor === prov);
      return {
        proveedor: prov,
        monto_total: isUSD ? Math.round(total * 100) / 100 : Math.round(total),
        pagado: existing?.pagado || false,
        fecha_pago: existing?.fecha_pago || null
      };
    });

    setCostosData(prev => ({
      ...prev,
      items,
      total_costos,
      ganancia,
      proveedores_pagos: updatedPagos
    }));
  };

  const updateCostoReal = (index, field, value) => {
    const newItems = [...costosData.items];
    // Permitir string vacío temporalmente para que el usuario pueda borrar y escribir sin que el campo salte a 0
    newItems[index] = { ...newItems[index], [field]: value };
    recalcCostos(newItems, costosData.proveedores_pagos);
  };

  const addCostoItem = () => {
    const docMoneda = presupuesto?.moneda || "PYG";
    const newItems = [...costosData.items, {
      descripcion: "",
      cantidad: 1,
      costo_estimado: 0,
      costo_real: 0,
      observacion: "",
      observacion_oculta: "",
      proveedor: "",
      es_nuevo: true,
      moneda_item: docMoneda,
      tipo_cambio_item: null,
      moneda_costo: docMoneda,
      tipo_cambio_costo: null
    }];
    recalcCostos(newItems, costosData.proveedores_pagos);
  };

  const removeCostoItem = (index) => {
    if (costosData.items.length <= 1) return;
    const newItems = costosData.items.filter((_, i) => i !== index);
    recalcCostos(newItems, costosData.proveedores_pagos);
  };

  const toggleProveedorPagado = (provName) => {
    const updatedPagos = (costosData.proveedores_pagos || []).map(p => {
      if (p.proveedor === provName) {
        return {
          ...p,
          pagado: !p.pagado,
          fecha_pago: !p.pagado ? new Date().toISOString().split('T')[0] : null
        };
      }
      return p;
    });
    setCostosData(prev => ({ ...prev, proveedores_pagos: updatedPagos }));
  };

  const saveCostos = async () => {
    if (!presupuesto) return;
    setSavingCostos(true);
    try {
      const res = await fetch(`${API}/admin/presupuestos/${presupuesto.id}/costos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(costosData)
      });
      if (res.ok) {
        toast.success("Costos guardados correctamente");
        onSaved();
      } else {
        toast.error("Error al guardar costos");
      }
    } catch (err) {
      toast.error("Error de conexión");
    } finally {
      setSavingCostos(false);
    }
  };

  if (!costosData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-5xl p-8 text-center"
        >
          <div className="text-arandu-blue animate-pulse">Cargando costos...</div>
        </motion.div>
      </motion.div>
    );
  }

  const docMoneda = presupuesto.moneda;
  const docTC = presupuesto.tipo_cambio;
  const isDocUSD = docMoneda === "USD";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-arandu-dark-light border border-white/10 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-arandu-dark-light/95 backdrop-blur-sm border-b border-white/10 p-4 flex justify-between items-center">
          <div>
            <h2 className="font-heading text-lg font-bold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-cyan-400" />
              Costos Reales - {presupuesto.numero}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-slate-400 text-sm">{presupuesto.empresa_nombre}</p>
              {presupuesto.tipo_cambio && (
                <span className="text-xs bg-blue-500/15 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full">
                  TC referencia: {presupuesto.moneda === "PYG" ? `USD 1 = ₲ ${Number(presupuesto.tipo_cambio).toLocaleString()}` : `₲ ${Number(presupuesto.tipo_cambio).toLocaleString()} = USD 1`}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveCostos} disabled={savingCostos} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              <Save className="w-4 h-4 mr-2" />
              {savingCostos ? "Guardando..." : "Guardar"}
            </Button>
            <Button onMouseDown={(e) => e.target === e.currentTarget && onClose()} className="bg-red-600 hover:bg-red-700 text-white">
              <X className="w-4 h-4 mr-2" />
              Cerrar
            </Button>
          </div>
        </div>

        {/* Profit Summary */}
        <div className="p-4 grid grid-cols-3 gap-4">
          <div className="bg-arandu-blue/10 border border-arandu-blue/20 rounded-lg p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">Total Facturado</p>
            <p className="text-xl font-heading font-bold text-arandu-blue">
              {formatNumber(costosData.total_facturado, docMoneda)} {getCurrencySymbol(docMoneda)}
            </p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">Total Costos</p>
            <p className="text-xl font-heading font-bold text-orange-400">
              {formatNumber(costosData.total_costos, docMoneda)} {getCurrencySymbol(docMoneda)}
            </p>
          </div>
          <div className={`${costosData.ganancia >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"} border rounded-lg p-4 text-center`}>
            <p className="text-slate-400 text-xs mb-1">Ganancia</p>
            <p className={`text-xl font-heading font-bold ${costosData.ganancia >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatNumber(costosData.ganancia, docMoneda)} {getCurrencySymbol(docMoneda)}
            </p>
            {costosData.total_facturado > 0 && (
              <p className={`text-xs ${costosData.ganancia >= 0 ? "text-emerald-500/70" : "text-red-500/70"}`}>
                {(costosData.ganancia / costosData.total_facturado * 100).toFixed(1)}% margen
              </p>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="px-4 pb-2">
          <table className="w-full">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-white/10">
                <th className="text-left p-2">Descripcion</th>
                <th className="text-left p-2 w-36">Proveedor</th>
                <th className="text-center p-2 w-20">Cant.</th>
                <th className="text-right p-2 w-32">
                  C. Estimado
                  <span className="block text-slate-400 font-normal">(moneda original)</span>
                </th>
                <th className="text-right p-2 w-36">
                  C. Real
                  <span className="block text-slate-400 font-normal">moneda + TC</span>
                </th>
                <th className="text-right p-2 w-32">
                  Diferencia
                  <span className="block text-slate-400 font-normal">{docMoneda === "PYG" ? "₲" : "USD"}</span>
                </th>
                <th className="w-10 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {costosData.items.map((item, idx) => {
                const mEst = item.moneda_item || docMoneda;
                const estDifiere = mEst !== docMoneda;
                const estConv = estDifiere
                  ? convertToDocMoneda(item.costo_estimado || 0, mEst, item.tipo_cambio_item, docMoneda, docTC)
                  : (item.costo_estimado || 0);

                const mReal = item.moneda_costo || docMoneda;
                const realDifiere = mReal !== docMoneda;
                const realConv = convertToDocMoneda(
                  parseFloat(item.costo_real) || 0, mReal, item.tipo_cambio_costo, docMoneda, docTC
                );

                const cantidad = parseFloat(item.cantidad) || 1;
                const diffConv = (estConv - realConv) * cantidad;
                const diffRounded = isDocUSD ? Math.round(diffConv * 100) / 100 : Math.round(diffConv);

                return (
                  <tr key={idx} className="border-b border-white/5 group">
                    <td className="p-2">
                      {item.es_nuevo ? (
                        <Input
                          type="text"
                          value={item.descripcion}
                          onChange={(e) => updateCostoReal(idx, "descripcion", e.target.value)}
                          className="bg-arandu-dark border-white/10 text-white text-sm w-full"
                          placeholder="Descripcion del gasto..."
                        />
                      ) : (
                        <div>
                          <p className="text-white text-sm">{item.descripcion}</p>
                          {item.observacion && <p className="text-yellow-500/60 text-xs italic">{item.observacion}</p>}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <select
                        value={item.proveedor || ""}
                        onChange={(e) => updateCostoReal(idx, "proveedor", e.target.value)}
                        className="bg-arandu-dark border border-white/10 rounded text-white text-sm w-full px-2 py-1.5 focus:outline-none focus:border-arandu-blue"
                      >
                        <option value="">Gastos Comunes</option>
                        {proveedores
                          .filter(p => p.activo !== false && (!p.logo_tipo || p.logo_tipo === presupuesto?.logo_tipo))
                          .map(p => (
                            <option key={p.id} value={p.nombre}>{p.nombre}</option>
                          ))}
                      </select>
                      {proveedores.filter(p => p.activo !== false && (!p.logo_tipo || p.logo_tipo === presupuesto?.logo_tipo)).length === 0 && (
                        <p className="text-slate-500 text-xs mt-1">Sin proveedores — agregá en el módulo Proveedores</p>
                      )}
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => updateCostoReal(idx, "cantidad", e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="bg-arandu-dark border-white/10 text-white text-sm text-center w-full"
                        min="0"
                        step="1"
                      />
                    </td>

                    <td className="p-2 text-right">
                      {item.es_nuevo ? (
                        <span className="text-slate-600 text-sm">-</span>
                      ) : (
                        <div>
                          <span className={`text-sm ${estDifiere ? "text-blue-300" : "text-slate-400"}`}>
                            {formatNumber(item.costo_estimado || 0, mEst)} {mEst === "PYG" ? "₲" : "$"}
                          </span>
                          {estDifiere && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              ≈ {formatNumber(estConv, docMoneda)} {docMoneda === "PYG" ? "₲" : "$"}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="p-2">
                      <div className="flex gap-1 mb-1 justify-end">
                        {["PYG", "USD"].map(m => {
                          const isActive = (item.moneda_costo || docMoneda) === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                const newItems = [...costosData.items];
                                newItems[idx] = { ...newItems[idx], moneda_costo: m === docMoneda ? docMoneda : m };
                                recalcCostos(newItems, costosData.proveedores_pagos);
                              }}
                              className={`px-1.5 py-0.5 rounded text-xs font-semibold border transition-all ${
                                isActive
                                  ? m === "PYG" ? "bg-green-500/25 text-green-300 border-green-500/50"
                                              : "bg-blue-500/25 text-blue-300 border-blue-500/50"
                                  : "bg-white/5 text-slate-500 border-white/10 hover:border-white/30"
                              }`}
                            >
                              {m === "PYG" ? "₲" : "$"}
                            </button>
                          );
                        })}
                      </div>
                      <Input
                        type="number"
                        step={isDocUSD ? "0.01" : "1"}
                        value={item.costo_real}
                        onChange={(e) => updateCostoReal(idx, "costo_real", e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="bg-arandu-dark border-white/10 text-white text-sm text-right w-full"
                      />
                      {realDifiere && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-slate-500 whitespace-nowrap">TC:</span>
                          <Input
                            type="number"
                            value={item.tipo_cambio_costo || ""}
                            onChange={(e) => {
                              const newItems = [...costosData.items];
                              newItems[idx] = { ...newItems[idx], tipo_cambio_costo: e.target.value };
                              recalcCostos(newItems, costosData.proveedores_pagos);
                            }}
                            className="bg-arandu-dark border-white/5 text-slate-400 text-xs text-right w-full"
                            placeholder={docTC ? String(docTC) : "global"}
                          />
                        </div>
                      )}
                      {realDifiere && (
                        <div className="text-xs text-slate-500 mt-0.5 text-right">
                          ≈ {formatNumber(realConv, docMoneda)} {docMoneda === "PYG" ? "₲" : "$"}
                        </div>
                      )}
                    </td>

                    <td className={`p-2 text-right text-sm font-medium ${item.es_nuevo ? "text-orange-400" : diffRounded >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {item.es_nuevo
                        ? (realConv > 0
                          ? <span title="Costo nuevo sin estimado">{formatNumber(isDocUSD ? Math.round(-realConv * cantidad * 100)/100 : Math.round(-realConv * cantidad), docMoneda)}</span>
                          : <span className="text-slate-600">—</span>)
                        : `${diffRounded >= 0 ? "+" : ""}${formatNumber(diffRounded, docMoneda)}`
                      }
                    </td>

                    <td className="p-2">
                      <button
                        onClick={() => removeCostoItem(idx)}
                        className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Add Item Button */}
          <div className="border-t border-white/10 pt-3 mt-1">
            <Button
              type="button"
              onClick={addCostoItem}
              variant="ghost"
              className="text-cyan-400 hover:bg-cyan-500/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Gasto (viatico, hotel, comida, etc.)
            </Button>
          </div>
        </div>

        {/* Proveedor Payment Summary */}
        {costosData.proveedores_pagos && costosData.proveedores_pagos.length > 0 && (
          <div className="px-4 pb-4">
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-white font-heading font-semibold text-sm mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-400" />
                Resumen por Proveedor
              </h3>
              <div className="space-y-2">
                {costosData.proveedores_pagos.map((prov, idx) => {
                  const altMoneda = docMoneda === "PYG" ? "USD" : "PYG";
                  const displayMoneda = provMonedaDisplay[prov.proveedor] || docMoneda;

                  const provItems = costosData.items.filter(
                    i => (i.proveedor || "Gastos Comunes") === prov.proveedor
                  );
                  const montoAlt = provItems.reduce((sum, i) => {
                    const alt = convertToDocMoneda(
                      (parseFloat(i.costo_real) || 0) * (parseFloat(i.cantidad) || 1),
                      i.moneda_costo || docMoneda,
                      i.tipo_cambio_costo,
                      altMoneda, docTC
                    );
                    return sum + alt;
                  }, 0);
                  const montoAltRounded = altMoneda === "USD"
                    ? Math.round(montoAlt * 100) / 100
                    : Math.round(montoAlt);

                  const montoMostrado = displayMoneda === docMoneda ? prov.monto_total : montoAltRounded;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        prov.pagado
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : "bg-orange-500/5 border-orange-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleProveedorPagado(prov.proveedor)}
                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                            prov.pagado
                              ? "bg-emerald-500 border-emerald-500"
                              : "border-slate-500 hover:border-orange-400"
                          }`}
                        >
                          {prov.pagado && <CheckCircle className="w-4 h-4 text-white" />}
                        </button>
                        <div>
                          <p className={`font-medium text-sm ${prov.pagado ? "text-emerald-400" : "text-orange-400"}`}>
                            {prov.proveedor}
                          </p>
                          {prov.pagado && prov.fecha_pago && (
                            <p className="text-emerald-500/60 text-xs">Pagado: {prov.fecha_pago}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Toggle de moneda para este proveedor */}
                        <div className="flex gap-1">
                          {[docMoneda, altMoneda].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setProvMonedaDisplay(prev => ({ ...prev, [prov.proveedor]: m }))}
                              className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                                displayMoneda === m
                                  ? m === "PYG"
                                    ? "bg-green-500/25 text-green-300 border-green-500/50"
                                    : "bg-blue-500/25 text-blue-300 border-blue-500/50"
                                  : "bg-white/5 text-slate-500 border-white/10 hover:border-white/30"
                              }`}
                            >
                              {m === "PYG" ? "₲" : "$"}
                            </button>
                          ))}
                        </div>

                        <div className="text-right min-w-[110px]">
                          <p className={`font-heading font-bold ${prov.pagado ? "text-emerald-400" : "text-orange-400"}`}>
                            {formatNumber(montoMostrado, displayMoneda)} {getCurrencySymbol(displayMoneda)}
                          </p>
                          <p className={`text-xs ${prov.pagado ? "text-emerald-500/60" : "text-orange-500/60"}`}>
                            {prov.pagado ? "Pagado" : "Pendiente"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default PresupuestoCostosModal;
