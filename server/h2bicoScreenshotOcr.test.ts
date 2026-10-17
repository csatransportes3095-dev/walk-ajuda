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
   word("DIEGO",280,119,70,1,1),word("MARQUES",355,119,110,1,1),
   word("ALVES",470,119,70,1,1),word("PINTO",545,119,80,1,1),
   word("149.604.287-59",279,156,140,2,1),
   word("MATHEUS",280,384,110,3,1),word("ADELINO",400,384,110,3,1),
   word("DA",512,384,30,3,1),word("SILVA",545,384,75,3,1),
   word("456.775.178-79",279,420,140,4,1)].join("\n");
  const persons=parseScreenshotTsv(lines,1489,1584);
  expect(persons).toHaveLength(2);
  expect(persons[0].name).toBe("DIEGO MARQUES ALVES PINTO");
  expect(persons[0].cpf).toBe("14960428759");
  expect(persons[0].crop.x).toBeGreaterThan(80);
  expect(persons[0].crop.x).toBeLessThan(190);
  expect(persons[1].name).toBe("MATHEUS ADELINO DA SILVA");
  expect(persons.every(p=>isValidCpf(p.cpf))).toBe(true);
 });
 it("nao considera CPF sem digito verificador correto como apto a salvar",()=>{
  expect(isValidCpf("14960428759")).toBe(true);
  expect(isValidCpf("14960428750")).toBe(false);
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