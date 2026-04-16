import React, { useState, useEffect, useContext } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText, Plus, Search, Eye, Trash2, Building2, Calendar,
  ArrowLeft, Save, X, Calculator, Printer, CheckCircle, Clock,
  XCircle, Send, Server, Cpu, Copy, Edit, Receipt, DollarSign,
  Filter, BarChart3, Wallet
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { AuthContext } from "../App";
import EmpresaSwitcher from "../components/EmpresaSwitcher";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Logo Components
const LogoArandu = () => (
  <div className="flex items-center gap-2">
    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
      <Cpu className="w-6 h-6 text-white" />
    </div>
    <div className="flex flex-col">
      <span className="font-bold text-xl text-blue-600">ARANDU</span>
      <span className="text-[10px] text-gray-500 tracking-wider">INFORMÁTICA</span>
    </div>
  </div>
);

const LogoJar = () => (
  <div className="flex items-center gap-2">
    <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-700 rounded-lg flex items-center justify-center">
      <Server className="w-6 h-6 text-white" />
    </div>
    <div className="flex flex-col">
      <span className="font-bold text-xl text-red-600">JAR</span>
      <span className="text-[10px] text-gray-500 tracking-wider">INFORMÁTICA</span>
    </div>
  </div>
);

const LogoAranduJar = () => (
  <div className="flex items-center gap-2">
    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-red-500 rounded-lg flex items-center justify-center">
      <Server className="w-6 h-6 text-white" />
    </div>
    <div className="flex flex-col">
      <span className="font-bold text-xl">
        <span className="text-blue-600">ARANDU</span>
        <span className="text-red-600">&JAR</span>
      </span>
      <span className="text-[10px] text-gray-500 tracking-wider">INFORMÁTICA</span>
    </div>
  </div>
);

const PresupuestosPage = () => {
  const { token, user, hasPermission, activeEmpresaPropia } = useContext(AuthContext);
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const canCreate = hasPermission("presupuestos.crear");
  const canEdit = hasPermission("presupuestos.editar");
  const canDelete = hasPermission("presupuestos.eliminar");
  const canEditCostos = hasPermission("costos.editar");
  const canModoLibre = isAdmin || hasPermission("presupuestos.modo_libre");
  const defaultModo = canModoLibre ? "libre" : "productos";
  const [searchParams] = useSearchParams();
  const empresaFilter = searchParams.get("empresa");
  const estadoFromUrl = searchParams.get("estado");
  const logoTipoFromUrl = searchParams.get("logo_tipo");
  
  const [presupuestos, setPresupuestos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(null);
  const [printFileName, setPrintFileName] = useState("");
  const [showCostos, setShowCostos] = useState(null);
  const [costosData, setCostosData] = useState(null);
  const [provMonedaDisplay, setProvMonedaDisplay] = useState({});
  const [proveedores, setProveedores] = useState([]);
  const [savingCostos, setSavingCostos] = useState(false);
  const [estadoFilter, setEstadoFilter] = useState(estadoFromUrl || "");
  // logoFilter: se usa el de activeEmpresaPropia, con fallback al URL param
  const logoFilter = activeEmpresaPropia?.slug || logoTipoFromUrl || "";
  const [clienteFilter, setClienteFilter] = useState("");
  const [empresasPropias, setEmpresasPropias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFacturarModal, setShowFacturarModal] = useState(null); // presupuesto a facturar
  const [facturaForm, setFacturaForm] = useState({ numero: "", fecha: new Date().toISOString().split('T')[0], forma_pago: "contado", notas: "" });
  const [savingFactura, setSavingFactura] = useState(false);
  // Modo facturación: "nueva" = crear nueva, "existente" = vincular existente
  const [facturaMode, setFacturaMode] = useState("nueva");
  const [facturaSearch, setFacturaSearch] = useState("");
  const [facturasDisponibles, setFacturasDisponibles] = useState([]);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  
  const [formData, setFormData] = useState({
    empresa_id: empresaFilter || "",
    numero: "",
    nombre_archivo: "",
    logo_tipo: activeEmpresaPropia?.slug || "arandujar",
    moneda: "PYG",
    forma_pago: "contado",
    fecha: new Date().toISOString().split('T')[0],
    validez_dias: 15,
    tipo_cambio: "",
    modo: canModoLibre ? "libre" : "productos",
    items: [{ descripcion: "", observacion: "", observacion_oculta: "", cantidad: 1, costo: 0, margen: 30, precio_unitario: 0, subtotal: 0, moneda_item: "", tipo_cambio_item: "", proveedor_id: "", proveedor_nombre: "", producto_id: "", imagen: null, imagen_comentario: "" }],
    observaciones: "",
    condiciones: "- Precios expresados en Guaraníes (IVA incluido).\n- Validez de la oferta: 15 días.\n- Forma de pago: Al contado.\n- Tiempo de entrega: A confirmar según stock."
  });
  const [editingId, setEditingId] = useState(null);

  // Logos a los que el usuario tiene acceso
  // Admin → ve todos | Usuario → solo los de logos_asignados
  const logosAccesibles = isAdmin
    ? empresasPropias
    : empresasPropias.filter(ep =>
        (user?.logos_asignados || []).map(String).includes(String(ep.id))
      );

  // Generate condiciones text based on currency and forma_pago
  const buildCondiciones = (moneda, validezDias = 15, formaPago = "contado") => {
    const monedaText = moneda === "USD" ? "Dólares Americanos" : "Guaraníes";
    const pagoText = formaPago === "credito" ? "A crédito" : "Al contado";
    return `- Precios expresados en ${monedaText} (IVA incluido).\n- Validez de la oferta: ${validezDias} días.\n- Forma de pago: ${pagoText}.\n- Tiempo de entrega: A confirmar según stock.`;
  };

  // Update condiciones when moneda changes, and recalculate all items
  const updateMoneda = (newMoneda) => {
    setFormData(prev => ({
      ...prev,
      moneda: newMoneda,
      items: prev.items.map(item => calculateItemFn(item, newMoneda, prev.tipo_cambio)),
      condiciones: buildCondiciones(newMoneda, prev.validez_dias, prev.forma_pago)
    }));
  };

  // Update tipo_cambio and recalculate all items that use a different currency
  const updateTipoCambio = (newTC) => {
    setFormData(prev => ({
      ...prev,
      tipo_cambio: newTC,
      items: prev.items.map(item => calculateItemFn(item, prev.moneda, newTC))
    }));
  };

  // Update condiciones when forma_pago changes
  const updateFormaPago = (newFormaPago) => {
    setFormData(prev => ({
      ...prev,
      forma_pago: newFormaPago,
      condiciones: buildCondiciones(prev.moneda, prev.validez_dias, newFormaPago)
    }));
  };

  useEffect(() => {
    fetchData();
  }, [empresaFilter, estadoFilter, activeEmpresaPropia]); // eslint-disable-line

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (empresaFilter) params.set("empresa_id", empresaFilter);
      if (estadoFilter) params.set("estado", estadoFilter);
      // Usar empresa activa del contexto; caer en URL param si existe
      const logoTipoActivo = activeEmpresaPropia?.slug || logoTipoFromUrl || "";
      if (logoTipoActivo) params.set("logo_tipo", logoTipoActivo);
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      
      const [presRes, empRes, provRes, propiasRes, prodRes] = await Promise.all([
        fetch(`${API}/admin/presupuestos${queryStr}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/empresas`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/proveedores?activo=true`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/empresas-propias`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/admin/productos`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (presRes.ok) setPresupuestos(await presRes.json());
      if (empRes.ok) setEmpresas(await empRes.json());
      if (provRes.ok) setProveedores(await provRes.json());
      if (propiasRes.ok) setEmpresasPropias(await propiasRes.json());
      if (prodRes.ok) setProductos(await prodRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const roundByMoneda = (value, moneda) => {
    const m = moneda || formData.moneda;
    if (m === "USD") return Math.round(value * 100) / 100;
    return Math.round(value);
  };

  // Calcula precio_unitario y subtotal en la moneda del documento, convirtiendo si el ítem tiene otra moneda
  const calculateItemFn = (item, docMoneda, globalTC) => {
    const costo = parseFloat(item.costo) || 0;
    const margen = parseFloat(item.margen) || 0;
    const cantidad = parseInt(item.cantidad) || 1;
    const monedaItem = item.moneda_item || docMoneda;

    let costoConvertido = costo;
    if (monedaItem !== docMoneda) {
      const tc = parseFloat(item.tipo_cambio_item) || parseFloat(globalTC) || 1;
      if (docMoneda === "PYG" && monedaItem === "USD") {
        costoConvertido = costo * tc;        // USD → PYG
      } else if (docMoneda === "USD" && monedaItem === "PYG") {
        costoConvertido = tc > 0 ? costo / tc : 0;  // PYG → USD
      }
    }

    const round = (v) => roundByMoneda(v, docMoneda);
    const precio_unitario = round(costoConvertido * (1 + margen / 100));
    const subtotal = round(precio_unitario * cantidad);
    return { ...item, precio_unitario, subtotal };
  };

  const calculateItem = (item) => calculateItemFn(item, formData.moneda, formData.tipo_cambio);

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    if (field === "margen" || field === "costo" || field === "cantidad") {
      newItems[index] = { ...newItems[index], [field]: value === "" ? 0 : value };
    } else if (field === "proveedor_id") {
      // Also store the proveedor name so it persists in the document
      const prov = proveedores.find(p => p.id === value);
      newItems[index] = { ...newItems[index], proveedor_id: value, proveedor_nombre: prov ? prov.nombre : "" };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    newItems[index] = calculateItem(newItems[index]);
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { descripcion: "", observacion: "", observacion_oculta: "", cantidad: 1, costo: 0, margen: 30, precio_unitario: 0, subtotal: 0, moneda_item: "", tipo_cambio_item: "", proveedor_id: "", proveedor_nombre: "", producto_id: "", imagen: null, imagen_comentario: "" }]
    });
  };

  const selectProductoForItem = (index, productoId) => {
    const prod = productos.find(p => p.id === productoId);
    if (!prod) {
      updateItem(index, "producto_id", "");
      return;
    }
    const newItems = [...formData.items];
    const costo = prod.precio_costo || 0;
    const margen = newItems[index].margen || 30;
    const calculated = calculateItemFn({ ...newItems[index], descripcion: prod.nombre, costo, margen, producto_id: productoId }, formData.moneda, formData.tipo_cambio);
    newItems[index] = { ...calculated, descripcion: prod.nombre, costo, margen, producto_id: productoId };
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const calculateTotals = () => {
    const total = formData.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const isUSD = formData.moneda === "USD";
    // IVA incluido: el total ya incluye el IVA, calculamos cuánto es
    const iva = isUSD ? Math.round((total / 11) * 100) / 100 : Math.round(total / 11);
    const subtotal = isUSD ? Math.round((total - iva) * 100) / 100 : total - iva;
    return { subtotal, iva, total };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.empresa_id) {
      toast.error("Seleccione una empresa");
      return;
    }

    const totals = calculateTotals();
    
    try {
      const url = editingId 
        ? `${API}/admin/presupuestos/${editingId}`
        : `${API}/admin/presupuestos`;
      
      // Sanitizar campos numéricos opcionales: convertir "" a null para que Pydantic no falle
      const toFloat = v => (v === "" || v === null || v === undefined) ? null : parseFloat(v) || null;
      const payload = {
        ...formData,
        ...totals,
        tipo_cambio: toFloat(formData.tipo_cambio),
        numero: formData.numero || null,
        items: formData.items.map(item => ({
          ...item,
          moneda_item: item.moneda_item || null,
          tipo_cambio_item: toFloat(item.tipo_cambio_item),
          proveedor_id: item.proveedor_id || null,
          proveedor_nombre: item.proveedor_nombre || null
        }))
      };

      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const savedPresupuesto = await response.json();
        toast.success(editingId ? "Presupuesto actualizado" : "Presupuesto creado");
        resetForm();
        fetchData();
        setShowPreview(savedPresupuesto);
        setPrintFileName(`Presupuesto ${savedPresupuesto.numero}`);
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar el presupuesto");
    }
  };

  const handleDelete = async (presupuestoId) => {
    if (!window.confirm("¿Está seguro de eliminar este presupuesto?")) return;

    try {
      const response = await fetch(`${API}/admin/presupuestos/${presupuestoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success("Presupuesto eliminado");
        fetchData();
      }
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const updateEstado = async (presupuestoId, estado) => {
    try {
      const response = await fetch(`${API}/admin/presupuestos/${presupuestoId}/estado?estado=${estado}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success("Estado actualizado");
        fetchData();
      }
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  // Cargar facturas disponibles cuando se abre el modal de facturar
  useEffect(() => {
    if (showFacturarModal) {
      setFacturaMode("nueva");
      setFacturaSearch("");
      setFacturaSeleccionada(null);
      setFacturaForm({ numero: "", fecha: new Date().toISOString().split('T')[0], forma_pago: "contado", notas: "" });
      fetch(`${API}/admin/facturas?tipo=emitida`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => setFacturasDisponibles(data))
        .catch(() => setFacturasDisponibles([]));
    }
  }, [showFacturarModal]); // eslint-disable-line

  const handleFacturar = async () => {
    if (!facturaForm.numero.trim()) { toast.error("El número de factura es requerido"); return; }
    const presupuesto = showFacturarModal;
    setSavingFactura(true);
    try {
      // 1. Crear la factura vinculada
      const facturaPayload = {
        logo_tipo: presupuesto.logo_tipo,
        tipo: "emitida",
        forma_pago: facturaForm.forma_pago,
        numero: facturaForm.numero,
        fecha: facturaForm.fecha,
        razon_social: presupuesto.empresa_nombre || "",
        ruc: presupuesto.empresa_ruc || "",
        concepto: presupuesto.nombre_archivo
          ? `${presupuesto.numero} - ${presupuesto.nombre_archivo}`
          : `Presupuesto ${presupuesto.numero}`,
        monto: presupuesto.total,
        moneda: presupuesto.moneda,
        tipo_cambio: presupuesto.tipo_cambio || null,
        estado: "pendiente",
        notas: facturaForm.notas || null,
        presupuesto_ids: [presupuesto.id],
        presupuesto_id: presupuesto.id,
      };
      const resFactura = await fetch(`${API}/admin/facturas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(facturaPayload)
      });
      if (!resFactura.ok) { toast.error("Error al crear la factura"); setSavingFactura(false); return; }
      // 2. Cambiar estado del presupuesto a "facturado" (solo si no está ya en facturado/cobrado)
      const yaFacturado = presupuesto.estado === "facturado" || presupuesto.estado === "cobrado";
      if (!yaFacturado) {
        await fetch(`${API}/admin/presupuestos/${presupuesto.id}/estado?estado=facturado`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      toast.success(yaFacturado ? "Factura creada y vinculada" : "Factura creada — presupuesto marcado como Facturado");
      setShowFacturarModal(null);
      fetchData();
    } catch (error) {
      toast.error("Error al facturar");
    } finally {
      setSavingFactura(false);
    }
  };

  const handleVincularExistente = async () => {
    if (!facturaSeleccionada) { toast.error("Seleccioná una factura"); return; }
    const presupuesto = showFacturarModal;
    setSavingFactura(true);
    try {
      // Agregar presupuesto_id al array presupuesto_ids de la factura existente
      const idsActuales = facturaSeleccionada.presupuesto_ids?.length
        ? facturaSeleccionada.presupuesto_ids
        : (facturaSeleccionada.presupuesto_id ? [facturaSeleccionada.presupuesto_id] : []);
      const nuevosIds = idsActuales.includes(presupuesto.id)
        ? idsActuales
        : [...idsActuales, presupuesto.id];
      const res = await fetch(`${API}/admin/facturas/${facturaSeleccionada.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...facturaSeleccionada,
          presupuesto_ids: nuevosIds,
          presupuesto_id: nuevosIds.length === 1 ? nuevosIds[0] : facturaSeleccionada.presupuesto_id,
        }),
      });
      if (!res.ok) { toast.error("Error al vincular factura"); setSavingFactura(false); return; }
      // Cambiar estado del presupuesto a "facturado" si no lo está
      const yaFacturado = presupuesto.estado === "facturado" || presupuesto.estado === "cobrado";
      if (!yaFacturado) {
        await fetch(`${API}/admin/presupuestos/${presupuesto.id}/estado?estado=facturado`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      toast.success("Factura vinculada al presupuesto correctamente");
      setShowFacturarModal(null);
      fetchData();
    } catch {
      toast.error("Error al vincular");
    } finally {
      setSavingFactura(false);
    }
  };

  const viewPresupuesto = async (presupuestoId) => {
    try {
      const response = await fetch(`${API}/admin/presupuestos/${presupuestoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setShowPreview(data);
        setPrintFileName(data.nombre_archivo ? `${data.numero} - ${data.nombre_archivo}` : `Presupuesto ${data.numero}`);
      }
    } catch (error) {
      toast.error("Error al cargar presupuesto");
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

  const getStatusColor = (estado) => {
    const colors = {
      borrador: "bg-slate-500",
      enviado: "bg-blue-500",
      aprobado: "bg-green-500",
      rechazado: "bg-red-500",
      facturado: "bg-orange-500",
      cobrado: "bg-emerald-600"
    };
    return colors[estado] || "bg-slate-500";
  };

  const getStatusIcon = (estado) => {
    const icons = {
      borrador: <Clock className="w-4 h-4" />,
      enviado: <Send className="w-4 h-4" />,
      aprobado: <CheckCircle className="w-4 h-4" />,
      rechazado: <XCircle className="w-4 h-4" />,
      facturado: <Receipt className="w-4 h-4" />,
      cobrado: <DollarSign className="w-4 h-4" />
    };
    return icons[estado] || <Clock className="w-4 h-4" />;
  };

  const getStatusLabel = (estado) => {
    const labels = {
      borrador: "Borrador",
      enviado: "Enviado",
      aprobado: "Aprobado",
      rechazado: "Rechazado",
      facturado: "Facturado",
      cobrado: "Cobrado"
    };
    return labels[estado] || estado;
  };

  // Default logo for new presupuestos: first accessible logo, or "arandujar" for admins
  const getDefaultLogo = () => {
    if (logosAccesibles.length === 1) return logosAccesibles[0].slug;
    if (logosAccesibles.length > 1) return logosAccesibles[0].slug;
    return "arandujar";
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      empresa_id: empresaFilter || "",
      numero: "",
      nombre_archivo: "",
      logo_tipo: getDefaultLogo(),
      moneda: "PYG",
      forma_pago: "contado",
      fecha: new Date().toISOString().split('T')[0],
      validez_dias: 15,
      tipo_cambio: "",
      modo: "libre",
      items: [{ descripcion: "", observacion: "", observacion_oculta: "", cantidad: 1, costo: 0, margen: 30, precio_unitario: 0, subtotal: 0, moneda_item: "", tipo_cambio_item: "", proveedor_id: "", proveedor_nombre: "", producto_id: "", imagen: null, imagen_comentario: "" }],
      observaciones: "",
      condiciones: "- Precios expresados en Guaraníes (IVA incluido).\n- Validez de la oferta: 15 días.\n- Forma de pago: Al contado.\n- Tiempo de entrega: A confirmar según stock."
    });
  };

  const handleEdit = (presupuesto) => {
    const moneda = presupuesto.moneda || "PYG";
    const validez = presupuesto.validez_dias || 15;
    const formaPago = presupuesto.forma_pago || "contado";
    setEditingId(presupuesto.id);
    setFormData({
      empresa_id: presupuesto.empresa_id,
      numero: presupuesto.numero || "",
      nombre_archivo: presupuesto.nombre_archivo || "",
      logo_tipo: presupuesto.logo_tipo || "arandujar",
      moneda: moneda,
      forma_pago: formaPago,
      fecha: presupuesto.fecha,
      validez_dias: validez,
      tipo_cambio: presupuesto.tipo_cambio || "",
      modo: presupuesto.modo || "libre",
      items: presupuesto.items.map(item => ({ ...item, moneda_item: item.moneda_item || "", tipo_cambio_item: item.tipo_cambio_item || "", proveedor_id: item.proveedor_id || "", proveedor_nombre: item.proveedor_nombre || "", producto_id: item.producto_id || "", imagen: item.imagen || null, imagen_comentario: item.imagen_comentario || "" })),
      observaciones: presupuesto.observaciones || "",
      condiciones: buildCondiciones(moneda, validez, formaPago)
    });
    setShowForm(true);
  };

  const handleDuplicate = (presupuesto) => {
    const moneda = presupuesto.moneda || "PYG";
    const validez = presupuesto.validez_dias || 15;
    const formaPago = presupuesto.forma_pago || "contado";
    setEditingId(null);
    setFormData({
      empresa_id: presupuesto.empresa_id,
      numero: "",
      nombre_archivo: presupuesto.nombre_archivo || "",
      logo_tipo: presupuesto.logo_tipo || "arandujar",
      moneda: moneda,
      forma_pago: formaPago,
      fecha: new Date().toISOString().split('T')[0],
      validez_dias: validez,
      tipo_cambio: presupuesto.tipo_cambio || "",
      modo: presupuesto.modo || "libre",
      items: presupuesto.items.map(item => ({ ...item, moneda_item: item.moneda_item || "", tipo_cambio_item: item.tipo_cambio_item || "", proveedor_id: item.proveedor_id || "", proveedor_nombre: item.proveedor_nombre || "", producto_id: item.producto_id || "", imagen: item.imagen || null, imagen_comentario: item.imagen_comentario || "" })),
      observaciones: presupuesto.observaciones || "",
      condiciones: buildCondiciones(moneda, validez, formaPago)
    });
    setShowForm(true);
    toast.info("Presupuesto duplicado - Modifique y guarde");
  };

  // === COSTOS REALES ===
  const openCostos = async (presupuesto) => {
    try {
      const res = await fetch(`${API}/admin/presupuestos/${presupuesto.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const full = await res.json();
        setShowCostos(full);
        setProvMonedaDisplay({});
        if (full.costos_reales) {
          // Asegurar campos de moneda en items existentes
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
              costo_estimado: item.costo,   // en moneda_item original
              costo_real: item.costo,
              observacion: item.observacion || "",
              observacion_oculta: item.observacion_oculta || "",
              proveedor: "",
              es_nuevo: false,
              moneda_item: mItem,
              tipo_cambio_item: tcItem,
              moneda_costo: mItem,           // real arranca en misma moneda
              tipo_cambio_costo: tcItem
            };
          });
          // total_costos en moneda del documento
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

  // Convierte un monto desde monedaOrigen a la moneda del documento
  const convertToDocMoneda = (amount, monedaOrigen, tcOverride, docMoneda, docTC) => {
    const mOrig = monedaOrigen || docMoneda;
    if (mOrig === docMoneda) return amount;
    const tc = parseFloat(tcOverride) || parseFloat(docTC) || 1;
    if (docMoneda === "PYG" && mOrig === "USD") return amount * tc;
    if (docMoneda === "USD" && mOrig === "PYG") return tc > 0 ? amount / tc : 0;
    return amount;
  };

  const recalcCostos = (items, proveedoresPagos) => {
    const docMoneda = showCostos?.moneda || "PYG";
    const docTC = showCostos?.tipo_cambio;
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

    const total_facturado = costosData?.total_facturado || showCostos?.total || 0;
    const ganancia = isUSD
      ? Math.round((total_facturado - total_costos) * 100) / 100
      : Math.round(total_facturado - total_costos);

    // Totales por proveedor (también convertidos)
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
    newItems[index] = { ...newItems[index], [field]: field === "cantidad" ? (parseFloat(value) || 0) : field === "costo_real" ? (parseFloat(value) || 0) : value };
    recalcCostos(newItems, costosData.proveedores_pagos);
  };

  const addCostoItem = () => {
    const docMoneda = showCostos?.moneda || "PYG";
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
    if (!showCostos) return;
    setSavingCostos(true);
    try {
      const res = await fetch(`${API}/admin/presupuestos/${showCostos.id}/costos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(costosData)
      });
      if (res.ok) {
        toast.success("Costos guardados correctamente");
        fetchData();
      } else {
        toast.error("Error al guardar costos");
      }
    } catch (err) {
      toast.error("Error de conexión");
    } finally {
      setSavingCostos(false);
    }
  };

  const totals = calculateTotals();

  // Helper: convierte File a base64
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleItemImageUpload = async (index, file) => {
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const newItems = [...formData.items];
      newItems[index] = { ...newItems[index], imagen: base64 };
      setFormData({ ...formData, items: newItems });
    } catch (e) { console.error("Error al cargar imagen", e); }
  };

  // SVG del logo Arandu (icono geométrico 3D + tipografía con colores bandera PY)
  const buildLogoSVG = (logoTipo) => {
    const isJAR = logoTipo === "jar";
    const isBoth = logoTipo === "arandujar" || (!logoTipo);
    // Icono hexagonal 3D estilo diamante
    const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
      <defs>
        <linearGradient id="gTop" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#2563eb"/></linearGradient>
        <linearGradient id="gLeft" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#1e3a8a"/></linearGradient>
        <linearGradient id="gRight" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient>
      </defs>
      <!-- Cara superior -->
      <polygon points="26,4 44,15 26,26 8,15" fill="url(#gTop)" opacity="0.95"/>
      <!-- Cara izquierda -->
      <polygon points="8,15 26,26 26,48 8,37" fill="url(#gLeft)" opacity="0.90"/>
      <!-- Cara derecha -->
      <polygon points="44,15 26,26 26,48 44,37" fill="url(#gRight)" opacity="0.85"/>
    </svg>`;

    // Texto según empresa
    let nombreHTML = "";
    if (isJAR) {
      nombreHTML = `<span style="color:#dc2626;font-weight:900;font-size:22px;letter-spacing:1px">JAR</span>`;
    } else if (isBoth) {
      nombreHTML = `<span style="color:#2563eb;font-weight:900;font-size:22px;letter-spacing:1px">ARANDU</span><span style="color:#dc2626;font-weight:900;font-size:22px">&amp;</span><span style="color:#dc2626;font-weight:900;font-size:19px">JAR</span>`;
    } else {
      // arandu solo — SVG con clipPath (más confiable que linearGradient en Safari/Mac/PDF)
      // Recorta 3 rectángulos de color con la forma del texto → tricolor bandera PY dentro de cada letra
      nombreHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="30" viewBox="0 0 190 30" style="display:inline-block;vertical-align:middle">
        <defs>
          <clipPath id="arClip">
            <text x="1" y="26" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="900" letter-spacing="2">ARANDU</text>
          </clipPath>
        </defs>
        <rect x="0" y="0"  width="190" height="10" fill="#cc0001" clip-path="url(#arClip)"/>
        <rect x="0" y="10" width="190" height="10" fill="#ffffff" clip-path="url(#arClip)"/>
        <rect x="0" y="20" width="190" height="10" fill="#1a47af" clip-path="url(#arClip)"/>
      </svg>`;
    }

    return `<div style="display:flex;align-items:center;gap:8px">
      ${iconSVG}
      <div style="line-height:1">
        <div style="margin:0;padding:0">${nombreHTML}</div>
        <div style="font-size:9px;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-top:1px">INFORMÁTICA</div>
      </div>
    </div>`;
  };

  // Genera el encabezado premium con degradado para los documentos impresos
  const buildHeaderHTML = (logoTipo, numero, fecha, validezDias) => {
    const isJAR = logoTipo === "jar";
    const gradFrom = isJAR ? "#1e1e2e" : "#0f172a";
    const gradTo = isJAR ? "#450a0a" : "#0e2a5c";
    const accentColor = isJAR ? "#dc2626" : "#2563eb";
    const accentLight = isJAR ? "#fca5a5" : "#93c5fd";

    return `
    <div style="background:linear-gradient(135deg,${gradFrom} 0%,${gradTo} 60%,#0f172a 100%);padding:18px 22px 16px;border-radius:0;margin-bottom:0;position:relative;overflow:hidden">
      <!-- Decoración geométrica fondo -->
      <div style="position:absolute;right:-20px;top:-20px;width:120px;height:120px;border-radius:50%;background:${accentColor};opacity:0.08"></div>
      <div style="position:absolute;right:60px;bottom:-30px;width:80px;height:80px;border-radius:50%;background:${accentLight};opacity:0.06"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1">
        <!-- Izquierda: logo + datos empresa -->
        <div>
          ${buildLogoSVG(logoTipo)}
          <div style="margin-top:10px;font-size:10px;color:#94a3b8;line-height:1.7">
            <div>📍 De la Conquista 1132 c/ Isabel la Católica, Sajonia, Asunción</div>
            <div>📞 021-421330 &nbsp;|&nbsp; 📱 0981 500 282</div>
            <div>✉️ info@aranduinformatica.net</div>
          </div>
        </div>
        <!-- Derecha: badge PRESUPUESTO -->
        <div style="text-align:right">
          <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:12px 18px;backdrop-filter:blur(4px)">
            <div style="font-size:11px;font-weight:700;color:${accentLight};letter-spacing:4px;text-transform:uppercase;margin-bottom:4px">PRESUPUESTO</div>
            <div style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:1px">${numero}</div>
            <div style="width:100%;height:2px;background:linear-gradient(to right,${accentColor},${accentLight});border-radius:2px;margin:6px 0"></div>
            <div style="font-size:10px;color:#94a3b8">📅 ${fecha}</div>
            <div style="font-size:10px;color:#94a3b8">⏳ Válido ${validezDias} días</div>
          </div>
        </div>
      </div>
    </div>
    <!-- Banda acento bajo el header -->
    <div style="height:3px;background:linear-gradient(to right,${accentColor},${accentLight},transparent)"></div>`;
  };

  // Helper: renderiza imagen de un ítem si existe
  const buildItemImageHTML = (item) => {
    if (!item.imagen) return "";
    return `
      <div style="margin-top:6px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;display:inline-block;max-width:180px">
        <img src="${item.imagen}" style="display:block;max-width:180px;max-height:130px;object-fit:contain" alt="${item.descripcion || ''}"/>
        ${item.imagen_comentario ? `<div style="background:#f9fafb;padding:4px 6px;font-size:9px;color:#4b5563;font-style:italic">${item.imagen_comentario}</div>` : ""}
      </div>`;
  };

  // Impresión completa: todos los ítems en una sola ventana limpia (sin encabezado del navegador)
  const handlePrintCompleto = () => {
    if (!showPreview) return;
    const moneda = showPreview.moneda || "PYG";
    const isUSD = moneda === "USD";
    const emp = empresas.find(e => e.id === showPreview.empresa_id);
    const ruc = emp?.ruc || "";
    const formaPagoLabel = (showPreview.forma_pago || "contado") === "credito" ? "A crédito" : "Al contado";

    const hasImages = showPreview.items.some(i => i.imagen);
    const itemsRows = showPreview.items.map((item, idx) => `
      <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="border:1px solid #e2e8f0;padding:7px 10px;color:#1e293b;font-size:11px;vertical-align:top">
          <div style="font-weight:600;color:#0f172a">${item.descripcion || ""}</div>
          ${item.observacion ? `<div style="color:#64748b;font-size:10px;font-style:italic;margin-top:2px">${item.observacion}</div>` : ""}
          ${buildItemImageHTML(item)}
        </td>
        <td style="border:1px solid #e2e8f0;padding:7px 5px;text-align:center;color:#1e293b;font-size:11px;vertical-align:top">${item.cantidad}</td>
        <td style="border:1px solid #e2e8f0;padding:7px 8px;text-align:right;color:#1e293b;font-size:11px;vertical-align:top">${formatNumber(item.precio_unitario, moneda)} ${getCurrencySymbol(moneda)}</td>
        <td style="border:1px solid #e2e8f0;padding:7px 8px;text-align:right;color:#1e293b;font-size:11px;font-weight:600;vertical-align:top">${formatNumber(item.subtotal, moneda)} ${getCurrencySymbol(moneda)}</td>
      </tr>
    `).join("");

    const roundVal = v => isUSD ? Math.round(v * 100) / 100 : Math.round(v);
    const total = showPreview.total || 0;
    const iva = roundVal(total / 11);
    const subtotal = roundVal(total - iva);
    const accentColor = showPreview.logo_tipo === "jar" ? "#dc2626" : "#2563eb";
    const accentBg = showPreview.logo_tipo === "jar" ? "#fef2f2" : "#eff6ff";

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${printFileName || `Presupuesto ${showPreview.numero}`}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: white; color: #1e293b; }
    @media print { @page { size: A4; margin: 0; } body { padding: 0; } .content { padding: 8mm 10mm; } }
    .content { padding: 8mm 10mm; }
  </style>
</head>
<body>
  ${buildHeaderHTML(showPreview.logo_tipo, showPreview.numero, showPreview.fecha, showPreview.validez_dias)}

  <div class="content">
  <!-- Cliente -->
  <div style="background:${accentBg};padding:10px 14px;margin-bottom:14px;border-left:4px solid ${accentColor};border-radius:0 6px 6px 0">
    <div style="font-weight:700;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px">Cliente</div>
    <div style="font-size:14px;font-weight:700;color:#0f172a">${showPreview.empresa_nombre}</div>
    ${ruc ? `<div style="font-size:10px;color:#475569;margin-top:1px">RUC: ${ruc}</div>` : ""}
    <div style="font-size:10px;color:#475569;margin-top:1px">Forma de pago: <strong style="color:${accentColor}">${formaPagoLabel}</strong></div>
  </div>

  <!-- Tabla de ítems -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
    <thead>
      <tr style="background:${accentColor}">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#ffffff;font-weight:700">Descripción</th>
        <th style="padding:8px 5px;text-align:center;width:45px;font-size:11px;color:#ffffff;font-weight:700">Cant.</th>
        <th style="padding:8px 8px;text-align:right;width:115px;font-size:11px;color:#ffffff;font-weight:700">Precio Unit.</th>
        <th style="padding:8px 8px;text-align:right;width:115px;font-size:11px;color:#ffffff;font-weight:700">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
    <tfoot>
      <tr style="background:${accentBg}">
        <td colspan="3" style="border-top:2px solid ${accentColor};padding:7px 10px;text-align:right;font-weight:700;font-size:10px;color:#475569">Base imponible:</td>
        <td style="border-top:2px solid ${accentColor};padding:7px 8px;text-align:right;font-size:10px;color:#475569">${formatNumber(subtotal, moneda)} ${getCurrencySymbol(moneda)}</td>
      </tr>
      <tr style="background:${accentBg}">
        <td colspan="3" style="padding:4px 10px;text-align:right;font-size:10px;color:#64748b">IVA incluido (10%):</td>
        <td style="padding:4px 8px;text-align:right;font-size:10px;color:#64748b">${formatNumber(iva, moneda)} ${getCurrencySymbol(moneda)}</td>
      </tr>
      <tr style="background:${accentColor}">
        <td colspan="3" style="padding:10px;text-align:right;font-weight:800;font-size:14px;color:#ffffff;letter-spacing:1px">TOTAL:</td>
        <td style="padding:10px 8px;text-align:right;font-weight:800;font-size:14px;color:#ffffff">${formatNumber(total, moneda)} ${getCurrencySymbol(moneda)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Condiciones -->
  <div style="margin-top:14px;font-size:10px;color:#475569;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:10px">
    ${showPreview.observaciones ? `<div style="margin-bottom:8px;background:#fefce8;padding:8px 10px;border-left:3px solid #ca8a04;border-radius:0 4px 4px 0"><strong style="color:#92400e">Observaciones:</strong><br>${showPreview.observaciones.replace(/\n/g, "<br>")}</div>` : ""}
    <div><strong style="color:#374151">Condiciones:</strong><br>${(showPreview.condiciones || "").replace(/\n/g, "<br>")}</div>
  </div>
  </div>
</body>
</html>`;

    const pw = window.open("", "_blank", "width=900,height=700");
    if (!pw) { alert("Permita ventanas emergentes para imprimir."); return; }
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    setTimeout(() => { pw.print(); }, 700);
  };

  // Impresión por partes: máx 15 ítems por hoja, IVA propio, numeración -2/-3
  const handlePrintPorPartes = () => {
    if (!showPreview) return;
    const moneda = showPreview.moneda || "PYG";
    const isUSD = moneda === "USD";
    const emp = empresas.find(e => e.id === showPreview.empresa_id);
    const ruc = emp?.ruc || "";
    const formaPagoLabel = (showPreview.forma_pago || "contado") === "credito" ? "A crédito" : "Al contado";

    const ITEMS_POR_HOJA = 15;
    const allItems = showPreview.items;
    const chunks = [];
    for (let i = 0; i < allItems.length; i += ITEMS_POR_HOJA) {
      chunks.push(allItems.slice(i, i + ITEMS_POR_HOJA));
    }
    const totalHojas = chunks.length;

    const pagesHTML = chunks.map((chunkItems, idx) => {
      const partNum = idx + 1;
      const numero = partNum === 1 ? showPreview.numero : `${showPreview.numero}-${partNum}`;
      const isLastHoja = idx === totalHojas - 1;

      // Calcular totales de esta hoja
      const chunkTotal = chunkItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
      const roundVal = v => isUSD ? Math.round(v * 100) / 100 : Math.round(v);
      const chunkIva = roundVal(chunkTotal / 11);
      const chunkSubtotal = roundVal(chunkTotal - chunkIva);

      const itemsRows = chunkItems.map((item, idx) => `
        <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}">
          <td style="border:1px solid #e2e8f0;padding:7px 10px;color:#1e293b;font-size:11px;vertical-align:top">
            <div style="font-weight:600;color:#0f172a">${item.descripcion || ""}</div>
            ${item.observacion ? `<div style="color:#64748b;font-size:10px;font-style:italic;margin-top:2px">${item.observacion}</div>` : ""}
            ${buildItemImageHTML(item)}
          </td>
          <td style="border:1px solid #e2e8f0;padding:7px 5px;text-align:center;color:#1e293b;font-size:11px;vertical-align:top">${item.cantidad}</td>
          <td style="border:1px solid #e2e8f0;padding:7px 8px;text-align:right;color:#1e293b;font-size:11px;vertical-align:top">${formatNumber(item.precio_unitario, moneda)} ${getCurrencySymbol(moneda)}</td>
          <td style="border:1px solid #9ca3af;padding:5px;text-align:right;color:#1f2937;font-size:11px">${formatNumber(item.subtotal, moneda)} ${getCurrencySymbol(moneda)}</td>
        </tr>
      `).join("");

      const condicionesSection = isLastHoja ? `
        <div style="margin-top:12px;font-size:10px;color:#4b5563;line-height:1.5">
          ${showPreview.observaciones ? `<div style="margin-bottom:6px"><strong>Observaciones:</strong><br>${showPreview.observaciones.replace(/\n/g, "<br>")}</div>` : ""}
          <div><strong>Condiciones:</strong><br>${(showPreview.condiciones || "").replace(/\n/g, "<br>")}</div>
        </div>
      ` : `<div style="text-align:right;font-size:10px;color:#6b7280;margin-top:6px">Hoja ${partNum} de ${totalHojas} — continúa en siguiente hoja</div>`;

      const accentColor = showPreview.logo_tipo === "jar" ? "#dc2626" : "#2563eb";
      const accentBg = showPreview.logo_tipo === "jar" ? "#fef2f2" : "#eff6ff";

      return `
        <div style="page-break-after:${isLastHoja ? "auto" : "always"};background:white">
          ${buildHeaderHTML(showPreview.logo_tipo, numero, showPreview.fecha, showPreview.validez_dias)}

          <div style="padding:6mm 10mm">
          <!-- Cliente -->
          <div style="background:${accentBg};padding:10px 14px;margin-bottom:12px;border-left:4px solid ${accentColor};border-radius:0 6px 6px 0">
            <div style="font-weight:700;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px">Cliente</div>
            <div style="font-size:14px;font-weight:700;color:#0f172a">${showPreview.empresa_nombre}</div>
            ${ruc ? `<div style="font-size:10px;color:#475569;margin-top:1px">RUC: ${ruc}</div>` : ""}
            <div style="font-size:10px;color:#475569;margin-top:1px">Forma de pago: <strong style="color:${accentColor}">${formaPagoLabel}</strong></div>
          </div>

          <!-- Tabla de ítems -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:${accentColor}">
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#ffffff;font-weight:700">Descripción</th>
                <th style="padding:8px 5px;text-align:center;width:45px;font-size:11px;color:#ffffff;font-weight:700">Cant.</th>
                <th style="padding:8px 8px;text-align:right;width:115px;font-size:11px;color:#ffffff;font-weight:700">Precio Unit.</th>
                <th style="padding:8px 8px;text-align:right;width:115px;font-size:11px;color:#ffffff;font-weight:700">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
            <tfoot>
              <tr style="background:${accentBg}">
                <td colspan="3" style="border-top:2px solid ${accentColor};padding:5px 10px;text-align:right;font-size:10px;color:#475569">Base imponible:</td>
                <td style="border-top:2px solid ${accentColor};padding:5px 8px;text-align:right;font-size:10px;color:#475569">${formatNumber(chunkSubtotal, moneda)} ${getCurrencySymbol(moneda)}</td>
              </tr>
              <tr style="background:${accentBg}">
                <td colspan="3" style="padding:4px 10px;text-align:right;font-size:10px;color:#64748b">IVA incluido (10%):</td>
                <td style="padding:4px 8px;text-align:right;font-size:10px;color:#64748b">${formatNumber(chunkIva, moneda)} ${getCurrencySymbol(moneda)}</td>
              </tr>
              <tr style="background:${accentColor}">
                <td colspan="3" style="padding:9px 10px;text-align:right;font-weight:800;font-size:13px;color:#ffffff;letter-spacing:1px">TOTAL:</td>
                <td style="padding:9px 8px;text-align:right;font-weight:800;font-size:13px;color:#ffffff">${formatNumber(chunkTotal, moneda)} ${getCurrencySymbol(moneda)}</td>
              </tr>
            </tfoot>
          </table>

          ${condicionesSection}
          </div>
        </div>
      `;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${printFileName || `Presupuesto ${showPreview.numero}`}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: white; color: #1e293b; }
    @media print { @page { size: A4; margin: 0; } }
  </style>
</head>
<body>${pagesHTML}</body>
</html>`;

    const pw = window.open("", "_blank", "width=900,height=700");
    if (!pw) { alert("Permita ventanas emergentes para imprimir."); return; }
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    setTimeout(() => { pw.print(); }, 700);
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <FileText className="w-8 h-8 text-arandu-red" />
            Presupuestos
          </h1>
          {empresaFilter && (
            <p className="text-slate-400 mt-1">
              Filtrando por: {empresas.find(e => e.id === empresaFilter)?.nombre || "..."}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/admin/estadisticas">
            <Button variant="outline" className="border-arandu-blue/30 text-arandu-blue hover:bg-arandu-blue/10" data-testid="stats-btn">
              <BarChart3 className="w-4 h-4 mr-2" />
              Estadísticas
            </Button>
          </Link>
          {canCreate && (
            <Button 
              onClick={() => setShowForm(true)}
              className="bg-arandu-red hover:bg-arandu-red-dark text-white"
              data-testid="new-presupuesto-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Presupuesto
            </Button>
          )}
        </div>
      </div>

      {/* Buscador + Filtro empresa */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por número, empresa, descripción..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-arandu-dark-light border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-arandu-blue/50 placeholder-slate-500"
          />
        </div>
        <select
          value={clienteFilter}
          onChange={e => setClienteFilter(e.target.value)}
          className="bg-arandu-dark-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-arandu-blue/50"
        >
          <option value="">Todos los clientes</option>
          {empresas
            .filter(e => !logoFilter || (e.logo_tipo || "arandujar") === logoFilter)
            .map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
        </select>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2 mb-6" data-testid="status-filters">
        {[
          { value: "", label: "Todos", icon: <Filter className="w-3 h-3" /> },
          { value: "borrador", label: "Borradores", icon: <Clock className="w-3 h-3" /> },
          { value: "aprobado", label: "Aprobados", icon: <CheckCircle className="w-3 h-3" /> },
          { value: "facturado", label: "Facturados", icon: <Receipt className="w-3 h-3" /> },
          { value: "cobrado", label: "Cobrados", icon: <DollarSign className="w-3 h-3" /> },
          { value: "rechazado", label: "Rechazados", icon: <XCircle className="w-3 h-3" /> },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setEstadoFilter(f.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              estadoFilter === f.value
                ? f.value === "aprobado" ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : f.value === "facturado" ? "bg-orange-500/20 text-orange-400 border border-orange-500/50"
                : f.value === "cobrado" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                : f.value === "rechazado" ? "bg-red-500/20 text-red-400 border border-red-500/50"
                : f.value === "borrador" ? "bg-slate-500/20 text-slate-300 border border-slate-500/50"
                : "bg-arandu-blue/20 text-arandu-blue border border-arandu-blue/50"
                : "bg-arandu-dark-lighter text-slate-400 border border-white/5 hover:border-white/20"
            }`}
            data-testid={`filter-${f.value || "all"}`}
          >
            {f.icon}
            {f.label}
          </button>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && resetForm()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-arandu-dark-light border border-white/10 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl font-bold text-white flex items-center gap-2">
                <Calculator className="w-6 h-6 text-arandu-blue" />
                {editingId ? "Editar Presupuesto" : "Nuevo Presupuesto"}
              </h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Empresa & Logo Selection */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-sm mb-2">Empresa *</label>
                  <select
                    value={formData.empresa_id}
                    onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                    className="w-full bg-arandu-dark border border-white/10 text-white rounded-md px-4 py-3"
                    required
                    data-testid="select-empresa"
                  >
                    <option value="">Seleccionar empresa...</option>
                    {empresas.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-sm mb-2">Fecha del Presupuesto</label>
                  <Input
                    type="date"
                    value={formData.fecha}
                    onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                    className="bg-arandu-dark border-white/10 text-white"
                  />
                </div>
              </div>

              {/* Número de Presupuesto */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">
                  Número de Presupuesto
                  <span className="ml-2 text-slate-500 text-xs">(dejar en blanco para asignar automáticamente)</span>
                </label>
                <Input
                  type="text"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  placeholder={editingId ? formData.numero || "Ej: P2025-0042" : "Ej: P2025-0042 — se asigna automáticamente si se deja vacío"}
                  className="bg-arandu-dark border-white/10 text-white placeholder:text-slate-600"
                />
              </div>

              {/* Nombre del archivo */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">
                  Nombre del presupuesto
                  <span className="ml-2 text-slate-500 text-xs">(descripción corta para identificarlo fácilmente)</span>
                </label>
                <Input
                  type="text"
                  value={formData.nombre_archivo}
                  onChange={(e) => setFormData({ ...formData, nombre_archivo: e.target.value })}
                  placeholder="Ej: Renovación servidores, Soporte anual cliente..."
                  className="bg-arandu-dark border-white/10 text-white placeholder:text-slate-600"
                />
              </div>

              {/* Empresa activa (solo muestra info, logo_tipo se auto-asigna) */}
              {activeEmpresaPropia && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-white/10 bg-white/3">
                  {activeEmpresaPropia.logo_url ? (
                    <img src={activeEmpresaPropia.logo_url} alt={activeEmpresaPropia.nombre} className="h-6 object-contain" />
                  ) : (
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: activeEmpresaPropia.color || "#3b82f6" }} />
                  )}
                  <span className="text-white text-sm font-medium">{activeEmpresaPropia.nombre}</span>
                  <span className="text-slate-500 text-xs ml-auto">Empresa activa</span>
                </div>
              )}

              {/* Moneda Selection */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">Moneda</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateMoneda("PYG")}
                    className={`flex-1 p-3 rounded-lg border transition-all ${
                      formData.moneda === "PYG" 
                        ? 'border-green-500 bg-green-500/20' 
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span className={`text-sm font-medium ${formData.moneda === "PYG" ? 'text-green-400' : 'text-slate-400'}`}>
                      ₲ Guaraníes
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateMoneda("USD")}
                    className={`flex-1 p-3 rounded-lg border transition-all ${
                      formData.moneda === "USD" 
                        ? 'border-green-500 bg-green-500/20' 
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span className={`text-sm font-medium ${formData.moneda === "USD" ? 'text-green-400' : 'text-slate-400'}`}>
                      US$ Dólares
                    </span>
                  </button>
                </div>
              </div>

              {/* Tipo de Cambio Global */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">
                  Tipo de cambio
                  <span className="ml-2 text-slate-500 text-xs">
                    {formData.moneda === "PYG" ? "USD 1 = ₲ ?" : "₲ ? = USD 1"} — usado cuando un ítem tiene moneda diferente al documento
                  </span>
                </label>
                <Input
                  type="number"
                  value={formData.tipo_cambio}
                  onChange={(e) => updateTipoCambio(e.target.value)}
                  placeholder={formData.moneda === "PYG" ? "Ej: 7800" : "Ej: 7800"}
                  className="bg-arandu-dark border-white/10 text-white"
                />
              </div>

              {/* Forma de Pago */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">Forma de Pago</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateFormaPago("contado")}
                    className={`flex-1 p-3 rounded-lg border transition-all ${
                      formData.forma_pago === "contado"
                        ? 'border-arandu-blue bg-arandu-blue/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span className={`text-sm font-medium ${formData.forma_pago === "contado" ? 'text-arandu-blue' : 'text-slate-400'}`}>
                      💵 Al contado
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateFormaPago("credito")}
                    className={`flex-1 p-3 rounded-lg border transition-all ${
                      formData.forma_pago === "credito"
                        ? 'border-arandu-blue bg-arandu-blue/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span className={`text-sm font-medium ${formData.forma_pago === "credito" ? 'text-arandu-blue' : 'text-slate-400'}`}>
                      💳 A crédito
                    </span>
                  </button>
                </div>
              </div>

              {/* Mode Toggle — sólo visible si el usuario tiene permiso presupuestos.modo_libre (admins siempre) */}
              {(user?.role === "admin" || hasPermission("presupuestos.modo_libre")) ? (
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-slate-400 text-sm">Modo de carga:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, modo: "libre" }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        formData.modo !== "productos"
                          ? 'border-arandu-blue bg-arandu-blue/20 text-arandu-blue'
                          : 'border-white/10 text-slate-400 hover:border-white/30'
                      }`}
                    >
                      ✏️ Libre
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, modo: "productos" }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        formData.modo === "productos"
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                          : 'border-white/10 text-slate-400 hover:border-white/30'
                      }`}
                    >
                      📦 Por catálogo
                    </button>
                  </div>
                </div>
              ) : (
                <input type="hidden" value="productos" onChange={() => {}} />
              )}

              {/* Items Table */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">Productos / Servicios</label>
                <div className="bg-arandu-dark rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left p-3 text-slate-400 font-medium">Descripción</th>
                        <th className="text-center p-3 text-slate-400 font-medium w-20">Cant.</th>
                        <th className="text-right p-3 text-slate-400 font-medium w-36">
                          Costo
                          <span className="block text-xs text-slate-600 font-normal">moneda</span>
                        </th>
                        <th className="text-center p-3 text-slate-400 font-medium w-20">% Gan.</th>
                        <th className="text-right p-3 text-slate-400 font-medium w-32">
                          Precio Unit.
                          <span className="block text-xs text-slate-600 font-normal">{formData.moneda === "PYG" ? "₲" : "USD"}</span>
                        </th>
                        <th className="text-right p-3 text-slate-400 font-medium w-32">
                          Subtotal
                          <span className="block text-xs text-slate-600 font-normal">{formData.moneda === "PYG" ? "₲" : "USD"}</span>
                        </th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, index) => (
                        <tr key={index} className="border-b border-white/5">
                          <td className="p-2">
                            {formData.modo === "productos" && (
                              <select
                                value={item.producto_id || ""}
                                onChange={e => selectProductoForItem(index, e.target.value)}
                                className="w-full mb-1 bg-arandu-panel border border-white/10 rounded text-sm text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                              >
                                <option value="">— Seleccionar del catálogo —</option>
                                {productos.filter(p => p.activo !== false).map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.nombre}{p.sku ? ` (${p.sku})` : ""} — stock: {p.stock_actual ?? 0}
                                  </option>
                                ))}
                              </select>
                            )}
                            <Input
                              type="text"
                              value={item.descripcion}
                              onChange={(e) => updateItem(index, "descripcion", e.target.value)}
                              className="bg-transparent border-white/10 text-white text-sm mb-1"
                              placeholder="Descripción del producto..."
                            />
                            <Input
                              type="text"
                              value={item.observacion || ""}
                              onChange={(e) => updateItem(index, "observacion", e.target.value)}
                              className="bg-transparent border-white/5 text-yellow-400/80 text-xs italic"
                              placeholder="Obs: destino, ubicación..."
                              data-testid={`item-obs-${index}`}
                            />
                            <Input
                              type="text"
                              value={item.observacion_oculta || ""}
                              onChange={(e) => updateItem(index, "observacion_oculta", e.target.value)}
                              className="bg-transparent border-dashed border-white/5 text-orange-300/80 text-xs italic mt-1"
                              placeholder="🔒 Obs interna (solo visible en costos)"
                              data-testid={`item-obs-oculta-${index}`}
                              title="Esta nota solo se ve en la vista de costos, no aparece en el presupuesto final"
                            />
                            {proveedores.filter(p => !p.logo_tipo || p.logo_tipo === formData.logo_tipo).length > 0 && (
                              <select
                                value={item.proveedor_id || ""}
                                onChange={e => updateItem(index, "proveedor_id", e.target.value)}
                                className="mt-1 w-full bg-transparent border-0 border-b border-white/10 text-slate-500 text-xs font-body focus:outline-none focus:border-arandu-blue hover:text-slate-300 transition-colors"
                              >
                                <option value="">— Proveedor (opcional) —</option>
                                {proveedores
                                  .filter(p => !p.logo_tipo || p.logo_tipo === formData.logo_tipo)
                                  .map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                  ))}
                              </select>
                            )}
                            {/* Imagen del ítem */}
                            <div className="mt-2">
                              {item.imagen ? (
                                <div className="border border-white/10 rounded-lg overflow-hidden">
                                  <img src={item.imagen} alt="" className="w-full max-h-24 object-contain bg-black/20" />
                                  <div className="flex gap-1 p-1">
                                    <input
                                      type="text"
                                      value={item.imagen_comentario || ""}
                                      onChange={e => updateItem(index, "imagen_comentario", e.target.value)}
                                      className="flex-1 bg-transparent text-yellow-300/80 text-xs px-1 py-0.5 border-0 border-b border-white/10 focus:outline-none placeholder-slate-600"
                                      placeholder="Comentario de imagen..."
                                    />
                                    <button
                                      type="button"
                                      onClick={() => { updateItem(index, "imagen", null); updateItem(index, "imagen_comentario", ""); }}
                                      className="text-red-400 hover:text-red-300 text-xs px-1"
                                      title="Quitar imagen"
                                    >✕</button>
                                  </div>
                                </div>
                              ) : (
                                <label className="cursor-pointer flex items-center gap-1 text-slate-600 hover:text-slate-400 text-xs transition-colors">
                                  <span>📷</span>
                                  <span>Agregar imagen</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => handleItemImageUpload(index, e.target.files[0])}
                                  />
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => updateItem(index, "cantidad", parseInt(e.target.value) || 1)}
                              className="bg-transparent border-white/10 text-white text-sm text-center"
                              min="1"
                            />
                          </td>
                          <td className="p-2">
                            {/* Selector de moneda del ítem */}
                            <div className="flex gap-1 mb-1 justify-end">
                              {["PYG", "USD"].map(m => {
                                const isActive = (item.moneda_item || formData.moneda) === m;
                                const isDocMoneda = m === formData.moneda;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => updateItem(index, "moneda_item", isDocMoneda ? "" : m)}
                                    className={`px-1.5 py-0.5 rounded text-xs font-semibold transition-all border ${
                                      isActive
                                        ? m === "PYG"
                                          ? "bg-green-500/25 text-green-300 border-green-500/50"
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
                              value={item.costo}
                              onChange={(e) => updateItem(index, "costo", e.target.value)}
                              className="bg-transparent border-white/10 text-white text-sm text-right"
                              placeholder="0"
                            />
                            {/* Override de TC por ítem, solo si la moneda difiere */}
                            {(item.moneda_item && item.moneda_item !== formData.moneda) && (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-xs text-slate-500 whitespace-nowrap">TC:</span>
                                <Input
                                  type="number"
                                  value={item.tipo_cambio_item || ""}
                                  onChange={(e) => updateItem(index, "tipo_cambio_item", e.target.value)}
                                  className="bg-transparent border-white/5 text-slate-400 text-xs text-right"
                                  placeholder={formData.tipo_cambio ? String(formData.tipo_cambio) : "global"}
                                />
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={item.margen}
                              onChange={(e) => updateItem(index, "margen", e.target.value)}
                              className="bg-transparent border-white/10 text-arandu-blue text-sm text-center font-medium"
                              placeholder="30"
                            />
                          </td>
                          <td className="p-2 text-right text-slate-300">
                            {formatNumber(item.precio_unitario, formData.moneda)} {getCurrencySymbol(formData.moneda)}
                          </td>
                          <td className="p-2 text-right text-white font-medium">
                            {formatNumber(item.subtotal, formData.moneda)} {getCurrencySymbol(formData.moneda)}
                          </td>
                          <td className="p-2">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-slate-500 hover:text-arandu-red"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <div className="p-3 border-t border-white/10">
                    <Button
                      type="button"
                      onClick={addItem}
                      variant="ghost"
                      className="text-arandu-blue hover:bg-arandu-blue/10"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar Item
                    </Button>
                  </div>
                </div>

                {/* Totals */}
                <div className="mt-4 flex justify-end">
                  <div className="bg-arandu-dark rounded-lg p-4 w-72">
                    <div className="flex justify-between text-white font-bold text-lg mb-2 pb-2 border-b border-white/10">
                      <span>TOTAL:</span>
                      <span className="text-arandu-blue">{formatNumber(totals.total, formData.moneda)} {getCurrencySymbol(formData.moneda)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-sm">
                      <span>Base imponible:</span>
                      <span>{formatNumber(totals.subtotal, formData.moneda)} {getCurrencySymbol(formData.moneda)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-sm">
                      <span>IVA incluido (10%):</span>
                      <span>{formatNumber(totals.iva, formData.moneda)} {getCurrencySymbol(formData.moneda)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">Observaciones</label>
                <Textarea
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  className="bg-arandu-dark border-white/10 text-white resize-none"
                  rows={2}
                  placeholder="Observaciones adicionales..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  onClick={resetForm}
                  variant="outline"
                  className="flex-1 border-white/20 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-arandu-blue hover:bg-arandu-blue-dark text-white"
                  data-testid="save-presupuesto-btn"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingId ? "Actualizar Presupuesto" : "Crear Presupuesto"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowPreview(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto relative"
            id="presupuesto-print"
          >
            {/* Floating Action Buttons - always visible */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 p-3 flex flex-col gap-2 print:hidden" data-testid="preview-toolbar">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium text-sm">Vista previa del presupuesto</span>
                <div className="flex items-center gap-2">
                  <label className="text-gray-500 text-xs whitespace-nowrap">Nombre del archivo:</label>
                  <input
                    type="text"
                    value={printFileName}
                    onChange={(e) => setPrintFileName(e.target.value)}
                    placeholder={`Presupuesto ${showPreview?.numero || ""}`}
                    className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 w-56 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={handlePrintCompleto}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
                  data-testid="preview-print-btn"
                  title="Imprime el presupuesto completo"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir
                </Button>
                <Button
                  onClick={handlePrintPorPartes}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2"
                  data-testid="preview-print-partes-btn"
                  title="Imprime en hojas de hasta 15 ítems (formato factura)"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir por partes
                </Button>
                <Button
                  onClick={() => setShowPreview(null)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2"
                  data-testid="preview-close-btn"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cerrar
                </Button>
              </div>
            </div>

            {/* Print Header */}
            <div className="p-6 border-b print:p-4">
              <div className="flex justify-between items-start">
                <div>
                  {showPreview.logo_tipo === "arandu" && <LogoArandu />}
                  {showPreview.logo_tipo === "jar" && <LogoJar />}
                  {showPreview.logo_tipo === "arandujar" && <LogoAranduJar />}
                  <div className="mt-4 text-sm text-gray-600">
                    <p>De la Conquista 1132 c/ Isabel la Católica</p>
                    <p>Barrio Sajonia, Asunción - Paraguay</p>
                    <p>Tel: 021-421330 | WhatsApp: 0981 500 282</p>
                    <p>info@aranduinformatica.net</p>
                  </div>
                </div>
                <div className="text-right">
                  <h1 className="text-2xl font-bold text-gray-800">PRESUPUESTO</h1>
                  <p className="text-lg font-semibold text-blue-600">{showPreview.numero}</p>
                  <p className="text-gray-600">Fecha: {showPreview.fecha}</p>
                  <p className="text-gray-500 text-sm">Validez: {showPreview.validez_dias} días</p>
                </div>
              </div>
            </div>

            {/* Client Info */}
            <div className="p-6 bg-gray-50 print:p-4">
              <h3 className="font-semibold text-gray-700 mb-2">CLIENTE:</h3>
              <p className="text-lg font-medium text-gray-800">{showPreview.empresa_nombre}</p>
              {(() => { const emp = empresas.find(e => e.id === showPreview.empresa_id); return emp?.ruc ? <p className="text-sm text-gray-600">RUC: {emp.ruc}</p> : null; })()}
              <p className="text-sm text-gray-600 mt-1">Forma de pago: <strong>{(showPreview.forma_pago || "contado") === "credito" ? "A crédito" : "Al contado"}</strong></p>
            </div>

            {/* Items Table */}
            <div className="p-6 print:p-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-gray-400 p-2 text-left text-gray-800 font-bold">Descripción</th>
                    <th className="border border-gray-400 p-2 text-center w-20 text-gray-800 font-bold">Cant.</th>
                    <th className="border border-gray-400 p-2 text-right w-32 text-gray-800 font-bold">Precio Unit.</th>
                    <th className="border border-gray-400 p-2 text-right w-32 text-gray-800 font-bold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {showPreview.items.map((item, index) => (
                    <tr key={index} className="bg-white">
                      <td className="border border-gray-400 p-2 text-gray-800">
                        {item.descripcion}
                        {item.observacion && (
                          <p className="text-gray-500 text-xs italic mt-1">Obs: {item.observacion}</p>
                        )}
                      </td>
                      <td className="border border-gray-400 p-2 text-center text-gray-800">{item.cantidad}</td>
                      <td className="border border-gray-400 p-2 text-right text-gray-800">{formatNumber(item.precio_unitario, showPreview.moneda)} {getCurrencySymbol(showPreview.moneda)}</td>
                      <td className="border border-gray-400 p-2 text-right text-gray-800">{formatNumber(item.subtotal, showPreview.moneda)} {getCurrencySymbol(showPreview.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-100">
                    <td colSpan="3" className="border border-gray-400 p-2 text-right font-bold text-lg text-gray-900">TOTAL:</td>
                    <td className="border border-gray-400 p-2 text-right font-bold text-lg text-blue-700">{formatNumber(showPreview.total, showPreview.moneda)} {getCurrencySymbol(showPreview.moneda)}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td colSpan="3" className="border border-gray-400 p-2 text-right text-sm text-gray-600">Base imponible:</td>
                    <td className="border border-gray-400 p-2 text-right text-sm text-gray-600">{formatNumber(showPreview.subtotal, showPreview.moneda)} {getCurrencySymbol(showPreview.moneda)}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td colSpan="3" className="border border-gray-400 p-2 text-right text-sm text-gray-600">IVA incluido (10%):</td>
                    <td className="border border-gray-400 p-2 text-right text-sm text-gray-600">{formatNumber(showPreview.iva, showPreview.moneda)} {getCurrencySymbol(showPreview.moneda)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Conditions */}
            <div className="p-6 print:p-4">
              {showPreview.observaciones && (
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-700 mb-1">Observaciones:</h4>
                  <p className="text-gray-600 text-sm whitespace-pre-wrap">{showPreview.observaciones}</p>
                </div>
              )}
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">Condiciones:</h4>
                <p className="text-gray-600 text-sm whitespace-pre-wrap">{showPreview.condiciones}</p>
              </div>
            </div>

            {/* Bottom spacer for print */}
            <div className="p-4 print:hidden"></div>
          </motion.div>
        </motion.div>
      )}

      {/* Presupuestos List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-arandu-blue animate-pulse">Cargando...</div>
        </div>
      ) : presupuestos.length === 0 ? (
        <div className="text-center py-12 bg-arandu-dark-light border border-white/5 rounded-xl">
          <FileText className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 mb-4">No hay presupuestos</p>
          <Button onClick={() => setShowForm(true)} className="bg-arandu-red hover:bg-arandu-red-dark">
            <Plus className="w-4 h-4 mr-2" />
            Crear Primer Presupuesto
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {presupuestos.filter(p => {
            // Filtro logo_tipo
            if (logoFilter && logoFilter !== "todas" && p.logo_tipo !== logoFilter) return false;
            // Filtro cliente
            if (clienteFilter && p.empresa_id !== clienteFilter) return false;
            // Buscador: número, nombre archivo, empresa, descripción items
            if (searchTerm.trim()) {
              const q = searchTerm.toLowerCase();
              const empresa = empresas.find(e => e.id === p.empresa_id);
              const texto = [
                p.numero, p.nombre_archivo,
                empresa?.nombre, empresa?.razon_social,
                p.observaciones,
                ...(p.items || []).map(i => i.descripcion)
              ].filter(Boolean).join(" ").toLowerCase();
              if (!texto.includes(q)) return false;
            }
            return true;
          }).map((presupuesto) => (
            <motion.div
              key={presupuesto.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-arandu-dark-light border border-white/5 rounded-xl p-5 hover:border-arandu-blue/30 transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-arandu-red/20 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-arandu-red" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-semibold text-white">
                        {presupuesto.numero}
                        {presupuesto.nombre_archivo && (
                          <span className="text-slate-300 font-normal"> — {presupuesto.nombre_archivo}</span>
                        )}
                      </h3>
                      <span className={`${getStatusColor(presupuesto.estado)} px-2 py-0.5 rounded-full text-xs text-white flex items-center gap-1`}>
                        {getStatusIcon(presupuesto.estado)}
                        {getStatusLabel(presupuesto.estado)}
                      </span>
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                        {presupuesto.moneda === "USD" ? "US$" : "₲"}
                      </span>
                    </div>
                    <p className="text-slate-400 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {presupuesto.empresa_nombre}
                    </p>
                    <p className="text-slate-500 text-sm flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {presupuesto.fecha}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-slate-400 text-sm">Total</p>
                    <p className="text-xl font-heading font-bold text-arandu-blue">
                      {formatNumber(presupuesto.total, presupuesto.moneda || "PYG")} {getCurrencySymbol(presupuesto.moneda || "PYG")}
                    </p>
                  </div>
                  
                  <div className="flex gap-1 flex-wrap">
                    {/* Workflow buttons - permission based */}
                    {canEdit && (presupuesto.estado === "borrador" || presupuesto.estado === "enviado") && (
                      <Button 
                        onClick={() => updateEstado(presupuesto.id, "aprobado")}
                        variant="ghost" 
                        className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                        title="Aprobar"
                        data-testid={`approve-${presupuesto.id}`}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        <span className="text-xs hidden lg:inline">Aprobar</span>
                      </Button>
                    )}
                    {canEdit && presupuesto.estado === "aprobado" && (
                      <Button
                        onClick={() => { setShowFacturarModal(presupuesto); setFacturaForm({ numero: "", fecha: new Date().toISOString().split('T')[0], forma_pago: "contado", notas: "" }); }}
                        variant="ghost"
                        className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                        title="Crear Factura"
                        data-testid={`invoice-${presupuesto.id}`}
                      >
                        <Receipt className="w-4 h-4 mr-1" />
                        <span className="text-xs hidden lg:inline">Facturar</span>
                      </Button>
                    )}
                    {canEdit && (presupuesto.estado === "facturado" || presupuesto.estado === "cobrado") && presupuesto.facturas_count === 0 && (
                      <Button
                        onClick={() => { setShowFacturarModal(presupuesto); setFacturaForm({ numero: "", fecha: new Date().toISOString().split('T')[0], forma_pago: "contado", notas: "" }); }}
                        variant="ghost"
                        className="text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                        title="Vincular factura"
                        data-testid={`vincular-${presupuesto.id}`}
                      >
                        <Receipt className="w-4 h-4 mr-1" />
                        <span className="text-xs hidden lg:inline">Vincular factura</span>
                      </Button>
                    )}
                    {canEdit && (presupuesto.estado === "facturado" || presupuesto.estado === "cobrado") && presupuesto.facturas_count > 0 && (
                      <Button
                        onClick={() => { setShowFacturarModal(presupuesto); setFacturaForm({ numero: "", fecha: new Date().toISOString().split('T')[0], forma_pago: "contado", notas: "" }); }}
                        variant="ghost"
                        className="text-slate-400 hover:text-sky-300 hover:bg-sky-500/10"
                        title={`${presupuesto.facturas_count} factura(s) vinculada(s) — clic para agregar otra`}
                        data-testid={`vincular-${presupuesto.id}`}
                      >
                        <Receipt className="w-4 h-4 mr-1" />
                        <span className="text-xs hidden lg:inline text-emerald-400">✓ {presupuesto.facturas_count} fac.</span>
                      </Button>
                    )}
                    {canEditCostos && (
                      <Button 
                        onClick={() => openCostos(presupuesto)}
                        variant="ghost" 
                        className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                        title="Ver/Editar Costos"
                        data-testid={`costos-${presupuesto.id}`}
                      >
                        <Wallet className="w-4 h-4 mr-1" />
                        <span className="text-xs hidden lg:inline">Costos</span>
                      </Button>
                    )}
                    {canEdit && presupuesto.estado !== "rechazado" && presupuesto.estado !== "cobrado" && (
                      <Button 
                        onClick={() => updateEstado(presupuesto.id, "rechazado")}
                        variant="ghost" 
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Rechazar"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button 
                        onClick={() => handleEdit(presupuesto)}
                        variant="ghost" 
                        className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                    {canCreate && (
                      <Button 
                        onClick={() => handleDuplicate(presupuesto)}
                        variant="ghost" 
                        className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                        title="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    )}
                    <Button 
                      onClick={() => viewPresupuesto(presupuesto.id)}
                      variant="outline" 
                      className="border-arandu-blue/30 text-arandu-blue hover:bg-arandu-blue/10"
                      title="Ver"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <Button 
                        onClick={() => handleDelete(presupuesto.id)}
                        variant="ghost" 
                        className="text-slate-400 hover:text-arandu-red hover:bg-arandu-red/10"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quotation description/observations */}
              {presupuesto.observaciones && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-sm text-slate-400">{presupuesto.observaciones}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* COSTOS REALES MODAL */}
      {showCostos && costosData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowCostos(null)}
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
                  Costos Reales - {showCostos.numero}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-slate-400 text-sm">{empresas.find(e => e.id === showCostos.empresa_id)?.nombre}</p>
                  {showCostos.tipo_cambio && (
                    <span className="text-xs bg-blue-500/15 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full">
                      TC referencia: {showCostos.moneda === "PYG" ? `USD 1 = ₲ ${Number(showCostos.tipo_cambio).toLocaleString()}` : `₲ ${Number(showCostos.tipo_cambio).toLocaleString()} = USD 1`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveCostos} disabled={savingCostos} className="bg-cyan-600 hover:bg-cyan-700 text-white" data-testid="save-costos-btn">
                  <Save className="w-4 h-4 mr-2" />
                  {savingCostos ? "Guardando..." : "Guardar"}
                </Button>
                <Button onClick={() => setShowCostos(null)} className="bg-red-600 hover:bg-red-700 text-white">
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
                  {formatNumber(costosData.total_facturado, showCostos.moneda)} {getCurrencySymbol(showCostos.moneda)}
                </p>
              </div>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-center">
                <p className="text-slate-400 text-xs mb-1">Total Costos</p>
                <p className="text-xl font-heading font-bold text-orange-400">
                  {formatNumber(costosData.total_costos, showCostos.moneda)} {getCurrencySymbol(showCostos.moneda)}
                </p>
              </div>
              <div className={`${costosData.ganancia >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"} border rounded-lg p-4 text-center`}>
                <p className="text-slate-400 text-xs mb-1">Ganancia</p>
                <p className={`text-xl font-heading font-bold ${costosData.ganancia >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatNumber(costosData.ganancia, showCostos.moneda)} {getCurrencySymbol(showCostos.moneda)}
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
                      <span className="block text-slate-600 font-normal">(moneda original)</span>
                    </th>
                    <th className="text-right p-2 w-36">
                      C. Real
                      <span className="block text-slate-600 font-normal">moneda + TC</span>
                    </th>
                    <th className="text-right p-2 w-32">
                      Diferencia
                      <span className="block text-slate-600 font-normal">{showCostos.moneda === "PYG" ? "₲" : "USD"}</span>
                    </th>
                    <th className="w-10 p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {costosData.items.map((item, idx) => {
                    const docMoneda = showCostos.moneda;
                    const docTC = showCostos.tipo_cambio;
                    const isDocUSD = docMoneda === "USD";

                    // Moneda del estimado
                    const mEst = item.moneda_item || docMoneda;
                    const estDifiere = mEst !== docMoneda;
                    const estConv = estDifiere
                      ? convertToDocMoneda(item.costo_estimado || 0, mEst, item.tipo_cambio_item, docMoneda, docTC)
                      : (item.costo_estimado || 0);

                    // Moneda del real
                    const mReal = item.moneda_costo || docMoneda;
                    const realDifiere = mReal !== docMoneda;
                    const realConv = convertToDocMoneda(
                      parseFloat(item.costo_real) || 0, mReal, item.tipo_cambio_costo, docMoneda, docTC
                    );

                    // Diferencia en moneda doc: (estimado_conv - real_conv) * cantidad
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
                              data-testid={`costo-desc-${idx}`}
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
                            data-testid={`costo-prov-${idx}`}
                          >
                            <option value="">Gastos Comunes</option>
                            {proveedores
                              .filter(p => p.activo !== false && (!p.logo_tipo || p.logo_tipo === showCostos?.logo_tipo))
                              .map(p => (
                                <option key={p.id} value={p.nombre}>{p.nombre}</option>
                              ))}
                          </select>
                          {proveedores.filter(p => p.activo !== false && (!p.logo_tipo || p.logo_tipo === showCostos?.logo_tipo)).length === 0 && (
                            <p className="text-slate-500 text-xs mt-1">Sin proveedores — agregá en el módulo Proveedores</p>
                          )}
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updateCostoReal(idx, "cantidad", e.target.value)}
                            className="bg-arandu-dark border-white/10 text-white text-sm text-center w-full"
                            min="0"
                            step="1"
                            data-testid={`costo-cant-${idx}`}
                          />
                        </td>

                        {/* C. Estimado: muestra en moneda original y si difiere también el convertido */}
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

                        {/* C. Real: input con selector de moneda y TC override */}
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
                            className="bg-arandu-dark border-white/10 text-white text-sm text-right w-full"
                            data-testid={`costo-real-${idx}`}
                          />
                          {/* TC override cuando la moneda real difiere del documento */}
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
                          {/* Monto convertido cuando difiere */}
                          {realDifiere && (
                            <div className="text-xs text-slate-500 mt-0.5 text-right">
                              ≈ {formatNumber(realConv, docMoneda)} {docMoneda === "PYG" ? "₲" : "$"}
                            </div>
                          )}
                        </td>

                        {/* Diferencia siempre en moneda del documento */}
                        <td className={`p-2 text-right text-sm font-medium ${diffRounded >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {item.es_nuevo ? "-" : `${diffRounded >= 0 ? "+" : ""}${formatNumber(diffRounded, docMoneda)}`}
                        </td>

                        <td className="p-2">
                          <button
                            onClick={() => removeCostoItem(idx)}
                            className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Eliminar item"
                            data-testid={`costo-remove-${idx}`}
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
                  data-testid="add-costo-item-btn"
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
                      const docMoneda = showCostos.moneda;
                      const docTC = showCostos.tipo_cambio;
                      const altMoneda = docMoneda === "PYG" ? "USD" : "PYG";
                      const displayMoneda = provMonedaDisplay[prov.proveedor] || docMoneda;

                      // Calcular monto en la moneda alternativa directamente desde los ítems
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
                          data-testid={`proveedor-row-${idx}`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleProveedorPagado(prov.proveedor)}
                              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                                prov.pagado
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-slate-500 hover:border-orange-400"
                              }`}
                              data-testid={`prov-toggle-${idx}`}
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
      )}
    {/* ═══ MODAL FACTURAR PRESUPUESTO ═══ */}
    {showFacturarModal && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowFacturarModal(null)} />
        <div className="relative bg-arandu-dark-light border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
          <h2 className="font-heading text-lg text-white mb-1">Facturar presupuesto</h2>
          <p className="text-slate-400 text-sm mb-4">
            <span className="text-white font-medium">{showFacturarModal.numero}</span>
            {showFacturarModal.nombre_archivo && <span className="text-slate-300"> — {showFacturarModal.nombre_archivo}</span>}
            <br/>
            <span className="text-slate-500">{showFacturarModal.empresa_nombre} · {showFacturarModal.moneda === "USD" ? `USD ${showFacturarModal.total}` : `₲ ${Number(showFacturarModal.total).toLocaleString("es-PY")}`}</span>
          </p>

          {/* Tabs: Nueva / Existente */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-4">
            {[
              { key: "nueva",     label: "Crear nueva factura" },
              { key: "existente", label: "Vincular existente" },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFacturaMode(t.key)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  facturaMode === t.key ? "bg-orange-500 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── TAB: NUEVA ── */}
          {facturaMode === "nueva" && (
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Número de factura *</label>
                <input
                  type="text"
                  value={facturaForm.numero}
                  onChange={e => setFacturaForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="001-001-0000001"
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Fecha de factura</label>
                <input
                  type="date"
                  value={facturaForm.fecha}
                  onChange={e => setFacturaForm(f => ({ ...f, fecha: e.target.value }))}
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Forma de pago</label>
                <div className="flex gap-2">
                  {[{ value: "contado", label: "Contado" }, { value: "credito", label: "Crédito" }].map(fp => (
                    <button
                      key={fp.value}
                      type="button"
                      onClick={() => setFacturaForm(f => ({ ...f, forma_pago: fp.value }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                        facturaForm.forma_pago === fp.value
                          ? "border-orange-400 bg-orange-500/20 text-orange-300"
                          : "border-white/10 text-slate-400 hover:border-white/30"
                      }`}
                    >
                      {fp.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={facturaForm.notas}
                  onChange={e => setFacturaForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Observaciones de la factura..."
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
            </div>
          )}

          {/* ── TAB: EXISTENTE ── */}
          {facturaMode === "existente" && (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={facturaSearch}
                  onChange={e => setFacturaSearch(e.target.value)}
                  placeholder="Buscar por número, empresa o concepto..."
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-400"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {facturasDisponibles
                  .filter(f => {
                    if (f.presupuesto_id && f.presupuesto_id !== showFacturarModal.id) return false; // ya vinculada a otro
                    if (!facturaSearch.trim()) return true;
                    const q = facturaSearch.toLowerCase();
                    return (f.numero || "").toLowerCase().includes(q)
                      || (f.razon_social || "").toLowerCase().includes(q)
                      || (f.concepto || "").toLowerCase().includes(q);
                  })
                  .map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFacturaSeleccionada(prev => prev?.id === f.id ? null : f)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                        facturaSeleccionada?.id === f.id
                          ? "border-orange-400 bg-orange-500/15 text-white"
                          : "border-white/10 text-slate-300 hover:border-white/25 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{f.numero}</span>
                        <span className={`text-xs ${f.estado === "pagada" ? "text-emerald-400" : f.estado === "anulada" ? "text-red-400" : "text-amber-400"}`}>
                          {f.estado}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{f.razon_social} · {f.fecha}</p>
                      {f.concepto && <p className="text-xs text-slate-500 truncate">{f.concepto}</p>}
                      {f.presupuesto_id === showFacturarModal.id && (
                        <p className="text-xs text-orange-400 mt-0.5">✓ Ya vinculada a este presupuesto</p>
                      )}
                    </button>
                  ))}
                {facturasDisponibles.filter(f => {
                  if (f.presupuesto_id && f.presupuesto_id !== showFacturarModal.id) return false;
                  if (!facturaSearch.trim()) return true;
                  const q = facturaSearch.toLowerCase();
                  return (f.numero || "").toLowerCase().includes(q)
                    || (f.razon_social || "").toLowerCase().includes(q)
                    || (f.concepto || "").toLowerCase().includes(q);
                }).length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-6">
                    {facturaSearch ? "Sin resultados" : "No hay facturas emitidas disponibles"}
                  </p>
                )}
              </div>
              {facturaSeleccionada && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-xs text-orange-300">
                  Seleccionada: <strong>{facturaSeleccionada.numero}</strong> — {facturaSeleccionada.razon_social}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-5">
            <Button
              variant="ghost"
              className="flex-1 border border-white/10"
              onClick={() => setShowFacturarModal(null)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={facturaMode === "nueva" ? handleFacturar : handleVincularExistente}
              disabled={savingFactura || (facturaMode === "existente" && !facturaSeleccionada)}
            >
              <Receipt className="w-4 h-4 mr-2" />
              {savingFactura
                ? "Guardando..."
                : facturaMode === "nueva" ? "Crear y vincular" : "Vincular factura"
              }
            </Button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default PresupuestosPage;