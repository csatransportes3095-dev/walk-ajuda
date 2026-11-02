import { describe, it, expect } from "vitest";
import { parseTransportLocationRows, parseTransportLocationText, parseTransportSheetRows } from "../client/src/lib/transportesImport";
import { normalizeTransportUf } from "../shared/transportes";

describe("Transportes: atualização geográfica em lote segura", () => {
  it("corrige PB informado e aceita UF por extenso", () => {
    const rows = [["CNPJ", "Estado", "Município"], ["18.538.045/0001-80", "Paraíba", "Bayeux"]];
    const result = parseTransportLocationRows(rows);
    expect(result.records).toEqual([{ cnpj: "18538045000180", uf: "PB", city: "Bayeux" }]);
    expect(normalizeTransportUf("São Paulo")).toBe("SP");
  });
  it("não aplica UF padrão SP em arquivos sem UF", () => {
    expect(() => parseTransportLocationRows([["CNPJ", "Cidade"], ["18.538.045/0001-80", "Bayeux"]])).toThrow(/colunas CNPJ e UF/);
    const imported = parseTransportSheetRows([["Razão Social","CNPJ","Cidade"],["Empresa","18.538.045/0001-80","Bayeux"]],"ND","arquivo.xlsx / Geral");
    expect(imported.records[0].uf).toBe("ND");
  });
  it("descarta UF inválida e registros conflitantes do mesmo CNPJ", () => {
    const result = parseTransportLocationText(
      "CNPJ;UF;Cidade\n18.538.045/0001-80;PB;Bayeux\n18.538.045/0001-80;SP;Barueri\n04.252.011/0001-10;XX;Jandira"
    );
    expect(result.records).toHaveLength(0);
    expect(result.conflicts).toBe(1);
    expect(result.rejected).toBe(1);
  });
  it("não inventa município quando só a UF é conhecida", () => {
    const result = parseTransportLocationText("CNPJ;UF\n18.538.045/0001-80;PB");
    expect(result.records).toEqual([{ cnpj: "18538045000180", uf: "PB", city: "" }]);
  });
});
