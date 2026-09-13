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

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value;
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
    const phone = escapeHtml(formatPhone(input.phone));
    const photoUrl = safePhotoUrl(input.profilePhotoUrl);
    const photoBlock = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="Foto do cliente" width="112" height="112" style="display:block;width:112px;height:112px;border-radius:999px;object-fit:cover;border:4px solid #f8c400;box-shadow:0 0 0 4px rgba(0,104,217,.28),0 12px 30px rgba(0,0,0,.35);margin:0 auto;" />`
      : `<div style="width:112px;height:112px;border-radius:999px;margin:0 auto;background:#101a2c;border:4px solid #f8c400;box-shadow:0 0 0 4px rgba(0,104,217,.28);color:#f8c400;font-size:42px;line-height:112px;text-align:center;font-weight:900;">H2</div>`;

    await sendMail({
      to: ADMIN_EMAIL,
      subject: `Cliente entrou no H2 - ${input.name || input.phone}`,
      html: `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#050914;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#050914;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#09111f;border:1px solid #22314d;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.45);">
            <tr>
              <td style="height:7px;background:#f8c400;font-size:0;line-height:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
                  <td width="34%" style="height:7px;background:#f8c400;">&nbsp;</td>
                  <td width="33%" style="height:7px;background:#0068d9;">&nbsp;</td>
                  <td width="33%" style="height:7px;background:#e3272e;">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:30px 24px 16px;background:#0b1424;">
                <div style="font-size:12px;letter-spacing:5px;color:#f8c400;font-weight:900;margin-bottom:10px;">H2 COLOMBIA</div>
                <div style="font-size:30px;line-height:1.12;font-weight:900;color:#ffffff;letter-spacing:.3px;">CLIENTE ENTROU NO <span style="color:#f8c400;">H2</span></div>
                <div style="margin-top:10px;font-size:12px;letter-spacing:3px;color:#8fa8c7;font-weight:700;">NOVO ACESSO IDENTIFICADO</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px 8px;">${photoBlock}</td>
            </tr>
            <tr>
              <td style="padding:18px 24px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#0d1728;border:1px solid #233653;border-radius:18px;overflow:hidden;">
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #233653;">
                      <div style="font-size:11px;letter-spacing:1.7px;color:#7890b0;font-weight:800;text-transform:uppercase;">Nome</div>
                      <div style="margin-top:6px;font-size:23px;line-height:1.25;color:#ffffff;font-weight:900;">${name}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #233653;">
                      <div style="font-size:11px;letter-spacing:1.7px;color:#7890b0;font-weight:800;text-transform:uppercase;">Telefone</div>
                      <div style="margin-top:6px;font-size:23px;line-height:1.25;color:#f8c400;font-weight:900;">${phone}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:11px;letter-spacing:1.7px;color:#7890b0;font-weight:800;text-transform:uppercase;">Data / Hora</div>
                      <div style="margin-top:6px;font-size:20px;line-height:1.35;color:#ffffff;font-weight:900;">${escapeHtml(dateTime)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px 24px;background:#070d18;border-top:1px solid #17243a;">
                <div style="font-size:13px;letter-spacing:4px;color:#f8c400;font-weight:900;">H2 COLOMBIA</div>
                <div style="margin-top:8px;font-size:11px;letter-spacing:2.5px;color:#8195b1;">SEMPRE CONECTADO COM VOCÊ</div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;"><tr>
                  <td style="width:38px;height:4px;background:#f8c400;font-size:0;">&nbsp;</td>
                  <td style="width:8px;font-size:0;">&nbsp;</td>
                  <td style="width:38px;height:4px;background:#0068d9;font-size:0;">&nbsp;</td>
                  <td style="width:8px;font-size:0;">&nbsp;</td>
                  <td style="width:38px;height:4px;background:#e3272e;font-size:0;">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
      `,
    });
  } catch (error) {
    console.warn("[customer-entry-notification] Falha ao enviar e-mail:", error);
  }
}

export async function notifyCustomerRouteActivity(input: {
  name?: string | null;
  phone: string;
  profilePhotoUrl?: string | null;
  areaName: string;
  changedArea: boolean;
  happenedAt?: Date;
}): Promise<void> {
  try {
    const happenedAt = input.happenedAt ?? new Date();
    const dateTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(happenedAt);

    const name = escapeHtml(input.name || "Cliente");
    const phone = escapeHtml(formatPhone(input.phone));
    const areaName = escapeHtml(input.areaName || "Área do cliente");
    const photoUrl = safePhotoUrl(input.profilePhotoUrl);
    const photoBlock = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="Foto do cliente" width="112" height="112" style="display:block;width:112px;height:112px;border-radius:999px;object-fit:cover;border:4px solid #f8c400;box-shadow:0 0 0 4px rgba(0,104,217,.28),0 12px 30px rgba(0,0,0,.35);margin:0 auto;" />`
      : `<div style="width:112px;height:112px;border-radius:999px;margin:0 auto;background:#101a2c;border:4px solid #f8c400;box-shadow:0 0 0 4px rgba(0,104,217,.28);color:#f8c400;font-size:42px;line-height:112px;text-align:center;font-weight:900;">H2</div>`;

    const title = input.changedArea ? "CLIENTE MUDOU DE ÁREA" : "CLIENTE ATIVO NO H2";
    const subject = input.changedArea ? `Cliente mudou de área - ${input.name || input.phone}` : `Cliente ativo no H2 - ${input.name || input.phone}`;
    const areaLabel = input.changedArea ? "NOVA ÁREA" : "ÁREA ATUAL";

    await sendMail({
      to: ADMIN_EMAIL,
      subject,
      html: `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#050914;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#050914;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#09111f;border:1px solid #22314d;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.45);">
            <tr>
              <td style="height:7px;background:#f8c400;font-size:0;line-height:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
                  <td width="34%" style="height:7px;background:#f8c400;">&nbsp;</td>
                  <td width="33%" style="height:7px;background:#0068d9;">&nbsp;</td>
                  <td width="33%" style="height:7px;background:#e3272e;">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:30px 24px 16px;background:#0b1424;">
                <div style="font-size:12px;letter-spacing:5px;color:#f8c400;font-weight:900;margin-bottom:10px;">H2 COLOMBIA</div>
                <div style="font-size:30px;line-height:1.12;font-weight:900;color:#ffffff;letter-spacing:.3px;">${escapeHtml(title)}</div>
                <div style="margin-top:10px;font-size:12px;letter-spacing:3px;color:#8fa8c7;font-weight:700;">AUDITORIA DE NAVEGAÇÃO</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px 8px;">${photoBlock}</td>
            </tr>
            <tr>
              <td style="padding:18px 24px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#0d1728;border:1px solid #233653;border-radius:18px;overflow:hidden;">
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #233653;">
                      <div style="font-size:11px;letter-spacing:1.7px;color:#7890b0;font-weight:800;text-transform:uppercase;">${escapeHtml(areaLabel)}</div>
                      <div style="margin-top:6px;font-size:23px;line-height:1.25;color:#ffffff;font-weight:900;">${areaName}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #233653;">
                      <div style="font-size:11px;letter-spacing:1.7px;color:#7890b0;font-weight:800;text-transform:uppercase;">Nome</div>
                      <div style="margin-top:6px;font-size:23px;line-height:1.25;color:#ffffff;font-weight:900;">${name}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #233653;">
                      <div style="font-size:11px;letter-spacing:1.7px;color:#7890b0;font-weight:800;text-transform:uppercase;">Telefone</div>
                      <div style="margin-top:6px;font-size:23px;line-height:1.25;color:#f8c400;font-weight:900;">${phone}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:11px;letter-spacing:1.7px;color:#7890b0;font-weight:800;text-transform:uppercase;">Data / Hora</div>
                      <div style="margin-top:6px;font-size:20px;line-height:1.35;color:#ffffff;font-weight:900;">${escapeHtml(dateTime)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px 24px;background:#070d18;border-top:1px solid #17243a;">
                <div style="font-size:13px;letter-spacing:4px;color:#f8c400;font-weight:900;">H2 COLOMBIA</div>
                <div style="margin-top:8px;font-size:11px;letter-spacing:2.5px;color:#8195b1;">SEMPRE CONECTADO COM VOCÊ</div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;"><tr>
                  <td style="width:38px;height:4px;background:#f8c400;font-size:0;">&nbsp;</td>
                  <td style="width:8px;font-size:0;">&nbsp;</td>
                  <td style="width:38px;height:4px;background:#0068d9;font-size:0;">&nbsp;</td>
                  <td style="width:8px;font-size:0;">&nbsp;</td>
                  <td style="width:38px;height:4px;background:#e3272e;font-size:0;">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
      `,
    });
  } catch (error) {
    console.warn("[customer-route-notification] Falha ao enviar e-mail:", error);
  }
}
