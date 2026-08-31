from pathlib import Path

router_path = Path('server/routers/loans.ts')
test_path = Path('server/dailyLateFeeIntegration.test.ts')

s = router_path.read_text(encoding='utf-8')
old_select = '''      SELECT l.*, lc.name as clientName, lc.phone as clientPhone, lc.cpf as clientCpf
      FROM loans l JOIN loanClients lc ON lc.id = l.clientId WHERE l.id=${input.id}
'''
new_select = '''      SELECT l.*, lc.name as clientName, lc.phone as clientPhone, lc.cpf as clientCpf,
        lc.late_fee_disabled as clientLateFeeDisabled
      FROM loans l JOIN loanClients lc ON lc.id = l.clientId WHERE l.id=${input.id}
'''
if s.count(old_select) != 1:
    raise SystemExit(f'getLoan select mismatch: {s.count(old_select)}')
s = s.replace(old_select, new_select, 1)

old_block = '''    const today = getBrazilToday();
    const rawInstallments = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE loanId=${input.id} ORDER BY installmentNumber ASC`);
    const scoreByInstallment = await getH2ScoreSubmissionMap(db, rawInstallments.map((i: any) => Number(i.id)));
    const instRows = rawInstallments.map((i: any) => ({
      ...i,
      h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null,
      isOverdue: !['pago', 'cancelado', 'reprovado', 'em_analise'].includes(i.status) && i.dueDate < today,
    }));
'''
new_block = '''    const clock = getBrazilClock();
    const rawInstallments = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE loanId=${input.id} ORDER BY installmentNumber ASC`);
    const scoreByInstallment = await getH2ScoreSubmissionMap(db, rawInstallments.map((i: any) => Number(i.id)));
    const configRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const lateFeeConfig = configRows[0];
    const isDailyLoan = String(rows[0].paymentType || '') === 'diario';
    const instRows = rawInstallments.map((i: any) => {
      const baseAmount = i.originalAmount != null ? Number(i.originalAmount || 0) : Number(i.amount || 0);
      const storedFee = i.feeApplied != null ? Number(i.feeApplied || 0) : 0;
      const canCalculateAutomaticFee = isDailyLoan
        && !rows[0].clientLateFeeDisabled
        && ['pendente', 'atrasado'].includes(i.status);
      const automaticFee = canCalculateAutomaticFee
        ? calculateLateFeeForInstallment({ dueDate: i.dueDate, amount: baseAmount, config: lateFeeConfig, clock })
        : 0;
      const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;
      const effectiveAmount = effectiveFee > 0
        ? Math.round((baseAmount + effectiveFee) * 100) / 100
        : i.amount;
      return {
        ...i,
        amount: effectiveAmount,
        ...(isDailyLoan && effectiveFee > 0 ? {
          originalAmount: baseAmount.toFixed(2),
          feeApplied: effectiveFee.toFixed(2),
          lateFeePreview: automaticFee > storedFee,
        } : {}),
        h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null,
        isOverdue: !['pago', 'cancelado', 'reprovado', 'em_analise'].includes(i.status) && i.dueDate < clock.today,
      };
    });
'''
if s.count(old_block) != 1:
    raise SystemExit(f'getLoan map mismatch: {s.count(old_block)}')
s = s.replace(old_block, new_block, 1)

required = [
    'lc.late_fee_disabled as clientLateFeeDisabled',
    "const isDailyLoan = String(rows[0].paymentType || '') === 'diario';",
    'const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;',
    'lateFeePreview: automaticFee > storedFee',
]
for item in required:
    if item not in s:
        raise SystemExit(f'missing admin preview invariant: {item}')
router_path.write_text(s, encoding='utf-8')

t = test_path.read_text(encoding='utf-8')
needle = '''  it("keeps ADM manual button available on daily installments and correct midnight preset", () => {
    expect(adminUi).toContain('loan.paymentType === "diario" ? (');
    expect(adminUi).toContain("Math.max(feeTotal18_20");
  });
'''
replacement = needle + '''  it("uses the same central maximum fee formula in the ADM loan detail", () => {
    expect(router).toContain("const isDailyLoan = String(rows[0].paymentType || '') === 'diario';");
    expect(router).toContain("const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;");
    expect(router).toContain("lc.late_fee_disabled as clientLateFeeDisabled");
  });
'''
if t.count(needle) != 1:
    raise SystemExit('integration test insertion marker missing')
t = t.replace(needle, replacement, 1)
test_path.write_text(t, encoding='utf-8')
print('ADMIN_PREVIEW_PATCH_OK')
