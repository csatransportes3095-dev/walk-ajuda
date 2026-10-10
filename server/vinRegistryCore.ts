import { isVINValido } from "../client/src/lib/vinGenerator";

export type VinReservationResult = {
  reserved: string[];
  duplicates: string[];
};

/**
 * Garante que o servidor só registre VINs completos e distintos.
 * A validação usa o mesmo verificador do gerador existente, sem modificá-lo.
 */
export function assertValidVinReservationBatch(vins: readonly string[]): void {
  if (vins.length < 1 || vins.length > 10) {
    throw new Error("A quantidade deve estar entre 1 e 10 chassis.");
  }
  if (new Set(vins).size !== vins.length) {
    throw new Error("O lote contém chassis repetidos.");
  }
  if (vins.some(vin => !isVINValido(vin) || vin !== vin.trim().toUpperCase())) {
    throw new Error("O lote contém um chassi VIN inválido.");
  }
}

/**
 * O escritor deve ser atômico e devolver true somente para uma INSERÇÃO nova.
 * A chave única no MySQL, não o histórico do navegador, resolve concorrência.
 */
export async function reserveVinBatch(
  vins: readonly string[],
  reserveOne: (vin: string) => Promise<boolean>,
): Promise<VinReservationResult> {
  assertValidVinReservationBatch(vins);
  const reserved: string[] = [];
  const duplicates: string[] = [];

  for (const vin of vins) {
    if (await reserveOne(vin)) reserved.push(vin);
    else duplicates.push(vin);
  }

  return { reserved, duplicates };
}
