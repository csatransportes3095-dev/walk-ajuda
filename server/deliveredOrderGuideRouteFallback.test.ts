import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const guard = readFileSync("client/public/route-fallback-guard-v1.js", "utf8");
const html = readFileSync("client/index.html", "utf8");
const validToken = "a".repeat(48);

function redirectsFor(pathname: string) {
  const redirects: string[] = [];
  const location = {
    pathname,
    search: "",
    hash: "",
    origin: "https://h2colombiano.com",
    replace: (url: string) => redirects.push(url),
  };
  vm.runInNewContext(guard, { window: { location }, URL });
  return redirects;
}

describe("Pedido Entregue - filtro inicial antes do React", () => {
  it("não manda link individual válido para /login?rota_invalida", () => {
    expect(redirectsFor("/pedido-entregue/" + validToken)).toEqual([]);
  });
  it("não libera links sem token individual válido", () => {
    for (const path of ["/pedido-entregue", "/pedido-entregue/qualquer", "/pedido-entregue/" + "a".repeat(47)]) {
      expect(redirectsFor(path)[0]).toContain("rota_invalida");
    }
  });
  it("atualiza a versão do script para descartar o cache antigo no navegador", () => {
    expect(html).toContain("/route-fallback-guard-v1.js?v=20261122-pedido-entregue-token");
  });
});
