import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/loans.ts"), "utf8");

describe("notificações de comprovantes de empréstimos", () => {
  it("notifica o ADM quando o cliente envia o comprovante", () => {
    expect(source).toContain("notifyAdminProofReceived");
    expect(source).toContain("getSetting('contact_email')");
    expect(source).toContain("attachments: [{ filename: opts.fileName");
    expect(source).toContain("Falha ao notificar ADM");
  });

  it("inclui parcela, valor, data e hora no aviso ao ADM", () => {
    expect(source).toContain("Parcela:</strong> #${opts.installmentNumber}");
    expect(source).toContain("Valor:</strong> ${amount}");
    expect(source).toContain("Enviado em:</strong> ${submittedAt}");
    expect(source).toContain("Abrir comprovante recebido");
  });

  it("notifica o cliente após aprovação nos dois fluxos do ADM", () => {
    expect(source).toContain("notifyClientPaymentApproved");
    expect(source).toContain("[confirmInstallmentPayment] Falha ao notificar cliente");
    expect(source).toContain("[confirmInstallmentPaymentWithProof] Falha ao notificar cliente");
    expect(source).toContain("Pagamento aprovado — Parcela #${opts.installmentNumber}");
  });

  it("inclui empréstimo, parcela, valor e data/hora na aprovação", () => {
    expect(source).toContain("Empréstimo:</strong> #${opts.loanId}");
    expect(source).toContain("Parcela paga:</strong> #${opts.installmentNumber}");
    expect(source).toContain("Valor pago:</strong> ${amount}");
    expect(source).toContain("Data e hora da aprovação:</strong> ${brazilDateTime(opts.paidAt)}");
  });

  it("não reenvia aprovação ao reprocessar uma parcela já paga", () => {
    expect(source).toContain("if (clientEmail && !wasAlreadyPaid)");
    expect(source.match(/if \(clientEmail && !wasAlreadyPaid\)/g)?.length).toBe(2);
  });
});
