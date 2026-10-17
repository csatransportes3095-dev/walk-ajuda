import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const server=readFileSync("server/h2bicoReview.ts","utf8");
const core=readFileSync("server/routers/h2bico.ts","utf8");
const router=readFileSync("server/routers.ts","utf8");
const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
const ui=readFileSync("client/src/components/H2BicoReviewLotes.tsx","utf8");
describe("H2BICO: conferencia persistente",()=>{
 it("cria lotes estaveis de 1500 CPFs e historico sem mudar fotos ou marcadores EAR",()=>{
  expect(server).toContain("const LOT_SIZE=1500");
  expect(server).toContain("h2bico_review_run_items");
  expect(server).toContain("ROW_NUMBER() OVER (ORDER BY r.id ASC)-1");
  expect(server).toContain("h2bico_review_runs");
  expect(server).toContain("review_discarded");
  expect(server).toContain("h2bico_history");
  expect(server).not.toContain("DELETE FROM h2bico_records");
 });
 it("protege usados e vinculados e bloqueia restauracao indevida em rotas antigas",()=>{
  expect(server).toContain('row.usedAt==null');
  expect(server).toContain("linkedOrder");
  expect(core).toContain('current.reviewState === "discarded"');
  expect(core).toContain('(row as any).reviewState==="discarded"');
  expect(router).toContain("h2bicoReview: h2bicoReviewRouter");
 });
 it("somente endpoints administrativos e confirmação antes de alteração",()=>{
  for(const key of ["stats","runs","createRun","lots","lot","decide","confirmLot"])
    expect(server).toMatch(new RegExp(key+":adminProcedure"));
  expect(ui).toContain("window.confirm");
  expect(ui).toContain("CONFIRMAR");
  expect(ui).toContain("DESCARTAR / ARQUIVAR");
  expect(ui).toContain("RESTAURAR DESCARTADOS");
  expect(page).toContain("<H2BicoReviewLotes/>");
 });
});