import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('seleção automática de categoria de preço', () => {
  it('seleciona a primeira opção liberada, exibida à esquerda', () => {
    const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');

    expect(card).toContain('const preferredModel = selectablePriceModels[0] || null;');
    expect(card).toContain('const nextDefault = selectablePriceModels[0] || null;');
    expect(card).not.toContain('const mostChosenModel = priceModels[1]');
  });
});


describe('visual promocional da vitrine', () => {
  it('mantém os cards compactos e mostra DE/POR para qualquer desconto cadastrado', () => {
    const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');

    expect(card).toContain('const modelDiscount = discountPercent(model.price, model.originalPrice);');
    expect(card).toContain('const modelHasDiscount = modelDiscount > 0;');
    expect(card).toContain('min-h-[214px]');
    expect(card).not.toContain('min-h-[245px]');
    expect(card).toContain('Economize {modelDiscount}%');
  });

  it('mantém o resumo com preço antigo grande, preço promocional maior e selo lateral', () => {
    const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');

    expect(card).toContain('decoration-[5px]');
    expect(card).toContain('text-[44px]');
    expect(card).toContain('grid-cols-[minmax(0,1fr)_116px]');
    expect(card).toContain('<Flame className=');
  });
});
