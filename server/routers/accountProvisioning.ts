import { sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { FINAL_ACCOUNT_PROVISIONING_STATUSES, parseAccountProvisioningSearch } from "../accountProvisioningPolicy";

function maskCpf(value: unknown): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `***.***.***-${digits.slice(-2)}`;
}

export const accountProvisioningRouter = router({
  searchOpenOrders: adminProcedure
    .input(z.object({ query: z.string().trim().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      let criteria;
      try {
        criteria = parseAccountProvisioningSearch(input.query);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Busca inválida." });
      }

      const criteriaSql = criteria.kind === "order"
        ? sql`latest.orderNumber = ${Number(criteria.value)}`
        : criteria.kind === "customer"
          ? sql`c.customerNumber = ${Number(criteria.value)}`
          : sql`(
              REGEXP_REPLACE(acp.phone, '[^0-9]', '') = ${criteria.value}
              OR REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '') = ${criteria.value}
              OR REGEXP_REPLACE(COALESCE(c.cpf, ''), '[^0-9]', '') = ${criteria.value}
            )`;

      const result = await db.execute(sql`
        SELECT
          acp.id AS registrationId,
          latest.orderNumber,
          latest.status AS latestStatus,
          latest.serviceName,
          latest.serviceOption,
          UNIX_TIMESTAMP(latest.createdAt) * 1000 AS latestStatusAt,
          c.id AS customerId,
          c.customerNumber,
          c.name AS customerName,
          c.phone AS customerPhone,
          c.cpf AS customerCpf,
          c.email AS customerEmail
        FROM accessCodePhones acp
        INNER JOIN (
          SELECT h.registrationId, h.orderNumber, h.status, h.serviceName, h.serviceOption, h.createdAt
          FROM orderStatusHistory h
          INNER JOIN (
            SELECT registrationId, MAX(id) AS latestId
            FROM orderStatusHistory
            GROUP BY registrationId
          ) newest ON newest.latestId = h.id
        ) latest ON latest.registrationId = acp.id
        LEFT JOIN customers c ON REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
          AND c.deletedAt IS NULL
        WHERE acp.archived = 0
          AND acp.rgCnhApproved = 0
          AND latest.status NOT IN (${sql.join(FINAL_ACCOUNT_PROVISIONING_STATUSES.map((status) => sql`${status}`), sql`, `)})
          AND ${criteriaSql}
        ORDER BY latest.createdAt DESC
        LIMIT 20
      `);

      const rows = ((result as any)[0] || []) as any[];
      return rows.map((row) => ({
        registrationId: Number(row.registrationId),
        orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
        latestStatus: String(row.latestStatus || ""),
        serviceName: row.serviceName ? String(row.serviceName) : null,
        serviceOption: row.serviceOption ? String(row.serviceOption) : null,
        latestStatusAt: row.latestStatusAt ? Number(row.latestStatusAt) : null,
        customerId: row.customerId == null ? null : Number(row.customerId),
        customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
        customerName: row.customerName ? String(row.customerName) : null,
        customerPhone: row.customerPhone ? String(row.customerPhone) : null,
        customerCpfMasked: maskCpf(row.customerCpf),
        customerEmail: row.customerEmail ? String(row.customerEmail) : null,
      }));
    }),
});
