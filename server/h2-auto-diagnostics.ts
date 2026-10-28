import { z } from "zod";

export const H2_AUTO_STATUS_CODES = [
  "NOT_CHECKED",
  "NOT_CONFIGURED",
  "UNSUPPORTED_ANDROID",
  "PERMISSION_REQUIRED",
  "AUDIO_SOURCE_MISSING",
  "AUDIO_ACCESS_FAILED",
  "AUDIO_FORMAT_UNSUPPORTED",
  "AUDIO_TOO_LONG",
  "RECOGNIZER_BUSY",
  "LOCAL_RECOGNIZER_UNAVAILABLE",
  "LANGUAGE_MODEL_UNAVAILABLE",
  "INPUT_UNSUPPORTED",
  "TRANSCRIBING",
  "TRANSCRIBED",
  "TRANSCRIBED_NO_RULE",
  "TRANSCRIPTION_ERROR",
  "TRANSCRIPTION_TIMEOUT",
  "EMPTY_TRANSCRIPT",
  "COOLDOWN",
  "NO_REPLY_ACTION",
  "MEDIA_DETECTED",
  "CONFIGURATION_DISABLED",
  "STALE_MESSAGE",
] as const;

export const H2_AUTO_REPLY_STATUS_CODES = [
  "NOT_CHECKED",
  "FALLBACK_SENT",
  "RULE_SENT",
  "MEDIA_SENT",
  "NO_REPLY_ACTION",
  "SEND_FAILED",
  "SKIPPED",
] as const;

/** The largest timestamp accepted by the JavaScript Date specification. */
export const H2_AUTO_MAX_TIMESTAMP = 8_640_000_000_000_000;

/**
 * Privacy-safe device diagnostics. This is deliberately strict: transcripts,
 * audio, URIs, senders, and arbitrary Android exception text are not part of
 * the contract and must never be persisted.
 */
export const h2AutoDiagnosticsSchema = z
  .object({
    apkVersion: z.string().max(80),
    apkVersionCode: z.number().int().min(1).max(100000),
    mediaEnabled: z.boolean(),
    transcribeConfigured: z.boolean(),
    recordAudioPermission: z.boolean(),
    listenerConnected: z.boolean(),
    desktopReadOnly: z.boolean().default(false),
    desktopLastCode: z.enum(["NOT_CHECKED","NOTIFICATION_REMOVED","FRESH_ACTION_FOUND","NO_ACTIVE_NOTIFICATION","NO_REPLY_ACTION","ACTION_EXPIRED_AFTER_READ","ORIGINAL_ACTION_ATTEMPT","SEND_FAILED_OR_EXPIRED"]).default("NOT_CHECKED"),
    desktopLastAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).default(0),
    statusCode: z.enum(H2_AUTO_STATUS_CODES),
    statusAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP),
    androidErrorCode: z.number().int().min(-1).max(100),
    replyStatusCode: z.enum(H2_AUTO_REPLY_STATUS_CODES),
    replyStatusAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP),
  })
  .strict();

export type H2AutoDiagnostics = z.infer<typeof h2AutoDiagnosticsSchema>;

/** Parse stored JSON without ever exposing an unvalidated diagnostic object. */
export function decodeH2AutoDiagnostics(
  raw: unknown
): H2AutoDiagnostics | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = h2AutoDiagnosticsSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
