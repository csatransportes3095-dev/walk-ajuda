export type ScheduleStatusDescriptor = {
  key: string;
  label?: string | null;
};

export const SCHEDULE_CLOSED_STATUS_FALLBACK = new Set([
  'documentos_aprovados', 'foto_aprovada', 'foto_perfil_aprovada',
  'aguardando_ativa', 'aguardando_ficar_ativa',
  'conta_ativa', 'p',
  'entregue', 'pedido_entregue', 'cancelado',
]);

/** Ignore decorations, accents and separators, never rewrite stored keys. */
export function normalizeOrderStatusSemantic(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A configured display label wins over a legacy key renamed by the ADM. */
function effectiveStatusSemantic(key: unknown, label: unknown): string {
  return normalizeOrderStatusSemantic(label) || normalizeOrderStatusSemantic(key);
}

export function isAnalysisOrderStatusSemantic(key: unknown, label: unknown): boolean {
  return effectiveStatusSemantic(key, label) === 'em analise';
}

export function isPhotoAnalysisOrderStatusSemantic(key: unknown, label: unknown): boolean {
  const semantic = effectiveStatusSemantic(key, label);
  return semantic === 'foto em analise' || semantic === 'foto em anal' || semantic === 'foto analise';
}

/**
 * Regra operacional da agenda baseada na ORDEM REAL do fluxo:
 * - EM ANÁLISE: cria/reabre agenda e nunca finaliza.
 * - Status ANTES de FOTO EM ANÁLISE (ex.: CNH EM ANÁLISE / CNH APROVADA): não finalizam.
 * - FOTO EM ANÁLISE e qualquer status DEPOIS dela: finalizam a agenda aberta.
 * A posição configurada no fluxo é a fonte de verdade.
 */
export function isScheduleClosedStatusInFlow(input: {
  targetKey: string;
  targetLabel?: string | null;
  flowStatusKeys: string[];
  statuses: ScheduleStatusDescriptor[];
}