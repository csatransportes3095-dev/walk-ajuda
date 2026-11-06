import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeLocadoraPrivateFile, readLocadoraPrivateFile, deleteLocadoraPrivateFile } from "../locadora/storage";

const run = promisify(execFile);
const PDF_LIMIT = 10 * 1024 * 1024;
const PDF_BASE64_LIMIT = 14_100_000;
type FieldKey = "plate" | "renavam" | "chassis" | "model" | "color" | "manufactureYear" | "modelYear";
const fields: FieldKey[] = ["plate", "renavam", "chassis", "model", "color", "manufactureYear", "modelYear"];
const clean = (value: unknown) => String(value ?? "").trim().toUpperCase();
const onlyId = (value: unknown) => clean(value).replace(/[^A-Z0-9]/g, "");
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const rows = (result: any): any[] => Array.isArray(result?.[0]) ? result[0] : [];

let schemaPromise: Promise<void> | null = null;
async function database() {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS vehicle_usage_registry (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          type VARCHAR(16) NOT NULL,
          normalizedValue VARCHAR(40) NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_vehicle_usage_type_value (type, normalizedValue),
          KEY idx_vehicle_usage_value (normalizedValue)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS vehicle_vault_documents (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          plate VARCHAR(7) NOT NULL,
          renavam VARCHAR(20) NOT NULL,
          chassis VARCHAR(30) NOT NULL,
          model VARCHAR(160) NOT NULL,
          color VARCHAR(48) NOT NULL,
          manufactureYear SMALLINT NOT NULL,
          modelYear SMALLINT NOT NULL,
          sourceText LONGTEXT NOT NULL,
          inactive TINYINT NOT NULL DEFAULT 0,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_vehicle_vault_plate (plate),
          KEY idx_vehicle_vault_chassis (chassis),
          KEY idx_vehicle_vault_renavam (renavam),
          KEY idx_vehicle_vault_model (model),
          KEY idx_vehicle_vault_color (color)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS vehicle_vault_pdf_files (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          vehicleId INT NOT NULL,
          storageKey VARCHAR(512) NOT NULL,
          filename VARCHAR(220) NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_vehicle_vault_pdf_vehicle (vehicleId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS vehicle_vault_clients (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          vehicleId INT NOT NULL,
          customerId INT NOT NULL,
          linkedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          unlinkedAt TIMESTAMP NULL,
          UNIQUE KEY uq_vehicle_vault_client (vehicleId, customerId),
          KEY idx_vehicle_vault_client_customer (customerId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS vehicle_vault_history (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          vehicleId INT NOT NULL,
          customerId INT NULL,
          event VARCHAR(32) NOT NULL,
          happenedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_vehicle_vault_history_vehicle (vehicleId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `));
    })().catch((error) => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
  return db;
}
function extractValue(lines: string[], labels: RegExp, pattern: RegExp): string {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(labels);
    if (!match) continue;
    const candidates = [match[1] ?? "", lines[i + 1] ?? "", lines[i + 2] ?? ""];
    for (const candidate of candidates) {
      const result = candidate.match(pattern);
      if (result) return String(result[1] ?? result[0] ?? "").trim();
    }
  }
  return "";
}
function extractFields(raw: string) {
  const original = String(raw ?? "").slice(0, 120_000);
  const ascii = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const lines = ascii.replace(/\r/g, "").split("\n").map(x => x.trim()).filter(Boolean);
  const plate = extractValue(lines,
    /^(?:PLACA(?:\s+DO\s+VEICULO)?|PLACA\s*\/\s*UF)\s*[:\-\s]*(.*)$/i,
    /\b([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})\b/i).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const renavam = digits(extractValue(lines,
    /^(?:CODIGO\s+)?RENAVAM\s*[:\-\s]*(.*)$/i, /\b(\d{9,11})\b/));
  const chassis = onlyId(extractValue(lines,
    /^(?:CHASSI|VIN|NUMERO\s+DO\s+CHASSI)\s*[:\-\s]*(.*)$/i, /\b([A-Z0-9]{8,30})\b/i));
  const model = clean(extractValue(lines,
    /^(?:MARCA\s*[\/\\-]\s*MODELO|MARCA\s+E\s+MODELO|MODELO\s+DO\s+VEICULO)\s*[:\-\s]*(.*)$/i,
    /^([A-Z0-9][A-Z0-9 /_.+-]{2,159})$/i).replace(/\s{2,}(?:ANO|COR|TIPO|CHASSI|RENAVAM).*$/i, ""));
  const color = clean(extractValue(lines,
    /^(?:COR(?:\s+PREDOMINANTE)?|COR\s*\/\s*TIPO)\s*[:\-\s]*(.*)$/i,
    /\b(BRANC[AO]|PRET[AO]|CINZA|PRATA|AZUL|VERMELH[AO]|VERDE|AMAREL[AO]|MARROM|BEGE|DOURAD[AO]|LARANJA|ROSA|ROXO|VINHO|GRAFITE|BORDO)\b/i));
  const fab = extractValue(lines,
    /^(?:ANO\s+(?:DE\s+)?FABRICACAO|ANO\s+FABR\.?|FABRICACAO)\s*[:\-\s]*(.*)$/i,
    /\b((?:19|20)\d{2})\b/);
  const mod = extractValue(lines,
    /^(?:ANO\s+(?:DO\s+)?MODELO|ANO\s+MOD\.?)\s*[:\-\s]*(.*)$/i,
    /\b((?:19|20)\d{2})\b/);
  const pair = ascii.match(/(?:ANO\s+)?FAB(?:RICACAO)?\s*[\/-]\s*MOD(?:ELO)?\s*:?\s*((?:19|20)\d{2})\s*[\/-]\s*((?:19|20)\d{2})/i);
  const manufactureYear = Number(fab || pair?.[1] || 0) || null;
  const modelYear = Number(mod || pair?.[2] || 0) || null;
  const result = { plate, renavam, chassis, model, color, manufactureYear, modelYear };
  return { ...result, text: original, missing: fields.filter(key => !result[key]) };
}
async function readPdf(base64: string) {
  if (base64.length > PDF_BASE64_LIMIT) throw new TRPCError({ code: "BAD_REQUEST", message: "PDF acima do limite de 10 MB." });
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 8 || buffer.length > PDF_LIMIT || buffer.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new TRPCError({ code: "BAD_REQUEST", message: "Envie um documento PDF válido de até 10 MB." });
  const dir = await mkdtemp(join(tmpdir(), "cofre-pdf-"));
  const file = join(dir, "documento.pdf");
  try {
    await writeFile(file, buffer);
    let text = "";
    try {
      const output = await run("pdftotext", ["-f", "1", "-l", "5", "-layout", file, "-"], { timeout: 25_000, maxBuffer: 3_000_000 });
      text = output.stdout;
    } catch {}
    let found = extractFields(text);
    if (found.missing.length > 2) {
      try {
        const prefix = join(dir, "pagina");
        await run("pdftoppm", ["-f", "1", "-l", "3", "-scale-to", "1800", "-png", file, prefix], { timeout: 40_000, maxBuffer: 1_000_000 });
        const pages = (await readdir(dir)).filter(name => /^pagina-\d+\.png$/.test(name)).sort();
        const ocr: string[] = [];
        for (const name of pages.slice(0, 3)) {
          const result = await run("tesseract", [join(dir, name), "stdout", "-l", "por+eng"], { timeout: 25_000, maxBuffer: 2_000_000 });
          ocr.push(result.stdout);
        }
        const combined = [text, ...ocr].filter(Boolean).join("\n");
        const second = extractFields(combined);
        if (second.missing.length < found.missing.length) {
          text = combined;
          found = second;
        }
      } catch {}
    }
    if (!text.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ler o PDF. Cole o texto ou use outro arquivo." });
    return found;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const fieldSchema = z.object({
  id: z.number().int().positive().optional(),
  plate: z.string().min(1).max(20),
  renavam: z.string().min(1).max(30),
  chassis: z.string().min(1).max(45),
  model: z.string().min(1).max(160),
  color: z.string().min(1).max(48),
  manufactureYear: z.number().int().min(1900).max(2100),
  modelYear: z.number().int().min(1900).max(2100),
  sourceText: z.string().max(120_000).default(""),
  pdfBase64: z.string().min(30).max(PDF_BASE64_LIMIT).optional(),
  pdfFilename: z.string().max(220).optional(),
}).strict();
function tokensFromQuery(value: string) {
  const stripped = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/\b(?:FABRICACAO|ANO\s+FAB|FABR)\s+(19\d{2}|20\d{2})\b/g, " ")
    .replace(/\b(?:ANO\s+(?:DO\s+)?MODELO|MODELO\s+ANO)\s+(19\d{2}|20\d{2})\b/g, " ");
  return stripped.split(/[^A-Z0-9]+/).filter(Boolean)
    .filter(word => !new Set(["QUERO","UM","UMA","DE","DO","DA","DOS","DAS","OS","AS","TODOS","TODAS",
      "VEICULOS","CARROS","BUSCAR","PESQUISAR","MOSTRAR","ME","ANO","COR","MODELO"]).has(word))
    .slice(0, 8);
}
export const vehicleVaultRouter = router({
  previewText: adminProcedure.input(z.object({ text: z.string().min(5).max(120_000) }))
    .mutation(({ input }) => extractFields(input.text)),
  previewPdf: adminProcedure.input(z.object({ base64: z.string().min(30).max(PDF_BASE64_LIMIT) }))
    .mutation(async ({ input }) => readPdf(input.base64)),
  search: adminProcedure.input(z.object({
    query:z.string().max(160).default(""),
    color:z.string().max(48).default(""),
    model:z.string().max(160).default(""),
    manufactureYear:z.number().int().min(1900).max(2100).optional(),
    modelYear:z.number().int().min(1900).max(2100).optional(),
    status:z.enum(["all","available","in_use","used","inactive"]).default("all"),
    limit:z.number().int().min(1).max(150).default(100),
  }).strict()).query(async ({ input }) => {
    const db=await database();
    const normalized=input.query.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const fabFromQuery = normalized.match(/\b(?:FABRICACAO|ANO\s+FAB|FABR)\s+(19\d{2}|20\d{2})\b/)?.[1];
    const modFromQuery = normalized.match(/\b(?:ANO\s+(?:DO\s+)?MODELO|MODELO\s+ANO)\s+(19\d{2}|20\d{2})\b/)?.[1];
    const yearF=input.manufactureYear||Number(fabFromQuery)||0;
    const yearM=input.modelYear||Number(modFromQuery)||0;
    const filters: any[]=[sql`1=1`];
    for(const term of tokensFromQuery(input.query)) {
      const v="%"+term+"%";
      filters.push(sql`(d.plate LIKE ${v} OR d.renavam LIKE ${v} OR d.chassis LIKE ${v}
        OR d.model LIKE ${v} OR d.color LIKE ${v}
        OR CAST(d.manufactureYear AS CHAR) LIKE ${v} OR CAST(d.modelYear AS CHAR) LIKE ${v})`);
    }
    if(input.color.trim())filters.push(sql`d.color LIKE ${"%"+clean(input.color)+"%"}`);
    if(input.model.trim())filters.push(sql`d.model LIKE ${"%"+clean(input.model)+"%"}`);
    if(yearF)filters.push(sql`d.manufactureYear=${yearF}`);
    if(yearM)filters.push(sql`d.modelYear=${yearM}`);
    if(input.status==="inactive")filters.push(sql`d.inactive=1`);
    if(input.status==="available")filters.push(sql`d.inactive=0 AND NOT EXISTS
      (SELECT 1 FROM vehicle_vault_clients a WHERE a.vehicleId=d.id AND a.unlinkedAt IS NULL)`);
    if(input.status==="in_use")filters.push(sql`d.inactive=0 AND EXISTS
      (SELECT 1 FROM vehicle_vault_clients a WHERE a.vehicleId=d.id AND a.unlinkedAt IS NULL)`);
    if(input.status==="used")filters.push(sql`EXISTS
      (SELECT 1 FROM vehicle_vault_history h WHERE h.vehicleId=d.id AND h.event='linked')`);
    const result=await db.execute(sql`
      SELECT d.id,d.plate,d.renavam,d.chassis,d.model,d.color,d.manufactureYear,d.modelYear,d.inactive,d.updatedAt,
        (SELECT COUNT(*) FROM vehicle_vault_clients a WHERE a.vehicleId=d.id AND a.unlinkedAt IS NULL) activeClients,
        (SELECT COUNT(*) FROM vehicle_vault_history h WHERE h.vehicleId=d.id AND h.event='linked') usageCount,
        (SELECT COUNT(*) FROM vehicle_vault_pdf_files p WHERE p.vehicleId=d.id) pdfCount,
        EXISTS(SELECT 1 FROM vehicle_usage_registry v WHERE v.type='chassi' AND v.normalizedValue=d.chassis) chassisUsed
      FROM vehicle_vault_documents d
      WHERE ${sql.join(filters, sql` AND `)}
      ORDER BY d.updatedAt DESC LIMIT ${input.limit}
    `);
    return rows(result).map(row=>({...row, id:Number(row.id),activeClients:Number(row.activeClients||0),
      usageCount:Number(row.usageCount||0),pdfCount:Number(row.pdfCount||0),chassisUsed:Boolean(row.chassisUsed)}));
  }),
  save: adminProcedure.input(fieldSchema).mutation(async ({ input }) => {
    const db=await database();
    const plate=onlyId(input.plate),renavam=digits(input.renavam),chassis=onlyId(input.chassis);
    const model=clean(input.model),color=clean(input.color);
    if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))throw new TRPCError({code:"BAD_REQUEST",message:"Placa inválida."});
    if(!/^\d{9,11}$/.test(renavam))throw new TRPCError({code:"BAD_REQUEST",message:"Renavam inválido."});
    if(!/^[A-Z0-9]{8,30}$/.test(chassis))throw new TRPCError({code:"BAD_REQUEST",message:"Chassi inválido."});
    if(!model||!color)throw new TRPCError({code:"BAD_REQUEST",message:"Informe modelo e cor."});
    const duplicate=rows(await db.execute(sql`SELECT id FROM vehicle_vault_documents WHERE plate=${plate} LIMIT 1`))[0];
    if(duplicate&&Number(duplicate.id)!==input.id)throw new TRPCError({code:"CONFLICT",
      message:"Esta placa já está no Cofre. Abra o registro existente para editar ou anexar outro PDF."});
    if(input.id){
      const exists=rows(await db.execute(sql`SELECT id FROM vehicle_vault_documents WHERE id=${input.id} LIMIT 1`))[0];
      if(!exists)throw new TRPCError({code:"NOT_FOUND",message:"Documento não encontrado."});
    }
    let key:string|null=null;
    try{
      if(input.pdfBase64){
        const buffer=Buffer.from(input.pdfBase64,"base64");
        if(buffer.length<8||buffer.length>PDF_LIMIT||buffer.subarray(0,5).toString("ascii")!=="%PDF-")
          throw new TRPCError({code:"BAD_REQUEST",message:"PDF inválido ou acima de 10 MB."});
        const stored=await storeLocadoraPrivateFile(0,"cofre_frota",{buffer,mimeType:"application/pdf",extension:"pdf"});
        key=stored.storageKey;
      }
      let id=input.id||0;
      if(id){
        await db.execute(sql`UPDATE vehicle_vault_documents SET
          plate=${plate},renavam=${renavam},chassis=${chassis},model=${model},color=${color},
          manufactureYear=${input.manufactureYear},modelYear=${input.modelYear},sourceText=${input.sourceText}
          WHERE id=${id}`);
      }else{
        const created=await db.execute(sql`INSERT INTO vehicle_vault_documents
          (plate,renavam,chassis,model,color,manufactureYear,modelYear,sourceText)
          VALUES (${plate},${renavam},${chassis},${model},${color},
          ${input.manufactureYear},${input.modelYear},${input.sourceText})`);
        id=Number((created[0] as any)?.insertId||0);
      }
      if(!id)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Falha ao guardar veículo."});
      await db.execute(sql`INSERT INTO vehicle_vault_history(vehicleId,event) VALUES (${id},${input.id?"edited":"created"})`);
      if(key){
        const filename=(input.pdfFilename||plate+".pdf").replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").slice(0,220);
        await db.execute(sql`INSERT INTO vehicle_vault_pdf_files(vehicleId,storageKey,filename)
          VALUES (${id},${key},${filename})`);
        key=null;
      }
      return {saved:true,id};
    }catch(error){
      if(key)await deleteLocadoraPrivateFile(key).catch(()=>undefined);
      throw error;
    }
  }),
  details: adminProcedure.input(z.object({id:z.number().int().positive()})).query(async ({input})=>{
    const db=await database();
    const doc=rows(await db.execute(sql`SELECT id,plate,renavam,chassis,model,color,
      manufactureYear,modelYear,sourceText,inactive,createdAt,updatedAt
      FROM vehicle_vault_documents WHERE id=${input.id} LIMIT 1`))[0];
    if(!doc)throw new TRPCError({code:"NOT_FOUND",message:"Veículo não encontrado."});
    const [linked,history,pdfs]=await Promise.all([
      db.execute(sql`SELECT l.id,l.customerId,l.linkedAt,l.unlinkedAt,c.name,c.phone,c.customerNumber,c.cpf
        FROM vehicle_vault_clients l LEFT JOIN customers c ON c.id=l.customerId
        WHERE l.vehicleId=${input.id} ORDER BY (l.unlinkedAt IS NULL) DESC,l.linkedAt DESC`),
      db.execute(sql`SELECT h.id,h.event,h.happenedAt,h.customerId,c.name customerName
        FROM vehicle_vault_history h LEFT JOIN customers c ON c.id=h.customerId
        WHERE h.vehicleId=${input.id} ORDER BY h.id DESC LIMIT 150`),
      db.execute(sql`SELECT id,filename,createdAt FROM vehicle_vault_pdf_files
        WHERE vehicleId=${input.id} ORDER BY id DESC LIMIT 30`),
    ]);
    return {...doc,id:Number(doc.id),inactive:Boolean(doc.inactive),
      links:rows(linked).map(x=>({...x,id:Number(x.id),customerId:Number(x.customerId)})),
      history:rows(history),pdfs:rows(pdfs).map(x=>({...x,id:Number(x.id)}))};
  }),
  findCustomers: adminProcedure.input(z.object({query:z.string().min(2).max(100)}))
    .query(async ({input})=>{
      const db=await database();
      const q="%"+input.query.trim()+"%";
      const found=await db.execute(sql`SELECT id,customerNumber,name,phone,cpf
        FROM customers WHERE deletedAt IS NULL AND
        (name LIKE ${q} OR phone LIKE ${q} OR cpf LIKE ${q} OR CAST(customerNumber AS CHAR) LIKE ${q})
        ORDER BY name LIMIT 25`);
      return rows(found).map(x=>({...x,id:Number(x.id)}));
    }),
  linkCustomer: adminProcedure.input(z.object({
    vehicleId:z.number().int().positive(),customerId:z.number().int().positive(),
  })).mutation(async ({input})=>{
    const db=await database();
    const doc=rows(await db.execute(sql`SELECT id,inactive FROM vehicle_vault_documents WHERE id=${input.vehicleId} LIMIT 1`))[0];
    if(!doc)throw new TRPCError({code:"NOT_FOUND",message:"Veículo não encontrado."});
    if(Number(doc.inactive))throw new TRPCError({code:"CONFLICT",message:"Reative o documento antes de vincular."});
    const customer=rows(await db.execute(sql`SELECT id FROM customers WHERE id=${input.customerId} AND deletedAt IS NULL LIMIT 1`))[0];
    if(!customer)throw new TRPCError({code:"NOT_FOUND",message:"Cliente não encontrado no cadastro principal."});
    const old=rows(await db.execute(sql`SELECT id,unlinkedAt FROM vehicle_vault_clients
      WHERE vehicleId=${input.vehicleId} AND customerId=${input.customerId} LIMIT 1`))[0];
    if(old&&!old.unlinkedAt)return {linked:true,already:true};
    if(old)await db.execute(sql`UPDATE vehicle_vault_clients SET linkedAt=NOW(),unlinkedAt=NULL WHERE id=${Number(old.id)}`);
    else await db.execute(sql`INSERT INTO vehicle_vault_clients(vehicleId,customerId) VALUES (${input.vehicleId},${input.customerId})`);
    await db.execute(sql`INSERT INTO vehicle_vault_history(vehicleId,customerId,event)
      VALUES (${input.vehicleId},${input.customerId},'linked')`);
    return {linked:true,already:false};
  }),
  unlinkCustomer: adminProcedure.input(z.object({
    vehicleId:z.number().int().positive(),customerId:z.number().int().positive(),
  })).mutation(async ({input})=>{
    const db=await database();
    const updated=await db.execute(sql`UPDATE vehicle_vault_clients SET unlinkedAt=NOW()
      WHERE vehicleId=${input.vehicleId} AND customerId=${input.customerId} AND unlinkedAt IS NULL`);
    const changed=Number((updated[0] as any)?.affectedRows||0)>0;
    if(changed)await db.execute(sql`INSERT INTO vehicle_vault_history(vehicleId,customerId,event)
      VALUES (${input.vehicleId},${input.customerId},'unlinked')`);
    return {unlinked:changed};
  }),
  setInactive: adminProcedure.input(z.object({
    id:z.number().int().positive(),inactive:z.boolean(),
  })).mutation(async ({input})=>{
    const db=await database();
    const updated=await db.execute(sql`UPDATE vehicle_vault_documents SET inactive=${input.inactive?1:0} WHERE id=${input.id}`);
    if(!Number((updated[0] as any)?.affectedRows))throw new TRPCError({code:"NOT_FOUND",message:"Veículo não encontrado."});
    await db.execute(sql`INSERT INTO vehicle_vault_history(vehicleId,event)
      VALUES (${input.id},${input.inactive?"inactivated":"reactivated"})`);
    return {success:true};
  }),
  openPdf: adminProcedure.input(z.object({
    vehicleId:z.number().int().positive(),pdfId:z.number().int().positive(),
  })).mutation(async ({input})=>{
    const db=await database();
    const found=rows(await db.execute(sql`SELECT storageKey,filename FROM vehicle_vault_pdf_files
      WHERE vehicleId=${input.vehicleId} AND id=${input.pdfId} LIMIT 1`))[0];
    if(!found)throw new TRPCError({code:"NOT_FOUND",message:"PDF não encontrado no veículo."});
    const pdf=await readLocadoraPrivateFile(String(found.storageKey),"application/pdf");
    return {filename:String(found.filename),mimeType:"application/pdf" as const,base64:pdf.buffer.toString("base64")};
  }),
});
