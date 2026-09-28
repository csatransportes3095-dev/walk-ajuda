import { describe, expect, it } from "vitest";
import { selectLoanInstallmentFocus } from "../shared/loanInstallmentFocus";

describe("parcela em foco do empréstimo", () => {
  const today = "2026-09-28";

  it("prioriza comprovante em análise mesmo quando existem parcelas anteriores pagas", () => {
    const selected = selectLoanInstallmentFocus([
      { id: 19, loanId: 1, installmentNumber: 19, status: "pago", dueDate: "2026-09-23" },
      { id: 20, loanId: 1, installmentNumber: 20, status: "pago", dueDate: "2026-09-24" },
      { id: 23, loanId: 1, installmentNumber: 23, status: "em_analise", dueDate: "2026-09-27" },
      { id: 24, loanId: 1, installmentNumber: 24, status: "pendente", dueDate: "2026-09-28" },
    ], today);

    expect(selected?.reason).toBe("proof_review");
    expect(selected?.installment.installmentNumber).toBe(23);
  });

  it("depois do comprovante prioriza a vencida, hoje e então a próxima", () => {
    const overdue = selectLoanInstallmentFocus([
      { id: 1, loanId: 1, installmentNumber: 22, status: "pendente", dueDate: "2026-09-27" },
      { id: 2, loanId: 1, installmentNumber: 23, status: "pendente", dueDate: today },
      { id: 3, loanId: 1, installmentNumber: 24, status: "pendente", dueDate: "2026-09-29" },
    ], today);
    expect(overdue?.reason).toBe("overdue");
    expect(overdue?.installment.installmentNumber).toBe(22);

    const dueToday = selectLoanInstallmentFocus([
      { id: 2, loanId: 1, installmentNumber: 23, status: "pendente", dueDate: today },
      { id: 3, loanId: 1, installmentNumber: 24, status: "pendente", dueDate: "2026-09-29" },
    ], today);
    expect(dueToday?.reason).toBe("due_today");
    expect(dueToday?.installment.installmentNumber).toBe(23);

    const next = selectLoanInstallmentFocus([
      { id: 3, loanId: 1, installmentNumber: 24, status: "pendente", dueDate: "2026-09-29" },
      { id: 4, loanId: 1, installmentNumber: 25, status: "pendente", dueDate: "2026-09-30" },
    ], today);
    expect(next?.reason).toBe("next_pending");
    expect(next?.installment.installmentNumber).toBe(24);
  });

  it("usa a última parcela paga apenas como referência quando não há ação pendente", () => {
    const selected = selectLoanInstallmentFocus([
      { id: 1, loanId: 1, installmentNumber: 24, status: "pago", dueDate: "2026-09-27" },
      { id: 2, loanId: 1, installmentNumber: 25, status: "pago", dueDate: "2026-09-28" },
    ], today);
    expect(selected?.reason).toBe("last_paid");
    expect(selected?.installment.installmentNumber).toBe(25);
  });
});
