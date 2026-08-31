export type ParceladoCalculation = {
  amount: number;
  installments: number;
  percentage: number;
  interestAmount: number;
  totalAmount: number;
  perInstallment: number;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateParceladoFromAdminPlan(input: {
  amount: number;
  installments: number;
  percentage: number;
}): ParceladoCalculation {
  const amount = Number(input.amount);
  const installments = Math.trunc(Number(input.installments));
  const percentage = Number(input.percentage);

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor do empréstimo inválido");
  if (!Number.isInteger(installments) || installments < 1) throw new Error("Quantidade de parcelas inválida");
  if (!Number.isFinite(percentage) || percentage < 0) throw new Error("Percentual do ADM inválido");

  const interestAmount = roundMoney(amount * (percentage / 100));
  const totalAmount = roundMoney(amount + interestAmount);
  const perInstallment = roundMoney(totalAmount / installments);

  return { amount, installments, percentage, interestAmount, totalAmount, perInstallment };
}
