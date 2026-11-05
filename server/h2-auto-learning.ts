import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Fila de perguntas sem resposta do H2 AUTO.
 * Funciona sem LLM, fornecedor de IA ou API comercial.
 * Coleta somente quando o ADM ativou explicitamente a opção no aparelho.
 * Nunca armazena telefone, CPF, e-mail, código, endereço ou conversa completa.
 */
let prepared: Promise<void> | undefined;
export async function ensureH2AutoLearningTable(): Promise<void> {
  if (!prepared) prepared = (async () => {
    const db = await getDb();
    if (!db) throw new Error("h2_auto_learning_database_unavailable");
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_unanswered_questions (
      device_id VARCHAR(32) NOT NULL,
      question_hash CHAR(64) NOT NULL,
      question VARCHAR(160) NOT NULL,
      occurrences INT NOT NULL DEFAULT 1,
      first_seen_at BIGINT NOT NULL,
      last_seen_at BIGINT NOT NULL,
      PRIMARY KEY(device_id, question_hash),
      INDEX idx_h2auto_unknown_latest (device_id, last_seen_at)
    ) ENGINE=InnoDB`);
  })().catch(error => { prepared = undefined; throw error; });
  return prepared;
}

const STOP = new Set([
  "oi", "ola", "bom", "boa", "dia", "tarde", "noite", "eu", "me", "meu", "minha",
  "queria", "quero", "gostaria", "preciso", "saber", "como", "posso", "pode",
  "qual", "quais", "onde", "quando", "tem", "um", "uma", "o", "a", "os", "as",
  "de", "do", "da", "dos", "das", "para", "por", "no", "na", "em", "com", "que",
  "seria", "favor", "poderia", "voces", "vocês", "me", "explicar", "fazer"
]);

export function safeH2AutoUnknownQuestion(input: unknown): { question: string; hash: string } | null {
  if (typeof input !== "string") return null;
  const question = input.replace(/\s+/g, " ").trim();
  if (question.length < 8 || question.length > 160) return null;
  // Identificadores, números, links e contatos: nunca registrar na fila.
  if (/[0-9@]/.test(question) || /https?:|www\.|[\\/]|\b(?:senha|token|pix|chave|placa|cpf|cnpj|rg)\b/i.test(question))
    return null;
  const normalized = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:menu|inicio|voltar|oi|ola|bom dia|boa tarde|boa noite|obrigado|obrigada|ok|sim|nao)$/.test(normalized))
    return null;
  const isQuestion = question.includes("?") ||
    /^(?:como|quando|onde|qual|quais|porque|por que|quanto|quantos|posso|pode|tem|preciso|quero|queria|gostaria|nao consigo|não consigo|tenho uma duvida|tenho uma dúvida|me explica|me ajuda)\b/i.test(question);
  if (!isQuestion) return null;
  const keywords = [...new Set(normalized.split(" ").filter(word => word.length > 2 && !STOP.has(word)))];
  const canonical = keywords.length >= 2 ? keywords.sort().join(" ") : normalized;
  const hash = createHash("sha256").update(canonical).digest("hex");
  return { question, hash };
}

export async function recordH2AutoUnknownQuestion(deviceId: string, input: string): Promise<boolean> {
  if (!/^[a-f0-9]{24}$/.test(deviceId)) return false;
  const candidate = safeH2AutoUnknownQuestion(input);
  if (!candidate) return false;
  await ensureH2AutoLearningTable();
  const db = await getDb();
  if (!db) return false;
  const now = Date.now();
  await db.execute(sql`INSERT INTO h2_auto_unanswered_questions
    (device_id, question_hash, question, occurrences, first_seen_at, last_seen_at)
    VALUES (${deviceId}, ${candidate.hash}, ${candidate.question}, 1, ${now}, ${now})
    ON DUPLICATE KEY UPDATE occurrences=LEAST(occurrences+1,2147483647),
      last_seen_at=VALUES(last_seen_at)`);
  return true;
}

export async function listH2AutoUnknownQuestions(deviceId: string, limit = 50) {
  await ensureH2AutoLearningTable();
  const db = await getDb();
  if (!db) throw new Error("h2_auto_learning_database_unavailable");
  const bounded = Math.max(10, Math.min(500, Math.trunc(limit)));
  const [items, summary] = await Promise.all([
    db.execute(sql`SELECT question_hash AS questionHash, question, occurrences,
      first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
      FROM h2_auto_unanswered_questions
      WHERE device_id=${deviceId} ORDER BY last_seen_at DESC LIMIT ${bounded}`),
    db.execute(sql`SELECT COUNT(*) AS pending, COALESCE(SUM(occurrences),0) AS received
      FROM h2_auto_unanswered_questions WHERE device_id=${deviceId}`),
  ]);
  const itemRows = (items[0] as any[]) || [];
  const totals = ((summary[0] as any[]) || [])[0] || {};
  return {
    questions: itemRows.map(row => ({
      questionHash: String(row.questionHash),
      question: String(row.question),
      occurrences: Number(row.occurrences || 0),
      firstSeenAt: Number(row.firstSeenAt || 0),
      lastSeenAt: Number(row.lastSeenAt || 0),
    })),
    pending: Number(totals.pending || 0),
    received: Number(totals.received || 0),
  };
}

export async function deleteH2AutoUnknownQuestion(deviceId: string, questionHash?: string) {
  await ensureH2AutoLearningTable();
  const db = await getDb();
  if (!db) throw new Error("h2_auto_learning_database_unavailable");
  if (questionHash) {
    await db.execute(sql`DELETE FROM h2_auto_unanswered_questions
      WHERE device_id=${deviceId} AND question_hash=${questionHash}`);
  } else {
    await db.execute(sql`DELETE FROM h2_auto_unanswered_questions WHERE device_id=${deviceId}`);
  }
}
