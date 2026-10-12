import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/components/StorefrontProductCard.tsx"),
  "utf8",
);

describe("comparação SEM VIP x COM VIP na vitrine", () => {
  it("mostra preço normal e preço VIP no mesmo bloco", () => {
    expect(source).toContain("VOCÊ NÃO É VIP • PAGA");
    expect(source).toContain("COM VIP • VOCÊ PAGA");
    expect(source).toContain("VALOR NORMAL");
    expect(source).toContain("VOCÊ É VIP • PAGA");
  });

  it("mantém economia e CTA somente para quem não é VIP", () => {
    expect(source).toContain("Você economiza");
    expect(source).toContain("Você economizou");
    expect(source).toContain("Quero ser VIP");
    expect(source).toContain("!isVipCustomer");
  });

  it("remove o selo redundante de benefício disponível", () => {
    expect(source).not.toContain("BENEFÍCIO VIP DISPONÍVEL");
  });
});
