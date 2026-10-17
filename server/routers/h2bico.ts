import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isValidCpf } from "../../client/src/lib/h2bicoCpfExtractor";
import { parseScreenshotTsv, normalizeScreenshotName, isReviewableName } from "../h2bicoScreenshotOcr";
import { alignScreenshotPhotoCrops } from "../h2bicoScreenshotCrop";
import { suggestCpfFromMisreadDigits } from "../h2bicoCpfOcrSuggestion";
import { autoReadCpfLine } from "../h2bicoScreenshotAutoCpf";
const execFileAsync = promisify(execFile);
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { ensureH2BicoReviewSchema } from "../h2bicoReview";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h2bico_records (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      cpf VARCHAR(11) NOT NULL UNIQUE,
      uf VARCHAR(2) NULL,
      photoUrl TEXT NOT NULL,
      originalFilename VARCHAR(512) NULL,
      notes TEXT NULL,
      source VARCHAR(255) NULL,
      status ENUM('available','reserved','in_use','used','archived') NOT NULL DEFAULT 'available',
      linkedOrder VARCHAR(64) NULL,
      lastSimilarity DECIMAL(5,2) NULL,
      usedAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_h2bico_name (name),
      INDEX idx_h2bico_status (status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  for (const definition of [
    "uf VARCHAR(2) NULL",
    "originalFilename VARCHAR(512) NULL",
  ]) {
    try {
      await db.execute(sql.raw(`ALTER TABLE h2bico_records ADD COLUMN IF NOT EXISTS ${definition}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) {
        console.warn("[H2BICO] coluna não garantida:", definition, message);
      }
    }
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h2bico_history (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      recordId INT NOT NULL,
      action VARCHAR(64) NOT NULL,
      details TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_h2bico_history_record (recordId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  // Marcacao manual independente do status de uso e das fotos.
  // Criar uma tabela separada evita alterar registros ja cadastrados.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h2bico_ear_marks (
      recordId INT NOT NULL PRIMARY KEY,
      earStatus ENUM('com_ear','sem_ear') NOT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_h2bico_ear_status (earStatus)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await ensureH2BicoReviewSchema(db);
  return db;
}

function parseFilename(filename: string) {
  const clean = filename.split(/[\\/]/).pop() || filename;
  const base = clean.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").trim();
  const match = base.match(/\d{11}/);
  if (!match || match.index == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nome do arquivo sem CPF de 11 números.",
    });
  }

  const cpf = match[0];
  const rawName = base.slice(0, match.index).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  const name = rawName.length >= 2 ? rawName.toUpperCase() : "SEM NOME";
  const suffix = base.slice(match.index + 11).replace(/^[_\-\s]+/, "").trim();
  const ufMatch = suffix.match(/^([A-Za-z]{2})(?:\b|[_\-\s])/i) || suffix.match(/^([A-Za-z]{2})$/i);
  const uf = ufMatch?.[1]?.toUpperCase() || null;

  return { name, cpf, uf, originalFilename: clean };
}

const cpf11 = z.string().transform(v => v.replace(/\D/g, "")).refine(v => v.length === 11, "CPF deve ter 11 números");

export const h2bicoRouter = router({
  list: adminProcedure.input(z.object({
    search: z.string().optional().default(""),
    status: z.enum(["all","available","reserved","in_use","used","archived"]).optional().default("all"),
  }).optional()).query(async ({ input }) => {
    const db = await dbOrThrow();
    const search = (input?.search || "").trim();
    const status = input?.status || "all";
    const like = `%${search}%`;
    const rows = await db.execute(sql`
      SELECT r.id,r.name,r.cpf,r.uf,r.photoUrl,r.originalFilename,r.notes,r.source,
             r.status,r.linkedOrder,r.lastSimilarity,r.usedAt,r.createdAt,r.updatedAt,
             em.earStatus
      FROM h2bico_records r
      LEFT JOIN h2bico_ear_marks em ON em.recordId = r.id
      WHERE (${search} = '' OR r.name LIKE ${like} OR r.cpf LIKE ${like})
        AND (${status} = 'all' OR r.status = ${status})
      ORDER BY CASE r.status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 WHEN 'in_use' THEN 2 WHEN 'used' THEN 3 ELSE 4 END,
               r.name ASC, r.id DESC
      LIMIT 5000
    `);
    return (rows[0] as any[]).map(r => ({
      ...r,
      id: Number(r.id),
      earStatus: r.earStatus === "com_ear" || r.earStatus === "sem_ear" ? r.earStatus : null,
      lastSimilarity: r.lastSimilarity == null ? null : Number(r.lastSimilarity),
    }));
  }),

  // Consulta por lote somente CPFs com foto salva; nao depende do limite da vitrine.
  checkExtractedCpfs: adminProcedure.input(z.object({
    cpfs: z.array(z.string().regex(/^\d{11}$/)).max(300),
  }).strict()).query(async ({ input }) => {
    if (!input.cpfs.length) return { existing: [] as string[] };
    const db = await dbOrThrow();
    const unique = [...new Set(input.cpfs)];
    const rows = await db.execute(sql`
      SELECT cpf FROM h2bico_records
      WHERE cpf IN (${sql.join(unique.map(cpf => sql`${cpf}`), sql`, `)})
        AND photoUrl IS NOT NULL AND TRIM(photoUrl) <> ''
    `);
    return { existing: (rows[0] as Array<{ cpf: string }>).map(row => String(row.cpf)) };
  }),

  availableForSimilarity: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.execute(sql`
      SELECT id,name,cpf,uf,photoUrl,originalFilename
      FROM h2bico_records
      WHERE status = 'available' AND photoUrl IS NOT NULL AND photoUrl <> ''
      ORDER BY name ASC, id ASC
      LIMIT 10000
    `);
    return (rows[0] as any[]).map(r => ({
      id: Number(r.id),
      name: String(r.name || ""),
      cpf: String(r.cpf || ""),
      uf: r.uf ? String(r.uf) : null,
      photoUrl: String(r.photoUrl || ""),
      originalFilename: r.originalFilename ? String(r.originalFilename) : null,
    }));
  }),

  stats: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.execute(sql`SELECT status, COUNT(*) total FROM h2bico_records GROUP BY status`);
    const out:any = { total:0, available:0, reserved:0, in_use:0, used:0, archived:0 };
    for (const r of rows[0] as any[]) {
      out[r.status] = Number(r.total);
      out.total += Number(r.total);
    }
    return out;
  }),

  analyzeScreenshot: adminProcedure.input(z.object({
    base64: z.string().min(100).max(15_000_000),
  }).strict()).mutation(async ({ input }) => {
    const buffer = Buffer.from(input.base64, "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new TRPCError({code:"BAD_REQUEST",message:"Print acima de 10 MB."});
    const temp = await mkdtemp(join(tmpdir(),"h2bico-ocr-"));
    try {
      const image=sharp(buffer,{limitInputPixels:32_000_000}).rotate();
      const prepared=await image.png().toBuffer();
      const metadata=await sharp(prepared).metadata();
      const width=metadata.width || 0;
      const height=metadata.height || 0;
      if(width<200||height<200)throw new Error("Imagem pequena.");
      // OCR de prints reduzidos: amplia a imagem para recuperar pontuacao e
      // digitos que se perdem em miniaturas, mantendo recortes na escala original.
      const scale=width<1500?Math.min(3,2400/width):1;
      const processed=scale>1
        ? await sharp(prepared).resize({width:Math.round(width*scale)}).sharpen().png().toBuffer()
        :prepared;
      const processedMeta=await sharp(processed).metadata();
      const ocrWidth=processedMeta.width||width,ocrHeight=processedMeta.height||height;
      const filename=join(temp,"print.png");
      await writeFile(filename,processed);
      const {stdout}=await execFileAsync("tesseract",[filename,"stdout","-l","por+eng","--psm","11","tsv"],{
        timeout:45000,maxBuffer:12*1024*1024,encoding:"utf8",
      });
      const aligned=await alignScreenshotPhotoCrops(processed,parseScreenshotTsv(stdout,ocrWidth,ocrHeight),ocrWidth,ocrHeight);
      const found=aligned.map(person=>({
        ...person,
        crop:{
          x:Math.round(person.crop.x*width/ocrWidth),
          y:Math.round(person.crop.y*height/ocrHeight),
          size:Math.round(person.crop.size*width/ocrWidth),
        }
      }));
      // CPF duvidoso: tenta uma segunda leitura isolada da faixa do numero.
      // O texto corrigido vira apenas uma sugestao, nunca uma confirmacao
      // automatica de que aquele CPF pertence a pessoa da foto.
      for(const person of found){
        if(!person.nameBox || isValidCpf(person.cpf))continue;
        const n=person.nameBox;
        const left=Math.max(0,Math.floor(n.left*ocrWidth/ocrWidth));
        const top=Math.max(0,Math.round(n.top+n.height*1.2));
        const boxWidth=Math.min(ocrWidth-left,Math.max(130,Math.round(n.height*17)));
        const boxHeight=Math.min(ocrHeight-top,Math.max(22,Math.round(n.height*2.35)));
        if(boxWidth<100||boxHeight<15)continue;
        try{
          const region=await sharp(processed).extract({left,top,width:boxWidth,height:boxHeight})
            .resize({width:boxWidth*4}).normalize().sharpen().png().toBuffer();
          const regionFile=join(temp,"cpf-"+found.indexOf(person)+".png");
          await writeFile(regionFile,region);
          const {stdout:raw}=await execFileAsync("tesseract",[regionFile,"stdout","-l","eng","--psm","7",
            "-c","tessedit_char_whitelist=0123456789.-"],{timeout:10000,maxBuffer:4096,encoding:"utf8"});
          const numeric=raw.replace(/[^0-9]/g,"");
          if(numeric.length===11 && isValidCpf(numeric) && numeric!==person.cpf){
            person.warnings.push("CPF relido com resultado diferente; CONFIRA O NUMERO NO PRINT ANTES DE SALVAR.");
            // O resultado nao e selecionado automaticamente no importador.
            person.cpf=numeric;
            person.confidence=Math.min(person.confidence,45);
          }
        }catch(error){console.warn("[H2BICO OCR] releitura indisponivel:",error instanceof Error?error.message:"erro");}
      }
      for(let index=0;index<found.length;index++){
        const person=found[index];
        if(isValidCpf(person.cpf)||!person.cpfBox)continue;
        const fixed=await autoReadCpfLine({
          image:prepared,width,height,ocrWidth,ocrHeight,
          box:person.cpfBox,original:person.cpf,temporaryDir:temp,index,
        });
        if(fixed){
          person.cpf=fixed;
          person.confidence=Math.max(person.confidence,85);
          person.warnings=person.warnings.filter(w=>!w.includes("CONFIRA O NUMERO"));
          person.warnings.push("CPF corrigido automaticamente por leituras independentes e digitos verificadores.");
        }
      }
      const proposed=found.map(row=>({...row,cpfSuggestion:suggestCpfFromMisreadDigits(row.cpf)}));
      const cpfs=[...new Set(proposed.filter(row=>isValidCpf(row.cpf)).map(row=>row.cpf))];
      const db=await dbOrThrow();
      const existing=new Set<string>();
      for(let start=0;start<cpfs.length;start+=250){
        const batch=cpfs.slice(start,start+250);
        const rows=await db.execute(sql`SELECT cpf FROM h2bico_records WHERE cpf IN (${sql.join(batch.map(cpf=>sql`${cpf}`),sql`, `)})`);
        for(const row of rows[0] as Array<{cpf:string}>)existing.add(String(row.cpf));
      }
      return {width,height,persons:proposed.map(row=>({
        ...row,validCpf:isValidCpf(row.cpf),alreadyExists:existing.has(row.cpf),
      }))};
    }catch(error){
      if(error instanceof TRPCError)throw error;
      console.error("[H2BICO OCR]",error);
      throw new TRPCError({code:"BAD_REQUEST",message:"Não foi possível ler o print. Confira a imagem."});
    }finally{await rm(temp,{recursive:true,force:true});}
  }),

  importScreenshotRecord: adminProcedure.input(z.object({
    name:z.string().min(2).max(200),
    cpf:z.string().regex(/^\d{11}$/),
    base64:z.string().min(100).max(5_500_000),
  }).strict()).mutation(async ({input})=>{
    const name=normalizeScreenshotName(input.name);
    if(!isReviewableName(name) || !isValidCpf(input.cpf))
      throw new TRPCError({code:"BAD_REQUEST",message:"Confira o nome completo e o CPF válido."});
    const db=await dbOrThrow();
    const found=await db.execute(sql`SELECT id FROM h2bico_records WHERE cpf=${input.cpf} LIMIT 1`);
    if((found[0] as any[]).length)return {result:"duplicate" as const};
    const buffer=Buffer.from(input.base64,"base64");
    if(!buffer.length||buffer.length>4*1024*1024)
      throw new TRPCError({code:"BAD_REQUEST",message:"Recorte acima do limite."});
    let photo:Buffer;
    try{
      const meta=await sharp(buffer,{limitInputPixels:5_000_000}).metadata();
      if(!["jpeg","png","webp"].includes(meta.format||"") || (meta.width||0)<48 || (meta.height||0)<48)
        throw new Error("Imagem inválida");
      photo=await sharp(buffer).rotate().resize({width:320,height:320,fit:"cover",withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
    }catch{throw new TRPCError({code:"BAD_REQUEST",message:"Recorte inválido."});}
    const key="h2bico/print-"+input.cpf+"-"+Date.now()+".jpg";
    const {url}=await storagePut(key,photo,"image/jpeg");
    try{
      const result:any=await db.execute(sql`
        INSERT INTO h2bico_records(name,cpf,photoUrl,originalFilename,source,status)
        VALUES(${name},${input.cpf},${url},${name+"_"+input.cpf+".jpg"},'importacao-print','available')
      `);
      const id=Number((result[0] as any).insertId||0);
      if(id)await db.execute(sql`INSERT INTO h2bico_history(recordId,action,details)
        VALUES(${id},'imported','Importado por print com revisão administrativa')`);
      return {result:"imported" as const,id};
    }catch(error){
      if(/Duplicate|ER_DUP_ENTRY/i.test(String(error)))return {result:"duplicate" as const};
      throw error;
    }
  }),

  importPhoto: adminProcedure.input(z.object({
    filename: z.string().min(1).max(512),
    base64: z.string().min(10).max(15_000_000),
    mimeType: z.enum(["image/jpeg","image/png","image/webp"]).default("image/jpeg"),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const parsed = parseFilename(input.filename);

    const duplicateRows = await db.execute(sql`
      SELECT id,status,name,photoUrl,originalFilename
      FROM h2bico_records
      WHERE cpf = ${parsed.cpf}
      LIMIT 1
    `);
    const duplicate = (duplicateRows[0] as any[])[0];

    const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const uploadCurrentPhoto = async () => {
      const key = `h2bico/${parsed.cpf}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      return await storagePut(key, Buffer.from(input.base64, "base64"), input.mimeType);
    };

    if (duplicate) {
      let healthy = false;
      const currentUrl = String(duplicate.photoUrl || "").trim();
      if (currentUrl) {
        try {
          const response = await fetch(currentUrl, {
            headers: { Range: "bytes=0-0", "User-Agent": "H2BICO-Photo-Check/1.0" },
          });
          const contentType = response.headers.get("content-type") || "";
          healthy = (response.ok || response.status === 206) && (!contentType || contentType.startsWith("image/"));
        } catch {
          healthy = false;
        }
      }

      if (healthy) {
        return {
          success: false as const,
          result: "duplicate" as const,
          cpf: parsed.cpf,
          name: parsed.name,
          existingId: Number(duplicate.id),
          existingStatus: String(duplicate.status || ""),
          existingName: String(duplicate.name || ""),
        };
      }

      const { url } = await uploadCurrentPhoto();
      await db.execute(sql`
        UPDATE h2bico_records
        SET photoUrl=${url},
            originalFilename=${parsed.originalFilename},
            uf=COALESCE(${parsed.uf}, uf),
            name=CASE WHEN name='SEM NOME' AND ${parsed.name} <> 'SEM NOME' THEN ${parsed.name} ELSE name END
        WHERE id=${Number(duplicate.id)}
      `);
      await db.execute(sql`
        INSERT INTO h2bico_history (recordId,action,details)
        VALUES (${Number(duplicate.id)},'photo_repaired',${"Foto reparada pela reimportação: " + parsed.originalFilename})
      `);
      return {
        success: true as const,
        result: "repaired" as const,
        id: Number(duplicate.id),
        cpf: parsed.cpf,
        name: parsed.name,
        photoUrl: url,
      };
    }

    const { url } = await uploadCurrentPhoto();

    try {
      const result:any = await db.execute(sql`
        INSERT INTO h2bico_records (name,cpf,uf,photoUrl,originalFilename,source,status)
        VALUES (${parsed.name},${parsed.cpf},${parsed.uf},${url},${parsed.originalFilename},'importacao-lote','available')
      `);
      const id = Number((result[0] as any).insertId || 0);
      if (id) {
        await db.execute(sql`
          INSERT INTO h2bico_history (recordId,action,details)
          VALUES (${id},'imported',${"Importado: " + parsed.originalFilename})
        `);
      }
      return { success: true as const, result: "imported" as const, id, ...parsed, photoUrl: url };
    } catch (error:any) {
      if (String(error?.message || "").includes("Duplicate")) {
        return { success: false as const, result: "duplicate" as const, cpf: parsed.cpf, name: parsed.name };
      }
      throw error;
    }
  }),

  create: adminProcedure.input(z.object({
    name: z.string().min(2).max(255),
    cpf: cpf11,
    photoUrl: z.string().url(),
    notes: z.string().max(5000).optional(),
    source: z.string().max(255).optional(),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    try {
      const result:any = await db.execute(sql`
        INSERT INTO h2bico_records (name,cpf,photoUrl,notes,source,status)
        VALUES (${input.name.trim().toUpperCase()},${input.cpf},${input.photoUrl},${input.notes || null},${input.source || 'manual'},'available')
      `);
      const id = Number((result[0] as any).insertId || 0);
      if (id) {
        await db.execute(sql`
          INSERT INTO h2bico_history (recordId,action,details)
          VALUES (${id},'created','Registro criado manualmente no H2BICO')
        `);
      }
      return { success:true, id };
    } catch (e:any) {
      if (String(e?.message || "").includes("Duplicate")) {
        throw new TRPCError({code:"CONFLICT",message:"Este CPF já está cadastrado no H2BICO."});
      }
      throw e;
    }
  }),

  uploadPhoto: adminProcedure.input(z.object({
    filename: z.string().min(1).max(255),
    base64: z.string().min(10).max(15_000_000),
    mimeType: z.enum(["image/jpeg","image/png","image/webp"]).default("image/jpeg"),
  })).mutation(async ({ input }) => {
    const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const key = `h2bico/manual-${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
    const { url } = await storagePut(key, Buffer.from(input.base64, "base64"), input.mimeType);
    return { success: true, url };
  }),

  bulkLookup: adminProcedure.input(z.object({
    cpfs: z.array(z.string().trim().regex(/^(?:[0-9]{11}|[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2})$/,"CPF precisa ter 11 dígitos, com ou sem pontuação").transform(cpf=>cpf.replace(/[^0-9]/g,""))).min(1).max(300),
  }).strict()).query(async ({input})=>{
    const db=await dbOrThrow();
    const unique=[...new Set(input.cpfs)];
    const rows=await db.execute(sql`
      SELECT r.id,r.name,r.cpf,r.status,r.photoUrl,r.linkedOrder,r.usedAt,em.earStatus
      FROM h2bico_records r
      LEFT JOIN h2bico_ear_marks em ON em.recordId=r.id
      WHERE r.cpf IN (${sql.join(unique.map(cpf=>sql`${cpf}`),sql`, `)})
    `);
    return (rows[0] as any[]).map(row=>({
      id:Number(row.id),name:String(row.name),cpf:String(row.cpf),
      status:String(row.status),hasPhoto:!!String(row.photoUrl||"").trim(),
      earStatus:row.earStatus==="com_ear"||row.earStatus==="sem_ear"?row.earStatus:null,
      protected:String(row.status)==="used"||!!row.usedAt||!!String(row.linkedOrder||"").trim(),
    }));
  }),

  bulkEarMarker: adminProcedure.input(z.object({
    ids:z.array(z.number().int().positive()).min(1).max(300),
    earStatus:z.enum(["com_ear","sem_ear"]).nullable(),
  }).strict()).mutation(async ({input})=>{
    const db=await dbOrThrow();
    const ids=[...new Set(input.ids)];
    const found=await db.execute(sql`SELECT id FROM h2bico_records WHERE id IN (${sql.join(ids.map(id=>sql`${id}`),sql`, `)})`);
    const valid=(found[0] as Array<{id:number}>).map(row=>Number(row.id));
    if(valid.length!==ids.length)throw new TRPCError({code:"CONFLICT",message:"Lista mudou; consulte novamente."});
    for(const id of valid){
      if(input.earStatus===null)await db.execute(sql`DELETE FROM h2bico_ear_marks WHERE recordId=${id}`);
      else await db.execute(sql`
        INSERT INTO h2bico_ear_marks(recordId,earStatus) VALUES(${id},${input.earStatus})
        ON DUPLICATE KEY UPDATE earStatus=${input.earStatus}
      `);
      await db.execute(sql`INSERT INTO h2bico_history(recordId,action,details)
        VALUES(${id},'ear_marker',${"Marcação em massa: "+(input.earStatus||"removida")})`);
    }
    return {updated:valid.length};
  }),

  bulkArchive: adminProcedure.input(z.object({
    ids:z.array(z.number().int().positive()).min(1).max(300),
    mode:z.enum(["archive","restore"]),
  }).strict()).mutation(async ({input})=>{
    const db=await dbOrThrow();
    const ids=[...new Set(input.ids)];
    const rows=await db.execute(sql`SELECT r.id,r.status,r.linkedOrder,r.usedAt,rv.reviewState FROM h2bico_records r LEFT JOIN h2bico_review rv ON rv.recordId=r.id WHERE r.id IN (${sql.join(ids.map(id=>sql`${id}`),sql`, `)})`);
    const found=rows[0] as Array<{id:number;status:string;linkedOrder:string|null;usedAt:string|null}>;
    if(found.length!==ids.length||found.some(row=>
      row.status==="used"||row.usedAt||row.linkedOrder||(row as any).reviewState==="discarded"||
      (input.mode==="archive"&&!["available","reserved"].includes(row.status))||
      (input.mode==="restore"&&row.status!=="archived")
    ))throw new TRPCError({code:"CONFLICT",message:"Há CPFs protegidos ou com status incompatível. Atualize a consulta."});
    const next=input.mode==="archive"?"archived":"available";
    for(const row of found){
      await db.execute(sql`UPDATE h2bico_records SET status=${next} WHERE id=${row.id}
        AND status=${row.status} AND usedAt IS NULL AND (linkedOrder IS NULL OR linkedOrder='')`);
      await db.execute(sql`INSERT INTO h2bico_history(recordId,action,details)
        VALUES(${row.id},${"status:"+next},'Alteração administrativa em lote')`);
    }
    return {updated:found.length};
  }),

  // Exporta os CPFs de todo o banco do H2BICO, sem depender do LIMIT 5000
  // da listagem da tela. Paginacao por ID em lotes de ate 1000 registros.
  bulkCopyCpfs: adminProcedure.input(z.object({
    category:z.enum(["all","active","archived"]),
    cursor:z.number().int().min(0).max(2147483647).optional().default(0),
  }).strict()).query(async ({input})=>{
    const db=await dbOrThrow();
    const condition=input.category==="all"?sql`1=1`:
      input.category==="active"?sql`status IN ('available','reserved','in_use')`:sql`status='archived'`;
    const rows=await db.execute(sql`SELECT id,cpf FROM h2bico_records WHERE ${condition} AND id > ${input.cursor} ORDER BY id ASC LIMIT 1001`);
    const result=rows[0] as Array<{id:number;cpf:string}>;
    const page=result.slice(0,1000);
    return {
      cpfs:page.map(row=>String(row.cpf)),
      nextCursor:page.length?Number(page[page.length-1].id):null,
      hasMore:result.length>1000,
    };
  }),

  // COM EAR / SEM EAR e um marcador manual salvo por registro no banco.
  // Nao modifica disponibilidade, fotos, CPF ou status de uso.
  setEarMarker: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    earStatus: z.enum(["com_ear", "sem_ear"]).nullable(),
  }).strict()).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const found = await db.execute(sql`
      SELECT id FROM h2bico_records WHERE id = ${input.id} LIMIT 1
    `);
    if (!(found[0] as unknown as any[]).length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Registro H2BICO não encontrado." });
    }

    if (input.earStatus === null) {
      await db.execute(sql`DELETE FROM h2bico_ear_marks WHERE recordId = ${input.id}`);
    } else {
      await db.execute(sql`
        INSERT INTO h2bico_ear_marks (recordId, earStatus)
        VALUES (${input.id}, ${input.earStatus})
        ON DUPLICATE KEY UPDATE earStatus = ${input.earStatus}
      `);
    }
    await db.execute(sql`
      INSERT INTO h2bico_history (recordId, action, details)
      VALUES (${input.id}, 'ear_marker',
        ${input.earStatus === "com_ear" ? "Marcado COM EAR" :
          input.earStatus === "sem_ear" ? "Marcado SEM EAR" : "Marcação EAR removida"})
    `);
    return { success: true as const, earStatus: input.earStatus };
  }),

  setStatus: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    status: z.enum(["available","reserved","in_use","used","archived"]),
    linkedOrder: z.string().max(64).optional().nullable(),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const currentRows = await db.execute(sql`SELECT r.status,r.usedAt,r.linkedOrder,rv.reviewState FROM h2bico_records r LEFT JOIN h2bico_review rv ON rv.recordId=r.id WHERE r.id=${input.id} LIMIT 1`);
    const current = (currentRows[0] as any[])[0];
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });

    if (current.reviewState === "discarded" && input.status !== "archived") throw new TRPCError({code:"FORBIDDEN",message:"CPF descartado: restaure somente pela conferência do H2BICO."});
    if (String(current.status) === "used" && input.status !== "used") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Registro USADO é definitivo e não pode voltar a ser reutilizado.",
      });
    }

    await db.execute(sql`
      UPDATE h2bico_records
      SET status=${input.status},
          linkedOrder=${input.linkedOrder || null},
          usedAt=CASE WHEN ${input.status}='used' THEN COALESCE(usedAt,NOW()) ELSE usedAt END
      WHERE id=${input.id}
    `);
    await db.execute(sql`
      INSERT INTO h2bico_history (recordId,action,details)
      VALUES (${input.id},${"status:" + input.status},${input.linkedOrder ? "Pedido " + input.linkedOrder : null})
    `);
    return { success:true };
  }),

  history: adminProcedure.input(z.object({id:z.number().int().positive()})).query(async ({input}) => {
    const db=await dbOrThrow();
    const rows=await db.execute(sql`
      SELECT id,action,details,createdAt
      FROM h2bico_history
      WHERE recordId=${input.id}
      ORDER BY id DESC
      LIMIT 100
    `);
    return rows[0] as any[];
  }),
});
