from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


# Contract helper: bind token to persisted order and recover that binding.
p = Path("server/vipInstallmentContracts.ts")
text = p.read_text(encoding="utf-8")
insert_anchor = "\n\nexport async function cancelVipInstallmentCheckoutIntent(input: {"
helper = r'''

export async function bindVipInstallmentCheckoutOrder(input: {
  checkoutToken: string;
  registrationId: number;
  customerPhone: string;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || '').trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(checkoutToken)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador do checkout inválido." });
  }

  return db.transaction(async (tx: any) => {
    const intentResult = await tx.execute(sql`
      SELECT id, customerId, pricingJson, status, expiresAtMs, finalizedPlanId, finalizedRegistrationId
      FROM vipInstallmentCheckoutIntents
      WHERE checkoutToken=${checkoutToken}
      LIMIT 1
      FOR UPDATE
    `);
    const intent = rowsOf<any>(intentResult)[0];
    if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de Parcelamento VIP não encontrada." });
    if (intent.finalizedRegistrationId && Number(intent.finalizedRegistrationId) !== input.registrationId) {
      throw new TRPCError({ code: "CONFLICT", message: "Esta reserva já está vinculada a outro pedido." });
    }

    const orderResult = await tx.execute(sql`
      SELECT orderNumber, customerPhone, serviceName, serviceOption, pricePaid,
             UNIX_TIMESTAMP(createdAt) * 1000 AS orderCreatedAtMs
      FROM orderStatusHistory
      WHERE registrationId=${input.registrationId}
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
    `);
    const order = rowsOf<any>(orderResult)[0];
    if (!order || normalizePhone(order.customerPhone) !== normalizePhone(input.customerPhone)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Pedido não pertence ao checkout autenticado." });
    }
    const orderCreatedAtMs = Math.trunc(Number(order.orderCreatedAtMs || 0));
    if (!isVipInstallmentOrderInsideReservation({ expiresAtMs: Number(intent.expiresAtMs || 0), orderCreatedAtMs })) {
      throw new TRPCError({ code: "CONFLICT", message: "Pedido criado fora da janela da reserva do Parcelamento VIP." });
    }

    let pricing: VipResolvedCheckoutPricing;
    try { pricing = JSON.parse(String(intent.pricingJson)); }
    catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reserva de parcelamento corrompida." }); }
    const item = pricing?.items?.[0];
    if (!item || String(order.serviceName || '').trim().toLowerCase() !== String(item.productName || '').trim().toLowerCase()) {
      throw new TRPCError({ code: "CONFLICT", message: "Produto do pedido não corresponde à reserva do Parcelamento VIP." });
    }

    await tx.execute(sql`
      UPDATE vipInstallmentCheckoutIntents
      SET finalizedRegistrationId=${input.registrationId}
      WHERE id=${Number(intent.id)}
        AND (finalizedRegistrationId IS NULL OR finalizedRegistrationId=${input.registrationId})
    `);
    const verifyResult = await tx.execute(sql`
      SELECT finalizedRegistrationId FROM vipInstallmentCheckoutIntents WHERE id=${Number(intent.id)} LIMIT 1
    `);
    const verify = rowsOf<any>(verifyResult)[0];
    if (!verify || Number(verify.finalizedRegistrationId) !== input.registrationId) {
      throw new TRPCError({ code: "CONFLICT", message: "Não foi possível vincular o pedido à reserva VIP." });
    }
    return { success: true, registrationId: input.registrationId, status: String(intent.status || 'prepared') };
  });
}

export async function recoverVipInstallmentCheckoutOrder(input: {
  checkoutToken: string;
  customerId: number;
  customerPhone: string;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || '').trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(checkoutToken)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador do checkout inválido." });
  }

  return db.transaction(async (tx: any) => {
    const intentResult = await tx.execute(sql`
      SELECT id, customerId, pricingJson, status, expiresAtMs, finalizedPlanId, finalizedRegistrationId
      FROM vipInstallmentCheckoutIntents
      WHERE checkoutToken=${checkoutToken}
      LIMIT 1
      FOR UPDATE
    `);
    const intent = rowsOf<any>(intentResult)[0];
    if (!intent || Number(intent.customerId) !== input.customerId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de Parcelamento VIP não encontrada." });
    }
    if (intent.finalizedRegistrationId) {
      return {
        found: true,
        registrationId: Number(intent.finalizedRegistrationId),
        planId: intent.finalizedPlanId == null ? null : Number(intent.finalizedPlanId),
        status: String(intent.status || ''),
      };
    }
    const status = String(intent.status || '');
    if (!['prepared', 'expired', 'cancelled'].includes(status)) {
      return { found: false, registrationId: null, planId: null, status };
    }

    let pricing: VipResolvedCheckoutPricing;
    try { pricing = JSON.parse(String(intent.pricingJson)); }
    catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reserva de parcelamento corrompida." }); }
    const item = pricing?.items?.[0];
    if (!item) return { found: false, registrationId: null, planId: null, status };

    const expiresAtMs = Number(intent.expiresAtMs || 0);
    const startMs = expiresAtMs - VIP_INSTALLMENT_CHECKOUT_RESERVATION_MS - 30_000;
    const endMs = expiresAtMs + 30_000;
    const phone = normalizePhone(input.customerPhone);
    const candidatesResult = await tx.execute(sql`
      SELECT registrationId, orderNumber, customerPhone, serviceName, serviceOption, pricePaid,
             MIN(UNIX_TIMESTAMP(createdAt) * 1000) AS orderCreatedAtMs
      FROM orderStatusHistory
      WHERE REGEXP_REPLACE(COALESCE(customerPhone, ''), '[^0-9]', '')=${phone}
        AND UNIX_TIMESTAMP(createdAt) * 1000 BETWEEN ${startMs} AND ${endMs}
      GROUP BY registrationId, orderNumber, customerPhone, serviceName, serviceOption, pricePaid
      ORDER BY orderCreatedAtMs ASC
      LIMIT 10
    `);
    const candidates = rowsOf<any>(candidatesResult).filter((row) => {
      const createdAtMs = Math.trunc(Number(row.orderCreatedAtMs || 0));
      if (!isVipInstallmentOrderInsideReservation({ expiresAtMs, orderCreatedAtMs: createdAtMs })) return false;
      if (String(row.serviceName || '').trim().toLowerCase() !== String(item.productName || '').trim().toLowerCase()) return false;
      const optionText = String(row.serviceOption || '').trim().toLowerCase();
      const optionName = String(item.optionName || '').trim().toLowerCase();
      if (optionName && !optionText.includes(optionName)) return false;
      return true;
    });
    const uniqueRegistrationIds = [...new Set(candidates.map((row) => Number(row.registrationId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (uniqueRegistrationIds.length != 1) {
      return { found: false, registrationId: null, planId: null, status, ambiguous: uniqueRegistrationIds.length > 1 };
    }
    const registrationId = uniqueRegistrationIds[0];
    await tx.execute(sql`
      UPDATE vipInstallmentCheckoutIntents
      SET finalizedRegistrationId=${registrationId}
      WHERE id=${Number(intent.id)} AND finalizedRegistrationId IS NULL
    `);
    return { found: true, registrationId, planId: null, status, recovered: true };
  });
}
'''
text = one(text, insert_anchor, helper + insert_anchor, "contracts helper insertion")
p.write_text(text, encoding="utf-8")


# VIP router exposes authenticated recovery.
p = Path("server/routers/vipInstallments.ts")
text = p.read_text(encoding="utf-8")
old_import = 'import { prepareVipInstallmentCheckoutIntent, cancelVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment } from "../vipInstallmentContracts";'
new_import = 'import { prepareVipInstallmentCheckoutIntent, cancelVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment, recoverVipInstallmentCheckoutOrder } from "../vipInstallmentContracts";'
text = one(text, old_import, new_import, "vip router contract import")
anchor = '''  cancelCheckout: publicProcedure
    .input(z.object({'''
endpoint = '''  recoverCheckout: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      checkoutToken: z.string().min(16).max(80),
    }))
    .mutation(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const customer = await customerByPhone(session.phone);
      return recoverVipInstallmentCheckoutOrder({
        checkoutToken: input.checkoutToken,
        customerId: customer.id,
        customerPhone: session.phone,
      });
    }),

'''
text = one(text, anchor, endpoint + anchor, "recover endpoint")
p.write_text(text, encoding="utf-8")


# Main order router: optional token, then bind immediately after persistence.
p = Path("server/routers.ts")
text = p.read_text(encoding="utf-8")
vip_import = 'import { vipInstallmentsRouter } from "./routers/vipInstallments";'
text = one(text, vip_import, vip_import + '\nimport { bindVipInstallmentCheckoutOrder } from "./vipInstallmentContracts";', "main router bind import")
schema_anchor = '''        paymentProofMime: z.string().optional(),
        answers: z.string().optional(),'''
schema_new = '''        paymentProofMime: z.string().optional(),
        vipInstallmentCheckoutToken: z.string().min(16).max(80).optional(),
        answers: z.string().optional(),'''
text = one(text, schema_anchor, schema_new, "submitFiles token schema")
persist_anchor = '''              outerRegId = persistedOrder.registrationId;
              console.log('[OrderStatus] Pedido persistido antes das notificações - regId:', outerRegId, 'status:', persistedOrder.initialStatus, 'orderStatusId:', persistedOrder.orderStatusId);'''
persist_new = '''              outerRegId = persistedOrder.registrationId;
              if (input.vipInstallmentCheckoutToken && outerRegId) {
                try {
                  await bindVipInstallmentCheckoutOrder({
                    checkoutToken: input.vipInstallmentCheckoutToken,
                    registrationId: outerRegId,
                    customerPhone: effectivePhone,
                  });
                } catch (vipBindError) {
                  console.error('[VIP Installments] Pedido persistido, mas vínculo imediato da reserva falhou:', vipBindError);
                }
              }
              console.log('[OrderStatus] Pedido persistido antes das notificações - regId:', outerRegId, 'status:', persistedOrder.initialStatus, 'orderStatusId:', persistedOrder.orderStatusId);'''
text = one(text, persist_anchor, persist_new, "server-side bind after persistence")
p.write_text(text, encoding="utf-8")


# Frontend: send token and recover server binding before creating another order / on resume.
p = Path("client/src/pages/Home.tsx")
text = p.read_text(encoding="utf-8")
mutation_anchor = '''  const finalizeVipInstallmentCheckoutMutation = trpc.vipInstallments.finalizeCheckout.useMutation();
  const cancelVipInstallmentCheckoutMutation = trpc.vipInstallments.cancelCheckout.useMutation();'''
mutation_new = '''  const finalizeVipInstallmentCheckoutMutation = trpc.vipInstallments.finalizeCheckout.useMutation();
  const recoverVipInstallmentCheckoutMutation = trpc.vipInstallments.recoverCheckout.useMutation();
  const cancelVipInstallmentCheckoutMutation = trpc.vipInstallments.cancelCheckout.useMutation();'''
text = one(text, mutation_anchor, mutation_new, "frontend recover mutation")

restore_old = '''        if (pendingRegistrationId > 0 && savedToken.length >= 16 && savedToken.length <= 80) {
          vipPendingRegistrationIdRef.current = pendingRegistrationId;
          vipCheckoutTokenRef.current = savedToken;
        } else {
          vipPendingRegistrationIdRef.current = null;
          vipCheckoutTokenRef.current = '';
          if (saved.cadastroSubStep === 'pagamento') setCadastroSubStep('resumo');
        }'''
restore_new = '''        if (savedToken.length >= 16 && savedToken.length <= 80) {
          vipCheckoutTokenRef.current = savedToken;
          if (pendingRegistrationId > 0) {
            vipPendingRegistrationIdRef.current = pendingRegistrationId;
          } else {
            try {
              const cpToken = localStorage.getItem('cp_token') || '';
              const recovered = cpToken.length >= 32
                ? await recoverVipInstallmentCheckoutMutation.mutateAsync({ cpToken, phone: saved.clientPhone || undefined, checkoutToken: savedToken })
                : null;
              const recoveredId = Number(recovered?.registrationId || 0);
              if (recoveredId > 0) {
                vipPendingRegistrationIdRef.current = recoveredId;
                saved.vipInstallment.pendingRegistrationId = recoveredId;
                localStorage.setItem(PROGRESS_KEY, JSON.stringify(saved));
              } else {
                vipPendingRegistrationIdRef.current = null;
                vipCheckoutTokenRef.current = '';
                if (saved.cadastroSubStep === 'pagamento') setCadastroSubStep('resumo');
              }
            } catch {
              vipPendingRegistrationIdRef.current = null;
              vipCheckoutTokenRef.current = '';
              if (saved.cadastroSubStep === 'pagamento') setCadastroSubStep('resumo');
            }
          }
        } else {
          vipPendingRegistrationIdRef.current = null;
          vipCheckoutTokenRef.current = '';
          if (saved.cadastroSubStep === 'pagamento') setCadastroSubStep('resumo');
        }'''
text = one(text, restore_old, restore_new, "restore server binding")

submit_anchor = '''      const result = vipInstallmentActive && vipPendingRegistrationIdRef.current
        ? ({ success: true, persisted: true, registrationId: vipPendingRegistrationIdRef.current } as any)
        : await submitMutation.mutateAsync({'''
submit_new = '''      if (vipInstallmentActive && !vipPendingRegistrationIdRef.current && vipCheckoutTokenRef.current) {
        try {
          const recovered = await recoverVipInstallmentCheckoutMutation.mutateAsync({
            cpToken: cpTokenForSubmit,
            phone: phone || undefined,
            checkoutToken: vipCheckoutTokenRef.current,
          });
          const recoveredId = Number(recovered?.registrationId || 0);
          if (recoveredId > 0) persistVipInstallmentRecovery(recoveredId, vipCheckoutTokenRef.current);
        } catch (recoverError) {
          console.warn('[VIP Installments] Nenhum pedido anterior seguro para recuperar antes do envio:', recoverError);
        }
      }

      const result = vipInstallmentActive && vipPendingRegistrationIdRef.current
        ? ({ success: true, persisted: true, registrationId: vipPendingRegistrationIdRef.current } as any)
        : await submitMutation.mutateAsync({'''
text = one(text, submit_anchor, submit_new, "pre-submit recovery")

payload_anchor = '''        couponCode: couponValid ? couponCode : undefined,
        paymentProof: undefined,'''
payload_new = '''        couponCode: couponValid ? couponCode : undefined,
        vipInstallmentCheckoutToken: vipInstallmentActive ? vipCheckoutTokenRef.current : undefined,
        paymentProof: undefined,'''
text = one(text, payload_anchor, payload_new, "direct order token payload")
p.write_text(text, encoding="utf-8")
