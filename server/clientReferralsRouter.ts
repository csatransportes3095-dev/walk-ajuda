import { router, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { requireCustomerSession } from "./customerSession";
import { loadH2AutoLegacyReferrals, mergeH2AutoReferralItems } from "./h2-auto-referral-commissions";
import { resolveReferralCommissionState } from "../shared/referralCommissionPolicy";
import { getCommissionManualOverrides, applyManualCommissionOverride } from "./referralCommissionManual";

export type ClientReferralStatus = "paga" | "liberada" | "aguardando_agendamento" | "nao_elegivel";

export function clientReferralSummary(items: Array<{commissionValue:number;commissionState:string}>) {
  const amount = (status: string) => items.filter(row => row.commissionState === status)
    .reduce((sum,row) => sum + Math.max(0, Number(row.commissionValue)||0), 0);
  const pending = amount("aguardando_agendamento");
  const released = amount("liberada");
  const paid = amount("paga");
  return {
    totalReferrals:items.length,
    pendingCount:items.filter(row=>row.commissionState==="aguardando_agendamento").length,
    releasedCount:items.filter(row=>row.commissionState==="liberada").length,
    paidCount:items.filter(row=>row.commissionState==="paga").length,
    invalidCount:items.filter(row=>row.commissionState==="nao_elegivel").length,
    amountPending:pending, amountReleased:released, amountPaid:paid,
    amountReceivable:pending+released,
    amountTotal:pending+released+paid,
  };
}

export const clientReferralsRouter = router({
  list:publicProcedure.input(z.object({token:z.string().min(32).max(256)}))
    .query(async({input})=>{
      // Derive referrer only from the verified customerPassword session.
      // Never accept a phone, customer id or referrer id from client input.
      const identity = await requireCustomerSession(input.token);
      const phone = identity.phone.replace(/\D/g,"").slice(-11);
      if (!/^[0-9]{11}$/.test(phone)) throw new TRPCError({code:"UNAUTHORIZED",message:"Sessão inválida."});
      const db=await getDb();
      if (!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Consulta indisponível."});
      const [result, legacy]=await Promise.all([
        db.execute(sql`SELECT attribution.registrationId,attribution.orderNumber,
          attribution.referredName,attribution.commissionValue,
          attribution.status AS commissionStatus,
          (SELECT h.status FROM orderStatusHistory h WHERE h.registrationId=attribution.registrationId
            ORDER BY h.createdAt DESC,h.id DESC LIMIT 1) AS latestOrderStatus,
          (SELECT st.label FROM orderStatusHistory h LEFT JOIN orderStatusTypes st
            ON st.${sql.identifier("key")}=h.status WHERE h.registrationId=attribution.registrationId
            ORDER BY h.createdAt DESC,h.id DESC LIMIT 1) AS latestOrderStatusLabel,
          (SELECT sa.status FROM scheduleAppointments sa WHERE sa.registrationId=attribution.registrationId
            AND sa.subOrderIndex=0 ORDER BY sa.id DESC LIMIT 1) AS appointmentStatus,
          (SELECT sa.confirmedAt FROM scheduleAppointments sa WHERE sa.registrationId=attribution.registrationId
            AND sa.subOrderIndex=0 ORDER BY sa.id DESC LIMIT 1) AS appointmentConfirmedAt
          FROM referralCommissionAttributions attribution
          WHERE RIGHT(REGEXP_REPLACE(attribution.referrerPhone,'[^0-9]',''),11)=${phone}
          ORDER BY attribution.createdAt DESC LIMIT 500`),
        loadH2AutoLegacyReferrals(phone),
      ]);
      const frozen=((result[0]||[]) as any[]).map(row=>{
        const resolved=resolveReferralCommissionState({
          frozenStatus:row.commissionStatus,
          appointmentStatus:row.appointmentStatus,
          appointmentConfirmedAt:row.appointmentConfirmedAt,
          latestOrderStatus:row.latestOrderStatus,
          latestOrderStatusLabel:row.latestOrderStatusLabel,
        });
        return {
          registrationId:Number(row.registrationId),
          orderNumber:row.orderNumber==null?null:Number(row.orderNumber),
          customerName:String(row.referredName||"Cliente").slice(0,90),
          orderStatus:String(row.latestOrderStatusLabel||row.latestOrderStatus||"Pedido recebido").slice(0,100),
          commissionValue:Math.max(0,Number(row.commissionValue)||0),
          commissionState:resolved.state,
          commissionLabel:resolved.label,
        };
      });
      const merged=mergeH2AutoReferralItems(frozen,legacy);
      const overrides=await getCommissionManualOverrides(db,merged.map(row=>row.registrationId));
      const commissions=merged.map(row=>{
        const modified=applyManualCommissionOverride({
          commissionValue:row.commissionValue,paymentState:row.commissionState,
          paymentLabel:row.commissionLabel,paymentReady:row.commissionState==="liberada",
        },overrides.get(row.registrationId));
        return {
          ...row,
          commissionValue:Math.max(0,modified.commissionValue),
          commissionState:modified.paymentState as ClientReferralStatus,
          commissionLabel:modified.paymentLabel,
          manualStatus:modified.manualStatus,
        };
      });
      return { ...clientReferralSummary(commissions),commissions };
    }),
});
