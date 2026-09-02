export type VehicleQuestionKind = 'brand' | 'model' | 'year' | 'color' | null;

// Catálogo amplo de veículos de passeio encontrados no mercado brasileiro em versões 2016+.
// A elegibilidade final na Uber depende da cidade, categoria, ano e regras vigentes da plataforma.
// Esta lista serve para o formulário H2 e não substitui a consulta oficial de elegibilidade da Uber.
export const VEHICLE_MODELS: Record<string, string[]> = {
  VOLKSWAGEN: ['AMAROK', 'FOX', 'GOL', 'GOLF', 'JETTA', 'NIVUS', 'PASSAT', 'POLO', 'SAVEIRO', 'SPACEFOX', 'T-CROSS', 'TAOS', 'TIGUAN', 'VIRTUS', 'VOYAGE'],
  FIAT: ['ARGO', 'CRONOS', 'DOBLO', 'FASTBACK', 'FIORINO', 'FREEMONT', 'GRAND SIENA', 'IDEA', 'LINEA', 'MOBI', 'PALIO', 'PULSE', 'SIENA', 'STRADA', 'TIPO', 'TORO', 'UNO'],
  CHEVROLET: ['COBALT', 'CRUZE', 'EQUINOX', 'JOY', 'JOY PLUS', 'MONTANA', 'ONIX', 'ONIX PLUS', 'PRISMA', 'SPIN', 'TRACKER', 'TRAILBLAZER'],
  HYUNDAI: ['AZERA', 'CRETA', 'ELANTRA', 'HB20', 'HB20S', 'HB20X', 'I30', 'IX35', 'SANTA FE', 'TUCSON'],
  TOYOTA: ['COROLLA', 'COROLLA CROSS', 'ETIOS', 'ETIOS SEDAN', 'PRIUS', 'RAV4', 'YARIS', 'YARIS SEDAN'],
  RENAULT: ['CAPTUR', 'DUSTER', 'FLUENCE', 'KARDIAN', 'KWID', 'LOGAN', 'SANDERO'],
  NISSAN: ['KICKS', 'LEAF', 'MARCH', 'SENTRA', 'VERSA', 'V-DRIVE'],
  HONDA: ['ACCORD', 'CITY', 'CIVIC', 'FIT', 'HR-V', 'WR-V'],
  JEEP: ['COMMANDER', 'COMPASS', 'RENEGADE'],
  'CITROËN': ['AIRCROSS', 'C3', 'C3 AIRCROSS', 'C4 CACTUS', 'C4 LOUNGE'],
  PEUGEOT: ['2008', '208', '308', '408'],
  FORD: ['ECOSPORT', 'FIESTA', 'FOCUS', 'FOCUS SEDAN', 'FUSION', 'KA', 'KA SEDAN', 'TERRITORY'],
  KIA: ['CERATO', 'NIRO', 'RIO', 'SORENTO', 'SOUL', 'SPORTAGE', 'STONIC'],
  MITSUBISHI: ['ASX', 'ECLIPSE CROSS', 'LANCER', 'OUTLANDER'],
  'CAOA CHERY': ['ARRIZO 5', 'ARRIZO 5E', 'ARRIZO 6', 'TIGGO 2', 'TIGGO 3X', 'TIGGO 5X', 'TIGGO 7', 'TIGGO 8'],
  BYD: ['DOLPHIN', 'DOLPHIN GS', 'DOLPHIN MINI', 'KING', 'SEAL', 'SONG PLUS', 'YUAN PLUS'],
  GWM: ['HAVAL H6', 'HAVAL H6 HEV', 'HAVAL H6 PHEV', 'ORA 03'],
  'JAC MOTORS': ['E-JS1', 'E-JS4', 'IEV20', 'IEV40', 'T40', 'T50', 'T60'],
  GEELY: ['EX2', 'EX5'],
  AUDI: ['A3', 'A4', 'A5', 'Q3', 'Q5'],
  BMW: ['118I', '120I', '320I', '328I', '330E', '330I', 'X1', 'X2', 'X3'],
  'MERCEDES-BENZ': ['A 200', 'C 180', 'C 200', 'CLA 200', 'GLA 200', 'GLB 200'],
  VOLVO: ['S60', 'V40', 'XC40', 'XC60'],
  'LAND ROVER': ['DISCOVERY SPORT', 'EVOQUE'],
  LEXUS: ['ES 300H', 'NX 300H', 'UX 250H'],
  MINI: ['COOPER', 'COUNTRYMAN'],
  SUBARU: ['FORESTER', 'IMPREZA', 'LEGACY', 'OUTBACK', 'XV'],
  SUZUKI: ['S-CROSS', 'VITARA'],
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
  CAOA: 'CAOA CHERY',
  JAC: 'JAC MOTORS',
  MERCEDES: 'MERCEDES-BENZ',
  'MERCEDES BENZ': 'MERCEDES-BENZ',
  LANDROVER: 'LAND ROVER',
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
