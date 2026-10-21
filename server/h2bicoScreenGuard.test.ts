import {describe,it,expect} from "vitest";
import {isH2BicoInterfaceScreenshot,parseScreenshotTsv} from "./h2bicoScreenshotOcr";
const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const row=(text:string,i:number)=>["5","1",i,"1","1","1",120,80+i*30,260,20,96,text].join("\t");
describe("H2BICO screen recursion protection",()=>{
it("rejects screenshot of importer UI even when it has a valid CPF",()=>{
const tsv=[header,row("RECORTE AVATAR INTELIGENTE",1),row("MARCACAO EAR",2),row("LOCALIZAR ROSTO",3),row("RODRIGO DE SOUZA",4),row("52998224725",5)].join("\n");
expect(isH2BicoInterfaceScreenshot(tsv)).toBe(true);
expect(parseScreenshotTsv(tsv,1200,800)).toEqual([]);
});
it("keeps normal identification print without H2BICO controls",()=>{
const tsv=[header,row("RODRIGO DE SOUZA",1),row("52998224725",2)].join("\n");
expect(isH2BicoInterfaceScreenshot(tsv)).toBe(false);
expect(parseScreenshotTsv(tsv,1200,800).some(x=>x.cpf==="52998224725")).toBe(true);
});
});