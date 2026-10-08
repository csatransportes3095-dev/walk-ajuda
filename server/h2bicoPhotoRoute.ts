import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { isAdminJwtValid } from "./_core/trpc";

export function registerH2BicoPhotoRoutes(app: Express) {
  app.get("/api/admin/h2bico/photo/:id", async (req, res) => {
    try {
      if (!isAdminJwtValid(req as any)) {
        res.status(403).json({ error: "Acesso administrativo inválido." });
        return;
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "ID inválido." });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Banco indisponível." });
        return;
      }

      const rows = await db.execute(sql`
        SELECT photoUrl
        FROM h2bico_records
        WHERE id=${id}
        LIMIT 1
      `);
      const row = (rows[0] as any[])[0];
      const photoUrl = String(row?.photoUrl || "").trim();
      if (!photoUrl) {
        res.status(404).json({ error: "Foto não encontrada." });
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const upstream = await fetch(photoUrl, {
          cache: "no-store",
          signal: controller.signal,
          headers: { "User-Agent": "H2BICO-Photo-Proxy/1.0" },
        });

        if (!upstream.ok) {
          res.status(502).json({ error: "Foto indisponível no armazenamento." });
          return;
        }

        const contentType = upstream.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          res.status(502).json({ error: "Arquivo armazenado não é uma imagem válida." });
          return;
        }

        const buffer = Buffer.from(await upstream.arrayBuffer());
        if (!buffer.length) {
          res.status(502).json({ error: "Imagem vazia." });
          return;
        }

        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", String(buffer.length));
        res.setHeader("Cache-Control", "private, max-age=300");
        res.status(200).send(buffer);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      console.error("[H2BICO] falha no proxy de foto:", error);
      res.status(500).json({ error: "Não foi possível carregar a foto." });
    }
  });
}
