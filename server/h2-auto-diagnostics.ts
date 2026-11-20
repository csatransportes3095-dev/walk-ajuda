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

export const H2_AUTO_IMAGE_REPLY_STATUS_CODES = [
  "NOT_CHECKED", "DOWNLOADING", "READY", "DOWNLOAD_FAILED", "QUEUED",
  "SENDING", "SENT_CONFIRMED", "ACTION_ACCEPTED_UNVERIFIED", "FAILED",
  "UNSUPPORTED", "RECIPIENT_NOT_VERIFIED", "PAUSED",
] as const;

/** Fixed APK 2.15 failure reasons; never accept exception text or conversation data. */
export const H2_AUTO_IMAGE_REPLY_DETAIL_CODES = [
  "NONE",
  "ACCESSIBILITY_DISCONNECTED",
  "UI_BUSY",
  "CHAT_ACTIVITY_NOT_FOUND",
  "CHAT_LAUNCH_REJECTED",
  "SHARE_ACTIVITY_NOT_FOUND",
  "SHARE_LAUNCH_REJECTED",
  "TEXT_ACTION_UNAVAILABLE",
  "TEXT_ACTION_CANCELLED",
  "IMAGE_MIME_UNSUPPORTED",
  "IMAGE_ACTION_CANCELLED",
  "UI_TIMEOUT",
  "RECIPIENT_NOT_VERIFIED",
  "OPERATOR_INTERVENED",
  // H2 Auto 2.16-2.17: fixed event/draft categories. Never accept free text.
  "INTERVENTION_CLICK",
  "INTERVENTION_TEXT",
  "INTERVENTION_MEDIA",
  "INTERVENTION_DRAFT",
  "INTERVENTION_CAPTION",
  "INTERVENTION_COMPOSER",
  "INTERVENTION_EXTRA_MEDIA",
] as const;

/**
 * H2 Auto 1.95-2.02 reports only fixed OTP stage identifiers. Match the APK
 * stage constants exactly: unknown codes, phone numbers, chat text, OTP bodies
 * and Android exception messages remain rejected. Older APKs remain valid.
 */
export const H2_AUTO_OTP_STATUS_CODES = [
  "NOT_CHECKED",
  "OTP_PICKUP_FAILED",
  "OTP_SEND_ACTION_ACCEPTED",
  "OTP_ACK_RETRY_PENDING",
  "OTP_NOTIFICATIONS_DISABLED",
  "OTP_FALLBACK_AVAILABLE",
  "OTP_INVALID_OR_EXPIRED_TASK",
  "OTP_WHATSAPP_MODE_UNAVAILABLE",
  "OTP_WHATSAPP_APP_UNAVAILABLE",
  "OTP_AUTO_OPEN_REQUESTED",
  "OTP_BACKGROUND_LAUNCH_BLOCKED",
  "OTP_WHATSAPP_OPEN_REQUESTED",
  "OTP_WHATSAPP_OPEN_FAILED",
  // H2 AUTO 2.00-2.02 statuses emitted by H2OtpAutoSend / H2OtpHandoff
  // and by the new inbound-message-only H2OtpIncomingReply.
  "OTP_WHATSAPP_WINDOW_VISIBLE",
  "OTP_RECIPIENT_VERIFIED",
  "OTP_RECIPIENT_NOT_VERIFIED",
  "OTP_COMPOSER_FILLED",
  "OTP_COMPOSER_FILL_FAILED",
  "OTP_SEND_BUTTON_NOT_READY",
  "OTP_SEND_BUTTON_VERIFIED",
  "OTP_WHATSAPP_WINDOW_NOT_SEEN",
  "OTP_CHAT_NOT_VERIFIED",
  "OTP_SEND_NOT_CONFIRMED",
  "OTP_FAILURE_NOTIFICATION_UNAVAILABLE",
  "OTP_INCOMING_REPLY_UNAVAILABLE",
  "OTP_INCOMING_LOOKUP_FAILED",
  "OTP_INCOMING_ACK_PENDING",
  "OTP_INCOMING_RETRY_SCHEDULED",
  "OTP_INCOMING_RETRY_EXHAUSTED",
  "OTP_INCOMING_ANDROID_ACCEPTED_UNVERIFIED",
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
    imageRepliesSupported: z.boolean().optional(),
    imageCacheReady: z.number().int().min(0).max(1000).optional(),
    imageCacheFailed: z.number().int().min(0).max(1000).optional(),
    // Per-FAQ cache inventory: bounded opaque identifiers and fixed states only.
    // Never transmit local paths, message bodies, phone numbers or file bytes.
    imageCacheFiles: z.array(z.object({
      faqId: z.string().regex(/^[a-z0-9_-]{3,48}$/),
      imageId: z.string().regex(/^[a-f0-9]{32}$/),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      state: z.enum(["READY", "MISSING", "DOWNLOAD_FAILED"]),
    }).strict()).max(100).optional(),
    imageCacheFilesTruncated: z.boolean().optional(),
    imageCacheUpdatedAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).optional(),
    imageReplyStatusCode: z.enum(H2_AUTO_IMAGE_REPLY_STATUS_CODES).optional(),
    imageReplyStatusAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).optional(),
    imageReplyQueuePending: z.number().int().min(0).max(100).optional(),
    imageReplyDetailCode: z.enum(H2_AUTO_IMAGE_REPLY_DETAIL_CODES).optional(),
    imageReplyStage: z.enum(["NONE", "TEXT", "IMAGE"]).optional(),
    imageReplyUiDiagnosticCode: z.enum([
      "NOT_CHECKED", "WINDOW_NOT_AVAILABLE", "WRONG_WHATSAPP_WINDOW",
      "MULTIPLE_RECIPIENT_IDENTITIES", "PREVIEW_RECIPIENT_NOT_VISIBLE",
      "CHAT_RECIPIENT_NOT_VISIBLE", "RECIPIENT_NAME_OR_NUMBER_MISMATCH",
      "RECIPIENT_UNCONFIRMED",
    ]).optional(),
    imageReplyUiStage: z.enum(["NONE", "CHAT", "PREVIEW", "AFTER_CLICK"]).optional(),
    imageReplyAccessibilityConnected: z.boolean().optional(),
    learningQueuePending: z.number().int().min(0).max(2000).optional(),
    learningQueueFull: z.number().int().min(0).max(1000000).optional(),
    learningWorkerFull: z.number().int().min(0).max(1000000).optional(),
    notificationLastCode: z.enum(["NOT_CHECKED","STALE_NOTIFICATION","GROUP_OR_AMBIGUOUS",
      "MISSING_TITLE","NO_READABLE_MESSAGE","BOT_DISABLED","OUTSIDE_SCHEDULE",
      "CONTACT_BLOCKED","CONTACT_PAUSED","AMBIGUOUS_DIRECTION",
      "INBOUND_VERIFIED","ALREADY_PROCESSING","SHORTCUT_UNAVAILABLE"]).default("NOT_CHECKED"),
    notificationLastAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).default(0),
    desktopReadOnly: z.boolean().default(false),
    desktopLastCode: z.enum(["NOT_CHECKED","NOTIFICATION_REMOVED","FRESH_ACTION_FOUND","NO_ACTIVE_NOTIFICATION","NO_REPLY_ACTION","ACTION_EXPIRED_AFTER_READ","ORIGINAL_ACTION_ATTEMPT","SEND_FAILED_OR_EXPIRED"]).default("NOT_CHECKED"),
    desktopLastAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).default(0),
    statusCode: z.enum(H2_AUTO_STATUS_CODES),
    statusAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP),
    androidErrorCode: z.number().int().min(-1).max(100),
    replyStatusCode: z.enum(H2_AUTO_REPLY_STATUS_CODES),
    replyStatusAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP),
    otpDeliveryStatusCode: z.enum(H2_AUTO_OTP_STATUS_CODES).optional(),
    otpDeliveryStatusAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).optional(),
    // H2 AUTO 2.08 reports ONLY OTP continuity timestamps/status.
    // Optional to preserve compatibility with older APKs.
    otpPollLastSuccessAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).optional(),
    otpPollLastFailureAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).optional(),
    otpMonitorRunning: z.boolean().optional(),
    otpMonitorHeartbeatAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).optional(),
    otpMonitorStartFailedAt: z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP).optional(),
    // H2 AUTO 2.06: aggregated local pause records, never phone/name/hash.
    // Optional: APK 2.05 and older continue to ACK without these counters.
    localPauseActiveRecords: z.number().int().min(0).max(100000).optional(),
    localPauseTemporaryRecords: z.number().int().min(0).max(100000).optional(),
    localPausePermanentRecords: z.number().int().min(0).max(100000).optional(),
    localPauseEntries: z.array(z.object({
      id:z.string().regex(/^[a-f0-9]{32}$/),
      name:z.string().max(70),
      phone:z.string().regex(/^[0-9]{10,11}$/).optional(),
      identitySource:z.enum(["contacts","history","unknown","ambiguous"]),
      mode:z.enum(["permanent","temporary"]),
      origin:z.enum(["operator","automatic"]),
      until:z.number().int().min(0).max(H2_AUTO_MAX_TIMESTAMP),
    }).strict()).max(100).optional(),
    localPauseLastReleaseId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
    localPauseLastSyncId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
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
