import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Express, Request } from "express";
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { siteAccessEntries, siteAccessChallenges, siteAccessRateLimits } from "./siteAccessSchema";
import { sendMailDirect } from "./_core/sendMailDirect";

const COOKIE = "h2_site_auth";
const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export function isSiteAccessEmail(email: string): boolean {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isSameOriginSiteRequest(req: Pick<Request, "headers">): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host || typeof origin !== "string") return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:"))
      && url.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}

function siteSecret(): string {
  const secret = process.env.H2_SITE_ACCESS_SECRET || "";
  if (secret.length < 32) throw new Error("H2_SITE_ACCESS_SECRET must be configured securely");
  return secret;
}

function keyedHash(value: string): string {
  return createHmac("sha256", siteSecret()).update(value).digest("hex");
}

async function getAuthorizedPerson(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [person] = await db.select().from(siteAccessEntries)
    .where(eq(siteAccessEntries.email, email)).limit(1);
  return person?.status === "active" &&
    (!person.expiresAt || person.expiresAt.getTime() > Date.now()) ? person : null;
}

/** Atomic MySQL counter. Resists multi-instance requests without in-memory rate-limit state. */
async function limit(key: string, max: number, minutes = 15): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const limitKey = keyedHash("rate:" + key);
  const now = Date.now(), cutoff = now - minutes * 60_000;
  await db.execute(sql`
    INSERT INTO siteAccessRateLimits (limitKey, windowStartedAt, hits)
    VALUES (${limitKey}, ${now}, 1)
    ON DUPLICATE KEY UPDATE
      hits = IF(windowStartedAt < ${cutoff}, 1, hits + 1),
      windowStartedAt = IF(windowStartedAt < ${cutoff}, ${now}, windowStartedAt)
  `);
  const [row] = await db.select({ hits: siteAccessRateLimits.hits })
    .from(siteAccessRateLimits).where(eq(siteAccessRateLimits.limitKey, limitKey)).limit(1);
  return !!row && row.hits <= max;
}

export async function authorizedSiteVisitor(req: Request): Promise<boolean> {
  const token = parseCookieHeader(req.headers.cookie || "")[COOKIE];
  if (!token) return false;
  let payload: {sub?: string; kind?: string; v?: number};
  try {
    payload = jwt.verify(token, siteSecret(), { algorithms: ["HS256"] }) as typeof payload;
  } catch { return false; }
  if (payload.kind !== "site" || !payload.sub || !Number.isSafeInteger(payload.v)) return false;
  const person = await getAuthorizedPerson(payload.sub);
  return !!person && person.sessionVersion === payload.v;
}

function noStore(res: import("express").Response) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
}

function wrongCode(res: import("express").Response) {
  return res.status(401).json({ error: "Código inválido ou expirado." });
}

export function registerSiteIdentity(app: Express): void {
  app.post("/api/site-access/request", async (req, res) => {
    noStore(res);
    if (!isSameOriginSiteRequest(req)) return res.status(403).json({ error: "Origem não autorizada." });
    const email = normalizeEmail(req.body?.email);
    const generic = () => res.json({ok:true,message:"Se o e-mail estiver autorizado, você receberá um código."});
    if (!isSiteAccessEmail(email)) return generic();
    try {
      const ip = String(req.ip || req.socket.remoteAddress || "unknown");
      const byIp = await limit("request-ip:" + ip, 15);
      const byEmail = await limit("request-email:" + email, 3);
      if (!byIp || !byEmail) return generic();
      const person = await getAuthorizedPerson(email);
      if (!person) return generic();
      const code = String(randomInt(100000, 1000000));
      const codeHash = keyedHash("otp:" + email + ":" + code);
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);
      await db.insert(siteAccessChallenges).values({
        email, codeHash, attempts: 0, expiresAt, requestedAt: now,
      }).onDuplicateKeyUpdate({set:{codeHash, attempts:0, expiresAt, requestedAt:now}});
      // The existing direct sender retries via SMTP on Resend quota/provider failure.
      // Await acceptance by a channel; never grant access or report success on failure.
      await sendMailDirect({
        to: email,
        subject: "H2 Colombiano - Código de acesso",
        text: "Seu código de acesso é: " + code + ". Válido por 10 minutos. Não compartilhe.",
        html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">'
          + '<h2>H2 Colombiano — Código de acesso</h2>'
          + '<p>Seu código para acessar o site H2 Colombiano:</p>'
          + '<p style="font-size:32px;font-weight:bold;letter-spacing:6px">' + code + '</p>'
          + '<p>Válido por 10 minutos. Não compartilhe este código.</p>'
          + '<p>Se você não solicitou o acesso, ignore este e-mail.</p></div>',
      });
      return generic();
    } catch (error) {
      console.error("[SiteAccess] Falha ao solicitar acesso:", error instanceof Error ? error.message : String(error));
      return res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  });

  app.post("/api/site-access/verify", async (req, res) => {
    noStore(res);
    if (!isSameOriginSiteRequest(req)) return res.status(403).json({ error: "Origem não autorizada." });
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!isSiteAccessEmail(email) || !/^\d{6}$/.test(code)) return wrongCode(res);
    try {
      const ip = String(req.ip || req.socket.remoteAddress || "unknown");
      const byIp = await limit("verify-ip:" + ip, 25);
      const byEmail = await limit("verify-email:" + email, 10);
      if (!byIp || !byEmail) return res.status(429).json({error:"Limite de tentativas. Aguarde alguns minutos."});
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [record] = await db.select().from(siteAccessChallenges)
        .where(eq(siteAccessChallenges.email, email)).limit(1);
      if (!record || record.attempts >= 5 || record.expiresAt.getTime() <= Date.now()) return wrongCode(res);
      const expected = keyedHash("otp:" + email + ":" + code);
      const typed = Buffer.from(expected, "hex"), actual = Buffer.from(record.codeHash, "hex");
      const valid = typed.length === actual.length && timingSafeEqual(typed,actual);
      if (!valid) {
        await db.update(siteAccessChallenges).set({ attempts: sql`attempts + 1` })
          .where(and(eq(siteAccessChallenges.email,email), lt(siteAccessChallenges.attempts,5)));
        return wrongCode(res);
      }
      const person = await getAuthorizedPerson(email);
      if (!person) return wrongCode(res);
      // Consume the exact challenge atomically so concurrent requests cannot reuse an OTP.
      const [deleted] = await db.execute(sql`
        DELETE FROM siteAccessChallenges
        WHERE email = ${email} AND codeHash = ${expected}
          AND attempts < 5 AND expiresAt > ${new Date()}
      `);
      if (Number((deleted as {affectedRows?:number}).affectedRows) !== 1) return wrongCode(res);
      // Recheck authorization after OTP consumption, so suspension blocks new sessions.
      const fresh = await getAuthorizedPerson(email);
      if (!fresh || fresh.sessionVersion !== person.sessionVersion) return wrongCode(res);
      const token = jwt.sign({sub:email, kind:"site", v:fresh.sessionVersion}, siteSecret(), {
        algorithm:"HS256",expiresIn:"12h",
      });
      res.cookie(COOKIE, token, {
        httpOnly:true, secure:process.env.NODE_ENV==="production",
        sameSite:"lax",path:"/",maxAge:12*60*60*1000,
      });
      return res.json({ok:true});
    } catch(error) {
      console.error("[SiteAccess] Falha ao validar código:", error instanceof Error ? error.message : String(error));
      return res.status(503).json({error:"Serviço temporariamente indisponível."});
    }
  });

  app.get("/api/site-access/session", async (req,res) => {
    noStore(res);
    try { return res.json({authorized:await authorizedSiteVisitor(req)}); }
    catch { return res.status(503).json({authorized:false}); }
  });

  app.post("/api/site-access/logout", (req,res) => {
    noStore(res);
    if (!isSameOriginSiteRequest(req)) return res.status(403).json({error:"Origem não autorizada."});
    res.clearCookie(COOKIE,{path:"/",sameSite:"lax"});
    return res.json({ok:true});
  });
}
