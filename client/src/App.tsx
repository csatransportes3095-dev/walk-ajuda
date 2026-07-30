import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// ============================================================
// ðŸ”§ MODO MANUTENÃ‡ÃƒO â€” mude para false para reabrir o site
// ============================================================
const MAINTENANCE_MODE = false;
function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 text-center">
      <div className="mb-6">
        <img
          src="/icons/icon-192x192.png"
          alt="H2 COLOMBIANO"
          className="w-24 h-24 mx-auto rounded-2xl mb-4"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <h1 className="text-3xl font-bold text-yellow-400 mb-2">H2 COLOMBIANO</h1>
      </div>
      <div className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-8 max-w-sm w-full">
        <div className="text-5xl mb-4">ðŸ”§</div>
        <h2 className="text-xl font-bold text-white mb-3">Site em ManutenÃ§Ã£o</h2>
        <p className="text-gray-400 text-sm mb-6">
          Estamos realizando melhorias no sistema.<br />
          Voltamos em breve!
        </p>

      </div>
      <p className="text-gray-600 text-xs mt-6">h2colombiano.com</p>
    </div>
  );
}
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation, Redirect } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AdminCodes from "./pages/AdminCodes";
import AdminGastosPage from "./pages/AdminGastosPage";
import AdminUserAccessFilters from "./pages/AdminUserAccessFilters";
import AdminCustomerPasswordPage from "./pages/AdminCustomerPasswordPage";
import AdminAdCampaigns from "./pages/AdminAdCampaigns";

import AdminCoupons from "./pages/AdminCoupons";
import AdminProducts from "./pages/AdminProducts";
import AdminSettings from "./pages/AdminSettings";
import AdminCustomers from "./pages/AdminCustomers";
import AdminRaffles from "./pages/AdminRaffles";
import AdminLogin from "./pages/AdminLogin";
import AdminOrders from "./pages/AdminOrders";
import AdminCommissions from "./pages/AdminCommissions";
import AdminNewOrder from "./pages/AdminNewOrder";
import AdminStatusTypes from "./pages/AdminStatusTypes";
import AdminBanners from "./pages/AdminBanners";
import AdminIpBlock from "./pages/AdminIpBlock";
import AdminVpn from "./pages/AdminVpn";
import AdminBroadcast from "./pages/AdminBroadcast";
import AdminResellers from "./pages/AdminResellers";
import AdminFinanceiro from "./pages/AdminFinanceiro";
import AdminLoans from "./pages/AdminLoans";
import AdminReferrerBypass from "./pages/AdminReferrerBypass";
import AdminProtectedPhoto from "./pages/AdminProtectedPhoto";
import AdminTrash from "./pages/AdminTrash";
import AdminFaq from "./pages/AdminFaq";
import AdminSchedule from "./pages/AdminSchedule";
import AdminFlowConfig from "./pages/AdminFlowConfig";
import AdminCep from "./pages/AdminCep";
import AdminTelefone from "./pages/AdminTelefone";
import AdminEmail from "./pages/AdminEmail";
import AdminZohoConfig from "./pages/AdminZohoConfig";
import AdminMedia from "./pages/AdminMedia";
import AdminFeatureCards from "./pages/AdminFeatureCards";
import AdminHubCentral from "./pages/AdminHubCentral";
import AdminConsultas from "./pages/AdminConsultas";
import AdminWhatsappTemplates from "./pages/AdminWhatsappTemplates";
import AdminOnlineSupport from "./pages/AdminOnlineSupport";
import AdminChatFlow from "./pages/AdminChatFlow";
import AdminReferrals from "./pages/AdminReferrals";
import AdminPreRegistrations from "./pages/AdminPreRegistrations";
import AdminPreCadastroQuestions from "./pages/AdminPreCadastroQuestions";
import PreCadastro from "./pages/PreCadastro";
import ConsultarCadastro from "./pages/ConsultarCadastro";
import ClientReferralTree from "./pages/ClientReferralTree";
import SchedulePage from "./pages/SchedulePage";
import { SpreadsheetPage } from "./pages/SpreadsheetPage";
import { GastosPage } from "./pages/GastosPage";
import Ajuda from "./pages/Ajuda";
import GeradorChassiPublico from "./pages/GeradorChassiPublico";
import ProtectedPhotoPage from "./pages/ProtectedPhotoPage";
import ResellerLogin from "./pages/ResellerLogin";
import ResellerDashboard from "./pages/ResellerDashboard";
import Raffle from "./pages/Raffle";
import OrderTracking from "./pages/OrderTracking";
import VideoTutorial from "./pages/VideoTutorial";
import Tutorial from "./pages/Tutorial";
import PasswordGate from "./components/PasswordGate";
import WelcomeScreen from "./components/WelcomeScreen";
import AdminPWABanner from "./components/AdminPWABanner";
import InstallWall from "./components/InstallWall";
import { usePWA } from "./hooks/usePWA";
import WhatsAppFloat from "./components/WhatsAppFloat";
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useAdminIdleLogout } from "./hooks/useAdminIdleLogout";
import { useAntiPrint } from "./hooks/useAntiPrint";
import DevtoolsGuard from "./components/DevtoolsGuard";

// Guard para rotas admin â€” redireciona para /admin/login se nÃ£o autenticado
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAdminAuth();
  // Logout automÃ¡tico apÃ³s 30 minutos de inatividade
  useAdminIdleLogout(isAdmin);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Redirect to="/admin/login" />;
  }

  return <>{children}</>;
}

function Router() {
  const [location, navigate] = useLocation();
  // Normalizar URL para minÃºscula se for /sorteio, /foto ou /acompanhar
  const normalizedPath = location.toLowerCase();

  useEffect(() => {
    const shouldNormalize = normalizedPath !== location && (normalizedPath === "/sorteio" || normalizedPath === "/foto" || normalizedPath === "/acompanhar");
    if (shouldNormalize) {
      navigate(normalizedPath);
    }
  }, [location, normalizedPath, navigate]);

  
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/admin/login"} component={AdminLogin} />
      <Route path={"/admin/gastos"}>
        <AdminGuard><AdminGastosPage /></AdminGuard>
      </Route>
      <Route path={"/admin/access-filters"}>
        <AdminGuard><AdminUserAccessFilters /></AdminGuard>
      </Route>
      <Route path={"/admin/codes"}>
        <AdminGuard><AdminCodes /></AdminGuard>
      </Route>
      <Route path={"/admin/coupons"}>
        <AdminGuard><AdminCoupons /></AdminGuard>
      </Route>
      <Route path={"/admin/products"}>
        <AdminGuard><AdminProducts /></AdminGuard>
      </Route>
      <Route path={"/admin/settings"}>
        <AdminGuard><AdminSettings /></AdminGuard>
      </Route>
      <Route path={"/admin/customers"}>
        <AdminGuard><AdminCustomers /></AdminGuard>
      </Route>
      <Route path={"/admin/customer-password"}>
        <AdminGuard><AdminCustomerPasswordPage /></AdminGuard>
      </Route>
      <Route path={"/admin/raffles"}>
        <AdminGuard><AdminRaffles /></AdminGuard>
      </Route>
      <Route path={"/admin/orders/new"}>
        <AdminGuard><AdminNewOrder /></AdminGuard>
      </Route>
      <Route path={"/admin/orders"}>
        <AdminGuard><AdminOrders /></AdminGuard>
      </Route>
      <Route path={"/admin/commissions"}>
        <AdminGuard><AdminCommissions /></AdminGuard>
      </Route>
      <Route path={"/admin/status-types"}>
        <AdminGuard><AdminStatusTypes /></AdminGuard>
      </Route>
      <Route path={"/admin/banners"}>
        <AdminGuard><AdminBanners /></AdminGuard>
      </Route>
      <Route path={"/admin/ip-block"}>
        <AdminGuard><AdminIpBlock /></AdminGuard>
      </Route>
      <Route path={"/admin/vpn"}>
        <AdminGuard><AdminVpn /></AdminGuard>
      </Route>
      <Route path={"/admin/broadcast"}>
        <AdminGuard><AdminBroadcast /></AdminGuard>
      </Route>
      <Route path={"/foto"} component={ProtectedPhotoPage} />
      <Route path={"/sorteio"} component={Raffle} />
      <Route path={"/acompanhar"} component={OrderTracking} />
      <Route path={"/login"} component={Home} />
      <Route path={"/revendedor"} component={ResellerLogin} />
      <Route path={"/revendedor/dashboard"} component={ResellerDashboard} />
      <Route path={"/admin/resellers"}>
        <AdminGuard><AdminResellers /></AdminGuard>
      </Route>
      <Route path={"/admin/financeiro"}>
        <AdminGuard><AdminFinanceiro /></AdminGuard>
      </Route>
      <Route path={"/admin/loans"}>
        <AdminGuard><AdminLoans /></AdminGuard>
      </Route>
      <Route path={"/admin/pre-cadastros"}>
        <AdminGuard><AdminPreRegistrations /></AdminGuard>
      </Route>
      <Route path={"/admin/pre-cadastros/perguntas"}>
        <AdminGuard><AdminPreCadastroQuestions /></AdminGuard>
      </Route>
      <Route path={"/pre-cadastro"} component={PreCadastro} />
      <Route path={"/consultar-cadastro"} component={ConsultarCadastro} />
      <Route path={"/admin/referrer-bypass"}>
        <AdminGuard><AdminReferrerBypass /></AdminGuard>
      </Route>
      <Route path={"/admin/referrals"}>
        <AdminGuard><AdminReferrals /></AdminGuard>
      </Route>
      <Route path={"/admin/referral-tree"}>
        <AdminGuard><ClientReferralTree /></AdminGuard>
      </Route>
      <Route path={"/admin/protected-photo"}>
        <AdminGuard><AdminProtectedPhoto /></AdminGuard>
      </Route>
      <Route path={"/admin/trash"}>
        <AdminGuard><AdminTrash /></AdminGuard>
      </Route>
      <Route path={"/admin/faq"}>
        <AdminGuard><AdminFaq /></AdminGuard>
      </Route>
      <Route path={"/admin/schedule"}>
        <AdminGuard><AdminSchedule /></AdminGuard>
      </Route>
      <Route path={"/admin/flow-config"}>
        <AdminGuard><AdminFlowConfig /></AdminGuard>
      </Route>
      <Route path={"/admin/cep"}>
        <AdminGuard><AdminCep /></AdminGuard>
      </Route>
      <Route path={"/admin/telefone"}>
        <AdminGuard><AdminTelefone /></AdminGuard>
      </Route>
      <Route path={"/admin/email"}>
        <AdminGuard><AdminEmail /></AdminGuard>
      </Route>
      <Route path={"/admin/zoho-config"}>
        <AdminGuard><AdminZohoConfig /></AdminGuard>
      </Route>
      <Route path={"/admin/media"}>
        <AdminGuard><AdminMedia /></AdminGuard>
      </Route>
      <Route path={"/admin/feature-cards"}>
        <AdminGuard><AdminFeatureCards /></AdminGuard>
      </Route>
      <Route path={"/admin/propagandas"}>
        <AdminGuard><AdminAdCampaigns /></AdminGuard>
      </Route>
      <Route path={"/admin/hub-central"}>
        <AdminGuard><AdminHubCentral /></AdminGuard>
      </Route>
      <Route path={"/admin/consultas"}>
        <AdminGuard><AdminConsultas /></AdminGuard>
      </Route>
      <Route path={"/admin/whatsapp-templates"}>
        <AdminGuard><AdminWhatsappTemplates /></AdminGuard>
      </Route>
      <Route path={"/admin/online-support"}>
        <AdminGuard><AdminOnlineSupport /></AdminGuard>
      </Route>
      <Route path={"/admin/chat-flow"}>
        <AdminGuard><AdminChatFlow /></AdminGuard>
      </Route>
      <Route path={"/agendar/:token"} component={SchedulePage} />
      <Route path={"/gastos"} component={GastosPage} />
      <Route path={"/gerador-chassi"} component={GeradorChassiPublico} />
      <Route path={"/ajuda"} component={Ajuda} />
      <Route path={"/video/tutorial"} component={VideoTutorial} />
      <Route path={"/tutorial"} component={Tutorial} />
      <Route path={"/r/:slug"} component={Home} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClientInstallGate({ children }: { children: React.ReactNode }) {
  const { isInstalled, isChecking } = usePWA();
  if (isChecking) return null;
  if (!isInstalled) return <InstallWall />;
  return <>{children}</>;
}

function AppContent() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");
  const isTrackingRoute = location === "/acompanhar";
  const isLoginRoute = location === "/login";
  const isRaffleRoute = location === "/sorteio";
  const isGeradorChassiRoute = location === "/gerador-chassi";
  const isFotoRoute = location === "/foto";
  const isResellerRoute = location.startsWith("/revendedor");
  const isAjudaRoute = location === "/ajuda";
  const isAgendarRoute = location.startsWith("/agendar");
  const isVideoRoute = location.startsWith("/video") || location === "/tutorial";
  const isGastosRoute = location === "/gastos";
  const isPreCadastroRoute = location === "/pre-cadastro";
  const isConsultarCadastroRoute = location === "/consultar-cadastro";

  // ProteÃ§Ã£o anti-print para rotas de cliente
  const clientPhone = typeof window !== 'undefined' ? localStorage.getItem('walk_client_phone') || undefined : undefined;
  const { WarningOverlay } = useAntiPrint(!isAdminRoute ? clientPhone : undefined);

  // Troca o manifest dinamicamente para admin/cliente
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    if (!link) return;
    if (isAdminRoute) {
      link.href = "/manifest-admin.json";
    } else {
      link.href = "/manifest.json";
    }
  }, [isAdminRoute]);

  if (isAdminRoute) {
    return (
      <>
        <Router />
        {location !== "/admin/login" && <AdminPWABanner />}
      </>
    );
  }

  // ðŸ”§ MODO MANUTENÃ‡ÃƒO â€” bloqueia todas as rotas pÃºblicas
  if (MAINTENANCE_MODE) {
    return <MaintenancePage />;
  }

  // Rota /gastos Ã© pÃºblica â€” sem senha
  if (isGastosRoute) {
    return <Router />;
  }

  // Rota /login Ã© atalho direto para o PasswordGate â€” mostra a tela bonita com logo, telefone/CPF e CONTINUAR
  if (isLoginRoute) {
    return (
      <>
        <PasswordGate>
          <Router />
        </PasswordGate>
        <WarningOverlay />
      </>
    );
  }

  // Rota /acompanhar Ã© pÃºblica â€” sem senha, mas com tela de boas-vindas
  if (isTrackingRoute) {
    return (
      <>
        <WelcomeScreen>
          <Router />
        </WelcomeScreen>
        <WarningOverlay />
      </>
    );
  }

  if (isResellerRoute) {
    return <Router />;
  }

  // Rota /ajuda Ã© pÃºblica â€” pÃ¡gina de FAQ para compartilhar pelo WhatsApp
  if (isAjudaRoute) {
    return <Router />;
  }
  // Rota /pre-cadastro Ã© pÃºblica â€” formulÃ¡rio de prÃ©-cadastro sem senha
  if (isPreCadastroRoute) {
    return <Router />;
  }
  // Rota /consultar-cadastro Ã© pÃºblica â€” consulta de status por CPF
  if (isConsultarCadastroRoute) {
    return <Router />;
  }

  // Rota /video Ã© pÃºblica â€” vÃ­deos tutoriais para clientes
  if (isVideoRoute) {
    return <Router />;
  }

  // Rota /agendar/:token Ã© pÃºblica â€” cliente agenda atendimento pelo link individual
  if (isAgendarRoute) {
    return <Router />;
  }

  // Rota /sorteio Ã© pÃºblica â€” nÃ£o passa pelo PasswordGate do site
  // O prÃ³prio Raffle.tsx controla o acesso (livre ou com senha prÃ³pria do sorteio)
  // Rota /gerador-chassi Ã© pÃºblica â€” qualquer pessoa pode usar sem senha
  if (isGeradorChassiRoute) {
    return (
      <>
        <Router />
        <WarningOverlay />
      </>
    );
  }

  if (isRaffleRoute || isFotoRoute) {
    return (
      <>
        <Router />
        <WarningOverlay />
      </>
    );
  }

  return (
    <>
      <WelcomeScreen>
        <PasswordGate>
          <Router />
        </PasswordGate>
      </WelcomeScreen>
      <WarningOverlay />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <DevtoolsGuard />
          <AppContent />
          <GlobalWhatsApp />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// Renderiza o botÃ£o flutuante do WhatsApp em todas as rotas, exceto no painel admin, /gastos e /gerador-chassi
function GlobalWhatsApp() {
  const [location] = useLocation();
  if (location.startsWith("/admin")) return null;
  if (location === "/gastos") return null;
  if (location === "/gerador-chassi") return null;
  return <WhatsAppFloat />;
}

export default App;
