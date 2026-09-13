export type CustomerRouteAuditTarget = {
  tracked: boolean;
  routeKey: string;
  areaName: string;
};

export const SAME_ROUTE_NOTIFY_INTERVAL_MS = 30 * 60 * 1000;

function normalizePathname(pathname: string): string {
  const value = String(pathname || "/").split("?")[0]?.split("#")[0] || "/";
  const withPrefix = value.startsWith("/") ? value : `/${value}`;
  const lowered = withPrefix.toLowerCase();
  if (lowered === "/") return "/";
  return lowered.replace(/\/+$/, "") || "/";
}

function formatSegmentAsArea(segment: string): string {
  const normalized = segment
    .replace(/[^a-z0-9-]/gi, "")
    .replace(/-+/g, " ")
    .trim();
  if (!normalized) return "Área do cliente";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sanitizeDynamicRoute(path: string): string {
  if (path.startsWith("/agendar/")) return "/agendar/:token";
  if (path.startsWith("/orcamento/")) return "/orcamento/:publicToken";
  if (path.startsWith("/recibo/")) return "/recibo/:publicToken";
  return path;
}

export function getCustomerRouteAuditTarget(pathname: string): CustomerRouteAuditTarget {
  const path = normalizePathname(pathname);

  if (
    path === "/admin/login" ||
    path.startsWith("/admin/") ||
    path.startsWith("/h2ads") ||
    path === "/revendedor" ||
    path.startsWith("/revendedor/")
  ) {
    return { tracked: false, routeKey: "", areaName: "" };
  }

  const routeKey = sanitizeDynamicRoute(path);

  if (path === "/" || path === "/bot" || path === "/login" || path.startsWith("/r/")) {
    return { tracked: true, routeKey, areaName: "Fazer pedido" };
  }
  if (path === "/acompanhar") return { tracked: true, routeKey, areaName: "Acompanhar pedido" };
  if (path === "/gastos") return { tracked: true, routeKey, areaName: "Gastos" };
  if (path === "/emprestimo") return { tracked: true, routeKey, areaName: "Empréstimos" };
  if (path === "/cartoes" || path.startsWith("/cartoes/")) return { tracked: true, routeKey, areaName: "Cartões" };
  if (path === "/foto") return { tracked: true, routeKey, areaName: "Foto" };
  if (path === "/sorteio") return { tracked: true, routeKey, areaName: "Sorteio" };
  if (path === "/vip" || path === "/parcelas-vip") return { tracked: true, routeKey, areaName: "VIP" };
  if (path === "/ajuda") return { tracked: true, routeKey, areaName: "Ajuda" };
  if (path === "/atualizarcadastro") return { tracked: true, routeKey, areaName: "Atualizar cadastro" };
  if (path === "/pre-cadastro") return { tracked: true, routeKey, areaName: "Pré-cadastro" };
  if (path === "/consultar-cadastro") return { tracked: true, routeKey, areaName: "Consultar cadastro" };
  if (path === "/tutorial" || path.startsWith("/video/")) return { tracked: true, routeKey, areaName: "Tutorial" };
  if (path === "/app" || path === "/app-pro") return { tracked: true, routeKey, areaName: "Aplicativo H2" };
  if (path.startsWith("/agendar/")) return { tracked: true, routeKey, areaName: "Agendar atendimento" };
  if (path.startsWith("/orcamento/")) return { tracked: true, routeKey, areaName: "Orçamento" };
  if (path.startsWith("/recibo/")) return { tracked: true, routeKey, areaName: "Recibo" };

  const firstSegment = path.split("/").filter(Boolean)[0] || "";
  if (!firstSegment) return { tracked: true, routeKey, areaName: "Fazer pedido" };
  return {
    tracked: true,
    routeKey,
    areaName: formatSegmentAsArea(firstSegment),
  };
}

export function shouldNotifyForRouteAudit(input: {
  previousRouteKey: string;
  nextRouteKey: string;
  lastNotifiedAt: Date | null;
  now: Date;
}) {
  const routeChanged = input.previousRouteKey !== input.nextRouteKey;
  const isFirstTrackedRoute = !input.previousRouteKey;
  const shouldNotifyByInterval = !routeChanged
    && !!input.lastNotifiedAt
    && input.now.getTime() - input.lastNotifiedAt.getTime() >= SAME_ROUTE_NOTIFY_INTERVAL_MS;
  return {
    routeChanged,
    shouldNotify: routeChanged || isFirstTrackedRoute || shouldNotifyByInterval,
  };
}
