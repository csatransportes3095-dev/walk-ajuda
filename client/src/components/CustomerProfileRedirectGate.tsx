import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

const CP_TOKEN_KEY = "cp_token";
const CENTRAL_PATH = "/atualizarcadastro";
const CUSTOMER_ROUTES = new Set(["/", "/login", "/acompanhar", "/gastos", "/emprestimo"]);

function normalizeReturnPath(pathname: string) {
  if (CUSTOMER_ROUTES.has(pathname)) return pathname;
  return "/";
}

/**
 * Rede de segurança global para sessões já existentes.
 *
 * A decisão de cadastro completo vem de customerUpdate.status, que usa a mesma
 * regra central do /atualizarcadastro. Este componente não atualiza dado algum:
 * apenas encaminha o cliente para o único fluxo quando a sessão já identifica
 * quem ele é e o cadastro atual está incompleto.
 */
export function CustomerProfileRedirectGate() {
  const checkedPhone = useRef("");
  const token = typeof window !== "undefined" ? localStorage.getItem(CP_TOKEN_KEY) || "" : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";

  const sessionQuery = trpc.customerPassword.checkSession.useQuery(
    { token },
    {
      enabled: !!token && pathname !== CENTRAL_PATH && !pathname.startsWith("/admin"),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  );
  const statusMutation = trpc.customerUpdate.status.useMutation();

  useEffect(() => {
    const phone = String(sessionQuery.data?.phone || "").replace(/\D/g, "");
    if (!sessionQuery.data?.valid || phone.length < 10) return;
    if (checkedPhone.current === phone || statusMutation.isPending) return;
    checkedPhone.current = phone;

    statusMutation.mutate(
      { phone },
      {
        onSuccess: (result) => {
          if (result.status === "completed" || result.status === "blocked" || result.status === "not_found") return;
          const params = new URLSearchParams({
            phone,
            returnTo: normalizeReturnPath(window.location.pathname),
          });
          window.location.assign(`${CENTRAL_PATH}?${params.toString()}`);
        },
        onError: () => {
          // Não bloqueia a navegação em erro transitório; os guards do backend
          // continuam protegendo Gastos e Empréstimos.
          checkedPhone.current = "";
        },
      },
    );
  }, [sessionQuery.data?.valid, sessionQuery.data?.phone, statusMutation.isPending]);

  return null;
}
