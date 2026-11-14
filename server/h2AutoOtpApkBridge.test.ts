import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("./h2-auto-otp-apk.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers/customerPassword.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");

describe("H2 Auto APK OTP bridge security checks", () => {
  it("reuses the single OTP generated for email", () => {
    expect((access.match(/generateOwnSiteCode\(\)/g) || []).length).toBe(1);
    expect(access).toContain("await deliverOwnSiteCode(email,code)");
    expect(access).toContain("codeDigest: newlyIssued.codeDigest");
    expect(access.indexOf("await enqueueH2AutoApkOtp(")).toBeGreaterThan(access.indexOf("await deliverOwnSiteCode(email,code)"));
  });

  it("never sends unrequested OTP tasks", () => {
    expect(access).toContain("if (viaH2Auto && newlyIssued)");
    expect(router).toContain("viaH2Auto: z.boolean().optional().default(false)");
    expect(login).toContain("const [viaH2Auto, setViaH2Auto] = useState(false)");
    expect(login).toContain("h2AutoDelivery?.available === true && (");
  });

  it("requires configured paired device and short-lived encrypted queue", () => {
    expect(queue).toContain('process.env[FLAG] === "true"');
    expect(queue).toContain('process.env[DEVICE]');
    expect(queue).toContain("createCipheriv(\"aes-256-gcm\"");
    expect(queue).toContain("x-h2-device-token");
    expect(queue).toContain("x-h2-device-id");
    expect(queue).toContain("c.usedAt IS NULL");
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
