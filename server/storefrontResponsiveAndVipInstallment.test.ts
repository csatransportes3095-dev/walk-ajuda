import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const home = fs.readFileSync(path.resolve(root, "client/src/pages/Home.tsx"), "utf8");
const card = fs.readFileSync(path.resolve(root, "client/src/components/StorefrontProductCard.tsx"), "utf8");
const vip = fs.readFileSync(path.resolve(root, "client/src/components/VipInstallmentCheckoutBox.tsx"), "utf8");

describe("vitrine responsiva + parcelamento VIP bloqueado", () => {
  it("mantém 3 cards por linha no desktop", () => {
    expect(home).toContain("lg:!grid-cols-3");
    expect(home).toContain("xl:!grid-cols-3");
  });

  it("faz o conteúdo do card acompanhar a largura", () => {
    expect(card).toContain("min-w-0");
    expect(card).toContain("clamp(");
    expect(card).toContain("overflow-hidden");
    expect(card).toContain("text-ellipsis");
    expect(card).toContain("whitespace-nowrap");
  });

  it("bloqueia Parcelamento VIP sem confirmação explícita de elegibilidade", () => {
    expect(vip).toContain("const installmentAllowed");
    expect(vip).toContain("eligibility.data?.eligible === true");
    expect(vip).toContain("disabled={!installmentAllowed}");
    expect(vip).toContain("if (!installmentAllowed) return");
  });

  it("mantém À VISTA normal e aviso dentro do mesmo card", () => {
    expect(vip).toContain("À VISTA");
    expect(vip).toContain("blockReason &&");
    expect(vip).toContain("Parcelamento VIP indisponível para este produto.");
  });
});
