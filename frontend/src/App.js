import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import EmpresasPage from "./pages/EmpresasPage";
import UsuariosPage from "./pages/UsuariosPage";
import PerfilPage from "./pages/PerfilPage";
import AuditoriaPage from "./pages/AuditoriaPage";
import InventarioPage from "./pages/InventarioPage";
import ReportesPage from "./pages/ReportesPage";
import ProveedoresPage from "./pages/ProveedoresPage";
import CostosFijosPage from "./pages/CostosFijosPage";
import PagosProveedoresPage from "./pages/PagosProveedoresPage";
import EmpleadosPage from "./pages/EmpleadosPage";
import BalancePage from "./pages/BalancePage";
import IngresoVarioPage from "./pages/IngresoVarioPage";
import EgresosPage from "./pages/EgresosPage";
import VentasPage from "./pages/VentasPage";
import ProductosPage from "./pages/ProductosPage";
import StockHistorialPage from "./pages/StockHistorialPage";
import BancosPage from "./pages/BancosPage";
import EmpresasPropiasPage from "./pages/EmpresasPropiasPage";
import { toast } from "sonner";
import { empresaTieneModulo, permisoHabilitadoPorEmpresa } from "./lib/modulosEmpresa";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Auth + Theme context ────────────────────────────────────────────────────
export const AuthContext = React.createContext(null);

// Aplica el tema de la empresa activa al elemento raíz del admin
// IMPORTANTE: solo aplica cuando el usuario está en /sistema/*; en / (landing) y /login
// mantiene el tema oscuro-azul por defecto para no "romper" el branding público.
function applyTheme(tema) {
  const el = document.getElementById("arandu-admin-root");
  if (!el) return;
  const temas = ["oscuro-azul", "oscuro-rojo", "claro-rojo", "claro-dorado", "claro-azul"];
  temas.forEach(t => el.removeAttribute("data-tema"));

  const onAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/sistema");

  if (onAdmin && tema && tema !== "oscuro-azul") {
    el.setAttribute("data-tema", tema);
  }
  // Para temas claros también cambiamos el body bg — solo si estamos en /sistema
  const lightBgs = { "claro-rojo": "#f8fafc", "claro-dorado": "#fefce8", "claro-azul": "#f0f9ff" };
  document.body.style.backgroundColor = onAdmin ? (lightBgs[tema] || "#0a1628") : "#0a1628";
}

function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [token, setToken] = React.useState(localStorage.getItem("token"));
  const [loading, setLoading] = React.useState(true);
  const [empresasPropias, setEmpresasPropias] = React.useState([]);
  const [activeEmpresaPropia, setActiveEmpresaPropia] = React.useState(null);

  // Cargar empresas propias y detectar la activa del usuario
  const loadEmpresasPropias = React.useCallback(async (savedToken, userData) => {
    try {
      const res = await fetch(`${API}/admin/empresas-propias`, {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      if (res.ok) {
        const propias = await res.json();
        setEmpresasPropias(propias);

        // Determinar empresa activa:
        // 1. Usar empresa_default guardada (localStorage o perfil)
        // 2. Si no, usar primera empresa asignada
        const savedDefault = localStorage.getItem("empresa_default") || userData?.empresa_default;

        if (propias.length > 0) {
          let found = null;

          // Intentar con la empresa_default guardada
          if (savedDefault) {
            found = propias.find(p => p.id === savedDefault);
          }

          // Si el usuario no es admin: preferir empresa_default; si no hay, usar la 1ra asignada
          if (!found && userData?.role !== "admin") {
            const accesibles = propias.filter(p =>
              (userData.logos_asignados || []).includes(p.id)
            );
            // Usuario con 1 sola empresa asignada → auto-seleccionarla
            if (accesibles.length >= 1) {
              found = accesibles[0];
            }
          }

          // Admins ven todo, si no hay empresa guardada usan la primera
          if (!found && userData?.role === "admin" && savedDefault) {
            found = propias.find(p => p.id === savedDefault);
          }

          if (found) {
            setActiveEmpresaPropia(found);
            applyTheme(found.tema || "oscuro-azul");
          } else if (userData?.role === "admin") {
            // Admin sin preferencia: sin filtro activo (ve todo)
            setActiveEmpresaPropia(null);
            applyTheme("oscuro-azul");
          } else {
            setActiveEmpresaPropia(null);
            applyTheme("oscuro-azul");
          }
        } else {
          setActiveEmpresaPropia(null);
          applyTheme("oscuro-azul");
        }
      }
    } catch (e) {
      console.error("Error loading empresas propias:", e);
    }
  }, []);

  React.useEffect(() => {
    const checkAuth = async () => {
      const savedToken = localStorage.getItem("token");
      if (savedToken) {
        try {
          const response = await fetch(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            setToken(savedToken);
            await loadEmpresasPropias(savedToken, userData);
          } else {
            localStorage.removeItem("token");
            setToken(null);
          }
        } catch (e) {
          console.error("Auth check failed:", e);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []); // eslint-disable-line

  const login = async (userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("token", accessToken);
    await loadEmpresasPropias(accessToken, userData);
  };

  const logout = React.useCallback(async (silent = false) => {
    // Le avisamos al backend para que limpie la sesión activa (best-effort).
    const t = localStorage.getItem("token");
    if (t) {
      try {
        await fetch(`${API}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
        });
      } catch (e) { /* sin red, no pasa nada */ }
    }
    setUser(null);
    setToken(null);
    setActiveEmpresaPropia(null);
    setEmpresasPropias([]);
    localStorage.removeItem("token");
    applyTheme("oscuro-azul");
    if (!silent && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  // Sesión única — chequeo periódico contra /auth/me.
  // Si el backend nos echa (token inválido o sesión cerrada en otro lado),
  // mostramos un aviso y cerramos sesión local.
  React.useEffect(() => {
    if (!token) return;
    const check = async () => {
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          let detail = "";
          try { const j = await res.json(); detail = j?.detail || ""; } catch (_) {}
          if (/otro dispositivo|sesión|expir/i.test(detail)) {
            toast.error(detail || "Tu sesión fue cerrada.");
          }
          logout(true);
          if (typeof window !== "undefined") window.location.href = "/login";
        }
      } catch (e) { /* sin conexión, ignoramos */ }
    };
    const id = setInterval(check, 30000);  // cada 30 segundos
    return () => clearInterval(id);
  }, [token, logout]);

  // Cambiar empresa activa y guardar como predeterminada
  const switchEmpresa = React.useCallback((empresa) => {
    setActiveEmpresaPropia(empresa);
    applyTheme(empresa?.tema || "oscuro-azul");
    if (empresa) {
      localStorage.setItem("empresa_default", empresa.id);
      // Persistir en el backend en background
      const t = localStorage.getItem("token");
      if (t) {
        fetch(`${API}/auth/empresa-default`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({ empresa_id: empresa.id })
        }).catch(() => {});
      }
    } else {
      localStorage.removeItem("empresa_default");
    }
  }, []);

  const hasPermission = (permiso) => {
    if (!user) return false;
    if (!permisoHabilitadoPorEmpresa(activeEmpresaPropia, permiso)) return false;
    if (user.role === "admin" || user.role === "gerente") return true;
    return (user.permisos || []).includes(permiso);
  };

  const hasModule = (modulo) => empresaTieneModulo(activeEmpresaPropia, modulo);

  const canAccessEmpresa = (empresaId) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const asignadas = user.empresas_asignadas || [];
    if (!asignadas.length) return false;
    return asignadas.includes(empresaId);
  };

  // Recargar empresas propias (llamado después de crear/editar una)
  // Mantiene la empresa activa actual, solo actualiza sus datos con la versión fresca de la API
  const refreshEmpresasPropias = React.useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/admin/empresas-propias`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const propias = await res.json();
        setEmpresasPropias(propias);
        // Si hay una empresa activa, actualizarla con los datos frescos (incluye el nuevo tema)
        setActiveEmpresaPropia(current => {
          if (!current) return current;
          const fresh = propias.find(p => p.id === current.id);
          if (fresh) {
            // Aplicar el tema actualizado
            applyTheme(fresh.tema || "oscuro-azul");
            return fresh;
          }
          return current;
        });
      }
    } catch (e) { console.error("Error al refrescar empresas:", e); }
  }, [token]);

  return (
    <AuthContext.Provider value={{
      user, token, login, logout, loading, hasPermission, canAccessEmpresa,
      hasModule,
      empresasPropias, activeEmpresaPropia, setActiveEmpresaPropia,
      switchEmpresa, refreshEmpresasPropias,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children, adminOnly = false, requiredPermission = null, anyPermission = null }) {
  const { token, loading, user, hasPermission } = React.useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen bg-arandu-dark flex items-center justify-center">
        <div className="text-arandu-blue-light animate-pulse font-heading text-2xl">Cargando...</div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== "admin" && user.role !== "gerente") {
    return <Navigate to="/sistema" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/sistema" replace />;
  }

  if (Array.isArray(anyPermission) && anyPermission.length && !anyPermission.some(p => hasPermission(p))) {
    return <Navigate to="/sistema" replace />;
  }

  return children;
}

// Observa la ruta y re-aplica el tema correcto cuando entramos/salimos del admin
function ThemeWatcher() {
  const location = useLocation();
  const { activeEmpresaPropia } = React.useContext(AuthContext) || {};
  React.useEffect(() => {
    const tema = activeEmpresaPropia?.tema || "oscuro-azul";
    applyTheme(tema);
  }, [location.pathname, activeEmpresaPropia]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      {/* data-tema se aplica por JS en applyTheme() */}
      <div id="arandu-admin-root" className="App min-h-screen bg-arandu-dark">
        <Toaster position="top-right" theme="dark" />
        <BrowserRouter>
          <ThemeWatcher />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/sistema" element={
              <ProtectedRoute><AdminDashboard /></ProtectedRoute>
            } />
            <Route path="/sistema/empresas" element={
              <ProtectedRoute requiredPermission="empresas.ver"><EmpresasPage /></ProtectedRoute>
            } />
            <Route path="/sistema/presupuestos" element={
              <ProtectedRoute requiredPermission="presupuestos.ver"><VentasPage /></ProtectedRoute>
            } />
            <Route path="/sistema/usuarios" element={
              <ProtectedRoute requiredPermission="usuarios.ver"><UsuariosPage /></ProtectedRoute>
            } />
            <Route path="/sistema/perfil" element={
              <ProtectedRoute><PerfilPage /></ProtectedRoute>
            } />
            <Route path="/sistema/auditoria" element={
              <ProtectedRoute requiredPermission="auditoria.ver"><AuditoriaPage /></ProtectedRoute>
            } />
            <Route path="/sistema/inventario" element={
              <ProtectedRoute requiredPermission="inventario.ver"><InventarioPage /></ProtectedRoute>
            } />
            <Route path="/sistema/reportes" element={
              <ProtectedRoute requiredPermission="reportes.ver"><ReportesPage /></ProtectedRoute>
            } />
            <Route path="/sistema/proveedores" element={
              <ProtectedRoute requiredPermission="proveedores.ver"><ProveedoresPage /></ProtectedRoute>
            } />
            <Route path="/sistema/costos-fijos" element={
              <ProtectedRoute requiredPermission="costos_fijos.ver"><CostosFijosPage /></ProtectedRoute>
            } />
            <Route path="/sistema/pagos-proveedores" element={
              <ProtectedRoute requiredPermission="pagos_proveedores.ver"><PagosProveedoresPage /></ProtectedRoute>
            } />
            <Route path="/sistema/empleados" element={
              <ProtectedRoute requiredPermission="empleados.ver"><EmpleadosPage /></ProtectedRoute>
            } />
            <Route path="/sistema/balance" element={
              <ProtectedRoute requiredPermission="balance.ver"><BalancePage /></ProtectedRoute>
            } />
            <Route path="/sistema/ingresos-varios" element={
              <ProtectedRoute requiredPermission="ingresos_varios.ver"><IngresoVarioPage /></ProtectedRoute>
            } />
            <Route path="/sistema/egresos" element={
              <ProtectedRoute anyPermission={["compras.ver", "costos_fijos.ver", "empleados.ver", "balance.ver", "pagos_proveedores.ver"]}><EgresosPage /></ProtectedRoute>
            } />
            <Route path="/sistema/ventas" element={
              <ProtectedRoute anyPermission={["presupuestos.ver", "facturas.ver", "ingresos_varios.ver", "recibos.ver", "notas_credito.ver"]}><VentasPage /></ProtectedRoute>
            } />
            <Route path="/sistema/productos" element={
              <ProtectedRoute requiredPermission="inventario_productos.ver"><ProductosPage /></ProtectedRoute>
            } />
            <Route path="/sistema/historial-stock" element={
              <ProtectedRoute requiredPermission="historial_stock.ver"><StockHistorialPage /></ProtectedRoute>
            } />
            <Route path="/sistema/empresas-propias" element={
              <ProtectedRoute adminOnly={true}><EmpresasPropiasPage /></ProtectedRoute>
            } />
            <Route path="/sistema/bancos" element={
              <ProtectedRoute requiredPermission="bancos.ver"><BancosPage /></ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </div>
    </AuthProvider>
  );
}

export default App;
