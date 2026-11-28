import { describe,expect,it } from "vitest";
import { classifyValidraReconciledCharge } from "./validraEventWorker";
import type { ValidraCharge } from "./validraPay";
const attempt={externalId:"ci-order",amountCents:9900};
const charge:ValidraCharge={id:"chg_"+"a".repeat(32),external_id:attempt.externalId,amount:"99.00",status:"paid",pix_copy_paste:null,qr_code_png_base64:null,expires_at:null,updated_at:"2026-11-28T15:00:00Z",amount_refunded:"0.00",payment:{amount:"99.00",end_to_end_id:"E-test",paid_at:"2026-11-28T15:00:00Z"}};
describe("ValidraPay event reconciliation decisions",()=>{
  it("fulfills only a verified paid snapshot once",()=>{
    expect(classifyValidraReconciledCharge(charge,attempt,"pending",true)).toBe("fulfill_cart");
    expect(classifyValidraReconciledCharge(charge,attempt,"consumed",true)).toBe("already_consumed");
    expect(classifyValidraReconciledCharge(charge,attempt,"pending",false)).toBe("paid_snapshot_missing");
  });
  it("uses provider current status rather than an event's status",()=>{
    expect(classifyValidraReconciledCharge({...charge,status:"active",payment:null},attempt,"pending",true)).toBe("unpaid");
  });
  it("reviews refunds, late payments and mismatches instead of creating orders",()=>{
    expect(classifyValidraReconciledCharge({...charge,amount_refunded:"1.00"},attempt,"consumed",true)).toBe("refund_review");
    expect(classifyValidraReconciledCharge({...charge,paid_after_expiration:true},attempt,"pending",true)).toBe("late_payment_review");
    expect(classifyValidraReconciledCharge({...charge,payment:{...charge.payment!,amount:"1.00"}},attempt,"pending",true)).toBe("amount_review");
    expect(classifyValidraReconciledCharge({...charge,status:"expired",payment:null},attempt,"pending",true)).toBe("terminal_unpaid_review");
  });
});
