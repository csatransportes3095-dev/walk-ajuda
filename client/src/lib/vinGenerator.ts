/**
 * vinGenerator.ts
 * Gerador de chassi VIN (ISO 3779) com:
 * - Entropia criptográfica via crypto.getRandomValues()
 * - Histórico global de sessão para evitar repetições
 * - Módulo compartilhado entre /gerador-chassi e /admin/telefone
 */

// ════════════════════════════════════════════════════════════
// ALGORITMO VIN (ISO 3779)
// ════════════════════════════════════════════════════════════

const TRANSLITERATION: Record<string, number> = {
  A:1,  B:2,  C:3,  D:4,  E:5,  F:6,  G:7,  H:8,
  J:1,  K:2,  L:3,  M:4,  N:5,
  P:7,  R:9,
  S:2,  T:3,  U:4,  V:5,  W:6,  X:7,  Y:8,  Z:9,
  '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
};

const VIN_WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];

function calcCheckDigit(vin: string): string {
  let total = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i].toUpperCase();
    const val = TRANSLITERATION[ch] ?? 0;
    total += val * VIN_WEIGHTS[i];
  }
  const rem = total % 11;
  return rem === 10 ? 'X' : String(rem);
}

// ════════════════════════════════════════════════════════════
// ENTROPIA CRIPTOGRÁFICA
// ════════════════════════════════════════════════════════════

/**
 * Gera um inteiro aleatório no intervalo [min, max] usando
 * crypto.getRandomValues() — entropia criptográfica real,
 * sem viés de módulo (rejection sampling).
 */
function cryptoRandInt(min: number, max: number): number {
  const range = max - min + 1;
  const bitsNeeded = Math.ceil(Math.log2(range));
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range;

  while (true) {
    const bytes = new Uint8Array(bytesNeeded);
    crypto.getRandomValues(bytes);
    let value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = (value << 8) | bytes[i];
    }
    // Rejection sampling para eliminar viés de módulo
    if (value < maxValid) {
      return min + (value % range);
    }
    // Caso raro: tenta novamente (probabilidade < 0.4%)
  }
}

// ════════════════════════════════════════════════════════════
// HISTÓRICO GLOBAL DE SESSÃO
// ════════════════════════════════════════════════════════════

/**
 * Set global compartilhado entre todos os componentes.
 * Persiste durante toda a sessão do browser.
 * Garante unicidade entre /gerador-chassi e /admin/telefone.
 */
const _sessionHistory = new Set<string>();

export function getSessionHistorySize(): number {
  return _sessionHistory.size;
}

export function clearSessionHistory(): void {
  _sessionHistory.clear();
}

// ════════════════════════════════════════════════════════════
// DADOS DAS MONTADORAS
// ════════════════════════════════════════════════════════════

export interface Montadora {
  wmi: string;
  vds: string;
  nome: string;
  modelos: string[];
}

export const MONTADORAS_VIN: Montadora[] = [
  { wmi: '9BW', vds: 'AA0A5', nome: 'Volkswagen Brasil',    modelos: ['Gol', 'Polo', 'T-Cross', 'Virtus'] },
  { wmi: '9BF', vds: 'ZAA5G', nome: 'Ford Brasil',          modelos: ['Ka', 'EcoSport', 'Territory', 'Ranger'] },
  { wmi: '9BG', vds: 'RB48Y', nome: 'GM Chevrolet Brasil',  modelos: ['Onix', 'Tracker', 'S10', 'Montana'] },
  { wmi: '9BS', vds: 'A3ANA', nome: 'Fiat Brasil',          modelos: ['Strada', 'Pulse', 'Toro', 'Argo'] },
  { wmi: '8AF', vds: 'ZFH4D', nome: 'Toyota Brasil',        modelos: ['Corolla', 'Hilux', 'SW4', 'Yaris'] },
  { wmi: '93H', vds: 'GEG75', nome: 'Honda Brasil',         modelos: ['Civic', 'HR-V', 'CR-V', 'City'] },
  { wmi: '9BD', vds: 'X5ANA', nome: 'Jeep Brasil (FCA)',    modelos: ['Renegade', 'Compass', 'Commander'] },
  { wmi: '9BH', vds: 'ZA3A4', nome: 'Hyundai Brasil',       modelos: ['HB20', 'Creta', 'Tucson', 'Santa Fe'] },
  { wmi: '9BM', vds: 'RB5A3', nome: 'Renault Brasil',       modelos: ['Kwid', 'Sandero', 'Duster', 'Oroch'] },
  { wmi: '9BN', vds: 'ZAB5G', nome: 'Nissan Brasil',        modelos: ['Kicks', 'Versa', 'Frontier', 'March'] },
  { wmi: 'LGX', vds: 'CE4CC', nome: 'BYD (China/Brasil)',    modelos: ['Dolphin', 'Seal', 'Atto 3', 'Han', 'Tan', 'Song Plus', 'King'] },
  { wmi: '9BK', vds: 'AA3B5', nome: 'Caoa Chery Brasil',          modelos: ['Tiggo 2', 'Tiggo 5x', 'Tiggo 7', 'Tiggo 8', 'Arrizo 6'] },
  { wmi: '935', vds: 'ZAA4G', nome: 'Peugeot Brasil (Stellantis)', modelos: ['208', '2008', '3008', '408', 'Expert'] },
  { wmi: '935', vds: 'ZBB3H', nome: 'Citroën Brasil (Stellantis)', modelos: ['C3', 'C4 Cactus', 'Aircross', 'Jumpy'] },
  { wmi: '9BR', vds: 'AA5A3', nome: 'Mitsubishi Brasil',           modelos: ['L200 Triton', 'Pajero Sport', 'Eclipse Cross', 'Outlander'] },
  { wmi: 'KNA', vds: 'GM4A5', nome: 'Kia (Coreia do Sul)',         modelos: ['Sportage', 'Sorento', 'Stinger', 'EV6', 'Carnival'] },
  { wmi: 'LGW', vds: 'CE3BB', nome: 'GWM/Haval (China)',           modelos: ['Haval H6', 'Haval H2', 'Ora 03', 'Tank 300', 'Poer'] },
  { wmi: 'LB1', vds: 'AA1B3', nome: 'JAC Motors (China)',          modelos: ['J3', 'J5', 'T40', 'T60', 'iEV40', 'e-JS4'] },
  { wmi: '9BD', vds: 'X7ANA', nome: 'RAM Brasil (Stellantis)',     modelos: ['RAM 1500', 'RAM 2500', 'RAM 700', 'ProMaster'] },
  { wmi: 'JF2', vds: '1AA5A', nome: 'Subaru (Japão)',              modelos: ['Impreza', 'Forester', 'Outback', 'XV', 'WRX'] },
  { wmi: 'JS2', vds: '2AA4B', nome: 'Suzuki (Japão)',              modelos: ['Jimny', 'Swift', 'Vitara', 'S-Cross', 'Baleno'] },
  { wmi: 'WAU', vds: 'ZZZE7', nome: 'Audi (Alemanha)',              modelos: ['A3', 'A4', 'Q3', 'Q5', 'Q7', 'e-tron', 'RS3'] },
];

export const ANOS_VIN: { code: string; ano: number }[] = [
  { code: 'K', ano: 2019 },
  { code: 'L', ano: 2020 },
  { code: 'M', ano: 2021 },
  { code: 'N', ano: 2022 },
  { code: 'P', ano: 2023 },
  { code: 'R', ano: 2024 },
  { code: 'S', ano: 2025 },
  { code: 'T', ano: 2026 },
];

// ════════════════════════════════════════════════════════════
// GERADOR PRINCIPAL
// ════════════════════════════════════════════════════════════

/**
 * Gera um VIN único com entropia criptográfica.
 * Verifica o histórico de sessão e tenta novamente se houver colisão.
 * Máximo de 1000 tentativas (proteção contra loop infinito).
 */
export function gerarVINUnico(
  wmi: string,
  vds: string,
  yearCode: string,
  plant = 'A',
): string {
  const MAX_ATTEMPTS = 1000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Sequencial com 6 dígitos: 100000–999999 (900.000 combinações)
    const seq = String(cryptoRandInt(100000, 999999));

    // Planta aleatória entre A-Z (exceto I, O, Q — proibidos no VIN)
    const validPlants = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const plantChar = plant === 'A'
      ? validPlants[cryptoRandInt(0, validPlants.length - 1)]
      : plant;

    // Monta o VIN parcial com check digit provisório '0'
    const partial = wmi + vds + '0' + yearCode + plantChar + seq;
    const check = calcCheckDigit(partial);
    const vin = wmi + vds + check + yearCode + plantChar + seq;

    // Verifica unicidade na sessão
    if (!_sessionHistory.has(vin)) {
      _sessionHistory.add(vin);
      return vin;
    }
    // Colisão detectada — tenta novamente (rarissimo)
  }

  // Fallback extremamente improvável: retorna com timestamp para garantir unicidade
  const fallback = wmi + vds + '0' + yearCode + plant + String(Date.now()).slice(-6);
  const check = calcCheckDigit(fallback);
  const final = wmi + vds + check + yearCode + plant + String(Date.now()).slice(-6);
  _sessionHistory.add(final);
  return final;
}

/**
 * Gera múltiplos VINs únicos de uma vez.
 */
export function gerarMultiplosVINs(
  wmi: string,
  vds: string,
  yearCode: string,
  quantidade: number,
): string[] {
  const results: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    results.push(gerarVINUnico(wmi, vds, yearCode));
  }
  return results;
}
