const DIAGNOSTICS_ENABLED = process.env.H2_ASSISTANT_DIAGNOSTICS !== "false";

type SafeDetail = string | number | boolean | null | undefined;

function sanitizeDetails(details: Record<string, SafeDetail>) {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === "string") return [key, value.slice(0, 80)];
        return [key, value];
      }),
  );
}

export function h2Diagnostic(event: string, details: Record<string, SafeDetail> = {}) {
  if (!DIAGNOSTICS_ENABLED) return;
  console.info(`[${event}]`, JSON.stringify(sanitizeDetails(details)));
}

export function h2DiagnosticError(event: string, error: unknown, details: Record<string, SafeDetail> = {}) {
  const name = error instanceof Error ? error.name : "UnknownError";
  h2Diagnostic(event, { ...details, errorName: name });
}

export function h2DiagnosticHttpError(event: string, status: number, details: Record<string, SafeDetail> = {}) {
  h2Diagnostic(event, { ...details, status });
}

export const H2_DIAGNOSTIC_EVENTS = {
  bootstrapStart: "H2_BOOTSTRAP_START",
  bootstrapOk: "H2_BOOTSTRAP_OK",
  authOk: "H2_AUTH_OK",
  audioReceived: "H2_AUDIO_RECEIVED",
  audioBytes: "H2_AUDIO_BYTES",
  transcriptionStart: "H2_TRANSCRIPTION_START",
  transcriptionOk: "H2_TRANSCRIPTION_OK",
  transcriptionError: "H2_TRANSCRIPTION_ERROR",
  openAiKeyPresent: "H2_OPENAI_KEY_PRESENT",
  openAiRequest: "H2_OPENAI_REQUEST",
  openAiOk: "H2_OPENAI_OK",
  openAiError: "H2_OPENAI_ERROR",
} as const;
