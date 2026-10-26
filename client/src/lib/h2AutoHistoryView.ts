export type H2AutoHistoryEvent = {
  id: string;
  sequence: number;
  occurredAt: number;
  time: string;
  chat: string;
  rule: string;
};

export type H2AutoHistory = {
  streamId: string;
  latestSequence: number;
  baselineSequence: number;
  events: H2AutoHistoryEvent[];
};

export type H2AutoHistoryCategory = "menu" | "regras" | "atendimento" | "midia";

const asSequence = (value: unknown, fallback = 0): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
};

const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

/**
 * The key intentionally contains both identities. A newly-created phone stream
 * must never inherit this browser/admin's read cursor from a previous stream.
 */
export const historyCursorStorageKey = (
  deviceId: string,
  streamId: string
): string => `h2-auto-history-cursor:${deviceId}:${streamId}`;

export const normalizeH2AutoHistory = (
  history: H2AutoHistory | null | undefined
): H2AutoHistory | null => {
  if (
    !history ||
    typeof history.streamId !== "string" ||
    !history.streamId.trim()
  )
    return null;

  const baselineSequence = asSequence(history.baselineSequence);
  const latestSequence = Math.max(
    baselineSequence,
    asSequence(history.latestSequence)
  );
  const events = Array.isArray(history.events)
    ? history.events
        .filter((event): event is H2AutoHistoryEvent =>
          Boolean(event && typeof event === "object")
        )
        .map(event => ({
          id: asText(event.id),
          sequence: asSequence(event.sequence),
          occurredAt: asSequence(event.occurredAt),
          time: asText(event.time),
          chat: asText(event.chat),
          rule: asText(event.rule),
        }))
        .filter(event => event.sequence > 0)
    : [];

  return {
    streamId: history.streamId,
    latestSequence,
    baselineSequence,
    events,
  };
};

export const getInitialHistoryCursor = (
  history: H2AutoHistory | null | undefined
): number | null => normalizeH2AutoHistory(history)?.baselineSequence ?? null;

export const resolveHistoryCursor = (
  history: H2AutoHistory | null | undefined,
  storedCursor: number | string | null | undefined
): number | null => {
  const normalized = normalizeH2AutoHistory(history);
  if (!normalized) return null;
  const parsed = storedCursor == null ? NaN : Number(storedCursor);
  if (!Number.isFinite(parsed)) return normalized.baselineSequence;
  return Math.max(normalized.baselineSequence, Math.trunc(parsed));
};

export const getUnreadHistoryCount = (
  history: H2AutoHistory | null | undefined,
  cursor: number | string | null | undefined
): number => {
  const normalized = normalizeH2AutoHistory(history);
  if (!normalized) return 0;
  const resolvedCursor =
    resolveHistoryCursor(normalized, cursor) ?? normalized.baselineSequence;
  return normalized.events.filter(event => event.sequence > resolvedCursor)
    .length;
};

/** Sort oldest-to-newest for deterministic timeline and cursor calculations. */
export const sortH2AutoHistoryEvents = (
  events: H2AutoHistoryEvent[]
): H2AutoHistoryEvent[] =>
  [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    if (left.occurredAt !== right.occurredAt)
      return left.occurredAt - right.occurredAt;
    return left.id.localeCompare(right.id);
  });

export const getH2AutoHistoryCategory = (
  event: Pick<H2AutoHistoryEvent, "chat" | "rule">
): H2AutoHistoryCategory => {
  const text = `${event.chat} ${event.rule}`.toLocaleLowerCase("pt-BR");
  if (
    /áudio|audio|foto|vídeo|video|documento|figurinha|sticker|mídia|midia/.test(
      text
    )
  ) {
    return "midia";
  }
  if (/menu|opção|opcoes|opções|digite\s+\d|escolha/.test(text)) return "menu";
  if (/atendente|atendimento|humano|suporte/.test(text)) return "atendimento";
  if (event.rule.trim()) return "regras";
  return "atendimento";
};

export const h2AutoHistoryCategoryLabel: Record<H2AutoHistoryCategory, string> =
  {
    menu: "Menu",
    regras: "Regras",
    atendimento: "Atendimento",
    midia: "Mídia",
  };
