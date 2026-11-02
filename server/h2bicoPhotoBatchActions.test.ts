import { describe, expect, it } from "vitest";
import {readFileSync} from "node:fs";
import { uniqueH2BicoNewPhotos, chunkH2BicoNewPhotos } from "../client/src/lib/h2bicoPhotoBatchActions";
const ui=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
describe("H2BICO: fotos novas em lote",()=>{
 it("seleciona apenas registros novos validos, sem repetir CPF",()=>{
   expect(uniqueH2BicoNewPhotos([{id:10,cpf:"12345678901"},{id:11,cpf:"12345678901"},{id:0,cpf:"00000000000"},{id:12,cpf:"99999999999"}])).toEqual([{id:10,cpf:"12345678901"},{id:12,cpf:"99999999999"}]);
 });
 it("respeita os limites das mutations existentes",()=>{
   expect(chunkH2BicoNewPhotos(Array.from({length:601},(_,i)=>i),300).map(x=>x.length)).toEqual([300,300,1]);
   expect(chunkH2BicoNewPhotos(Array.from({length:501},(_,i)=>i),250).map(x=>x.length)).toEqual([250,250,1]);
 });
 it("usa somente o resultado imported para marcacao",()=>{
   expect(ui).toContain('if(result.result==="imported")');
   expect(ui).toContain("newlyImported.push");
   expect(ui).toContain("batchEar.mutateAsync");
   expect(ui).toContain('decision:"confirm"');
   expect(ui).toContain("NÃO ALTERAR EAR");
   expect(ui).toContain("MANTER PENDENTE");
   expect(ui).toContain("JÁ CONFIRMADA");
 });
});
