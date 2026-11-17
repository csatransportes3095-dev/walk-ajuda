import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLoanAdminNotice, escapeLoanNoticeHtml } from "./adminEmailOutbox";

const router = readFileSync(new URL("../routers/loans.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../_core/index.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("./adminEmailOutbox.ts", import.meta.url), "utf8");

const event = {
  kind: "proof" as const,
  loanId: 423,
  clientName: "Cliente Teste",
  clientPhone: "(11) 99999-9999",
  installmentId: 9001,
  installmentNumber: 3,
  amount: 120.5,
  proofUrl: "https://example.com/proof.png",
  submittedAt: "2026-11-17T15:30:00.000Z",
};

describe("reliable ADM notifications for loans", () => {
  it("formats a complete payment proof notification with an accessible link", () => {
    const notice = buildLoanAdminNotice(event);
    expect(notice.subject).toContain("Comprovante de empréstimo recebido");
    expect(notice.subject).toContain("#423");
    expect(notice.html).toContain("120,50");
    expect(notice.html).toContain("https://example.com/proof.png");
    expect(notice.html).toContain("Parcela");
  });

  it("generates distinct messages for loan requests and confirmed payments", () => {
    expect(buildLoanAdminNotice({ ...event, kind: "request", paymentType: "parcelado" }).subject)
      .toContain("Nova solicitação de empréstimo");
    expect(buildLoanAdminNotice({ ...event, kind: "manual_payment" }).subject)
      .toContain("Pagamento de empréstimo confirmado");
    expect(buildLoanAdminNotice({ ...event, kind: "interest_payment" }).subject)
      .toContain("Pagamento de juros registrado");
  });

  it("escapes untrusted customer fields in message HTML", () => {
    expect(escapeLoanNoticeHtml('<script>"hello" & ok</script>'))
      .toBe("&lt;script&gt;&quot;hello&quot; &amp; ok&lt;/script&gt;");
    const notice = buildLoanAdminNotice({ ...event, clientName: "Cliente <b>HTML</b>" });
    expect(notice.html).not.toContain("Cliente <b>HTML</b>");
    expect(notice.html).toContain("Cliente &lt;b&gt;HTML&lt;/b&gt;");
  });

  it("wires both customer loan request paths and the proof upload path", () => {
    expect(router).toContain('queueLoanAdminNotice("request:" + loanId');
    expect(router).toContain('queueLoanAdminNotice("proof:" + input.installmentId + ":" + receivedAt.getTime()');
    expect(router).not.toContain("notifyAdminProofReceived(");
  });

  it("wires both manual payment paths and interest-only payments", () => {
    expect(router.match(/queueLoanAdminNotice\("manual-payment:" \+ input.installmentId \+ ":" \+ Date.now\(\)/g)?.length).toBe(2);
    expect(router).toContain('queueLoanAdminNotice("interest-payment:" + input.installmentId + ":" + Date.now()');
  });

  it("persists, deduplicates and retries failed notifications independently of finance", () => {
    expect(queue).toContain("CREATE TABLE IF NOT EXISTS loanAdminEmailOutbox");
    expect(queue).toContain("UNIQUE KEY uq_loan_email_event");
    expect(queue).toContain("INSERT IGNORE INTO loanAdminEmailOutbox");
    expect(queue).toContain("leaseUntil");
    expect(queue).toContain("state='retry'");
    expect(queue).toContain("state='accepted'");
    expect(queue).toContain("await sendMailDirect(mail)");
    expect(queue).toContain("MAX_ATTACH_BYTES");
    expect(server).toContain("startLoanAdminEmailWorker();");
  });
});
