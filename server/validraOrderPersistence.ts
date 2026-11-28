import { eq, sql } from "drizzle-orm";
import { accessCodePhones, accessCodes, orderCounter, orderStatusHistory } from "../drizzle/schema";
import { createSqlOrderPersistenceStore, persistPublicOrder, type PublicOrderPersistenceInput } from "./orderPersistence";
import { ensureValidraAttemptStorage, reconcileValidraAttempt } from "./validraAttemptStorage";
import { ValidraPayClient, validraAmount } from "./validraPay";

type AttemptRow = {
  customer_id: number;
  purchase_digest: string;
  amount_cents: string | number;
  charge_id: string | null;
  registration_id: number | null;
  state: string;
};

function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("validra_order_persistence_failed");
  return id;
}

// Internal server contract, NOT a public procedure. Call only after normal
// checkout validation and server-side pricing; never accept a client digest.
export type TrustedPaidOrderInput = {
  externalId: string;
  customerId: number;
  purchaseDigest: string;
  amountCents: number;
  order: Omit<PublicOrderPersistenceInput, "cpTokenValid" | "accessCode" | "generalPassword" | "pricePaid">;
};

export function validatePaidOrderBinding(row: AttemptRow | undefined, input: Pick<TrustedPaidOrderInput, "customerId" | "purchaseDigest" | "amountCents">) {
  if (!row || Number(row.customer_id) !== input.customerId ||
      row.purchase_digest !== input.purchaseDigest || Number(row.amount_cents) !== input.amountCents) {
    throw new Error("validra_attempt_conflict");
  }
  if (row.state === "consumed" && row.registration_id) return { duplicate: true as const, registrationId: positiveId(row.registration_id) };
  if (row.state !== "pending" || row.registration_id !== null) throw new Error("validra_attempt_needs_review");
  return { duplicate: false as const };
}

/** Atomically consumes a verified charge with one initial order. Existing
 * manual persistence and notifications remain unchanged. No external calls
 * or schema DDL inside the transaction. Notify only after commit, and never
 * from the duplicate response. */
export async function persistPaidValidraOrder(input: TrustedPaidOrderInput, client = new ValidraPayClient()) {
  const amount = validraAmount(input.amountCents);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.externalId) || !/^[a-f0-9]{64}$/.test(input.purchaseDigest)) throw new Error("validra_invalid_attempt");
  const db = await ensureValidraAttemptStorage();
  const [preRows] = await db.execute(sql`SELECT customer_id, purchase_digest, amount_cents, charge_id, registration_id, state
    FROM validra_checkout_attempts WHERE external_id = ${input.externalId}`);
  const pre = validatePaidOrderBinding((preRows as unknown as AttemptRow[])[0], input);
  if (pre.duplicate) return pre;
  const verified = await reconcileValidraAttempt(input.externalId, input.customerId, client);
  if (!verified.confirmedPaid) throw new Error("validra_payment_not_confirmed");

  return db.transaction(async tx => {
    const [lockedRows] = await tx.execute(sql`SELECT customer_id, purchase_digest, amount_cents, charge_id, registration_id, state
      FROM validra_checkout_attempts WHERE external_id = ${input.externalId} FOR UPDATE`);
    const row = (lockedRows as unknown as AttemptRow[])[0];
    const binding = validatePaidOrderBinding(row, input);
    if (binding.duplicate) return binding;
    if (row.charge_id !== verified.chargeId) throw new Error("validra_charge_conflict");

    const [customerRows] = await tx.execute(sql`SELECT id, phone, blocked, deletedAt FROM customers
      WHERE id = ${input.customerId} FOR UPDATE`);
    const customer = (customerRows as unknown as Array<{ id: number; phone: string; blocked: number; deletedAt: Date | null }>)[0];
    if (!customer || customer.deletedAt || Number(customer.blocked) !== 0 ||
      customer.phone.replace(/\D/g, "") !== input.order.effectivePhone.replace(/\D/g, "")) throw new Error("validra_customer_mismatch");

    const store = createSqlOrderPersistenceStore(tx as unknown as Parameters<typeof createSqlOrderPersistenceStore>[0]);
    // Use insertId, not SELECT latest by phone; concurrent independent orders
    // may otherwise attach documents/status to the wrong registration.
    store.createAccessCode = async value => {
      await tx.insert(accessCodes).values(value).onDuplicateKeyUpdate({ set: { code: value.code } });
      return store.findAccessCodeId(value.code);
    };
    store.createAccessCodePhone = async (codeId, phone, consumed) => {
      const [result] = await tx.insert(accessCodePhones).values({ codeId, phone, consumed });
      return positiveId(result.insertId);
    };
    const persisted = await persistPublicOrder({
      ...input.order,
      cpTokenValid: true,
      pricePaid: "R$ " + amount.replace(".", ","),
    }, {
      store,
      generateOrderNumber: async () => {
        const [result] = await tx.insert(orderCounter).values({ createdAt: new Date() });
        return positiveId(result.insertId);
      },
      addOrderStatus: async data => {
        const [result] = await tx.insert(orderStatusHistory).values({ ...data, orderNumber: positiveId(data.orderNumber) });
        const [status] = await tx.select().from(orderStatusHistory).where(eq(orderStatusHistory.id, positiveId(result.insertId))).limit(1);
        if (!status) throw new Error("validra_order_persistence_failed");
        return status;
      },
    });
    if (!persisted.orderNumber) throw new Error("validra_order_persistence_failed");
    await tx.execute(sql`UPDATE validra_checkout_attempts SET state = 'consumed', registration_id = ${persisted.registrationId}
      WHERE external_id = ${input.externalId} AND state = 'pending' AND registration_id IS NULL AND charge_id = ${verified.chargeId}`);
    const [committedRows] = await tx.execute(sql`SELECT registration_id, state FROM validra_checkout_attempts WHERE external_id = ${input.externalId}`);
    const committed = (committedRows as unknown as Array<{ registration_id: number; state: string }>)[0];
    if (committed?.state !== "consumed" || Number(committed.registration_id) !== persisted.registrationId) throw new Error("validra_order_binding_failed");
    return { duplicate: false as const, ...persisted };
  });
}
