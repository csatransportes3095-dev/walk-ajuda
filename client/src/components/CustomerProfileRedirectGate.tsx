import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { sanitizeCustomerUpdateReturnPath } from "@shared/customerUpdateReturnPath";

const CP_TOKEN_KEY = "cp_token";
const LEGACY_PHONE_KEY = "walk_client_phone";
const LEGACY_ACCESS_KEY = "walk_access_granted";
const CENTRAL_PATH = "/atualizarcadastro";

function normalizePhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return /^\d{10,11}$/.test(digits) ? digits : "";
}

/**
 * Rede de segurança global para toda sessão que já identifica um cliente.
 *
 * Vale tanto para o cp_token atual quanto para sessões legadas/referral que ainda
 * guardam walk_client_phone. A decisão de cadastro completo vem sempre de
 * customerUpdate.status; este componente nunca corrige dados localmente.
 */
export function CustomerProfileRedirectGate() {
  const checkedIdentity = useRef("");
  const token = typeof window !== "undefined" ? localStorage.getItem(CP_TOKEN_KEY) || "" : "";
  const legacyAccess = typeof window !== "undefined" ? localStorage.getItem(LEGACY_ACCESS_KEY) === "true" : false;
  const legacyPhone = typeof window !== "undefined" && legacyAccess
    ? normalizePhone(localStorage.getItem(LEGACY_PHONE_KEY))
    : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const guardEnabled = pathname !== CENTRAL_PATH && !pathname.startsWith("/admin");

  const sessionQuery = trpc.customerPassword.checkSession.useQuery(
    { token },
    {
      enabled: !!token && guardEnabled,
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  );
  const statusMutation = trpc.customerUpdate.status.useMutation();

  useEffect(() => {
    if (!guardEnabled) return;

    const sessionPhone = sessionQuery.data?.valid ? normalizePhone(sessionQuery.data?.phone) : "";
    // cp_token válido é prioritário. Sem ele, uma sessão legada só é aceita como
    // identidade para a checagem se o próprio fluxo legado marcou acesso concedido.
    const phone = sessionPhone || (!token ? legacyPhone : "");
    if (!phone) return;

    const identityKey = `${token ? "cp" : "legacy"}:${phone}:${pathname}`;
    if (checkedIdentity.current === identityKey || statusMutation.isPending) return;
    checkedIdentity.current = identityKey;

    statusMutation.mutate(
      { phone },
      {
        onSuccess: (result) => {
          if (result.status === "completed" || result.status === "blocked" || result.status === "not_found") return;
          const params = new URLSearchParams({
            phone,
            returnTo: sanitizeCustomerUpdateReturnPath(window.location.pathname) || "/",
          });
          window.location.assign(`${CENTRAL_PATH}?${params.toString()}`);
        },
        onError: () => {
          // Não bloqueia a navegação em erro transitório; guards de backend
          // continuam protegendo as rotas sensíveis.
          checkedIdentity.current = "";
        },
      },
    );
  }, [
    guardEnabled,
    legacyPhone,
    pathname,
    sessionQuery.data?.valid,
    sessionQuery.data?.phone,
    statusMutation.isPending,
    token,
  ]);

  return null;
}
