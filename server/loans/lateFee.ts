export type LateFeeConfigLike = {
  enabled?: boolean | number | string | null;
  fee_after_18h?: number | string | null;
  fee_after_20h?: number | string | null;
  fee_after_midnight_pct?: number | string | null;
};

export type LateFeeClock = {
  today: string;
  hour: number;
  minute?: number;
};

function asAmount(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function asDate(value: unknown): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : new Date(value as Date).toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calcula a taxa aplicável em um instante específico, sem gravar no banco.
 * A fonte temporal deve ser sempre o relógio de America/Sao_Paulo.
 *
 * Regras do empréstimo diário:
 * - até 18:00: sem taxa;
 * - 18:01 até 20:00: primeira taxa fixa;
 * - 20:01 até 23:58: taxas fixas acumuladas;
 * - a partir de 23:59: maior valor entre a taxa fixa acumulada e o percentual da parcela;
 * - nos dias seguintes, permanece a regra do maior valor.
 */
export function calculateLateFeeForInstallment(input: {
  dueDate: unknown;
  amount: unknown;
  config: LateFeeConfigLike | null | undefined;
  clock: LateFeeClock;
}): number {
  if (!input.config?.enabled || String(input.config.enabled) === "0") return 0;

  const amount = asAmount(input.amount);
  const dueDate = asDate(input.dueDate);
  const { today, hour } = input.clock;
  const minute = Number(input.clock.minute || 0);
  if (!amount || !dueDate || dueDate > today) return 0;

  const feeAfter18 = asAmount(input.config.fee_after_18h);
  const fixedFeeAfter20 = roundMoney(feeAfter18 + asAmount(input.config.fee_after_20h));
  const percentageFee = roundMoney(amount * (asAmount(input.config.fee_after_midnight_pct) / 100));
  const maximumLateFee = Math.max(fixedFeeAfter20, percentageFee);

  if (dueDate < today) return maximumLateFee;

  const minutesSinceMidnight = (Number(hour) * 60) + minute;
  const at1801 = (18 * 60) + 1;
  const at2001 = (20 * 60) + 1;
  const at2359 = (23 * 60) + 59;

  if (minutesSinceMidnight >= at2359) return maximumLateFee;
  if (minutesSinceMidnight >= at2001) return fixedFeeAfter20;
  if (minutesSinceMidnight >= at1801) return feeAfter18;
  return 0;
}
