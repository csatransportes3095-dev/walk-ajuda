from pathlib import Path
import re
import subprocess

ROOT = Path('.')
router_path = ROOT / 'server/routers/loans.ts'
public_path = ROOT / 'client/src/pages/LoansTab.tsx'
admin_path = ROOT / 'client/src/pages/AdminLoans.tsx'


def require_count(text: str, marker: str, count: int, label: str) -> None:
    actual = text.count(marker)
    if actual != count:
        raise SystemExit(f'{label}: expected {count}, found {actual}')


# 1) Put the clean main-based router in the exact intermediate shape expected by
# the previously audited server-only patch. The audited patch immediately removes
# the temporary import and upgrades this clock to the minute-exact SP version.
s = router_path.read_text(encoding='utf-8')
old_import = 'import { calculateLateFeeForInstallment } from "../loans/lateFee";'
require_count(s, old_import, 1, 'late fee import')
s = s.replace(old_import, 'import { calculateLateFeeForInstallment, isLateFeeWindowOpen } from "../loans/lateFee";', 1)
clock_pattern = r'function getBrazilClock\(now = new Date\(\)\): \{ date: string; hour: number \} \{[\s\S]*?\n\}\n\nfunction getBrazilToday\(\): string \{'
clock_intermediate = '''function getBrazilClock(now = new Date()): { today: string; date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "0";
  const today = `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`;
  return { today, date: today, hour: Number(valueOf("hour")) };
}

function getBrazilToday(): string {'''
s, n = re.subn(clock_pattern, clock_intermediate, s, count=1)
if n != 1:
    raise SystemExit(f'clock intermediate mismatch: {n}')
router_path.write_text(s, encoding='utf-8')

# 2) Reuse only the audited SERVER patch logic from the isolated historical branch.
subprocess.run(['git', 'fetch', 'origin', 'fix/daily-late-fee-audit-20260831'], check=True)
old_patch = subprocess.check_output([
    'git', 'show', 'origin/fix/daily-late-fee-audit-20260831:scripts/patch-daily-late-fee.mjs'
], text=True)
old_patch = old_patch.replace(
    "patchLoansRouter();\npatchAdminLoans();\npatchPublicLoans();\nconsole.log('PATCH_DAILY_LATE_FEE_OK');",
    "patchLoansRouter();\nconsole.log('PATCH_DAILY_LATE_FEE_SERVER_OK');",
)
tmp = Path('/tmp/patch-daily-late-fee-server.mjs')
tmp.write_text(old_patch, encoding='utf-8')
subprocess.run(['node', str(tmp)], check=True)

# 3) Add the public top-card preview and harden ADM manual fee so it can never
# lower an already valid automatic/stored fee.
s = router_path.read_text(encoding='utf-8')
next_select = 'SELECT li.*, l.id as loanId FROM loanInstallments li'
require_count(s, next_select, 1, 'next installment select')
s = s.replace(next_select, 'SELECT li.*, l.id as loanId, l.paymentType AS loanPaymentType FROM loanInstallments li', 1)
anchor = '      nextInstallment = nextInsts[0] || null;\n'
require_count(s, anchor, 1, 'next installment assignment')
s = s.replace(anchor, '''      nextInstallment = nextInsts[0] || null;
      if (nextInstallment && String(nextInstallment.loanPaymentType || '') === 'diario' && !client.late_fee_disabled) {
        const nextFeeConfigRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
        const nextBaseAmount = nextInstallment.originalAmount != null ? Number(nextInstallment.originalAmount || 0) : Number(nextInstallment.amount || 0);
        const nextStoredFee = Number(nextInstallment.feeApplied || 0);
        const nextAutomaticFee = calculateLateFeeForInstallment({
          dueDate: nextInstallment.dueDate,
          amount: nextBaseAmount,
          config: nextFeeConfigRows[0],
          clock: getBrazilClock(),
        });
        const nextEffectiveFee = Math.max(nextStoredFee, nextAutomaticFee);
        if (nextEffectiveFee > 0) {
          nextInstallment = {
            ...nextInstallment,
            amount: Math.round((nextBaseAmount + nextEffectiveFee) * 100) / 100,
            originalAmount: nextBaseAmount.toFixed(2),
            feeApplied: nextEffectiveFee.toFixed(2),
            lateFeePreview: nextAutomaticFee > nextStoredFee,
          };
        }
      }
''', 1)

manual_pattern = r'''    // O ADM pode aplicar manualmente a taxa em qualquer data/horário\.[\s\S]*?    return \{ ok: true, originalAmount, feeAmount: input\.feeAmount, newAmount \};'''
manual_repl = '''    // O ADM pode aplicar manualmente a taxa em qualquer data/horário.
    // Mesmo no manual, nunca e permitido reduzir uma taxa automatica valida ou uma taxa ja gravada.
    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);
    const storedFee = current.feeApplied != null ? parseFloat(current.feeApplied) : 0;
    const cfgRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const automaticFee = calculateLateFeeForInstallment({
      dueDate: current.dueDate,
      amount: originalAmount,
      config: cfgRows[0],
      clock: getBrazilClock(),
    });
    const effectiveFee = Math.max(storedFee, input.feeAmount, automaticFee);
    const newAmount = Math.round((originalAmount + effectiveFee) * 100) / 100;
    const spNow = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const note = input.feeNote || `Taxa diaria manual: +R$ ${effectiveFee.toFixed(2).replace('.', ',')} aplicada pelo ADM em ${spNow}`;
    await db.execute(drizzleSql`
      UPDATE loanInstallments
      SET amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)}, feeApplied=${effectiveFee.toFixed(2)}, notes=${note}
      WHERE id=${input.installmentId}
    `);
    return { ok: true, originalAmount, feeAmount: effectiveFee, newAmount };'''
s, n = re.subn(manual_pattern, manual_repl, s, count=1)
if n != 1:
    raise SystemExit(f'manual max patch mismatch: {n}')

required_server = [
    'minute: Number(valueOf("minute"))',
    "String(row.loanPaymentType || '') === 'diario'",
    "String(installment.loanPaymentType || '') !== 'diario'",
    "Math.max(storedFee, input.feeAmount, automaticFee)",
    "AND l.paymentType = 'diario'",
    'li.dueDate <= ${clock.today}',
    'nextEffectiveFee = Math.max(nextStoredFee, nextAutomaticFee)',
]
for item in required_server:
    if item not in s:
        raise SystemExit(f'missing server invariant: {item}')
if 'Taxa de atraso só pode ser aplicada após o vencimento' in s:
    raise SystemExit('manual due-date barrier still exists')
router_path.write_text(s, encoding='utf-8')

# 4) Public UI: daily only + exact minute labels.
pub = public_path.read_text(encoding='utf-8')
pairs = [
    ('function LateFeePanel({ config, installmentAmount }: { config: any; installmentAmount?: number }) {\n  if (!config?.enabled) return null;',
     'function LateFeePanel({ config, installmentAmount, paymentType }: { config: any; installmentAmount?: number; paymentType?: string }) {\n  if (!config?.enabled || paymentType !== "diario") return null;'),
    ('Das 18h até 19:59:', 'Das 18:01 até 20:00:'),
    ('A partir das 20h:', 'Das 20:01 até 23:58:'),
    ('Após 23:59:', 'Às 23:59 e depois:'),
]
for old, new in pairs:
    require_count(pub, old, 1, f'public {old[:24]}')
    pub = pub.replace(old, new, 1)
if '<LateFeePanel config={lateFeeConfig} />' in pub:
    pub = pub.replace('<LateFeePanel config={lateFeeConfig} />', '<LateFeePanel config={lateFeeConfig} paymentType="diario" />', 1)
loan_panel = '<LateFeePanel config={lateFeeConfig} installmentAmount={totalAmt / Math.max(totalCount, 1)} />'
require_count(pub, loan_panel, 1, 'public loan fee panel')
pub = pub.replace(loan_panel, '<LateFeePanel config={lateFeeConfig} installmentAmount={totalAmt / Math.max(totalCount, 1)} paymentType={loan.paymentType} />', 1)
public_path.write_text(pub, encoding='utf-8')

# 5) ADM UI: button is available on any DAILY pending installment, and the 23:59
# preset always uses the greater of accumulated fixed fee and percentage fee.
adm = admin_path.read_text(encoding='utf-8')
midnight_old = 'const feeMidnight = Math.round(originalAmt * (feeMidnightPct / 100) * 100) / 100;'
require_count(adm, midnight_old, 1, 'admin midnight formula')
adm = adm.replace(midnight_old, 'const feeMidnight = Math.max(feeTotal18_20, Math.round(originalAmt * (feeMidnightPct / 100) * 100) / 100);', 1)
require_count(adm, ') : inst.isOverdue ? (', 2, 'admin +Taxa visibility')
adm = adm.replace(') : inst.isOverdue ? (', ') : loan.paymentType === "diario" ? (')
adm = adm.replace('Taxa 18h–20h', 'Taxa manual — regra 18:01')
adm = adm.replace('Taxa 20h–23:59 (acumulada)', 'Taxa manual acumulada — regra 20:01')
adm = adm.replace('Taxa após meia-noite ({feeMidnightPct}%)', 'Taxa final — 23:59 ({feeMidnightPct}%)')
admin_path.write_text(adm, encoding='utf-8')

# 6) Integration regression test.
(ROOT / 'server/dailyLateFeeIntegration.test.ts').write_text('''import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const router = fs.readFileSync(path.join(root, "server/routers/loans.ts"), "utf8");
const publicUi = fs.readFileSync(path.join(root, "client/src/pages/LoansTab.tsx"), "utf8");
const adminUi = fs.readFileSync(path.join(root, "client/src/pages/AdminLoans.tsx"), "utf8");

describe("daily late fee integration", () => {
  it("restricts automatic and manual late fees to daily loans", () => {
    expect(router).toContain("String(row.loanPaymentType || '') === 'diario'");
    expect(router).toContain("String(installment.loanPaymentType || '') !== 'diario'");
    expect(router).toContain("AND l.paymentType = 'diario'");
    expect(router).toContain("Taxa diária disponível somente em empréstimos com pagamento diário.");
  });
  it("never lowers a valid stored, manual or automatic fee", () => {
    expect(router).toContain("Math.max(storedFee, input.feeAmount, automaticFee)");
    expect(router).toContain("Math.max(storedFee, automaticFee)");
    expect(router).toContain("Math.max(nextStoredFee, nextAutomaticFee)");
  });
  it("uses minute-exact Sao Paulo bands and public daily-only panel", () => {
    expect(router).toContain('minute: Number(valueOf("minute"))');
    expect(publicUi).toContain("Das 18:01 até 20:00:");
    expect(publicUi).toContain("Das 20:01 até 23:58:");
    expect(publicUi).toContain("Às 23:59 e depois:");
    expect(publicUi).toContain('paymentType={loan.paymentType}');
  });
  it("keeps ADM manual button available on daily installments and correct midnight preset", () => {
    expect(adminUi).toContain('loan.paymentType === "diario" ? (');
    expect(adminUi).toContain("Math.max(feeTotal18_20");
  });
});
''', encoding='utf-8')

print('PATCH_DAILY_LATE_FEE_CLEAN_OK')
