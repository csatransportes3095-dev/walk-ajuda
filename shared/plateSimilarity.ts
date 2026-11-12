/**
 * Variantes visuais de uma placa BR: cada variante troca UMA unica letra
 * da placa ORIGINAL. Numeros e demais posicoes jamais sao alterados.
 * Esta rotina nao confirma existencia no registro nacional.
 */
export const SIMILAR_LETTERS: Readonly<Record<string, readonly string[]>> = {
  A: ["R"], B: ["D", "R"], C: ["G", "O"], D: ["B", "O"],
  E: ["F", "B"], F: ["E", "P"], G: ["C", "Q"], H: ["N"],
  I: ["L", "T"], J: ["I"], K: ["X"], L: ["I", "T"],
  M: ["N", "W"], N: ["M", "H"], O: ["Q", "C"],
  P: ["R", "F"], Q: ["O", "G"], R: ["B", "P"],
  S: ["Z"], T: ["I", "L"], U: ["V"], V: ["U", "W"],
  W: ["V", "M"], X: ["K"], Y: ["V"], Z: ["S"],
};

export type PlateVariant = {
  plate: string;
  position: number;
  original: string;
  replacement: string;
};

export function normalizeBrazilPlate(input: string): string {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validBrazilPlate(input: string): boolean {
  const p = normalizeBrazilPlate(input);
  return /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p);
}

export function getSimilarPlateVariants(input: string): PlateVariant[] {
  const base = normalizeBrazilPlate(input);
  if (!validBrazilPlate(base)) return [];
  const letterPositions = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(base) ? [0, 1, 2, 4] : [0, 1, 2];
  const variants: PlateVariant[] = [];
  const seen = new Set<string>();
  for (const position of letterPositions) {
    const original = base[position];
    for (const replacement of SIMILAR_LETTERS[original] || []) {
      if (replacement === original) continue;
      const plate = base.slice(0, position) + replacement + base.slice(position + 1);
      if (seen.has(plate)) continue;
      seen.add(plate);
      variants.push({ plate, position: position + 1, original, replacement });
    }
  }
  return variants;
}
