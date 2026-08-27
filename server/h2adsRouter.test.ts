import { describe, expect, it } from "vitest";
import {
  h2AdsCreateGroupSchema,
  h2AdsCreateInstanceSchema,
  h2AdsCreateWorkerPairingSchema,
  h2AdsAssignWorkerSchema,
  h2AdsGroupStatusSchema,
  h2AdsInstanceStatusSchema,
  h2AdsBrowserManualCommandSchema,
  h2AdsPrepareBrowserSchema,
  h2AdsRevokeWorkerSchema,
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
      expectedIsp: "ISP esperado",
      expectedAsn: "AS12345",
      setupStatus: "metadata_ready",
    });
    expect(profile.success).toBe(true);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready" }).success).toBe(false);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready", proxyUrl: "http://blocked" }).success).toBe(false);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready", browserWSEndpoint: "ws://blocked" }).success).toBe(false);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, setupStatus: "metadata_ready", healthStatus: "healthy" }).success).toBe(false);
    expect(h2AdsSaveNetworkProfileSchema.safeParse({ instanceId: 1, providerName: "edge.example:3128:user:pass", setupStatus: "not_configured" }).success).toBe(false);
  });

  it("aceita credencial somente como entrada protegida e não aceita campos de conexão avulsos", () => {
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyConfig: "edge.example:3128:user:pass" }).success).toBe(true);
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyConfig: "edge.example:3128:user:pass", proxyProtocol: "http" }).success).toBe(true);
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyConfig: "edge.example:3128:user:pass", proxyProtocol: "https" }).success).toBe(true);
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyConfig: "edge.example:3128:user:pass", proxyProtocol: "socks5" }).success).toBe(true);
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyConfig: "edge.example:3128:user:pass", proxyProtocol: "socks4" }).success).toBe(false);
    expect(h2AdsSaveProxyCredentialSchema.safeParse({ instanceId: 1, proxyHost: "edge.example" }).success).toBe(false);
    expect(h2AdsValidateProxySchema.safeParse({ instanceId: 1 }).success).toBe(true);
    expect(h2AdsValidateProxySchema.safeParse({ instanceId: 1, force: true }).success).toBe(false);
  });

  it("aceita apenas pareamento, atribuição e revogação de Workers com identificadores estritos", () => {
    expect(h2AdsCreateWorkerPairingSchema.safeParse({ name: "Computador principal", capacity: 2 }).success).toBe(true);
    expect(h2AdsCreateWorkerPairingSchema.safeParse({ name: "PC", capacity: 0 }).success).toBe(false);
    expect(h2AdsCreateWorkerPairingSchema.safeParse({ name: "PC", capacity: 21 }).success).toBe(false);
    expect(h2AdsCreateWorkerPairingSchema.safeParse({ name: "PC", capacity: 1, token: "não permitido" }).success).toBe(false);
    expect(h2AdsAssignWorkerSchema.safeParse({ instanceId: 1, workerId: 2 }).success).toBe(true);
    expect(h2AdsAssignWorkerSchema.safeParse({ instanceId: 1, workerId: 2, browserWSEndpoint: "ws://blocked" }).success).toBe(false);
    expect(h2AdsRevokeWorkerSchema.safeParse({ workerId: 2 }).success).toBe(true);
  });

  it("aceita preparação somente pelo identificador da instância", () => {
    expect(h2AdsPrepareBrowserSchema.safeParse({ instanceId: 1 }).success).toBe(true);
    expect(h2AdsPrepareBrowserSchema.safeParse({ instanceId: 1, proxyUrl: "http://blocked" }).success).toBe(false);
    expect(h2AdsPrepareBrowserSchema.safeParse({ instanceId: 1, launch: true }).success).toBe(false);
  });

  it("aceita abertura e encerramento somente pelo identificador da instância", () => {
    expect(h2AdsBrowserManualCommandSchema.safeParse({ instanceId: 1 }).success).toBe(true);
    expect(h2AdsBrowserManualCommandSchema.safeParse({ instanceId: 1, url: "https://blocked.example" }).success).toBe(false);
    expect(h2AdsBrowserManualCommandSchema.safeParse({ instanceId: 1, script: "não permitido" }).success).toBe(false);
  });
});
