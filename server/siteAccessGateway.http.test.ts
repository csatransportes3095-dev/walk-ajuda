import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createSiteAccessGateway, type SiteGatewayDependencies } from "./siteAccessGateway";
import type { SiteAccessMode } from "./siteAccessPolicy";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

async function probe(mode: SiteAccessMode, path: string, opts: {
  method?: string;
  enabled?: boolean;
  admin?: boolean;
  visitor?: boolean;
  failMode?: boolean;
} = {}) {
  const app = express();
  const deps: SiteGatewayDependencies = {
    enabled: () => opts.enabled !== false,
    mode: async () => {if (opts.failMode) throw Error("test database failure"); return mode;},
    isAdmin: () => !!opts.admin,
    visitor: async () => !!opts.visitor,
  };
  app.use(createSiteAccessGateway(deps));
  app.all("*", (_req, res) => res.status(200).json({ok:true}));
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("No socket");
  const res = await fetch("http://127.0.0.1:" + addr.port + path, {method: opts.method || "GET", redirect:"manual"});
  const body = await res.text();
  return {status:res.status,location:res.headers.get("location"),cache:res.headers.get("cache-control"),body};
}
describe("Segurança do Site - integration via isolated HTTP server",()=>{
  it("disabled flag leaves all existing routes unchanged",async()=>{
    for(const mode of ["restricted","blocked"] as const)
      expect((await probe(mode,"/api/trpc/products.listActive",{enabled:false})).status).toBe(200);
  });
  it("public mode preserves site pages and API",async()=>{
    for(const path of ["/","/acompanhar","/api/trpc/products.listActive","/api/upload/client-file"])
      expect((await probe("public",path)).status).toBe(200);
  });
  it("restricted mode redirects visitor HTML and denies unverified APIs",async()=>{
    const page=await probe("restricted","/acompanhar?tab=1");
    expect(page.status).toBe(302);
    expect(page.location).toBe("/site-access?next=%2Facompanhar%3Ftab%3D1");
    for(const path of ["/api/trpc/products.listActive","/api/upload/client-file"]) {
      const api=await probe("restricted",path);
      expect(api.status).toBe(403);
      expect(api.body).toContain("SITE_RESTRICTED");
    }
  });
  it("blocked denies unauthenticated pages, API, and visitor OTP",async()=>{
    for(const path of ["/","/acompanhar","/site-access","/api/site-access/request","/api/site-access/verify","/api/trpc/products.listActive"]){
      const result=await probe("blocked",path);
      expect(result.status).toBe(403);
      expect(result.cache).toContain("no-store");
    }
  });
  it("authenticated site guest can enter restricted but not blocked",async()=>{
    expect((await probe("restricted","/acompanhar",{visitor:true})).status).toBe(200);
    expect((await probe("blocked","/acompanhar",{visitor:true})).status).toBe(403);
  });
  it("owner can reach APIs to revert blocked mode",async()=>{
    expect((await probe("blocked","/api/trpc/siteSecurity.setMode",{admin:true,method:"POST"})).status).toBe(200);
    expect((await probe("blocked","/admin/codes")).status).toBe(200);
    expect((await probe("blocked","/api/trpc/adminAuth.login",{method:"POST"})).status).toBe(200);
  });
  it("workers still use their pre-existing own authentication",async()=>{
    expect((await probe("blocked","/api/h2ads/worker/heartbeat")).status).toBe(200);
    expect((await probe("blocked","/api/h2ads/administration")).status).toBe(403);
  });
  it("database failure fails closed for restricted and blocked",async()=>{
    for(const mode of ["restricted","blocked"] as const){
      const result=await probe(mode,"/api/trpc/products.listActive",{failMode:true});
      expect(result.status).toBe(503);
    }
  });
});
