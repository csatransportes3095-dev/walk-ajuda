import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

type RafflePhotoRow = {
  number: number | string;
  customerProfilePhotoUrl: string | null;
};

async function loadRafflePhotos(raffleId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`
    SELECT re.number AS number, c.profilePhotoUrl AS customerProfilePhotoUrl
    FROM raffleEntries re
    LEFT JOIN customers c
      ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(re.customerPhone, '[^0-9]', '')
    WHERE re.raffleId = ${raffleId}
    ORDER BY re.number ASC
  `);
  const rows = (result[0] as unknown as RafflePhotoRow[]) || [];
  return rows.map((row) => ({
    number: Number(row.number),
    customerProfilePhotoUrl:
      row.customerProfilePhotoUrl && row.customerProfilePhotoUrl !== "NULL"
        ? String(row.customerProfilePhotoUrl)
        : null,
  }));
}

/**
 * Regras de integridade do sorteio:
 * - número confirmado nunca pode ser liberado;
 * - fotos do mapa vêm sempre do cadastro principal do cliente.
 */
export function registerRaffleIntegrityRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (
      req.method === "POST" &&
      req.originalUrl.includes("/api/trpc/") &&
      req.originalUrl.includes("raffles.removeEntry")
    ) {
      res.status(403).json({
        error: "Número confirmado não pode ser liberado ou alterado.",
        code: "RAFFLE_NUMBER_LOCKED",
      });
      return;
    }
    next();
  });

  app.get("/api/raffle-entry-photos/active", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Banco indisponível." }); return; }
      const result = await db.execute(sql`
        SELECT id FROM raffles WHERE status = 'open' ORDER BY id DESC LIMIT 1
      `);
      const row = ((result[0] as unknown as Array<{ id: number | string }>) || [])[0];
      if (!row) { res.json({ raffleId: null, entries: [] }); return; }
      const raffleId = Number(row.id);
      const entries = await loadRafflePhotos(raffleId);
      res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
      res.json({ raffleId, entries: entries || [] });
    } catch (error) {
      console.error("[RaffleIntegrity] erro ao carregar fotos do sorteio ativo:", error);
      res.status(500).json({ error: "Não foi possível carregar as fotos do sorteio." });
    }
  });

  app.get("/api/raffle-entry-photos/:raffleId", async (req, res) => {
    const raffleId = Number(req.params.raffleId);
    if (!Number.isInteger(raffleId) || raffleId <= 0) {
      res.status(400).json({ error: "Sorteio inválido." });
      return;
    }
    try {
      const entries = await loadRafflePhotos(raffleId);
      if (!entries) { res.status(503).json({ error: "Banco indisponível." }); return; }
      res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
      res.json({ raffleId, entries });
    } catch (error) {
      console.error("[RaffleIntegrity] erro ao carregar fotos do mapa:", error);
      res.status(500).json({ error: "Não foi possível carregar as fotos do sorteio." });
    }
  });
}
