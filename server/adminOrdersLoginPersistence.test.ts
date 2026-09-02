import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const patch = fs.readFileSync(path.resolve(process.cwd(), "scripts/patch-admin-login-data-reload.mjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));

describe("AdminOrders - persistência dos dados de login", () => {
  it("corrige a aba Status padrão para carregar login salvo após reload", () => {
    expect(patch).toContain('const isExpandedStatusTab = expandedId !== null && (!activeTab[expandedId] || activeTab[expandedId] === "status");');
    expect(patch).toContain('{ enabled: isExpandedStatusTab, staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }');
  });

  it("aplica o patch antes do build de produção", () => {
    expect(pkg.scripts.prebuild).toBe("node scripts/patch-admin-login-data-reload.mjs");
  });
});
