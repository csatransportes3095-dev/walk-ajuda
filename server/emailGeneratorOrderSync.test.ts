import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const orders = fs.readFileSync(path.resolve(root, "client/src/pages/AdminOrders.tsx"), "utf8");
const email = fs.readFileSync(path.resolve(root, "client/src/pages/AdminEmail.tsx"), "utf8");
const router = fs.readFileSync(path.resolve(root, "server/routers.ts"), "utf8");

describe("gerador de email sincronizado com pedido", () => {
  it("envia o registrationId do pedido para o gerador em todos os blocos do ADM", () => {
    const matches = orders.match(/\/admin\/email\?registrationId=\$\{ar\.registrationId\}/g) || [];
    expect(matches.length).toBe(3);
  });

  it("usa o codigo do cliente como sufixo final no gerador", () => {
    expect(email).toContain('normalizeOrderRegistrationId(new URLSearchParams(window.location.search).get("registrationId"))');
    expect(email).toContain("ensureOrderRegistrationSuffix(baseCandidate, registrationId)");
    expect(email).toContain("registrationId: orderRegistrationId ?? undefined");
  });

  it("reforca o mesmo sufixo no backend antes de criar a conta Zoho", () => {
    expect(router).toContain("registrationId: z.number().int().positive().optional()");
    expect(router).toContain("usernameForOrder");
    expect(router).toContain(".${input.registrationId}");
  });
});
