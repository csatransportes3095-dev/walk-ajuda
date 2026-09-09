import fs from 'node:fs';

const file = 'client/src/pages/AdminBackup.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[backup-media-ui] ${label}: esperado 1 bloco, encontrado ${count}`);
  source = source.replace(oldText, newText);
}

if (!source.includes('import MediaBackupPanel from "@/components/MediaBackupPanel";')) {
  replaceOnce(
    'import AdminHeader from "@/components/AdminHeader";\n',
    'import AdminHeader from "@/components/AdminHeader";\nimport MediaBackupPanel from "@/components/MediaBackupPanel";\n',
    'import MediaBackupPanel',
  );
}

if (!source.includes('<MediaBackupPanel />')) {
  replaceOnce(
    '        <section className="rounded-2xl border border-white/10 bg-[#111128] p-5">\n          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">\n            <div>\n              <h2 className="text-lg font-black">Histórico de backups</h2>',
    '        <MediaBackupPanel />\n\n        <section className="rounded-2xl border border-white/10 bg-[#111128] p-5">\n          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">\n            <div>\n              <h2 className="text-lg font-black">Histórico de backups</h2>',
    'painel antes do historico',
  );
}

fs.writeFileSync(file, source, 'utf8');
console.log('[backup-media-ui] OK: painel incremental de mídia integrado ao /admin/backup.');
