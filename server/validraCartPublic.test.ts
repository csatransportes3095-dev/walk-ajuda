import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { assertSimpleValidraCartOption } from "./validraCartPublic";
const option={type:"standard",requireProfilePhoto:0,requireCarDocument:0,requireAlvara:0,requireCondutaxi:0,requireVehicle2016:0,isPdfOnly:0,showYearField:0,docNameMode:"none",commissionValue:0};
describe("Public Validra cart isolation",()=>{
  it("rejects any item with outstanding document, question or commission requirements",()=>{
    expect(()=>assertSimpleValidraCartOption(option,0,0)).not.toThrow();
    for(const key of ["requireProfilePhoto","requireCarDocument","requireAlvara","requireCondutaxi","requireVehicle2016","isPdfOnly","showYearField","commissionValue"] as const)
      expect(()=>assertSimpleValidraCartOption({...option,[key]:1},0,0)).toThrow("validra_cart_requirements_not_ready");
    expect(()=>assertSimpleValidraCartOption({...option,type:"pdf_only"},0,0)).toThrow();
    expect(()=>assertSimpleValidraCartOption({...option,docNameMode:"custom"},0,0)).toThrow();
    expect(()=>assertSimpleValidraCartOption(option,1,0)).toThrow();
    expect(()=>assertSimpleValidraCartOption(option,0,1)).toThrow();
  });
  it("keeps release gate before customer and provider calls and uses a separate cart mutation",()=>{
    const router=readFileSync("server/routers.ts","utf8").split("checkoutValidraCart: publicProcedure")[1].split("submitFiles: publicProcedure")[0];
    expect(router.indexOf("if(!VALIDRA_CHECKOUT_READY)")).toBeLessThan(router.indexOf("requireCustomerSession(input.cpToken,input.phone)"));
    expect(router).toContain("checkoutPublicValidraCart");
    const home=readFileSync("client/src/pages/Home.tsx","utf8");
    expect(home.indexOf("if(usingValidraCartCheckout){")).toBeLessThan(home.indexOf("const cartItems = cart.length > 1 ? cart : null"));
    expect(home).toContain("validraCartMutation.mutateAsync");
    expect(readFileSync("server/checkoutPaymentProvider.ts","utf8")).toContain("VALIDRA_CHECKOUT_READY = false");
  });
});
