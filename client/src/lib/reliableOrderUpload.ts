export const MAX_ORDER_UPLOAD_BYTES = 15 * 1024 * 1024;

type UploadErrorKind = "session" | "permission" | "file" | "network" | "server";

export type ReliableOrderUploadResult =
  | { ok: true; url: string; fileKey: string; mimeType: string }
  | { ok: false; kind: UploadErrorKind; message: string };

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

async function compressImageForOrderUpload(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const timeout = window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Tempo excedido ao preparar a imagem"));
    }, 20_000);

    image.onload = () => {
      window.clearTimeout(timeout);
      try {
        const maxSide = 1600;
        let { width, height } = image;
        if (width > maxSide || height > maxSide) {
          if (width >= height) { height = Math.round((height * maxSide) / width); width = maxSide; }
          else { width = Math.round((width * maxSide) / height); height = maxSide; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas indisponível");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) { reject(new Error("Não foi possível preparar a imagem")); return; }
          const name = (file.name.replace(/\.[^.]+$/, "") || "comprovante") + ".jpg";
          resolve(new File([blob], name, { type: "image/jpeg" }));
        }, "image/jpeg", 0.8);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    image.onerror = () => { window.clearTimeout(timeout); URL.revokeObjectURL(objectUrl); reject(new Error("Formato de imagem não pôde ser preparado")); };
    image.src = objectUrl;
  });
}

/** Mantém PDF intacto e reduz imagens grandes antes de enviar por rede móvel. */
export async function prepareOrderUploadFile(file: File): Promise<File> {
  if (isPdf(file) || !isImage(file) || file.size <= 1.2 * 1024 * 1024) return file;
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
 * A identidade vem exclusivamente da sessão do cliente no servidor.
 */
export async function uploadOrderFileReliably(file: File, label: string): Promise<ReliableOrderUploadResult> {
  if (file.size > MAX_ORDER_UPLOAD_BYTES) return { ok: false, kind: "file", message: "O arquivo está muito grande. Envie um arquivo de até 15 MB." };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, kind: "network", message: "Você está sem internet. Conecte-se e tente enviar novamente." };

  const token = localStorage.getItem("cp_token") || "";
  if (!token) return { ok: false, kind: "session", message: "Sua sessão não está ativa. Entre novamente antes de enviar o comprovante." };

  const prepared = await prepareOrderUploadFile(file);
  if (prepared.size > MAX_ORDER_UPLOAD_BYTES) return { ok: false, kind: "file", message: "O arquivo está muito grande. Envie um arquivo de até 15 MB." };

  let base64: string;
  try {
    base64 = await readFileAsBase64(prepared);
  } catch {
    return { ok: false, kind: "file", message: "Não foi possível preparar este arquivo no celular. Escolha outra foto ou PDF e tente novamente." };
  }

  const payload = JSON.stringify({
    label,
    data: base64,
    mimeType: prepared.type || "image/jpeg",
    filename: prepared.name || `${label}.jpg`,
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
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
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.fileUrl && body.fileKey) {
        return { ok: true, url: body.fileUrl, fileKey: body.fileKey, mimeType: body.mimeType || prepared.type || "image/jpeg" };
      }
      const message = typeof body?.error === "string" ? body.error : response.statusText;
      const transient = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!transient || attempt === 4) return failureFromStatus(response.status, message);
    } catch (error) {
      if (attempt === 4) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        return { ok: false, kind: "network", message: aborted ? "A conexão demorou demais para enviar. Verifique sua internet e tente novamente." : "Não foi possível conectar para enviar agora. Tente novamente." };
      }
    } finally {
      window.clearTimeout(timeout);
    }
    await new Promise(resolve => window.setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
  }

  return { ok: false, kind: "network", message: "Não foi possível enviar agora. Tente novamente." };
}
