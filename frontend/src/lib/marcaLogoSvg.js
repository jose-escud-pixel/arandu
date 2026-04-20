/** Bandera PY en tipografía (presupuestos / PDF / impresión) */
const PY = { r: "#cc0001", w: "#ffffff", b: "#1a47af" };
/** Colores PY un poco más luminosos para que cada letra contraste sobre fondos oscuros */
const PY_BRIGHT = { r: "#ef4444", w: "#ffffff", b: "#60a5fa" };

function escapeSvgText(t) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Palabra con COLOR POR LETRA (bandera PY cíclica: rojo → blanco → azul).
 * Se renderiza con <tspan> de color sólido por letra: es 100% confiable al
 * imprimir (no usa clipPath, que fallaba en Safari mostrando bandas superpuestas).
 * Ejemplo: "JAR" → J rojo, A blanco, R azul.
 * @param {string} text
 * @param {string} uid id único (no usado, pero mantenido por compatibilidad)
 * @param {{ viewBoxWidth?: number, fontSize?: number, letterSpacing?: number, yText?: number, enhanceContrast?: boolean, bright?: boolean, skipChars?: string }} opt
 */
export function svgTriClipText(text, uid, opt = {}) {
  const vbw = opt.viewBoxWidth ?? 190;
  const fs = opt.fontSize ?? 26;
  const ls = opt.letterSpacing ?? 2;
  const yText = opt.yText ?? 26;
  // Uso PY_BRIGHT sobre fondos oscuros (encabezados de impresión).
  // Uso PY normal para documentos con fondo claro.
  const palette = opt.bright === false ? PY : PY_BRIGHT;
  const colors = [palette.r, palette.w, palette.b];
  // Caracteres que no deben contar para el ciclo de colores (ej. "&" en "ARANDU&JAR")
  const skip = opt.skipChars ?? "&";

  // Construir los <tspan> con un color por letra cíclico (R, W, B, R, W, B, …)
  let colorIdx = 0;
  let tspans = "";
  for (const ch of String(text)) {
    const esc = escapeSvgText(ch);
    if (skip.includes(ch)) {
      // carácter "neutro" en blanco para no romper el ritmo visual, pero sin consumir color
      tspans += `<tspan fill="${palette.w}">${esc}</tspan>`;
    } else {
      tspans += `<tspan fill="${colors[colorIdx % 3]}">${esc}</tspan>`;
      colorIdx++;
    }
  }

  const wAttr = Math.min(vbw, 340);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wAttr}" height="30" viewBox="0 0 ${vbw} 30" style="display:inline-block;vertical-align:middle">
    <text x="1" y="${yText}" font-family="Arial,Helvetica,sans-serif" font-size="${fs}" font-weight="900" letter-spacing="${ls}">${tspans}</text>
  </svg>`;
  if (opt.enhanceContrast) {
    svg = `<span style="display:inline-block;filter:drop-shadow(0 0 1.5px rgba(0,0,0,0.4))">${svg}</span>`;
  }
  return svg;
}

/** Normaliza logo_tipo de API a una de tres marcas */
export function normalizeLogoTipo(logoTipo) {
  if (logoTipo === "jar") return "jar";
  if (logoTipo === "arandu") return "arandu";
  return "arandujar";
}

/**
 * Icono cuadrado redondeado: azul (Arandu), rojo (JAR), slate (Arandu&JAR).
 * @param {"arandu"|"jar"|"arandujar"} marca
 * @param {number} [px] ancho/alto en px (52 documentos, 44 impresión compacta)
 */
export function svgMarcaIcon(marca, uid, px = 52) {
  const g = `mk-${uid}`;
  if (marca === "arandu") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 52 52">
      <defs><linearGradient id="ib-${g}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1e3a8a"/></linearGradient></defs>
      <rect x="4" y="4" width="44" height="44" rx="12" fill="url(#ib-${g})"/>
      <rect x="18" y="18" width="16" height="16" rx="2.5" fill="none" stroke="#ffffff" stroke-width="2"/>
      <rect x="22" y="22" width="8" height="8" rx="1.2" fill="#ffffff"/>
    </svg>`;
  }
  if (marca === "jar") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 52 52">
      <defs><linearGradient id="jr-${g}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f87171"/><stop offset="100%" stop-color="#7f1d1d"/></linearGradient></defs>
      <rect x="4" y="4" width="44" height="44" rx="12" fill="url(#jr-${g})"/>
      <rect x="14" y="15" width="24" height="7" rx="1.5" fill="none" stroke="#ffffff" stroke-width="1.8"/>
      <rect x="14" y="26" width="24" height="11" rx="1.5" fill="none" stroke="#ffffff" stroke-width="1.8"/>
      <circle cx="18" cy="18.5" r="1.2" fill="#ffffff"/><circle cx="22" cy="18.5" r="1.2" fill="#ffffff"/>
    </svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 52 52">
    <defs><linearGradient id="aj-${g}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs>
    <rect x="4" y="4" width="44" height="44" rx="12" fill="url(#aj-${g})"/>
    <rect x="14" y="15" width="24" height="7" rx="1.5" fill="none" stroke="#ffffff" stroke-width="1.8"/>
    <rect x="14" y="26" width="24" height="11" rx="1.5" fill="none" stroke="#ffffff" stroke-width="1.8"/>
    <circle cx="18" cy="18.5" r="1.2" fill="#ffffff"/><circle cx="22" cy="18.5" r="1.2" fill="#ffffff"/>
  </svg>`;
}

/** Fila logo para HTML embebido (presupuesto impreso) */
export function svgPrintLogoName(logoTipo, uid, { darkHeader = false } = {}) {
  const marca = normalizeLogoTipo(logoTipo);
  const ec = darkHeader ? { enhanceContrast: true } : {};
  if (marca === "jar") return svgTriClipText("JAR", uid, { viewBoxWidth: 86, fontSize: 28, letterSpacing: 2, ...ec });
  if (marca === "arandujar") return svgTriClipText("ARANDU&JAR", uid, { viewBoxWidth: 318, fontSize: 18, letterSpacing: 0.35, yText: 24, ...ec });
  return svgTriClipText("ARANDU", uid, ec);
}

export function svgLogoMarcaRow(logoTipo) {
  const uid = Math.random().toString(36).slice(2, 11);
  const marca = normalizeLogoTipo(logoTipo);
  const icon = svgMarcaIcon(marca, uid);
  let nombre;
  if (marca === "jar") nombre = svgTriClipText("JAR", uid, { viewBoxWidth: 86, fontSize: 28, letterSpacing: 2, yText: 26 });
  else if (marca === "arandujar") nombre = svgTriClipText("ARANDU&JAR", uid, { viewBoxWidth: 318, fontSize: 18, letterSpacing: 0.35, yText: 24 });
  else nombre = svgTriClipText("ARANDU", uid, {});
  return `<div style="display:flex;align-items:center;gap:8px">
    ${icon}
    <div style="line-height:1">
      <div style="margin:0;padding:0">${nombre}</div>
      <div style="font-size:9px;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-top:1px">INFORMÁTICA</div>
    </div>
  </div>`;
}

/** Logo completo para impresión en fondo claro (factura, recibo) */
export function svgDocumentHeaderLogoHtml(logoTipo) {
  const uid = Math.random().toString(36).slice(2, 11);
  const marca = normalizeLogoTipo(logoTipo);
  return `<div style="display:flex;align-items:center;gap:12px">
    ${svgMarcaIcon(marca, uid, 52)}
    <div>
      ${svgPrintLogoName(logoTipo, uid, { darkHeader: false })}
      <span style="font-size:11px;color:#6b7280;display:block;margin-top:4px;letter-spacing:2px;text-transform:uppercase">INFORMÁTICA</span>
    </div>
  </div>`;
}
