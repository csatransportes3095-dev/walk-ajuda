import { describe, expect, it } from "vitest";
import { applyManualCommissionOverride } from "./referralCommissionManual";

const origin = {commissionValue: 0, paymentState:"aguardando_agendamento",
  paymentLabel:"⏳ Aguardando agendamento confirmado",paymentReady:false};

describe("H2 AUTO manual commissions: separate release from payment", () => {
  it("shows amount A LIBERAR in ADM and H2 AUTO without counting as released", () => {
    expect(applyManualCommissionOverride(origin,{
      registrationId:1,commissionValue:4500,releaseStatus:"a_liberar",updatedAt:null,
    })).toMatchObject({commissionValue:4500,paymentState:"aguardando_agendamento",paymentReady:false});
  });
  it("releases an amount manually without recording a payment", () => {
    expect(applyManualCommissionOverride(origin,{
      registrationId:1,commissionValue:4500,releaseStatus:"liberado",updatedAt:null,
    })).toMatchObject({commissionValue:4500,paymentState:"liberada",paymentReady:true});
  });
  it("cannot override an invalid referral", () => {
    expect(applyManualCommissionOverride({...origin,paymentState:"nao_elegivel"},{
      registrationId:1,commissionValue:4500,releaseStatus:"liberado",updatedAt:null,
    }).paymentState).toBe("nao_elegivel");
  });
  it("does not reopen already paid commissions", () => {
    expect(applyManualCommissionOverride({...origin,paymentState:"paga"},{
      registrationId:1,commissionValue:4500,releaseStatus:"a_liberar",updatedAt:null,
    }).paymentState).toBe("paga");
  });
  it("preserves old automatic status without a manual record", () => {
    expect(applyManualCommissionOverride(origin,null)).toMatchObject(origin);
  });
});
