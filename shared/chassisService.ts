export const CHASSIS_CUSTOMER_PATH = "/h2chassis";
export const CHASSIS_CUSTOMER_HOST = "app.h2colombiano.com";
export const CHASSIS_SESSION_COOKIE = "h2_chassis_session";
export const CHASSIS_YEARS = ["G", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "V"] as const;

export function isChassisCustomerLocation(pathname: string, hostname = ""): boolean {
  const path = String(pathname).split(/[?#]/, 1)[0].toLowerCase().replace(/\/+$/, "") || "/";
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return path === CHASSIS_CUSTOMER_PATH || (host === CHASSIS_CUSTOMER_HOST && path === "/");
}

export type ChassisGenerationInput = {
  requestId: string;
  marca: string;
  modelo: string;
  yearCode: typeof CHASSIS_YEARS[number];
  quantity: number;
  originalVin?: string;
  syntheticLab?: boolean;
};

export type ChassisGenerationResult = {
  id: string;
  vins: string[];
  marca: string;
  modelo: string;
  yearCode: string;
  quantity: number;
  balance: number;
  replayed: boolean;
};
