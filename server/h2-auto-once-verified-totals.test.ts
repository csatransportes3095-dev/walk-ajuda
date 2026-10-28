import { describe, expect, it } from "vitest";
import { resolveReferralCommissionState } from "../shared/referralCommissionPolicy";

type Commission = { commissionValue: number; commissionState: string };
const totals = (commissions: Commission[]) => ({
  amountTotal: commissions.reduce((sum, x) => sum + x.commissionValue, 0),
  amountPending: commissions.filter(x => x.commissionState === "aguardando_agendamento").reduce((sum, x) => sum + x.commissionValue, 0),
  amountReady: commissions.filter(x => x.commissionState === "liberada").reduce((sum, x) => sum + x.commissionValue, 0),
});

describe("H2 AUTO commission totals", () => {
  it("separates awaiting appointments from released amounts", () => {
    const commissions = [
      { commissionValue: 4000, commissionState: resolveReferralCommissionState({ frozenStatus: "em_analise" }).state },
      { commissionValue: 6000, commissionState: resolveReferralCommissionState({ appointmentStatus: "confirmed" }).state },
    ];
    expect(totals(commissions)).toEqual({ amountTotal: 10000, amountPending: 4000, amountReady: 6000 });
  });
  it("does not count paid or invalid commissions as released", () => {
    const commissions = [
      { commissionValue: 5000, commissionState: resolveReferralCommissionState({ frozenStatus: "paga" }).state },
      { commissionValue: 3000, commissionState: resolveReferralCommissionState({ frozenStatus: "nao_elegivel" }).state },
    ];
    expect(totals(commissions)).toEqual({ amountTotal: 8000, amountPending: 0, amountReady: 0 });
  });
});
