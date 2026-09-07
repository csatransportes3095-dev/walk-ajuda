import "./lib/vehicleModelCheckoutHotfix";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import H2WelcomePremium from "./components/H2WelcomePremium";
import HomeTopRuntimeEnhancer from "./components/HomeTopRuntimeEnhancer";
import AdminHomeTopSettingsEnhancer from "./components/AdminHomeTopSettingsEnhancer";
import SpreadsheetModulesEnhancer from "./components/SpreadsheetModulesEnhancer";
import SpreadsheetLegacyModulesCleanup from "./components/SpreadsheetLegacyModulesCleanup";
import AdminOrderLoginQuickEnhancer from "./components/AdminOrderLoginQuickEnhancer";
import AdminOrderH2EmailQuickFix from "./components/AdminOrderH2EmailQuickFix";
import AdminOrderLoginCopyEnhancer from "./components/AdminOrderLoginCopyEnhancer";
import AdminOrderAuthenticatorSyncEnhancer from "./components/AdminOrderAuthenticatorSyncEnhancer";
import AdminOrderTrackingPinRetirement from "./components/AdminOrderTrackingPinRetirement";
import AdminCustomerPhoneEditorEnhancer from "./components/AdminCustomerPhoneEditorEnhancer";
import AdminProductsQuestionUXEnhancer from "./components/AdminProductsQuestionUXEnhancer";
import AdminQuestionEditOptionsEnhancer from "./components/AdminQuestionEditOptionsEnhancer";
import AdminQuestionTreeOrderEnhancer from "./components/AdminQuestionTreeOrderEnhancer";
import OrderWhatsappQuestionTreeEnhancer from "./components/OrderWhatsappQuestionTreeEnhancer";
import PublicQuestionFlowEnhancer from "./components/PublicQuestionFlowEnhancer";
import QuestionBlockingRulesManager from "./components/QuestionBlockingRulesManager";
import QuestionBlockingManifestGuard from "./components/QuestionBlockingManifestGuard";
import ProductManifestGuard from "./components/ProductManifestGuard";
import RegistrationReferralFirstGate from "./components/RegistrationReferralFirstGate";
import UnifiedCustomerAccessGate from "./components/UnifiedCustomerAccessGate";
import UnifiedCustomerModuleBootstrap from "./components/UnifiedCustomerModuleBootstrap";
import GlobalDevToolsProtection from "./components/GlobalDevToolsProtection";
import AdminDevToolsTargetSelector from "./components/AdminDevToolsTargetSelector";
import RafflePhotoIntegrityEnhancer from "./components/RafflePhotoIntegrityEnhancer";
import H2AdsScheduleFlatView from "./components/H2AdsScheduleFlatView";
import "./index.css";
import "./welcome-neon-refresh.css";
import "./admin-loans-mobile-fix.css";
import "./h2-welcome-reference-top.css";
import "./h2-welcome-mobile-car-fix.css";
import "./h2-footer-mobile-fix.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false }, mutations: { retry: 0 } } });
const redirectToLoginIfUnauthorized = (error: unknown) => { if (!(error instanceof TRPCClientError) || typeof window === "undefined" || error.message !== UNAUTHED_ERR_MSG) return; window.location.href = "/admin/login"; };
queryClient.getQueryCache().subscribe(event => { if (event.type === "updated" && event.action.type === "error") { const error = event.query.state.error; redirectToLoginIfUnauthorized(error); console.error("[API Query Error]", error); } });

const isOptionPriceModelKey = (key: unknown) => {
  try { return JSON.stringify(key ?? []).includes("optionPriceModels"); } catch { return false; }
};
const refreshOptionPriceModels = () => {
  void queryClient.invalidateQueries({
    predicate: query => isOptionPriceModelKey(query.queryKey),
    refetchType: "active",
  });
};
let optionPriceModelSyncChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined") {
  if (typeof BroadcastChannel !== "undefined") {
    optionPriceModelSyncChannel = new BroadcastChannel("h2-option-price-model-sync");
    optionPriceModelSyncChannel.addEventListener("message", refreshOptionPriceModels);
  }
  window.addEventListener("focus", refreshOptionPriceModels);
  window.setInterval(refreshOptionPriceModels, 10_000);
}

queryClient.getMutationCache().subscribe(event => {
  if (event.type !== "updated") return;
  if (event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
    return;
  }
  if (event.action.type === "success" && isOptionPriceModelKey(event.mutation.options.mutationKey)) {
    refreshOptionPriceModels();
    optionPriceModelSyncChannel?.postMessage({ type: "option-price-model-updated", at: Date.now() });
  }
});

function fetchWithTimeout(timeoutMs: number) { return (input: RequestInfo | URL, init?: RequestInit) => { const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), timeoutMs); return globalThis.fetch(input, { ...(init ?? {}), credentials: "include", signal: controller.signal }).finally(() => clearTimeout(timeoutId)); }; }
const trpcClient = trpc.createClient({ links: [splitLink({ condition(op) { return op.type === "mutation"; }, true: httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch: fetchWithTimeout(150000) }), false: httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch: fetchWithTimeout(30000) }) })] });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <GlobalDevToolsProtection /><AdminDevToolsTargetSelector /><AdminHomeTopSettingsEnhancer />
      <SpreadsheetModulesEnhancer /><SpreadsheetLegacyModulesCleanup />
      <AdminOrderLoginQuickEnhancer /><AdminOrderH2EmailQuickFix /><AdminOrderLoginCopyEnhancer /><AdminOrderAuthenticatorSyncEnhancer /><AdminOrderTrackingPinRetirement />
      <AdminCustomerPhoneEditorEnhancer /><RafflePhotoIntegrityEnhancer /><AdminProductsQuestionUXEnhancer /><AdminQuestionEditOptionsEnhancer /><AdminQuestionTreeOrderEnhancer />
      <QuestionBlockingRulesManager /><QuestionBlockingManifestGuard /><ProductManifestGuard /><OrderWhatsappQuestionTreeEnhancer /><PublicQuestionFlowEnhancer /><RegistrationReferralFirstGate />
      <H2WelcomePremium /><HomeTopRuntimeEnhancer /><H2AdsScheduleFlatView />
      <UnifiedCustomerAccessGate><UnifiedCustomerModuleBootstrap><App /></UnifiedCustomerModuleBootstrap></UnifiedCustomerAccessGate>
    </QueryClientProvider>
  </trpc.Provider>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
      console.log("[SW] Registrado:", reg.scope); void reg.update().catch(() => undefined);
      reg.addEventListener("updatefound", () => { const newWorker = reg.installing; if (!newWorker) return; newWorker.addEventListener("statechange", () => { if (newWorker.state === "activated") window.location.reload(); }); });
    }).catch((err) => console.warn("[SW] Falha ao registrar:", err));
    navigator.serviceWorker.addEventListener("message", (event) => { if (event.data?.type === "SW_KILL" || event.data?.type === "SW_UPDATED") window.location.reload(); });
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!refreshing) { refreshing = true; window.location.reload(); } });
  });
}
