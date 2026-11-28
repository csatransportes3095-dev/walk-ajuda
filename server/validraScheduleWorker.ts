import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { scheduleAppointments } from "../drizzle/schema";
import { ensureValidraCartStorage, type ValidraCartSnapshot } from "./validraCartPersistence";
import { validraPurchaseDigest } from "./validraCheckout";
import type { ensureAutomaticScheduleForOrder } from "./autoSchedule";

type ScheduleRoutine = typeof ensureAutomaticScheduleForOrder;
type Job = { registration_id: number; external_id: string; item_index: number; attempts: number; leaseToken: string };
type Binding = {
  snapshot_json: string; purchase_digest: string; customer_id: number; amount_cents: number | string;
  order_phone: string; order_deleted: Date | null; customer_phone: string; blocked: number; customer_deleted: Date | null;
};

// Separate from the general follow-up: other effects (referrals, notices) remain pending.
export async function ensureValidraScheduleStorage() {
  const db = await ensureValidraCartStorage();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_schedule_jobs (
    registration_id INT PRIMARY KEY,
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    item_index INT NOT NULL, state VARCHAR(24) NOT NULL DEFAULT 'queued',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    next_run_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lease_token VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
    lease_until DATETIME(3), appointment_id INT NULL, result_code VARCHAR(64),
    UNIQUE KEY validra_schedule_item(external_id,item_index),
    INDEX validra_schedule_due(state,next_run_at)
  ) ENGINE=InnoDB`);
  return db;
}

export async function processNextValidraSchedule(scheduleOverride?: ScheduleRoutine) {
  const db = await ensureValidraScheduleStorage();
  // The source follow-up was inserted atomically with a confirmed paid cart.
  // Recover older rows too, without re-enqueuing finished or review jobs.
  await db.execute(sql`INSERT IGNORE INTO validra_schedule_jobs(registration_id,external_id,item_index)
    SELECT f.registration_id,f.external_id,f.item_index FROM validra_order_followup f
    INNER JOIN validra_checkout_attempts a ON a.external_id=f.external_id AND a.state='consumed'
    INNER JOIN validra_cart_orders o ON o.external_id=f.external_id AND o.item_index=f.item_index AND o.registration_id=f.registration_id
    LEFT JOIN validra_schedule_jobs j ON j.registration_id=f.registration_id
    WHERE j.registration_id IS NULL ORDER BY f.registration_id LIMIT 100`);
  const job = await db.transaction(async tx => {
    const [rows] = await tx.execute(sql`SELECT registration_id,external_id,item_index,attempts
      FROM validra_schedule_jobs
      WHERE (state='queued' AND next_run_at<=CURRENT_TIMESTAMP(3))
        OR (state='running' AND lease_until<CURRENT_TIMESTAMP(3))
      ORDER BY next_run_at,registration_id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    const row = (rows as unknown as Array<Omit<Job,"leaseToken">>)[0];
    if (!row) return null;
    const leaseToken = randomUUID();
    await tx.execute(sql`UPDATE validra_schedule_jobs SET state='running',attempts=attempts+1,
      lease_token=${leaseToken},lease_until=CURRENT_TIMESTAMP(3)+INTERVAL 90 SECOND
      WHERE registration_id=${row.registration_id}`);
    return {...row,attempts:Number(row.attempts)+1,leaseToken};
  });
  if (!job) return false;

  try {
    await db.transaction(async tx => {
      // Hold the job lock until the appointment and completion marker commit together.
      const [leases] = await tx.execute(sql`SELECT registration_id FROM validra_schedule_jobs
        WHERE registration_id=${job.registration_id} AND state='running' AND lease_token=${job.leaseToken} FOR UPDATE`);
      if (!(leases as unknown[]).length) return;
      const finish = async (state:"done"|"review", code:string, appointmentId:number|null=null) => {
        await tx.execute(sql`UPDATE validra_schedule_jobs SET state=${state},result_code=${code},
          appointment_id=${appointmentId},lease_token=NULL,lease_until=NULL
          WHERE registration_id=${job.registration_id} AND lease_token=${job.leaseToken}`);
      };
      const [rows] = await tx.execute(sql`SELECT s.snapshot_json,a.purchase_digest,a.customer_id,a.amount_cents,
        r.phone AS order_phone,r.deletedAt AS order_deleted,c.phone AS customer_phone,c.blocked,c.deletedAt AS customer_deleted
        FROM validra_cart_snapshots s INNER JOIN validra_checkout_attempts a ON a.external_id=s.external_id
        INNER JOIN validra_cart_orders o ON o.external_id=s.external_id
        INNER JOIN accessCodePhones r ON r.id=o.registration_id
        INNER JOIN customers c ON c.id=a.customer_id
        WHERE s.external_id=${job.external_id} AND a.state='consumed'
          AND o.item_index=${job.item_index} AND o.registration_id=${job.registration_id}`);
      const binding = (rows as unknown as Binding[])[0];
      if (!binding) { await finish("review","order_binding_missing"); return; }
      let snapshot: ValidraCartSnapshot;
      try { snapshot=JSON.parse(binding.snapshot_json); }
      catch { await finish("review","snapshot_invalid"); return; }
      const index=Number(job.item_index);
      const item=snapshot.quote?.items?.[index], order=snapshot.orders?.[index];
      const phone=snapshot.quote?.phone;
      if (!item || !order || validraPurchaseDigest(snapshot)!==binding.purchase_digest ||
          snapshot.quote.customerId!==Number(binding.customer_id) || snapshot.quote.amountCents!==Number(binding.amount_cents) ||
          typeof phone!=="string" || !phone || order.effectivePhone!==phone ||
          binding.order_phone.replace(/\D/g,"")!==phone || binding.customer_phone.replace(/\D/g,"")!==phone ||
          binding.order_deleted || binding.customer_deleted || Number(binding.blocked)!==0 ||
          !Number.isSafeInteger(item.optionId) || item.optionId<=0 || item.productId!==order.productId) {
        await finish("review","order_binding_conflict"); return;
      }
      // Preserve ANY existing appointment, including confirmed, cancelled and completed.
      const [existing]=await tx.execute(sql`SELECT id FROM scheduleAppointments
        WHERE registrationId=${job.registration_id} AND subOrderIndex=0 ORDER BY id DESC LIMIT 1 FOR UPDATE`);
      const prior=(existing as unknown as Array<{id:number}>)[0];
      if (prior) { await finish("done","existing_appointment",Number(prior.id)); return; }
      const [options]=await tx.execute(sql`SELECT productId,autoScheduleEnabled FROM productOptions WHERE id=${item.optionId}`);
      const option=(options as unknown as Array<{productId:number;autoScheduleEnabled:number}>)[0];
      if (!option || Number(option.productId)!==item.productId) { await finish("review","option_binding_conflict"); return; }
      if (Number(option.autoScheduleEnabled)!==1) { await finish("done","option_disabled"); return; }

      const schedule=scheduleOverride??(await import("./autoSchedule")).ensureAutomaticScheduleForOrder;
      const result=await schedule({
        registrationId:Number(job.registration_id),customerPhone:phone,optionId:item.optionId,
        customerName:order.clientName?.slice(0,128)??null,serviceName:item.serviceName,subOrderIndex:0,
      },{
        createAppointment:async data=>{
          if(data.registrationId!==Number(job.registration_id)||data.subOrderIndex!==0||data.customerPhone!==phone)
            throw new Error("validra_schedule_binding_conflict");
          // The existing routine performs policy checks; only its insert is
          // redirected here. No email or provider request in this transaction.
          const [inserted]=await tx.insert(scheduleAppointments).values({
            token:data.token,registrationId:data.registrationId,subOrderIndex:data.subOrderIndex,
            customerPhone:data.customerPhone,customerName:data.customerName?.slice(0,128)??null,
            customerEmail:data.customerEmail??null,customerPhotoUrl:data.customerPhotoUrl??null,
            serviceName:data.serviceName??null,instructions:data.instructions??null,templateId:data.templateId??null,status:"pending",
          });
          const [appointment]=await tx.select().from(scheduleAppointments).where(eq(scheduleAppointments.id,Number(inserted.insertId))).limit(1);
          if(!appointment)throw new Error("validra_schedule_insert_failed");
          return appointment;
        },
      });
      await finish("done",result.appointmentId?(result.created?"created":"existing_appointment"):"not_required",result.appointmentId??null);
    });
  } catch {
    // The appointment insert rolled back with the job completion. A failed
    // retry cannot overwrite a newer lease, and exhausted jobs remain visible.
    const exhausted=job.attempts>=12;
    const delay=Math.min(3600,Math.max(10,2**Math.min(job.attempts,10)));
    await db.execute(sql`UPDATE validra_schedule_jobs SET state=${exhausted?"review":"queued"},
      result_code=${exhausted?"retries_exhausted":"temporary_failure"},
      next_run_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ${delay} SECOND),lease_token=NULL,lease_until=NULL
      WHERE registration_id=${job.registration_id} AND lease_token=${job.leaseToken}`);
  }
  return true;
}
