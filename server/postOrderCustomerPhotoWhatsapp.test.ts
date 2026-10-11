import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const home = fs.readFileSync(path.resolve(root, "client/src/pages/Home.tsx"), "utf8");

describe("foto principal do cliente no pos-pedido", () => {
  it("busca profilePhotoUrl do cadastro principal", () => {
    expect(home).toContain("trpc.customers.getMyProfile.useQuery");
    expect(home).toContain("profilePhotoUrl: String(myProfileQuery.data?.profilePhotoUrl || '').trim() || undefined");
  });

  it("mostra miniatura na tela final", () => {
    expect(home).toContain("Foto do cadastro do cliente");
    expect(home).toContain("object-cover");
  });

  it("inclui a URL da foto na mensagem do WhatsApp", () => {
    expect(home).toContain("FOTO DO CLIENTE:");
    expect(home).toContain("msg += `\\n${profilePhotoUrl}`");
  });
});
