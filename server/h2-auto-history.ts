import { z } from "zod";

/** The largest timestamp accepted by the JavaScript Date specification. */
export const H2_AUTO_HISTORY_MAX_TIMESTAMP = 8_640_000_000_000_000;

const safeSequence = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, "must be a safe integer");
const positiveSafeSequence = z
  .number()
  .int()
  .min(1)
  .refine(Number.isSafeInteger, "must be a safe integer");

const historyEventSchema = z
  .object({
    id: z.string().uuid(),
    sequence: positiveSafeSequence,
    occurredAt: z.number().int().min(0).max(H2_AUTO_HISTORY_MAX_TIMESTAMP),
    time: z.string().max(40),
    chat: z.string().min(1).max(48),
    rule: z.string().min(1).max(160),
  })
  .strict();

/**
 * Metadata-only H2 AUTO timeline sent by a paired APK. It intentionally has
 * no transcript, message body, attachment, URI, or audio fields.
 */
export const h2AutoHistorySchema = z
  .object({
    streamId: z.string().uuid(),
    latestSequence: safeSequence,
    baselineSequence: safeSequence,
    events: z.array(historyEventSchema).max(80),
  })
  .strict()
  .superRefine((history, ctx) => {
    if (history.baselineSequence > history.latestSequence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baselineSequence"],
        message: "baselineSequence cannot exceed latestSequence",
      });
    }

    const ids = new Set<string>();
    const sequences = new Set<number>();
    history.events.forEach((event, index) => {
      if (ids.has(event.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "id"],
          message: "event ids must be unique",
        });
      }
      ids.add(event.id);

      if (sequences.has(event.sequence)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "sequence"],
          message: "event sequences must be unique",
        });
      }
      sequences.add(event.sequence);

      if (event.sequence > history.latestSequence) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "sequence"],
          message: "event sequence cannot exceed latestSequence",
        });
      }
    });
  });

export type H2AutoHistory = z.infer<typeof h2AutoHistorySchema>;
export type H2AutoHistoryEvent = H2AutoHistory["events"][number];

/** Parse a stored JSON value without exposing an unvalidated history object. */
export function decodeH2AutoHistory(raw: unknown): H2AutoHistory | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = h2AutoHistorySchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class H2AutoHistoryConflictError extends Error {
  readonly code = "HISTORY_CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "H2AutoHistoryConflictError";
  }
}

function sameEvent(a: H2AutoHistoryEvent, b: H2AutoHistoryEvent): boolean {
  return (
    a.id === b.id &&
    a.sequence === b.sequence &&
    a.occurredAt === b.occurredAt &&
    a.time === b.time &&
    a.chat === b.chat &&
    a.rule === b.rule
  );
}

function newestFirst(events: H2AutoHistoryEvent[]): H2AutoHistoryEvent[] {
  return [...events]
    .sort((a, b) => b.sequence - a.sequence || a.id.localeCompare(b.id))
    .slice(0, 80);
}

/**
 * Merge one authenticated APK snapshot into the stored snapshot.
 *
 * A stream ID is the reinstall/re-pair namespace: a new stream starts clean.
 * Within one stream, records are unioned idempotently. Any event ID or
 * sequence equivocation is rejected rather than silently overwritten, and the
 * stored baseline remains fixed for that stream.
 */
export function mergeH2AutoHistory(
  stored: H2AutoHistory | null | undefined,
  incoming: H2AutoHistory
): H2AutoHistory {
  const parsedIncoming = h2AutoHistorySchema.parse(incoming);
  if (!stored || stored.streamId !== parsedIncoming.streamId) {
    return {
      ...parsedIncoming,
      events: newestFirst(parsedIncoming.events),
    };
  }

  const parsedStored = h2AutoHistorySchema.parse(stored);
  const byId = new Map<string, H2AutoHistoryEvent>();
  const bySequence = new Map<number, H2AutoHistoryEvent>();
  for (const event of parsedStored.events) {
    byId.set(event.id, event);
    bySequence.set(event.sequence, event);
  }

  for (const event of parsedIncoming.events) {
    const priorById = byId.get(event.id);
    if (priorById && !sameEvent(priorById, event)) {
      throw new H2AutoHistoryConflictError(
        `history event ${event.id} changed sequence or metadata`
      );
    }
    const priorBySequence = bySequence.get(event.sequence);
    if (priorBySequence && !sameEvent(priorBySequence, event)) {
      throw new H2AutoHistoryConflictError(
        `history sequence ${event.sequence} was attributed to another event`
      );
    }
    if (!priorById && !priorBySequence) {
      byId.set(event.id, event);
      bySequence.set(event.sequence, event);
    }
  }

  const latestSequence = Math.max(
    parsedStored.latestSequence,
    parsedIncoming.latestSequence
  );
  return {
    streamId: parsedStored.streamId,
    latestSequence,
    // The baseline is initialized by the first snapshot and never advances
    // with later ACKs. Clamping keeps this invariant safe for future schema
    // changes while remaining valid if latestSequence grows.
    baselineSequence: Math.min(parsedStored.baselineSequence, latestSequence),
    // Empty snapshots are deliberately additive: a local clear must not erase
    // records already received by ADM.
    events: newestFirst([...byId.values()]),
  };
}
