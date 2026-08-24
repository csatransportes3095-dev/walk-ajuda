import { gzipSync, gunzipSync } from "node:zlib";
import { createConnection } from "mysql2/promise";

const LEGACY_RECOVERY_ID = "walk-ajuda-loans-2026-07-28";
const FULL_RECOVERY_ID = "walk-ajuda-loans-main-customers-2026-07-28-v2";

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

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function blank(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

function sameIdentity(a: any, b: any): boolean {
  const cpfA = digits(a?.cpf);
  const cpfB = digits(b?.cpf);
  if (cpfA.length === 11 && cpfA === cpfB) return true;
  const phoneA = digits(a?.phone);
  const phoneB = digits(b?.phone);
  return !!phoneA && !!phoneB && (phoneA === phoneB || phoneA.endsWith(phoneB) || phoneB.endsWith(phoneA));
}

async function restoreMainCustomers(payload: any): Promise<{ inserted: number; merged: number }> {
  const sourceRows = Array.isArray(payload?.tables?.customers) ? payload.tables.customers : [];
  if (!sourceRows.length || !process.env.DATABASE_URL) return { inserted: 0, merged: 0 };

  const db = await createConnection(process.env.DATABASE_URL);
  let inserted = 0;
  let merged = 0;
  try {
    const [rawCurrent] = await db.query("SELECT * FROM customers WHERE deletedAt IS NULL");
    const current = Array.isArray(rawCurrent) ? rawCurrent as any[] : [];
    const [rawIds] = await db.query("SELECT id FROM customers");
    const usedIds = new Set((Array.isArray(rawIds) ? rawIds : []).map((row: any) => Number(row.id)));

    for (const src of sourceRows) {
      const phone = digits(src?.phone);
      if (!phone || blank(src?.name)) continue;
      const existing = current.find((row: any) => sameIdentity(row, src));

      if (existing) {
        const sets: string[] = [];
        const values: any[] = [];
        const safeFields = [
          "name", "cpf", "email", "city", "uf", "profilePhotoUrl",
          "customerNumber", "referredBy", "referredByPhone", "lastAccessAt",
        ];
        for (const field of safeFields) {
          if (blank(existing[field]) && !blank(src[field])) {
            sets.push(`\`${field}\`=?`);
            values.push(src[field]);
          }
        }
        if (sets.length) {
          values.push(existing.id);
          await db.execute(`UPDATE customers SET ${sets.join(",")}, updatedAt=NOW() WHERE id=?`, values);
        }
        merged++;
        continue;
      }

      const cols = [
        "name", "phone", "email", "city", "uf", "cpf", "referredBy", "referredByPhone",
        "profilePhotoUrl", "lastAccessAt", "customerNumber", "createdAt", "updatedAt",
      ];
      const vals = cols.map((field) => field === "phone" ? phone : (src[field] ?? null));
      const requestedId = Number(src?.id || 0);
      if (requestedId > 0 && !usedIds.has(requestedId)) {
        await db.execute(
          `INSERT INTO customers (id,${cols.map((c) => `\`${c}\``).join(",")}) VALUES (?,${cols.map(() => "?").join(",")})`,
          [requestedId, ...vals],
        );
        usedIds.add(requestedId);
        current.push({ ...src, id: requestedId, phone });
      } else {
        const [result]: any = await db.execute(
          `INSERT INTO customers (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
          vals,
        );
        const id = Number(result?.insertId || 0);
        if (id) usedIds.add(id);
        current.push({ ...src, id, phone });
      }
      inserted++;
    }

    // Se uma tentativa antiga marcou a recuperação como concluída mas não deixou empréstimos,
    // libera somente o marcador para permitir uma nova execução. Nenhum dado financeiro é apagado.
    try {
      const [loanCountRows]: any = await db.query("SELECT COUNT(*) AS cnt FROM loans");
      const loanCount = Number(loanCountRows?.[0]?.cnt || 0);
      if (loanCount === 0) {
        await db.execute("DELETE FROM loanRecoveryMeta WHERE recoveryKey=?", [LEGACY_RECOVERY_ID]);
      }
    } catch {
      // A tabela de metadados pode ainda não existir; o restaurador principal a criará.
    }

    return { inserted, merged };
  } finally {
    await db.end();
  }
}

const original = String(process.env.LOAN_RESTORE_PAYLOAD_B64 || "");
if (original.trim()) {
  try {
    const normalized = normalizeRecoveryPayload(original);
    const payload = JSON.parse(gunzipSync(Buffer.from(normalized, "base64")).toString("utf8"));

    if (payload?.recoveryId === FULL_RECOVERY_ID) {
      const customerResult = await restoreMainCustomers(payload);
      console.log("[loans-recovery-wrapper] cadastro principal restaurado:", JSON.stringify(customerResult));

      // O restaurador legado continua responsável por Planilha, Empréstimos, parcelas e comprovantes.
      // Apenas troca o identificador em memória; o pacote com dados pessoais nunca vai para o GitHub.
      payload.recoveryId = LEGACY_RECOVERY_ID;
      process.env.LOAN_RESTORE_PAYLOAD_B64 = gzipSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64");
    } else {
      process.env.LOAN_RESTORE_PAYLOAD_B64 = normalized;
    }

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
