import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeCpfText, extractCpfsFromText, extractWordXmlText } from "../client/src/lib/h2bicoCpfExtractor";

describe("H2BICO - extrator CPF de arquivos", () => {
  it("extrai CPFs com e sem pontuacao sem duplicar", () => {
    expect(extractCpfsFromText("123.456.789-01 | 98765432100 | 12345678901")).toEqual(["12345678901","98765432100"]);
    expect(extractCpfsFromText("abc1234567890123x")).toEqual([]);
  });
  it("decodifica TXT Windows com acentos e UTF-16", () => {
    expect(decodeCpfText(new Uint8Array([0xe7,0xe3,0x6f]))).toBe("ção");
    expect(decodeCpfText(new Uint8Array([0xff,0xfe,0x31,0x00,0x32,0x00]))).toBe("12");
  });
  it("extrai CPF de texto distribuido entre segmentos Word XML", () => {
    const xml='<w:p><w:r><w:t>123.456.</w:t></w:r><w:r><w:t>789-01</w:t></w:r></w:p>';
    expect(extractCpfsFromText(extractWordXmlText(xml))).toEqual(["12345678901"]);
  });
  it("mantem copiar todos, limpar e selecionar ou arrastar arquivos acima dos resultados", () => {
    const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
    expect(page).toContain("COPIAR TODOS");
    expect(page).toContain("LIMPAR");
    expect(page).toContain("onDrop={e=>");
    expect(page).toContain("importCpfFiles(e.dataTransfer.files)");
    expect(page).toContain("readCpfSourceFile");
    expect(page.indexOf("COPIAR TODOS")).toBeLessThan(page.indexOf('aria-label="CPFs extraídos'));
  });
});
