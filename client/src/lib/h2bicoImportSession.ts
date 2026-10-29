/**
 * Rascunho local do extrator de prints. Os arquivos de imagem ficam no
 * IndexedDB (Blob), uma unica vez por print, nunca no localStorage.
 * A gravacao serializada impede que uma alteracao antiga sobrescreva a nova.
 */
const DATABASE = "h2bico-print-review-v1";
const DRAFTS = "drafts";
const PHOTOS = "photos";
const CURRENT = "current";

type PendingRow = { id: string; cpf: string; photo: string };
type StoredRow = { photoKey: string; data: unknown };
type StoredDraft = { version: 1; updatedAt: number; rows: StoredRow[] };

const keysByUrl = new Map<string, string>();
let writeQueue: Promise<void> = Promise.resolve();

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erro na leitura do armazenamento local."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Falha ao gravar a sessao."));
    tx.onabort = () => reject(tx.error || new Error("Gravacao local cancelada."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Este navegador nao permite salvar a sessao local."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS);
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Nao foi possivel abrir o armazenamento local."));
    request.onblocked = () => reject(new Error("Feche outra aba do H2BICO e tente novamente."));
  });
}

function serialize(task: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function restoreH2BicoPrintSession<T extends PendingRow>(): Promise<{
  items: T[]; urls: string[]; updatedAt: number | null;
}> {
  const db = await openDatabase();
  try {
    const snapshot = await requestResult<StoredDraft | undefined>(
      db.transaction(DRAFTS, "readonly").objectStore(DRAFTS).get(CURRENT)
    );
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.rows)) {
      return { items: [], urls: [], updatedAt: null };
    }
    const keys = [...new Set(snapshot.rows.map(row => row.photoKey).filter(key => typeof key === "string"))];
    const store = db.transaction(PHOTOS, "readonly").objectStore(PHOTOS);
    const blobs = await Promise.all(keys.map(key => requestResult<Blob | undefined>(store.get(key))));
    const byKey = new Map<string, string>();
    const urls: string[] = [];
    keys.forEach((key, index) => {
      const blob = blobs[index];
      if (!(blob instanceof Blob) || !blob.size) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      byKey.set(key, url);
      keysByUrl.set(url, key);
    });
    const items: T[] = [];
    for (const row of snapshot.rows) {
      const url = byKey.get(row.photoKey);
      if (!url || !row.data || typeof row.data !== "object") continue;
      const item = { ...(row.data as object), photo: url, avatarBusy: false, avatarOptions: undefined } as T;
      if (typeof item.id !== "string" || typeof item.cpf !== "string") continue;
      items.push(item);
    }
    return { items, urls, updatedAt: snapshot.updatedAt || null };
  } finally {
    db.close();
  }
}

async function writeSnapshot<T extends PendingRow>(items: readonly T[]): Promise<void> {
  const db = await openDatabase();
  try {
    const rows: StoredRow[] = [];
    const newPhotos = new Map<string, { key: string; blob: Blob }>();
    const usedKeys = new Set<string>();
    for (const item of items) {
      let key = keysByUrl.get(item.photo) || newPhotos.get(item.photo)?.key;
      if (!key) {
        if (!item.photo.startsWith("blob:")) throw new Error("A origem do print nao pode ser recuperada.");
        const response = await fetch(item.photo);
        if (!response.ok) throw new Error("Um print ficou indisponivel. Nao feche a pagina.");
        const blob = await response.blob();
        if (!blob.size) throw new Error("Print vazio no armazenamento.");
        key = "print-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        newPhotos.set(item.photo, { key, blob });
      }
      usedKeys.add(key);
      const { photo: ignored, avatarOptions: ignoredOptions, avatarBusy: ignoredBusy, ...data } = item as T & {
        avatarOptions?: unknown; avatarBusy?: boolean;
      };
      rows.push({ photoKey: key, data });
    }
    const tx = db.transaction([DRAFTS, PHOTOS], "readwrite");
    const drafts = tx.objectStore(DRAFTS);
    const photos = tx.objectStore(PHOTOS);
    for (const { key, blob } of newPhotos.values()) photos.put(blob, key);
    if (rows.length) drafts.put({ version: 1, updatedAt: Date.now(), rows } satisfies StoredDraft, CURRENT);
    else drafts.delete(CURRENT);
    const oldKeys = photos.getAllKeys();
    oldKeys.onsuccess = () => {
      for (const key of oldKeys.result) if (!usedKeys.has(String(key))) photos.delete(key);
    };
    await transactionDone(tx);
    for (const [url, photo] of newPhotos) keysByUrl.set(url, photo.key);
    if (!rows.length) keysByUrl.clear();
  } finally {
    db.close();
  }
}

/** Retem apenas o estado mais recente e respeita a ordem dos salvamentos. */
export function persistH2BicoPrintSession<T extends PendingRow>(items: readonly T[]): Promise<void> {
  return serialize(() => writeSnapshot(items));
}
