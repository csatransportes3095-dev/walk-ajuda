import { useState, useEffect, useRef } from "react";
import { ESTADOS_BR, CIDADES_POR_UF } from "@/lib/brasilData";
import { trpc } from "@/lib/trpc";
import { isValidCPF, normalizeCpf } from "@shared/cpf";
import { Zap, Lock, Eye, EyeOff, Clock, Phone, Download, X, UserPlus, MessageCircle, AlertTriangle, CheckCircle2, User, Mail, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const SESSION_KEY = "walk_access_granted";
const SESSION_CODE_KEY = "walk_access_code";
const SESSION_TYPE_KEY = "walk_access_type";
const SESSION_EXPIRES_KEY = "walk_access_expires";
const SESSION_PHONE_KEY = "walk_client_phone";
const PWA_DISMISSED_KEY = "walk_pwa_dismissed";
const CP_TOKEN_KEY = "cp_token";

interface PasswordGateProps {
  children: React.ReactNode;
}

// Hook para detectar se pode instalar o PWA
function useInstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(PWA_DISMISSED_KEY) === "true") {
      setDismissed(true);
    }
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = ("standalone" in window.navigator) && (window.navigator as any).standalone;
    if (isIOS && !isInStandaloneMode) {
      setIsInstallable(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => { window.removeEventListener("beforeinstallprompt", handler); };
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(PWA_DISMISSED_KEY, "true");
  };

  return { isInstallable, isInstalled, dismissed, install, dismiss, deferredPrompt };
}

type GateStep = "phone" | "newUser" | "indicador" | "registration" | "profilePhoto" | "referral" | "password" | "blocked" | "updateCpf" | "cpwd_create" | "cpwd_pending" | "cpwd_add_cpf" | "route_blocked";

export default function PasswordGate({ children }: PasswordGateProps) {
  const [accessGranted, setAccessGranted] = useState(false);
  const [gateStep, setGateStep] = useState<GateStep>("phone");
  const [blockedRoutes, setBlockedRoutes] = useState<string[]>([]);
  const [clientPhone, setClientPhone] = useState("");
  const [clientCpf, setClientCpf] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [accessType, setAccessType] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [showPasswordError, setShowPasswordError] = useState(false);
  const [customerBlockReason, setCustomerBlockReason] = useState<string | null>(null);

  // Campos de cadastro
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regCpf, setRegCpf] = useState("");
  const [regPhone, setRegPhone] = useState(""); // telefone editável quando entrou pelo CPF
  const [enteredByCpf, setEnteredByCpf] = useState(false); // true quando o acesso foi feito via CPF
  const [cpfDuplicado, setCpfDuplicado] = useState(false);
  const [regCep, setRegCep] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [regCity, setRegCity] = useState("");
  const [regUf, setRegUf] = useState("");
  const [regEstado, setRegEstado] = useState(""); // nome completo do estado
  const [citySearch, setCitySearch] = useState("");
  const [estadoSearch, setEstadoSearch] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showEstadoDropdown, setShowEstadoDropdown] = useState(false);
  const [regReferredBy, setRegReferredBy] = useState("");
  const [regReferredByPhone, setRegReferredByPhone] = useState("");
  const [regProfilePhoto, setRegProfilePhoto] = useState<File | null>(null);
  
  // Estados para indicador
  const [indicadorPhone, setIndicadorPhone] = useState("");
  const [bypassCode, setBypassCode] = useState("");
  const [indicadorValidationStatus, setIndicadorValidationStatus] = useState<{ valid: boolean; name?: string } | null>(null);
  const [bypassCodeValidated, setBypassCodeValidated] = useState(false);
  const [indicadorName, setIndicadorName] = useState<string | null>(null);
  const [isCheckingIndicador, setIsCheckingIndicador] = useState(false);
  const [customerExists, setCustomerExists] = useState<boolean | null>(null);
  const [indicadorData, setIndicadorData] = useState<{ name: string; profilePhotoUrl?: string } | null>(null);
  const [regProfilePhotoPreview, setRegProfilePhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  // URL da foto ja enviada (pre-upload assim que o cliente escolhe a imagem).
  // Guardamos junto o proprio File para saber se a URL corresponde a foto atual.
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploadedPhotoFile, setUploadedPhotoFile] = useState<File | null>(null);
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false);
  // Sessão pendente: salva dados da validação enquanto aguarda foto de perfil
  const [pendingSession, setPendingSession] = useState<{
    type: string;
    expiresAt: string | null;
    allowedProductIds: number[];
    clientName: string | null;
  } | null>(null);
  const [updateCpfValue, setUpdateCpfValue] = useState("");
  const [updateCpfError, setUpdateCpfError] = useState("");
  const [updateCpfLoading, setUpdateCpfLoading] = useState(false);
  // CPF obrigatório antes de criar senha
  const [cpwdAddCpfValue, setCpwdAddCpfValue] = useState("");
  const [cpwdAddCpfError, setCpwdAddCpfError] = useState("");
  const [cpwdAddCpfLoading, setCpwdAddCpfLoading] = useState(false);
  // Telefone resolvido pelo backend (quando cliente entra com CPF)
  const [resolvedPhone, setResolvedPhone] = useState("");

  const [showReferralForm, setShowReferralForm] = useState(false);
  const [urlRefCode, setUrlRefCode] = useState<string | null>(null);
  const [urlRefValid, setUrlRefValid] = useState<boolean | null>(null);
  const [urlRefName, setUrlRefName] = useState<string>('');

  const validateMutation = trpc.access.validate.useMutation();
  // Novo sistema de senha unificado
  const cpwdCheckStatusMutation = trpc.customerPassword.checkStatusMutation.useMutation();
  const cpwdLoginMutation = trpc.customerPassword.login.useMutation();
  const cpwdCreateAutoMutation = trpc.customerPassword.clientCreateAuto.useMutation();
  const cpwdCreateManualMutation = trpc.customerPassword.clientCreateManual.useMutation();
  const cpwdSaveCpfMutation = trpc.customerPassword.saveCpf.useMutation();
  // Token estabilizado em state para evitar condições de corrida durante pedido
  const [cpToken, setCpToken] = useState(() => localStorage.getItem(CP_TOKEN_KEY) || '');
  const cpwdCheckSessionQuery = trpc.customerPassword.checkSession.useQuery(
    { token: cpToken },
    {
      enabled: !!cpToken,
      staleTime: 0,                     // sempre busca dados frescos do banco
      refetchOnWindowFocus: true,       // re-executa ao voltar para a aba (pega telefone atualizado)
      refetchOnReconnect: true,         // re-executa ao reconectar
      retry: false,                     // não tentar novamente em caso de erro
    }
  );
  const [cpwdNewPassword, setCpwdNewPassword] = useState("");
  const [cpwdConfirmPassword, setCpwdConfirmPassword] = useState("");
  const [cpwdShowNew, setCpwdShowNew] = useState(false);
  const [cpwdShowConfirm, setCpwdShowConfirm] = useState(false);
  const [cpwdIsCreating, setCpwdIsCreating] = useState(false);
  const customerCheckQuery = trpc.customers.checkByPhone.useQuery(
    { phone: getPhoneDigits(clientPhone) },
    { enabled: false }
  );
  const checkByPhoneMutation = trpc.customers.checkByPhoneMutation.useMutation();
  const indicadorCheckQuery = trpc.customers.checkByPhone.useQuery(
    { phone: indicadorPhone },
    { enabled: false }
  );
  const registerMutation = trpc.customers.register.useMutation();
  const updateCpfMutation = trpc.customers.updateCpfByPhone.useMutation();
  const uploadProfilePhotoMutation = trpc.customers.uploadProfilePhoto.useMutation();
  const updateReferralMutation = trpc.customers.updateReferral.useMutation();
  const recordReferralUsageMutation = trpc.referral.recordUsage.useMutation();
  const startRefSessionMutation = trpc.referral.startRefSession.useMutation();
  const [refSessionActive, setRefSessionActive] = useState(false);
  const [refSessionOwner, setRefSessionOwner] = useState<string>('');
  const [refSessionExpiresAt, setRefSessionExpiresAt] = useState<number | null>(null);
  const { isInstallable, isInstalled, dismissed, install, dismiss, deferredPrompt } = useInstallPWA();
  const { data: settings } = trpc.settings.getAll.useQuery();
  const { data: photoModeData } = trpc.appSettings.getPhotoMode.useQuery();
  const photoMode = photoModeData?.mode ?? 'both';

  // Refs para file inputs (para acionar via botões)
  const cameraInputRegRef = useRef<HTMLInputElement>(null);
  const galleryInputRegRef = useRef<HTMLInputElement>(null);
  const cameraInputProfileRef = useRef<HTMLInputElement>(null);
  const galleryInputProfileRef = useRef<HTMLInputElement>(null);

  // Configurações da tela de login
  const loginTitle = settings?.login_title || 'WALK AJUDA';
  const loginSubtitle = settings?.login_subtitle || 'Acesso Restrito';
  const loginFooter = settings?.login_footer || 'Solicite sua senha de acesso via WhatsApp';
  const loginImageUrl = settings?.login_image_url || '';
  const loginShowImage = settings?.login_show_image !== '0';
  const loginShowTitle = settings?.login_show_title !== '0';
  const loginShowSubtitle = settings?.login_show_subtitle !== '0';
  const loginShowFooter = settings?.login_show_footer !== '0';
  const whatsappNumberRaw = settings?.whatsapp_number || '5511978307371';
  const WHATSAPP_NUMBER = whatsappNumberRaw.replace(/[^\d+]/g, '');

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Detecção de câmera disponível no dispositivo
  const [hasCameraDevice, setHasCameraDevice] = useState<boolean | null>(null);
  useEffect(() => {
    if (photoMode !== 'camera') return; // só verifica quando câmera é obrigatória
    if (!navigator.mediaDevices?.enumerateDevices) {
      setHasCameraDevice(false);
      return;
    }
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const hasVideo = devices.some((d) => d.kind === 'videoinput');
      setHasCameraDevice(hasVideo);
    }).catch(() => setHasCameraDevice(false));
  }, [photoMode]);

  // Aceita colagem com +55/DDDnúmero sem confundir o código do Brasil com o DDD.
  function normalizeBrazilPhone(value: string) {
    const raw = value.replace(/\D/g, '');
    const withoutCountryCode = raw.startsWith('55') && (raw.length === 12 || raw.length === 13)
      ? raw.slice(2)
      : raw;
    return withoutCountryCode.slice(0, 11);
  }

  // Máscara de telefone: (XX) XXXXX-XXXX
  function formatPhone(value: string) {
    const digits = normalizeBrazilPhone(value);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function getPhoneDigits(value: string) {
    return normalizeBrazilPhone(value);
  }

  // Capturar ?ref= da URL ao carregar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setUrlRefCode(ref);
      // Limpar da URL sem recarregar
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Verificar acesso na sessão
  useEffect(() => {
    // Primeiro verificar cp_token (novo sistema unificado)
    const storedCpToken = localStorage.getItem(CP_TOKEN_KEY);
    if (storedCpToken) {
      // A query cpwdCheckSessionQuery vai verificar automaticamente
      // O resultado é tratado no useEffect abaixo
      // Sincronizar state com localStorage na inicialização
      setCpToken(storedCpToken);
      return;
    }
    // Fallback: verificar sessão antiga (walk_access_granted)
    // APENAS se o modo manual NÃO estiver ativo
    // Quando modo manual está ativo, apenas cp_token é aceito
    const sessionAccess = localStorage.getItem(SESSION_KEY);
    if (sessionAccess === "true") {
      // Verificar no backend se o modo manual está ativo
      // Se estiver, limpar sessão antiga e exigir novo login
      fetch('/api/trpc/appSettings.getManualMode')
        .then(r => r.json())
        .then(data => {
          const isManual = data?.result?.data?.json?.isManual ?? false;
          if (isManual) {
            // Modo manual ativo: sessão antiga não é válida, limpar tudo
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_CODE_KEY);
            localStorage.removeItem(SESSION_TYPE_KEY);
            localStorage.removeItem(SESSION_EXPIRES_KEY);
            localStorage.removeItem(SESSION_PHONE_KEY);
            setAccessGranted(false);
          } else {
            // Modo auto: aceitar sessão antiga normalmente
            setAccessGranted(true);
            const savedType = localStorage.getItem(SESSION_TYPE_KEY);
            if (savedType) setAccessType(savedType);
            if (savedType === "vip") {
              const expiresAtStr = localStorage.getItem(SESSION_EXPIRES_KEY);
              if (expiresAtStr) {
                const expiresAt = new Date(expiresAtStr).getTime();
                const now = Date.now();
                const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
                setTimeRemaining(remaining);
              }
            }
          }
        })
        .catch(() => {
          // Em caso de erro, manter sessão antiga por segurança
          setAccessGranted(true);
          const savedType = localStorage.getItem(SESSION_TYPE_KEY);
          if (savedType) setAccessType(savedType);
        });
    }
  }, []);

  // Verificar resultado do checkSession do novo sistema
  useEffect(() => {
    if (cpwdCheckSessionQuery.data !== undefined) {
      if (cpwdCheckSessionQuery.data.valid) {
        const phone = cpwdCheckSessionQuery.data.phone || localStorage.getItem(SESSION_PHONE_KEY) || '';
        if (phone) {
          localStorage.setItem(SESSION_PHONE_KEY, phone);
          setClientPhone(phone);
        }
        setAccessGranted(true);
        setAccessType('customer');
      } else if (!accessGranted) {
        // Token inválido: só limpar se o cliente NÃO estava logado
        // (evita logout durante pedido ativo por erro transitório)
        localStorage.removeItem(CP_TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_TYPE_KEY);
        localStorage.removeItem(SESSION_PHONE_KEY);
        setAccessGranted(false);
      }
    }
  }, [cpwdCheckSessionQuery.data]);

  // Validar indicador quando o telefone muda
  useEffect(() => {
    if (indicadorPhone.length === 11 && !bypassCode && isCheckingIndicador) {
      indicadorCheckQuery.refetch().then((result: any) => {
        if (result.data?.exists && result.data?.customer) {
          setIndicadorName(result.data.customer.name || null);
          setIndicadorData({
            name: result.data.customer.name || '',
            profilePhotoUrl: result.data.customer.profilePhotoUrl || undefined
          });
        } else {
          setIndicadorName(null);
          setIndicadorData(null);
        }
        setIsCheckingIndicador(false);
      }).catch(() => {
        setIndicadorName(null);
        setIndicadorData(null);
        setIsCheckingIndicador(false);
      });
    }
  }, [indicadorPhone, bypassCode, isCheckingIndicador, indicadorCheckQuery]);

  // Cronômetro regressivo e logout automático
  // Usa expiresAt do localStorage como fonte de verdade para não deslogar ao voltar do PIX
  useEffect(() => {
    const isVIP = localStorage.getItem(SESSION_TYPE_KEY) === "vip";
    if (!accessGranted || !isVIP) return;
    const expiresAtStr = localStorage.getItem(SESSION_EXPIRES_KEY);
    if (!expiresAtStr) return;
    const doLogout = () => {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_CODE_KEY);
      localStorage.removeItem(SESSION_TYPE_KEY);
      localStorage.removeItem(SESSION_EXPIRES_KEY);
      setAccessGranted(false);
      setPassword("");
      setClientPhone("");
      setTimeRemaining(null);
      setGateStep("phone");
      toast.error("Sua senha expirou. Solicite uma nova via WhatsApp.");
    };
    const tick = () => {
      const expiresAt = new Date(expiresAtStr).getTime();
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeRemaining(remaining);
      if (remaining === 0) doLogout();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [accessGranted]);

  // Helper: obtém o telefone canônico para operações (resolvedPhone se disponível, senão clientPhone)
  const getCanonicalPhone = () => resolvedPhone || getPhoneDigits(clientPhone);

  // Step 1: Verificar telefone ou CPF
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneDigits = getPhoneDigits(clientPhone);
    const cpfDigits = normalizeCpf(clientCpf);
    if (cpfDigits.length === 11 && !isValidCPF(cpfDigits)) {
      toast.error('CPF inválido. Digite um CPF válido para continuar.');
      return;
    }
    // Usar telefone se preenchido, senão CPF
    const inputDigits = phoneDigits.length === 11 ? phoneDigits : cpfDigits;
    if (inputDigits.length !== 11) {
      if (phoneDigits.length > 0 && phoneDigits.length !== 11) {
        toast.error("Telefone deve ter 11 dígitos (DDD + número)");
      } else if (cpfDigits.length > 0 && cpfDigits.length !== 11) {
        toast.error("CPF deve ter 11 dígitos");
      } else {
        toast.error("Preencha o telefone ou o CPF para continuar");
      }
      return;
    }
    setIsCheckingPhone(true);
    try {
      // Verificar status da senha (aceita telefone ou CPF)
      const cpwdStatus = await cpwdCheckStatusMutation.mutateAsync({ phone: inputDigits, isCpf: phoneDigits.length !== 11 && cpfDigits.length === 11 });
      const status = cpwdStatus?.status;

      // Se o backend resolveu um telefone diferente (cliente entrou com CPF), guardar
      const canonical = (cpwdStatus as any)?.phone || inputDigits;
      setResolvedPhone(canonical);

      if (status === 'not_found') {
        // Não encontrado pelo novo sistema → tentar checkByPhone para cadastro
        const result = await checkByPhoneMutation.mutateAsync({ phone: inputDigits });
        if (result?.blocked) {
          setGateStep("blocked");
          return;
        }
        if ((result as any)?.customerBlocked) {
          setCustomerBlockReason((result as any).blockReason || null);
          setGateStep("blocked");
          return;
        }
        if (result?.exists) {
          setCustomerExists(true);
          // Fallback: cliente existe mas não foi encontrado pelo cpwd → ir para senha
          setGateStep("password");
        } else {
          setCustomerExists(false);
          setRegReferredByPhone("");
          // Se entrou pelo CPF, pré-preencher o CPF no formulário e deixar telefone livre
          const byCpf = clientCpf.replace(/\D/g, '').length === 11;
          setEnteredByCpf(byCpf);
          if (byCpf) {
            setRegCpf(clientCpf); // pré-preencher CPF
            setRegPhone(""); // telefone livre
          } else {
            // Garantir que clientPhone está definido com os dígitos corretos
            setClientPhone(inputDigits);
            sessionStorage.setItem('reg_phone_temp', inputDigits);
            setRegCpf(""); // CPF livre
          }
          setGateStep("registration");
        }
        return;
      }

      if (status === 'blocked') {
        setGateStep("blocked");
        return;
      }

      setCustomerExists(true);

      // Verificar link de indicação
      if (urlRefCode) {
        try {
          const refResult = await startRefSessionMutation.mutateAsync({
            code: urlRefCode,
            phone: canonical,
          });
          if (refResult.success && refResult.expiresAt) {
            setRefSessionActive(true);
            setRefSessionOwner(refResult.ownerName || '');
            setRefSessionExpiresAt(refResult.expiresAt);
            setAccessGranted(true);
            setAccessType('ref_link');
            localStorage.setItem(SESSION_KEY, 'true');
            localStorage.setItem(SESSION_TYPE_KEY, 'ref_link');
            localStorage.setItem(SESSION_PHONE_KEY, canonical);
            const expiresDate = new Date(refResult.expiresAt);
            localStorage.setItem(SESSION_EXPIRES_KEY, expiresDate.toISOString());
            localStorage.setItem('ref_link_owner', refResult.ownerName || '');
            setTimeRemaining(Math.max(0, Math.floor((refResult.expiresAt - Date.now()) / 1000)));
            toast.success(`Acesso liberado por 30 minutos via link de indicação!`);
            return;
          } else if (refResult.expired) {
            toast.info('Seu acesso por link expirou. Digite sua senha para continuar.');
          }
        } catch { /* continua para senha */ }
      }

      const hasCpf = (cpwdStatus as any)?.hasCpf ?? true;
      // Verificar foto de perfil usando mutation com telefone canônico
      const checkResult = await checkByPhoneMutation.mutateAsync({ phone: canonical });
      if ((checkResult as any)?.customerBlocked) {
        setCustomerBlockReason((checkResult as any).blockReason || null);
        setGateStep("blocked");
        return;
      }
      const hasPhoto = !!(checkResult?.customer?.profilePhotoUrl);

      if (status === 'no_password' || status === 'expired') {
        if (!hasPhoto) {
          setGateStep("profilePhoto");
        } else if (!hasCpf) {
          setGateStep("cpwd_add_cpf");
        } else {
          setGateStep("cpwd_create");
        }
      } else if (status === 'pending_approval') {
        setGateStep("cpwd_pending");
      } else if (status === 'active') {
        if (!hasPhoto) {
          setGateStep("profilePhoto");
        } else {
          setGateStep("password");
        }
      } else {
        setGateStep("password");
      }
    } catch {
      // Fallback: tentar cadastro
      const result = await customerCheckQuery.refetch().catch(() => ({ data: null }));
      if (result.data?.exists) {
        setCustomerExists(true);
        setGateStep("password");
      } else {
        setCustomerExists(false);
        setClientPhone(inputDigits);
        sessionStorage.setItem('reg_phone_temp', inputDigits);
        setGateStep("registration");
      }
    } finally {
      setIsCheckingPhone(false);
    }
  };

  // Step 2: Cadastro
  // Validação de CPF
  // Busca CEP via ViaCEP
  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        const uf = data.uf?.toUpperCase() || '';
        const cidade = data.localidade || '';
        const estadoObj = ESTADOS_BR.find(e => e.uf === uf);
        if (estadoObj) {
          setRegUf(uf);
          setRegEstado(estadoObj.nome);
          setEstadoSearch(estadoObj.nome);
        }
        if (cidade) {
          // Tenta encontrar a cidade exata na lista (case-insensitive)
          const cidadesDoUf = (CIDADES_POR_UF as Record<string, string[]>)[uf] || [];
          const cidadeExata = cidadesDoUf.find(c => c.toLowerCase() === cidade.toLowerCase()) || cidade.toUpperCase();
          setRegCity(cidadeExata);
          setCitySearch(cidadeExata);
          setShowCityDropdown(false); // Fecha dropdown após preenchimento automático
          setShowEstadoDropdown(false);
        }
        toast.success(`CEP encontrado: ${cidade} - ${uf}`);
      } else {
        toast.error('CEP não encontrado. Preencha o estado e cidade manualmente.');
      }
    } catch {
      toast.error('Erro ao buscar CEP. Preencha manualmente.');
    } finally {
      setCepLoading(false);
    }
  }

  function formatCep(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0,5)}-${digits.slice(5)}`;
  }

  function formatCpf(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0,3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
  }

  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) { toast.error("Preencha seu nome completo"); return; }
    if (!regEmail.trim()) { toast.error("Preencha seu email"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) { toast.error("Email inválido"); return; }
    if (!regCpf.trim() || regCpf.replace(/\D/g,'').length !== 11) { toast.error("Preencha o CPF"); return; }
    if (!isValidCPF(regCpf)) { toast.error("CPF inválido. Verifique os números e tente novamente."); return; }
    if (!enteredByCpf && cpfDuplicado) { toast.error("Este CPF já está cadastrado no sistema."); return; }
    // Quando entrou pelo CPF, telefone é obrigatório
    if (enteredByCpf && getPhoneDigits(regPhone).length !== 11) { toast.error("Preencha o telefone com DDD (11 dígitos)"); return; }
    if (!regCity.trim()) { toast.error("Selecione a cidade"); return; }
    if (!regUf) { toast.error("Selecione o estado"); return; }
    const referredPhoneDigits = getPhoneDigits(regReferredByPhone);
    // Telefone do cliente: se entrou pelo CPF usa regPhone, senão usa clientPhone
    // Restaurar do sessionStorage se o estado foi perdido (ex: iOS remontou o componente)
    const storedPhone = sessionStorage.getItem('reg_phone_temp') || '';
    const effectiveClientPhone = getPhoneDigits(clientPhone).length === 11 ? clientPhone : storedPhone;
    const clientPhoneDigits = enteredByCpf ? getPhoneDigits(regPhone) : getPhoneDigits(effectiveClientPhone);
    // Validação extra: garantir que o telefone não está vazio
    if (clientPhoneDigits.length < 10) {
      toast.error("Telefone inválido. Volte e digite o telefone com DDD.");
      return;
    }
    
    // Validar indicador apenas se foi preenchido (pode estar vazio se usou código de bypass)
    if (referredPhoneDigits.length > 0) {
      if (referredPhoneDigits.length !== 11) {
        toast.error("Telefone do indicador deve ter 11 dígitos");
        return;
      }
      if (referredPhoneDigits === clientPhoneDigits) {
        toast.error("Você não pode indicar a si mesmo");
        return;
      }
    }
    // SEGURANÇA: foto é obrigatória - não pode cadastrar sem foto
    if (!regProfilePhoto) {
      toast.error("Foto de perfil é obrigatória para continuar o cadastro.");
      return;
    }
    try {
      // A foto TEM que virar URL antes de finalizar. Normalmente ela ja foi
      // enviada em segundo plano (pre-upload) assim que o cliente a escolheu,
      // entao aqui so reaproveitamos a URL pronta. So reenviamos se ainda nao
      // subiu (ex.: pre-upload falhou ou ainda estava em andamento).
      let finalPhotoUrl = (uploadedPhotoUrl && uploadedPhotoFile === regProfilePhoto) ? uploadedPhotoUrl : '';
      if (!finalPhotoUrl) {
        setIsUploadingPhoto(true);
        try {
          finalPhotoUrl = await uploadPhotoWithRetry(regProfilePhoto);
          setUploadedPhotoUrl(finalPhotoUrl);
          setUploadedPhotoFile(regProfilePhoto);
          setPhotoUploadFailed(false);
        } catch (err) {
          setPhotoUploadFailed(true);
          const msg = err instanceof Error && err.message.startsWith('Tempo esgotado')
            ? 'A foto demorou demais para enviar (conexão lenta). Tente novamente em um sinal melhor ou use uma foto menor.'
            : 'Erro ao enviar foto. Verifique sua conexão e tente novamente.';
          toast.error(msg);
          setIsUploadingPhoto(false);
          return;
        } finally {
          setIsUploadingPhoto(false);
        }
      }
      if (!finalPhotoUrl) {
        toast.error("Erro ao enviar foto. Tente novamente.");
        return;
      }
      const result = await registerMutation.mutateAsync({
        name: regName.trim(),
        phone: clientPhoneDigits,
        email: regEmail.trim(),
        cpf: regCpf.trim(),
        city: regCity.trim(),
        uf: regUf,
        referredBy: regReferredBy.trim() || undefined,
        referredByPhone: referredPhoneDigits.length === 11 ? referredPhoneDigits : undefined,
        profilePhotoUrl: finalPhotoUrl,
        bypassCode: bypassCode.trim().length > 0 ? bypassCode.trim() : undefined,
      });
      if (result.blocked) {
        toast.error(result.message || 'Cadastro não permitido. Entre em contato pelo WhatsApp.');
        return;
      }
      if (result.duplicateCpf) {
        toast.error(result.message || 'CPF já registrado no sistema.');
        setCpfDuplicado(true);
        return;
      }
      // Tratar QUALQUER falha do backend mostrando a mensagem (evita falha silenciosa)
      if (!result.success) {
        toast.error(result.message || 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
        return;
      }
      if (result.success) {
        toast.success("Cadastro realizado com sucesso!");
        // Se veio por link de indicação, liberar acesso automático sem exigir senha
        if (urlRefCode) {
          try {
            const refResult = await startRefSessionMutation.mutateAsync({
              code: urlRefCode,
              phone: clientPhoneDigits,
            });
            if (refResult.success && refResult.expiresAt) {
              setRefSessionActive(true);
              setRefSessionOwner(refResult.ownerName || '');
              setRefSessionExpiresAt(refResult.expiresAt);
              setAccessGranted(true);
              setAccessType('ref_link');
              localStorage.setItem(SESSION_KEY, 'true');
              localStorage.setItem(SESSION_TYPE_KEY, 'ref_link');
              localStorage.setItem(SESSION_PHONE_KEY, clientPhoneDigits);
              const expiresDate = new Date(refResult.expiresAt);
              localStorage.setItem(SESSION_EXPIRES_KEY, expiresDate.toISOString());
              localStorage.setItem('ref_link_owner', refResult.ownerName || '');
              setTimeRemaining(Math.max(0, Math.floor((refResult.expiresAt - Date.now()) / 1000)));
              toast.success('Acesso liberado via link de indicação!');
              return;
            }
          } catch { /* fallback para senha */ }
        }
        // Se entrou pelo CPF, atualizar clientPhone com o telefone digitado no formulário
        if (enteredByCpf && getPhoneDigits(regPhone).length === 11) {
          setClientPhone(regPhone);
          setResolvedPhone(getPhoneDigits(regPhone));
        }
        // Ir para a tela de criar senha (novo sistema)
        setGateStep("cpwd_create");
      }
        } catch (err: any) {
      const msg = err?.message || err?.data?.message || (err?.shape?.message) || '';
      toast.error(msg || "Erro ao realizar cadastro. Tente novamente.");
      console.error('[Register error]', err);
    }
  };
  // Helper base: ler arquivo como base64 puro (fallback bruto)
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          if (!result) { reject(new Error('FileReader retornou resultado vazio')); return; }
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          if (!base64 || base64.length === 0) { reject(new Error('Base64 vazio')); return; }
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.onabort = () => reject(new Error('Leitura abortada'));
        reader.readAsDataURL(file);
      } catch (error) {
        reject(new Error(`Erro ao iniciar leitura: ${error instanceof Error ? error.message : 'desconhecido'}`));
      }
    });
  };

  // Helper: comprimir/converter imagem para JPEG via canvas antes do upload.
  // Resolve HEIC do iPhone, corrige orientacao e reduz o tamanho do arquivo.
  // Retorna SEMPRE base64 JPEG. Se o canvas falhar, cai no fallback bruto.
  const fileToBase64 = async (file: File): Promise<string> => {
    const MAX_DIM = 1200;
    const QUALITY = 0.85;
    try {
      let width = 0, height = 0;
      let drawSource: CanvasImageSource | null = null;
      let objectUrl: string | null = null;
      try {
        // createImageBitmap decodifica HEIC/JPEG/PNG e respeita a orientacao EXIF
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
        width = bitmap.width; height = bitmap.height; drawSource = bitmap;
      } catch {
        // Fallback: carregar via <img> + objectURL
        objectUrl = URL.createObjectURL(file);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('Falha ao decodificar imagem'));
          im.src = objectUrl as string;
        });
        width = img.naturalWidth; height = img.naturalHeight; drawSource = img;
      }
      if (!width || !height || !drawSource) throw new Error('Dimensoes invalidas');
      let w = width, h = height;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w >= h) { h = Math.round(h * (MAX_DIM / w)); w = MAX_DIM; }
        else { w = Math.round(w * (MAX_DIM / h)); h = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas nao suportado');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(drawSource, 0, 0, w, h);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const closable = drawSource as unknown as { close?: () => void };
      if (typeof closable.close === 'function') { try { closable.close(); } catch { /* noop */ } }
      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      if (!base64 || base64.length < 100) throw new Error('Resultado da compressao vazio');
      return base64;
    } catch {
      // Fallback: enviar arquivo original em base64 (navegador sem suporte a canvas/bitmap)
      return await readFileAsBase64(file);
    }
  };

  // Helper: envia a foto com 1 tentativa extra automatica em caso de falha de rede/timeout.
  // Retorna a URL salva. Lanca erro apenas se ambas as tentativas falharem.
  // Envolve uma promise com um tempo-limite para evitar que o upload fique
  // "pendurado" para sempre em redes de celular instaveis (sem isso, o app
  // trava sem erro e o cadastro nunca avanca).
  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Tempo esgotado: ${label}`)), ms);
      p.then((v) => { clearTimeout(timer); resolve(v); })
       .catch((e) => { clearTimeout(timer); reject(e); });
    });
  };

  const uploadPhotoWithRetry = async (file: File): Promise<string> => {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Processamento local (compressao/canvas) tambem com timeout de seguranca
        const base64 = await withTimeout(fileToBase64(file), 20000, 'processando a foto');
        const res = await withTimeout(
          uploadProfilePhotoMutation.mutateAsync({
            imageBase64: base64,
            phone: getCanonicalPhone() || getPhoneDigits(clientPhone),
          }),
          45000,
          'enviando a foto'
        );
        if (res?.url) return res.url;
        throw new Error('URL nao retornada');
      } catch (err) {
        lastErr = err;
        if (attempt < 3) { await new Promise((r) => setTimeout(r, 1000)); }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Falha no upload da foto');
  };

  // Step 2.5: Upload de foto de perfil
  const handleProfilePhotoUpload = async () => {
    if (!regProfilePhoto) {
      toast.error("Selecione uma foto de perfil");
      return;
    }
    setIsUploadingPhoto(true);
    try {
      try {
        await uploadPhotoWithRetry(regProfilePhoto);
        toast.success("Foto enviada com sucesso!");
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('Erro ao processar foto:', errorMsg);
        toast.error("Erro ao enviar foto. Verifique sua conexão e tente novamente.");
        setIsUploadingPhoto(false);
        return;
      }
      // Se há sessão pendente (cliente que já tinha senha e estava sem foto),
      // liberar acesso diretamente sem pedir senha de novo
      if (pendingSession) {
        const sess = pendingSession;
        // Verificar se o cliente tem CPF cadastrado antes de liberar
        const customerCheck2 = await customerCheckQuery.refetch();
        if (!(customerCheck2.data?.customer as any)?.cpf) {
          // Sem CPF → forçar atualização
          setGateStep("updateCpf");
          setIsUploadingPhoto(false);
          return;
        }
        setPendingSession(null);
        setAccessGranted(true);
        setAccessType(sess.type);
        localStorage.setItem(SESSION_KEY, "true");
        localStorage.setItem(SESSION_CODE_KEY, password);
        localStorage.setItem(SESSION_TYPE_KEY, sess.type);
        localStorage.setItem(SESSION_PHONE_KEY, getPhoneDigits(clientPhone));
        if (sess.type === "vip") {
          if (sess.expiresAt) {
            const expiresAt = new Date(sess.expiresAt);
            localStorage.setItem(SESSION_EXPIRES_KEY, expiresAt.toISOString());
            setTimeRemaining(Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
          } else {
            const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
            localStorage.setItem(SESSION_EXPIRES_KEY, expiresAt.toISOString());
            setTimeRemaining(20 * 60);
          }
          if (sess.allowedProductIds.length > 0) {
            localStorage.setItem('vip_allowed_products', JSON.stringify(sess.allowedProductIds));
          } else {
            localStorage.removeItem('vip_allowed_products');
          }
          toast.success(`Acesso VIP concedido${sess.clientName ? ` - ${sess.clientName}` : ""}!`);
        } else {
          setTimeRemaining(null);
          toast.success("Acesso concedido!");
        }
      } else if (urlRefCode) {
        // Veio por link de indicação: liberar acesso automático sem senha
        try {
          const refResult = await startRefSessionMutation.mutateAsync({
            code: urlRefCode,
            phone: getPhoneDigits(clientPhone),
          });
          if (refResult.success && refResult.expiresAt) {
            setRefSessionActive(true);
            setRefSessionOwner(refResult.ownerName || '');
            setRefSessionExpiresAt(refResult.expiresAt);
            setAccessGranted(true);
            setAccessType('ref_link');
            localStorage.setItem(SESSION_KEY, 'true');
            localStorage.setItem(SESSION_TYPE_KEY, 'ref_link');
            localStorage.setItem(SESSION_PHONE_KEY, getPhoneDigits(clientPhone));
            const expiresDate = new Date(refResult.expiresAt);
            localStorage.setItem(SESSION_EXPIRES_KEY, expiresDate.toISOString());
            localStorage.setItem('ref_link_owner', refResult.ownerName || '');
            setTimeRemaining(Math.max(0, Math.floor((refResult.expiresAt - Date.now()) / 1000)));
            toast.success('Acesso liberado via link de indicação!');
          } else {
            setGateStep("password");
          }
        } catch {
          setGateStep("password");
        }
      } else {
        // Verificar status da senha para decidir próximo step
        const cpwdStatus = await cpwdCheckStatusMutation.mutateAsync({ phone: getPhoneDigits(clientPhone) });
        const st = cpwdStatus?.status;
        if (st === 'active') {
          setGateStep("password");
        } else if (st === 'pending_approval') {
          setGateStep("cpwd_pending");
        } else {
          setGateStep("cpwd_create");
        }
      }
    } catch {
      toast.error("Erro ao enviar foto. Tente novamente.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // iPhone/alguns Android enviam type vazio ou HEIC/HEIF. Aceitar por tipo OU extensao.
      const name = (file.name || '').toLowerCase();
      const isImageType = file.type.startsWith('image/');
      const hasImageExt = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/.test(name);
      const typeUnknown = !file.type; // navegador nao informou o MIME
      if (!isImageType && !hasImageExt && !typeUnknown) {
        toast.error("Selecione apenas arquivos de imagem");
        return;
      }
      // Limite maior porque a imagem sera comprimida no envio (fotos de iPhone sao grandes)
      if (file.size > 25 * 1024 * 1024) {
        toast.error("A foto deve ter no máximo 25MB");
        return;
      }
      setRegProfilePhoto(file);
      // Preview seguro: se createObjectURL falhar em algum formato, ignora sem quebrar
      try {
        const url = URL.createObjectURL(file);
        setRegProfilePhotoPreview(url);
      } catch {
        setRegProfilePhotoPreview(null);
      }
      // PRE-UPLOAD: comeca a enviar a foto AGORA (assim que o cliente escolhe),
      // para que a URL ja esteja pronta quando ele clicar em CADASTRAR. Isso evita
      // que o cadastro fique preso esperando o upload em celulares/redes lentas.
      preUploadPhoto(file);
    }
  };

  // Faz o upload da foto em segundo plano e guarda a URL resultante.
  // Se falhar, marca photoUploadFailed para que o clique em CADASTRAR tente de novo.
  const preUploadPhoto = async (file: File) => {
    setUploadedPhotoUrl(null);
    setUploadedPhotoFile(null);
    setPhotoUploadFailed(false);
    setIsUploadingPhoto(true);
    try {
      const url = await uploadPhotoWithRetry(file);
      setUploadedPhotoUrl(url);
      setUploadedPhotoFile(file);
      setPhotoUploadFailed(false);
    } catch {
      setUploadedPhotoUrl(null);
      setUploadedPhotoFile(null);
      setPhotoUploadFailed(true);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Step 3: Validar senha (novo sistema unificado customerPassword)
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error("Digite a senha de acesso");
      return;
    }
    setIsValidating(true);
    try {
      const result = await cpwdLoginMutation.mutateAsync({ phone: getCanonicalPhone(), password });
      if (result.success && result.token) {
        localStorage.setItem(CP_TOKEN_KEY, result.token);
        localStorage.setItem(SESSION_PHONE_KEY, getCanonicalPhone());
        setCpToken(result.token); // estabilizar token em state
        setAccessGranted(true);
        setAccessType('customer');
        setTimeRemaining(null);
        toast.success("Acesso concedido!");
      } else if (!result.success) {
        if (result.error === 'wrong_password') {
          toast.error("Senha incorreta. Tente novamente.");
          setPassword("");
          setShowPasswordError(true);
        } else if (result.error === 'pending_approval') {
          toast.info("Sua senha ainda está aguardando aprovação.");
          setGateStep("cpwd_pending");
        } else if (result.error === 'expired') {
          toast.info("Sua senha expirou. Crie uma nova senha.");
          setGateStep("cpwd_create");
        } else {
          toast.error("Erro ao validar senha. Tente novamente.");
          setPassword("");
          setShowPasswordError(true);
        }
      }
    } catch {
      toast.error("Erro ao validar senha. Tente novamente.");
    } finally {
      setIsValidating(false);
    }
  };

  // Handler para criar nova senha (novo sistema)
  const handleCpwdCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpwdNewPassword.trim() || cpwdNewPassword.length < 4) {
      toast.error("A senha deve ter pelo menos 4 caracteres");
      return;
    }
    if (cpwdNewPassword !== cpwdConfirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setCpwdIsCreating(true);
    try {
      // Tentar modo auto primeiro, se falhar usar manual
      try {
        const result = await cpwdCreateAutoMutation.mutateAsync({
          phone: getCanonicalPhone(),
          password: cpwdNewPassword,
        });
        if (result.success && result.token) {
          localStorage.setItem(CP_TOKEN_KEY, result.token);
          localStorage.setItem(SESSION_PHONE_KEY, getCanonicalPhone());
          setCpToken(result.token); // estabilizar token em state
          setAccessGranted(true);
          setAccessType('customer');
          setTimeRemaining(null);
          toast.success("Senha criada! Acesso liberado.");
          return;
        }
      } catch (autoErr: any) {
        // Modo auto desativado: usar modo manual
        if (autoErr?.data?.code === 'FORBIDDEN') {
          const manualResult = await cpwdCreateManualMutation.mutateAsync({
            phone: getCanonicalPhone(),
            password: cpwdNewPassword,
          });
          if (manualResult.success) {
            setGateStep("cpwd_pending");
            toast.info("Senha criada! Aguardando aprovação do administrador.");
            return;
          }
        }
        throw autoErr;
      }
    } catch {
      toast.error("Erro ao criar senha. Tente novamente.");
    } finally {
      setCpwdIsCreating(false);
    }
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const [, navigate] = useLocation();
  // Redirecionar para /sorteio se o tipo de acesso for raffle
  useEffect(() => {
    if (accessGranted && accessType === 'raffle') {
      navigate('/sorteio');
    }
  }, [accessGranted, accessType]);

  // ── Verificação de cadastro completo ─────────────────────────────────────
  const canonicalPhone = resolvedPhone || getPhoneDigits(clientPhone);

  const profileCheckQuery = trpc.customers.checkByPhone.useQuery(
    { phone: canonicalPhone },
    { enabled: accessGranted && !!canonicalPhone, staleTime: 0, refetchOnWindowFocus: true }
  );
  const updateEmailForCompleteMutation = trpc.customers.updateEmailByPhone.useMutation();
  const updateCpfForCompleteMutation = trpc.customers.updateCpfByPhone.useMutation();
  const [completeEmail, setCompleteEmail] = useState("");
  const [completeCpf, setCompleteCpf] = useState("");
  const [completeSaving, setCompleteSaving] = useState(false);

  const profileData = profileCheckQuery.data?.customer as any;
  const profileLoading = profileCheckQuery.isLoading;
  const missingEmail = accessGranted && !profileLoading && profileData && !profileData.email;
  const missingCpf = accessGranted && !profileLoading && profileData && !profileData.cpf;
  const hasIncomplete = missingEmail || missingCpf;

  const handleCompleteProfile = async () => {
    if (missingEmail && !completeEmail.match(/^[^@]+@[^@]+\.[^@]+$/)) {
      toast.error("Digite um e-mail válido");
      return;
    }
    if (missingCpf && completeCpf.replace(/\D/g, "").length !== 11) {
      toast.error("Digite um CPF válido com 11 dígitos");
      return;
    }
    setCompleteSaving(true);
    try {
      if (missingEmail) {
        const r = await updateEmailForCompleteMutation.mutateAsync({ phone: canonicalPhone, email: completeEmail.trim() });
        if (!r.success) { toast.error(r.message || "Erro ao salvar e-mail"); setCompleteSaving(false); return; }
      }
      if (missingCpf) {
        const r = await updateCpfForCompleteMutation.mutateAsync({ phone: canonicalPhone, cpf: completeCpf.replace(/\D/g, "") });
        if (!r.success) { toast.error(r.message || "Erro ao salvar CPF"); setCompleteSaving(false); return; }
      }
      toast.success("Cadastro completado com sucesso!");
      profileCheckQuery.refetch();
    } catch {
      toast.error("Erro ao salvar dados. Tente novamente.");
    }
    setCompleteSaving(false);
  };

  // Verificar permissão de rota 'site' (só para clientes com cp_token, ou seja, cadastro novo)
  const cpTokenForRoute = localStorage.getItem(CP_TOKEN_KEY) || '';
  const routeAccessSiteQuery = trpc.spreadsheet.checkRouteAccess.useQuery(
    { token: cpTokenForRoute, route: 'site' },
    { enabled: accessGranted && accessType === 'customer' && !!cpTokenForRoute, staleTime: 0 }
  );

  if (accessGranted) {
    // Verificar se o cliente tem permissão para acessar o site principal
    // Só bloquear se a query retornou explicitamente allowed=false (null = ainda carregando = não bloquear)
    if (accessType === 'customer' && cpTokenForRoute && routeAccessSiteQuery.data && routeAccessSiteQuery.data.allowed === false) {
      const whatsappNum = (settings?.whatsapp_number || '5511978307371').replace(/[^\d+]/g, '');
      const allowedRoutes: string[] = (routeAccessSiteQuery.data as any).allowedRoutes || [];
      const routeLabels: Record<string, { label: string; path: string }> = {
        gastos: { label: 'Controle de Gastos', path: '/gastos' },
        emprestimo: { label: 'Empréstimos', path: '/emprestimo' },
        site: { label: 'Site Principal', path: '/' },
      };
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">🔒 Acesso Restrito</h2>
            {allowedRoutes.length > 0 ? (
              <>
                <p className="text-slate-400 text-sm mb-4">Você só tem acesso às seguintes áreas:</p>
                <div className="flex flex-col gap-2 mb-6">
                  {allowedRoutes.filter(r => r !== 'site').map(r => {
                    const info = routeLabels[r];
                    if (!info) return null;
                    return (
                      <a key={r} href={info.path}
                        className="block bg-primary/20 border border-primary/40 hover:bg-primary/30 text-white font-semibold px-4 py-3 rounded-xl transition-colors text-sm">
                        Acessar: h2colombiano.com{info.path}
                      </a>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-slate-400 text-sm mb-6">Você não tem permissão para acessar esta área. Solicite liberação ao administrador.</p>
            )}
            <a
              href={`https://wa.me/55${whatsappNum}?text=${encodeURIComponent('Olá, preciso de liberação de acesso ao site.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              Solicitar liberação via WhatsApp
            </a>
          </div>
        </div>
      );
    }

    // Mostrar tela de completar cadastro se faltar email ou CPF
    if (hasIncomplete) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-500 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Complete seu Cadastro</h1>
              <p className="text-muted-foreground text-sm">Para continuar, preencha os dados obrigatórios abaixo.</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              {/* Nome — somente leitura */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <User className="w-5 h-5 text-green-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="font-semibold text-white truncate">{profileData?.name || "—"}</p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto shrink-0" />
              </div>
              {/* Telefone — somente leitura */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <Phone className="w-5 h-5 text-green-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="font-semibold text-white truncate">{canonicalPhone}</p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto shrink-0" />
              </div>
              {/* E-mail */}
              {missingEmail ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Mail className="w-4 h-4 text-yellow-400" />
                    E-mail <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={completeEmail}
                    onChange={e => setCompleteEmail(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Usado para receber informações do seu pedido.</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <Mail className="w-5 h-5 text-green-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="font-semibold text-white truncate">{profileData?.email}</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto shrink-0" />
                </div>
              )}
              {/* CPF */}
              {missingCpf ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-yellow-400" />
                    CPF <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={completeCpf}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                      const fmt = v.length <= 3 ? v : v.length <= 6 ? `${v.slice(0,3)}.${v.slice(3)}` : v.length <= 9 ? `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}` : `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
                      setCompleteCpf(fmt);
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <CreditCard className="w-5 h-5 text-green-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">CPF</p>
                    <p className="font-semibold text-white truncate">{profileData?.cpf}</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto shrink-0" />
                </div>
              )}
              <button
                onClick={handleCompleteProfile}
                disabled={completeSaving}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {completeSaving ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</>
                ) : (
                  <><CheckCircle2 className="w-5 h-5" /> Salvar e Continuar</>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        {accessType === "vip" && timeRemaining !== null && (
          <div id="vip-timer-bar" className="w-full bg-gradient-to-r from-primary/20 to-purple-600/20 border-b border-primary/30 flex items-center justify-center gap-2 py-1.5 text-white">
            <Clock className="w-4 h-4 text-primary animate-pulse" />
            <span className="font-bold text-sm">{formatTime(timeRemaining)}</span>
            <span className="text-xs opacity-70">até expirar</span>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden px-0 sm:px-6">
      {/* Cronômetro no topo da tela de login */}
      {(accessType === "vip" || localStorage.getItem(SESSION_TYPE_KEY) === "vip") && timeRemaining !== null && timeRemaining > 0 && (
        <div className="w-full bg-gradient-to-r from-primary/20 to-purple-600/20 border-b border-primary/30 flex items-center justify-center gap-2 py-2 text-white absolute top-0 left-0">
          <Clock className="w-4 h-4 text-primary animate-pulse" />
          <span className="font-bold text-sm">{formatTime(timeRemaining)}</span>
          <span className="text-xs opacity-70">até expirar</span>
        </div>
      )}

      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative z-10 w-full sm:max-w-md sm:mx-auto">
        {/* Banner PWA removido */}

        <div className="bg-black/60 backdrop-blur-xl border-0 sm:border border-primary/30 rounded-none sm:rounded-2xl p-6 sm:p-8 shadow-2xl min-h-screen sm:min-h-0 flex flex-col justify-center">
          {/* Cronômetro destacado */}
          {(accessType === "vip" || localStorage.getItem(SESSION_TYPE_KEY) === "vip") && timeRemaining !== null && timeRemaining > 0 && (
            <div className={`mb-6 p-4 rounded-lg border-2 flex items-center justify-center gap-3 ${
              timeRemaining <= 300 ? "bg-red-900/30 border-red-500 shadow-lg shadow-red-500/50" :
              timeRemaining <= 600 ? "bg-yellow-900/30 border-yellow-500 shadow-lg shadow-yellow-500/50" :
              "bg-green-900/30 border-green-500 shadow-lg shadow-green-500/50"
            }`}>
              <Clock className={`w-6 h-6 animate-pulse ${
                timeRemaining <= 300 ? "text-red-400" :
                timeRemaining <= 600 ? "text-yellow-400" :
                "text-green-400"
              }`} />
              <div className="text-center">
                <p className={`font-bold text-lg ${
                  timeRemaining <= 300 ? "text-red-400" :
                  timeRemaining <= 600 ? "text-yellow-400" :
                  "text-green-400"
                }`}>{formatTime(timeRemaining)}</p>
                <p className="text-xs text-white/70">Sua senha expira em</p>
              </div>
            </div>
          )}

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            {loginShowImage && loginImageUrl ? (
              <img src={loginImageUrl} alt="Logo" className="w-36 h-36 object-cover rounded-2xl mb-4 shadow-lg shadow-primary/30" />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
                <Zap className="w-10 h-10 text-white" />
              </div>
            )}
            {loginShowTitle && (
              <h1 className="text-3xl font-bold text-white">{loginTitle}</h1>
            )}
            <p className="text-white/60 text-sm mt-1">
              {gateStep === "phone" && loginShowSubtitle && loginSubtitle}
              {gateStep === "registration" && "Cadastre-se"}
              {gateStep === "profilePhoto" && "Foto de Perfil"}
              {gateStep === "password" && "Acesso com senha do cadastro"}
              {gateStep === "updateCpf" && "Atualizar Cadastro"}
              {gateStep === "cpwd_create" && "Crie sua senha"}
              {gateStep === "cpwd_pending" && "Aguardando aprovação"}
            </p>
          </div>

          {/* Step icon */}
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center">
              {gateStep === "phone" && <Phone className="w-6 h-6 text-primary" />}
              {gateStep === "registration" && <UserPlus className="w-6 h-6 text-green-400" />}
              {gateStep === "profilePhoto" && <UserPlus className="w-6 h-6 text-blue-400" />}
              {gateStep === "password" && <Lock className="w-6 h-6 text-primary" />}
              {gateStep === "updateCpf" && <UserPlus className="w-6 h-6 text-yellow-400" />}
              {gateStep === "cpwd_create" && <Lock className="w-6 h-6 text-green-400" />}
              {gateStep === "cpwd_pending" && <Lock className="w-6 h-6 text-yellow-400" />}
            </div>
          </div>

          {/* ===== STEP 1: TELEFONE ===== */}
          {gateStep === "phone" && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">

              {/* Instrução de acesso */}
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center">
                <p className="text-white/90 text-sm font-semibold">Identifique-se para acessar</p>
                <p className="text-white/50 text-xs mt-0.5">Use o telefone ou CPF cadastrado na Walk Ajuda</p>
              </div>

              {/* Campo Telefone */}
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-widest flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Telefone com DDD
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/60" />
                  <input
                    type="tel"
                    value={formatPhone(clientPhone)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setClientPhone(digits);
                      if (digits.length > 0) setClientCpf('');
                      // Persistir no sessionStorage para não perder ao rolar/remontar
                      if (digits.length === 11) sessionStorage.setItem('reg_phone_temp', digits);
                    }}
                    placeholder="(99) 99999-9999"
                    className={`w-full pl-12 pr-4 py-4 bg-white/10 text-white text-lg text-center font-bold rounded-xl border-2 outline-none transition-all placeholder:text-white/25 ${
                      getPhoneDigits(clientPhone).length > 0 && getPhoneDigits(clientPhone).length !== 11
                        ? 'border-red-500 bg-red-500/10'
                        : getPhoneDigits(clientPhone).length === 11
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-white/20 focus:border-primary focus:ring-2 focus:ring-primary/30'
                    }`}
                    disabled={isCheckingPhone || clientCpf.replace(/\D/g,'').length > 0}
                    autoFocus
                  />
                  {getPhoneDigits(clientPhone).length > 0 && getPhoneDigits(clientPhone).length !== 11 && (
                    <p className="text-red-400 text-xs mt-1">Telefone deve ter 11 dígitos (DDD + número)</p>
                  )}
                  {getPhoneDigits(clientPhone).length === 11 && (
                    <p className="text-green-400 text-xs mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Telefone válido</p>
                  )}
                </div>
              </div>

              {/* Divisor OU */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/15" />
                <span className="text-white/30 text-xs font-bold tracking-widest">OU ACESSE COM</span>
                <div className="flex-1 h-px bg-white/15" />
              </div>

              {/* Campo CPF */}
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-widest flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> CPF (somente números)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={clientCpf}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      let formatted = digits;
                      if (digits.length > 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
                      else if (digits.length > 6) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
                      else if (digits.length > 3) formatted = `${digits.slice(0,3)}.${digits.slice(3)}`;
                      setClientCpf(formatted);
                      if (digits.length > 0) setClientPhone('');
                    }}
                    placeholder="000.000.000-00"
                    className={`w-full px-4 py-4 bg-white/10 text-white text-lg text-center font-bold rounded-xl border-2 outline-none transition-all placeholder:text-white/25 ${
                      clientCpf.replace(/\D/g,'').length > 0 && clientCpf.replace(/\D/g,'').length !== 11
                        ? 'border-red-500 bg-red-500/10'
                        : clientCpf.replace(/\D/g,'').length === 11
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-white/20 focus:border-primary focus:ring-2 focus:ring-primary/30'
                    }`}
                    disabled={isCheckingPhone || getPhoneDigits(clientPhone).length > 0}
                  />
                  {clientCpf.replace(/\D/g,'').length > 0 && clientCpf.replace(/\D/g,'').length !== 11 && (
                    <p className="text-red-400 text-xs mt-1">CPF deve ter 11 dígitos</p>
                  )}
                  {clientCpf.replace(/\D/g,'').length === 11 && (
                    <p className="text-green-400 text-xs mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> CPF válido</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCheckingPhone || isValidating || (getPhoneDigits(clientPhone).length !== 11 && clientCpf.replace(/\D/g,'').length !== 11)}
                className="w-full px-4 py-4 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xl rounded-xl transition-all duration-200 active:scale-[0.98] shadow-xl shadow-primary/40"
              >
                {(isCheckingPhone || isValidating) ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {isValidating ? 'Validando...' : 'Verificando...'}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    CONTINUAR →
                  </span>
                )}
              </button>

              {/* Botão WhatsApp ao errar senha */}
              {showPasswordError && (
                <div className="mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-orange-950/40 border border-orange-500/40 rounded-xl p-4 mb-3 text-center">
                    <p className="text-orange-300 font-bold text-sm">🔑 Senha não reconhecida</p>
                    <p className="text-white/70 text-xs mt-1">Não se preocupe! Clique abaixo e te enviamos sua senha pelo WhatsApp em instantes.</p>
                  </div>
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Olá! Estou tentando acessar o site Walk Ajuda para fazer meu pedido, mas minha senha não está funcionando.\nMeu número: ${formatPhone(clientPhone)}\nPoderia me ajudar com uma nova senha?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      const el = e.currentTarget;
                      el.classList.add('opacity-75', 'cursor-wait');
                      el.innerHTML = '<svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Abrindo WhatsApp...';
                      setTimeout(() => {
                        el.classList.remove('opacity-75', 'cursor-wait');
                        el.innerHTML = '✅ Abrindo WhatsApp...';
                      }, 1500);
                    }}
                    className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 active:scale-95 text-white font-black text-base rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg shadow-green-500/40 border border-green-400/30"
                  >
                    <MessageCircle className="w-5 h-5" />
                    SOLICITAR SENHA VIA WHATSAPP
                  </a>
                </div>
              )}

              {loginShowFooter && (
                <p className="text-center text-white/50 text-sm mt-4">
                  {loginFooter}
                </p>
              )}

              {/* Divisor novo cadastro */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/25 text-xs font-bold tracking-widest">NOVO AQUI?</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Card de novo cadastro */}
              <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <UserPlus className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-green-300 font-bold text-sm">Primeiro acesso? Cadastre-se!</p>
                    <p className="text-white/50 text-xs mt-0.5 leading-relaxed">Se você ainda não tem cadastro na Walk Ajuda, clique abaixo para criar sua conta grátis e começar a fazer pedidos.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerExists(false);
                    setEnteredByCpf(false);
                    setRegCpf("");
                    setRegName("");
                    setRegEmail("");
                    setRegCep("");
                    setRegCity("");
                    setRegUf("");
                    setGateStep("registration");
                  }}
                  className="w-full mt-3 px-4 py-3 bg-green-600/80 hover:bg-green-500/80 active:scale-[0.98] text-white font-black text-base rounded-xl transition-all duration-200 shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  CRIAR MINHA CONTA AGORA
                </button>
              </div>

            </form>
          )}

          {/* ===== STEP BLOQUEADO: NÚMERO NA LISTA NEGRA ===== */}
          {gateStep === "blocked" && (
            <div className="space-y-6 text-center">
              <style>{`
                @keyframes neonPulseBlockRed {
                  0%, 100% {
                    box-shadow: 0 0 12px #dc2626, 0 0 30px #dc2626, 0 0 60px #991b1b;
                    border-color: #dc2626;
                  }
                  50% {
                    box-shadow: 0 0 25px #ef4444, 0 0 70px #dc2626, 0 0 110px #991b1b;
                    border-color: #ef4444;
                  }
                }
                .neon-blocked {
                  animation: neonPulseBlockRed 1.4s ease-in-out infinite;
                  border: 2px solid #dc2626;
                  border-radius: 1rem;
                  padding: 1.5rem;
                }
              `}</style>

              <div className="neon-blocked bg-red-950/50">
                <p className="text-5xl mb-3">🚫</p>
                <p className="text-red-400 font-black text-2xl uppercase tracking-widest drop-shadow-[0_0_10px_#ef4444] mb-2">
                  ACESSO RESTRITO
                </p>
                <p className="text-white text-base font-semibold">
                  {customerBlockReason ? 'Seu cadastro foi bloqueado.' : 'Este número foi bloqueado pelo sistema.'}
                </p>
                {customerBlockReason && (
                  <div className="mt-3 px-3 py-2 bg-red-900/40 border border-red-500/30 rounded-lg">
                    <p className="text-red-300 text-xs font-semibold uppercase tracking-wide mb-0.5">Motivo</p>
                    <p className="text-white/80 text-sm">{customerBlockReason}</p>
                  </div>
                )}
                {!customerBlockReason && (
                  <p className="text-white/60 text-sm mt-2">
                    O acesso a este site foi restrito para este número.
                  </p>
                )}
              </div>

              <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5">
                <p className="text-white/70 text-sm">
                  Se acredita que isso é um erro, entre em contato com o suporte pelo WhatsApp.
                </p>
              </div>


            </div>
          )}



          {/* ===== STEP: ROTA BLOQUEADA ===== */}
          {gateStep === "route_blocked" && (
            <div className="space-y-6 text-center">
              <div className="bg-orange-950/50 border-2 border-orange-500 rounded-2xl p-6">
                <p className="text-5xl mb-3">🔒</p>
                <p className="text-orange-400 font-black text-xl uppercase tracking-widest mb-2">
                  Acesso Restrito
                </p>
                <p className="text-white/80 text-sm">
                  Você não tem permissão para acessar o site principal.
                </p>
                {blockedRoutes.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-white/60 text-xs uppercase tracking-wide">Você tem acesso a:</p>
                    {blockedRoutes.map(r => {
                      const labels: Record<string, { label: string; path: string }> = {
                        gastos: { label: '📊 Controle de Gastos', path: '/gastos' },
                        emprestimo: { label: '💳 Empréstimos', path: '/emprestimo' },
                        site: { label: '🏠 Site Principal', path: '/' },
                      };
                      const info = labels[r];
                      if (!info) return null;
                      return (
                        <a key={r} href={info.path} className="block w-full py-3 px-4 bg-primary/20 border border-primary/40 rounded-xl text-primary font-semibold text-sm hover:bg-primary/30 transition-colors">
                          {info.label}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setGateStep("phone"); setClientPhone(""); setClientCpf(""); }}
                className="text-white/50 text-sm underline"
              >
                ← Voltar
              </button>
            </div>
          )}

          {/* ===== STEP 1.5: INDICADOR ===== */}
          {gateStep === "indicador" && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const indicadorDigits = indicadorPhone.replace(/\D/g, '');
              // Indicador agora e OPCIONAL: so guardamos o telefone se tiver 11 digitos.
              setRegReferredByPhone(indicadorDigits.length === 11 ? indicadorDigits : "");
              setGateStep("registration");
            }} className="space-y-6">
              <p className="text-white/60 text-sm text-center">Tem um indicador ou código de liberação? Informe abaixo (opcional).</p>

              <div className="border-2 border-yellow-500/50 rounded-lg p-4 bg-yellow-500/10">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-yellow-400 font-bold text-sm">INDICADOR OU CÓDIGO DE LIBERAÇÃO</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase text-white/70">
                    Opcional
                  </span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-white mb-2 block text-sm font-medium">Telefone do Indicador</label>
                    <input
                      type="tel"
                      placeholder="(11) 98765-4321"
                      value={indicadorPhone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setIndicadorPhone(digits);
                        if (digits.length === 11 && !bypassCode) {
                          setIsCheckingIndicador(true);
                        } else {
                          setIndicadorName(null);
                          setIndicadorData(null);
                          setIsCheckingIndicador(false);
                        }
                      }}
                      className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                    />
                    {isCheckingIndicador && <p className="text-white/60 text-xs mt-2 text-center">Verificando...</p>}
                    {indicadorName && (
                      <div className="mt-4 text-center">
                        <p className="text-green-400 text-sm font-bold mb-2">✓ Indicador encontrado</p>
                        <div className="flex justify-center mb-2">
                          {indicadorData?.profilePhotoUrl && (
                            <img src={indicadorData.profilePhotoUrl} alt={indicadorName} className="w-16 h-16 rounded-full border-2 border-green-400" />
                          )}
                        </div>
                        <p className="text-white font-bold text-sm">{indicadorName}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-center text-white text-sm">OU</div>
                  <div>
                    <label className="text-white mb-2 block text-sm font-medium">Código de Liberação</label>
                    <input
                      type="text"
                      placeholder="Código do ADM"
                      value={bypassCode}
                      onChange={(e) => {
                        const code = e.target.value.toUpperCase();
                        setBypassCode(code);
                        if (code.trim().length > 0) {
                          setBypassCodeValidated(true);
                          setIndicadorName(null);
                        } else {
                          setBypassCodeValidated(false);
                        }
                      }}
                      className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                    />
                    {bypassCodeValidated && <p className="text-green-400 text-sm mt-2 text-center font-bold">✓ Código válido</p>}
                  </div>
                </div>
              </div>
              <button 
                type="submit" 
                disabled={isCheckingIndicador}
                className={`w-full px-4 py-4 font-bold rounded-xl transition-all duration-300 transform ${
                  isCheckingIndicador
                    ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-600/80 text-white hover:scale-105'
                }`}
              >
                {isCheckingIndicador ? 'Verificando...' : 'Continuar'}
              </button>
            </form>
          )}

          {/* ===== STEP 2: CADASTRO ===== */}
          {gateStep === "registration" && (
            <form onSubmit={handleRegistration} className="space-y-5">
              <p className="text-white/60 text-sm text-center mb-2">Preencha seus dados para continuar</p>

              {/* --- Seus dados --- */}
              <div className="border border-white/20 rounded-xl p-5 space-y-4">
                <p className="text-white/80 text-sm font-bold uppercase tracking-wider">Seus dados</p>

                <div>
                  <label className="text-white mb-2 block text-sm font-medium">Nome Completo *</label>
                  <input type="text" placeholder="Seu nome completo" value={regName} onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
                </div>

                <div>
                  <label className="text-white mb-2 block text-sm font-medium">
                    Telefone {enteredByCpf && <span className="text-red-400">*</span>}
                  </label>
                  {enteredByCpf ? (
                    // Entrou pelo CPF → telefone é livre e obrigatório
                    <input
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={regPhone}
                      onChange={(e) => setRegPhone(formatPhone(e.target.value))}
                      className={`w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 outline-none transition-all ${
                        getPhoneDigits(regPhone).length > 0 && getPhoneDigits(regPhone).length !== 11
                          ? 'border-red-500 focus:ring-2 focus:ring-red-400/30'
                          : getPhoneDigits(regPhone).length === 11
                          ? 'border-green-500 focus:ring-2 focus:ring-green-400/30'
                          : 'border-black focus:border-primary focus:ring-2 focus:ring-primary/30'
                      }`}
                    />
                  ) : getPhoneDigits(clientPhone).length === 11 ? (
                    // Entrou pelo telefone e telefone está preenchido → bloqueado
                    <input type="tel" value={formatPhone(clientPhone)} disabled
                      className="w-full px-4 py-4 bg-gray-200 text-black text-lg text-center font-medium rounded-xl border-2 border-green-500 opacity-80" />
                  ) : (
                    // Telefone perdido (ex: recarregou a página) → deixar editar
                    <input
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={regPhone}
                      onChange={(e) => { setRegPhone(formatPhone(e.target.value)); setClientPhone(formatPhone(e.target.value)); }}
                      className={`w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 outline-none transition-all ${
                        getPhoneDigits(regPhone).length > 0 && getPhoneDigits(regPhone).length !== 11
                          ? 'border-red-500 focus:ring-2 focus:ring-red-400/30'
                          : getPhoneDigits(regPhone).length === 11
                          ? 'border-green-500 focus:ring-2 focus:ring-green-400/30'
                          : 'border-black focus:border-primary focus:ring-2 focus:ring-primary/30'
                      }`}
                    />
                  )}
                </div>

                <div>
                  <label className="text-white mb-2 block text-sm font-medium">Email <span className="text-red-400">*</span></label>
                  <input type="email" placeholder="seu@email.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
                  <div className="mt-1.5 flex items-start gap-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-lg px-2.5 py-2">
                    <span className="text-yellow-400 text-xs flex-shrink-0 mt-0.5">⚠️</span>
                    <p className="text-yellow-200 text-xs leading-relaxed">
                      <strong>O email não é para criar conta.</strong> Usado apenas para receber atualizações do seu pedido.
                    </p>
                  </div>
                </div>

                {/* CPF */}
                <div>
                  <label className="text-white mb-2 block text-sm font-medium">CPF <span className="text-red-400">*</span></label>
                  {enteredByCpf ? (
                    // Entrou pelo CPF → campo bloqueado com o CPF digitado
                    <input type="text" value={regCpf} disabled
                      className="w-full px-4 py-4 bg-gray-200 text-black text-lg text-center font-medium rounded-xl border-2 border-green-500 opacity-80" />
                  ) : (
                    // Entrou pelo telefone → CPF livre e obrigatório
                    <input type="text" inputMode="numeric" placeholder="000.000.000-00" value={regCpf}
                      onChange={async (e) => {
                        const formatted = formatCpf(e.target.value);
                        setRegCpf(formatted);
                        setCpfDuplicado(false);
                        const digits = formatted.replace(/\D/g,'');
                        if (digits.length === 11 && isValidCPF(formatted)) {
                          try {
                            const res = await fetch(`/api/trpc/customers.checkCpf?input=${encodeURIComponent(JSON.stringify({ cpf: formatted }))}`)
                            const json = await res.json();
                            if (json?.result?.data?.exists) setCpfDuplicado(true);
                          } catch { /* ignorar erro de rede */ }
                        }
                      }}
                      className={`w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 outline-none transition-all ${
                        regCpf.replace(/\D/g,'').length === 11
                          ? (cpfDuplicado || !isValidCPF(regCpf)) ? 'border-red-500 focus:ring-2 focus:ring-red-400/30' : 'border-green-500 focus:ring-2 focus:ring-green-400/30'
                          : 'border-black focus:border-primary focus:ring-2 focus:ring-primary/30'
                      }`} />
                  )}
                  {!enteredByCpf && regCpf.replace(/\D/g,'').length === 11 && !isValidCPF(regCpf) && (
                    <p className="text-red-400 text-xs mt-1">CPF inválido. Verifique os números.</p>
                  )}
                  {!enteredByCpf && cpfDuplicado && (
                    <p className="text-red-400 text-xs mt-1">Este CPF já está cadastrado. Entre em contato pelo WhatsApp.</p>
                  )}
                </div>

                {/* CEP */}
                <div>
                  <label className="text-white mb-2 block text-sm font-medium">CEP <span className="text-gray-400 font-normal text-xs">(opcional — preenche Estado e Cidade)</span></label>
                  <div className="relative">
                    <input type="text" inputMode="numeric" placeholder="00000-000" value={regCep}
                      onChange={(e) => {
                        const formatted = formatCep(e.target.value);
                        setRegCep(formatted);
                        if (formatted.replace(/\D/g,'').length === 8) buscarCep(formatted);
                      }}
                      className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
                    {cepLoading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Estado com autocomplete */}
                <div className="relative">
                  <label className="text-white mb-2 block text-sm font-medium">Estado <span className="text-red-400">*</span></label>
                  <input type="text" placeholder="Buscar estado..." value={estadoSearch}
                    onChange={(e) => { setEstadoSearch(e.target.value); setShowEstadoDropdown(true); }}
                    onFocus={() => setShowEstadoDropdown(true)}
                    className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
                  {regEstado && !showEstadoDropdown && (
                    <p className="text-green-300 text-xs mt-1 text-center">✓ {regEstado} ({regUf})</p>
                  )}
                  {showEstadoDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-black rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {ESTADOS_BR.filter(e =>
                        !estadoSearch || e.nome.toLowerCase().includes(estadoSearch.toLowerCase()) || e.uf.toLowerCase().includes(estadoSearch.toLowerCase())
                      ).map(e => (
                        <button key={e.uf} type="button"
                          onClick={() => { setRegUf(e.uf); setRegEstado(e.nome); setEstadoSearch(e.nome); setRegCity(""); setCitySearch(""); setShowEstadoDropdown(false); }}
                          className="w-full px-4 py-3 text-left text-black hover:bg-primary/10 text-sm font-medium border-b border-gray-100 last:border-0">
                          <span className="font-bold text-primary mr-2">{e.uf}</span>{e.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cidade com autocomplete */}
                <div className="relative">
                  <label className="text-white mb-2 block text-sm font-medium">Cidade <span className="text-red-400">*</span></label>
                  <input type="text" placeholder={regUf ? "Buscar cidade..." : "Selecione o estado primeiro"} value={citySearch}
                    disabled={!regUf}
                    onChange={(e) => { setCitySearch(e.target.value); setShowCityDropdown(true); }}
                    onFocus={() => setShowCityDropdown(true)}
                    className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all disabled:opacity-50" />
                  {regCity && !showCityDropdown && (
                    <p className="text-green-300 text-xs mt-1 text-center">✓ {regCity}</p>
                  )}
                  {showCityDropdown && regUf && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-black rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {(CIDADES_POR_UF[regUf] || []).filter(c =>
                        !citySearch || c.toLowerCase().includes(citySearch.toLowerCase())
                      ).slice(0, 50).map(c => (
                        <button key={c} type="button"
                          onClick={() => { setRegCity(c); setCitySearch(c); setShowCityDropdown(false); }}
                          className="w-full px-4 py-3 text-left text-black hover:bg-primary/10 text-sm font-medium border-b border-gray-100 last:border-0">
                          {c}
                        </button>
                      ))}
                      {(CIDADES_POR_UF[regUf] || []).filter(c => !citySearch || c.toLowerCase().includes(citySearch.toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-gray-500 text-sm">Nenhuma cidade encontrada</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* --- Foto de Perfil OBRIGATÓRIA --- */}
              <div className="border-2 border-red-500/50 rounded-xl p-5 space-y-4 bg-red-500/5">
                <div className="flex items-center justify-between">
                  <p className="text-white/80 text-sm font-bold uppercase tracking-wider">Foto de Perfil</p>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">OBRIGATÓRIA</span>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/15 border border-yellow-500/40 rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-yellow-300 text-xs font-semibold">A foto deve ser obrigatoriamente de rosto. Fotos de documentos, paisagens ou outros não serão aceitas.</p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  {regProfilePhotoPreview ? (
                    <div className="relative">
                      <img src={regProfilePhotoPreview} alt="Preview" className="w-32 h-32 rounded-full object-cover border-4 border-green-500 shadow-lg" />
                      <button type="button" onClick={() => { setRegProfilePhoto(null); setRegProfilePhotoPreview(null); setUploadedPhotoUrl(null); setUploadedPhotoFile(null); setPhotoUploadFailed(false); }}
                        className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-base font-bold shadow-lg hover:bg-red-600">×</button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-white/10 border-2 border-dashed border-red-400/60 flex flex-col items-center justify-center">
                      <svg className="w-12 h-12 text-white/40 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-red-300 text-xs font-semibold">Obrigatória</span>
                    </div>
                  )}
                  {/* Botões de foto - usando HTML5 file input nativo */}
                  {photoMode === 'disabled' ? (
                    <div className="w-full text-center py-4 text-white/40 text-sm border border-white/10 rounded-xl">
                      Envio de foto desativado pelo administrador
                    </div>
                  ) : photoMode === 'camera' && hasCameraDevice === false ? (
                    <div className="w-full text-center py-4 px-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                      <svg className="w-8 h-8 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <p className="text-red-300 text-sm font-bold mb-1">📷 Câmera obrigatória</p>
                      <p className="text-red-200/70 text-xs">Este dispositivo não possui câmera. A foto ao vivo é obrigatória para o cadastro. Acesse pelo seu celular para continuar.</p>
                    </div>
                  ) : (
                    <div className={`flex gap-3 w-full ${photoMode !== 'both' ? 'justify-center' : ''}`}>
                      {(photoMode === 'camera' || photoMode === 'both') && (
                        <label className="flex-1 cursor-pointer bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white font-semibold text-sm px-4 py-3 rounded-xl transition-all flex flex-col items-center gap-1">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Câmera</span>
                          <input type="file" accept="image/*,.heic,.heif" capture="user" onChange={handlePhotoSelect} className="hidden" ref={cameraInputRegRef} />
                        </label>
                      )}
                      {(photoMode === 'gallery' || photoMode === 'both') && (
                        <label className="flex-1 cursor-pointer bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold text-sm px-4 py-3 rounded-xl transition-all flex flex-col items-center gap-1">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>Galeria</span>
                          <input type="file" accept="image/*,.heic,.heif" onChange={handlePhotoSelect} className="hidden" ref={galleryInputRegRef} />
                        </label>
                      )}
                    </div>
                  )}
                  {!regProfilePhoto && (
                    <p className="text-red-300 text-xs text-center">⚠️ Selecione sua foto para continuar o cadastro</p>
                  )}
                  {/* Status do pre-upload da foto */}
                  {regProfilePhoto && isUploadingPhoto && (
                    <p className="text-yellow-300 text-xs text-center flex items-center justify-center gap-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Enviando sua foto...
                    </p>
                  )}
                  {regProfilePhoto && !isUploadingPhoto && uploadedPhotoUrl && uploadedPhotoFile === regProfilePhoto && (
                    <p className="text-green-400 text-xs text-center font-semibold">✓ Foto enviada com sucesso</p>
                  )}
                  {regProfilePhoto && !isUploadingPhoto && photoUploadFailed && (
                    <div className="text-center">
                      <p className="text-red-300 text-xs">Não consegui enviar a foto. Toque para tentar de novo.</p>
                      <button type="button" onClick={() => regProfilePhoto && preUploadPhoto(regProfilePhoto)} className="mt-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-full">Reenviar foto</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Quem indicou foi movido para step separado após cadastro */}

              <button
                type="submit"
                disabled={registerMutation.isPending || isUploadingPhoto || !regProfilePhoto}
                className="w-full px-4 py-5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-600/80 hover:to-green-500/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xl rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                {(isUploadingPhoto || registerMutation.isPending) ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {isUploadingPhoto ? "ENVIANDO FOTO..." : "CADASTRANDO..."}
                  </span>
                ) : (
                  "CADASTRAR"
                )}
              </button>

              <button
                type="button"
                onClick={() => setGateStep("phone")}
                className="w-full text-white/50 text-xs hover:text-white/80 transition-colors mt-2"
              >
                Voltar
              </button>
            </form>
          )}

          {/* ===== STEP 2.5: FOTO DE PERFIL ===== */}
          {gateStep === "profilePhoto" && (
            <div className="space-y-5">
              <p className="text-white/60 text-sm text-center mb-2">Envie sua foto de perfil</p>

              {/* Aviso obrigatório de foto de rosto */}
              <div className="flex items-center gap-2 bg-yellow-500/15 border border-yellow-500/40 rounded-xl px-4 py-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-yellow-300 text-sm font-semibold">A foto deve ser obrigatoriamente de rosto. Fotos de documentos, paisagens ou outros não serão aceitas.</p>
              </div>

              <div className="border border-white/20 rounded-xl p-6 space-y-5 flex flex-col items-center">
                {regProfilePhotoPreview ? (
                  <div className="relative">
                    <img src={regProfilePhotoPreview} alt="Preview" className="w-40 h-40 rounded-full object-cover border-4 border-green-500 shadow-lg" />
                    <button
                      type="button"
                      onClick={() => { setRegProfilePhoto(null); setRegProfilePhotoPreview(null); }}
                      className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-base font-bold shadow-lg hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="w-40 h-40 rounded-full bg-white/10 border-2 border-dashed border-white/30 flex flex-col items-center justify-center">
                    <svg className="w-14 h-14 text-white/40 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-white/40 text-sm">Sua foto</span>
                  </div>
                )}

                {/* Botões: câmera e/ou galeria conforme configuração do admin - usando HTML5 nativo */}
                {photoMode === 'disabled' ? (
                  <div className="w-full text-center py-4 text-white/40 text-sm border border-white/10 rounded-xl">
                    Envio de foto desativado pelo administrador
                  </div>
                ) : photoMode === 'camera' && hasCameraDevice === false ? (
                  <div className="w-full text-center py-5 px-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <svg className="w-10 h-10 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    <p className="text-red-300 text-sm font-bold mb-1">📷 Câmera obrigatória</p>
                    <p className="text-red-200/70 text-xs">Este dispositivo não possui câmera. A foto ao vivo é obrigatória para o cadastro.</p>
                    <p className="text-yellow-300/80 text-xs mt-2 font-semibold">Acesse pelo seu celular para continuar.</p>
                  </div>
                ) : (
                  <div className={`flex gap-3 w-full ${photoMode !== 'both' ? 'justify-center' : ''}`}>
                    {(photoMode === 'camera' || photoMode === 'both') && (
                      <label className="flex-1 cursor-pointer bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white font-semibold text-sm px-4 py-4 rounded-xl transition-all flex flex-col items-center gap-1">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Câmera</span>
                        <input type="file" accept="image/*,.heic,.heif" capture="user" onChange={handlePhotoSelect} className="hidden" ref={cameraInputProfileRef} />
                      </label>
                    )}
                    {(photoMode === 'gallery' || photoMode === 'both') && (
                      <label className="flex-1 cursor-pointer bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold text-sm px-4 py-4 rounded-xl transition-all flex flex-col items-center gap-1">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Galeria</span>
                        <input type="file" accept="image/*,.heic,.heif" onChange={handlePhotoSelect} className="hidden" ref={galleryInputProfileRef} />
                      </label>
                    )}
                  </div>
                )}

                <p className="text-white/40 text-sm text-center">Formatos aceitos: JPG, PNG (máx. 5MB)</p>
              </div>

              <button
                type="button"
                onClick={handleProfilePhotoUpload}
                disabled={!regProfilePhoto || isUploadingPhoto}
                className="w-full px-4 py-5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-600/80 hover:to-green-500/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xl rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                {isUploadingPhoto ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    ENVIANDO...
                  </span>
                ) : (
                  "ENVIAR FOTO"
                )}
              </button>


            </div>
          )}

          {/* ===== STEP 2.7: INDICAÇÃO ===== */}
          {gateStep === "referral" && (
            <div className="space-y-6">
              {/* Se veio por link de indicação, registrar automaticamente e pular */}
              {urlRefCode && urlRefValid === null && (
                <ReferralAutoRegister
                  code={urlRefCode}
                  clientName={regName}
                  clientPhone={getPhoneDigits(clientPhone)}
                  onComplete={(success, name) => {
                    setUrlRefValid(success);
                    if (success && name) setUrlRefName(name);
                    recordReferralUsageMutation.mutate({
                      code: urlRefCode,
                      clientName: regName,
                      clientPhone: getPhoneDigits(clientPhone),
                    });
                    setGateStep("password");
                  }}
                />
              )}
              {(!urlRefCode || urlRefValid !== null) && (
              <>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-500/40 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-white font-bold text-xl mb-1">Alguém te indicou?</h3>
                <p className="text-white/60 text-sm">Deseja informar quem te indicou? Quem indicou pode ganhar pela indicação! 🎁</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowReferralForm(true)}
                  className="flex-1 py-4 bg-yellow-500/20 hover:bg-yellow-500/30 border-2 border-yellow-500/50 text-yellow-300 font-bold text-lg rounded-xl transition-all"
                >
                  ✅ SIM
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowReferralForm(false);
                    try {
                      await updateReferralMutation.mutateAsync({
                        phone: getPhoneDigits(clientPhone),
                        referredBy: 'Não informou',
                      });
                    } catch { /* ignora erro silenciosamente */ }
                    setGateStep("password");
                  }}
                  className="flex-1 py-4 bg-white/10 hover:bg-white/20 border-2 border-white/20 text-white/70 font-bold text-lg rounded-xl transition-all"
                >
                  ❌ NÃO
                </button>
              </div>

              {showReferralForm && (
                <div className="space-y-4 border border-yellow-500/30 rounded-xl p-5 bg-yellow-500/5">
                  <div>
                    <label className="text-white mb-2 block text-sm font-medium">Nome de quem indicou</label>
                    <input type="text" placeholder="Nome completo" value={regReferredBy} onChange={(e) => setRegReferredBy(e.target.value)}
                      className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-white mb-2 block text-sm font-medium">Telefone de quem indicou</label>
                    <input type="tel" placeholder="(11) 99999-9999" value={formatPhone(regReferredByPhone)} onChange={(e) => setRegReferredByPhone(normalizeBrazilPhone(e.target.value))}
                      className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
                    {getPhoneDigits(regReferredByPhone).length > 0 && getPhoneDigits(regReferredByPhone).length !== 11 && (
                      <p className="text-red-400 text-sm mt-1">Telefone deve ter 11 dígitos (DDD + número)</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!regReferredBy.trim() || updateReferralMutation.isPending}
                    onClick={async () => {
                      const referredPhoneDigits = getPhoneDigits(regReferredByPhone);
                      if (referredPhoneDigits.length > 0 && referredPhoneDigits.length !== 11) {
                        toast.error("Telefone deve ter 11 dígitos (DDD + número)");
                        return;
                      }
                      // Validação local: não pode indicar a si mesmo
                      const selfDigits = getPhoneDigits(clientPhone);
                      if (referredPhoneDigits.length === 11 && referredPhoneDigits === selfDigits) {
                        toast.error("Você não pode indicar a si mesmo!");
                        return;
                      }
                      try {
                        const result = await updateReferralMutation.mutateAsync({
                          phone: selfDigits,
                          referredBy: regReferredBy.trim(),
                          referredByPhone: referredPhoneDigits.length === 11 ? referredPhoneDigits : undefined,
                        });
                        if (!result.success) {
                          toast.error(result.message || "Erro ao salvar indicação.");
                          return;
                        }
                        toast.success("Indicação salva!");
                        setGateStep("password");
                      } catch {
                        toast.error("Erro ao salvar indicação. Tente novamente.");
                      }
                    }}
                    className="w-full py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-600/80 hover:to-yellow-500/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all"
                  >
                    {updateReferralMutation.isPending ? "Salvando..." : "SALVAR E CONTINUAR"}
                  </button>
                </div>
              )}              </>
              )}
            </div>
          )}

          {/* ===== STEP 2.7: ATUALIZAR CPF ===== */}
          {gateStep === "updateCpf" && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 bg-yellow-500/15 border border-yellow-500/40 rounded-xl px-4 py-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-yellow-300 text-sm font-semibold">Para continuar, é necessário informar seu CPF. Este dado é obrigatório para todos os serviços.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">CPF <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={updateCpfValue}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
                    else if (digits.length > 6) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
                    else if (digits.length > 3) formatted = `${digits.slice(0,3)}.${digits.slice(3)}`;
                    setUpdateCpfValue(formatted);
                    setUpdateCpfError(digits.length === 11 && !isValidCPF(digits) ? 'CPF inválido. Digite um CPF válido para continuar.' : '');
                  }}
                  placeholder="000.000.000-00"
                  className={`w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 outline-none transition-all ${
                    updateCpfError ? 'border-red-500' : isValidCPF(updateCpfValue) ? 'border-green-500' : 'border-black focus:border-primary'
                  }`}
                />
                {updateCpfError && <p className="text-red-400 text-sm mt-1">{updateCpfError}</p>}
              </div>

              <button
                type="button"
                disabled={updateCpfLoading || !isValidCPF(updateCpfValue)}
                onClick={async () => {
                  const digits = normalizeCpf(updateCpfValue);
                  if (!isValidCPF(digits)) { setUpdateCpfError('CPF inválido. Digite um CPF válido para continuar.'); return; }
                  setUpdateCpfLoading(true);
                  try {
                    const res = await updateCpfMutation.mutateAsync({ phone: getPhoneDigits(clientPhone), cpf: digits });
                    if (!res.success) { setUpdateCpfError(res.message || 'Erro ao salvar CPF'); return; }
                    // CPF salvo — liberar acesso com a sessão pendente
                    if (pendingSession) {
                      setAccessGranted(true);
                      setAccessType(pendingSession.type);
                      localStorage.setItem(SESSION_KEY, 'true');
                      localStorage.setItem(SESSION_CODE_KEY, password);
                      localStorage.setItem(SESSION_TYPE_KEY, pendingSession.type);
                      localStorage.setItem(SESSION_PHONE_KEY, getPhoneDigits(clientPhone));
                      if (pendingSession.type === 'vip' && pendingSession.expiresAt) {
                        localStorage.setItem(SESSION_EXPIRES_KEY, pendingSession.expiresAt);
                        setTimeRemaining(Math.max(0, Math.floor((new Date(pendingSession.expiresAt).getTime() - Date.now()) / 1000)));
                      }
                      setPendingSession(null);
                      toast.success('CPF cadastrado! Bem-vindo!');
                    }
                  } catch { setUpdateCpfError('Erro ao salvar CPF. Tente novamente.'); }
                  finally { setUpdateCpfLoading(false); }
                }}
                className="w-full px-4 py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-600/80 hover:to-yellow-500/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all"
              >
                {updateCpfLoading ? 'Salvando...' : 'SALVAR E CONTINUAR'}
              </button>
            </div>
          )}

          {/* ===== STEP CPF OBRIGATÓRIO (antes de criar senha) ===== */}
          {gateStep === "cpwd_add_cpf" && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 bg-yellow-500/15 border border-yellow-500/40 rounded-xl px-4 py-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-yellow-300 text-sm font-semibold">Para criar sua senha, é necessário informar seu CPF. Este dado é obrigatório para todos os serviços.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">CPF <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpwdAddCpfValue}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
                    else if (digits.length > 6) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
                    else if (digits.length > 3) formatted = `${digits.slice(0,3)}.${digits.slice(3)}`;
                    setCpwdAddCpfValue(formatted);
                    setCpwdAddCpfError(digits.length === 11 && !isValidCPF(digits) ? 'CPF inválido. Digite um CPF válido para continuar.' : '');
                  }}
                  placeholder="000.000.000-00"
                  className={`w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 outline-none transition-all ${
                    cpwdAddCpfError ? 'border-red-500' : isValidCPF(cpwdAddCpfValue) ? 'border-green-500' : 'border-black focus:border-primary'
                  }`}
                  autoFocus
                />
                {cpwdAddCpfError && <p className="text-red-400 text-sm mt-1">{cpwdAddCpfError}</p>}
              </div>

              <button
                type="button"
                disabled={cpwdAddCpfLoading || !isValidCPF(cpwdAddCpfValue)}
                onClick={async () => {
                  const digits = normalizeCpf(cpwdAddCpfValue);
                  if (!isValidCPF(digits)) { setCpwdAddCpfError('CPF inválido. Digite um CPF válido para continuar.'); return; }
                  setCpwdAddCpfLoading(true);
                  try {
                    await cpwdSaveCpfMutation.mutateAsync({ phone: getCanonicalPhone(), cpf: digits });
                    toast.success('CPF cadastrado com sucesso!');
                    setCpwdAddCpfValue('');
                    setGateStep('cpwd_create');
                  } catch (err: any) {
                    const msg = err?.message || 'Erro ao salvar CPF. Tente novamente.';
                    setCpwdAddCpfError(msg);
                  } finally {
                    setCpwdAddCpfLoading(false);
                  }
                }}
                className="w-full px-4 py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-600/80 hover:to-yellow-500/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all"
              >
                {cpwdAddCpfLoading ? 'Salvando...' : 'SALVAR E CONTINUAR'}
              </button>

              <button
                type="button"
                onClick={() => { setGateStep('phone'); setCpwdAddCpfValue(''); setCpwdAddCpfError(''); }}
                className="w-full text-white/50 text-xs hover:text-white/80 transition-colors mt-2"
              >
                Trocar telefone
              </button>
            </div>
          )}

          {/* ===== STEP CRIAR SENHA (novo sistema) ===== */}
          {gateStep === "cpwd_create" && (
            <form onSubmit={handleCpwdCreate} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-white/70 text-sm">Crie sua senha de acesso pessoal</p>
                <p className="text-white/50 text-xs mt-1">Telefone: {formatPhone(clientPhone)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Nova senha</label>
                <div className="relative">
                  <input
                    type={cpwdShowNew ? "text" : "password"}
                    value={cpwdNewPassword}
                    onChange={(e) => setCpwdNewPassword(e.target.value)}
                    placeholder="Mínimo 4 caracteres"
                    className="w-full px-4 py-3 bg-white text-black text-lg text-center font-medium rounded-lg border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                    autoFocus
                    disabled={cpwdIsCreating}
                    minLength={4}
                  />
                  <button type="button" onClick={() => setCpwdShowNew(!cpwdShowNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                    {cpwdShowNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Confirmar senha</label>
                <div className="relative">
                  <input
                    type={cpwdShowConfirm ? "text" : "password"}
                    value={cpwdConfirmPassword}
                    onChange={(e) => setCpwdConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className={`w-full px-4 py-3 bg-white text-black text-lg text-center font-medium rounded-lg border-2 outline-none transition-all ${
                      cpwdConfirmPassword && cpwdConfirmPassword !== cpwdNewPassword
                        ? 'border-red-500 focus:ring-2 focus:ring-red-400/30'
                        : cpwdConfirmPassword && cpwdConfirmPassword === cpwdNewPassword
                        ? 'border-green-500 focus:ring-2 focus:ring-green-400/30'
                        : 'border-black focus:border-primary focus:ring-2 focus:ring-primary/30'
                    }`}
                    disabled={cpwdIsCreating}
                  />
                  <button type="button" onClick={() => setCpwdShowConfirm(!cpwdShowConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                    {cpwdShowConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {cpwdConfirmPassword && cpwdConfirmPassword !== cpwdNewPassword && (
                  <p className="text-red-400 text-xs mt-1">As senhas não coincidem</p>
                )}
              </div>

              <button
                type="submit"
                disabled={cpwdIsCreating || !cpwdNewPassword.trim() || cpwdNewPassword.length < 4 || cpwdNewPassword !== cpwdConfirmPassword}
                className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-green-500/30"
              >
                {cpwdIsCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Criando senha...
                  </span>
                ) : (
                  "CRIAR MINHA SENHA"
                )}
              </button>

              <button
                type="button"
                onClick={() => { setGateStep("phone"); setCpwdNewPassword(""); setCpwdConfirmPassword(""); }}
                className="w-full text-white/50 text-xs hover:text-white/80 transition-colors mt-2"
              >
                Trocar telefone
              </button>
            </form>
          )}

          {/* ===== STEP AGUARDANDO APROVAÇÃO ===== */}
          {gateStep === "cpwd_pending" && (
            <div className="space-y-6 text-center">
              <div className="bg-yellow-950/40 border border-yellow-500/40 rounded-xl p-6">
                <p className="text-5xl mb-3">⏳</p>
                <p className="text-yellow-400 font-black text-xl uppercase tracking-widest mb-2">AGUARDANDO APROVAÇÃO</p>
                <p className="text-white/70 text-sm mt-2">
                  Sua senha foi criada e está aguardando a aprovação do administrador.
                  Você será notificado assim que for liberada.
                </p>
              </div>
              <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5">
                <p className="text-white/70 text-sm">Em caso de dúvidas, entre em contato pelo WhatsApp.</p>
              </div>
              <button
                type="button"
                onClick={() => { setGateStep("phone"); setCpwdNewPassword(""); setCpwdConfirmPassword(""); }}
                className="w-full text-white/50 text-xs hover:text-white/80 transition-colors"
              >
                Voltar ao início
              </button>
            </div>
          )}

          {/* ===== STEP 3: SENHA ===== */}
          {gateStep === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">

              {/* Card de identificação do usuário */}
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-white/50 text-[10px] uppercase tracking-widest font-semibold">Número identificado</p>
                  <p className="text-white font-bold text-base">{formatPhone(clientPhone)}</p>
                </div>
              </div>

              {/* Instrução clara */}
              <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
                <p className="text-white/90 text-sm font-semibold text-center">🔐 Digite a senha que você criou no cadastro</p>
                <p className="text-white/50 text-xs text-center mt-1">A mesma senha definida quando você se cadastrou no site</p>
              </div>

              {/* Campo de senha */}
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                  Sua senha de cadastro
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full px-4 py-3.5 bg-white/10 text-white text-lg text-center font-bold rounded-xl border-2 border-white/20 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all placeholder:text-white/30"
                    autoFocus
                    disabled={isValidating}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Botão entrar */}
              <button
                type="submit"
                disabled={isValidating || !password.trim()}
                className="w-full px-4 py-4 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-lg rounded-xl transition-all duration-200 active:scale-[0.98] shadow-xl shadow-primary/40"
              >
                {isValidating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Lock className="w-5 h-5" />
                    ENTRAR
                  </span>
                )}
              </button>

              {/* Links auxiliares */}
              <div className="flex flex-col items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setGateStep("phone"); setPassword(""); }}
                  className="text-white/40 text-xs hover:text-white/70 transition-colors underline underline-offset-2"
                >
                  ← Trocar número de telefone
                </button>

                <div className="w-full border-t border-white/10" />

                <p className="text-white/40 text-xs text-center">
                  Esqueceu sua senha? Entre em contato pelo
                </p>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Olá! Esqueci minha senha de acesso ao site. Meu telefone é ${getPhoneDigits(clientPhone)}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500/30 hover:bg-green-600/30 text-green-400 rounded-xl text-sm font-semibold transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Recuperar senha via WhatsApp
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente auxiliar: registra automaticamente o uso do link de indicação ──
function ReferralAutoRegister({
  code,
  clientName,
  clientPhone,
  onComplete,
}: {
  code: string;
  clientName: string;
  clientPhone: string;
  onComplete: (success: boolean, name?: string) => void;
}) {
  const validateQuery = trpc.referral.validateCode.useQuery(
    { code, phone: clientPhone },
    { enabled: !!code }
  );

  useEffect(() => {
    if (validateQuery.data !== undefined) {
      if (validateQuery.data.valid) {
        const name = validateQuery.data.link?.customerName ?? undefined;
        onComplete(true, name);
      } else {
        // Código inválido — pular e ir para o formulário manual
        onComplete(false);
      }
    }
  }, [validateQuery.data]);

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="w-10 h-10 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-white/70 text-sm">Verificando link de indicação...</p>
    </div>
  );
}
