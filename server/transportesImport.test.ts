import { describe, it, expect } from "vitest";
import { parseTransportSheetRows, parseTransportText, recognizeImportHeading, isUsedTransportCell } from "../client/src/lib/transportesImport";

describe("Transportes: importacao das planilhas reais", () => {
  it("reconhece cabeçalhos profissionais", () => {
    expect(recognizeImportHeading("EMPRESA / TRANSPORTADORA")).toBe("name");
    expect(recognizeImportHeading("Razão Social")).toBe("name");
    expect(recognizeImportHeading("CNAE Principal")).toBe("cnae");
    expect(recognizeImportHeading("USADO_BOOL")).toBe("isUsed");
  });
  it("importa a LISTA GERAL com oito linhas de introducao", () => {
    const rows:unknown[][] = [["LISTA GERAL"], ["BASE"], ["RESUMO"], [], [], [], [], ["UF","MUNICIPIO","EMPRESA / TRANSPORTADORA","CNPJ","CATEGORIA","STATUS","ABRIR / MARCAR","CNAE","CONFERENCIA","FONTE / ORIGEM","ABA_UF","LINHA_UF","USADO_BOOL"], ["SP","Jandira","Transportadora Exemplo","04.252.011/0001-10","Transportadora / carga","DISPONIVEL", "ABRIR", "4930-2/02","","Origem","SP",11,false], ["SP","Osasco","Viação Teste","04.252.011/0001-10","Ônibus","JÁ USADO","","4921301","","Origem","SP",12,true]];
    const r=parseTransportSheetRows(rows,"SP","planilha.xlsx / LISTA GERAL");
    expect(r.records).toHaveLength(2);
    expect(r.records[0].cnpj).toBe("04252011000110");
    expect(r.records[1].isUsed).toBe(true);
    expect(r.records[0].city).toBe("Jandira");
  });
  it("importa colunas de SP com USADO e sem UF", () => {
    const r=parseTransportSheetRows([["USADO?","STATUS","MUNICIPIO","EMPRESA / TRANSPORTADORA","CNPJ","CATEGORIA","CNAE"],[true,"JÁ USADO","Jandira","Empresa","04.252.011/0001-10","Ônibus","4921301"]],"ND","lista.xlsx / SP");
    expect(r.records).toHaveLength(1);
    expect(r.records[0].uf).toBe("SP");
    expect(r.records[0].isUsed).toBe(true);
  });
  it("importa planilha simples de 15 mil", () => {
    const r=parseTransportSheetRows([["Razão Social","CNPJ","Tipo de Serviço","CNAE Principal","Cidade","UF"], ["Exemplo","10.000.000/0001-99","Carga","4930-2/02","São Paulo","SP"]],"SP","15 MIL.xlsx / Sheet1");
    expect(r.records).toHaveLength(1);
    expect(r.records[0].cnpj).toBe("10000000000199");
  });
  it("não interpreta DISPONIVEL como JÁ USADO", () => {
    expect(isUsedTransportCell("MARCAR USO")).toBe(false);
    expect(isUsedTransportCell("JÁ USADO")).toBe(true);
    expect(isUsedTransportCell(false)).toBe(false);
    expect(isUsedTransportCell(true)).toBe(true);
  });
  it("aceita texto colado CSV", () => {
    const r=parseTransportText("Razão Social;CNPJ;Tipo de Serviço;CNAE Principal;Cidade;UF\nEmpresa;04.252.011/0001-10;Carga;4930-2/02;Jandira;SP","SP");
    expect(r.records).toHaveLength(1);
  });
});