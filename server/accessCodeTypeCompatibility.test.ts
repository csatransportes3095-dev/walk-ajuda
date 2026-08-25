import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = fs.readFileSync(path.resolve(root, "server/routers.ts"), "utf8");
const persistence = fs.readFileSync(path.resolve(root, "server/orderPersistence.ts"), "utf8");

describe("compatibilidade dos tipos de accessCodes", () => {
  it("mantém o schema limitado a general|vip e representa cpToken como vip", () => {
    expect(fs.readFileSync(path.resolve(root, "drizzle/schema.ts"), "utf8"))
      .toContain('mysqlEnum("type", ["general", "vip"])');
    expect(persistence).toContain('type: "vip"');
    expect(persistence).not.toContain('type: "cptoken"');
  });

  it("não grava referral_link como tipo de accessCodes", () => {
    expect(router).not.toContain("type = 'referral_link'");
    expect(router).not.toContain("'referral_link', 'active'");
    expect(router).toContain("const referralAccessCode = '__referral_link__'");
    expect(router).toContain("'Link de Indicação', 'vip', 'active'");
  });
});
