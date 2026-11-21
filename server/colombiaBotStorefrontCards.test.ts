import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ColombiaBotStorefrontCard, formatBotCatalogPrice } from "../client/src/components/ColombiaBotStorefrontCard";

const botSource = readFileSync("client/src/components/ColombiaBot.tsx", "utf8");

describe("ColombiaBot vitrines dentro das mensagens", () => {
  it("exibe claramente a garantia, prazo de entrega, preco e descricao da vitrine", () => {
    const html = renderToStaticMarkup(createElement(ColombiaBotStorefrontCard, {
      productName: "UBER CARRO",
      optionName: "NOME ALEATÓRIO",
      planName: "50 CORRIDAS OU 15 DIAS",
      description: "Informações e características cadastradas do produto.",
      deliveryDays: "24 a 48 horas",
      guarantee: "50 CORRIDAS OU 15 DIAS",
      price: "600",
      selectLabel: "Selecionar este plano",
      onSelect() {},
    }));
    expect(html).toContain("UBER CARRO");
    expect(html).toContain("NOME ALEATÓRIO");
    expect(html).toContain("Garantia do serviço");
    expect(html).toContain("50 CORRIDAS OU 15 DIAS");
    expect(html).toContain("o primeiro limite");
    expect(html).toContain("Não representam a duração da conta");
    expect(html).toContain("R$ 600");
    expect(html).toContain("Entrega: 24 a 48 horas");
    expect(html).toContain("Informações e características cadastradas do produto.");
    expect(html).toContain("Selecionar este plano");
  });

  it("nao confunde uma categoria de preco com garantia quando nao existe limite", () => {
    const html = renderToStaticMarkup(createElement(ColombiaBotStorefrontCard, {
      productName: "SERVIÇO TESTE", optionName: "VERSÃO PADRÃO",
      planName: "MODELO 2018", price: "1200", selectLabel: "Selecionar", onSelect() {},
    }));
    expect(html).toContain("MODELO 2018");
    expect(html).not.toContain("Garantia do serviço");
    expect(html).toContain("R$ 1200");
  });

  it("aplica restricoes VIP apenas aos cards de escolha, sem suprimir as informacoes", () => {
    const html = renderToStaticMarkup(createElement(ColombiaBotStorefrontCard, {
      productName: "SERVIÇO", optionName: "OPÇÃO", guarantee: "30 DIAS",
      price: "500", disabled: true, selectLabel: "Selecionar", onSelect() {},
    }));
    expect(html).toContain("30 DIAS");
    expect(html).toContain("Exclusivo para clientes VIP");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("formata valores atuais sem duplicar moeda e nao inventa precos vazios", () => {
    expect(formatBotCatalogPrice("600")).toBe("R$ 600");
    expect(formatBotCatalogPrice("R$ 600,00")).toBe("R$ 600,00");
    expect(formatBotCatalogPrice(null)).toBe("");
  });

  it("mantem os IDs e a sequencia original de perguntas, documentos, Pix e envio", () => {
    expect(botSource).toContain('type: "storefront-options"');
    expect(botSource).toContain("type: 'storefront-guarantees'");
    expect(botSource).toContain("String(item.id) === optionId");
    expect(botSource).toContain("String(item.id) === modelId");
    expect(botSource).not.toContain("models.find(item => displayLabel(item) === answer)");
    expect(botSource).toContain("askQuestions(product, option");
    expect(botSource).toContain("askDocuments(product, option)");
    expect(botSource).toContain("askPix(product, option)");
    expect(botSource).toContain("submitMutation.mutateAsync");
    expect(botSource).toContain("isPersistedOrderResult");
  });
});
