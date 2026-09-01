export type VehicleQuestionKind = 'brand' | 'model' | 'year' | 'color' | null;

export const VEHICLE_MODELS: Record<string, string[]> = {
  VOLKSWAGEN: ['GOL', 'VOYAGE', 'POLO', 'VIRTUS', 'FOX', 'SPACEFOX', 'JETTA', 'T-CROSS', 'NIVUS', 'TAOS'],
  FIAT: ['MOBI', 'UNO', 'ARGO', 'CRONOS', 'GRAND SIENA', 'SIENA', 'PULSE', 'FASTBACK', 'TIPO'],
  CHEVROLET: ['ONIX', 'ONIX PLUS', 'PRISMA', 'COBALT', 'SPIN', 'CRUZE', 'TRACKER', 'JOY', 'JOY PLUS', 'EQUINOX'],
  HYUNDAI: ['HB20', 'HB20S', 'HB20X', 'CRETA', 'ELANTRA', 'I30', 'TUCSON', 'IX35', 'AZERA'],
  TOYOTA: ['ETIOS', 'ETIOS SEDAN', 'YARIS', 'YARIS SEDAN', 'COROLLA', 'COROLLA CROSS', 'PRIUS', 'RAV4'],
  RENAULT: ['KWID', 'SANDERO', 'LOGAN', 'DUSTER', 'CAPTUR', 'FLUENCE', 'KARDIAN'],
  NISSAN: ['MARCH', 'VERSA', 'V-DRIVE', 'SENTRA', 'KICKS', 'LEAF'],
  HONDA: ['FIT', 'CITY', 'CIVIC', 'HR-V', 'WR-V', 'ACCORD'],
  JEEP: ['RENEGADE', 'COMPASS', 'COMMANDER'],
  BYD: ['DOLPHIN MINI', 'DOLPHIN', 'DOLPHIN GS', 'KING', 'YUAN PLUS', 'SONG PLUS', 'SEAL'],
  'CAOA CHERY': ['ARRIZO 5', 'ARRIZO 5E', 'ARRIZO 6', 'TIGGO 2', 'TIGGO 3X', 'TIGGO 5X', 'TIGGO 7', 'TIGGO 8'],
  GWM: ['ORA 03', 'HAVAL H6', 'HAVAL H6 HEV', 'HAVAL H6 PHEV'],
  'CITROËN': ['C3', 'C3 AIRCROSS', 'C4 LOUNGE', 'C4 CACTUS', 'AIRCROSS'],
  PEUGEOT: ['208', '2008', '308', '408'],
  FORD: ['KA', 'KA SEDAN', 'FIESTA', 'FOCUS', 'FOCUS SEDAN', 'ECOSPORT', 'FUSION', 'TERRITORY'],
  KIA: ['RIO', 'CERATO', 'SOUL', 'SPORTAGE', 'STONIC', 'NIRO'],
  MITSUBISHI: ['LANCER', 'ASX', 'ECLIPSE CROSS', 'OUTLANDER'],
  'JAC MOTORS': ['T40', 'T50', 'T60', 'E-JS1', 'E-JS4', 'IEV20', 'IEV40'],
  GEELY: ['EX2', 'EX5'],
};

export const VEHICLE_BRANDS = Object.keys(VEHICLE_MODELS);
export const VEHICLE_YEARS = Array.from({ length: 11 }, (_, index) => String(2026 - index));
export const VEHICLE_COLORS = ['BRANCO', 'PRETO', 'PRATA', 'CINZA', 'VERMELHO', 'AZUL', 'VERDE', 'AMARELO', 'MARROM', 'BEGE', 'OUTRA'];

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const VEHICLE_BRAND_ALIASES: Record<string, string> = {
  CITROEN: 'CITROËN',
  CHERY: 'CAOA CHERY',
  JAC: 'JAC MOTORS',
};

export function getVehicleQuestionKind(question: string): VehicleQuestionKind {
  const q = normalize(question);
  if (q.includes('QUAL A MARCA') || q === 'MARCA' || q.includes('MARCA DO VEICULO')) return 'brand';
  if (q.includes('MODELO DO VEICULO') || q.includes('QUAL MODELO') || q === 'MODELO') return 'model';
  if (q.includes('QUAL E O ANO') || q.includes('ANO DO VEICULO') || q === 'ANO') return 'year';
  if (q.includes('QUAL E A COR') || q.includes('COR DO VEICULO') || q === 'COR') return 'color';
  return null;
}

export function getVehicleModels(brand: string): string[] {
  const normalized = normalize(brand);
  const alias = VEHICLE_BRAND_ALIASES[normalized];
  const key = alias ?? Object.keys(VEHICLE_MODELS).find(item => normalize(item) === normalized);
  return key ? VEHICLE_MODELS[key] : [];
}
