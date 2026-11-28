import { eq, sql } from "drizzle-orm";
import { accessCodePhones, coupons } from "../drizzle/schema";
import { ensureValidraAttemptStorage } from "./validraAttemptStorage";
import { persistValidraOrderInTransaction, type TrustedPaidOrderInput } from "./validraOrderPersistence";
import { validraPurchaseDigest } from "./validraCheckout";
import { validraAmount, validraChargeIsPaid, type ValidraCharge } from "./validraPay";
import type { ValidraCartQuote } from "./validraCartQuote";

export type ValidraCartSnapshot = {
  quote: ValidraCartQuote;
  orders: TrustedPaidOrderInput["order"][];
};
type Attempt = { customer_id: number; purchase_digest: string; amount_cents: number|string; charge_id: string|null; registration_id: number|null; state: string };

export async function ensureValidraCartStorage() {
  const db=await ensureValidraAttemptStorage();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_cart_snapshots (
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    snapshot_json MEDIUMTEXT NOT NULL, coupon_id INT NULL,
    coupon_state VARCHAR(16) NOT NULL DEFAULT 'none',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_cart_orders (
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    item_index INT NOT NULL, registration_id INT NOT NULL UNIQUE,
    order_status_id INT NOT NULL UNIQUE, order_number INT NOT NULL UNIQUE,
    PRIMARY KEY(external_id,item_index)
  ) ENGINE=InnoDB`);
  return db;
}

function validateSnapshot(snapshot: ValidraCartSnapshot) {
  const {quote,orders}=snapshot;
  validraAmount(quote.amountCents);
  if (!orders.length||orders.length!==quote.items.length||orders.length>30||
      quote.items.some(i=>!Number.isSafeInteger(i.amountCents)||i.amountCents<0)||
      quote.items.reduce((sum,i)=>sum+i.amountCents,0)!==quote.amountCents||
      orders.some((o,i)=>o.effectivePhone!==quote.phone||o.productId!==quote.items[i].productId||o.serviceName!==quote.items[i].serviceName||o.serviceOption!==quote.items[i].serviceOption)) throw new Error("validra_invalid_cart_snapshot");
  return validraPurchaseDigest(snapshot);
}

/** Reserve the coupon and freeze the complete server-validated cart before
 * creating a Pix. No network I/O inside the transaction. Internal only. */
export async function reserveValidraCart(externalId: string, snapshot: ValidraCartSnapshot) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(externalId)) throw new Error("validra_invalid_attempt");
  const purchaseDigest=validateSnapshot(snapshot);
  const {quote}=snapshot;
  const db=await ensureValidraCartStorage();
  return db.transaction(async tx=>{
    await tx.execute(sql`INSERT INTO validra_checkout_attempts(external_id,customer_id,purchase_digest,amount_cents)
      VALUES(${externalId},${quote.customerId},${purchaseDigest},${quote.amountCents})
      ON DUPLICATE KEY UPDATE external_id=external_id`);
    const [rows]=await tx.execute(sql`SELECT * FROM validra_checkout_attempts WHERE external_id=${externalId} FOR UPDATE`);
    const attempt=(rows as unknown as Attempt[])[0];
    if (!attempt||Number(attempt.customer_id)!==quote.customerId||attempt.purchase_digest!==purchaseDigest||Number(attempt.amount_cents)!==quote.amountCents) throw new Error("validra_attempt_conflict");
    const [prior]=await tx.execute(sql`SELECT external_id FROM validra_cart_snapshots WHERE external_id=${externalId}`);
    if (!(prior as unknown[]).length) {
      if (attempt.state!=="pending"||attempt.charge_id||attempt.registration_id) throw new Error("validra_attempt_conflict");
      if (quote.coupon) {
        const expected=quote.coupon;
        const [locked]=await tx.execute(sql`SELECT id,code,discountType,discountValue,productId,optionId,status,maxUses,currentUses,startsAt,expiresAt
          FROM coupons WHERE id=${expected.id} FOR UPDATE`);
        const c=(locked as unknown as Array<{id:number;code:string;discountType:string;discountValue:number;productId:number|null;optionId:number|null;status:string;maxUses:number|null;currentUses:number|null;startsAt:Date|null;expiresAt:Date|null}>)[0];
        const now=Date.now();
        if (!c||c.code!==expected.code||c.status!=="active"||c.discountType!==expected.type||Number(c.discountValue)!==expected.value||c.productId!==expected.productId||c.optionId!==expected.optionId||(c.startsAt&&+new Date(c.startsAt)>now)||(c.expiresAt&&+new Date(c.expiresAt)<=now)||(c.maxUses&&Number(c.currentUses||0)>=c.maxUses)) throw new Error("validra_coupon_unavailable");
        const uses=Number(c.currentUses||0)+1;
        await tx.update(coupons).set({currentUses:uses,status:c.maxUses&&uses>=c.maxUses?"used":"active"}).where(eq(coupons.id,c.id));
      }
      await tx.execute(sql`INSERT INTO validra_cart_snapshots(external_id,snapshot_json,coupon_id,coupon_state)
        VALUES(${externalId},${JSON.stringify(snapshot)},${quote.coupon?.id??null},${quote.coupon?"reserved":"none"})`);
    }
    return {externalId,customerId:quote.customerId,purchaseDigest,amountCents:quote.amountCents};
  });
}

/** One confirmed charge -> all orders, or none. Never call with webhook
 * data alone: charge must come from a fresh authenticated provider GET. */
export async function persistPaidValidraCart(externalId: string, charge: ValidraCharge) {
  const db=await ensureValidraCartStorage();
  return db.transaction(async tx=>{
    const [rows]=await tx.execute(sql`SELECT * FROM validra_checkout_attempts WHERE external_id=${externalId} FOR UPDATE`);
    const attempt=(rows as unknown as Attempt[])[0];
    if (!attempt||attempt.charge_id!==charge.id||!validraChargeIsPaid(charge,{externalId,amountCents:Number(attempt.amount_cents)})) throw new Error("validra_payment_not_confirmed");
    if (attempt.state==="consumed") {
      const [existing]=await tx.execute(sql`SELECT registration_id,order_status_id,order_number FROM validra_cart_orders WHERE external_id=${externalId} ORDER BY item_index`);
      if (!(existing as unknown[]).length) throw new Error("validra_attempt_conflict");
      return {duplicate:true as const,orders:existing as unknown as Array<{registration_id:number;order_status_id:number;order_number:number}>};
    }
    if (attempt.state!=="pending"||attempt.registration_id) throw new Error("validra_attempt_needs_review");
    const [snapRows]=await tx.execute(sql`SELECT snapshot_json,coupon_state FROM validra_cart_snapshots WHERE external_id=${externalId} FOR UPDATE`);
    const stored=(snapRows as unknown as Array<{snapshot_json:string;coupon_state:string}>)[0];
    if (!stored) throw new Error("validra_cart_snapshot_missing");
    const snapshot=JSON.parse(stored.snapshot_json) as ValidraCartSnapshot;
    const {quote,orders}=snapshot;
    if (validateSnapshot(snapshot)!==attempt.purchase_digest||quote.customerId!==Number(attempt.customer_id)||quote.amountCents!==Number(attempt.amount_cents)||(quote.coupon&&stored.coupon_state!=="reserved")) throw new Error("validra_attempt_conflict");
    const [customerRows]=await tx.execute(sql`SELECT phone,blocked,deletedAt FROM customers WHERE id=${quote.customerId} FOR UPDATE`);
    const customer=(customerRows as unknown as Array<{phone:string;blocked:number;deletedAt:Date|null}>)[0];
    if (!customer||customer.deletedAt||Number(customer.blocked)!==0||customer.phone.replace(/\D/g,"")!==quote.phone) throw new Error("validra_customer_mismatch");
    const results=[];
    for (let i=0;i<orders.length;i++) {
      const item=quote.items[i];
      const persisted=await persistValidraOrderInTransaction(tx,orders[i],item.amountCents);
      if (!persisted.orderNumber) throw new Error("validra_order_persistence_failed");
      await tx.update(accessCodePhones).set({cartGroupId:externalId,cartTotal:(quote.subtotalCents/100).toFixed(2),cartCouponCode:quote.coupon?.code??null,cartCouponDiscount:(quote.couponCents/100).toFixed(2),cartItemIndex:i,resellerDiscountApplied:(item.resellerCents/100).toFixed(2)}).where(eq(accessCodePhones.id,persisted.registrationId));
      await tx.execute(sql`INSERT INTO validra_cart_orders(external_id,item_index,registration_id,order_status_id,order_number)
        VALUES(${externalId},${i},${persisted.registrationId},${persisted.orderStatusId},${persisted.orderNumber})`);
      results.push({registration_id:persisted.registrationId,order_status_id:persisted.orderStatusId,order_number:persisted.orderNumber});
    }
    await tx.execute(sql`UPDATE validra_checkout_attempts SET state='consumed',registration_id=${results[0].registration_id} WHERE external_id=${externalId}`);
    if (quote.coupon) {
      await tx.execute(sql`UPDATE validra_cart_snapshots SET coupon_state='consumed' WHERE external_id=${externalId}`);
      await tx.update(coupons).set({usedAt:new Date(),usedBy:orders[0].clientName||null}).where(eq(coupons.id,quote.coupon.id));
    }
    return {duplicate:false as const,orders:results};
  });
}
