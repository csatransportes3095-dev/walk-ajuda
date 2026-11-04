import { describe, it, expect } from "vitest";
import { getHelpSearchWords, groupHelpQuestions, normalizeHelpText } from "./helpFaqSearch";

const items = [
  { id: "a", question: "Posso cadastrar o chip no meu nome?", answer: "O chip deve ser novo e usado no aparelho." },
  { id: "b", question: "Posso utilizar um chip usado?", answer: "Use um chip novo, sem uso anterior." },
  { id: "c", question: "Qual nome devo colocar no cadastro?", answer: "Confira as instruções do cadastro." },
  { id: "d", question: "Como preparar o iPhone?", answer: "O aparelho deve estar preparado." },
  { id: "e", question: "O celular precisa ser novo?", answer: "O chip precisa ser novo." },
  { id: "f", question: "Qual a preparação do aparelho?", answer: "Siga as instruções do Wi-Fi." },
];

describe("/ajuda: agrupamento sem editar dados do FAQ", () => {
  it("normaliza acentos e ignora palavras comuns e repetidas", () => {
    expect(normalizeHelpText("NOME — CHÍP?")).toBe("nome chip");
    expect(getHelpSearchWords("Posso cadastra chio nome meu nome")).toEqual(["chip", "nome"]);
  });

  it("pesquisa cada palavra em perguntas E respostas, em grupos separados", () => {
    const result = groupHelpQuestions(items, "chip nome");
    expect(result.groups.map(group => group.title)).toEqual(["PALAVRA: CHIP", "PALAVRA: NOME"]);
    expect(result.groups[0].items.map(item => item.id)).toEqual(["a", "b", "e"]);
    expect(result.groups[1].items.map(item => item.id)).toEqual(["a", "c"]);
    expect(result.totalMatches).toBe(4);
  });

  it("arvore sem pesquisa classifica assuntos e preserva todas as perguntas", () => {
    const result = groupHelpQuestions(items, "");
    const entries = result.groups.flatMap(group => group.items);
    expect(result.totalMatches).toBe(items.length);
    expect(new Set(entries.map(entry => entry.id))).toEqual(new Set(items.map(item => item.id)));
    expect(result.groups.find(group => group.title === "CHIP E LINHA")?.items.some(item => item.id === "b")).toBe(true);
    expect(result.groups.find(group => group.title === "NOME E DOCUMENTOS")?.items.some(item => item.id === "c")).toBe(true);
  });

  it("palavra sem resultados retorna grupos vazios sem criar resultados artificiais", () => {
    expect(groupHelpQuestions(items, "zzzzzz").groups).toEqual([]);
    expect(groupHelpQuestions([], "chip").totalMatches).toBe(0);
  });

  it("não altera ordem, perguntas ou respostas originais", () => {
    const snapshot = JSON.stringify(items);
    groupHelpQuestions(items, "chip nome");
    groupHelpQuestions(items, "");
    expect(JSON.stringify(items)).toBe(snapshot);
  });
});
