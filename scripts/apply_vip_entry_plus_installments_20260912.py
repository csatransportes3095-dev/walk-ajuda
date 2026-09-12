from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)

# Shared quote: entry is separate, installmentCount means financed installments AFTER entry.
p = Path('shared/vipInstallments.ts')
t = p.read_text(encoding='utf-8')
old = '''  const amounts = specialFirst == null
    ? splitInstallmentAmounts(totalAmountCents, input.installmentCount)
    : [specialFirst, ...splitInstallmentAmounts(totalAmountCents - specialFirst, input.installmentCount - 1)];
  const dailyMode = input.dailyMode || "all_days";
  const dueDates = buildVipInstallmentDueDates({
    firstDueDate: input.firstDueDate,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    dailyMode,
  });'''
new = '''  const financedTotalCents = financedBaseAmountCents + interestAmountCents;
  const amounts = specialFirst == null
    ? splitInstallmentAmounts(totalAmountCents, input.installmentCount)
    : splitInstallmentAmounts(financedTotalCents, input.installmentCount);
  const dailyMode = input.dailyMode || "all_days";
  const dueDatesWithEntry = buildVipInstallmentDueDates({
    firstDueDate: input.firstDueDate,
    installmentCount: specialFirst == null ? input.installmentCount : input.installmentCount + 1,
    frequency: input.frequency,
    dailyMode,
  });
  const dueDates = specialFirst == null ? dueDatesWithEntry : dueDatesWithEntry.slice(1);'''
t = once(t, old, new, 'shared split/dates')
p.write_text(t, encoding='utf-8')

# Contract persistence: entry is installmentNumber 0 and gets the checkout proof; N financed installments stay 1..N.
p = Path('server/vipInstallmentContracts.ts')
t = p.read_text(encoding='utf-8')
old = '''      let firstInstallmentId = 0;
      for (const installment of input.quote.installments) {
        const isFirst = installment.installmentNumber === 1;
        const key = `VIP-PLAN-${planId}-PARCELA-${installment.installmentNumber}`;
        const result = await tx.execute(sql`
          INSERT INTO vipInstallments
            (planId, installmentNumber, amountCents, dueDate, paidAmountCents, status,
             proofUrl, proofMimeType, proofSubmittedAtMs, paymentIdempotencyKey)
          VALUES
            (${planId}, ${installment.installmentNumber}, ${installment.amountCents}, ${installment.dueDate}, 0,
             ${isFirst ? "awaiting_confirmation" : "pending"},
             ${isFirst ? proofUrl : null}, ${isFirst ? proofMimeType : null}, ${isFirst ? now : null}, ${key})
        `);
        if (isFirst) firstInstallmentId = insertIdOf(result);
      }'''
new = '''      let firstInstallmentId = 0;
      if (input.quote.firstInstallmentAmountCents != null) {
        const entryKey = `VIP-PLAN-${planId}-ENTRADA`;
        const entryDueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const entryResult = await tx.execute(sql`
          INSERT INTO vipInstallments
            (planId, installmentNumber, amountCents, dueDate, paidAmountCents, status,
             proofUrl, proofMimeType, proofSubmittedAtMs, paymentIdempotencyKey)
          VALUES
            (${planId}, 0, ${input.quote.firstInstallmentAmountCents}, ${entryDueDate}, 0,
             'awaiting_confirmation', ${proofUrl}, ${proofMimeType}, ${now}, ${entryKey})
        `);
        firstInstallmentId = insertIdOf(entryResult);
      }
      for (const installment of input.quote.installments) {
        const isFirst = input.quote.firstInstallmentAmountCents == null && installment.installmentNumber === 1;
        const key = `VIP-PLAN-${planId}-PARCELA-${installment.installmentNumber}`;
        const result = await tx.execute(sql`
          INSERT INTO vipInstallments
            (planId, installmentNumber, amountCents, dueDate, paidAmountCents, status,
             proofUrl, proofMimeType, proofSubmittedAtMs, paymentIdempotencyKey)
          VALUES
            (${planId}, ${installment.installmentNumber}, ${installment.amountCents}, ${installment.dueDate}, 0,
             ${isFirst ? "awaiting_confirmation" : "pending"},
             ${isFirst ? proofUrl : null}, ${isFirst ? proofMimeType : null}, ${isFirst ? now : null}, ${key})
        `);
        if (isFirst) firstInstallmentId = insertIdOf(result);
      }'''
t = once(t, old, new, 'contract entry persistence')
p.write_text(t, encoding='utf-8')

# Checkout: make wording explicit: entry + N installments.
p = Path('client/src/components/VipInstallmentCheckoutBox.tsx')
t = p.read_text(encoding='utf-8')
old = '''<div className="mt-3 rounded-lg bg-violet-500/10 p-3 text-center"><p className="text-[10px] font-black uppercase text-violet-300">{quote.data.quote.firstInstallmentAmountCents != null ? "Entrada agora" : "Primeira parcela agora"}</p><p className="mt-1 text-xl font-black text-white">{money(quote.data.quote.installments?.[0]?.amountCents)}</p><p className="mt-1 text-[11px] text-slate-400">Parcela 1 de {quote.data.quote.installmentCount}{quote.data.quote.firstInstallmentAmountCents != null ? ` • Juros sobre ${money(quote.data.quote.financedBaseAmountCents)}` : ""}</p></div>'''
new = '''<div className="mt-3 rounded-lg bg-violet-500/10 p-3 text-center">{quote.data.quote.firstInstallmentAmountCents != null ? <><p className="text-[10px] font-black uppercase text-violet-300">Entrada agora</p><p className="mt-1 text-xl font-black text-white">{money(quote.data.quote.firstInstallmentAmountCents)}</p><div className="my-2 text-sm font-black text-violet-300">+</div><p className="text-sm font-black text-white">{quote.data.quote.installmentCount} parcelas {frequency === "daily" ? "diárias" : frequency === "weekly" ? "semanais" : "mensais"} de {money(quote.data.quote.installments?.[0]?.amountCents)}</p><p className="mt-1 text-[11px] text-slate-400">Juros calculados sobre {money(quote.data.quote.financedBaseAmountCents)}. A última parcela pode ajustar centavos de arredondamento.</p></> : <><p className="text-[10px] font-black uppercase text-violet-300">Primeira parcela agora</p><p className="mt-1 text-xl font-black text-white">{money(quote.data.quote.installments?.[0]?.amountCents)}</p><p className="mt-1 text-[11px] text-slate-400">Parcela 1 de {quote.data.quote.installmentCount}</p></>}</div>'''
t = once(t, old, new, 'checkout wording')
p.write_text(t, encoding='utf-8')

# Customer/admin labels: installment number 0 means entry.
for path in ['client/src/pages/VipInstallmentPayments.tsx', 'client/src/components/AdminVipReceivablesPanel.tsx']:
    p = Path(path)
    t = p.read_text(encoding='utf-8')
    t = t.replace('`Parcela ${installment.installmentNumber}`', '`'+ '${installment.installmentNumber === 0 ? "Entrada" : `Parcela ${installment.installmentNumber}`}' +'`') if False else t
    # direct JSX/common text replacements
    t = t.replace('Parcela {installment.installmentNumber}', '{installment.installmentNumber === 0 ? "Entrada" : <>Parcela {installment.installmentNumber}</>}')
    t = t.replace('PARCELA {row.installmentNumber}', '{row.installmentNumber === 0 ? "ENTRADA" : <>PARCELA {row.installmentNumber}</>}')
    p.write_text(t, encoding='utf-8')

# Tests: entry + 20 means twenty financed installments after the entry.
p = Path('shared/vipInstallments.test.ts')
t = p.read_text(encoding='utf-8')
t += '''\n\nit("treats entry separately from the selected installment count", () => {\n  const quote = calculateVipInstallmentQuote({\n    baseAmountCents: 45000,\n    installmentCount: 20,\n    interestBps: 1500,\n    firstInstallmentAmountCents: 22500,\n    firstDueDate: "2026-09-12",\n    frequency: "daily",\n    dailyMode: "all_days",\n  });\n  expect(quote.firstInstallmentAmountCents).toBe(22500);\n  expect(quote.installments).toHaveLength(20);\n  expect(quote.installments[0].installmentNumber).toBe(1);\n  expect(quote.installments[0].dueDate).toBe("2026-09-13");\n  expect(quote.installments.reduce((sum, item) => sum + item.amountCents, 0)).toBe(25875);\n  expect(quote.totalAmountCents).toBe(48375);\n});\n'''
p.write_text(t, encoding='utf-8')
