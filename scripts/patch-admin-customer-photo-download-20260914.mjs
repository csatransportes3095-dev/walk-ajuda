import fs from 'node:fs';

const clientFile = 'client/src/pages/AdminCustomers.tsx';
const serverFile = 'server/_core/storageProxy.ts';

let client = fs.readFileSync(clientFile, 'utf8');
let server = fs.readFileSync(serverFile, 'utf8');

const clientMarker = '/api/admin/profile-photo-download?url=';
if (!client.includes(clientMarker)) {
  const startMarker = '  const handleDownloadPhoto = async (url: string, name: string) => {';
  const endMarker = '\n\n  const handleDelete =';
  const start = client.indexOf(startMarker);
  const end = client.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('[photo-download] handler handleDownloadPhoto nao encontrado de forma segura');
  }

  const handler = [
    '  const handleDownloadPhoto = async (url: string, name: string) => {',
    '    try {',
    "      const downloadUrl = '/api/admin/profile-photo-download?url=' + encodeURIComponent(url);",
    '      const response = await fetch(downloadUrl, { credentials: \'same-origin\' });',
    "      if (!response.ok) throw new Error('HTTP ' + response.status);",
    '      const blob = await response.blob();',
    "      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';",
    "      const safeName = name.replace(/[^a-zA-Z0-9\\u00C0-\\u017F\\s]/g, '').trim().replace(/\\s+/g, '_');",
    "      const objectUrl = URL.createObjectURL(blob);",
    "      const a = document.createElement('a');",
    '      a.href = objectUrl;',
    '      a.download = `foto_${safeName}.${ext}`;',
    '      document.body.appendChild(a);',
    '      a.click();',
    '      a.remove();',
    '      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);',
    "      toast.success('Foto salva!');",
    '    } catch (error) {',
    "      console.error('[ProfilePhotoDownload] falha:', error);",
    "      toast.error('Erro ao baixar foto');",
    '    }',
    '  };',
  ].join('\n');

  client = client.slice(0, start) + handler + client.slice(end);
}

const r2Import = 'import { r2GetObjectBuffer } from "../r2Storage";';
if (!server.includes(r2Import)) {
  const importAnchor = 'import { ENV } from "./env";';
  if (!server.includes(importAnchor)) throw new Error('[photo-download] import anchor do storageProxy nao encontrado');
  server = server.replace(importAnchor, importAnchor + '\n' + r2Import);
}

const serverMarker = 'app.get("/api/admin/profile-photo-download"';
if (!server.includes(serverMarker)) {
  const functionAnchor = 'export function registerStorageProxy(app: Express) {\n';
  if (!server.includes(functionAnchor)) throw new Error('[photo-download] registerStorageProxy nao encontrado');

  const route = [
    '  // Download de foto do cadastro pelo proprio dominio: evita CORS do dominio publico do R2.',
    '  // Restrito ao mesmo bucket publico e somente a profile-photos/.',
    '  app.get("/api/admin/profile-photo-download", async (req, res) => {',
    '    try {',
    '      const rawUrl = String(req.query.url || "");',
    '      const target = new URL(rawUrl);',
    '      const publicOrigin = new URL(ENV.r2PublicUrl.trim()).origin;',
    '      if (target.origin !== publicOrigin || !target.pathname.startsWith("/profile-photos/")) {',
    '        res.status(400).send("Invalid profile photo URL");',
    '        return;',
    '      }',
    '',
    '      const key = target.pathname.replace(/^\\/+/, "");',
    '      const buffer = await r2GetObjectBuffer(key);',
    '      if (!buffer.length) {',
    '        res.status(404).send("Profile photo not found");',
    '        return;',
    '      }',
    '',
    '      const lowerPath = target.pathname.toLowerCase();',
    '      const contentType = lowerPath.endsWith(".png")',
    '        ? "image/png"',
    '        : lowerPath.endsWith(".webp")',
    '          ? "image/webp"',
    '          : lowerPath.endsWith(".gif")',
    '            ? "image/gif"',
    '            : "image/jpeg";',
    '',
    '      res.status(200);',
    '      res.set("Content-Type", contentType);',
    '      res.set("Content-Length", String(buffer.length));',
    '      res.set("Cache-Control", "no-store, private");',
    '      res.end(buffer);',
    '    } catch (error) {',
    '      console.error("[ProfilePhotoDownload] failed:", error);',
    '      if (!res.headersSent) res.status(502).send("Profile photo download failed");',
    '    }',
    '  });',
    '',
  ].join('\n');

  server = server.replace(functionAnchor, functionAnchor + route);
}

if (!client.includes(clientMarker)) throw new Error('[photo-download] cliente nao recebeu proxy de download');
if (!server.includes(serverMarker)) throw new Error('[photo-download] rota de download nao foi registrada');
if (!server.includes(r2Import)) throw new Error('[photo-download] import R2 ausente');

fs.writeFileSync(clientFile, client, 'utf8');
fs.writeFileSync(serverFile, server, 'utf8');
console.log('[photo-download] OK: somente handler da foto + rota isolada de download foram alterados.');
