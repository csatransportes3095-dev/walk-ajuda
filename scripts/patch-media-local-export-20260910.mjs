import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[media-local-export] ${label}: esperado 1 bloco, encontrado ${count}`);
  return source.replace(oldText, newText);
}

// Backend: rotas administrativas para exportar as midias do R2 diretamente
// para o computador, um arquivo por vez, mantendo cada pacote cifrado.
const indexFile = 'server/_core/index.ts';
let indexSource = fs.readFileSync(indexFile, 'utf8');

if (!indexSource.includes('getLocalMediaBackupManifest')) {
  indexSource = replaceOnce(
    indexSource,
    'import { getBackupDownload, getBackupDownloadName } from "../routers/backup";\n',
    'import { getBackupDownload, getBackupDownloadName, isAdminBackupRequest } from "../routers/backup";\nimport { getLocalMediaBackupManifest, getLocalMediaRecoveryToolPath, prepareLocalMediaBackupFile } from "../localMediaBackupService";\n',
    'imports do backup local de midia',
  );
}

if (!indexSource.includes('/api/admin/media-backup-local/manifest')) {
  indexSource = replaceOnce(
    indexSource,
`  app.get("/api/admin/backups/:id/download", async (req, res) => {
    try {
      const artifact = await getBackupDownload(req, req.params.id);
      if (!artifact) {
        res.status(404).json({ error: "Backup não encontrado ou não autorizado." });
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", \`attachment; filename="\${getBackupDownloadName(artifact.id)}"\`);
      res.setHeader("Cache-Control", "no-store, private");
      if (artifact.fileSize !== null && artifact.fileSize !== undefined) {
        res.setHeader("Content-Length", String(artifact.fileSize));
      }
      artifact.body.pipe(res);
    } catch (error) {
      console.error("[Backup] falha no download administrativo:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível baixar o backup." });
    }
  });`,
`  app.get("/api/admin/backups/:id/download", async (req, res) => {
    try {
      const artifact = await getBackupDownload(req, req.params.id);
      if (!artifact) {
        res.status(404).json({ error: "Backup não encontrado ou não autorizado." });
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", \`attachment; filename="\${getBackupDownloadName(artifact.id)}"\`);
      res.setHeader("Cache-Control", "no-store, private");
      if (artifact.fileSize !== null && artifact.fileSize !== undefined) {
        res.setHeader("Content-Length", String(artifact.fileSize));
      }
      artifact.body.pipe(res);
    } catch (error) {
      console.error("[Backup] falha no download administrativo:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível baixar o backup." });
    }
  });

  app.get("/api/admin/media-backup-local/manifest", async (req, res) => {
    if (!isAdminBackupRequest(req)) {
      res.status(403).json({ error: "Acesso administrativo obrigatório." });
      return;
    }
    try {
      const manifest = await getLocalMediaBackupManifest();
      res.setHeader("Cache-Control", "no-store, private");
      res.json(manifest);
    } catch (error) {
      console.error("[MediaLocal] falha ao montar manifesto:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: error instanceof Error ? error.message : "Não foi possível montar o backup local de mídia." });
    }
  });

  app.get("/api/admin/media-backup-local/file", async (req, res) => {
    if (!isAdminBackupRequest(req)) {
      res.status(403).json({ error: "Acesso administrativo obrigatório." });
      return;
    }
    const sourceKey = typeof req.query.sourceKey === "string" ? req.query.sourceKey : "";
    const expectedSize = Number(typeof req.query.expectedSize === "string" ? req.query.expectedSize : NaN);
    const expectedEtag = typeof req.query.expectedEtag === "string" ? req.query.expectedEtag : null;
    let prepared: Awaited<ReturnType<typeof prepareLocalMediaBackupFile>> | null = null;
    try {
      prepared = await prepareLocalMediaBackupFile({ sourceKey, expectedSize, expectedEtag });
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", \`attachment; filename="\${prepared.fileName}"\`);
      res.setHeader("Content-Length", String(prepared.encryptedBytes));
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("X-H2-Source-SHA256", prepared.sourceSha256);
      res.setHeader("X-H2-Encrypted-SHA256", prepared.encryptedSha256);
      const readStream = fs.createReadStream(prepared.tempPath);
      const cleanup = () => { if (prepared) void fs.promises.rm(prepared.tempPath, { force: true }).catch(() => undefined); };
      readStream.once("error", cleanup);
      res.once("close", cleanup);
      res.once("finish", cleanup);
      readStream.pipe(res);
    } catch (error) {
      if (prepared) await fs.promises.rm(prepared.tempPath, { force: true }).catch(() => undefined);
      console.error("[MediaLocal] falha ao preparar arquivo:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : "Não foi possível preparar a mídia." });
    }
  });

  app.get("/api/admin/media-backup-local/recovery-tool", async (req, res) => {
    if (!isAdminBackupRequest(req)) {
      res.status(403).json({ error: "Acesso administrativo obrigatório." });
      return;
    }
    try {
      const toolPath = getLocalMediaRecoveryToolPath();
      const info = await fs.promises.stat(toolPath);
      if (!info.isFile() || info.size <= 0) throw new Error("Ferramenta de recuperação não encontrada.");
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="H2_MEDIA_RECOVERY_TOOL.mjs"');
      res.setHeader("Content-Length", String(info.size));
      res.setHeader("Cache-Control", "no-store, private");
      fs.createReadStream(toolPath).pipe(res);
    } catch (error) {
      console.error("[MediaLocal] falha ao baixar ferramenta de recuperação:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível baixar a ferramenta de recuperação." });
    }
  });`,
    'rotas do backup local de midia',
  );
}

fs.writeFileSync(indexFile, indexSource, 'utf8');

// Frontend: substitui o painel de Drive por exportacao local usando File System Access API.
const panelFile = 'client/src/components/MediaBackupPanel.tsx';
const panelSource = `import { AlertTriangle, CheckCircle2, Download, FolderOpen, HardDrive, Loader2, PauseCircle, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return \`\${size.toFixed(index === 0 ? 0 : 2)} \${units[index]}\`;
}

type LocalManifestObject = {
  sourceKey: string;
  sourceSize: number;
  sourceEtag: string | null;
  sourceLastModified: string | null;
  fileName: string;
  encryptedBytes: number;
};

type LocalManifest = {
  format: "H2_MEDIA_LOCAL_EXPORT_V1";
  createdAt: string;
  objectCount: number;
  totalSourceBytes: number;
  encryption: string;
  keyRequired: string;
  keyFingerprint: string;
  objects: LocalManifestObject[];
};

type CompletedEntry = LocalManifestObject & {
  sourceSha256: string;
  encryptedSha256: string;
  syncedAt: string;
};

type LocalState = {
  format: "H2_MEDIA_LOCAL_STATE_V1";
  keyFingerprint: string;
  completed: Record<string, CompletedEntry>;
};

async function writeTextFile(directory: any, name: string, text: string) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function readJsonFile(directory: any, name: string) {
  try {
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    return JSON.parse(await file.text());
  } catch { return null; }
}

async function fetchJson(url: string) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || \`HTTP \${response.status}\`);
  return payload;
}

export default function MediaBackupPanel() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [doneObjects, setDoneObjects] = useState(0);
  const [totalObjects, setTotalObjects] = useState(0);
  const [doneBytes, setDoneBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const supported = typeof window !== "undefined" && typeof (window as any).showDirectoryPicker === "function";

  const startLocalBackup = async () => {
    if (!supported) {
      toast.error("Use Chrome ou Edge no computador para escolher uma pasta e salvar o backup diretamente.");
      return;
    }
    setRunning(true); setCompleted(false); setLastError(null); setProgress(0); setCurrentKey(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const manifest = await fetchJson("/api/admin/media-backup-local/manifest") as LocalManifest;
      const root = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      const backupDir = await root.getDirectoryHandle("H2_MEDIA_BACKUP_LOCAL", { create: true });
      const filesDir = await backupDir.getDirectoryHandle("arquivos", { create: true });
      setTotalObjects(manifest.objectCount);
      setTotalBytes(manifest.totalSourceBytes);

      const oldState = await readJsonFile(backupDir, ".h2-local-state.json") as LocalState | null;
      const state: LocalState = oldState?.format === "H2_MEDIA_LOCAL_STATE_V1" && oldState.keyFingerprint === manifest.keyFingerprint
        ? oldState
        : { format: "H2_MEDIA_LOCAL_STATE_V1", keyFingerprint: manifest.keyFingerprint, completed: {} };

      let objectsDone = 0;
      let bytesDone = 0;
      for (const object of manifest.objects) {
        const previous = state.completed[object.sourceKey];
        if (previous && previous.sourceSize === object.sourceSize && previous.sourceEtag === object.sourceEtag && previous.fileName === object.fileName) {
          try {
            const existingHandle = await filesDir.getFileHandle(object.fileName);
            const existingFile = await existingHandle.getFile();
            if (existingFile.size === object.encryptedBytes) {
              objectsDone += 1; bytesDone += object.sourceSize;
              setDoneObjects(objectsDone); setDoneBytes(bytesDone);
              setProgress(Math.floor((objectsDone / Math.max(manifest.objectCount, 1)) * 100));
              continue;
            }
          } catch { /* arquivo ausente: baixa novamente */ }
        }

        if (controller.signal.aborted) throw new Error("Backup interrompido pelo administrador.");
        setCurrentKey(object.sourceKey);
        const params = new URLSearchParams({
          sourceKey: object.sourceKey,
          expectedSize: String(object.sourceSize),
          ...(object.sourceEtag ? { expectedEtag: object.sourceEtag } : {}),
        });
        const response = await fetch(\`/api/admin/media-backup-local/file?\${params.toString()}\`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || \`Falha ao baixar \${object.sourceKey} (HTTP \${response.status}).\`);
        }
        const sourceSha256 = response.headers.get("x-h2-source-sha256") || "";
        const encryptedSha256 = response.headers.get("x-h2-encrypted-sha256") || "";
        if (!/^[a-f0-9]{64}$/i.test(sourceSha256) || !/^[a-f0-9]{64}$/i.test(encryptedSha256)) {
          throw new Error(\`O servidor não devolveu os hashes de integridade para \${object.sourceKey}.\`);
        }
        const fileHandle = await filesDir.getFileHandle(object.fileName, { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await response.body.pipeTo(writable, { signal: controller.signal });
        } catch (error) {
          try { await writable.abort(); } catch { /* ignore */ }
          throw error;
        }
        const saved = await fileHandle.getFile();
        if (saved.size !== object.encryptedBytes) throw new Error(\`Tamanho salvo divergente para \${object.sourceKey}.\`);

        state.completed[object.sourceKey] = {
          ...object,
          sourceSha256,
          encryptedSha256,
          syncedAt: new Date().toISOString(),
        };
        await writeTextFile(backupDir, ".h2-local-state.json", JSON.stringify(state, null, 2));
        objectsDone += 1; bytesDone += object.sourceSize;
        setDoneObjects(objectsDone); setDoneBytes(bytesDone);
        setProgress(Math.floor((objectsDone / Math.max(manifest.objectCount, 1)) * 100));
      }

      const entries = manifest.objects.map((object) => state.completed[object.sourceKey]).filter(Boolean);
      if (entries.length !== manifest.objectCount) throw new Error("Exportação terminou sem todos os arquivos confirmados.");
      const recoveryIndex = {
        format: "H2_MEDIA_BACKUP_INDEX_V1",
        createdAt: new Date().toISOString(),
        runId: \`local-\${Date.now()}\`,
        objectCount: entries.length,
        totalSourceBytes: entries.reduce((sum: number, entry: CompletedEntry) => sum + entry.sourceSize, 0),
        encryption: "AES-256-GCM:H2MEDIA1",
        keyRequired: "BACKUP_ENCRYPTION_KEY",
        keyFingerprint: manifest.keyFingerprint,
        objects: entries.map((entry: CompletedEntry) => ({
          keyHash: "",
          sourceKey: entry.sourceKey,
          sourceSize: entry.sourceSize,
          sourceEtag: entry.sourceEtag,
          sourceLastModified: entry.sourceLastModified,
          sourceSha256: entry.sourceSha256,
          encryptedSha256: entry.encryptedSha256,
          encryptedBytes: entry.encryptedBytes,
          driveFileId: "local",
          driveFileName: entry.fileName,
          syncedAt: entry.syncedAt,
        })),
      };
      await writeTextFile(backupDir, "H2_MEDIA_INDEX_LOCAL.json", JSON.stringify(recoveryIndex, null, 2));

      const toolResponse = await fetch("/api/admin/media-backup-local/recovery-tool", { credentials: "same-origin", cache: "no-store" });
      if (!toolResponse.ok) throw new Error("Os arquivos foram salvos, mas a ferramenta de recuperação não pôde ser baixada.");
      await writeTextFile(backupDir, "H2_MEDIA_RECOVERY_TOOL.mjs", await toolResponse.text());
      await writeTextFile(backupDir, "LEIA-ME.txt", [
        "H2 COLOMBIANO - BACKUP LOCAL DE MIDIAS",
        "",
        \`Criado em: \${new Date().toLocaleString("pt-BR")}\`,
        \`Arquivos: \${manifest.objectCount}\`,
        \`Dados de origem: \${formatBytes(manifest.totalSourceBytes)}\`,
        \`Impressao digital da chave: \${manifest.keyFingerprint}\`,
        "",
        "IMPORTANTE: a BACKUP_ENCRYPTION_KEY NAO esta nesta pasta.",
        "Guarde essa chave separadamente em local seguro. Sem ela, os arquivos .h2m.enc nao podem ser restaurados.",
        "",
        "Para restaurar em um computador com Node.js:",
        "1. Defina a variavel BACKUP_ENCRYPTION_KEY com a chave correta.",
        "2. Execute:",
        "node H2_MEDIA_RECOVERY_TOOL.mjs H2_MEDIA_INDEX_LOCAL.json arquivos pasta-restaurada",
        "",
        "O restaurador confere SHA-256 e autenticacao AES-GCM antes de considerar cada arquivo valido.",
      ].join("\\r\\n"));
      setProgress(100); setCurrentKey(null); setCompleted(true);
      toast.success("Backup local de mídia concluído e salvo no computador.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/aborted|interrompido/i.test(message)) toast.info("Backup local interrompido. Ao usar a mesma pasta, os arquivos concluídos serão aproveitados.");
      else toast.error(message || "Falha no backup local de mídia.");
      setLastError(message);
    } finally {
      abortRef.current = null;
      setRunning(false);
      setCurrentKey(null);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-400/10 via-[#111128] to-[#111128] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-violet-200" /><p className="text-[11px] font-black tracking-[0.18em] text-violet-200">BACKUP DE MÍDIA LOCAL</p></div>
          <h2 className="mt-2 text-xl font-black">Baixar fotos e documentos direto para o computador</h2>
          <p className="mt-2 text-xs leading-5 text-slate-300">Sem Google Drive. Você escolhe uma pasta no Windows e o navegador salva cada mídia criptografada diretamente nela. Se parar no meio, escolha a mesma pasta depois para continuar sem refazer os arquivos já concluídos.</p>
        </div>
        <div className="flex min-w-[240px] flex-col gap-2">
          <button type="button" onClick={startLocalBackup} disabled={running || !supported} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-300/15 px-4 py-3 text-sm font-black text-violet-100 hover:bg-violet-300/25 disabled:cursor-not-allowed disabled:opacity-40">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            {running ? "Baixando para o computador..." : completed ? "Atualizar backup local" : "Escolher pasta e baixar"}
          </button>
          {running && <button type="button" onClick={() => abortRef.current?.abort()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-2.5 text-xs font-black text-red-100 hover:bg-red-300/20"><PauseCircle className="h-4 w-4" /> Interromper</button>}
          <p className={\`text-center text-[11px] \${supported ? "text-emerald-300" : "text-amber-300"}\`}>{supported ? "Chrome/Edge pronto para salvar em pasta local." : "Abra no Chrome ou Edge do computador."}</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">{completed ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : lastError ? <AlertTriangle className="h-4 w-4 text-red-300" /> : running ? <RefreshCw className="h-4 w-4 animate-spin text-violet-200" /> : <Download className="h-4 w-4 text-violet-200" />}<span className="text-sm font-black">{completed ? "Backup local concluído" : running ? "Exportando mídias" : "Pronto para exportar"}</span></div>
          <span className="text-xl font-black">{progress}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-300 transition-all" style={{ width: \`\${Math.max(0, Math.min(100, progress))}%\` }} /></div>
        <div className="mt-3 grid gap-1 text-[11px] text-slate-400 sm:grid-cols-2"><span>Arquivos: <strong className="text-slate-200">{doneObjects} / {totalObjects}</strong></span><span>Dados: <strong className="text-slate-200">{formatBytes(doneBytes)} / {formatBytes(totalBytes)}</strong></span>{currentKey && <span className="sm:col-span-2 truncate">Atual: <strong className="font-mono text-slate-300">{currentKey}</strong></span>}</div>
        <p className="mt-3 text-xs text-amber-200">A chave de criptografia não é copiada para o computador. Guarde a BACKUP_ENCRYPTION_KEY separadamente; sem ela o backup não pode ser restaurado.</p>
        {lastError && <p className="mt-3 flex items-start gap-2 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />{lastError}</p>}
      </div>
    </section>
  );
}
`;
fs.writeFileSync(panelFile, panelSource, 'utf8');
console.log('[media-local-export] OK: backup de midia local ativado; Google Drive removido do painel de midia.');
