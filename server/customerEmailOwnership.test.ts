import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pw = readFileSync("server/routers/customerPassword.ts","utf8");
const db = readFileSync("server/db.ts","utf8");
const owner = readFileSync("server/customerEmailOwnership.ts","utf8");
const section = (start: string,end: string) => {
  const a=pw.indexOf(start), b=pw.indexOf(end,a+start.length);
  expect(a).toBeGreaterThanOrEqual(0);expect(b).toBeGreaterThan(a);
  return pw.slice(a,b);
};
describe("unique customer email ownership — fail closed security contract",()=>{
  it("checks ownership before OTP resend or first delivery",()=>{
    const part=section("startLoginEmailVerification:","verifyLoginEmailCode:");
    expect(part).toContain("emailBelongsToAnotherCustomer(db, email");
    expect(part.indexOf("emailBelongsToAnotherCustomer(db, email")).toBeLessThan(part.indexOf("deliverOwnSiteCode(email, current.code)"));
    expect(part.indexOf("emailBelongsToAnotherCustomer(db, email")).toBeLessThan(part.indexOf("deliverOwnSiteCode(email, code)"));
  });
  it("invalidates stale codes before issuing proof",()=>{
    const part=section("verifyLoginEmailCode:","checkStatus:");
    expect(part).toContain("emailBelongsToAnotherCustomer(db, email");
    expect(part.indexOf("emailBelongsToAnotherCustomer(db, email")).toBeLessThan(part.indexOf("loginEmailProofs.set(verificationToken"));
  });
  it("checks uniqueness at password creation and session login",()=>{
    expect(pw.match(/emailBelongsToAnotherCustomer\(db, proof.email, Number\(cust.id\)\)/g)?.length).toBe(2);
    expect(pw).toContain("emailBelongsToAnotherCustomer(tx, proof.email, Number(customer.id))");
  });
  it("central customer writes prevent cross-account reuse",()=>{
    expect(db).toContain("emailBelongsToAnotherCustomer(db, required.email)");
    expect(db).toContain("emailBelongsToAnotherCustomer(db, candidate, id)");
  });
  it("only active accounts own an email, normalized case insensitive",()=>{
    expect(owner).toContain("deletedAt IS NULL");
    expect(owner).toContain("LOWER(TRIM(email))");
    expect(owner).toContain("id <> ${allowedCustomerId}");
  });
});
