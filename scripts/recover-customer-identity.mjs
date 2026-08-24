import { createConnection } from "mysql2/promise";

const apply = process.argv.includes("--apply");
const digits = value => String(value ?? "").replace(/\D/g, "");
const phoneKey = value => {
  const valueDigits = digits(value);
  if (valueDigits.length < 10) return "";
  return valueDigits.slice(-11);
};
const normalizeEmail = value => String(value ?? "").trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.endsWith("@example.com");

function validCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let size = 9; size <= 10; size += 1) {
    let sum = 0;
    for (let index = 0; index < size; index += 1) sum += Number(cpf[index]) * (size + 1 - index);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(cpf[size])) return false;
  }
  return true;
}

const quoteId = value => `\`${String(value).replace(/`/g, "``")}\``;
const candidates = new Map();
const sourceStats = new Map();

function addCandidate(phone, kind, rawValue, source) {
  const key = phoneKey(phone);
  if (!key) return;
  const value = kind === "email" ? normalizeEmail(rawValue) : digits(rawValue);
  if (kind === "email" ? !validEmail(value) : !validCpf(value)) return;
  if (!candidates.has(key)) candidates.set(key, { email: new Map(), cpf: new Map() });
  const values = candidates.get(key)[kind];
  if (!values.has(value)) values.set(value, new Set());
  values.get(value).add(source);
  sourceStats.set(source, (sourceStats.get(source) ?? 0) + 1);
}

function walkIdentity(value, phone, source, keyName = "") {
  if (Array.isArray(value)) {
    for (const item of value) walkIdentity(item, phone, source, keyName);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walkIdentity(item, phone, source, key);
    return;
  }
  const key = String(keyName).toLowerCase();
  if (key.includes("email")) addCandidate(phone, "email", value, source);
  if (key.includes("cpf")) addCandidate(phone, "cpf", value, source);
}

function parseStructured(raw, phone, source) {
  const text = String(raw ?? "").trim();
  if (!text) return;
  try {
    walkIdentity(JSON.parse(text), phone, source);
  } catch {
    for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
      addCandidate(phone, "email", match[0], source);
    }
    for (const match of text.matchAll(/cpf\D{0,40}([0-9.\/-]{11,18})/gi)) {
      addCandidate(phone, "cpf", match[1], source);
    }
  }
}

function preferredPhoneColumn(columns) {
  const names = columns.map(column => column.COLUMN_NAME);
  const priorities = [
    "customerPhone", "phone", "visitorPhone", "clientPhone", "phoneNormalized",
    "whatsapp", "telefone", "celular", "loginPhone",
  ];
  return priorities.find(name => names.some(value => value.toLowerCase() === name.toLowerCase())) ?? null;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [columnRows] = await db.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE()
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    );
    const tables = new Map();
    for (const column of columnRows) {
      if (!tables.has(column.TABLE_NAME)) tables.set(column.TABLE_NAME, []);
      tables.get(column.TABLE_NAME).push(column);
    }

    for (const [table, columns] of tables) {
      if (/^customers(?:_|$)/i.test(table)) continue;
      const phoneColumn = preferredPhoneColumn(columns);
      if (!phoneColumn) continue;
      const emailColumns = columns
        .map(column => column.COLUMN_NAME)
        .filter(name => /email$/i.test(name) && !/(link|sent|notified)/i.test(name));
      const cpfColumns = columns.map(column => column.COLUMN_NAME).filter(name => /cpf/i.test(name));
      const structuredColumns = columns
        .filter(column => /^(answers|data|formData|responses|payload)$/i.test(column.COLUMN_NAME))
        .filter(column => /text|json|char/i.test(column.DATA_TYPE))
        .map(column => column.COLUMN_NAME);
      const wanted = [...new Set([phoneColumn, ...emailColumns, ...cpfColumns, ...structuredColumns])];
      if (wanted.length === 1) continue;
      const [rows] = await db.query(
        `SELECT ${wanted.map(quoteId).join(",")} FROM ${quoteId(table)} WHERE ${quoteId(phoneColumn)} IS NOT NULL`,
      );
      for (const row of rows) {
        const phone = row[phoneColumn];
        for (const column of emailColumns) addCandidate(phone, "email", row[column], `${table}.${column}`);
        for (const column of cpfColumns) addCandidate(phone, "cpf", row[column], `${table}.${column}`);
        for (const column of structuredColumns) parseStructured(row[column], phone, `${table}.${column}`);
      }
    }

    const [customers] = await db.query(
      "SELECT id,phone,email,cpf FROM customers WHERE deletedAt IS NULL ORDER BY id",
    );
    const changes = [];
    let emailConflicts = 0;
    let cpfConflicts = 0;
    let missingEmail = 0;
    let missingCpf = 0;

    for (const customer of customers) {
      const currentEmail = normalizeEmail(customer.email);
      const currentCpf = digits(customer.cpf);
      if (!validEmail(currentEmail)) missingEmail += 1;
      if (!validCpf(currentCpf)) missingCpf += 1;
      const found = candidates.get(phoneKey(customer.phone));
      if (!found) continue;
      const emails = [...found.email.keys()];
      const cpfs = [...found.cpf.keys()];
      const email = !validEmail(currentEmail) && emails.length === 1 ? emails[0] : null;
      const cpf = !validCpf(currentCpf) && cpfs.length === 1 ? cpfs[0] : null;
      if (!validEmail(currentEmail) && emails.length > 1) emailConflicts += 1;
      if (!validCpf(currentCpf) && cpfs.length > 1) cpfConflicts += 1;
      if (email || cpf) changes.push({ id: customer.id, email, cpf });
    }

    const emailRecoverable = changes.filter(change => change.email).length;
    const cpfRecoverable = changes.filter(change => change.cpf).length;
    console.log("VARREDURA CPF E EMAIL", {
      clientes: customers.length,
      faltamEmail: missingEmail,
      faltamCpf: missingCpf,
      emailsRecuperaveis: emailRecoverable,
      cpfsRecuperaveis: cpfRecoverable,
      conflitosEmail: emailConflicts,
      conflitosCpf: cpfConflicts,
      clientesComAlgumaRecuperacao: changes.length,
    });
    console.log("FONTES ENCONTRADAS", Object.fromEntries([...sourceStats].sort()));

    if (!apply) {
      console.log("MODO VARREDURA: nenhum dado foi alterado");
      console.log("Para aplicar depois: node scripts/recover-customer-identity.mjs --apply");
      return;
    }

    await db.query("CREATE TABLE IF NOT EXISTS customers_identity_backup_20260824 LIKE customers");
    await db.query("INSERT IGNORE INTO customers_identity_backup_20260824 SELECT * FROM customers");
    await db.beginTransaction();
    let emailsUpdated = 0;
    let cpfsUpdated = 0;
    try {
      for (const change of changes) {
        if (change.email) {
          const [result] = await db.execute(
            "UPDATE customers SET email=? WHERE id=? AND (email IS NULL OR TRIM(email)='')",
            [change.email, change.id],
          );
          emailsUpdated += result.affectedRows;
        }
        if (change.cpf) {
          const [result] = await db.execute(
            "UPDATE customers SET cpf=? WHERE id=? AND (cpf IS NULL OR TRIM(cpf)='')",
            [change.cpf, change.id],
          );
          cpfsUpdated += result.affectedRows;
        }
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
    console.log("RECUPERACAO CONCLUIDA", { emailsUpdated, cpfsUpdated });
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("FALHA NA RECUPERACAO", error);
  process.exit(1);
});
