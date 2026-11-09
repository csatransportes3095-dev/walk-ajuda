import { describe, expect, it } from "vitest";
import { parseVehicleVaultClassification } from "./vehicleVaultClassification";

describe("Cofre da Frota - classificação e exercício", () => {
  it("reconhece categoria e exercício no texto estruturado sem confundir com fabricação", () => {
    const text = [
      "--- DADOS DO VEÍCULO ---",
      "Placa: SMR8H86",
      "Ano Fabricação: 2024",
      "Ano Modelo: 2024",
      "Categoria: PARTICULAR",
      "--- IPVA & LICENCIAMENTO ---",
      "Ano IPVA/Licença: 2024",
    ].join("\n");
    expect(parseVehicleVaultClassification(text)).toEqual({
      category: "PARTICULAR", exerciseYear: 2024,
    });
  });

  it("reconhece CRLV digital em duas colunas conforme OCR do PDF de exemplo", () => {
    const text = [
      "CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO - DIGITAL CATEGORIA CAPACIDADE",
      "PARTICULAR",
      "PLACA exercicio E",
      "RBK7D81 2026 2 MOTOR",
      "ANO FABRICAÇÃO ANO MODELO",
      "2018 2018",
    ].join("\n");
    expect(parseVehicleVaultClassification(text)).toEqual({
      category: "PARTICULAR", exerciseYear: 2026,
    });
  });

  it("aceita ALUGUEL e EXERCÍCIO com acentos e caixa diferente", () => {
    expect(parseVehicleVaultClassification("Categoria: aluguel\nExercício: 2025"))
      .toEqual({ category: "ALUGUEL", exerciseYear: 2025 });
  });

  it("não inventa categoria nem usa ano do modelo no lugar do exercício", () => {
    expect(parseVehicleVaultClassification("Ano Fabricação: 2018\nAno Modelo: 2019"))
      .toEqual({ category: "", exerciseYear: null });
  });
});
