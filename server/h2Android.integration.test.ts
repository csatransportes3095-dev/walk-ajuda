import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.resolve(root, file), "utf8");

describe("H2 Android - modulo isolado e privado", () => {
  const app = read("client/src/App.tsx");
  const dashboard = read("client/src/pages/AdminCodes.tsx");
  const routers = read("server/routers.ts");
  const androidRouter = read("server/routers/h2Android.ts");
  const androidPage = read("client/src/pages/AdminH2Android.tsx");

  it("mantem /android e /admin/android exclusivamente sob AdminGuard", () => {
    expect(app).toContain('<Route path={"/android"}><AdminGuard><AdminH2Android /></AdminGuard></Route>');
    expect(app).toContain('<Route path={"/admin/android"}><AdminGuard><AdminH2Android /></AdminGuard></Route>');
    expect((app.match(/<AdminGuard><AdminH2Android \/><\/AdminGuard>/g) || []).length).toBe(2);
    expect(app).toContain('location === "/android" || location.startsWith("/admin")');
  });

  it("exibe card individual no ADM sem alterar a ordenacao dos atalhos", () => {
    expect(dashboard).toContain('<a href="/android"');
    expect(dashboard).toContain("H2 ANDROID");
    expect(dashboard).not.toContain("id: 'android'");
  });

  it("exige adminProcedure em todas as operacoes", () => {
    expect(routers).toContain("h2Android: h2AndroidRouter");
    for (const action of ["overview", "createProfile", "renameProfile", "deleteProfile"]) {
      expect(androidRouter).toMatch(new RegExp(action + ": adminProcedure"));
    }
    expect(androidRouter).not.toContain("publicProcedure");
    expect(androidRouter).not.toContain("orderStatus");
    expect(androidRouter).not.toContain("h2Ads");
  });

  it("nao finge que instancias estao operantes sem agente", () => {
    expect(androidRouter).toContain('activeCount: 0');
    expect(androidRouter).toContain('agentStatus: "not_installed"');
    expect(androidRouter).toContain("H2_ANDROID_MAX_RUNNING = 5");
    expect(androidPage).toContain('disabled title="Disponível somente após conectar o agente H2 Android"');
    expect(androidPage).toContain("Nenhum aplicativo, proxy, câmera ou emulador foi instalado");
  });

  it("isola os perfis na propria tabela, sem tocar cadastros ou pedidos", () => {
    expect(androidRouter).toContain("h2_android_profiles");
    expect(androidRouter).toContain("WHERE id =");
    expect(androidRouter).not.toContain("DELETE FROM customers");
    expect(androidRouter).not.toContain("DELETE FROM order");
    expect(androidRouter).not.toContain("DELETE FROM access");
  });
});
