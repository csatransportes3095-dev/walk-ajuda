// Utilitários sem dependências para o módulo independente de Transportes.
export const TRANSPORT_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export const TRANSPORT_TYPES = ["carga", "onibus", "escolar", "turismo", "fretamento", "logistica", "taxi", "moto", "aplicativo", "outros"] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const TRANSPORT_TYPE_LABELS: Record<TransportType, string> = {
  carga: "Caminhões / carga",
  onibus: "Ônibus",
  escolar: "Transporte escolar",
  turismo: "Turismo",
  fretamento: "Fretamento",
  logistica: "Logística",
  taxi: "Táxi",
  moto: "Mototransporte",
  aplicativo: "Aplicativo / passageiros",
  outros: "Outros transportes",
};

export function transportDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeTransportCnpj(value: unknown): string {
  const digits = transportDigits(value);
  // Alguns arquivos Excel gravam números sem zero à esquerda.
  return digits.length >= 11 && digits.length <= 14 ? digits.padStart(14, "0") : digits;
}

/** Copia exclusivamente o CNPJ recebido, nunca dados da lista ou de outros cards. */
export async function writeSingleTransportCnpj(
  value: unknown,
  clipboard: { writeText(text: string): Promise<void> },
): Promise<string> {
  const digits = normalizeTransportCnpj(value);
  if (!/^\d{14}$/.test(digits)) throw new Error("CNPJ inválido para copiar");
  if (!clipboard || typeof clipboard.writeText !== "function") throw new Error("Área de transferência indisponível");
  await clipboard.writeText(digits);
  return digits;
}

export function isValidTransportCnpj(value: unknown): boolean {
  const digits = normalizeTransportCnpj(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const dv = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, weight, index) => acc + Number(base[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = dv(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = dv(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === digits.slice(0, 12) + String(first) + String(second);
}

export function formatTransportCnpj(value: unknown): string {
  const s = normalizeTransportCnpj(value);
  return s.length === 14 ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : s;
}

// Aceita a sigla ou o nome completo quando a UF vier explicitamente do cadastro.
const TRANSPORT_UF_NAME_TO_CODE: Record<string, string> = {
  ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA",
  CEARA: "CE", DISTRITO_FEDERAL: "DF", ESPIRITO_SANTO: "ES", GOIAS: "GO",
  MARANHAO: "MA", MATO_GROSSO: "MT", MATO_GROSSO_DO_SUL: "MS",
  MINAS_GERAIS: "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR",
  PERNAMBUCO: "PE", PIAUI: "PI", RIO_DE_JANEIRO: "RJ",
  RIO_GRANDE_DO_NORTE: "RN", RIO_GRANDE_DO_SUL: "RS", RONDONIA: "RO",
  RORAIMA: "RR", SANTA_CATARINA: "SC", SAO_PAULO: "SP",
  SERGIPE: "SE", TOCANTINS: "TO",
};

export function normalizeTransportUf(value: unknown, fallback = "ND"): string {
  const raw = String(value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, "_");
  const uf = TRANSPORT_UF_NAME_TO_CODE[raw] ?? raw;
  return TRANSPORT_UFS.includes(uf as (typeof TRANSPORT_UFS)[number]) ? uf : fallback;
}

export function classifyTransport(value: unknown): TransportType {
  const text = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/escolar|escola|colegio/.test(text)) return "escolar";
  if (/fretamento|fretad|fretador/.test(text)) return "fretamento";
  if (/turism|excurs/.test(text)) return "turismo";
  if (/onibus|rodoviario de passageiro|viacao|coletivo urbano/.test(text)) return "onibus";
  if (/taxi/.test(text)) return "taxi";
  if (/mototaxi|motofrete|motoboy|entrega de moto/.test(text)) return "moto";
  if (/aplicativo|uber|99pop/.test(text)) return "aplicativo";
  if (/logistic|armazenagem|distribuicao/.test(text)) return "logistica";
  if (/transportadora|caminhao|carga|frete|rodoviario de carga|4930/.test(text)) return "carga";
  return "outros";
}
