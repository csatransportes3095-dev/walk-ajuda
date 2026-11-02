import { z } from "zod";
import { classifyTransport, isValidTransportCnpj, normalizeTransportCnpj, normalizeTransportUf, TRANSPORT_TYPES } from "../shared/transportes";

// A planilha costuma trazer "4930-2/02 - Transporte rodoviário de carga".
// Aceitar a descrição inteira no payload e armazenar o código na coluna VARCHAR(32).
export const transportInputItem = z.object({
  cnpj: z.string().max(60),
  name: z.string().trim().max(2000).default(""),
  type: z.enum(TRANSPORT_TYPES).optional(),
  uf: z.string().max(30).optional(),
  city: z.string().max(1000).optional(),
  cnae: z.string().max(3000).optional(),
  source: z.string().max(1500).optional(),
  notes: z.string().max(5000).optional(),
  isUsed: z.boolean().optional(),
});

export type TransportInputItem = z.infer<typeof transportInputItem>;

export function normalizeTransportCnae(rawValue: unknown): string {
  const raw = String(rawValue ?? "").trim();
  const code = raw.match(/\b\d{4}[-.]?\d\/?\d{2}\b/);
  return (code ? code[0] : raw).slice(0, 32);
}

export function normalizeTransportStorageFields(input: TransportInputItem, defaultSource: string) {
  const nameRaw = input.name.trim();
  const cityRaw = String(input.city || "").trim();
  const cnaeRaw = String(input.cnae || "").trim();
  const cnae = normalizeTransportCnae(cnaeRaw);
  const extraNotes = [
    nameRaw.length > 255 ? "Razão social completa: " + nameRaw : "",
    cityRaw.length > 160 ? "Município informado: " + cityRaw : "",
    cnaeRaw && cnaeRaw !== cnae ? "CNAE original: " + cnaeRaw : "",
  ].filter(Boolean).join(" | ");
  const notes = [String(input.notes || "").trim(), extraNotes].filter(Boolean).join(" | ").slice(0, 5000);
  const cnpj = normalizeTransportCnpj(input.cnpj);
  return {
    cnpj,
    name: (nameRaw || "NOME NÃO INFORMADO").slice(0, 255),
    type: input.type || classifyTransport(nameRaw || cnaeRaw),
    uf: normalizeTransportUf(input.uf),
    city: cityRaw.slice(0, 160),
    cnae,
    source: (input.source || defaultSource).trim().slice(0, 1500),
    notes,
    isUsed: input.isUsed ? 1 : 0,
    checksumOk: isValidTransportCnpj(cnpj) ? 1 : 0,
  };
}
