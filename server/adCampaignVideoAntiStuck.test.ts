import { describe, expect, it } from "vitest";
import fs from "node:fs";

const home = fs.readFileSync("client/src/pages/Home.tsx", "utf8");
const tracking = fs.readFileSync("client/src/pages/OrderTracking.tsx", "utf8");
const gastos = fs.readFileSync("client/src/pages/SpreadsheetPage.tsx", "utf8");

describe("propaganda de video nao pode travar a pagina", () => {
  it("usa o tempo obrigatorio em Home, Acompanhar e Gastos independente do tipo da campanha", () => {
    for (const source of [home, tracking, gastos]) {
      expect(source).toContain("if (!adVisible || !adCampaign) return;");
    }
    expect(home).not.toContain("adCampaign.type !== 'image'");
    expect(tracking).not.toContain("adCampaign.type !== 'image'");
  });
});
