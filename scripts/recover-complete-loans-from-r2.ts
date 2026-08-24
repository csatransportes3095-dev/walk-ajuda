import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "mysql2/promise";
import { buildR2PublicUrl, r2ListObjects } from "../server/r2Storage";

type Row = Record<string, any>;
type Db = Awaited<ReturnType<typeof createConnection>>;

const APPLY = process.argv.includes("--apply");
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const BACKUP_SUFFIX = "backup_complete_20260824";

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const blank = (value: unknown) => value == null || String(value).trim() === "";
const money = (value: string | undefined | null) => {
  if (!value) return null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const isoDate = (value: string | undefined | null) => {
  const match = value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};
const dateMs = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1_500_000_000_000 && parsed < 2_500_000_000_000 ? parsed : null;
};
const sqlDate = (value: unknown) => value ? String(value).slice(0, 10) : null;
const samePhone = (a: unknown, b: unknown) => {
  const x = digits(a).slice(-11), y = digits(b).slice(-11);
  return x.length >= 10 && y.length >= 10 && x === y;
};
const sameIdentity = (a: Row, b: Row) => {
  const ac = digits(a.cpf), bc = digits(b.cpf);
  if (ac.length === 11 && ac === bc) return true;
  return samePhone(a.phone, b.phone);
};
const unique = <T>(items: T[]) => [...new Set(items)];

function statusFromText(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (/pago|quitado|finalizado/.test(text)) return "pago";
  if (/reprov/.test(text)) return "reprovado";
  if (/cancel/.test(text)) return "cancelado";
  if (/atras/.test(text)) return "atrasado";
  if (/análise|analise/.test(text)) return "em_analise";
  if (/aprovado/.test(text)) return "aprovado";
  if (/aguardando|pendente/.test(text)) return "pendente";
  return null;
}

function paymentType(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (text.includes("quinzen")) return "quinzenal";
  if (text.includes("seman")) return "semanal";
  if (text.includes("diár") || text.includes("diar")) return "diario";
  if (text.includes("parcel")) return "parcelado";
  return "mensal";
}

async function pdfText(key: string) {
  const response = await fetch(buildR2PublicUrl(key));
  if (!response.ok) throw new Error(`R2 ${response.status}: ${key}`);
  const dir = mkdtempSync(join(tmpdir(), "loan-full-recovery-"));
  const pdf = join(dir, "document.pdf");
  try {
    writeFileSync(pdf, Buffer.from(await response.arrayBuffer()));
    return execFileSync("pdftotext", ["-layout", pdf, "-"], {
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
    }).replace(/\u00a0/g, " ").replace(/\r/g, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStatement(key: string, text: string) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const loanId = n(key.match(/^loan-statements\/(\d+)-/)?.[1]);
  const generatedMs = dateMs(key.match(/-(\d+)\.pdf$/i)?.[1]);
  const profileLine = lines.find(line => line.includes("★"));
  const profileMatch = profileLine?.match(/^(.*?)\s+★\s+(.+)$/);
  const profileText = profileMatch?.[2] || "";
  const profile = profileText.match(/bronze|prata|ouro|personalizado/i)?.[0]?.toLowerCase() || null;
  const creditLimit = money(profileText.match(/limite\s*R\$\s*([\d.,]+)/i)?.[1]);
  const contactLine = lines.find(line => /\d{10,13}\s+CPF:/i.test(line));
  const contact = contactLine?.match(/(\d{10,13})\s+CPF:\s*([\d.-]{11,})/i);
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || null;

  const financeIndex = lines.findIndex(line => line.includes("VALOR SOLICITADO") && line.includes("TOTAL C/ JUROS"));
  let financeValues: string[] = [];
  for (let i = financeIndex + 1; i >= 0 && i < Math.min(lines.length, financeIndex + 8); i++) {
    const values = [...lines[i].matchAll(/R\$\s*([\d.,]+)/g)].map(match => match[1]);
    if (values.length >= 3) { financeValues = values; break; }
  }

  const paidIndex = lines.findIndex(line => line.includes("TOTAL PAGO") && line.includes("SALDO RESTANTE"));
  let paidValues: string[] = [];
  let progress: RegExpMatchArray | null = null;
  for (let i = paidIndex + 1; i >= 0 && i < Math.min(lines.length, paidIndex + 8); i++) {
    const values = [...lines[i].matchAll(/R\$\s*([\d.,]+)/g)].map(match => match[1]);
    if (values.length >= 2) paidValues = values;
    progress ||= lines[i].match(/(\d+)\s*\/\s*(\d+)/);
  }

  const detailsLine = lines.find(line => line.includes("#EMP-") && line.includes("Status"));
  const rawStatus = detailsLine?.split(/Status/i)[1]?.trim() || "";
  const datesLine = lines.find(line => line.includes("Data de Liberação") && line.includes("Data de Vencimento"));
  const dates = datesLine ? [...datesLine.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map(match => match[0]) : [];
  const payLine = lines.find(line => line.includes("Tipo de Pagamento") && line.includes("Taxa de Juros"));
  const payType = payLine?.replace(/^.*Tipo de Pagamento\s*/i, "").replace(/Taxa de Juros.*$/i, "").trim() || null;
  const interestRate = Number(text.match(/JUROS\s*\(([\d.,]+)%\)/i)?.[1]?.replace(",", ".") || 0) || null;
  const installments = lines.flatMap(line => {
    const match = line.match(/^(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+R\$\s*([\d.,]+)\s+(?:(\d{2}\/\d{2}\/\d{4})|[^\d]+)\s+(Pago(?: de Juros)?|Pendente|Em Análise|Atrasado)/i);
    if (!match) return [];
    return [{
      installmentNumber: Number(match[1]),
      dueDate: isoDate(match[2]),
      amount: money(match[3]),
      paidAt: isoDate(match[4]),
      status: statusFromText(match[5]),
    }];
  });

  return {
    key, loanId,
    generatedAt: generatedMs ? new Date(generatedMs).toISOString() : null,
    clientName: profileMatch?.[1]?.trim() || null,
    profile, creditLimit,
    phone: contact?.[1] || null,
    cpf: contact?.[2]?.replace(/\D/g, "") || null,
    email,
    amount: money(financeValues[0]),
    interestAmount: money(financeValues[1]),
    totalAmount: money(financeValues[2]),
    totalPaid: money(paidValues[0]),
    remaining: money(paidValues[1]),
    paidInstallments: progress ? Number(progress[1]) : null,
    totalInstallments: progress ? Number(progress[2]) : installments.length || null,
    status: statusFromText(rawStatus),
    releaseDate: isoDate(dates[0]), dueDate: isoDate(dates[1]),
    paymentType: paymentType(payType), interestRate, installments,
  };
}

function parseReceipt(key: string, text: string) {
  const path = key.match(/^loan-receipts\/(\d+)\/(\d+)\/(\d+)\//);
  const installment = text.match(/Parcela:\s*(\d+)\s+de\s+(\d+)/i);
  const amount = text.match(/(?:Valor Total Pago|Valor Pago|Total Cobrado):\s*R\$\s*([\d.,]+)/i)?.[1];
  const paidAt = text.match(/Data do Pagamento:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
  const phone = text.match(/(?:Telefone|WhatsApp):\s*([+()\d\s-]{10,})/i)?.[1];
  const totalLoan = text.match(/(?:Total (?:do )?Empréstimo|Total c\/ Juros):\s*R\$\s*([\d.,]+)/i)?.[1];
  const principal = text.match(/(?:Valor (?:do )?Empréstimo|Valor Solicitado):\s*R\$\s*([\d.,]+)/i)?.[1];
  return {
    key,
    clientId: n(path?.[1]), loanId: n(path?.[2]), installmentId: n(path?.[3]),
    clientName: text.match(/Cliente:\s*(.+)/i)?.[1]?.trim() || null,
    phone: phone ? digits(phone) : null,
    cpf: text.match(/CPF:\s*([\d.-]{11,})/i)?.[1]?.replace(/\D/g, "") || null,
    email: text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || null,
    installmentNumber: n(installment?.[1]), totalInstallments: n(installment?.[2]),
    amountPaid: money(amount), paidAt: isoDate(paidAt),
    amount: money(principal), totalAmount: money(totalLoan),
  };
}

function parseProofKey(key: string) {
  let match = key.match(/^loan-admin-proofs\/(\d+)\/(\d+)\/(\d+)\/(\d+)-/);
  if (match) return { key, source: "admin", clientId: n(match[1]), loanId: n(match[2]), installmentId: n(match[3]), occurredAt: dateMs(match[4]) };
  match = key.match(/^loan-proofs\/(\d+)\/(\d+)-(\d+)-/);
  if (match) return { key, source: "client", clientId: n(match[1]), loanId: null, installmentId: n(match[2]), occurredAt: dateMs(match[3]) };
  return null;
}

async function rows(db: Db, query: string, params: any[] = []) {
  const [result] = await db.query(query, params);
  return Array.isArray(result) ? result as Row[] : [];
}

async function columns(db: Db, table: string) {
  return new Set((await rows(db, `SHOW COLUMNS FROM \`${table}\``)).map(row => String(row.Field)));
}

async function insertDynamic(db: Db, table: string, data: Row, tableColumns: Set<string>) {
  const names = Object.keys(data).filter(name => tableColumns.has(name) && data[name] !== undefined);
  const sql = `INSERT INTO \`${table}\` (${names.map(name => `\`${name}\``).join(",")}) VALUES (${names.map(() => "?").join(",")})`;
  const [result] = await db.execute(sql, names.map(name => data[name]));
  return Number((result as any).insertId || data.id || 0);
}

async function updateDynamic(db: Db, table: string, id: number, data: Row, tableColumns: Set<string>) {
  const names = Object.keys(data).filter(name => tableColumns.has(name) && data[name] !== undefined);
  if (!names.length) return;
  await db.execute(`UPDATE \`${table}\` SET ${names.map(name => `\`${name}\`=?`).join(",")}${tableColumns.has("updatedAt") ? ",`updatedAt`=NOW()" : ""} WHERE id=?`, [...names.map(name => data[name]), id]);
}

async function backup(db: Db) {
  for (const table of ["loanClients", "loans", "loanInstallments", "installmentProofs", "installmentProofLogs"]) {
    const exists = await rows(db, "SHOW TABLES LIKE ?", [table]);
    if (!exists.length) continue;
    const target = `${table}_${BACKUP_SUFFIX}`;
    await db.query(`CREATE TABLE IF NOT EXISTS \`${target}\` LIKE \`${table}\``);
    await db.query(`INSERT IGNORE INTO \`${target}\` SELECT * FROM \`${table}\``);
  }
}

function profileDefaults(slug: string | null) {
  if (slug === "prata") return { creditLimit: 1000, interestRate: 35 };
  if (slug === "ouro") return { creditLimit: 2000, interestRate: 30 };
  if (slug === "personalizado") return { creditLimit: 150, interestRate: 40 };
  return { creditLimit: 300, interestRate: 40 };
}

function choosePix(rowsForPerson: Row[]) {
  const get = (row: Row, keys: string[]) => {
    for (const key of keys) if (!blank(row[key])) return String(row[key]).trim();
    return "";
  };
  const sorted = [...rowsForPerson].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const source = sorted.find(row => get(row, ["client_pix_key", "clientPixKey", "pixKey", "pix_key", "pix"])) || null;
  if (!source) return null;
  const key = get(source, ["client_pix_key", "clientPixKey", "pixKey", "pix_key", "pix"]);
  const name = get(source, ["client_pix_name", "clientPixName", "pixName", "pix_name", "titularPix", "pixHolderName"]);
  const bank = get(source, ["client_pix_bank", "clientPixBank", "pixBank", "pix_bank", "bankName"]);
  let type = get(source, ["pixKeyType", "pix_key_type"]);
  if (!type) {
    const d = digits(key);
    type = key.includes("@") ? "email" : d.length === 11 ? (d === digits(source.cpf) ? "cpf" : "telefone") : d.length === 14 ? "cnpj" : "aleatoria";
  }
  return { key, name, bank, type };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [statementKeys, receiptKeys, clientProofKeys, adminProofKeys] = await Promise.all([
      r2ListObjects("loan-statements/"), r2ListObjects("loan-receipts/"),
      r2ListObjects("loan-proofs/"), r2ListObjects("loan-admin-proofs/"),
    ]);
    const statements = [] as ReturnType<typeof parseStatement>[];
    for (const key of statementKeys.filter(key => /\.pdf$/i.test(key))) statements.push(parseStatement(key, await pdfText(key)));
    const receipts = [] as ReturnType<typeof parseReceipt>[];
    for (const key of receiptKeys.filter(key => /\.pdf$/i.test(key))) receipts.push(parseReceipt(key, await pdfText(key)));
    const proofs = [...clientProofKeys, ...adminProofKeys].map(parseProofKey).filter(Boolean) as NonNullable<ReturnType<typeof parseProofKey>>[];

    const loanCols = await columns(db, "loans");
    const clientCols = await columns(db, "loanClients");
    const installmentCols = await columns(db, "loanInstallments");
    const proofCols = await columns(db, "installmentProofs");
    const customerCols = await columns(db, "customers");
    const hasProofLogTable = (await rows(db, "SHOW TABLES LIKE 'installmentProofLogs'")).length > 0;
    const currentLoans = await rows(db, "SELECT * FROM loans ORDER BY id");
    const currentClients = await rows(db, "SELECT * FROM loanClients ORDER BY id");
    const currentInstallments = await rows(db, "SELECT * FROM loanInstallments ORDER BY id");
    const customers = await rows(db, "SELECT * FROM customers WHERE deletedAt IS NULL");
    const spreadsheet = (await rows(db, "SHOW TABLES LIKE 'spreadsheetClients'")).length ? await rows(db, "SELECT * FROM spreadsheetClients") : [];

    const latestStatements = new Map<number, ReturnType<typeof parseStatement>>();
    for (const statement of statements) {
      if (!statement.loanId) continue;
      const current = latestStatements.get(statement.loanId);
      if (!current || String(current.generatedAt).localeCompare(String(statement.generatedAt)) < 0) latestStatements.set(statement.loanId, statement);
    }
    const loanIds = unique([
      ...currentLoans.map(row => n(row.id)), ...statements.map(row => row.loanId), ...receipts.map(row => row.loanId),
    ].filter((value): value is number => !!value)).sort((a, b) => a - b);

    const preview = loanIds.map(loanId => {
      const statement = latestStatements.get(loanId);
      const loanReceipts = receipts.filter(row => row.loanId === loanId);
      const current = currentLoans.find(row => Number(row.id) === loanId);
      const paidNumbers = unique(loanReceipts.map(row => row.installmentNumber).filter((value): value is number => !!value));
      const total = statement?.totalInstallments || loanReceipts.find(row => row.totalInstallments)?.totalInstallments || null;
      const paid = Math.max(statement?.paidInstallments || 0, paidNumbers.length);
      return { id: loanId, noBanco: !!current, statusBanco: current?.status || null, statusDocumento: statement?.status || null, pagas: `${paid}/${total || "?"}`, cliente: statement?.clientName || loanReceipts[0]?.clientName || "" };
    });
    console.log("PREVIA RECUPERACAO TOTAL", { contratos: loanIds.length, extratos: statements.length, recibos: receipts.length, comprovantes: proofs.length });
    console.table(preview);
    if (!APPLY) {
      console.log("MODO PREVIA: nenhum dado foi alterado");
      console.log("Para aplicar: pnpm exec tsx scripts/recover-complete-loans-from-r2.ts --apply");
      return;
    }

    await backup(db);
    await db.beginTransaction();
    const summary = { clientesInseridos: 0, clientesAtualizados: 0, identidadesPrincipaisAtualizadas: 0, pixRecuperados: 0, pixAindaAusentes: 0, emprestimosInseridos: 0, emprestimosCorrigidos: 0, parcelasInseridas: 0, parcelasCorrigidas: 0, comprovantesLigados: 0 };
    try {
      const clientMap = new Map<number, number>();

      for (const loanId of loanIds) {
        const statement = latestStatements.get(loanId);
        const loanReceipts = receipts.filter(row => row.loanId === loanId);
        const existingLoan = currentLoans.find(row => Number(row.id) === loanId);
        const sourceClientId = loanReceipts.find(row => row.clientId)?.clientId || n(existingLoan?.clientId);
        const identity: Row = {
          name: statement?.clientName || loanReceipts[0]?.clientName || null,
          phone: statement?.phone || loanReceipts.find(row => row.phone)?.phone || null,
          cpf: statement?.cpf || loanReceipts.find(row => row.cpf)?.cpf || null,
          email: statement?.email || loanReceipts.find(row => row.email)?.email || null,
        };
        let client = currentClients.find(row => sourceClientId && Number(row.id) === sourceClientId)
          || currentClients.find(row => sameIdentity(row, identity));
        const main = customers.find(row => sameIdentity(row, identity));
        if (main) {
          identity.name ||= main.name; identity.phone ||= main.phone; identity.cpf ||= main.cpf; identity.email ||= main.email;
        }
        if (!client) client = currentClients.find(row => sameIdentity(row, identity));
        const profile = statement?.profile || client?.profileSlug || "bronze";
        const defaults = profileDefaults(profile);
        if (!client) {
          const desiredId = sourceClientId && !currentClients.some(row => Number(row.id) === sourceClientId) ? sourceClientId : undefined;
          const data: Row = { id: desiredId, userId: 1, name: identity.name || `CLIENTE EMPRESTIMO ${loanId}`, phone: digits(identity.phone) || null, cpf: digits(identity.cpf) || null, status: "ativo", profileSlug: profile, creditLimit: statement?.creditLimit || defaults.creditLimit, interestRate: statement?.interestRate || defaults.interestRate, maxDays: 90, loanEnabled: 1, notes: "Cadastro recuperado dos documentos de empréstimo no R2", createdAt: statement?.releaseDate || new Date(), updatedAt: new Date() };
          const id = await insertDynamic(db, "loanClients", data, clientCols);
          client = { ...data, id };
          currentClients.push(client); summary.clientesInseridos++;
        } else {
          const data: Row = { name: identity.name || client.name, phone: digits(identity.phone) || client.phone, cpf: digits(identity.cpf) || client.cpf, profileSlug: profile, creditLimit: statement?.creditLimit || client.creditLimit, interestRate: statement?.interestRate || client.interestRate, loanEnabled: 1 };
          await updateDynamic(db, "loanClients", Number(client.id), data, clientCols);
          Object.assign(client, data); summary.clientesAtualizados++;
        }
        if (sourceClientId) clientMap.set(sourceClientId, Number(client.id));
        clientMap.set(loanId, Number(client.id));

        const canonical = customers.find(row => sameIdentity(row, client!));
        if (canonical) {
          const update: Row = {};
          if (blank(canonical.name) && identity.name) update.name = identity.name;
          if (blank(canonical.phone) && identity.phone) update.phone = digits(identity.phone);
          if (blank(canonical.cpf) && identity.cpf) update.cpf = digits(identity.cpf);
          if (blank(canonical.email) && identity.email) update.email = identity.email;
          if (Object.keys(update).length) {
            await updateDynamic(db, "customers", Number(canonical.id), update, customerCols);
            Object.assign(canonical, update); summary.identidadesPrincipaisAtualizadas++;
          }
        }
      }

      // Recupera o PIX somente quando ele já existe em algum cadastro equivalente.
      for (const client of currentClients) {
        const related = [...currentClients, ...customers, ...spreadsheet].filter(row => sameIdentity(row, client));
        const pix = choosePix(related);
        if (!pix) { summary.pixAindaAusentes++; continue; }
        if (blank(client.client_pix_key) || blank(client.pixKey)) {
          await updateDynamic(db, "loanClients", Number(client.id), {
            client_pix_key: client.client_pix_key || pix.key,
            client_pix_name: client.client_pix_name || pix.name || client.name,
            client_pix_bank: client.client_pix_bank || pix.bank || null,
            pixKey: client.pixKey || pix.key,
            pixName: client.pixName || pix.name || client.name,
            pixKeyType: client.pixKeyType || pix.type,
          }, clientCols);
          summary.pixRecuperados++;
        }
      }

      for (const loanId of loanIds) {
        const statement = latestStatements.get(loanId);
        const loanReceipts = receipts.filter(row => row.loanId === loanId);
        let loan = currentLoans.find(row => Number(row.id) === loanId);
        const sourceClientId = loanReceipts.find(row => row.clientId)?.clientId || n(loan?.clientId);
        const clientId = clientMap.get(loanId) || (sourceClientId ? clientMap.get(sourceClientId) : null) || n(loan?.clientId);
        if (!clientId) { console.warn("IGNORADO SEM CLIENTE", loanId); continue; }
        const client = currentClients.find(row => Number(row.id) === clientId)!;
        const receiptTotal = loanReceipts.find(row => row.totalInstallments)?.totalInstallments || null;
        const count = statement?.totalInstallments || receiptTotal || n(loan?.installments) || 1;
        const installmentAmount = statement?.installments.find(row => row.amount)?.amount || loanReceipts.find(row => row.amountPaid)?.amountPaid || null;
        const inferredTotal = installmentAmount && count ? Math.round(installmentAmount * count * 100) / 100 : null;
        const rate = statement?.interestRate || n(loan?.interestRate) || n(client?.interestRate) || 0;
        const totalAmount = statement?.totalAmount || n(loan?.totalAmount) || loanReceipts.find(row => row.totalAmount)?.totalAmount || inferredTotal || 0;
        const amount = statement?.amount || n(loan?.amount) || loanReceipts.find(row => row.amount)?.amount || (rate ? Math.round(totalAmount / (1 + rate / 100) * 100) / 100 : totalAmount);
        const interestAmount = statement?.interestAmount ?? n(loan?.interestAmount) ?? Math.round((totalAmount - amount) * 100) / 100;
        const receiptDates = loanReceipts.map(row => row.paidAt).filter((value): value is string => !!value).sort();
        const releaseDate = statement?.releaseDate || sqlDate(loan?.releaseDate) || receiptDates[0] || TODAY;
        const dueDate = statement?.dueDate || sqlDate(loan?.dueDate) || receiptDates.at(-1) || releaseDate;
        const loanData: Row = {
          userId: loan?.userId || 1, clientId, amount, interestRate: rate,
          days: statement?.totalInstallments || n(loan?.days) || count,
          paymentType: statement?.paymentType || loan?.paymentType || "mensal",
          interestAmount, totalAmount, releaseDate, dueDate,
          status: statement?.status || loan?.status || "aprovado",
          installments: count,
          notes: loan?.notes || (!statement ? "Recuperado de recibos do R2; condições preservadas quando existentes." : "Recuperado do extrato do R2."),
          approvedBy: loan?.approvedBy || (statement?.status === "aprovado" ? "recuperacao-r2" : null),
          approvedAt: loan?.approvedAt || (statement?.status === "aprovado" ? statement.generatedAt : null),
        };
        if (!loan) {
          const id = await insertDynamic(db, "loans", { id: loanId, createdAt: statement?.releaseDate || receiptDates[0] || new Date(), updatedAt: new Date(), ...loanData }, loanCols);
          loan = { id, ...loanData }; currentLoans.push(loan); summary.emprestimosInseridos++;
        } else {
          // O documento é a fonte da verdade; corrige inclusive status antigo marcado indevidamente como pago.
          await updateDynamic(db, "loans", Number(loan.id), loanData, loanCols);
          Object.assign(loan, loanData); summary.emprestimosCorrigidos++;
        }

        let loanInstallments = currentInstallments.filter(row => Number(row.loanId) === Number(loan!.id));
        const receiptByNumber = new Map<number, ReturnType<typeof parseReceipt>>();
        for (const receipt of loanReceipts) if (receipt.installmentNumber) {
          const previous = receiptByNumber.get(receipt.installmentNumber);
          if (!previous || String(previous.paidAt).localeCompare(String(receipt.paidAt)) < 0) receiptByNumber.set(receipt.installmentNumber, receipt);
        }
        const schedule = statement?.installments.length ? statement.installments : Array.from({ length: count }, (_, index) => {
          const number = index + 1;
          const existing = loanInstallments.find(row => Number(row.installmentNumber) === number);
          const receipt = receiptByNumber.get(number);
          const status = receipt
            ? "pago"
            : receiptTotal
              ? "pendente"
              : existing?.status || "pendente";
          return { installmentNumber: number, dueDate: sqlDate(existing?.dueDate) || receipt?.paidAt || dueDate, amount: n(existing?.amount) || installmentAmount || Math.round(totalAmount / count * 100) / 100, paidAt: receipt?.paidAt || (status === "pago" ? sqlDate(existing?.paidAt) : null), status };
        });

        for (const item of schedule) {
          const receipt = receiptByNumber.get(item.installmentNumber);
          let status = receipt ? "pago" : item.status || "pendente";
          if (statement?.status === "pago") status = "pago";
          if (status === "pendente" && item.dueDate && item.dueDate < TODAY) status = "atrasado";
          let installment = loanInstallments.find(row => Number(row.installmentNumber) === item.installmentNumber);
          const proof = proofs.find(p => p.installmentId === Number(installment?.id))
            || proofs.find(p => p.loanId === loanId && p.installmentId === Number(installment?.id))
            || proofs.find(p => p.installmentId === receipt?.installmentId);
          const installmentData: Row = {
            loanId: Number(loan.id), installmentNumber: item.installmentNumber,
            dueDate: item.dueDate || dueDate, amount: item.amount || installmentAmount || Math.round(totalAmount / count * 100) / 100,
            status, paidAt: status === "pago" ? (receipt?.paidAt || item.paidAt || statement?.generatedAt || new Date()) : null,
            paidBy: status === "pago" ? "recuperacao-documentos-r2" : null,
            paidAmount: status === "pago" ? (receipt?.amountPaid || item.amount || installmentAmount) : null,
            proofUrl: proof ? buildR2PublicUrl(proof.key) : installment?.proofUrl || null,
            proofSentAt: proof?.occurredAt ? new Date(proof.occurredAt) : installment?.proofSentAt || null,
            notes: installment?.notes || "Parcela conferida na recuperação documental do R2",
          };
          if (!installment) {
            const desiredId = receipt?.installmentId && !currentInstallments.some(row => Number(row.id) === receipt.installmentId) ? receipt.installmentId : undefined;
            const id = await insertDynamic(db, "loanInstallments", { id: desiredId, createdAt: releaseDate, updatedAt: new Date(), ...installmentData }, installmentCols);
            installment = { id, ...installmentData }; currentInstallments.push(installment); loanInstallments.push(installment); summary.parcelasInseridas++;
          } else {
            await updateDynamic(db, "loanInstallments", Number(installment.id), installmentData, installmentCols);
            Object.assign(installment, installmentData); summary.parcelasCorrigidas++;
          }

          const receiptKey = receipt?.key;
          const fileKey = proof?.key || receiptKey;
          if (fileKey) {
            const existingProof = await rows(db, "SELECT id FROM installmentProofs WHERE installmentId=? LIMIT 1", [installment.id]);
            if (!existingProof.length) {
              await insertDynamic(db, "installmentProofs", {
                installmentId: installment.id, loanId: loan.id, clientId, installmentNumber: item.installmentNumber,
                amountPaid: receipt?.amountPaid || item.amount || 0, paidAt: receipt?.paidAt || item.paidAt || new Date(),
                paidBy: "recuperacao-documentos-r2", observation: receiptKey ? "Recibo recuperado do R2" : "Comprovante recuperado do R2",
                originalFileName: fileKey.split("/").at(-1), fileKey, fileUrl: buildR2PublicUrl(fileKey),
                fileMimeType: fileKey.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg", hasProof: 1,
                createdAt: new Date(), updatedAt: new Date(),
              }, proofCols);
              summary.comprovantesLigados++;
            }
          }
        }

        // Remove somente duplicatas/parcelas excedentes da recuperação, já preservadas no backup.
        if (count) {
          const duplicates = await rows(db, `SELECT id, installmentNumber FROM loanInstallments WHERE loanId=? ORDER BY installmentNumber,id`, [loan.id]);
          const seen = new Set<number>();
          for (const row of duplicates) {
            const number = Number(row.installmentNumber);
            if (number > count || seen.has(number)) {
              if (hasProofLogTable) await db.execute("DELETE FROM installmentProofLogs WHERE installmentId=?", [row.id]);
              await db.execute("DELETE FROM installmentProofs WHERE installmentId=?", [row.id]);
              await db.execute("DELETE FROM loanInstallments WHERE id=?", [row.id]);
            } else seen.add(number);
          }
        }

        const final = await rows(db, `SELECT COUNT(*) total, SUM(status='pago') paid, MAX(paidAt) paidAt, SUM(status IN ('em_analise','aguardando_confirmacao')) analysing, SUM(status IN ('pendente','atrasado') AND dueDate < ?) overdue FROM loanInstallments WHERE loanId=?`, [TODAY, loan.id]);
        const totals = final[0] || {};
        let finalStatus = String(loan.status || "aprovado");
        if (Number(totals.total) > 0 && Number(totals.paid) === Number(totals.total)) finalStatus = "pago";
        else if (statement || receiptTotal) {
          if (Number(totals.analysing) > 0) finalStatus = "aguardando_pagamento";
          else if (Number(totals.overdue) > 0) finalStatus = "atrasado";
          else finalStatus = statement?.status === "pendente" ? "pendente" : "aprovado";
        }
        await updateDynamic(db, "loans", Number(loan.id), { status: finalStatus, paidAt: finalStatus === "pago" ? totals.paidAt || statement?.generatedAt || new Date() : null, paidBy: finalStatus === "pago" ? "recuperacao-documentos-r2" : null }, loanCols);
      }

      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }

    const dashboard = (await rows(db, `SELECT COUNT(*) contratos, ROUND(COALESCE(SUM(amount),0),2) capitalHistorico, ROUND(COALESCE(SUM(totalAmount),0),2) totalComJuros, SUM(status='pago') finalizados, SUM(status NOT IN ('pago','cancelado','reprovado')) ativos FROM loans`))[0];
    const installments = (await rows(db, `SELECT COUNT(*) parcelas, SUM(status='pago') pagas, ROUND(COALESCE(SUM(CASE WHEN status='pago' THEN COALESCE(paidAmount,amount) ELSE 0 END),0),2) recebido, ROUND(COALESCE(SUM(CASE WHEN status NOT IN ('pago','pago_juros') THEN amount ELSE 0 END),0),2) aReceber FROM loanInstallments`))[0];
    console.log("RECUPERACAO COMPLETA CONCLUIDA", summary);
    console.log("CARTEIRA RECONSTRUIDA", dashboard);
    console.log("PARCELAS RECONSTRUIDAS", installments);
    console.log(`BACKUPS: loanClients_${BACKUP_SUFFIX}, loans_${BACKUP_SUFFIX}, loanInstallments_${BACKUP_SUFFIX}`);
  } finally {
    await db.end();
  }
}

main().then(() => process.exit()).catch(error => {
  console.error("FALHA NA RECUPERACAO COMPLETA", error);
  process.exit(1);
});
