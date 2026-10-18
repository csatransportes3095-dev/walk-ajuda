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
 it("a tela de lotes apenas copia e nao executa alteracoes",()=>{
  expect(ui).toContain("COPIAR CPFs EM LOTES DE 1.500");
  expect(ui).toContain("COPIAR CPFs DO LOTE");
  expect(ui).not.toContain("confirmLot.mutateAsync");
  expect(ui).not.toContain("decide.mutateAsync");
  expect(ui).not.toContain("unconfirmLot.mutateAsync");
  expect(page).toContain("<H2BicoReviewLotes/>");
 });
 it("a confirmacao de CPFs colados ocorre na gestao em massa e protege descartados",()=>{
  const bulk=readFileSync("client/src/components/H2BicoBulkManager.tsx","utf8");
  expect(server).toContain("managePasted:adminProcedure.input");
  expect(server).toContain('row.reviewState==="discarded"');
  expect(server).toContain("skippedDiscarded");
  expect(server).toContain("skippedProtected");
  expect(bulk).toContain("pasted.mutateAsync");
  expect(bulk).toContain("CONFIRMAR CPFs COLADOS");
  expect(bulk).toContain("APLICAR À LISTA COLADA");
  expect(bulk).toContain("window.confirm");
 });

});