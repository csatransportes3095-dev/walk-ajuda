/** All decisions are made on the server. The React UI is never the security boundary. */
export type SiteAccessMode = "public" | "restricted" | "blocked";
export type SiteAccessDecision = "allow" | "challenge" | "deny";

export function isAdministrationPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Visitor entry is open only in Public and Restricted, never Blocked. */
export function isSiteVisitorEntryPath(pathname: string): boolean {
  return pathname === "/site-access" ||
    pathname === "/api/site-access/request" ||
    pathname === "/api/site-access/verify" ||
    pathname === "/api/site-access/session" ||
    pathname === "/api/site-access/logout";
}

export function isSecurityPublicPath(pathname: string): boolean {
  // No generic /api bypass: only exact minimal routes.
  if (pathname === "/api/ping") return true;
  // Device endpoints each verify an independent per-device secret or single-use code.
  if (pathname === "/api/h2-auto/pair" || pathname === "/api/h2-auto/config" || pathname === "/api/h2-auto/ack") return true;
  if (isSiteVisitorEntryPath(pathname)) return true;
  if (/^\/api\/trpc\/adminAuth\.(login|check|setup|unlock|requestUnlock|logout)$/.test(pathname)) return true;
  // Scripts and worker APIs are governed by H2ADS' own existing authentication.
  if (pathname.startsWith("/api/h2ads/worker/")) return true;
  return false;
}

export function isPublicFrontendAsset(pathname: string): boolean {
  if (/^\/assets\/[^/]+\.(js|css|woff2?|png|webp|svg|ico)$/.test(pathname)) return true;
  if (/^\/(manifest(?:-admin)?\.json|manifest\.webmanifest|favicon(?:-[\w-]+)?\.(?:png|ico)|apple-touch-icon(?:-[\w-]+)?\.png|robots\.txt)$/.test(pathname)) return true;
  if (/^\/(h2-brand-[\w-]+\.png|icons\/[\w.-]+)$/.test(pathname)) return true;
  return false;
}

export function siteAccessDecision(input: {
  mode: SiteAccessMode;
  pathname: string;
  hasAdminSession: boolean;
  hasAuthorizedSession: boolean;
}): SiteAccessDecision {
  if (input.mode === "public") return "allow";
  if (isAdministrationPath(input.pathname)) return "allow";
  if (isPublicFrontendAsset(input.pathname)) return "allow";
  if (isSecurityPublicPath(input.pathname) && !isSiteVisitorEntryPath(input.pathname)) return "allow";
  if (input.hasAdminSession) return "allow";
  if (input.mode === "blocked") return "deny";
  if (isSiteVisitorEntryPath(input.pathname)) return "allow";
  return input.hasAuthorizedSession ? "allow" : "challenge";
}

export function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\r") || value.includes("\n")) return "/";
  if (value.startsWith("/admin") || value.startsWith("/api/")) return "/";
  return value;
}
