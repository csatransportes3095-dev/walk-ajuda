import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createConnection } from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const REQUIRED_ENV = ["DATABASE_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME"];
for (const name of REQUIRED_ENV) {
  if (!String(process.env[name] || "").trim()) throw new Error(`${name} ausente`);
}

const RECOVERY_CODE = "RECUPERACAO_COMPLETA_PEDIDOS_20260824";
const REVIEW_STATUS = "recuperado_para_revisao";
const DELIVERED_STATUS = "pedido_entregue";
const BACKUP_SUFFIX = "backup_20260824_full_orders";
const R2_SESSION_GAP_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const digits = value => String(value || "").replace(/\D/g, "");
const phoneKey = value => {
  const normalized = digits(value);
  return normalized.length >= 10 ? normalized.slice(-11) : "";
};
const validDate = value => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const hash = value => createHash("sha256").update(value).digest("hex");

function localDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

function phoneFromKey(key) {
  const name = String(key).replace(/^(?:order-docs|admin-docs|doc-responses)\//, "");
  const direct = name.match(/^(?:55)?(\d{10,11})(?:-|\/)/);
  if (direct) return phoneKey(direct[1]);
  const fallback = name.match(/(?:^|\D)((?:55)?\d{10,11})(?:\D|$)/);
  return fallback ? phoneKey(fallback[1]) : "";
}

function publicUrl(key) {
  const base = String(process.env.R2_PUBLIC_URL || "https://midia.h2colombiano.com").trim().replace(/\/+$/, "");
  return `${base}/${String(key).replace(/^\/+/, "")}`;
}

function mimeType(key) {
  const ext = String(key).toLowerCase().split(".").pop();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", heic: "image/heic", heif: "image/heif" })[ext] || "application/octet-stream";
}

function fileLabel(key) {
  let name = String(key).split("/").pop() || "Documento recuperado";
  name = name.replace(/\.[^.]+$/, "").replace(/^(?:55)?\d{10,13}-/, "").replace(/^\d{10,16}-/, "");
  name = name.replace(/-[a-z0-9]{6,16}$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return (name || "Documento recuperado").slice(0, 256).toUpperCase();
}

async function listObjects(prefix) {
  const client = new S3Client({
    region: "auto",
    endpoint: String(process.env.R2_ENDPOINT).trim().replace(/\/+$/, ""),
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: String(process.env.R2_ACCESS_KEY_ID).trim(),
      secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY).trim(),
    },
  });
  const objects = [];
  let continuationToken;
  try {
    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: String(process.env.R2_BUCKET_NAME).trim(), Prefix: prefix, ContinuationToken: continuationToken,
      }));
      for (const item of response.Contents || []) {
        const modifiedAt = validDate(item.LastModified);
        if (item.Key && modifiedAt) objects.push({ key: item.Key, modifiedAt, size: Number(item.Size || 0), source: prefix.replace(/\/$/, "") });
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  } finally {
    client.destroy();
  }
  return objects;
}

function buildR2Sessions(objects) {
  const byPhone = new Map();
  for (const object of objects) {
    const phone = phoneFromKey(object.key);
    if (!phone) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(object);
  }
  const sessions = [];
  for (const [phone, rows] of byPhone) {
    rows.sort((a, b) => a.modifiedAt - b.modifiedAt);
    let current;
    for (const object of rows) {
      if (!current || object.modifiedAt - current.lastAt > R2_SESSION_GAP_MS) {
        current = { phone, firstAt: object.modifiedAt, lastAt: object.modifiedAt, objects: [], source: "r2" };
        sessions.push(current);
      }
      current.objects.push(object);
      current.lastAt = object.modifiedAt;
    }
  }
  return sessions.sort((a, b) => a.firstAt - b.firstAt);
}

function attachExtraObjects(sessions, extras) {
  for (const object of extras) {
    const phone = phoneFromKey(object.key);
    if (!phone) continue;
    const candidates = sessions.filter(session => session.phone === phone);
    if (!candidates.length) continue;
    candidates.sort((a, b) => Math.abs(object.modifiedAt - a.lastAt) - Math.abs(object.modifiedAt - b.lastAt));
    candidates[0].objects.push(object);
  }
}

function buildEmailSessions(rows) {
  const byPhone = new Map();
  let ignoredWithoutPhone = 0;
  let ignoredWithoutDate = 0;
  for (const row of rows) {
    const phone = phoneKey(row.customerPhone);
    const eventAt = validDate(row.eventAt || row.sourceDate);
    if (!phone) { ignoredWithoutPhone += 1; continue; }
    if (!eventAt) { ignoredWithoutDate += 1; continue; }
    const item = { ...row, phone, eventAt, isNew: Number(row.isNewOrder || 0) === 1, delivered: row.detectedStatus === "entregue" };
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(item);
  }

  const sessions = [];
  for (const [phone, messages] of byPhone) {
    messages.sort((a, b) => a.eventAt - b.eventAt);
    const phoneSessions = [];
    for (const message of messages) {
      if (message.isNew) {
        const duplicate = phoneSessions.find(session => session.hasNew && Math.abs(message.eventAt - session.firstAt) <= 30 * 60 * 1000
          && String(session.serviceName || "") === String(message.serviceName || ""));
        if (duplicate) {
          duplicate.messages.push(message);
          duplicate.lastAt = message.eventAt > duplicate.lastAt ? message.eventAt : duplicate.lastAt;
          continue;
        }
        const created = {
          phone, firstAt: message.eventAt, lastAt: message.eventAt, deliveredAt: null,
          delivered: false, hasNew: true, messages: [message], objects: [], source: "zoho",
          customerName: message.customerName || "", serviceName: message.serviceName || "", serviceOption: message.serviceOption || "",
        };
        phoneSessions.push(created);
        sessions.push(created);
        continue;
      }

      let candidate = [...phoneSessions].reverse().find(session => !session.delivered
        && message.eventAt >= session.firstAt && message.eventAt - session.firstAt <= 60 * DAY_MS);
      if (!candidate && !message.delivered) {
        candidate = [...phoneSessions].reverse().find(session => Math.abs(message.eventAt - session.lastAt) <= 7 * DAY_MS);
      }
      if (!candidate && message.delivered) {
        candidate = {
          phone, firstAt: message.eventAt, lastAt: message.eventAt, deliveredAt: message.eventAt,
          delivered: true, hasNew: false, messages: [], objects: [], source: "zoho",
          customerName: message.customerName || "", serviceName: message.serviceName || "", serviceOption: message.serviceOption || "",
        };
        phoneSessions.push(candidate);
        sessions.push(candidate);
      }
      if (!candidate) continue;
      candidate.messages.push(message);
      candidate.lastAt = message.eventAt > candidate.lastAt ? message.eventAt : candidate.lastAt;
      candidate.customerName ||= message.customerName || "";
      candidate.serviceName ||= message.serviceName || "";
      candidate.serviceOption ||= message.serviceOption || "";
      if (message.delivered) {
        candidate.delivered = true;
        candidate.deliveredAt = message.eventAt;
      }
    }
  }
  return { sessions: sessions.sort((a, b) => a.firstAt - b.firstAt), ignoredWithoutPhone, ignoredWithoutDate };
}

function mergeSessions(emailSessions, r2Sessions) {
  const usedEmail = new Set();
  const merged = [];
  for (const r2 of r2Sessions) {
    const candidates = emailSessions.map((email, index) => ({ email, index }))
      .filter(({ email, index }) => email.phone === r2.phone && !usedEmail.has(index))
      .map(candidate => {
        const reference = candidate.email.hasNew ? candidate.email.firstAt : (candidate.email.deliveredAt || candidate.email.firstAt);
        return { ...candidate, distance: Math.abs(r2.firstAt - reference) };
      })
      .filter(({ email, distance }) => distance <= (email.hasNew ? 7 * DAY_MS : 45 * DAY_MS))
      .sort((a, b) => (Number(b.email.hasNew) - Number(a.email.hasNew)) || a.distance - b.distance);
    if (candidates.length) {
      const chosen = candidates[0];
      usedEmail.add(chosen.index);
      merged.push({
        ...chosen.email,
        firstAt: r2.firstAt < chosen.email.firstAt ? r2.firstAt : chosen.email.firstAt,
        lastAt: r2.lastAt > chosen.email.lastAt ? r2.lastAt : chosen.email.lastAt,
        objects: r2.objects,
        source: "zoho+r2",
      });
    } else {
      merged.push({ ...r2, delivered: false, deliveredAt: null, hasNew: false, messages: [], customerName: "", serviceName: "", serviceOption: "" });
    }
  }
  emailSessions.forEach((email, index) => {
    if (!usedEmail.has(index)) merged.push(email);
  });
  return merged.sort((a, b) => a.firstAt - b.firstAt);
}

function recoveryKey(order) {
  const emailKeys = order.messages.map(row => String(row.messageKey)).sort();
  const objectKeys = order.objects.map(row => String(row.key)).sort();
  return hash(JSON.stringify({ phone: order.phone, emailKeys, objectKeys, firstAt: order.firstAt.toISOString() }));
}

async function tableExists(db, table) {
  const [[row]] = await db.query("SELECT COUNT(*) total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", [table]);
  return Number(row.total) > 0;
}

async function backupTable(db, table) {
  if (!await tableExists(db, table)) return;
  const backup = `${table}_${BACKUP_SUFFIX}`;
  if (await tableExists(db, backup)) return;
  await db.query(`CREATE TABLE \`${backup}\` LIKE \`${table}\``);
  await db.query(`INSERT IGNORE INTO \`${backup}\` SELECT * FROM \`${table}\``);
}

async function ensureStructures(db) {
  await db.query("ALTER TABLE orderFiles ADD COLUMN IF NOT EXISTS addedByAdmin INT NOT NULL DEFAULT 0");
  await db.query(`
    CREATE TABLE IF NOT EXISTS orderFullRecoveryMeta (
      recoveryKey VARCHAR(64) PRIMARY KEY,
      registrationId INT NOT NULL UNIQUE,
      customerPhone VARCHAR(32) NOT NULL,
      source VARCHAR(32) NOT NULL,
      firstAt DATETIME NOT NULL,
      lastAt DATETIME NOT NULL,
      delivered TINYINT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(
    `INSERT INTO accessCodes (code,type,status,clientName,maxUses,currentUses,createdAt)
     VALUES (?, 'general', 'disabled', 'RECUPERACAO COMPLETA DE PEDIDOS', 0, 0, NOW())
     ON DUPLICATE KEY UPDATE clientName=VALUES(clientName)`, [RECOVERY_CODE],
  );
  const [[code]] = await db.query("SELECT id FROM accessCodes WHERE code=? LIMIT 1", [RECOVERY_CODE]);
  if (!code?.id) throw new Error("Nao foi possivel criar o codigo de recuperacao");
  const statuses = [
    [REVIEW_STATUS, "Recuperado — revisar status", "text-amber-300", "bg-amber-500/20 border-amber-500/40", "Search", "Pedido recuperado por evidencias preservadas; confirme o status individual."],
    [DELIVERED_STATUS, "Pedido Entregue", "text-emerald-300", "bg-emerald-500/20 border-emerald-500/40", "CheckCircle", "Pedido entregue conforme confirmacao preservada no e-mail."],
  ];
  for (const status of statuses) {
    await db.query(
      `INSERT INTO orderStatusTypes (\`key\`,label,color,bgColor,icon,description,sortOrder,isSystem,isActive,pulseColor,showInProgress,progressOrder)
       VALUES (?,?,?,?,?,?,999,1,1,'#22c55e',0,999)
       ON DUPLICATE KEY UPDATE label=VALUES(label),description=VALUES(description),isActive=1`, status,
    );
  }
  return Number(code.id);
}

async function nextOrderNumber(db) {
  const [result] = await db.query("INSERT INTO orderCounter (createdAt) VALUES (NOW())");
  return Number(result.insertId);
}

async function applyRecovery(db, orders) {
  for (const table of ["accessCodes", "accessCodePhones", "orderStatusTypes", "orderCounter", "orderStatusHistory", "orderFiles", "hiddenSubOrders", "fixedFolderOrders"]) {
    await backupTable(db, table);
  }
  const codeId = await ensureStructures(db);
  const [[maximum]] = await db.query("SELECT COALESCE(MAX(orderNumber),9999) maxNumber FROM orderStatusHistory");
  await db.query(`ALTER TABLE orderCounter AUTO_INCREMENT=${Math.max(10000, Number(maximum.maxNumber || 9999) + 1)}`);
  const [knownMeta] = await db.query("SELECT recoveryKey FROM orderFullRecoveryMeta");
  const knownKeys = new Set(knownMeta.map(row => String(row.recoveryKey)));
  const [knownFileRows] = await db.query("SELECT fileKey FROM orderFiles");
  const knownFiles = new Set(knownFileRows.map(row => String(row.fileKey)));
  const result = { pedidosInseridos: 0, pedidosJaExistentes: 0, entreguesInseridos: 0, paraRevisaoInseridos: 0, arquivosInseridos: 0 };

  await db.beginTransaction();
  try {
    for (const order of orders) {
      const key = recoveryKey(order);
      if (knownKeys.has(key)) { result.pedidosJaExistentes += 1; continue; }
      const [registration] = await db.query(
        `INSERT INTO accessCodePhones (codeId,phone,consumed,archived,rgCnhApproved,orderSource,accessedAt)
         VALUES (?,?,1,0,0,'manual',?)`, [codeId, order.phone, order.firstAt],
      );
      const registrationId = Number(registration.insertId);
      const orderNumber = await nextOrderNumber(db);
      const serviceName = String(order.serviceName || "PEDIDO RECUPERADO").slice(0, 255);
      const serviceOption = String(order.serviceOption || (order.objects.length ? "Documentos preservados no R2" : "Evidencia preservada no Zoho")).slice(0, 255);
      const baseNote = `Recuperado em 24/08/2026 pelas fontes ${order.source}. Evidencias entre ${localDate(order.firstAt)} e ${localDate(order.lastAt)}.`;
      if (order.delivered && order.hasNew && order.deliveredAt && order.deliveredAt > order.firstAt) {
        await db.query(
          `INSERT INTO orderStatusHistory (registrationId,orderNumber,customerPhone,status,note,serviceName,serviceOption,approval,createdAt)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [registrationId, orderNumber, order.phone, REVIEW_STATUS, baseNote, serviceName, serviceOption, "approved", order.firstAt],
        );
      }
      const finalStatus = order.delivered ? DELIVERED_STATUS : REVIEW_STATUS;
      const finalDate = order.deliveredAt || order.lastAt;
      const finalNote = order.delivered ? `${baseNote} Confirmacao individual de PEDIDO ENTREGUE encontrada no Zoho.` : `${baseNote} Status final individual nao localizado; revisar.`;
      await db.query(
        `INSERT INTO orderStatusHistory (registrationId,orderNumber,customerPhone,status,note,serviceName,serviceOption,approval,createdAt)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [registrationId, orderNumber, order.phone, finalStatus, finalNote, serviceName, serviceOption, "approved", finalDate],
      );
      for (const object of order.objects) {
        if (knownFiles.has(object.key)) continue;
        const fromAdmin = object.source === "admin-docs" ? 1 : 0;
        await db.query(
          `INSERT INTO orderFiles (registrationId,customerPhone,label,fileUrl,fileKey,mimeType,fromAdmin,addedByAdmin,createdAt)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [registrationId, order.phone, fileLabel(object.key), publicUrl(object.key), object.key, mimeType(object.key), fromAdmin, fromAdmin, object.modifiedAt],
        );
        knownFiles.add(object.key);
        result.arquivosInseridos += 1;
      }
      await db.query(
        `INSERT INTO orderFullRecoveryMeta (recoveryKey,registrationId,customerPhone,source,firstAt,lastAt,delivered)
         VALUES (?,?,?,?,?,?,?)`,
        [key, registrationId, order.phone, order.source, order.firstAt, order.lastAt, order.delivered ? 1 : 0],
      );
      knownKeys.add(key);
      result.pedidosInseridos += 1;
      if (order.delivered) result.entreguesInseridos += 1;
      else result.paraRevisaoInseridos += 1;
    }
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
  return result;
}

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    if (!await tableExists(db, "orderEmailRecoveryEvidence")) throw new Error("Tabela de evidencias do Zoho ausente; execute a varredura com --store");
    const [evidenceRows] = await db.query("SELECT * FROM orderEmailRecoveryEvidence ORDER BY eventAt, messageKey");
    const [orderObjects, adminObjects, responseObjects] = await Promise.all([
      listObjects("order-docs/"), listObjects("admin-docs/"), listObjects("doc-responses/"),
    ]);
    const r2Sessions = buildR2Sessions(orderObjects);
    attachExtraObjects(r2Sessions, [...adminObjects, ...responseObjects]);
    const email = buildEmailSessions(evidenceRows);
    const orders = mergeSessions(email.sessions, r2Sessions);
    const existingMeta = await tableExists(db, "orderFullRecoveryMeta")
      ? Number((await db.query("SELECT COUNT(*) total FROM orderFullRecoveryMeta"))[0][0].total || 0) : 0;
    console.log("PREVIA DA RECUPERACAO COMPLETA DE PEDIDOS", {
      evidenciasZoho: evidenceRows.length,
      evidenciasSemTelefone: email.ignoredWithoutPhone,
      evidenciasSemData: email.ignoredWithoutDate,
      pedidosFormadosPelosEmails: email.sessions.length,
      pedidosFormadosPeloR2: r2Sessions.length,
      pedidosDepoisDeRemoverSobreposicoes: orders.length,
      pedidosConfirmadosEntregues: orders.filter(order => order.delivered).length,
      pedidosParaRevisar: orders.filter(order => !order.delivered).length,
      pedidosComDocumentos: orders.filter(order => order.objects.length > 0).length,
      documentosQueSeraoLigados: new Set(orders.flatMap(order => order.objects.map(object => object.key))).size,
      clientesUnicos: new Set(orders.map(order => order.phone)).size,
      primeiraData: orders.length ? localDate(orders[0].firstAt) : null,
      ultimaData: orders.length ? localDate(orders.at(-1).lastAt) : null,
      recuperadosAnteriormente: existingMeta,
    });
    if (!APPLY) {
      console.log("MODO PREVIA: nenhum pedido foi inserido");
      console.log("Para aplicar: node scripts/recover-orders-from-all-sources.mjs --apply");
      return;
    }
    const result = await applyRecovery(db, orders);
    const [[after]] = await db.query("SELECT COUNT(DISTINCT registrationId) pedidos, COUNT(*) historicos FROM orderStatusHistory");
    const [[files]] = await db.query("SELECT COUNT(*) total FROM orderFiles");
    console.log("RECUPERACAO COMPLETA CONCLUIDA", { ...result, bancoDepois: { pedidos: Number(after.pedidos), historicos: Number(after.historicos), arquivos: Number(files.total) } });
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("FALHA NA RECUPERACAO COMPLETA", error);
  process.exit(1);
});
