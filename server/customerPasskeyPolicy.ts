import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const CUSTOMER_PASSKEY_PERMISSION_KEY = "customer_passkey_allowed";

export type CustomerPasskeyPermission = { allowed: boolean };

/** This is the ADM preference, not an assertion that Passkey authentication is operational.
 * The eventual enrollment and verification service must consult this policy on every operation. */
export async function readCustomerPasskeyPermission(db: any): Promise<CustomerPasskeyPermission> {
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco indisponível." });
  try {
    const result = await db.execute(sql`SELECT value FROM appSettings WHERE \`key\`=${CUSTOMER_PASSKEY_PERMISSION_KEY} LIMIT 1`);
    const row = result?.[0]?.[0];
    // No configuration: allow the planned feature once its independent rollout is ready.
    // Malformed persisted settings are never interpreted as permission.
    return { allowed: !row || row.value === "1" };
  } catch (cause) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível consultar a permissão de biometria.", cause });
  }
}

/** The administrative preference does not issue a session or create a credential. */
export async function saveCustomerPasskeyPermission(db: any, allowed: boolean): Promise<CustomerPasskeyPermission> {
  if (typeof allowed !== "boolean") throw new TRPCError({ code: "BAD_REQUEST", message: "Permissão inválida." });
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco indisponível." });
  try {
    const value = allowed ? "1" : "0";
    await db.execute(sql`INSERT INTO appSettings (\`key\`,value) VALUES (${CUSTOMER_PASSKEY_PERMISSION_KEY},${value}) ON DUPLICATE KEY UPDATE value=${value}`);
  } catch (cause) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível salvar a permissão de biometria.", cause });
  }
  return { allowed };
}
