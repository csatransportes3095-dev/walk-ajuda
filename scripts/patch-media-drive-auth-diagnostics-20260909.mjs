import fs from 'node:fs';

const file = 'server/mediaBackupService.ts';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[media-drive-auth] ${label}: esperado 1 bloco, encontrado ${count}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
`async function getGoogleDriveAccessToken() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Drive não configurado para o backup de mídia.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(\`Google Drive recusou a autorização do backup de mídia (HTTP \${response.status}).\`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Google Drive não devolveu token para o backup de mídia.");
  return payload.access_token;
}`,
`function cleanGoogleDriveCredential(raw: string | undefined) {
  let value = (raw || "").trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim();
    }
  }
  return value;
}

function safeGoogleOAuthDetail(value: unknown) {
  return String(value || "")
    .replace(/[\\r\\n\\t]+/g, " ")
    .replace(/\\s{2,}/g, " ")
    .slice(0, 300);
}

async function getGoogleDriveAccessToken() {
  const clientId = cleanGoogleDriveCredential(process.env.GOOGLE_DRIVE_CLIENT_ID);
  const clientSecret = cleanGoogleDriveCredential(process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  const refreshToken = cleanGoogleDriveCredential(process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Drive não configurado para o backup de mídia.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const rawBody = await response.text();
  let payload: { access_token?: string; error?: string; error_description?: string } = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) as typeof payload : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const oauthError = safeGoogleOAuthDetail(payload.error || "unknown_error");
    const oauthDescription = safeGoogleOAuthDetail(payload.error_description || "");
    console.error(\`[MediaBackup][DriveAuth] http=\${response.status} oauthError=\${oauthError} description=\${oauthDescription || "none"}\`);

    if (oauthError === "invalid_grant") {
      throw new Error("Autorização do Google Drive expirou ou foi revogada (invalid_grant). Atualize GOOGLE_DRIVE_REFRESH_TOKEN no Render.");
    }
    if (oauthError === "invalid_client") {
      throw new Error("Google Drive recusou o Client ID/Client Secret (invalid_client). Revise GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET no Render.");
    }
    throw new Error(\`Google Drive recusou a autorização do backup de mídia (HTTP \${response.status}, \${oauthError}).\`);
  }

  if (!payload.access_token) throw new Error("Google Drive não devolveu token para o backup de mídia.");
  return payload.access_token;
}`,
'erro OAuth detalhado e credenciais normalizadas',
);

replaceOnce(
`    await ensureMediaTables(connection);
    const sourceObjects = await listSourceMediaObjects();
    const objectRows = await loadObjectRows(connection);
    const alreadySynced = sourceObjects.filter((object) => objectMatches(objectRows.get(keyHash(object.key)), object));
    let completedObjects = alreadySynced.length;
    let completedBytes = alreadySynced.reduce((sum, object) => sum + object.size, 0);
    const totalBytes = sourceObjects.reduce((sum, object) => sum + object.size, 0);

    await connection.query(
      \`UPDATE systemMediaBackupRuns SET totalObjects=?, totalBytes=?, completedObjects=?, completedBytes=?, status='running', currentKey=NULL, errorMessage=NULL, updatedAt=NOW(3) WHERE id=?\`,
      [sourceObjects.length, totalBytes, completedObjects, completedBytes, id],
    );

    const accessToken = await getGoogleDriveAccessToken();
    const folderId = await ensureDriveMediaFolder(accessToken);
    await writeRunProgress(connection, id, { driveFolderId: folderId });`,
`    await ensureMediaTables(connection);

    // Valida OAuth e pasta do Drive antes de listar/ler qualquer mídia do R2.
    // Assim uma credencial vencida falha em segundos, sem varrer milhares de objetos.
    const accessToken = await getGoogleDriveAccessToken();
    const folderId = await ensureDriveMediaFolder(accessToken);
    await writeRunProgress(connection, id, { driveFolderId: folderId });

    const sourceObjects = await listSourceMediaObjects();
    const objectRows = await loadObjectRows(connection);
    const alreadySynced = sourceObjects.filter((object) => objectMatches(objectRows.get(keyHash(object.key)), object));
    let completedObjects = alreadySynced.length;
    let completedBytes = alreadySynced.reduce((sum, object) => sum + object.size, 0);
    const totalBytes = sourceObjects.reduce((sum, object) => sum + object.size, 0);

    await connection.query(
      \`UPDATE systemMediaBackupRuns SET totalObjects=?, totalBytes=?, completedObjects=?, completedBytes=?, status='running', currentKey=NULL, errorMessage=NULL, updatedAt=NOW(3) WHERE id=?\`,
      [sourceObjects.length, totalBytes, completedObjects, completedBytes, id],
    );`,
'validar Drive antes da varredura R2',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[media-drive-auth] OK: OAuth detalhado, credenciais normalizadas e Drive validado antes do R2.');
