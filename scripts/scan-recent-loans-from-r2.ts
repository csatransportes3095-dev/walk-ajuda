import { createConnection } from "mysql2/promise";
import { r2ListObjects } from "../server/r2Storage";

type Row = Record<string, any>;

const PREFIXES = [
  "loan-proofs/",
  "loan-admin-proofs/",
  "loan-receipts/",
  "loan-statements/",
] as const;

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dateFromMillis(value: unknown): string | null {
  const parsed = number(value);
  if (!parsed || parsed < 1_500_000_000_000 || parsed > 2_500_000_000_000) return null;
  return new Date(parsed).toISOString();
}

function parseKey(key: string) {
  let match = key.match(/^loan-proofs\/(\d+)\/(\d+)-(\d+)-/);
  if (match) {
    return {
      source: "client-proof",
      key,
      clientId: number(match[1]),
      loanId: null,
      installmentId: number(match[2]),
      occurredAt: dateFromMillis(match[3]),
    };
  }

  match = key.match(/^loan-admin-proofs\/(\d+)\/(\d+)\/(\d+)\/(\d+)-/);
  if (match) {
    return {
      source: "admin-proof",
      key,
      clientId: number(match[1]),
      loanId: number(match[2]),
      installmentId: number(match[3]),
      occurredAt: dateFromMillis(match[4]),
    };
  }

  match = key.match(/^loan-receipts\/(\d+)\/(\d+)\/(\d+)\//);
  if (match) {
    return {
      source: "receipt",
      key,
      clientId: number(match[1]),
      loanId: number(match[2]),
      installmentId: number(match[3]),
      occurredAt: null,
    };
  }

  match = key.match(/^loan-statements\/(\d+)-(\d+)\.pdf$/i);
  if (match) {
    return {
      source: "statement",
      key,
      clientId: null,
      loanId: number(match[1]),
      installmentId: null,
      occurredAt: dateFromMillis(match[2]),
    };
  }

  return {
    source: "unparsed",
    key,
    clientId: null,
    loanId: null,
    installmentId: null,
    occurredAt: null,
  };
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)))].sort((a, b) => a - b);
}

async function tableExists(db: any, table: string) {
  const [rows] = await db.query("SHOW TABLES LIKE ?", [table]);
  return Array.isArray(rows) && rows.length > 0;
}

async function selectIfExists(db: any, table: string, sql: string): Promise<Row[]> {
  if (!(await tableExists(db, table))) return [];
  const [rows] = await db.query(sql);
  return Array.isArray(rows) ? rows as Row[] : [];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");

  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [loanRows, installmentRows, clientRows, keyGroups] = await Promise.all([
      selectIfExists(db, "loans", "SELECT * FROM loans ORDER BY id"),
      selectIfExists(db, "loanInstallments", "SELECT * FROM loanInstallments ORDER BY id"),
      selectIfExists(db, "loanClients", "SELECT * FROM loanClients ORDER BY id"),
      Promise.all(PREFIXES.map((prefix) => r2ListObjects(prefix))),
    ]);

    const evidence = keyGroups.flat().map(parseKey);
    const loanIds = new Set(uniqueNumbers(loanRows.map((row) => number(row.id))));
    const installmentIds = new Set(uniqueNumbers(installmentRows.map((row) => number(row.id))));
    const clientIds = new Set(uniqueNumbers(clientRows.map((row) => number(row.id))));

    const evidenceLoanIds = uniqueNumbers(evidence.map((item) => item.loanId));
    const evidenceInstallmentIds = uniqueNumbers(evidence.map((item) => item.installmentId));
    const evidenceClientIds = uniqueNumbers(evidence.map((item) => item.clientId));
    const missingLoanIds = evidenceLoanIds.filter((id) => !loanIds.has(id));
    const missingInstallmentIds = evidenceInstallmentIds.filter((id) => !installmentIds.has(id));
    const missingClientIds = evidenceClientIds.filter((id) => !clientIds.has(id));

    const candidates = missingLoanIds.map((id) => {
      const matches = evidence.filter((item) => item.loanId === id);
      return {
        loanId: id,
        clientIds: uniqueNumbers(matches.map((item) => item.clientId)),
        installmentIds: uniqueNumbers(matches.map((item) => item.installmentId)),
        evidence: matches.length,
        sources: countBy(matches, (item) => item.source),
        firstEvidence: matches.map((item) => item.occurredAt).filter(Boolean).sort()[0] || null,
        lastEvidence: matches.map((item) => item.occurredAt).filter(Boolean).sort().at(-1) || null,
      };
    });

    const loanDates = loanRows.flatMap((row) => [row.createdAt, row.updatedAt, row.releaseDate, row.dueDate])
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);

    console.log("VARREDURA SEGURA DOS EMPRESTIMOS", {
      bancoAtual: {
        clientes: clientRows.length,
        emprestimos: loanRows.length,
        parcelas: installmentRows.length,
        statusEmprestimos: countBy(loanRows, (row) => String(row.status || "sem_status")),
        statusParcelas: countBy(installmentRows, (row) => String(row.status || "sem_status")),
        primeiraData: loanDates.length ? new Date(Math.min(...loanDates)).toISOString() : null,
        ultimaData: loanDates.length ? new Date(Math.max(...loanDates)).toISOString() : null,
      },
      arquivosR2: Object.fromEntries(PREFIXES.map((prefix, index) => [prefix, keyGroups[index].length])),
      evidenciasPorData: countBy(
        evidence.filter((item) => item.occurredAt),
        (item) => String(item.occurredAt).slice(0, 10),
      ),
      referenciasR2: {
        clientes: evidenceClientIds.length,
        emprestimos: evidenceLoanIds.length,
        parcelas: evidenceInstallmentIds.length,
      },
      faltandoNoBanco: {
        clientes: missingClientIds.length,
        emprestimos: missingLoanIds.length,
        parcelas: missingInstallmentIds.length,
      },
    });

    console.log("EMPRESTIMOS AUSENTES IDENTIFICADOS", candidates);
    console.log("IDS DE CLIENTES AUSENTES", missingClientIds);
    console.log("IDS DE PARCELAS AUSENTES", missingInstallmentIds);
    console.log("MODO VARREDURA: nenhum dado foi alterado");
  } finally {
    await db.end();
  }
}

main().then(() => process.exit()).catch((error) => {
  console.error("FALHA NA VARREDURA DOS EMPRESTIMOS", error);
  process.exit(1);
});
