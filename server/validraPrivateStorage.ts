import { GetObjectCommand,HeadObjectCommand,PutObjectCommand,S3Client } from "@aws-sdk/client-s3";
import { publicSiteUrl } from "../shared/publicLinks";
const MAX_BYTES=15*1024*1024;
export function privateValidraFileUrl(key:string){
  if(!/^order-docs\/[A-Za-z0-9_.-]{1,480}$/.test(key)||key.endsWith("/.")||key.endsWith("/.."))throw new Error("validra_invalid_document");
  return publicSiteUrl("/api/validra/documents/"+key);
}
function privateStorage(){
  const bucket=process.env.VALIDRA_PRIVATE_R2_BUCKET_NAME?.trim();
  const endpoint=process.env.R2_ENDPOINT?.trim();
  const accessKeyId=process.env.VALIDRA_PRIVATE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey=process.env.VALIDRA_PRIVATE_R2_SECRET_ACCESS_KEY?.trim();
  // No fallback to the legacy public bucket. Confirmation requires an
  // operational check that r2.dev and all public domains are disabled.
  if(!bucket||bucket===process.env.R2_BUCKET_NAME?.trim()||!endpoint||!accessKeyId||!secretAccessKey||
    process.env.VALIDRA_PRIVATE_R2_CONFIRMED!=="true")throw new Error("validra_private_storage_unavailable");
  return {bucket,client:new S3Client({region:"auto",endpoint,forcePathStyle:true,maxAttempts:3,credentials:{accessKeyId,secretAccessKey},
    requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"})};
}
export async function putPrivateValidraObject(key:string,body:Buffer,mimeType:string){
  privateValidraFileUrl(key);
  if(!body.length||body.length>MAX_BYTES)throw new Error("validra_invalid_document");
  const {bucket,client}=privateStorage();
  try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:mimeType,CacheControl:"private, no-store",IfNoneMatch:"*"}));}
  finally{client.destroy();}
}
export async function headPrivateValidraObject(key:string){
  privateValidraFileUrl(key);
  const {bucket,client}=privateStorage();
  try{
    const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
    return {httpStatus:head.$metadata.httpStatusCode??null,contentLength:head.ContentLength??null,etag:head.ETag??null};
  }finally{client.destroy();}
}
export async function getPrivateValidraObject(key:string,expected:{etag:string;byteLength:number;mimeType:string}){
  privateValidraFileUrl(key);
  if(!Number.isSafeInteger(expected.byteLength)||expected.byteLength<=0||expected.byteLength>MAX_BYTES)throw new Error("validra_document_not_authorized");
  const {bucket,client}=privateStorage();
  try{
    const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:key,IfMatch:expected.etag}));
    if(result.$metadata.httpStatusCode!==200||result.ContentLength!==expected.byteLength||result.ETag!==expected.etag||
       result.ContentType!==expected.mimeType||!result.Body)throw new Error("validra_document_storage_unavailable");
    const chunks:Buffer[]=[];let total=0;
    for await(const raw of result.Body as unknown as AsyncIterable<Uint8Array>){
      const chunk=Buffer.from(raw);total+=chunk.length;
      if(total>expected.byteLength)throw new Error("validra_document_storage_unavailable");
      chunks.push(chunk);
    }
    if(total!==expected.byteLength)throw new Error("validra_document_storage_unavailable");
    return Buffer.concat(chunks,total);
  }finally{client.destroy();}
}
