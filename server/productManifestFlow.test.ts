import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');
const editor = fs.readFileSync('client/src/components/ProductManifestEditor.tsx', 'utf8');
const guard = fs.readFileSync('client/src/components/ProductManifestGuard.tsx', 'utf8');
const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

describe('manifesto editavel por produto', () => {
  it('fica dentro do produto no ADM e salva configuracao individual', () => {
    expect(admin).toContain('ProductManifestEditor productId={product.id}');
    expect(editor).toContain('MANIFESTO / TERMO DE ACEITE');
    expect(editor).toContain('product_manifest_${productId}');
    expect(editor).toContain('Salvar Manifesto');
  });

  it('bloqueia cliente ate ler e aceitar', () => {
    expect(main).toContain('<ProductManifestGuard />');
    expect(guard).toContain('LEITURA OBRIGATORIA');
    expect(guard).toContain('disabled={!checked}');
    expect(card).toContain('requestProductManifest');
    expect(card).toContain('handlePriceModelChange');
    expect(card).toContain('runProtectedAction');
  });
});
