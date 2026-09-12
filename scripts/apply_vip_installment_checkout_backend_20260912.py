from pathlib import Path

path = Path('server/routers.ts')
text = path.read_text(encoding='utf-8')

import_anchor = 'import { createSqlOrderPersistenceStore, isPersistedPublicOrder, notifyOnlyAfterPersistence, persistPublicOrder } from "./orderPersistence";'
contract_import = 'import { linkVipInstallmentReservationToOrder, prepareVipInstallmentOrder, releaseVipInstallmentReservation, reserveVipInstallmentPlan } from "./vipInstallmentContractService";'
if contract_import not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit('orderPersistence import anchor mismatch')
    text = text.replace(import_anchor, import_anchor + '\n' + contract_import, 1)

field_anchor = '        priceModelId: z.number().int().positive().optional(), // modelo/categoria de preço escolhido\n'
field_block = '''        priceModelId: z.number().int().positive().optional(), // modelo/categoria de preço escolhido
        warrantyTierId: z.number().int().positive().optional(), // garantia selecionada para validação server-side
        vipInstallment: z.object({
          checkoutKey: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
          installmentCount: z.number().int().min(2).max(120),
          frequency: z.enum(['daily', 'weekly', 'monthly']),
        }).optional(),
'''
if 'vipInstallment: z.object({' not in text:
    if text.count(field_anchor) != 1:
        raise SystemExit('priceModel input anchor mismatch')
    text = text.replace(field_anchor, field_block, 1)

phone_anchor = "          const effectivePhone = (input.phone || cpTokenPhone || '').replace(/\\D/g, '');\n"
prep_block = r'''          const effectivePhone = (input.phone || cpTokenPhone || '').replace(/\D/g, '');

          // Parcelamento VIP: validar preço/regras e reservar o único slot aberto ANTES
          // de persistir o pedido. A chave do checkout torna retry e duas abas idempotentes.
          let preparedVipInstallment: Awaited<ReturnType<typeof prepareVipInstallmentOrder>> | null = null;
          let vipInstallmentReservation: Awaited<ReturnType<typeof reserveVipInstallmentPlan>> | null = null;
          if (input.vipInstallment) {
            if (!cpTokenValid || !input.cpToken) {
              return { success: false, message: 'Entre na sua conta para usar o Parcelamento VIP.' };
            }
            if ((input.cartItemCount || 1) > 1 || input.cartGroupId) {
              return { success: false, message: 'Nesta versão, o Parcelamento VIP aceita um produto por compra.' };
            }
            if (!input.productId || !input.optionId) {
              return { success: false, message: 'Produto ou opção não identificados para o Parcelamento VIP.' };
            }
            try {
              preparedVipInstallment = await prepareVipInstallmentOrder({
                cpToken: input.cpToken,
                phone: effectivePhone,
                item: {
                  productId: input.productId,
                  optionId: input.optionId,
                  priceModelId: input.priceModelId || null,
                  warrantyTierId: input.warrantyTierId || null,
                },
                couponCode: input.couponCode || undefined,
                installmentCount: input.vipInstallment.installmentCount,
                frequency: input.vipInstallment.frequency,
                paymentProofUrl,
                paymentProofMime: input.paymentProofMime || null,
              });
              vipInstallmentReservation = await reserveVipInstallmentPlan({
                prepared: preparedVipInstallment,
                checkoutKey: input.vipInstallment.checkoutKey,
                createdBy: 'customer_checkout',
              });
              if (vipInstallmentReservation.linked && vipInstallmentReservation.registrationId) {
                return {
                  success: true,
                  message: 'Pedido parcelado já registrado.',
                  registrationId: vipInstallmentReservation.registrationId,
                  orderStatusId: vipInstallmentReservation.orderStatusId,
                  orderNumber: vipInstallmentReservation.orderNumber,
                  vipInstallmentPlanId: vipInstallmentReservation.planId,
                  duplicate: true,
                };
              }
              // O preço mostrado no pedido é reconstruído pelo servidor e representa o
              // principal da compra; recebimentos entram no Financeiro somente por parcela.
              input.price = `R$ ${(preparedVipInstallment.pricing.totalCents / 100).toFixed(2).replace('.', ',')}`;
            } catch (error: any) {
              return { success: false, message: error?.message || 'Não foi possível reservar o Parcelamento VIP.' };
            }
          }
'''
if 'let preparedVipInstallment:' not in text:
    if text.count(phone_anchor) != 1:
        raise SystemExit('effectivePhone anchor mismatch')
    text = text.replace(phone_anchor, prep_block, 1)

persist_fail_anchor = '''          if (!isPersistedPublicOrder(persistedOrder)) {
            console.error('[OrderStatus] Pedido rejeitado: registrationId/status inicial não foram persistidos.');
            return { success: false, message: 'Não foi possível registrar o pedido. Tente novamente; nenhum pedido foi confirmado.' };
          }
'''
persist_fail_block = '''          if (!isPersistedPublicOrder(persistedOrder)) {
            console.error('[OrderStatus] Pedido rejeitado: registrationId/status inicial não foram persistidos.');
            if (input.vipInstallment && preparedVipInstallment) {
              await releaseVipInstallmentReservation({
                checkoutKey: input.vipInstallment.checkoutKey,
                customerId: preparedVipInstallment.customerId,
                reason: 'order_persistence_failed',
              }).catch(() => {});
            }
            return { success: false, message: 'Não foi possível registrar o pedido. Tente novamente; nenhum pedido foi confirmado.' };
          }

          if (input.vipInstallment && preparedVipInstallment) {
            let linked = false;
            let lastLinkError: any = null;
            for (let attempt = 1; attempt <= 3 && !linked; attempt += 1) {
              try {
                await linkVipInstallmentReservationToOrder({
                  checkoutKey: input.vipInstallment.checkoutKey,
                  customerId: preparedVipInstallment.customerId,
                  registrationId: persistedOrder.registrationId,
                  orderStatusId: persistedOrder.orderStatusId,
                  orderNumber: persistedOrder.orderNumber || null,
                });
                linked = true;
              } catch (error) {
                lastLinkError = error;
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 150 * attempt));
              }
            }
            if (!linked) {
              console.error('[VIP Installments] Pedido persistido, mas vínculo do contrato falhou:', lastLinkError);
              return { success: false, message: 'Pedido registrado, mas o parcelamento precisa ser reconciliado pelo suporte. Não tente uma nova compra.' };
            }
          }
'''
if "order_persistence_failed" not in text:
    if text.count(persist_fail_anchor) != 1:
        raise SystemExit('persist failure anchor mismatch')
    text = text.replace(persist_fail_anchor, persist_fail_block, 1)

finance_anchor = '          if (outerRegId) {'
# There are other ifs in the file; anchor specifically near finance comment.
finance_comment = '          // Lançar automaticamente no Controle Financeiro como Pendente\n          if (outerRegId) {'
finance_replacement = '          // Compra parcelada não lança o valor total como receita pendente. Cada parcela entra apenas após confirmação do ADM.\n          // Compra normal preserva exatamente o fluxo financeiro atual.\n          if (outerRegId && !preparedVipInstallment) {'
if finance_replacement not in text:
    if text.count(finance_comment) != 1:
        raise SystemExit('financial auto-sale anchor mismatch')
    text = text.replace(finance_comment, finance_replacement, 1)

path.write_text(text, encoding='utf-8')
