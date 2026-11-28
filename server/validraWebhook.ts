import express, { type Express } from "express";
import { enqueueValidraEvent } from "./validraEventWorker";
import { parseValidraWebhook, validraWebhookSignatureValid } from "./validraPay";

/** Durable signed event inbox. A stored event never creates an order by itself. */
export function registerValidraWebhook(app: Express) {
  app.post("/webhooks/validrapay", express.raw({ type: "application/json", limit: "256kb", inflate: false }), async (req, res) => {
    const secrets = [process.env.VALIDRA_WEBHOOK_SECRET || "", process.env.VALIDRA_WEBHOOK_PREVIOUS_SECRET || ""];
    if (!Buffer.isBuffer(req.body) || !validraWebhookSignatureValid(req.body, req.get("Validra-Signature"), secrets)) return res.sendStatus(401);
    try {
      const event = parseValidraWebhook(req.body);
      await enqueueValidraEvent({
        event_id:event.id,event_type:event.type,charge_id:event.data.charge?.id||null,
        external_id:event.data.charge?.external_id||null,occurred_at:event.created_at,
      });
      return res.sendStatus(204);
    } catch {
      // No acknowledgement if the inbox could not persist the event.
      return res.sendStatus(503);
    }
  });
}
