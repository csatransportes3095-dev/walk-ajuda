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

const FIRST_FEE_MINUTE = 18 * 60 + 1; // 18:01 em São Paulo
const SECOND_FEE_MINUTE = 20 * 60 + 1; // 20:01 em São Paulo
const FINAL_FEE_MINUTE = 23 * 60 + 59; // 23:59 em São Paulo

function asAmount(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function asDate(value: unknown): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : new Date(value as Date).toISOString().slice(0, 10);
}

function minuteOfDay(clock: LateFeeClock): number {
  const minute = Number.isFinite(Number(clock.minute)) ? Number(clock.minute) : 0;
  return Number(clock.hour || 0) * 60 + minute;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Janela automática da taxa diária, sempre interpretada no relógio de São Paulo.
 * O ADM não depende desta janela para aplicar uma taxa manual.
 */
export function isLateFeeWindowOpen(input: { dueDate: unknown; clock: LateFeeClock }): boolean {
  const dueDate = asDate(input.dueDate);
  if (!dueDate || !input.clock.today) return false;
  if (dueDate < input.clock.today) return true;
  return dueDate === input.clock.today && minuteOfDay(input.clock) >= FIRST_FEE_MINUTE;
}

/**
 * Regra única da taxa automática para parcelas DIÁRIAS:
 * - antes de 18:01 no vencimento: sem taxa;
 * - 18:01 até 20:00: primeira taxa fixa;
 * - 20:01 até 23:58: primeira + segunda taxa fixa;
 * - 23:59 em diante: maior entre a taxa fixa acumulada e o percentual da parcela.
 *
 * O caller é responsável por garantir que esta fórmula só seja usada em
 * empréstimos com paymentType="diario". Taxas manuais do ADM são independentes.
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
  const { today } = input.clock;
  if (!amount || !dueDate || !today || dueDate > today) return 0;

  const firstFee = asAmount(input.config.fee_after_18h);
  const fixedAccumulated = roundMoney(firstFee + asAmount(input.config.fee_after_20h));
  const percentFee = roundMoney(amount * (asAmount(input.config.fee_after_midnight_pct) / 100));
  const highestFinalFee = Math.max(fixedAccumulated, percentFee);

  if (dueDate < today) return highestFinalFee;

  const nowMinutes = minuteOfDay(input.clock);
  if (nowMinutes >= FINAL_FEE_MINUTE) return highestFinalFee;
  if (nowMinutes >= SECOND_FEE_MINUTE) return fixedAccumulated;
  if (nowMinutes >= FIRST_FEE_MINUTE) return firstFee;
  return 0;
}
