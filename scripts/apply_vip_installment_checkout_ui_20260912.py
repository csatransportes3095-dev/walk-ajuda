from pathlib import Path

path = Path('client/src/pages/Home.tsx')
text = path.read_text(encoding='utf-8')

state_anchor = "  const [pixCopied, setPixCopied] = useState(false);\n"
states = '''  const [pixCopied, setPixCopied] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'vip_installment'>('cash');
  const [vipInstallmentCount, setVipInstallmentCount] = useState(2);
  const [vipInstallmentFrequency, setVipInstallmentFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [vipInstallmentCheckoutKey] = useState(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return `vip${Date.now()}${Math.random().toString(36).slice(2, 18)}`;
  });
'''
if "const [paymentMode, setPaymentMode]" not in text:
    if text.count(state_anchor) != 1:
        raise SystemExit('pixCopied state anchor mismatch')
    text = text.replace(state_anchor, states, 1)

vip_anchor = '  const { isVipCustomer } = useVipMembership();\n'
queries = '''  const { isVipCustomer } = useVipMembership();
  const vipInstallmentToken = typeof window !== 'undefined' ? localStorage.getItem('cp_token') || '' : '';
  const vipInstallmentSingleItem = cart.length <= 1 && !!selectedProduct && !!selectedOption;
  const vipInstallmentOfferQuery = trpc.vipInstallmentPayments.offer.useQuery({
    cpToken: vipInstallmentToken || 'disabled-disabled-disabled-disabled',
    phone: clientPhoneFromSession || undefined,
    item: {
      productId: selectedProduct?.id || 1,
      optionId: selectedOption?.id || 1,
      priceModelId: selectedPriceModel?.id || null,
      warrantyTierId: selectedTier?.id || null,
    },
    couponCode: couponValid ? couponCode : undefined,
  }, {
    enabled: isVipCustomer && vipInstallmentToken.length >= 32 && vipInstallmentSingleItem && !resellerInfo?.isReseller,
    retry: false,
    staleTime: 5_000,
  });
  const vipInstallmentOffer = vipInstallmentOfferQuery.data;
  const vipInstallmentQuoteQuery = trpc.vipInstallmentPayments.quote.useQuery({
    cpToken: vipInstallmentToken || 'disabled-disabled-disabled-disabled',
    phone: clientPhoneFromSession || undefined,
    item: {
      productId: selectedProduct?.id || 1,
      optionId: selectedOption?.id || 1,
      priceModelId: selectedPriceModel?.id || null,
      warrantyTierId: selectedTier?.id || null,
    },
    couponCode: couponValid ? couponCode : undefined,
    installmentCount: vipInstallmentCount,
    frequency: vipInstallmentFrequency,
  }, {
    enabled: paymentMode === 'vip_installment' && !!vipInstallmentOffer && vipInstallmentToken.length >= 32,
    retry: false,
    staleTime: 0,
  });
  const vipInstallmentQuote = vipInstallmentQuoteQuery.data?.quote;

  useEffect(() => {
    if (!vipInstallmentOffer) {
      if (paymentMode === 'vip_installment') setPaymentMode('cash');
      return;
    }
    const min = Number(vipInstallmentOffer.minInstallments || 2);
    const max = Number(vipInstallmentOffer.maxInstallments || min);
    setVipInstallmentCount(current => Math.min(max, Math.max(min, current)));
    const allowed = vipInstallmentOffer.allowedFrequencies as Array<'daily' | 'weekly' | 'monthly'>;
    if (!allowed.includes(vipInstallmentFrequency) && allowed.length > 0) setVipInstallmentFrequency(allowed[0]);
  }, [vipInstallmentOffer, paymentMode, vipInstallmentFrequency]);
'''
if 'vipInstallmentOfferQuery' not in text:
    if text.count(vip_anchor) != 1:
        raise SystemExit('vip membership anchor mismatch')
    text = text.replace(vip_anchor, queries, 1)

pix_anchor = "  const pixValue = cart.length > 1 ? ((couponDiscount || hasResellerDiscount) ? cartTotalWithDiscount : cartTotalFormatted) : ((couponDiscount || hasResellerDiscount) ? finalValue : originalValue);\n"
pix_replacement = '''  const pixValue = cart.length > 1 ? ((couponDiscount || hasResellerDiscount) ? cartTotalWithDiscount : cartTotalFormatted) : ((couponDiscount || hasResellerDiscount) ? finalValue : originalValue);
  const vipFirstInstallment = vipInstallmentQuote?.installments?.[0] || null;
  const paymentPixValue = paymentMode === 'vip_installment' && vipFirstInstallment
    ? (vipFirstInstallment.amountCents / 100).toFixed(2).replace('.', ',')
    : pixValue;
'''
if 'const paymentPixValue =' not in text:
    if text.count(pix_anchor) != 1:
        raise SystemExit('pixValue anchor mismatch')
    text = text.replace(pix_anchor, pix_replacement, 1)

# Always send exact product references for single checkout. Existing server permissions still validate them.
text = text.replace("        productId: optionHasAudioQuestions ? selectedProduct?.id : undefined,\n        optionId: optionHasAudioQuestions ? selectedOption?.id : undefined,\n        questionAudioFlowId: optionHasAudioQuestions ? questionAudioFlowId : undefined,",
                    "        productId: selectedProduct?.id,\n        optionId: selectedOption?.id,\n        priceModelId: selectedPriceModel?.id || undefined,\n        warrantyTierId: selectedTier?.id || undefined,\n        questionAudioFlowId: optionHasAudioQuestions ? questionAudioFlowId : undefined,", 1)

third_party_anchor = "        thirdPartyName: thirdPartyName.trim() || undefined,\n"
installment_payload = '''        vipInstallment: paymentMode === 'vip_installment' ? {
          checkoutKey: vipInstallmentCheckoutKey,
          installmentCount: vipInstallmentCount,
          frequency: vipInstallmentFrequency,
        } : undefined,
        thirdPartyName: thirdPartyName.trim() || undefined,
'''
if "vipInstallment: paymentMode === 'vip_installment'" not in text:
    # only single-item payload: use last occurrence before result submission by replacing last occurrence
    idx = text.rfind(third_party_anchor)
    if idx < 0:
        raise SystemExit('thirdPartyName payload anchor not found')
    text = text[:idx] + text[idx:].replace(third_party_anchor, installment_payload, 1)

# Guard submit against stale/missing server quote in financed mode.
submit_validation_anchor = "    if (!restoredFileUrls.paymentProof) {\n"
submit_validation = '''    if (paymentMode === 'vip_installment') {
      if (!vipInstallmentOffer || !vipInstallmentQuote || vipInstallmentQuoteQuery.isFetching) {
        toast.error('Aguarde a confirmação das condições do Parcelamento VIP.');
        submitLockRef.current = false;
        return;
      }
    }
    if (!restoredFileUrls.paymentProof) {
'''
if "Aguarde a confirmação das condições do Parcelamento VIP" not in text:
    if text.count(submit_validation_anchor) != 1:
        raise SystemExit('submit validation anchor mismatch')
    text = text.replace(submit_validation_anchor, submit_validation, 1)

# Payment method/simulator block at the end of the summary, before advance button.
advance_anchor = "              {/* BOTÃO AVANÇAR PARA PAGAMENTO - só aparece no resumo */}\n"
choice_block = '''              {cadastroSubStep === 'resumo' && isVipCustomer && vipInstallmentSingleItem && !resellerInfo?.isReseller && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-sm font-black uppercase tracking-wide text-amber-300">Forma de pagamento</p><p className="mt-1 text-xs text-slate-400">À vista continua disponível. Parcelamento aparece somente quando liberado pelo ADM.</p></div>
                    <a href="/parcelas-vip" className="text-[10px] font-black uppercase text-cyan-300 underline underline-offset-4">Minhas parcelas</a>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setPaymentMode('cash')} className={`rounded-xl border px-3 py-3 text-sm font-black ${paymentMode === 'cash' ? 'border-emerald-300 bg-emerald-400 text-emerald-950' : 'border-white/10 bg-white/5 text-slate-300'}`}>À VISTA</button>
                    <button type="button" disabled={!vipInstallmentOffer} onClick={() => vipInstallmentOffer && setPaymentMode('vip_installment')} className={`rounded-xl border px-3 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${paymentMode === 'vip_installment' ? 'border-amber-300 bg-amber-300 text-amber-950' : 'border-white/10 bg-white/5 text-slate-300'}`}>PARCELAMENTO VIP</button>
                  </div>
                  {vipInstallmentOfferQuery.isFetching && <p className="mt-3 text-xs font-bold text-slate-400">Verificando liberação do Parcelamento VIP...</p>}
                  {!vipInstallmentOffer && vipInstallmentOfferQuery.error && <div className="mt-3 rounded-xl border border-orange-400/20 bg-orange-500/10 p-3"><p className="text-xs font-bold text-orange-200">{vipInstallmentOfferQuery.error.message}</p>{vipInstallmentOfferQuery.error.message.toLowerCase().includes('andamento') && <a href="/parcelas-vip" className="mt-2 inline-block text-xs font-black text-cyan-300 underline">VER MINHAS PARCELAS</a>}</div>}
                  {paymentMode === 'vip_installment' && vipInstallmentOffer && (
                    <div className="mt-4 space-y-3 border-t border-amber-300/15 pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-[10px] font-black uppercase text-slate-400">Parcelas<select value={vipInstallmentCount} onChange={(e) => setVipInstallmentCount(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-black text-white">{Array.from({ length: Math.max(0, Number(vipInstallmentOffer.maxInstallments) - Number(vipInstallmentOffer.minInstallments) + 1) }, (_, i) => Number(vipInstallmentOffer.minInstallments) + i).map(n => <option key={n} value={n}>{n}x</option>)}</select></label>
                        <label className="text-[10px] font-black uppercase text-slate-400">Periodicidade<select value={vipInstallmentFrequency} onChange={(e) => setVipInstallmentFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-black text-white">{(vipInstallmentOffer.allowedFrequencies as string[]).map(freq => <option key={freq} value={freq}>{freq === 'daily' ? 'Diário' : freq === 'weekly' ? 'Semanal' : 'Mensal'}</option>)}</select></label>
                      </div>
                      {vipInstallmentQuoteQuery.isFetching && <div className="flex items-center justify-center gap-2 py-4 text-xs font-bold text-amber-200"><Loader2 className="h-4 w-4 animate-spin" /> Calculando no servidor...</div>}
                      {vipInstallmentQuote && <div className="rounded-xl bg-black/30 p-3"><div className="grid grid-cols-3 gap-2 text-center"><div><p className="text-[9px] font-black uppercase text-slate-500">Compra</p><p className="mt-1 text-sm font-black">{(vipInstallmentQuote.baseAmountCents / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Juros</p><p className="mt-1 text-sm font-black text-amber-300">{(vipInstallmentQuote.interestAmountCents / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Total</p><p className="mt-1 text-sm font-black text-cyan-300">{(vipInstallmentQuote.totalAmountCents / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</p></div></div><div className="mt-3 space-y-1.5">{vipInstallmentQuote.installments.map(item => <div key={item.installmentNumber} className="flex justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs"><span>Parcela {item.installmentNumber}/{vipInstallmentQuote.installmentCount} • {item.dueDate.split('-').reverse().join('/')}</span><strong>{(item.amountCents / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</strong></div>)}</div><p className="mt-3 text-center text-[11px] font-bold text-amber-200">A 1ª parcela é paga agora. Nova compra parcelada só será liberada após saldo R$ 0,00.</p></div>}
                      {vipInstallmentQuoteQuery.error && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-200">{vipInstallmentQuoteQuery.error.message}</p>}
                    </div>
                  )}
                </div>
              )}

              {/* BOTÃO AVANÇAR PARA PAGAMENTO - só aparece no resumo */}
'''
if 'Parcelamento aparece somente quando liberado pelo ADM.' not in text:
    if text.count(advance_anchor) != 1:
        raise SystemExit('advance payment anchor mismatch')
    text = text.replace(advance_anchor, choice_block, 1)

# Payment heading, amount, proof label and final button adapt to parcel mode.
text = text.replace("<p className=\"text-blue-400 font-black text-base tracking-widest\">PAGAMENTO VIA PIX</p>",
                    "<p className=\"text-blue-400 font-black text-base tracking-widest\">{paymentMode === 'vip_installment' ? `PARCELA 1 DE ${vipInstallmentQuote?.installmentCount || vipInstallmentCount}` : 'PAGAMENTO VIA PIX'}</p>", 1)
text = text.replace("<p className=\"text-blue-300 font-black text-3xl drop-shadow-[0_0_10px_#3b82f6]\">R$ {pixValue}</p>",
                    "<p className=\"text-blue-300 font-black text-3xl drop-shadow-[0_0_10px_#3b82f6]\">R$ {paymentPixValue}</p>", 1)
text = text.replace('ENVIE O COMPROVANTE DE PAGAMENTO</p>', "{paymentMode === 'vip_installment' ? 'ENVIE O COMPROVANTE DA 1ª PARCELA' : 'ENVIE O COMPROVANTE DE PAGAMENTO'}</p>", 1)
text = text.replace("<p className=\"text-white font-black text-base\">CLIQUE AQUI PARA FINALIZAR</p>",
                    "<p className=\"text-white font-black text-base\">{paymentMode === 'vip_installment' ? 'FINALIZAR PAGAMENTO DA PARCELA' : 'CLIQUE AQUI PARA FINALIZAR'}</p>", 1)

path.write_text(text, encoding='utf-8')
