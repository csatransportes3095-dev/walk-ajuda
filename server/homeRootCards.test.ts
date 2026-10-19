import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
describe("H2 root landing route",()=>{
 it("uses four public route links without redirecting root to login",()=>{
  const app=readFileSync("client/src/App.tsx","utf8");
  const home=readFileSync("client/src/pages/HomeRouteCards.tsx","utf8");
  expect(app).toContain('component={HomeRouteCards}');
  expect(app).toContain('if (location === "/") {\n    return <Router />;');
  expect(app).not.toContain('<Redirect to={"/login" + suffix} />');
  for(const route of ["/login","/acompanhar","/gastos","/emprestimo"])expect(home).toContain('href:"'+route+'"');
 });
});