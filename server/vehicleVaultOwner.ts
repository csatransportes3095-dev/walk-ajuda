/** Keep the spelling of a manually supplied or labelled name, including accents. */
export function normalizeVehicleVaultOwnerName(value: unknown): string {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim().toUpperCase();
}

const fold = (value: string) => normalizeVehicleVaultOwnerName(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type Cell = { text: string; start: number };
const cellsOf = (line: string): Cell[] => Array.from(
  line.matchAll(/\S(?:.*?\S)?(?= {3,}|$)/g),
  match => ({ text: match[0], start: match.index! }),
);
const otherParty = /\b(?:LOCATARI[OA]|ARRENDATARI[OA]|COMPRADOR|VENDEDOR|CONDUTOR|SEGURADO|REPRESENTANTE)\b|\bPROPRIETARI[OA]\s*[-:(]*\s*(?:ANTERIOR|ANTIGO)\b|\b(?:ANTERIOR|ANTIGO)\s+PROPRIETARI[OA]\b/;
const identityHeading = /^(?:CPF\s*\/\s*CNPJ|CPF|CNPJ)\b/;
const fieldHeading = /^(?:NOME\b|PROPRIETARI[OA]\b|CPF\b|CNPJ\b|PLACA\b|RENAVAM\b|CHASSI\b|VIN\b|MARCA\b|MODELO\b|COR\b|ANO\b|CATEGORIA\b|EXERCICIO\b|ESPECIE\b|TIPO\b|CARROCERIA\b|LOCAL\b|DATA\b|ASSINADO\b|OBSERVAC(?:AO|OES)\b|CODIGO\b|NUMERO\b|CAPACIDADE\b|MOTOR\b|COMBUSTIVEL\b|POTENCIA\b|PESO\b|EIXOS\b|LOTA(?:CAO|COES)\b|RESTRIC(?:AO|OES)\b|CERTIFICADO\b|DADOS\b|SEGURO\b|DETRAN\b)/;

function nameValue(raw: string): string {
  // A neighbouring identity field is not part of the name. Never keep an ID
  // as a guessed owner, even when an OCR engine has merged the two fields.
  const value = normalizeVehicleVaultOwnerName(raw
    .replace(/\s+(?:CPF\s*\/\s*CNPJ|CPF|CNPJ)\b.*$/iu, "")
    .replace(/\s+(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*$/u, ""));
  if (value.length < 2 || value.length > 200 || !/\p{L}.*\p{L}/u.test(value) ||
      !/^[\p{L}\p{M}\p{N} &.'’()\/-]+$/u.test(value) ||
      fieldHeading.test(fold(value)) || otherParty.test(fold(value)) ||
      /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(value) || /^[A-HJ-NPR-Z0-9]{17}$/.test(value)) return "";
  return value;
}

/**
 * Only labelled owners are extracted. CRLV's generic NOME is accepted with
 * its CPF/CNPJ block, preserving the full original right-hand column. A
 * conflicting labelled identity stays empty for the administrator to review.
 */
export function parseVehicleVaultOwnerName(raw: string): string {
  const original = String(raw ?? "").slice(0, 120_000).normalize("NFC")
    .replace(/\r/g, "").replace(/\t/g, "        ");
  const lines = original.split("\n").map(cellsOf);
  const crlv = /CERTIFICADO DE REGISTRO E LICENCIAMENTO|\bCRLV(?:[ -]?E)?\b/.test(fold(original));
  const candidates = new Map<string, string>();

  for (let row = 0; row < lines.length; row++) {
    for (let column = 0; column < lines[row].length; column++) {
      const heading = lines[row][column];
      const label = fold(heading.text);
      if (otherParty.test(label)) continue;
      const explicit = heading.text.match(/^(?:(?:NOME\s+(?:DO|DA)\s+)?PROPRIET[ÁA]RI[OA])(?:\s+ATUAL)?\b\s*[:=–—-]?\s*(.*)$/iu);
      const generic = !explicit && heading.text.match(/^NOME(?:\s*[:=–—-]\s*(.*)|\s*)$/iu);
      const match = explicit || generic;
      if (!match || (!explicit && !crlv)) continue;
      const nextColumn = lines[row][column + 1]?.start ?? Infinity;
      const inColumn = (line: Cell[]) => line.find(cell =>
        Math.abs(cell.start - heading.start) <= 10 && cell.start < nextColumn);

      if (generic) {
        // Generic NOME may also occur in tenant/insurance sections. A CRLV
        // heading elsewhere on the page does not turn those into an owner.
        let nonOwnerSection = false;
        for (let i = row - 1; i >= Math.max(0, row - 4); i--) {
          const previous = inColumn(lines[i]);
          if (previous && otherParty.test(fold(previous.text))) { nonOwnerSection = true; break; }
          if (previous && /^(?:CARROCERIA|PROPRIETARI[OA])\b/.test(fold(previous.text))) break;
        }
        if (nonOwnerSection) continue;
        const adjacentIdentity = identityHeading.test(fold(lines[row][column + 1]?.text ?? ""));
        const inlineIdentity = /\s+(?:CPF\s*\/\s*CNPJ|CPF|CNPJ)\s*[:=]/.test(fold(generic[1] ?? ""));
        let identityInBlock = adjacentIdentity || inlineIdentity;
        for (let i = row + 1; !identityInBlock && i <= Math.min(lines.length - 1, row + 6); i++) {
          const cell = inColumn(lines[i]);
          if (!cell) continue;
          const value = fold(cell.text);
          if (identityHeading.test(value)) { identityInBlock = true; break; }
          if (fieldHeading.test(value) || otherParty.test(value)) break;
        }
        if (!identityInBlock) continue;
      }

      let candidate = "";
      const inline = String(match[1] ?? "").trim();
      if (inline) {
        candidate = nameValue(inline);
      } else {
        const parts: string[] = [];
        for (let i = row + 1; i <= Math.min(lines.length - 1, row + 4); i++) {
          const cell = inColumn(lines[i]);
          if (!cell) { if (parts.length) break; else continue; }
          const part = nameValue(cell.text);
          if (!part) break;
          parts.push(part);
        }
        candidate = nameValue(parts.join(" "));
      }
      if (candidate) {
        const key = fold(candidate);
        if (!candidates.has(key)) candidates.set(key, candidate);
      }
    }
  }
  return candidates.size === 1 ? candidates.values().next().value! : "";
}
