import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createConnection } from "mysql2/promise";
import { gunzipSync } from "node:zlib";

const REQUIRED_ENV = ["DATABASE_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME"];
for (const name of REQUIRED_ENV) {
  if (!String(process.env[name] ?? "").trim()) throw new Error(`${name} ausente`);
}

const digits = value => String(value ?? "").replace(/\D/g, "");
const phoneKey = value => {
  const valueDigits = digits(value);
  if (valueDigits.length < 10) return "";
  return valueDigits.slice(-11);
};

function localDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = type => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function phoneFromKey(key) {
  const name = String(key).replace(/^order-docs\//, "");
  const direct = name.match(/^(?:55)?(\d{10,11})(?:-|\/)/);
  if (direct) return phoneKey(direct[1]);
  const fallback = name.match(/(?:^|\D)((?:55)?\d{10,11})(?:\D|$)/);
  return fallback ? phoneKey(fallback[1]) : "";
}

function decodeRecoveryPayload(rawValue) {
  let raw = String(rawValue ?? "").replace(/^\uFEFF/, "").trim();
  if (!raw) return null;
  const assignment = raw.indexOf("LOAN_RESTORE_PAYLOAD_B64=");
  if (assignment >= 0) raw = raw.slice(assignment + "LOAN_RESTORE_PAYLOAD_B64=".length).trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1).trim();
  if (raw.startsWith("```")) raw = raw.replace(/^```[^\n]*\n?/, "").replace(/```\s*$/, "").trim();
  if (raw.startsWith("{")) return JSON.parse(raw);
  const marker = raw.indexOf("H4sI");
  if (marker >= 0) raw = raw.slice(marker);
  const buffer = Buffer.from(raw.replace(/\s+/g, ""), "base64");
  try {
    return JSON.parse(gunzipSync(buffer).toString("utf8"));
  } catch {
    const text = buffer.toString("utf8").trim();
    return text.startsWith("{") ? JSON.parse(text) : null;
  }
}

async function listOrderObjects() {
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
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: String(process.env.R2_BUCKET_NAME).trim(),
      Prefix: "order-docs/",
      ContinuationToken: continuationToken,
    }));
    for (const item of response.Contents ?? []) {
      if (item.Key && item.LastModified) objects.push({
        key: item.Key,
        modifiedAt: new Date(item.LastModified),
        size: Number(item.Size ?? 0),
      });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  client.destroy();
  return objects;
}

function buildSessions(objects) {
  const byPhone = new Map();
  for (const object of objects) {
    const phone = phoneFromKey(object.key);
    if (!phone) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(object);
  }
  const sessions = [];
  const gapMs = 6 * 60 * 60 * 1000;
  for (const [phone, phoneObjects] of byPhone) {
    phoneObjects.sort((a, b) => a.modifiedAt - b.modifiedAt);
    let current = null;
    for (const object of phoneObjects) {
      if (!current || object.modifiedAt.getTime() - current.lastAt.getTime() > gapMs) {
        current = { phone, firstAt: object.modifiedAt, lastAt: object.modifiedAt, objects: [] };
        sessions.push(current);
      }
      current.objects.push(object);
      current.lastAt = object.modifiedAt;
    }
  }
  return sessions;
}

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [[orderCount]] = await db.query("SELECT COUNT(*) AS total FROM orderStatusHistory");
    const [[fileCount]] = await db.query("SELECT COUNT(*) AS total FROM orderFiles");
    const objects = await listOrderObjects();
    const dated = objects.filter(object => Number.isFinite(object.modifiedAt.getTime()));
    const withPhone = dated.filter(object => phoneFromKey(object.key));
    const sessions = buildSessions(withPhone);
    const augustObjects = withPhone.filter(object => localDate(object.modifiedAt).startsWith("2026-08-"));
    const augustSessions = sessions.filter(session => localDate(session.firstAt).startsWith("2026-08-"));
    const daily = {};
    for (const session of augustSessions) {
      const date = localDate(session.firstAt);
      if (!daily[date]) daily[date] = { pedidosCandidatos: 0, documentos: 0, clientes: new Set() };
      daily[date].pedidosCandidatos += 1;
      daily[date].documentos += session.objects.length;
      daily[date].clientes.add(session.phone);
    }
    const dailyOutput = Object.fromEntries(Object.entries(daily).sort().map(([date, value]) => [date, {
      pedidosCandidatos: value.pedidosCandidatos,
      documentos: value.documentos,
      clientes: value.clientes.size,
    }]));

    let privateOrderTables = {};
    const privatePayload = String(process.env.LOAN_RESTORE_PAYLOAD_B64 ?? "").trim();
    if (privatePayload) {
      try {
        const payload = decodeRecoveryPayload(privatePayload);
        privateOrderTables = Object.fromEntries(Object.entries(payload?.tables ?? {})
          .filter(([name, rows]) => /(order|pedido|registration)/i.test(name) && Array.isArray(rows))
          .map(([name, rows]) => [name, rows.length]));
      } catch {
        privateOrderTables = { erro: "pacote não lido" };
      }
    }

    console.log("VARREDURA DE PEDIDOS RECENTES", {
      pedidosAtuaisBanco: Number(orderCount.total ?? 0),
      arquivosAtuaisBanco: Number(fileCount.total ?? 0),
      objetosR2Total: objects.length,
      objetosR2ComTelefone: withPhone.length,
      objetosR2Agosto: augustObjects.length,
      pedidosCandidatosAgosto: augustSessions.length,
      clientesAgosto: new Set(augustSessions.map(session => session.phone)).size,
    });
    console.log("PEDIDOS POR DIA EM AGOSTO", dailyOutput);
    console.log("TABELAS DE PEDIDO NO PACOTE PRIVADO", privateOrderTables);
    console.log("MODO VARREDURA: nenhum pedido foi alterado");
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("FALHA NA VARREDURA", error);
  process.exit(1);
});
