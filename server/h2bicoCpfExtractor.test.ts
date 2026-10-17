import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeCpfText, extractCpfCandidatesFromText, extractCpfsFromText, extractWordXmlText, isValidCpf } from "../client/src/lib/h2bicoCpfExtractor";

describe("H2BICO - extrator CPF de arquivos", () => {
  it("extrai CPFs com e sem pontuacao sem duplicar", () => {
    expect(extractCpfCandidatesFromText("123.456.789-01 | 98765432100 | 12345678901")).toEqual(["12345678901","98765432100"]);
    expect(extractCpfsFromText("123.456.789-01 | 98765432100")).toEqual([]);
    expect(extractCpfsFromText("abc1234567890123x")).toEqual([]);
  });
  it("rejeita numeros com onze digitos sem CPF valido", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(extractCpfsFromText("529.982.247-25; 52998224726; 11111111111")).toEqual(["52998224725"]);
  });
  it("limita consulta a fotos salvas, sem depender do limite da lista de cards", () => {
    const router=readFileSync("server/routers/h2bico.ts","utf8");
    const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
    expect(router).toContain("checkExtractedCpfs: adminProcedure.input");
    expect(router).toContain("TRIM(photoUrl) <> ''");
    expect(page).toContain("checkExtractedCpfs.fetch");
    expect(page).toContain("candidates.filter(isValidCpf)");
    expect(page).toContain("disabled={!checkReady||!cpfs.length}");
    expect(page).toContain("Falha ao verificar o banco");
  });
  it("decodifica TXT Windows com acentos e UTF-16", () => {
    expect(decodeCpfText(new Uint8Array([0xe7,0xe3,0x6f]))).toBe("ção");
    expect(decodeCpfText(new Uint8Array([0xff,0xfe,0x31,0x00,0x32,0x00]))).toBe("12");
  });
  it("extrai CPF de texto distribuido entre segmentos Word XML", () => {
    const xml='<w:p><w:r><w:t>123.456.</w:t></w:r><w:r><w:t>789-01</w:t></w:r></w:p>';
    expect(extractCpfCandidatesFromText(extractWordXmlText(xml))).toEqual(["12345678901"]);
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
