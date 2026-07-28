// storageProxy v2 - proxy real com Range requests para streaming de vídeo
import type { Express } from "express";
import { Readable } from "stream";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      // Para vídeos e áudios: fazer proxy real com suporte a Range requests
      // Isso é necessário para streaming funcionar em browsers móveis (Android/iOS)
      const isMediaFile = /\.(mp4|webm|ogg|mov|avi|mkv|mp3|wav|m4a|aac)(\?|$)/i.test(key);

      if (isMediaFile) {
        // Montar headers para repassar ao CloudFront
        const upstreamHeaders: Record<string, string> = {
          "Accept": (req.headers["accept"] as string) || "*/*",
        };

        // Repassar Range header se presente (essencial para streaming)
        if (req.headers["range"]) {
          upstreamHeaders["Range"] = req.headers["range"] as string;
        }

        const upstream = await fetch(url, { headers: upstreamHeaders });

        // Repassar status (200 ou 206 Partial Content)
        res.status(upstream.status);

        // Repassar headers relevantes
        const headersToForward = [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "last-modified",
          "etag",
        ];
        for (const h of headersToForward) {
          const val = upstream.headers.get(h);
          if (val) res.set(h, val);
        }

        // Garantir que accept-ranges está presente para habilitar streaming
        if (!upstream.headers.get("accept-ranges")) {
          res.set("Accept-Ranges", "bytes");
        }

        res.set("Cache-Control", "no-store");

        // Stream do body para o cliente
        if (upstream.body) {
          const nodeReadable = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
          req.on("close", () => nodeReadable.destroy());
          nodeReadable.pipe(res);
        } else {
          res.end();
        }
        return;
      }

      // Para outros arquivos: redirect normal
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
