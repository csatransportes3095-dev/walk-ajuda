import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import AdminProductsQuestionUXEnhancer from "./components/AdminProductsQuestionUXEnhancer";
import AdminQuestionEditOptionsEnhancer from "./components/AdminQuestionEditOptionsEnhancer";
import AdminQuestionTreeOrderEnhancer from "./components/AdminQuestionTreeOrderEnhancer";
import AdminQuestionCopyExactEnhancer from "./components/AdminQuestionCopyExactEnhancer";
import AdminQuestionDeleteIntegrityEnhancer from "./components/AdminQuestionDeleteIntegrityEnhancer";
import OrderWhatsappQuestionTreeEnhancer from "./components/OrderWhatsappQuestionTreeEnhancer";
import PublicQuestionFlowEnhancer from "./components/PublicQuestionFlowEnhancer";
import QuestionBlockingRulesManager from "./components/QuestionBlockingRulesManager";
import QuestionBlockingManifestGuard from "./components/QuestionBlockingManifestGuard";
import "./index.css";

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
        fetch: fetchWithTimeout(30000),
      }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <AdminProductsQuestionUXEnhancer />
      <AdminQuestionEditOptionsEnhancer />
      <AdminQuestionTreeOrderEnhancer />
      <AdminQuestionCopyExactEnhancer />
      <AdminQuestionDeleteIntegrityEnhancer />
      <QuestionBlockingRulesManager />
      <QuestionBlockingManifestGuard />
      <OrderWhatsappQuestionTreeEnhancer />
      <PublicQuestionFlowEnhancer />
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] Registrado:", reg.scope);
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

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_KILL" || event.data?.type === "SW_UPDATED") {
        window.location.reload();
      }
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
