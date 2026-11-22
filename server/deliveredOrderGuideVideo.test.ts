import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveDeliveredGuideVideo } from "../client/src/lib/deliveredGuideVideo";

const editor = readFileSync("client/src/components/OrderDeliveredGuide.tsx", "utf8");
const page = readFileSync("client/src/pages/DeliveredOrderGuidePage.tsx", "utf8");
const router = readFileSync("server/routers/deliveredOrderGuide.ts", "utf8");

describe("Pedido Entregue: foto ou vídeo URL na mesma página", () => {
  it("incorpora vídeos YouTube a partir dos formatos comuns", () => {
    for (const link of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ"]) {
      expect(resolveDeliveredGuideVideo(link)).toEqual({
        kind: "embed", url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      });
    }
  });
  it("incorpora Vimeo e Google Drive público", () => {
    expect(resolveDeliveredGuideVideo("https://vimeo.com/123456789")).toEqual({ kind: "embed", url: "https://player.vimeo.com/video/123456789" });
    expect(resolveDeliveredGuideVideo("https://drive.google.com/file/d/abcdefghijklmno123456/view?usp=sharing")).toEqual({
      kind: "embed", url: "https://drive.google.com/file/d/abcdefghijklmno123456/preview",
    });
  });
  it("usa player nativo para vídeos diretos HTTPS", () => {
    expect(resolveDeliveredGuideVideo("https://midia.h2colombiano.com/orientacoes/exemplo.mp4")).toEqual({
      kind: "file", url: "https://midia.h2colombiano.com/orientacoes/exemplo.mp4",
    });
    expect(resolveDeliveredGuideVideo("https://midia.h2colombiano.com/video.webm?v=1")?.kind).toBe("file");
  });
  it("reconhece vídeo já publicado no H2 pelo slug e mantém player na mesma página", () => {
    expect(resolveDeliveredGuideVideo("https://h2colombiano.com/video/como-entrar-na-conta")).toEqual({
      kind: "file", url: "https://h2colombiano.com/video/como-entrar-na-conta",
    });
    expect(resolveDeliveredGuideVideo("https://www.h2colombiano.com/video/como-entrar-na-conta")?.kind).toBe("file");
    expect(resolveDeliveredGuideVideo("https://h2colombiano.com/video/../../admin")).toBeNull();
    expect(resolveDeliveredGuideVideo("https://h2colombiano.com/qualquer-coisa")).toBeNull();
  });
  it("ignora URL antiga de foto quando o bloco ativo é vídeo", () => {
    expect(editor).toContain('imageUrl: b.mediaType === "video" ? "" : b.imageUrl.trim()');
    expect(router).toContain('block.mediaType !== "video" && block.imageUrl && !allowedImageUrl(block.imageUrl)');
    expect(router).toContain('block.mediaType === "video" ? Boolean(resolveDeliveredGuideVideo(block.videoUrl)) : allowedImageUrl(block.imageUrl)');
  });
  it("rejeita javascript, HTTP, hosts locais e links sem player suportado", () => {
    for (const url of ["javascript:alert(1)", "http://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://localhost/test.mp4", "https://127.0.0.1/test.mp4", "https://example.com/site",
      "https://evil.com/movie.html", "https://user:pass@midia.h2colombiano.com/video.mp4"]) {
      expect(resolveDeliveredGuideVideo(url)).toBeNull();
    }
  });
  it("mantém o formulário global e cada link individual existentes", () => {
    expect(editor).toContain('mediaType: "image" | "video"');
    expect(editor).toContain("VÍDEO POR URL");
    expect(editor).toContain("FOTO / PRINT");
    expect(editor).toContain('publicSiteUrl("/pedido-entregue/" + orderRecord.token)');
    expect(editor).toContain("saveGlobal.useMutation");
    expect(router).toContain("createLinkForOrder: adminProcedure");
    expect(router).toContain("requireCustomerSession(input.customerSessionToken)");
  });
  it("reproduz vídeos dentro da página e mantém as fotos anteriores", () => {
    expect(page).toContain('block.mediaType === "video"');
    expect(page).toContain("<video src={video.url} controls playsInline");
    expect(page).toContain('<iframe title={block.title || "Vídeo de orientação "');
    expect(page).toContain('block.imageUrl && <img src={block.imageUrl}');
    expect(page).toContain('getPublic.useMutation()');
  });
  it("valida URLs no servidor sem alterar status ou login", () => {
    expect(router).toContain('mediaType: z.enum(["image", "video"]).default("image")');
    expect(router).toContain('videoUrl: z.string().trim().max(2048).default("")');
    expect(router).toContain('resolveDeliveredGuideVideo(block.videoUrl)');
    expect(router).not.toContain("addOrderStatus");
  });
});
