from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {count}")
    return out


# ---- Loans server finishing integration ----
p = Path('server/routers/loans.ts')
s = p.read_text(encoding='utf-8')

s = replace_once(
    s,
    'SELECT li.*, l.id as loanId FROM loanInstallments li',
    'SELECT li.*, l.id as loanId, l.paymentType AS loanPaymentType FROM loanInstallments li',
    'next installment payment type',
)
s = replace_once(
    s,
    '      nextInstallment = nextInsts[0] || null;\n',
    '''      nextInstallment = nextInsts[0] || null;
      if (nextInstallment && String(nextInstallment.loanPaymentType || '') === 'diario' && !client.late_fee_disabled) {
        const nextFeeConfigRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
        const nextBaseAmount = nextInstallment.originalAmount != null ? Number(nextInstallment.originalAmount || 0) : Number(nextInstallment.amount || 0);
        const nextStoredFee = Number(nextInstallment.feeApplied || 0);
        const nextAutomaticFee = calculateLateFeeForInstallment({ dueDate: nextInstallment.dueDate, amount: nextBaseAmount, config: nextFeeConfigRows[0], clock: getBrazilClock() });
        const nextEffectiveFee = Math.max(nextStoredFee, nextAutomaticFee);
        if (nextEffectiveFee > 0) {
          nextInstallment = { ...nextInstallment, amount: Math.round((nextBaseAmount + nextEffectiveFee) * 100) / 100, originalAmount: nextBaseAmount.toFixed(2), feeApplied: nextEffectiveFee.toFixed(2), lateFeePreview: nextAutomaticFee > nextStoredFee };
        }
      }
''',
    'next installment effective fee',
)

s = regex_once(
    s,
    r'''    // O ADM pode aplicar manualmente a taxa em qualquer data/horário\.[\s\S]*?    return \{ ok: true, originalAmount, feeAmount: input\.feeAmount, newAmount \};''',
    '''    // O ADM pode aplicar manualmente a taxa em qualquer data/horário.
    // Mesmo no manual, nunca e permitido reduzir uma taxa automatica valida ou uma taxa ja gravada.
    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);
    const storedFee = current.feeApplied != null ? parseFloat(current.feeApplied) : 0;
    const cfgRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const automaticFee = calculateLateFeeForInstallment({ dueDate: current.dueDate, amount: originalAmount, config: cfgRows[0], clock: getBrazilClock() });
    const effectiveFee = Math.max(storedFee, input.feeAmount, automaticFee);
    const newAmount = Math.round((originalAmount + effectiveFee) * 100) / 100;
    const spNow = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const note = input.feeNote || `Taxa diaria manual: +R$ ${effectiveFee.toFixed(2).replace('.', ',')} aplicada pelo ADM em ${spNow}`;
    await db.execute(drizzleSql`
      UPDATE loanInstallments
      SET amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)}, feeApplied=${effectiveFee.toFixed(2)}, notes=${note}
      WHERE id=${input.installmentId}
    `);
    return { ok: true, originalAmount, feeAmount: effectiveFee, newAmount };''',
    'manual maximum fee',
)

s = regex_once(
    s,
    r'''  getLoan: adminProcedure\.input\(z\.object\(\{ id: z\.number\(\) \}\)\)\.query\(async \(\{ input \}\) => \{[\s\S]*?\n  \}\),\n\n  createLoan:''',
    '''  getLoan: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`
      SELECT l.*, lc.name as clientName, lc.phone as clientPhone, lc.cpf as clientCpf,
        lc.late_fee_disabled as clientLateFeeDisabled
      FROM loans l JOIN loanClients lc ON lc.id = l.clientId WHERE l.id=${input.id}
    `);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    const clock = getBrazilClock();
    const rawInstallments = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE loanId=${input.id} ORDER BY installmentNumber ASC`);
    const scoreByInstallment = await getH2ScoreSubmissionMap(db, rawInstallments.map((i: any) => Number(i.id)));
    const configRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const lateFeeConfig = configRows[0];
    const isDailyLoan = String(rows[0].paymentType || '') === 'diario';
    const instRows = rawInstallments.map((i: any) => {
      const baseAmount = i.originalAmount != null ? Number(i.originalAmount || 0) : Number(i.amount || 0);
      const storedFee = i.feeApplied != null ? Number(i.feeApplied || 0) : 0;
      const canCalculateAutomaticFee = isDailyLoan && !rows[0].clientLateFeeDisabled && ['pendente', 'atrasado'].includes(i.status);
      const automaticFee = canCalculateAutomaticFee ? calculateLateFeeForInstallment({ dueDate: i.dueDate, amount: baseAmount, config: lateFeeConfig, clock }) : 0;
      const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;
      const effectiveAmount = effectiveFee > 0 ? Math.round((baseAmount + effectiveFee) * 100) / 100 : i.amount;
      return { ...i, amount: effectiveAmount, ...(isDailyLoan && effectiveFee > 0 ? { originalAmount: baseAmount.toFixed(2), feeApplied: effectiveFee.toFixed(2), lateFeePreview: automaticFee > storedFee } : {}), h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null, isOverdue: !['pago','cancelado','reprovado','em_analise'].includes(i.status) && i.dueDate < clock.today };
    });
    const h2Score = await getClientH2ScoreSummary(db, [Number(rows[0].clientId)]);
    return { ...rows[0], installments: instRows, h2Score };
  }),

  createLoan:''',
    'ADM central preview',
)

if 'isLateFeeWindowOpen' in s:
    raise SystemExit('old isLateFeeWindowOpen remains')
for item in [
    "AND l.paymentType = 'diario'",
    "Math.max(storedFee, input.feeAmount, automaticFee)",
    "Math.max(nextStoredFee, nextAutomaticFee)",
    "String(row.loanPaymentType || '') === 'diario'",
    "String(installment.loanPaymentType || '') !== 'diario'",
    "const isDailyLoan = String(rows[0].paymentType || '') === 'diario';",
]:
    if item not in s:
        raise SystemExit(f'missing loan invariant: {item}')
p.write_text(s, encoding='utf-8')


# ---- Public loans UI ----
pub = Path('client/src/pages/LoansTab.tsx')
q = pub.read_text(encoding='utf-8')
for old, new in [
    ('function LateFeePanel({ config, installmentAmount }: { config: any; installmentAmount?: number }) {\n  if (!config?.enabled) return null;', 'function LateFeePanel({ config, installmentAmount, paymentType }: { config: any; installmentAmount?: number; paymentType?: string }) {\n  if (!config?.enabled || paymentType !== "diario") return null;'),
    ('Das 18h até 19:59:', 'Das 18:01 até 20:00:'),
    ('A partir das 20h:', 'Das 20:01 até 23:58:'),
    ('Após 23:59:', 'Às 23:59 e depois:'),
    ('<LateFeePanel config={lateFeeConfig} />', '<LateFeePanel config={lateFeeConfig} paymentType="diario" />'),
    ('<LateFeePanel config={lateFeeConfig} installmentAmount={totalAmt / Math.max(totalCount, 1)} />', '<LateFeePanel config={lateFeeConfig} installmentAmount={totalAmt / Math.max(totalCount, 1)} paymentType={loan.paymentType} />'),
]:
    q = replace_once(q, old, new, f'public UI {old[:45]}')
pub.write_text(q, encoding='utf-8')


# ---- Admin loans UI, preserving current password/edit improvements ----
adm = Path('client/src/pages/AdminLoans.tsx')
a = adm.read_text(encoding='utf-8')
a = regex_once(
    a,
    r'''  const handleOpenLateFee = useCallback\(\(inst: any, loanId: number\) => \{[\s\S]*?\n  \}, \[\]\);''',
    '''  const handleOpenLateFee = useCallback((inst: any, loanId: number) => {
    const dueDate = civilDate(inst.dueDate);
    if (!dueDate) {
      toast.error(`A parcela #${inst.installmentNumber} não possui um vencimento válido.`);
      return;
    }
    // Taxa manual do ADM pode ser aplicada em qualquer data/horario para emprestimo diario.
    setFeeModal({ inst, loanId });
    setFeeCustomAmount("");
  }, []);''',
    'admin manual modal gate',
)
a = replace_once(
    a,
    'const feeMidnight = Math.round(originalAmt * (feeMidnightPct / 100) * 100) / 100;',
    'const feeMidnight = Math.max(feeTotal18_20, Math.round(originalAmt * (feeMidnightPct / 100) * 100) / 100);',
    'admin midnight maximum',
)
a = a.replace('Taxa 18h–20h', 'Taxa manual — regra 18:01')
a = a.replace('Taxa 20h–23:59 (acumulada)', 'Taxa manual acumulada — regra 20:01')
a = a.replace('Taxa após meia-noite ({feeMidnightPct}%)', 'Taxa final — 23:59 ({feeMidnightPct}%)')
if a.count('data-testid="manual-late-fee-button"') != 2:
    raise SystemExit('admin expected exactly two manual late fee buttons')
adm.write_text(a, encoding='utf-8')


# ---- Render exact PORT hardening ----
idx = Path('server/_core/index.ts')
i = idx.read_text(encoding='utf-8')
i = replace_once(i, 'import net from "net";\n', '', 'remove net import')
i, n = re.subn(r'function isPortAvailable\(port: number\): Promise<boolean> \{.*?\n\}\n\nasync function findAvailablePort\(startPort: number = 3000\): Promise<number> \{.*?\n\}\n\n', '', i, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'port scanner mismatch {n}')
i = replace_once(
    i,
    '''  const preferredPort = Number(process.env.PORT || 3000);
  const port = await findAvailablePort(preferredPort);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });''',
    '''  const port = Number.parseInt(process.env.PORT || "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT configuration");
  server.once("error", (error) => {
    console.error("[Server] failed to listen on configured PORT:", error);
    scheduleFatalProcessExit();
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });''',
    'Render startup',
)
for forbidden in ['findAvailablePort', 'isPortAvailable', 'import net from "net"', '/api/zoho-test-session', 'TEST_walk1']:
    if forbidden in i:
        raise SystemExit(f'infra invariant failed: {forbidden}')
idx.write_text(i, encoding='utf-8')

print('FINISH_PROD_HARDENING_OK')
