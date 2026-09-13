import { sendMail } from "./mailer";

const ADMIN_EMAIL = "h2@h2colombiano.com";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safePhotoUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function notifyCustomerEntry(input: {
  name?: string | null;
  phone: string;
  profilePhotoUrl?: string | null;
  enteredAt?: Date;
}): Promise<void> {
  try {
    const enteredAt = input.enteredAt ?? new Date();
    const dateTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(enteredAt);

    const name = escapeHtml(input.name || "Cliente");
    const phone = escapeHtml(input.phone);
    const photoUrl = safePhotoUrl(input.profilePhotoUrl);
    const photoBlock = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="Foto do cliente" style="width:120px;height:120px;border-radius:12px;object-fit:cover;display:block;margin:0 auto 18px;" />`
      : `<div style="text-align:center;color:#6b7280;margin-bottom:18px;">Cliente sem foto cadastrada.</div>`;

    await sendMail({
      to: ADMIN_EMAIL,
      subject: `Cliente entrou no H2 - ${input.name || input.phone}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#ffffff;color:#111827;">
          <h2 style="margin:0 0 20px;text-align:center;">CLIENTE ENTROU NO H2</h2>
          ${photoBlock}
          <p><strong>Nome:</strong> ${name}</p>
          <p><strong>Telefone:</strong> ${phone}</p>
          <p><strong>Data/Hora:</strong> ${escapeHtml(dateTime)}</p>
        </div>
      `,
    });
  } catch (error) {
    console.warn("[customer-entry-notification] Falha ao enviar e-mail:", error);
  }
}
