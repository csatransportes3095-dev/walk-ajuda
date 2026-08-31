from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)

router = Path('server/routers/loans.ts')
source = router.read_text(encoding='utf-8')

source = replace_once(
    source,
    'import { calculateLateFeeDetailsForInstallment, calculateLateFeeForInstallment } from "../loans/lateFee";',
    'import { calculateLateFeeDetailsForInstallment, calculateLateFeeForInstallment } from "../loans/lateFee";\nimport { calculateParceladoFromAdminPlan } from "../loans/parcelado";',
    'import parcelado central',
)

source = replace_once(
    source,
    '''    const opcoes = plans.map((p: any) => {
      const pct = parseFloat(p.percentual);
      const total = Math.round(input.amount * (1 + pct / 100) * 100) / 100;
      const parcela = Math.round((total / parseInt(p.parcelas)) * 100) / 100;
      return { parcelas: parseInt(p.parcelas), valorParcela: parcela, valorTotal: total };
    });''',
    '''    const opcoes = plans.map((p: any) => {
      const calc = calculateParceladoFromAdminPlan({
        amount: input.amount,
        installments: parseInt(p.parcelas),
        percentage: parseFloat(p.percentual),
      });
      return { parcelas: calc.installments, valorParcela: calc.perInstallment, valorTotal: calc.totalAmount };
    });''',
    'simulacao cliente usa plano ADM',
)

source = replace_once(
    source,
    '''    frequencia: z.enum(['mensal', 'quinzenal', 'semanal']).default('mensal'),''',
    '''    frequencia: z.literal('mensal').default('mensal'),''',
    'simulacao adm mensal somente',
)

source = replace_once(
    source,
    '''    const pct = parseFloat(plan[0].percentual);
    const valorJuros = Math.round(input.amount * (pct / 100) * 100) / 100;
    const total = Math.round((input.amount + valorJuros) * 100) / 100;
    const parcela = Math.round((total / input.parcelas) * 100) / 100;
    // Gerar datas das parcelas
    const schedule = generateInstallments(input.releaseDate, input.frequencia === 'mensal' ? 'mensal' : input.frequencia === 'quinzenal' ? 'quinzenal' : 'semanal', input.parcelas, total);''',
    '''    const calc = calculateParceladoFromAdminPlan({ amount: input.amount, installments: input.parcelas, percentage: parseFloat(plan[0].percentual) });
    const pct = calc.percentage;
    const valorJuros = calc.interestAmount;
    const total = calc.totalAmount;
    const parcela = calc.perInstallment;
    // Parcelado é sempre mensal.
    const schedule = generateInstallments(input.releaseDate, 'mensal', input.parcelas, total);''',
    'simulacao adm central mensal',
)

source = replace_once(
    source,
    '''    frequencia: z.enum(['mensal', 'quinzenal', 'semanal']).default('mensal'),
    primeiroVencimento: z.string().optional(),''',
    '''    frequencia: z.literal('mensal').default('mensal'),
    primeiroVencimento: z.string().optional(),''',
    'pedido mensal somente',
)

source = replace_once(
    source,
    '''    const pct = parseFloat(plan[0].percentual);
    const valorJuros = Math.round(input.amount * (pct / 100) * 100) / 100;
    const total = Math.round((input.amount + valorJuros) * 100) / 100;
    const today = getBrazilToday();''',
    '''    const calc = calculateParceladoFromAdminPlan({ amount: input.amount, installments: input.parcelas, percentage: parseFloat(plan[0].percentual) });
    const pct = calc.percentage;
    const valorJuros = calc.interestAmount;
    const total = calc.totalAmount;
    const today = getBrazilToday();''',
    'pedido usa percentual ADM',
)

source = replace_once(
    source,
    '''      return { id: loanId, parcelas: input.parcelas, valorParcela: Math.round((total / input.parcelas) * 100) / 100, valorTotal: total, primeiroVencimento: schedule[0].dueDate };''',
    '''      return { id: loanId, parcelas: input.parcelas, valorParcela: calc.perInstallment, valorTotal: total, primeiroVencimento: schedule[0].dueDate, frequencia: 'mensal' as const };''',
    'retorno pedido central',
)

router.write_text(source, encoding='utf-8')

client = Path('client/src/pages/LoansTab.tsx')
ui = client.read_text(encoding='utf-8')

ui = replace_once(
    ui,
    '''  const [parceladoSelecionado, setParceladoSelecionado] = useState<number | null>(null);
  const [parceladoFrequencia, setParceladoFrequencia] = useState<'mensal' | 'quinzenal' | 'semanal'>('mensal');
  const [parceladoConfirm, setParceladoConfirm] = useState(false);''',
    '''  const [parceladoSelecionado, setParceladoSelecionado] = useState<number | null>(null);
  const [parceladoConfirm, setParceladoConfirm] = useState(false);''',
    'remove frequencia variavel',
)

ui = replace_once(
    ui,
    '''              const diasFreq = parceladoFrequencia === 'semanal' ? 7 : parceladoFrequencia === 'quinzenal' ? 15 : 30;''',
    '''              const diasFreq = 30;''',
    'preview mensal fixo',
)

ui = replace_once(
    ui,
    '''                      requestParceladoMutation.mutate({ token, amount: parseFloat(requestAmount), parcelas: parceladoSelecionado, frequencia: parceladoFrequencia });''',
    '''                      requestParceladoMutation.mutate({ token, amount: parseFloat(requestAmount), parcelas: parceladoSelecionado, frequencia: 'mensal' });''',
    'envio mensal fixo',
)

if 'parceladoFrequencia' in ui or 'setParceladoFrequencia' in ui:
    raise SystemExit('referência de frequência variável ainda presente no cliente')

client.write_text(ui, encoding='utf-8')
print('PARCELADO_MONTHLY_ADMIN_PERCENT_PATCH_OK')
