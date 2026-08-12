import { sql } from "drizzle-orm";
import { getDb } from "../server/db";

function rows(result: any): any[] {
  return (result?.[0] || result || []) as any[];
}

function mask(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

const db = await getDb() as any;
if (!db) throw new Error("Banco indisponível para auditoria");

const customers = rows(await db.execute(sql`
  SELECT id, customerNumber, name, phone, normalizedPhone, cpf, normalizedCpf
  FROM customers
  WHERE customerNumber = 381 OR UPPER(name) = 'ADM'
  ORDER BY id DESC
`)).map((row) => ({
  id: row.id,
  customerNumber: row.customerNumber,
  name: row.name,
  phone: mask(row.phone),
  normalizedPhone: mask(row.normalizedPhone),
  cpf: mask(row.cpf),
  normalizedCpf: mask(row.normalizedCpf),
}));

const orderHistory = rows(await db.execute(sql`
  SELECT id, registrationId, orderNumber, customerPhone, status, createdAt
  FROM orderStatusHistory
  WHERE orderNumber = 5590000
  ORDER BY id ASC
`)).map((row) => ({
  id: row.id,
  registrationId: row.registrationId,
  orderNumber: row.orderNumber,
  customerPhone: mask(row.customerPhone),
  status: row.status,
  createdAt: row.createdAt,
}));

const registrationIds = orderHistory.map((row) => Number(row.registrationId)).filter(Boolean);
const accessRows = registrationIds.length
  ? rows(await db.execute(sql.raw(`SELECT id, phone, accessedAt, archived, deletedAt FROM accessCodePhones WHERE id IN (${registrationIds.join(",")})`))).map((row) => ({
      id: row.id,
      phone: mask(row.phone),
      accessedAt: row.accessedAt,
      archived: row.archived,
      deletedAt: row.deletedAt,
    }))
  : [];

console.log(JSON.stringify({ customers, orderHistory, accessRows }, null, 2));
