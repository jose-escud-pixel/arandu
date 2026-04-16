import React, { useState, useContext, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  User, ArrowLeft, Camera, Save, Lock, Mail, Shield, Eye, Calendar
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthContext } from "../App";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PerfilPage = () => {
  const { user, token, login } = useContext(AuthContext);
  const fileInputRef = useRef(null);
  
  const [profileData, setProfileData] = useState({
    name: user?.name || "",
    email: user?.email || ""
  });
  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!profileData.name || !profileData.email) {
      toast.error("Nombre y email son requeridos");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch(`${API}/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        const updated = await res.json();
        login({ ...user, name: updated.name, email: updated.email }, token);
        toast.success("Perfil actualizado");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al actualizar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passwordData.current_password || !passwordData.new_password) {
      toast.error("Complete todos los campos");
      return;
    }
    if (passwordData.new_password.length < 6) {
      toast.error("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error("Las contraseñas nuevas no coinciden");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(`${API}/auth/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          current_password: passwordData.current_password,
          new_password: passwordData.new_password
        })
      });
      if (res.ok) {
        toast.success("Contraseña actualizada correctamente");
        setPasswordData({ current_password: "", new_password: "", confirm_password: "" });
      } else {
        const err = await res.json();
        toast.error(err.detail || "Error al cambiar contraseña");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    if (file.size > 500000) {
      toast.error("La imagen es demasiado grande (máximo 500KB)");
      return;
    }

    setUploadingAvatar(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        const res = await fetch(`${API}/auth/avatar`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatar: base64 })
        });
        if (res.ok) {
          login({ ...user, avatar: base64 }, token);
          toast.success("Foto de perfil actualizada");
        } else {
          toast.error("Error al subir la foto");
        }
        setUploadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Error al procesar la imagen");
      setUploadingAvatar(false);
    }
  };

  const getInitials = (name) => {
    return name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "??";
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString("es-PY", { 
        year: "numeric", month: "long", day: "numeric" 
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link to="/admin" className="text-slate-400 hover:text-arandu-blue flex items-center gap-2 mb-2">
          <ArrowLeft className="w-4 h-4" />
          Volver al Dashboard
        </Link>
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
          <User className="w-8 h-8 text-arandu-blue" />
          Mi Perfil
        </h1>
      </div>

      {/* Avatar & Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-arandu-dark-light border border-white/5 rounded-xl p-6 mb-6"
      >
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Avatar */}
          <div className="relative group" data-testid="avatar-section">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-arandu-blue/30 bg-arandu-dark flex items-center justify-center">
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-heading font-bold text-arandu-blue">{getInitials(user?.name)}</span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              disabled={uploadingAvatar}
              data-testid="avatar-upload-btn"
            >
              <Camera className="w-6 h-6 text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-arandu-blue border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="text-center md:text-left flex-1">
            <h2 className="text-xl font-heading font-bold text-white">{user?.name}</h2>
            <p className="text-slate-400 text-sm">{user?.email}</p>
            <div className="flex items-center gap-3 mt-2 justify-center md:justify-start">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                user?.role === "admin" 
                  ? "bg-arandu-red/20 text-arandu-red border border-arandu-red/30"
                  : "bg-arandu-blue/20 text-arandu-blue border border-arandu-blue/30"
              }`}>
                {user?.role === "admin" ? <Shield className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {user?.role === "admin" ? "Administrador" : "Usuario"}
              </span>
              <span className="text-slate-500 text-xs flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Desde {formatDate(user?.created_at)}
              </span>
            </div>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-4 text-center md:text-left">
          Pase el cursor sobre la foto para cambiarla (máx. 500KB)
        </p>
      </motion.div>

      {/* Edit Profile */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-arandu-dark-light border border-white/5 rounded-xl p-6 mb-6"
      >
        <h3 className="font-heading font-bold text-white text-lg mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-arandu-blue" />
          Datos Personales
        </h3>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm mb-1 block">Nombre</label>
            <Input
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              className="bg-arandu-dark border-white/10 text-white"
              placeholder="Tu nombre completo"
              data-testid="profile-name-input"
            />
          </div>
          <div>
            <label className="text-slate-400 text-sm mb-1 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                className="bg-arandu-dark border-white/10 text-white pl-10"
                placeholder="tu@correo.com"
                data-testid="profile-email-input"
              />
            </div>
          </div>
          <Button 
            type="submit" 
            className="bg-arandu-blue hover:bg-arandu-blue-dark text-white"
            disabled={savingProfile}
            data-testid="save-profile-btn"
          >
            <Save className="w-4 h-4 mr-2" />
            {savingProfile ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </form>
      </motion.div>

      {/* Change Password */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-arandu-dark-light border border-white/5 rounded-xl p-6"
      >
        <h3 className="font-heading font-bold text-white text-lg mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-orange-400" />
          Cambiar Contraseña
        </h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm mb-1 block">Contraseña Actual</label>
            <Input
              type="password"
              value={passwordData.current_password}
              onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
              className="bg-arandu-dark border-white/10 text-white"
              placeholder="Tu contraseña actual"
              data-testid="current-password-input"
            />
          </div>
          <div>
            <label className="text-slate-400 text-sm mb-1 block">Nueva Contraseña</label>
            <Input
              type="password"
              value={passwordData.new_password}
              onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
              className="bg-arandu-dark border-white/10 text-white"
              placeholder="Mínimo 6 caracteres"
              data-testid="new-password-input"
            />
          </div>
          <div>
            <label className="text-slate-400 text-sm mb-1 block">Confirmar Nueva Contraseña</label>
            <Input
              type="password"
              value={passwordData.confirm_password}
              onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
              className="bg-arandu-dark border-white/10 text-white"
              placeholder="Repetir nueva contraseña"
              data-testid="confirm-password-input"
            />
          </div>
          <Button 
            type="submit" 
            className="bg-orange-500 hover:bg-orange-600 text-white"
            disabled={savingPassword}
            data-testid="change-password-btn"
          >
            <Lock className="w-4 h-4 mr-2" />
            {savingPassword ? "Cambiando..." : "Cambiar Contraseña"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default PerfilPage;
