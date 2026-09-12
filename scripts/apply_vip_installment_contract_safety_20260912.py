from pathlib import Path

path = Path('server/vipInstallmentContractService.ts')
text = path.read_text(encoding='utf-8')

old_import = 'import { ensureVipInstallmentInfrastructure, getVipInstallmentConfig, resolveVipInstallmentEligibility } from "./routers/vipInstallments";'
new_import = 'import { ensureVipInstallmentInfrastructure, getVipInstallmentConfig } from "./routers/vipInstallments";\nimport { resolveVipInstallmentEligibility } from "./vipInstallmentEligibility";'
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('eligibility import anchor not found')

old_infra = '''      await addColumnIfMissing(db, "vipInstallmentPlans", "registrationId", "INT NULL AFTER customerId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "priceModelId", "INT NULL AFTER optionId");'''
new_infra = '''      await addColumnIfMissing(db, "vipInstallmentPlans", "registrationId", "INT NULL AFTER customerId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "orderStatusId", "INT NULL AFTER registrationId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "checkoutKey", "VARCHAR(64) NULL AFTER orderStatusId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "priceModelId", "INT NULL AFTER optionId");'''
if old_infra in text:
    text = text.replace(old_infra, new_infra, 1)
elif '"checkoutKey", "VARCHAR(64)' not in text:
    raise SystemExit('infrastructure anchor not found')

old_index = '      await addIndexIfMissing(db, "ALTER TABLE vipInstallmentPlans ADD UNIQUE KEY uq_vipInstallmentPlans_registration (registrationId)");'
new_index = '''      await addIndexIfMissing(db, "ALTER TABLE vipInstallmentPlans ADD UNIQUE KEY uq_vipInstallmentPlans_order_status (orderStatusId)");
      await addIndexIfMissing(db, "ALTER TABLE vipInstallmentPlans ADD UNIQUE KEY uq_vipInstallmentPlans_checkout_key (checkoutKey)");'''
if old_index in text:
    text = text.replace(old_index, new_index, 1)
elif 'uq_vipInstallmentPlans_checkout_key' not in text:
    raise SystemExit('index anchor not found')

# Avoid attaching installment cash entries to registrationId because the legacy order-status sync
# treats registrationId as a single sale. Receivable/order linkage remains on vipInstallmentPlans.
text = text.replace('(${row.registrationId == null ? null : Number(row.registrationId)}, ${String(row.customerName || \'\')},',
                    '(${null}, ${String(row.customerName || \'\')},', 1)

marker = '\nexport async function createVipInstallmentPlanForOrder(input: {'
if 'export async function reserveVipInstallmentPlan' not in text:
    if marker not in text:
        raise SystemExit('create plan marker not found')
    reservation = r'''

export async function getVipInstallmentReservation(checkoutKeyValue: string) {
  await ensureVipInstallmentContractInfrastructure();
  const checkoutKey = String(checkoutKeyValue || "").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(checkoutKey)) return null;
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const row = rowsOf<any>(await db.execute(sql`
    SELECT id, customerId, registrationId, orderStatusId, orderNumber, checkoutKey, status, balanceCents
    FROM vipInstallmentPlans WHERE checkoutKey=${checkoutKey} LIMIT 1
  `))[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    customerId: Number(row.customerId),
    registrationId: row.registrationId == null ? null : Number(row.registrationId),
    orderStatusId: row.orderStatusId == null ? null : Number(row.orderStatusId),
    orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    checkoutKey: String(row.checkoutKey),
    status: String(row.status || ""),
    balanceCents: Number(row.balanceCents || 0),
  };
}

export async function reserveVipInstallmentPlan(input: {
  prepared: PreparedVipInstallmentOrder;
  checkoutKey: string;
  createdBy?: string | null;
}) {
  await ensureVipInstallmentContractInfrastructure();
  const checkoutKey = String(input.checkoutKey || "").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(checkoutKey)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador do checkout inválido." });
  }
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

  return db.transaction(async (tx: any) => {
    const sameCheckout = rowsOf<any>(await tx.execute(sql`
      SELECT id, customerId, registrationId, orderStatusId, orderNumber, status, balanceCents
      FROM vipInstallmentPlans WHERE checkoutKey=${checkoutKey} LIMIT 1 FOR UPDATE
    `))[0];
    if (sameCheckout) {
      if (Number(sameCheckout.customerId) !== input.prepared.customerId) {
        throw new TRPCError({ code: "CONFLICT", message: "Este checkout já pertence a outro cliente." });
      }
      return {
        success: true,
        alreadyReserved: true,
        planId: Number(sameCheckout.id),
        linked: sameCheckout.orderStatusId != null,
        registrationId: sameCheckout.registrationId == null ? null : Number(sameCheckout.registrationId),
        orderStatusId: sameCheckout.orderStatusId == null ? null : Number(sameCheckout.orderStatusId),
        orderNumber: sameCheckout.orderNumber == null ? null : Number(sameCheckout.orderNumber),
      };
    }

    const customerLock = rowsOf<any>(await tx.execute(sql`
      SELECT id FROM customers WHERE id=${input.prepared.customerId} AND deletedAt IS NULL LIMIT 1 FOR UPDATE
    `))[0];
    if (!customerLock) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

    const openPlan = rowsOf<any>(await tx.execute(sql`
      SELECT id, checkoutKey, balanceCents FROM vipInstallmentPlans
      WHERE openSlotCustomerId=${input.prepared.customerId} LIMIT 1 FOR UPDATE
    `))[0];
    if (openPlan && Number(openPlan.balanceCents || 0) > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe uma compra parcelada em aberto. Quite o saldo antes de criar outra." });
    }

    const membership = rowsOf<any>(await tx.execute(sql`
      SELECT id FROM vipMemberships
      WHERE customerId=${input.prepared.customerId} AND status='active' AND expiresAtMs>${Date.now()}
      ORDER BY id DESC LIMIT 1
    `))[0];
    if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "O VIP precisa estar ativo no momento da compra parcelada." });

    const resolvedItem = input.prepared.pricing.items[0];
    const snapshot = JSON.stringify({ version: 1, pricing: input.prepared.pricing, quote: input.prepared.quote, createdAtMs: Date.now() });
    const planInsert = await tx.execute(sql`
      INSERT INTO vipInstallmentPlans
        (customerId, registrationId, orderStatusId, checkoutKey, membershipId, orderNumber, productId, optionId, priceModelId, warrantyTierId,
         couponCode, termsSnapshot, productName, baseAmountCents, interestBps, interestAmountCents,
         totalAmountCents, paidAmountCents, balanceCents, installmentCount, frequency, dailyMode,
         status, openSlotCustomerId, createdBy)
      VALUES
        (${input.prepared.customerId}, ${null}, ${null}, ${checkoutKey}, ${Number(membership.id)}, ${null}, ${resolvedItem.productId}, ${resolvedItem.optionId},
         ${resolvedItem.priceModelId}, ${resolvedItem.warrantyTierId}, ${input.prepared.pricing.couponCode}, ${snapshot}, ${resolvedItem.productName},
         ${input.prepared.quote.baseAmountCents}, ${input.prepared.quote.interestBps}, ${input.prepared.quote.interestAmountCents},
         ${input.prepared.quote.totalAmountCents}, 0, ${input.prepared.quote.totalAmountCents}, ${input.prepared.quote.installmentCount},
         ${input.prepared.quote.frequency}, ${input.prepared.quote.dailyMode}, 'reserving', ${input.prepared.customerId}, ${input.createdBy || 'customer_checkout'})
    `);
    let planId = insertIdOf(planInsert);
    if (!planId) planId = Number(rowsOf<any>(await tx.execute(sql`SELECT LAST_INSERT_ID() AS id`))[0]?.id || 0);
    if (!planId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível identificar a reserva criada." });

    const now = Date.now();
    for (const installment of input.prepared.quote.installments) {
      const isFirst = installment.installmentNumber === 1;
      await tx.execute(sql`
        INSERT INTO vipInstallments
          (planId, installmentNumber, amountCents, dueDate, paidAmountCents, status, proofUrl, proofMimeType,
           proofSubmittedAtMs, paidAtMs, financeSaleId, paymentIdempotencyKey)
        VALUES
          (${planId}, ${installment.installmentNumber}, ${installment.amountCents}, ${installment.dueDate}, 0,
           ${isFirst ? 'awaiting_confirmation' : 'pending'}, ${isFirst ? input.prepared.paymentProofUrl : null},
           ${isFirst ? input.prepared.paymentProofMime : null}, ${isFirst ? now : null}, ${null}, ${null},
           ${`VIPPLAN-${planId}-INSTALLMENT-${installment.installmentNumber}`})
      `);
    }
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES (${planId}, ${null}, 'plan_reserved', 'customer', ${String(input.prepared.customerId)}, ${null}, ${snapshot}, 'Reserva idempotente criada antes do pedido')
    `);
    return { success: true, alreadyReserved: false, planId, linked: false, registrationId: null, orderStatusId: null, orderNumber: null };
  });
}

export async function linkVipInstallmentReservationToOrder(input: {
  checkoutKey: string;
  customerId: number;
  registrationId: number;
  orderStatusId: number;
  orderNumber?: number | null;
}) {
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  return db.transaction(async (tx: any) => {
    const row = rowsOf<any>(await tx.execute(sql`
      SELECT id, customerId, registrationId, orderStatusId, status
      FROM vipInstallmentPlans WHERE checkoutKey=${input.checkoutKey} LIMIT 1 FOR UPDATE
    `))[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva do parcelamento não encontrada." });
    if (Number(row.customerId) !== Number(input.customerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Reserva não pertence ao cliente." });
    if (row.orderStatusId != null) {
      if (Number(row.orderStatusId) !== Number(input.orderStatusId)) throw new TRPCError({ code: "CONFLICT", message: "Reserva já vinculada a outro pedido." });
      return { success: true, alreadyLinked: true, planId: Number(row.id) };
    }
    await tx.execute(sql`
      UPDATE vipInstallmentPlans
      SET registrationId=${input.registrationId}, orderStatusId=${input.orderStatusId}, orderNumber=${input.orderNumber ?? null}, status='active'
      WHERE id=${Number(row.id)}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES (${Number(row.id)}, ${null}, 'plan_linked_to_order', 'system', 'checkout', ${null}, ${String(input.orderStatusId)}, ${`Pedido #${input.orderNumber ?? input.orderStatusId} vinculado`})
    `);
    return { success: true, alreadyLinked: false, planId: Number(row.id) };
  });
}

export async function releaseVipInstallmentReservation(input: { checkoutKey: string; customerId: number; reason: string }) {
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  return db.transaction(async (tx: any) => {
    const row = rowsOf<any>(await tx.execute(sql`
      SELECT id, customerId, orderStatusId FROM vipInstallmentPlans WHERE checkoutKey=${input.checkoutKey} LIMIT 1 FOR UPDATE
    `))[0];
    if (!row || Number(row.customerId) !== Number(input.customerId) || row.orderStatusId != null) return { success: true, released: false };
    await tx.execute(sql`DELETE FROM vipInstallmentHistory WHERE planId=${Number(row.id)}`);
    await tx.execute(sql`DELETE FROM vipInstallments WHERE planId=${Number(row.id)}`);
    await tx.execute(sql`DELETE FROM vipInstallmentPlans WHERE id=${Number(row.id)}`);
    return { success: true, released: true, reason: input.reason };
  });
}
'''
    text = text.replace(marker, reservation + marker, 1)

# Existing post-order helper is kept for compatibility/tests but must identify the specific order.
text = text.replace('  registrationId: number;\n  createdBy?: string | null;',
                    '  registrationId: number;\n  orderStatusId: number;\n  orderNumber?: number | null;\n  createdBy?: string | null;', 1)
text = text.replace('WHERE registrationId=${registrationId}\n      LIMIT 1',
                    'WHERE orderStatusId=${input.orderStatusId}\n      LIMIT 1', 1)
text = text.replace('(customerId, registrationId, membershipId, orderNumber, productId, optionId, priceModelId, warrantyTierId,',
                    '(customerId, registrationId, orderStatusId, membershipId, orderNumber, productId, optionId, priceModelId, warrantyTierId,', 1)
text = text.replace('(${input.prepared.customerId}, ${registrationId}, ${Number(membership.id)}, ${null}, ${resolvedItem.productId},',
                    '(${input.prepared.customerId}, ${registrationId}, ${input.orderStatusId}, ${Number(membership.id)}, ${input.orderNumber ?? null}, ${resolvedItem.productId},', 1)

path.write_text(text, encoding='utf-8')
