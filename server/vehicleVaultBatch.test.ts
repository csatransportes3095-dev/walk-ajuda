import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_PDFS_PER_BATCH, checkBatchPdf, fieldsFromPdf,
  validateBatchFields, duplicatedBatchPlates, normalizedBatchPlate,
  type VaultFields,
} from "../client/src/components/vehicleVaultBatchUtils";

const valid: VaultFields = {
  plate: "ABC1D23", renavam: "01234567890", chassis: "9BWZZZ377VT004251",
  model: "VW/GOL 1.0", color: "PRATA", manufactureYear: "2020", modelYear: "2021",
};

describe("Extrator PDF em lote - Cofre da Frota", () => {
  it("limita cada selecao a 20 PDFs e tamanho de 10 MB", () => {
    expect(MAX_PDFS_PER_BATCH).toBe(20);
    expect(checkBatchPdf({ name: "CRLV.pdf", size: 1024 })).toBeNull();
    expect(checkBatchPdf({ name: "CRLV.PDF", size: 10 * 1024 * 1024 })).toBeNull();
    expect(checkBatchPdf({ name: "imagem.jpg", size: 123 })).toMatch(/PDF/);
    expect(checkBatchPdf({ name: "vazio.pdf", size: 0 })).toMatch(/vazio/);
    expect(checkBatchPdf({ name: "grande.pdf", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
  });

  it("mapeia campos extraidos de forma independente por documento", () => {
    const fields = fieldsFromPdf({
      plate: "ABC1D23", renavam: "01234567890", chassis: valid.chassis,
      model: valid.model, color: valid.color, manufactureYear: 2020, modelYear: 2021,
    });
    expect(fields).toEqual(valid);
    expect(validateBatchFields(fields)).toEqual([]);
    expect(validateBatchFields({ ...fields, color: "" })[0]).toContain("COR");
    expect(validateBatchFields({ ...fields, modelYear: "20" })[0]).toContain("Ano do modelo");
    expect(normalizedBatchPlate("abc-1d23")).toBe("ABC1D23");
  });

  it("bloqueia placas repetidas no proprio lote inclusive salvas", () => {
    const duplicates = duplicatedBatchPlates([
      { status: "saved", fields: valid },
      { status: "ready", fields: { ...valid, plate: "abc-1d23" } },
      { status: "ready", fields: { ...valid, plate: "XYZ9E87" } },
      { status: "error", fields: { ...valid, plate: "XYZ9E87" } },
    ]);
    expect(duplicates.has("ABC1D23")).toBe(true);
    expect(duplicates.has("XYZ9E87")).toBe(false);
  });

  it("mantem o fluxo individual e usa procedures privadas ja existentes", () => {
    const old = readFileSync(resolve(process.cwd(), "client/src/components/VehicleVaultPanel.tsx"), "utf8");
    const batch = readFileSync(resolve(process.cwd(), "client/src/components/VehicleVaultBatchPanel.tsx"), "utf8");
    const server = readFileSync(resolve(process.cwd(), "server/routers/vehicleVault.ts"), "utf8");
    expect(old).toContain("VehicleVaultBatchPanel");
    expect(old).toContain("extractPdf=async(file:File)");
    expect(old).toContain("CONFERIR E GUARDAR DOCUMENTO");
    expect(batch).toContain("multiple className");
    expect(batch).toContain("previewPdf.mutateAsync");
    expect(batch).toContain("save.mutateAsync");
    expect(batch).toContain("CONFERIR E GUARDAR LOTE");
    expect(server).toContain("previewPdf: adminProcedure");
    expect(server).toContain("save: adminProcedure");
  });
});
