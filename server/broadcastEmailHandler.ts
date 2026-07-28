/**
 * Heartbeat handler: processa 1 e-mail da fila por disparo.
 * Montado em /api/scheduled/broadcastEmail no index.ts.
 */
import type { Request, Response } from "express";
import { sendMail } from "./_core/mailer";
import { sdk } from "./_core/sdk";
import {
  getBroadcastByTaskUid,
  getNextPendingQueueItem,
  markQueueItemSent,
  markQueueItemFailed,
  countBroadcastQueueStatus,
  updateBroadcastProgress,
  markBroadcastSent,
  markBroadcastCancelled,
  updateBroadcastCronTaskUid,
} from "./db";
import { deleteHeartbeatJob } from "./_core/heartbeat";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";

export async function broadcastEmailHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    // Buscar o broadcast pelo taskUid
    const broadcast = await getBroadcastByTaskUid(user.taskUid);
    if (!broadcast) {
      return res.json({ ok: true, skipped: "orphan" });
    }

    // Se cancelado, parar
    if (broadcast.status === "cancelled") {
      return res.json({ ok: true, skipped: "cancelled" });
    }

    // Buscar próximo item pendente
    const item = await getNextPendingQueueItem(broadcast.id);
    if (!item) {
      // Fila vazia: finalizar
      const counts = await countBroadcastQueueStatus(broadcast.id);
      await updateBroadcastProgress(broadcast.id, counts.sent, counts.failed);
      await markBroadcastSent(broadcast.id, counts.sent + counts.failed);
      // Deletar o cron
      try {
        const sessionCookie = parseCookie(req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        await deleteHeartbeatJob(user.taskUid, sessionCookie);
      } catch { /* ignora erro ao deletar cron */ }
      await updateBroadcastCronTaskUid(broadcast.id, null);
      return res.json({ ok: true, done: true });
    }

    // Enviar e-mail para este item
    const typeLabel: Record<string, string> = {
      text: "Mensagem",
      promo: "🎉 Promoção",
      link: "🔗 Link",
      banner: "🖼️ Banner",
      group_invite: "👥 Convite para Grupo",
    };
    const label = typeLabel[broadcast.messageType] || "Mensagem";

    let extra = "";
    if (broadcast.linkUrl) {
      extra = `<div style="margin-top:16px;text-align:center">
        <a href="${broadcast.linkUrl}" style="background:#f59e0b;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">
          ${broadcast.linkLabel || "Acessar agora"}
        </a></div>`;
    }

    let imageHtml = "";
    if (broadcast.imageUrl) {
      const imgSrc = broadcast.imageUrl.startsWith("/manus-storage/")
        ? `https://walkajuda.com${broadcast.imageUrl}`
        : broadcast.imageUrl;
      imageHtml = `<div style="margin-top:20px;text-align:center"><img src="${imgSrc}" alt="Imagem" style="max-width:100%;border-radius:10px;border:1px solid #333" /></div>`;
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a1a;color:#fff;border-radius:12px;overflow:hidden">
        <div style="background:#1a1a2e;padding:24px;text-align:center">
          <h2 style="color:#f59e0b;margin:0;font-size:22px">${label}</h2>
        </div>
        <div style="padding:24px">
          <p style="font-size:16px;line-height:1.6;white-space:pre-wrap;color:#e5e7eb">${broadcast.message}</p>
          ${extra}
          ${imageHtml}
        </div>
        <div style="background:#1a1a2e;padding:16px;text-align:center">
          <p style="color:#6b7280;font-size:12px;margin:0">Walk Ajuda — walkajuda.com</p>
        </div>
      </div>`;

    const subject = broadcast.title || "Mensagem da Walk Ajuda";

    try {
      await sendMail({
        from: '"Walk Ajuda" <walkajuda@walkajuda.com>',
        to: item.recipientEmail,
        subject,
        html,
      });
      await markQueueItemSent(item.id);
    } catch (err) {
      await markQueueItemFailed(item.id, String(err));
    }

    // Atualizar contadores no broadcast
    const counts = await countBroadcastQueueStatus(broadcast.id);
    await updateBroadcastProgress(broadcast.id, counts.sent, counts.failed);

    return res.json({ ok: true, processed: item.recipientEmail });
  } catch (err) {
    console.error("[broadcastEmailHandler] Error:", err);
    return res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}
