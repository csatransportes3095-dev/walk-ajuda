/**
 * Extracao local de CPFs validos: arquivos nunca saem do navegador.
 * Word moderno (.docx) e ZIP/XML; usamos APIs nativas, sem dependencias.
 */
export const H2BICO_CPF_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const H2BICO_CPF_MAX_FILES = 30;

const TEXT_EXTENSIONS = new Set(["txt", "csv", "log", "md", "rtf", "html", "htm", "xml"]);

// Valida os dois digitos verificadores oficiais e rejeita sequencias repetidas.
// A validacao matematica nao consulta a Receita Federal nem confirma titularidade.
export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let position = 9; position <= 10; position++) {
    let sum = 0;
    for (let index = 0; index < position; index++) {
      sum += Number(cpf[index]) * (position + 1 - index);
    }
    const digit = (sum * 10) % 11;
    if (Number(cpf[position]) !== (digit === 10 ? 0 : digit)) return false;
  }
  return true;
}

// Mantem todos os candidatos distintos para explicar os numeros rejeitados.
export function extractCpfCandidatesFromText(text: string): string[] {
  const result = new Set<string>();
  const matches = text.matchAll(/(?<!\d)\d{3}(?:[.\-\s]?\d{3}){2}[.\-\s]?\d{2}(?!\d)/g);
  for (const match of matches) {
    const cpf = match[0].replace(/\D/g, "");
    if (cpf.length === 11) result.add(cpf);
  }
  return [...result];
}

export function extractCpfsFromText(text: string): string[] {
  return extractCpfCandidatesFromText(text).filter(isValidCpf);
}

export type H2BicoCpfPerson = {
  cpf: string;
  name: string;
  profession: string;
};

function cleanExtractedField(value: string): string {
  return value
    .replace(/^[|;,:\-\s]+|[|;,:\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Extrai linhas estruturadas como CPF | NOME | PROFISSAO, sem alterar o
// extrator simples de CPF. Tambem aceita tabulacao, ponto-e-virgula e
// colunas separadas por dois ou mais espacos.
export function extractCpfPeopleFromText(text: string): H2BicoCpfPerson[] {
  const byCpf = new Map<string, H2BicoCpfPerson>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const candidates = extractCpfCandidatesFromText(line).filter(isValidCpf);
    if (!candidates.length) continue;

    for (const cpf of candidates) {
      const cpfPattern = new RegExp(
        "(?<!\\d)" +
        cpf.slice(0, 3) + "[.\\-\\s]?" +
        cpf.slice(3, 6) + "[.\\-\\s]?" +
        cpf.slice(6, 9) + "[.\\-\\s]?" +
        cpf.slice(9) + "(?!\\d)"
      );
      const withoutCpf = line.replace(cpfPattern, " | ");
      let fields = withoutCpf.split(/\s*(?:\||;|\t)\s*/).map(cleanExtractedField).filter(Boolean);
      if (fields.length < 2) {
        fields = withoutCpf.split(/\s{2,}/).map(cleanExtractedField).filter(Boolean);
      }

      const name = fields[0] || "";
      const profession = fields.slice(1).join(" ") || "";
      const current = byCpf.get(cpf);
      if (!current || (name.length + profession.length) > (current.name.length + current.profession.length)) {
        byCpf.set(cpf, { cpf, name, profession });
      }
    }
  }
  return [...byCpf.values()];
}

export function decodeCpfText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const copy = bytes.slice(2);
    for (let i = 0; i + 1 < copy.length; i += 2) {
      const temp = copy[i];
      copy[i] = copy[i + 1];
      copy[i + 1] = temp;
    }
    return new TextDecoder("utf-16le").decode(copy);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (full, entity: string) => {
    const name = entity.toLowerCase();
    if (name === "amp") return "&";
    if (name === "lt") return "<";
    if (name === "gt") return ">";
    if (name === "quot") return '"';
    if (name === "apos") return "'";
    const number = name.startsWith("#x") ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return Number.isFinite(number) && number >= 0 && number <= 0x10ffff
      ? String.fromCodePoint(number) : full;
  });
}

export function extractWordXmlText(xml: string): string {
  // Preserva quebra de paragrafo e celula, mantendo sequencias entre
  // runs de Word contiguas. Descarta somente tags; nunca executa HTML.
  return decodeXmlEntities(xml
    .replace(/<w:(tab|br|cr)\b[^>]*\/>/gi, " ")
    .replace(/<\/w:(?:p|tr|tc)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22) throw new Error("Arquivo Word inválido.");
  const eocdMinimum = Math.max(0, bytes.length - 22 - 65535);
  let eocd = -1;
  for (let pos = bytes.length - 22; pos >= eocdMinimum; pos--) {
    if (view.getUint32(pos, true) === 0x06054b50) {
      eocd = pos;
      break;
    }
  }
  if (eocd < 0) throw new Error("Word não é um arquivo .docx válido.");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries > 2000) throw new Error("Documento Word contém entradas demais.");
  const texts: string[] = [];
  let extractedBytes = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Estrutura do arquivo Word inválida.");
    }
    const method = view.getUint16(offset + 10, true);
    const zippedSize = view.getUint32(offset + 20, true);
    const unzippedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (offset + 46 + filenameLength + extraLength + commentLength > bytes.length) {
      throw new Error("Word contém uma entrada inválida.");
    }
    const filename = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + filenameLength));
    offset += 46 + filenameLength + extraLength + commentLength;
    if (!/^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(filename)) continue;
    if (unzippedSize > 12 * 1024 * 1024 || extractedBytes + unzippedSize > 16 * 1024 * 1024) {
      throw new Error("Texto do documento Word excede o limite.");
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error("Word contém uma entrada de texto inválida.");
    }
    const localNameSize = view.getUint16(localOffset + 26, true);
    const localExtraSize = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameSize + localExtraSize;
    if (start + zippedSize > bytes.length) throw new Error("Arquivo Word incompleto.");
    const zipped = bytes.slice(start, start + zippedSize);
    let xmlBytes: Uint8Array;
    if (method === 0) {
      xmlBytes = zipped;
    } else if (method === 8) {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("Seu navegador não suporta a leitura de Word .docx.");
      }
      const stream = new Blob([Uint8Array.from(zipped)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error("Arquivo Word compactado em formato não suportado.");
    }
    extractedBytes += xmlBytes.byteLength;
    if (extractedBytes > 16 * 1024 * 1024) throw new Error("Documento Word muito grande.");
    texts.push(extractWordXmlText(new TextDecoder("utf-8").decode(xmlBytes)));
  }
  if (!texts.length) throw new Error("Nenhum texto foi encontrado neste arquivo Word.");
  return texts.join("\n");
}

export async function readCpfSourceFile(file: File): Promise<string> {
  if (!file.size || file.size > H2BICO_CPF_MAX_FILE_BYTES) {
    throw new Error("O arquivo deve ter entre 1 byte e 8 MB.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext === "doc") throw new Error("Word .doc antigo: salve como .docx antes de importar.");
  if (ext !== "docx" && !TEXT_EXTENSIONS.has(ext)) {
    throw new Error("Formato não aceito. Use TXT, CSV, LOG, MD, RTF, HTML, XML ou Word DOCX.");
  }
  const buffer = await file.arrayBuffer();
  if (ext === "docx") return extractDocxText(buffer);
  const source = decodeCpfText(new Uint8Array(buffer));
  if (ext === "html" || ext === "htm" || ext === "xml") return extractWordXmlText(source);
  if (ext === "rtf") {
    return source
      .replace(/\\'[0-9a-f]{2}/gi, " ")
      .replace(/\\[a-z]+-?\d* ?/gi, " ")
      .replace(/[{}]/g, " ");
  }
  return source;
}
