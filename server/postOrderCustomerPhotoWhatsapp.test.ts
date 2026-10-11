import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const home = fs.readFileSync(path.resolve(root, "client/src/pages/Home.tsx"), "utf8");
const serverIndex = fs.readFileSync(path.resolve(root, "server/_core/index.ts"), "utf8");

describe("foto principal do cliente no pos-pedido", () => {
  it("busca profilePhotoUrl do cadastro principal", () => {
    expect(home).toContain("trpc.customers.getMyProfile.useQuery");
    expect(home).toContain("profilePhotoUrl: String(myProfileQuery.data?.profilePhotoUrl || '').trim() || undefined");
  });

  it("nao mostra nome ou bloco visual da foto no formulario final", () => {
    expect(home).not.toContain("FOTO DO CLIENTE:");
    expect(home).not.toContain("Foto do cadastro do cliente");
  });

  it("usa link H2 proprio para gerar miniatura no WhatsApp", () => {
    expect(home).toContain("/link/foto-cliente?src=");
    expect(serverIndex).toContain('app.get("/link/foto-cliente"');
    expect(serverIndex).toContain('app.get("/link/foto-cliente-img"');
    expect(serverIndex).toContain('property="og:image"');
    expect(serverIndex).toContain('hostname !== "midia.h2colombiano.com"');
  });

  it("proxy da imagem entrega content type e content length", () => {
    expect(serverIndex).toContain('res.set("Content-Type", contentType)');
    expect(serverIndex).toContain('res.set("Content-Length", String(buffer.length))');
    expect(serverIndex).toContain("maxPreviewBytes = 5 * 1024 * 1024");
  });
});
