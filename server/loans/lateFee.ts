export type LateFeeConfigLike = {
  enabled?: boolean | number | string | null;
  fee_after_18h?: number | string | null;
  fee_after_20h?: number | string | null;
  fee_after_midnight_pct?: number | string | null;
};

export type LateFeeClock = {
  today: string;
  hour: number;
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

/**
 * Calcula a taxa aplicável em um instante específico, sem gravar no banco.
 * A gravação continua sendo responsabilidade do fluxo de envio do comprovante.
 */
export function isLateFeeWindowOpen(input: { dueDate: unknown; clock: LateFeeClock; openingHour?: number }): boolean {
  const dueDate = asDate(input.dueDate);
  if (!dueDate || !input.clock.today) return false;
  const openingHour = input.openingHour ?? 18;
  return dueDate < input.clock.today || (dueDate === input.clock.today && input.clock.hour >= openingHour);
}

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
  if (!amount || !dueDate || dueDate > today) return 0;

  const feeAfter18 = asAmount(input.config.fee_after_18h);
  const fixedFeeAfter20 = feeAfter18 + asAmount(input.config.fee_after_20h);

  if (dueDate < today) {
    const overnightFee = Math.round(amount * (asAmount(input.config.fee_after_midnight_pct) / 100) * 100) / 100;
    return Math.max(fixedFeeAfter20, overnightFee);
  }

  if (hour >= 20) return fixedFeeAfter20;
  if (hour >= 18) return feeAfter18;
  return 0;
}
