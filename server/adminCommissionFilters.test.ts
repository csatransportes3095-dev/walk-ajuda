import {describe,it,expect} from "vitest";
import {classifyAdminCommission,adminCommissionTotals} from "../shared/adminCommissionFilters";
describe("ADM comissões: filtros individuais",()=>{
 it("classifica cada indicação uma única vez e não duplica valores",()=>{
 const rows=[
 {commissionPaid:1,commissionStatus:"paga",commissionValue:5000},
 {manualStatus:"a_liberar",paymentState:"liberada",commissionValue:2000},
 {manualStatus:"liberado",paymentState:"liberada",commissionValue:3000},
 {paymentState:"aguardando_agendamento",commissionValue:1000},
 {promotionNoCommission:true,commissionPaid:0,commissionValue:9999,commissionStatus:"nao_elegivel"},
 {frozenCommissionRule:"promotion_no_commission",commissionValue:0},
 {referralInvalid:true,commissionValue:5000},
 ];
 expect(rows.map(classifyAdminCommission)).toEqual(["paid","a_liberar","liberado","a_liberar","invalid","invalid","invalid"]);
 expect(adminCommissionTotals(rows)).toEqual({counts:{all:7,a_liberar:2,liberado:1,paid:1,invalid:3},
 values:{a_liberar:3000,liberado:3000,paid:5000,invalid:0}});
 });
 it("pagamento confirmado prevalece sobre liberação manual",()=>{
 expect(classifyAdminCommission({commissionPaid:1,manualStatus:"liberado"})).toBe("paid");
 });
 it("invalidade tem prioridade sobre pagamento, sem dupla contagem",()=>{
 expect(classifyAdminCommission({referralInvalid:1,commissionPaid:1})).toBe("invalid");
 });
});
