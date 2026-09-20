import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("consistência da árvore e filtro de indicações", () => {
  it("usa uma única fonte para contador e lista de indicados", () => {
    const dbSource = read("server/db.ts");
    expect(dbSource).toContain("async function loadReferralGraph");
    expect(dbSource).toContain("graph.childrenByReferrer.get(phoneDigits) || []");
    expect(dbSource).toContain("export async function getIndicatedByReferrer");
    expect(dbSource).toContain("export async function getReferralTree");
  });

  it("expõe uma árvore descendente real no router", () => {
    const routerSource = read("server/routers.ts");
    expect(routerSource).toContain("getTree: adminProcedure");
    expect(routerSource).toContain("getReferralTree(input.phone, input.depth)");
  });

  it("o Cadastro Principal filtra pela mesma relação referredByPhone", () => {
    const pageSource = read("client/src/pages/AdminCustomers.tsx");
    expect(pageSource).toContain("normalizeReferralFilterPhone(c.referredByPhone) === selectedReferrerPhone");
    expect(pageSource).toContain("Mostrando <strong>{filtered.length}</strong> cliente(s) indicado(s)");
    expect(pageSource).toContain("Ver árvore");
  });

  it("a tela de árvore renderiza filhos recursivamente", () => {
    const treeSource = read("client/src/pages/ClientReferralTree.tsx");
    expect(treeSource).toContain("<ReferralNode node={child} onOpen={onOpen} />");
    expect(treeSource).toContain("Quem indicou → cliente → pessoas indicadas → próximos níveis");
  });
});
