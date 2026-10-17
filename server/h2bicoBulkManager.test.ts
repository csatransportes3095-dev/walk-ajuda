import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const server=readFileSync("server/routers/h2bico.ts","utf8");
const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
const component=readFileSync("client/src/components/H2BicoBulkManager.tsx","utf8");
describe("H2BICO - gestão de CPF em massa",()=>{
 it("trabalha apenas no H2BICO, dentro de rotas administrativas",()=>{
  expect(page).toContain("<H2BicoBulkManager/>");
  expect(server).toContain("bulkLookup: adminProcedure.input");
  expect(server).toContain("bulkEarMarker: adminProcedure.input");
  expect(server).toContain("bulkArchive: adminProcedure.input");
  expect(server).toContain("bulkCopyCpfs: adminProcedure.input");
 });
 it("confere banco e protege CPFs usados ou com pedidos vinculados",()=>{
  expect(server).toContain('row.status==="used"||row.usedAt||row.linkedOrder');
  expect(server).toContain('status IN (\'available\',\'reserved\',\'in_use\')');
  expect(server).toContain("INSERT INTO h2bico_history");
  expect(server).toContain("LEFT JOIN h2bico_ear_marks");
 });
 it("pede confirmação, expõe filtros e trabalha em lotes de até 300",()=>{
  expect(component).toContain("window.confirm");
  expect(component).toContain('i+=300');
  expect(component).toContain("COM EAR");
  expect(component).toContain("SEM EAR");
  expect(component).toContain("COPIAR TODOS");
  expect(component).toContain("Arquivados");
 });
});