import React, { useState, useEffect, useMemo, useCallback } from "react";
import { X, Save, Plus, Trash2, FileText, Package, Shield, AlertTriangle, Settings, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

const FacturaFormModal = ({
  factura,           // null = nueva, objeto = editar
  sinFactura = false, // true = modo boleta (venta sin comprobante fiscal)
  onClose,
  onSaved,
  token,
  API,
  empresas,          // lista de clientes/empresas
  presupuestosDisp,  // todos los presupuestos disponibles
  activeEmpresaPropia,
  hasPermission,
  productos = [],
  productosHabilitados = false,
  cuentasDisp = [],  // cuentas bancarias disponibles
}) => {
  const isEdit = !!factura;
  // En modo edición, respetar sin_factura del registro; en modo nuevo, usar la prop
  const esBoleta = isEdit ? !!factura?.sin_factura : sinFactura;

  const canModoLibre = hasPermission?.("facturas.modo_libre");
  const canCambiarAfectaStock = hasPermission?.("facturas.afectar_stock");
  const defaultModo = productosHabilitados ? (canModoLibre ? "libre" : "productos") : "libre";

  const defaultConcepto = () => ({ descripcion: "", cantidad: 1, precio_unitario: 0, subtotal: 0, producto_id: "", iva_tipo: "10" });

  const logoTipo = activeEmpresaPropia?.slug || "arandujar";

  const getDefaultForm = () => ({
    numero: "",
    fecha: new Date().toISOString().slice(0, 10),
    forma_pago: "contado",
    razon_social: "",
    ruc: "",
    moneda: "PYG",
    tipo_cambio: "",
    estado: "pendiente",
    fecha_vencimiento: "",
    fecha_pago: "",
    cuenta_id: "",
    cuenta_nombre: "",
    presupuesto_ids: [],
    notas: "",
    modo: defaultModo,
    afecta_stock: !!productosHabilitados,
    conceptos: [defaultConcepto()],
    // timbrado
    punto_expedicion: "001",
    // internal — no se envía al backend
    _empresa_id: "",
    _razon_social_locked: false, // true cuando viene de empresa seleccionada
  });

  const [form, setForm] = useState(getDefaultForm());
  const [saving, setSaving] = useState(false);
  const [tcInfo, setTcInfo] = useState(null);

  // ── Timbrado config ────────────────────────────────────────────
  const [timbradoConfig, setTimbradoConfig] = useState(null);   // null = cargando
  const [loadingTimbrado, setLoadingTimbrado] = useState(false);
  const [loadingNumero, setLoadingNumero] = useState(false);

  const timbradoVigente = useMemo(() => {
    if (!timbradoConfig?.fecha_vigencia) return false;
    return timbradoConfig.fecha_vigencia >= new Date().toISOString().slice(0, 10);
  }, [timbradoConfig]);

  const esAutoNumerico = timbradoConfig?.modo_numeracion === "automatico";
  const puntosExpedicion = timbradoConfig?.puntos_expedicion || [];

  const fetchTimbrado = useCallback(async () => {
    if (!logoTipo || !token) return;
    setLoadingTimbrado(true);
    try {
      const res = await fetch(`${API}/admin/timbrado-vigente/${logoTipo}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTimbradoConfig(data.tiene_config ? data : null);
        // Si modo automático y es nueva factura, pre-seleccionar primer punto de expedición
        if (data.tiene_config && data.modo_numeracion === "automatico" && !isEdit) {
          const primero = (data.puntos_expedicion || [])[0]?.codigo || "001";
          setForm(prev => ({ ...prev, punto_expedicion: primero }));
        }
      }
    } catch (e) { /* no bloquear */ }
    finally { setLoadingTimbrado(false); }
  }, [API, token, logoTipo, isEdit]);

  useEffect(() => { fetchTimbrado(); }, [fetchTimbrado]);

  const fetchSiguienteNumero = async (punto) => {
    if (!logoTipo || !punto) return;
    setLoadingNumero(true);
    try {
      const res = await fetch(`${API}/admin/siguiente-numero-factura/${logoTipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ punto_expedicion: punto }),
      });
      if (res.ok) {
        const data = await res.json();
        setForm(prev => ({
          ...prev,
          numero: data.numero,
          punto_expedicion: punto,
        }));
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "No se pudo obtener el siguiente número");
      }
    } catch (e) { toast.error("Error al obtener número automático"); }
    finally { setLoadingNumero(false); }
  };

  // Populate form when editing
  useEffect(() => {
    if (isEdit && factura) {
      let empresaId = "";
      if (factura.presupuesto_ids?.length > 0) {
        const pres = presupuestosDisp.find(p => factura.presupuesto_ids.includes(p.id));
        if (pres) empresaId = String(pres.empresa_id || "");
      }
      // Si la factura no tiene conceptos[] (legacy), reconstruimos uno desde concepto/monto
      const conceptosFromFac = (factura.conceptos && factura.conceptos.length > 0)
        ? factura.conceptos
        : [{
            descripcion: factura.concepto || "",
            cantidad: 1,
            precio_unitario: factura.monto || 0,
            subtotal: factura.monto || 0,
          }];
      // Si la factura ya tiene pagos[], heredamos cuenta del primero
      const primerPago = (factura.pagos || [])[0] || {};
      // Resolver empresa: prefiero la guardada en factura.empresa_id, sino la inferida del presupuesto
      const empIdFinal = factura.empresa_id || empresaId || "";
      const empData = empIdFinal ? empresas.find(e => String(e.id) === String(empIdFinal)) : null;
      setForm({
        logo_tipo:          factura.logo_tipo || "arandujar",
        tipo:               factura.tipo || "emitida",
        forma_pago:         factura.forma_pago || "contado",
        numero:             factura.numero || "",
        fecha:              factura.fecha ? factura.fecha.slice(0, 10) : "",
        fecha_vencimiento:  factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : "",
        fecha_pago:         factura.fecha_pago ? factura.fecha_pago.slice(0, 10) : "",
        cuenta_id:          factura.cuenta_id || primerPago.cuenta_id || "",
        cuenta_nombre:      factura.cuenta_nombre || primerPago.cuenta_nombre || "",
        razon_social:       factura.razon_social || "",
        ruc:                factura.ruc || "",
        empresa_id:         empIdFinal,
        empresa_nombre:     empData?.nombre || factura.empresa_nombre || "",
        concepto:           factura.concepto || "",
        conceptos:          conceptosFromFac.map(c => ({ ...c, producto_id: c.producto_id || "", producto_sku: c.producto_sku || "", iva_tipo: c.iva_tipo || "10" })),
        modo:               productosHabilitados ? (factura.modo || (conceptosFromFac.some(c => c.producto_id) ? "productos" : "libre")) : "libre",
        afecta_stock:       productosHabilitados ? (canCambiarAfectaStock ? factura.afecta_stock !== false : true) : false,
        monto:              factura.monto ?? "",
        moneda:             factura.moneda || "PYG",
        tipo_cambio:        factura.tipo_cambio ?? "",
        estado:             factura.estado || "pendiente",
        notas:              factura.notas || "",
        presupuesto_ids:    factura.presupuesto_ids || (factura.presupuesto_id ? [factura.presupuesto_id] : []),
        punto_expedicion:   factura.punto_expedicion || "001",
        _empresa_id:        empIdFinal,
        _razon_social_locked: !!empIdFinal,
      });
    }
  }, [isEdit, factura, presupuestosDisp]);

  // ── Helpers / handlers ─────────────────────────────────────────
  // Setter genérico para campos planos del form
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    const sugeridoActual = tcInfo ? String(tcInfo.tipo_cambio_sugerido || tcInfo.venta || "") : "";
    const tcActual = String(form.tipo_cambio || "");
    const puedeActualizarTc = !tcActual || (sugeridoActual && tcActual === sugeridoActual);
    if (form.moneda !== "USD" || !form.fecha || !puedeActualizarTc) return;
    let cancelled = false;
    fetch(`${API}/admin/cotizaciones/usd?fecha=${form.fecha}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        const sugerido = data.tipo_cambio_sugerido || data.venta;
        if (sugerido) {
          setForm(prev => {
            const prevTc = String(prev.tipo_cambio || "");
            if (prevTc && sugeridoActual && prevTc !== sugeridoActual) return prev;
            return { ...prev, tipo_cambio: String(sugerido) };
          });
          setTcInfo(data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [API, token, form.moneda, form.fecha, form.tipo_cambio, tcInfo?.tipo_cambio_sugerido, tcInfo?.venta]);

  // Format helper (₲ o USD según moneda actual)
  const fmtMonto = (n) => {
    const num = Number(n) || 0;
    if (form.moneda === "USD") {
      return `USD ${num.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `₲ ${Math.round(num).toLocaleString("es-PY")}`;
  };

  // Conceptos / ítems
  const addConcepto = () => {
    setForm(prev => ({ ...prev, conceptos: [...(prev.conceptos || []), defaultConcepto()] }));
  };
  const removeConcepto = (idx) => {
    setForm(prev => ({ ...prev, conceptos: prev.conceptos.filter((_, i) => i !== idx) }));
  };
  const handleConceptoChange = (idx, key, value) => {
    setForm(prev => {
      const conceptos = (prev.conceptos || []).map((c, i) => {
        if (i !== idx) return c;
        const nuevo = { ...c, [key]: value };
        // Recalcular subtotal si cambió cantidad o precio_unitario
        if (key === "cantidad" || key === "precio_unitario") {
          const cant = parseFloat(key === "cantidad" ? value : c.cantidad) || 0;
          const precio = parseFloat(key === "precio_unitario" ? value : c.precio_unitario) || 0;
          nuevo.subtotal = cant * precio;
        }
        return nuevo;
      });
      return { ...prev, conceptos };
    });
  };

  const selectProductoForConcepto = (idx, productoId) => {
    const prod = productos.find(p => String(p.id) === String(productoId));
    if (!prod) {
      handleConceptoChange(idx, "producto_id", "");
      return;
    }
    setForm(prev => {
      const conceptos = (prev.conceptos || []).map((c, i) => {
        if (i !== idx) return c;
        const precio = Number(prod.precio_venta ?? prod.precio ?? c.precio_unitario ?? 0) || 0;
        const cantidad = Number(c.cantidad || 1) || 1;
        return {
          ...c,
          producto_id: prod.id,
          producto_sku: prod.sku || "",
          descripcion: prod.nombre || c.descripcion,
          precio_unitario: precio,
          subtotal: cantidad * precio,
          iva_tipo: prod.iva_tipo || c.iva_tipo || "10",
        };
      });
      return { ...prev, conceptos };
    });
  };

  // Total derivado
  const totalMonto = useMemo(() => {
    return (form.conceptos || []).reduce((s, c) => s + (Number(c.subtotal) || 0), 0);
  }, [form.conceptos]);

  // IVA breakdown por tipo
  const ivaBreakdown = useMemo(() => {
    let exenta = 0, grav5 = 0, grav10 = 0;
    (form.conceptos || []).forEach(c => {
      const sub = Number(c.subtotal) || 0;
      const tipo = c.iva_tipo || "10";
      if (tipo === "exenta") exenta += sub;
      else if (tipo === "5") grav5 += sub;
      else grav10 += sub;
    });
    const iva5 = Math.round(grav5 / 21);
    const iva10 = Math.round(grav10 / 11);
    return { exenta, grav5, grav10, iva5, iva10, total: iva5 + iva10 };
  }, [form.conceptos]);

  // Cliente / empresa
  const handleEmpresaChange = (empresaId) => {
    if (!empresaId) {
      setForm(prev => ({
        ...prev,
        _empresa_id: "",
        _razon_social_locked: false,
        razon_social: "",
        ruc: "",
        empresa_id: "",
        empresa_nombre: "",
      }));
      return;
    }
    const emp = empresas.find(e => String(e.id) === String(empresaId));
    setForm(prev => ({
      ...prev,
      _empresa_id: empresaId,
      _razon_social_locked: true,
      razon_social: emp?.razon_social || emp?.nombre || prev.razon_social,
      ruc: emp?.ruc || "",
      empresa_id: empresaId,
      empresa_nombre: emp?.nombre || emp?.razon_social || "",
      presupuesto_ids: [], // limpiar selección al cambiar de empresa
    }));
  };

  // Presupuestos vinculables (filtrados por empresa si hay)
  const presupuestosFiltrados = useMemo(() => {
    if (!presupuestosDisp) return [];
    let list = presupuestosDisp.filter(p => p.estado !== "anulado");
    if (form._empresa_id) {
      list = list.filter(p => String(p.empresa_id) === String(form._empresa_id));
    }
    return list;
  }, [presupuestosDisp, form._empresa_id]);

  const conceptosVacios = (conceptos = []) => {
    const validos = conceptos.filter(c =>
      c.descripcion || Number(c.cantidad) > 1 || Number(c.precio_unitario) > 0 || Number(c.subtotal) > 0 || c.producto_id
    );
    return validos.length === 0;
  };

  const mapPresupuestoItemsToConceptos = (presupuestos = []) => {
    return presupuestos.flatMap(p =>
      (p.items || []).map(item => {
        const cantidad = Number(item.cantidad || 1) || 1;
        const precio = Number(item.precio_unitario ?? item.precio ?? 0) || 0;
        const subtotal = Number(item.subtotal) || cantidad * precio;
        return {
          descripcion: item.descripcion || "",
          cantidad,
          precio_unitario: precio,
          subtotal,
          producto_id: item.producto_id || "",
        };
      }).filter(item => item.descripcion && item.precio_unitario > 0)
    );
  };

  const applyPresupuestosToForm = (prev, presupuestos) => {
    const presupuestosConItems = presupuestos.filter(p => (p.items || []).length > 0);
    if (presupuestosConItems.length === 0) return prev;

    const conceptos = mapPresupuestoItemsToConceptos(presupuestosConItems);
    if (conceptos.length === 0) return prev;

    const primero = presupuestosConItems[0];
    const tieneProductos = conceptos.some(c => c.producto_id);
    return {
      ...prev,
      forma_pago: primero.forma_pago || prev.forma_pago,
      moneda: primero.moneda || prev.moneda,
      tipo_cambio: primero.tipo_cambio ?? prev.tipo_cambio,
      modo: productosHabilitados && tieneProductos ? "productos" : prev.modo,
      afecta_stock: productosHabilitados && tieneProductos ? true : prev.afecta_stock,
      conceptos,
    };
  };

  const togglePresupuesto = (id) => {
    const presupuesto = presupuestosDisp.find(p => String(p.id) === String(id));
    setForm(prev => {
      const yaEsta = prev.presupuesto_ids.includes(id);
      const next = {
        ...prev,
        presupuesto_ids: yaEsta
          ? prev.presupuesto_ids.filter(x => x !== id)
          : [...prev.presupuesto_ids, id],
      };
      if (!yaEsta && presupuesto && conceptosVacios(prev.conceptos)) {
        return applyPresupuestosToForm(next, [presupuesto]);
      }
      return next;
    });
  };

  const cargarItemsPresupuestos = () => {
    const seleccionados = presupuestosDisp.filter(p => form.presupuesto_ids.includes(p.id));
    if (seleccionados.length === 0) {
      toast.error("Primero vinculá al menos un presupuesto");
      return;
    }
    const conceptos = mapPresupuestoItemsToConceptos(seleccionados);
    if (conceptos.length === 0) {
      toast.error("El presupuesto vinculado no tiene ítems para cargar");
      return;
    }
    if (!conceptosVacios(form.conceptos) && !window.confirm("Esto reemplazará los ítems actuales de la factura. ¿Continuar?")) {
      return;
    }
    setForm(prev => applyPresupuestosToForm(prev, seleccionados));
    toast.success("Ítems del presupuesto cargados en la factura");
  };

  // Submit
  const handleSave = async () => {
    if (!esBoleta && !form.numero && !isEdit) {
      toast.error("El número de factura es obligatorio");
      return;
    }
    if (!form.fecha || !form.razon_social) {
      toast.error("Fecha y razón social son obligatorios");
      return;
    }
    // Bloquear si el timbrado está vencido y hay config (solo para facturas nuevas emitidas, no boletas)
    if (!isEdit && !esBoleta && timbradoConfig && !timbradoVigente) {
      toast.error(`Timbrado vencido (${timbradoConfig.fecha_vigencia_timbrado}). Actualizá el timbrado antes de emitir facturas.`);
      return;
    }
    const conceptosValidos = (form.conceptos || []).filter(c =>
      c.descripcion && (parseFloat(c.cantidad) || 0) > 0 && (parseFloat(c.precio_unitario) || 0) > 0
    );
    if (conceptosValidos.length === 0) {
      toast.error("Agregá al menos un ítem con descripción, cantidad y precio");
      return;
    }
    if (form.estado === "pagada" && !form.cuenta_id) {
      toast.error("Si la factura está pagada, indicá en qué cuenta entró la plata");
      return;
    }
    const cuentaSeleccionada = cuentasDisp.find(c => String(c.id) === String(form.cuenta_id));
    const monedaCuenta = cuentaSeleccionada?.moneda || form.moneda || "PYG";
    const requiereConversion = form.estado === "pagada" && form.cuenta_id && monedaCuenta !== form.moneda;
    if (requiereConversion && (!form.tipo_cambio || parseFloat(form.tipo_cambio) <= 0)) {
      toast.error("Falta el tipo de cambio porque la cuenta seleccionada usa otra moneda");
      return;
    }

    const conceptosOut = conceptosValidos.map(c => ({
      descripcion: c.descripcion,
      producto_id: form.modo === "productos" ? (c.producto_id || null) : null,
      producto_sku: c.producto_sku || null,
      cantidad: parseFloat(c.cantidad) || 1,
      precio_unitario: parseFloat(c.precio_unitario) || 0,
      subtotal: (parseFloat(c.cantidad) || 1) * (parseFloat(c.precio_unitario) || 0),
      iva_tipo: c.iva_tipo || "10",
    }));
    const montoTotal = conceptosOut.reduce((s, c) => s + c.subtotal, 0);
    const conceptoTexto = conceptosOut.length === 1
      ? conceptosOut[0].descripcion
      : `${conceptosOut.length} ítems`;

    const payload = {
      logo_tipo: form.logo_tipo || logoTipo,
      tipo: form.tipo || "emitida",
      sin_factura: esBoleta,
      numero: esBoleta ? null : form.numero,
      fecha: form.fecha,
      forma_pago: form.forma_pago || "contado",
      razon_social: form.razon_social,
      ruc: form.ruc || null,
      empresa_id: form.empresa_id || form._empresa_id || null,
      empresa_nombre: form.empresa_nombre || null,
      concepto: conceptoTexto,
      conceptos: conceptosOut,
      modo: productosHabilitados ? form.modo : "libre",
      afecta_stock: productosHabilitados && form.modo === "productos" ? (canCambiarAfectaStock ? !!form.afecta_stock : true) : false,
      monto: montoTotal,
      moneda: form.moneda || "PYG",
      tipo_cambio: form.tipo_cambio !== "" && form.tipo_cambio != null ? Number(form.tipo_cambio) : null,
      estado: form.estado || "pendiente",
      fecha_vencimiento: form.fecha_vencimiento || null,
      fecha_pago: form.estado === "pagada" ? (form.fecha_pago || form.fecha) : null,
      cuenta_id: form.estado === "pagada" ? (form.cuenta_id || null) : null,
      cuenta_nombre: form.estado === "pagada" ? (form.cuenta_nombre || null) : null,
      presupuesto_ids: form.presupuesto_ids || [],
      notas: form.notas || null,
      // Timbrado — solo si hay config activa y NO es boleta
      nro_timbrado: (!esBoleta && timbradoConfig?.nro_timbrado) || null,
      fecha_inicio_timbrado: (!esBoleta && timbradoConfig?.fecha_inicio) || null,
      fecha_vigencia_timbrado: (!esBoleta && timbradoConfig?.fecha_vigencia) || null,
      punto_expedicion: (!esBoleta && form.punto_expedicion) || null,
    };

    try {
      setSaving(true);
      const url = isEdit
        ? `${API}/admin/facturas/${factura.id}`
        : `${API}/admin/facturas`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      toast.success(isEdit ? (esBoleta ? "Boleta actualizada" : "Factura actualizada") : (esBoleta ? "Boleta creada" : "Factura creada"));
      if (onSaved) onSaved();
    } catch (e) {
      toast.error(e.message || "No se pudo guardar la factura");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white";
  const inputReadonlyCls =
    "w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-600 bg-gray-50 cursor-not-allowed";
  const labelCls = "text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-6 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${esBoleta ? "bg-violet-600" : "bg-blue-600"}`}>
              {esBoleta ? <Receipt className="w-5 h-5 text-white" /> : <FileText className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEdit
                  ? (esBoleta ? `Editar Boleta ${factura.numero_boleta || factura.numero}` : `Editar Factura ${factura.numero}`)
                  : (esBoleta ? "Venta sin Factura (Boleta)" : "Nueva Factura")}
              </h2>
              <p className="text-xs text-gray-400">
                {esBoleta
                  ? "Venta sin comprobante fiscal — el número de boleta se genera automáticamente"
                  : (isEdit ? "Modificar datos de la factura" : "Crear nueva factura")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Boleta notice ── */}
          {esBoleta && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center gap-3 text-xs text-violet-700">
              <Receipt className="w-4 h-4 flex-shrink-0" />
              <span>Esta venta <strong>no genera comprobante fiscal</strong>. No afecta al IVA. El número de boleta se asignará automáticamente al guardar.</span>
            </div>
          )}

          {/* ── Timbrado Banner (solo para facturas normales) ── */}
          {!esBoleta && (
            loadingTimbrado ? (
              <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando timbrado...
              </div>
            ) : timbradoConfig ? (
              <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                timbradoVigente
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-red-50 border-red-200"
              }`}>
                <Shield className={`w-4 h-4 mt-0.5 flex-shrink-0 ${timbradoVigente ? "text-emerald-600" : "text-red-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${timbradoVigente ? "text-emerald-800" : "text-red-700"}`}>
                    {timbradoVigente ? "Timbrado vigente" : "⚠️ Timbrado vencido — no se pueden emitir nuevas facturas"}
                  </p>
                  <p className={`text-[11px] mt-0.5 ${timbradoVigente ? "text-emerald-600" : "text-red-500"}`}>
                    N° {timbradoConfig.nro_timbrado} · Vigencia: {timbradoConfig.fecha_inicio} → {timbradoConfig.fecha_vigencia}
                    {timbradoConfig.establecimiento && ` · Est. ${timbradoConfig.establecimiento}`}
                  </p>
                </div>
                {hasPermission?.("facturas.timbrado") && (
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    <Settings className="w-3 h-3 inline-block mr-0.5" />Config. Timbrado en Facturas
                  </span>
                )}
              </div>
            ) : hasPermission?.("facturas.timbrado") ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 text-xs text-amber-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Sin timbrado configurado. Podés configurarlo en el botón <strong className="mx-1">⚙ Timbrado</strong> en la sección de Facturas.
              </div>
            ) : null
          )}

          {/* Row 1: Número (oculto en boleta), Fecha */}
          <div className={`grid gap-4 ${esBoleta ? "grid-cols-1" : "grid-cols-2"}`}>
            {!esBoleta && (
              <div>
                <label className={labelCls}>Número *</label>
                {!isEdit && esAutoNumerico ? (
                  <div className="space-y-2">
                    {puntosExpedicion.length > 1 && (
                      <select
                        className={inputCls}
                        value={form.punto_expedicion}
                        onChange={(e) => setForm(prev => ({ ...prev, punto_expedicion: e.target.value, numero: "" }))}
                      >
                        {puntosExpedicion.map(p => (
                          <option key={p.codigo} value={p.codigo}>
                            Punto {p.codigo}{p.descripcion ? ` — ${p.descripcion}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex gap-2">
                      <input
                        className={inputCls + " flex-1 bg-gray-50 text-gray-500"}
                        value={form.numero || ""}
                        readOnly
                        placeholder="Número auto-generado"
                      />
                      <button
                        type="button"
                        disabled={loadingNumero || !timbradoVigente}
                        onClick={() => fetchSiguienteNumero(form.punto_expedicion || "001")}
                        className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
                      >
                        {loadingNumero ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generar N°"}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400">El número se genera automáticamente y reserva el correlativo.</p>
                  </div>
                ) : (
                  <input
                    className={inputCls}
                    value={form.numero}
                    onChange={(e) => set("numero", e.target.value)}
                    placeholder="001-001-0001234"
                  />
                )}
              </div>
            )}
            <div>
              <label className={labelCls}>Fecha *</label>
              <input
                type="date"
                className={inputCls}
                value={form.fecha}
                onChange={(e) => set("fecha", e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Forma pago, Estado, Vencimiento */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Forma de Pago</label>
              <select
                className={inputCls}
                value={form.forma_pago}
                onChange={(e) => set("forma_pago", e.target.value)}
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select
                className={inputCls}
                value={form.estado}
                onChange={(e) => set("estado", e.target.value)}
              >
                <option value="pendiente">Pendiente</option>
                <option value="pagada">Pagada</option>
                <option value="anulada">Anulada</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha de Vencimiento</label>
              <input
                type="date"
                className={inputCls}
                value={form.fecha_vencimiento}
                onChange={(e) => set("fecha_vencimiento", e.target.value)}
              />
            </div>
          </div>

          {/* Row 2.5: Datos de cobro — solo si estado=pagada */}
          {form.estado === "pagada" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                💰 Datos de cobro
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Cuenta donde entró la plata *</label>
                  <select
                    className={inputCls}
                    value={form.cuenta_id}
                    onChange={(e) => {
                      const c = (cuentasDisp || []).find(c => c.id === e.target.value);
                      setForm(prev => ({ ...prev, cuenta_id: e.target.value, cuenta_nombre: c?.nombre || "" }));
                    }}
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {(cuentasDisp || []).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda}){c.es_predeterminada ? " ★" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fecha de cobro</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.fecha_pago || form.fecha}
                    onChange={(e) => set("fecha_pago", e.target.value)}
                  />
                  <p className="text-[11px] text-emerald-700 mt-1">Si lo dejás vacío usamos la fecha de la factura.</p>
                </div>
              </div>
            </div>
          )}

          {/* Row 3: Moneda, Tipo de Cambio */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Moneda</label>
              <select
                className={inputCls}
                value={form.moneda}
                onChange={(e) => set("moneda", e.target.value)}
              >
                <option value="PYG">Guaraníes (₲)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
            {form.moneda === "USD" && (
              <div>
                <label className={labelCls}>Tipo de Cambio (₲ por USD)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.tipo_cambio}
                  onChange={(e) => { setTcInfo(null); set("tipo_cambio", e.target.value); }}
                  placeholder="7500"
                />
                {tcInfo && (
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Sugerido Cambios Chaco venta: ₲ {Number(tcInfo.tipo_cambio_sugerido || tcInfo.venta).toLocaleString("es-PY")} ({tcInfo.fecha})
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Separator: Datos del Cliente */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Datos del Cliente
            </p>

            {/* Empresa selector */}
            <div className="mb-4">
              <label className={labelCls}>Empresa / Cliente (para filtrar y autocompletar)</label>
              <select
                className={inputCls}
                value={form._empresa_id}
                onChange={(e) => handleEmpresaChange(e.target.value)}
              >
                <option value="">— Seleccionar empresa (opcional) —</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre || e.razon_social}
                    {e.razon_social && e.nombre && e.razon_social !== e.nombre ? ` (${e.razon_social})` : ""}
                    {e.ruc ? ` · ${e.ruc}` : ""}
                  </option>
                ))}
              </select>
              {form._empresa_id && (
                <p className="text-xs text-blue-500 mt-1">
                  Datos de empresa cargados. Presupuestos filtrados.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Razón Social *
                  {form._razon_social_locked && (
                    <span className="ml-1 text-blue-400 normal-case font-normal">(de empresa seleccionada)</span>
                  )}
                </label>
                {form._razon_social_locked ? (
                  <div className={inputReadonlyCls}>
                    {form.razon_social}
                  </div>
                ) : (
                  <input
                    className={inputCls}
                    value={form.razon_social}
                    onChange={(e) => set("razon_social", e.target.value)}
                    placeholder="Empresa S.A."
                  />
                )}
              </div>
              <div>
                <label className={labelCls}>
                  RUC
                  {form._razon_social_locked && (
                    <span className="ml-1 text-blue-400 normal-case font-normal">(de empresa seleccionada)</span>
                  )}
                </label>
                {form._razon_social_locked ? (
                  <div className={inputReadonlyCls}>
                    {form.ruc || <span className="text-gray-300">Sin RUC</span>}
                  </div>
                ) : (
                  <input
                    className={inputCls}
                    value={form.ruc}
                    onChange={(e) => set("ruc", e.target.value)}
                    placeholder="80123456-7"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Conceptos */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Conceptos / Ítems
              </p>
              <button
                onClick={addConcepto}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar ítem
              </button>
            </div>

            {productosHabilitados && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {canModoLibre && (
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, modo: "libre", afecta_stock: false }))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.modo === "libre" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"}`}
                  >
                    Libre
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, modo: "productos", afecta_stock: true }))}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.modo === "productos" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-500 border-gray-200 hover:border-emerald-300"}`}
                >
                  Catálogo
                </button>
                {form.modo === "productos" && (
                  <button
                    type="button"
                    onClick={() => canCambiarAfectaStock && setForm(prev => ({ ...prev, afecta_stock: !prev.afecta_stock }))}
                    disabled={!canCambiarAfectaStock}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.afecta_stock ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-500 border-gray-200 hover:border-amber-300"}`}
                    title={canCambiarAfectaStock ? "Cambiar afectación de stock" : "Siempre afecta stock con catálogo"}
                  >
                    {form.afecta_stock ? "Afecta stock" : "No afecta stock"}
                  </button>
                )}
              </div>
            )}

            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400 px-1">
                <div className="col-span-6">Descripción</div>
                <div className="col-span-2 text-center">Cant.</div>
                <div className="col-span-2 text-right">P. Unitario</div>
                <div className="col-span-1 text-right">Subtotal</div>
                <div className="col-span-1"></div>
              </div>

              {form.conceptos.map((c, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    {productosHabilitados && form.modo === "productos" && (
                      <select
                        className={inputCls + " mb-1"}
                        value={c.producto_id || ""}
                        onChange={(e) => selectProductoForConcepto(idx, e.target.value)}
                      >
                        <option value="">Seleccionar producto...</option>
                        {productos.filter(p => p.activo !== false && (!p.logo_tipo || p.logo_tipo === logoTipo)).map(p => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}{p.sku ? ` (${p.sku})` : ""} - stock: {p.stock_actual ?? p.stock ?? 0}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      className={inputCls}
                      value={c.descripcion}
                      onChange={(e) => handleConceptoChange(idx, "descripcion", e.target.value)}
                      placeholder="Descripción del ítem"
                    />
                    {/* SKU badge cuando viene del catálogo */}
                    {c.producto_sku && (
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">SKU: {c.producto_sku}</span>
                    )}
                    {/* IVA tipo — editable en modo libre, solo lectura en catálogo */}
                    {!esBoleta && (
                      <div className="flex gap-1 mt-1">
                        {[["exenta","Exenta"],["5","5%"],["10","10%"]].map(([v, l]) => {
                          const isActive = (c.iva_tipo || "10") === v;
                          const fromCatalog = !!c.producto_id;
                          return (
                            <button key={v} type="button"
                              onClick={() => !fromCatalog && handleConceptoChange(idx, "iva_tipo", v)}
                              title={fromCatalog ? "El IVA viene definido por el producto" : undefined}
                              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                                isActive
                                  ? v === "exenta"
                                    ? "bg-slate-500/30 border-slate-400/50 text-slate-300"
                                    : v === "5"
                                    ? "bg-amber-500/25 border-amber-400/50 text-amber-300"
                                    : "bg-blue-500/25 border-blue-400/50 text-blue-300"
                                  : "bg-white/5 border-white/10 text-gray-400"
                              } ${fromCatalog ? "cursor-default opacity-70" : "hover:border-gray-400 cursor-pointer"}`}>
                              {l}
                            </button>
                          );
                        })}
                        {!!c.producto_id && (
                          <span className="text-[9px] text-slate-500 self-center ml-1">🔒 del producto</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      className={inputCls + " text-center"}
                      value={c.cantidad}
                      onChange={(e) => handleConceptoChange(idx, "cantidad", e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      className={inputCls + " text-right"}
                      value={c.precio_unitario}
                      onChange={(e) => handleConceptoChange(idx, "precio_unitario", e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="col-span-1 text-right text-xs font-mono text-gray-600 px-1">
                    {fmtMonto(c.subtotal)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {form.conceptos.length > 1 && (
                      <button
                        onClick={() => removeConcepto(idx)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Total + IVA breakdown */}
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <div className="bg-gray-50 rounded-xl px-4 py-2 text-right space-y-0.5 min-w-[220px]">
                  {!esBoleta && ivaBreakdown.exenta > 0 && (
                    <p className="text-xs text-gray-400">Exento: {fmtMonto(ivaBreakdown.exenta)}</p>
                  )}
                  {!esBoleta && ivaBreakdown.iva5 > 0 && (
                    <p className="text-xs text-amber-600">IVA 5% incluido: {fmtMonto(ivaBreakdown.iva5)}</p>
                  )}
                  {!esBoleta && ivaBreakdown.iva10 > 0 && (
                    <p className="text-xs text-blue-600">IVA 10% incluido: {fmtMonto(ivaBreakdown.iva10)}</p>
                  )}
                  <p className="text-xs text-gray-400 mb-0.5 pt-1 border-t border-gray-200">Total factura</p>
                  <p className="text-lg font-bold text-gray-800">{fmtMonto(totalMonto)}</p>
                  {form.moneda === "USD" && form.tipo_cambio && (
                    <p className="text-xs text-gray-400">
                      ≈ ₲ {Math.round(totalMonto * parseFloat(form.tipo_cambio)).toLocaleString("es-PY")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Vincular Presupuestos */}
          {presupuestosFiltrados.length > 0 && (
            <div className="border-t border-dashed border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Vincular Presupuestos
                {form._empresa_id && <span className="ml-1 text-blue-400 normal-case font-normal">(filtrado por empresa)</span>}
              </p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {presupuestosFiltrados.slice(0, 60).map((p) => {
                  const selected = form.presupuesto_ids.includes(p.id);
                  const monFmt = p.moneda === "USD"
                    ? `USD ${Number(p.total).toLocaleString("es-PY", { minimumFractionDigits: 2 })}`
                    : `₲ ${Math.round(p.total).toLocaleString("es-PY")}`;
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePresupuesto(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all text-left ${
                        selected
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                      }`}
                    >
                      <span className="font-mono font-semibold">#{p.numero}</span>
                      {p.nombre_archivo && (
                        <span className={selected ? "text-blue-200" : "text-gray-400"}> · {p.nombre_archivo.slice(0, 18)}</span>
                      )}
                      <br />
                      <span className={selected ? "text-blue-200 text-[11px]" : "text-gray-400 text-[11px]"}>{monFmt}</span>
                    </button>
                  );
                })}
              </div>
              {form.presupuesto_ids.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <p className="text-xs text-blue-500">
                    {form.presupuesto_ids.length} presupuesto(s) vinculado(s)
                  </p>
                  <button
                    type="button"
                    onClick={cargarItemsPresupuestos}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold transition-colors"
                  >
                    <Package className="w-3.5 h-3.5" />
                    Cargar ítems del presupuesto
                  </button>
                </div>
              )}
            </div>
          )}


          {/* Notas */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <label className={labelCls}>Notas / Observaciones</label>
            <textarea
              className={inputCls + " min-h-[70px] resize-none"}
              value={form.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Observaciones adicionales..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!isEdit && timbradoConfig && !timbradoVigente)}
            title={!isEdit && timbradoConfig && !timbradoVigente ? "Timbrado vencido — renovalo antes de emitir" : undefined}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow transition-all"
          >
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : isEdit ? "Guardar Cambios" : "Crear Factura"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FacturaFormModal;
