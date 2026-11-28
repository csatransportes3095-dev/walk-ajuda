import { eq, sql } from "drizzle-orm";
import { accessCodePhones, coupons, financialSales, orderFiles } from "../drizzle/schema";
import { ensureValidraAttemptStorage } from "./validraAttemptStorage";
import { persistValidraOrderInTransaction, type TrustedPaidOrderInput } from "./validraOrderPersistence";
import { validraPurchaseDigest } from "./validraCheckout";
import { validraAmount, validraChargeIsPaid, type ValidraCharge } from "./validraPay";
import type { ValidraCartQuote } from "./validraCartQuote";

import { ensureValidraDocumentStorage, preflightValidraDocuments, bindValidraDocuments, type ValidraCartDocument } from "./validraDocumentStorage";
export type { ValidraCartDocument } from "./validraDocumentStorage";

// Only metadata registered by the authenticated upload is accepted. Raw
// bytes and credentials never enter the immutable purchase snapshot.
type ValidraCartOrder = TrustedPaidOrderInput["order"] & { documents?: ValidraCartDocument[] };

export type ValidraCartSnapshot = {
  quote: ValidraCartQuote;
  orders: ValidraCartOrder[];
};

function validDocuments(documents: ValidraCartDocument[] | undefined): boolean {
  if (documents === undefined) return true;
  if (!Array.isArray(documents) || documents.length > 30) return false;
  const keys = new Set<string>();
  for (const doc of documents) {
    if (!doc || typeof doc.label !== "string" || !doc.label.trim() || doc.label.length > 256 ||
        typeof doc.fileKey !== "string" || doc.fileKey.length > 512 ||
        !/^order-docs\/[A-Za-z0-9_.-]+$/.test(doc.fileKey) ||
        doc.fileKey.endsWith("/.") || doc.fileKey.endsWith("/..") ||
        typeof doc.fileUrl !== "string" || doc.fileUrl.length > 2048 ||
        typeof doc.mimeType !== "string" || doc.mimeType.length > 128 ||
        !/^(image\/(jpeg|png|gif|webp|heic|heif)|application\/pdf|video\/(mp4|webm|quicktime|x-msvideo|mpeg|ogg))$/.test(doc.mimeType) ||
        keys.has(doc.fileKey)) return false;
    try {
      const url = new URL(doc.fileUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
          !url.pathname.endsWith("/" + doc.fileKey)) return false;
    } catch { return false; }
    keys.add(doc.fileKey);
  }
  return true;
}
type Attempt = { customer_id: number; purchase_digest: string; amount_cents: number|string; charge_id: string|null; registration_id: number|null; state: string };

export async function ensureValidraCartStorage() {
  const db=await ensureValidraAttemptStorage();
  await ensureValidraDocumentStorage(db);
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
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_order_followup (
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    item_index INT NOT NULL, registration_id INT NOT NULL UNIQUE,
    state VARCHAR(24) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(external_id,item_index)
  ) ENGINE=InnoDB`);
  return db;
}

function validateSnapshot(snapshot: ValidraCartSnapshot) {
  const {quote,orders}=snapshot;
  validraAmount(quote.amountCents);
  if (!orders.length||orders.length!==quote.items.length||orders.length>30||
      quote.items.some(i=>!Number.isSafeInteger(i.amountCents)||i.amountCents<0||i.amountCents>2147483647)||
      quote.items.reduce((sum,i)=>sum+i.amountCents,0)!==quote.amountCents||
      orders.some((o,i)=>o.effectivePhone!==quote.phone||o.productId!==quote.items[i].productId||o.serviceName!==quote.items[i].serviceName||o.serviceOption!==quote.items[i].serviceOption||!validDocuments(o.documents)||(o.clientName?.length??0)>256||!Number.isSafeInteger(quote.items[i].optionId)||quote.items[i].optionId<=0)) throw new Error("validra_invalid_cart_snapshot");
  return validraPurchaseDigest(snapshot);
}

/** Reserve the coupon and freeze the complete server-validated cart before
 * creating a Pix. No network I/O inside the transaction. Internal only. */
export async function reserveValidraCart(externalId: string, snapshot: ValidraCartSnapshot, allowNew = true) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(externalId)) throw new Error("validra_invalid_attempt");
  const purchaseDigest=validateSnapshot(snapshot);
  const {quote,orders}=snapshot;
  const documents=orders.flatMap(o=>o.documents??[]);
  const db=await ensureValidraCartStorage();
  await preflightValidraDocuments(db,documents,quote,externalId);
  return db.transaction(async tx=>{
    if (!allowNew) {
      const [existing]=await tx.execute(sql`SELECT external_id FROM validra_cart_snapshots WHERE external_id=${externalId}`);
      if (!(existing as unknown[]).length) throw new Error("validra_new_attempts_disabled");
    }
    await tx.execute(sql`INSERT INTO validra_checkout_attempts(external_id,customer_id,purchase_digest,amount_cents)
      VALUES(${externalId},${quote.customerId},${purchaseDigest},${quote.amountCents})
      ON DUPLICATE KEY UPDATE external_id=external_id`);
    const [rows]=await tx.execute(sql`SELECT * FROM validra_checkout_attempts WHERE external_id=${externalId} FOR UPDATE`);
    const attempt=(rows as unknown as Attempt[])[0];
    if (!attempt||Number(attempt.customer_id)!==quote.customerId||attempt.purchase_digest!==purchaseDigest||Number(attempt.amount_cents)!==quote.amountCents) throw new Error("validra_attempt_conflict");
    const [prior]=await tx.execute(sql`SELECT external_id FROM validra_cart_snapshots WHERE external_id=${externalId}`);
    const hasSnapshot=(prior as unknown[]).length>0;
    const [ownerRows]=await tx.execute(sql`SELECT phone,blocked,deletedAt FROM customers WHERE id=${quote.customerId} FOR UPDATE`);
    const owner=(ownerRows as unknown as Array<{phone:string;blocked:number;deletedAt:Date|null}>)[0];
    if(!owner||owner.deletedAt||Number(owner.blocked)!==0||owner.phone.replace(/\D/g,"")!==quote.phone)throw new Error("validra_customer_mismatch");
    await bindValidraDocuments(tx,documents,quote,externalId,!hasSnapshot);
    if (!hasSnapshot) {
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
    // A legacy pending snapshot without a registered reservation must be
    // reviewed, not fulfilled with an unproven document reference.
    await bindValidraDocuments(tx,orders.flatMap(o=>o.documents??[]),quote,externalId,false);
    const paidAt=Date.parse(charge.payment?.paid_at??"");
    if (!Number.isSafeInteger(paidAt)||paidAt<=0) throw new Error("validra_invalid_paid_at");
    const results=[];
    for (let i=0;i<orders.length;i++) {
      const item=quote.items[i];
      const {documents,...order}=orders[i];
      const persisted=await persistValidraOrderInTransaction(tx,order,item.amountCents);
      if (!persisted.orderNumber) throw new Error("validra_order_persistence_failed");
      // Same transaction and registration as the initial status. Any document
      // or financial failure rolls back every item and charge consumption.
      if (documents?.length) await tx.insert(orderFiles).values(documents.map(doc=>({
        registrationId:persisted.registrationId,customerPhone:quote.phone,
        label:doc.label,fileKey:doc.fileKey,fileUrl:doc.fileUrl,mimeType:doc.mimeType,
      })));
      await tx.insert(financialSales).values({
        registrationId:persisted.registrationId,customerName:order.clientName??"",
        customerPhone:quote.phone,productName:item.serviceName,productOption:item.serviceOption,
        saleValue:item.amountCents,costValue:0,paymentMethod:"pix",status:"pago",
        saleDate:paidAt,receivedDate:paidAt,notes:null,
      });
      await tx.update(accessCodePhones).set({cartGroupId:externalId,cartTotal:(quote.subtotalCents/100).toFixed(2),cartCouponCode:quote.coupon?.code??null,cartCouponDiscount:(quote.couponCents/100).toFixed(2),cartItemIndex:i,resellerDiscountApplied:(item.resellerCents/100).toFixed(2)}).where(eq(accessCodePhones.id,persisted.registrationId));
      await tx.execute(sql`INSERT INTO validra_cart_orders(external_id,item_index,registration_id,order_status_id,order_number)
        VALUES(${externalId},${i},${persisted.registrationId},${persisted.orderStatusId},${persisted.orderNumber})`);
      await tx.execute(sql`INSERT INTO validra_order_followup(external_id,item_index,registration_id)
        VALUES(${externalId},${i},${persisted.registrationId})`);
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
