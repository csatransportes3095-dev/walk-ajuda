import { describe, expect, it } from "vitest";
import {
  h2AdsCreateGroupSchema,
  h2AdsCreateInstanceSchema,
  h2AdsGroupStatusSchema,
  h2AdsInstanceStatusSchema,
  h2AdsSaveProxyCredentialSchema,
  h2AdsSaveNetworkProfileSchema,
  h2AdsValidateProxySchema,
  h2AdsUpdateGroupSchema,
  h2AdsUpdateInstanceSchema,
} from "./routers/h2ads";

describe("contrato administrativo H2 Ads", () => {
  it("aceita apenas os estados administrativos da base isolada", () => {
    expect(h2AdsGroupStatusSchema.safeParse("active").success).toBe(true);
    expect(h2AdsGroupStatusSchema.safeParse("archived").success).toBe(true);
    expect(h2AdsInstanceStatusSchema.safeParse("draft").success).toBe(true);
    expect(h2AdsInstanceStatusSchema.safeParse("paused").success).toBe(true);
    expect(h2AdsInstanceStatusSchema.safeParse("ready").success).toBe(false);
  });

  it("valida grupos e instâncias e rejeita campos de proxy ou browser", () => {
    expect(h2AdsCreateGroupSchema.safeParse({ name: "Operação São Paulo" }).success).toBe(true);
    expect(h2AdsCreateInstanceSchema.safeParse({ groupId: 1, name: "Instância 01" }).success).toBe(true);
    expect(h2AdsCreateInstanceSchema.safeParse({ groupId: 1, name: "Instância 01", proxyUrl: "http://blocked" }).success).toBe(false);
    expect(h2AdsCreateInstanceSchema.safeParse({ groupId: 1, name: "Instância 01", browserWSEndpoint: "ws://blocked" }).success).toBe(false);
  });

  it("exige alterações explícitas ao atualizar", () => {
    expect(h2AdsUpdateGroupSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(h2AdsUpdateInstanceSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(h2AdsUpdateInstanceSchema.safeParse({ id: 1, status: "paused" }).success).toBe(true);
  });

  it("aceita somente metadados administrativos de conectividade", () => {
    const profile = h2AdsSaveNetworkProfileSchema.safeParse({
      instanceId: 1,
      providerName: "Fornecedor autorizado",
      routeLabel: "Rota SP 01",
      targetCountryCode: "br",
      targetCity: "São Paulo",
      expectedIsp: "ISP esperado",
      expectedAsn: "AS12345",
      setupStatus: "metadata_ready",
    });
    expect(profile.success).toBe(true);
    if (profile.success) expect(profile.data.targetCountryCode).toBe("BR");
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready" }).success).toBe(false);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready", proxyUrl: "http://blocked" }).success).toBe(false);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready", browserWSEndpoint: "ws://blocked" }).success).toBe(false);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready", healthStatus: "healthy" }).success).toBe(false);
  });

  it("aceita credencial somente como entrada protegida e não aceita campos de conexão avulsos", () => {
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyConfig: "edge.example:3128:user:pass" }).success).toBe(true);
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyHost: "edge.example" }).success).toBe(false);
    expect(h2AdsValidateProxySchema.safeParse({ instanceId: 1 }).success).toBe(true);
    expect(h2AdsValidateProxySchema.safeParse({ instanceId: 1, force: true }).success).toBe(false);
  });
});
