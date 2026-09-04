export const MAX_ORDER_UPLOAD_BYTES = 15 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 700 * 1024;
const MAX_IMAGE_SIDE = 1280;

export type UploadErrorKind = "session" | "permission" | "file" | "network" | "server";
export type UploadProgressStage = "preparing" | "uploading" | "confirming" | "retrying" | "uploaded" | "failed";

export type ReliableOrderUploadResult =
  | { ok: true; url: string; fileKey: string; mimeType: string; storedBytes: number }
  | { ok: false; kind: UploadErrorKind; message: string };

function emitUploadProgress(stage: UploadProgressStage, detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("h2-order-upload-progress", { detail: { stage, ...detail } }));
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isImage(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff)$/i.test(file.name);
}

async function readFileAsBase64(file: File): Promise<string> {
  const readOnce = (attempt: number) => new Promise<string>((resolve, reject) => {
    const timeoutMs = file.size > 5 * 1024 * 1024 ? 60_000 : 30_000;
    const timeout = window.setTimeout(() => reject(new Error(`Leitura do arquivo excedeu o tempo (${attempt})`)), timeoutMs);
    const reader = new FileReader();
    reader.onload = () => {
      window.clearTimeout(timeout);
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      base64 ? resolve(base64) : reject(new Error("Arquivo vazio"));
    };
    reader.onerror = () => { window.clearTimeout(timeout); reject(new Error("Não foi possível ler o arquivo")); };
    reader.onabort = () => { window.clearTimeout(timeout); reject(new Error("Leitura do arquivo cancelada")); };
    try { reader.readAsDataURL(file); } catch (error) { window.clearTimeout(timeout); reject(error); }
  });

  try {
    return await readOnce(1);
  } catch {
    await new Promise(resolve => window.setTimeout(resolve, 500));
    return readOnce(2);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível compactar a imagem")), "image/jpeg", quality);
  });
}

async function compressImageForOrderUpload(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const timeout = window.setTimeout(() => reject(new Error("Tempo excedido ao preparar a imagem")), 20_000);
      img.onload = () => { window.clearTimeout(timeout); resolve(img); };
      img.onerror = () => { window.clearTimeout(timeout); reject(new Error("Formato de imagem não pôde ser preparado")); };
      img.src = objectUrl;
    });

    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("Dimensões da imagem inválidas");

    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let quality = 0.74;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > TARGET_IMAGE_BYTES && quality > 0.48) {
      quality = Math.max(0.48, quality - 0.08);
      blob = await canvasToBlob(canvas, quality);
    }

    if (blob.size > TARGET_IMAGE_BYTES && Math.max(width, height) > 1024) {
      const shrink = 1024 / Math.max(width, height);
      const smaller = document.createElement("canvas");
      smaller.width = Math.max(1, Math.round(width * shrink));
      smaller.height = Math.max(1, Math.round(height * shrink));
      const smallerContext = smaller.getContext("2d");
      if (!smallerContext) throw new Error("Canvas indisponível");
      smallerContext.fillStyle = "#ffffff";
      smallerContext.fillRect(0, 0, smaller.width, smaller.height);
      smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      blob = await canvasToBlob(smaller, 0.62);
    }

    const name = (file.name.replace(/\.[^.]+$/, "") || "comprovante") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Imagens são convertidas para JPEG e reduzidas antes do envio para economizar tráfego e espaço no R2.
 * PDF permanece intacto para não perder conteúdo/validade.
 */
export async function prepareOrderUploadFile(file: File): Promise<File> {
  if (isPdf(file) || !isImage(file)) return file;
  try {
    const compressed = await compressImageForOrderUpload(file);
    return compressed.size > 0 && compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}

function failureFromStatus(status: number, message: string): ReliableOrderUploadResult {
  if (status === 401) return { ok: false, kind: "session", message: "Sua sessão expirou. Entre novamente antes de enviar o comprovante." };
  if (status === 403) return { ok: false, kind: "permission", message: "Não foi possível confirmar o acesso deste cadastro. Entre novamente e tente enviar." };
  if (status === 400 || status === 413) return { ok: false, kind: "file", message: message || "O arquivo não pôde ser aceito. Escolha outra foto ou PDF de até 15 MB." };
  return { ok: false, kind: "server", message: message || "O servidor não conseguiu concluir o envio agora. Tente novamente." };
}

/**
 * Único envio de arquivo de pedido para vitrine e Bot H2 Ajuda.
 * O arquivo é reduzido antes do envio; o servidor grava no R2 e devolve somente URL/chave.
 * A identidade vem exclusivamente da sessão do cliente no servidor.
 */
export async function uploadOrderFileReliably(file: File, label: string): Promise<ReliableOrderUploadResult> {
  if (file.size > MAX_ORDER_UPLOAD_BYTES) return { ok: false, kind: "file", message: "O arquivo está muito grande. Envie um arquivo de até 15 MB." };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, kind: "network", message: "Você está sem internet. Conecte-se e tente enviar novamente." };

  const token = localStorage.getItem("cp_token") || "";
  if (!token) return { ok: false, kind: "session", message: "Sua sessão não está ativa. Entre novamente antes de enviar o comprovante." };

  emitUploadProgress("preparing", { label, originalBytes: file.size });
  const prepared = await prepareOrderUploadFile(file);
  if (prepared.size > MAX_ORDER_UPLOAD_BYTES) return { ok: false, kind: "file", message: "O arquivo está muito grande. Envie um arquivo de até 15 MB." };

  let base64: string;
  try {
    base64 = await readFileAsBase64(prepared);
  } catch {
    const result: ReliableOrderUploadResult = { ok: false, kind: "file", message: "Não foi possível preparar este arquivo no celular. Escolha outra foto ou PDF e tente novamente." };
    emitUploadProgress("failed", { label, kind: result.kind, message: result.message });
    return result;
  }

  const payload = JSON.stringify({
    label,
    data: base64,
    mimeType: prepared.type || "image/jpeg",
    filename: prepared.name || `${label}.jpg`,
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    emitUploadProgress(attempt === 1 ? "uploading" : "retrying", { label, attempt, preparedBytes: prepared.size });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch("/api/upload/order-file-base64", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-customer-session": token },
        credentials: "include",
        body: payload,
        signal: controller.signal,
      });
      emitUploadProgress("confirming", { label, attempt });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.fileUrl && body.fileKey) {
        const result = {
          ok: true as const,
          url: body.fileUrl as string,
          fileKey: body.fileKey as string,
          mimeType: (body.mimeType || prepared.type || "image/jpeg") as string,
          storedBytes: prepared.size,
        };
        emitUploadProgress("uploaded", { label, storedBytes: prepared.size, url: result.url });
        return result;
      }
      const message = typeof body?.error === "string" ? body.error : response.statusText;
      const transient = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!transient || attempt === 4) {
        const result = failureFromStatus(response.status, message);
        if (!result.ok) emitUploadProgress("failed", { label, kind: result.kind, message: result.message, status: response.status });
        return result;
      }
    } catch (error) {
      if (attempt === 4) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        const result: ReliableOrderUploadResult = { ok: false, kind: "network", message: aborted ? "A conexão demorou demais para enviar. Verifique sua internet e tente novamente." : "Não foi possível conectar para enviar agora. Tente novamente." };
        emitUploadProgress("failed", { label, kind: result.kind, message: result.message });
        return result;
      }
    } finally {
      window.clearTimeout(timeout);
    }
    await new Promise(resolve => window.setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
  }

  const result: ReliableOrderUploadResult = { ok: false, kind: "network", message: "Não foi possível enviar agora. Tente novamente." };
  emitUploadProgress("failed", { label, kind: result.kind, message: result.message });
  return result;
}
