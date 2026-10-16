/**
 * Laboratorio ADM: identificadores SINTETICOS para testes internos.
 * O prefixo 0H2T usa um WMI deliberadamente nao atribuido (inicia em 0).
 * O digito verificador segue a aritmetica ISO 3779, mas o codigo NAO e um VIN oficial.
 * Nao altera o gerador de VIN existente.
 */
import { isVINValido, MONTADORAS_VIN } from "./vinGenerator";

export const CHASSIS_LAB_STORAGE_KEY = "h2-chassis-lab-records-v1";
export const CHASSIS_LAB_MAX_RECORDS = 1000;
const TEST_PREFIX = "0H2T";
const ALPHABET = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const YEARS: Record<string, number> = {
  G: 2016, H: 2017, J: 2018, K: 2019, L: 2020, M: 2021, N: 2022,
  P: 2023, R: 2024, S: 2025, T: 2026, V: 2027,
};

export type ChassisLabRecord = {
  codigo: string;
  chassiReferencia: string;
  marca: string;
  modelo: string;
  versao: string;
  motorizacao: string;
  ano: number;
  criadoEm: string;
  fonte: "informado-pelo-adm";
};

export function normalizarChassiReferencia(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function identificarAnoReferencia(value: string): { codigo: string; ano: number } | null {
  const vin = normalizarChassiReferencia(value);
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
  const codigo = vin[9];
  const ano = YEARS[codigo];
  return ano ? { codigo, ano } : null;
}

export function validarChassiReferencia(value: string): { vin: string; codigo: string; ano: number } {
  const vin = normalizarChassiReferencia(value);
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    throw new Error("Informe a referencia com 17 caracteres, sem I, O ou Q.");
  }
  const ano = identificarAnoReferencia(vin);
  if (!ano) throw new Error("O ano do chassi nao esta entre 2016 e 2027. Verifique a referencia.");
  return { vin, ...ano };
}

export function sugerirFabricantePorWmi(value: string): string {
  const vin = normalizarChassiReferencia(value);
  if (vin.length < 3) return "";
  return MONTADORAS_VIN.find((item) => item.wmi === vin.slice(0, 3))?.nome || "";
}

function randomChars(count: number): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let result = "";
  while (result.length < count) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit) result += ALPHABET[byte % ALPHABET.length];
      if (result.length === count) break;
    }
  }
  return result;
}

function checkDigit(value: string): string {
  if (value.length !== 17) throw new Error("Identificador com tamanho incorreto.");
  let total = 0;
  for (let index = 0; index < 17; index += 1) {
    const character = value[index];
    const digit = Number(character);
    const numeric = /^[0-9]$/.test(character) ? digit : LETTER_VALUES[character];
    if (numeric === undefined) throw new Error("Caractere nao permitido.");
    total += numeric * WEIGHTS[index];
  }
  const remainder = total % 11;
  return remainder === 10 ? "X" : String(remainder);
}

/**
 * 17 caracteres, verificador matematico valido, prefixo 0H2T de teste.
 * 10 caracteres aleatorios criptograficos: 4 no descritor e 6 no serial.
 * O prefixo nao corresponde a um WMI oficial. Nao reutilizar como VIN real.
 */
export function gerarIdentificadorLaboratorio(chassiReferencia: string, jaUsados: ReadonlySet<string>): string {
  const { vin, codigo } = validarChassiReferencia(chassiReferencia);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const firstEight = TEST_PREFIX + randomChars(4);
    const serial = randomChars(6);
    const partial = firstEight + "0" + codigo + "X" + serial;
    const candidate = firstEight + checkDigit(partial) + codigo + "X" + serial;
    if (candidate !== vin && !jaUsados.has(candidate) && isVINValido(candidate)) return candidate;
  }
  throw new Error("Nao foi possivel criar um identificador de teste inedito.");
}

export function isIdentificadorLaboratorio(value: string): boolean {
  return value.startsWith(TEST_PREFIX) && value.length === 17 && value[10] === "X" && isVINValido(value);
}

/** Dados locais, sem sincronizacao entre navegadores. Unicidade global e reservada no banco ADM. */
export function lerRegistrosLaboratorio(): ChassisLabRecord[] {
  const raw = window.localStorage.getItem(CHASSIS_LAB_STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Historico de testes local corrompido. Preserve o backup antes de continuar."); }
  if (!Array.isArray(parsed) || parsed.length > CHASSIS_LAB_MAX_RECORDS ||
    parsed.some((item) => !item || typeof item !== "object" ||
      !isIdentificadorLaboratorio((item as ChassisLabRecord).codigo) ||
      typeof (item as ChassisLabRecord).chassiReferencia !== "string" ||
      typeof (item as ChassisLabRecord).marca !== "string" ||
      typeof (item as ChassisLabRecord).modelo !== "string" ||
      typeof (item as ChassisLabRecord).versao !== "string" ||
      typeof (item as ChassisLabRecord).ano !== "number")) {
    throw new Error("Historico de testes local invalido. Preserve o backup antes de continuar.");
  }
  const records = parsed as ChassisLabRecord[];
  if (new Set(records.map((item) => item.codigo)).size !== records.length) {
    throw new Error("O historico de testes local possui codigos duplicados.");
  }
  return records;
}

export function salvarRegistroLaboratorio(record: ChassisLabRecord): ChassisLabRecord[] {
  if (!isIdentificadorLaboratorio(record.codigo) || record.codigo === record.chassiReferencia) {
    throw new Error("Identificador de teste invalido ou igual ao original.");
  }
  const existing = lerRegistrosLaboratorio();
  if (existing.length >= CHASSIS_LAB_MAX_RECORDS) {
    throw new Error("Limite de registros locais atingido. Exporte o historico antes de continuar.");
  }
  if (existing.some((item) => item.codigo === record.codigo)) {
    throw new Error("O identificador ja consta no historico local.");
  }
  const next = [record, ...existing];
  window.localStorage.setItem(CHASSIS_LAB_STORAGE_KEY, JSON.stringify(next));
  return next;
}
