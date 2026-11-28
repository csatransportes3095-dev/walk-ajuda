import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("./validraAttemptStorage", () => ({ getOrCreateValidraCharge: vi.fn() }));
vi.mock("./validraOrderPersistence", () => ({ persistPaidValidraOrder: vi.fn() }));
import { getOrCreateValidraCharge } from "./validraAttemptStorage";
import { persistPaidValidraOrder } from "./validraOrderPersistence";
import { runValidraCheckout, validraPurchaseDigest } from "./validraCheckout";
import type { ValidraCharge, ValidraPayClient } from "./validraPay";
const client = {} as ValidraPayClient;
const input = { externalId:"pedido-1", customerId: 21, purchaseDigest: "a".repeat(64), amountCents: 9900, order: { effectivePhone:"11999990000", productId:1 } };
const charge: ValidraCharge = { id:"chg_"+"a".repeat(32), external_id:input.externalId, amount:"99.00", status:"active", pix_copy_paste:"pix", qr_code_png_base64:null, expires_at:null, updated_at:"2026-11-28T00:00:00Z", payment:null, amount_refunded:"0.00" };
describe("Validra checkout orchestration (mocked provider and store)", () => {
  beforeEach(() => vi.resetAllMocks());
  it("shows the same charge without persisting an unpaid order", async () => {
    vi.mocked(getOrCreateValidraCharge).mockResolvedValue({ kind:"charge", charge });
    expect(await runValidraCheckout(input,true,client)).toMatchObject({kind:"payment",payment:{amount:"99.00",pixCopyPaste:"pix"}});
    expect(persistPaidValidraOrder).not.toHaveBeenCalled();
  });
  it("persists only a matching paid charge", async () => {
    const paid={...charge,status:"paid",payment:{amount:"99.00",end_to_end_id:"E123",paid_at:"2026-11-28T00:00:00Z"}};
    vi.mocked(getOrCreateValidraCharge).mockResolvedValue({kind:"charge",charge:paid});
    vi.mocked(persistPaidValidraOrder).mockResolvedValue({duplicate:false,registrationId:1,orderStatusId:2,orderNumber:3,initialStatus:"pedido_recebido",previousOrderCount:0});
    expect(await runValidraCheckout(input,true,client)).toMatchObject({kind:"persisted",order:{registrationId:1}});
    expect(persistPaidValidraOrder).toHaveBeenCalledWith(input,client,paid);
  });
  it.each([{amount_refunded:"1.00"},{paid_after_expiration:true},{paid_after_cancellation:true},{payment:{amount:"1.00",end_to_end_id:"E123",paid_at:"2026-11-28T00:00:00Z"}}])("rejects disputed or wrong payment %o",async change=>{
    vi.mocked(getOrCreateValidraCharge).mockResolvedValue({kind:"charge",charge:{...charge,status:"paid",payment:{amount:"99.00",end_to_end_id:"E123",paid_at:"2026-11-28T00:00:00Z"},...change}});
    await expect(runValidraCheckout(input,true,client)).rejects.toThrow("validra_payment_needs_review");
    expect(persistPaidValidraOrder).not.toHaveBeenCalled();
  });
  it("returns the existing registration without another order",async()=>{
    vi.mocked(getOrCreateValidraCharge).mockResolvedValue({kind:"duplicate",registrationId:1});
    expect(await runValidraCheckout(input,false,client)).toEqual({kind:"duplicate",registrationId:1});
    expect(persistPaidValidraOrder).not.toHaveBeenCalled();
  });
  it("binds the complete purchase independent of key order",()=>{
    expect(validraPurchaseDigest({a:1,b:2})).toBe(validraPurchaseDigest({b:2,a:1}));
    expect(validraPurchaseDigest({a:1,b:2})).not.toBe(validraPurchaseDigest({a:1,b:3}));
  });
});
