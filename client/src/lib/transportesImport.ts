import { classifyTransport, normalizeTransportCnpj, normalizeTransportUf, TRANSPORT_UFS, type TransportType } from "@shared/transportes";

export type TransportImportDraft = {
  cnpj: string;
  name: string;
  uf: string;
  city: string;
  type: TransportType;
  cnae: string;
  source: string;
  notes: string;
  isUsed: boolean;
};

export type TransportImportReport = {
  records: TransportImportDraft[];
  examined: number;
  rejected: number;
  headerFound: boolean;
};

type Field = "name" | "cnpj" | "type" | "cnae" | "city" | "uf" | "isUsed" | "source" | "notes";
type Positions = Partial<Record<Field, number[]>>;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeImportHeading(value: unknown): string {
  return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function recognizeImportHeading(value: unknown): Field | null {
  const h = normalizeImportHeading(value);
  if (!h) return null;
  if (h === "cnpj" || h === "cnpjcpf" || h === "numerocnpj" || h === "cnpjempresa" || h === "documentocnpj") return "cnpj";
  if (/^(razaosocial|razaosocialnome|razaosocialnomefantasia|nomeempresarial|nomefantasia|empresa|empresatransportadora|empresaounome|empresacnpj|nome|transportadora|fantasia|nomeempresa|empresanome)$/.test(h)
      || h.startsWith("empresatransportadora") || h.startsWith("razaosocial")) return "name";
  if (h === "cidade" || h === "municipio" || h === "localidade" || h === "cidademunicipio") return "city";
  if (h === "uf" || h === "estado" || h === "siglaestado") return "uf";
  if (h === "cnae" || h.startsWith("cnaeprincipal") || h.startsWith("cnaeprimario") || h === "atividadeprincipal") return "cnae";
  if (h === "usado" || h === "usadobool" || h === "jausado" || h === "jausado" || h === "status" || h === "situacao" || h === "uso" || h === "marcaruso") return "isUsed";
  if (h === "fonte" || h.startsWith("fontearquivo") || h.startsWith("fonteorigem") || h === "origem" || h === "arquivo") return "source";
  if (h.startsWith("anotac") || h.startsWith("observac") || h.startsWith("conferencia") || h === "nota" || h === "notas") return "notes";
  if (h === "tipo" || h.startsWith("tipodeservico") || h.startsWith("tipotransporte") || h === "categoria" || h === "modalidade" || h === "atividade" || h === "cnaetipo") return "type";
  return null;
}

function extractPositions(row: unknown[]): Positions {
  const positions: Positions = {};
  row.forEach((value, index) => {
    const field = recognizeImportHeading(value);
    if (field) (positions[field] ||= []).push(index);
  });
  return positions;
}

function firstAt(row: unknown[], positions: Positions, field: Field): string {
  for (const index of positions[field] || []) {
    const value = cleanText(row[index]);
    if (value) return value;
  }
  return "";
}

function allAt(row: unknown[], positions: Positions, field: Field): string[] {
  return (positions[field] || []).map(index => cleanText(row[index])).filter(Boolean);
}

export function isUsedTransportCell(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  const v = normalizeImportHeading(value);
  return /^(sim|s|yes|true|1|usado|jausado|marcadocomojausado|jautilizado|utilizado|concluido)$/.test(v);
}

function cnpjOf(value: unknown): string {
  const s = normalizeTransportCnpj(value);
  return /^\d{14}$/.test(s) ? s : "";
}

function inferPositions(rows: unknown[][]): Positions | null {
  // Layouts simples sem cabeçalho: detectar a coluna com CNPJ real,
  // sem assumir que o documento fica na coluna B.
  const samples = rows.slice(0, 160);
  const counts = new Map<number, number>();
  for (const row of samples) {
    row.slice(0, 30).forEach((value, index) => {
      if (cnpjOf(value)) counts.set(index, (counts.get(index) || 0) + 1);
    });
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] < 2) return null;
  const cnpjColumn = sorted[0][0];
  const nameColumn = cnpjColumn === 0 ? 1 : cnpjColumn - 1;
  return { cnpj: [cnpjColumn], name: [nameColumn] };
}

function detectHeader(rows: unknown[][]): { index: number; positions: Positions } | null {
  for (let i = 0; i < Math.min(rows.length, 400); i++) {
    const positions = extractPositions(rows[i]);
    if (positions.cnpj?.length && (positions.name?.length || Object.keys(positions).length >= 3)) {
      return { index: i, positions };
    }
  }
  return null;
}

function ufFromSheet(source: string, fallback: string): string {
  // Usa a UF do nome da aba (ex.: "SP"), se não houver coluna UF.
  const tab = source.split(" / ").pop()?.trim().toUpperCase() || "";
  return TRANSPORT_UFS.includes(tab as (typeof TRANSPORT_UFS)[number]) ? tab : fallback;
}

function parseWithPositions(rows: unknown[][], positions: Positions, from: number, fallbackUf: string, source: string): TransportImportReport {
  const records: TransportImportDraft[] = [];
  let examined = 0, rejected = 0;
  const fallback = ufFromSheet(source, fallbackUf);
  for (let i = from; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(x => cleanText(x))) continue;
    if (recognizeImportHeading(firstAt(row, positions, "cnpj")) === "cnpj") continue;
    examined++;
    const cnpj = cnpjOf(firstAt(row, positions, "cnpj"));
    if (!cnpj) { rejected++; continue; }
    const name = firstAt(row, positions, "name") || "NOME NÃO INFORMADO";
    const sourceInFile = firstAt(row, positions, "source");
    const notes = allAt(row, positions, "notes");
    if (/\b(exemplo|fictici[oa]|demonstrac[aã]o|teste)\b/i.test(name)) {
      notes.unshift("ATENÇÃO: nome de exemplo/demonstração; existência não confirmada.");
    }
    const typeText = firstAt(row, positions, "type") || firstAt(row, positions, "cnae") || name;
    records.push({
      cnpj, name,
      uf: normalizeTransportUf(firstAt(row, positions, "uf"), fallback),
      city: firstAt(row, positions, "city"),
      type: classifyTransport(typeText),
      cnae: firstAt(row, positions, "cnae"),
      source: [source, sourceInFile].filter(Boolean).join(" | ").slice(0, 1500),
      notes: notes.join(" | ").slice(0, 5000),
      isUsed: allAt(row, positions, "isUsed").some(isUsedTransportCell),
    });
  }
  return { records, examined, rejected, headerFound: from > 0 };
}

export function parseTransportSheetRows(rows: unknown[][], fallbackUf: string, source: string): TransportImportReport {
  const clean = rows.filter(row => Array.isArray(row) && row.some(x => cleanText(x)));
  if (!clean.length) return { records: [], examined: 0, rejected: 0, headerFound: false };
  const match = detectHeader(clean);
  if (match) return parseWithPositions(clean, match.positions, match.index + 1, fallbackUf, source);
  const inferred = inferPositions(clean);
  if (inferred) return parseWithPositions(clean, inferred, 0, fallbackUf, source);
  return { records: [], examined: clean.length, rejected: clean.length, headerFound: false };
}

function csvLines(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(x => x.trim());
  const sample = lines.find(x => /[;,\t]/.test(x)) || lines[0] || "";
  const delimiter = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : ",";
  const result: string[][] = [];
  for (const line of lines) {
    let current = "", quoted = false;
    const row: string[] = [];
    for (let i = 0; i < line.length; i++) {
      const character = line[i];
      if (character === '"' && quoted && line[i + 1] === '"') { current += '"'; i++; }
      else if (character === '"') quoted = !quoted;
      else if (character === delimiter && !quoted) { row.push(current); current = ""; }
      else current += character;
    }
    row.push(current);
    if (row.length === 1) {
      const cnpj = line.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
      if (cnpj) { result.push([line.replace(cnpj[0], "").trim(), cnpj[0]]); continue; }
    }
    result.push(row);
  }
  return result;
}

export function parseTransportText(text: string, fallbackUf: string, source = "Texto colado"): TransportImportReport {
  return parseTransportSheetRows(csvLines(text), fallbackUf, source);
}
