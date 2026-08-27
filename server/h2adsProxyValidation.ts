import dns from "node:dns/promises";
import net from "node:net";
import axios from "axios";
import type { ParsedH2AdsProxy } from "./h2adsProxySecurity";

type IpLocationResponse = {
  ip?: string;
  country_code?: string;
  country?: string;
  city?: string;
  asn?: string;
  org?: string;
  error?: boolean;
};

export type H2AdsObservedRoute = {
  ip: string | null;
  countryCode: string | null;
  city: string | null;
  asn: string | null;
  isp: string | null;
  latencyMs: number;
};

export type H2AdsRouteFailure = {
  code: "proxy_authentication" | "proxy_timeout" | "proxy_unreachable" | "proxy_dns" | "invalid_route_response" | "route_check_failed";
  message: string;
};

export function classifyH2AdsRouteFailure(error: unknown): H2AdsRouteFailure {
  const source = error && typeof error === "object" ? error as { code?: unknown; response?: { status?: unknown } } : {};
  const code = typeof source.code === "string" ? source.code : "";
  const status = typeof source.response?.status === "number" ? source.response.status : 0;
  if (status === 407 || status === 401 || status === 403) return { code: "proxy_authentication", message: "O proxy recusou a autenticação. Atualize a rota desta instância." };
  if (code === "ETIMEDOUT" || code === "ECONNABORTED") return { code: "proxy_timeout", message: "A conexão com o proxy excedeu o tempo de espera." };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { code: "proxy_dns", message: "Não foi possível resolver o endereço do proxy." };
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "ENETUNREACH") return { code: "proxy_unreachable", message: "O proxy recusou ou não permitiu a conexão." };
  if (error instanceof Error && /não retornou um ip público válido|endereço público elegível/i.test(error.message)) return { code: "invalid_route_response", message: "A rota não devolveu um IP público válido para verificação." };
  return { code: "route_check_failed", message: "Não foi possível validar a rota. Confirme o formato e tente novamente." };
}

function isPrivateAddress(address: string) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
  }
  const normalized = address.toLowerCase();
  return version === 6 && (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:"));
}

export async function resolvePublicProxyAddress(host: string) {
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("O endereço da rota não é público.");
    return host;
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (records.length === 0 || records.some(record => isPrivateAddress(record.address))) throw new Error("A rota não possui um endereço público elegível.");
  return records[0].address;
}

export async function validateH2AdsProxyRoute(proxy: ParsedH2AdsProxy): Promise<H2AdsObservedRoute> {
  const address = await resolvePublicProxyAddress(proxy.host);
  const start = Date.now();
  const response = await axios.get<IpLocationResponse>("https://ipapi.co/json/", {
    timeout: 15_000,
    proxy: {
      protocol: "http",
      host: address,
      port: proxy.port,
      auth: { username: proxy.username, password: proxy.password },
    },
    headers: { "User-Agent": "WalkAjuda-H2Ads-RouteCheck/1.0", Accept: "application/json" },
    validateStatus: status => status >= 200 && status < 300,
  });
  const data = response.data;
  if (data.error || !data.ip) throw new Error("A rota não retornou um IP público válido.");
  return {
    ip: data.ip,
    countryCode: (data.country_code ?? data.country ?? null)?.toUpperCase() ?? null,
    city: data.city ?? null,
    asn: data.asn ?? null,
    isp: data.org ?? null,
    latencyMs: Date.now() - start,
  };
}

export function getH2AdsRouteMismatches(observed: H2AdsObservedRoute, expected: { targetCountryCode: string | null; expectedIsp: string | null; expectedAsn: string | null }) {
  const normalized = (value: string | null) => value?.trim().toLowerCase() ?? "";
  const mismatches: string[] = [];
  if (expected.targetCountryCode && normalized(observed.countryCode) !== normalized(expected.targetCountryCode)) mismatches.push("país");
  if (expected.expectedIsp && normalized(observed.isp) !== normalized(expected.expectedIsp)) mismatches.push("ISP");
  if (expected.expectedAsn && normalized(observed.asn) !== normalized(expected.expectedAsn)) mismatches.push("ASN");
  return mismatches;
}
