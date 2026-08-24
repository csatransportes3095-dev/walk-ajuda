import tls from "node:tls";
import { createHash } from "node:crypto";

const USER = String(process.env.SMTP_USER || "h2@h2colombiano.com").trim();
const PASS = String(process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || "").trim();
const HOST = String(process.env.IMAP_HOST || "imap.zoho.com").trim();
const PORT = Number(process.env.IMAP_PORT || 993);
const STORE = process.argv.includes("--store");
const ALL_FOLDERS = process.argv.includes("--all-folders");

if (!PASS) {
  console.log("SENHA DO ZOHO AUSENTE NO RENDER");
  console.log("Variaveis aceitas: SMTP_PASS ou ZOHO_EMAIL_PASSWORD");
  process.exit(2);
}

const quote = value => `"${String(value).replace(/[\\"]/g, "\\$&").replace(/[\r\n]/g, "")}"`;

class ImapConnection {
  constructor() {
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.waiter = null;
    this.tagNumber = 0;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = tls.connect({ host: HOST, port: PORT, servername: HOST, rejectUnauthorized: true });
      this.socket = socket;
      const timeout = setTimeout(() => reject(new Error("Tempo esgotado ao conectar no Zoho IMAP")), 20000);
      const onError = error => {
        clearTimeout(timeout);
        reject(error);
      };
      socket.once("error", onError);
      socket.on("data", chunk => this.onData(chunk));
      socket.once("secureConnect", () => {
        clearTimeout(timeout);
        socket.off("error", onError);
        resolve();
      });
    });
    await this.waitForGreeting();
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.waiter) return;
    const text = this.buffer.toString("utf8");
    const match = text.match(new RegExp(`(?:^|\\r\\n)${this.waiter.tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n`));
    if (!match) return;
    const response = this.buffer;
    const waiter = this.waiter;
    this.waiter = null;
    this.buffer = Buffer.alloc(0);
    clearTimeout(waiter.timeout);
    if (match[1] === "OK") waiter.resolve(response);
    else waiter.reject(new Error(`Zoho IMAP recusou o comando: ${match[0].trim()}`));
  }

  async waitForGreeting() {
    if (/^\* (?:OK|PREAUTH)/m.test(this.buffer.toString("utf8"))) {
      this.buffer = Buffer.alloc(0);
      return;
    }
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Zoho IMAP nao enviou saudacao")), 15000);
      const check = () => {
        if (/^\* (?:OK|PREAUTH)/m.test(this.buffer.toString("utf8"))) {
          clearInterval(interval);
          clearTimeout(timeout);
          this.buffer = Buffer.alloc(0);
          resolve();
        }
      };
      const interval = setInterval(check, 50);
      check();
    });
  }

  command(command, timeoutMs = 60000) {
    if (this.waiter) throw new Error("Comando IMAP simultaneo nao permitido");
    const tag = `A${String(++this.tagNumber).padStart(5, "0")}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiter = null;
        reject(new Error(`Tempo esgotado no comando IMAP ${tag}`));
      }, timeoutMs);
      this.waiter = { tag, resolve, reject, timeout };
      this.socket.write(`${tag} ${command}\r\n`);
    });
  }

  close() {
    this.socket?.end();
    this.socket?.destroy();
  }
}

function decodeHeader(value) {
  return String(value || "").replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset, mode, data) => {
    try {
      if (mode.toLowerCase() === "b") return Buffer.from(data, "base64").toString("utf8");
      const decoded = data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
      return Buffer.from(decoded, "binary").toString(/utf-8/i.test(charset) ? "utf8" : "latin1");
    } catch {
      return data;
    }
  });
}

function parseHeaders(raw) {
  const unfolded = String(raw).replace(/\r?\n[ \t]+/g, " ");
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const position = line.indexOf(":");
    if (position < 1) continue;
    const key = line.slice(0, position).trim().toLowerCase();
    const value = line.slice(position + 1).trim();
    if (headers[key] === undefined) headers[key] = decodeHeader(value);
  }
  return headers;
}

function decodeQuotedPrintable(value) {
  const joined = String(value || "").replace(/=\r?\n/g, "");
  const binary = joined.replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(binary, "binary").toString("utf8");
}

function decodeBody(body, transferEncoding) {
  const encoding = String(transferEncoding || "").toLowerCase();
  if (encoding.includes("base64")) return Buffer.from(String(body).replace(/\s+/g, ""), "base64").toString("utf8");
  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return String(body || "");
}

function extractTextParts(rawMessage) {
  const splitAt = rawMessage.search(/\r?\n\r?\n/);
  if (splitAt < 0) return { html: "", text: rawMessage, headers: {} };
  const headerText = rawMessage.slice(0, splitAt);
  const body = rawMessage.slice(splitAt).replace(/^\r?\n\r?\n/, "");
  const headers = parseHeaders(headerText);
  const contentType = String(headers["content-type"] || "text/plain");
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
  if (boundary) {
    const result = { html: "", text: "", headers };
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith("--")) break;
      const parsed = extractTextParts(part.replace(/^\r?\n/, "").replace(/\r?\n$/, ""));
      if (parsed.html) result.html += `\n${parsed.html}`;
      if (parsed.text) result.text += `\n${parsed.text}`;
    }
    return result;
  }
  const decoded = decodeBody(body, headers["content-transfer-encoding"]);
  return /text\/html/i.test(contentType)
    ? { html: decoded, text: "", headers }
    : { html: "", text: decoded, headers };
}

function literalFromFetch(response) {
  const marker = response.toString("ascii").match(/\{(\d+)\}\r\n/);
  if (!marker || marker.index === undefined) return "";
  const start = marker.index + Buffer.byteLength(marker[0], "ascii");
  const length = Number(marker[1]);
  return response.subarray(start, start + length).toString("utf8");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function plainText(value) {
  return decodeEntities(String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function extractInfoRows(html) {
  const rows = {};
  const regex = /<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  for (const match of String(html || "").matchAll(regex)) {
    const label = plainText(match[1]).replace(/:\s*$/, "").toLowerCase();
    const value = plainText(match[2]);
    if (label && value && rows[label] === undefined) rows[label] = value;
  }
  return rows;
}

function orderNumber(value) {
  return String(value || "").match(/\d+/)?.[0] || "";
}

function phone(value) {
  const valueDigits = String(value || "").replace(/\D/g, "");
  return valueDigits.length >= 10 ? valueDigits.slice(-11) : "";
}

function identifyStatus(value) {
  const checks = [
    [/(?:pedido\s+)?entregue|conclu[ií]do|finalizado/i, "entregue"],
    [/conta\s+ativa/i, "conta_ativa"],
    [/aguardando\s+ativa/i, "aguardando_ativacao"],
    [/foto\s+em\s+an[aá]lise/i, "foto_em_analise"],
    [/aguardando\s+agendamento/i, "aguardando_agendamento"],
    [/cancelado|recusado/i, "cancelado_ou_recusado"],
  ];
  return checks.find(([pattern]) => pattern.test(value))?.[1] || "";
}

function parseListMailboxes(response) {
  const mailboxes = [];
  for (const line of response.toString("utf8").split("\r\n")) {
    if (!line.startsWith("* LIST ") || /\\Noselect/i.test(line)) continue;
    const quoted = [...line.matchAll(/"((?:\\.|[^"])*)"/g)].map(match => match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    const mailbox = quoted.at(-1);
    if (mailbox) mailboxes.push(mailbox);
  }
  return [...new Set(mailboxes)];
}

function parseSearchUids(response) {
  const match = response.toString("utf8").match(/\* SEARCH([^\r\n]*)/i);
  return match ? match[1].trim().split(/\s+/).filter(value => /^\d+$/.test(value)) : [];
}

async function main() {
  const imap = new ImapConnection();
  await imap.connect();
  try {
    await imap.command(`LOGIN ${quote(USER)} ${quote(PASS)}`, 30000);
    const listed = await imap.command('LIST "" "*"');
    const allMailboxes = parseListMailboxes(listed);
    const preferred = allMailboxes.filter(name => /^(INBOX|Archive|Arquiv|Sent|Enviad|All Mail|Todos)/i.test(name));
    const mailboxes = ALL_FOLDERS ? allMailboxes : (preferred.length ? preferred : ["INBOX"]);
    const messages = [];
    const seenMessageIds = new Set();
    const countsByFolder = {};

    for (const mailbox of mailboxes) {
      await imap.command(`SELECT ${quote(mailbox)}`);
      let searched;
      try {
        searched = await imap.command('UID SEARCH OR TEXT "PEDIDO" TEXT "ENTREGUE"');
      } catch {
        searched = await imap.command('UID SEARCH TEXT "PEDIDO"');
      }
      const uids = parseSearchUids(searched);
      countsByFolder[mailbox] = uids.length;
      for (const uid of uids) {
        const fetched = await imap.command(`UID FETCH ${uid} (BODY.PEEK[])`, 90000);
        const raw = literalFromFetch(fetched);
        if (!raw) continue;
        const parts = extractTextParts(raw);
        const topHeaders = parseHeaders(raw.slice(0, raw.search(/\r?\n\r?\n/)));
        const messageId = String(topHeaders["message-id"] || createHash("sha256").update(raw).digest("hex"));
        if (seenMessageIds.has(messageId)) continue;
        seenMessageIds.add(messageId);
        const html = parts.html;
        const text = plainText(`${parts.text} ${html}`);
        const subject = decodeHeader(topHeaders.subject || "");
        const combined = `${subject} ${text}`;
        if (!/(pedido|entregue)/i.test(combined)) continue;
        const rows = extractInfoRows(html);
        messages.push({
          messageKey: createHash("sha256").update(messageId).digest("hex"),
          folder: mailbox,
          date: String(topHeaders.date || ""),
          subject,
          orderNumber: orderNumber(rows["nº pedido"] || rows["n° pedido"] || rows.pedido),
          phone: phone(rows.telefone),
          client: String(rows.cliente || rows.nome || "").trim(),
          service: String(rows["serviço"] || rows.servico || "").trim(),
          option: String(rows["opção"] || rows.opcao || "").trim(),
          status: identifyStatus(combined),
          isNew: /NOVO PEDIDO RECEBIDO/i.test(combined),
        });
      }
    }

    const keys = new Set(messages.map(item => item.orderNumber
      ? `N:${item.orderNumber}`
      : item.phone && item.service
        ? `P:${item.phone}|${item.service.toUpperCase()}|${item.date.slice(0, 16)}`
        : "").filter(Boolean));
    const statusCounts = messages.reduce((totals, item) => {
      const key = item.status || "sem_status_identificado";
      totals[key] = (totals[key] || 0) + 1;
      return totals;
    }, {});
    console.log("VARREDURA ZOHO — TODOS OS PEDIDOS ANTIGOS", {
      conta: USER,
      modoPastas: ALL_FOLDERS ? "todas" : "principais",
      pastasVerificadas: mailboxes,
      mensagensEncontradasPorPasta: countsByFolder,
      emailsDePedido: messages.length,
      novosPedidosEncontrados: messages.filter(item => item.isNew).length,
      referenciasUnicasDePedido: keys.size,
      pedidosComNumero: new Set(messages.map(item => item.orderNumber).filter(Boolean)).size,
      clientesComTelefone: new Set(messages.map(item => item.phone).filter(Boolean)).size,
      evidenciasDeEntregue: messages.filter(item => item.status === "entregue").length,
      statusEncontrados: statusCounts,
    });
    if (STORE) {
      if (!String(process.env.DATABASE_URL || "").trim()) throw new Error("DATABASE_URL ausente");
      const { createConnection } = await import("mysql2/promise");
      const db = await createConnection(process.env.DATABASE_URL);
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS orderEmailRecoveryEvidence (
            messageKey VARCHAR(64) PRIMARY KEY,
            folder VARCHAR(255) NOT NULL,
            sourceDate VARCHAR(255) NULL,
            eventAt DATETIME NULL,
            subject VARCHAR(512) NULL,
            orderNumber VARCHAR(64) NULL,
            customerPhone VARCHAR(32) NULL,
            customerName VARCHAR(255) NULL,
            serviceName VARCHAR(255) NULL,
            serviceOption VARCHAR(255) NULL,
            detectedStatus VARCHAR(64) NULL,
            isNewOrder TINYINT NOT NULL DEFAULT 0,
            source VARCHAR(32) NOT NULL DEFAULT 'zoho_imap',
            createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email_recovery_phone (customerPhone),
            INDEX idx_email_recovery_event (eventAt),
            INDEX idx_email_recovery_status (detectedStatus)
          )
        `);
        for (const item of messages) {
          const parsedDate = new Date(item.date);
          const eventAt = Number.isFinite(parsedDate.getTime()) ? parsedDate : null;
          await db.query(
            `INSERT INTO orderEmailRecoveryEvidence
              (messageKey,folder,sourceDate,eventAt,subject,orderNumber,customerPhone,customerName,serviceName,serviceOption,detectedStatus,isNewOrder)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               folder=VALUES(folder),sourceDate=VALUES(sourceDate),eventAt=VALUES(eventAt),subject=VALUES(subject),
               orderNumber=VALUES(orderNumber),customerPhone=VALUES(customerPhone),customerName=VALUES(customerName),
               serviceName=VALUES(serviceName),serviceOption=VALUES(serviceOption),detectedStatus=VALUES(detectedStatus),
               isNewOrder=VALUES(isNewOrder)`,
            [item.messageKey, item.folder, item.date || null, eventAt, item.subject || null,
              item.orderNumber || null, item.phone || null, item.client || null, item.service || null,
              item.option || null, item.status || null, item.isNew ? 1 : 0],
          );
        }
        const [[stored]] = await db.query("SELECT COUNT(*) total FROM orderEmailRecoveryEvidence");
        console.log("EVIDENCIAS DOS EMAILS SALVAS", { processadas: messages.length, totalNaTabela: Number(stored.total || 0) });
      } finally {
        await db.end();
      }
      console.log("PEDIDOS AINDA NAO FORAM INSERIDOS: somente as evidencias foram guardadas");
    } else {
      console.log("MODO VARREDURA: nenhum pedido foi alterado");
      console.log("Para guardar todas as evidencias: node scripts/scan-zoho-order-mails.mjs --all-folders --store");
    }
    await imap.command("LOGOUT", 10000).catch(() => {});
  } finally {
    imap.close();
  }
}

main().catch(error => {
  const message = String(error?.message || error).replace(PASS, "[SENHA OCULTA]");
  console.error("FALHA NA VARREDURA DO ZOHO", message);
  process.exit(1);
});
