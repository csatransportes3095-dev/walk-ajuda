import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureValidraAttemptStorage,reserveValidraAttempt,fetchBoundValidraCharge } from "./validraAttemptStorage";
import { validraPurchaseDigest } from "./validraCheckout";
import { ValidraPayClient,validraChargeIsPaid,type ValidraCharge } from "./validraPay";
import type { QuestionAudioDraft } from "../drizzle/schema";
import { VALIDRA_CHECKOUT_READY } from "./checkoutPaymentProvider";
export type ValidraPricing={customerId:number;phone:string;amountCents:number;service:string;nameOption:string;price:string};
export type ValidraRecoverySnapshot={version:1;input:Record<string,unknown>;pricing:ValidraPricing;audioDrafts:QuestionAudioDraft[];promotionalOrderAtCheckout:boolean;couponAppliedAtCheckout:boolean};
export type ValidraRecoveryContext={snapshot:ValidraRecoverySnapshot;charge:ValidraCharge};
type Resume=(context:ValidraRecoveryContext)=>Promise<unknown>;
type Row={external_id:string;customer_id:number;amount_cents:number|string;purchase_digest:string;registration_id:number|null;attempt_state:string;state:string;snapshot_json:string|null;lease_token:string|null};

export async function ensureValidraRecoveryStorage(){
  const db=await ensureValidraAttemptStorage();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_payment_recovery(
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    snapshot_json MEDIUMTEXT,
    state VARCHAR(24) NOT NULL DEFAULT 'pending',
    next_check_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lease_token VARCHAR(36),lease_until DATETIME(3),result_code VARCHAR(64),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY recovery_due(state,next_check_at)
  ) ENGINE=InnoDB`);
  return db;
}

function validatedSnapshot(row:Row):ValidraRecoverySnapshot {
  if(!row.snapshot_json)throw new Error("validra_recovery_missing");
  const snap=JSON.parse(row.snapshot_json) as ValidraRecoverySnapshot;
  if(snap.version!==1||snap.input.validraAttemptId!==row.external_id||
      snap.pricing.customerId!==Number(row.customer_id)||snap.pricing.amountCents!==Number(row.amount_cents)||
      snap.input.phone!==snap.pricing.phone||validraPurchaseDigest(snap)!==row.purchase_digest)
    throw new Error("validra_attempt_conflict");
  return snap;
}

/** Called only after the existing order preflight, and before the provider
 * request. No credentials or file bytes are retained. */
export async function reserveValidraRecovery(snapshot:ValidraRecoverySnapshot,allowNew:boolean){
  const externalId=String(snapshot.input.validraAttemptId||"");
  if(snapshot.input.cpToken||snapshot.input.accessCode||snapshot.input.paymentProof||
    snapshot.input.profilePhoto||snapshot.input.carDocument||snapshot.input.alvara||snapshot.input.condutaxi||
    (Array.isArray(snapshot.input.documents)&&snapshot.input.documents.some(doc=>doc?.data)))
    throw new Error("validra_recovery_unsupported_payload");
  // Hash the JSON representation, including dates normalized by serialization.
  const json=JSON.stringify(snapshot);
  if(Buffer.byteLength(json,"utf8")>256*1024)throw new Error("validra_recovery_unsupported_payload");
  const digest=validraPurchaseDigest(JSON.parse(json));
  const db=await ensureValidraRecoveryStorage();
  const [rows]=await db.execute(sql`SELECT external_id FROM validra_checkout_attempts WHERE external_id=${externalId} AND customer_id=${snapshot.pricing.customerId}`);
  if(!allowNew&&!(rows as unknown[]).length)throw new Error("validra_new_attempts_disabled");
  await reserveValidraAttempt({externalId,customerId:snapshot.pricing.customerId,amountCents:snapshot.pricing.amountCents,purchaseDigest:digest});
  await db.execute(sql`INSERT INTO validra_payment_recovery(external_id,snapshot_json,next_check_at)
    VALUES(${externalId},${json},CURRENT_TIMESTAMP(3)+INTERVAL 15 SECOND)
    ON DUPLICATE KEY UPDATE external_id=external_id`);
  return digest;
}

export async function loadOwnedValidraRecovery(externalId:string,phone:string){
  const db=await ensureValidraRecoveryStorage();
  const [rows]=await db.execute(sql`SELECT a.external_id,a.customer_id,a.amount_cents,a.purchase_digest,a.registration_id,a.state AS attempt_state,
    r.state,r.snapshot_json,r.lease_token
    FROM validra_checkout_attempts a JOIN customers c ON c.id=a.customer_id
    LEFT JOIN validra_payment_recovery r ON r.external_id=a.external_id
    WHERE a.external_id=${externalId} AND c.phone=${phone} AND c.blocked=0 AND c.deletedAt IS NULL`);
  const row=(rows as unknown as Row[])[0];
  if(!row)return null;
  if(row.attempt_state==="consumed")return {kind:"consumed" as const,registrationId:Number(row.registration_id),complete:row.state==="complete"};
  if(row.state!=="pending")throw new Error("validra_payment_needs_review");
  return {kind:"pending" as const,snapshot:validatedSnapshot(row)};
}

export async function completeValidraRecovery(externalId:string){
  const db=await ensureValidraRecoveryStorage();
  // Remove the sensitive snapshot once the original order routine returns.
  await db.execute(sql`UPDATE validra_payment_recovery r JOIN validra_checkout_attempts a ON a.external_id=r.external_id
    SET r.state='complete',r.snapshot_json=NULL,r.lease_token=NULL,r.lease_until=NULL,r.result_code='original_flow_returned'
    WHERE r.external_id=${externalId} AND a.state='consumed'`);
}

/** GET only: never creates a new charge or replays a consumed order. A crash
 * during existing post-order effects is marked for review, not repeated. */
export async function processNextValidraRecovery(resume:Resume,client=new ValidraPayClient()){
  const db=await ensureValidraRecoveryStorage();
  await db.execute(sql`UPDATE validra_payment_recovery r JOIN validra_checkout_attempts a ON a.external_id=r.external_id
    SET r.state='review',r.result_code='post_order_incomplete',r.lease_token=NULL,r.lease_until=NULL
    WHERE r.state='pending' AND a.state='consumed' AND a.updated_at<CURRENT_TIMESTAMP-INTERVAL 5 MINUTE`);
  const job=await db.transaction(async tx=>{
    const [rows]=await tx.execute(sql`SELECT a.external_id,a.customer_id,a.amount_cents,a.purchase_digest,a.registration_id,a.state AS attempt_state,
      r.state,r.snapshot_json,r.lease_token FROM validra_payment_recovery r JOIN validra_checkout_attempts a ON a.external_id=r.external_id
      WHERE r.state='pending' AND a.state='pending' AND r.next_check_at<=CURRENT_TIMESTAMP(3)
        AND (r.lease_until IS NULL OR r.lease_until<CURRENT_TIMESTAMP(3))
      ORDER BY r.next_check_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
    const row=(rows as unknown as Row[])[0];if(!row)return null;
    const token=randomUUID();
    await tx.execute(sql`UPDATE validra_payment_recovery SET lease_token=${token},lease_until=CURRENT_TIMESTAMP(3)+INTERVAL 180 SECOND
      WHERE external_id=${row.external_id}`);
    return {...row,lease_token:token};
  },{isolationLevel:"read committed"});
  if(!job)return false;
  const finish=async(state:"pending"|"review",code:string)=>{
    await db.execute(sql`UPDATE validra_payment_recovery SET state=${state},result_code=${code},
      next_check_at=CURRENT_TIMESTAMP(3)+INTERVAL 60 SECOND,lease_token=NULL,lease_until=NULL
      WHERE external_id=${job.external_id} AND state='pending' AND lease_token=${job.lease_token}`);
  };
  try{
    const snapshot=validatedSnapshot(job);
    const charge=await fetchBoundValidraCharge(job.external_id,Number(job.customer_id),client);
    if(!validraChargeIsPaid(charge,{externalId:job.external_id,amountCents:Number(job.amount_cents)})){
      await finish(["active","processing"].includes(charge.status)?"pending":"review","provider_"+(["active","processing","expired","cancelled","paid","refunded"].includes(charge.status)?charge.status:"other"));
      return true;
    }
    await resume({snapshot,charge});
    // The existing route marks complete itself. If it refused fulfillment,
    // keep the verified payment queued/reviewable rather than charging again.
    await finish("pending","awaiting_original_flow");
  }catch{await finish("pending","reconciliation_retry");}
  return true;
}
export function startValidraRecoveryWorker(resume:Resume){
  if(!VALIDRA_CHECKOUT_READY)return;
  let running=false;
  const tick=async()=>{
    if(running)return;running=true;
    try{for(let i=0;i<5;i++)if(!await processNextValidraRecovery(resume))break;}
    catch{console.error("[ValidraPay] Recovery temporarily unavailable");}
    finally{running=false;}
  };
  const timer=setInterval(()=>void tick(),15000);timer.unref();
  void tick();
}
