import { describe, expect, it } from "vitest";
import { allocateValidraDiscount, calculateValidraCartTotals } from "./validraCartTotals";
describe("Validra cart totals",()=>{
  it("allocates every cent deterministically",()=>{
    expect(allocateValidraDiscount([100,100,100],2)).toEqual([1,1,0]);
    expect(allocateValidraDiscount([0,200,300],101)).toEqual([0,40,61]);
  });
  it("applies one fixed coupon to the whole cart",()=>{
    const q=calculateValidraCartTotals([{baseCents:10000},{baseCents:20000}],{globalPromotion:false,coupon:{type:"fixed",value:50}});
    expect(q).toMatchObject({subtotalCents:30000,couponCents:5000,amountCents:25000});
    expect(q.lines.reduce((n,i)=>n+i.amountCents,0)).toBe(25000);
  });
  it("applies percentage coupons and one global fixed reseller discount",()=>{
    const q=calculateValidraCartTotals([{baseCents:10000,resellerEligible:true},{baseCents:20000,resellerEligible:true}],{globalPromotion:false,coupon:{type:"percentage",value:10},resellerFixedCents:2000});
    expect(q).toMatchObject({couponCents:3000,resellerCents:2000,amountCents:25000});
  });
  it("does not stack reseller discounts on promoted items or global campaigns",()=>{
    const lines=[{baseCents:10000,resellerEligible:false,resellerPercent:50},{baseCents:20000,resellerEligible:true,resellerPercent:10}];
    expect(calculateValidraCartTotals(lines,{globalPromotion:false}).resellerCents).toBe(2000);
    expect(calculateValidraCartTotals(lines,{globalPromotion:true,coupon:{type:"fixed",value:50},resellerFixedCents:1000})).toMatchObject({amountCents:30000,couponCents:0,resellerCents:0});
  });
  it("rejects invalid discounts and totals below the Pix minimum",()=>{
    expect(()=>calculateValidraCartTotals([{baseCents:100}],{globalPromotion:false,coupon:{type:"fixed",value:1}})).toThrow();
    expect(()=>calculateValidraCartTotals([{baseCents:100,resellerEligible:true,resellerPercent:101}],{globalPromotion:false})).toThrow();
    expect(()=>allocateValidraDiscount([20,20],41)).toThrow();
  });
});
