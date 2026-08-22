import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculateLateFeeForInstallment } from "./loans/lateFee";

const config = {
  enabled: 1,
  fee_after_18h: "5.00",
  fee_after_20h: "5.00",
  fee_after_midnight_pct: "20.00",
};

function fee(dueDate: string, hour: number, amount = 16.8, enabled = 1) {
  return calculateLateFeeForInstallment({
    dueDate,
    amount,
    config: { ...config, enabled },
    clock: { today: "2026-08-21", hour },
  });
}

describe("taxa de atraso exibida ao cliente", () => {
  it("não cobra antes das 18h no dia do vencimento", () => {
    expect(fee("2026-08-21", 17)).toBe(0);
  });

  it("não cobra em parcela futura, mesmo após 18h", () => {
    expect(fee("2026-09-18", 23, 400)).toBe(0);
  });

  it("mostra a taxa de 18h antes de qualquer comprovante", () => {
    expect(fee("2026-08-21", 18)).toBe(5);
  });

  it("mostra a taxa fixa acumulada a partir das 20h", () => {
    expect(fee("2026-08-21", 20)).toBe(10);
  });

  it("usa a maior taxa aplicável após o dia do vencimento", () => {
    expect(fee("2026-08-20", 9, 100)).toBe(20);
    expect(fee("2026-08-20", 9, 16.8)).toBe(10);
  });

  it("respeita a taxa global desativada", () => {
    expect(fee("2026-08-20", 9, 100, 0)).toBe(0);
  });
});

describe("sincronização da tela /gastos", () => {
  const root = path.resolve(process.cwd());
  const loansRouter = fs.readFileSync(path.join(root, "server/routers/loans.ts"), "utf8");
  const clientLoans = fs.readFileSync(path.join(root, "client/src/pages/LoansTab.tsx"), "utf8");

  it("calcula somente uma prévia para parcela pendente sem taxa persistida", () => {
    expect(loansRouter).toContain('i.originalAmount == null');
    expect(loansRouter).toContain('["pendente", "atrasado"].includes(i.status)');
    expect(loansRouter).toContain('lateFeePreview: true');
  });

  it("bloqueia no servidor a taxa manual antes do vencimento", () => {
    expect(loansRouter).toContain("if (dueDate >= getBrazilToday())");
    expect(loansRouter).toContain("Taxa de atraso só pode ser aplicada após o vencimento da parcela.");
  });

  it("atualiza a lista aberta periodicamente e ao voltar para a aba", () => {
    expect(clientLoans).toContain('refetchOnMount: "always"');
    expect(clientLoans).toContain('refetchOnWindowFocus: true');
    expect(clientLoans).toContain('refetchInterval: 15000');
  });
});
