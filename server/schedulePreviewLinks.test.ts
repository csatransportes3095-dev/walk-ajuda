import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { injectOgMeta, resolveOpenGraphMeta } from "./_core/vite";

const token = "c7b4264b374bca4a9aecb6af7e2e88ec";
const scheduleMeta = {
  title: "Agendamento — H2 COLOMBIANO",
  description: "Escolha a melhor data e horário para seu atendimento.",
  imageUrl: "/h2-brand-512.png",
  imageVersion: "schedule-h2-v2",
  imageType: "image/png",
  imageWidth: 512,
  imageHeight: 512,
};

describe("miniatura de agendamento para WhatsApp", () => {
  it("usa URL HTTPS do próprio agendamento e o escudo H2 configurável", () => {
    const meta = resolveOpenGraphMeta(scheduleMeta, `/agendar/${token}?origem=whatsapp`);

    expect(meta.canonicalUrl).toBe(`https://h2colombiano.com/agendar/${token}`);
    expect(meta.title).toBe("Agendamento — H2 COLOMBIANO");
    expect(meta.description).toContain("Escolha a melhor data e horário");
    expect(meta.imageUrl).toBe("/h2-brand-512.png");
    expect(meta.imageType).toBe("image/png");
    expect(meta.imageWidth).toBe(512);
    expect(meta.imageHeight).toBe(512);
  });

  it("injeta metadados completos sem expor dados do cliente", () => {
    const html = injectOgMeta("<html><head></head><body></body></html>", scheduleMeta, `/agendar/${token}`);

    expect(html).toContain(`property=\"og:url\" content=\"https://h2colombiano.com/agendar/${token}\"`);
    expect(html).toContain('property="og:image" content="https://h2colombiano.com/h2-brand-512.png?v=schedule-h2-v2"');
    expect(html).toContain('property="og:image:type" content="image/png"');
    expect(html).not.toContain("midia.h2colombiano.com/og-image/lenta.png");
  });
});

describe("links de agendamento canônicos", () => {
  const root = path.resolve(process.cwd());
  const scheduleRouter = fs.readFileSync(path.join(root, "server/routers/schedule.ts"), "utf8");
  const orderScheduleBlock = fs.readFileSync(path.join(root, "client/src/components/OrderScheduleBlock.tsx"), "utf8");
  const orderTracking = fs.readFileSync(path.join(root, "client/src/pages/OrderTracking.tsx"), "utf8");

  it("usa a mesma origem oficial nos links enviados pelo servidor", () => {
    expect(scheduleRouter).toContain('publicSiteUrl(`/agendar/${appt.token}`)');
  });

  it("usa a mesma origem oficial para copiar, enviar e acompanhar", () => {
    expect(orderScheduleBlock).toContain('publicSiteUrl(`/agendar/${appt.token}`)');
    expect(orderTracking).toContain('publicSiteUrl(`/agendar/${a.token}`)');
  });
});
