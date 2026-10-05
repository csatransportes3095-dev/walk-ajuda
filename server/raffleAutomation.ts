import { randomInt } from "crypto";
import nodemailer from "nodemailer";
import { sql } from "drizzle-orm";
import { getCustomerByPhoneNormalized, getDb, getRaffleEntries, getSetting } from "./db";

let infrastructurePromise: Promise<void> | null = null;
let workerStarted = false;

export async function ensureRaffleAutomationInfrastructure(): Promise<void> {
  if (!infrastructurePromise) {
    infrastructurePromise = (async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const columns = [
        "drawMode ENUM('manual','automatic') NOT NULL DEFAULT 'manual'",
        "scheduledDrawAt TIMESTAMP NULL",
        "drawEligibility ENUM('all','paid') NOT NULL DEFAULT 'paid'",
        "autoDrawState ENUM('idle','scheduled','processing','completed','failed') NOT NULL DEFAULT 'idle'",
        "autoDrawError TEXT NULL",
        "winnerEmail VARCHAR(320) NULL",
        "winnerNotifiedAt TIMESTAMP NULL",
        "adminNotifiedAt TIMESTAMP NULL",
        "prizeStatus ENUM('awaiting_contact','pix_requested','pix_received','paid') NULL",
        "pixRequestedAt TIMESTAMP NULL",
        "prizePaidAt TIMESTAMP NULL",
      ];
      for (const definition of columns) {
        try {
          await db.execute(sql.raw(`ALTER TABLE raffles ADD COLUMN IF NOT EXISTS ${definition}`));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/duplicate column|already exists/i.test(message)) throw error;
        }
      }
      await db.execute(sql`
        UPDATE raffles
        SET autoDrawState = 'scheduled'
        WHERE status = 'open'
          AND drawMode = 'automatic'
          AND scheduledDrawAt IS NOT NULL
          AND autoDrawState = 'idle'
      `);
    })().catch((error) => {
      infrastructurePromise = null;
      throw error;
    });
  }
  await infrastructurePromise;
}

export async function configureRaffleAutomation(
  raffleId: number,
  input: { drawMode?: "manual" | "automatic"; scheduledDrawAt?: Date | null; drawEligibility?: "all" | "paid" },
): Promise<void> {
  await ensureRaffleAutomationInfrastructure();
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rowsResult = await db.execute(sql`SELECT drawMode, scheduledDrawAt, drawEligibility, status FROM raffles WHERE id = ${raffleId} LIMIT 1`);
  const current = ((rowsResult as any)[0] || [])[0] as any;
  if (!current) throw new Error("Sorteio não encontrado");
  if (current.status === "drawn") throw new Error("Sorteio já realizado");

  const drawMode = input.drawMode ?? current.drawMode ?? "manual";
  const scheduledDrawAt = input.scheduledDrawAt !== undefined ? input.scheduledDrawAt : current.scheduledDrawAt;
  const drawEligibility = input.drawEligibility ?? current.drawEligibility ?? "paid";

  if (drawMode === "automatic" && !scheduledDrawAt) {
    throw new Error("Informe a data e a hora do sorteio automático.");
  }

  await db.execute(sql`
    UPDATE raffles
    SET drawMode = ${drawMode},
        scheduledDrawAt = ${drawMode === "automatic" ? scheduledDrawAt : null},
        drawEligibility = ${drawEligibility},
        autoDrawState = ${drawMode === "automatic" ? "scheduled" : "idle"},
        autoDrawError = NULL
    WHERE id = ${raffleId}
  `);
}

function formatSaoPauloDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] || char));
}

async function sendWinnerNotifications(data: {
  raffleId: number;
  raffleTitle: string;
  winnerName: string;
  winnerPhone: string;
  winnerEmail: string | null;
  winnerNumber: number;
  winnerPhoto: string | null;
  drawnAt: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const password = process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || "";
  if (!password) {
    console.warn("[RaffleAuto] SMTP não configurado; sorteio foi concluído sem e-mail.");
    return;
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    auth: { user: "h2@h2colombiano.com", pass: password },
  });
  const when = formatSaoPauloDateTime(data.drawnAt);
  const photo = data.winnerPhoto
    ? `<div style="text-align:center;margin:18px 0"><img src="${escapeHtml(data.winnerPhoto)}" alt="Foto do ganhador" style="width:130px;height:130px;border-radius:999px;object-fit:cover;border:4px solid #facc15"></div>`
    : "";

  let winnerSent = false;
  if (data.winnerEmail) {
    try {
      await transporter.sendMail({
        from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
        to: data.winnerEmail,
        subject: `🏆 Você ganhou o sorteio H2 Colombiano — Nº ${data.winnerNumber}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#090914;color:#fff;border-radius:16px;overflow:hidden">
            <div style="padding:26px;text-align:center;background:linear-gradient(135deg,#4c1d95,#a16207)">
              <h1 style="margin:0;color:#fff">🏆 PARABÉNS!</h1>
              <p style="margin:8px 0 0;color:#fde68a">Você foi o ganhador do sorteio H2 Colombiano</p>
            </div>
            <div style="padding:26px;text-align:center">
              ${photo}
              <h2 style="margin:6px 0">${escapeHtml(data.winnerName)}</h2>
              <div style="font-size:42px;font-weight:900;color:#facc15">#${data.winnerNumber}</div>
              <p style="color:#d1d5db"><strong>Sorteio:</strong> ${escapeHtml(data.raffleTitle)}</p>
              <p style="color:#d1d5db"><strong>Data/Hora:</strong> ${escapeHtml(when)}</p>
              <p style="margin-top:20px;color:#e5e7eb">A equipe H2 entrará em contato pelo WhatsApp para solicitar sua chave PIX e realizar o pagamento do prêmio.</p>
            </div>
          </div>`,
      });
      winnerSent = true;
    } catch (error) {
      console.warn("[RaffleAuto] falha no e-mail do ganhador:", error);
    }
  }

  const adminEmail = await getSetting("contact_email") || "h2@h2colombiano.com";
  let adminSent = false;
  try {
    await transporter.sendMail({
      from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
      to: adminEmail,
      subject: `🏆 Sorteio realizado — ${data.winnerName} ganhou o nº ${data.winnerNumber}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">
          <h2>🏆 Sorteio realizado com sucesso</h2>
          ${photo}
          <p><strong>Sorteio:</strong> ${escapeHtml(data.raffleTitle)}</p>
          <p><strong>Ganhador:</strong> ${escapeHtml(data.winnerName)}</p>
          <p><strong>Número:</strong> #${data.winnerNumber}</p>
          <p><strong>Telefone:</strong> ${escapeHtml(data.winnerPhone)}</p>
          <p><strong>E-mail:</strong> ${escapeHtml(data.winnerEmail || "Não cadastrado")}</p>
          <p><strong>Data/Hora:</strong> ${escapeHtml(when)} — America/Sao_Paulo</p>
          <p><strong>Próximo passo:</strong> contatar o ganhador manualmente pelo WhatsApp e solicitar a chave PIX.</p>
          <p><a href="https://h2colombiano.com/admin/raffles">Abrir painel de sorteios</a></p>
        </div>`,
    });
    adminSent = true;
  } catch (error) {
    console.warn("[RaffleAuto] falha no e-mail do ADM:", error);
  }

  if (winnerSent) {
    await db.execute(sql`UPDATE raffles SET winnerNotifiedAt = UTC_TIMESTAMP() WHERE id = ${data.raffleId}`);
  }
  if (adminSent) {
    await db.execute(sql`UPDATE raffles SET adminNotifiedAt = UTC_TIMESTAMP() WHERE id = ${data.raffleId}`);
  }
}

export async function performRaffleDraw(
  raffleId: number,
  source: "manual" | "automatic",
): Promise<{ success: boolean; error?: string; winner?: { number: number; name: string; phone: string; email: string | null; photoUrl: string | null; drawnAt: Date } }> {
  await ensureRaffleAutomationInfrastructure();
  const db = await getDb();
  if (!db) return { success: false, error: "Banco indisponível" };

  const currentResult = await db.execute(sql`SELECT * FROM raffles WHERE id = ${raffleId} LIMIT 1`);
  const raffle = ((currentResult as any)[0] || [])[0] as any;
  if (!raffle) return { success: false, error: "Sorteio não encontrado" };
  if (raffle.status === "drawn") {
    return {
      success: true,
      winner: raffle.winnerNumber ? {
        number: Number(raffle.winnerNumber),
        name: String(raffle.winnerName || ""),
        phone: String(raffle.winnerPhone || ""),
        email: raffle.winnerEmail || null,
        photoUrl: raffle.winnerProfilePhotoUrl || null,
        drawnAt: new Date(raffle.drawnAt || Date.now()),
      } : undefined,
    };
  }

  const lockResult = source === "automatic"
    ? await db.execute(sql`
        UPDATE raffles SET autoDrawState = 'processing', autoDrawError = NULL
        WHERE id = ${raffleId}
          AND status = 'open'
          AND drawMode = 'automatic'
          AND scheduledDrawAt IS NOT NULL
          AND scheduledDrawAt <= UTC_TIMESTAMP()
          AND autoDrawState IN ('scheduled','idle')
      `)
    : await db.execute(sql`
        UPDATE raffles SET autoDrawState = 'processing', autoDrawError = NULL
        WHERE id = ${raffleId}
          AND status = 'open'
          AND autoDrawState <> 'processing'
      `);
  const affected = Number((lockResult as any)[0]?.affectedRows || 0);
  if (affected !== 1) return { success: false, error: "Sorteio indisponível, já processado ou em processamento." };

  try {
    const entries = await getRaffleEntries(raffleId);
    const eligibility = source === "automatic" ? String(raffle.drawEligibility || "paid") : "all";
    const eligible = eligibility === "paid" ? entries.filter((entry: any) => entry.paymentStatus === "paid") : entries;
    if (!eligible.length) {
      await db.execute(sql`
        UPDATE raffles
        SET autoDrawState = ${source === "automatic" ? "failed" : "idle"},
            autoDrawError = ${eligibility === "paid" ? "Nenhum número pago elegível no horário programado." : "Nenhum participante elegível."}
        WHERE id = ${raffleId}
      `);
      return { success: false, error: eligibility === "paid" ? "Nenhum número pago elegível." : "Nenhum participante." };
    }

    const winner = eligible[randomInt(0, eligible.length)] as any;
    const customer = await getCustomerByPhoneNormalized(winner.customerPhone);
    const drawnAt = new Date();
    const winnerEmail = customer?.email ? String(customer.email).trim() : null;
    const photoUrl = customer?.profilePhotoUrl || winner.profilePhotoUrl || null;

    await db.execute(sql`
      UPDATE raffles
      SET status = 'drawn',
          winnerNumber = ${winner.number},
          winnerName = ${winner.customerName},
          winnerPhone = ${winner.customerPhone},
          winnerEmail = ${winnerEmail},
          winnerProfilePhotoUrl = ${photoUrl},
          drawnAt = ${drawnAt},
          autoDrawState = 'completed',
          autoDrawError = NULL,
          prizeStatus = 'awaiting_contact'
      WHERE id = ${raffleId} AND autoDrawState = 'processing'
    `);

    void sendWinnerNotifications({
      raffleId,
      raffleTitle: String(raffle.title || "Sorteio H2 Colombiano"),
      winnerName: String(winner.customerName),
      winnerPhone: String(winner.customerPhone),
      winnerEmail,
      winnerNumber: Number(winner.number),
      winnerPhoto: photoUrl,
      drawnAt,
    }).catch((error) => console.warn("[RaffleAuto] notificação pós-sorteio:", error));

    return {
      success: true,
      winner: {
        number: Number(winner.number),
        name: String(winner.customerName),
        phone: String(winner.customerPhone),
        email: winnerEmail,
        photoUrl,
        drawnAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.execute(sql`
      UPDATE raffles
      SET autoDrawState = ${source === "automatic" ? "failed" : "idle"},
          autoDrawError = ${message.slice(0, 1000)}
      WHERE id = ${raffleId} AND autoDrawState = 'processing'
    `);
    return { success: false, error: message };
  }
}

export async function updateRafflePrizeStatus(
  raffleId: number,
  status: "awaiting_contact" | "pix_requested" | "pix_received" | "paid",
): Promise<void> {
  await ensureRaffleAutomationInfrastructure();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.execute(sql`
    UPDATE raffles
    SET prizeStatus = ${status},
        pixRequestedAt = CASE WHEN ${status} = 'pix_requested' THEN UTC_TIMESTAMP() ELSE pixRequestedAt END,
        prizePaidAt = CASE WHEN ${status} = 'paid' THEN UTC_TIMESTAMP() ELSE prizePaidAt END
    WHERE id = ${raffleId} AND status = 'drawn'
  `);
}

export async function processDueAutomaticRaffles(): Promise<void> {
  await ensureRaffleAutomationInfrastructure();
  const db = await getDb();
  if (!db) return;
  const result = await db.execute(sql`
    SELECT id
    FROM raffles
    WHERE status = 'open'
      AND drawMode = 'automatic'
      AND scheduledDrawAt IS NOT NULL
      AND scheduledDrawAt <= UTC_TIMESTAMP()
      AND autoDrawState IN ('scheduled','idle')
    ORDER BY scheduledDrawAt ASC
    LIMIT 10
  `);
  const rows = ((result as any)[0] || []) as Array<{ id: number }>;
  for (const row of rows) {
    const outcome = await performRaffleDraw(Number(row.id), "automatic");
    if (!outcome.success) console.warn(`[RaffleAuto] sorteio #${row.id}: ${outcome.error}`);
  }
}

export function startRaffleAutoDrawWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  const run = () => void processDueAutomaticRaffles().catch((error) => console.error("[RaffleAuto] worker:", error));
  run();
  const timer = setInterval(run, 15_000);
  timer.unref?.();
}
