import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { ensureValidraCartStorage, persistPaidValidraCart } from "./validraCartPersistence";
import { bindValidraCharge } from "./validraAttemptStorage";
import { ValidraApiError, ValidraPayClient, validraChargeIsPaid, type ValidraCharge } from "./validraPay";

type EventRow={event_id:string;event_type:string;charge_id:string|null;external_id:string|null};
type AttemptRow={customer_id:number;amount_cents:number|string;charge_id:string|null;state:string;has_snapshot:number|string};
type ClaimedEvent=EventRow&{leaseToken:string;attempts:number};
const knownChargeEvent=/^charge\.(active|paid|expired|cancelled|cancellation_failed|refunded|partially_refunded|registered|processing)$/;

export async function ensureValidraEventStorage() {
  const db=await getDb();
  if(!db)throw new Error("validra_database_unavailable");
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_webhook_events (
    event_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL, charge_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
    occurred_at VARCHAR(40) NOT NULL, received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_event_jobs (
    event_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    state VARCHAR(24) NOT NULL DEFAULT 'queued',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    next_run_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lease_token VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
    lease_until DATETIME(3),
    result_code VARCHAR(64), INDEX validra_job_due(state,next_run_at)
  ) ENGINE=InnoDB`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_payment_reviews (
    event_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
    charge_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
    reason VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  return db;
}

export async function enqueueValidraEvent(event: EventRow&{occurred_at:string}) {
  const db=await ensureValidraEventStorage();
  await db.transaction(async tx=>{
    await tx.execute(sql`INSERT INTO validra_webhook_events(event_id,event_type,charge_id,external_id,occurred_at)
      VALUES(${event.event_id},${event.event_type},${event.charge_id},${event.external_id},${event.occurred_at})
      ON DUPLICATE KEY UPDATE event_id=event_id`);
    await tx.execute(sql`INSERT INTO validra_event_jobs(event_id) VALUES(${event.event_id}) ON DUPLICATE KEY UPDATE event_id=event_id`);
  });
}

async function claimValidraEvent():Promise<ClaimedEvent|null>{
  const db=await ensureValidraEventStorage();
  // Recover inbox rows from earlier code versions and interrupted deliveries.
  await db.execute(sql`INSERT IGNORE INTO validra_event_jobs(event_id)
    SELECT e.event_id FROM validra_webhook_events e LEFT JOIN validra_event_jobs j ON j.event_id=e.event_id WHERE j.event_id IS NULL LIMIT 100`);
  return db.transaction(async tx=>{
    const [rows]=await tx.execute(sql`SELECT e.event_id,e.event_type,e.charge_id,e.external_id,j.attempts
      FROM validra_event_jobs j INNER JOIN validra_webhook_events e ON e.event_id=j.event_id
      WHERE (j.state='queued' AND j.next_run_at<=CURRENT_TIMESTAMP(3))
      OR (j.state='running' AND j.lease_until<CURRENT_TIMESTAMP(3))
      ORDER BY j.next_run_at,j.event_id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    const row=(rows as unknown as Array<EventRow&{attempts:number}>)[0];
    if(!row)return null;
    const leaseToken=randomUUID();
    await tx.execute(sql`UPDATE validra_event_jobs SET state='running',attempts=attempts+1,lease_token=${leaseToken},
      lease_until=CURRENT_TIMESTAMP(3)+INTERVAL 90 SECOND WHERE event_id=${row.event_id}`);
    return {...row,leaseToken,attempts:Number(row.attempts)+1};
  });
}

async function finish(event:ClaimedEvent,state:"done"|"review"|"queued",reason:string,delaySeconds=0){
  const db=await ensureValidraEventStorage();
  await db.transaction(async tx=>{
    const [lease]=await tx.execute(sql`SELECT event_id FROM validra_event_jobs WHERE event_id=${event.event_id}
      AND state='running' AND lease_token=${event.leaseToken} FOR UPDATE`);
    if(!(lease as unknown[]).length)return;
    if(state==="review"){
      await tx.execute(sql`INSERT INTO validra_payment_reviews(event_id,external_id,charge_id,reason)
        VALUES(${event.event_id},${event.external_id},${event.charge_id},${reason})
        ON DUPLICATE KEY UPDATE event_id=event_id`);
    }
    await tx.execute(sql`UPDATE validra_event_jobs SET state=${state},result_code=${reason},
      next_run_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ${delaySeconds} SECOND),lease_until=NULL,lease_token=NULL
      WHERE event_id=${event.event_id} AND lease_token=${event.leaseToken}`);
  });
}

export function classifyValidraReconciledCharge(charge:ValidraCharge,attempt:{externalId:string;amountCents:number},state:string,hasSnapshot:boolean){
  if(charge.status==="refunded"||charge.status==="partially_refunded"||charge.amount_refunded!=="0.00")return "refund_review";
  if(charge.paid_after_expiration||charge.paid_after_cancellation)return "late_payment_review";
  if(charge.status==="paid"){
    if(!validraChargeIsPaid(charge,attempt))return "amount_review";
    if(state==="consumed")return "already_consumed";
    if(state!=="pending")return "attempt_review";
    return hasSnapshot?"fulfill_cart":"paid_snapshot_missing";
  }
  if(state==="consumed")return "consumed_status_conflict";
  if(["processing","active","cancelling"].includes(charge.status))return "unpaid";
  if(["expired","cancelled"].includes(charge.status))return "terminal_unpaid_review";
  return "unknown_status_review";
}

/** Only reconciles known local attempts. Signed event payloads are never
 * accepted as proof of payment; always GET using the server credentials.
 * Unknown / late / refunded / incomplete orders become durable review items.
 * Never invokes a POST or a payout. */
export async function processNextValidraEvent(client:ValidraPayClient){
  const event=await claimValidraEvent();
  if(!event)return false;
  try{
    if(!knownChargeEvent.test(event.event_type)){await finish(event,"done","ignored_event");return true;}
    if(!event.external_id||!event.charge_id){await finish(event,"review","missing_charge_reference");return true;}
    const db=await ensureValidraCartStorage();
    const [rows]=await db.execute(sql`SELECT a.customer_id,a.amount_cents,a.charge_id,a.state,
      (s.external_id IS NOT NULL) AS has_snapshot FROM validra_checkout_attempts a
      LEFT JOIN validra_cart_snapshots s ON s.external_id=a.external_id WHERE a.external_id=${event.external_id}`);
    const row=(rows as unknown as AttemptRow[])[0];
    // Ignore charges of other integrations sharing the same ValidraPay account.
    if(!row){await finish(event,"done","unknown_local_attempt");return true;}
    if(row.charge_id&&row.charge_id!==event.charge_id){await finish(event,"review","charge_id_conflict");return true;}
    const [claim]=await db.execute(sql`UPDATE validra_checkout_attempts SET last_query_at=CURRENT_TIMESTAMP(3)
      WHERE external_id=${event.external_id} AND (last_query_at IS NULL OR last_query_at<=CURRENT_TIMESTAMP(3)-INTERVAL 5 SECOND)`);
    if(Number((claim as unknown as {affectedRows:number}).affectedRows)!==1){await finish(event,"queued","query_cooldown",6);return true;}
    const attempt={externalId:event.external_id,amountCents:Number(row.amount_cents)};
    const charge=await client.getCharge({...attempt,chargeId:event.charge_id});
    await bindValidraCharge(event.external_id,Number(row.customer_id),charge);
    const decision=classifyValidraReconciledCharge(charge,attempt,row.state,Number(row.has_snapshot)===1);
    if(decision==="fulfill_cart"){
      await persistPaidValidraCart(event.external_id,charge);
      await finish(event,"done","order_persisted");
    }else if(decision==="already_consumed"||decision==="unpaid"){
      await finish(event,"done",decision);
    }else{
      await finish(event,"review",decision);
    }
  }catch(error){
    const retryAfter=error instanceof ValidraApiError?Number(error.retryAfter||0):0;
    const delay=Math.min(3600,Math.max(10,Number.isFinite(retryAfter)?retryAfter:0,Math.pow(2,Math.min(event.attempts,10))));
    const permanent=error instanceof Error&&["validra_charge_mismatch","validra_charge_conflict","validra_attempt_conflict","validra_customer_mismatch","validra_invalid_cart_snapshot","validra_cart_snapshot_missing"].includes(error.message);
    if(permanent||event.attempts>=12)await finish(event,"review",permanent?"binding_conflict":"retries_exhausted");
    else await finish(event,"queued","temporary_failure",delay);
  }
  return true;
}

/** Starts only after the release gate permits it. Does not depend on which
 * payment method is currently selected: old charges must still reconcile. */
export function startValidraEventWorker(client:ValidraPayClient){
  let running=false;
  const tick=async()=>{
    if(running)return;
    running=true;
    try{for(let i=0;i<5;i++)if(!await processNextValidraEvent(client))break;}
    catch{console.error("[ValidraPay] Event reconciliation unavailable");}
    finally{running=false;}
  };
  const timer=setInterval(()=>{void tick();},6000);
  timer.unref?.();
  void tick();
  return ()=>clearInterval(timer);
}
