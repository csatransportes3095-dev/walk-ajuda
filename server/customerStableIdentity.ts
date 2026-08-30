import { sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  findMainCustomerByIdentity,
  normalizeCustomerCpf,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "./customerAccess";

type CustomerIdentityInput = {
  phone?: string | null;
  cpf?: string | null;
  email?: string | null;
};

let stableInfrastructureReady = false;
let stableInfrastructurePromise: Promise<void> | null = null;

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

function normalizedIdentities(identity: CustomerIdentityInput) {
  const phone = normalizeCustomerPhone(identity.phone);
  const cpf = normalizeCustomerCpf(identity.cpf);
  const email = normalizeCustomerEmail(identity.email);
  return [
    phone ? { type: "phone", value: phone } : null,
    cpf ? { type: "cpf", value: cpf } : null,
    email ? { type: "email", value: email } : null,
  ].filter(Boolean) as Array<{ type: "phone" | "cpf" | "email"; value: string }>;
}

export async function ensureStableCustomerIdentityInfrastructure(dbArg?: any): Promise<void> {
  if (stableInfrastructureReady) return;
  if (stableInfrastructurePromise) return stableInfrastructurePromise;

  stableInfrastructurePromise = (async () => {
    const db = dbArg || await getDb() as any;
    if (!db) return;
    try {
      const customerColumns = await rows(db, sql`SHOW COLUMNS FROM customers`);
      const phoneColumn = customerColumns.find((column: any) => String(column.Field || "").toLowerCase() === "phone");
      // Telefone continua obrigatório para o cliente, mas precisa aceitar NULL no banco
      // para o ADM poder limpar um dado incorreto sem colidir com UNIQUE em vários cadastros.
      if (phoneColumn && String(phoneColumn.Null || "").toUpperCase() !== "YES") {
        await db.execute(sql.raw("ALTER TABLE customers MODIFY COLUMN phone VARCHAR(32) NULL"));
      }

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS customerIdentityAliases (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customerId INT NOT NULL,
          identityType VARCHAR(16) NOT NULL,
          identityValue VARCHAR(320) NOT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY customer_identity_alias_unique (identityType, identityValue),
          KEY customer_identity_alias_customer (customerId)
        )
      `));

      const passwordColumns = await rows(db, sql`SHOW COLUMNS FROM customerPasswords`);
      const passwordColumnNames = new Set(passwordColumns.map((column: any) => String(column.Field || "").toLowerCase()));
      if (!passwordColumnNames.has("customerid")) {
        await db.execute(sql.raw("ALTER TABLE customerPasswords ADD COLUMN customerId INT NULL"));
        await db.execute(sql.raw("CREATE INDEX customer_password_customer_id_idx ON customerPasswords (customerId)"));
      }

      const sessionColumns = await rows(db, sql`SHOW COLUMNS FROM customerPasswordSessions`);
      const sessionColumnNames = new Set(sessionColumns.map((column: any) => String(column.Field || "").toLowerCase()));
      if (!sessionColumnNames.has("customerid")) {
        await db.execute(sql.raw("ALTER TABLE customerPasswordSessions ADD COLUMN customerId INT NULL"));
        await db.execute(sql.raw("CREATE INDEX customer_password_session_customer_id_idx ON customerPasswordSessions (customerId)"));
      }

      const customers = await rows(db, sql`
        SELECT id, phone, cpf, email
        FROM customers
        WHERE deletedAt IS NULL
      `);

      for (const customer of customers) {
        const customerId = Number(customer.id);
        if (!customerId) continue;
        const identities = normalizedIdentities(customer);
        for (const identity of identities) {
          await db.execute(sql`
            INSERT IGNORE INTO customerIdentityAliases (customerId, identityType, identityValue, createdAt)
            VALUES (${customerId}, ${identity.type}, ${identity.value}, NOW())
          `);
        }

        const phone = normalizeCustomerPhone(customer.phone);
        if (phone) {
          await db.execute(sql`
            UPDATE customerPasswords
            SET customerId=${customerId}
            WHERE customerId IS NULL
              AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 11)=${phone.slice(-11)}
          `);
          await db.execute(sql`
            UPDATE customerPasswordSessions
            SET customerId=${customerId}
            WHERE customerId IS NULL
              AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 11)=${phone.slice(-11)}
          `);
        }
      }

      stableInfrastructureReady = true;
    } catch (error) {
      stableInfrastructurePromise = null;
      throw error;
    }
  })();

  return stableInfrastructurePromise;
}

export async function recordCustomerIdentityAliases(
  customerId: number,
  identity: CustomerIdentityInput,
  dbArg?: any,
): Promise<void> {
  const db = dbArg || await getDb() as any;
  if (!db || !customerId) return;
  await ensureStableCustomerIdentityInfrastructure(db);
  for (const item of normalizedIdentities(identity)) {
    await db.execute(sql`
      INSERT IGNORE INTO customerIdentityAliases (customerId, identityType, identityValue, createdAt)
      VALUES (${customerId}, ${item.type}, ${item.value}, NOW())
    `);
  }
}

export async function findCustomerIdByIdentityAlias(
  identity: CustomerIdentityInput,
  dbArg?: any,
): Promise<number | null> {
  const db = dbArg || await getDb() as any;
  if (!db) return null;
  await ensureStableCustomerIdentityInfrastructure(db);

  for (const item of normalizedIdentities(identity)) {
    const found = await rows(db, sql`
      SELECT customerId
      FROM customerIdentityAliases
      WHERE identityType=${item.type} AND identityValue=${item.value}
      LIMIT 1
    `);
    const customerId = Number(found[0]?.customerId || 0);
    if (customerId) return customerId;
  }
  return null;
}

export async function findCustomerByStableId(customerId: number, dbArg?: any): Promise<any | null> {
  const db = dbArg || await getDb() as any;
  if (!db || !customerId) return null;
  await ensureStableCustomerIdentityInfrastructure(db);
  const found = await rows(db, sql`
    SELECT id, customerNumber, name, phone, cpf, email, city, uf,
           zipCode, addressLine, neighborhood, addressNumber, addressComplement,
           profilePhotoUrl, blocked, deletedAt
    FROM customers
    WHERE id=${customerId} AND deletedAt IS NULL
    LIMIT 1
  `);
  return found[0] || null;
}

export async function findCustomerByStableIdentity(
  identity: CustomerIdentityInput,
  dbArg?: any,
): Promise<any | null> {
  const db = dbArg || await getDb() as any;
  if (!db) return null;
  await ensureStableCustomerIdentityInfrastructure(db);

  const current = await findMainCustomerByIdentity(identity, db);
  if (current) {
    await recordCustomerIdentityAliases(Number(current.id), current, db);
    return current;
  }

  const customerId = await findCustomerIdByIdentityAlias(identity, db);
  return customerId ? findCustomerByStableId(customerId, db) : null;
}

export async function linkCustomerAuthRows(
  customerId: number,
  phoneInput: string | null | undefined,
  dbArg?: any,
): Promise<void> {
  const db = dbArg || await getDb() as any;
  if (!db || !customerId) return;
  await ensureStableCustomerIdentityInfrastructure(db);
  const phone = normalizeCustomerPhone(phoneInput);
  if (!phone) return;
  await db.execute(sql`
    UPDATE customerPasswords
    SET customerId=${customerId}
    WHERE customerId IS NULL
      AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 11)=${phone.slice(-11)}
  `);
  await db.execute(sql`
    UPDATE customerPasswordSessions
    SET customerId=${customerId}
    WHERE customerId IS NULL
      AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 11)=${phone.slice(-11)}
  `);
}
