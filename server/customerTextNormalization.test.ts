import { describe,it,expect } from "vitest";
import { normalizeCustomerText,normalizedCustomerTextRecord,hasCustomerTextDifferences } from "../shared/customerTextNormalization";
describe("Cadastro de clientes: letras sem acentos e maiusculas",()=>{
 it("remove acentos e cedilha de nomes e enderecos",()=>{
  expect(normalizeCustomerText("  Maurício José da Conceição  ")).toBe("MAURICIO JOSE DA CONCEICAO");
  expect(normalizeCustomerText("Taboão da Serra / São Paulo")).toBe("TABOAO DA SERRA / SAO PAULO");
  expect(normalizeCustomerText("Rua Açúcar, nº 42")).toBe("RUA ACUCAR, Nº 42");
 });
 it("mantem campos vazios e espacos canonicos",()=>{
  expect(normalizeCustomerText("João   da  Silva")).toBe("JOAO DA SILVA");
  expect(normalizeCustomerText("")).toBe("");
  const before={name:"José",street:"Rua São João",addressNumber:"42",neighborhood:"Conceição",addressComplement:null,city:"São Paulo",uf:"sp",referredBy:"João"};
  const after=normalizedCustomerTextRecord(before);
  expect(after).toEqual({name:"JOSE",street:"RUA SAO JOAO",addressNumber:"42",neighborhood:"CONCEICAO",addressComplement:null,city:"SAO PAULO",uf:"SP",referredBy:"JOAO"});
  expect(hasCustomerTextDifferences(before,after)).toBe(true);
  expect(hasCustomerTextDifferences(after,normalizedCustomerTextRecord(after))).toBe(false);
 });
});