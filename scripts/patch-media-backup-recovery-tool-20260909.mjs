import fs from 'node:fs';

const file = 'server/mediaBackupService.ts';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[backup-media-tool] ${label}: esperado 1 bloco, encontrado ${count}`);
  source = source.replace(oldText, newText);
}

if (!source.includes('async function uploadMediaRecoveryTool(')) {
  replaceOnce(
`async function executeMediaBackup(id: string, signal: AbortSignal) {`,
`async function uploadMediaRecoveryTool(input: { accessToken: string; folderId: string; runId: string }) {
  const toolPath = path.resolve("scripts/h2-media-recovery.mjs");
  const fileInfo = await stat(toolPath);
  if (!fileInfo.isFile() || fileInfo.size <= 0) throw new Error("Ferramenta externa de recuperação de mídia não encontrada no build.");
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${input.accessToken}\`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "text/javascript",
      "X-Upload-Content-Length": String(fileInfo.size),
    },
    body: JSON.stringify({
      name: \`H2_MEDIA_RECOVERY_TOOL_\${input.runId}.mjs\`,
      description: "Ferramenta independente para restaurar arquivos .h2m.enc. Exige BACKUP_ENCRYPTION_KEY separada.",
      parents: [input.folderId],
    }),
  });
  const uploadUrl = response.headers.get("location");
  if (!response.ok || !uploadUrl) throw new Error("Google Drive não criou sessão para a ferramenta externa de recuperação de mídia.");
  return await uploadGoogleDriveResumableFile({ uploadUrl, accessToken: input.accessToken, filePath: toolPath, totalBytes: fileInfo.size });
}

async function executeMediaBackup(id: string, signal: AbortSignal) {`,
'helper de upload da ferramenta',
  );
}

if (!source.includes('const recoveryToolDriveFileId =')) {
  replaceOnce(
`    const manifestDriveFileId = await uploadRecoveryIndex({ connection, accessToken, folderId, runId: id, sourceObjects });
    await writeRunProgress(connection, id, {`,
`    const manifestDriveFileId = await uploadRecoveryIndex({ connection, accessToken, folderId, runId: id, sourceObjects });
    const recoveryToolDriveFileId = (await uploadMediaRecoveryTool({ accessToken, folderId, runId: id })).id;
    console.log(\`[MediaBackup] recovery-tool-uploaded runId=\${id} driveFileId=\${recoveryToolDriveFileId}\`);
    await writeRunProgress(connection, id, {`,
'upload da ferramenta ao concluir',
  );
}

fs.writeFileSync(file, source, 'utf8');
console.log('[backup-media-tool] OK: ferramenta externa será enviada ao Drive junto do índice.');
