import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { productQuestions, questionAudioDrafts, siteSettings, type ProductQuestion } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { r2DeleteObjects, r2GetObjectBuffer } from "./r2Storage";

const MANIFEST_RULES_KEY = "question_blocking_manifest_rules_v1";

type ManifestRule = {
  id: string;
  questionId: number;
  answer: string;
  title: string;
  message: string;
  buttonLabel: string;
  enabled: boolean;
};

type IntegrityIssue = {
  type: "missing_parent" | "cycle";
  questionId: number;
  question: string;
  parentQuestionId: number | null;
};

export type QuestionTreeAudit = {
  total: number;
  roots: number;
  subs: number;
  subSubs: number;
  maxDepth: number;
  valid: boolean;
  issues: IntegrityIssue[];
};

function normalize(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function parseManifestRules(raw: string | null | undefined): ManifestRule[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((rule: any) => ({
      id: String(rule.id || `${rule.questionId}:${rule.answer}`),
      questionId: Number(rule.questionId),
      answer: String(rule.answer || ""),
      title: String(rule.title || "Antes de continuar"),
      message: String(rule.message || "Esta resposta não permite continuar com o pedido."),
      buttonLabel: String(rule.buttonLabel || "Voltar e alterar resposta"),
      enabled: rule.enabled !== false,
    })).filter((rule) => Number.isFinite(rule.questionId) && rule.questionId > 0 && rule.answer.trim());
  } catch {
    return [];
  }
}

function auditRows(rows: ProductQuestion[]): QuestionTreeAudit {
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const issues: IntegrityIssue[] = [];
  let maxDepth = 0;
  let subs = 0;
  let subSubs = 0;

  for (const row of rows) {
    const parentId = row.parentQuestionId == null ? null : Number(row.parentQuestionId);
    if (parentId && !byId.has(parentId)) {
      issues.push({ type: "missing_parent", questionId: Number(row.id), question: row.question, parentQuestionId: parentId });
      continue;
    }

    if (!parentId) continue;
    subs += 1;
    let depth = 0;
    let current: ProductQuestion | undefined = row;
    const seen = new Set<number>();
    while (current?.parentQuestionId) {
      const currentId = Number(current.id);
      if (seen.has(currentId)) {
        issues.push({ type: "cycle", questionId: Number(row.id), question: row.question, parentQuestionId: parentId });
        depth = 0;
        break;
      }
      seen.add(currentId);
      depth += 1;
      current = byId.get(Number(current.parentQuestionId));
    }
    if (depth >= 2) subSubs += 1;
    maxDepth = Math.max(maxDepth, depth);
  }

  return {
    total: rows.length,
    roots: rows.filter((row) => !row.parentQuestionId).length,
    subs,
    subSubs,
    maxDepth,
    valid: issues.length === 0,
    issues,
  };
}

function topologicalTreeOrder(rows: ProductQuestion[]): ProductQuestion[] {
  const audit = auditRows(rows);
  if (!audit.valid) {
    const detail = audit.issues.map((issue) => `${issue.type}:${issue.questionId}->${issue.parentQuestionId ?? "null"}`).join(", ");
    throw new Error(`A árvore de origem está corrompida e não pode ser copiada com segurança (${detail}).`);
  }

  const byParent = new Map<number | null, ProductQuestion[]>();
  for (const row of rows) {
    const parentId = row.parentQuestionId == null ? null : Number(row.parentQuestionId);
    const list = byParent.get(parentId) || [];
    list.push(row);
    byParent.set(parentId, list);
  }
  for (const [parentId, list] of byParent) {
    byParent.set(parentId, [...list].sort((a, b) => (Number(a.sortOrder) - Number(b.sortOrder)) || (Number(a.id) - Number(b.id))));
  }

  const ordered: ProductQuestion[] = [];
  const visited = new Set<number>();
  const walk = (row: ProductQuestion) => {
    const id = Number(row.id);
    if (visited.has(id)) return;
    visited.add(id);
    ordered.push(row);
    for (const child of byParent.get(id) || []) walk(child);
  };
  for (const root of byParent.get(null) || []) walk(root);

  if (ordered.length !== rows.length) {
    throw new Error(`A árvore de origem não pôde ser ordenada por dependência (${ordered.length}/${rows.length}).`);
  }
  return ordered;
}

function questionAudioDescriptor(storageKey: string | null): { mimeType: string; ext: string } | null {
  const ext = storageKey?.split(".").pop()?.toLowerCase();
  if (ext === "webm") return { mimeType: "audio/webm", ext };
  if (ext === "ogg") return { mimeType: "audio/ogg", ext };
  if (ext === "m4a" || ext === "mp4") return { mimeType: "audio/mp4", ext: "m4a" };
  if (ext === "mp3") return { mimeType: "audio/mpeg", ext };
  return null;
}

async function copyPromptAudio(source: ProductQuestion, targetQuestionId: number) {
  if (source.questionPresentation !== "audio" || !source.questionAudioStorageKey) {
    return { questionPresentation: "text" as const, questionAudioUrl: null, questionAudioStorageKey: null };
  }
  const descriptor = questionAudioDescriptor(source.questionAudioStorageKey);
  if (!descriptor) throw new Error(`Formato de áudio inválido na pergunta ${source.id}.`);
  const buffer = await r2GetObjectBuffer(source.questionAudioStorageKey);
  const storageKey = `question-prompts/${targetQuestionId}/${randomUUID()}.${descriptor.ext}`;
  const uploaded = await storagePut(storageKey, buffer, descriptor.mimeType);
  return {
    questionPresentation: "audio" as const,
    questionAudioUrl: uploaded.url,
    questionAudioStorageKey: storageKey,
  };
}

function comparable(row: ProductQuestion) {
  return {
    question: row.question,
    fieldType: row.fieldType,
    options: row.options ?? null,
    isRequired: Number(row.isRequired),
    sortOrder: Number(row.sortOrder),
    helpText: row.helpText ?? null,
    audioMinDurationSeconds: Number(row.audioMinDurationSeconds),
    audioMaxDurationSeconds: Number(row.audioMaxDurationSeconds),
    allowAudioRerecord: Number(row.allowAudioRerecord),
    allowAudioFileUpload: Number(row.allowAudioFileUpload),
    questionPresentation: row.questionPresentation,
    showQuestionTextWithAudio: Number(row.showQuestionTextWithAudio),
    triggerOption: row.triggerOption ?? null,
  };
}

async function getManifestSetting(tx: any): Promise<{ raw: string; rules: ManifestRule[] }> {
  const rows = await tx.select().from(siteSettings).where(eq(siteSettings.settingKey, MANIFEST_RULES_KEY)).limit(1);
  const raw = rows[0]?.settingValue || "[]";
  return { raw, rules: parseManifestRules(raw) };
}

async function saveManifestRules(tx: any, rules: ManifestRule[]) {
  await tx.insert(siteSettings)
    .values({ settingKey: MANIFEST_RULES_KEY, settingValue: JSON.stringify(rules) })
    .onDuplicateKeyUpdate({ set: { settingValue: JSON.stringify(rules) } });
}

export async function auditOptionQuestionTree(optionId: number): Promise<QuestionTreeAudit> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const rows = await db.select().from(productQuestions)
    .where(eq(productQuestions.optionId, optionId))
    .orderBy(asc(productQuestions.sortOrder), asc(productQuestions.id));
  return auditRows(rows);
}

export async function copyOptionQuestionsSafely(input: { fromOptionId: number; toOptionId: number; toProductId: number }) {
  const { fromOptionId, toOptionId, toProductId } = input;
  if (!Number.isFinite(fromOptionId) || !Number.isFinite(toOptionId) || !Number.isFinite(toProductId)) throw new Error("IDs inválidos para cópia.");
  if (fromOptionId === toOptionId) throw new Error("Origem e destino são a mesma opção. Nenhuma alteração foi feita.");

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");

  const sourceRows = await db.select().from(productQuestions)
    .where(eq(productQuestions.optionId, fromOptionId))
    .orderBy(asc(productQuestions.sortOrder), asc(productQuestions.id));
  if (sourceRows.length === 0) throw new Error("A opção de origem não possui perguntas para copiar.");
  const orderedSource = topologicalTreeOrder(sourceRows);
  const sourceAudit = auditRows(sourceRows);

  const oldDestinationRows = await db.select().from(productQuestions)
    .where(eq(productQuestions.optionId, toOptionId))
    .orderBy(asc(productQuestions.sortOrder), asc(productQuestions.id));
  const oldDestinationIds = new Set(oldDestinationRows.map((row) => Number(row.id)));
  const oldDestinationAudioKeys = oldDestinationRows.map((row) => row.questionAudioStorageKey).filter((key): key is string => Boolean(key));
  const uploadedKeys: string[] = [];
  const idMap = new Map<number, number>();

  try {
    const result = await db.transaction(async (tx) => {
      const manifest = await getManifestSetting(tx);
      await tx.delete(productQuestions).where(eq(productQuestions.optionId, toOptionId));
      if (oldDestinationIds.size > 0) {
        await tx.delete(questionAudioDrafts).where(inArray(questionAudioDrafts.questionId, Array.from(oldDestinationIds)));
      }

      for (const source of orderedSource) {
        const mappedParentId = source.parentQuestionId == null ? null : (idMap.get(Number(source.parentQuestionId)) ?? null);
        if (source.parentQuestionId != null && mappedParentId == null) {
          throw new Error(`Pai da pergunta ${source.id} ainda não foi criado. A cópia foi cancelada sem alterar o destino.`);
        }

        const inserted: any = await tx.insert(productQuestions).values({
          productId: toProductId,
          optionId: toOptionId,
          question: source.question,
          fieldType: source.fieldType,
          options: source.options,
          isRequired: Number(source.isRequired),
          sortOrder: Number(source.sortOrder),
          helpText: source.helpText,
          audioMinDurationSeconds: Number(source.audioMinDurationSeconds),
          audioMaxDurationSeconds: Number(source.audioMaxDurationSeconds),
          allowAudioRerecord: Number(source.allowAudioRerecord),
          allowAudioFileUpload: Number(source.allowAudioFileUpload),
          questionPresentation: "text",
          questionAudioUrl: null,
          questionAudioStorageKey: null,
          showQuestionTextWithAudio: Number(source.showQuestionTextWithAudio),
          parentQuestionId: mappedParentId,
          triggerOption: source.triggerOption,
        });
        const newId = Number(inserted?.[0]?.insertId);
        if (!Number.isFinite(newId) || newId <= 0) throw new Error(`Banco não retornou ID da pergunta copiada ${source.id}.`);
        idMap.set(Number(source.id), newId);

        if (source.questionPresentation === "audio" && source.questionAudioStorageKey) {
          const prompt = await copyPromptAudio(source, newId);
          if (prompt.questionAudioStorageKey) uploadedKeys.push(prompt.questionAudioStorageKey);
          await tx.update(productQuestions).set(prompt).where(eq(productQuestions.id, newId));
        }
      }

      const sourceIds = new Set(sourceRows.map((row) => Number(row.id)));
      const newDestinationIds = new Set(Array.from(idMap.values()));
      const sourceRules = manifest.rules.filter((rule) => sourceIds.has(rule.questionId));
      const keptRules = manifest.rules.filter((rule) => !oldDestinationIds.has(rule.questionId) && !newDestinationIds.has(rule.questionId));
      const clonedRules = sourceRules.flatMap((rule) => {
        const questionId = idMap.get(rule.questionId);
        if (!questionId) return [];
        return [{ ...rule, id: `${questionId}:${normalize(rule.answer)}`, questionId }];
      });
      const deduped = new Map<string, ManifestRule>();
      for (const rule of [...keptRules, ...clonedRules]) deduped.set(`${rule.questionId}:${normalize(rule.answer)}`, rule);
      await saveManifestRules(tx, Array.from(deduped.values()));

      const copiedRows = await tx.select().from(productQuestions)
        .where(eq(productQuestions.optionId, toOptionId))
        .orderBy(asc(productQuestions.sortOrder), asc(productQuestions.id));
      if (copiedRows.length !== sourceRows.length) {
        throw new Error(`Auditoria bloqueou a cópia: origem=${sourceRows.length}, destino=${copiedRows.length}.`);
      }
      const copiedAudit = auditRows(copiedRows);
      if (!copiedAudit.valid || copiedAudit.maxDepth !== sourceAudit.maxDepth || copiedAudit.roots !== sourceAudit.roots) {
        throw new Error("Auditoria bloqueou a cópia porque a hierarquia final não ficou idêntica à origem.");
      }

      const copiedById = new Map(copiedRows.map((row) => [Number(row.id), row]));
      for (const source of sourceRows) {
        const copiedId = idMap.get(Number(source.id));
        const copied = copiedId ? copiedById.get(copiedId) : undefined;
        if (!copied || JSON.stringify(comparable(copied)) !== JSON.stringify(comparable(source))) {
          throw new Error(`Auditoria bloqueou a cópia: dados divergentes na pergunta "${source.question}".`);
        }
        const expectedParent = source.parentQuestionId == null ? null : idMap.get(Number(source.parentQuestionId)) ?? null;
        if ((copied.parentQuestionId == null ? null : Number(copied.parentQuestionId)) !== expectedParent) {
          throw new Error(`Auditoria bloqueou a cópia: vínculo pai/filho divergente em "${source.question}".`);
        }
      }

      return {
        success: true as const,
        count: copiedRows.length,
        roots: copiedAudit.roots,
        subs: copiedAudit.subs,
        subSubs: copiedAudit.subSubs,
        maxDepth: copiedAudit.maxDepth,
        manifestRulesCopied: clonedRules.length,
      };
    });

    await r2DeleteObjects(oldDestinationAudioKeys).catch((error) => console.error("[QuestionIntegrity] Falha ao limpar áudios antigos do destino:", error));
    return result;
  } catch (error) {
    await r2DeleteObjects(uploadedKeys).catch(() => undefined);
    throw error;
  }
}

function collectBranchIds(rootId: number, rows: ProductQuestion[]): number[] {
  const children = new Map<number, ProductQuestion[]>();
  for (const row of rows) {
    if (row.parentQuestionId == null) continue;
    const parentId = Number(row.parentQuestionId);
    const list = children.get(parentId) || [];
    list.push(row);
    children.set(parentId, list);
  }
  const ids: number[] = [];
  const visited = new Set<number>();
  const walk = (id: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const child of children.get(id) || []) walk(Number(child.id));
    ids.push(id);
  };
  walk(rootId);
  return ids;
}

export async function deleteQuestionBranchSafely(questionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const targetRows = await db.select().from(productQuestions).where(eq(productQuestions.id, questionId)).limit(1);
  const target = targetRows[0];
  if (!target) return { success: true as const, deleted: 0, ids: [] as number[] };

  const optionId = Number(target.optionId);
  const optionRows = await db.select().from(productQuestions)
    .where(eq(productQuestions.optionId, optionId))
    .orderBy(asc(productQuestions.sortOrder), asc(productQuestions.id));
  const ids = collectBranchIds(questionId, optionRows);
  const idSet = new Set(ids);
  const audioKeys = optionRows
    .filter((row) => idSet.has(Number(row.id)))
    .map((row) => row.questionAudioStorageKey)
    .filter((key): key is string => Boolean(key));

  await db.transaction(async (tx) => {
    const manifest = await getManifestSetting(tx);
    await tx.delete(questionAudioDrafts).where(inArray(questionAudioDrafts.questionId, ids));
    await tx.delete(productQuestions).where(inArray(productQuestions.id, ids));
    const keptRules = manifest.rules.filter((rule) => !idSet.has(rule.questionId));
    if (keptRules.length !== manifest.rules.length) await saveManifestRules(tx, keptRules);
  });

  await r2DeleteObjects(audioKeys).catch((error) => console.error("[QuestionIntegrity] Falha ao limpar áudio de pergunta excluída:", error));
  return { success: true as const, deleted: ids.length, ids };
}

export async function auditQuestionHistory(input: { productName: string; optionLabel: string; expectedCount?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");

  const optionRows: any = await db.execute(`
    SELECT p.id AS productId, p.name AS productName, o.id AS optionId, o.label AS optionLabel
    FROM products p
    JOIN productOptions o ON o.productId = p.id
  `);
  const candidates = (optionRows?.[0] || []).filter((row: any) =>
    normalize(row.productName) === normalize(input.productName) && normalize(row.optionLabel) === normalize(input.optionLabel),
  );
  if (candidates.length !== 1) {
    throw new Error(`Não foi possível identificar uma única opção para ${input.productName} / ${input.optionLabel} (encontradas: ${candidates.length}).`);
  }
  const target = candidates[0];
  const optionId = Number(target.optionId);

  const tableRows: any = await db.execute(`
    SELECT table_name AS tableName
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name LIKE 'productQuestions\\_backup\\_%' ESCAPE '\\\\'
    ORDER BY table_name DESC
  `);
  const backupTables = (tableRows?.[0] || [])
    .map((row: any) => String(row.tableName || ""))
    .filter((name: string) => /^productQuestions_backup_[A-Za-z0-9_]+$/.test(name));

  const snapshots: Array<{
    source: string;
    current: boolean;
    count: number;
    matchesExpectedCount: boolean | null;
    audit: QuestionTreeAudit;
    questions: ProductQuestion[];
  }> = [];

  const currentRows = await db.select().from(productQuestions)
    .where(eq(productQuestions.optionId, optionId))
    .orderBy(asc(productQuestions.sortOrder), asc(productQuestions.id));
  snapshots.push({
    source: "productQuestions",
    current: true,
    count: currentRows.length,
    matchesExpectedCount: input.expectedCount == null ? null : currentRows.length === input.expectedCount,
    audit: auditRows(currentRows),
    questions: currentRows,
  });

  for (const tableName of backupTables) {
    const result: any = await db.execute(`SELECT * FROM \`${tableName}\` WHERE optionId = ${optionId} ORDER BY sortOrder, id`);
    const rows = (result?.[0] || []) as ProductQuestion[];
    snapshots.push({
      source: tableName,
      current: false,
      count: rows.length,
      matchesExpectedCount: input.expectedCount == null ? null : rows.length === input.expectedCount,
      audit: auditRows(rows),
      questions: rows,
    });
  }

  return {
    target: {
      productId: Number(target.productId),
      productName: String(target.productName),
      optionId,
      optionLabel: String(target.optionLabel),
    },
    expectedCount: input.expectedCount ?? null,
    snapshots,
    exactMatches: snapshots.filter((snapshot) => snapshot.matchesExpectedCount === true).map((snapshot) => snapshot.source),
  };
}

export async function restoreQuestionOptionFromBackupTable(input: {
  tableName: string;
  productId: number;
  optionId: number;
  expectedCount?: number | null;
}) {
  if (!/^productQuestions_backup_[A-Za-z0-9_]+$/.test(input.tableName)) throw new Error("Tabela histórica inválida.");
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");

  const tableExists: any = await db.execute(`
    SELECT COUNT(*) AS total FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = '${input.tableName.replace(/'/g, "''")}'
  `);
  if (Number(tableExists?.[0]?.[0]?.total || 0) !== 1) throw new Error("Tabela histórica não existe.");

  const sourceResult: any = await db.execute(`SELECT * FROM \`${input.tableName}\` WHERE optionId = ${Number(input.optionId)} ORDER BY sortOrder, id`);
  const sourceRows = (sourceResult?.[0] || []) as ProductQuestion[];
  if (input.expectedCount != null && sourceRows.length !== input.expectedCount) {
    throw new Error(`A restauração foi bloqueada: o snapshot possui ${sourceRows.length}, não ${input.expectedCount} perguntas.`);
  }
  if (sourceRows.length === 0) throw new Error("O snapshot selecionado não possui perguntas para esta opção.");
  const ordered = topologicalTreeOrder(sourceRows);
  const audit = auditRows(sourceRows);

  const currentRows = await db.select().from(productQuestions).where(eq(productQuestions.optionId, input.optionId));
  const oldIds = new Set(currentRows.map((row) => Number(row.id)));
  const oldAudioKeys = currentRows.map((row) => row.questionAudioStorageKey).filter((key): key is string => Boolean(key));
  const idMap = new Map<number, number>();
  const uploadedKeys: string[] = [];

  try {
    const restored = await db.transaction(async (tx) => {
      const manifest = await getManifestSetting(tx);
      await tx.delete(questionAudioDrafts).where(inArray(questionAudioDrafts.questionId, Array.from(oldIds)));
      await tx.delete(productQuestions).where(eq(productQuestions.optionId, input.optionId));

      for (const source of ordered) {
        const parentQuestionId = source.parentQuestionId == null ? null : idMap.get(Number(source.parentQuestionId)) ?? null;
        if (source.parentQuestionId != null && parentQuestionId == null) throw new Error(`Pai histórico ausente para a pergunta ${source.id}.`);
        const inserted: any = await tx.insert(productQuestions).values({
          productId: input.productId,
          optionId: input.optionId,
          question: source.question,
          fieldType: source.fieldType,
          options: source.options,
          isRequired: Number(source.isRequired),
          sortOrder: Number(source.sortOrder),
          helpText: source.helpText,
          audioMinDurationSeconds: Number(source.audioMinDurationSeconds || 1),
          audioMaxDurationSeconds: Number(source.audioMaxDurationSeconds || 120),
          allowAudioRerecord: Number(source.allowAudioRerecord ?? 1),
          allowAudioFileUpload: Number(source.allowAudioFileUpload ?? 1),
          questionPresentation: "text",
          questionAudioUrl: null,
          questionAudioStorageKey: null,
          showQuestionTextWithAudio: Number(source.showQuestionTextWithAudio || 0),
          parentQuestionId,
          triggerOption: source.triggerOption,
        });
        const newId = Number(inserted?.[0]?.insertId);
        if (!newId) throw new Error("Banco não retornou o ID da pergunta restaurada.");
        idMap.set(Number(source.id), newId);

        if (source.questionPresentation === "audio" && source.questionAudioStorageKey) {
          const prompt = await copyPromptAudio(source, newId);
          if (prompt.questionAudioStorageKey) uploadedKeys.push(prompt.questionAudioStorageKey);
          await tx.update(productQuestions).set(prompt).where(eq(productQuestions.id, newId));
        }
      }

      // Regras atuais ligadas às perguntas que serão removidas não podem ficar órfãs.
      const keptRules = manifest.rules.filter((rule) => !oldIds.has(rule.questionId));
      if (keptRules.length !== manifest.rules.length) await saveManifestRules(tx, keptRules);

      const finalRows = await tx.select().from(productQuestions)
        .where(eq(productQuestions.optionId, input.optionId))
        .orderBy(asc(productQuestions.sortOrder), asc(productQuestions.id));
      const finalAudit = auditRows(finalRows);
      if (finalRows.length !== sourceRows.length || !finalAudit.valid || finalAudit.maxDepth !== audit.maxDepth || finalAudit.roots !== audit.roots) {
        throw new Error("A auditoria bloqueou a restauração histórica porque a árvore final divergiu do snapshot.");
      }
      return { success: true as const, count: finalRows.length, audit: finalAudit };
    });

    await r2DeleteObjects(oldAudioKeys).catch(() => undefined);
    return restored;
  } catch (error) {
    await r2DeleteObjects(uploadedKeys).catch(() => undefined);
    throw error;
  }
}
