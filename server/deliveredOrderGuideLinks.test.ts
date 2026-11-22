import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { splitDeliveredGuideLinks } from "../client/src/lib/deliveredGuideLinks";

const page = readFileSync("client/src/pages/DeliveredOrderGuidePage.tsx", "utf8");

describe("Pedido Entregue: URLs clicáveis nas orientações", () => {
  it("transforma link http(s) completo sem alterar o texto ao redor", () => {
    const parts = splitDeliveredGuideLinks("🔗 https://wallet.uber.com\nConfira os dados.");
    expect(parts).toEqual([
      { text: "🔗 " },
      { text: "https://wallet.uber.com", href: "https://wallet.uber.com/" },
      { text: "\nConfira os dados." },
    ]);
  });
  it("aceita endereços sem protocolo, www e links com caminho", () => {
    const urls = splitDeliveredGuideLinks("Acesse wallet.uber.com ou www.h2colombiano.com/ajuda");
    expect(urls.filter(part => part.href).map(part => part.href)).toEqual([
      "https://wallet.uber.com/",
      "https://www.h2colombiano.com/ajuda",
    ]);
  });
  it("preserva pontuação sem incluí-la no destino", () => {
    expect(splitDeliveredGuideLinks("Abra (https://wallet.uber.com).")).toEqual([
      { text: "Abra (" },
      { text: "https://wallet.uber.com", href: "https://wallet.uber.com/" },
      { text: ")." },
    ]);
  });
  it("não executa HTML nem transforma esquemas perigosos em links", () => {
    const parts = splitDeliveredGuideLinks("<script>alert(1)</script> javascript:alert(1)");
    expect(parts.some(part => part.href)).toBe(false);
    expect(parts.map(part => part.text).join("")).toBe("<script>alert(1)</script> javascript:alert(1)");
    expect(page).not.toContain("dangerouslySetInnerHTML");
  });
  it("mantém e-mails como texto e renderiza links tanto na abertura como nos blocos", () => {
    expect(splitDeliveredGuideLinks("contato@h2colombiano.com")).toEqual([{ text: "contato@h2colombiano.com" }]);
    expect(page).toContain('<LinkedGuideText text={guide.intro}/>');
    expect(page).toContain('<LinkedGuideText text={block.text}/>');
    expect(page).toContain('rel="noopener noreferrer"');
  });
});
