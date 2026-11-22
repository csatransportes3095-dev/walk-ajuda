/**
 * URLs de vídeo permitidas exclusivamente nos blocos de Pedido Entregue.
 * A mídia toca na própria página, sem acesso do cliente ao editor do ADM.
 */
export type DeliveredGuideVideo = { kind: "embed" | "file"; url: string };

const ALLOWED_FILE_EXT = /\.(mp4|webm|ogg|ogv)$/i;

export function resolveDeliveredGuideVideo(input: string): DeliveredGuideVideo | null {
  let url: URL;
  try { url = new URL(String(input || "").trim()); }
  catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || /^\d+(\.\d+){3}$/.test(host) || host.includes(":") || !host.includes(".")) return null;

  // YouTube: vídeos normais, Shorts, links curtos, lives e URLs de incorporação.
  if (host === "youtu.be" || host === "www.youtu.be" || host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com" || host === "www.youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const videoId = host.endsWith("youtu.be") ? parts[0] :
      parts[0] === "watch" ? url.searchParams.get("v") :
      ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : "";
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
    return { kind: "embed", url: "https://www.youtube-nocookie.com/embed/" + videoId };
  }

  // Vimeo: IDs públicos e hash de vídeo não listado (quando fornecido).
  if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts.find(part => /^\d{4,20}$/.test(part));
    const h = url.searchParams.get("h") || (parts[0] === id && /^[a-f0-9]{6,64}$/i.test(parts[1] || "") ? parts[1] : "");
    if (!id || (h && !/^[a-f0-9]{6,64}$/i.test(h))) return null;
    return { kind: "embed", url: "https://player.vimeo.com/video/" + id + (h ? "?h=" + encodeURIComponent(h) : "") };
  }

  // Google Drive: exige link público de visualização do arquivo.
  if (host === "drive.google.com") {
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{15,})\/(?:view|preview)?\/?$/);
    if (!match) return null;
    return { kind: "embed", url: "https://drive.google.com/file/d/" + match[1] + "/preview" };
  }

  // O /video/:slug do H2 e uma rota de streaming de video do proprio site.
  // Ela devolve bytes do arquivo com suporte a Range, nao uma pagina HTML.
  if (host === "h2colombiano.com" || host === "www.h2colombiano.com") {
    if (/^\/video\/[a-zA-Z0-9_-]{1,128}$/.test(url.pathname) && !url.search) {
      return { kind: "file", url: "https://h2colombiano.com" + url.pathname };
    }
  }

  // Arquivos de vídeo HTTPS diretos, inclusive mídias publicadas no R2.
  if (ALLOWED_FILE_EXT.test(url.pathname)) return { kind: "file", url: url.toString() };

  return null;
}
