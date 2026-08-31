import type { Express, Request } from "express";
import { sql } from "drizzle-orm";
import { parse as parseCookieHeader } from "cookie";
import jwt from "jsonwebtoken";
import { getDb } from "./db";
import { getAdminJwtSecret } from "./adminJwt";

type RafflePhotoRow = {
  number: number | string;
  customerProfilePhotoUrl: string | null;
};

type AdminPayload = { sub?: string; role?: string };

function isAuthenticatedAdmin(req: Request): boolean {
  try {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const token = cookies.admin_token;
    const secret = getAdminJwtSecret();
    if (!token || !secret) return false;
    const payload = jwt.verify(token, secret) as AdminPayload;
    return payload.role === "admin";
  } catch {
    return false;
  }
}

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
 * - fotos do mapa vêm sempre do cadastro principal do cliente;
 * - um sorteio já marcado como realizado pode ser reaberto pelo ADM sem tocar
 *   em nenhuma entrada/número, apenas limpando o resultado anterior.
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

  app.get("/api/raffle-winner-photo/latest", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Banco indisponível." }); return; }
      const result = await db.execute(sql`
        SELECT winnerNumber, winnerProfilePhotoUrl
        FROM raffles
        WHERE status = 'drawn'
        ORDER BY drawnAt DESC, id DESC
        LIMIT 1
      `);
      const row = ((result[0] as unknown as Array<{ winnerNumber: number | string | null; winnerProfilePhotoUrl: string | null }>) || [])[0];
      res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
      res.json({
        winnerNumber: row?.winnerNumber == null ? null : Number(row.winnerNumber),
        winnerProfilePhotoUrl:
          row?.winnerProfilePhotoUrl && row.winnerProfilePhotoUrl !== "NULL"
            ? String(row.winnerProfilePhotoUrl)
            : null,
      });
    } catch (error) {
      console.error("[RaffleIntegrity] erro ao carregar foto do ganhador:", error);
      res.status(500).json({ error: "Não foi possível carregar a foto do ganhador." });
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

  app.get("/api/admin/raffle/reopen-status", async (req, res) => {
    if (!isAuthenticatedAdmin(req)) {
      res.status(401).json({ error: "Não autorizado." });
      return;
    }
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Banco indisponível." }); return; }
      const result = await db.execute(sql`
        SELECT id, title, status, winnerNumber, winnerName
        FROM raffles
        ORDER BY id DESC
        LIMIT 1
      `);
      const row = ((result[0] as unknown as Array<{
        id: number | string;
        title: string;
        status: string;
        winnerNumber: number | string | null;
        winnerName: string | null;
      }>) || [])[0];
      res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
      if (!row) {
        res.json({ canReopen: false, raffle: null });
        return;
      }
      res.json({
        canReopen: row.status === "drawn",
        raffle: {
          id: Number(row.id),
          title: row.title,
          status: row.status,
          winnerNumber: row.winnerNumber == null ? null : Number(row.winnerNumber),
          winnerName: row.winnerName,
        },
      });
    } catch (error) {
      console.error("[RaffleIntegrity] erro ao verificar reabertura:", error);
      res.status(500).json({ error: "Não foi possível verificar o sorteio." });
    }
  });

  app.post("/api/admin/raffle/reopen", async (req, res) => {
    if (!isAuthenticatedAdmin(req)) {
      res.status(401).json({ error: "Não autorizado." });
      return;
    }
    const raffleId = Number(req.body?.raffleId);
    if (!Number.isInteger(raffleId) || raffleId <= 0) {
      res.status(400).json({ error: "Sorteio inválido." });
      return;
    }
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Banco indisponível." }); return; }

      const check = await db.execute(sql`
        SELECT id, status FROM raffles WHERE id = ${raffleId} LIMIT 1
      `);
      const raffle = ((check[0] as unknown as Array<{ id: number | string; status: string }>) || [])[0];
      if (!raffle) {
        res.status(404).json({ error: "Sorteio não encontrado." });
        return;
      }
      if (raffle.status !== "drawn") {
        res.status(409).json({ error: "Este sorteio não está marcado como realizado." });
        return;
      }

      const countResult = await db.execute(sql`
        SELECT COUNT(*) AS total FROM raffleEntries WHERE raffleId = ${raffleId}
      `);
      const totalEntries = Number(((countResult[0] as unknown as Array<{ total: number | string }>) || [])[0]?.total || 0);
      if (totalEntries === 0) {
        res.status(409).json({ error: "Sorteio sem participantes; reabertura cancelada." });
        return;
      }

      // IMPORTANTE: nenhuma linha de raffleEntries é alterada ou removida.
      // Apenas o resultado anterior é limpo e o mesmo sorteio volta para 'open'.
      await db.execute(sql`
        UPDATE raffles
        SET
          status = 'open',
          winnerNumber = NULL,
          winnerName = NULL,
          winnerPhone = NULL,
          winnerProfilePhotoUrl = NULL,
          drawnAt = NULL
        WHERE id = ${raffleId} AND status = 'drawn'
      `);

      res.json({ success: true, raffleId, preservedEntries: totalEntries });
    } catch (error) {
      console.error("[RaffleIntegrity] erro ao reabrir sorteio:", error);
      res.status(500).json({ error: "Não foi possível reabrir o sorteio." });
    }
  });
}
