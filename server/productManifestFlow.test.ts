import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');
const editor = fs.readFileSync('client/src/components/ProductManifestEditor.tsx', 'utf8');
const guard = fs.readFileSync('client/src/components/ProductManifestGuard.tsx', 'utf8');
const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

describe('manifesto individual por subproduto', () => {
  it('nao fica mais no produto principal', () => {
    expect(admin).not.toContain('ProductManifestEditor productId={product.id}');
    expect(admin).toContain('storageKey={`option_manifest_${opt.id}`}');
  });

  it('cada modelo/categoria tem seu proprio manifesto no ADM', () => {
    expect(admin).toContain('storageKey={`price_model_manifest_${model.id}`}');
    expect(editor).toContain('Individual deste item');
    expect(editor).toContain('storageKey');
  });

  it('cliente prioriza manifesto da categoria e usa opcao como fallback', () => {
    expect(main).toContain('<ProductManifestGuard />');
    expect(guard).toContain('req.manifestKeys.map');
    expect(card).toContain('price_model_manifest_${nextId}');
    expect(card).toContain('option_manifest_${item.option.id}');
    expect(card).toContain('runProtectedAction');
  });
});
