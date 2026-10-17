import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {parseScreenshotTsv,normalizeScreenshotName} from "./h2bicoScreenshotOcr";
import {isValidCpf} from "../client/src/lib/h2bicoCpfExtractor";

function word(text:string,x:number,y:number,w:number,block:number,line:number){
  return ["5","1",block,"1",line,"1",x,y,w,18,96,text].join("\t");
}
describe("H2BICO: extracao de pessoas em prints",()=>{
 it("associa nome e CPF validos ao mesmo card e calcula recorte",()=>{
  const lines=["level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
   word("PESSOA",280,119,70,1,1),word("EXEMPLO",355,119,110,1,1),
   word("DE",470,119,70,1,1),word("TESTE",545,119,80,1,1),
   word("529.982.247-25",279,156,140,2,1),
   word("OUTRA",280,384,110,3,1),word("PESSOA",400,384,110,3,1),
   word("DE",512,384,30,3,1),word("TESTE",545,384,75,3,1),
   word("111.444.777-35",279,420,140,4,1)].join("\n");
  const persons=parseScreenshotTsv(lines,1489,1584);
  expect(persons).toHaveLength(2);
  expect(persons[0].name).toBe("PESSOA EXEMPLO DE TESTE");
  expect(persons[0].cpf).toBe("52998224725");
  expect(persons[0].crop.x).toBeGreaterThan(80);
  expect(persons[0].crop.x).toBeLessThan(190);
  expect(persons[1].name).toBe("OUTRA PESSOA DE TESTE");
  expect(persons.every(p=>isValidCpf(p.cpf))).toBe(true);
 });
 it("nao considera CPF sem digito verificador correto como apto a salvar",()=>{
  expect(isValidCpf("52998224725")).toBe(true);
  expect(isValidCpf("52998224726")).toBe(false);
  expect(normalizeScreenshotName("MARIA DAS GRAÇAS 123")).toBe("MARIA DAS GRAÇAS");
 });
 it("mantem confirmacao e preserva cadastros",()=>{
  const server=readFileSync("server/routers/h2bico.ts","utf8");
  const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
  const component=readFileSync("client/src/components/H2BicoScreenshotImporter.tsx","utf8");
  expect(page).toContain("<H2BicoScreenshotImporter/>");
  expect(server).toContain('importScreenshotRecord: adminProcedure.input');
  expect(server).toContain('SELECT id FROM h2bico_records WHERE cpf=');
  expect(server).toContain('VALUES(${name},${input.cpf},${url}');
  expect(component).toContain('SALVAR ');
  expect(component).toContain('selected&&!row.saved');
  expect(component).toContain('await cropPhoto(item)');
 });
});