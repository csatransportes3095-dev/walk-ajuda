import { describe,expect,it } from "vitest";
import { clientReferralSummary } from "./clientReferralsRouter";

describe("Página cliente: resumo de indicações",()=>{
  const commissions=[
    {commissionValue:1000,commissionState:"aguardando_agendamento"},
    {commissionValue:3000,commissionState:"liberada"},
    {commissionValue:2500,commissionState:"paga"},
    {commissionValue:900,commissionState:"nao_elegivel"},
  ];
  it("separa a liberar, liberado e já pago, sem somar inválidos",()=>{
    expect(clientReferralSummary(commissions)).toMatchObject({
      totalReferrals:4,pendingCount:1,releasedCount:1,paidCount:1,invalidCount:1,
      amountPending:1000,amountReleased:3000,amountPaid:2500,
      amountReceivable:4000,amountTotal:6500,
    });
  });
  it("não apresenta valores de outros status como já recebidos",()=>{
    expect(clientReferralSummary([{commissionValue:5000,commissionState:"liberada"}]))
      .toMatchObject({amountPaid:0,amountReceivable:5000});
  });
  it("mantém extrato vazio zerado",()=>{
    expect(clientReferralSummary([])).toMatchObject({totalReferrals:0,amountTotal:0,amountPaid:0});
  });
});
