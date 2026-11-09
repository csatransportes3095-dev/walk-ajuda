/** Reconhece somente a categoria e o exercício explicitamente informados no documento. */
export function parseVehicleVaultClassification(raw: string) {
  const lines = String(raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\r/g, "").toUpperCase().split("\n")
    .map(line => line.trim().replace(/[ \t]+/g, " ")).filter(Boolean);
  let category = "";
  let exerciseYear: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!category && /\bCATEGORIA\b/.test(line)) {
      const inline = line.match(/\bCATEGORIA(?:\s+DO\s+VEICULO)?\s*[:=-]?\s*(PARTICULAR|ALUGUEL)\b/);
      if (inline) category = inline[1];
      else {
        for (const next of lines.slice(i + 1, i + 3)) {
          const value = next.match(/\b(PARTICULAR|ALUGUEL)\b/);
          if (value) { category = value[1]; break; }
        }
      }
    }
    if (exerciseYear !== null) continue;
    const label = line.match(/\b(?:EXERCICIO|ANO\s+IPVA\s*\/\s*LICENCA|ANO\s+(?:DO\s+)?LICENCIAMENTO)\b/);
    if (!label) continue;
    const trailing = line.slice((label.index ?? 0) + label[0].length);
    const inline = trailing.match(/^\s*[:=-]?\s*((?:19|20)\d{2})\b/);
    if (inline) { exerciseYear = Number(inline[1]); continue; }
    for (const next of lines.slice(i + 1, i + 3)) {
      // CRLV-e: "PLACA EXERCICIO" seguido por "RBK7D81 2026".
      const plateAndYear = next.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\s+((?:19|20)\d{2})\b/);
      const yearOnly = next.match(/^((?:19|20)\d{2})\b/);
      if (plateAndYear || yearOnly) {
        exerciseYear = Number((plateAndYear || yearOnly)![1]);
        break;
      }
    }
  }
  return { category, exerciseYear };
}
