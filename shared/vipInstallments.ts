export type VipInstallmentFrequency = "daily" | "weekly" | "monthly";
export type VipInstallmentDailyMode = "all_days" | "mon_sat";

export type VipInstallmentQuoteInput = {
  baseAmountCents: number;
  installmentCount: number;
  interestBps: number;
  firstDueDate: string;
  frequency: VipInstallmentFrequency;
  dailyMode?: VipInstallmentDailyMode;
};

export type VipInstallmentQuote = {
  baseAmountCents: number;
  interestBps: number;
  interestAmountCents: number;
  totalAmountCents: number;
  installmentCount: number;
  frequency: VipInstallmentFrequency;
  dailyMode: VipInstallmentDailyMode;
  installments: Array<{
    installmentNumber: number;
    amountCents: number;
    dueDate: string;
  }>;
};

const MAX_SAFE_MONEY_CENTS = 100_000_000_000;

function assertInteger(name: string, value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} inválido.`);
  }
}

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("Data de vencimento inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (
    test.getUTCFullYear() !== year ||
    test.getUTCMonth() !== month - 1 ||
    test.getUTCDate() !== day
  ) {
    throw new Error("Data de vencimento inválida.");
  }
  return { year, month, day };
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInMonthUtc(year: number, monthOneBased: number) {
  return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();
}

function addDailyDate(current: Date, mode: VipInstallmentDailyMode): Date {
  const next = new Date(current.getTime());
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (mode === "mon_sat" && next.getUTCDay() === 0);
  return next;
}

export function splitInstallmentAmounts(totalAmountCents: number, installmentCount: number): number[] {
  assertInteger("Valor total", totalAmountCents, 1, MAX_SAFE_MONEY_CENTS);
  assertInteger("Quantidade de parcelas", installmentCount, 2, 120);
  if (installmentCount > totalAmountCents) {
    throw new Error("Quantidade de parcelas maior que o valor disponível em centavos.");
  }

  const regularAmount = Math.floor(totalAmountCents / installmentCount);
  const amounts = Array.from({ length: installmentCount }, () => regularAmount);
  amounts[installmentCount - 1] = totalAmountCents - regularAmount * (installmentCount - 1);
  return amounts;
}

export function buildVipInstallmentDueDates(input: {
  firstDueDate: string;
  installmentCount: number;
  frequency: VipInstallmentFrequency;
  dailyMode?: VipInstallmentDailyMode;
}): string[] {
  assertInteger("Quantidade de parcelas", input.installmentCount, 2, 120);
  const dailyMode = input.dailyMode || "all_days";
  if (dailyMode !== "all_days" && dailyMode !== "mon_sat") {
    throw new Error("Regra diária inválida.");
  }
  if (!(["daily", "weekly", "monthly"] as const).includes(input.frequency)) {
    throw new Error("Periodicidade inválida.");
  }

  const first = parseIsoDate(input.firstDueDate);
  const dates: string[] = [];

  if (input.frequency === "monthly") {
    const anchorDay = first.day;
    for (let index = 0; index < input.installmentCount; index += 1) {
      const monthIndex = first.month - 1 + index;
      const year = first.year + Math.floor(monthIndex / 12);
      const normalizedMonth = ((monthIndex % 12) + 12) % 12;
      const monthOneBased = normalizedMonth + 1;
      const targetDay = Math.min(anchorDay, daysInMonthUtc(year, monthOneBased));
      dates.push(formatIsoDate(new Date(Date.UTC(year, normalizedMonth, targetDay))));
    }
    return dates;
  }

  let current = new Date(Date.UTC(first.year, first.month - 1, first.day));
  for (let index = 0; index < input.installmentCount; index += 1) {
    dates.push(formatIsoDate(current));
    if (index === input.installmentCount - 1) break;
    if (input.frequency === "weekly") {
      current = new Date(current.getTime());
      current.setUTCDate(current.getUTCDate() + 7);
    } else {
      current = addDailyDate(current, dailyMode);
    }
  }
  return dates;
}

export function calculateVipInstallmentQuote(input: VipInstallmentQuoteInput): VipInstallmentQuote {
  assertInteger("Valor da compra", input.baseAmountCents, 1, MAX_SAFE_MONEY_CENTS);
  assertInteger("Quantidade de parcelas", input.installmentCount, 2, 120);
  assertInteger("Juros", input.interestBps, 0, 100_000);

  const interestAmountCents = Math.round((input.baseAmountCents * input.interestBps) / 10_000);
  const totalAmountCents = input.baseAmountCents + interestAmountCents;
  if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents > MAX_SAFE_MONEY_CENTS) {
    throw new Error("Valor total fora do limite permitido.");
  }

  const amounts = splitInstallmentAmounts(totalAmountCents, input.installmentCount);
  const dailyMode = input.dailyMode || "all_days";
  const dueDates = buildVipInstallmentDueDates({
    firstDueDate: input.firstDueDate,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    dailyMode,
  });

  return {
    baseAmountCents: input.baseAmountCents,
    interestBps: input.interestBps,
    interestAmountCents,
    totalAmountCents,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    dailyMode,
    installments: amounts.map((amountCents, index) => ({
      installmentNumber: index + 1,
      amountCents,
      dueDate: dueDates[index],
    })),
  };
}
