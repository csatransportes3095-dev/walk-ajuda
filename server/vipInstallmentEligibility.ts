import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { isVipMemberByPhone } from "./routers/vipMemberships";
import { ensureVipInstallmentInfrastructure, getVipInstallmentConfig } from "./routers/vipInstallments";

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export function normalizeVipInstallmentPhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

export async function getVipInstallmentPermission(customerId: number) {
  await ensureVipInstallmentInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const row = rowsOf<any>(await db.execute(sql`
    SELECT id, customerId, enabled, maxInstallments, interestBps, creditLimitCents,
           allowDaily, allowWeekly, allowMonthly, notes
    FROM vipInstallmentPermissions
    WHERE customerId=${customerId}
    LIMIT 1
  `))[0];
  if (!row) {
    return {
      id: null,
      customerId,
      enabled: false,
      maxInstallments: null,
      interestBps: null,
      creditLimitCents: null,
      allowDaily: null,
      allowWeekly: null,
      allowMonthly: null,
      notes: null,
    };
  }
  return {
    id: Number(row.id),
    customerId: Number(row.customerId),
    enabled: Number(row.enabled) === 1,
    maxInstallments: row.maxInstallments == null ? null : Number(row.maxInstallments),
    interestBps: row.interestBps == null ? null : Number(row.interestBps),
    creditLimitCents: row.creditLimitCents == null ? null : Number(row.creditLimitCents),
    allowDaily: row.allowDaily == null ? null : Number(row.allowDaily) === 1,
    allowWeekly: row.allowWeekly == null ? null : Number(row.allowWeekly) === 1,
    allowMonthly: row.allowMonthly == null ? null : Number(row.allowMonthly) === 1,
    notes: row.notes == null ? null : String(row.notes),
  };
}

export async function getVipInstallmentOpenPlan(customerId: number) {
  await ensureVipInstallmentInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const row = rowsOf<any>(await db.execute(sql`
    SELECT id, orderNumber, productName, totalAmountCents, paidAmountCents, balanceCents,
           installmentCount, frequency, status, createdAt
    FROM vipInstallmentPlans
    WHERE openSlotCustomerId=${customerId}
    LIMIT 1
  `))[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    orderNumber: row.orderNumber == null ? null : String(row.orderNumber),
    productName: String(row.productName || ""),
    totalAmountCents: Number(row.totalAmountCents || 0),
    paidAmountCents: Number(row.paidAmountCents || 0),
    balanceCents: Number(row.balanceCents || 0),
    installmentCount: Number(row.installmentCount || 0),
    frequency: String(row.frequency || ""),
    status: String(row.status || ""),
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
  };
}

export async function resolveVipInstallmentEligibility(phoneValue: string) {
  await ensureVipInstallmentInfrastructure();
  const phone = normalizeVipInstallmentPhone(phoneValue);
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const customer = rowsOf<any>(await db.execute(sql`
    SELECT id, name, phone, customerNumber
    FROM customers
    WHERE deletedAt IS NULL
      AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '')=${phone}
    LIMIT 1
  `))[0];
  if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
  const normalizedCustomer = {
    id: Number(customer.id),
    name: String(customer.name || ""),
    phone: normalizeVipInstallmentPhone(customer.phone),
    customerNumber: customer.customerNumber == null ? null : Number(customer.customerNumber),
  };
  const [config, permission, vipActive, openPlan] = await Promise.all([
    getVipInstallmentConfig(),
    getVipInstallmentPermission(normalizedCustomer.id),
    isVipMemberByPhone(normalizedCustomer.phone),
    getVipInstallmentOpenPlan(normalizedCustomer.id),
  ]);
  let reason: string | null = null;
  if (!config.enabled) reason = "Parcelamento VIP indisponível no momento.";
  else if (!vipActive) reason = "Seu VIP precisa estar ativo para usar o parcelamento.";
  else if (!permission.enabled) reason = "Parcelamento VIP ainda não foi liberado para este cadastro.";
  else if (openPlan && openPlan.balanceCents > 0) reason = "Você já possui uma compra parcelada em andamento. Quite o saldo para liberar um novo parcelamento.";
  return {
    customer: normalizedCustomer,
    config,
    permission,
    vipActive,
    openPlan,
    eligible: !reason,
    reason,
  };
}
