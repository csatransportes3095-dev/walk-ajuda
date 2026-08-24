import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// ============================================================
// 🔧 MODO MANUTENÇÃO — mude para false para reabrir o site
// ============================================================
const MAINTENANCE_MODE = false;
function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 text-center">
      <div className="mb-6">
        <img
          src="/icons/icon-192x192.png"
          alt="Walk Ajuda"
          className="w-24 h-24 mx-auto rounded-2xl mb-4"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <h1 className="text-3xl font-bold text-yellow-400 mb-2">WALK AJUDA</h1>
      </div>
      <div className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-8 max-w-sm w-full">
        <div className="text-5xl mb-4">🔧</div>
        <h2 className="text-xl font-bold text-white mb-3">Site em Manutenção</h2>
        <p className="text-gray-400 text-sm mb-6">
          Estamos realizando melhorias no sistema.<br />
          Voltamos em breve!
        </p>

      </div>
      <p className="text-gray-600 text-xs mt-6">walkajuda.com</p>
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
import AdminLocadora from "./pages/AdminLocadora";
import LocadoraPortal from "./pages/LocadoraPortal";
import AdminConsultas from "./pages/AdminConsultas";
import AdminWhatsappTemplates from "./pages/AdminWhatsappTemplates";
import AdminCartoesUsers from "./pages/AdminCartoesUsers";
import AdminOnlineSupport from "./pages/AdminOnlineSupport";
import AdminChatFlow from "./pages/AdminChatFlow";
import AdminAuthenticator from "./pages/AdminAuthenticator";
import AdminReferrals from "./pages/AdminReferrals";
import AdminPreRegistrations from "./pages/AdminPreRegistrations";
import AdminPreCadastroQuestions from "./pages/AdminPreCadastroQuestions";
import PreCadastro from "./pages/PreCadastro";
import ConsultarCadastro from "./pages/ConsultarCadastro";
import AtualizarCadastro from "./pages/AtualizarCadastro";
import ClientReferralTree from "./pages/ClientReferralTree";
import SchedulePage from "./pages/SchedulePage";
import PublicQuotePage from "./pages/PublicQuotePage";
import PublicReceiptPage from "./pages/PublicReceiptPage";
import { SpreadsheetPage } from "./pages/SpreadsheetPage";
import { GastosPage } from "./pages/GastosPage";
import { EmprestimoPage } from "./pages/EmprestimoPage";
import CartaoPage from "./pages/CartaoPage";
import CartaoMercadoPage from "./pages/CartaoMercadoPage";
import CartaoHistoricoPage from "./pages/CartaoHistoricoPage";
import AppDownloadPage from "./pages/AppDownloadPage";
import AppProDownloadPage from "./pages/AppProDownloadPage";
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
import { trpc } from "@/lib/trpc";
import { MaintenanceManifestGate } from "@/components/MaintenanceManifestGate";
import { isMaintenanceManifestActiveForPath } from "@shared/maintenanceManifest";

// Guard para rotas admin — redireciona para /admin/login se não autenticado
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAdminAuth();
  // Logout automático após 30 minutos de inatividade
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
  // Normalizar URL para minúscula se for /sorteio, /foto ou /acompanhar
  const normalizedPath = location.toLowerCase();

  useEffect(() => {
    const shouldNormalize = normalizedPath !== location && (normalizedPath === "/sorteio" || normalizedPath === "/foto" || normalizedPath === "/acompanhar");
    if (shouldNormalize) {
      navigate(normalizedPath);
    }
  }, [location, normalizedPath, navigate]);

  
  return (
    <Switch>
      <Route path={"/admin/login"} component={AdminLogin} />
      <Route path={"/admin/authenticator"}>
        <AdminGuard><AdminAuthenticator /></AdminGuard>
      </Route>
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
      <Route path={"/atualizarcadastro"} component={AtualizarCadastro} />
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
      <Route path={"/admin/locadora"}>
        <AdminGuard><AdminLocadora /></AdminGuard>
      </Route>
      <Route path={"/admin/consultas"}>
        <AdminGuard><AdminConsultas /></AdminGuard>
      </Route>
      <Route path={"/admin/whatsapp-templates"}>
        <AdminGuard><AdminWhatsappTemplates /></AdminGuard>
      </Route>
      <Route path={"/admin/cartoes-users"}>
        <AdminGuard><AdminCartoesUsers /></AdminGuard>
      </Route>
      <Route path={"/admin/online-support"}>
        <AdminGuard><AdminOnlineSupport /></AdminGuard>
      </Route>
      <Route path={"/admin/chat-flow"}>
        <AdminGuard><AdminChatFlow /></AdminGuard>
      </Route>
      <Route path={"/agendar/:token"} component={SchedulePage} />
      <Route path={"/orcamento/:publicToken"} component={PublicQuotePage} />
      <Route path={"/recibo/:publicToken"} component={PublicReceiptPage} />
      <Route path={"/locadora"} component={LocadoraPortal} />
      <Route path={"/locadora/"} component={LocadoraPortal} />
      <Route path={"/gastos"} component={GastosPage} />
      <Route path={"/emprestimo"} component={EmprestimoPage} />
      <Route path={"/cartoes"} component={CartaoPage} />
      <Route path={"/cartoes/cartao/:id"} component={CartaoPage} />
      <Route path={"/cartoes/despesas"} component={CartaoPage} />
      <Route path={"/cartoes/historico/:id"} component={CartaoHistoricoPage} />
      <Route path={"/cartoes/mercado"} component={CartaoMercadoPage} />
      <Route path={"/gerador-chassi"} component={GeradorChassiPublico} />
      <Route path={"/ajuda"} component={Ajuda} />
      <Route path={"/video/tutorial"} component={VideoTutorial} />
      <Route path={"/tutorial"} component={Tutorial} />
      <Route path={"/r/:slug"} component={Home} />
      <Route path={"/bot"} component={Home} />
      <Route path={"/app"} component={AppDownloadPage} />
      <Route path={"/app-pro"} component={AppProDownloadPage} />
      <Route path={"/"} component={Home} />
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
  const isAppDownloadRoute = location === "/app" || location === "/app-pro";
  const isFotoRoute = location === "/foto";
  const isResellerRoute = location.startsWith("/revendedor");
  const isAjudaRoute = location === "/ajuda";
  const isAgendarRoute = location.startsWith("/agendar");
  const isVideoRoute = location.startsWith("/video") || location === "/tutorial";
  const isGastosRoute = location.toLowerCase() === "/gastos";
  const isEmprestimoRoute = location.toLowerCase() === "/emprestimo";
  const isCartoesRoute = location === "/cartoes" || location.startsWith("/cartoes/") || location.startsWith("/cartoes");
  const isPreCadastroRoute = location === "/pre-cadastro";
  const isConsultarCadastroRoute = location === "/consultar-cadastro";
  const isAtualizarCadastroRoute = location === "/atualizarcadastro";
  const isLocadoraRoute = location === "/locadora" || location === "/locadora/";
  const isLocadoraBrandRoute = location === "/locadora" || location.startsWith("/locadora/") || location.startsWith("/admin/locadora");
  const maintenanceManifestQuery = trpc.maintenanceManifest.get.useQuery(undefined, {
    enabled: !isAdminRoute,
    staleTime: 15_000,
    refetchInterval: !isAdminRoute ? 30_000 : false,
    refetchOnWindowFocus: true,
  });
  const maintenanceManifest = maintenanceManifestQuery.data;
  const showMaintenanceManifest = maintenanceManifest
    ? isMaintenanceManifestActiveForPath(maintenanceManifest, location)
    : false;

  // Proteção anti-print para rotas de cliente
  const clientPhone = typeof window !== 'undefined' ? localStorage.getItem('walk_client_phone') || undefined : undefined;
  const { WarningOverlay } = useAntiPrint(!isAdminRoute ? clientPhone : undefined);

  // Mantém identidades instaláveis isoladas por módulo e usa o emblema H2 nas rotas gerais.
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    const theme = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
    const appleIcons = document.querySelectorAll<HTMLLinkElement>("link[rel='apple-touch-icon']");
    const favicons = document.querySelectorAll<HTMLLinkElement>("link[rel='icon'], link[rel='shortcut icon']");
    const locadoraAppleIcon = "/locadora/assets/locacar-apple-touch-icon-v1.png";
    const locadoraFavicon = "/locadora/assets/locacar-favicon-32-v1.png";
    const h2AppleIcon = "/h2-brand-180.png";
    const h2Favicon16 = "/h2-brand-16.png";
    const h2Favicon32 = "/h2-brand-32.png";
    if (isLocadoraBrandRoute) {
      if (manifest) manifest.href = "/locadora/manifest-v1.webmanifest";
      if (theme) theme.content = "#b98a2d";
      appleIcons.forEach((link) => { link.href = locadoraAppleIcon; });
      favicons.forEach((link) => { link.href = locadoraFavicon; });
      document.title = "LocaCar — Sistema de Locação";
      return;
    }
    if (isCartoesRoute) {
      if (manifest) manifest.href = "/manifest.webmanifest";
      if (theme) theme.content = "#1a0a2e";
      appleIcons.forEach((link) => { link.href = "/apple-touch-icon.png"; });
      favicons.forEach((link) => { link.href = link.sizes.value === "16x16" ? "/favicon-16x16.png" : "/favicon-32x32.png"; });
      document.title = "Meus Cartões";
      return;
    }
    if (manifest) manifest.href = isAdminRoute ? "/manifest-admin.json" : "/manifest.json";
    if (theme) theme.content = "#1a0a2e";
    appleIcons.forEach((link) => { link.href = h2AppleIcon; });
    favicons.forEach((link) => { link.href = link.sizes.value === "16x16" ? h2Favicon16 : h2Favicon32; });
    document.title = "H2 COLOMBIANO";
  }, [isAdminRoute, isCartoesRoute, isLocadoraBrandRoute]);

  // Redirect de rotas com maiúsculas para minúsculas (DEVE ficar após todos os hooks)
  if (location !== location.toLowerCase() && !isAdminRoute) {
    return <Redirect to={location.toLowerCase()} />;
  }

  if (isAdminRoute) {
    return (
      <>
        <div className="min-h-screen pb-24 sm:pb-0">
          <Router />
        </div>
        {location !== "/admin/login" && <AdminPWABanner />}
      </>
    );
  }

  // 🔧 MODO MANUTENÇÃO — bloqueia todas as rotas públicas
  if (MAINTENANCE_MODE) {
    return <MaintenancePage />;
  }

  // O manifesto bloqueia somente as rotas escolhidas pelo ADM; demais rotas seguem inalteradas.
  if (showMaintenanceManifest && maintenanceManifest) {
    return <MaintenanceManifestGate config={maintenanceManifest} />;
  }

  // Rota /gastos é pública — sem senha
  if (isGastosRoute) {
    return <Router />;
  }

  // Rota /emprestimo é pública — login inline na própria página
  if (isEmprestimoRoute) {
    return <Router />;
  }

  // Rota /cartoes é pública — sistema de cartões com login próprio
  if (isCartoesRoute) {
    return <Router />;
  }

  // Rota /login é atalho direto para o PasswordGate — mostra a tela bonita com logo, telefone/CPF e CONTINUAR
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

  // Rota /acompanhar é pública — sem senha, mas com tela de boas-vindas
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

  // Rota /ajuda é pública — página de FAQ para compartilhar pelo WhatsApp
  if (isAjudaRoute) {
    return <Router />;
  }
  // Rotas /app e /app-pro são públicas — páginas de download dos APKs Android
  if (isAppDownloadRoute) {
    return <Router />;
  }
  // Rota /pre-cadastro é pública — formulário de pré-cadastro sem senha
  if (isPreCadastroRoute) {
    return <Router />;
  }
  // Rota /consultar-cadastro é pública — consulta de status por CPF
  if (isConsultarCadastroRoute) {
    return <Router />;
  }
  // Rota /atualizarcadastro é pública e possui autenticação própria por telefone e senha.
  if (isAtualizarCadastroRoute) {
    return <Router />;
  }
  // Rota /locadora é o portal isolado do módulo; o próprio portal exige ADM para dados operacionais.
  if (isLocadoraRoute) {
    return <Router />;
  }

  // Rota /video é pública — vídeos tutoriais para clientes
  if (isVideoRoute) {
    return <Router />;
  }

  // Rota /agendar/:token é pública — cliente agenda atendimento pelo link individual
  if (isAgendarRoute) {
    return <Router />;
  }

  // Rota /sorteio é pública — não passa pelo PasswordGate do site
  // O próprio Raffle.tsx controla o acesso (livre ou com senha própria do sorteio)
  // Rota /gerador-chassi é pública — qualquer pessoa pode usar sem senha
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
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}



export default App;
