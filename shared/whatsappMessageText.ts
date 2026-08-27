/**
 * Recupera somente marcadores operacionais conhecidos quando um texto legado já
 * contém o caractere de substituição Unicode (U+FFFD). Não grava nem altera o
 * pré-molde salvo; atua apenas no texto que será visualizado e enviado.
 */
export function repairWhatsappReplacementIcons(value: string): string {
  return String(value ?? "")
    .replace(/\uFFFD(?=\s*SEUS DADOS DE ACESSO ESTÃO PRONTOS!?)/gi, "🔐")
    .replace(/\uFFFD(?=\s*IMPORTANTE\b)/gi, "⚠️")
    .replace(/\uFFFD(?=\s*VÍDEO\s*[—-])/gi, "🎥")
    .replace(/\uFFFD(?=\s*Não tente acessar diretamente pelo aplicativo\b)/gi, "⚠️");
}
