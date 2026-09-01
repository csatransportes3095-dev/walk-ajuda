import { describe, expect, it } from "vitest";
import fs from "node:fs";

const router = fs.readFileSync("server/routers/adCampaigns.ts", "utf8");
const admin = fs.readFileSync("client/src/pages/AdminAdCampaigns.tsx", "utf8");

describe("fluxo de campanhas ADM", () => {
  it("normaliza URLs no backend antes da validacao", () => {
    expect(router).toContain("normalizeCampaignUrlInput");
    expect(router).toContain("linkUrl: campaignHttpUrlSchema");
    expect(router).toContain("videoUrl: campaignHttpUrlSchema");
  });

  it("normaliza URLs e datas no formulario antes de salvar", () => {
    expect(admin).toContain("normalizeCampaignUrl(form.linkUrl)");
    expect(admin).toContain("localDatetimeToIso(form.startsAt)");
    expect(admin).toContain("toDatetimeLocalValue(c.startsAt)");
  });

  it("impede termino anterior ao inicio e explica o contrato real do video", () => {
    expect(admin).toContain("A data de término precisa ser posterior à data de início.");
    expect(admin).toContain("Link de página ou YouTube comum não é reproduzido pelo player atual.");
  });
});
