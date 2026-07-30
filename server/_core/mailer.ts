import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.zoho.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "h2@h2colombiano.com";
const SMTP_PASS = process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

// ─── Resend API (HTTPS — funciona no Render Free) ────────────────────────────
async function sendViaResend(options: Mail.Options): Promise<void> {
  const from = (typeof options.from === "string" ? options.from : SMTP_FROM) || SMTP_FROM;
  const toRaw = options.to;
  const to = Array.isArray(toRaw) ? (toRaw as string[]) : [toRaw as string];
  const body: Record<string, unknown> = {
    from,
    to,
    subject: options.subject as string,
    html: options.html as string,
  };
  if (options.text) body.text = options.text as string;
  if (options.attachments) {
    body.attachments = (options.attachments as any[]).map((a: any) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content)
        ? a.content.toString("base64")
        : Buffer.from(a.content).toString("base64"),
    }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error ${res.status}: ${err}`);
  }
}

// ─── SMTP (fallback — bloqueado no Render Free) ──────────────────────────────
let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransport() {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return cachedTransport;
}

// ─── sendMail: usa Resend se disponível, senão SMTP ──────────────────────────
export async function sendMail(options: Mail.Options) {
  if (RESEND_API_KEY) {
    return sendViaResend(options);
  }
  // fallback SMTP (pode falhar no Render Free)
  const transporter = getTransport();
  return transporter.sendMail({ from: SMTP_FROM, ...options });
}

export async function verifyMailConnection() {
  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}` },
    });
    return res.ok;
  }
  const transporter = getTransport();
  return transporter.verify();
}

export const smtpConfig = {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  user: SMTP_USER,
  pass: SMTP_PASS,
  from: SMTP_FROM,
};
