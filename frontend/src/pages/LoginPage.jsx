import React, { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowLeft, Eye, EyeOff, Shield, Server } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { AuthContext } from "../App";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Logo Component
const Logo = ({ size = "normal" }) => {
  const isSmall = size === "small";
  return (
    <div className="flex items-center gap-2">
      <div className={`${isSmall ? 'w-8 h-8' : 'w-12 h-12'} bg-gradient-to-br from-arandu-blue to-arandu-red rounded-lg flex items-center justify-center`}>
        <Server className={`${isSmall ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`font-heading font-bold ${isSmall ? 'text-sm' : 'text-xl'}`}>
          <span className="text-arandu-blue">ARANDU</span>
          <span className="text-arandu-red">&JAR</span>
        </span>
        <span className={`text-slate-400 ${isSmall ? 'text-[8px]' : 'text-xs'} tracking-wider`}>INFORMÁTICA</span>
      </div>
    </div>
  );
};

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || "Credenciales incorrectas");
      }
      
      login(data.user, data.access_token);
      toast.success(`¡Bienvenido, ${data.user.name}!`);
      navigate("/admin");
      
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-arandu-dark flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Link 
          to="/" 
          className="flex items-center gap-2 text-slate-500 hover:text-arandu-blue transition-colors mb-8"
          data-testid="back-link"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-body">Volver al inicio</span>
        </Link>

        <div className="bg-arandu-dark-light border border-white/10 rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <Logo />
            </div>
            <div className="inline-flex items-center gap-2 bg-arandu-blue/10 border border-arandu-blue/30 rounded-full px-4 py-2 mb-4">
              <Shield className="w-4 h-4 text-arandu-blue" />
              <span className="text-arandu-blue-light text-sm">Panel de Administración</span>
            </div>
            <h1 className="font-heading text-2xl font-bold text-white">
              Iniciar Sesión
            </h1>
            <p className="text-slate-500 font-body mt-2">
              Ingrese sus credenciales para acceder
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-400 font-body">Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-arandu-dark border-white/10 pl-12 py-6 text-white placeholder-slate-600 focus:border-arandu-blue"
                  data-testid="login-email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-400 font-body">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-arandu-dark border-white/10 pl-12 pr-12 py-6 text-white placeholder-slate-600 focus:border-arandu-blue"
                  data-testid="login-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-arandu-blue transition-colors"
                  data-testid="toggle-password"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-arandu-blue to-arandu-blue-dark hover:from-arandu-blue-dark hover:to-arandu-blue-darker text-white font-bold py-6 rounded-md transition-all glow-blue"
              data-testid="login-submit"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
