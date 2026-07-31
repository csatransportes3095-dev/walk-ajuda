/**
 * sendMailDirect — envia e-mail via Resend API (HTTPS) ou SMTP como fallback.
 * Substitui todos os nodemailer.createTransport() hardcoded no routers.ts.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "h2@h2colombiano.com";

export interface MailOptions {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}

export async function sendMailDirect(options: MailOptions): Promise<void> {
  const from = options.from || SMTP_FROM;
  console.log(`[sendMailDirect] to=${options.to} subject="${options.subject}" resend=${!!RESEND_API_KEY}`);

  const channelErrors: string[] = [];

  if (RESEND_API_KEY) {
    try {
      const body: Record<string, unknown> = {
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      };
      if (options.text) body.text = options.text;
      if (options.attachments?.length) {
        body.attachments = options.attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString("base64")
            : Buffer.from(a.content as string).toString("base64"),
        }));
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend API error ${res.status}: ${err}`);
      }
      console.log(`[sendMailDirect] Resend OK to=${options.to}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      channelErrors.push(`resend=${msg}`);
      console.error(`[sendMailDirect] Resend failed, trying SMTP fallback: ${msg}`);
    }
  }

  // SMTP fallback
  const smtpPass = process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || "";
  if (smtpPass) {
    try {
      const nodemailer = await import("nodemailer");
      const smtpHost = process.env.SMTP_HOST || "smtp.zoho.com";
      const smtpPort = Number(process.env.SMTP_PORT || "465");
      const smtpSecure = process.env.SMTP_SECURE
        ? ["1", "true", "yes", "on"].includes(process.env.SMTP_SECURE.toLowerCase())
        : smtpPort === 465;

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: process.env.SMTP_USER || "h2@h2colombiano.com",
          pass: smtpPass,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
      });

      await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.attachments ? { attachments: options.attachments } : {}),
      });

      console.log(`[sendMailDirect] SMTP OK to=${options.to}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      channelErrors.push(`smtp=${msg}`);
      console.error(`[sendMailDirect] SMTP failed: ${msg}`);
    }
  } else {
    channelErrors.push("smtp=missing SMTP_PASS/ZOHO_EMAIL_PASSWORD");
  }

  const details = channelErrors.length > 0 ? ` (${channelErrors.join(" | ")})` : "";
  throw new Error(`No email channel succeeded${details}`);
}
