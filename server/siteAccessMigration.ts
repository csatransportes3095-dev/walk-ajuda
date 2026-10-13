import type { Connection, RowDataPacket } from "mysql2/promise";

/** Schema aditivo, sem DML nem alteracao de tabelas legadas. */
export const SITE_ACCESS_TABLES = [
  "siteAccessConfig",
  "siteAccessEntries",
  "siteAccessChallenges",
  "siteAccessRateLimits",
  "siteAccessAudit",
] as const;

const ddl: readonly string[] = [
  "CREATE TABLE IF NOT EXISTS `siteAccessConfig` (`id` INT NOT NULL PRIMARY KEY, `mode` VARCHAR(16) NOT NULL DEFAULT 'public', `updatedBy` VARCHAR(64) NULL, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS `siteAccessEntries` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `displayName` VARCHAR(128) NOT NULL, `email` VARCHAR(320) NOT NULL, `phone` VARCHAR(32) NULL, `customerId` INT NULL, `status` VARCHAR(16) NOT NULL DEFAULT 'active', `expiresAt` TIMESTAMP NULL, `sessionVersion` INT NOT NULL DEFAULT 1, `createdBy` VARCHAR(64) NOT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY `unique_siteAccessEntries_email` (`email`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS `siteAccessChallenges` (`email` VARCHAR(320) NOT NULL PRIMARY KEY, `codeHash` VARCHAR(100) NOT NULL, `attempts` INT NOT NULL DEFAULT 0, `expiresAt` TIMESTAMP NOT NULL, `requestedAt` TIMESTAMP NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS `siteAccessRateLimits` (`limitKey` VARCHAR(80) NOT NULL PRIMARY KEY, `windowStartedAt` BIGINT NOT NULL, `hits` INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS `siteAccessAudit` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `actor` VARCHAR(64) NOT NULL, `action` VARCHAR(48) NOT NULL, `subject` VARCHAR(320) NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

type RequiredColumn = readonly [string, string, number?];
const required: Record<(typeof SITE_ACCESS_TABLES)[number], RequiredColumn[]> = {
  siteAccessConfig: [["id", "int"], ["mode", "varchar", 16], ["updatedBy", "varchar", 64], ["updatedAt", "timestamp"]],
  siteAccessEntries: [
    ["id", "int"], ["displayName", "varchar", 128], ["email", "varchar", 320],
    ["phone", "varchar", 32], ["customerId", "int"], ["status", "varchar", 16],
    ["expiresAt", "timestamp"], ["sessionVersion", "int"], ["createdBy", "varchar", 64],
    ["createdAt", "timestamp"], ["updatedAt", "timestamp"],
  ],
  siteAccessChallenges: [["email", "varchar", 320], ["codeHash", "varchar", 100], ["attempts", "int"], ["expiresAt", "timestamp"], ["requestedAt", "timestamp"]],
  siteAccessRateLimits: [["limitKey", "varchar", 80], ["windowStartedAt", "bigint"], ["hits", "int"]],
  siteAccessAudit: [["id", "int"], ["actor", "varchar", 64], ["action", "varchar", 48], ["subject", "varchar", 320], ["createdAt", "timestamp"]],
};
interface ColumnRow extends RowDataPacket {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
  COLUMN_DEFAULT: string | null;
}
interface TableRow extends RowDataPacket { TABLE_NAME: string; ENGINE: string | null; }
interface IndexRow extends RowDataPacket {
  TABLE_NAME: string; COLUMN_NAME: string; INDEX_NAME: string; NON_UNIQUE: number;
}

/** Fails on existing incompatible tables; CREATE TABLE IF NOT EXISTS alone is insufficient. */
export async function verifySiteAccessSchema(conn: Connection): Promise<void> {
  const [tables] = await conn.query<TableRow[]>(
    "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)",
    [SITE_ACCESS_TABLES],
  );
  for (const name of SITE_ACCESS_TABLES) {
    const table = tables.find(row => row.TABLE_NAME === name);
    if (!table || table.ENGINE?.toUpperCase() !== "INNODB") throw new Error("Tabela ausente ou engine incorreta: " + name);
    const [columns] = await conn.query<ColumnRow[]>(
      "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
      [name],
    );
    for (const [column, type, length] of required[name]) {
      const got = columns.find(row => row.COLUMN_NAME === column);
      if (!got || got.DATA_TYPE !== type || (length && Number(got.CHARACTER_MAXIMUM_LENGTH) !== length)) {
        throw new Error("Tabela existente incompatível: " + name + "." + column);
      }
    }
  }
  const [idx] = await conn.query<IndexRow[]>(
    "SELECT TABLE_NAME, COLUMN_NAME, INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)",
    [SITE_ACCESS_TABLES],
  );
  const expectUnique = [
    ["siteAccessConfig", "id"], ["siteAccessEntries", "id"], ["siteAccessEntries", "email"],
    ["siteAccessChallenges", "email"], ["siteAccessRateLimits", "limitKey"], ["siteAccessAudit", "id"],
  ];
  for (const [table, col] of expectUnique) {
    if (!idx.some(row => row.TABLE_NAME === table && row.COLUMN_NAME === col && Number(row.NON_UNIQUE) === 0)) {
      throw new Error("Índice único ausente: " + table + "." + col);
    }
  }
  const [mode] = await conn.query<ColumnRow[]>(
    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='siteAccessConfig' AND COLUMN_NAME='mode'",
  );
  if (mode[0]?.COLUMN_DEFAULT !== "public") throw new Error("Modo padrão deve permanecer public.");
}

export async function applySiteAccessMigration(conn: Connection): Promise<void> {
  for (const statement of ddl) await conn.query(statement);
  await verifySiteAccessSchema(conn);
}
