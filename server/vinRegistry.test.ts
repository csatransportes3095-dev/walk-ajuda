import { describe, expect, it } from "vitest";
import { gerarVINUnico, isVINValido } from "../client/src/lib/vinGenerator";
import { assertValidVinReservationBatch, reserveVinBatch } from "./vinRegistryCore";

const vinA = gerarVINUnico("9BR", "B29BT", "J", "2");
const vinB = gerarVINUnico("9BR", "B29BT", "J", "2");

describe("Registro permanente de VIN sem alterar o gerador", () => {
  it("mantém o padrão válido de 17 caracteres do motor existente", () => {
    expect(isVINValido(vinA)).toBe(true);
    expect(isVINValido(vinB)).toBe(true);
    expect(vinA).not.toBe(vinB);
    expect(() => assertValidVinReservationBatch([vinA, vinB])).not.toThrow();
  });

  it("rejeita VIN inválido, repetido dentro do lote ou mais de dez", () => {
    const invalidCheck = vinA.slice(0, 8) + (vinA[8] === "0" ? "1" : "0") + vinA.slice(9);
    expect(() => assertValidVinReservationBatch([invalidCheck])).toThrow();
    expect(() => assertValidVinReservationBatch([vinA, vinA])).toThrow();
    expect(() => assertValidVinReservationBatch(Array.from({ length: 11 }, () => vinA))).toThrow();
  });

  it("aceita VIN novo e identifica repetição em outra chamada/sessão", async () => {
    const registered = new Set<string>();
    const save = async (vin: string) => {
      if (registered.has(vin)) return false;
      registered.add(vin);
      return true;
    };

    expect(await reserveVinBatch([vinA, vinB], save)).toEqual({
      reserved: [vinA, vinB], duplicates: [],
    });
    expect(await reserveVinBatch([vinA], save)).toEqual({
      reserved: [], duplicates: [vinA],
    });
  });

  it("simula duas solicitações simultâneas competindo pelo mesmo VIN", async () => {
    const registered = new Set<string>();
    const save = async (vin: string) => {
      // Simula o efeito atômico da chave única do banco.
      const isNew = !registered.has(vin);
      if (isNew) registered.add(vin);
      await Promise.resolve();
      return isNew;
    };
    const [a, b] = await Promise.all([
      reserveVinBatch([vinA], save),
      reserveVinBatch([vinA], save),
    ]);
    expect(a.reserved.length + b.reserved.length).toBe(1);
    expect(a.duplicates.length + b.duplicates.length).toBe(1);
  });

  it("propaga falha de escrita em vez de liberar VIN sem registro", async () => {
    await expect(reserveVinBatch([vinA], async () => {
      throw new Error("Banco indisponível");
    })).rejects.toThrow("Banco indisponível");
  });
});
