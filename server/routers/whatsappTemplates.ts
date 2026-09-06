import { z } from "zod";
import { sql } from "drizzle-orm";
import { adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { snapshotUnicodeText } from "../../shared/whatsappUnicodeDiagnostics";

const COMMISSION_TEMPLATE = {
  confirmed: { key: "commission_indication_confirmed", title: "COMISSAO - INDICACAO CONFIRMADA" },
  pix: { key: "commission_request_pix", title: "COMISSAO - PEDIR PIX" },
  paid: { key: "commission_paid", title: "COMISSAO - PAGAMENTO CONFIRMADO" },
} as const;

type CommissionTemplateType = keyof typeof COMMISSION_TEMPLATE;

const COMMISSION_STORAGE_PREFIX = "H2B64:";

const ICON = {
  paid: String.fromCodePoint(0x2705),
  party: String.fromCodePoint(0x1f389),
  card: String.fromCodePoint(0x1f4b3),
  user: String.fromCodePoint(0x1f464),
  phone: String.fromCodePoint(0x1f4f1),
  money: String.fromCodePoint(0x1f4b0),
};

function defaultCommissionTemplate(type: CommissionTemplateType): string {
  if (type === "confirmed") {
    return [
      `${ICON.party} *INDICAÇÃO CONFIRMADA*`,
      "",
      "Olá, {indicador}!",
      "",
      "Sua indicação deu certo.",
      "",
      `${ICON.user} *Cliente indicado:* {cliente}`,
      `${ICON.phone} *Telefone:* {telefone}`,
      "{comissao}",
      "",
      "{status_pagamento}",
      "",
      `Obrigado pela indicação! ${ICON.party}`,
    ].join("\n");
  }

  if (type === "pix") {
    return [
      `${ICON.card} *DADOS PARA PAGAMENTO DA COMISSÃO*`,
      "",
      "Olá, {indicador}!",
      "",
      "Sua comissão está pronta para pagamento.",
      "{valor_comissao}",
      "",
      "Por favor, envie sua *chave PIX* para realizarmos o pagamento.",
      "",
      "Obrigado!",
    ].join("\n");
  }

  return [
    `${ICON.paid} *COMISSÃO PAGA*`,
    "",
    "Olá, {indicador}!",
    "",
    "Sua comissão foi paga com sucesso.",
    `${ICON.user} *Cliente indicado:* {cliente}`,
    "{valor_pago}",
    "",
    `Obrigado pela indicação! ${ICON.party}`,
  ].join("\n");
}

function removeBrokenUnicode(value: unknown): string {
  const text = String(value ?? "");
  let output = "";

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0xfffd) continue;

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += text[i] + text[i + 1];
        i += 1;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) continue;
    output += text[i];
  }

  try {
    return output.normalize("NFC");
  } catch {
    return output;
  }
}

function hasBrokenUnicode(value: unknown): boolean {
  const text = String(value ?? "");
  if (text.includes("\uFFFD")) return true;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function stripDecorations(value: unknown): string {
  return removeBrokenUnicode(value)
    .replace(/[\uFE0E\uFE0F\u200D]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu, "")
    .trim();
}

function canonical(value: unknown): string {
  const clean = stripDecorations(value).replace(/\*/g, "");
  try {
    return clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  } catch {
    return clean.toUpperCase();
  }
}

function ensureLineIcon(line: string, marker: string, icon: string): string {
  const plain = canonical(line);
  if (!plain.includes(marker)) return line;
  if (line.includes(icon)) return line;
  return `${icon} ${line.trimStart()}`;
}

function repairBrokenLegacyTemplate(type: CommissionTemplateType, rawValue: string): string {
  const cleaned = removeBrokenUnicode(rawValue);
  const lines = cleaned.split(/\r?\n/).map((line) => {
    if (type === "confirmed") {
      if (canonical(line).includes("INDICACAO CONFIRMADA")) return ensureLineIcon(line, "INDICACAO CONFIRMADA", ICON.party);
      if (canonical(line).includes("CLIENTE INDICADO:")) return ensureLineIcon(line, "CLIENTE INDICADO:", ICON.user);
      if (canonical(line).includes("TELEFONE:")) return ensureLineIcon(line, "TELEFONE:", ICON.phone);
      if (canonical(line).includes("COMISSAO:")) return ensureLineIcon(line, "COMISSAO:", ICON.money);
      if (canonical(line).includes("PAGAMENTO DA COMISSAO CONFIRMADO")) return ensureLineIcon(line, "PAGAMENTO DA COMISSAO CONFIRMADO", ICON.paid);
      if (canonical(line).includes("OBRIGADO PELA INDICACAO!")) return line.includes(ICON.party) ? line : `${line.trimEnd()} ${ICON.party}`;
    }

    if (type === "pix") {
      if (canonical(line).includes("DADOS PARA PAGAMENTO DA COMISSAO")) return ensureLineIcon(line, "DADOS PARA PAGAMENTO DA COMISSAO", ICON.card);
      if (canonical(line).includes("VALOR DA COMISSAO:")) return ensureLineIcon(line, "VALOR DA COMISSAO:", ICON.money);
    }

    if (type === "paid") {
      if (canonical(line).includes("COMISSAO PAGA")) return ensureLineIcon(line, "COMISSAO PAGA", ICON.paid);
      if (canonical(line).includes("CLIENTE INDICADO:")) return ensureLineIcon(line, "CLIENTE INDICADO:", ICON.user);
      if (canonical(line).includes("VALOR PAGO:")) return ensureLineIcon(line, "VALOR PAGO:", ICON.money);
      if (canonical(line).includes("OBRIGADO PELA INDICACAO!")) return line.includes(ICON.party) ? line : `${line.trimEnd()} ${ICON.party}`;
    }

    return line;
  });

  const repaired = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return repaired || defaultCommissionTemplate(type);
}

function encodeCommissionTemplateStorage(message: string): string {
  const clean = removeBrokenUnicode(message).trim();
  return `${COMMISSION_STORAGE_PREFIX}${Buffer.from(clean, "utf8").toString("base64")}`;
}

function decodeCommissionTemplateStorage(type: CommissionTemplateType, storedValue: unknown): string {
  const raw = String(storedValue ?? "");
  if (!raw) return defaultCommissionTemplate(type);

  if (raw.startsWith(COMMISSION_STORAGE_PREFIX)) {
    try {
      const decoded = Buffer.from(raw.slice(COMMISSION_STORAGE_PREFIX.length), "base64").toString("utf8");
      if (!decoded || hasBrokenUnicode(decoded)) return defaultCommissionTemplate(type);
      return decoded.normalize("NFC").trim();
    } catch {
      return defaultCommissionTemplate(type);
    }
  }

  if (hasBrokenUnicode(raw)) return repairBrokenLegacyTemplate(type, raw);
  return removeBrokenUnicode(raw).trim() || defaultCommissionTemplate(type);
}

function detectCommissionType(text: string): CommissionTemplateType | null {
  const clean = canonical(text);
  if (clean.includes("DADOS PARA PAGAMENTO DA COMISSAO")) return "pix";
  if (clean.includes("COMISSAO PAGA")) return "paid";
  if (clean.includes("INDICACAO CONFIRMADA")) return "confirmed";
  return null;
}

function extractLineValue(text: string, label: string): string {
  const wanted = canonical(label);
  for (const rawLine of text.split(/\r?\n/)) {
    const clean = stripDecorations(rawLine).replace(/\*/g, "").trim();
    if (!clean || !canonical(clean).startsWith(wanted)) continue;
    const colon = clean.indexOf(":");
    return colon >= 0 ? clean.slice(colon + 1).trim() : "";
  }
  return "";
}

function extractIndicatorName(text: string): string {
  for (const rawLine of text.split(/\r?\n/)) {
    const clean = stripDecorations(rawLine).trim();
    if (!canonical(clean).startsWith("OLA,")) continue;
    const comma = clean.indexOf(",");
    if (comma < 0) continue;
    return clean.slice(comma + 1).replace(/!+\s*$/, "").trim();
  }
  return "";
}

function applyTemplate(template: string, values: Record<string, string>): string {
  let result = removeBrokenUnicode(template);
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{${key}}`).join(removeBrokenUnicode(value));
  }

  return removeBrokenUnicode(result)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeWhatsappPhone(value: string): string {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) throw new Error("Telefone do indicador não encontrado.");
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) throw new Error("Telefone do indicador inválido para WhatsApp.");
  return digits;
}

async function getEffectiveCommissionTemplate(db: any, type: CommissionTemplateType): Promise<string> {
  const statusKey = COMMISSION_TEMPLATE[type].key;
  const result = await db.execute(sql`
    SELECT message
    FROM whatsappTemplates
    WHERE statusKey = ${statusKey}
    ORDER BY isDefault DESC, id DESC
    LIMIT 1
  `);
  const row = (result[0] as any[])?.[0];
  return decodeCommissionTemplateStorage(type, row?.message);
}

async function readCommissionTemplates(db: any) {
  const response: Record<CommissionTemplateType, string> = {
    confirmed: "",
    pix: "",
    paid: "",
  };

  for (const type of Object.keys(COMMISSION_TEMPLATE) as CommissionTemplateType[]) {
    response[type] = await getEffectiveCommissionTemplate(db, type);
  }
  return response;
}

async function saveCommissionTemplate(db: any, type: CommissionTemplateType, rawMessage: string) {
  if (hasBrokenUnicode(rawMessage)) {
    throw new Error(`O texto ${COMMISSION_TEMPLATE[type].title} contém caractere Unicode corrompido. Apague o símbolo quebrado e insira o emoji novamente.`);
  }

  const message = removeBrokenUnicode(rawMessage).trim();
  if (!message) throw new Error(`O texto ${COMMISSION_TEMPLATE[type].title} não pode ficar vazio.`);

  // Armazenamento ASCII: nenhum emoji de 4 bytes toca o charset da coluna MySQL.
  const storedMessage = encodeCommissionTemplateStorage(message);
  const statusKey = COMMISSION_TEMPLATE[type].key;
  const title = COMMISSION_TEMPLATE[type].title;
  const currentResult = await db.execute(sql`
    SELECT id
    FROM whatsappTemplates
    WHERE statusKey = ${statusKey}
    ORDER BY isDefault DESC, id DESC
    LIMIT 1
  `);
  const currentId = Number((currentResult[0] as any[])?.[0]?.id || 0);

  if (currentId > 0) {
    await db.execute(sql`
      UPDATE whatsappTemplates
      SET title = ${title}, message = ${storedMessage}, isDefault = 1
      WHERE id = ${currentId}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO whatsappTemplates (title, statusKey, message, sortOrder, isDefault)
      VALUES (${title}, ${statusKey}, ${storedMessage}, 0, 1)
    `);
  }

  const verifyResult = await db.execute(sql`
    SELECT message, HEX(message) AS bytesHex
    FROM whatsappTemplates
    WHERE statusKey = ${statusKey}
    ORDER BY isDefault DESC, id DESC
    LIMIT 1
  `);
  const verified = (verifyResult[0] as any[])?.[0];
  const dbStored = String(verified?.message ?? "");
  const expectedHex = Buffer.from(storedMessage, "utf8").toString("hex").toUpperCase();
  const databaseHex = String(verified?.bytesHex ?? "").toUpperCase();
  const roundTrip = decodeCommissionTemplateStorage(type, dbStored);

  if (dbStored !== storedMessage || databaseHex !== expectedHex || roundTrip !== message || hasBrokenUnicode(roundTrip)) {
    throw new Error("Falha de integridade ao salvar o texto da comissão. O envio foi bloqueado para evitar mensagem corrompida.");
  }
}

function parseCommissionSourceUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  if (url.hostname !== "wa.me") throw new Error("Destino WhatsApp inválido.");

  const originalText = removeBrokenUnicode(url.searchParams.get("text") ?? "");
  const type = detectCommissionType(originalText);
  if (!type) throw new Error("Não foi possível identificar o tipo da mensagem de comissão.");

  const indicador = extractIndicatorName(originalText) || "indicador";
  const cliente = extractLineValue(originalText, "Cliente indicado:") || "Cliente";
  const telefone = extractLineValue(originalText, "Telefone:");
  const comissao = extractLineValue(originalText, "Comissão:");
  const valorComissao = extractLineValue(originalText, "Valor da comissão:");
  const valorPago = extractLineValue(originalText, "Valor pago:");
  const pagamentoConfirmado = canonical(originalText).includes("PAGAMENTO DA COMISSAO CONFIRMADO");
  const phone = normalizeWhatsappPhone(url.pathname.replace(/^\/+/, ""));

  return {
    type,
    phone,
    values: {
      indicador,
      cliente,
      telefone,
      comissao: comissao ? `${ICON.money} *Comissão:* ${comissao}` : "",
      valor_comissao: valorComissao ? `${ICON.money} *Valor da comissão:* ${valorComissao}` : "",
      valor_pago: valorPago ? `${ICON.money} *Valor pago:* ${valorPago}` : "",
      status_pagamento: pagamentoConfirmado
        ? `${ICON.paid} *Pagamento da comissão confirmado.*`
        : "A comissão será paga em breve.",
    },
  };
}

export const whatsappTemplatesRouter = {
  list: adminProcedure.query(async () => {
    const db = await getDb() as any;
    const rows = await db.execute(sql`SELECT * FROM whatsappTemplates ORDER BY sortOrder ASC, createdAt ASC`);
    return (rows[0] as any[]) || [];
  }),

  commissionTemplates: adminProcedure.query(async () => {
    const db = await getDb() as any;
    if (!db) throw new Error("Banco indisponível.");
    return await readCommissionTemplates(db);
  }),

  saveCommissionTemplates: adminProcedure
    .input(z.object({
      confirmed: z.string().min(1).max(8000),
      pix: z.string().min(1).max(8000),
      paid: z.string().min(1).max(8000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new Error("Banco indisponível.");

      await saveCommissionTemplate(db, "confirmed", input.confirmed);
      await saveCommissionTemplate(db, "pix", input.pix);
      await saveCommissionTemplate(db, "paid", input.paid);
      return { success: true, templates: await readCommissionTemplates(db) };
    }),

  buildCommissionWhatsappUrl: adminProcedure
    .input(z.object({ sourceUrl: z.string().min(1).max(30000) }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new Error("Banco indisponível.");

      const parsed = parseCommissionSourceUrl(input.sourceUrl);
      const template = await getEffectiveCommissionTemplate(db, parsed.type);
      const message = applyTemplate(template, parsed.values);

      if (!message || hasBrokenUnicode(message)) {
        throw new Error("Mensagem bloqueada: foi detectado Unicode inválido antes do WhatsApp.");
      }

      const encodedText = encodeURIComponent(message);
      const decodedRoundTrip = decodeURIComponent(encodedText);
      if (decodedRoundTrip !== message || hasBrokenUnicode(decodedRoundTrip)) {
        throw new Error("Falha no round-trip UTF-8 da mensagem. O WhatsApp não foi aberto.");
      }

      const url = `https://wa.me/${parsed.phone}?text=${encodedText}`;
      if (/[^\x00-\x7F]/.test(url) || /%EF%BF%BD/i.test(url)) {
        throw new Error("A URL final contém Unicode inválido e foi bloqueada.");
      }

      return {
        success: true,
        url,
        stage: "server-encoded-ascii-base64-template",
        type: parsed.type,
      };
    }),

  unicodeDiagnostics: adminProcedure.query(async () => {
    const db = await getDb() as any;
    if (!db) throw new Error("Banco indisponível para diagnóstico Unicode.");

    const [sessionRows] = await db.execute(sql`
      SELECT
        @@character_set_client AS characterSetClient,
        @@character_set_connection AS characterSetConnection,
        @@character_set_results AS characterSetResults,
        @@character_set_database AS characterSetDatabase,
        @@collation_connection AS collationConnection,
        @@collation_database AS collationDatabase
    `) as any;
    const [tableRows] = await db.execute(sql`
      SELECT TABLE_NAME AS tableName, TABLE_COLLATION AS tableCollation
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsappTemplates'
    `) as any;
    const [columnRows] = await db.execute(sql`
      SELECT
        COLUMN_NAME AS columnName,
        CHARACTER_SET_NAME AS characterSet,
        COLLATION_NAME AS collation,
        COLUMN_TYPE AS columnType
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'whatsappTemplates'
        AND COLUMN_NAME = 'message'
    `) as any;
    const [templateRows] = await db.execute(sql`
      SELECT id, title, statusKey, isDefault, sortOrder, message,
        CHAR_LENGTH(message) AS characterLength,
        LENGTH(message) AS byteLength,
        HEX(message) AS utf8BytesHex
      FROM whatsappTemplates
      WHERE statusKey IN ('pedido_entregue', 'entregue', 'commission_indication_confirmed', 'commission_request_pix', 'commission_paid')
      ORDER BY isDefault DESC, sortOrder ASC, id ASC
    `) as any;

    return {
      mysql: {
        session: sessionRows?.[0] ?? null,
        table: tableRows?.[0] ?? null,
        column: columnRows?.[0] ?? null,
      },
      templates: (templateRows ?? []).map((template: any) => ({
        id: template.id,
        title: template.title,
        statusKey: template.statusKey,
        isDefault: template.isDefault,
        sortOrder: template.sortOrder,
        database: {
          characterLength: template.characterLength,
          byteLength: template.byteLength,
          utf8BytesHex: template.utf8BytesHex,
        },
        message: snapshotUnicodeText(String(template.message ?? "")),
      })),
    };
  }),

  create: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      statusKey: z.string().optional().nullable(),
      message: z.string().min(1),
      imageUrl: z.string().optional().nullable(),
      imageTitle: z.string().optional().nullable(),
      videoUrl: z.string().optional().nullable(),
      videoTitle: z.string().optional().nullable(),
      mediaFileKey: z.string().optional().nullable(),
      mediaFileUrl: z.string().optional().nullable(),
      mediaType: z.enum(["image", "video"]).optional().nullable(),
      sortOrder: z.number().optional().default(0),
      isDefault: z.number().optional().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const title = input.title;
      const statusKey = input.statusKey ?? null;
      const message = input.message;
      const imageUrl = input.imageUrl ?? null;
      const imageTitle = input.imageTitle ?? null;
      const videoUrl = input.videoUrl ?? null;
      const videoTitle = input.videoTitle ?? null;
      const mediaFileKey = input.mediaFileKey ?? null;
      const mediaFileUrl = input.mediaFileUrl ?? null;
      const mediaType = input.mediaType ?? null;
      const sortOrder = input.sortOrder ?? 0;
      const isDefault = input.isDefault ?? 0;

      await db.execute(sql`
        INSERT INTO whatsappTemplates (title, statusKey, message, imageUrl, imageTitle, videoUrl, videoTitle, mediaFileKey, mediaFileUrl, mediaType, sortOrder, isDefault)
        VALUES (${title}, ${statusKey}, ${message}, ${imageUrl}, ${imageTitle}, ${videoUrl}, ${videoTitle}, ${mediaFileKey}, ${mediaFileUrl}, ${mediaType}, ${sortOrder}, ${isDefault})
      `);
      const idResult = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
      const id = (idResult[0] as any[])?.[0]?.id;
      return { success: true, id };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1),
      statusKey: z.string().optional().nullable(),
      message: z.string().min(1),
      imageUrl: z.string().optional().nullable(),
      imageTitle: z.string().optional().nullable(),
      videoUrl: z.string().optional().nullable(),
      videoTitle: z.string().optional().nullable(),
      mediaFileKey: z.string().optional().nullable(),
      mediaFileUrl: z.string().optional().nullable(),
      mediaType: z.enum(["image", "video"]).optional().nullable(),
      sortOrder: z.number().optional().default(0),
      isDefault: z.number().optional().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const id = input.id;
      const title = input.title;
      const statusKey = input.statusKey ?? null;
      const message = input.message;
      const imageUrl = input.imageUrl ?? null;
      const imageTitle = input.imageTitle ?? null;
      const videoUrl = input.videoUrl ?? null;
      const videoTitle = input.videoTitle ?? null;
      const mediaFileKey = input.mediaFileKey ?? null;
      const mediaFileUrl = input.mediaFileUrl ?? null;
      const mediaType = input.mediaType ?? null;
      const sortOrder = input.sortOrder ?? 0;
      const isDefault = input.isDefault ?? 0;

      await db.execute(sql`
        UPDATE whatsappTemplates SET
          title = ${title}, statusKey = ${statusKey}, message = ${message},
          imageUrl = ${imageUrl}, imageTitle = ${imageTitle},
          videoUrl = ${videoUrl}, videoTitle = ${videoTitle},
          mediaFileKey = ${mediaFileKey}, mediaFileUrl = ${mediaFileUrl},
          mediaType = ${mediaType}, sortOrder = ${sortOrder}, isDefault = ${isDefault}
        WHERE id = ${id}
      `);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.execute(sql`DELETE FROM whatsappTemplates WHERE id = ${input.id}`);
      return { success: true };
    }),

  uploadMedia: adminProcedure
    .input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      mediaType: z.enum(["image", "video"]),
    }))
    .mutation(async ({ input }) => {
      const ext = input.fileName.split('.').pop() || (input.mediaType === 'video' ? 'mp4' : 'jpg');
      const fileKey = `whatsapp-templates/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const { url, key } = await storagePut(fileKey, buffer, input.mimeType);
      return { url, key };
    }),
};
