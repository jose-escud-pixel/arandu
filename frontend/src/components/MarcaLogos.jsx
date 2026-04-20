import React, { useId } from "react";
import { Cpu, Server } from "lucide-react";

const PY = { r: "#cc0001", w: "#ffffff", b: "#1a47af" };

function TriColorLetters({ text, viewBoxWidth, fontSize, letterSpacing, yText = 26, className }) {
  const cid = `tl-${useId().replace(/:/g, "")}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxWidth} 30`}
      className={className}
      style={{ display: "block", height: "1.2em", maxWidth: "100%" }}
      aria-hidden
    >
      <defs>
        <clipPath id={cid}>
          <text
            x="1"
            y={yText}
            fontFamily="system-ui, Arial, Helvetica, sans-serif"
            fontSize={fontSize}
            fontWeight="900"
            letterSpacing={letterSpacing}
          >
            {text}
          </text>
        </clipPath>
      </defs>
      <rect x="0" y="0" width={viewBoxWidth} height="10" fill={PY.r} clipPath={`url(#${cid})`} />
      <rect x="0" y="10" width={viewBoxWidth} height="10" fill={PY.w} clipPath={`url(#${cid})`} />
      <rect x="0" y="20" width={viewBoxWidth} height="10" fill={PY.b} clipPath={`url(#${cid})`} />
    </svg>
  );
}

function Sublabel({ className }) {
  return <span className={className}>INFORMÁTICA</span>;
}

/** Arandu: letras tricolor + cuadrado azul moderno */
export function LogoMarcaArandu({ compact = false, sublabelClass }) {
  const box = compact ? "w-10 h-10" : "w-12 h-12";
  const iconSz = compact ? "w-5 h-5" : "w-6 h-6";
  const sub =
    sublabelClass
    ?? (compact ? "text-slate-400 text-[10px] tracking-wider" : "text-[10px] text-gray-500 tracking-wider");
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${box} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-800`}
      >
        <Cpu className={`${iconSz} text-white`} strokeWidth={2.25} />
      </div>
      <div className="flex flex-col leading-none min-w-0">
        <TriColorLetters text="ARANDU" viewBoxWidth={190} fontSize={26} letterSpacing={2} className="max-w-[min(100%,190px)]" />
        <Sublabel className={sub} />
      </div>
    </div>
  );
}

/** JAR: letras tricolor + cuadrado rojo */
export function LogoMarcaJar({ compact = false, sublabelClass }) {
  const box = compact ? "w-10 h-10" : "w-12 h-12";
  const iconSz = compact ? "w-5 h-5" : "w-6 h-6";
  const sub =
    sublabelClass
    ?? (compact ? "text-slate-400 text-[10px] tracking-wider" : "text-[10px] text-gray-500 tracking-wider");
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${box} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0 bg-gradient-to-br from-red-500 to-red-800`}
      >
        <Server className={`${iconSz} text-white`} strokeWidth={2.1} />
      </div>
      <div className="flex flex-col leading-none min-w-0">
        <TriColorLetters text="JAR" viewBoxWidth={88} fontSize={28} letterSpacing={2} className="max-w-[88px]" />
        <Sublabel className={sub} />
      </div>
    </div>
  );
}

/** Arandu&JAR: letras tricolor + cuadrado slate (un solo tono moderno) */
export function LogoMarcaAranduJar({ compact = false, sublabelClass }) {
  const box = compact ? "w-10 h-10" : "w-12 h-12";
  const iconSz = compact ? "w-5 h-5" : "w-6 h-6";
  const sub =
    sublabelClass
    ?? (compact ? "text-slate-400 text-[10px] tracking-wider" : "text-[10px] text-gray-500 tracking-wider");
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${box} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0 bg-gradient-to-br from-slate-600 to-slate-900`}
      >
        <Server className={`${iconSz} text-white`} strokeWidth={2.1} />
      </div>
      <div className="flex flex-col leading-none min-w-0">
        <TriColorLetters
          text="ARANDU&JAR"
          viewBoxWidth={318}
          fontSize={18}
          letterSpacing={0.35}
          yText={24}
          className="max-w-[min(100%,318px)]"
        />
        <Sublabel className={sub} />
      </div>
    </div>
  );
}
