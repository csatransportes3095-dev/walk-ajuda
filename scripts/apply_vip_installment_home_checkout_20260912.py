from pathlib import Path

# Backend: cancellable checkout reservation.
contracts = Path('server/vipInstallmentContracts.ts')
c = contracts.read_text(encoding='utf-8')
cancel_marker = 'export async function cancelVipInstallmentCheckoutIntent('
if cancel_marker not in c:
    anchor = '\nexport async function finalizeVipInstallmentCheckoutIntent(input: {'
    if c.count(anchor) != 1:
        raise SystemExit('cancel checkout anchor mismatch')
    fn = r'''
export async function cancelVipInstallmentCheckoutIntent(input: {
  checkoutToken: string;
  customerId: number;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || '').trim();
  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT id, customerId, status, finalizedPlanId
      FROM vipInstallmentCheckoutIntents
      WHERE checkoutToken=${checkoutToken}
      LIMIT 1
      FOR UPDATE
    `);
    const row = rowsOf<any>(result)[0];
    if (!row) return { success: true, cancelled: false };
    if (Number(row.customerId) !== input.customerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Esta reserva não pertence ao cliente autenticado." });
    }
    if (String(row.status) === 'finalized' || row.finalizedPlanId) {
      return { success: true, cancelled: false, finalized: true };
    }
    await tx.execute(sql`
      UPDATE vipInstallmentCheckoutIntents
      SET status='cancelled', activeCustomerId=NULL
      WHERE id=${Number(row.id)} AND status='prepared'
    `);
    return { success: true, cancelled: String(row.status) === 'prepared' };
  });
}
'''
    c = c.replace(anchor, '\n' + fn + anchor, 1)
contracts.write_text(c, encoding='utf-8')

router = Path('server/routers/vipInstallments.ts')
r = router.read_text(encoding='utf-8')
old_import = 'import { prepareVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment } from "../vipInstallmentContracts";'
new_import = 'import { prepareVipInstallmentCheckoutIntent, cancelVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment } from "../vipInstallmentContracts";'
if old_import in r:
    r = r.replace(old_import, new_import, 1)
elif new_import not in r:
    raise SystemExit('router contracts import mismatch')

cancel_endpoint = '  cancelCheckout: publicProcedure'
if cancel_endpoint not in r:
    anchor = '\n\n  finalizeCheckout: publicProcedure'
    if r.count(anchor) != 1:
        raise SystemExit('cancel endpoint anchor mismatch')
    endpoint = r'''

  cancelCheckout: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      checkoutToken: z.string().min(16).max(80),
    }))
    .mutation(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const customer = await customerByPhone(session.phone);
      return cancelVipInstallmentCheckoutIntent({ checkoutToken: input.checkoutToken, customerId: customer.id });
    }),'''
    r = r.replace(anchor, endpoint + anchor, 1)
router.write_text(r, encoding='utf-8')

# Frontend Home minimal integration.
home = Path('client/src/pages/Home.tsx')
s = home.read_text(encoding='utf-8')

import_anchor = 'import PaymentTutorial from "@/components/PaymentTutorial";'
checkout_import = 'import VipInstallmentCheckoutBox, { type VipInstallmentCheckoutSelection } from "@/components/VipInstallmentCheckoutBox";'
if checkout_import not in s:
    if s.count(import_anchor) != 1:
        raise SystemExit('Home checkout import anchor mismatch')
    s = s.replace(import_anchor, import_anchor + '\n' + checkout_import, 1)

state_anchor = '  const [selectedTier, setSelectedTier] = useState<WarrantyTier | null>(null);'
state_marker = 'const [vipInstallmentSelection, setVipInstallmentSelection]'
if state_marker not in s:
    if s.count(state_anchor) != 1:
        raise SystemExit('Home state anchor mismatch')
    states = '''\n  const [vipInstallmentSelection, setVipInstallmentSelection] = useState<VipInstallmentCheckoutSelection>({ mode: "cash", installmentCount: 2, frequency: "monthly", quote: null });\n  const vipCheckoutTokenRef = useRef("");\n  const vipPendingRegistrationIdRef = useRef<number | null>(null);\n'''
    s = s.replace(state_anchor, state_anchor + states, 1)

mutation_anchor = '  const addBlockingNoteMutation = trpc.customers.addBlockingNote.useMutation();'
mutation_marker = 'const prepareVipInstallmentCheckoutMutation'
if mutation_marker not in s:
    if s.count(mutation_anchor) != 1:
        raise SystemExit('Home mutation anchor mismatch')
    mutations = '''\n  const prepareVipInstallmentCheckoutMutation = trpc.vipInstallments.prepareCheckout.useMutation();\n  const finalizeVipInstallmentCheckoutMutation = trpc.vipInstallments.finalizeCheckout.useMutation();\n  const cancelVipInstallmentCheckoutMutation = trpc.vipInstallments.cancelCheckout.useMutation();\n'''
    s = s.replace(mutation_anchor, mutation_anchor + mutations, 1)

# Stable helpers and cancellation when identity/terms change.
helper_anchor = '  // Determinar se é fluxo PDF-only - agora vem da opção selecionada'
helper_marker = 'const createVipCheckoutToken = () =>'
if helper_marker not in s:
    if s.count(helper_anchor) != 1:
        raise SystemExit('Home helper anchor mismatch')
    helpers = r'''  const createVipCheckoutToken = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return `vip_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  };

  const releaseVipCheckoutReservation = useCallback(() => {
    const checkoutToken = vipCheckoutTokenRef.current;
    if (!checkoutToken) return;
    const cpToken = localStorage.getItem('cp_token') || '';
    if (cpToken.length >= 32) {
      cancelVipInstallmentCheckoutMutation.mutate({ cpToken, phone: clientPhone.trim() || undefined, checkoutToken });
    }
    vipCheckoutTokenRef.current = '';
    vipPendingRegistrationIdRef.current = null;
  }, [cancelVipInstallmentCheckoutMutation, clientPhone]);

'''
    s = s.replace(helper_anchor, helpers + helper_anchor, 1)

# Reset selection when item identity or discount terms change. Cancel any prepared reservation first.
effect_anchor = '  // Obter valor atual (usa benefício VIP do Modelo/Categoria quando configurado)'
effect_marker = 'vip-checkout-reset'
if effect_marker not in s:
    if s.count(effect_anchor) != 1:
        raise SystemExit('Home reset effect anchor mismatch')
    effect = '''  // vip-checkout-reset: troca de produto/preço/cupom invalida qualquer reserva antiga.\n  useEffect(() => {\n    if (vipCheckoutTokenRef.current) releaseVipCheckoutReservation();\n    setVipInstallmentSelection({ mode: "cash", installmentCount: 2, frequency: "monthly", quote: null });\n  }, [selectedProduct?.id, selectedOption?.id, selectedPriceModel?.id, selectedTier?.id, couponValid, couponCode]);\n\n'''
    s = s.replace(effect_anchor, effect + effect_anchor, 1)

# Replace PIX value with first frozen installment when financing.
old_pix = "  // Valor a exibir no PIX: total do carrinho ou valor do produto individual\n  const pixValue = cart.length > 1 ? ((couponDiscount || hasResellerDiscount) ? cartTotalWithDiscount : cartTotalFormatted) : ((couponDiscount || hasResellerDiscount) ? finalValue : originalValue);"
if old_pix in s:
    new_pix = '''  // Valor a exibir no PIX: à vista mantém o cálculo atual; Parcelamento VIP cobra somente a parcela 1 congelada pelo servidor.\n  const cashPixValue = cart.length > 1 ? ((couponDiscount || hasResellerDiscount) ? cartTotalWithDiscount : cartTotalFormatted) : ((couponDiscount || hasResellerDiscount) ? finalValue : originalValue);\n  const vipFirstInstallmentCents = Number(vipInstallmentSelection.quote?.quote?.installments?.[0]?.amountCents || 0);\n  const pixValue = vipInstallmentSelection.mode === "vip_installment" && vipFirstInstallmentCents > 0\n    ? (vipFirstInstallmentCents / 100).toFixed(2).replace('.', ',')\n    : cashPixValue;'''
    s = s.replace(old_pix, new_pix, 1)
elif 'const cashPixValue =' not in s:
    raise SystemExit('PIX value anchor not found')

# Insert checkout selector in summary immediately before the advance button.
advance_comment = "              {/* BOTÃO AVANÇAR PARA PAGAMENTO - só aparece no resumo */}"
selector_marker = '<VipInstallmentCheckoutBox'
if selector_marker not in s:
    if s.count(advance_comment) != 1:
        raise SystemExit('Home summary selector anchor mismatch')
    selector = r'''              {cadastroSubStep === 'resumo' && (
                <VipInstallmentCheckoutBox
                  key={`vip-checkout-${selectedProduct?.id || 0}-${selectedOption?.id || 0}-${selectedPriceModel?.id || 0}-${selectedTier?.id || 0}-${couponValid ? couponCode : ''}`}
                  cpToken={localStorage.getItem('cp_token') || ''}
                  phone={clientPhone.trim() || undefined}
                  productId={selectedProduct?.id || null}
                  optionId={selectedOption?.id || null}
                  priceModelId={selectedPriceModel?.id || null}
                  warrantyTierId={selectedTier?.id || null}
                  couponCode={couponValid ? couponCode : null}
                  disabledReason={cart.length > 0 ? 'Nesta primeira versão, o Parcelamento VIP está disponível somente na compra direta de um produto por vez.' : activeResellerSlug ? 'Parcelamento VIP não está disponível no fluxo de revendedor.' : !selectedProduct || !selectedOption ? 'Selecione um produto e uma opção para consultar o parcelamento.' : null}
                  onSelectionChange={setVipInstallmentSelection}
                />
              )}

'''
    s = s.replace(advance_comment, selector + advance_comment, 1)

# Advance button: reserve/freeze the validated quote before the customer makes the PIX.
old_button = "                <button onClick={() => setCadastroSubStep('pagamento')}\n                  className=\"w-full px-4 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-black rounded-xl transition-all duration-300 transform hover:scale-105 text-lg tracking-wider shadow-[0_0_20px_rgba(34,197,94,0.4)]\">"
if old_button in s:
    new_button = '''                <button onClick={async () => {\n                  if (vipInstallmentSelection.mode !== 'vip_installment') { setCadastroSubStep('pagamento'); return; }\n                  if (!vipInstallmentSelection.quote || !selectedProduct || !selectedOption) { toast.error('Aguarde a simulação do Parcelamento VIP.'); return; }\n                  const cpToken = localStorage.getItem('cp_token') || '';\n                  if (cpToken.length < 32) { toast.error('Sua sessão expirou. Entre novamente para parcelar.'); return; }\n                  const checkoutToken = vipCheckoutTokenRef.current || createVipCheckoutToken();\n                  vipCheckoutTokenRef.current = checkoutToken;\n                  try {\n                    const prepared = await prepareVipInstallmentCheckoutMutation.mutateAsync({\n                      cpToken,\n                      phone: clientPhone.trim() || undefined,\n                      checkoutToken,\n                      items: [{ productId: selectedProduct.id, optionId: selectedOption.id, priceModelId: selectedPriceModel?.id || null, warrantyTierId: selectedTier?.id || null }],\n                      couponCode: couponValid ? couponCode : undefined,\n                      installmentCount: vipInstallmentSelection.installmentCount,\n                      frequency: vipInstallmentSelection.frequency,\n                    });\n                    setVipInstallmentSelection(prev => ({ ...prev, quote: { pricing: prepared.pricing, quote: prepared.quote } }));\n                    setCadastroSubStep('pagamento');\n                  } catch (error: any) {\n                    vipCheckoutTokenRef.current = '';\n                    toast.error(error?.message || 'Não foi possível reservar o Parcelamento VIP.');\n                  }\n                }} disabled={prepareVipInstallmentCheckoutMutation.isPending}\n                  className="w-full px-4 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-black rounded-xl transition-all duration-300 transform hover:scale-105 text-lg tracking-wider shadow-[0_0_20px_rgba(34,197,94,0.4)] disabled:opacity-50">'''
    s = s.replace(old_button, new_button, 1)
elif 'prepareVipInstallmentCheckoutMutation.isPending' not in s:
    raise SystemExit('Home advance button anchor mismatch')

# Make payment header explicit when paying first installment.
payment_title = '<p className="text-blue-400 font-black text-base tracking-widest">PAGAMENTO VIA PIX</p>'
if 'PARCELA 1 DE {vipInstallmentSelection.installmentCount}' not in s:
    if s.count(payment_title) != 1:
        raise SystemExit('payment title anchor mismatch')
    replacement = payment_title + '''\n                  {vipInstallmentSelection.mode === 'vip_installment' && <p className="text-violet-300 text-xs font-black">PARCELA 1 DE {vipInstallmentSelection.installmentCount}</p>}'''
    s = s.replace(payment_title, replacement, 1)

# Going back from payment releases prepared checkout so customer isn't falsely blocked.
old_back = "              <button onClick={() => setCadastroSubStep('resumo')} disabled={isSubmitting}"
if old_back in s:
    new_back = "              <button onClick={() => { if (vipInstallmentSelection.mode === 'vip_installment') releaseVipCheckoutReservation(); setCadastroSubStep('resumo'); }} disabled={isSubmitting}"
    s = s.replace(old_back, new_back, 1)
elif 'releaseVipCheckoutReservation(); setCadastroSubStep' not in s:
    raise SystemExit('payment back anchor mismatch')

# Prepare/finalize around normal single-order submission. Cart/reseller paths remain cash-only.
cart_anchor = '      // Se carrinho tem múltiplos itens, criar um pedido para cada item\n      const cartItems = cart.length > 1 ? cart : null;'
if 'const vipInstallmentActive =' not in s:
    if s.count(cart_anchor) != 1:
        raise SystemExit('cart anchor mismatch')
    pre = '''      // Parcelamento VIP é exclusivo do fluxo direto de um único produto nesta primeira versão.\n      const vipInstallmentActive = vipInstallmentSelection.mode === 'vip_installment';\n      if (vipInstallmentActive && (cart.length > 0 || activeResellerSlug || !selectedProduct || !selectedOption)) {\n        throw new Error('Parcelamento VIP disponível somente para compra direta de um produto por vez.');\n      }\n      if (vipInstallmentActive && !vipCheckoutTokenRef.current) {\n        throw new Error('Reserva do Parcelamento VIP ausente. Volte ao resumo e faça a simulação novamente.');\n      }\n\n'''
    s = s.replace(cart_anchor, pre + cart_anchor, 1)

submit_line = '      const result = await submitMutation.mutateAsync({' 
if 'vipPendingRegistrationIdRef.current' not in s[s.index(submit_line)-250:s.index(submit_line)+250] if submit_line in s else '':
    if s.count(submit_line) != 1:
        raise SystemExit(f'single submit anchor mismatch: {s.count(submit_line)}')
    s = s.replace(submit_line, '''      const result = vipInstallmentActive && vipPendingRegistrationIdRef.current\n        ? ({ success: true, persisted: true, registrationId: vipPendingRegistrationIdRef.current } as any)\n        : await submitMutation.mutateAsync({''', 1)

persist_anchor = '      if (isPersistedOrderResult(result)) {\n        // Registrar pedido do revendedor se houver slug ativo'
if 'Finalizando Parcelamento VIP' not in s:
    if s.count(persist_anchor) != 1:
        raise SystemExit('persisted result anchor mismatch')
    finalize = '''      if (isPersistedOrderResult(result)) {\n        if (vipInstallmentActive) {\n          vipPendingRegistrationIdRef.current = result.registrationId;\n          setSubmitProgress('Finalizando Parcelamento VIP...');\n          const cpToken = localStorage.getItem('cp_token') || '';\n          const finalized = await finalizeVipInstallmentCheckoutMutation.mutateAsync({\n            cpToken,\n            phone: phone || undefined,\n            checkoutToken: vipCheckoutTokenRef.current,\n            registrationId: result.registrationId,\n            paymentProofUrl: paymentProofUploadedUrl,\n            paymentProofMime: getProofMime(paymentProof),\n          });\n          if (!finalized?.planId) throw new Error('O pedido foi salvo, mas o contrato parcelado não foi confirmado. Tente finalizar novamente.');\n          vipPendingRegistrationIdRef.current = null;\n          vipCheckoutTokenRef.current = '';\n        }\n        // Registrar pedido do revendedor se houver slug ativo'''
    s = s.replace(persist_anchor, finalize, 1)

# Reset must release local reservation state (server cancellation is best-effort when user explicitly goes back).
reset_anchor = '  const resetAllStates = useCallback(() => {'
if 'vipCheckoutTokenRef.current = \'\';' not in s[s.index(reset_anchor):s.index(reset_anchor)+500] if reset_anchor in s else '':
    if s.count(reset_anchor) != 1:
        raise SystemExit('reset anchor mismatch')
    s = s.replace(reset_anchor, reset_anchor + "\n    vipCheckoutTokenRef.current = '';\n    vipPendingRegistrationIdRef.current = null;\n    setVipInstallmentSelection({ mode: 'cash', installmentCount: 2, frequency: 'monthly', quote: null });", 1)

home.write_text(s, encoding='utf-8')
