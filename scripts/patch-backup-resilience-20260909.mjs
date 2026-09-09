import fs from 'node:fs';

const backupPath = 'server/backupService.ts';
const indexPath = 'server/_core/index.ts';
let source = fs.readFileSync(backupPath, 'utf8');

const oldReconcile = `export async function reconcileBackupsAfterRestart(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const activeRows = await db
    .select({ id: systemBackups.id, stage: systemBackups.stage, progress: systemBackups.progress })
    .from(systemBackups)
    .where(inArray(systemBackups.status, ["queued", "running"]));
  for (const row of activeRows) {
    await db.update(systemBackups).set({
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: \`Execução interrompida após reinício do serviço. Último estágio persistido: \${row.stage}. Último progresso persistido: \${row.progress}%. Causa do encerramento da instância não determinada pelo processo recuperado; nenhum artefato foi validado.\`,
    }).where(eq(systemBackups.id, row.id));
  }
  const completedRows = await db
    .select({ id: systemBackups.id, manifestJson: systemBackups.manifestJson })
    .from(systemBackups)
    .where(eq(systemBackups.status, "completed"));
  let interruptedVerifications = 0;
  for (const row of completedRows) {
    if (getBackupRemoteVerification(row.manifestJson).status !== "verifying") continue;
    interruptedVerifications += 1;
    await updateStoredBackupVerification(row.id, {
      status: "failed",
      verifiedAt: null,
      bytes: null,
      sha256: null,
      error: "Verificação profunda interrompida após reinício do serviço. Execute a verificação novamente.",
    });
  }
  return activeRows.length + interruptedVerifications;
}`;

const newReconcile = `export async function reconcileBackupsAfterRestart(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const activeRows = await db
    .select({ id: systemBackups.id, status: systemBackups.status, stage: systemBackups.stage, progress: systemBackups.progress, createdAt: systemBackups.createdAt })
    .from(systemBackups)
    .where(inArray(systemBackups.status, ["queued", "running"]))
    .orderBy(desc(systemBackups.createdAt));

  let retryId: string | null = activeRows[0]?.id ?? null;

  // Compatibilidade com a versão antiga: recupera o backup mais recente que foi
  // marcado como falha exclusivamente porque a instância reiniciou.
  if (!retryId) {
    const [latest] = await db
      .select({ id: systemBackups.id, status: systemBackups.status, errorMessage: systemBackups.errorMessage })
      .from(systemBackups)
      .orderBy(desc(systemBackups.createdAt))
      .limit(1);
    if (
      latest?.status === "failed" &&
      typeof latest.errorMessage === "string" &&
      latest.errorMessage.startsWith("Execução interrompida após reinício do serviço.")
    ) {
      retryId = latest.id;
    }
  }

  // Apenas o backup mais recente pode ser retomado. Isso evita duas execuções
  // concorrentes depois de uma sequência de reinícios.
  for (const row of activeRows) {
    if (row.id === retryId) continue;
    await db.update(systemBackups).set({
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: \`Execução substituída pela recuperação automática do backup \${retryId ?? "mais recente"}. Último estágio: \${row.stage}; progresso: \${row.progress}%.\`,
    }).where(eq(systemBackups.id, row.id));
  }

  let restartedBackups = 0;
  if (retryId) {
    restartedBackups = 1;
    await db.update(systemBackups).set({
      status: "queued",
      stage: "queued",
      progress: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    }).where(eq(systemBackups.id, retryId));

    const controller = new AbortController();
    activeBackupControllers.set(retryId, controller);
    const timer = setTimeout(() => {
      console.warn(\`[Backup] recuperação automática iniciada para \${retryId}.\`);
      void executeBackup(retryId!, controller.signal);
    }, 10_000);
    timer.unref?.();
  }

  const completedRows = await db
    .select({ id: systemBackups.id, manifestJson: systemBackups.manifestJson })
    .from(systemBackups)
    .where(eq(systemBackups.status, "completed"));
  let interruptedVerifications = 0;
  for (const row of completedRows) {
    if (getBackupRemoteVerification(row.manifestJson).status !== "verifying") continue;
    interruptedVerifications += 1;
    await updateStoredBackupVerification(row.id, {
      status: "failed",
      verifiedAt: null,
      bytes: null,
      sha256: null,
      error: "Verificação profunda interrompida após reinício do serviço. Execute a verificação novamente.",
    });
  }
  return restartedBackups + interruptedVerifications;
}`;

if (!source.includes(oldReconcile)) {
  throw new Error('Bloco reconcileBackupsAfterRestart esperado não encontrado; patch abortado para evitar alteração incorreta.');
}
source = source.replace(oldReconcile, newReconcile);

const oldWorkspace = `    getEncryptionKey();
    throwIfBackupAborted(signal);
    await mkdir(filesDirectory, { recursive: true });`;
const newWorkspace = `    getEncryptionKey();
    throwIfBackupAborted(signal);
    // A execução pode ser retomada com o mesmo ID depois de reinício. Nunca
    // reutilizar arquivos parciais do workspace local.
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(filesDirectory, { recursive: true });`;
if (!source.includes(oldWorkspace)) throw new Error('Bloco de criação do workspace não encontrado.');
source = source.replace(oldWorkspace, newWorkspace);

const oldR2Loop = `    const r2Entries: BackupR2Entry[] = [];
    let totalR2Bytes = 0;
    for (let index = 0; index < r2Objects.length; index += 1) {
      throwIfBackupAborted(signal);
      const object = r2Objects[index];
      const relativePath = safeBackupObjectPath(object.key);
      const result = await downloadR2Object(object.key, path.join(workDirectory, relativePath), object.size);
      r2Entries.push({ ...object, sha256: result.sha256 });
      totalR2Bytes += result.bytes;
      const progress = 20 + Math.floor(((index + 1) / Math.max(r2Objects.length, 1)) * 55);
      if (index === 0 || index % 10 === 0 || index === r2Objects.length - 1) {
        await updateRun(id, { stage: "r2-download", progress });
      }
    }`;

const newR2Loop = `    const r2Entries = new Array<BackupR2Entry>(r2Objects.length);
    let totalR2Bytes = 0;
    let completedR2Objects = 0;
    let nextR2Index = 0;
    let lastPersistedCompleted = 0;
    const configuredConcurrency = Number.parseInt(process.env.BACKUP_R2_CONCURRENCY || "16", 10);
    const r2Concurrency = Math.max(1, Math.min(Number.isFinite(configuredConcurrency) ? configuredConcurrency : 16, 24, Math.max(r2Objects.length, 1)));
    logBackupDiagnostic(diagnostic, "r2-download-concurrency", { concurrency: r2Concurrency, objectCount: r2Objects.length });

    const persistR2Progress = async () => {
      const current = completedR2Objects;
      if (current !== r2Objects.length && current !== 1 && current - lastPersistedCompleted < 10) return;
      lastPersistedCompleted = current;
      const progress = 20 + Math.floor((current / Math.max(r2Objects.length, 1)) * 55);
      await updateRun(id, { stage: "r2-download", progress });
    };

    const workers = Array.from({ length: r2Concurrency }, async () => {
      while (true) {
        throwIfBackupAborted(signal);
        const index = nextR2Index++;
        if (index >= r2Objects.length) return;
        const object = r2Objects[index];
        const relativePath = safeBackupObjectPath(object.key);
        const result = await downloadR2Object(object.key, path.join(workDirectory, relativePath), object.size);
        r2Entries[index] = { ...object, sha256: result.sha256 };
        totalR2Bytes += result.bytes;
        completedR2Objects += 1;
        await persistR2Progress();
      }
    });
    await Promise.all(workers);`;

if (!source.includes(oldR2Loop)) throw new Error('Loop sequencial de R2 não encontrado.');
source = source.replace(oldR2Loop, newR2Loop);

fs.writeFileSync(backupPath, source, 'utf8');

let indexSource = fs.readFileSync(indexPath, 'utf8');
indexSource = indexSource.replace(
  'if (total > 0) console.warn(`[Backup] ${total} execução(ões) abandonada(s) marcada(s) como falha técnica.`);',
  'if (total > 0) console.warn(`[Backup] ${total} execução(ões) recuperada(s) ou verificação(ões) reconciliada(s) após reinício.`);',
);
fs.writeFileSync(indexPath, indexSource, 'utf8');

console.log('[backup-patch] OK: recuperação após reinício + R2 paralelo aplicados.');
