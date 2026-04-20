import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Server, Shield, Network, Camera, Phone, Mail, MapPin, 
  Clock, ChevronRight, Menu, X, Award, Users, Building2,
  Wifi, MonitorSmartphone, Wrench, MessageCircle
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Server room image
const SERVER_IMAGE = "https://customer-assets.emergentagent.com/job_dreamy-satoshi-5/artifacts/ob34zntc_0124650111v1.jpeg";

// Logo Component
const Logo = ({ size = "normal" }) => {
  const isSmall = size === "small";
  return (
    <div className="flex items-center gap-2">
      <div className={`${isSmall ? 'w-8 h-8' : 'w-10 h-10'} bg-gradient-to-br from-arandu-blue to-arandu-red rounded-lg flex items-center justify-center`}>
        <Server className={`${isSmall ? 'w-4 h-4' : 'w-5 h-5'} text-white`} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`font-heading font-bold ${isSmall ? 'text-sm' : 'text-lg'}`}>
          <span className="text-arandu-blue">ARANDU</span>
          <span className="text-arandu-red">&JAR</span>
        </span>
        <span className={`text-slate-400 ${isSmall ? 'text-[8px]' : 'text-[10px]'} tracking-wider`}>INFORMÁTICA</span>
      </div>
      <span className={`${isSmall ? 'text-lg' : 'text-2xl'} leading-none`} title="Paraguay">🇵🇾</span>
    </div>
  );
};

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: ""
  });
  const [sending, setSending] = useState(false);

  const services = [
    {
      icon: <Server className="w-10 h-10" />,
      title: "Infraestructura IT",
      description: "Diseño e implementación de infraestructuras tecnológicas robustas y escalables para empresas."
    },
    {
      icon: <Network className="w-10 h-10" />,
      title: "Redes Empresariales",
      description: "Instalación y configuración de redes con certificación MikroTik para cooperativas y empresas."
    },
    {
      icon: <Camera className="w-10 h-10" />,
      title: "Cámaras de Seguridad",
      description: "Sistemas CCTV profesionales con certificación Hikvision para máxima seguridad."
    },
    {
      icon: <MonitorSmartphone className="w-10 h-10" />,
      title: "Venta de Equipos",
      description: "Computadoras, servidores, equipos de red y accesorios de las mejores marcas."
    },
    {
      icon: <Wifi className="w-10 h-10" />,
      title: "Conectividad",
      description: "Soluciones de conectividad inalámbrica y fibra óptica para empresas."
    },
    {
      icon: <Wrench className="w-10 h-10" />,
      title: "Soporte Técnico",
      description: "Mantenimiento preventivo y correctivo con respuesta rápida garantizada."
    }
  ];

  const clients = [
    "Cooperativa Raúl Peña",
    "Coop Copronar Ltda",
    "Coop Ñemby",
    "Riego Gauto",
    "Tapiti Seguridad",
    "Megatransport",
    "Transglobal",
    "Visual Research"
  ];

  const stats = [
    { number: "30+", label: "Años de Experiencia" },
    { number: "500+", label: "Clientes Satisfechos" },
    { number: "1000+", label: "Proyectos Completados" },
    { number: "24/7", label: "Soporte Técnico" }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);

    try {
      const response = await fetch(`${API}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error("Error al enviar mensaje");

      toast.success("¡Mensaje enviado! Nos pondremos en contacto pronto.");
      setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (error) {
      toast.error("Error al enviar el mensaje. Intente nuevamente.");
    } finally {
      setSending(false);
    }
  };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-arandu-dark">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link to="/" className="flex items-center gap-3" data-testid="logo-link">
              <Logo />
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection("inicio")} className="nav-link text-slate-300 hover:text-white font-body">Inicio</button>
              <button onClick={() => scrollToSection("nosotros")} className="nav-link text-slate-300 hover:text-white font-body">Nosotros</button>
              <button onClick={() => scrollToSection("servicios")} className="nav-link text-slate-300 hover:text-white font-body">Servicios</button>
              <button onClick={() => scrollToSection("clientes")} className="nav-link text-slate-300 hover:text-white font-body">Clientes</button>
              <button onClick={() => scrollToSection("contacto")} className="nav-link text-slate-300 hover:text-white font-body">Contacto</button>
              <Link 
                to="/login" 
                className="bg-arandu-blue text-white px-6 py-2 rounded-md hover:bg-arandu-blue-dark transition-all font-medium"
                data-testid="login-btn"
              >
                Ingresar
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:hidden mt-4 py-4 border-t border-white/10"
            >
              <div className="flex flex-col gap-4">
                <button onClick={() => scrollToSection("inicio")} className="text-slate-300 hover:text-white font-body text-left">Inicio</button>
                <button onClick={() => scrollToSection("nosotros")} className="text-slate-300 hover:text-white font-body text-left">Nosotros</button>
                <button onClick={() => scrollToSection("servicios")} className="text-slate-300 hover:text-white font-body text-left">Servicios</button>
                <button onClick={() => scrollToSection("clientes")} className="text-slate-300 hover:text-white font-body text-left">Clientes</button>
                <button onClick={() => scrollToSection("contacto")} className="text-slate-300 hover:text-white font-body text-left">Contacto</button>
                <Link to="/login" className="bg-arandu-blue text-white px-6 py-2 rounded-md text-center">Ingresar</Link>
              </div>
            </motion.div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section id="inicio" className="relative min-h-screen flex items-center hero-pattern pt-20">
        <div className="absolute inset-0">
          <img 
            src="https://images.pexels.com/photos/5480781/pexels-photo-5480781.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
            alt="Data Center"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-arandu-dark/80 via-arandu-dark/90 to-arandu-dark" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 bg-arandu-blue/10 border border-arandu-blue/30 rounded-full px-4 py-2 mb-6">
              <Award className="w-4 h-4 text-arandu-blue" />
              <span className="text-arandu-blue-light text-sm font-medium">Más de 30 años de experiencia</span>
            </div>

            <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6">
              Soluciones en
              <span className="block gradient-text">Tecnología</span>
              <span className="block">e <span className="gradient-text-red">Informática</span></span>
            </h1>

            <p className="text-lg md:text-xl text-slate-400 font-body leading-relaxed mb-10 max-w-2xl">
              Infraestructura, redes, servidores y seguridad para empresas. 
              Certificados en <span className="text-arandu-blue">MikroTik</span> y <span className="text-arandu-red">Hikvision</span>.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={() => scrollToSection("contacto")}
                className="bg-arandu-blue hover:bg-arandu-blue-dark text-white font-bold px-8 py-6 rounded-md text-lg glow-blue"
                data-testid="hero-contact-btn"
              >
                Solicitar Cotización
                <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                onClick={() => scrollToSection("servicios")}
                variant="outline"
                className="border-arandu-red/50 text-arandu-red hover:bg-arandu-red/10 px-8 py-6 rounded-md text-lg"
                data-testid="hero-services-btn"
              >
                Ver Servicios
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-arandu-dark-light border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <p className="font-heading text-4xl md:text-5xl font-bold gradient-text mb-2">
                  {stat.number}
                </p>
                <p className="text-slate-400 font-body">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="nosotros" className="py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-arandu-blue font-medium mb-4 tracking-wider uppercase">Sobre Nosotros</p>
              <h2 className="font-heading text-3xl md:text-5xl font-bold text-white mb-6">
                Grupo <span className="gradient-text">Arandu</span><span className="gradient-text-red">&JAR</span>
              </h2>
              <div className="section-divider mb-8"></div>
              <p className="text-slate-400 font-body text-lg leading-relaxed mb-6">
                Con más de <strong className="text-white">30 años en el rubro</strong>, somos líderes en soluciones 
                informáticas en Paraguay. Nuestro equipo de profesionales certificados ofrece servicios 
                integrales de tecnología para empresas, cooperativas e instituciones.
              </p>
              <p className="text-slate-400 font-body text-lg leading-relaxed mb-8">
                Combinamos la experiencia de <strong className="text-arandu-blue">Arandu Informática</strong> y 
                <strong className="text-arandu-red"> JAR Informática</strong> para brindar soluciones completas 
                en infraestructura, redes, seguridad y soporte técnico.
              </p>

              {/* Certifications */}
              <div className="flex flex-wrap gap-4">
                <div className="cert-badge bg-arandu-dark-lighter border border-arandu-blue/30 rounded-lg px-6 py-4 flex items-center gap-3">
                  <Shield className="w-8 h-8 text-arandu-blue" />
                  <div>
                    <p className="text-white font-semibold">MikroTik</p>
                    <p className="text-slate-500 text-sm">Certificado</p>
                  </div>
                </div>
                <div className="cert-badge bg-arandu-dark-lighter border border-arandu-red/30 rounded-lg px-6 py-4 flex items-center gap-3">
                  <Camera className="w-8 h-8 text-arandu-red" />
                  <div>
                    <p className="text-white font-semibold">Hikvision</p>
                    <p className="text-slate-500 text-sm">Partner Oficial</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <img 
                src={SERVER_IMAGE}
                alt="Data Center Servidores"
                className="rounded-xl shadow-2xl"
              />
              <div className="absolute -bottom-8 -left-8 bg-arandu-dark-light border border-arandu-blue/20 rounded-xl p-6 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-arandu-blue/20 rounded-full flex items-center justify-center">
                    <Users className="w-7 h-7 text-arandu-blue" />
                  </div>
                  <div>
                    <p className="text-3xl font-heading font-bold text-white">500+</p>
                    <p className="text-slate-400">Clientes activos</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicios" className="py-24 bg-arandu-dark-light">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-arandu-red font-medium mb-4 tracking-wider uppercase">Nuestros Servicios</p>
            <h2 className="font-heading text-3xl md:text-5xl font-bold text-white mb-4">
              Soluciones <span className="gradient-text">Integrales</span>
            </h2>
            <div className="section-divider mx-auto"></div>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="service-card bg-arandu-dark border border-white/5 rounded-xl p-8 card-hover"
                data-testid={`service-card-${index}`}
              >
                <div className="service-icon w-16 h-16 bg-gradient-to-br from-arandu-blue/20 to-arandu-red/20 rounded-xl flex items-center justify-center mb-6 text-arandu-blue">
                  {service.icon}
                </div>
                <h3 className="font-heading text-xl font-semibold text-white mb-3">{service.title}</h3>
                <p className="text-slate-400 font-body leading-relaxed">{service.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Clients Section */}
      <section id="clientes" className="py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-arandu-blue font-medium mb-4 tracking-wider uppercase">Clientes Destacados</p>
            <h2 className="font-heading text-3xl md:text-5xl font-bold text-white mb-4">
              Confían en <span className="gradient-text-red">Nosotros</span>
            </h2>
            <div className="section-divider mx-auto"></div>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {clients.map((client, index) => (
              <motion.div
                key={client}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="bg-arandu-dark-light border border-white/5 rounded-xl p-6 flex items-center justify-center card-hover"
              >
                <div className="text-center">
                  <Building2 className="w-10 h-10 text-arandu-blue/50 mx-auto mb-3" />
                  <p className="text-slate-300 font-body font-medium text-sm">{client}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* More clients text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-10"
          >
            <p className="text-slate-400 font-body text-lg">
              <span className="text-arandu-blue font-semibold">+ muchos más</span> clientes confían en nuestros servicios
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contacto" className="py-24 bg-arandu-dark-light">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Contact Info */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-arandu-red font-medium mb-4 tracking-wider uppercase">Contacto</p>
              <h2 className="font-heading text-3xl md:text-5xl font-bold text-white mb-6">
                ¿Listo para <span className="gradient-text">Empezar</span>?
              </h2>
              <div className="section-divider mb-8"></div>
              <p className="text-slate-400 font-body text-lg leading-relaxed mb-10">
                Contáctenos para una consulta gratuita. Nuestro equipo está listo para ayudarle 
                a encontrar la mejor solución tecnológica para su empresa.
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-arandu-red/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Phone className="w-6 h-6 text-arandu-red" />
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">WhatsApp</p>
                    <p className="text-slate-400">0981 500 282</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-arandu-blue/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail className="w-6 h-6 text-arandu-blue" />
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">Email</p>
                    <p className="text-slate-400">info@aranduinformatica.net</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-arandu-red/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-arandu-red" />
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">Horario</p>
                    <p className="text-slate-400">Lunes a Viernes: 8:00 - 18:00</p>
                    <p className="text-slate-400">Sábados: 8:00 - 12:00</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <form onSubmit={handleSubmit} className="bg-arandu-dark border border-white/10 rounded-2xl p-8">
                <h3 className="font-heading text-2xl font-bold text-white mb-6">Envíenos un mensaje</h3>
                
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Nombre *</label>
                    <Input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Su nombre"
                      className="bg-arandu-dark-lighter border-white/10 text-white placeholder:text-slate-600 form-input"
                      required
                      data-testid="contact-name"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Email *</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="su@email.com"
                      className="bg-arandu-dark-lighter border-white/10 text-white placeholder:text-slate-600 form-input"
                      required
                      data-testid="contact-email"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Teléfono</label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="0981 000 000"
                      className="bg-arandu-dark-lighter border-white/10 text-white placeholder:text-slate-600 form-input"
                      data-testid="contact-phone"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Asunto *</label>
                    <Input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="Asunto del mensaje"
                      className="bg-arandu-dark-lighter border-white/10 text-white placeholder:text-slate-600 form-input"
                      required
                      data-testid="contact-subject"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-slate-400 text-sm mb-2">Mensaje *</label>
                  <Textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Cuéntenos sobre su proyecto o consulta..."
                    rows={5}
                    className="bg-arandu-dark-lighter border-white/10 text-white placeholder:text-slate-600 form-input resize-none"
                    required
                    data-testid="contact-message"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={sending}
                  className="w-full bg-gradient-to-r from-arandu-blue to-arandu-red hover:from-arandu-blue-dark hover:to-arandu-red-dark text-white font-bold py-4 rounded-md transition-all"
                  data-testid="contact-submit"
                >
                  {sending ? "Enviando..." : "Enviar Mensaje"}
                </Button>
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-arandu-dark border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <Logo size="normal" />
              <p className="text-slate-400 font-body max-w-md mt-4">
                Soluciones integrales en tecnología e informática. 
                Más de 30 años brindando servicios de calidad en Paraguay.
              </p>
            </div>
            <div>
              <h4 className="font-heading font-semibold text-white mb-4">Servicios</h4>
              <ul className="space-y-2 text-slate-400">
                <li>Infraestructura IT</li>
                <li>Redes Empresariales</li>
                <li>Cámaras de Seguridad</li>
                <li>Soporte Técnico</li>
              </ul>
            </div>
            <div>
              <h4 className="font-heading font-semibold text-white mb-4">Contacto</h4>
              <ul className="space-y-2 text-slate-400">
                <li>0981 500 282</li>
                <li>info@aranduinformatica.net</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 text-center">
            <p className="text-slate-500 font-body text-sm">
              © 2024 Arandu&JAR Informática. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* WhatsApp Float Button */}
      <a 
        href="https://wa.me/595981500282" 
        target="_blank" 
        rel="noopener noreferrer"
        className="whatsapp-float"
        data-testid="whatsapp-btn"
      >
        <MessageCircle className="w-7 h-7 text-white" fill="white" />
      </a>
    </div>
  );
};

export default LandingPage;
