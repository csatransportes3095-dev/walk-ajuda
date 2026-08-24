import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createConnection } from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const REQUIRED_ENV = ["DATABASE_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME"];
for (const name of REQUIRED_ENV) {
  if (!String(process.env[name] ?? "").trim()) throw new Error(`${name} ausente`);
}

const RECOVERY_CODE = "RECUPERACAO_PEDIDOS_20260824";
const RECOVERY_STATUS = "recuperado_para_revisao";
const RECOVERY_SOURCE = "r2_20260824";
const BACKUP_SUFFIX = "backup_20260824_orders";
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

const digits = value => String(value ?? "").replace(/\D/g, "");
const phoneKey = value => {
  const valueDigits = digits(value);
  if (valueDigits.length < 10) return "";
  return valueDigits.slice(-11);
};

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
  name = name.replace(/\.[^.]+$/, "");
  name = name.replace(/^(?:55)?\d{10,13}-/, "");
  name = name.replace(/^\d{10,16}-/, "");
  name = name.replace(/-[a-z0-9]{6,16}$/i, "");
  const normalized = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return (normalized || "Documento recuperado").slice(0, 256).toUpperCase();
}

function localDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function sessionKey(session) {
  const source = [session.phone, session.firstAt.toISOString()].join("|");
  return createHash("sha256").update(source).digest("hex");
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
        Bucket: String(process.env.R2_BUCKET_NAME).trim(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      for (const item of response.Contents ?? []) {
        if (item.Key && item.LastModified) objects.push({
          key: item.Key,
          modifiedAt: new Date(item.LastModified),
          size: Number(item.Size ?? 0),
          source: prefix.replace(/\/$/, ""),
        });
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  } finally {
    client.destroy();
  }
  return objects;
}

function buildSessions(objects) {
  const byPhone = new Map();
  for (const object of objects) {
    const phone = phoneFromKey(object.key);
    if (!phone || !Number.isFinite(object.modifiedAt.getTime())) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(object);
  }
  const sessions = [];
  for (const [phone, phoneObjects] of byPhone) {
    phoneObjects.sort((a, b) => a.modifiedAt - b.modifiedAt);
    let current;
    for (const object of phoneObjects) {
      if (!current || object.modifiedAt.getTime() - current.lastAt.getTime() > SESSION_GAP_MS) {
        current = { phone, firstAt: object.modifiedAt, lastAt: object.modifiedAt, objects: [] };
        sessions.push(current);
      }
      current.objects.push(object);
      current.lastAt = object.modifiedAt;
    }
  }
  return sessions.sort((a, b) => a.firstAt - b.firstAt);
}

function attachExtraObjects(sessions, extras) {
  let attached = 0;
  let withoutPhone = 0;
  let withoutOrder = 0;
  for (const object of extras) {
    const phone = phoneFromKey(object.key);
    if (!phone) {
      withoutPhone += 1;
      continue;
    }
    const candidates = sessions.filter(session => session.phone === phone);
    if (!candidates.length) {
      withoutOrder += 1;
      continue;
    }
    candidates.sort((a, b) => {
      const aDistance = Math.min(Math.abs(object.modifiedAt - a.firstAt), Math.abs(object.modifiedAt - a.lastAt));
      const bDistance = Math.min(Math.abs(object.modifiedAt - b.firstAt), Math.abs(object.modifiedAt - b.lastAt));
      return aDistance - bDistance;
    });
    candidates[0].objects.push(object);
    attached += 1;
  }
  for (const session of sessions) session.objects.sort((a, b) => a.modifiedAt - b.modifiedAt);
  return { attached, withoutPhone, withoutOrder };
}

async function tableExists(db, table) {
  const [[row]] = await db.query(
    "SELECT COUNT(*) total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    [table],
  );
  return Number(row.total) > 0;
}

async function currentCounts(db) {
  const names = ["accessCodePhones", "orderStatusHistory", "orderFiles"];
  const counts = {};
  for (const name of names) {
    const [[row]] = await db.query(`SELECT COUNT(*) total FROM \`${name}\``);
    counts[name] = Number(row.total || 0);
  }
  return counts;
}

async function backupTable(db, table) {
  const backup = `${table}_${BACKUP_SUFFIX}`;
  if (await tableExists(db, backup)) return;
  await db.query(`CREATE TABLE IF NOT EXISTS \`${backup}\` LIKE \`${table}\``);
  await db.query(`INSERT IGNORE INTO \`${backup}\` SELECT * FROM \`${table}\``);
}

async function ensureRecoveryStructures(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS orderRecoveryMeta (
      sessionKey VARCHAR(64) PRIMARY KEY,
      registrationId INT NOT NULL UNIQUE,
      customerPhone VARCHAR(32) NOT NULL,
      firstAt DATETIME NOT NULL,
      lastAt DATETIME NOT NULL,
      source VARCHAR(32) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(
    `INSERT INTO accessCodes (code,type,status,clientName,maxUses,currentUses,createdAt)
     VALUES (?, 'general', 'disabled', 'RECUPERAÇÃO DE PEDIDOS', 0, 0, NOW())
     ON DUPLICATE KEY UPDATE clientName=VALUES(clientName)`,
    [RECOVERY_CODE],
  );
  const [[code]] = await db.query("SELECT id FROM accessCodes WHERE code=? LIMIT 1", [RECOVERY_CODE]);
  if (!code?.id) throw new Error("Não foi possível criar o código técnico de recuperação");
  await db.query(
    `INSERT INTO orderStatusTypes (\`key\`,label,color,bgColor,icon,description,sortOrder,isSystem,isActive,pulseColor,showInProgress,progressOrder)
     VALUES (?, 'Recuperado — revisar status', 'text-amber-300', 'bg-amber-500/20 border-amber-500/40', 'Search',
       'Pedido recuperado pelos documentos preservados. Confirme o status antes de atualizar.', 999, 1, 1, '#f59e0b', 0, 999)
     ON DUPLICATE KEY UPDATE label=VALUES(label),description=VALUES(description),isActive=1`,
    [RECOVERY_STATUS],
  );
  return Number(code.id);
}

async function ensureOrderCounterStart(db) {
  const [[maxRow]] = await db.query("SELECT COALESCE(MAX(orderNumber),9999) maxNumber FROM orderStatusHistory");
  const nextMinimum = Math.max(10000, Number(maxRow.maxNumber || 9999) + 1);
  await db.query(`ALTER TABLE orderCounter AUTO_INCREMENT=${Math.trunc(nextMinimum)}`);
}

async function nextOrderNumber(db) {
  const [result] = await db.query("INSERT INTO orderCounter (createdAt) VALUES (NOW())");
  return Number(result.insertId);
}

async function applyRecovery(db, sessions) {
  for (const table of ["accessCodes", "accessCodePhones", "orderStatusTypes", "orderCounter", "orderStatusHistory", "orderFiles"]) {
    await backupTable(db, table);
  }
  const recoveryCodeId = await ensureRecoveryStructures(db);
  const [existingFilesRows] = await db.query("SELECT fileKey FROM orderFiles");
  const existingFiles = new Set(existingFilesRows.map(row => String(row.fileKey)));
  const [existingSessionsRows] = await db.query("SELECT sessionKey,registrationId FROM orderRecoveryMeta");
  const existingSessions = new Map(existingSessionsRows.map(row => [String(row.sessionKey), Number(row.registrationId)]));
  const result = { pedidosInseridos: 0, pedidosJaRecuperados: 0, arquivosInseridos: 0, arquivosJaExistentes: 0 };
  await ensureOrderCounterStart(db);

  await db.beginTransaction();
  try {
    for (const session of sessions) {
      const key = sessionKey(session);
      let registrationId = existingSessions.get(key);
      let isNewSession = false;
      if (registrationId) {
        result.pedidosJaRecuperados += 1;
      } else {
        const [registration] = await db.query(
          `INSERT INTO accessCodePhones (codeId,phone,consumed,archived,rgCnhApproved,orderSource,accessedAt)
           VALUES (?,?,1,0,0,'manual',?)`,
          [recoveryCodeId, session.phone, session.firstAt],
        );
        registrationId = Number(registration.insertId);
        const orderNumber = await nextOrderNumber(db);
        const note = `Recuperado do R2 em 24/08/2026. Evidências entre ${localDate(session.firstAt)} e ${localDate(session.lastAt)}. O status original individual não foi encontrado; revise antes de alterar.`;
        await db.query(
          `INSERT INTO orderStatusHistory
            (registrationId,orderNumber,customerPhone,status,note,serviceName,serviceOption,approval,createdAt)
           VALUES (?,?,?,?,?,'PEDIDO RECUPERADO','Documentos preservados no R2','approved',?)`,
          [registrationId, orderNumber, session.phone, RECOVERY_STATUS, note, session.lastAt],
        );
        isNewSession = true;
      }
      for (const object of session.objects) {
        if (existingFiles.has(object.key)) {
          result.arquivosJaExistentes += 1;
          continue;
        }
        const isAdmin = object.source === "admin-docs" ? 1 : 0;
        await db.query(
          `INSERT INTO orderFiles
            (registrationId,customerPhone,label,fileUrl,fileKey,mimeType,fromAdmin,addedByAdmin,createdAt)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [registrationId, session.phone, fileLabel(object.key), publicUrl(object.key), object.key, mimeType(object.key), isAdmin, isAdmin, object.modifiedAt],
        );
        existingFiles.add(object.key);
        result.arquivosInseridos += 1;
      }
      if (isNewSession) {
        await db.query(
          `INSERT INTO orderRecoveryMeta (sessionKey,registrationId,customerPhone,firstAt,lastAt,source)
           VALUES (?,?,?,?,?,?)`,
          [key, registrationId, session.phone, session.firstAt, session.lastAt, RECOVERY_SOURCE],
        );
        existingSessions.set(key, registrationId);
        result.pedidosInseridos += 1;
      }
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
    const [orderObjects, adminObjects, responseObjects] = await Promise.all([
      listObjects("order-docs/"),
      listObjects("admin-docs/"),
      listObjects("doc-responses/"),
    ]);
    const sessions = buildSessions(orderObjects);
    const extras = attachExtraObjects(sessions, [...adminObjects, ...responseObjects]);
    const before = await currentCounts(db);
    const dates = sessions.map(session => session.firstAt).sort((a, b) => a - b);
    console.log("RECUPERAÇÃO DE TODOS OS PEDIDOS — PRÉVIA", {
      pedidosCandidatos: sessions.length,
      clientes: new Set(sessions.map(session => session.phone)).size,
      arquivosDosClientes: orderObjects.length,
      arquivosExtrasLigados: extras.attached,
      arquivosExtrasSemTelefone: extras.withoutPhone,
      arquivosExtrasSemPedidoCompatível: extras.withoutOrder,
      primeiraData: dates.length ? localDate(dates[0]) : null,
      ultimaData: dates.length ? localDate(dates[dates.length - 1]) : null,
      bancoAntes: before,
    });
    if (!APPLY) {
      const metaExists = await tableExists(db, "orderRecoveryMeta");
      let jaRecuperados = 0;
      if (metaExists) {
        const [[row]] = await db.query("SELECT COUNT(*) total FROM orderRecoveryMeta WHERE source=?", [RECOVERY_SOURCE]);
        jaRecuperados = Number(row.total || 0);
      }
      console.log("MODO VARREDURA: nenhum dado foi alterado", { jaRecuperados });
      console.log("Para aplicar: node scripts/recover-orders-from-r2.mjs --apply");
      return;
    }
    const applied = await applyRecovery(db, sessions);
    const after = await currentCounts(db);
    console.log("RECUPERAÇÃO DE PEDIDOS CONCLUÍDA", { ...applied, bancoDepois: after });
    console.log("STATUS USADO", "Recuperado — revisar status (não inventa entregue/ativo sem prova individual)");
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("FALHA NA RECUPERAÇÃO DE PEDIDOS", error);
  process.exit(1);
});
