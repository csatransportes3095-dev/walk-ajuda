import { beforeEach, describe, expect, it } from "vitest";
import { decryptH2AdsProxy, encryptH2AdsProxy, isH2AdsProxyEncryptionReady, parseH2AdsProxyInput, proxyCredentialSummary } from "./h2adsProxySecurity";
import { getH2AdsRouteMismatches, resolvePublicProxyAddress } from "./h2adsProxyValidation";

describe("segurança da configuração de proxy H2 Ads", () => {
  beforeEach(() => {
    process.env.H2ADS_PROXY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("informa somente se a chave de cifra está pronta, sem devolver seu valor", () => {
    expect(isH2AdsProxyEncryptionReady()).toBe(true);
    delete process.env.H2ADS_PROXY_ENCRYPTION_KEY;
    expect(isH2AdsProxyEncryptionReady()).toBe(false);
  });

  it("aceita uma chave aleatória longa gerada pelo Render e deriva uma chave AES de 32 bytes", () => {
    process.env.H2ADS_PROXY_ENCRYPTION_KEY = "render_generated_random_value_for_h2ads_123456789";
    const parsed = parseH2AdsProxyInput("edge.example:3128:user_test:pass_test");
    expect(isH2AdsProxyEncryptionReady()).toBe(true);
    expect(decryptH2AdsProxy(encryptH2AdsProxy(parsed))).toEqual(parsed);
  });

  it("interpreta o formato permitido e cifra sem manter texto aberto", () => {
    const input = ["edge.example", "3128", "user_test", "pass_test"].join(":");
    const parsed = parseH2AdsProxyInput(input);
    const encrypted = encryptH2AdsProxy(parsed);
    expect(encrypted).not.toContain(input);
    expect(encrypted).not.toContain(parsed.password);
    expect(decryptH2AdsProxy(encrypted)).toEqual(parsed);
    expect(proxyCredentialSummary()).toBe("Credencial protegida");
  });

  it("rejeita formato inválido e destinos de rede local", async () => {
    expect(() => parseH2AdsProxyInput("invalid")).toThrow("Formato de proxy inválido");
    await expect(resolvePublicProxyAddress("127.0.0.1")).rejects.toThrow("não é público");
  });

  it("identifica divergências sem expor dados de autenticação", () => {
    const mismatches = getH2AdsRouteMismatches(
      { ip: "198.51.100.10", countryCode: "US", city: "Test City", asn: "AS64500", isp: "Test ISP", latencyMs: 120 },
      { targetCountryCode: "BR", expectedIsp: "Other ISP", expectedAsn: "AS64501" },
    );
    expect(mismatches).toEqual(["país", "ISP", "ASN"]);
  });
});
