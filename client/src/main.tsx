import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import AdminProductsQuestionUXEnhancer from "./components/AdminProductsQuestionUXEnhancer";
import OrderWhatsappQuestionTreeEnhancer from "./components/OrderWhatsappQuestionTreeEnhancer";
import PublicQuestionFlowEnhancer from "./components/PublicQuestionFlowEnhancer";
import QuestionBlockingRulesManager from "./components/QuestionBlockingRulesManager";
import QuestionBlockingManifestGuard from "./components/QuestionBlockingManifestGuard";
import "./index.css";

// Consultas de tela não podem ficar em loop por vários minutos quando o servidor
// responde lentamente ou ocorre algum erro. Mutations continuam com prazo maior
// porque uploads, geração de arquivos e envio de e-mails podem levar mais tempo.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = "/admin/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

function fetchWithTimeout(timeoutMs: number) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return globalThis.fetch(input, {
      ...(init ?? {}),
      credentials: "include",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  };
}

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        return op.type === "mutation";
      },
      true: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: fetchWithTimeout(150000),
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        // Consultas normais do painel devem responder rapidamente. Se não responderem,
        // encerramos a tentativa em vez de deixar a tela girando indefinidamente.
        fetch: fetchWithTimeout(30000),
      }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <AdminProductsQuestionUXEnhancer />
      <QuestionBlockingRulesManager />
      <QuestionBlockingManifestGuard />
      <OrderWhatsappQuestionTreeEnhancer />
      <PublicQuestionFlowEnhancer />
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Registrar Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] Registrado:", reg.scope);
        // Detectar quando um novo SW está instalado e recarregar automaticamente
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated") {
              window.location.reload();
            }
          });
        });
      })
      .catch((err) => console.warn("[SW] Falha ao registrar:", err));

    // Ouvir mensagem do SW kill-switch para recarregar
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_KILL" || event.data?.type === "SW_UPDATED") {
        window.location.reload();
      }
    });

    // Se o SW foi atualizado em outra aba, recarregar esta também
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
