import {describe,it,expect} from "vitest";
import {resolveH2BicoCardName} from "../client/src/lib/h2bicoCardName";
describe("H2BICO: foto CPF e nome no mesmo card",()=>{
 it("recupera o nome pelo CPF cadastrado sem misturar com OCR de outro card",()=>{
  const result=resolveH2BicoCardName("FREQUÊNCIA DE FACE DETECTADA","RODRIGO DE SOUZA",true);
  expect(result).toMatchObject({name:"RODRIGO DE SOUZA",source:"cadastro"});
 });
 it("prioriza o cadastro existente quando OCR mostra outro nome",()=>{
  const r=resolveH2BicoCardName("PEDRO SILVA","RODRIGO DE SOUZA",true);
  expect(r.name).toBe("RODRIGO DE SOUZA"); expect(r.warning).toBeTruthy();
 });
 it("retém um nome legítimo extraído para CPF novo",()=>{
  expect(resolveH2BicoCardName("PEDRO DA SILVA",null,false)).toMatchObject({name:"PEDRO DA SILVA",source:"ocr"});
 });
 it("não inventa nome para print sem texto",()=>{
  expect(resolveH2BicoCardName("NOME COMPLETO",null,false)).toMatchObject({name:"",source:"pending"});
 });
});