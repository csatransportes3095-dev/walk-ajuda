import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { putPrivateValidraObject, headPrivateValidraObject, getPrivateValidraObject, privateValidraFileUrl } from "./validraPrivateStorage";
import type { ValidraTransaction } from "./validraOrderPersistence";
import { validateValidraWav,validraWavDuration,validraAudioKey,validraAudioScopeLabel,VALIDRA_AUDIO_MAX_BYTES,type ValidraAudioScope } from "./validraAudioFormat";

export type ValidraCartDocument = {label:string;fileKey:string;fileUrl:string;mimeType:string};
export type ValidraCartAudio=ValidraCartDocument&ValidraAudioScope&{fileSize:number;durationSeconds:number};
type Owner={customerId:number;phone:string};
type StoredDocument={customer_id:number;customer_phone:string;label:string;file_url:string;mime_type:string;
  byte_length:number|string;etag:string;reserved_external_id:string|null};
type DocumentDb=NonNullable<Awaited<ReturnType<typeof getDb>>>;
const MAX_DOCUMENT_BYTES=15*1024*1024;

export async function ensureValidraDocumentStorage(db?:DocumentDb){
  const storage=db??await getDb();
  if(!storage)throw new Error("validra_database_unavailable");
  await storage.execute(sql`CREATE TABLE IF NOT EXISTS validra_document_uploads (
    file_key VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    customer_id INT NOT NULL, customer_phone VARCHAR(32) NOT NULL,
    label VARCHAR(256) NOT NULL, file_url TEXT NOT NULL, mime_type VARCHAR(128) NOT NULL,
    byte_length INT UNSIGNED NOT NULL, etag VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reserved_external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX validra_doc_customer(customer_id), INDEX validra_doc_attempt(reserved_external_id)
  ) ENGINE=InnoDB`);
  return storage;
}

function detectType(buffer:Buffer){
  if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return {ext:"jpg",mimeType:"image/jpeg"};
  if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:"png",mimeType:"image/png"};
  if(buffer.length>=5&&buffer.subarray(0,5).toString("ascii")==="%PDF-")return {ext:"pdf",mimeType:"application/pdf"};
  if(buffer.length>=12&&buffer.subarray(0,4).toString("ascii")==="RIFF"&&buffer.subarray(8,12).toString("ascii")==="WEBP")return {ext:"webp",mimeType:"image/webp"};
  throw new Error("validra_invalid_document");
}

/** Internal upload entry point. authenticatedPhone must come ONLY from a
 * verified customer session. Never accept client-specified object keys/URLs.
 * A storage acknowledgement plus HEAD is required before recording ownership. */
export async function createValidraDocumentUpload(authenticatedPhone:string,label:unknown,data:unknown){
  if(typeof label!=="string"||!label.trim()||label.length>256||/[\u0000-\u001f\u007f]/.test(label)||
      typeof data!=="string"||data.length>Math.ceil(MAX_DOCUMENT_BYTES/3)*4+128)
    throw new Error("validra_invalid_document");
  const encoded=data.replace(/^data:[a-zA-Z0-9.+/-]+;base64,/,"");
  if(!encoded||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error("validra_invalid_document");
  const buffer=Buffer.from(encoded,"base64");
  if(!buffer.length||buffer.length>MAX_DOCUMENT_BYTES)throw new Error("validra_invalid_document");
  const {ext,mimeType}=detectType(buffer);
  if(!/^\d{8,15}$/.test(authenticatedPhone))throw new Error("validra_customer_mismatch");
  const db=await ensureValidraDocumentStorage();
  const [rows]=await db.execute(sql`SELECT id,phone,blocked,deletedAt FROM customers WHERE phone=${authenticatedPhone} LIMIT 2`);
  const customers=rows as unknown as Array<{id:number;phone:string;blocked:number;deletedAt:Date|null}>;
  const customer=customers[0];
  if(customers.length!==1||!customer||!Number.isSafeInteger(Number(customer.id))||Number(customer.id)<=0||
      customer.phone!==authenticatedPhone||Number(customer.blocked)!==0||customer.deletedAt)throw new Error("validra_customer_mismatch");
  const fileKey="order-docs/validra-"+randomUUID()+"."+ext;
  const fileUrl=privateValidraFileUrl(fileKey);
  await putPrivateValidraObject(fileKey,buffer,mimeType);
  const head=await headPrivateValidraObject(fileKey);
  if(head.httpStatus!==200||head.contentLength!==buffer.length||!head.etag||head.etag.length>256)throw new Error("validra_document_storage_unavailable");
  // Do not upsert: an existing key may never be reassigned to another owner.
  await db.execute(sql`INSERT INTO validra_document_uploads(file_key,customer_id,customer_phone,label,file_url,mime_type,byte_length,etag)
    VALUES(${fileKey},${customer.id},${authenticatedPhone},${label},${fileUrl},${mimeType},${buffer.length},${head.etag})`);
  return {label,fileKey,fileUrl,mimeType};
}

function requireBinding(row:StoredDocument|undefined,doc:ValidraCartDocument,owner:Owner,externalId:string,allowUnreserved:boolean){
  if(!row||Number(row.customer_id)!==owner.customerId||row.customer_phone!==owner.phone||
      row.label!==doc.label||row.file_url!==doc.fileUrl||doc.fileUrl!==privateValidraFileUrl(doc.fileKey)||row.mime_type!==doc.mimeType||
      (row.reserved_external_id!==externalId&&!(allowUnreserved&&row.reserved_external_id===null))||
      !Number.isSafeInteger(Number(row.byte_length))||Number(row.byte_length)<=0||Number(row.byte_length)>MAX_DOCUMENT_BYTES||!row.etag)
    throw new Error("validra_document_not_authorized");
  if(doc.mimeType==="audio/wav"){
    const audio=doc as ValidraCartAudio;
    if(!validraAudioKey(audio.fileKey)||audio.label!==validraAudioScopeLabel(audio)||Number(row.byte_length)!==audio.fileSize||
      Math.round(validraWavDuration(audio.fileSize))!==audio.durationSeconds)throw new Error("validra_document_not_authorized");
  }
  return row;
}

function uniqueDocuments(documents:ValidraCartDocument[]){
  const refs=new Map<string,ValidraCartDocument>();
  for(const doc of documents){
    const prior=refs.get(doc.fileKey);
    if(prior&&(prior.label!==doc.label||prior.fileUrl!==doc.fileUrl||prior.mimeType!==doc.mimeType))throw new Error("validra_document_not_authorized");
    refs.set(doc.fileKey,doc);
  }
  if(refs.size>60)throw new Error("validra_invalid_cart_snapshot");
  return [...refs.values()].sort((a,b)=>a.fileKey<b.fileKey?-1:a.fileKey>b.fileKey?1:0);
}

/** Outside the transaction, check the registered object, never a browser URL.
 * A repeated attempt uses its existing reservation; transient storage failures
 * cannot force an already-generated Pix to be replaced. */
export async function preflightValidraDocuments(db:DocumentDb,documents:ValidraCartDocument[],owner:Owner,externalId:string){
  for(const doc of uniqueDocuments(documents)){
    const [rows]=await db.execute(sql`SELECT * FROM validra_document_uploads WHERE file_key=${doc.fileKey}`);
    const row=requireBinding((rows as unknown as StoredDocument[])[0],doc,owner,externalId,true);
    if(row.reserved_external_id===externalId)continue;
    try{
      const head=await headPrivateValidraObject(doc.fileKey);
      if(head.httpStatus!==200||head.contentLength!==Number(row.byte_length)||head.etag!==row.etag)throw new Error();
    }catch{throw new Error("validra_document_storage_unavailable");}
  }
}

/** Lock ownership and reserve once, atomically with the purchase snapshot.
 * The same document may be referenced by multiple items in one cart, but
 * never attached to a different payment attempt. No network I/O here. */
export async function bindValidraDocuments(tx:ValidraTransaction,documents:ValidraCartDocument[],owner:Owner,externalId:string,allowReserve:boolean){
  for(const doc of uniqueDocuments(documents)){
    const [rows]=await tx.execute(sql`SELECT * FROM validra_document_uploads WHERE file_key=${doc.fileKey} FOR UPDATE`);
    const row=requireBinding((rows as unknown as StoredDocument[])[0],doc,owner,externalId,allowReserve);
    if(row.reserved_external_id===null){
      await tx.execute(sql`UPDATE validra_document_uploads SET reserved_external_id=${externalId}
        WHERE file_key=${doc.fileKey} AND reserved_external_id IS NULL`);
    }
  }
}

/** Resolve only the authenticated owner's registered file key. Neither URLs,
 * MIME types nor labels are accepted from the public cart request. */
export async function resolveOwnedValidraDocument(input:{fileKey:string;label:string;pdfOnly:boolean;imageOnly:boolean},owner:Owner,externalId:string):Promise<ValidraCartDocument>{
  const db=await ensureValidraDocumentStorage();
  const [rows]=await db.execute(sql`SELECT * FROM validra_document_uploads WHERE file_key=${input.fileKey}`);
  const row=(rows as unknown as StoredDocument[])[0];
  if(!row||row.label!==input.label)throw new Error("validra_document_not_authorized");
  const doc={fileKey:input.fileKey,label:input.label,fileUrl:row.file_url,mimeType:row.mime_type};
  requireBinding(row,doc,owner,externalId,true);
  if(!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(doc.mimeType)||(input.pdfOnly&&doc.mimeType!=="application/pdf")||(input.imageOnly&&!/^image\/(jpeg|png|webp)$/.test(doc.mimeType)))
    throw new Error("validra_cart_form_invalid");
  return doc;
}

/** Only a current owner or an authenticated ADM of a consumed purchase reads
 * the bytes. Never issue a direct bucket URL. */
export async function readAuthorizedValidraDocument(fileKey:string,access:{ownerPhone?:string;admin:boolean}){
  const url=privateValidraFileUrl(fileKey);
  const db=await ensureValidraDocumentStorage();
  const [rows]=await db.execute(sql`SELECT * FROM validra_document_uploads WHERE file_key=${fileKey}`);
  const row=(rows as unknown as StoredDocument[])[0];
  const denied=()=>new Error("validra_document_not_authorized");
  if(!row||row.file_url!==url||! /^(image\/(jpeg|png|webp)|application\/pdf|audio\/wav)$/.test(row.mime_type)||
    !Number.isSafeInteger(Number(row.byte_length))||Number(row.byte_length)<=0||Number(row.byte_length)>MAX_DOCUMENT_BYTES||!row.etag)throw denied();
  if(access.admin){
    if(!row.reserved_external_id)throw denied();
    const [paid]=await db.execute(sql`SELECT external_id FROM validra_checkout_attempts WHERE external_id=${row.reserved_external_id} AND customer_id=${row.customer_id} AND state='consumed'`);
    if(!(paid as unknown[]).length)throw denied();
  }else{
    if(!access.ownerPhone||access.ownerPhone!==row.customer_phone)throw denied();
    const [customers]=await db.execute(sql`SELECT id FROM customers WHERE id=${row.customer_id} AND phone=${access.ownerPhone} AND blocked=0 AND deletedAt IS NULL`);
    if(!(customers as unknown[]).length)throw denied();
  }
  return {mimeType:row.mime_type,buffer:await getPrivateValidraObject(fileKey,{etag:row.etag,byteLength:Number(row.byte_length),mimeType:row.mime_type})};
}

/** Audio uses a separate, immutable scope label and the same private object
 * registry. Source is a UI declaration, not proof of microphone origin. */
export async function createValidraAudioUpload(authenticatedPhone:string,scope:ValidraAudioScope,source:unknown,data:unknown,settings:{min:number;max:number;allowRerecord:boolean;allowFileUpload:boolean}){
  const label=validraAudioScopeLabel(scope);
  if((source!=="recording"&&source!=="file")||(source==="file"&&!settings.allowFileUpload)||
      typeof data!=="string"||data.length>Math.ceil(VALIDRA_AUDIO_MAX_BYTES/3)*4||
      data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error("validra_invalid_document");
  const buffer=Buffer.from(data,"base64");
  const duration=validateValidraWav(buffer);
  if(duration<settings.min||duration>settings.max)throw new Error("validra_invalid_document");
  const db=await ensureValidraDocumentStorage();
  const [rows]=await db.execute(sql`SELECT id,phone,blocked,deletedAt FROM customers WHERE phone=${authenticatedPhone} LIMIT 2`);
  const owners=rows as unknown as Array<{id:number;phone:string;blocked:number;deletedAt:unknown}>;
  const owner=owners[0];
  if(owners.length!==1||!owner||owner.blocked||owner.deletedAt||owner.phone!==authenticatedPhone)throw new Error("validra_customer_mismatch");
  const fileKey="order-docs/validra-audio-"+randomUUID()+".wav";
  const fileUrl=privateValidraFileUrl(fileKey),mimeType="audio/wav";
  await putPrivateValidraObject(fileKey,buffer,mimeType);
  const head=await headPrivateValidraObject(fileKey);
  if(head.httpStatus!==200||head.contentLength!==buffer.length||!head.etag||head.etag.length>256)throw new Error("validra_document_storage_unavailable");
  await db.transaction(async tx=>{
    const [locked]=await tx.execute(sql`SELECT id FROM customers WHERE id=${owner.id} AND phone=${authenticatedPhone} AND blocked=0 AND deletedAt IS NULL FOR UPDATE`);
    if(!(locked as unknown[]).length)throw new Error("validra_customer_mismatch");
    if(!settings.allowRerecord){
      const [prior]=await tx.execute(sql`SELECT file_key FROM validra_document_uploads WHERE customer_id=${owner.id} AND label=${label} AND mime_type='audio/wav' LIMIT 1`);
      if((prior as unknown[]).length)throw new Error("validra_cart_form_invalid");
    }
    await tx.execute(sql`INSERT INTO validra_document_uploads(file_key,customer_id,customer_phone,label,file_url,mime_type,byte_length,etag)
      VALUES(${fileKey},${owner.id},${authenticatedPhone},${label},${fileUrl},${mimeType},${buffer.length},${head.etag})`);
  },{isolationLevel:"read committed"});
  return {fileKey,durationSeconds:Math.round(duration),mimeType};
}
export async function resolveOwnedValidraAudio(scope:ValidraAudioScope,fileKey:string,settings:{min:number;max:number},owner:Owner,externalId:string):Promise<ValidraCartAudio>{
  const label=validraAudioScopeLabel(scope);
  if(!validraAudioKey(fileKey))throw new Error("validra_document_not_authorized");
  const db=await ensureValidraDocumentStorage();
  const [rows]=await db.execute(sql`SELECT * FROM validra_document_uploads WHERE file_key=${fileKey}`);
  const row=(rows as unknown as StoredDocument[])[0];
  if(!row||row.mime_type!=="audio/wav")throw new Error("validra_document_not_authorized");
  const fileSize=Number(row.byte_length),duration=validraWavDuration(fileSize);
  if(duration<settings.min||duration>settings.max)throw new Error("validra_cart_form_invalid");
  const doc={...scope,label,fileKey,fileUrl:row.file_url,mimeType:row.mime_type,fileSize,durationSeconds:Math.round(duration)};
  requireBinding(row,doc,owner,externalId,true);
  return doc;
}
