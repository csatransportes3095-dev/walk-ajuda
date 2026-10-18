import { describe, expect, it } from "vitest";
import { REFERENCIAS_WMI_REVISADAS, REFERENCIAS_WMI_BRASIL, consultarFabricanteWmi, extrairPrefixoWmi } from "../shared/chassisWmiReference";
describe("Consulta WMI somente leitura", () => {
 it("identifica os quatro fabricantes revisados", () => {
  expect(REFERENCIAS_WMI_REVISADAS.map(x=>[x.fabricante,x.prefixo])).toEqual([["Fiat","9BD"],["Renault","93Y"],["Nissan","94D"],["Peugeot","936"]]);
 });
 it("não confunde os prefixos antigos", () => {
  expect(["9BS","9BM","9BN","935"].map(x=>consultarFabricanteWmi(x)?.fabricante)).toEqual(["Scania","Mercedes-Benz","Mafersa","Citroën"]);
 });
 it("aceita WMI isolado ou início de chassi, sem afirmar autenticidade", () => {
  expect(consultarFabricanteWmi(" 9bd ")?.fabricante).toBe("Fiat");
  expect(consultarFabricanteWmi("936-2A7")?.fabricante).toBe("Peugeot");
  expect(extrairPrefixoWmi("93Y12345678901234")).toBe("93Y");
 });
 it("recusa entradas malformadas e não inventa fabricante desconhecido", () => {
  expect(consultarFabricanteWmi("9ZZ")).toBeNull();
  expect(consultarFabricanteWmi("9B")).toBeNull();
  expect(consultarFabricanteWmi("9BI")).toBeNull();
  expect(consultarFabricanteWmi("9B@")).toBeNull();
  expect(consultarFabricanteWmi("9BD"+"X".repeat(15))).toBeNull();
  expect(new Set(REFERENCIAS_WMI_BRASIL.map(x=>x.prefixo)).size).toBe(REFERENCIAS_WMI_BRASIL.length);
 });
});