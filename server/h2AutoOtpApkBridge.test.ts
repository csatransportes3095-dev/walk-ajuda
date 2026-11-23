import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("./h2-auto-otp-apk.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers/customerPassword.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");

describe("H2 Auto APK OTP bridge security checks", () => {
  it("does not advertise the APK channel unless a real paired device exists", () => {
    expect(router).toContain("await isH2AutoApkOtpReady()");
    expect(queue).toContain("export async function isH2AutoApkOtpReady()");
    expect(queue).toContain('String(result[0]?.[0]?.token_hash || "")');
    expect(queue).toContain("if (!isH2AutoApkOtpConfigured()) return false");
  });

  it("generates one OTP and reuses the exact code on both channels", () => {
    expect((access.match(/generateOwnSiteCode\(\)/g) || []).length).toBe(1);
    expect(access).toContain('if (channel !== "whatsapp") await deliverOwnSiteCode(email,code,"customer-login")');
    expect(access).toContain("codeDigest:codeHash");
    expect(access).toMatch(/enqueueIncomingWhatsappOtp\([\s\S]*?\},\s*tx\)/);
    expect(access).toContain('channel === "both" ? ["email", "whatsapp"] : [channel]');
  });
  it("keeps the single button and preserves the existing H2 AUTO conversation flow", () => {
    expect(router).toContain('channel: z.enum(["email","whatsapp","both"]).optional().default("email")');
    expect(login).toContain('send("both")');
    expect(login).toContain("RECEBER CÓDIGO");
    expect(login).toContain("bg-cyan-500");
    expect(login).toContain('buildWhatsappMessageUrl(supportNumber, "Preciso receber meu código")');
    expect(login).not.toContain("Código enviado por e-mail e WhatsApp.");
  });
  it("requires configured paired device and short-lived encrypted queue", () => {
    expect(queue).toContain('process.env[FLAG] === "true"');
    expect(queue).toContain('process.env[DEVICE]');
    expect(queue).toContain("createCipheriv(\"aes-256-gcm\"");
    expect(queue).toContain("x-h2-device-token");
    expect(queue).toContain("x-h2-device-id");
    expect(queue).toContain("c.usedAt IS NULL");
    expect(queue).toContain("c.attempts<5");
    expect(queue).toContain('res.status(status).set("Cache-Control", "no-store")');
    expect(queue).toContain("c.expiresAt>");
    expect(queue).toContain("q.expires_at>");
    expect(queue).not.toContain("graph.facebook.com");
  });

  it("offers only paired APK endpoints and never records the code in logs", () => {
    expect(app).toContain("registerH2AutoOtpApkRoutes(app)");
    expect(queue).not.toContain("console.log(code)");
    expect(queue).not.toContain("console.log(payload)");
  });
});
