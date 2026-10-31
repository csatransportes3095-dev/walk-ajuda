/**
 * Índice facial do H2BICO no navegador do administrador.
 * Armazena SOMENTE embeddings H2 Face (512D), nunca fotos ou dados de clientes.
 * Foto alterada ou versão do modelo diferente invalida o vetor automaticamente.
 * Falha de IndexedDB não deve impedir uma busca normal.
 */
const DB_NAME = "h2bico-face-index";
const STORE_NAME = "embeddings";
export const H2BICO_EMBEDDING_MODEL_VERSION = "h2-tflite-recognizer-v1";
const VECTOR_LENGTH = 512;

export type H2BicoFaceIndexRow = {
  id: number;
  revision: string;
  modelVersion: string;
  embedding: Float32Array;
};

export function usableH2BicoEmbedding(
  row: H2BicoFaceIndexRow | undefined,
  revision: string,
): row is H2BicoFaceIndexRow {
  return Boolean(row &&
    row.revision === revision &&
    row.modelVersion === H2BICO_EMBEDDING_MODEL_VERSION &&
    row.embedding instanceof Float32Array &&
    row.embedding.length === VECTOR_LENGTH &&
    row.embedding.every(Number.isFinite));
}

async function openFaceIndex(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Índice facial indisponível."));
    request.onblocked = () => reject(new Error("Índice facial ocupado por outra aba."));
  });
}

/** Uma única leitura, evitando milhares de transações IndexedDB por comparação. */
export async function readH2BicoFaceIndex(): Promise<Map<number, H2BicoFaceIndexRow>> {
  if (typeof indexedDB === "undefined") return new Map();
  let db: IDBDatabase | null = null;
  try {
    db = await openFaceIndex();
    const records = await new Promise<H2BicoFaceIndexRow[]>((resolve, reject) => {
      const request = db!.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as H2BicoFaceIndexRow[]);
      request.onerror = () => reject(request.error);
    });
    return new Map(records
      .filter(row => row?.modelVersion === H2BICO_EMBEDDING_MODEL_VERSION &&
        row.embedding instanceof Float32Array && row.embedding.length === VECTOR_LENGTH)
      .map(row => [Number(row.id), row]));
  } catch (error) {
    console.warn("[H2BICO] índice local opcional indisponível:", error);
    return new Map();
  } finally {
    db?.close();
  }
}

/** Escreve em lote, fora do caminho crítico da inferência. */
export async function writeH2BicoFaceIndex(records: H2BicoFaceIndexRow[]): Promise<void> {
  if (!records.length || typeof indexedDB === "undefined") return;
  let db: IDBDatabase | null = null;
  try {
    db = await openFaceIndex();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      const store = transaction.objectStore(STORE_NAME);
      for (const row of records) {
        if (usableH2BicoEmbedding(row, row.revision)) store.put(row);
      }
    });
  } catch (error) {
    console.warn("[H2BICO] não foi possível persistir o índice opcional:", error);
  } finally {
    db?.close();
  }
}
