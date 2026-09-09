import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[backup-core-no-r2] ${label}: esperado 1 bloco, encontrado ${count}`);
  return source.replace(oldText, newText);
}

function replaceRegexOnce(source, regex, newText, label) {
  const matches = source.match(regex);
  if (!matches || matches.length !== 1) throw new Error(`[backup-core-no-r2] ${label}: bloco esperado nao encontrado de forma unica`);
  return source.replace(regex, newText);
}

// O Backup Core novo NAO le, lista, baixa, poda ou restaura objetos do R2.
// Banco/codigo ficam no Core. Fotos/documentos/audios ficam exclusivamente
// no Media Backup V2. Assim o fluxo antigo que podia crescer/entrar em loop
// nunca e acionado durante a criacao de um novo Core.
const backupFile = 'server/backupService.ts';
let backupSource = fs.readFileSync(backupFile, 'utf8');

backupSource = replaceRegexOnce(
  backupSource,
  /async function listAllR2Objects\(\): Promise<R2ObjectInfo\[]> \{[\s\S]*?\n\}\n\n(?=export type BackupRemoteVerificationStatus)/,
`async function listAllR2Objects(): Promise<R2ObjectInfo[]> {
  // Core V2 sem R2: nenhuma paginacao, download ou copia de midia.
  // O Media Backup V2 e o unico responsavel pelos objetos do R2.
  return [];
}

`,
  'desativar listagem R2 no Core',
);

backupSource = replaceOnce(
  backupSource,
  '    mode: "full" | "core-h2ads";\n',
  '    mode: "full" | "core-h2ads" | "core-no-r2";\n',
  'tipo do manifesto Core sem R2',
);

backupSource = replaceOnce(
  backupSource,
`      r2: {
        mode: "core-h2ads",
        prefix: "h2ads-session-snapshots",`,
`      r2: {
        mode: "core-no-r2",
        prefix: "",`,
  'manifesto Core sem R2',
);

backupSource = backupSource.replace(
  '"snapshots de sessao/login H2ADS paginados e comparados por tamanho",',
  '"R2 excluido do Backup Core; midias protegidas separadamente pelo Media Backup V2",',
);
backupSource = backupSource.replace(
  '"SHA-256 calculado para cada snapshot de sessao H2ADS",',
  '"nenhuma listagem, download ou poda de R2 executada pelo Backup Core",',
);
// As frases acima podem conter acentos porque foram inseridas pelo patch anterior.
backupSource = backupSource.replace(
  '"snapshots de sessão/login H2ADS paginados e comparados por tamanho",',
  '"R2 excluído do Backup Core; mídias protegidas separadamente pelo Media Backup V2",',
);
backupSource = backupSource.replace(
  '"SHA-256 calculado para cada snapshot de sessão H2ADS",',
  '"nenhuma listagem, download ou poda de R2 executada pelo Backup Core",',
);

fs.writeFileSync(backupFile, backupSource, 'utf8');

// Restauracao do novo formato Core: preservar R2 integralmente.
// Backups antigos continuam legiveis pelo formato anterior, mas um Core novo
// nunca considera o R2 parte do snapshot.
const restoreFile = 'server/backupRestoreService.ts';
let restoreSource = fs.readFileSync(restoreFile, 'utf8');

restoreSource = replaceOnce(
  restoreSource,
  '    mode?: "full" | "core-h2ads";\n',
  '    mode?: "full" | "core-h2ads" | "core-no-r2";\n',
  'tipo RestoreManifest Core sem R2',
);

restoreSource = replaceOnce(
  restoreSource,
`async function restoreR2Snapshot(root: string, manifest: RestoreManifest, restoreId: string) {
  const mode: "full" | "core-h2ads" = manifest.r2.mode === "core-h2ads" ? "core-h2ads" : "full";`,
`async function restoreR2Snapshot(root: string, manifest: RestoreManifest, restoreId: string) {
  if (manifest.r2.mode === "core-no-r2") {
    updateRestore({
      stage: "r2-prune",
      progress: 94,
      message: "Backup Core sem R2: fotos, documentos, audios e demais midias foram preservados sem qualquer alteracao.",
    });
    return;
  }

  const mode: "full" | "core-h2ads" = manifest.r2.mode === "core-h2ads" ? "core-h2ads" : "full";`,
  'restauracao preservando R2',
);

fs.writeFileSync(restoreFile, restoreSource, 'utf8');

// Painel: deixar claro que o Core nao movimenta midias.
const uiFile = 'client/src/pages/AdminBackup.tsx';
let uiSource = fs.readFileSync(uiFile, 'utf8');
uiSource = uiSource.replace(
  'O Backup Core protege o banco inteiro, código, migrações, configurações de recuperação e as sessões/login do H2ADS. Fotos, documentos, áudios e demais mídias ficam no Backup de Mídia incremental logo abaixo. Assim o Core termina rápido e não precisa movimentar mais de 4 GB a cada execução.',
  'O Backup Core protege o banco inteiro, código, migrações e configurações de recuperação. Ele não lê nem copia o R2. Fotos, documentos, áudios e demais mídias ficam exclusivamente no Backup de Mídia V2 logo abaixo, evitando o loop e o crescimento do backup antigo.'
);
uiSource = uiSource.replace('r2: "Sessões H2ADS"', 'r2: "Mídia separada"');
uiSource = uiSource.replace('"r2-list": "Listando sessões H2ADS"', '"r2-list": "R2 fora do Core"');
uiSource = uiSource.replace('"r2-download": "Protegendo sessões H2ADS"', '"r2-download": "Sem cópia de mídia"');
fs.writeFileSync(uiFile, uiSource, 'utf8');

console.log('[backup-core-no-r2] OK: Core sem R2; Media Backup V2 isolado; restauracao Core preserva midias.');
