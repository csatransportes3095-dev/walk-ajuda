const STATIC_CUSTOMER_RETURN_PATHS = new Set(["/", "/login", "/acompanhar", "/gastos", "/emprestimo"]);
const SCHEDULE_RETURN_PATH = /^\/agendar\/[a-f0-9]{32}$/i;

export function sanitizeCustomerUpdateReturnPath(value: unknown): string {
  const path = String(value ?? "").trim();
  if (STATIC_CUSTOMER_RETURN_PATHS.has(path)) return path;
  if (SCHEDULE_RETURN_PATH.test(path)) return path;
  return "";
}
