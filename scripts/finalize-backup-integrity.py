from pathlib import Path
import re

# -----------------------------------------------------------------------------
# server/backupService.ts
# -----------------------------------------------------------------------------
p = Path('server/backupService.ts')
text = p.read_text(encoding='utf-8')

old = 'import { createHash, createCipheriv, randomBytes } from "node:crypto";'
new = 'import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";'
if old not in text:
    raise SystemExit('crypto import anchor not found')
text = text.replace(old, new, 1)

# Insert deep stream verification after sha256File.
anchor = '''async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

'''
insert = anchor + '''export async function verifyEncryptedArchiveStreamContent(
  body: Readable,
  expectedBytes: number,
  expectedSha256: string,
  signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  const magic = Buffer.from("WJBACK1\\n", "utf8");
  const hash = createHash("sha256");
  let bytes = 0;
  let header = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  let decipher: ReturnType<typeof createDecipheriv> | null = null;

  for await (const chunkValue of body) {
    throwIfBackupAborted(signal);
    const raw = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue as Uint8Array);
    hash.update(raw);
    bytes += raw.length;

    let chunk = raw;
    if (!decipher) {
      header = Buffer.concat([header, chunk]);
      if (header.length < BACKUP_ARCHIVE_HEADER_BYTES) continue;
      if (!header.subarray(0, magic.length).equals(magic)) {
        throw new Error("Cabeçalho do backup cifrado é inválido.");
      }
      const iv = header.subarray(magic.length, BACKUP_ARCHIVE_HEADER_BYTES);
      decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
      chunk = header.subarray(BACKUP_ARCHIVE_HEADER_BYTES);
      header = Buffer.alloc(0);
    }

    if (chunk.length > 0) {
      const combined = tail.length > 0 ? Buffer.concat([tail, chunk]) : chunk;
      if (combined.length > BACKUP_ARCHIVE_AUTH_TAG_BYTES) {
        const splitAt = combined.length - BACKUP_ARCHIVE_AUTH_TAG_BYTES;
        decipher.update(combined.subarray(0, splitAt));
        tail = Buffer.from(combined.subarray(splitAt));
      } else {
        tail = Buffer.from(combined);
      }
    }
  }

  throwIfBackupAborted(signal);
  const sha256 = hash.digest("hex");
  if (bytes !== expectedBytes) {
    throw new Error(`Tamanho remoto divergente: esperado ${expectedBytes}, recebido ${bytes}.`);
  }
  if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error("SHA-256 remoto divergente do pacote criado.");
  }
  if (!decipher || tail.length !== BACKUP_ARCHIVE_AUTH_TAG_BYTES) {
    throw new Error("Pacote cifrado incompleto para validação AES-GCM.");
  }
  try {
    decipher.setAuthTag(tail);
    decipher.final();
  } catch {
    throw new Error("Falha de autenticação AES-GCM: o pacote armazenado não pode ser validado com a chave atual.");
  }
  return { bytes, sha256 };
}

async function verifyStoredBackupObject(
  artifactKey: string,
  expectedBytes: number,
  expectedSha256: string,
  signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    throwIfBackupAborted(signal);
    try {
      const body = toNodeReadable(await r2GetObjectStream(artifactKey));
      return await verifyEncryptedArchiveStreamContent(body, expectedBytes, expectedSha256, signal);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const deterministic = /SHA-256 remoto divergente|Tamanho remoto divergente|Cabeçalho do backup|AES-GCM|Pacote cifrado incompleto/i.test(message);
      if (deterministic || attempt >= 3 || signal?.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

'''
if anchor not in text:
    raise SystemExit('sha256File anchor not found')
text = text.replace(anchor, insert, 1)

# Add persisted verification state inside manifestJson metadata.
anchor = '''function summaryFromManifest(manifest: BackupManifest, archiveBytes: number, archiveSha256: string) {
  return JSON.stringify({
'''
if anchor not in text:
    raise SystemExit('summaryFromManifest anchor not found')
state_helpers = '''export type BackupRemoteVerificationStatus = "not_verified" | "verifying" | "verified" | "failed";
export type BackupRemoteVerification = {
  status: BackupRemoteVerificationStatus;
  verifiedAt: string | null;
  bytes: number | null;
  sha256: string | null;
  error: string | null;
};

const DEFAULT_REMOTE_VERIFICATION: BackupRemoteVerification = {
  status: "not_verified",
  verifiedAt: null,
  bytes: null,
  sha256: null,
  error: null,
};

export function getBackupRemoteVerification(manifestJson: string | null | undefined): BackupRemoteVerification {
  if (!manifestJson) return { ...DEFAULT_REMOTE_VERIFICATION };
  try {
    const parsed = JSON.parse(manifestJson) as { remoteVerification?: Partial<BackupRemoteVerification> };
    const candidate = parsed.remoteVerification;
    if (!candidate || !["not_verified", "verifying", "verified", "failed"].includes(String(candidate.status))) {
      return { ...DEFAULT_REMOTE_VERIFICATION };
    }
    return {
      status: candidate.status as BackupRemoteVerificationStatus,
      verifiedAt: typeof candidate.verifiedAt === "string" ? candidate.verifiedAt : null,
      bytes: typeof candidate.bytes === "number" ? candidate.bytes : null,
      sha256: typeof candidate.sha256 === "string" ? candidate.sha256 : null,
      error: typeof candidate.error === "string" ? candidate.error : null,
    };
  } catch {
    return { ...DEFAULT_REMOTE_VERIFICATION };
  }
}

function withBackupRemoteVerification(manifestJson: string | null | undefined, verification: BackupRemoteVerification): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = manifestJson ? JSON.parse(manifestJson) as Record<string, unknown> : {};
  } catch {
    parsed = {};
  }
  parsed.remoteVerification = verification;
  return JSON.stringify(parsed);
}

'''
text = text.replace(anchor, state_helpers + anchor, 1)

# Replace final object verification block with size + streamed SHA + AES-GCM verification.
old = '''    const finalObject = await r2HeadObject(artifactKey);
    if (finalObject.contentLength !== archiveInfo.bytes) {
      throw new Error(`Tamanho final do objeto R2 divergente: esperado ${archiveInfo.bytes}, recebido ${finalObject.contentLength ?? "desconhecido"}.`);
    }
    logBackupDiagnostic(diagnostic, "stage-end", {
      stageName: "verification",
      objectExists: true,
      expectedBytes: archiveInfo.bytes,
      actualBytes: finalObject.contentLength,
      httpStatus: finalObject.httpStatus,
      etag: finalObject.etag,
    });
    await updateRun(id, { artifactKey, fileSize: archiveInfo.bytes, archiveSha256: archiveInfo.sha256, manifestJson: summaryFromManifest(manifest, archiveInfo.bytes, archiveInfo.sha256) });
    throwIfBackupAborted(signal);
    await updateRun(id, {
      status: "completed",
      stage: "completed",
      progress: 100,
      completedAt: new Date(),
      manifestJson: summaryFromManifest(manifest, archiveInfo.bytes, archiveInfo.sha256),
    });
'''
new = '''    const finalObject = await r2HeadObject(artifactKey);
    if (finalObject.contentLength !== archiveInfo.bytes) {
      throw new Error(`Tamanho final do objeto R2 divergente: esperado ${archiveInfo.bytes}, recebido ${finalObject.contentLength ?? "desconhecido"}.`);
    }
    const remoteVerification = await verifyStoredBackupObject(artifactKey, archiveInfo.bytes, archiveInfo.sha256, signal);
    const verifiedAt = new Date().toISOString();
    const finalSummary = withBackupRemoteVerification(
      summaryFromManifest(manifest, archiveInfo.bytes, archiveInfo.sha256),
      {
        status: "verified",
        verifiedAt,
        bytes: remoteVerification.bytes,
        sha256: remoteVerification.sha256,
        error: null,
      },
    );
    logBackupDiagnostic(diagnostic, "stage-end", {
      stageName: "verification",
      objectExists: true,
      expectedBytes: archiveInfo.bytes,
      actualBytes: finalObject.contentLength,
      remoteSha256: remoteVerification.sha256,
      aesGcmAuthenticated: true,
      httpStatus: finalObject.httpStatus,
      etag: finalObject.etag,
    });
    await updateRun(id, { artifactKey, fileSize: archiveInfo.bytes, archiveSha256: archiveInfo.sha256, manifestJson: finalSummary });
    throwIfBackupAborted(signal);
    await updateRun(id, {
      status: "completed",
      stage: "completed",
      progress: 100,
      completedAt: new Date(),
      manifestJson: finalSummary,
    });
'''
if old not in text:
    raise SystemExit('final verification block not found')
text = text.replace(old, new, 1)

# Persist verification information in list/get responses.
old = '''    driveError: row.driveStatus === "failed" ? row.driveError : null,
    errorMessage: row.status === "failed" ? row.errorMessage : null,
  }));
}'''
new = '''    driveError: row.driveStatus === "failed" ? row.driveError : null,
    integrityStatus: getBackupRemoteVerification(row.manifestJson).status,
    integrityVerifiedAt: getBackupRemoteVerification(row.manifestJson).verifiedAt,
    integrityError: getBackupRemoteVerification(row.manifestJson).error,
    errorMessage: row.status === "failed" ? row.errorMessage : null,
  }));
}'''
if old not in text:
    raise SystemExit('listSystemBackups response anchor not found')
text = text.replace(old, new, 1)

old = '''    driveError: row.driveStatus === "failed" ? row.driveError : null,
    errorMessage: row.status === "failed" ? row.errorMessage : null,
  };
}'''
new = '''    driveError: row.driveStatus === "failed" ? row.driveError : null,
    integrityStatus: getBackupRemoteVerification(row.manifestJson).status,
    integrityVerifiedAt: getBackupRemoteVerification(row.manifestJson).verifiedAt,
    integrityError: getBackupRemoteVerification(row.manifestJson).error,
    errorMessage: row.status === "failed" ? row.errorMessage : null,
  };
}'''
if old not in text:
    raise SystemExit('getSystemBackup response anchor not found')
text = text.replace(old, new, 1)

# Add async on-demand verification for existing completed backups.
anchor = '''export async function streamSystemBackupArtifact(id: string) {
  const completed = await getCompletedSystemBackup(id);
'''
manual = '''const activeStoredBackupVerifications = new Set<string>();

async function updateStoredBackupVerification(id: string, verification: BackupRemoteVerification) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para atualizar a verificação do backup.");
  const [row] = await db.select({ manifestJson: systemBackups.manifestJson }).from(systemBackups).where(eq(systemBackups.id, id)).limit(1);
  if (!row) throw new Error("Backup não encontrado.");
  await db.update(systemBackups).set({
    manifestJson: withBackupRemoteVerification(row.manifestJson, verification),
  }).where(eq(systemBackups.id, id));
}

export async function startStoredSystemBackupVerification(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para verificar o backup.");
  const [row] = await db.select({
    status: systemBackups.status,
    artifactKey: systemBackups.artifactKey,
    fileSize: systemBackups.fileSize,
    archiveSha256: systemBackups.archiveSha256,
    manifestJson: systemBackups.manifestJson,
  }).from(systemBackups).where(eq(systemBackups.id, id)).limit(1);
  if (!row || row.status !== "completed" || !row.artifactKey || row.fileSize === null || row.fileSize === undefined || !row.archiveSha256) {
    throw new Error("Somente backups concluídos com tamanho e SHA-256 podem ser verificados.");
  }
  if (activeStoredBackupVerifications.has(id) || getBackupRemoteVerification(row.manifestJson).status === "verifying") {
    return { accepted: false as const, id };
  }
  activeStoredBackupVerifications.add(id);
  await updateStoredBackupVerification(id, {
    status: "verifying",
    verifiedAt: null,
    bytes: null,
    sha256: null,
    error: null,
  });
  void (async () => {
    try {
      const verified = await verifyStoredBackupObject(row.artifactKey!, Number(row.fileSize), row.archiveSha256!);
      await updateStoredBackupVerification(id, {
        status: "verified",
        verifiedAt: new Date().toISOString(),
        bytes: verified.bytes,
        sha256: verified.sha256,
        error: null,
      });
    } catch (error) {
      const message = sanitizeDiagnosticValue(error) || "Falha desconhecida na verificação profunda.";
      await updateStoredBackupVerification(id, {
        status: "failed",
        verifiedAt: null,
        bytes: null,
        sha256: null,
        error: message.slice(0, 1000),
      }).catch(() => undefined);
    } finally {
      activeStoredBackupVerifications.delete(id);
    }
  })();
  return { accepted: true as const, id };
}

'''
if anchor not in text:
    raise SystemExit('streamSystemBackupArtifact anchor not found')
text = text.replace(anchor, manual + anchor, 1)

# Reconcile interrupted manual verifications after process restart.
old = '''  for (const row of activeRows) {
    await db.update(systemBackups).set({
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: `Execução interrompida após reinício do serviço. Último estágio persistido: ${row.stage}. Último progresso persistido: ${row.progress}%. Causa do encerramento da instância não determinada pelo processo recuperado; nenhum artefato foi validado.`,
    }).where(eq(systemBackups.id, row.id));
  }
  return activeRows.length;
}'''
new = '''  for (const row of activeRows) {
    await db.update(systemBackups).set({
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: `Execução interrompida após reinício do serviço. Último estágio persistido: ${row.stage}. Último progresso persistido: ${row.progress}%. Causa do encerramento da instância não determinada pelo processo recuperado; nenhum artefato foi validado.`,
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
}'''
if old not in text:
    raise SystemExit('reconcileBackupsAfterRestart anchor not found')
text = text.replace(old, new, 1)

p.write_text(text, encoding='utf-8')

# -----------------------------------------------------------------------------
# server/routers/backup.ts
# -----------------------------------------------------------------------------
p = Path('server/routers/backup.ts')
text = p.read_text(encoding='utf-8')
old = '''  startSystemBackup,
  type BackupManifest,
  streamSystemBackupArtifact,
  uploadSystemBackupToGoogleDrive,
} from "../backupService";'''
new = '''  startSystemBackup,
  startStoredSystemBackupVerification,
  type BackupManifest,
  streamSystemBackupArtifact,
  uploadSystemBackupToGoogleDrive,
} from "../backupService";'''
if old not in text:
    raise SystemExit('backup router import anchor not found')
text = text.replace(old, new, 1)
anchor = '''  sendToDrive: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{48}$/i) }))
    .mutation(({ input }) => uploadSystemBackupToGoogleDrive(input.id)),

'''
addition = anchor + '''  verifyStored: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{48}$/i) }))
    .mutation(({ input }) => startStoredSystemBackupVerification(input.id)),

'''
if anchor not in text:
    raise SystemExit('backup router sendToDrive anchor not found')
text = text.replace(anchor, addition, 1)
p.write_text(text, encoding='utf-8')

# -----------------------------------------------------------------------------
# client/src/pages/AdminBackup.tsx
# -----------------------------------------------------------------------------
p = Path('client/src/pages/AdminBackup.tsx')
text = p.read_text(encoding='utf-8')
anchor = '''  const driveMut = trpc.backup.sendToDrive.useMutation({
    onSuccess: () => {
      toast.success("Backup enviado para o Google Drive.");
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar para o Google Drive."),
  });

'''
addition = anchor + '''  const verifyMut = trpc.backup.verifyStored.useMutation({
    onSuccess: ({ accepted }) => {
      toast.success(accepted ? "Verificação profunda iniciada. A página acompanhará automaticamente." : "Este backup já está sendo verificado.");
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível verificar o arquivo armazenado."),
  });

'''
if anchor not in text:
    raise SystemExit('AdminBackup drive mutation anchor not found')
text = text.replace(anchor, addition, 1)

old = '''                      {backup.status === "completed" && <p className="mt-1 text-xs text-slate-500">Google Drive: {backup.driveStatus === "completed" ? `enviado em ${formatDate(backup.driveUploadedAt)}` : backup.driveStatus === "uploading" ? "enviando..." : backup.driveStatus === "failed" ? "falhou" : backupConfigQuery.data?.driveConfigured ? "não enviado" : "não configurado"}</p>}
                      {backup.errorMessage && <p className="mt-2 flex items-start gap-1.5 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {backup.errorMessage}</p>}
'''
new = '''                      {backup.status === "completed" && <p className="mt-1 text-xs text-slate-500">Google Drive: {backup.driveStatus === "completed" ? `enviado em ${formatDate(backup.driveUploadedAt)}` : backup.driveStatus === "uploading" ? "enviando..." : backup.driveStatus === "failed" ? "falhou" : backupConfigQuery.data?.driveConfigured ? "não enviado" : "não configurado"}</p>}
                      {backup.status === "completed" && (
                        <p className={`mt-1 text-xs ${backup.integrityStatus === "verified" ? "text-emerald-300" : backup.integrityStatus === "failed" ? "text-red-300" : backup.integrityStatus === "verifying" ? "text-amber-300" : "text-slate-500"}`}>
                          Integridade profunda: {backup.integrityStatus === "verified" ? `verificada${backup.integrityVerifiedAt ? ` em ${formatDate(backup.integrityVerifiedAt)}` : ""}` : backup.integrityStatus === "verifying" ? "verificando o arquivo armazenado..." : backup.integrityStatus === "failed" ? "falhou" : "pendente"}
                        </p>
                      )}
                      {backup.integrityError && <p className="mt-2 flex items-start gap-1.5 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {backup.integrityError}</p>}
                      {backup.errorMessage && <p className="mt-2 flex items-start gap-1.5 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {backup.errorMessage}</p>}
'''
if old not in text:
    raise SystemExit('AdminBackup status text anchor not found')
text = text.replace(old, new, 1)

old = '''                      <div className="flex flex-col gap-2 sm:flex-row">
                        <a href={`/api/admin/backups/${backup.id}/download`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-xs font-black text-cyan-100 hover:bg-cyan-300/20">
                          <Download className="h-4 w-4" /> Baixar para o computador
                        </a>
'''
new = '''                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() => verifyMut.mutate({ id: backup.id })}
                          disabled={verifyMut.isPending || backup.integrityStatus === "verifying" || backup.integrityStatus === "verified"}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-4 py-2.5 text-xs font-black text-emerald-100 hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Lê novamente o arquivo inteiro no R2, confere tamanho, SHA-256 e autenticação AES-GCM"
                        >
                          {verifyMut.isPending && verifyMut.variables?.id === backup.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          {backup.integrityStatus === "verified" ? "Integridade OK" : backup.integrityStatus === "verifying" ? "Verificando..." : backup.integrityStatus === "failed" ? "Verificar novamente" : "Verificar arquivo"}
                        </button>
                        <a href={`/api/admin/backups/${backup.id}/download`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-xs font-black text-cyan-100 hover:bg-cyan-300/20">
                          <Download className="h-4 w-4" /> Baixar para o computador
                        </a>
'''
if old not in text:
    raise SystemExit('AdminBackup actions anchor not found')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')

# -----------------------------------------------------------------------------
# server/backupService.test.ts
# -----------------------------------------------------------------------------
p = Path('server/backupService.test.ts')
text = p.read_text(encoding='utf-8')
old = 'import { createHash } from "node:crypto";\n'
new = 'import { createHash } from "node:crypto";\nimport { Readable } from "node:stream";\n'
if old not in text:
    raise SystemExit('test stream import anchor not found')
text = text.replace(old, new, 1)
old = 'import { BACKUP_ARCHIVE_AUTH_TAG_BYTES, BACKUP_ARCHIVE_HEADER_BYTES, BACKUP_STALE_AFTER_MS, concatenateDumplingSqlFiles, createEncryptedArchiveStream, DEFAULT_DUMPLING_CA_PATH, encryptedArchiveLength, isBackupStale, logProcessDiagnostic, measureTarArchiveBytes, orderDumplingSqlFiles, parseDatabaseUrl, resolveDumplingTlsPaths, safeBackupObjectPath } from "./backupService";'
new = 'import { BACKUP_ARCHIVE_AUTH_TAG_BYTES, BACKUP_ARCHIVE_HEADER_BYTES, BACKUP_STALE_AFTER_MS, concatenateDumplingSqlFiles, createEncryptedArchiveStream, DEFAULT_DUMPLING_CA_PATH, encryptedArchiveLength, getBackupRemoteVerification, isBackupStale, logProcessDiagnostic, measureTarArchiveBytes, orderDumplingSqlFiles, parseDatabaseUrl, resolveDumplingTlsPaths, safeBackupObjectPath, verifyEncryptedArchiveStreamContent } from "./backupService";'
if old not in text:
    raise SystemExit('test backup import anchor not found')
text = text.replace(old, new, 1)

anchor = '''  it("rejeita timeout de inatividade da cifra e limpa o subprocesso", async () => {
'''
addition = '''  it("revalida tamanho, SHA-256 e autenticação AES-GCM do pacote armazenado", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "wajuda-deep-verify-test-"));
    try {
      await writeFile(path.join(directory, "database.sql"), "CREATE TABLE teste (id INT);\\n");
      await writeFile(path.join(directory, "manifest.json"), '{"formatVersion":1}\\n');
      const archive = createEncryptedArchiveStream(directory);
      const chunks: Buffer[] = [];
      for await (const chunk of archive.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const created = await archive.completion;
      const body = Buffer.concat(chunks);
      await expect(verifyEncryptedArchiveStreamContent(Readable.from(body), created.bytes, created.sha256)).resolves.toEqual(created);

      const corrupted = Buffer.from(body);
      corrupted[Math.floor(corrupted.length / 2)] ^= 0x01;
      await expect(verifyEncryptedArchiveStreamContent(Readable.from(corrupted), created.bytes, created.sha256)).rejects.toThrow(/SHA-256/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("trata backups antigos sem verificação profunda como pendentes", () => {
    expect(getBackupRemoteVerification('{"formatVersion":1}')).toMatchObject({ status: "not_verified", verifiedAt: null, error: null });
  });

'''+anchor
if anchor not in text:
    raise SystemExit('test insertion anchor not found')
text = text.replace(anchor, addition, 1)
p.write_text(text, encoding='utf-8')
