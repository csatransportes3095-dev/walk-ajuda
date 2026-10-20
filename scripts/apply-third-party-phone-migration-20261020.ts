import { createConnection } from "mysql2/promise";

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await db.query<any[]>(
      "SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accessCodePhones' AND COLUMN_NAME = 'thirdPartyPhone'"
    );
    if (Number(rows?.[0]?.total || 0) === 0) {
      await db.query("ALTER TABLE accessCodePhones ADD COLUMN thirdPartyPhone varchar(32) NULL AFTER thirdPartyName");
      console.log("[third-party-phone-migration] coluna criada");
    } else {
      console.log("[third-party-phone-migration] coluna ja existe");
    }
  } finally {
    await db.end();
  }
}

run().then(() => process.exit(0)).catch((error) => {
  console.error("[third-party-phone-migration] FAILED", error instanceof Error ? error.message : error);
  process.exit(1);
});
