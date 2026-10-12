import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/OrderTracking.tsx"), "utf8");

describe("prévia de vídeos globais no acompanhamento", () => {
  it("renderiza prévia de 15 segundos antes do botão completo", () => {
    expect(source).toContain("GlobalVideoPreview url={video.url} title={video.title}");
    expect(source).toContain("Prévia de 15s");
    expect(source).toContain("media.currentTime >= 15");
  });

  it("mantém o botão Assistir Vídeo para abrir o conteúdo completo", () => {
    expect(source).toContain("Assistir Vídeo");
    expect(source).toContain('href={video.url}');
  });

  it("suporta YouTube e vídeo direto sem autoplay geral", () => {
    expect(source).toContain("getYoutubeVideoId");
    expect(source).toContain("canPreviewDirectVideo");
    expect(source).toContain("autoplay=1&controls=0&start=0&end=15");
  });
});
