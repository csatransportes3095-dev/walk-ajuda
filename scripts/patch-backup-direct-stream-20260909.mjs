import fs from 'node:fs';

const file = 'server/backupService.ts';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[backup-direct] ${label}: esperado 1 bloco, encontrado ${count}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
`    diagnostic.stage = "archive-size";
    logBackupDiagnostic(diagnostic, "archive-size-pass-start", { progress: 88 });
    const plaintextTarBytes = await measureTarArchiveBytes(workDirectory, diagnostic);
    const expectedContentLength = encryptedArchiveLength(plaintextTarBytes);
    logBackupDiagnostic(diagnostic, "archive-size-pass-end", {
      plaintextTarBytes,
      expectedContentLength,
      overheadBytes: expectedContentLength - plaintextTarBytes,
    });
    diagnostic.stage = "archive";
    const archiveInputBytes = Math.max(plaintextTarBytes, 1);
`,
`    // Não faça uma segunda leitura de todo o workspace só para descobrir o tamanho.
    // O multipart do R2 aceita tamanho desconhecido e contabiliza os bytes reais.
    // Isso elimina a etapa archive-size que estava relendo ~4,5 GB antes do upload.
    diagnostic.stage = "archive";
    logBackupDiagnostic(diagnostic, "archive-direct-stream-start", { progress: 88 });
`,
'pre-pass archive-size',
);

replaceOnce(
`      const progress = 88 + Math.min(6, Math.floor((processedBytes / archiveInputBytes) * 6));
      void updateRun(id, { stage: "archive", progress }).catch(() => undefined);`,
`      // Sem Content-Length pré-calculado, o progresso desta fase é deliberadamente
      // simples: 90% enquanto cifra/transmite; 95% quando o stream termina.
      void updateRun(id, { stage: "archive", progress: 90 }).catch(() => undefined);`,
'progresso do archive',
);

replaceOnce(
`    const uploadOutcome = r2PutObjectStream(artifactKey, encrypted.stream, "application/octet-stream", expectedContentLength, { backupId: id, stage: "r2-upload" }).then(`,
`    const uploadOutcome = r2PutObjectStream(artifactKey, encrypted.stream, "application/octet-stream", undefined, { backupId: id, stage: "r2-upload" }).then(`,
'upload sem Content-Length previo',
);

replaceOnce(
`      archiveInfo = await encrypted.completion;
      if (archiveInfo.bytes !== expectedContentLength) {
        throw new Error(\`Tamanho cifrado divergente: esperado \${expectedContentLength}, produzido \${archiveInfo.bytes}.\`);
      }
      diagnostic.stage = "r2-upload";`,
`      archiveInfo = await encrypted.completion;
      if (!Number.isSafeInteger(archiveInfo.bytes) || archiveInfo.bytes <= BACKUP_ARCHIVE_HEADER_BYTES + BACKUP_ARCHIVE_AUTH_TAG_BYTES) {
        throw new Error("Pacote cifrado produzido com tamanho inválido.");
      }
      diagnostic.stage = "r2-upload";`,
'validacao do tamanho produzido',
);

replaceOnce(
`  const progressCounter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      processedBytes += buffer.length;
      onBytes?.(processedBytes);
      callback(null, buffer);
    },
  });`,
`  let bytesSinceEventLoopYield = 0;
  const progressCounter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      processedBytes += buffer.length;
      bytesSinceEventLoopYield += buffer.length;
      onBytes?.(processedBytes);
      // TARs multi-GB podem entregar dados rápido demais e monopolizar o loop do Node.
      // Cede o event loop periodicamente para manter HTTP/heartbeat responsivos.
      if (bytesSinceEventLoopYield >= 32 * 1024 * 1024) {
        bytesSinceEventLoopYield = 0;
        setImmediate(() => callback(null, buffer));
      } else {
        callback(null, buffer);
      }
    },
  });`,
'yield do stream de criptografia',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[backup-direct] OK: archive-size removido; cifra e upload agora são um único fluxo.');
