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
const absentName = /^(?:N\s*[/.]?\s*[IAD]|NAO\s+(?:INFORMAD[OA]|DISPONIVEL|IDENTIFICAD[OA]|LOCALIZAD[OA]|CONSTA|SE APLICA)|SEM\s+(?:INFORMACAO|DADOS)|DESCONHECID[OA]|NULL)$/;

function nameValue(raw: string): string {
  // A neighbouring identity field is not part of the name. Never keep an ID
  // as a guessed owner, even when an OCR engine has merged the two fields.
  const value = normalizeVehicleVaultOwnerName(raw
    .replace(/\s+(?:CPF\s*\/\s*CNPJ|CPF|CNPJ)\b.*$/iu, "")
    .replace(/\s+(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*$/u, ""));
  if (value.length < 2 || value.length > 200 || !/\p{L}.*\p{L}/u.test(value) ||
      !/^[\p{L}\p{M}\p{N} &.'’()\/-]+$/u.test(value) ||
      fieldHeading.test(fold(value)) || otherParty.test(fold(value)) || absentName.test(fold(value)) ||
      /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(value) || /^[A-HJ-NPR-Z0-9]{17}$/.test(value)) return "";
  return value;
}

const unmark = (value: string) => value.trim()
  .replace(/^(?:\*\*|__)(.*)(?:\*\*|__)$/u, "$1").trim();

/** RENAVAM reports may render the owner's labelled fields as a Markdown
 * table. Only an explicit owner section grants meaning to a generic Nome. */
function reportOwnerNames(source: string): string[] {
  const names: string[] = [];
  const nameHeading = /^(?:NOME(?:\s*\/\s*RAZAO SOCIAL)?|RAZAO SOCIAL)$/;
  let inOwnerSection = false;
  let awaitingName = false;
  const reportLines = source.split("\n");
  for (const [index, raw] of reportLines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const section = fold(unmark(line
      .replace(/^#{1,6}\s+/u, "").replace(/\s+#{1,6}$/u, "")
      .replace(/^[-=]{2,}\s*|\s*[-=]{2,}$/gu, "").replace(/:\s*$/u, "")));
    if (/^(?:DADOS\s+D[OA]\s+)?PROPRIETARI[OA](?:\s+ATUAL)?$/.test(section)) {
      inOwnerSection = true;
      awaitingName = false;
      continue;
    }
    if (!inOwnerSection) continue;
    // Any subsequent heading closes the block, including other people and
    // unrelated sections. Plain copied headings are closed by the fallback.
    const markedHeading = /^#{1,6}\s|^[-=]{2,}\s*\S/u.test(line);
    const boldHeading = /^(?:\*\*[^*]+\*\*|__[^_]+__)\s*:?$/u.test(line);
    if (markedHeading || (boldHeading && !nameHeading.test(section)) ||
        /^(?:OUTROS|IMPORTACAO|INFORMACOES (?:ADICIONAIS|COMPLEMENTARES))$/.test(section)) {
      inOwnerSection = false;
      awaitingName = false;
      continue;
    }
    if (/^\|?\s*:?-{3,}:?\s*\|(?:\s*:?-{3,}:?\s*\|?)+$/u.test(line)) continue;
    const tableCells = line.includes("|")
      ? line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(unmark)
      : line.split(/\t+| {3,}/u).map(unmark);
    const pair = tableCells.length === 2 ? tableCells
      : tableCells.length === 1 ? line.match(/^(.+?)\s*[:=]\s*(.*)$/u)?.slice(1) : undefined;
    if (pair) {
      const label = fold(unmark(pair[0]).replace(/:\s*$/u, ""));
      awaitingName = false;
      if (nameHeading.test(label)) {
        const value = nameValue(unmark(pair[1]));
        if (value) names.push(value);
        awaitingName = !pair[1].trim();
      } else if (!/^(?:CPF(?:\s*\/\s*CNPJ)?|CNPJ|TIPO\s+(?:DE\s+)?DOCUMENTO|DOCUMENTO)$/.test(label)) {
        inOwnerSection = false;
      }
      continue;
    }
    if (nameHeading.test(section)) {
      awaitingName = true;
      continue;
    }
    if (awaitingName) {
      // A browser may copy each table cell onto its own line. Require the
      // following identity label so a wrapped CRLV name is not cut short.
      const following = reportLines.slice(index + 1, index + 5).find(value => value.trim());
      if (following && identityHeading.test(fold(unmark(following.replace(/:\s*$/u, ""))))) {
        const value = nameValue(unmark(line));
        if (value) names.push(value);
      }
    }
    inOwnerSection = false;
    awaitingName = false;
  }
  return names;
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
  for (const candidate of reportOwnerNames(original)) candidates.set(fold(candidate), candidate);

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


/** CPF/CNPJ do proprietário atual, nunca do cliente vinculado ou de terceiros. */
export function normalizeVehicleVaultOwnerCpfCnpj(input: unknown): string {
  const id = String(input ?? "").replace(/\D/g, "");
  if (![11, 14].includes(id.length) || /^(\d)\1+$/.test(id)) return "";
  const digit = (weights: number[], data: string) => {
    const sum = weights.reduce((acc, weight, index) => acc + Number(data[index]) * weight, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  if (id.length === 11) {
    const weights1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [11, ...weights1];
    return digit(weights1, id) === Number(id[9]) && digit(weights2, id) === Number(id[10]) ? id : "";
  }
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, ...weights1];
  const cnpjDigit = (weights: number[]) => {
    const sum = weights.reduce((acc, weight, index) => acc + Number(id[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return cnpjDigit(weights1) === Number(id[12]) && cnpjDigit(weights2) === Number(id[13]) ? id : "";
}

/**
 * A identificação só é extraída quando há um único proprietário reconhecido,
 * o rótulo CPF/CNPJ está próximo ao nome dele e não atravessa uma seção de
 * locatário/segurado/outro titular. Sem identificação segura, retorna vazio.
 */
export function parseVehicleVaultOwnerCpfCnpj(raw: string): string {
  const original = String(raw ?? "").slice(0, 120_000).normalize("NFC")
    .replace(/\r/g, "").replace(/\t/g, "        ");
  const owner = fold(parseVehicleVaultOwnerName(original));
  if (!owner) return "";
  const lines = original.split("\n");
  const ownerAnchor = owner.split(/\s+/u).slice(0, 2).join(" ");
  const nameRows = lines.flatMap((line, index) =>
    fold(line).includes(ownerAnchor) ? [index] : []);
  if (!nameRows.length) return "";
  const heading = /\b(?:CPF\s*\/\s*CNPJ|CPF|CNPJ)\b/gu;
  const identity = /(?<!\d)(?:\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?!\d)/gu;
  const matches = new Set<string>();
  for (let row = 0; row < lines.length; row++) {
    const line = fold(lines[row]);
    if (otherParty.test(line)) continue;
    for (const label of line.matchAll(heading)) {
      const closest = nameRows.filter(index => Math.abs(index - row) <= 5)
        .sort((a, b) => Math.abs(a - row) - Math.abs(b - row))[0];
      if (closest === undefined) continue;
      const between = lines.slice(Math.min(row, closest) + 1, Math.max(row, closest));
      if (between.some(value => otherParty.test(fold(value)))) continue;
      const afterLabel = lines[row].slice((label.index ?? 0) + label[0].length);
      const spans = [afterLabel];
      // CRLV layout: CPF/CNPJ is printed as a heading and the number below it,
      // sometimes in the second column (>100 characters to the right).
      for (let next = row + 1; next <= Math.min(row + 2, lines.length - 1); next++) {
        const following = lines[next];
        if (otherParty.test(fold(following))) break;
        const start = Math.max(0, (label.index ?? 0) - 5);
        spans.push(following.slice(start, start + 60));
      }
      for (const span of spans) {
        for (const candidate of span.matchAll(identity)) {
          const value = normalizeVehicleVaultOwnerCpfCnpj(candidate[0]);
          if (value) matches.add(value);
        }
      }
    }
  }
  return matches.size === 1 ? matches.values().next().value! : "";
}
