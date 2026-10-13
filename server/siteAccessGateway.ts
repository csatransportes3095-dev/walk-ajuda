import type { Request, RequestHandler } from "express";
import { isAdminJwtValid } from "./_core/trpc";
import { authorizedSiteVisitor } from "./siteAccessIdentity";
import { readSiteAccessMode } from "./siteSecurityRouter";
import { isAdministrationPath, isPublicFrontendAsset, isSecurityPublicPath, safeReturnUrl, siteAccessDecision, type SiteAccessMode } from "./siteAccessPolicy";

/**
 * Barrier for requests to the origin, before registration of any business routes.
 * Disabled until H2_SITE_ACCESS_ENFORCE=true and the additive DB migration is verified.
 * Never uses user-controlled X-Forwarded-* as proof of identity.
 */
export interface SiteGatewayDependencies {
  enabled(): boolean;
  mode(): Promise<SiteAccessMode>;
  isAdmin(req: Request): boolean;
  visitor(req: Request): Promise<boolean>;
}
const defaults: SiteGatewayDependencies = {
  enabled: () => process.env.H2_SITE_ACCESS_ENFORCE === "true",
  mode: readSiteAccessMode,
  isAdmin: req => isAdminJwtValid(req as Parameters<typeof isAdminJwtValid>[0]),
  visitor: authorizedSiteVisitor,
};
function setNoStore(res: Parameters<RequestHandler>[1]) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
  res.setHeader("Vary", "Cookie");
}
function isApi(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}
function htmlPage(title: string, message: string, link = "") {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    title + ' - H2 Colombiano</title><style>body{background:#070b18;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px;text-align:center}section{max-width:420px;border:1px solid #eab30855;padding:28px;border-radius:18px;background:#131827}a{color:#facc15}</style></head><body><section><h1>' +
    title + '</h1><p>' + message + '</p>' + link + '</section></body></html>';
}
export function createSiteAccessGateway(deps: SiteGatewayDependencies = defaults): RequestHandler {
  return async (req,res,next) => {
    try {
      if (!deps.enabled()) return next();
      const pathname = req.path;
      // These are explicitly public or independently authenticated routes.
      if (isAdministrationPath(pathname) || isSecurityPublicPath(pathname) || isPublicFrontendAsset(pathname)) return next();
      const admin = deps.isAdmin(req);
      if (admin) return next();

      let mode: SiteAccessMode;
      try { mode = await deps.mode(); }
      catch (error) {
        console.error("[SiteGateway] Cannot check site mode:", error instanceof Error ? error.message : String(error));
        setNoStore(res);
        if (isApi(pathname)) return res.status(503).json({ error: "SITE_ACCESS_UNAVAILABLE" });
        return res.status(503).type("html").send(htmlPage("Acesso temporariamente indisponível", "Tente novamente em alguns instantes."));
      }
      if (mode === "public") return next();
      let visitor = false;
      if (mode === "restricted") {
        try { visitor = await deps.visitor(req); }
        catch { visitor = false; }
      }
      const decision = siteAccessDecision({mode,pathname,hasAdminSession:admin,hasAuthorizedSession:visitor});
      if (decision === "allow") return next();
      setNoStore(res);
      if (decision === "deny") {
        if (isApi(pathname)) return res.status(403).json({error:"SITE_BLOCKED"});
        return res.status(403).type("html").send(htmlPage("Acesso bloqueado", "O site não está disponível ao público neste momento."));
      }
      if (isApi(pathname)) return res.status(403).json({error:"SITE_RESTRICTED",loginUrl:"/site-access"});
      if (req.method !== "GET" && req.method !== "HEAD") return res.status(403).type("html").send(htmlPage("Acesso restrito", "Faça sua identificação para continuar.",'<p><a href="/site-access">Entrar</a></p>'));
      const nextUrl = safeReturnUrl(req.originalUrl);
      return res.redirect(302,"/site-access?next="+encodeURIComponent(nextUrl));
    } catch (error) {
      console.error("[SiteGateway] Unhandled error:", error instanceof Error ? error.message : String(error));
      if (res.headersSent) return next(error);
      setNoStore(res);
      return res.status(503).json({error:"SITE_ACCESS_UNAVAILABLE"});
    }
  };
}
