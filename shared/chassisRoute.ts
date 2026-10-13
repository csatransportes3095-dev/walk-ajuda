export const CHASSIS_ADMIN_PATH = "/adm/chassis";

// Endereço canônico e alias antigo pertencem exclusivamente ao módulo ADM.
export function isChassisAdminPath(pathname: string): boolean {
  const path = String(pathname || "").split(/[?#]/, 1)[0].toLowerCase().replace(/\/+$/, "");
  return path === CHASSIS_ADMIN_PATH || path === "/gerador-chassi";
}
