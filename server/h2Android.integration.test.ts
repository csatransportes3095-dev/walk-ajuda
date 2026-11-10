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

  it("mantem /adm/android como rota unica protegida por AdminGuard", () => {
    expect(app).toContain('<Route path={"/adm/android"}><AdminGuard><AdminH2Android /></AdminGuard></Route>');
    expect((app.match(/<AdminGuard><AdminH2Android \/><\/AdminGuard>/g) || []).length).toBe(1);
    expect(app).toContain('<Route path={"/android"}><Redirect to="/adm/android" /></Route>');
    expect(app).toContain('<Route path={"/android/"}><Redirect to="/adm/android" /></Route>');
    expect(app).toContain('<Route path={"/admin/android"}><Redirect to="/adm/android" /></Route>');
  });

  it("exibe card individual no ADM sem alterar a ordenacao dos atalhos", () => {
    expect(dashboard).toContain('id: "h2-android", href: "/adm/android"');
    expect(dashboard).toContain("label: \"H2 Android\"");
    expect(dashboard).toContain("featuredAdminShortcuts = orderedAdminShortcuts.slice(0, 12)");
    expect(dashboard).toContain("setCardOrder(saved.includes(\"h2-android\")");
    expect(dashboard).not.toContain('<a href="/android"');
  });

  it("exige adminProcedure em todas as operacoes", () => {
    expect(routers).toContain("h2Android: h2AndroidRouter");
    for (const action of ["overview", "createPairingCode", "revokeAgent", "createProfile", "renameProfile", "deleteProfile"]) {
      expect(androidRouter).toMatch(new RegExp(action + ": adminProcedure"));
    }
    expect(androidRouter).not.toContain("publicProcedure");
    expect(androidRouter).not.toContain("orderStatus");
    expect(androidRouter).not.toContain("h2Ads");
  });

  it("nao finge que instancias estao operantes sem agente", () => {
    expect(androidRouter).toContain("agent.runningAvds.length");
    expect(androidRouter).toContain("agents.some(agent => agent.online)");
    expect(androidRouter).toContain("H2_ANDROID_MAX_RUNNING = 5");
    expect(androidRouter).toContain("control: adminProcedure");
    expect(androidPage).toContain("H2AndroidLiveManager");
    expect(androidPage).toContain("Agente Windows H2 Android");
  });

  it("mostra somente VMs reais e oculta o cadastro visual antigo", () => {
    expect(androidPage).toContain("H2AndroidLiveManager");
    expect(androidPage).toContain("Máquinas H2 detectadas");
    expect(androidPage).toContain("nativeAgentPaired");
    expect(androidPage).toContain("!nativeAgentPaired");
    expect(androidPage).not.toContain("PhoneFrame");
    expect(androidPage).not.toContain("Criar perfil Android");
    expect(androidPage).not.toContain("Perfis de Android cadastrados");
    expect(androidPage).not.toContain("Meus aparelhos");
    expect(androidPage).toContain("Agente Windows H2 Android");
  });

  it("isola os perfis na propria tabela, sem tocar cadastros ou pedidos", () => {
    expect(androidRouter).toContain("h2_android_profiles");
    expect(androidRouter).toContain("WHERE id =");
    expect(androidRouter).not.toContain("DELETE FROM customers");
    expect(androidRouter).not.toContain("DELETE FROM order");
    expect(androidRouter).not.toContain("DELETE FROM access");
  });


  it("informa visualmente quando a consulta do painel Android e concluida ou falha", () => {
    const manager = read("client/src/components/H2AndroidLiveManager.tsx");
    expect(androidPage).toContain("overviewQuery.refetch({ throwOnError: true })");
    expect(manager).toContain("await refresh()");
    expect(manager).toContain("disabled={refreshing}");
    expect(manager).toContain('aria-live="polite"');
    expect(manager).toContain("setLastRefreshedAt(new Date().toLocaleTimeString");
    expect(manager).toContain('toast.error(error instanceof Error ? error.message');
    expect(manager).toContain("Video remoto ainda nao implementado");
  });
  it("nao oferece clonagem que replica dados de outro Android", () => {
    const manager = read("client/src/components/H2AndroidLiveManager.tsx");
    const store = read("server/h2AndroidAgentStore.ts");
    expect(manager).not.toContain('action: "clone"');
    expect(manager).not.toContain("Criar proximo Android");
    expect(manager).toContain("imagem-base limpa");
    expect(store).toContain('if (input.action === "clone")');
    expect(store).toContain("Criacao por copia desativada");
    expect(androidPage).not.toContain("PhoneFrame");
  });

  it("exibe Configuracoes e download na propria aba, sem rolagem pela pagina inteira", () => {
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(admin).toContain('activeSection === "settings" && (');
    expect(admin).toContain('activeSection === "activity" && (');
    expect(admin).toContain('activeSection === "overview" && (');
    expect(admin).toContain('activeSection === "overview" || activeSection === "devices"');
    expect(admin).toContain('id="h2-android-content-top"');
    expect(admin).toContain('id="settings"');
    expect(admin).toContain('Baixar atualização do agente H2');
    expect(admin).toContain('"/api/h2-android/agent/installer.zip"');
    expect(admin).not.toContain('getElementById(section)?.scrollIntoView');
  });
});
