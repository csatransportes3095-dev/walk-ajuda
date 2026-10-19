import { describe, expect, it } from "vitest";
import { formatRaffleWhatsappParticipant, joinRaffleWhatsappParticipants } from "../shared/raffleWhatsappList";
describe("Sorteio WhatsApp no celular", () => {
  it("separa numero/status, nome e telefone em linhas", () => {
    const row=formatRaffleWhatsappParticipant({number:2,customerName:"TIAGO JOSÉ CAVALCANTE",formattedPhone:"(11) 94598-9977",paymentStatus:"pending"});
    const lines=row.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("*Nº 02*");
    expect(lines[0]).toContain("*AGUARDANDO*");
    expect(lines[1]).toContain("TIAGO JOSÉ CAVALCANTE");
    expect(lines[2]).toContain("(11) 94598-9977");
  });
  it("mantem status pago e separa participantes com linha vazia", () => {
    const paid=formatRaffleWhatsappParticipant({number:3,customerName:"ANA",formattedPhone:"(11) 90000-0000",paymentStatus:"paid"});
    expect(paid).toContain("*PAGO*");
    expect(joinRaffleWhatsappParticipants([paid,paid]).split("\n\n")).toHaveLength(2);
    expect(joinRaffleWhatsappParticipants([])).toBe("Nenhum número nesta categoria.");
  });
});