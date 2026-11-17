/**
 * Reliable, read-only notification channel for loan events.
 *
 * Payment/request mutations are authoritative. This outbox NEVER modifies
 * loans, installments, scores, payment statuses or bank details.
 *
 * Once queued, notifications retry after transient mail outages and restart.
 * "accepted" means the mail transport accepted the message, not inbox delivery.
 */
import { sql as drizzleSql } from "drizzle-orm";
import { getDb, getSetting } from "../db";
import { sendMailDirect, type MailOptions } from "../_core/sendMailDirect";

export type LoanAdminEvent = {
  kind: "request" | "proof" | "manual_payment" | "interest_payment";
  loanId: number;
  clientName: string;
  clientPhone?: string;
  amount: number;
  paymentType?: string;
  installmentId?: number;
  installmentNumber?: number;
  proofUrl?: string;
  submittedAt: string;
};

type StoredNotice = {
  id: number;
  eventKey: string;
  payload: string;
  attempts: number;
};

export type LoanNoticeAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

const MAX_ATTACH_BYTES = 7 * 1024 * 1024;
const RECIPIENT_DEFAULT = "h2@h2colombiano.com";
let tableReady: Promise<void> | null = null;
let workerStarted = false;
let draining = false;

function rowsOf(value: unknown): any[] {
  const rows = (value as any)?.[0];
  return Array.isArray(rows) ? rows : [];
}

function isValidKey(key: string): boolean {
  return /^(request|proof|manual-payment|interest-payment):[0-9]+(?::[0-9]+){0,2}$/.test(key) && key.length <= 120;
}

export function escapeLoanNoticeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] || char));
}

function formatAmount(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function buildLoanAdminNotice(event: LoanAdminEvent): { subject: string; html: string } {
  const name = String(event.clientName || "Cliente").replace(/[\r\n]/g, " ").slice(0, 120);
  const who = escapeLoanNoticeHtml(name);
  const loan = escapeLoanNoticeHtml(event.loanId);
  const number = escapeLoanNoticeHtml(event.installmentNumber ?? "-");
  const amount = escapeLoanNoticeHtml(formatAmount(event.amount));
  const phone = escapeLoanNoticeHtml(event.clientPhone || "não informado");
  const when = new Date(event.submittedAt);
  const submitted = escapeLoanNoticeHtml(Number.isNaN(when.getTime())
    ? "não informado"
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(when));

  let title = "";
  let details = "";
  if (event.kind === "request") {
    title = "Nova solicitação de empréstimo";
    details = "<p>Uma nova solicitação foi registrada e aguarda análise no ADM.</p>" +
      "<p><b>Modalidade:</b> " + escapeLoanNoticeHtml(event.paymentType || "não informada") + "</p>";
  } else if (event.kind === "proof") {
    title = "Comprovante de empréstimo recebido";
    details = "<p>O cliente enviou um comprovante que precisa ser conferido no ADM.</p>" +
      "<p><b>Parcela:</b> #" + number + "</p>";
    // Only link to the original trusted upload. Do not reconstruct paths.
    if (event.proofUrl && /^https:\/\//i.test(event.proofUrl)) {
      details += "<p><a href=\"" + escapeLoanNoticeHtml(event.proofUrl) + "\">Abrir comprovante</a></p>";
    }
  } else if (event.kind === "interest_payment") {
    title = "Pagamento de juros registrado";
    details = "<p>Pagamento de juros confirmado pelo ADM.</p><p><b>Parcela:</b> #" + number + "</p>";
  } else {
    title = "Pagamento de empréstimo confirmado";
    details = "<p>Pagamento confirmado pelo ADM.</p><p><b>Parcela:</b> #" + number + "</p>";
  }
  const subject = "[EMPRÉSTIMOS] " + title + " - #" + event.loanId + " - " + name;
  const html = "<div style=\"font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#1e293b\">" +
    "<h2 style=\"background:#0f172a;color:#22c55e;padding:20px\">H2 COLOMBIANO - " + escapeLoanNoticeHtml(title) + "</h2>" +
    "<div style=\"padding:20px;border:1px solid #e2e8f0\">" +
    "<p><b>Cliente:</b> " + who + "</p><p><b>Telefone:</b> " + phone + "</p>" +
    "<p><b>Empréstimo:</b> #" + loan + "</p><p><b>Valor:</b> " + amount + "</p>" +
    "<p><b>Data:</b> " + submitted + "</p>" + details +
    "<p>Acesse o painel administrativo de Empréstimos para conferir.</p></div></div>";
  return { subject, html };
}

async function ensureOutbox(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      await db.execute(drizzleSql.raw(`
        CREATE TABLE IF NOT EXISTS loanAdminEmailOutbox (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          eventKey VARCHAR(120) NOT NULL,
          payload LONGTEXT NOT NULL,
          state VARCHAR(18) NOT NULL DEFAULT 'pending',
          attempts INT NOT NULL DEFAULT 0,
          nextAttemptAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          leaseUntil DATETIME NULL,
          lastError VARCHAR(500) NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          acceptedAt DATETIME NULL,
          UNIQUE KEY uq_loan_email_event (eventKey),
          KEY ix_loan_email_due (state, nextAttemptAt, id),
          KEY ix_loan_email_lease (state, leaseUntil)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `));
    })().catch(error => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function resolveRecipient(): Promise<string> {
  const configured = String((await getSetting("contact_email")) || (await getSetting("email_to")) || "").trim();
  const address = configured || RECIPIENT_DEFAULT;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    console.warn("[LoanAdminEmail] endereço de destino configurado inválido; usando destinatário padrão");
    return RECIPIENT_DEFAULT;
  }
  return address;
}

async function deliver(row: StoredNotice, attachment?: LoanNoticeAttachment): Promise<void> {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");
  const claim = await db.execute(drizzleSql`
    UPDATE loanAdminEmailOutbox
    SET state='sending', attempts=attempts+1,
        leaseUntil=DATE_ADD(NOW(), INTERVAL 5 MINUTE)
    WHERE id=${row.id} AND (
      (state IN ('pending','retry') AND nextAttemptAt <= NOW())
      OR (state='sending' AND leaseUntil < NOW())
    )
  `);
  if (Number((claim as any)?.[0]?.affectedRows || 0) !== 1) return;

  try {
    const payload = JSON.parse(row.payload) as LoanAdminEvent;
    const notice = buildLoanAdminNotice(payload);
    const to = await resolveRecipient();
    const mail: MailOptions = {
      from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
      to,
      ...notice,
    };
    if (attachment && attachment.content.length > 0 && attachment.content.length <= MAX_ATTACH_BYTES) {
      try {
        await sendMailDirect({
          ...mail,
          attachments: [{
            filename: attachment.filename || "comprovante",
            content: attachment.content,
            contentType: attachment.contentType || "application/octet-stream",
          }],
        });
      } catch (withFileError: any) {
        // A provider can refuse large/corrupt attachments. Sending just the
        // durable proof URL still alerts the ADM and allows manual review.
        console.warn("[LoanAdminEmail] anexo recusado; enviando link sem anexo:", row.id,
          String(withFileError?.message || withFileError).slice(0,200));
        await sendMailDirect(mail);
      }
    } else {
      await sendMailDirect(mail);
    }
    await db.execute(drizzleSql`
      UPDATE loanAdminEmailOutbox SET state='accepted', acceptedAt=NOW(),
        leaseUntil=NULL, lastError=NULL WHERE id=${row.id} AND state='sending'
    `);
    console.info("[LoanAdminEmail] aceito pelo provedor:", row.id, payload.kind);
  } catch (error: any) {
    const message = String(error?.message || error || "falha desconhecida").slice(0,450);
    const delay = Math.min(3600, 30 * Math.pow(2, Math.min(7, Number(row.attempts || 0))));
    await db.execute(drizzleSql`
      UPDATE loanAdminEmailOutbox SET state='retry',
        nextAttemptAt=DATE_ADD(NOW(), INTERVAL ${delay} SECOND),
        leaseUntil=NULL, lastError=${message} WHERE id=${row.id} AND state='sending'
    `);
    console.error("[LoanAdminEmail] falha e reenvio agendado:", row.id, message);
  }
}

async function deliverByKey(key: string, attachment?: LoanNoticeAttachment): Promise<void> {
  await ensureOutbox();
  const db = await getDb() as any;
  const rows = rowsOf(await db.execute(drizzleSql`
    SELECT id, eventKey, payload, attempts FROM loanAdminEmailOutbox
    WHERE eventKey=${key} LIMIT 1
  `));
  if (rows[0]) await deliver(rows[0] as StoredNotice, attachment);
}

/** Queue the notification after the loan/payment is committed. */
export async function queueLoanAdminNotice(
  eventKey: string, event: LoanAdminEvent, attachment?: LoanNoticeAttachment,
): Promise<void> {
  if (!isValidKey(eventKey)) throw new Error("Identificador de notificação de empréstimo inválido");
  if (!Number.isInteger(event.loanId) || event.loanId <= 0) throw new Error("Empréstimo inválido");
  await ensureOutbox();
  const db = await getDb() as any;
  await db.execute(drizzleSql`
    INSERT IGNORE INTO loanAdminEmailOutbox (eventKey, payload)
    VALUES (${eventKey}, ${JSON.stringify(event)})
  `);
  // Never block the customer's submission on a mail provider response. The
  // record is already persistent and the worker retries it after restarts.
  void deliverByKey(eventKey, attachment).catch(error =>
    console.error("[LoanAdminEmail] entrega imediata não executada:", String(error?.message || error).slice(0,200))
  );
}

export async function reconcileLoanAdminEmailOutbox(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    await ensureOutbox();
    const db = await getDb() as any;
    const rows = rowsOf(await db.execute(drizzleSql`
      SELECT id, eventKey, payload, attempts FROM loanAdminEmailOutbox
      WHERE (state IN ('pending','retry') AND nextAttemptAt <= NOW())
        OR (state='sending' AND leaseUntil < NOW())
      ORDER BY id ASC LIMIT 20
    `));
    for (const row of rows) {
      await deliver(row as StoredNotice);
    }
  } finally {
    draining = false;
  }
}

export function startLoanAdminEmailWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  const tick = () => {
    void reconcileLoanAdminEmailOutbox().catch(error =>
      console.error("[LoanAdminEmail] reconciliação indisponível:", String(error?.message || error).slice(0,250))
    );
  };
  const first = setTimeout(tick, 4_000);
  first.unref?.();
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
}
