import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const card = readFileSync(new URL("../client/src/components/StorefrontProductCard.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");

describe("vitrine publica: legibilidade do card mobile sem mudar o mecanismo", () => {
  it("esclarece a garantia antes das opcoes em um unico aviso compacto", () => {
    const marker = 'data-testid="storefront-warranty-clarification"';
    expect(card.split(marker)).toHaveLength(2);
    expect(card).toContain("{hasWarrantyNotice && (");
    expect(card).toContain("const hasWarrantyNotice = tiers.length > 0");
    expect(card).toContain("A conta acaba quando termina a garantia?");
    expect(card).toContain("NÃO!</strong> Se a conta estiver funcionando, você continua utilizando normalmente, mesmo após o fim da garantia.");
    expect(card.indexOf(marker)).toBeLessThan(card.indexOf('className={`h2-text-fit__options'));
    expect(card.indexOf(marker)).toBeLessThan(card.indexOf('value={tierId ?? ""}'));
    expect(card).toContain("mb-2.5 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-2 text-[12px]");
  });

  it("mantem os tres cards de planos selecionaveis e as mesmas regras de preco e VIP", () => {
    expect(card).toContain("priceModels.map((model, index) =>");
    expect(card).toContain("aria-pressed={isSelected}");
    expect(card).toContain("handlePriceModelSelect(model.id)");
    expect(card).toContain("disabled={modelLocked}");
    expect(card).toContain("isVipOnlyLocked(model, isVipCustomer)");
    expect(card).toContain("globalPromotionPrice(");
    expect(card).toContain("asMoney(model.price)");
    expect(card).toContain("min-h-[156px]");
    expect(card).toContain('min-h-[42px]');
  });

  it("mostra a escolha em campos separados e destaca preco sem reescrever valores", () => {
    expect(card).toContain('h2-text-fit__choice-name relative mt-3 flex');
    expect(card).toContain("{item.option.label}</p>");
    expect(card).toContain("{selectedParts.title}</span>");
    expect(card).toContain("{selectedParts.subtitle}</span>");
    expect(card).toContain("asMoney(effectivePrice)");
    expect(card).toContain("asMoney(effectiveOriginalPrice)");
  });

  it("preserva o fluxo original de compra, carrinho e aceite do manifesto", () => {
    expect(card).toContain('runProtectedAction("buy")');
    expect(card).toContain('runProtectedAction("cart")');
    expect(card).toContain("requestProductManifest(");
    expect(card).toContain("onBuy(selectedTier, selectedPriceModel)");
    expect(card).toContain("onAddToCart(selectedTier, selectedPriceModel)");
    expect(card).toContain('<span className="whitespace-nowrap">Comprar agora</span>');
    expect(card).toContain('<span className="whitespace-nowrap">Carrinho</span>');
    expect(page).toContain("startDirectOptionCheckout(item.product, item.option, tier");
    expect(page).toContain("addToCart(item.product, item.option, priceModel");
  });

  it("mantem informacoes importantes acessiveis mas sem piscar no mobile", () => {
    expect(card).toContain("aria-expanded={detailsOpen}");
    expect(card).toContain("aria-controls={detailsId}");
    expect(card).toContain("setDetailsOpen((open) => !open)");
    expect(card).not.toContain("animate-pulse motion-reduce:animate-none");
    expect(card).toContain("VER DETALHES DO PRODUTO");
    expect(card).toContain("detailsOpen &&");
  });

  it("mantem a etiqueta mais escolhida legivel sem invadir os planos vizinhos", () => {
    expect(card).toContain('"Mais escolhida"');
    expect(card).toContain('"Popular"');
    expect(card).toContain("inset-x-1");
    expect(card).toContain("modelVipMode !== 'all'");
  });
});
