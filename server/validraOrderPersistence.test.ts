import { describe, expect, it, vi } from "vitest";
vi.mock("./validraAttemptStorage", () => ({ ensureValidraAttemptStorage: vi.fn(), reconcileValidraAttempt: vi.fn() }));
import { validatePaidOrderBinding } from "./validraOrderPersistence";

const input = { customerId: 21, purchaseDigest: "a".repeat(64), amountCents: 10000 };
const row: Parameters<typeof validatePaidOrderBinding>[0] & {} = { customer_id: 21, purchase_digest: input.purchaseDigest, amount_cents: "10000", charge_id: "chg_" + "b".repeat(32), registration_id: null, state: "pending" };

describe("ValidraPay purchase binding", () => {
  it("accepts only the identical authenticated purchase", () => expect(validatePaidOrderBinding(row, input)).toEqual({ duplicate: false }));
  it.each([{ customerId: 22 }, { purchaseDigest: "b".repeat(64) }, { amountCents: 9999 }])("rejects altered purchase %o", change => expect(() => validatePaidOrderBinding(row, { ...input, ...change })).toThrow("validra_attempt_conflict"));
  it("returns the existing order for a consumed charge", () => expect(validatePaidOrderBinding({ ...row, state: "consumed", registration_id: 73 }, input)).toEqual({ duplicate: true, registrationId: 73 }));
  it("rejects inconsistent state", () => expect(() => validatePaidOrderBinding({ ...row, state: "review" }, input)).toThrow("validra_attempt_needs_review"));
  it("rejects missing attempt", () => expect(() => validatePaidOrderBinding(undefined, input)).toThrow("validra_attempt_conflict"));
});
