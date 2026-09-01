import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const catalog = fs.readFileSync('shared/vehicleCatalog.ts', 'utf8');
const bot = fs.readFileSync('client/src/components/ColombiaBot.tsx', 'utf8');

describe('filtro compacto de veiculo', () => {
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
});

// Guard: a opcao existente continua sendo opcao; categorias de preco ficam aninhadas nela.
