/**
 * Consulta WMI brasileiro somente leitura, separada de geração de VIN.
 * Referências: https://vpic.nhtsa.dot.gov/api/ e https://viacircular.com.br/chassis/
 * Um prefixo WMI NÃO certifica chassi, veículo, modelo ou ano.
 */
export type ReferenciaWmi = Readonly<{
  prefixo: string;
  fabricante: string;
  grupo: "revisado" | "identificacao";
}>;

/** As quatro referências corrigidas para CONSULTA (nunca para a geração sintética). */
export const REFERENCIAS_WMI_REVISADAS = [
  { prefixo: "9BD", fabricante: "Fiat", grupo: "revisado" },
  { prefixo: "93Y", fabricante: "Renault", grupo: "revisado" },
  { prefixo: "94D", fabricante: "Nissan", grupo: "revisado" },
  { prefixo: "936", fabricante: "Peugeot", grupo: "revisado" },
] as const satisfies readonly ReferenciaWmi[];

/** Identificação dos prefixos anteriormente associados a marcas erradas. */
export const PREFIXOS_WMI_DISTINTOS = [
  { prefixo: "9BS", fabricante: "Scania", grupo: "identificacao" },
  { prefixo: "9BM", fabricante: "Mercedes-Benz", grupo: "identificacao" },
  { prefixo: "9BN", fabricante: "Mafersa", grupo: "identificacao" },
  { prefixo: "935", fabricante: "Citroën", grupo: "identificacao" },
] as const satisfies readonly ReferenciaWmi[];

export const REFERENCIAS_WMI_BRASIL: readonly ReferenciaWmi[] = [
  ...REFERENCIAS_WMI_REVISADAS,
  ...PREFIXOS_WMI_DISTINTOS,
];

export function extrairPrefixoWmi(entrada: string | null | undefined): string | null {
  const limpa = String(entrada ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  if (limpa.length < 3 || limpa.length > 17) return null;
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(limpa)) return null;
  return limpa.slice(0, 3);
}

/** Indica apenas o fabricante de referência dos três caracteres iniciais. */
export function consultarFabricanteWmi(entrada: string | null | undefined): ReferenciaWmi | null {
  const prefixo = extrairPrefixoWmi(entrada);
  return prefixo ? REFERENCIAS_WMI_BRASIL.find(item => item.prefixo === prefixo) ?? null : null;
}
