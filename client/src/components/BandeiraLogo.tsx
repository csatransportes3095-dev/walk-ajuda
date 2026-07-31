// Logos SVG das bandeiras de cartão de crédito — usadas como marca d'água no fundo dos cards
import React from "react";

// Visa — letras clássicas em itálico
const VisaSVG = ({ opacity = 0.18 }: { opacity?: number }) => (
  <svg viewBox="0 0 200 65" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    <text x="0" y="55" fontFamily="Arial, sans-serif" fontStyle="italic" fontWeight="900"
      fontSize="68" fill="white" letterSpacing="-2">VISA</text>
  </svg>
);

// Mastercard — dois círculos sobrepostos
const MastercardSVG = ({ opacity = 0.18 }: { opacity?: number }) => (
  <svg viewBox="0 0 100 65" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    <circle cx="35" cy="32" r="28" fill="#EB001B" />
    <circle cx="65" cy="32" r="28" fill="#F79E1B" />
    <path d="M50 10 Q65 32 50 54 Q35 32 50 10Z" fill="#FF5F00" />
  </svg>
);

// Elo — logo simplificado
const EloSVG = ({ opacity = 0.18 }: { opacity?: number }) => (
  <svg viewBox="0 0 120 65" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    <text x="5" y="52" fontFamily="Arial Black, sans-serif" fontWeight="900"
      fontSize="52" fill="white" letterSpacing="-1">elo</text>
  </svg>
);

// American Express — texto AMEX
const AmexSVG = ({ opacity = 0.18 }: { opacity?: number }) => (
  <svg viewBox="0 0 160 65" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    <text x="0" y="52" fontFamily="Arial, sans-serif" fontWeight="900"
      fontSize="46" fill="white" letterSpacing="2">AMEX</text>
  </svg>
);

// Hipercard — texto
const HipercardSVG = ({ opacity = 0.18 }: { opacity?: number }) => (
  <svg viewBox="0 0 220 65" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    <text x="0" y="50" fontFamily="Arial, sans-serif" fontWeight="900"
      fontSize="38" fill="white" letterSpacing="1">HIPERCARD</text>
  </svg>
);

export type Bandeira = "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "outro" | string;

interface BandeiraLogoProps {
  bandeira: Bandeira;
  opacity?: number;
  style?: React.CSSProperties;
}

export function BandeiraLogo({ bandeira, opacity = 0.18, style }: BandeiraLogoProps) {
  const containerStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 12,
    right: 14,
    width: 90,
    height: 50,
    pointerEvents: "none",
    ...style,
  };

  const logo = (() => {
    switch (bandeira?.toLowerCase()) {
      case "visa": return <VisaSVG opacity={opacity} />;
      case "mastercard": return <MastercardSVG opacity={opacity} />;
      case "elo": return <EloSVG opacity={opacity} />;
      case "amex": return <AmexSVG opacity={opacity} />;
      case "hipercard": return <HipercardSVG opacity={opacity} />;
      default: return null;
    }
  })();

  if (!logo) return null;

  return (
    <div style={containerStyle}>
      {logo}
    </div>
  );
}

// Versão pequena para o card do dashboard
export function BandeiraLogoPequena({ bandeira, opacity = 0.22, style }: BandeiraLogoProps) {
  return <BandeiraLogo bandeira={bandeira} opacity={opacity} style={{ width: 70, height: 38, bottom: 10, right: 12, ...style }} />;
}
