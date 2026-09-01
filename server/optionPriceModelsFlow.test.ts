import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const router = fs.readFileSync('server/routers/optionPriceModels.ts', 'utf8');
const appRouter = fs.readFileSync('server/routers.ts', 'utf8');
const admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');
const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const bot = fs.readFileSync('client/src/components/ColombiaBot.tsx', 'utf8');
const catalog = fs.readFileSync('shared/vehicleCatalog.ts', 'utf8');

describe('categorias de preco dentro da opcao existente', () => {
  it('nao cria novas productOptions para os tres precos', () => {
    expect(router).toContain('CREATE TABLE IF NOT EXISTS optionPriceModels');
    expect(router).toContain("'SÓ PARA BLOCO'");
    expect(router).toContain("'SOMENTE VIAGEM'");
    expect(router).toContain("'COMPLETO'");
    expect(router).toContain('FROM productOptions o');
    expect(appRouter).toContain('optionPriceModels: optionPriceModelsRouter');
  });

  it('edita as categorias dentro do card da opcao no ADM', () => {
    expect(admin).toContain('MODELOS / CATEGORIAS DE PREÇO');
    expect(admin).toContain('<OptionPriceModelsEditor optionId={opt.id} />');
    expect(admin).toContain('Não criam outro produto e não duplicam perguntas ou documentos.');
  });

  it('cliente escolhe categoria e checkout preserva a opcao original', () => {
    expect(card).toContain('Modelo / categoria');
    expect(card).toContain('selectedPriceModel');
    expect(card).toContain('|| priceModels[0] || null');
    expect(card).toContain('value={selectedPriceModel?.id ?? \"\"}');
    expect(home).toContain('selectedPriceModel.price');
    expect(home).toContain('priceModelId: selectedPriceModel?.id');
    expect(home).toContain('item.priceModel?.price || item.option?.price');
    expect(home).toContain('selectedPriceModel.label');
  });

  it('assistente Colombia pergunta e cobra a categoria selecionada', () => {
    expect(bot).toContain('Qual modelo / categoria de preço você deseja?');
    expect(bot).toContain('flowState.current.priceModel?.price || option?.price');
    expect(bot).toContain('priceModelId: fs.priceModel?.id');
  });

  it('contem as 19 marcas e os modelos enviados pelo usuario', () => {
    for (const brand of ['VOLKSWAGEN','FIAT','CHEVROLET','HYUNDAI','TOYOTA','RENAULT','NISSAN','HONDA','JEEP','BYD','CAOA CHERY','GWM','CITROËN','PEUGEOT','FORD','KIA','MITSUBISHI','JAC MOTORS','GEELY']) {
      expect(catalog).toContain(brand);
    }
    for (const model of ['TAOS','TIPO','EQUINOX','AZERA','RAV4','KARDIAN','LEAF','ACCORD','DOLPHIN GS','TIGGO 8','HAVAL H6 PHEV','C3 AIRCROSS','408','FUSION','NIRO','OUTLANDER','E-JS4','EX5']) {
      expect(catalog).toContain(model);
    }
  });
});
