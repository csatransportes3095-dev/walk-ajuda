import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb, getOrderStatusFlowDefinition, getDefaultOrderStatusFlowId, listOrderStatusTypes, getOrderStatusFlowForOrder } from "./db";
import { DEFAULT_STATUS_VISIBILITY, type StatusVisibilityPolicy, type StatusVisibilityMode } from "../shared/orderStatusVisibility";

let initialized: Promise<void> | null = null;
async function ensureTable() {
  if (!initialized) initialized=(async()=>{
    const db=await getDb();
    if(!db)throw new Error("Banco indisponível");
    await db.execute(sql`CREATE TABLE IF NOT EXISTS orderStatusVisibilityRules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      flowId INT NOT NULL,
      currentStatusKey VARCHAR(64) NOT NULL,
      mode VARCHAR(24) NOT NULL DEFAULT 'normal',
      hiddenKeysJson TEXT NOT NULL,
      showNextStep TINYINT NOT NULL DEFAULT 1,
      showProgress TINYINT NOT NULL DEFAULT 1,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_order_status_visibility (flowId, currentStatusKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  })().catch(e=>{initialized=null;throw e;});
  return initialized;
}
const parseKeys=(value:unknown):string[]=>{
  try {const a=JSON.parse(String(value??"[]"));return Array.isArray(a)?a.filter((v):v is string=>typeof v==="string"):[];}catch{return [];}
};
const toPolicy=(row:any):StatusVisibilityPolicy=>({
  mode: (["normal","hide_selected","current_only"].includes(row.mode)?row.mode:"normal") as StatusVisibilityMode,
  hiddenStatusKeys:parseKeys(row.hiddenKeysJson),
  showNextStep:Number(row.showNextStep)!==0,
  showProgress:Number(row.showProgress)!==0,
});
export async function getStatusVisibilityRule(flowId:number,currentStatusKey:string):Promise<StatusVisibilityPolicy>{
  await ensureTable();
  const db=await getDb();if(!db)throw new Error("Banco indisponível");
  const r=await db.execute(sql`SELECT mode,hiddenKeysJson,showNextStep,showProgress FROM orderStatusVisibilityRules WHERE flowId=${flowId} AND currentStatusKey=${currentStatusKey} LIMIT 1`);
  return (r[0] as any[])[0]?toPolicy((r[0] as any[])[0]):DEFAULT_STATUS_VISIBILITY;
}
export async function listStatusVisibilityRules(flowId:number){
  await ensureTable();const db=await getDb();if(!db)throw new Error("Banco indisponível");
  const r=await db.execute(sql`SELECT currentStatusKey,mode,hiddenKeysJson,showNextStep,showProgress FROM orderStatusVisibilityRules WHERE flowId=${flowId}`);
  return (r[0] as any[]).map(row=>({currentStatusKey:row.currentStatusKey,...toPolicy(row)}));
}
export async function saveStatusVisibilityRule(input:{flowId:number;currentStatusKey:string}&StatusVisibilityPolicy) {
  await ensureTable();
  const flow=await getOrderStatusFlowDefinition(input.flowId);
  if(!flow)throw new TRPCError({code:"NOT_FOUND",message:"Sequência não encontrada"});
  const catalog=await listOrderStatusTypes();
  const active=new Set(catalog.filter(s=>s.isActive===1).map(s=>s.key));
  const allowed=new Set(flow.isDefault===1?catalog.filter(s=>s.isActive===1&&s.isGlobal===1).map(s=>s.key):flow.statusKeys);
  if(!active.has(input.currentStatusKey)||!allowed.has(input.currentStatusKey))throw new TRPCError({code:"BAD_REQUEST",message:"Status atual não pertence à sequência."});
  const hidden=[...new Set(input.hiddenStatusKeys)];
  if(hidden.some(key=>key===input.currentStatusKey||!active.has(key)||!allowed.has(key)))throw new TRPCError({code:"BAD_REQUEST",message:"Etapa oculta inválida ou igual à atual."});
  const db=await getDb();if(!db)throw new Error("Banco indisponível");
  await db.execute(sql`INSERT INTO orderStatusVisibilityRules (flowId,currentStatusKey,mode,hiddenKeysJson,showNextStep,showProgress)
    VALUES (${input.flowId},${input.currentStatusKey},${input.mode},${JSON.stringify(hidden)},${input.showNextStep?1:0},${input.showProgress?1:0})
    ON DUPLICATE KEY UPDATE mode=VALUES(mode),hiddenKeysJson=VALUES(hiddenKeysJson),showNextStep=VALUES(showNextStep),showProgress=VALUES(showProgress)`);
  return {success:true};
}
export async function getOrderStatusVisibilityForClient(registrationId:number,orderNumber:number|null,currentStatusKey:string){
  const flow=await getOrderStatusFlowForOrder(registrationId,orderNumber);
  const flowId=flow?.id??await getDefaultOrderStatusFlowId();
  return getStatusVisibilityRule(flowId,currentStatusKey);
}
