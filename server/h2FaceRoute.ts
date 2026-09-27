import type { Express, Request, Response } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { getAdminJwtSecret } from "./adminJwt";
import { r2GetObjectBuffer, r2HeadObject, r2PutObject } from "./r2Storage";

const H2_FACE_KEYS = {
  detector: "system/h2-face/v1/detector.tflite",
  recognizer: "system/h2-face/v1/recognizer.tflite",
} as const;

type H2FaceModelKind = keyof typeof H2_FACE_KEYS;

function isModelKind(value: string): value is H2FaceModelKind {
  return value === "detector" || value === "recognizer";
}

function isTfliteModel(buffer: Buffer) {
  return buffer.length >= 8 &&
    buffer[4] === 0x54 &&
    buffer[5] === 0x46 &&
    buffer[6] === 0x4c &&
    buffer[7] === 0x33;
}

function isAdminRequest(req: Request) {
  try {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const token = cookies.admin_token;
    const secret = getAdminJwtSecret();
    if (!token || !secret) return false;
    const payload = jwt.verify(token, secret) as { role?: string };
    return payload.role === "admin";
  } catch {
    return false;
  }
}

function hasBootstrapToken(req: Request) {
  const configured = String(process.env.H2_FACE_BOOTSTRAP_TOKEN || "").trim();
  const provided = String(req.headers["x-h2-face-bootstrap-token"] || "").trim();
  if (!configured || !provided) return false;

  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function modelExists(kind: H2FaceModelKind) {
  try {
    const head = await r2HeadObject(H2_FACE_KEYS[kind]);
    return Number(head.contentLength || 0) > 0;
  } catch {
    return false;
  }
}

export function registerH2FaceRoutes(app: Express) {
  app.get("/api/h2-face/status", async (_req: Request, res: Response) => {
    const [detector, recognizer] = await Promise.all([
      modelExists("detector"),
      modelExists("recognizer"),
    ]);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ready: detector && recognizer,
      detector,
      recognizer,
      engine: "H2 Face",
      version: 1,
    });
  });

  app.get("/api/h2-face/model/:kind", async (req: Request, res: Response) => {
    const kind = String(req.params.kind || "");
    if (!isModelKind(kind)) {
      res.status(404).json({ error: "Componente não encontrado." });
      return;
    }

    try {
      const buffer = await r2GetObjectBuffer(H2_FACE_KEYS[kind]);
      if (!isTfliteModel(buffer)) {
        console.error(`[H2-FACE] modelo inválido no R2: ${kind}`);
        res.status(500).json({ error: "Componente H2 Face inválido." });
        return;
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("X-H2-Face-Version", "1");
      res.send(buffer);
    } catch (error) {
      console.error(`[H2-FACE] download ${kind}:`, error instanceof Error ? error.message : String(error));
      res.status(404).json({ error: "Motor H2 Face ainda não preparado." });
    }
  });

  const rawModel = express.raw({
    type: "application/octet-stream",
    limit: "15mb",
  });

  app.post("/api/h2-face/bootstrap/:kind", rawModel, async (req: Request, res: Response) => {
    if (!isAdminRequest(req) && !hasBootstrapToken(req)) {
      res.status(401).json({ error: "Não autorizado." });
      return;
    }

    const kind = String(req.params.kind || "");
    if (!isModelKind(kind)) {
      res.status(404).json({ error: "Componente não encontrado." });
      return;
    }

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (!isTfliteModel(body)) {
      res.status(400).json({ error: "Arquivo H2 Face inválido." });
      return;
    }

    try {
      await r2PutObject(H2_FACE_KEYS[kind], body, "application/octet-stream");
      console.log(`[H2-FACE] ${kind} salvo no R2 (${body.length} bytes)`);
      res.json({ success: true, kind, size: body.length });
    } catch (error) {
      console.error(`[H2-FACE] upload ${kind}:`, error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Não foi possível preparar o motor H2 Face." });
    }
  });
}
