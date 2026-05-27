/**
 * Utilidades de resolución de logo para empresas propias.
 *
 * Cada empresa puede tener:
 *  - Una librería de logos (logos[])
 *  - Configuración por contexto: panel (sidebar) y docs (impresión)
 *  - Un logo_url legacy (retrocompatible)
 *
 * La resolución sigue este orden para cada contexto:
 *  1. Si modo "manual" y hay un logo_id válido → usar ese
 *  2. Si modo "auto" → buscar por etiqueta (panel→"oscuro", docs→"claro")
 *     luego fallback a "general", luego el primero disponible
 *  3. Fallback final → logo_url legacy
 *  4. Si nada → null (el código de renderizado usará el SVG de marca)
 */

/**
 * @param {object} empresa - objeto EmpresaPropia del contexto
 * @param {"panel"|"docs"} context
 * @returns {string|null} URL del logo o null
 */
export function resolveLogoForContext(empresa, context) {
  if (!empresa) return null;

  const logos = Array.isArray(empresa.logos) ? empresa.logos : [];
  const mode      = context === "panel" ? (empresa.logo_panel_mode || "auto") : (empresa.logo_docs_mode || "auto");
  const manualId  = context === "panel" ? empresa.logo_panel_id : empresa.logo_docs_id;

  // Manual: usar el logo elegido
  if (mode === "manual" && manualId) {
    const found = logos.find(l => l.id === manualId);
    if (found?.url) return found.url;
  }

  // Auto: buscar por etiqueta preferida
  if (logos.length > 0) {
    const preferEtiqueta = context === "panel" ? "oscuro" : "claro";
    const byEtiqueta = logos.find(l => l.etiqueta === preferEtiqueta);
    if (byEtiqueta?.url) return byEtiqueta.url;
    const general = logos.find(l => l.etiqueta === "general");
    if (general?.url) return general.url;
    // Último recurso: el primero de la librería
    if (logos[0]?.url) return logos[0].url;
  }

  // Fallback legacy
  return empresa.logo_url || null;
}

/**
 * Convierte el tamaño nominal a píxeles de altura.
 * @param {"xs"|"s"|"m"|"l"|"xl"} size
 * @returns {number}
 */
export function logoSizePx(size) {
  const MAP = { xs: 32, s: 44, m: 56, l: 72, xl: 88 };
  return MAP[size] || 56;
}
