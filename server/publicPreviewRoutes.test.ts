import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const viteSource = fs.readFileSync(path.join(root, "server/_core/vite.ts"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "server/_core/index.ts"), "utf8");
const adminSource = fs.readFileSync(path.join(root, "client/src/pages/AdminSettings.tsx"), "utf8");

describe("rotas públicas de miniatura", () => {
  it("impede que a página inicial pule a injeção de Open Graph", () => {
    expect(viteSource).toContain("index: false");
    expect(viteSource).toContain("getOgMeta(req.originalUrl || req.path)");
  });

  it("entrega imagens escolhidas no ADM pelo proxy do domínio H2", () => {
    expect(viteSource).toContain("app.get('/share-preview/:profileId'");
    expect(viteSource).toContain("Content-Length");
    expect(viteSource).toContain("maxBytes = 5 * 1024 * 1024");
  });

  it("não usa vídeo como og:image e não redireciona o tutorial para ele mesmo", () => {
    expect(indexSource).not.toContain('res.redirect(307, "/video/tutorial")');
    expect(indexSource).toContain('getPublicPreviewMeta("video", canonicalUrl)');
    expect(indexSource).toContain('getPublicPreviewMeta("tutorial", canonicalUrl)');
    expect(indexSource).toContain("window.location.replace('/tutorial')");
    expect(indexSource).not.toContain('tutorial_27dcff60.mp4');
    expect(indexSource).not.toContain('tutorial_fe1af5d4.mp4');
    expect(indexSource).not.toContain('<meta property="og:image" content="${videoUrl}">');
  });

  it("conecta a aba Compartilhamento ao gerenciador por tipo de link", () => {
    expect(adminSource).toContain("<SharePreviewSettings />");
    expect(adminSource).toContain('label: "Compartilhamento"');
  });
});
