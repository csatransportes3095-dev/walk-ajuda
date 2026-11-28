import { eq,sql } from "drizzle-orm";
import { customers,referralCommissionAttributions } from "../drizzle/schema";
import { getDb } from "./db";
import type { ValidraCartQuote } from "./validraCartQuote";
import type { ValidraTransaction } from "./validraOrderPersistence";
import { REFERRAL_PROMOTION_RULE } from "../shared/referralPromotionPolicy";

export type ValidraReferralSnapshot={referrerCustomerId:number;referrerPhone:string;referrerName:string|null;commissionValue:number;promotionNoCommission:boolean};
type Customer=Pick<typeof customers.$inferSelect,"id"|"phone"|"referredByPhone">;

export async function freezeValidraReferral(customer:Customer,quote:ValidraCartQuote):Promise<ValidraReferralSnapshot|null>{
  const phone=String(customer.referredByPhone||"").replace(/\D/g,"");
  if(!phone)return null;
  if(phone===quote.phone||!/^\d{8,15}$/.test(phone))throw new Error("validra_cart_requirements_not_ready");
  const db=await getDb();if(!db)throw new Error("validra_database_unavailable");
  const [referrer]=await db.select().from(customers).where(eq(customers.phone,phone)).limit(1);
  if(!referrer||referrer.id===customer.id||referrer.blocked||referrer.deletedAt)throw new Error("validra_cart_requirements_not_ready");
  const promotionNoCommission=Boolean(quote.items[0].promotional||quote.coupon);
  const value=Number(quote.items[0].commissionValue||0);
  if(!Number.isSafeInteger(value)||value<0||value>2147483647)throw new Error("validra_cart_requirements_not_ready");
  if(!promotionNoCommission&&!value)return null;
  return {referrerCustomerId:referrer.id,referrerPhone:phone,referrerName:referrer.name??null,commissionValue:promotionNoCommission?0:value,promotionNoCommission};
}

export function validateValidraReferral(referral:ValidraReferralSnapshot|undefined,quote:ValidraCartQuote){
  if(!referral)return true;
  const promotion=Boolean(quote.items[0]?.promotional||quote.coupon);
  const expected=promotion?0:Number(quote.items[0]?.commissionValue||0);
  return Number.isSafeInteger(referral.referrerCustomerId)&&referral.referrerCustomerId>0&&referral.referrerCustomerId!==quote.customerId&&
    /^\d{8,15}$/.test(referral.referrerPhone)&&referral.referrerPhone!==quote.phone&&
    (referral.referrerName===null||(typeof referral.referrerName==="string"&&referral.referrerName.length<=128))&&
    referral.promotionNoCommission===promotion&&Number.isSafeInteger(referral.commissionValue)&&referral.commissionValue===expected&&
    expected>=0&&expected<=2147483647&&(promotion||expected>0);
}

/** First paid order only, under the cart/customer transaction. No payouts.
 * Existing orders or attribution take precedence, including manual checkout.
 * Invalidated/changing referrer is recorded as ineligible, not reassigned. */
export async function persistValidraReferral(tx:ValidraTransaction,referral:ValidraReferralSnapshot,quote:ValidraCartQuote,order:{registrationId:number;orderStatusId:number;orderNumber?:number;previousOrderCount:number},customerName:string|null){
  if(order.previousOrderCount!==0)return;
  const [existing]=await tx.execute(sql`SELECT id FROM referralCommissionAttributions WHERE referredCustomerId=${quote.customerId} LIMIT 1`);
  if((existing as unknown[]).length)return;
  const [refs]=await tx.execute(sql`SELECT id,phone,blocked,deletedAt FROM customers WHERE id=${referral.referrerCustomerId}`);
  const ref=(refs as unknown as Array<{id:number;phone:string;blocked:number;deletedAt:unknown}>)[0];
  const [owners]=await tx.execute(sql`SELECT referredByPhone FROM customers WHERE id=${quote.customerId}`);
  const current=(owners as unknown as Array<{referredByPhone:string|null}>)[0];
  const invalid=(!ref||ref.blocked||ref.deletedAt||ref.phone!==referral.referrerPhone||
    String(current?.referredByPhone||"").replace(/\D/g,"")!==referral.referrerPhone);
  const promoted=referral.promotionNoCommission;
  const reason=promoted?(quote.coupon?"Cupom de desconto utilizado: sem comissão de indicação.":"Produto em promoção: sem comissão de indicação."):invalid?"Vínculo da indicação alterado ou indisponível.":null;
  const item=quote.items[0];
  await tx.insert(referralCommissionAttributions).values({
    referrerCustomerId:referral.referrerCustomerId,referrerPhone:referral.referrerPhone,referrerName:referral.referrerName,
    referredCustomerId:quote.customerId,referredPhone:quote.phone,referredName:customerName,source:"cadastro",
    registrationId:order.registrationId,orderStatusId:order.orderStatusId,orderNumber:order.orderNumber??null,
    productId:item.productId,optionId:item.optionId,serviceName:item.serviceName,serviceOption:item.serviceOption,
    commissionRule:promoted?REFERRAL_PROMOTION_RULE:"fixed_option",commissionValue:promoted||invalid?0:referral.commissionValue,
    status:promoted||invalid?"nao_elegivel":"em_analise",invalidReason:reason,invalidatedAt:reason?new Date():null,
  });
}
