import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const page=readFileSync("client/src/pages/AdminTransportes.tsx","utf8");
describe("Transportes copiar CNPJ",()=>{
 it("exibe botao individual por card e copia somente digitos",()=>{
  expect(page).toContain("COPIAR CNPJ");
  expect(page).toContain('copyTransportCnpj(r.cnpj)');
  expect(page).toContain('normalizeTransportCnpj(cnpj)');
  expect(page).toContain("navigator.clipboard.writeText(digits)");
  expect(page).toContain("CNPJ copiado:");
 });
});
