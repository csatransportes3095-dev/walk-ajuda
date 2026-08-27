export const H2ADS_PROXY_PROTOCOLS = ["http", "https", "socks5"] as const;
export type H2AdsProxyProtocol = (typeof H2ADS_PROXY_PROTOCOLS)[number];

export type ParsedH2AdsProxy = {
  protocol: H2AdsProxyProtocol;
  host: string;
  port: number;
  username: string;
  password: string;
};

export function parseH2AdsProxyInput(input: string, protocol: H2AdsProxyProtocol = "http"): ParsedH2AdsProxy {
  const value = input.trim();
  if (!value || /\s/.test(value)) throw new Error("Informe uma configuração de proxy válida, sem espaços.");

  const [host, portText, username, ...passwordParts] = value.split(":");
  const password = passwordParts.join(":");
  const port = Number(portText);

  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !password) {
    throw new Error("Formato de proxy inválido. Use host:porta:utilizador:palavra-passe.");
  }

  return { protocol, host: host.toLowerCase(), port, username, password };
}
