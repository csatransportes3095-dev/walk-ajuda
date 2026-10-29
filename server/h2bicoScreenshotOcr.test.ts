import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {parseScreenshotTsv,normalizeScreenshotName,cpfCandidatesInOcrLine} from "./h2bicoScreenshotOcr";
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
 it("mantem a posicao do nome para calcular bordas reais das fotos",()=>{
  const file=readFileSync("server/h2bicoScreenshotCrop.ts","utf8");
  const router=readFileSync("server/routers/h2bico.ts","utf8");
  const ui=readFileSync("client/src/components/H2BicoScreenshotImporter.tsx","utf8");
  expect(file).toContain("alignScreenshotPhotoCrops");
  expect(file).toContain("verticalScore");
  expect(file).toContain("horizScore");
  expect(router).toContain("alignScreenshotPhotoCrops(processed");
  expect(router).toContain("tessedit_char_whitelist=0123456789.-");
  expect(router).toContain("CONFIRA O NUMERO");
  expect(ui).toContain("shouldPreselectH2BicoPhoto({...p,whitePhotoCrop:p.whitePhotoCrop, crop:undefined})");
  expect(readFileSync("client/src/lib/h2bicoImportReview.ts","utf8")).toContain("row.confidence<70");
  expect(ui).toContain("CONFIRA O NUMERO");
  expect(readFileSync("server/h2bicoScreenshotOcr.ts","utf8")).toContain("nameBox:{left:line.left");
 });
 it("aceita virgula, dois-pontos e espacos do OCR sem alterar digitos",()=>{
  expect(cpfCandidatesInOcrLine("149,604:287-59")).toEqual(["14960428759"]);
  expect(cpfCandidatesInOcrLine("456775178:79")).toEqual(["45677517879"]);
  expect(cpfCandidatesInOcrLine("068.071. 833-80")).toEqual(["06807183380"]);
 });
 it("identifica seis cards mesmo com CPF inválido ou faltando para revisao",()=>{
  const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const names=["PESSOA EXEMPLO DE TESTE","OUTRA PESSOA DE TESTE","TERCEIRA PESSOA DE TESTE","QUARTA PESSOA DE TESTE","QUINTA PESSOA DE TESTE","SEXTA PESSOA DE TESTE"];
  const cpfs=["529.982.247-25","111.444.777-35","123,456:789-01","046.953.532-61","148.975.946-85",""];
  let block=1;
  const lines=[header];
  for(let i=0;i<6;i++){
    const y=90+i*170;
    lines.push(word(names[i],160,y,230,block++,1));
    if(cpfs[i])lines.push(word(cpfs[i],160,y+24,130,block++,1));
  }
  const found=parseScreenshotTsv(lines.join("\n"),935,1200);
  expect(found).toHaveLength(6);
  expect(found[0].crop.x).toBeGreaterThan(40);
  expect(found[0].crop.size).toBeGreaterThan(65);
  expect(found[5].cpf).toBe("");
  expect(found[5].warnings.some(w=>w.includes("não reconhecido"))).toBe(true);
 });
 it("nao considera CPF sem digito verificador correto como apto a salvar",()=>{
  expect(isValidCpf("52998224725")).toBe(true);
  expect(isValidCpf("52998224726")).toBe(false);
  expect(normalizeScreenshotName("MARIA DAS GRAÇAS 123")).toBe("MARIA DAS GRAÇAS");
 });
 it("permite colar print sem limite artificial, preservando OCR sequencial",()=>{
  const component=readFileSync("client/src/components/H2BicoScreenshotImporter.tsx","utf8");
  expect(component).toContain("COLAR PRINT");
  expect(component).toContain('document.addEventListener("paste",handlePaste)');
  expect(component).toContain("navigator.clipboard.read()");
  expect(component).toContain("pendingRef.current.push(...chosen)");
  expect(component).toContain("while(pendingRef.current.length)");
  expect(component).not.toContain("slice(0,12)");
  expect(component).toContain("10 MB por imagem");
 });
 it("mantem confirmacao e preserva cadastros",()=>{
  const server=readFileSync("server/routers/h2bico.ts","utf8");
  const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
  const component=readFileSync("client/src/components/H2BicoScreenshotImporter.tsx","utf8");
  expect(page).toContain("<H2BicoScreenshotImporter/>");
  expect(server).toContain('importScreenshotRecord: adminProcedure.input');
  expect(server).toContain('SELECT id FROM h2bico_records WHERE cpf=');
  expect(server).toContain('VALUES(${name || "SEM NOME"},${input.cpf},${url}');
   expect(server).toContain('if(!isValidCpf(input.cpf)');
  expect(component).toContain('SALVAR ');
  expect(component).toContain('selected&&!row.saved');
  expect(component).toContain('await cropPhoto(item)');
 });

 it("associa nome e CPF mesmo em mesma linha ou com CPF acima",()=>{
  const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const line=(text:string,x:number,y:number,block:number)=>["5","1",block,"1","1","1",x,y,250,18,94,text].join("\t");
  const tsv=[header,
    line("NOME: Maria de Souza CPF: 529.982.247-25",80,80,1),
    line("111.444.777-35",580,290,2),
    line("JOSE PEREIRA",580,315,3)].join("\n");
  const found=parseScreenshotTsv(tsv,1200,800);
  expect(found.some(p=>p.cpf==="52998224725"&&p.name==="MARIA DE SOUZA")).toBe(true);
  expect(found.some(p=>p.cpf==="11144477735"&&p.name==="JOSE PEREIRA")).toBe(true);
  expect(new Set(found.filter(p=>p.cpf).map(p=>p.cpf)).size).toBe(found.filter(p=>p.cpf).length);
 });
 it("nao duplica CPF entre cards e sinaliza recorte em layout alternativo",()=>{
  const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const line=(text:string,x:number,y:number,b:number)=>["5","1",b,"1","1","1",x,y,150,18,96,text].join("\t");
  const found=parseScreenshotTsv([header,
    line("MARIA DE SOUZA",50,120,1),line("529.982.247-25",50,150,2),
    line("JOSE PEREIRA",50,350,3),line("111.444.777-35",50,385,4)].join("\n"),1000,850);
  expect(found).toHaveLength(2);
  expect(found.every(p=>p.photoLayout==="right")).toBe(true);
  expect(found.every(p=>p.warnings.some(w=>w.includes("CONFIRA RECORTE")))).toBe(true);
 });

 it("recupera CPF de linha de resultado sem nome aceito pelo OCR",()=>{
  const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const entries=[
    word("52998224725",235,240,135,1,1),
    word("MARCOS",430,240,95,2,1),
    word("BARBOSA",535,240,125,2,1),
    word("-",675,240,15,2,1),
    word("04/11/1961",695,240,115,2,1),
  ];
  const found=parseScreenshotTsv([header,...entries].join("\n"),1080,900);
  expect(found.some(p=>p.cpf==="52998224725")).toBe(true);
  expect(found.every(p=>p.crop.size>=48)).toBe(true);
 });
 it("nao perde CPF quando nome esta ausente e obriga a conferencia",()=>{
  const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const found=parseScreenshotTsv([header,word("52998224725",230,210,125,1,1)].join("\n"),1080,900);
  expect(found).toHaveLength(1);
  expect(found[0].name).toBe("");
  expect(found[0].cpf).toBe("52998224725");
  expect(found[0].warnings.some(w=>w.includes("Digite o nome"))).toBe(true);
 });
});
