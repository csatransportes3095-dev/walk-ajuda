export type OrderProgressStatusLike = {
  key: string;
  isActive?: number | null;
  showInProgress?: number | null;
  progressOrder?: number | null;
  sortOrder?: number | null;
};

const EXCLUDED_FROM_NORMAL_PROGRESS = new Set(["cancelado"]);

function cleanKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

/**
 * Aliases que representam de fato a mesma etapa histórica.
 * Não reutilizar aliases dos filtros operacionais aqui: por exemplo,
 * "em_analise" e "foto_em_analise" podem ser etapas distintas no progresso.
 */
export function canonicalProgressStatusKey(value: unknown): string {
  const key = cleanKey(value);
  if (key === "entregue" || key === "login_de_acesso" || key === "login_liberado") return "pedido_entregue";
  if (key === "aguardando_ficar_ativa") return "aguardando_ativa";
  return key;
}

export function findProgressStatusIndex(progressKeys: string[], status: unknown): number {
  const exact = progressKeys.findIndex(key => cleanKey(key) === cleanKey(status));
  if (exact >= 0) return exact;
  const canonical = canonicalProgressStatusKey(status);
  if (!canonical) return -1;
  return progressKeys.findIndex(key => canonicalProgressStatusKey(key) === canonical);
}

function activeNormalStatuses(statuses: OrderProgressStatusLike[]): OrderProgressStatusLike[] {
  return statuses.filter(status => status.isActive === 1 && !EXCLUDED_FROM_NORMAL_PROGRESS.has(cleanKey(status.key)));
}

export function getConfiguredGlobalProgressKeys(statuses: OrderProgressStatusLike[]): string[] {
  return activeNormalStatuses(statuses)
    .filter(status => status.showInProgress === 1)
    .sort((a, b) => {
      const progressDiff = Number(a.progressOrder ?? 9999) - Number(b.progressOrder ?? 9999);
      if (progressDiff !== 0) return progressDiff;
      const sortDiff = Number(a.sortOrder ?? 9999) - Number(b.sortOrder ?? 9999);
      if (sortDiff !== 0) return sortDiff;
      return a.key.localeCompare(b.key);
    })
    .map(status => status.key);
}

export function getDefaultGlobalProgressKeys(statuses: OrderProgressStatusLike[]): string[] {
  return activeNormalStatuses(statuses)
    .sort((a, b) => {
      const sortDiff = Number(a.sortOrder ?? 9999) - Number(b.sortOrder ?? 9999);
      if (sortDiff !== 0) return sortDiff;
      return a.key.localeCompare(b.key);
    })
    .map(status => status.key);
}

export function sanitizeGlobalProgressKeys(statuses: OrderProgressStatusLike[], requestedKeys: string[]): string[] {
  const allowed = new Set(activeNormalStatuses(statuses).map(status => cleanKey(status.key)));
  const originalByClean = new Map(activeNormalStatuses(statuses).map(status => [cleanKey(status.key), status.key]));
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawKey of requestedKeys) {
    const key = cleanKey(rawKey);
    if (!key || seen.has(key) || !allowed.has(key)) continue;
    seen.add(key);
    result.push(originalByClean.get(key)!);
  }

  return result;
}

export function resolveProgressPosition(input: {
  progressKeys: string[];
  latestStatus: unknown;
  historyStatuses: unknown[];
}): { currentIndex: number; cancelled: boolean } {
  if (input.progressKeys.length === 0) return { currentIndex: -1, cancelled: cleanKey(input.latestStatus) === "cancelado" };

  const cancelled = cleanKey(input.latestStatus) === "cancelado";
  if (!cancelled) {
    const latestIndex = findProgressStatusIndex(input.progressKeys, input.latestStatus);
    if (latestIndex >= 0) return { currentIndex: latestIndex, cancelled: false };
  }

  let lastReached = -1;
  for (const status of input.historyStatuses) {
    const idx = findProgressStatusIndex(input.progressKeys, status);
    if (idx > lastReached) lastReached = idx;
  }

  return { currentIndex: lastReached >= 0 ? lastReached : 0, cancelled };
}

export function chunkProgressKeys<T>(items: T[], perRow = 3): T[][] {
  const size = Math.max(1, Math.trunc(perRow) || 1);
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}
