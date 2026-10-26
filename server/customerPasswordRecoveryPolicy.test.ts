import { describe, expect, it, vi } from "vitest";
vi.mock("./customerProfileRequirements", () => ({
  getMissingCustomerProfileFields: (customer: any) => customer.incomplete ? ["email"] : [],
}));
import { canCustomerRecoverPassword } from "./customerPasswordRecoveryPolicy";
const customer = { email:"client@example.com", blocked:0, deletedAt:null, incomplete:false };
const password = {pendingApproval:0,expiresAt:new Date(Date.now()+600000)};
describe("customer password recovery permission",()=>{
  it("requires automatic mode",()=>expect(canCustomerRecoverPassword("manual",customer,password)).toBe(false));
  it("requires completed profile",()=>expect(canCustomerRecoverPassword("auto",{...customer,incomplete:true},password)).toBe(false));
  it("rejects blocked customers",()=>expect(canCustomerRecoverPassword("auto",{...customer,blocked:1},password)).toBe(false));
  it("requires registered email",()=>expect(canCustomerRecoverPassword("auto",{...customer,email:""},password)).toBe(false));
  it("does not renew expired passwords",()=>expect(canCustomerRecoverPassword("auto",customer,{...password,expiresAt:new Date(Date.now()-60000)})).toBe(false));
  it("rejects pending approval",()=>expect(canCustomerRecoverPassword("auto",customer,{...password,pendingApproval:1})).toBe(false));
  it("allows confirmed, complete, active customers in auto mode",()=>expect(canCustomerRecoverPassword("auto",customer,password)).toBe(true));
});