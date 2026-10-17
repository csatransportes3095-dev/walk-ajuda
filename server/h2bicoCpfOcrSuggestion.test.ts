import {describe,expect,it} from "vitest";
import {suggestCpfFromMisreadDigits} from "./h2bicoCpfOcrSuggestion";
import {readFileSync} from "node:fs";
describe("H2BICO - sugestao segura de CPF no OCR",()=>{
 it("sugere correcao para a troca visual de 5 por 9 no primeiro digito",()=>{
  expect(suggestCpfFromMisreadDigits("99995904691")).toBe("59995904691");
  expect(suggestCpfFromMisreadDigits("59995904691")).toBe(null);
 });
 it("nunca inventa sugestao para entrada malformada ou sem correspondencia unica",()=>{
  expect(suggestCpfFromMisreadDigits("")).toBe(null);
  expect(suggestCpfFromMisreadDigits("11111111111")).toBe(null);
 });
 it("mantem numero original e exige revisao humana",()=>{
  const server=readFileSync("server/routers/h2bico.ts","utf8");
  const ui=readFileSync("client/src/components/H2BicoScreenshotImporter.tsx","utf8");
  expect(server).toContain("cpfSuggestion:suggestCpfFromMisreadDigits(row.cpf)");
  expect(ui).toContain("CONFERI NO PRINT");
  expect(ui).toContain("window.confirm");
  expect(ui).toContain("selected:false");
 });
});