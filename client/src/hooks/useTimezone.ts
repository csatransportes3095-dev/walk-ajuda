import { trpc } from "@/lib/trpc";

// Fusos disponíveis para seleção no admin
export const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo",    label: "São Paulo / Brasília (UTC-3)" },
  { value: "America/Manaus",       label: "Manaus (UTC-4)" },
  { value: "America/Rio_Branco",   label: "Rio Branco (UTC-5)" },
  { value: "America/Noronha",      label: "Fernando de Noronha (UTC-2)" },
  { value: "America/New_York",     label: "Nova York (UTC-4/-5)" },
  { value: "America/Chicago",      label: "Chicago (UTC-5/-6)" },
  { value: "America/Denver",       label: "Denver (UTC-6/-7)" },
  { value: "America/Los_Angeles",  label: "Los Angeles (UTC-7/-8)" },
  { value: "Europe/Lisbon",        label: "Lisboa (UTC+0/+1)" },
  { value: "UTC",                  label: "UTC (UTC+0)" },
];

// Fuso padrão caso não haja configuração salva
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * Formata uma data/timestamp usando o fuso horário configurado no sistema.
 * @param value - Date, number (ms), ou string ISO
 * @param timezone - fuso horário (ex: "America/Sao_Paulo")
 * @param includeTime - se deve incluir hora (padrão: true)
 */
export function formatWithTimezone(
  value: Date | number | string | null | undefined,
  timezone: string,
  includeTime = true
): string {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value)
    : typeof value === "string" ? new Date(value)
    : value;
  if (isNaN(date.getTime())) return "—";
  try {
    if (includeTime) {
      return date.toLocaleString("pt-BR", {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } else {
      return date.toLocaleDateString("pt-BR", {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  } catch {
    // Fallback manual com offset fixo de SP (-3h)
    const offset = -3 * 60;
    const local = new Date(date.getTime() + offset * 60 * 1000);
    if (includeTime) {
      return local.toISOString().replace("T", " ").replace("Z", "").slice(0, 19)
        .replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1");
    } else {
      return local.toISOString().slice(0, 10).replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1");
    }
  }
}

/**
 * Hook que retorna o fuso horário configurado e uma função de formatação.
 */
export function useTimezone() {
  const configQuery = trpc.config.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // cache por 5 minutos
  });
  const timezone = configQuery.data?.["timezone"] || DEFAULT_TIMEZONE;

  const fmt = (value: Date | number | string | null | undefined, includeTime = true) =>
    formatWithTimezone(value, timezone, includeTime);

  return { timezone, fmt, isLoading: configQuery.isLoading };
}
