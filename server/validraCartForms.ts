import { and,eq,sql } from "drizzle-orm";
import { products,productOptions,productQuestions,optionDocuments } from "../drizzle/schema";
import { getDb,getSetting } from "./db";
import { getVehicleQuestionKind } from "../shared/vehicleCatalog";
import { normalizeValidraAnswer,visibleValidraQuestions,type ValidraItemRequirements,type ValidraItemFormInput,type ValidraFormQuestion,type ValidraFormDocument } from "../shared/validraCartForms";
import type { CartSelection } from "./validraCartQuote";

type Option=Pick<typeof productOptions.$inferSelect,"id"|"productId"|"label"|"type"|"requireProfilePhoto"|"requireCarDocument"|"requireAlvara"|"requireCondutaxi"|"requireVehicle2016"|"isPdfOnly"|"showYearField"|"docNameMode"|"commissionValue">;
type Product=Pick<typeof products.$inferSelect,"id"|"name"|"requireVehicle2016"|"isPdfOnly"|"showYearField">;
type Question=Pick<typeof productQuestions.$inferSelect,"id"|"question"|"fieldType"|"options"|"isRequired"|"sortOrder"|"parentQuestionId"|"triggerOption"|"questionPresentation">;
type Document=Pick<typeof optionDocuments.$inferSelect,"id"|"label"|"inputSource"|"sortOrder">;
type BlockingRule={questionId?:unknown;answer?:unknown;enabled?:unknown};
const unavailable=()=>new Error("validra_cart_requirements_not_ready");
function choicesFor(q:Question,rules:BlockingRule[]){
  if(q.fieldType!=="select")return [];
  let raw:unknown;
  try{raw=JSON.parse(q.options||"[]");}catch{throw unavailable();}
  if(!Array.isArray(raw)||!raw.length||raw.length>200)throw unavailable();
  const seen=new Set<string>();
  return raw.map(value=>{
    const item=typeof value==="string"?{label:value}:value;
    if(!item||typeof item.label!=="string"||!item.label.trim()||item.label.length>1000||
        (item.flowAction&&item.flowAction!=="continue"))throw unavailable();
    const key=normalizeValidraAnswer(item.label);
    if(seen.has(key))throw unavailable();
    seen.add(key);
    return {label:item.label,blocked:item.blocking===true||rules.some(rule=>rule&&rule.enabled!==false&&Number(rule.questionId)===q.id&&normalizeValidraAnswer(String(rule.answer??""))===key)};
  });
}

/** Unsupported requirements fail closed rather than silently disappearing.
 * Dynamic documents replace legacy document flags, as in the storefront.
 * PDF-only and ordinary text/select/textarea conditional forms are supported. */
export function buildValidraItemRequirements(product:Product,option:Option,questions:Question[],documents:Document[],rules:BlockingRule[]=[]):ValidraItemRequirements{
  if(option.productId!==product.id||!["standard","pdf_only","pdf-only","pdf"].includes(option.type??"")||
      option.requireVehicle2016||product.requireVehicle2016||option.showYearField||product.showYearField||
      option.docNameMode!=="none"||option.commissionValue||questions.length>60||documents.length>30)throw unavailable();
  const questionIds=new Set(questions.map(q=>q.id));
  if(questionIds.size!==questions.length)throw unavailable();
  const byId=new Map(questions.map(q=>[q.id,q]));
  const specs:ValidraFormQuestion[]=questions.map(q=>{
    if(q.fieldType==="audio"||q.questionPresentation==="audio"||getVehicleQuestionKind(q.question)||
        !["text","textarea","select"].includes(q.fieldType)||!q.question.trim())throw unavailable();
    const chain=new Set([q.id]);
    let parent=q.parentQuestionId;
    while(parent!==null){
      const ancestor=byId.get(parent);
      if(!ancestor||chain.has(parent))throw unavailable();
      chain.add(parent);parent=ancestor.parentQuestionId;
    }
    return {id:q.id,question:q.question,fieldType:q.fieldType as ValidraFormQuestion["fieldType"],required:q.isRequired===1,
      parentQuestionId:q.parentQuestionId,triggerOption:q.triggerOption,sortOrder:q.sortOrder,choices:choicesFor(q,rules)};
  });
  const pdfOnly=Boolean(product.isPdfOnly||option.isPdfOnly||["pdf_only","pdf-only","pdf"].includes(option.type??""));
  const required:ValidraFormDocument[]=[];
  if(documents.length){
    for(const doc of [...documents].sort((a,b)=>a.sortOrder-b.sortOrder||a.id-b.id)){
      if(!doc.label.trim()||!["both","camera","gallery"].includes(doc.inputSource)||required.some(x=>x.fieldId==="dynamic:"+doc.id))throw unavailable();
      required.push({fieldId:"dynamic:"+doc.id,label:doc.label,pdfOnly:false,imageOnly:doc.inputSource==="camera",inputSource:doc.inputSource});
    }
    // Ambiguous PDF-only + dynamic catalogue combinations must be reviewed.
    if(pdfOnly)throw unavailable();
  }else if(pdfOnly){
    required.push({fieldId:"legacy:pdf",label:"Documento PDF",pdfOnly:true,imageOnly:false,inputSource:"gallery"});
  }else{
    for(const [flag,fieldId,label,imageOnly] of [
      [option.requireProfilePhoto,"legacy:photo","Foto de Perfil",true],
      [option.requireCarDocument,"legacy:car","Documento do Carro",false],
      [option.requireAlvara,"legacy:alvara","Alvará",false],
      [option.requireCondutaxi,"legacy:condutaxi","Condutaxi",false],
    ] as const){
      if(flag)required.push({fieldId,label,pdfOnly:false,imageOnly,inputSource:"both"});
    }
  }
  return {productId:product.id,optionId:option.id,service:product.name,option:option.label,questions:specs,documents:required};
}

export async function loadValidraItemRequirements(items:CartSelection[]){
  const db=await getDb();if(!db)throw new Error("validra_database_unavailable");
  const raw=await getSetting("question_blocking_manifest_rules_v1");
  let rules:BlockingRule[]=[];
  if(raw){try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw unavailable();rules=parsed;}catch{throw unavailable();}}
  const result:ValidraItemRequirements[]=[];
  for(const item of items){
    const [product]=await db.select().from(products).where(and(eq(products.id,item.productId),eq(products.isActive,1))).limit(1);
    const [option]=await db.select().from(productOptions).where(and(eq(productOptions.id,item.optionId),eq(productOptions.productId,item.productId),eq(productOptions.isActive,1))).limit(1);
    if(!product||!option)throw new Error("validra_selection_unavailable");
    const questions=await db.select().from(productQuestions).where(sql`${productQuestions.optionId}=${item.optionId} OR (${productQuestions.productId}=${item.productId} AND ${productQuestions.optionId} IS NULL)`);
    if(questions.some(q=>q.productId!==item.productId))throw unavailable();
    const documents=await db.select().from(optionDocuments).where(eq(optionDocuments.optionId,item.optionId));
    result.push(buildValidraItemRequirements(product,option,questions,documents,rules));
  }
  return result;
}

export function validateValidraItemForm(spec:ValidraItemRequirements,input:ValidraItemFormInput|undefined){
  const invalid=()=>new Error("validra_cart_form_invalid");
  const submitted=input??{answers:[],documents:[]};
  if(!Array.isArray(submitted.answers)||!Array.isArray(submitted.documents)||submitted.answers.length>60||submitted.documents.length>30)throw invalid();
  const answers:Record<number,string>={};
  const seen=new Set<number>();
  for(const entry of submitted.answers){
    const question=spec.questions.find(q=>q.id===entry.questionId);
    if(!question||seen.has(question.id)||typeof entry.answer!=="string"||entry.answer.length>2000)throw invalid();
    seen.add(question.id);
    const value=entry.answer.trim();
    if(question.fieldType==="select"&&value){
      const selected=question.choices.find(choice=>normalizeValidraAnswer(choice.label)===normalizeValidraAnswer(value));
      if(!selected||selected.blocked)throw invalid();
      answers[question.id]=selected.label;
    }else answers[question.id]=value;
  }
  const visible=visibleValidraQuestions(spec.questions,answers);
  if([...seen].some(id=>!visible.some(q=>q.id===id))||visible.some(q=>q.required&&!answers[q.id]))throw invalid();
  const depths=new Map<number,number>();
  const canonical=visible.flatMap(q=>{
    const depth=q.parentQuestionId===null?0:(depths.get(q.parentQuestionId)??0)+1;
    depths.set(q.id,depth);
    if(!answers[q.id])return [];
    return [{questionId:q.id,question:q.question,answer:answers[q.id],depth,
      ...(q.fieldType==="select"?{optionsMeta:JSON.stringify(q.choices.map(choice=>({label:choice.label})))}:{})}];
  });
  const serialized=JSON.stringify(canonical);
  if(Buffer.byteLength(serialized,"utf8")>60000)throw invalid();
  const files=new Map<string,string>();
  for(const entry of submitted.documents){
    if(!spec.documents.some(doc=>doc.fieldId===entry.fieldId)||files.has(entry.fieldId)||typeof entry.fileKey!=="string"||
        !/^order-docs\/[A-Za-z0-9_.-]{1,480}$/.test(entry.fileKey))throw invalid();
    files.set(entry.fieldId,entry.fileKey);
  }
  if(spec.documents.some(doc=>!files.has(doc.fieldId))||new Set(files.values()).size!==files.size)throw invalid();
  return {answers:serialized,documents:spec.documents.map(doc=>({...doc,fileKey:files.get(doc.fieldId)!}))};
}
