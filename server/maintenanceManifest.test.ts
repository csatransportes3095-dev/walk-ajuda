import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAINTENANCE_MANIFEST,
  isMaintenanceManifestActiveForPath,
  maintenanceRouteIdForPath,
  parseMaintenanceManifest,
} from "../shared/maintenanceManifest";

describe("Manifesto de Manutenção", () => {
  it("permanece desativado e seguro quando ainda não existe configuração", () => {
    expect(parseMaintenanceManifest(undefined)).toEqual(DEFAULT_MAINTENANCE_MANIFEST);
  });

  it("mantém a atualização cadastral desativada por padrão e aceita sua ativação", () => {
    expect(DEFAULT_MAINTENANCE_MANIFEST.requireCompleteProfileForSchedule).toBe(false);
    expect(parseMaintenanceManifest(JSON.stringify({ requireCompleteProfileForSchedule: true })).requireCompleteProfileForSchedule).toBe(true);
    expect(parseMaintenanceManifest(JSON.stringify({ requireCompleteProfileForSchedule: 1 })).requireCompleteProfileForSchedule).toBe(false);
  });

  it("aceita apenas rotas liberadas e descarta valores inválidos", () => {
    const config = parseMaintenanceManifest(JSON.stringify({
      enabled: true,
      routeIds: ["home", "login", "admin", "gastos"],
      title: "Ajuste técnico",
      message: "Voltamos em breve.",
      eyebrow: "MANUTENÇÃO",
    }));
    expect(config.routeIds).toEqual(["home", "login", "gastos"]);
    expect(config.enabled).toBe(true);
  });

  it("mostra o manifesto somente na rota selecionada", () => {
    const config = { ...DEFAULT_MAINTENANCE_MANIFEST, enabled: true, routeIds: ["loan"] as const };
    expect(isMaintenanceManifestActiveForPath(config, "/emprestimo")).toBe(true);
    expect(isMaintenanceManifestActiveForPath(config, "/gastos")).toBe(false);
    expect(isMaintenanceManifestActiveForPath(config, "/admin/settings")).toBe(false);
  });

  it("normaliza a rota da página inicial e preserva o mapeamento público", () => {
    expect(maintenanceRouteIdForPath("/")).toBe("home");
    expect(maintenanceRouteIdForPath("/LOGIN/")).toBe("login");
    expect(maintenanceRouteIdForPath("/emprestimo")).toBe("loan");
    expect(maintenanceRouteIdForPath("/cartoes")).toBeNull();
  });
});
