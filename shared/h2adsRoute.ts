export const H2ADS_PATH = "/h2ads";

/**
 * Mantém o módulo H2 Ads fora dos gates públicos destinados aos clientes.
 * Aceita somente a rota base e os seus subcaminhos reais.
 */
export function isH2AdsPath(pathname: string): boolean {
  return pathname === H2ADS_PATH || pathname.startsWith(`${H2ADS_PATH}/`);
}
