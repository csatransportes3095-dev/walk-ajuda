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
