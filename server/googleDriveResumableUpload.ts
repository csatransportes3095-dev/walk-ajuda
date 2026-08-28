import { open } from "node:fs/promises";

export const GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES = 32 * 1024 * 1024;
const GOOGLE_DRIVE_CHUNK_ALIGNMENT = 256 * 1024;
const GOOGLE_DRIVE_MAX_RETRIES = 5;

export type GoogleDriveUploadResult = { id: string };

export function validateGoogleDriveChunkSize(chunkBytes: number) {
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0 || chunkBytes % GOOGLE_DRIVE_CHUNK_ALIGNMENT !== 0) {
    throw new Error("Tamanho do bloco do Google Drive deve ser múltiplo de 256 KB.");
  }
  return chunkBytes;
}

export function nextGoogleDriveOffset(rangeHeader: string | null) {
  if (!rangeHeader) return 0;
  const match = /bytes=0-(\d+)/i.exec(rangeHeader.trim());
  if (!match) return 0;
  const lastByte = Number(match[1]);
  if (!Number.isSafeInteger(lastByte) || lastByte < 0) return 0;
  return lastByte + 1;
}

async function responseDetail(response: Response) {
  try {
    const text = (await response.text()).replace(/[\r\n]+/g, " ").trim();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryUploadOffset(input: {
  uploadUrl: string;
  accessToken: string;
  totalBytes: number;
  fetchImpl: typeof fetch;
}) {
  const response = await input.fetchImpl(input.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${input.totalBytes}`,
    },
  });

  if (response.status === 308) {
    return { completed: false as const, offset: nextGoogleDriveOffset(response.headers.get("range")) };
  }
  if (response.ok) {
    const payload = await response.json().catch(() => ({})) as { id?: string };
    if (!payload.id) throw new Error("Google Drive confirmou o upload, mas não devolveu o ID do arquivo.");
    return { completed: true as const, id: payload.id };
  }
  if (response.status === 404) {
    throw new Error("Sessão de upload do Google Drive expirou (HTTP 404). Tente enviar novamente para criar uma nova sessão.");
  }
  const detail = await responseDetail(response);
  throw new Error(`Google Drive recusou a consulta de retomada (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
}

export async function uploadGoogleDriveResumableFile(input: {
  uploadUrl: string;
  accessToken: string;
  filePath: string;
  totalBytes: number;
  chunkBytes?: number;
  fetchImpl?: typeof fetch;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}) : Promise<GoogleDriveUploadResult> {
  if (!Number.isSafeInteger(input.totalBytes) || input.totalBytes <= 0) {
    throw new Error("Tamanho do backup inválido para upload ao Google Drive.");
  }
  const fetchImpl = input.fetchImpl || fetch;
  const chunkBytes = validateGoogleDriveChunkSize(input.chunkBytes || GOOGLE_DRIVE_UPLOAD_CHUNK_BYTES);
  const file = await open(input.filePath, "r");
  let offset = 0;

  try {
    while (offset < input.totalBytes) {
      const start = offset;
      const end = Math.min(start + chunkBytes, input.totalBytes) - 1;
      const length = end - start + 1;
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await file.read(buffer, 0, length, start);
      if (bytesRead !== length) {
        throw new Error(`Leitura incompleta do backup antes do Drive: esperado ${length}, lido ${bytesRead}.`);
      }

      let retry = 0;
      while (true) {
        try {
          const response = await fetchImpl(input.uploadUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${input.accessToken}`,
              "Content-Type": "application/octet-stream",
              "Content-Length": String(length),
              "Content-Range": `bytes ${start}-${end}/${input.totalBytes}`,
            },
            body: buffer,
          });

          if (response.status === 308) {
            const confirmedOffset = nextGoogleDriveOffset(response.headers.get("range"));
            if (confirmedOffset <= start) {
              throw new Error(`Google Drive não confirmou o bloco iniciado no byte ${start}.`);
            }
            offset = confirmedOffset;
            input.onProgress?.(offset, input.totalBytes);
            break;
          }

          if (response.ok) {
            const payload = await response.json().catch(() => ({})) as { id?: string };
            if (!payload.id) throw new Error("Google Drive concluiu o upload, mas não devolveu o ID do arquivo.");
            input.onProgress?.(input.totalBytes, input.totalBytes);
            return { id: payload.id };
          }

          if (response.status >= 500 || response.status === 429) {
            if (retry >= GOOGLE_DRIVE_MAX_RETRIES) {
              const detail = await responseDetail(response);
              throw new Error(`Google Drive falhou após ${GOOGLE_DRIVE_MAX_RETRIES + 1} tentativas (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
            }
            retry += 1;
            await sleep(Math.min(1000 * 2 ** (retry - 1), 8000));
            const state = await queryUploadOffset({ uploadUrl: input.uploadUrl, accessToken: input.accessToken, totalBytes: input.totalBytes, fetchImpl });
            if (state.completed) return { id: state.id };
            offset = state.offset;
            if (offset !== start) break;
            continue;
          }

          const detail = await responseDetail(response);
          throw new Error(`Google Drive falhou no bloco ${start}-${end} (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isDriveHttpError = message.startsWith("Google Drive falhou no bloco") || message.startsWith("Google Drive falhou após") || message.startsWith("Google Drive concluiu") || message.startsWith("Google Drive não confirmou");
          if (isDriveHttpError) throw error;
          if (retry >= GOOGLE_DRIVE_MAX_RETRIES) {
            throw new Error(`Conexão com o Google Drive interrompida após ${GOOGLE_DRIVE_MAX_RETRIES + 1} tentativas: ${message.slice(0, 300)}`);
          }
          retry += 1;
          await sleep(Math.min(1000 * 2 ** (retry - 1), 8000));
          const state = await queryUploadOffset({ uploadUrl: input.uploadUrl, accessToken: input.accessToken, totalBytes: input.totalBytes, fetchImpl });
          if (state.completed) return { id: state.id };
          offset = state.offset;
          if (offset !== start) break;
        }
      }
    }
  } finally {
    await file.close();
  }

  const finalState = await queryUploadOffset({ uploadUrl: input.uploadUrl, accessToken: input.accessToken, totalBytes: input.totalBytes, fetchImpl });
  if (finalState.completed) return { id: finalState.id };
  throw new Error(`Google Drive não concluiu o upload; próximo byte confirmado: ${finalState.offset}.`);
}
