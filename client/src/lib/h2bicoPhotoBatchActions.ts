/**
 * Somente fotos novas importadas neste lote. Nao selecionar fotos reparadas,
 * duplicadas ou registros preexistentes para marcacoes automaticas.
 */
export type H2BicoNewPhoto = { id: number; cpf: string };
export type H2BicoPhotoEarOption = "none" | "com_ear" | "sem_ear";
export type H2BicoPhotoReviewOption = "pending" | "confirmed";

export function uniqueH2BicoNewPhotos(input: H2BicoNewPhoto[]): H2BicoNewPhoto[] {
  const unique = new Map<string, H2BicoNewPhoto>();
  for (const row of input) {
    const id = Number(row.id);
    const cpf = String(row.cpf ?? "").replace(/\D/g, "");
    if (!Number.isSafeInteger(id) || id <= 0 || !/^\d{11}$/.test(cpf)) continue;
    if (!unique.has(cpf)) unique.set(cpf, { id, cpf });
  }
  return Array.from(unique.values());
}

export function chunkH2BicoNewPhotos<T>(items: T[], chunkSize: 250 | 300): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  return chunks;
}
