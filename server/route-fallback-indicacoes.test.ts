import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const guard = readFileSync("client/public/route-fallback-guard-v1.js","utf8");
const html = readFileSync("client/index.html","utf8");

function visit(pathname: string) {
  const redirects:string[]=[];
  const location={
    pathname, search:"", hash:"",origin:"https://h2colombiano.com",
    replace:(url:string)=>redirects.push(url),
  };
  vm.runInNewContext(guard, {window:{location},URL});
  return redirects;
}
describe("H2 public SPA route allowlist",()=>{
  it("does not redirect /indicacoes to invalid login",()=>{
    expect(visit("/indicacoes")).toEqual([]);
  });
  it("preserves expected home and login",()=>{
    expect(visit("/")).toEqual([]);
    expect(visit("/login")).toEqual([]);
    expect(visit("/acompanhar")).toEqual([]);
  });
  it("continues rejecting unknown public routes",()=>{
    expect(visit("/rota-desconhecida")[0]).toContain("rota_invalida");
  });
  it("busts old guard cache for existing browsers",()=>{
    expect(html).toContain("/route-fallback-guard-v1.js?v=20261102-adm-routes-v2");
  });
});