import express, { type Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { parseValidraWebhook, validraWebhookSignatureValid } from "./validraPay";

/** Durable signed event inbox. A stored event never creates an order by itself. */
export function registerValidraWebhook(app: Express) {
  app.post("/webhooks/validrapay", express.raw({ type: "application/json", limit: "256kb", inflate: false }), async (req, res) => {
    const secrets = [process.env.VALIDRA_WEBHOOK_SECRET || "", process.env.VALIDRA_WEBHOOK_PREVIOUS_SECRET || ""];
    if (!Buffer.isBuffer(req.body) || !validraWebhookSignatureValid(req.body, req.get("Validra-Signature"), secrets)) return res.sendStatus(401);
    try {
      const event = parseValidraWebhook(req.body);
      const db = await getDb();
      if (!db) return res.sendStatus(503);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_webhook_events (
        event_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL, charge_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
        external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
        occurred_at VARCHAR(40) NOT NULL, received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
      await db.execute(sql`INSERT INTO validra_webhook_events (event_id, event_type, charge_id, external_id, occurred_at)
        VALUES (${event.id}, ${event.type}, ${event.data.charge?.id || null}, ${event.data.charge?.external_id || null}, ${event.created_at})
        ON DUPLICATE KEY UPDATE event_id = event_id`);
      return res.sendStatus(204);
    } catch {
      // No acknowledgement if the inbox could not persist the event.
      return res.sendStatus(503);
    }
  });
}
