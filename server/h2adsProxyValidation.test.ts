import { beforeEach, describe, expect, it, vi } from "vitest";

const { axiosGet, lookup } = vi.hoisted(() => ({ axiosGet: vi.fn(), lookup: vi.fn() }));

vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("node:dns/promises", () => ({ default: { lookup } }));

import { validateH2AdsProxyRoute } from "./h2adsProxyValidation";

describe("validação pontual de rota H2 Ads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("consulta o verificador somente através do proxy resolvido e retorna os dados observados", async () => {
    axiosGet.mockResolvedValue({ data: { ip: "203.0.113.42", country_code: "BR", city: "São Paulo", asn: "AS64500", org: "ISP de teste" } });
    const observed = await validateH2AdsProxyRoute({ host: "edge.example", port: 3128, username: "user_test", password: "pass_test" });
    expect(observed).toMatchObject({ ip: "203.0.113.42", countryCode: "BR", city: "São Paulo", asn: "AS64500", isp: "ISP de teste" });
    expect(observed.latencyMs).toBeGreaterThanOrEqual(0);
    expect(axiosGet).toHaveBeenCalledWith("https://ipapi.co/json/", expect.objectContaining({
      timeout: 15_000,
      proxy: expect.objectContaining({ host: "8.8.8.8", port: 3128 }),
    }));
  });

  it("rejeita uma resposta sem IP público observado", async () => {
    axiosGet.mockResolvedValue({ data: { error: true } });
    await expect(validateH2AdsProxyRoute({ host: "edge.example", port: 3128, username: "user_test", password: "pass_test" })).rejects.toThrow("não retornou um IP público válido");
  });
});
