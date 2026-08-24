export const MAINTENANCE_ROUTE_OPTIONS = [
  { id: "home", label: "Página inicial", path: "/" },
  { id: "login", label: "Login", path: "/login" },
  { id: "loan", label: "Empréstimo", path: "/emprestimo" },
  { id: "gastos", label: "Gastos", path: "/gastos" },
  { id: "tracking", label: "Acompanhar", path: "/acompanhar" },
] as const;

export type MaintenanceRouteId = (typeof MAINTENANCE_ROUTE_OPTIONS)[number]["id"];

export type MaintenanceManifestConfig = {
  enabled: boolean;
  routeIds: MaintenanceRouteId[];
  eyebrow: string;
  title: string;
  message: string;
  startsAt: string;
  expectedReturnAt: string;
};

export const DEFAULT_MAINTENANCE_MANIFEST: MaintenanceManifestConfig = {
  enabled: false,
  routeIds: ["home", "login", "loan", "gastos", "tracking"],
  eyebrow: "COMUNICADO OPERACIONAL",
  title: "Estamos em manutenção programada",
  message: "Estamos aprimorando esta área para oferecer uma experiência mais rápida e segura. Volte em breve.",
  startsAt: "",
  expectedReturnAt: "",
};

const VALID_ROUTE_IDS = new Set<string>(MAINTENANCE_ROUTE_OPTIONS.map((route) => route.id));

function safeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

export function parseMaintenanceManifest(raw?: string | null): MaintenanceManifestConfig {
  if (!raw) return { ...DEFAULT_MAINTENANCE_MANIFEST, routeIds: [...DEFAULT_MAINTENANCE_MANIFEST.routeIds] };
  try {
    const parsed = JSON.parse(raw) as Partial<MaintenanceManifestConfig>;
    const routeIds = Array.isArray(parsed.routeIds)
      ? parsed.routeIds.filter((routeId): routeId is MaintenanceRouteId => typeof routeId === "string" && VALID_ROUTE_IDS.has(routeId))
      : [...DEFAULT_MAINTENANCE_MANIFEST.routeIds];
    return {
      enabled: parsed.enabled === true,
      routeIds,
      eyebrow: safeText(parsed.eyebrow, DEFAULT_MAINTENANCE_MANIFEST.eyebrow, 64),
      title: safeText(parsed.title, DEFAULT_MAINTENANCE_MANIFEST.title, 120),
      message: safeText(parsed.message, DEFAULT_MAINTENANCE_MANIFEST.message, 600),
      startsAt: typeof parsed.startsAt === "string" ? parsed.startsAt.slice(0, 32) : "",
      expectedReturnAt: typeof parsed.expectedReturnAt === "string" ? parsed.expectedReturnAt.slice(0, 32) : "",
    };
  } catch {
    return { ...DEFAULT_MAINTENANCE_MANIFEST, routeIds: [...DEFAULT_MAINTENANCE_MANIFEST.routeIds] };
  }
}

export function maintenanceRouteIdForPath(pathname: string): MaintenanceRouteId | null {
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/login") return "login";
  if (path === "/emprestimo") return "loan";
  if (path === "/gastos") return "gastos";
  if (path === "/acompanhar") return "tracking";
  return null;
}

export function isMaintenanceManifestActiveForPath(config: MaintenanceManifestConfig, pathname: string) {
  const routeId = maintenanceRouteIdForPath(pathname);
  return config.enabled && routeId !== null && config.routeIds.includes(routeId);
}
