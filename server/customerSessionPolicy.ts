import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import {
  MAX_CUSTOMER_SESSION_HOURS,
  MIN_CUSTOMER_SESSION_HOURS,
  parseCustomerSessionHours,
  type CustomerSessionPolicy,
} from "../shared/customerSessionPolicy";

export const CUSTOMER_SESSION_HOURS_SETTING_KEY = "customer_session_hours";

function policy(hours: number): CustomerSessionPolicy {
  return {
    hours,
    minHours: MIN_CUSTOMER_SESSION_HOURS,
    maxHours: MAX_CUSTOMER_SESSION_HOURS,
    appliesTo: "new_logins",
  };
}

function requireDatabase(db: any): void {
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco indisponível. Tente novamente." });
}

/** Use the caller's transaction when issuing a session; never cache this policy. */
export async function readCustomerSessionPolicy(db: any): Promise<CustomerSessionPolicy> {
  requireDatabase(db);
  let result: any;
  try {
    result = await db.execute(sql`SELECT value FROM appSettings
      WHERE \`key\`=${CUSTOMER_SESSION_HOURS_SETTING_KEY} LIMIT 1`);
  } catch (cause) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível consultar a duração do acesso. Tente novamente.", cause });
  }
  return policy(parseCustomerSessionHours(result?.[0]?.[0]?.value));
}

/** Only changes the policy for future logins, never existing session rows. */
export async function saveCustomerSessionPolicy(db: any, hours: number): Promise<CustomerSessionPolicy> {
  if (!Number.isInteger(hours) || hours < MIN_CUSTOMER_SESSION_HOURS || hours > MAX_CUSTOMER_SESSION_HOURS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Informe um número inteiro de ${MIN_CUSTOMER_SESSION_HOURS} a ${MAX_CUSTOMER_SESSION_HOURS} horas.` });
  }
  requireDatabase(db);
  try {
    await db.execute(sql`INSERT INTO appSettings (\`key\`, value)
      VALUES (${CUSTOMER_SESSION_HOURS_SETTING_KEY},${String(hours)})
      ON DUPLICATE KEY UPDATE value=${String(hours)}`);
  } catch (cause) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível salvar a duração do acesso. Tente novamente.", cause });
  }
  return policy(hours);
}
