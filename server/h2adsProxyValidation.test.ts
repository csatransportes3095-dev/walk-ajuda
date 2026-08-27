import { beforeEach, describe, expect, it, vi } from "vitest";

const { axiosGet, lookup, socksProxyAgent } = vi.hoisted(() => ({ axiosGet: vi.fn(), lookup: vi.fn(), socksProxyAgent: vi.fn() }));

vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("node:dns/promises", () => ({ default: { lookup } }));
vi.mock("socks-proxy-agent", () => ({ SocksProxyAgent: socksProxyAgent }));

import { classifyH2AdsRouteFailure, getH2AdsRouteMismatches, validateH2AdsProxyRoute } from "./h2adsProxyValidation";

describe("validação pontual de rota H2 Ads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("consulta o verificador somente através do proxy resolvido e retorna os dados observados", async () => {
    axiosGet.mockResolvedValue({ data: { ip: "203.0.113.42", country_code: "BR", city: "São Paulo", asn: "AS64500", org: "ISP de teste" } });
    const observed = await validateH2AdsProxyRoute({ protocol: "http", host: "edge.example", port: 3128, username: "user_test", password: "pass_test" });
    expect(observed).toMatchObject({ ip: "203.0.113.42", countryCode: "BR", city: "São Paulo", asn: "AS64500", isp: "ISP de teste" });
    expect(observed.latencyMs).toBeGreaterThanOrEqual(0);
    expect(axiosGet).toHaveBeenCalledWith("https://ipapi.co/json/", expect.objectContaining({
      timeout: 15_000,
      proxy: expect.objectContaining({ host: "8.8.8.8", port: 3128 }),
    }));
  });

  it("rejeita uma resposta sem IP público observado", async () => {
    axiosGet.mockResolvedValue({ data: { error: true } });
    await expect(validateH2AdsProxyRoute({ protocol: "http", host: "edge.example", port: 3128, username: "user_test", password: "pass_test" })).rejects.toThrow("não retornou um IP público válido");
  });

  it("usa o agente SOCKS5 quando este tipo é selecionado", async () => {
    axiosGet.mockResolvedValue({ data: { ip: "203.0.113.43", country_code: "BR" } });
    await validateH2AdsProxyRoute({ protocol: "socks5", host: "edge.example", port: 1080, username: "user_test", password: "pass_test" });
    expect(socksProxyAgent).toHaveBeenCalledTimes(2);
    expect(socksProxyAgent).toHaveBeenCalledWith(expect.stringMatching(/^socks5:\/\//));
    expect(axiosGet).toHaveBeenCalledWith("https://ipapi.co/json/", expect.objectContaining({ proxy: false, httpAgent: expect.anything(), httpsAgent: expect.anything() }));
  });

  it("preserva HTTPS no caminho de proxy suportado pelo cliente HTTP", async () => {
    axiosGet.mockResolvedValue({ data: { ip: "203.0.113.44", country_code: "BR" } });
    await validateH2AdsProxyRoute({ protocol: "https", host: "edge.example", port: 8443, username: "user_test", password: "pass_test" });
    expect(axiosGet).toHaveBeenCalledWith("https://ipapi.co/json/", expect.objectContaining({ proxy: expect.objectContaining({ protocol: "https", host: "8.8.8.8", port: 8443, auth: { username: "user_test", password: "pass_test" } }) }));
    expect(socksProxyAgent).not.toHaveBeenCalled();
  });

  it("mantém o país retornado pela rota como dado observado, sem comparação manual", () => {
    const mismatches = getH2AdsRouteMismatches(
      { ip: "203.0.113.45", countryCode: "CO", city: "Bogotá", asn: "AS64500", isp: "ISP de teste", latencyMs: 120 },
      { expectedIsp: null, expectedAsn: null },
    );
    expect(mismatches).toEqual([]);
  });

  it("classifica timeout, autenticação e conexão recusada sem devolver dados da rota", () => {
    expect(classifyH2AdsRouteFailure({ code: "ETIMEDOUT" })).toEqual({ code: "proxy_timeout", message: "A conexão com o proxy excedeu o tempo de espera." });
    expect(classifyH2AdsRouteFailure({ response: { status: 407 } })).toEqual({ code: "proxy_authentication", message: "O proxy recusou a autenticação. Atualize a rota desta instância." });
    expect(classifyH2AdsRouteFailure({ code: "ECONNREFUSED" })).toEqual({ code: "proxy_unreachable", message: "O proxy recusou ou não permitiu a conexão." });
  });
});
