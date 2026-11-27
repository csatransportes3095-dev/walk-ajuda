import fs from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path:string) => fs.readFileSync(path,"utf8");
const pool=read("server/h2adsProxyPool.ts");
const auto=read("server/h2adsAutoProvisioning.ts");
const router=read("server/routers/h2ads.ts");
const card=read("client/src/components/OrderH2AdsBrowserShortcut.tsx");
describe("recuperação de provisionamento inicial H2ADS", () => {
  it("serializa reserva inicial e reutiliza exclusivamente a reserva existente", () => {
    const block=pool.slice(pool.indexOf("export async function reserveInitialH2AdsProxyForInstance"),pool.indexOf("export async function reserveH2AdsProxyForInstance"));
    expect(block).toContain("db.transaction");
    expect(block).toContain('.for("update")');
    expect(block).toContain("eq(h2AdsProxyPool.assignedInstanceId, instanceId)");
    expect(block).toContain('previous.status === "assigned"');
    expect(block).toContain('return { status: "previous_failure" }');
    expect(block.indexOf('return { status: "previous_failure" }')).toBeLessThan(block.indexOf('eq(h2AdsProxyPool.status, "available")'));
  });
  it("reutiliza a credencial e a atribuição existentes, sem mudar rota rejeitada", () => {
    expect(auto).toContain("resolveProvisionWorker(instanceId)");
    expect(auto).toContain("getH2AdsProxyCredential(instanceId)");
    expect(auto).toContain("reserveInitialH2AdsProxyForInstance(instanceId)");
    expect(auto).toContain("await validateH2AdsGoogleAccess(candidate)");
    expect(auto).toContain("await requestH2AdsBrowserPreparation(instanceId)");
    expect(auto).toContain('reservation.status === "previous_failure"');
    expect(auto).toContain('run?.state === "browser_open"');
    expect(auto).toContain("assertH2AdsInstanceNotDeleting(instanceId)");
  });
  it("exige o vínculo exato do pedido e chama recuperação do próprio card", () => {
    expect(router).toContain("resumeOrderProvisioning: adminProcedure");
    expect(router).toContain("link.instanceId === input.instanceId && link.registrationId === input.registrationId && link.subOrderIndex === input.subOrderIndex");
    expect(card).toContain("resumeOrderProvisioning.mutateAsync");
    expect(card).toContain("CONCLUIR CONFIGURAÇÃO");
    expect(card).toContain("previousRouteRejected");
    expect(card).toContain("disabled={!readyToOpen || pending}");
  });
});
