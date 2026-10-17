/**
 * Interprets Tesseract TSV words into individual screenshot cards.
 * Coordinates are expressed in the original (EXIF-oriented) image space.
 * OCR is only a suggestion: the administrator must verify each name, CPF and crop.
 */
export type ScreenshotCrop = { x: number; y: number; size: number };
export type ScreenshotPerson = {
  name: string;
  cpf: string;
  crop: ScreenshotCrop;
  confidence: number;
  warnings: string[];
};

type Word = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
};
type TextLine = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
};

const cpfPattern = /(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}(?!\d)/g;

export function cpfDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeScreenshotName(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleUpperCase("pt-BR")
    .replace(/\b(?:CONSULTAR|BAIXAR|SEMELHAN[CÇ]A|ALTA|M[EÉ]DIA|RESULTADO|DISPON[IÍ]VEL)\b/gu, " ")
    .replace(/[^A-ZÀ-ÖØ-Ý\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function isReviewableName(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 2 && name.length >= 6 && words.every(word => word.length >= 2);
}

export function parseScreenshotTsv(tsv: string, width: number, height: number): ScreenshotPerson[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) return [];

  const groups = new Map<string, Word[]>();
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const columns = line.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;
    const text = columns.slice(11).join("\t").trim();
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const wordWidth = Number(columns[8]);
    const wordHeight = Number(columns[9]);
    const confidence = Number(columns[10]);
    if (!text || ![left, top, wordWidth, wordHeight, confidence].every(Number.isFinite) || wordWidth <= 0 || wordHeight <= 0) continue;
    const key = columns[2] + "-" + columns[3] + "-" + columns[4];
    const words = groups.get(key) || [];
    words.push({text, left, top, width: wordWidth, height: wordHeight, confidence});
    groups.set(key, words);
  }

  const lines: TextLine[] = [...groups.values()].map(words => {
    words.sort((a,b)=>a.left-b.left);
    const left = Math.min(...words.map(w=>w.left));
    const top = Math.min(...words.map(w=>w.top));
    const right = Math.max(...words.map(w=>w.left+w.width));
    const bottom = Math.max(...words.map(w=>w.top+w.height));
    return {
      text: words.map(w=>w.text).join(" "),
      left, top, width: right-left, height: bottom-top,
      confidence: words.reduce((sum,w)=>sum+Math.max(0,w.confidence),0)/words.length
    };
  }).sort((a,b)=>a.top-b.top || a.left-b.left);

  const persons: ScreenshotPerson[] = [];
  const seen = new Set<string>();
  for (const cpfLine of lines) {
    const text = cpfLine.text.replace(/[–—−]/g, "-").replace(/\u00a0/g, " ");
    const matches = [...text.matchAll(cpfPattern)];
    if (matches.length === 0) continue;

    // An individual card normally has a name directly above the CPF at the same X.
    const nameCandidates = lines.filter(candidate => {
      const dy = cpfLine.top-candidate.top;
      if (dy < 2 || dy > Math.max(110, cpfLine.height*7)) return false;
      if (Math.abs(candidate.left-cpfLine.left) > Math.max(115,cpfLine.height*8)) return false;
      if (/\d/.test(candidate.text)) return false;
      return isReviewableName(normalizeScreenshotName(candidate.text));
    });
    nameCandidates.sort((a,b) => {
      const rank = (n:TextLine) => Math.abs(n.left-cpfLine.left)*0.8 + Math.abs((cpfLine.top-n.top)-Math.max(27,cpfLine.height*2.5));
      return rank(a)-rank(b);
    });
    const nameLine = nameCandidates[0];
    const name = nameLine ? normalizeScreenshotName(nameLine.text) : "";
    const basis = nameLine || cpfLine;
    const size = Math.max(64,Math.min(230,Math.round(basis.height*7.1),width,height));
    const gap = Math.max(14,Math.min(40,Math.round(basis.height*1.55)));
    const x = Math.max(0,Math.min(width-size,Math.round(basis.left-size-gap)));
    const y = Math.max(0,Math.min(height-size,Math.round(nameLine ? nameLine.top-basis.height*0.85 : cpfLine.top-size*0.34)));
    for (const match of matches) {
      const cpf = cpfDigits(match[0]);
      if (cpf.length !== 11 || seen.has(cpf)) continue;
      seen.add(cpf);
      const warnings: string[] = [];
      if (!nameLine) warnings.push("Nome não reconhecido; preencha antes de salvar.");
      if (Math.abs((basis.left-size-gap)-x)>12) warnings.push("Confira a posição da foto.");
      if (cpfLine.confidence < 70 || (nameLine && nameLine.confidence < 70)) warnings.push("Leitura de texto com baixa confiança; confira os dados.");
      persons.push({
        name, cpf, crop: {x,y,size},
        confidence: Math.round(Math.max(0,Math.min(100,(cpfLine.confidence+(nameLine?.confidence||0))/ (nameLine?2:1)))),
        warnings
      });
      if (persons.length >= 80) return persons;
    }
  }
  return persons;
}
