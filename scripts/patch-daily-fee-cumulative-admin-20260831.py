from pathlib import Path
import re

router_path = Path('server/routers/loans.ts')
source = router_path.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str):
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    source = source.replace(old, new, 1)

def regex_once(pattern: str, replacement: str, label: str):
    global source
    source2, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    source = source2

replace_once(
    'import { calculateLateFeeForInstallment } from "../loans/lateFee";',
    'import { calculateLateFeeDetailsForInstallment, calculateLateFeeForInstallment } from "../loans/lateFee";',
    'import details',
)

migration = r'''
// Controle administrativo explícito da multa diária. Quando ativo, o valor definido
// pelo ADM (inclusive zero) prevalece sobre o cálculo automático até o ADM voltar ao automático.
let _lateFeeAdminOverrideReady = false;
let _lateFeeAdminOverridePromise: Promise<void> | null = null;
async function ensureLateFeeAdminOverrideColumns(db: any) {
  if (_lateFeeAdminOverrideReady) return;
  if (_lateFeeAdminOverridePromise) return _lateFeeAdminOverridePromise;
  _lateFeeAdminOverridePromise = (async () => {
    const columns = await qRows(db, drizzleSql`SHOW COLUMNS FROM loanInstallments`);
    const names = new Set(columns.map((col: any) => String(col.Field || col.field || '').toLowerCase()));
    if (!names.has('latefeeadminoverride')) await db.execute(drizzleSql.raw(`ALTER TABLE loanInstallments ADD COLUMN lateFeeAdminOverride DECIMAL(12,2) NULL DEFAULT NULL`));
    if (!names.has('latefeeadminoverrideactive')) await db.execute(drizzleSql.raw(`ALTER TABLE loanInstallments ADD COLUMN lateFeeAdminOverrideActive TINYINT(1) NOT NULL DEFAULT 0`));
    if (!names.has('latefeeadminoverridenote')) await db.execute(drizzleSql.raw(`ALTER TABLE loanInstallments ADD COLUMN lateFeeAdminOverrideNote VARCHAR(500) NULL DEFAULT NULL`));
    if (!names.has('latefeeadminoverrideat')) await db.execute(drizzleSql.raw(`ALTER TABLE loanInstallments ADD COLUMN lateFeeAdminOverrideAt DATETIME NULL DEFAULT NULL`));
    _lateFeeAdminOverrideReady = true;
  })().catch((error) => {
    _lateFeeAdminOverridePromise = null;
    _lateFeeAdminOverrideReady = false;
    throw error;
  });
  return _lateFeeAdminOverridePromise;
}

function resolveEffectiveLateFee(row: any, automaticFee: number) {
  const overrideActive = Number(row?.lateFeeAdminOverrideActive || 0) === 1;
  const overrideFee = Math.max(0, Number(row?.lateFeeAdminOverride || 0));
  const storedFee = Math.max(0, Number(row?.feeApplied || 0));
  return {
    overrideActive,
    overrideFee,
    fee: overrideActive ? overrideFee : Math.max(storedFee, automaticFee),
  };
}
'''.strip()

replace_once(
    '// ── Router ─────────────────────────────────────────────────────────────────',
    migration + '\n\n// ── Router ─────────────────────────────────────────────────────────────────',
    'insert override migration',
)

# listLoans: garante colunas e calcula multa dinâmica total de cada empréstimo diário.
replace_once(
    '''    await ensurePixDisbursementColumns(db);\n    await ensureClientPixFieldsSynced(db);\n    await getLoanH2ScoreConfig(db);''',
    '''    await ensurePixDisbursementColumns(db);\n    await ensureClientPixFieldsSynced(db);\n    await ensureLateFeeAdminOverrideColumns(db);\n    await getLoanH2ScoreConfig(db);''',
    'listLoans ensure override',
)

anchor = '''    rows = rows.map((loan: any) => ({
      ...loan,
      h2ScoreDetail: h2Summaries.get(Number(loan.customerId || 0)) || null,
    }));

    const today = getBrazilToday();'''
replacement = '''    rows = rows.map((loan: any) => ({
      ...loan,
      h2ScoreDetail: h2Summaries.get(Number(loan.customerId || 0)) || null,
    }));

    // Multas atuais entram no resumo do card sem alterar principal/juros originais.
    const lateFeeConfigRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const summaryLateFeeConfig = lateFeeConfigRows[0];
    const summaryClock = getBrazilClock();
    const feeRows = await qRows(db, drizzleSql`
      SELECT li.*, l.id AS summaryLoanId, lc.late_fee_disabled AS clientLateFeeDisabled
      FROM loanInstallments li
      JOIN loans l ON l.id=li.loanId
      JOIN loanClients lc ON lc.id=l.clientId
      WHERE l.paymentType='diario'
        AND l.status NOT IN ('pago','cancelado','reprovado')
        AND li.status IN ('pendente','atrasado','em_analise')
    `);
    const lateFeeTotalByLoan = new Map<number, number>();
    for (const inst of feeRows) {
      const baseAmount = inst.originalAmount != null ? Number(inst.originalAmount || 0) : Number(inst.amount || 0);
      const automaticFee = Number(inst.clientLateFeeDisabled || 0) === 1 || inst.status === 'em_analise'
        ? 0
        : calculateLateFeeForInstallment({ dueDate: inst.dueDate, amount: baseAmount, config: summaryLateFeeConfig, clock: summaryClock });
      const effective = resolveEffectiveLateFee(inst, automaticFee).fee;
      lateFeeTotalByLoan.set(Number(inst.summaryLoanId), Math.round(((lateFeeTotalByLoan.get(Number(inst.summaryLoanId)) || 0) + effective) * 100) / 100);
    }
    rows = rows.map((loan: any) => ({ ...loan, lateFeeTotal: lateFeeTotalByLoan.get(Number(loan.id)) || 0 }));

    const today = getBrazilToday();'''
replace_once(anchor, replacement, 'listLoans dynamic fees')

# getLoan: attach detailed cumulative fee + admin override state.
replace_once(
    '''  getLoan: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {\n    const db = await getDb() as any;''',
    '''  getLoan: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {\n    const db = await getDb() as any;\n    await ensureLateFeeAdminOverrideColumns(db);''',
    'getLoan ensure override',
)

old_getloan_calc = '''      const automaticFee = canCalculateAutomaticFee ? calculateLateFeeForInstallment({ dueDate: i.dueDate, amount: baseAmount, config: lateFeeConfig, clock }) : 0;
      const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;
      const effectiveAmount = effectiveFee > 0 ? Math.round((baseAmount + effectiveFee) * 100) / 100 : i.amount;
      return { ...i, amount: effectiveAmount, ...(isDailyLoan && effectiveFee > 0 ? { originalAmount: baseAmount.toFixed(2), feeApplied: effectiveFee.toFixed(2), lateFeePreview: automaticFee > storedFee } : {}), h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null, isOverdue: !['pago','cancelado','reprovado','em_analise'].includes(i.status) && i.dueDate < clock.today };'''
new_getloan_calc = '''      const feeDetails = canCalculateAutomaticFee ? calculateLateFeeDetailsForInstallment({ dueDate: i.dueDate, amount: baseAmount, config: lateFeeConfig, clock }) : calculateLateFeeDetailsForInstallment({ dueDate: i.dueDate, amount: baseAmount, config: { ...lateFeeConfig, enabled: false }, clock });
      const automaticFee = feeDetails.fee;
      const resolvedFee = isDailyLoan ? resolveEffectiveLateFee(i, automaticFee) : { overrideActive: false, overrideFee: 0, fee: 0 };
      const effectiveFee = resolvedFee.fee;
      const effectiveAmount = effectiveFee > 0 || resolvedFee.overrideActive ? Math.round((baseAmount + effectiveFee) * 100) / 100 : i.amount;
      return {
        ...i,
        amount: effectiveAmount,
        ...(isDailyLoan ? {
          originalAmount: baseAmount.toFixed(2),
          feeApplied: effectiveFee.toFixed(2),
          automaticLateFee: automaticFee,
          lateFeeAdminOverrideActive: resolvedFee.overrideActive ? 1 : 0,
          lateFeeAdminOverride: resolvedFee.overrideActive ? resolvedFee.overrideFee.toFixed(2) : null,
          lateFeeDetails: feeDetails,
          lateFeePreview: !resolvedFee.overrideActive && automaticFee > storedFee,
        } : {}),
        h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null,
        isOverdue: !['pago','cancelado','reprovado','em_analise'].includes(i.status) && i.dueDate < clock.today,
      };'''
replace_once(old_getloan_calc, new_getloan_calc, 'getLoan detailed fees')

# Public next installment honours exact ADM override.
replace_once(
    '''        const nextEffectiveFee = Math.max(nextStoredFee, nextAutomaticFee);''',
    '''        const nextEffectiveFee = resolveEffectiveLateFee(nextInstallment, nextAutomaticFee).fee;''',
    'next installment override',
)

# Client installment view honours exact ADM override and exposes automatic calculation.
replace_once(
    '''      const effectiveFee = Math.max(storedFee, automaticFee);\n      const amountWithFee = effectiveFee > 0''',
    '''      const resolvedFee = resolveEffectiveLateFee(i, automaticFee);\n      const effectiveFee = resolvedFee.fee;\n      const amountWithFee = effectiveFee > 0 || resolvedFee.overrideActive''',
    'client effective override',
)
replace_once(
    '''          lateFeePreview: automaticFee > storedFee,''',
    '''          lateFeePreview: !resolvedFee.overrideActive && automaticFee > storedFee,\n          automaticLateFee: automaticFee,\n          lateFeeAdminOverrideActive: resolvedFee.overrideActive ? 1 : 0,''',
    'client override metadata',
)

# Proof submission honours override exactly, otherwise automatic/stored maximum.
replace_once(
    '''    const effectiveFee = Math.max(storedFee, automaticFee);''',
    '''    const effectiveFee = resolveEffectiveLateFee(row, automaticFee).fee;''',
    'proof effective override',
)

# calcLateFee gets cumulative dated breakdown.
pattern_calc = r'''  // Calcula taxa de atraso para uma parcela específica \(chamado pelo cliente ao ver parcelas\)\n  calcLateFee: publicProcedure\.input\(z\.object\(\{.*?\n  \}\),\n\n  // Ativar/desativar empréstimo por telefone'''
replacement_calc = '''  // Calcula taxa de atraso acumulada para uma parcela específica.
  calcLateFee: publicProcedure.input(z.object({
    token: z.string(),
    installmentId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await ensureLateFeeAdminOverrideColumns(db);
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED" });
    const client = clients[0];

    const cfgRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const cfg = cfgRows[0];
    const inst = await qRows(db, drizzleSql`
      SELECT li.*, l.clientId, l.paymentType AS loanPaymentType FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.id=${input.installmentId} AND l.clientId=${client.id}
    `);
    if (!inst.length) throw new TRPCError({ code: "NOT_FOUND" });
    const installment = inst[0];
    if (String(installment.loanPaymentType || '') !== 'diario') return { lateFee: 0, totalWithFee: Number(installment.amount || 0), breakdown: [] };

    const baseAmount = installment.originalAmount != null ? parseFloat(installment.originalAmount) : parseFloat(installment.amount);
    const clock = getBrazilClock();
    const automaticDetails = !client.late_fee_disabled && cfg?.enabled && ["pendente", "atrasado"].includes(installment.status)
      ? calculateLateFeeDetailsForInstallment({ dueDate: installment.dueDate, amount: baseAmount, config: cfg, clock })
      : calculateLateFeeDetailsForInstallment({ dueDate: installment.dueDate, amount: baseAmount, config: { ...cfg, enabled: false }, clock });
    const resolved = resolveEffectiveLateFee(installment, automaticDetails.fee);
    const breakdown = resolved.overrideActive
      ? [`ADM definiu a multa em R$ ${resolved.overrideFee.toFixed(2)}. O cálculo automático está suspenso nesta parcela.`]
      : automaticDetails.entries.map((entry) => `${entry.date}: R$ ${entry.fee.toFixed(2)} (${entry.stage})`);
    return {
      lateFee: resolved.fee,
      automaticLateFee: automaticDetails.fee,
      totalWithFee: Math.round((baseAmount + resolved.fee) * 100) / 100,
      breakdown,
      details: automaticDetails,
      adminOverrideActive: resolved.overrideActive,
      adminOverrideFee: resolved.overrideFee,
    };
  }),

  // Ativar/desativar empréstimo por telefone'''
regex_once(pattern_calc, replacement_calc, 'replace calcLateFee')

# Replace manual apply/remove with exact ADM override and restore automatic endpoint.
pattern_admin = r'''  // Stats de comprovantes para o dashboard\n  // Aplica taxa de atraso pré-estabelecida a uma parcela \(admin\)\n  applyLateFeeToInstallment:.*?\n  \}\),\n\n  // Corrige taxas históricas previamente auditadas'''
replacement_admin = '''  // Stats de comprovantes para o dashboard
  // O ADM define a multa exata (inclusive zero) em qualquer data/horário.
  applyLateFeeToInstallment: adminProcedure.input(z.object({
    installmentId: z.number(),
    feeAmount: z.number().min(0),
    feeNote: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb() as any;
    await ensureLateFeeAdminOverrideColumns(db);
    const inst = await qRows(db, drizzleSql`
      SELECT li.*, l.paymentType AS loanPaymentType FROM loanInstallments li
      JOIN loans l ON l.id=li.loanId WHERE li.id=${input.installmentId} LIMIT 1
    `);
    if (!inst.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada' });
    const current = inst[0];
    if (String(current.loanPaymentType || '') !== 'diario') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Multa diária disponível somente em empréstimos diários.' });
    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);
    const feeAmount = Math.round(input.feeAmount * 100) / 100;
    const newAmount = Math.round((originalAmount + feeAmount) * 100) / 100;
    const note = input.feeNote?.trim() || `Multa definida manualmente pelo ADM: R$ ${feeAmount.toFixed(2)}`;
    const adminName = ctx.user?.name || 'ADM';
    await db.execute(drizzleSql`
      UPDATE loanInstallments SET
        amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)}, feeApplied=${feeAmount.toFixed(2)},
        lateFeeAdminOverride=${feeAmount.toFixed(2)}, lateFeeAdminOverrideActive=1,
        lateFeeAdminOverrideNote=${`${note} | ${adminName}`}, lateFeeAdminOverrideAt=NOW()
      WHERE id=${input.installmentId}
    `);
    return { ok: true, originalAmount, feeAmount, newAmount, adminOverrideActive: true };
  }),

  // Remover significa definir multa zero pelo ADM. Ela não reaparece automaticamente.
  removeLateFeeFromInstallment: adminProcedure.input(z.object({ installmentId: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb() as any;
    await ensureLateFeeAdminOverrideColumns(db);
    const rows = await qRows(db, drizzleSql`SELECT li.*, l.paymentType AS loanPaymentType FROM loanInstallments li JOIN loans l ON l.id=li.loanId WHERE li.id=${input.installmentId} LIMIT 1`);
    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada' });
    const current = rows[0];
    if (String(current.loanPaymentType || '') !== 'diario') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Multa diária disponível somente em empréstimos diários.' });
    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);
    const adminName = ctx.user?.name || 'ADM';
    await db.execute(drizzleSql`
      UPDATE loanInstallments SET amount=${originalAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)}, feeApplied='0.00',
        lateFeeAdminOverride='0.00', lateFeeAdminOverrideActive=1,
        lateFeeAdminOverrideNote=${`Multa removida manualmente por ${adminName}`}, lateFeeAdminOverrideAt=NOW()
      WHERE id=${input.installmentId}
    `);
    return { ok: true, restoredAmount: originalAmount, adminOverrideActive: true };
  }),

  // Volta a parcela para a regra automática cumulativa atual.
  restoreAutomaticLateFeeForInstallment: adminProcedure.input(z.object({ installmentId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await ensureLateFeeAdminOverrideColumns(db);
    const rows = await qRows(db, drizzleSql`
      SELECT li.*, l.paymentType AS loanPaymentType, lc.late_fee_disabled AS clientLateFeeDisabled
      FROM loanInstallments li JOIN loans l ON l.id=li.loanId JOIN loanClients lc ON lc.id=l.clientId
      WHERE li.id=${input.installmentId} LIMIT 1
    `);
    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada' });
    const current = rows[0];
    if (String(current.loanPaymentType || '') !== 'diario') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Multa diária disponível somente em empréstimos diários.' });
    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);
    const cfgRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const automaticFee = Number(current.clientLateFeeDisabled || 0) === 1 ? 0 : calculateLateFeeForInstallment({ dueDate: current.dueDate, amount: originalAmount, config: cfgRows[0], clock: getBrazilClock() });
    const newAmount = Math.round((originalAmount + automaticFee) * 100) / 100;
    await db.execute(drizzleSql`
      UPDATE loanInstallments SET amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)}, feeApplied=${automaticFee.toFixed(2)},
        lateFeeAdminOverride=NULL, lateFeeAdminOverrideActive=0, lateFeeAdminOverrideNote=NULL, lateFeeAdminOverrideAt=NULL
      WHERE id=${input.installmentId}
    `);
    return { ok: true, originalAmount, feeAmount: automaticFee, newAmount, adminOverrideActive: false };
  }),

  // Corrige taxas históricas previamente auditadas'''
regex_once(pattern_admin, replacement_admin, 'replace admin fee controls')

router_path.write_text(source, encoding='utf-8')

# ---------- ADM UI ----------
admin_path = Path('client/src/pages/AdminLoans.tsx')
ui = admin_path.read_text(encoding='utf-8')

def ui_replace_once(old: str, new: str, label: str):
    global ui
    count = ui.count(old)
    if count != 1:
        raise SystemExit(f'UI {label}: esperado 1 trecho, encontrado {count}')
    ui = ui.replace(old, new, 1)

ui_replace_once(
'''  const removeLateFee = trpc.loans.removeLateFeeFromInstallment.useMutation({
    onSuccess: (d) => {
      toast.success(`Taxa removida! Valor restaurado: R$ ${d.restoredAmount.toFixed(2).replace('.', ',')}`);
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
      utils.loans.listLoans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });''',
'''  const removeLateFee = trpc.loans.removeLateFeeFromInstallment.useMutation({
    onSuccess: (d) => {
      toast.success(`Multa removida pelo ADM. Parcela: R$ ${d.restoredAmount.toFixed(2).replace('.', ',')}`);
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
      utils.loans.listLoans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const restoreAutomaticLateFee = trpc.loans.restoreAutomaticLateFeeForInstallment.useMutation({
    onSuccess: (d) => {
      toast.success(`Regra automática restaurada. Multa atual: R$ ${d.feeAmount.toFixed(2).replace('.', ',')}`);
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
      utils.loans.listLoans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });''',
'add restore mutation')

# Summary: add fines + updated total under existing paid/restante row.
needle = '''                      const totalLeft = isEncerrado ? 0 : Math.round((principalLeft + interestLeft) * 100) / 100;
                      return (
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">'''
repl = '''                      const totalLeft = isEncerrado ? 0 : Math.round((principalLeft + interestLeft) * 100) / 100;
                      const lateFeeTotal = isEncerrado ? 0 : Math.round((Number(loan.lateFeeTotal || 0)) * 100) / 100;
                      const totalUpdated = Math.round((totalLeft + lateFeeTotal) * 100) / 100;
                      return (
                        <>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">'''
ui_replace_once(needle, repl, 'summary begin')
ui_replace_once(
'''                          </div>
                        </div>
                      );
                    })()}''',
'''                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-2 text-center">
                            <p className="text-[10px] text-orange-300/80 mb-0.5 leading-tight">⚠ Multas / taxas atuais</p>
                            <p className="font-black text-sm text-orange-300">{fmt(lateFeeTotal)}</p>
                          </div>
                          <div className="rounded-lg border border-red-500/40 bg-red-600/15 p-2 text-center">
                            <p className="text-[10px] text-red-300/80 mb-0.5 leading-tight">💰 Total atualizado a receber</p>
                            <p className="font-black text-sm text-red-300">{fmt(totalUpdated)}</p>
                          </div>
                        </div>
                        </>
                      );
                    })()}''',
'summary end')

# Show automatic fee breakdown under each installment amount.
ui_replace_once(
'''                              <p className="text-xs text-muted-foreground">Vence: {fmtDate(inst.dueDate)}</p>''',
'''                              <p className="text-xs text-muted-foreground">Vence: {fmtDate(inst.dueDate)}</p>
                              {loan.paymentType === 'diario' && Number(inst.feeApplied || 0) > 0 && (
                                <p className="mt-0.5 text-xs font-semibold text-orange-300">Multa: {fmt(inst.feeApplied)} · Base: {fmt(inst.originalAmount || inst.amount)} · Total: {fmt(inst.amount)}</p>
                              )}
                              {loan.paymentType === 'diario' && inst.lateFeeDetails?.entries?.length > 0 && !Number(inst.lateFeeAdminOverrideActive || 0) && (
                                <p className="mt-0.5 text-[11px] text-orange-300/80">{inst.lateFeeDetails.entries.map((e: any) => `${fmtDate(e.date)} +${fmt(e.fee)}`).join(' · ')}</p>
                              )}
                              {loan.paymentType === 'diario' && Number(inst.lateFeeAdminOverrideActive || 0) === 1 && (
                                <p className="mt-0.5 text-[11px] font-bold text-sky-300">Controle ADM ativo: multa fixada em {fmt(inst.lateFeeAdminOverride || 0)}</p>
                              )}''',
'installment fee details')

# Always show one Taxa/Multa button on daily unpaid rows, not +/- conditional.
pattern_actions = re.compile(r'''\{loan\.interestOnlyEnabled && inst\.status === "pendente" \? \(.*?\) : inst\.feeApplied != null \? \(.*?\) : \(\n                                <button\n                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2\.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"\n                                  onClick=\{\(\) => handleOpenLateFee\(inst, loan\.id\)\}\n                                  data-testid="manual-late-fee-button">\n                                  <AlertTriangle className="w-4 h-4" />\n                                  \+Taxa\n                                </button>\n                              \)\}''', re.S)
replacement_actions = '''{loan.interestOnlyEnabled && inst.status === "pendente" ? (
                                <button
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"
                                  onClick={() => setInterestOnlyInstModal({ inst, loan })}>
                                  <DollarSign className="w-4 h-4" />
                                  Cobrar Juros
                                </button>
                              ) : loan.paymentType === 'diario' ? (
                                <button
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"
                                  onClick={() => handleOpenLateFee(inst, loan.id)}
                                  data-testid="manual-late-fee-button">
                                  <AlertTriangle className="w-4 h-4" />
                                  Taxa / Multa
                                </button>
                              ) : null}'''
ui, count = pattern_actions.subn(replacement_actions, ui, count=1)
if count != 1:
    raise SystemExit(f'UI action fee button: esperado 1, encontrado {count}')

# em_analise conditional +/- -> unified fee button.
pattern_analysis = re.compile(r'''\{inst\.feeApplied != null \? \(.*?\) : \(\n                                <button\n                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2\.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"\n                                  onClick=\{\(\) => handleOpenLateFee\(inst, loan\.id\)\}\n                                  data-testid="manual-late-fee-button">\n                                  <AlertTriangle className="w-4 h-4" />\n                                  \+Taxa\n                                </button>\n                              \)\}''', re.S)
ui, count = pattern_analysis.subn('''{loan.paymentType === 'diario' ? (
                                <button
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"
                                  onClick={() => handleOpenLateFee(inst, loan.id)}
                                  data-testid="manual-late-fee-button">
                                  <AlertTriangle className="w-4 h-4" />
                                  Taxa / Multa
                                </button>
                              ) : <span />}''', ui, count=1)
if count != 1:
    raise SystemExit(f'UI analysis fee button: esperado 1, encontrado {count}')

# Modal base amount and no tier disabling.
ui_replace_once('const originalAmt = parseFloat(inst.amount);', 'const originalAmt = parseFloat(inst.originalAmount ?? inst.amount);', 'modal original base')
ui = ui.replace('disabled={activeTier !== "after_18" || applyLateFee.isPending}', 'disabled={applyLateFee.isPending}')
ui = ui.replace('disabled={activeTier !== "after_20" || applyLateFee.isPending}', 'disabled={applyLateFee.isPending}')
ui = ui.replace('disabled={activeTier !== "after_midnight" || applyLateFee.isPending}', 'disabled={applyLateFee.isPending}')
ui = ui.replace('disabled={customFee <= 0 || applyLateFee.isPending}', 'disabled={feeCustomAmount.trim() === "" || customFee < 0 || applyLateFee.isPending}')
ui = ui.replace('Aplicar\n                    </Button>', 'Definir\n                    </Button>', 1)

# Insert ADM control buttons at end of custom section.
ui_replace_once(
'''                  {customFee > 0 && (
                    <p className="text-xs text-muted-foreground">Novo valor: <strong className="text-foreground">{fmt(String(originalAmt + customFee))}</strong></p>
                  )}
                </div>''',
'''                  {feeCustomAmount.trim() !== "" && customFee >= 0 && (
                    <p className="text-xs text-muted-foreground">Novo valor: <strong className="text-foreground">{fmt(String(originalAmt + customFee))}</strong></p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                  <Button variant="destructive" disabled={removeLateFee.isPending} onClick={() => removeLateFee.mutate({ installmentId: inst.id })}>Remover multa (R$ 0)</Button>
                  <Button variant="outline" disabled={restoreAutomaticLateFee.isPending} onClick={() => restoreAutomaticLateFee.mutate({ installmentId: inst.id })}>Voltar automático</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">O ADM pode definir qualquer valor, inclusive zero, em qualquer data/horário. “Voltar automático” reativa o cálculo cumulativo por dia.</p>''',
'modal admin controls')

admin_path.write_text(ui, encoding='utf-8')
print('DAILY_FEE_CUMULATIVE_ADMIN_PATCH_OK')
