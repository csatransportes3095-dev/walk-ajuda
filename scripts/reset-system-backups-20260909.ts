import { createConnection } from "mysql2/promise";
import { r2DeleteObjects, r2ListObjectsPage } from "../server/r2Storage";

const CUTOFF_ISO = "2026-09-09T08:00:00.000Z";
const CUTOFF = new Date(CUTOFF_ISO);
const PREFIX = "system-backups/";

async function deleteR2BackupArtifacts() {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await r2ListObjectsPage(PREFIX, continuationToken);
    for (const object of page.objects) {
      const modified = object.lastModified;
      if (!modified || modified.getTime() <= CUTOFF.getTime()) {
        keys.push(object.key);
      }
    }
    continuationToken = page.nextContinuationToken || undefined;
  } while (continuationToken);

  for (let i = 0; i < keys.length; i += 1000) {
    await r2DeleteObjects(keys.slice(i, i + 1000));
  }

  return keys.length;
}

async function deleteBackupRows() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");

  const connection = await createConnection(databaseUrl);
  try {
    const [beforeRows] = await connection.query<any[]>(
      "SELECT COUNT(*) AS total FROM systemBackups WHERE createdAt <= ?",
      [CUTOFF],
    );
    const before = Number(beforeRows?.[0]?.total || 0);

    await connection.query(
      "DELETE FROM systemBackups WHERE createdAt <= ?",
      [CUTOFF],
    );

    const [afterRows] = await connection.query<any[]>(
      "SELECT COUNT(*) AS total FROM systemBackups",
    );
    const after = Number(afterRows?.[0]?.total || 0);

    return { before, after };
  } finally {
    await connection.end();
  }
}

async function main() {
  console.log(`[BACKUP-RESET] início cutoff=${CUTOFF_ISO} prefix=${PREFIX}`);

  let deletedArtifacts = 0;
  try {
    deletedArtifacts = await deleteR2BackupArtifacts();
  } catch (error) {
    console.warn(
      `[BACKUP-RESET] aviso: falha ao limpar artefatos R2; histórico do banco ainda será zerado. erro=${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rows = await deleteBackupRows();
  console.log(`[BACKUP-RESET] concluído rowsDeleted=${rows.before} rowsRemaining=${rows.after} r2ArtifactsDeleted=${deletedArtifacts}`);
}

main().catch((error) => {
  console.error(`[BACKUP-RESET] falha fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
