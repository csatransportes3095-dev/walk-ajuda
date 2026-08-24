import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "mysql2/promise";
import { buildR2PublicUrl, r2ListObjects } from "../server/r2Storage";

type Row = Record<string, any>;

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function money(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: string | undefined): string | null {
  const match = value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\r/g, "");
}

function statusFromText(value: string | undefined): string | null {
  const text = String(value || "").toLowerCase();
  if (text.includes("pago") || text.includes("quitado") || text.includes("finalizado")) return "pago";
  if (text.includes("reprov")) return "reprovado";
  if (text.includes("cancel")) return "cancelado";
  if (text.includes("atras")) return "atrasado";
  if (text.includes("análise") || text.includes("analise")) return "em_analise";
  if (text.includes("aprovado")) return "aprovado";
  if (text.includes("aguardando")) return "pendente";
  if (text.includes("pendente")) return "pendente";
  return null;
}

async function pdfText(key: string): Promise<string> {
  const response = await fetch(buildR2PublicUrl(key));
  if (!response.ok) throw new Error(`falha ${response.status} ao baixar ${key}`);
  const dir = mkdtempSync(join(tmpdir(), "loan-recovery-"));
  const pdf = join(dir, "document.pdf");
  try {
    writeFileSync(pdf, Buffer.from(await response.arrayBuffer()));
    return cleanText(execFileSync("pdftotext", ["-layout", pdf, "-"], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStatement(key: string, text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const loanId = number(key.match(/^loan-statements\/(\d+)-/)?.[1]);
  const generatedAt = number(key.match(/-(\d+)\.pdf$/i)?.[1]);
  const profileLine = lines.find((line) => line.includes("★"));
  const profileMatch = profileLine?.match(/^(.*?)\s+★\s+(.+)$/);
  const contactLine = lines.find((line) => /\d{10,13}\s+CPF:/i.test(line));
  const contact = contactLine?.match(/(\d{10,13})\s+CPF:\s*([\d.-]{11,})/i);
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || null;

  const financeIndex = lines.findIndex((line) => line.includes("VALOR SOLICITADO") && line.includes("TOTAL C/ JUROS"));
  let financeValues: string[] = [];
  for (let index = financeIndex + 1; index < Math.min(lines.length, financeIndex + 8); index++) {
    const values = [...lines[index].matchAll(/R\$\s*([\d.,]+)/g)].map((match) => match[1]);
    if (values.length >= 3) { financeValues = values; break; }
  }

  const paidIndex = lines.findIndex((line) => line.includes("TOTAL PAGO") && line.includes("SALDO RESTANTE"));
  let paidValues: string[] = [];
  let installmentProgress: RegExpMatchArray | null = null;
  for (let index = paidIndex + 1; index < Math.min(lines.length, paidIndex + 8); index++) {
    const values = [...lines[index].matchAll(/R\$\s*([\d.,]+)/g)].map((match) => match[1]);
    if (values.length >= 2) paidValues = values;
    installmentProgress ||= lines[index].match(/(\d+)\s*\/\s*(\d+)/);
  }

  const detailsLine = lines.find((line) => line.includes("#EMP-") && line.includes("Status"));
  const rawStatus = detailsLine?.split(/Status/i)[1]?.trim() || "";
  const datesLine = lines.find((line) => line.includes("Data de Liberação") && line.includes("Data de Vencimento"));
  const dates = datesLine ? [...datesLine.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map((match) => match[0]) : [];
  const paymentLine = lines.find((line) => line.includes("Tipo de Pagamento") && line.includes("Taxa de Juros"));
  const paymentType = paymentLine?.replace(/^.*Tipo de Pagamento\s*/i, "").replace(/Taxa de Juros.*$/i, "").trim() || null;
  const interestRate = Number(text.match(/JUROS\s*\(([\d.,]+)%\)/i)?.[1]?.replace(",", ".") || 0) || null;

  const installments = lines.flatMap((line) => {
    const match = line.match(/^(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+R\$\s*([\d.,]+)\s+(?:(\d{2}\/\d{2}\/\d{4})|[^\d]+)\s+(Pago(?: de Juros)?|Pendente|Em Análise|Atrasado)/i);
    if (!match) return [];
    return [{
      number: Number(match[1]),
      dueDate: isoDate(match[2]),
      amount: money(match[3]),
      paidAt: isoDate(match[4]),
      status: statusFromText(match[5]),
    }];
  });

  return {
    key,
    loanId,
    generatedAt: generatedAt ? new Date(generatedAt).toISOString() : null,
    clientName: profileMatch?.[1]?.trim() || null,
    profile: profileMatch?.[2]?.trim().toLowerCase() || null,
    phone: contact?.[1] || null,
    cpf: contact?.[2]?.replace(/\D/g, "") || null,
    email,
    amount: money(financeValues[0]),
    interestAmount: money(financeValues[1]),
    totalAmount: money(financeValues[2]),
    totalPaid: money(paidValues[0]),
    remaining: money(paidValues[1]),
    paidInstallments: installmentProgress ? Number(installmentProgress[1]) : null,
    totalInstallments: installmentProgress ? Number(installmentProgress[2]) : installments.length || null,
    status: statusFromText(rawStatus),
    releaseDate: isoDate(dates[0]),
    dueDate: isoDate(dates[1]),
    paymentType,
    interestRate,
    installments,
  };
}

function parseReceipt(key: string, text: string) {
  const path = key.match(/^loan-receipts\/(\d+)\/(\d+)\/(\d+)\//);
  const client = text.match(/Cliente:\s*(.+)/i)?.[1]?.trim() || null;
  const cpf = text.match(/CPF:\s*([\d.-]{11,})/i)?.[1]?.replace(/\D/g, "") || null;
  const installment = text.match(/Parcela:\s*(\d+)\s+de\s+(\d+)/i);
  const amount = text.match(/(?:Valor Total Pago|Valor Pago|Total Cobrado):\s*R\$\s*([\d.,]+)/i)?.[1];
  const paidAt = text.match(/Data do Pagamento:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
  return {
    key,
    clientId: number(path?.[1]),
    loanId: number(path?.[2]),
    installmentId: number(path?.[3]),
    clientName: client,
    cpf,
    installmentNumber: number(installment?.[1]),
    totalInstallments: number(installment?.[2]),
    amountPaid: money(amount),
    paidAt: isoDate(paidAt),
  };
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [[currentRaw], statementKeys, receiptKeys, clientProofKeys, adminProofKeys] = await Promise.all([
      db.query(`SELECT l.*, lc.name clientName, lc.phone clientPhone, lc.cpf clientCpf
        FROM loans l LEFT JOIN loanClients lc ON lc.id=l.clientId ORDER BY l.id`),
      r2ListObjects("loan-statements/"),
      r2ListObjects("loan-receipts/"),
      r2ListObjects("loan-proofs/"),
      r2ListObjects("loan-admin-proofs/"),
    ]);
    const current = Array.isArray(currentRaw) ? currentRaw as Row[] : [];

    const statements = [] as ReturnType<typeof parseStatement>[];
    for (const key of statementKeys.filter((item) => /\.pdf$/i.test(item))) {
      statements.push(parseStatement(key, await pdfText(key)));
    }

    const receipts = [] as ReturnType<typeof parseReceipt>[];
    for (const key of receiptKeys.filter((item) => /\.pdf$/i.test(item))) {
      receipts.push(parseReceipt(key, await pdfText(key)));
    }

    const loanIds = unique([
      ...current.map((row) => number(row.id)),
      ...statements.map((row) => row.loanId),
      ...receipts.map((row) => row.loanId),
    ].filter((value): value is number => !!value)).sort((a, b) => a - b);

    const report = loanIds.map((loanId) => {
      const currentLoan = current.find((row) => number(row.id) === loanId);
      const snapshots = statements.filter((row) => row.loanId === loanId).sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt)));
      const latest = snapshots.at(-1) || null;
      const loanReceipts = receipts.filter((row) => row.loanId === loanId);
      const uniquePaidInstallments = unique(loanReceipts.map((row) => row.installmentId).filter((value): value is number => !!value));
      const totalInstallments = latest?.totalInstallments || loanReceipts.find((row) => row.totalInstallments)?.totalInstallments || null;
      const paidFromSnapshot = latest?.paidInstallments || 0;
      const paidConfirmed = Math.max(paidFromSnapshot, uniquePaidInstallments.length);
      const finalByDocuments = !!totalInstallments && paidConfirmed >= totalInstallments;
      return {
        loanId,
        existsInDatabase: !!currentLoan,
        currentStatus: currentLoan?.status || null,
        client: latest ? { name: latest.clientName, phone: latest.phone, cpf: latest.cpf } : {
          name: currentLoan?.clientName || loanReceipts[0]?.clientName || null,
          phone: currentLoan?.clientPhone || null,
          cpf: currentLoan?.clientCpf || loanReceipts[0]?.cpf || null,
        },
        latestStatement: latest,
        statementSnapshots: snapshots.length,
        receiptInstallments: uniquePaidInstallments,
        receiptCount: loanReceipts.length,
        receiptDetails: latest ? undefined : loanReceipts,
        paidConfirmed,
        totalInstallments,
        finalByDocuments,
        requiresStatusCorrection: finalByDocuments && currentLoan?.status !== "pago",
      };
    });

    const fullReport = {
      databaseLoans: current.length,
      statementPdfs: statements.length,
      receiptPdfs: receipts.length,
      clientProofFiles: clientProofKeys.length,
      adminProofFiles: adminProofKeys.length,
      loans: report,
    };
    writeFileSync("/tmp/loan-recovery-analysis.json", JSON.stringify(fullReport, null, 2), "utf8");

    console.log("ANALISE COMPLETA DE EMPRESTIMOS E PAGAMENTOS", {
      databaseLoans: current.length,
      statementPdfs: statements.length,
      receiptPdfs: receipts.length,
      clientProofFiles: clientProofKeys.length,
      adminProofFiles: adminProofKeys.length,
    });
    console.table(report.map((row) => ({
      id: row.loanId,
      noBanco: row.existsInDatabase ? "SIM" : "NAO",
      statusBanco: row.currentStatus,
      statusExtrato: row.latestStatement?.status || null,
      pagas: `${row.paidConfirmed}/${row.totalInstallments || "?"}`,
      finalizado: row.finalByDocuments ? "SIM" : "NAO",
      recibos: row.receiptCount,
      cliente: row.client?.name || "",
    })));
    console.log("EMPRESTIMOS SEM EXTRATO — DADOS DOS RECIBOS", report
      .filter((row) => !row.latestStatement && row.receiptCount > 0)
      .map((row) => ({ loanId: row.loanId, client: row.client, receipts: row.receiptDetails })));
    console.log("Relatorio completo salvo em /tmp/loan-recovery-analysis.json");
    console.log("MODO ANALISE: nenhum dado foi alterado");
  } finally {
    await db.end();
  }
}

main().then(() => process.exit()).catch((error) => {
  console.error("FALHA NA ANALISE DOS EMPRESTIMOS", error);
  process.exit(1);
});
