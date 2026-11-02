import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
const server=readFileSync("server/routers/h2bico.ts","utf8");
describe("H2 Bico EAR visivel apos importar",()=>{
 it("opcoes aparecem mesmo sem arquivos na selecao",()=>{
  const anchor=page.indexOf('EAR E CONFIRMAÇÃO — ANTES OU DEPOIS DE IMPORTAR');
  const conditional=page.indexOf('{batch.length>0&&<>');
  expect(anchor).toBeGreaterThan(0);
  expect(anchor).toBeLessThan(conditional);
 });
 it("so marca depois de confirmar e protege existentes",()=>{
  expect(page).toContain("window.confirm");
  expect(page).toContain("row.eligible");
  expect(page).toContain("APLICAR AO LOTE RECENTE");
  expect(server).toContain("recentPhotoImports: adminProcedure");
  expect(server).toContain("r.source='importacao-lote'");
  expect(server).toContain("row.reviewState!==\"discarded\"");
 });
});
