import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {chooseAutomaticCpf} from "./h2bicoScreenshotAutoCpf";
describe("H2BICO OCR CPF em lote",()=>{
  it("corrige automaticamente o exemplo real somente com duas leituras concordantes",()=>{
    expect(chooseAutomaticCpf("99995904691",["599.959.046-91","599.959.046-91"])).toBe("59995904691");
    expect(chooseAutomaticCpf("99995904691",["599.959.046-91"])).toBe(null);
    expect(chooseAutomaticCpf("99995904691",["999.959.046-91","599.959.046-91"])).toBe(null);
  });
  it("nao altera CPF valido, invalido sem apoio ou texto com 11 digitos incompletos",()=>{
    expect(chooseAutomaticCpf("59995904691",["99995904691","99995904691"])).toBe(null);
    expect(chooseAutomaticCpf("11111111111",["12345678901"])).toBe(null);
    expect(chooseAutomaticCpf("9999590469",["59995904691","59995904691"])).toBe(null);
  });
  it("le a linha exata do CPF e permite selecionar resultados automaticamente",()=>{
    const source=readFileSync("server/routers/h2bico.ts","utf8");
    const parser=readFileSync("server/h2bicoScreenshotOcr.ts","utf8");
    const userInterface=readFileSync("client/src/components/H2BicoScreenshotImporter.tsx","utf8");
    expect(source).toContain("await autoReadCpfLine({");
    expect(parser).toContain("cpfBox:cpfCandidate?");
    expect(source).toContain("person.cpf=fixed");
    expect(userInterface).toContain("p.validCpf");
    expect(userInterface).toContain("SALVAR ");
  });
});