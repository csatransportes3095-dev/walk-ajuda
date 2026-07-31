// Logos SVG das bandeiras de cartão de crédito — versão sólida e nítida
import React from "react";

export type Bandeira = "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "outro" | string;

// Visa — letras clássicas em itálico bold, cor oficial azul escuro/branco
const VisaSVG = () => (
  <svg viewBox="0 0 80 26" xmlns="http://www.w3.org/2000/svg" width="80" height="26">
    <text x="0" y="22" fontFamily="'Times New Roman', Georgia, serif" fontStyle="italic" fontWeight="900"
      fontSize="26" fill="white" letterSpacing="-1">VISA</text>
  </svg>
);

// Mastercard — dois círculos sobrepostos com cores oficiais
const MastercardSVG = () => (
  <svg viewBox="0 0 50 32" xmlns="http://www.w3.org/2000/svg" width="50" height="32">
    <circle cx="18" cy="16" r="14" fill="#EB001B" />
    <circle cx="32" cy="16" r="14" fill="#F79E1B" />
    {/* Interseção laranja */}
    <path d="M25 5.5 Q32 16 25 26.5 Q18 16 25 5.5Z" fill="#FF5F00" />
  </svg>
);

// Elo — logo com círculo e letras
const EloSVG = () => (
  <svg viewBox="0 0 56 28" xmlns="http://www.w3.org/2000/svg" width="56" height="28">
    <text x="0" y="24" fontFamily="'Arial Black', Arial, sans-serif" fontWeight="900"
      fontSize="26" fill="white" letterSpacing="-0.5">elo</text>
  </svg>
);

// American Express — estilo oficial
const AmexSVG = () => (
  <svg viewBox="0 0 72 24" xmlns="http://www.w3.org/2000/svg" width="72" height="24">
    <text x="0" y="20" fontFamily="Arial, sans-serif" fontWeight="900"
      fontSize="20" fill="white" letterSpacing="2">AMEX</text>
  </svg>
);

// Hipercard — vermelho com texto branco
const HipercardSVG = () => (
  <svg viewBox="0 0 96 22" xmlns="http://www.w3.org/2000/svg" width="96" height="22">
    <text x="0" y="18" fontFamily="Arial, sans-serif" fontWeight="900"
      fontSize="17" fill="white" letterSpacing="0.5">HIPERCARD</text>
  </svg>
);

interface BandeiraLogoProps {
  bandeira: Bandeira;
  /** "solid" = nítido e colorido (padrão), "watermark" = marca d'água sutil */
  variant?: "solid" | "watermark";
  style?: React.CSSProperties;
}

export function BandeiraLogo({ bandeira, variant = "solid", style }: BandeiraLogoProps) {
  const opacity = variant === "watermark" ? 0.15 : 1;

  const logo = (() => {
    switch (bandeira?.toLowerCase()) {
      case "visa": return <VisaSVG />;
      case "mastercard": return <MastercardSVG />;
      case "elo": return <EloSVG />;
      case "amex": return <AmexSVG />;
      case "hipercard": return <HipercardSVG />;
      default: return null;
    }
  })();

  if (!logo) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: 14,
      right: 16,
      pointerEvents: "none",
      opacity,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      filter: variant === "solid" ? "drop-shadow(0 1px 3px rgba(0,0,0,0.4))" : "none",
      ...style,
    }}>
      {logo}
    </div>
  );
}

// Alias para compatibilidade
export function BandeiraLogoPequena({ bandeira, style }: { bandeira: Bandeira; opacity?: number; style?: React.CSSProperties }) {
  return <BandeiraLogo bandeira={bandeira} variant="solid" style={style} />;
}
