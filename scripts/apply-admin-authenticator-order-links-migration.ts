import { sql } from "drizzle-orm";
import { getDb } from "../server/db";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para migração do vínculo de autenticador.");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS adminAuthenticatorOrderLinks (
      id INT NOT NULL AUTO_INCREMENT,
      authenticatorEntryId INT NOT NULL,
      registrationId INT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY adminAuthenticatorOrderLinks_entry_unique (authenticatorEntryId),
      KEY adminAuthenticatorOrderLinks_registration_idx (registrationId)
    )
  `);
  console.log("Migração adminAuthenticatorOrderLinks concluída.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
