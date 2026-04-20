import React, { useContext, useRef, useState, useEffect } from "react";
import { AuthContext } from "../App";
import { ChevronDown, Building2, Check } from "lucide-react";

/**
 * EmpresaSwitcher — muestra la empresa activa y permite cambiar entre
 * las empresas accesibles del usuario. Solo visible si el usuario tiene
 * acceso a más de una empresa o es admin.
 *
 * Props:
 *  - compact: bool — versión compacta para encabezados de página
 */
export default function EmpresaSwitcher({ compact = false }) {
  const { user, empresasPropias, activeEmpresaPropia, switchEmpresa } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Cierra al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Empresas accesibles para este usuario
  const accesibles = React.useMemo(() => {
    if (!user) return [];
    if (user.role === "admin") return empresasPropias;
    const ids = user.logos_asignados || [];
    return empresasPropias.filter(ep => ids.includes(ep.id));
  }, [user, empresasPropias]);

  // No mostrar si solo hay una empresa o ninguna
  if (accesibles.length <= 1 && user?.role !== "admin") return null;
  if (accesibles.length === 0) return null;

  const activeNombre = activeEmpresaPropia?.nombre || "Todas las empresas";
  const activeColor = activeEmpresaPropia?.color || "#3b82f6";

  if (compact) {
    // Versión compacta para headers de páginas
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-body"
          style={{ borderColor: `${activeColor}40` }}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: activeColor }}
          />
          <span className="text-white font-medium max-w-[120px] truncate">{activeNombre}</span>
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute left-0 mt-1 w-52 bg-arandu-dark border border-white/20 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[200] overflow-hidden">
            {user?.role === "admin" && (
              <button
                onClick={() => { switchEmpresa(null); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-body text-sm text-left"
              >
                <Building2 className="w-4 h-4 text-slate-400" />
                <span>Todas las empresas</span>
                {!activeEmpresaPropia && <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
              </button>
            )}
            {accesibles.map(ep => (
              <button
                key={ep.id}
                onClick={() => { switchEmpresa(ep); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-body text-sm text-left"
              >
                {ep.logo_url ? (
                  <img src={ep.logo_url} alt={ep.nombre} className="w-5 h-5 object-contain rounded" />
                ) : (
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ep.color || "#3b82f6" }}
                  />
                )}
                <span className="flex-1 truncate">{ep.nombre}</span>
                {activeEmpresaPropia?.id === ep.id && (
                  <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Versión sidebar (full)
  return (
    <div className="px-3 pb-3" ref={ref}>
      <p className="text-slate-500 text-[10px] uppercase tracking-wider px-1 mb-1.5 font-body">Empresa activa</p>
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all font-body text-sm"
          style={{
            backgroundColor: `${activeColor}15`,
            borderColor: `${activeColor}40`,
          }}
        >
          {activeEmpresaPropia?.logo_url ? (
            <img
              src={activeEmpresaPropia.logo_url}
              alt={activeEmpresaPropia.nombre}
              className="w-6 h-6 object-contain rounded"
            />
          ) : (
            <span
              className="w-5 h-5 rounded-full flex-shrink-0"
              style={{ backgroundColor: activeColor }}
            />
          )}
          <span className="flex-1 text-white font-medium truncate text-left">{activeNombre}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 mt-1 bg-arandu-dark border border-white/20 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[200] overflow-hidden">
            {user?.role === "admin" && (
              <button
                onClick={() => { switchEmpresa(null); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-body text-sm text-left"
              >
                <Building2 className="w-4 h-4 text-slate-500" />
                <span className="flex-1">Todas las empresas</span>
                {!activeEmpresaPropia && <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
              </button>
            )}
            {accesibles.map(ep => (
              <button
                key={ep.id}
                onClick={() => { switchEmpresa(ep); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-body text-sm text-left"
              >
                {ep.logo_url ? (
                  <img src={ep.logo_url} alt={ep.nombre} className="w-5 h-5 object-contain rounded" />
                ) : (
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ep.color || "#3b82f6" }}
                  />
                )}
                <span className="flex-1 truncate">{ep.nombre}</span>
                {activeEmpresaPropia?.id === ep.id && (
                  <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
