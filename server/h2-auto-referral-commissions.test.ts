import { describe, expect, it } from "vitest";
import { mergeH2AutoReferralItems, type H2AutoReferralItem } from "./h2-auto-referral-commissions";

const referral = (id: number, value: number, state = "aguardando_agendamento"): H2AutoReferralItem => ({
  registrationId: id, orderNumber: id + 5000,
  customerName: "Cliente indicado", orderStatus: "Agendamento pendente",
  commissionValue: value, commissionState: state,
  commissionLabel: state === "paga" ? "✅ Comissão paga" : "⏳ Aguardando agendamento confirmado",
});

describe("H2 AUTO: conciliação ADM Comissões x consulta do cliente", () => {
  it("mostra indicações legadas ainda sem atribuição congelada", () => {
    expect(mergeH2AutoReferralItems([], [referral(5, 0)])).toHaveLength(1);
  });
  it("não duplica pedido presente na fonte legada e congelada", () => {
    expect(mergeH2AutoReferralItems([referral(10, 2500)], [referral(10, 3000), referral(11, 0)]))
      .toEqual([referral(10, 2500), referral(11, 0)]);
  });
  it("mantém pagamento registrado na atribuição congelada", () => {
    expect(mergeH2AutoReferralItems([referral(10, 2500, "paga")], [referral(10, 0)]))
      .toMatchObject([{ commissionValue: 2500, commissionState: "paga" }]);
  });
  it("não aceita identificadores inválidos ou duplicados", () => {
    expect(mergeH2AutoReferralItems([referral(0, 100)], [referral(-1, 100), referral(3, 0), referral(3, 0)]))
      .toEqual([referral(3, 0)]);
  });
});
