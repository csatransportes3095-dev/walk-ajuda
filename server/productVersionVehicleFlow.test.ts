import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');
const db = fs.readFileSync('server/db.ts', 'utf8');
const router = fs.readFileSync('server/routers.ts', 'utf8');
const catalog = fs.readFileSync('shared/vehicleCatalog.ts', 'utf8');
const bot = fs.readFileSync('client/src/components/ColombiaBot.tsx', 'utf8');
const rebuild = fs.readFileSync('scripts/rebuild-question-tree.mjs', 'utf8');

describe('versoes do produto e filtro de veiculo', () => {
  it('usa versao com valor principal e promocional sem criar outro produto', () => {
    expect(admin).toContain('Modelo / Versão');
    expect(admin).toContain('Valor Principal');
    expect(admin).toContain('Valor Promocional (opcional)');
    expect(admin).toContain('originalPrice: newOptPrice.trim() ? newOptBasePrice');
    expect(db).toContain('promoEndsAt: data.promoEndsAt ?? null');
    expect(router).toContain('promoEndsAt: z.number().nullable().optional()');
  });

  it('compacta marca modelo ano cor e aceita Citroen C3', () => {
    expect(catalog).toContain("'CITROËN': ['C3'");
    expect(catalog).toContain("Array.from({ length: 11 }");
    expect(home).toContain("vehicleModelSubs.length > 0");
    expect(home).toContain("Marca selecionada:");
    expect(home).toContain("getVehicleModels(brand)");
    expect(home).toContain("VEHICLE_YEARS");
    expect(bot).toContain("getVehicleModels(parentAnswer)");
    expect(bot).toContain("modelChildren.length > 0");
    expect(bot).toContain("VEHICLE_YEARS");
  });

  it('mantem as 19 marcas e modelos informados no catalogo canonico', () => {
    const expected = [
      ['VOLKSWAGEN', 'TAOS'], ['FIAT', 'TIPO'], ['CHEVROLET', 'EQUINOX'],
      ['HYUNDAI', 'HB20X'], ['TOYOTA', 'RAV4'], ['RENAULT', 'KARDIAN'],
      ['NISSAN', 'V-DRIVE'], ['HONDA', 'WR-V'], ['JEEP', 'COMMANDER'],
      ['BYD', 'DOLPHIN GS'], ['CAOA CHERY', 'TIGGO 8'], ['GWM', 'HAVAL H6 PHEV'],
      ['CITROËN', 'C3 AIRCROSS'], ['PEUGEOT', '408'], ['FORD', 'FOCUS SEDAN'],
      ['KIA', 'NIRO'], ['MITSUBISHI', 'OUTLANDER'], ['JAC MOTORS', 'E-JS4'],
      ['GEELY', 'EX5'],
    ];
    for (const [brand, model] of expected) {
      expect(catalog).toContain(brand);
      expect(catalog).toContain(model);
      expect(rebuild).toContain(brand);
      expect(rebuild).toContain(model);
    }
  });
});
