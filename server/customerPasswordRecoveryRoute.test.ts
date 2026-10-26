import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const guard = readFileSync("client/public/route-fallback-guard-v1.js", "utf8");
function executeGuard(pathname: string, search = "", hash = "") {
  const replace = vi.fn();
  runInNewContext(guard, {
    URL,
    window: { location: { pathname, search, hash, origin: "https://h2colombiano.com", replace } },
  });
  return replace;
}

describe("recovery route navigation — executed fallback script", () => {
  it("keeps recovery at its own page rather than starting login again", () => {
    expect(executeGuard("/recuperarsenha")).not.toHaveBeenCalled();
  });
  it("does not lose recovery query or hash through a login redirect", () => {
    expect(executeGuard("/recuperarsenha", "?from=login", "#recovery")).not.toHaveBeenCalled();
  });
  it.each(["/login", "/admin/h2-auto", "/gastos", "/emprestimo", "/acompanhar"])("preserves existing route %s", pathname => {
    expect(executeGuard(pathname)).not.toHaveBeenCalled();
  });
  it("continues rejecting a truly unknown route", () => {
    const replace = executeGuard("/rota-inexistente");
    expect(replace).toHaveBeenCalledOnce();
    const destination = new URL(replace.mock.calls[0][0]);
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("rota_invalida")).toBe("/rota-inexistente");
  });
  it("loads a new guard cache version in the HTML", () => {
    const html = readFileSync("client/index.html", "utf8");
    expect(html).toContain("/route-fallback-guard-v1.js?v=20261026-recuperarsenha-v2");
  });
});
