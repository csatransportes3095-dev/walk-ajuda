/**
 * Leitor local de planilhas .xlsx (Office Open XML). Sem CDN, upload ou
 * dependências adicionais: descompacta apenas os XML necessários no navegador.
 * Arquivos antigos .xls devem ser salvos como .xlsx antes da importação.
 */
function u16(view: DataView, at: number) { return view.getUint16(at, true); }
function u32(view: DataView, at: number) { return view.getUint32(at, true); }
const decoder = new TextDecoder("utf-8");
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MAX_ENTRY_BYTES = 120 * 1024 * 1024;

type ZipEntry = { start: number; length: number; expanded: number; method: number; flags: number };

function zipEntries(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let end = -1;
  for (let at = buffer.byteLength - 22; at >= Math.max(0, buffer.byteLength - 65557); at--) {
    if (u32(view, at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) throw new Error("Arquivo XLSX sem diretório ZIP válido.");
  const count = u16(view, end + 10), offset = u32(view, end + 16);
  const result = new Map<string, ZipEntry>();
  let position = offset;
  for (let i = 0; i < count; i++) {
    if (position + 46 > bytes.length || u32(view, position) !== 0x02014b50) {
      throw new Error("Arquivo XLSX com diretório ZIP incompleto.");
    }
    const nameLength = u16(view, position + 28);
    const extraLength = u16(view, position + 30), commentLength = u16(view, position + 32);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    const flags = u16(view, position + 8), method = u16(view, position + 10);
    const length = u32(view, position + 20), expanded = u32(view, position + 24);
    const local = u32(view, position + 42);
    if (local + 30 > bytes.length || u32(view, local) !== 0x04034b50) throw new Error("Arquivo XLSX contém entrada ZIP incompleta.");
    const start = local + 30 + u16(view, local + 26) + u16(view, local + 28);
    if (start + length > bytes.length || expanded > MAX_ENTRY_BYTES) throw new Error("Arquivo XLSX muito grande ou corrompido.");
    if (name.startsWith("xl/")) result.set(name, { start, length, expanded, method, flags });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

async function unzipText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  if (entry.flags & 1) throw new Error("Arquivos Excel com senha não são aceitos.");
  const compressed = bytes.subarray(entry.start, entry.start + entry.length);
  if (entry.method === 0) return decoder.decode(compressed);
  if (entry.method !== 8) throw new Error("Compactação Excel incompatível.");
  if (typeof DecompressionStream === "undefined") throw new Error("Seu navegador precisa ser atualizado para abrir XLSX.");
  const payload = new Uint8Array(new ArrayBuffer(compressed.length));
  payload.set(compressed);
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decoder.decode(await new Response(stream).arrayBuffer());
}

function xml(input: string): Document {
  const document = new DOMParser().parseFromString(input, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("XML inválido dentro do arquivo Excel.");
  return document;
}

function byLocal(element: Element | Document, local: string): Element[] {
  return Array.from(element.getElementsByTagName("*")).filter(node => node.localName === local);
}

function textOfCell(cell: Element, shared: string[]): string {
  const kind = cell.getAttribute("t");
  if (kind === "inlineStr") {
    return byLocal(cell, "t").map(el => el.textContent || "").join("");
  }
  const value = byLocal(cell, "v")[0]?.textContent || "";
  return kind === "s" ? (shared[Number(value)] ?? "") : value;
}

function parseSheet(xmlString: string, shared: string[]): string[][] {
  const root = xml(xmlString);
  const rows: string[][] = [];
  for (const row of byLocal(root, "row")) {
    const output: string[] = [];
    let nextColumn = 0;
    for (const cell of byLocal(row, "c")) {
      const addr = cell.getAttribute("r") || "";
      const letters = addr.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
      let column = nextColumn;
      if (letters) {
        column = 0;
        for (const char of letters) column = column * 26 + char.charCodeAt(0) - 64;
        column--;
      }
      if (column >= 0 && column < 120) {
        output[column] = textOfCell(cell, shared);
        nextColumn = column + 1;
      }
    }
    if (output.some(v => String(v ?? "").trim())) rows.push(output);
    if (rows.length > 100000) throw new Error("Planilha ultrapassa 100 mil linhas por aba. Divida em arquivos menores.");
  }
  return rows;
}

function normalizeZipTarget(base: string, target: string): string {
  const full = target.startsWith("/") ? target.substring(1) : base + "/" + target;
  const parts: string[] = [];
  for (const part of full.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export async function readTransportExcel(file: File): Promise<Array<{ sheet: string; rows: string[][] }>> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Excel maior que 80 MB. Divida em arquivos menores.");
  if (file.name.toLowerCase().endsWith(".xls")) throw new Error("Formato .xls antigo: abra no Excel e salve como .xlsx.");
  const buffer = await file.arrayBuffer();
  const entries = zipEntries(buffer), bytes = new Uint8Array(buffer);
  const getText = async (path: string) => {
    const entry = entries.get(path);
    if (!entry) throw new Error("Arquivo Excel não contém " + path);
    return await unzipText(bytes, entry);
  };
  const book = xml(await getText("xl/workbook.xml"));
  const rels = xml(await getText("xl/_rels/workbook.xml.rels"));
  const targets = new Map<string, string>();
  for (const r of byLocal(rels, "Relationship")) {
    const id = r.getAttribute("Id"), target = r.getAttribute("Target") || "";
    if (id && target && !r.getAttribute("TargetMode")) targets.set(id, normalizeZipTarget("xl", target));
  }
  const shared: string[] = [];
  if (entries.has("xl/sharedStrings.xml")) {
    const sharedXml = xml(await getText("xl/sharedStrings.xml"));
    for (const si of byLocal(sharedXml, "si")) shared.push(byLocal(si, "t").map(t => t.textContent || "").join(""));
  }
  const results: Array<{ sheet: string; rows: string[][] }> = [];
  for (const sheet of byLocal(book, "sheet").slice(0, 100)) {
    const id = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const path = id ? targets.get(id) : undefined;
    if (!path || !entries.has(path)) continue;
    const name = sheet.getAttribute("name") || "Planilha";
    results.push({ sheet: name, rows: parseSheet(await getText(path), shared) });
  }
  if (!results.length) throw new Error("O Excel não contém abas legíveis.");
  return results;
}
