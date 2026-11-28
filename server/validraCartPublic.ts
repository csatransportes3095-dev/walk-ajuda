import { and,eq,sql } from "drizzle-orm";
import { customers,productOptions,productQuestions,optionDocuments,products } from "../drizzle/schema";
import { getDb } from "./db";
import { resolveValidraCartQuote,type CartSelection } from "./validraCartQuote";
import { createSqlOrderPersistenceStore } from "./orderPersistence";
import { loadOwnedValidraCart,listOwnedValidraCartOrders,type ValidraCartSnapshot } from "./validraCartPersistence";
import { runValidraCartCheckout } from "./validraCartCheckout";
import { ValidraPayClient } from "./validraPay";

type PublicCartInput={externalId:string;cpToken:string;phone:string;items?:CartSelection[];couponCode?:string};

export function assertSimpleValidraCartOption(option:{
  type?:string|null;requireProfilePhoto:number;requireCarDocument:number;requireAlvara:number;requireCondutaxi:number;
  requireVehicle2016:number;isPdfOnly:number;showYearField:number;docNameMode:string;commissionValue:number
},questions:number,documents:number){
  if(option.type!=="standard"||option.requireProfilePhoto||option.requireCarDocument||option.requireAlvara||
    option.requireCondutaxi||option.requireVehicle2016||option.isPdfOnly||option.showYearField||
    option.docNameMode!=="none"||option.commissionValue||questions||documents)
    throw new Error("validra_cart_requirements_not_ready");
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
 * New carts are restricted to simple options until per-item forms, referral
 * accounting and notices are integrated. Resume is based on the stored quote. */
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
    // Refuse every option with outstanding form requirements, even if a
    // malicious client omits fields or submits only the first cart item.
    for(const item of quote.items){
      const [option]=await db.select().from(productOptions).where(and(eq(productOptions.id,item.optionId),eq(productOptions.productId,item.productId),eq(productOptions.isActive,1))).limit(1);
      const [product]=await db.select({id:products.id,isActive:products.isActive}).from(products).where(eq(products.id,item.productId)).limit(1);
      if(!option||!product||!product.isActive)throw new Error("validra_selection_unavailable");
      const [questions]=await db.select({id:productQuestions.id}).from(productQuestions)
        .where(sql`${productQuestions.optionId}=${item.optionId} OR (${productQuestions.productId}=${item.productId} AND ${productQuestions.optionId} IS NULL)`).limit(1);
      const [document]=await db.select({id:optionDocuments.id}).from(optionDocuments).where(eq(optionDocuments.optionId,item.optionId)).limit(1);
      assertSimpleValidraCartOption(option,questions?1:0,document?1:0);
    }
    snapshot={quote,orders:quote.items.map(item=>({
      effectivePhone:owner.phone,clientName:customer.name,productId:item.productId,
      serviceName:item.serviceName,serviceOption:item.serviceOption,answers:"[]",
    }))};
  }
  const result=await runValidraCartCheckout(input.externalId,snapshot,allowNew,new ValidraPayClient(),true);
  if(result.kind==="payment")return {...result,summary:publicSummary(snapshot)};
  const orders=result.kind==="duplicate"?await listOwnedValidraCartOrders(input.externalId,owner):result.orders;
  return {kind:"persisted" as const,orders,summary:publicSummary(snapshot)};
}
