import { describe, expect, it } from "vitest";
import { getSimilarPlateVariants, normalizeBrazilPlate, validBrazilPlate } from "../shared/plateSimilarity";

describe("Gerador de placas semelhantes - Cofre da Frota", () => {
  it("aceita os formatos brasileiros e rejeita posicoes erradas", () => {
    expect(validBrazilPlate("FWG8B54")).toBe(true);
    expect(validBrazilPlate("ABC1234")).toBe(true);
    expect(validBrazilPlate("FWG8BB4")).toBe(false);
    expect(validBrazilPlate("AB18B54")).toBe(false);
    expect(normalizeBrazilPlate("fwg-8b54")).toBe("FWG8B54");
  });
  it("muda apenas uma letra da placa base a cada tentativa", () => {
    const base = "FWG8B54";
    const variants = getSimilarPlateVariants(base);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.some(x => x.plate === "EWG8B54")).toBe(true);
    expect(variants.some(x => x.plate === "FWC8B54")).toBe(true);
    for (const variant of variants) {
      expect(variant.plate).toHaveLength(7);
      expect(validBrazilPlate(variant.plate)).toBe(true);
      const differences = [...base].filter((letter, index) => letter !== variant.plate[index]);
      expect(differences).toHaveLength(1);
      expect(variant.plate[3]).toBe(base[3]);
      expect(variant.plate[5]).toBe(base[5]);
      expect(variant.plate[6]).toBe(base[6]);
    }
    expect(new Set(variants.map(x => x.plate)).size).toBe(variants.length);
  });
  it("na placa antiga apenas tres primeiras letras podem mudar", () => {
    const variants = getSimilarPlateVariants("ABC1234");
    expect(variants.every(x => x.position <= 3)).toBe(true);
    expect(variants.every(x => x.plate.slice(3) === "1234")).toBe(true);
  });
  it("nao transforma nenhum resultado de consulta em validade oficial", () => {
    const source = getSimilarPlateVariants("FWG8B54");
    expect(source[0]).toHaveProperty("original");
    expect(source[0]).not.toHaveProperty("exists");
    expect(source[0]).not.toHaveProperty("validity");
  });
});
