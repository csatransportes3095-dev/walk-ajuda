import nodemailer from "nodemailer";

/** Delivery follows the existing H2 SMTP/Resend configuration. Never log the OTP. */
export async function sendPasswordRecoveryEmail(email: string, code: string): Promise<void> {
  const subject = "H2 Colombiano - Recuperacao de senha";
  const body = "Voce solicitou a recuperacao de sua senha do H2 Colombiano.\n\nCodigo: " + code +
    "\n\nO codigo vale por 10 minutos e pode ser utilizado uma unica vez. Se nao solicitou, ignore esta mensagem.";
  const html = '<div style="font:16px Arial,sans-serif;max-width:480px;margin:auto;padding:24px">' +
    '<h2>H2 Colombiano</h2><p>Seu codigo para recuperar a senha:</p><p style="font-size:28px;font-weight:700;letter-spacing:3px">' +
    code + '</p><p>Validade de 10 minutos, uso unico.</p><p>Se nao foi voce, ignore este e-mail.</p></div>';
  const pass = process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || "";
  if (pass) {
    const port = Number(process.env.SMTP_PORT || "465");
    const secure = process.env.SMTP_SECURE
      ? ["1","true","yes","on"].includes(process.env.SMTP_SECURE.toLowerCase())
      : port === 465;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.zoho.com",
      port, secure, requireTLS: !secure,
      auth: { user: process.env.SMTP_USER || "h2@h2colombiano.com", pass },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
    });
    try {
      const response = await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "h2@h2colombiano.com",
        to: email, subject, text: body, html,
      });
      const accepted = (response.accepted || []).some(v =>
        (typeof v === "string" ? v : v.address).toLowerCase() === email.toLowerCase());
      if (accepted) return;
    } catch {
      // Resend fallback below: no email, OTP or credentials in logs.
    } finally {
      transport.close();
    }
  }
  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "h2@h2colombiano.com",
        to: [email], subject, text: body, html,
      }),
    });
    if (response.ok) return;
  }
  throw new Error("PASSWORD_RECOVERY_DELIVERY_UNAVAILABLE");
}
