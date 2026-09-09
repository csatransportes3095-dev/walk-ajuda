import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[backup-core-v2] ${label}: esperado 1 bloco, encontrado ${count}`);
  return source.replace(oldText, newText);
}

function replaceRegexOnce(source, regex, newText, label) {
  const matches = source.match(regex);
  if (!matches || matches.length !== 1) throw new Error(`[backup-core-v2] ${label}: bloco esperado não encontrado de forma única`);
  return source.replace(regex, newText);
}

// -----------------------------------------------------------------------------
// BACKEND PRINCIPAL: Backup Core H2 sem loop automático e sem copiar 4,5 GB.
// Este script roda DEPOIS dos patches de resiliência e stream direto no Docker.
// -----------------------------------------------------------------------------
const backupFile = 'server/backupService.ts';
let backupSource = fs.readFileSync(backupFile, 'utf8');

backupSource = replaceRegexOnce(
  backupSource,
  /export async function reconcileBackupsAfterRestart\(\): Promise<number> \{[\s\S]*?\n\}\n\n(?=async function listAllR2Objects\(\): Promise<R2ObjectInfo\[]>)/,
`export async function reconcileBackupsAfterRestart(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Backup Core V2: reinício NUNCA reinicia a mesma execução do zero.
  // A execução interrompida fica como falha técnica, preservando o último
  // progresso mostrado. Isso elimina definitivamente o loop 25% -> 5%.
  const activeRows = await db
    .select({ id: systemBackups.id, stage: systemBackups.stage, progress: systemBackups.progress })
    .from(systemBackups)
    .where(inArray(systemBackups.status, ["queued", "running"]));

  for (const row of activeRows) {
    await db.update(systemBackups).set({
      status: "failed",
      stage: "failed",
      progress: row.progress,
      errorMessage: \`Backup Core interrompido pelo reinício do serviço. Último estágio: \${row.stage}; último progresso: \${row.progress}%. A execução NÃO será reiniciada automaticamente. Inicie um novo Backup Core após o serviço estabilizar.\`,
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
}

`,
  'reconciliação sem loop automático',
);

backupSource = replaceRegexOnce(
  backupSource,
  /async function listAllR2Objects\(\): Promise<R2ObjectInfo\[]> \{[\s\S]*?\n\}\n\n(?=export type BackupRemoteVerificationStatus)/,
`async function listAllR2Objects(): Promise<R2ObjectInfo[]> {
  // O Backup Core protege somente os snapshots de sessão/login do H2ADS.
  // Fotos, documentos, áudios e demais mídias são protegidos pelo backup
  // incremental de mídia, que não rebaixa a porcentagem ao reiniciar.
  const prefixes = ["h2ads-profile-snapshots/", "h2ads/browser-profiles/"];
  const objects: R2ObjectInfo[] = [];
  const seen = new Set<string>();

  for (const prefix of prefixes) {
    let continuationToken: string | undefined;
    do {
      const page = await r2ListObjectsPage(prefix, continuationToken);
      for (const object of page.objects) {
        if (seen.has(object.key)) continue;
        seen.add(object.key);
        objects.push(object);
      }
      continuationToken = page.nextContinuationToken || undefined;
    } while (continuationToken);
  }

  return objects;
}

`,
  'escopo R2 do Backup Core',
);

backupSource = replaceOnce(
  backupSource,
`  r2: {
    prefix: string;`,
`  r2: {
    mode: "full" | "core-h2ads";
    prefix: string;`,
  'tipo do escopo R2',
);

backupSource = replaceOnce(
  backupSource,
`      r2: {
        prefix: "",`,
`      r2: {
        mode: "core-h2ads",
        prefix: "h2ads-session-snapshots",`,
  'manifesto Core H2ADS',
);

backupSource = replaceOnce(
  backupSource,
`    r2: {
      objectCount: manifest.r2.objectCount,
      totalBytes: manifest.r2.totalBytes,
    },`,
`    r2: {
      mode: manifest.r2.mode,
      objectCount: manifest.r2.objectCount,
      totalBytes: manifest.r2.totalBytes,
    },`,
  'resumo com modo do R2',
);

backupSource = replaceOnce(
  backupSource,
`          "todos os objetos R2 paginados e comparados por tamanho",
          "SHA-256 calculado para cada objeto R2",`,
`          "snapshots de sessão/login H2ADS paginados e comparados por tamanho",
          "SHA-256 calculado para cada snapshot de sessão H2ADS",`,
  'checks do manifesto',
);

fs.writeFileSync(backupFile, backupSource, 'utf8');

// -----------------------------------------------------------------------------
// RESTAURAÇÃO: um Backup Core só pode podar o escopo H2ADS. Nunca apagar fotos
// ou documentos gerais do R2 ao restaurar um pacote Core.
// -----------------------------------------------------------------------------
const restoreFile = 'server/backupRestoreService.ts';
let restoreSource = fs.readFileSync(restoreFile, 'utf8');

restoreSource = replaceOnce(
  restoreSource,
`  r2: {
    objectCount: number;`,
`  r2: {
    mode?: "full" | "core-h2ads";
    objectCount: number;`,
  'tipo RestoreManifest.r2.mode',
);

restoreSource = replaceRegexOnce(
  restoreSource,
  /async function listCurrentRestoreableR2Objects\(\) \{[\s\S]*?\n\}\n\nasync function restoreR2Snapshot\(root: string, manifest: RestoreManifest, restoreId: string\) \{[\s\S]*?\n\}\n\n(?=async function captureSafetyBackupRow)/,
`const CORE_H2ADS_R2_PREFIXES = ["h2ads-profile-snapshots/", "h2ads/browser-profiles/"] as const;

function isCoreH2AdsRestoreKey(key: string) {
  const normalized = key.replace(/^\\/+/, "");
  return CORE_H2ADS_R2_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

async function listCurrentRestoreableR2Objects(mode: "full" | "core-h2ads" = "full") {
  const result = new Map<string, number>();
  const prefixes = mode === "core-h2ads" ? [...CORE_H2ADS_R2_PREFIXES] : [""];

  for (const prefix of prefixes) {
    let continuationToken: string | undefined;
    do {
      const page = await r2ListObjectsPage(prefix, continuationToken);
      for (const object of page.objects) {
        if (isProtectedRestoreR2Key(object.key)) continue;
        if (mode === "core-h2ads" && !isCoreH2AdsRestoreKey(object.key)) continue;
        result.set(object.key, object.size);
      }
      continuationToken = page.nextContinuationToken || undefined;
    } while (continuationToken);
  }

  return Array.from(result.entries()).map(([key, size]) => ({ key, size }));
}

async function restoreR2Snapshot(root: string, manifest: RestoreManifest, restoreId: string) {
  const mode: "full" | "core-h2ads" = manifest.r2.mode === "core-h2ads" ? "core-h2ads" : "full";
  const snapshotObjects = manifest.r2.objects.filter((object) => !isProtectedRestoreR2Key(object.key));
  if (mode === "core-h2ads") {
    const invalid = snapshotObjects.filter((object) => !isCoreH2AdsRestoreKey(object.key));
    if (invalid.length > 0) throw new Error("Backup Core contém objeto fora do escopo permitido de sessão H2ADS.");
  }

  const snapshotMap = new Map(snapshotObjects.map((object) => [object.key, object]));
  for (let index = 0; index < snapshotObjects.length; index += 1) {
    const object = snapshotObjects[index];
    const filePath = path.join(root, safeBackupObjectPath(object.key));
    if (object.size === 0) {
      await r2PutObject(object.key, Buffer.alloc(0), inferRestoreContentType(object.key));
    } else {
      await r2PutObjectStream(object.key, createReadStream(filePath), inferRestoreContentType(object.key), object.size, { backupId: restoreId, stage: "restore-r2" });
    }
    if (index === 0 || index % 5 === 0 || index === snapshotObjects.length - 1) {
      const label = mode === "core-h2ads" ? "sessões H2ADS" : "arquivos R2";
      updateRestore({ progress: 48 + Math.floor(((index + 1) / Math.max(snapshotObjects.length, 1)) * 42), message: \`Restaurando \${label}: \${index + 1}/\${snapshotObjects.length}.\` });
    }
  }

  const scopeLabel = mode === "core-h2ads" ? "sessões H2ADS" : "arquivos R2";
  updateRestore({ stage: "r2-prune", progress: 92, message: \`Sincronizando somente o escopo de \${scopeLabel}; backups permanecem protegidos.\` });
  const currentObjects = await listCurrentRestoreableR2Objects(mode);
  const extras = currentObjects.filter((object) => !snapshotMap.has(object.key)).map((object) => object.key);
  for (let index = 0; index < extras.length; index += 500) await r2DeleteObjects(extras.slice(index, index + 500));

  const finalObjects = await listCurrentRestoreableR2Objects(mode);
  const finalMap = new Map(finalObjects.map((object) => [object.key, object.size]));
  for (const object of snapshotObjects) {
    if (finalMap.get(object.key) !== object.size) throw new Error(\`R2 restaurado não confirmou o tamanho de \${object.key}.\`);
  }
}

`,
  'restauração R2 com escopo Core',
);

restoreSource = restoreSource.replace(
  'Banco restaurado e validado. Restaurando fotos e arquivos do R2.',
  'Banco restaurado e validado. Restaurando o escopo R2 protegido por este backup.',
);
restoreSource = restoreSource.replace(
  'Restauração concluída: banco e arquivos R2 voltaram ao snapshot selecionado.',
  'Restauração concluída: banco e escopo R2 protegido voltaram ao snapshot selecionado.',
);
fs.writeFileSync(restoreFile, restoreSource, 'utf8');

// -----------------------------------------------------------------------------
// PAINEL: deixa explícito que o botão principal é CORE e a mídia é separada.
// -----------------------------------------------------------------------------
const uiFile = 'client/src/pages/AdminBackup.tsx';
let uiSource = fs.readFileSync(uiFile, 'utf8');

if (!uiSource.includes('import MediaBackupPanel from "@/components/MediaBackupPanel";')) {
  uiSource = replaceOnce(
    uiSource,
    'import AdminHeader from "@/components/AdminHeader";\n',
    'import AdminHeader from "@/components/AdminHeader";\nimport MediaBackupPanel from "@/components/MediaBackupPanel";\n',
    'import MediaBackupPanel',
  );
}

if (!uiSource.includes('<MediaBackupPanel />')) {
  uiSource = replaceOnce(
    uiSource,
    '        <section className="rounded-2xl border border-white/10 bg-[#111128] p-5">\n          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">\n            <div>\n              <h2 className="text-lg font-black">Histórico de backups</h2>',
    '        <MediaBackupPanel />\n\n        <section className="rounded-2xl border border-white/10 bg-[#111128] p-5">\n          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">\n            <div>\n              <h2 className="text-lg font-black">Histórico de backups</h2>',
    'painel antes do histórico',
  );
}

uiSource = uiSource.replace('title="Backup completo do sistema"', 'title="Backup Core H2"');
uiSource = uiSource.replace('Backup real, não apenas estrutura', 'Backup Core H2');
uiSource = uiSource.replace(
  'O processo copia os registos reais de todas as tabelas do banco, fotos e ficheiros do R2, código, migrações e um cofre de recuperação total. O pacote é cifrado antes de ser guardado e só fica disponível para download após conclusão e verificação.',
  'O Backup Core protege o banco inteiro, código, migrações, configurações de recuperação e as sessões/login do H2ADS. Fotos, documentos, áudios e demais mídias ficam no Backup de Mídia incremental logo abaixo. Assim o Core termina rápido e não precisa movimentar mais de 4 GB a cada execução.'
);
uiSource = uiSource.replace('encryptionConfigured ? "Iniciar backup completo"', 'encryptionConfigured ? "Iniciar Backup Core H2"');
uiSource = uiSource.replace('"Gerar backup completo"', '"Gerar Backup Core"');
uiSource = uiSource.replace('r2: "Fotos e ficheiros"', 'r2: "Sessões H2ADS"');
uiSource = uiSource.replace('"r2-list": "Listando ficheiros"', '"r2-list": "Listando sessões H2ADS"');
uiSource = uiSource.replace('"r2-download": "Baixando ficheiros"', '"r2-download": "Protegendo sessões H2ADS"');

fs.writeFileSync(uiFile, uiSource, 'utf8');
console.log('[backup-core-v2] OK: Core sem loop, mídia separada e restauração limitada ao escopo H2ADS.');
