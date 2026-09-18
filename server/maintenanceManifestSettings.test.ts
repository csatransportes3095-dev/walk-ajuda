import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const settingsPage = fs.readFileSync(path.join(root, "client/src/pages/AdminSettings.tsx"), "utf8");
const manifestSettings = fs.readFileSync(path.join(root, "client/src/components/MaintenanceManifestSettings.tsx"), "utf8");

describe("salvamento do manifesto de manutenção", () => {
  it("faz o botão Salvar Tudo salvar o manifesto quando a aba de manutenção está aberta", () => {
    expect(settingsPage).toContain('if (activeTab === "maintenance")');
    expect(settingsPage).toContain("maintenanceManifestRef.current?.save()");
    expect(settingsPage).toContain("<MaintenanceManifestSettings ref={maintenanceManifestRef} />");
  });

  it("expõe ao painel a mesma função que valida e grava o manifesto", () => {
    expect(manifestSettings).toContain("useImperativeHandle(ref, () => ({ save })");
    expect(manifestSettings).toContain('toast.error("Escolha pelo menos uma rota antes de ativar o manifesto.")');
    expect(manifestSettings).toContain("saveMutation.mutate({");
  });
});
