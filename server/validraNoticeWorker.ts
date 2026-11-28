import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb,getSetting } from "./db";
import { publicSiteUrl } from "../shared/publicLinks";
import type { ValidraTransaction } from "./validraOrderPersistence";
type DB=NonNullable<Awaited<ReturnType<typeof getDb>>>;
type NoticeKind="admin"|"customer";
type Job={external_id:string;recipient_kind:NoticeKind;lease_token:string};
type Mail={to:string;subject:string;html:string;key:string};
type Send=(mail:Mail)=>Promise<void>;

export async function ensureValidraNoticeStorage(db:DB){
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_notice_jobs(
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recipient_kind VARCHAR(16) NOT NULL,state VARCHAR(24) NOT NULL DEFAULT 'queued',
    lease_token VARCHAR(36),lease_until DATETIME(3),result_code VARCHAR(64),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),accepted_at DATETIME(3),
    PRIMARY KEY(external_id,recipient_kind),KEY validra_notice_state(state,created_at)
  ) ENGINE=InnoDB`);
}
export async function enqueueValidraPaidNotices(tx:ValidraTransaction,externalId:string){
  await tx.execute(sql`INSERT INTO validra_notice_jobs(external_id,recipient_kind)
    VALUES(${externalId},'admin'),(${externalId},'customer')`);
}
function validEmail(value:unknown){
  const email=String(value||"").trim();
  return email.length<=320&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)?email:null;
}

/** One channel only. Do not use automatic SMTP fallback after an ambiguous
 * HTTP response, since it can deliver a second copy of the same notice. */
async function sendValidraNotice(mail:Mail){
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey)throw new Error("validra_notice_channel_unavailable");
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",signal:AbortSignal.timeout(20000),
    headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json","Idempotency-Key":mail.key},
    body:JSON.stringify({from:process.env.SMTP_FROM||process.env.SMTP_USER||"h2@h2colombiano.com",to:[mail.to],subject:mail.subject,html:mail.html}),
  });
  if(!response.ok)throw new Error("validra_notice_delivery_uncertain");
}
export async function processNextValidraNotice(overrides?:{send:Send;adminEmail:string}){
  const db=await getDb();if(!db)throw new Error("validra_database_unavailable");
  await ensureValidraNoticeStorage(db);
  // A process may have died after delivery; never automatically resend a
  // potentially accepted email. Keep uncertain deliveries visible for review.
  await db.execute(sql`UPDATE validra_notice_jobs SET state='review',result_code='delivery_uncertain',lease_token=NULL,lease_until=NULL
    WHERE state='sending' AND lease_until<CURRENT_TIMESTAMP(3)`);
  if(!overrides&&!process.env.RESEND_API_KEY)return false;
  const job=await db.transaction(async tx=>{
    const [rows]=await tx.execute(sql`SELECT n.external_id,n.recipient_kind FROM validra_notice_jobs n
      INNER JOIN validra_checkout_attempts a ON a.external_id=n.external_id AND a.state='consumed'
      WHERE n.state='queued' ORDER BY n.created_at,n.external_id,n.recipient_kind LIMIT 1 FOR UPDATE SKIP LOCKED`);
    const row=(rows as unknown as Omit<Job,"lease_token">[])[0];if(!row)return null;
    const token=randomUUID();
    await tx.execute(sql`UPDATE validra_notice_jobs SET state='sending',lease_token=${token},lease_until=CURRENT_TIMESTAMP(3)+INTERVAL 90 SECOND
      WHERE external_id=${row.external_id} AND recipient_kind=${row.recipient_kind}`);
    return {...row,lease_token:token};
  },{isolationLevel:"read committed"});
  if(!job)return false;
  const finish=async(state:"accepted"|"review"|"skipped",code:string)=>{
    await db.execute(sql`UPDATE validra_notice_jobs SET state=${state},result_code=${code},
      accepted_at=IF(${state}='accepted',CURRENT_TIMESTAMP(3),NULL),lease_token=NULL,lease_until=NULL
      WHERE external_id=${job.external_id} AND recipient_kind=${job.recipient_kind} AND state='sending' AND lease_token=${job.lease_token}`);
  };
  try{
    const [orders]=await db.execute(sql`SELECT o.order_number,c.id,c.phone,c.email,c.blocked,c.deletedAt
      FROM validra_cart_orders o JOIN validra_checkout_attempts a ON a.external_id=o.external_id
      JOIN customers c ON c.id=a.customer_id
      WHERE o.external_id=${job.external_id} AND a.state='consumed' ORDER BY o.item_index`);
    const rows=orders as unknown as Array<{order_number:number;id:number;phone:string;email:string|null;blocked:number;deletedAt:unknown}>;
    if(!rows.length||rows.some(row=>!Number.isSafeInteger(Number(row.order_number))||Number(row.order_number)<=0)){
      await finish("review","order_binding_missing");return true;
    }
    let to:string|null;
    if(job.recipient_kind==="admin"){
      to=validEmail(overrides?.adminEmail??await getSetting("email_to")??"");
      if(!to){await finish("review","admin_email_unavailable");return true;}
    }else{
      const customer=rows[0];
      to=validEmail(customer.email);
      if(!to||customer.blocked||customer.deletedAt){await finish("skipped","customer_email_unavailable");return true;}
      const [duplicate]=await db.execute(sql`SELECT id FROM customers WHERE deletedAt IS NULL AND id<>${customer.id}
        AND LOWER(TRIM(email))=${to.toLowerCase()} LIMIT 1`);
      if((duplicate as unknown[]).length){await finish("review","customer_email_conflict");return true;}
    }
    // Do not send documents, answers, phone, QR, payment details or agenda
    // tokens in email. Customers authenticate again at order tracking.
    const subject="H2 COLOMBIANO — pagamento confirmado";
    const html="<p>Pagamento Pix confirmado. "+rows.length+" pedido(s) registrado(s).</p>"+
      (job.recipient_kind==="admin"?"<p>Consulte o painel administrativo para conferir os pedidos.</p>":
      '<p>Acesse <a href="'+publicSiteUrl("/acompanhar")+'">Acompanhar Pedido</a> com sua conta.</p>');
    await (overrides?.send??sendValidraNotice)({to,subject,html,key:"validra-paid-"+job.external_id+"-"+job.recipient_kind});
    await finish("accepted","transport_accepted");
  }catch{await finish("review","delivery_uncertain");}
  return true;
}
