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

export function normalizeOrderStatusSemantic(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isAnalysisOrderStatusSemantic(key: unknown, label: unknown): boolean {
  return normalizeOrderStatusSemantic(label) === 'em analise'
    || normalizeOrderStatusSemantic(key) === 'em analise';
}

export function isPhotoAnalysisOrderStatusSemantic(key: unknown, label: unknown): boolean {
  return normalizeOrderStatusSemantic(label) === 'foto em analise'
    || normalizeOrderStatusSemantic(key) === 'foto em analise';
}

/** Retorna true para FOTO EM ANALISE e toda etapa posterior na sequencia real. */
export function isScheduleClosedStatusInFlow(input: {
  targetKey: string;
  targetLabel?: string | null;
  flowStatusKeys: string[];
  statuses: ScheduleStatusDescriptor[];
}): boolean {
  if (isPhotoAnalysisOrderStatusSemantic(input.targetKey, input.targetLabel)) return true;
  if (SCHEDULE_CLOSED_STATUS_FALLBACK.has(input.targetKey)) return true;

  const labelByKey = new Map(input.statuses.map(status => [status.key, status.label ?? status.key]));
  const photoAnalysisIndex = input.flowStatusKeys.findIndex(key =>
    isPhotoAnalysisOrderStatusSemantic(key, labelByKey.get(key) ?? key)
  );
  const targetIndex = input.flowStatusKeys.indexOf(input.targetKey);

  return photoAnalysisIndex >= 0 && targetIndex > photoAnalysisIndex;
}
