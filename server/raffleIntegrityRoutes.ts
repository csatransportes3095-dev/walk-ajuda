import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

type RafflePhotoRow = {
  number: number | string;
  customerProfilePhotoUrl: string | null;
};

/**
 * Regras de integridade do sorteio.
 *
 * 1. Um número confirmado nunca pode voltar a ficar disponível pelo painel/API.
 * 2. A foto exibida no mapa é sempre lida do cadastro principal do cliente,
 *    usando o telefone que já está gravado na entrada do sorteio.
 *
 * A rota de fotos não devolve nome, telefone, CPF ou qualquer outro dado do cliente.
 */
export function registerRaffleIntegrityRoutes(app: Express): void {
  // Bloqueio no servidor: mesmo uma aba antiga do painel que ainda mostre o botão
  // "Liberar" não consegue apagar a entrada já confirmada.
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

  // Mapa público de número -> foto. É usado somente para reconstruir visualmente
  // os cards do sorteio; nenhum identificador pessoal é retornado.
  app.get("/api/raffle-entry-photos/:raffleId", async (req, res) => {
    const raffleId = Number(req.params.raffleId);
    if (!Number.isInteger(raffleId) || raffleId <= 0) {
      res.status(400).json({ error: "Sorteio inválido." });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Banco indisponível." });
        return;
      }

      const result = await db.execute(sql`
        SELECT
          re.number AS number,
          c.profilePhotoUrl AS customerProfilePhotoUrl
        FROM raffleEntries re
        LEFT JOIN customers c
          ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(re.customerPhone, '[^0-9]', '')
        WHERE re.raffleId = ${raffleId}
        ORDER BY re.number ASC
      `);

      const rows = (result[0] as unknown as RafflePhotoRow[]) || [];
      res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
      res.json({
        raffleId,
        entries: rows.map((row) => ({
          number: Number(row.number),
          customerProfilePhotoUrl:
            row.customerProfilePhotoUrl && row.customerProfilePhotoUrl !== "NULL"
              ? String(row.customerProfilePhotoUrl)
              : null,
        })),
      });
    } catch (error) {
      console.error("[RaffleIntegrity] erro ao carregar fotos do mapa:", error);
      res.status(500).json({ error: "Não foi possível carregar as fotos do sorteio." });
    }
  });
}
