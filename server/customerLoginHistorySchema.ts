import { sql, type SQL } from "drizzle-orm";

export type CustomerLoginHistoryExecutor = { execute(query: SQL): Promise<unknown> };

/** Matches the same national phone identity used by customer authentication. */
export function storedLoginPhoneSql(column: SQL): SQL {
  const digits = sql`REGEXP_REPLACE(${column}, '[^0-9]', '')`;
  return sql`CASE
    WHEN LENGTH(${digits}) IN (12, 13) AND LEFT(${digits}, 2) = '55'
      THEN SUBSTRING(${digits}, 3)
    ELSE ${digits}
  END`;
}

export const CUSTOMER_LOGIN_HISTORY_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS customerLoginHistory (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(32) NOT NULL,
    loginAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ipAddress VARCHAR(64) NULL,
    userAgent VARCHAR(512) NULL,
    sessionKey VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    UNIQUE KEY uq_customer_login_session (sessionKey)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

function mysqlErrorCode(error: unknown): number | undefined {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    const value = Number(current.errno);
    if (Number.isInteger(value) && value > 0) return value;
    current = current.cause;
  }
  return undefined;
}

export function isDuplicateLoginSessionError(error: unknown): boolean {
  return mysqlErrorCode(error) === 1062;
}

async function rows(db: CustomerLoginHistoryExecutor, query: SQL): Promise<any[]> {
  const result = await db.execute(query) as any;
  return result?.[0] || [];
}

async function ensureSessionColumn(db: CustomerLoginHistoryExecutor): Promise<void> {
  const readColumn = () => rows(db, sql`
    SELECT DATA_TYPE AS dataType, CHARACTER_MAXIMUM_LENGTH AS maxLength, IS_NULLABLE AS isNullable
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customerLoginHistory' AND COLUMN_NAME = 'sessionKey'
  `);
  let column = (await readColumn())[0];
  if (!column) {
    try {
      await db.execute(sql`ALTER TABLE customerLoginHistory
        ADD COLUMN sessionKey VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL`);
    } catch (error) {
      // Another application instance may be applying this additive migration.
      if (mysqlErrorCode(error) !== 1060) throw error;
    }
    column = (await readColumn())[0];
  }
  if (!column || column.dataType !== 'varchar' || Number(column.maxLength) !== 64 || column.isNullable !== 'YES') {
    throw new Error('A coluna de identificação do histórico de acessos é incompatível.');
  }
}

async function ensureSessionIndex(db: CustomerLoginHistoryExecutor): Promise<void> {
  const readIndex = () => rows(db, sql`
    SELECT NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName, SEQ_IN_INDEX AS sequence
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customerLoginHistory'
      AND INDEX_NAME = 'uq_customer_login_session'
    ORDER BY SEQ_IN_INDEX
  `);
  let index = await readIndex();
  if (index.length === 0) {
    try {
      await db.execute(sql`ALTER TABLE customerLoginHistory
        ADD UNIQUE KEY uq_customer_login_session (sessionKey)`);
    } catch (error) {
      if (mysqlErrorCode(error) !== 1061) throw error;
    }
    index = await readIndex();
  }
  if (index.length !== 1 || Number(index[0].nonUnique) !== 0 ||
      index[0].columnName !== 'sessionKey' || Number(index[0].sequence) !== 1) {
    throw new Error('O índice de identificação do histórico de acessos é incompatível.');
  }
}

/**
 * Additive and repeatable. A surviving OTP session proves an authentication at
 * createdAt. Its changing lastAccessAt never becomes an invented login event.
 * No raw session token is copied into the history table.
 */
export async function migrateCustomerLoginHistory(db: CustomerLoginHistoryExecutor): Promise<void> {
  await db.execute(sql.raw(CUSTOMER_LOGIN_HISTORY_CREATE_SQL));
  await ensureSessionColumn(db);
  await ensureSessionIndex(db);

  const phone = storedLoginPhoneSql(sql`s.phone`);
  const recover = sql`
    INSERT INTO customerLoginHistory (phone, loginAt, sessionKey)
    SELECT ${phone}, s.createdAt, SHA2(s.token, 256)
    FROM customerPasswordSessions s
    WHERE CHAR_LENGTH(s.token) = 70
      AND REGEXP_LIKE(s.token, '^h2otp_[0-9a-f]{64}$', 'c')
      AND LENGTH(${phone}) IN (10, 11)
      AND s.createdAt IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customerLoginHistory h WHERE h.sessionKey = SHA2(s.token, 256)
      )
  `;
  // The unique session key also protects concurrent startup migrations. Retry
  // only duplicate-key races; malformed rows and all other database errors fail.
  for (let attempt = 0; ; attempt++) {
    try {
      await db.execute(recover);
      break;
    } catch (error) {
      if (!isDuplicateLoginSessionError(error) || attempt >= 2) throw error;
    }
  }

}
