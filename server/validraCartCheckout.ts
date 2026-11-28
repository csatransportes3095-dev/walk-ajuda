import { getOrCreateValidraCharge } from "./validraAttemptStorage";
import { reserveValidraCart, persistPaidValidraCart, type ValidraCartSnapshot } from "./validraCartPersistence";
import { ValidraPayClient, validraChargeIsPaid } from "./validraPay";

/** Server-side cart orchestration. The input is a validated and frozen
 * server snapshot, never raw browser totals or order details. */
export async function runValidraCartCheckout(externalId:string,snapshot:ValidraCartSnapshot,allowNew:boolean,client=new ValidraPayClient()){
  const attempt=await reserveValidraCart(externalId,snapshot,allowNew);
  const result=await getOrCreateValidraCharge(attempt,client,allowNew);
  if(result.kind==="duplicate")return {kind:"duplicate" as const,registrationId:result.registrationId};
  const charge=result.charge;
  if(validraChargeIsPaid(charge,attempt)){
    const persisted=await persistPaidValidraCart(externalId,charge);
    return {kind:"persisted" as const,...persisted};
  }
  if(!["processing","active"].includes(charge.status))throw new Error("validra_payment_needs_review");
  return {kind:"payment" as const,payment:{
    externalId,status:charge.status,amount:charge.amount,expiresAt:charge.expires_at,
    pixCopyPaste:charge.status==="active"?charge.pix_copy_paste:null,
    qrCodePngBase64:charge.status==="active"?charge.qr_code_png_base64:null
  }};
}
