import { eq } from "drizzle-orm";
import { customers } from "../drizzle/schema";
import { loadValidraItemRequirements,validateValidraItemForm } from "./validraCartForms";
import { resolveOwnedValidraDocument } from "./validraDocumentStorage";
import type { ValidraItemRequirements,ValidraItemFormInput } from "../shared/validraCartForms";
import { getDb } from "./db";
import { resolveValidraCartQuote,type CartSelection } from "./validraCartQuote";
import { createSqlOrderPersistenceStore } from "./orderPersistence";
import { loadOwnedValidraCart,listOwnedValidraCartOrders,type ValidraCartSnapshot } from "./validraCartPersistence";
import { runValidraCartCheckout } from "./validraCartCheckout";
import { ValidraPayClient } from "./validraPay";

type PublicCartInput={externalId:string;cpToken:string;phone:string;items?:CartSelection[];forms?:ValidraItemFormInput[];couponCode?:string};

export async function assembleValidraCartForms(specs:ValidraItemRequirements[],forms:ValidraItemFormInput[]|undefined,owner:{customerId:number;phone:string},externalId:string){
  if(forms&&forms.length!==specs.length)throw new Error("validra_cart_form_invalid");
  const validated=specs.map((spec,index)=>validateValidraItemForm(spec,forms?.[index]));
  const keys=validated.flatMap(form=>form.documents.map(doc=>doc.fileKey));
  // One uploaded reference per document field, even for repeated options.
  if(keys.length>60||new Set(keys).size!==keys.length)throw new Error("validra_cart_form_invalid");
  const result=[];
  for(const form of validated){
    const documents=[];
    for(const doc of form.documents)documents.push(await resolveOwnedValidraDocument(doc,owner,externalId));
    result.push({answers:form.answers,documents});
  }
  return result;
}

function publicSummary(snapshot:ValidraCartSnapshot){
  const {quote}=snapshot;
  return {
    amountCents:quote.amountCents,
    items:quote.items.map(item=>({service:item.serviceName,nameOption:item.serviceOption,amountCents:item.amountCents})),
    clientName:snapshot.orders[0]?.clientName??"",
    phone:quote.phone,
  };
}

/** Called only from the gated tRPC procedure after session and IP validation.
 * Per-item requirements and registered documents are validated before reserve.
 * Unsupported commercial and advanced requirements remain blocked. Resume
 * is based only on the stored quote, not edited browser forms. */
export async function checkoutPublicValidraCart(input:PublicCartInput,allowNew:boolean){
  const db=await getDb();
  if(!db)throw new Error("validra_database_unavailable");
  const [customer]=await db.select().from(customers).where(eq(customers.phone,input.phone)).limit(1);
  if(!customer||customer.deletedAt||customer.blocked)throw new Error("validra_customer_mismatch");
  const owner={customerId:customer.id,phone:input.phone};
  let snapshot:ValidraCartSnapshot;
  const existing=await loadOwnedValidraCart(input.externalId,owner);
  if(existing){
    snapshot=existing.snapshot;
    if(existing.state==="consumed")return {kind:"persisted" as const,orders:await listOwnedValidraCartOrders(input.externalId,owner),summary:publicSummary(snapshot)};
  }else{
    if(!input.items?.length)return {kind:"not_started" as const};
    if(!allowNew)throw new Error("validra_new_attempts_disabled");
    if(input.items.length<2||customer.isReseller||customer.referredByPhone||customer.referredBy)
      throw new Error("validra_cart_requirements_not_ready");
    await createSqlOrderPersistenceStore(db as unknown as Parameters<typeof createSqlOrderPersistenceStore>[0]).assertNoOpenVipInstallmentDebt?.(owner.phone);
    const quote=await resolveValidraCartQuote({cpToken:input.cpToken,phone:owner.phone,items:input.items,couponCode:input.couponCode});
    if(quote.customerId!==owner.customerId||quote.phone!==owner.phone)throw new Error("validra_customer_mismatch");
    // Fetch current catalogue requirements for EVERY position. A repeated
    // option has a separate submission and cannot borrow another item's data.
    const specs=await loadValidraItemRequirements(quote.items);
    if(specs.length!==quote.items.length||specs.some((spec,index)=>spec.productId!==quote.items[index].productId||spec.optionId!==quote.items[index].optionId))throw new Error("validra_selection_unavailable");
    const forms=await assembleValidraCartForms(specs,input.forms,owner,input.externalId);
    snapshot={quote,orders:quote.items.map((item,index)=>({
      effectivePhone:owner.phone,clientName:customer.name,productId:item.productId,
      serviceName:item.serviceName,serviceOption:item.serviceOption,answers:forms[index].answers,
      documents:forms[index].documents,
    }))};
  }
  const result=await runValidraCartCheckout(input.externalId,snapshot,allowNew,new ValidraPayClient(),true);
  if(result.kind==="payment")return {...result,summary:publicSummary(snapshot)};
  const orders=result.kind==="duplicate"?await listOwnedValidraCartOrders(input.externalId,owner):result.orders;
  return {kind:"persisted" as const,orders,summary:publicSummary(snapshot)};
}
