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
const VIN_VALID_CHARS = /^[A-HJ-NPR-Z0-9]+$/;
const VIN_INVALID_CHARS = /[IOQ]/i;
const VIN_VALID_YEARS = new Set(['A','B','C','D','E','F','G','H','J','K','L','M','N','P','R','S','T','V','W','X','Y','1','2','3','4','5','6','7','8','9']);
const VIN_VALID_PLANTS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

function calcCheckDigit(vin: string): string {
  if (vin.length !== 17) {
    throw new Error('VIN deve conter 17 caracteres para cálculo do dígito verificador.');
  }

  let total = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i].toUpperCase();
    if (VIN_INVALID_CHARS.test(ch)) {
      throw new Error(`Caracter inválido em VIN: ${ch}`);
    }
    const val = TRANSLITERATION[ch] ?? 0;
    total += val * VIN_WEIGHTS[i];
  }

  const rem = total % 11;
  return rem === 10 ? 'X' : String(rem);
}

export function isVINValido(vin: string): boolean {
  if (typeof vin !== 'string') return false;
  const normalized = vin.trim().toUpperCase();

  if (normalized.length !== 17) return false;
  if (!VIN_VALID_CHARS.test(normalized)) return false;
  if (VIN_INVALID_CHARS.test(normalized)) return false;
  if (!VIN_VALID_YEARS.has(normalized[9])) return false;

  const partial = normalized.slice(0, 8) + '0' + normalized.slice(9);
  const expected = calcCheckDigit(partial);
  return normalized[8] === expected;
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
  plant?: string;
  nome: string;
  modelos: string[];
}

export const MONTADORAS_VIN: Montadora[] = [
  { wmi: '9BW', vds: 'AA0A5', nome: 'Volkswagen Brasil',    modelos: ['Gol', 'Polo', 'T-Cross', 'Virtus'] },
  { wmi: '9BF', vds: 'ZAA5G', nome: 'Ford Brasil',          modelos: ['Ka', 'EcoSport', 'Territory', 'Ranger'] },
  { wmi: '9BG', vds: 'RB48Y', nome: 'GM Chevrolet Brasil',  modelos: ['Onix', 'Tracker', 'S10', 'Montana'] },
  { wmi: '9BS', vds: 'A3ANA', nome: 'Fiat Brasil',          modelos: ['Strada', 'Pulse', 'Toro', 'Argo'] },
  { wmi: '9BR', vds: 'B29BT', plant: '2', nome: 'Toyota Brasil', modelos: ['Etios', 'Etios Cross', 'Corolla', 'Hilux', 'SW4', 'Yaris'] },
  { wmi: '93H', vds: 'GEG75', nome: 'Honda Brasil',         modelos: ['Civic', 'HR-V', 'CR-V', 'City'] },
  { wmi: '9BD', vds: 'X5ANA', nome: 'Jeep Brasil (FCA)',    modelos: ['Renegade', 'Compass', 'Commander'] },
  { wmi: '9BH', vds: 'ZA3A4', nome: 'Hyundai Brasil',       modelos: ['HB20', 'Creta', 'Tucson', 'Santa Fe'] },
  { wmi: '9BM', vds: 'RB5A3', nome: 'Renault Brasil',       modelos: ['Kwid', 'Sandero', 'Duster', 'Oroch'] },
  { wmi: '9BN', vds: 'ZAB5G', nome: 'Nissan Brasil',        modelos: ['Kicks', 'Versa', 'Frontier', 'March'] },
  { wmi: 'LGX', vds: 'CE4CC', nome: 'BYD (China/Brasil)',    modelos: ['Dolphin', 'Seal', 'Atto 3', 'Han', 'Tan', 'Song Plus', 'King'] },
  { wmi: '9BK', vds: 'AA3B5', nome: 'Caoa Chery Brasil',          modelos: ['Tiggo 2', 'Tiggo 5x', 'Tiggo 7', 'Tiggo 8', 'Arrizo 6'] },
  { wmi: '935', vds: 'ZAA4G', nome: 'Peugeot Brasil (Stellantis)', modelos: ['208', '2008', '3008', '408', 'Expert'] },
  { wmi: '935', vds: 'ZBB3H', nome: 'Citroën Brasil (Stellantis)', modelos: ['C3', 'C4 Cactus', 'Aircross', 'Jumpy'] },
  { wmi: '93X', vds: 'AA5A3', nome: 'Mitsubishi Brasil',           modelos: ['L200 Triton', 'Pajero Sport', 'Eclipse Cross', 'Outlander'] },
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

export function obterPerfilFabricanteOficial(
  marca: string,
  _modelo: string,
): { wmi: string; vds: string; plant?: string } {
  const normalizarTexto = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*(s\.?a\.?|sa|do|da|de|del|e)\s*/gi, " ")
      .replace(/[^a-z0-9]/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const marcaNormalizada = normalizarTexto(marca);

  const fabricanteDireto = MONTADORAS_VIN.find((item) => {
    const nomeFabricante = normalizarTexto(item.nome);
    return nomeFabricante === marcaNormalizada
      || nomeFabricante.includes(marcaNormalizada)
      || marcaNormalizada.includes(nomeFabricante);
  });

  if (fabricanteDireto) {
    return {
      wmi: fabricanteDireto.wmi,
      vds: fabricanteDireto.vds,
      plant: fabricanteDireto.plant,
    };
  }

  throw new Error(`Não há WMI confirmado para a marca ${marca}.`);
}

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
  const safeWmi = wmi.toUpperCase().replace(/[IOQ]/gi, '');
  const safeVds = vds.toUpperCase().replace(/[IOQ]/gi, '');
  const safeYearCode = yearCode.toUpperCase().trim();
  const safePlant = plant.toUpperCase().trim();

  if (!/^[A-HJ-NPR-Z0-9]{3}$/.test(safeWmi)) {
    throw new Error('WMI inválido: deve conter 3 caracteres reais de fabricante sem I/O/Q.');
  }

  if (!/^[A-HJ-NPR-Z0-9]{5}$/.test(safeVds)) {
    throw new Error('VDS inválido: deve conter 5 caracteres sem I/O/Q.');
  }

  if (!VIN_VALID_YEARS.has(safeYearCode)) {
    throw new Error('Código do ano do VIN inválido.');
  }

  const validPlant = VIN_VALID_PLANTS.includes(safePlant) ? safePlant : VIN_VALID_PLANTS[0];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seq = String(cryptoRandInt(100000, 999999));
    const plantChar = validPlant === 'A'
      ? VIN_VALID_PLANTS[cryptoRandInt(0, VIN_VALID_PLANTS.length - 1)]
      : validPlant;

    const partial = safeWmi + safeVds + '0' + safeYearCode + plantChar + seq;
    const check = calcCheckDigit(partial);
    const vin = safeWmi + safeVds + check + safeYearCode + plantChar + seq;

    if (isVINValido(vin) && !_sessionHistory.has(vin)) {
      _sessionHistory.add(vin);
      return vin;
    }
  }

  const fallback = safeWmi + safeVds + '0' + safeYearCode + validPlant + String(Date.now()).slice(-6);
  const check = calcCheckDigit(fallback);
  const final = safeWmi + safeVds + check + safeYearCode + validPlant + String(Date.now()).slice(-6);

  if (!isVINValido(final)) {
    throw new Error('Falha ao gerar VIN válido com regras ISO/realistas.');
  }

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
  plant = 'A',
): string[] {
  const results: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    results.push(gerarVINUnico(wmi, vds, yearCode, plant));
  }
  return results;
}

export function gerarVINsDeTestePorChassiOriginal(
  chassiOriginal: string,
  quantidade: number,
): string[] {
  const original = chassiOriginal.toUpperCase().replace(/[\s-]/g, '');

  if (original.length !== 17 || !VIN_VALID_CHARS.test(original)) {
    throw new Error('Informe um chassi original com 17 caracteres válidos, sem I, O ou Q.');
  }

  if (!VIN_VALID_YEARS.has(original[9])) {
    throw new Error('O código de ano na posição 10 do chassi original não é válido.');
  }

  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) {
    throw new Error('A quantidade deve estar entre 1 e 10 chassis.');
  }

  const prefixoDescricao = original.slice(0, 8);
  const anoEPlanta = original.slice(9, 11);
  const results: string[] = [];

  for (let index = 0; index < quantidade; index++) {
    let generated = '';

    for (let attempt = 0; attempt < 1000; attempt++) {
      const serial = String(cryptoRandInt(0, 999999)).padStart(6, '0');
      const partial = `${prefixoDescricao}0${anoEPlanta}${serial}`;
      const checkDigit = calcCheckDigit(partial);
      const candidate = `${prefixoDescricao}${checkDigit}${anoEPlanta}${serial}`;

      if (candidate !== original && !_sessionHistory.has(candidate)) {
        generated = candidate;
        _sessionHistory.add(candidate);
        break;
      }
    }

    if (!generated) {
      throw new Error('Não foi possível gerar um serial de teste único.');
    }

    results.push(generated);
  }

  return results;
}
