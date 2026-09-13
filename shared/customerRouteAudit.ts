export type CustomerRouteAuditTarget = {
  tracked: boolean;
  routeKey: string;
  areaName: string;
};

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

  if (path === "/" || path === "/bot" || path === "/login" || path.startsWith("/r/")) {
    return { tracked: true, routeKey: "/", areaName: "Fazer pedido" };
  }
  if (path === "/acompanhar") return { tracked: true, routeKey: "/acompanhar", areaName: "Acompanhar pedido" };
  if (path === "/gastos") return { tracked: true, routeKey: "/gastos", areaName: "Gastos" };
  if (path === "/emprestimo") return { tracked: true, routeKey: "/emprestimo", areaName: "Empréstimos" };
  if (path === "/cartoes" || path.startsWith("/cartoes/")) return { tracked: true, routeKey: "/cartoes/*", areaName: "Cartões" };
  if (path === "/foto") return { tracked: true, routeKey: "/foto", areaName: "Foto" };
  if (path === "/sorteio") return { tracked: true, routeKey: "/sorteio", areaName: "Sorteio" };
  if (path === "/vip" || path === "/parcelas-vip") return { tracked: true, routeKey: "/vip", areaName: "VIP" };
  if (path === "/ajuda") return { tracked: true, routeKey: "/ajuda", areaName: "Ajuda" };
  if (path === "/atualizarcadastro") return { tracked: true, routeKey: "/atualizarcadastro", areaName: "Atualizar cadastro" };
  if (path === "/pre-cadastro") return { tracked: true, routeKey: "/pre-cadastro", areaName: "Pré-cadastro" };
  if (path === "/consultar-cadastro") return { tracked: true, routeKey: "/consultar-cadastro", areaName: "Consultar cadastro" };
  if (path === "/tutorial" || path.startsWith("/video/")) return { tracked: true, routeKey: "/tutorial", areaName: "Tutorial" };
  if (path === "/app" || path === "/app-pro") return { tracked: true, routeKey: "/app", areaName: "Aplicativo H2" };
  if (path.startsWith("/agendar/")) return { tracked: true, routeKey: "/agendar/:token", areaName: "Agendar atendimento" };
  if (path.startsWith("/orcamento/")) return { tracked: true, routeKey: "/orcamento/:publicToken", areaName: "Orçamento" };
  if (path.startsWith("/recibo/")) return { tracked: true, routeKey: "/recibo/:publicToken", areaName: "Recibo" };

  const firstSegment = path.split("/").filter(Boolean)[0] || "";
  if (!firstSegment) return { tracked: true, routeKey: "/", areaName: "Fazer pedido" };
  return {
    tracked: true,
    routeKey: `/${firstSegment}`,
    areaName: formatSegmentAsArea(firstSegment),
  };
}
