import { describe, it, expect } from "vitest";
import { resolveReferralCommissionState } from "../shared/referralCommissionPolicy";

describe("indication commission: booking gates payment", () => {
  it("awaits scheduling for received orders", () => {
    expect(resolveReferralCommissionState({frozenStatus:"em_analise",latestOrderStatus:"recebido"}).paymentReady).toBe(false);
  });
  it("releases commission after confirmed schedule", () => {
    const result=resolveReferralCommissionState({frozenStatus:"em_analise",appointmentStatus:"confirmed"});
    expect(result.state).toBe("liberada");
    expect(result.paymentReady).toBe(true);
  });
  it("cancelled or pending booking overrides old confirmed history", () => {
    expect(resolveReferralCommissionState({appointmentStatus:"cancelled",latestOrderStatus:"agendamento_confirmado"}).paymentReady).toBe(false);
    expect(resolveReferralCommissionState({appointmentStatus:"pending",latestOrderStatus:"agendamento_confirmado"}).paymentReady).toBe(false);
  });
  it("never reopens paid or invalid commissions", () => {
    expect(resolveReferralCommissionState({paid:true,appointmentStatus:"confirmed"}).state).toBe("paga");
    expect(resolveReferralCommissionState({invalid:true,appointmentStatus:"confirmed"}).state).toBe("nao_elegivel");
  });
});
