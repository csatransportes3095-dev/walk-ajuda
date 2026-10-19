import { describe, it, expect } from "vitest";
import { getCatalogCategory, catalogCategoryAvailability } from "../client/src/lib/storefrontCategories";
describe("Atalhos da vitrine",()=>{
 it("prioriza o nome do produto",()=>{
  expect(getCatalogCategory({name:"99 APP MOTORISTA",description:"UBER"})).toBe("99");
  expect(getCatalogCategory({name:"UBER TAXI",description:"corridas"})).toBe("Táxi");
  expect(getCatalogCategory({name:"EDIÇÃO DOC VEÍCULO",description:"somente Uber"})).toBe("Documentos");
  expect(getCatalogCategory({name:"NOVO SERVIÇO",description:""})).toBe("Outros");
 });
 it("oculta categorias sem opções ativas visíveis",()=>{
  const {categories,counts}=catalogCategoryAvailability([{category:"Uber"},{category:"Uber"},{category:"Documentos"}]);
  expect(categories).toEqual(["Todos","Uber","Documentos"]);
  expect(counts.Uber).toBe(2);
  expect(counts["99"]).toBe(0);
  expect(catalogCategoryAvailability([]).categories).toEqual(["Todos"]);
 });
});