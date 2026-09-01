export type VehicleQuestionKind = 'brand' | 'model' | 'year' | 'color' | null;

export const VEHICLE_MODELS: Record<string, string[]> = {
  CHEVROLET: ['ONIX', 'ONIX PLUS', 'PRISMA', 'COBALT', 'SPIN', 'TRACKER', 'CRUZE'],
  FIAT: ['ARGO', 'CRONOS', 'MOBI', 'UNO', 'GRAND SIENA', 'PULSE', 'FASTBACK'],
  FORD: ['KA', 'KA SEDAN', 'ECOSPORT', 'TERRITORY'],
  HONDA: ['CITY', 'CIVIC', 'FIT', 'HR-V'],
  HYUNDAI: ['HB20', 'HB20S', 'CRETA', 'IX35'],
  JEEP: ['RENEGADE', 'COMPASS', 'COMMANDER'],
  KIA: ['CERATO', 'SOUL', 'SPORTAGE'],
  NISSAN: ['VERSA', 'KICKS', 'SENTRA', 'MARCH'],
  PEUGEOT: ['208', '2008', '308'],
  RENAULT: ['LOGAN', 'SANDERO', 'KWID', 'DUSTER', 'CAPTUR'],
  TOYOTA: ['COROLLA', 'YARIS', 'ETIOS', 'COROLLA CROSS'],
  VOLKSWAGEN: ['GOL', 'VOYAGE', 'POLO', 'VIRTUS', 'T-CROSS', 'NIVUS', 'JETTA'],
  'CITROËN': ['C3', 'C4 CACTUS', 'C4 LOUNGE', 'AIRCROSS'],
  CITROEN: ['C3', 'C4 CACTUS', 'C4 LOUNGE', 'AIRCROSS'],
  'CAOA CHERY': ['ARRIZO 5', 'ARRIZO 6', 'TIGGO 2', 'TIGGO 5X', 'TIGGO 7'],
  MITSUBISHI: ['ASX', 'LANCER', 'ECLIPSE CROSS'],
  BMW: ['320I', 'X1', 'X2'],
  MERCEDES: ['CLASSE A', 'CLASSE C', 'GLA'],
  AUDI: ['A3', 'A4', 'Q3'],
};

export const VEHICLE_BRANDS = Object.keys(VEHICLE_MODELS).filter((brand, index, all) => brand !== 'CITROEN' || !all.includes('CITROËN'));
export const VEHICLE_YEARS = Array.from({ length: 11 }, (_, index) => String(2026 - index));
export const VEHICLE_COLORS = ['BRANCO', 'PRETO', 'PRATA', 'CINZA', 'VERMELHO', 'AZUL', 'VERDE', 'AMARELO', 'MARROM', 'BEGE', 'OUTRA'];

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

export function getVehicleQuestionKind(question: string): VehicleQuestionKind {
  const q = normalize(question);
  if (q.includes('QUAL A MARCA') || q === 'MARCA' || q.includes('MARCA DO VEICULO')) return 'brand';
  if (q.includes('MODELO DO VEICULO') || q.includes('QUAL MODELO') || q === 'MODELO') return 'model';
  if (q.includes('QUAL E O ANO') || q.includes('QUAL É O ANO') || q.includes('ANO DO VEICULO') || q === 'ANO') return 'year';
  if (q.includes('QUAL E A COR') || q.includes('QUAL É A COR') || q.includes('COR DO VEICULO') || q === 'COR') return 'color';
  return null;
}

export function getVehicleModels(brand: string): string[] {
  const normalized = normalize(brand);
  const key = Object.keys(VEHICLE_MODELS).find(item => normalize(item) === normalized);
  return key ? VEHICLE_MODELS[key] : [];
}
