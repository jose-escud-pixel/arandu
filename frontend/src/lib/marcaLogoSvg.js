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

/**
 * Colores por letra para cada marca (según pedido del dueño):
 *  - JAR      : J=rojo, A=blanco, R=azul
 *  - ARANDU   : A,R,A = rojo;  N = blanco;  D,U = azul
 *  - ARANDU&JAR: ARANDU = rojo;  & = blanco;  JAR = rojo
 * Para fondos oscuros uso tonos un poquito más luminosos para contrastar.
 */
const BRAND_LETTER_COLORS_BRIGHT = {
  jar:       ["#ef4444", "#ffffff", "#60a5fa"],
  arandu:    ["#ef4444", "#ef4444", "#ef4444", "#ffffff", "#60a5fa", "#60a5fa"],
  arandujar: ["#ef4444", "#ef4444", "#ef4444", "#ef4444", "#ef4444", "#ef4444", "#ffffff", "#ef4444", "#ef4444", "#ef4444"],
};
const BRAND_LETTER_COLORS_NORMAL = {
  jar:       ["#cc0001", "#0f172a", "#1a47af"],
  arandu:    ["#cc0001", "#cc0001", "#cc0001", "#0f172a", "#1a47af", "#1a47af"],
  arandujar: ["#cc0001", "#cc0001", "#cc0001", "#cc0001", "#cc0001", "#cc0001", "#0f172a", "#cc0001", "#cc0001", "#cc0001"],
};
const BRAND_TEXT = { jar: "JAR", arandu: "ARANDU", arandujar: "ARANDU&JAR" };

/**
 * Genera un PNG (data URL) con el texto de la marca en el cual CADA LETRA
 * tiene un color sólido propio (ver BRAND_LETTER_COLORS_*). Usa <canvas> para
 * obtener un render idéntico en cualquier navegador/impresora (soluciona
 * problemas en Safari donde el SVG con tspan a veces se imprime como un
 * rectángulo lleno de color de fondo en vez de mostrar las letras).
 * @param {"jar"|"arandu"|"arandujar"} marca
 * @param {{ fontSize?: number, letterSpacing?: number, darkHeader?: boolean, height?: number }} opts
 * @returns {string} data URL PNG
 */
export function pngPrintLogoDataUrl(marca, opts = {}) {
  const m = normalizeLogoTipo(marca);
  const text = BRAND_TEXT[m] || "LOGO";
  const fontSize = opts.fontSize ?? (m === "jar" ? 28 : m === "arandujar" ? 18 : 26);
  const letterSpacing = opts.letterSpacing ?? (m === "jar" ? 2 : m === "arandujar" ? 0.35 : 2);
  const dark = opts.darkHeader !== false; // por defecto asumimos fondo oscuro en impresión
  const palette = dark ? BRAND_LETTER_COLORS_BRIGHT : BRAND_LETTER_COLORS_NORMAL;
  const colors = palette[m] || [];

  const scale = 3; // alta resolución para impresión sin pixelado
  // canvas de medición
  const meas = document.createElement("canvas").getContext("2d");
  meas.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
  const widths = Array.from(text).map(ch => meas.measureText(ch).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + letterSpacing * (text.length - 1) + 4;
  const totalH = Math.ceil(fontSize * 1.15);

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(totalW * scale);
  canvas.height = Math.ceil(totalH * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = "alphabetic";
  // pequeña sombra para despegar letras blancas del fondo claro cuando toca
  if (dark) {
    ctx.shadowColor = "rgba(0,0,0,0.30)";
    ctx.shadowBlur = 1.5;
    ctx.shadowOffsetY = 0.6;
  }
  let x = 2;
  const y = fontSize;
  Array.from(text).forEach((ch, i) => {
    ctx.fillStyle = colors[i] || (dark ? "#ffffff" : "#0f172a");
    ctx.fillText(ch, x, y);
    x += widths[i] + letterSpacing;
  });
  return canvas.toDataURL("image/png");
}

/** Fila logo para HTML embebido (presupuesto impreso).
 *  Ahora devuelve un <img> con PNG (canvas) — imprime idéntico en Chrome/Safari. */
export function svgPrintLogoName(logoTipo, uid, { darkHeader = false } = {}) {
  const marca = normalizeLogoTipo(logoTipo);
  const fontSize = marca === "jar" ? 28 : marca === "arandujar" ? 18 : 26;
  const dataUrl = pngPrintLogoDataUrl(marca, { darkHeader, fontSize });
  // Altura CSS = fontSize * 1.15 (coincide con totalH del canvas)
  const cssH = Math.ceil(fontSize * 1.15);
  return `<img src="${dataUrl}" alt="${BRAND_TEXT[marca] || ""}" style="display:inline-block;vertical-align:middle;height:${cssH}px;width:auto"/>`;
}

export function svgLogoMarcaRow(logoTipo) {
  const uid = Math.random().toString(36).slice(2, 11);
  const marca = normalizeLogoTipo(logoTipo);
  const icon = svgMarcaIcon(marca, uid);
  // Usa el mismo PNG que svgPrintLogoName — cada letra con su color sólido
  const nombre = svgPrintLogoName(logoTipo, uid, { darkHeader: true });
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
