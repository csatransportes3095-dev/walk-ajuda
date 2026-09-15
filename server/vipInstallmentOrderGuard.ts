import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

/**
 * Bloqueia somente pedidos públicos de clientes que JÁ possuem um
 * Parcelamento VIP com saldo real em aberto.
 *
 * O primeiro pedido que origina o parcelamento continua permitido, pois o
 * plano ainda não existe nesse momento. Assim não interferimos na criação do
 * contrato inicial e impedimos apenas pedidos posteriores enquanto houver débito.
 */
export async function assertNoOpenVipInstallmentDebt(phoneValue: string) {
  const phone = normalizePhone(phoneValue);
  if (!phone) return;

  const db = (await getDb()) as any;
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível conferir suas parcelas agora. Tente novamente.",
    });
  }

  try {
    const result = await db.execute(sql`
      SELECT p.id, p.productName, p.balanceCents, p.status
      FROM vipInstallmentPlans p
      INNER JOIN customers c ON c.id=p.customerId
      WHERE c.deletedAt IS NULL
        AND REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '')=${phone}
        AND p.balanceCents > 0
        AND p.status NOT IN ('paid','cancelled')
      ORDER BY p.id DESC
      LIMIT 1
    `);
    const plan = rowsOf<any>(result)[0];
    if (!plan) return;

    throw new TRPCError({
      code: "CONFLICT",
      message: "Você possui parcelas pendentes. Quite seu débito para realizar um novo pedido.",
      cause: {
        reason: "VIP_INSTALLMENT_DEBT",
        planId: Number(plan.id),
        productName: String(plan.productName || ""),
        balanceCents: Number(plan.balanceCents || 0),
      },
    });
  } catch (error: any) {
    if (error instanceof TRPCError) throw error;

    // Instalações antigas podem ainda não ter a tabela de parcelamento.
    // Nessa situação não existe débito de Parcelamento VIP que possa ser bloqueado.
    if (String(error?.code || "") === "ER_NO_SUCH_TABLE" || String(error?.message || "").includes("vipInstallmentPlans")) {
      return;
    }
    throw error;
  }
}
