import { describe, expect, it } from "vitest";
import { buildPhotoConfirmationWhatsappMessage } from "./photoConfirmationWhatsappMessage";

describe("WhatsApp - confirmação obrigatória para foto", () => {
  it("starts with customer name, then a clear appointment and mandatory steps", () => {
    const url = "https://h2colombiano.com/confirmacao-foto/token-de-teste";
    const msg = buildPhotoConfirmationWhatsappMessage({
      customerName: "LUIZ MIGUEL",
      slotDate: "2026-10-28",
      slotTime: "18:30:00",
      link: url,
    });
    expect(msg.startsWith("👤 *LUIZ MIGUEL*\n\n🇨🇴 *H2 COLOMBIANO*")).toBe(true);
    expect(msg).toContain("🗓️ Data: *28/10/2026*");
    expect(msg).toContain("🕒 Horário: *18:30*");
    expect(msg).toContain("*Responder TODAS as perguntas.*");
    expect(msg).toContain("*Finalizar e confirmar*");
    expect(msg).toContain("*obrigatória antes de fazer a foto.*");
    expect(msg).toContain("\n" + url + "\n");
    expect(msg.indexOf("👤")).toBeLessThan(msg.indexOf("📅 *AGENDAMENTO"));
    expect(msg.indexOf("📅 *AGENDAMENTO")).toBeLessThan(msg.indexOf("🚨 *OBRIGATÓRIO"));
    expect(msg).not.toContain("undefined");
  });

  it("does not invent an appointment when it is not in the order", () => {
    const msg = buildPhotoConfirmationWhatsappMessage({
      customerName: "ANA",
      link: "https://h2colombiano.com/confirmacao-foto/teste",
    });
    expect(msg).not.toContain("📅 *AGENDAMENTO");
    expect(msg).not.toContain("Data:");
    expect(msg).not.toContain("Horário:");
    expect(msg).toContain("🚨 *OBRIGATÓRIO ANTES DA FOTO*");
  });

  it("keeps the individualized link and short mobile-friendly lines", () => {
    const link = "https://h2colombiano.com/confirmacao-foto/abc123";
    const msg = buildPhotoConfirmationWhatsappMessage({ customerName: "JOÃO\nSILVA", link });
    expect(msg.startsWith("👤 *JOÃO SILVA*")).toBe(true);
    expect(msg.split(link).length).toBe(2);
    for (const line of msg.split("\n")) {
      if (line.startsWith("https://")) continue;
      expect(line.length).toBeLessThanOrEqual(54);
    }
  });
});
