import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, BookOpen, CheckCircle, Edit, Lock, Plus,
  Save, Shield, Trash2, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { AuthContext } from "../App";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const USOS = [
  { value: "venta_contado",  label: "Venta contado",  tipo: "cobrar" },
  { value: "venta_credito",  label: "Venta crédito",  tipo: "cobrar" },
  { value: "compra_contado", label: "Compra contado", tipo: "pagar"  },
  { value: "compra_credito", label: "Compra crédito", tipo: "pagar"  },
];

const emptyForm = (logo) => ({
  logo_tipo: logo || "arandujar",
  nombre: "",
  tipo: "cobrar",
  uso: "venta_contado",
  dias_vencimiento: 0,
  predeterminada: false,
  activa: true,
  notas: "",
});

export default function PlanCuentasPage() {
  const { token, activeEmpresaPropia, hasPermission, user: currentUser } = useContext(AuthContext);
  const logo = activeEmpresaPropia?.slug || "arandujar";

  const [cuentas, setCuentas]         = useState([]);
  const [usuarios, setUsuarios]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(emptyForm(logo));
  const [accesoModal, setAccesoModal] = useState(null);
  const [accesoIds, setAccesoIds]     = useState([]);
  const [savingAcceso, setSavingAcceso] = useState(false);

  const canCreate        = hasPermission?.("plan_cuentas.crear");
  const canEdit          = hasPermission?.("plan_cuentas.editar");
  const canDelete        = hasPermission?.("plan_cuentas.eliminar");
  const canAsignarAcceso = hasPermission?.("plan_cuentas.asignar_cuentas")
    || ["admin", "super_admin", "gerente"].includes(currentUser?.role);

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchCuentas = async () => {
    setLoading(true);
    try {
      const q   = logo ? `?logo_tipo=${logo}` : "";
      const res = await fetch(`${API}/admin/plan-cuentas${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("No se pudo cargar el plan de cuentas");
      setCuentas(await res.json());
    } catch (e) {
      toast.error(e.message || "Error al cargar plan de cuentas");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsuarios = async () => {
    try {
      const res = await fetch(`${API}/admin/usuarios`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const all = await res.json();
        setUsuarios(
          all.filter(u =>
            u.role === "usuario" &&
            (u.logos_asignados || []).map(String).includes(String(activeEmpresaPropia?.id || ""))
          )
        );
      }
    } catch {}
  };

  useEffect(() => {
    fetchCuentas();
    if (canAsignarAcceso) fetchUsuarios();
  }, [logo]); // eslint-disable-line

  const grouped = useMemo(
    () => USOS.map(u => ({ ...u, cuentas: cuentas.filter(c => c.uso === u.value) })),
    [cuentas]
  );

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm(logo));
    setShowForm(true);
  };

  const openEdit = (cuenta) => {
    setEditing(cuenta);
    setForm({
      logo_tipo:        cuenta.logo_tipo || logo,
      nombre:           cuenta.nombre || "",
      tipo:             cuenta.tipo || "cobrar",
      uso:              cuenta.uso || "venta_contado",
      dias_vencimiento: cuenta.dias_vencimiento ?? 0,
      predeterminada:   !!cuenta.predeterminada,
      activa:           cuenta.activa !== false,
      notas:            cuenta.notas || "",
    });
    setShowForm(true);
  };

  const setUso = (uso) => {
    const cfg = USOS.find(u => u.value === uso);
    setForm(f => ({ ...f, uso, tipo: cfg?.tipo || f.tipo }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error("Ingresá el nombre de la cuenta"); return; }
    try {
      const url    = editing ? `${API}/admin/plan-cuentas/${editing.id}` : `${API}/admin/plan-cuentas`;
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          logo_tipo:        logo,
          dias_vencimiento: Number(form.dias_vencimiento || 0),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "No se pudo guardar la cuenta");
      }
      toast.success(editing ? "Cuenta actualizada" : "Cuenta creada");
      setShowForm(false);
      fetchCuentas();
    } catch (e) {
      toast.error(e.message || "No se pudo guardar");
    }
  };

  const remove = async (cuenta) => {
    if (cuenta.sistema) { toast.error("Las cuentas base del sistema no se pueden eliminar."); return; }
    if (!window.confirm(`¿Eliminar "${cuenta.nombre}"? Si tiene documentos asociados no se podrá.`)) return;
    try {
      const res = await fetch(`${API}/admin/plan-cuentas/${cuenta.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "No se pudo eliminar");
      }
      toast.success("Cuenta eliminada");
      fetchCuentas();
    } catch (e) {
      toast.error(e.message || "No se pudo eliminar");
    }
  };

  // ── Acceso de usuarios ────────────────────────────────────────────────────────

  const openAcceso = (cuenta) => {
    setAccesoModal(cuenta);
    setAccesoIds((cuenta.usuarios_acceso_ids || []).map(String));
  };

  const toggleAccesoUser = (uid) => {
    const id = String(uid);
    setAccesoIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const saveAcceso = async () => {
    if (!accesoModal) return;
    setSavingAcceso(true);
    try {
      const res = await fetch(`${API}/admin/plan-cuentas/${accesoModal.id}/acceso`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usuarios_acceso_ids: accesoIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "No se pudo guardar el acceso");
      }
      toast.success("Acceso actualizado");
      setAccesoModal(null);
      fetchCuentas();
    } catch (e) {
      toast.error(e.message || "No se pudo guardar");
    } finally {
      setSavingAcceso(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-arandu-dark text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/sistema" className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-cyan-400" /> Plan de cuentas
              </h1>
              <p className="text-slate-400 text-sm">
                Cuentas por cobrar y pagar de {activeEmpresaPropia?.nombre || "la empresa activa"}
              </p>
            </div>
          </div>
          {canCreate && (
            <button
              onClick={openNew}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nueva cuenta
            </button>
          )}
        </div>

        {/* Grilla por uso */}
        <div className="grid lg:grid-cols-2 gap-4">
          {grouped.map(group => (
            <div key={group.value} className="rounded-xl border border-white/10 bg-arandu-dark-light overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{group.label}</h2>
                  <p className="text-xs text-slate-500">
                    {group.tipo === "cobrar" ? "Cuenta por cobrar" : "Cuenta por pagar"}
                  </p>
                </div>
                <span className="text-xs text-slate-500">{group.cuentas.length} cuenta(s)</span>
              </div>

              <div className="divide-y divide-white/5">
                {loading ? (
                  <div className="p-4 text-slate-400 text-sm">Cargando...</div>
                ) : group.cuentas.length === 0 ? (
                  <div className="p-4 text-slate-500 text-sm">Sin cuentas para este uso.</div>
                ) : group.cuentas.map(c => (
                  <div key={c.id} className="p-4 flex items-center justify-between gap-3 hover:bg-white/[0.03]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{c.nombre}</p>

                        {c.sistema && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/40 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Sistema
                          </span>
                        )}
                        {c.predeterminada && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Predeterminada
                          </span>
                        )}
                        {c.activa === false && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-300 border border-slate-500/25">
                            Inactiva
                          </span>
                        )}
                        {!c.sistema && (c.usuarios_acceso_ids || []).length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25 flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5" /> {c.usuarios_acceso_ids.length} usuario(s)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Vencimiento: {Number(c.dias_vencimiento || 0)} día(s)
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {canAsignarAcceso && !c.sistema && (
                        <button
                          onClick={() => openAcceso(c)}
                          className="p-2 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10"
                          title="Gestionar acceso de usuarios"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => openEdit(c)}
                          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && !c.sistema && (
                        <button
                          onClick={() => remove(c)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal crear / editar ──────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onMouseDown={e => e.target === e.currentTarget && setShowForm(false)}
        >
          <form
            onSubmit={save}
            className="w-full max-w-lg rounded-2xl bg-arandu-dark-light border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                {editing?.sistema && <Lock className="w-4 h-4 text-slate-400" />}
                {editing ? "Editar cuenta" : "Nueva cuenta"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-white/10 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Nombre *</label>
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Venta 30 días"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Uso</label>
                  <select
                    value={form.uso}
                    onChange={e => setUso(e.target.value)}
                    disabled={!!editing?.sistema}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {USOS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Días vencimiento</label>
                  <input
                    type="number"
                    min="0"
                    max={editing ? editing.dias_vencimiento : undefined}
                    value={form.dias_vencimiento}
                    onChange={e => setForm(f => ({ ...f, dias_vencimiento: e.target.value }))}
                    className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))}
                />
                Cuenta activa
              </label>

              <div>
                <label className="text-slate-400 text-sm mb-1 block">Notas</label>
                <textarea
                  value={form.notas || ""}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-arandu-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm min-h-[80px]"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-sm font-medium flex items-center gap-2">
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal asignar acceso ──────────────────────────────────────────────── */}
      {accesoModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onMouseDown={e => e.target === e.currentTarget && setAccesoModal(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-arandu-dark-light border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" /> Acceso a "{accesoModal.nombre}"
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sin selección = todos los usuarios pueden ver esta cuenta
                </p>
              </div>
              <button onClick={() => setAccesoModal(null)} className="p-2 rounded-lg hover:bg-white/10 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-2 max-h-72 overflow-y-auto">
              {usuarios.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">
                  No hay usuarios restringidos asignados a esta empresa.
                </p>
              ) : usuarios.map(u => (
                <label key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accesoIds.includes(String(u.id))}
                    onChange={() => toggleAccesoUser(u.id)}
                    className="w-4 h-4 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAccesoIds([])}
                className="text-xs text-slate-500 hover:text-slate-300 underline"
              >
                Limpiar (acceso libre)
              </button>
              <div className="flex gap-3">
                <button onClick={() => setAccesoModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
                  Cancelar
                </button>
                <button
                  onClick={saveAcceso}
                  disabled={savingAcceso}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {savingAcceso ? "Guardando..." : "Guardar acceso"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
