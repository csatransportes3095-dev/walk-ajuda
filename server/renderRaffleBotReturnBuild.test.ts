import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const source = readFileSync("client/src/pages/AtualizarCadastro.tsx", "utf8");
const patch = readFileSync("scripts/patch-raffle-profile-update-gate-20260910.mjs", "utf8");

describe("Render: cadastro retorna ao sorteio e ao ColombiaBot", () => {
  it("autoriza tanto /sorteio quanto /bot sem abrir destinos externos", () => {
    const safeReturnList = source.match(/if \(\[([^\n]+)\]\.includes\(raw\)\) return raw;/);
    expect(safeReturnList).not.toBeNull();
    const routes = safeReturnList![1].match(/"[^"]+"/g) || [];
    expect(routes).toContain('"/sorteio"');
    expect(routes).toContain('"/bot"');
    expect(routes).toContain('"/login"');
    expect(source).toContain('return "/"');
    expect(source).toContain("getSafeReturnTo()");
  });

  it("o patch Docker não depende de lista antiga de destinos", () => {
    expect(patch).toContain("const routeLine = updatePage.match(");
    expect(patch).toContain("if (!updatePage.includes('\"/sorteio\"'))");
    expect(patch).toContain("routeLine[0].replace(");
    expect(patch).not.toContain('if (["/", "/login", "/acompanhar", "/gastos", "/emprestimo"].includes(raw)) return raw;');
  });
});
