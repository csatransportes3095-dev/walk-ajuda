/** Plate lookup for the Cofre da Frota. No registration or status changes. */
export const MAX_PLATES_PER_LOOKUP = 2000;
const VALID_PLATE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export function normalizeVaultPlate(raw: string): string {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseVaultPlateList(raw: string) {
  const plates: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const add = (rawPlate: string) => {
    const plate = normalizeVaultPlate(rawPlate);
    if (!VALID_PLATE.test(plate)) return false;
    if (seen.has(plate)) duplicates.push(plate);
    else { seen.add(plate); plates.push(plate); }
    return true;
  };
  for (const chunk of raw.split(/[\n;,]+/)) {
    const line = chunk.trim().toUpperCase();
    if (!line) continue;
    if (add(line)) continue;
    // Multiple plates per line and plates formatted as "ABC-1D23" / "ABC 1D23".
    const matches = [...line.matchAll(/(?:^|[^A-Z0-9])([A-Z]{3}[\s-]*[0-9][A-Z0-9][0-9]{2})(?=$|[^A-Z0-9])/g)];
    if (!matches.length) { invalid.push(chunk.trim()); continue; }
    matches.forEach(match => add(match[1]));
  }
  return {plates,duplicates,invalid};
}
