import { gzipSync, gunzipSync } from "node:zlib";

function normalizeRecoveryPayload(rawValue: string): string {
  let raw = String(rawValue || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return "";

  const assignmentIndex = raw.indexOf("LOAN_RESTORE_PAYLOAD_B64=");
  if (assignmentIndex >= 0) {
    raw = raw.slice(assignmentIndex + "LOAN_RESTORE_PAYLOAD_B64=".length).trim();
  }

  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }

  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[^\n]*\n?/, "").replace(/```\s*$/, "").trim();
  }

  if (raw.startsWith("{")) {
    JSON.parse(raw);
    return gzipSync(Buffer.from(raw, "utf8")).toString("base64");
  }

  const gzipMarker = raw.indexOf("H4sI");
  if (gzipMarker >= 0) raw = raw.slice(gzipMarker);

  raw = raw.replace(/\s+/g, "");
  const decoded = Buffer.from(raw, "base64");

  try {
    const jsonText = gunzipSync(decoded).toString("utf8");
    JSON.parse(jsonText);
    return decoded.toString("base64");
  } catch {
    const maybeJson = decoded.toString("utf8").trim();
    if (maybeJson.startsWith("{")) {
      JSON.parse(maybeJson);
      return gzipSync(Buffer.from(maybeJson, "utf8")).toString("base64");
    }
    throw new Error("Pacote de recuperação não está em formato reconhecido");
  }
}

const original = String(process.env.LOAN_RESTORE_PAYLOAD_B64 || "");
if (original.trim()) {
  try {
    process.env.LOAN_RESTORE_PAYLOAD_B64 = normalizeRecoveryPayload(original);
    console.log("[loans-recovery-wrapper] pacote de recuperação normalizado com sucesso.");
  } catch (error) {
    console.error("[loans-recovery-wrapper] pacote inválido; estrutura será preparada sem derrubar o site:", error instanceof Error ? error.message : String(error));
    delete process.env.LOAN_RESTORE_PAYLOAD_B64;
  }
}

process.on("beforeExit", () => {
  if (process.exitCode && process.exitCode !== 0) {
    console.warn("[loans-recovery-wrapper] recuperação apresentou erro, mas o deploy continuará para manter o site disponível.");
    process.exitCode = 0;
  }
});

await import("./apply-loans-recovery-migration.ts");
