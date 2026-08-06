import React, { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Link, useSearch } from "wouter";
import { useDevToolsDetection } from "@/hooks/useDevToolsDetection";
import {
  Phone, Search, Package, Clock, FileCheck, Zap, DollarSign,
  XCircle, ChevronRight, ArrowLeft, CheckCircle2, Loader2, Eye, EyeOff, Wrench,
  Star, AlertCircle, Info, RefreshCw, Copy, Check, LogOut, Calendar,
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  Clock: <Clock className="w-5 h-5" />,
  Package: <Package className="w-5 h-5" />,
  DollarSign: <DollarSign className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />,
  FileCheck: <FileCheck className="w-5 h-5" />,
  XCircle: <XCircle className="w-5 h-5" />,
  Wrench: <Wrench className="w-5 h-5" />,
  CheckCircle2: <CheckCircle2 className="w-5 h-5" />,
  Star: <Star className="w-5 h-5" />,
  AlertCircle: <AlertCircle className="w-5 h-5" />,
  Info: <Info className="w-5 h-5" />,
};

function extractBorder(bgColor: string): string {
  // Tentar extrair do bgColor que já contém border-*
  const match = bgColor.match(/border-[\w/-]+/);
  if (match) return match[0];
  return "border-white/20";
}

function extractBg(bgColor: string): string {
  // Extrair apenas a parte bg-* do bgColor composto
  const match = bgColor.match(/bg-[\w/-]+/);
  if (match) return match[0];
  return "bg-white/10";
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// Renderiza texto com URLs convertidas em links clicáveis
function renderTextWithLinks(text: string): React.ReactNode {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (part && urlRegex.test(part)) {
      const href = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 underline hover:brightness-125 cursor-pointer transition-colors"
        >
          {part}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function OrderTracking() {
  // Modo ADM: ativado via URL ?adm=3095 — libera acesso sem PIN e desativa DevTools
  const ADM_PASSWORD = '3095';
  const searchStr = useSearch();
  const [admMode, setAdmMode] = useState(() => {
    // Verificar query string na URL
    const params = new URLSearchParams(searchStr);
    if (params.get('adm') === ADM_PASSWORD) {
      sessionStorage.setItem('ot_adm', 'true');
      // Limpar da URL sem recarregar
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('adm');
        window.history.replaceState({}, '', url.pathname + (url.search || ''));
      }
      return true;
    }
    return sessionStorage.getItem('ot_adm') === 'true';
  });

  // Persistir estado no sessionStorage para sobreviver ao refresh
  const [phoneInput, setPhoneInput] = useState(() => sessionStorage.getItem('ot_phoneInput') || "");
  const [searchPhone, setSearchPhone] = useState(() => sessionStorage.getItem('ot_searchPhone') || "");
  const [searched, setSearched] = useState(() => sessionStorage.getItem('ot_searched') === 'true');
  const [showNote, setShowNote] = useState(false);
  // ─── Novo sistema de senha (customerPassword) ───────────────────────────
  const [pwdToken, setPwdToken] = useState(() => localStorage.getItem('cp_token') || '');
  const [pwdVerified, setPwdVerified] = useState(false);
  // Estados de senha
  const [cpwdStatus, setCpwdStatus] = useState<'idle'|'no_password'|'pending_approval'|'expired'|'active'|'not_found'>('idle');
  const [cpwdModeChecked, setCpwdModeChecked] = useState(false);
  const [cpwdMode, setCpwdMode] = useState<'auto'|'manual'>('manual');
  // Telas
  const [cpwdScreen, setCpwdScreen] = useState<'login'|'create'|'pending'|'expired'|'blocked'>('login');
  const [cpwdInput, setCpwdInput] = useState('');
  const [cpwdShowPwd, setCpwdShowPwd] = useState(false);
  const [cpwdError, setCpwdError] = useState('');
  const [cpwdLoading, setCpwdLoading] = useState(false);
  // Criar senha
  const [cpwdNew, setCpwdNew] = useState('');
  const [cpwdNewConfirm, setCpwdNewConfirm] = useState('');
  const [cpwdNewError, setCpwdNewError] = useState('');
  // Legado (mantidos para compatibilidade com estados de CPF)
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pinBlocked, setPinBlocked] = useState(false);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [showCreatePin, setShowCreatePin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [newPinError, setNewPinError] = useState("");

  const phoneDigits = useMemo(() => phoneInput.replace(/\D/g, ""), [phoneInput]);

  const formatInput = (val: string) => {
    const d = val.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return val;
  };

  // Ler configuração global de proteção DevTools
  const siteSettingsQuery = trpc.settings.getAll.useQuery();
  const devtoolsProtectionEnabled = siteSettingsQuery.data ? siteSettingsQuery.data['devtools_protection'] === '1' : false;

  const statusQuery = trpc.orderStatus.getMyStatus.useQuery(
    { phone: searchPhone },
    { enabled: !!searchPhone && searchPhone.length >= 10 }
  );

  const clientNameQuery = trpc.orderStatus.getClientName.useQuery(
    { phone: searchPhone },
    { enabled: !!searchPhone && searchPhone.length >= 10 }
  );

  // Banners informativos da página de acompanhamento
  const { data: activeBanners = [] } = trpc.banners.listActive.useQuery({ page: 'acompanhar' });

  // ===== PROPAGANDA OBRIGATÓRIA =====
  const [adVisible, setAdVisible] = useState(false);
  const [adProgress, setAdProgress] = useState(0);
  const [adCanClose, setAdCanClose] = useState(false);
  const [adCampaign, setAdCampaign] = useState<any>(null);
  const adSessionKey = useMemo(() => {
    const k = sessionStorage.getItem('walk_ad_session_key_ot') || Math.random().toString(36).slice(2);
    sessionStorage.setItem('walk_ad_session_key_ot', k);
    return k;
  }, []);
  const { data: adData } = trpc.adCampaigns.checkForPage.useQuery(
    { page: 'acompanhar', sessionKey: adSessionKey },
    { staleTime: Infinity }
  );
  useEffect(() => {
    if (adData?.campaign) {
      setAdCampaign(adData.campaign);
      setAdProgress(0);
      setAdCanClose(false);
      setAdVisible(true);
    }
  }, [adData?.campaign?.id]);
  useEffect(() => {
    if (!adVisible || !adCampaign || adCampaign.type !== 'image') return;
    const total = (adCampaign.requiredSeconds || 20) * 1000;
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(100, Math.round((elapsed / total) * 100));
      setAdProgress(pct);
      if (pct >= 100) { setAdCanClose(true); clearInterval(timer); }
    }, interval);
    return () => clearInterval(timer);
  }, [adVisible, adCampaign?.id]);

  // Query de status dinâmicos do banco
  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = useMemo(
    () => (statusTypesQuery.data ?? []).filter((s: any) => s.isActive === 1).sort((a: any, b: any) => a.sortOrder - b.sortOrder),
    [statusTypesQuery.data]
  );

  // Helper para obter configuração de um status pelo key
  const getStatusCfg = (key: string) => {
    const s = dynamicStatuses.find((x: any) => x.key === key);
    if (s) {
      return {
        label: s.label,
        color: s.color,
        bg: extractBg(s.bgColor),
        border: extractBorder(s.bgColor),
        icon: ICON_MAP[s.icon] ?? <Clock className="w-5 h-5" />,
        step: s.sortOrder,
        description: s.description ?? null,
        pulseColor: (s as any).pulseColor ?? null,
      };
    }
    return {
      label: key,
      color: "text-white/60",
      bg: "bg-white/10",
      border: "border-white/20",
      icon: <Clock className="w-5 h-5" />,
      step: 0,
      description: null as string | null,
      pulseColor: null as string | null,
    };
  };

  const handleSearch = () => {
    if (phoneDigits.length < 10) return;
    setSearchPhone(phoneDigits);
    sessionStorage.setItem('ot_searchPhone', phoneDigits);
    sessionStorage.setItem('ot_phoneInput', phoneInput);
    setSearched(true);
    sessionStorage.setItem('ot_searched', 'true');
    setPinVerified(false);
    setPwdVerified(false);
    setCpwdScreen('login');
    setCpwdInput('');
    setCpwdError('');
    setCpwdNew('');
    setCpwdNewConfirm('');
    setCpwdNewError('');
    setSelectedOrderIdx(0);
  };

  const handleRefresh = () => {
    statusQuery.refetch();
    adminFilesQuery.refetch();
  };

  const handleCopyOrderNumber = (num: number | string) => {
    navigator.clipboard.writeText(String(num)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  // Mutations do novo sistema de senha
  const cpwdCheckStatusQuery = trpc.customerPassword.checkStatus.useQuery(
    { phone: searchPhone },
    { enabled: !!searchPhone && searchPhone.length >= 10 && !pwdVerified && !admMode, staleTime: 0 }
  );
  const cpwdModeQuery = trpc.customerPassword.getMode.useQuery(
    undefined,
    { enabled: !!searchPhone && searchPhone.length >= 10 && !pwdVerified && !admMode }
  );
  const cpwdLoginMut = trpc.customerPassword.login.useMutation();
  const cpwdCreateAutoMut = trpc.customerPassword.clientCreateAuto.useMutation();
  const cpwdCreateManualMut = trpc.customerPassword.clientCreateManual.useMutation();
  const cpwdCheckSessionQuery = trpc.customerPassword.checkSession.useQuery(
    { token: pwdToken },
    { enabled: !!pwdToken && !pwdVerified && !admMode, staleTime: 0 }
  );
  const checkPinMutation = trpc.customerPin.check.useMutation();
  const setPinMutation = trpc.customerPin.setPin.useMutation();
  const updateCpfMutation = trpc.customers.updateCpfByPhone.useMutation();

  // Estado para tela de atualização de CPF
  const [needsCpfUpdate, setNeedsCpfUpdate] = useState(false);
  const [cpfValue, setCpfValue] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [cpfLoading, setCpfLoading] = useState(false);

  // Query para checar dados do cliente (CPF)
  const customerCheckQuery = trpc.customers.checkByPhone.useQuery(
    { phone: searchPhone },
    { enabled: !!searchPhone && searchPhone.length >= 10, staleTime: 0 }
  );

  const handlePinSubmit = async (val?: string) => {
    const pin = val ?? pinInput;
    if (pin.length !== 4) return;
    const result = await checkPinMutation.mutateAsync({ phone: searchPhone, pin });
    if (result.blocked) {
      setPinBlocked(true);
      setPinError(false);
      return;
    }
    if (result.success) {
      // Verificar CPF antes de liberar acesso
      const custCheck = await customerCheckQuery.refetch();
      if (!(custCheck.data?.customer as any)?.cpf) {
        setNeedsCpfUpdate(true);
        setPinError(false);
        return;
      }
      if (result.firstAccess) {
        // Primeiro acesso: mostrar tela de criação de senha pessoal
        setShowCreatePin(true);
        setPinVerified(false);
        sessionStorage.removeItem('ot_pinVerified');
      } else {
        setPinVerified(true);
        sessionStorage.setItem('ot_pinVerified', 'true');
        setShowCreatePin(false);
      }
      setPinError(false);
    } else {
      setPinAttempts((result as any).attempts ?? 0);
      setPinError(true);
      setPinInput("");
    }
  };

  const handleCreatePin = async () => {
    if (newPin.length !== 4) { setNewPinError("A senha deve ter exatamente 4 dígitos."); return; }
    if (newPin !== newPinConfirm) { setNewPinError("As senhas não coincidem. Tente novamente."); return; }
    await setPinMutation.mutateAsync({ phone: searchPhone, newPin });
    // Verificar CPF antes de liberar acesso
    const custCheck2 = await customerCheckQuery.refetch();
    if (!(custCheck2.data?.customer as any)?.cpf) {
      setNeedsCpfUpdate(true);
      setShowCreatePin(false);
      setNewPinError("");
      return;
    }
    setShowCreatePin(false);
    setPinVerified(true);
    sessionStorage.setItem('ot_pinVerified', 'true');
    setNewPinError("");
  };

  const allHistory = statusQuery.data || [];

  // Separar histórico em pedidos individuais usando registrationId (identificador único de cada pedido)
  // O histórico vem ordenado DESC (mais recente primeiro)
  const orders = useMemo(() => {
    if (allHistory.length === 0) return [];
    // Agrupar por registrationId
    const grouped = new Map<number, typeof allHistory>();
    for (const entry of allHistory) {
      const rid = (entry as any).registrationId ?? 0;
      if (!grouped.has(rid)) grouped.set(rid, []);
      grouped.get(rid)!.push(entry);
    }
    // Converter para array de arrays, ordenado pelo registrationId mais recente primeiro
    const result = Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0]) // registrationId maior = mais recente
      .map(([, entries]) => entries); // já estão em DESC por createdAt
    // Ocultar pedidos com status mais recente = "login_de_acesso" (interno do admin)
    return result.filter(ord => {
      const latest = ord[0]?.status;
      return latest !== 'login_de_acesso';
    });
  }, [allHistory]);

  // Estado para selecionar qual pedido visualizar
  const [selectedOrderIdx, setSelectedOrderIdx] = useState(0);
  const [devToolsBlocked, setDevToolsBlocked] = useState(false);
  const securityAlertMut = trpc.system.securityAlert.useMutation();

  // Status que dispensam o alerta de DevTools (cliente já tem acesso liberado)
  const EXEMPT_STATUSES = ['login_liberado', 'entregue', 'pedido_entregue'];

  useDevToolsDetection(() => {
    // Não bloquear em modo ADM ou clientes com status de acesso liberado
    if (admMode) return;
    const currentStatus = orders.length > 0 ? (orders[selectedOrderIdx] || orders[0])?.[0]?.status : null;
    if (currentStatus && EXEMPT_STATUSES.includes(currentStatus)) return;
    setDevToolsBlocked(true);
    securityAlertMut.mutate({
      type: 'DevTools / Inspetor aberto',
      phone: searchPhone || undefined,
      page: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 200),
    });
  }, !admMode && devtoolsProtectionEnabled);
  const [copied, setCopied] = useState(false);

  // Pedido atualmente selecionado
  const history = orders.length > 0 ? orders[selectedOrderIdx] || orders[0] : [];

  // Pegar o status mais recente para a timeline
  const latestStatus = history.length > 0 ? history[0].status : null;
  const latestCfg = latestStatus ? getStatusCfg(latestStatus) : null;

  // Conjunto de status que realmente existem no histórico do pedido
  const completedStatusKeys = useMemo(
    () => new Set(history.map((h: any) => h.status)),
    [history]
  );

  // Verificar sessão salva ao carregar
  const sessionOk = cpwdCheckSessionQuery.data?.valid === true;
  const canAccess = pwdVerified || sessionOk || admMode;

  // Sincronizar pwdVerified com sessão válida
  useEffect(() => {
    if (sessionOk && !pwdVerified && !admMode) {
      setPwdVerified(true);
    }
  }, [sessionOk, pwdVerified, admMode]);

  // SEGURANÇA: sincronizar searchPhone com o phone da sessão autenticada
  // Isso evita que o sessionStorage de outro cliente seja exibido
  useEffect(() => {
    const sessionData = cpwdCheckSessionQuery.data;
    if (sessionData?.valid === true && sessionData.phone) {
      const digits = sessionData.phone.replace(/\D/g, '');
      if (digits && digits !== searchPhone) {
        setSearchPhone(digits);
        setPhoneInput(formatInput(digits));
        sessionStorage.setItem('ot_searchPhone', digits);
        sessionStorage.setItem('ot_phoneInput', formatInput(digits));
        setSearched(true);
        sessionStorage.setItem('ot_searched', 'true');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpwdCheckSessionQuery.data?.valid, cpwdCheckSessionQuery.data?.phone]);

  // Limpar token inválido do localStorage quando checkSession retorna valid: false
  useEffect(() => {
    if (cpwdCheckSessionQuery.data?.valid === false && pwdToken) {
      localStorage.removeItem('cp_token');
      setPwdToken('');
      setPwdVerified(false);
      // Limpar sessionStorage para não mostrar dados de outro cliente
      sessionStorage.removeItem('ot_searchPhone');
      sessionStorage.removeItem('ot_phoneInput');
      sessionStorage.removeItem('ot_searched');
      setSearchPhone('');
      setPhoneInput('');
      setSearched(false);
    }
  }, [cpwdCheckSessionQuery.data]);

  // Determinar tela a mostrar quando há pedido mas sem acesso
  const cpwdStatusData = cpwdCheckStatusQuery.data;
  const cpwdModeData = cpwdModeQuery.data?.mode ?? 'manual';

  const isFinalStatus = false;

  // Dados do pedido (da entrada mais antiga com serviceName)
  const orderInfo = [...history].reverse().find(h => h.serviceName);

  // Nota do status atual: busca a nota mais recente que não seja nula para o status atual
  const currentNote = history.find(h => h.status === latestStatus && h.note)?.note ?? null;

  // Previsão de entrega: pega o primeiro registro com deliveryEstimate válido
  // Trata casos onde o banco retorna string "NULL", "null", "0" ou bigint como string
  const deliveryEstimate = (() => {
    for (const h of history) {
      const v = h.deliveryEstimate;
      if (v === null || v === undefined) continue;
      const num = typeof v === 'string' ? parseInt(v, 10) : Number(v);
      if (!isNaN(num) && num > 0) return num;
    }
    return null;
  })();

  // Dados de login liberado
  const registrationId = history.length > 0 ? ((history[0] as any).registrationId ?? 0) : 0;
  // Documentos enviados pelo admin para o cliente (filtrado pelo pedido selecionado)
  const adminFilesQuery = trpc.orderStatus.getAdminFilesForClient.useQuery(
    { phone: searchPhone, registrationId: registrationId > 0 ? registrationId : undefined },
    { enabled: canAccess && history.length > 0, staleTime: 0, refetchInterval: 30000 }
  );
  const loginDataQuery = trpc.loginData.getForClient.useQuery(
    { registrationId, customerPhone: searchPhone },
    { enabled: canAccess && (latestStatus === 'entregue' || latestStatus === 'pedido_entregue') && registrationId > 0 }
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyField = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => {});
  };

  // Controle de documentos já lidos pelo cliente (persistido em localStorage)
  const readDocsKey = `read-admin-docs-${searchPhone}`;
  const [readDocs, setReadDocs] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem(`read-admin-docs-${searchPhone}`);
      return stored ? new Set(JSON.parse(stored) as number[]) : new Set<number>();
    } catch { return new Set<number>(); }
  });

  const markDocAsRead = (id: number) => {
    setReadDocs(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(readDocsKey, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  // Solicitações de documentos pendentes do admin
  const pendingDocReqQuery = trpc.docRequests.getPendingForClient.useQuery(
    { phone: searchPhone },
    { enabled: canAccess && !!searchPhone && history.length > 0 }
  );
  const answerDocReqMut = trpc.docRequests.answer.useMutation({
    onSuccess: () => {
      setPendingDocReqFile(null);
      setPendingDocReqLabel('');
      setAnsweringDocReqId(null);
      pendingDocReqQuery.refetch();
    },
  });
  const [answeringDocReqId, setAnsweringDocReqId] = useState<number | null>(null);
  const [pendingDocReqFile, setPendingDocReqFile] = useState<File | null>(null);
  const [pendingDocReqLabel, setPendingDocReqLabel] = useState('');
  const [uploadingDocReq, setUploadingDocReq] = useState(false);

  const handleDocReqUpload = async (req: { id: number; message: string }) => {
    if (!pendingDocReqFile) return;
    setUploadingDocReq(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(pendingDocReqFile!);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      });
      await answerDocReqMut.mutateAsync({
        docRequestId: req.id,
        registrationId,
        customerPhone: searchPhone,
        label: pendingDocReqLabel || 'Documento reenvio',
        fileBase64: base64,
        mimeType: pendingDocReqFile.type,
      });
    } catch (err) {
      console.error('Erro ao enviar documento:', err);
      toast.error('Erro ao enviar documento. Tente novamente.');
    } finally {
      setUploadingDocReq(false);
    }
  };

  // === FORMULÁRIO DINÂMICO DE ACOMPANHAMENTO (perguntas enviadas individualmente por pedido) ===
  const assignmentsQuery = trpc.trackingQuestions.getAssignments.useQuery(
    { orderId: registrationId },
    { enabled: canAccess && registrationId > 0, refetchInterval: 30000 }
  );
  const saveAssignmentAnswerMut = trpc.trackingQuestions.saveAssignmentAnswer.useMutation({
    onSuccess: () => { assignmentsQuery.refetch(); },
    onError: () => toast.error('Erro ao salvar resposta'),
  });
  const [trackingFormAnswers, setTrackingFormAnswers] = useState<Record<string | number, string>>({});
  const [submittedAssignmentIds, setSubmittedAssignmentIds] = useState<Set<number>>(new Set<number>());
  const handleSubmitAssignmentAnswer = async (questionId: number) => {
    const answer = trackingFormAnswers[questionId];
    if (!answer || !registrationId) return;
    await saveAssignmentAnswerMut.mutateAsync({
      orderId: registrationId,
      questionId,
      answer,
    });
    setSubmittedAssignmentIds(prev => {
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });
  };

  // Timeline steps: todos os status dinâmicos ativos, excluindo "cancelado"
  const timelineSteps = useMemo(
    () => dynamicStatuses.filter((s: any) => s.key !== 'cancelado'),
    [dynamicStatuses]
  );

  // Configuração de progresso por pedido (definida pelo admin individualmente)
  const subOrderIndex = selectedOrderIdx;
  const progressConfigPublicQuery = trpc.orderStatus.getProgressConfigPublic.useQuery(
    { registrationId, subOrderIndex },
    { enabled: canAccess && registrationId > 0, staleTime: 30000, refetchInterval: 60000 }
  );

  // Agendamentos deste cliente (busca por telefone — chave confiável)
  const scheduleQuery = trpc.schedule.listForTrackingByPhone.useQuery(
    { phone: searchPhone },
    { enabled: canAccess && !!searchPhone && searchPhone.length >= 10, refetchInterval: 30000 }
  );
  const rescheduleMut = trpc.schedule.requestReschedule.useMutation({
    onSuccess: () => { scheduleQuery.refetch(); },
  });

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      {/* ========== MODAL DE PROPAGANDA OBRIGATÓRIA ========== */}
      {adVisible && adCampaign && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4">
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ border: '1.5px solid rgba(0,200,255,0.35)', boxShadow: '0 0 40px 4px rgba(0,180,255,0.15), 0 8px 32px rgba(0,0,0,0.8)', maxWidth: '520px', maxHeight: '96vh' }}
          >
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 border border-white/10">
              <span className="text-xs text-gray-300 font-medium">Exibição obrigatória</span>
            </div>
            <div className="bg-[#080c1e] flex flex-col">
              {adCampaign.type === 'image' && adCampaign.imageUrl ? (
                <img src={adCampaign.imageUrl} alt={adCampaign.title || 'Propaganda'} className="w-full object-contain" style={{ maxHeight: '55vh', minHeight: '200px' }} />
              ) : adCampaign.type === 'video' && adCampaign.videoUrl ? (
                <div className="w-full relative bg-black" style={{ maxHeight: '60vh' }}>
                  <video
                    src={adCampaign.videoUrl}
                    className="w-full object-contain"
                    style={{ display: 'block', maxHeight: '60vh', width: '100%' }}
                    autoPlay playsInline muted crossOrigin="anonymous"
                    ref={(el) => { if (el) { el.muted = false; el.play().catch(() => { el.muted = true; el.play().catch(() => {}); }); } }}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (v.duration && v.duration > 0) {
                        const pct = Math.min(100, Math.round((v.currentTime / v.duration) * 100));
                        setAdProgress(pct);
                        if (pct >= 100) setAdCanClose(true);
                      }
                    }}
                    onEnded={(e) => {
                      setAdProgress(100);
                      const v = e.currentTarget;
                      const videoDuration = v.duration || 0;
                      const required = adCampaign.requiredSeconds || 20;
                      if (videoDuration <= required) { setTimeout(() => setAdVisible(false), 300); }
                      else { setAdCanClose(true); }
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-gradient-to-br from-blue-900/40 to-cyan-900/30">
                  <span className="text-4xl">📢</span>
                </div>
              )}
              {(adCampaign.title || adCampaign.description) && (
                <div className="px-4 pt-3 pb-1">
                  {adCampaign.title && <p className="text-white font-bold text-base">{adCampaign.title}</p>}
                  {adCampaign.description && <p className="text-gray-400 text-sm mt-0.5">{adCampaign.description}</p>}
                </div>
              )}
              <div className="px-4 pt-3 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{adCanClose ? 'Propaganda concluída' : `Encerrando em ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s`}</span>
                  <span className="text-xs font-bold" style={{ color: adProgress < 30 ? '#ef4444' : adProgress < 70 ? '#f59e0b' : adProgress < 100 ? '#00d4ff' : '#22c55e' }}>{adProgress}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-200" style={{ width: `${adProgress}%`, background: adProgress < 30 ? 'linear-gradient(90deg, #ef4444, #f97316)' : adProgress < 70 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : adProgress < 100 ? 'linear-gradient(90deg, #00d4ff, #0ea5e9)' : 'linear-gradient(90deg, #22c55e, #4ade80)' }} />
                </div>
                {adCampaign.linkUrl && (
                  <a href={adCampaign.linkUrl} target={adCampaign.linkTarget || '_blank'} rel="noopener noreferrer" className="mt-3 block w-full text-center py-2 rounded-lg text-sm font-semibold text-white transition-all" style={{ background: 'linear-gradient(90deg, #0ea5e9, #06b6d4)', boxShadow: '0 0 16px rgba(14,165,233,0.3)' }}>
                    {adCampaign.linkText || 'Saiba Mais'}
                  </a>
                )}
                <button onClick={() => adCanClose && setAdVisible(false)} disabled={!adCanClose} className="mt-3 w-full py-2.5 rounded-lg text-sm font-semibold transition-all" style={{ background: adCanClose ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: adCanClose ? '#fff' : '#555', border: adCanClose ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.05)', cursor: adCanClose ? 'pointer' : 'not-allowed' }}>
                  {adCanClose ? 'Fechar propaganda ✕' : `Aguarde ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s para fechar`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bloqueio de segurança - DevTools detectado (não aplica para login_liberado/entregue) */}
      {devToolsBlocked && !EXEMPT_STATUSES.includes(latestStatus || '') && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center p-6">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-red-400 mb-2 text-center">Acesso Bloqueado</h2>
          <p className="text-sm text-white/60 text-center max-w-xs">
            Ferramentas de desenvolvedor foram detectadas. Por segurança, o acesso foi bloqueado e o administrador foi notificado.
          </p>
          <button
            onClick={() => { window.location.href = '/'; }}
            className="mt-6 px-6 py-2 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      )}
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0d0d1a]/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <button className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-bold text-white">Acompanhar Pedido</h1>
          <p className="text-xs text-muted-foreground">
            {sessionOk && searchPhone
              ? `📱 ${formatPhone(searchPhone)}`
              : 'Consulte o status pelo seu telefone'}
          </p>
        </div>
        {canAccess && searched && history.length > 0 && (
          <button
            onClick={() => {
              // Limpar sessionStorage ao sair
              sessionStorage.removeItem('ot_searchPhone');
              sessionStorage.removeItem('ot_phoneInput');
              sessionStorage.removeItem('ot_searched');
              sessionStorage.removeItem('ot_pinVerified');
              sessionStorage.removeItem('ot_adm');
              localStorage.removeItem('cp_token');
              setAdmMode(false);
              setSearchPhone("");
              setPhoneInput("");
              setSearched(false);
              setPinVerified(false);
              setPwdVerified(false);
              setPwdToken('');
              setCpwdScreen('login');
              setCpwdInput('');
              setCpwdError('');
              setPinInput("");
              setPinError(false);
              setPinBlocked(false);
              setPinAttempts(0);
              setShowCreatePin(false);
              setNewPin("");
              setNewPinConfirm("");
              setNewPinError("");
              setSelectedOrderIdx(0);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors text-xs font-semibold border border-red-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Campo de busca — oculto quando cliente já tem sessão válida */}
        {!sessionOk && <div className="bg-[#12122a] rounded-2xl border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-2 text-purple-400">
            <Phone className="w-5 h-5" />
            <span className="font-semibold text-sm">Digite seu número de telefone</span>
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              value={phoneInput}
              onChange={e => setPhoneInput(formatInput(e.target.value))}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="(11) 99999-9999"
              className="flex-1 px-4 py-3 bg-[#0d0d1a] border border-white/10 rounded-xl text-white placeholder:text-white/30 text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <button
              onClick={handleSearch}
              disabled={phoneDigits.length < 10}
              className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-white/30 text-center">
            Use o mesmo número cadastrado no pedido
          </p>
          {/* Indicador de modo ADM ativo (só aparece quando ativo via URL) */}
          {admMode && (
            <div className="flex items-center justify-between pt-1 border-t border-amber-500/20">
              <span className="text-xs text-amber-400/70">🔓 Modo ADM ativo</span>
              <button
                onClick={() => {
                  setAdmMode(false);
                  sessionStorage.removeItem('ot_adm');
                }}
                className="text-xs text-amber-400/50 hover:text-amber-400 transition-colors underline"
              >
                Desativar
              </button>
            </div>
          )}
        </div>}

        {/* Banners informativos */}
        {activeBanners.length > 0 && (
          <div className="space-y-3">
            {activeBanners.map(b => (
              <div
                key={b.id}
                className="rounded-xl px-4 py-3 border border-white/10 flex items-start gap-3"
                style={{ backgroundColor: b.bgColor, color: b.textColor }}
              >
                <span className="text-base flex-shrink-0 mt-0.5">📢</span>
                <div className="min-w-0">
                  {b.title && <p className="text-sm font-bold leading-tight mb-0.5">{b.title}</p>}
                  <p className="text-xs leading-relaxed whitespace-pre-wrap opacity-90">{b.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {statusQuery.isLoading && (
          <div className="flex items-center justify-center gap-3 py-12 text-purple-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Buscando pedido...</span>
          </div>
        )}

        {/* Sem resultados */}
        {searched && !statusQuery.isLoading && history.length === 0 && (
          <div className="bg-[#12122a] rounded-2xl border border-white/10 p-8 text-center space-y-3">
            <div className="text-4xl">🔍</div>
            <p className="text-white font-semibold">Nenhum pedido encontrado</p>
            <p className="text-sm text-white/40">
              Não encontramos pedidos para o número{" "}
              <strong className="text-white/60">{formatPhone(searchPhone)}</strong>.
              Verifique se o número está correto.
            </p>
          </div>
        )}

        {/* Tela de atualização de CPF obrigatória */}
        {history.length > 0 && needsCpfUpdate && (
          <div className="bg-[#12122a] rounded-2xl border border-yellow-500/30 p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="text-3xl">📋</div>
              <p className="text-white font-semibold">Atualização de cadastro necessária</p>
              <p className="text-sm text-yellow-300">Para continuar, informe seu CPF. Este dado é obrigatório para todos os serviços.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">CPF <span className="text-red-400">*</span></label>
              <input
                type="text"
                inputMode="numeric"
                value={cpfValue}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                  let f = d;
                  if (d.length > 9) f = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
                  else if (d.length > 6) f = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
                  else if (d.length > 3) f = `${d.slice(0,3)}.${d.slice(3)}`;
                  setCpfValue(f);
                  setCpfError('');
                }}
                placeholder="000.000.000-00"
                className={`w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 outline-none transition-all ${
                  cpfError ? 'border-red-500' : cpfValue.replace(/\D/g,'').length === 11 ? 'border-green-500' : 'border-gray-300'
                }`}
              />
              {cpfError && <p className="text-red-400 text-sm mt-1">{cpfError}</p>}
            </div>
            <button
              disabled={cpfLoading || cpfValue.replace(/\D/g,'').length !== 11}
              onClick={async () => {
                const d = cpfValue.replace(/\D/g,'');
                const isValid = (c: string) => {
                  if (/^(\d)\1{10}$/.test(c)) return false;
                  let s = 0; for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
                  let r = (s * 10) % 11; if (r >= 10) r = 0; if (r !== parseInt(c[9])) return false;
                  s = 0; for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
                  r = (s * 10) % 11; if (r >= 10) r = 0; return r === parseInt(c[10]);
                };
                if (!isValid(d)) { setCpfError('CPF inválido'); return; }
                setCpfLoading(true);
                try {
                  const res = await updateCpfMutation.mutateAsync({ phone: searchPhone, cpf: d });
                  if (!res.success) { setCpfError(res.message || 'Erro ao salvar CPF'); return; }
                  setNeedsCpfUpdate(false);
                  setPinVerified(true);
                  sessionStorage.setItem('ot_pinVerified', 'true');
                  toast.success('CPF cadastrado com sucesso!');
                } catch { setCpfError('Erro ao salvar. Tente novamente.'); }
                finally { setCpfLoading(false); }
              }}
              className="w-full px-4 py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-600/80 hover:to-yellow-500/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all"
            >
              {cpfLoading ? 'Salvando...' : 'SALVAR E CONTINUAR'}
            </button>
          </div>
        )}

        {/* ===== NOVO SISTEMA DE SENHA ===== */}
        {/* Bloqueado pelo admin (via customerCheckQuery - bloqueia mesmo sem pedido) */}
        {searched && customerCheckQuery.data?.customerBlocked === true && (
          <div className="bg-[#12122a] rounded-2xl border border-red-500/30 p-6 space-y-3 text-center">
            <div className="text-4xl">🚫</div>
            <p className="text-red-400 font-bold text-lg">Acesso Bloqueado</p>
            {(customerCheckQuery.data as any)?.blockReason && (
              <p className="text-sm text-red-300/80 font-medium">{(customerCheckQuery.data as any).blockReason}</p>
            )}
            <p className="text-xs text-white/40">Entre em contato com o suporte para mais informações.</p>
          </div>
        )}
        {/* Bloqueado (via cpwdStatusData - bloqueia no fluxo de senha) */}
        {history.length > 0 && !canAccess && cpwdStatusData?.status === 'blocked' && customerCheckQuery.data?.customerBlocked !== true && (
          <div className="bg-[#12122a] rounded-2xl border border-red-500/30 p-6 space-y-3 text-center">
            <div className="text-4xl">🚫</div>
            <p className="text-red-400 font-bold text-lg">Acesso Bloqueado</p>
            {(cpwdStatusData as any)?.blockReason && (
              <p className="text-sm text-red-300/80 font-medium">{(cpwdStatusData as any).blockReason}</p>
            )}
            <p className="text-xs text-white/40">Entre em contato com o suporte para mais informações.</p>
          </div>
        )}

        {/* Aguardando liberação */}
        {history.length > 0 && !canAccess && cpwdStatusData?.status === 'pending_approval' && (
          <div className="bg-[#12122a] rounded-2xl border border-amber-500/30 p-6 space-y-3 text-center">
            <div className="text-4xl">⏳</div>
            <p className="text-amber-400 font-bold text-lg">Aguardando Liberação</p>
            <p className="text-sm text-white/50">Sua senha está sendo analisada pelo administrador. Aguarde a liberação para acessar.</p>
          </div>
        )}

        {/* Senha expirada */}
        {history.length > 0 && !canAccess && cpwdStatusData?.status === 'expired' && (
          <div className="bg-[#12122a] rounded-2xl border border-orange-500/30 p-6 space-y-4 text-center">
            <div className="text-4xl">⏰</div>
            <p className="text-orange-400 font-bold text-lg">Senha Expirada</p>
            <p className="text-sm text-white/50">Sua senha de acesso expirou. Crie uma nova senha para continuar.</p>
            <button
              onClick={() => setCpwdScreen('create')}
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl transition-colors"
            >
              Criar Nova Senha
            </button>
          </div>
        )}

        {/* Sem senha - criar */}
        {history.length > 0 && !canAccess && cpwdStatusData?.status === 'no_password' && cpwdScreen !== 'create' && (
          <div className="bg-[#12122a] rounded-2xl border border-green-500/30 p-6 space-y-4 text-center">
            <div className="text-4xl">🔑</div>
            <p className="text-white font-bold text-lg">Primeiro Acesso</p>
            <p className="text-sm text-white/50">Crie uma senha para acessar o acompanhamento do seu pedido.</p>
            <button
              onClick={() => setCpwdScreen('create')}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors"
            >
              Criar Minha Senha
            </button>
          </div>
        )}

        {/* Tela de criar senha */}
        {history.length > 0 && !canAccess && cpwdScreen === 'create' && (
          <div className="bg-[#12122a] rounded-2xl border border-green-500/30 p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="text-3xl">🔐</div>
              <p className="text-white font-bold text-lg">Criar Senha de Acesso</p>
              <p className="text-sm text-white/50">
                {cpwdModeData === 'auto'
                  ? 'Crie sua senha. O acesso será liberado automaticamente por 30 dias.'
                  : 'Crie sua senha. O administrador irá liberar seu acesso em breve.'}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Nova senha (mínimo 4 caracteres)</label>
                <div className="relative">
                  <input
                    type={cpwdShowPwd ? 'text' : 'password'}
                    value={cpwdNew}
                    onChange={e => { setCpwdNew(e.target.value); setCpwdNewError(''); }}
                    placeholder="Crie sua senha"
                    className="w-full px-4 py-3 bg-[#0d0d1a] border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 pr-10"
                  />
                  <button type="button" onClick={() => setCpwdShowPwd(!cpwdShowPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                    {cpwdShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Confirme a senha</label>
                <input
                  type="password"
                  value={cpwdNewConfirm}
                  onChange={e => { setCpwdNewConfirm(e.target.value); setCpwdNewError(''); }}
                  placeholder="Confirme sua senha"
                  className="w-full px-4 py-3 bg-[#0d0d1a] border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>
              {cpwdNewError && <p className="text-red-400 text-xs text-center">{cpwdNewError}</p>}
              <button
                onClick={async () => {
                  if (cpwdNew.length < 4) { setCpwdNewError('A senha deve ter pelo menos 4 caracteres.'); return; }
                  if (cpwdNew !== cpwdNewConfirm) { setCpwdNewError('As senhas não coincidem.'); return; }
                  setCpwdLoading(true);
                  try {
                    if (cpwdModeData === 'auto') {
                      const res = await cpwdCreateAutoMut.mutateAsync({ phone: searchPhone, password: cpwdNew });
                      if (res.token) {
                        localStorage.setItem('cp_token', res.token);
                        setPwdToken(res.token);
                        setPwdVerified(true);
                      }
                    } else {
                      await cpwdCreateManualMut.mutateAsync({ phone: searchPhone, password: cpwdNew });
                      setCpwdScreen('pending');
                    }
                  } catch (e: any) {
                    setCpwdNewError(e?.message || 'Erro ao criar senha.');
                  } finally {
                    setCpwdLoading(false);
                  }
                }}
                disabled={cpwdLoading || cpwdNew.length < 4}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {cpwdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {cpwdModeData === 'auto' ? 'Criar e Acessar' : 'Enviar para Liberação'}
              </button>
              {cpwdScreen === 'create' && cpwdStatusData?.status !== 'no_password' && (
                <button onClick={() => setCpwdScreen('login')} className="w-full text-xs text-white/30 hover:text-white/60 transition-colors">
                  Voltar para login
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tela de senha pendente (após criar em modo manual) */}
        {history.length > 0 && !canAccess && cpwdScreen === 'pending' && (
          <div className="bg-[#12122a] rounded-2xl border border-amber-500/30 p-6 space-y-3 text-center">
            <div className="text-4xl">⏳</div>
            <p className="text-amber-400 font-bold text-lg">Senha Enviada!</p>
            <p className="text-sm text-white/50">Sua senha foi criada e está aguardando liberação pelo administrador. Volte em breve.</p>
          </div>
        )}

        {/* Tela de login com senha */}
        {history.length > 0 && !canAccess && cpwdStatusData?.status === 'active' && cpwdScreen === 'login' && (
          <div className="bg-[#12122a] rounded-2xl border border-white/10 p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="text-3xl">🔐</div>
              <p className="text-white font-semibold">Pedido encontrado!</p>
              <p className="text-sm text-white/50">Digite sua senha para acessar</p>
            </div>
            <div className="relative">
              <input
                type={cpwdShowPwd ? 'text' : 'password'}
                value={cpwdInput}
                onChange={e => { setCpwdInput(e.target.value); setCpwdError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') {
                  (async () => {
                    if (!cpwdInput) return;
                    setCpwdLoading(true);
                    try {
                      const res = await cpwdLoginMut.mutateAsync({ phone: searchPhone, password: cpwdInput });
                      if (res.success && res.token) {
                        localStorage.setItem('cp_token', res.token);
                        setPwdToken(res.token);
                        setPwdVerified(true);
                      } else if ((res as any).error === 'blocked') {
                        setCpwdError('Acesso bloqueado' + ((res as any).blockReason ? ': ' + (res as any).blockReason : '') + '. Entre em contato com o suporte.');
                      } else {
                        setCpwdError(res.error === 'expired' ? 'Senha expirada. Crie uma nova.' : 'Senha incorreta.');
                      }
                    } catch { setCpwdError('Erro ao verificar senha.'); }
                    finally { setCpwdLoading(false); }
                  })();
                }}}
                placeholder="Digite sua senha"
                className={`w-full px-4 py-3 bg-[#0d0d1a] border rounded-xl text-white focus:outline-none focus:ring-2 pr-10 ${
                  cpwdError ? 'border-red-500 focus:ring-red-500/50' : 'border-white/10 focus:ring-purple-500/50'
                }`}
              />
              <button type="button" onClick={() => setCpwdShowPwd(!cpwdShowPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                {cpwdShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {cpwdError && <p className="text-red-400 text-xs text-center">{cpwdError}</p>}
            <button
              onClick={async () => {
                if (!cpwdInput) return;
                setCpwdLoading(true);
                try {
                  const res = await cpwdLoginMut.mutateAsync({ phone: searchPhone, password: cpwdInput });
                  if (res.success && res.token) {
                    localStorage.setItem('cp_token', res.token);
                    setPwdToken(res.token);
                    setPwdVerified(true);
                  } else if ((res as any).error === 'blocked') {
                    setCpwdError('Acesso bloqueado' + ((res as any).blockReason ? ': ' + (res as any).blockReason : '') + '. Entre em contato com o suporte.');
                  } else {
                    setCpwdError(res.error === 'expired' ? 'Senha expirada. Crie uma nova.' : 'Senha incorreta.');
                  }
                } catch { setCpwdError('Erro ao verificar senha.'); }
                finally { setCpwdLoading(false); }
              }}
              disabled={cpwdLoading || !cpwdInput}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {cpwdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Acessar Pedido
            </button>
            <button onClick={() => setCpwdScreen('create')} className="w-full text-xs text-white/30 hover:text-white/60 transition-colors">
              Esqueci minha senha
            </button>
          </div>
        )}

        {/* Resultados - conteúdo (acessível após PIN ou para pedidos finalizados) */}
        {history.length > 0 && canAccess && latestStatus && latestCfg && (
          <>
            {/* Seletor de pedidos quando há múltiplos */}
            {orders.length > 1 && (
              <div className="bg-[#12122a] rounded-2xl border border-purple-500/30 p-4 space-y-3">
                <p className="text-xs text-purple-400 font-semibold uppercase tracking-wider">Você tem {orders.length} pedidos</p>
                <div className="flex gap-2 flex-wrap">
                  {orders.map((ord, idx) => {
                    const ordInfo = [...ord].reverse().find(h => h.serviceName);
                    const ordStatus = ord[0]?.status;
                    const ordCfg = ordStatus ? getStatusCfg(ordStatus) : null;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedOrderIdx(idx)}
                        className={`flex-1 min-w-[140px] p-3 rounded-xl border text-left transition-all ${
                          selectedOrderIdx === idx
                            ? 'bg-purple-500/20 border-purple-500 ring-1 ring-purple-500/50'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <p className="text-xs font-bold text-white truncate">
                          {ordInfo?.serviceName || `Pedido ${orders.length - idx}`}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${ordCfg?.color || 'text-white/40'}`}>
                          {ordCfg?.label || ordStatus}
                        </p>
                        {(() => {
                          const oldest = ord[ord.length - 1]?.createdAt;
                          if (!oldest) return null;
                          return (
                            <p className="text-[10px] mt-1 text-white/40">
                              {new Date(oldest).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })}
                            </p>
                          );
                        })()}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Botão de atualizar */}
            <div className="flex justify-end">
              <button
                onClick={handleRefresh}
                disabled={statusQuery.isFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${statusQuery.isFetching ? 'animate-spin' : ''}`} />
                {statusQuery.isFetching ? 'Atualizando...' : 'Atualizar status'}
              </button>
            </div>

            {/* Status atual em destaque */}
            <div className={`rounded-2xl border p-5 ${latestCfg.bg} ${latestCfg.border}`}>
              <p className="text-xs text-white/50 mb-2 font-medium uppercase tracking-wider">Status Atual</p>
              <div className="flex items-center gap-3">
                {/* Ícone com animação de pulso */}
                <div className="relative flex-shrink-0 w-14 h-14 flex items-center justify-center">
                  {/* Anel externo pulsando */}
                  <span
                    className="absolute inline-flex w-14 h-14 rounded-full opacity-50 animate-ping"
                    style={{ backgroundColor: latestCfg.pulseColor ?? '#ffffff', animationDuration: '1.8s' }}
                  />
                  {/* Anel médio respirando */}
                  <span
                    className="absolute inline-flex w-12 h-12 rounded-full opacity-30 animate-pulse"
                    style={{ backgroundColor: latestCfg.pulseColor ?? '#ffffff', animationDuration: '2.4s' }}
                  />
                  {/* Ícone central */}
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 ${latestCfg.bg} ${latestCfg.border} ${latestCfg.color}`}>
                    {latestCfg.icon}
                  </div>
                </div>
                <div>
                  <p className={`text-xl font-bold ${latestCfg.color}`}>{latestCfg.label}</p>
                  <p className="text-xs text-white/40 mt-0.5">{formatDate(history[0].createdAt)}</p>
                </div>
              </div>
              {/* Texto explicativo dinâmico do status (description editado pelo admin) */}
              {latestCfg.description && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-xs font-semibold text-white/60 mb-1">O que significa este status?</p>
                    <div className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                      {renderTextWithLinks(latestCfg.description)}
                    </div>
                  </div>
                </div>
              )}

              {currentNote && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <button
                    onClick={() => setShowNote(v => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-white/60 hover:text-white/90 transition-colors w-full"
                  >
                    {showNote ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showNote ? 'Ocultar informações' : 'Ver informações do pedido'}
                  </button>
                  {showNote && (
                    <div className="mt-2 bg-white/5 rounded-xl p-3 border border-white/10">
                      <p className="text-sm text-white/90 whitespace-pre-line">{currentNote}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* === BARRA DE PROGRESSO DO CLIENTE (configuração por pedido) === */}
            {(() => {
              // Usar a configuração de progresso específica deste pedido
              const progressConfigData = progressConfigPublicQuery?.data ?? [];
              // Se não há configuração por pedido, não exibir a barra
              if (progressConfigData.length === 0) return null;
              // Montar os steps na ordem configurada pelo admin
              const progressSteps = progressConfigData
                .map((key: string) => (statusTypesQuery.data ?? []).find((s: any) => s.key === key))
                .filter(Boolean);
              if (progressSteps.length === 0) return null;
              // Encontrar o índice do status atual na barra de progresso
              let currentIdx = progressSteps.findIndex((s: any) => s.key === latestStatus);
              // Se o status atual não está na lista, encontrar o último status concluído
              // que esteja na lista (baseado no histórico do pedido)
              if (currentIdx === -1) {
                // Pegar todos os status do histórico do pedido
                const historyKeys = new Set(history.map((h: any) => h.status));
                // Encontrar o último step da lista que está no histórico
                let lastDoneIdx = -1;
                for (let i = 0; i < progressSteps.length; i++) {
                  if (progressSteps[i] && historyKeys.has((progressSteps[i] as any).key)) {
                    lastDoneIdx = i;
                  }
                }
                // Usar o próximo step após o último concluído como "atual" na barra
                currentIdx = lastDoneIdx >= 0 ? lastDoneIdx : 0;
              }
              const prevStep = currentIdx > 0 ? progressSteps[currentIdx - 1] : null;
              const currStep = progressSteps[currentIdx] ?? progressSteps[0];
              const nextStep = currentIdx < progressSteps.length - 1 ? progressSteps[currentIdx + 1] : null;
              return (
                <div className="bg-[#12122a] rounded-2xl border border-white/10 p-4 space-y-3">
                  <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">Progresso do Pedido</p>
                  {/* Barra de progresso visual */}
                  <div className="relative flex items-center gap-0">
                    {progressSteps.map((step: any, idx: number) => {
                      const isDone = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      const stepCfg = getStatusCfg(step.key);
                      return (
                        <React.Fragment key={step.id}>
                          {/* Nó */}
                          <div className="flex flex-col items-center gap-1 z-10" style={{ minWidth: 0 }}>
                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                isCurrent
                                  ? `border-current ${stepCfg.color} ${stepCfg.bg} ring-2 ring-offset-1 ring-offset-[#12122a]`
                                  : isDone
                                  ? 'border-green-500 bg-green-500/20'
                                  : 'border-white/15 bg-white/5'
                              }`}
                              style={isCurrent ? { outline: `2px solid ${stepCfg.pulseColor ?? 'transparent'}`, outlineOffset: '1px' } : {}}
                            >
                              {isDone ? (
                                <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              ) : isCurrent ? (
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stepCfg.pulseColor ?? '#fff' }} />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                              )}
                            </div>
                          </div>
                          {/* Linha conectora */}
                          {idx < progressSteps.length - 1 && (
                            <div className={`flex-1 h-0.5 ${
                              idx < currentIdx ? 'bg-green-500/60' : 'bg-white/10'
                            }`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {/* Cards anterior / atual / próximo */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: [prevStep, currStep, nextStep].filter(Boolean).length === 1 ? '1fr' : [prevStep, currStep, nextStep].filter(Boolean).length === 2 ? '1fr 1fr' : '1fr 1fr 1fr' }}>
                    {prevStep && (() => {
                      const cfg = getStatusCfg(prevStep.key);
                      return (
                        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-2.5 space-y-1 opacity-70">
                          <p className="text-[9px] font-bold text-green-400/60 uppercase tracking-wider">✓ Anterior</p>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                              <span className="scale-75">{cfg.icon}</span>
                            </div>
                            <p className={`text-[11px] font-semibold leading-tight ${cfg.color} line-clamp-2`}>{cfg.label}</p>
                          </div>
                        </div>
                      );
                    })()}
                    {currStep && (() => {
                      const cfg = getStatusCfg(currStep.key);
                      return (
                        <div className={`border-2 rounded-xl p-2.5 space-y-1 ${cfg.bg} ${cfg.border}`}>
                          <p className={`text-[9px] font-bold uppercase tracking-wider ${cfg.color} opacity-80`}>● Atual</p>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                              <span className="scale-75">{cfg.icon}</span>
                            </div>
                            <p className={`text-[11px] font-bold leading-tight ${cfg.color} line-clamp-2`}>{cfg.label}</p>
                          </div>
                        </div>
                      );
                    })()}
                    {nextStep && (() => {
                      const cfg = getStatusCfg(nextStep.key);
                      return (
                        <div className="bg-white/3 border border-white/8 rounded-xl p-2.5 space-y-1 opacity-50">
                          <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider">→ Próximo</p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full border border-white/15 bg-white/5 flex items-center justify-center flex-shrink-0 text-white/30">
                              <span className="scale-75">{cfg.icon}</span>
                            </div>
                            <p className="text-[11px] font-semibold leading-tight text-white/40 line-clamp-2">{cfg.label}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* Previsão de Entrega — bloco destacado separado */}
            {deliveryEstimate && latestStatus !== 'entregue' && latestStatus !== 'pedido_entregue' && latestStatus !== 'cancelado' && (
              <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-amber-400/10 p-5 shadow-lg shadow-amber-500/10">
                {/* Brilho de fundo */}
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400/5 to-orange-400/5 pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-0.5">⏰ Previsão de Entrega</p>
                    <p className="text-xl font-extrabold text-white leading-tight">{formatDate(new Date(deliveryEstimate))}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Dados do pedido */}
            {orderInfo && (
              <div className="bg-[#12122a] rounded-2xl border border-white/10 p-5 space-y-3">
                <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Detalhes do Pedido</p>
                <div className="space-y-2">
                  {clientNameQuery.data?.name && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/50">Nome</span>
                      <span className="text-white font-medium">{clientNameQuery.data.name}</span>
                    </div>
                  )}
                  {orderInfo.orderNumber && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/50">Nº do Pedido</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold font-mono">#{orderInfo.orderNumber}</span>
                        <button
                          onClick={() => handleCopyOrderNumber(orderInfo.orderNumber!)}
                          className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
                          title="Copiar número do pedido"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                  {orderInfo.serviceName && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/50">Serviço</span>
                      <span className="text-white font-medium">{orderInfo.serviceName}</span>
                    </div>
                  )}
                  {orderInfo.serviceOption && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/50">Opção</span>
                      <span className="text-white font-medium">{orderInfo.serviceOption}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/50">Telefone</span>
                    <span className="text-white font-medium font-mono">{formatPhone(searchPhone)}</span>
                  </div>
                  {/* Respostas do formulário */}
                  {(() => {
                    const answersRaw = [...history].reverse().find(h => h.answers)?.answers;
                    if (!answersRaw) return null;
                    try {
                      const parsed = JSON.parse(answersRaw);
                      const entries = Array.isArray(parsed)
                        ? parsed.filter((a: any) => a.question && a.answer)
                        : Object.entries(parsed).map(([q, a]) => ({ question: q, answer: a }));
                      if (!entries.length) return null;
                      return (
                        <>
                          <div className="border-t border-white/10 pt-2 mt-1" />
                          {entries.map((a: any, i: number) => (
                            <div key={i} className="flex flex-col gap-0.5 text-sm">
                              <span className="text-white/40 text-xs">{a.question}</span>
                              <span className="text-white font-medium">{String(a.answer)}</span>
                            </div>
                          ))}
                        </>
                      );
                    } catch { return null; }
                  })()}
                </div>
              </div>
            )}

            {/* === AGENDAMENTO DE ATENDIMENTO === */}
            {canAccess && (scheduleQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-3">
                {scheduleQuery.data!.map((a) => {
                  const link = `${window.location.origin}/agendar/${a.token}`;

                  // ── CONFIRMADO ──────────────────────────────────────────
                  if (a.status === "confirmed" && a.slotDate) {
                    const [y, m, d] = a.slotDate.split("-");
                    return (
                      <div key={a.id} className="rounded-2xl overflow-hidden border-2 border-green-500/60 shadow-lg shadow-green-900/30">
                        {/* Cabeçalho */}
                        <div className="bg-green-700/40 px-5 py-3 flex items-center gap-2 border-b border-green-500/30">
                          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                          <div>
                            <p className="text-green-300 text-xs font-black uppercase tracking-widest">✅ Agendamento Confirmado</p>
                            {a.serviceName && <p className="text-white/60 text-xs">{a.serviceName}</p>}
                          </div>
                        </div>
                        {/* Data e hora em destaque */}
                        <div className="bg-gradient-to-br from-green-900/50 to-[#0d1f14] px-5 py-6 text-center">
                          <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Seu atendimento está marcado para</p>
                          <p className="text-green-300 text-4xl font-black leading-none">{d}/{m}/{y}</p>
                          <p className="text-white text-2xl font-bold mt-1">às {a.slotTime}</p>
                          <p className="text-white/40 text-xs mt-4 leading-relaxed max-w-xs mx-auto">
                            O atendimento será feito pelo WhatsApp neste horário.<br />
                            Fique disponível — se não atender quando for chamado, será necessário reagendar.
                          </p>
                        </div>
                        {/* Ações */}
                        <div className="bg-green-900/20 px-4 pb-4 pt-3 flex flex-col gap-2">
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-600/30 border border-green-500/40 text-green-200 text-sm font-semibold hover:bg-green-600/50 active:scale-[0.98] transition-all"
                          >
                            <Calendar className="w-4 h-4" /> Ver detalhes do agendamento
                          </a>
                          <button
                            onClick={() => {
                              if (confirm("Deseja solicitar o reagendamento? Seu horário atual será liberado e você poderá escolher um novo horário disponível.")) {
                                rescheduleMut.mutate({ token: a.token });
                              }
                            }}
                            disabled={rescheduleMut.isPending}
                            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                          >
                            {rescheduleMut.isPending ? "Aguarde..." : "⚠️ Não poderei comparecer — quero reagendar"}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // ── PENDENTE (escolher horário) ──────────────────────────
                  return (
                    <a
                      key={a.id}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-2xl overflow-hidden border-2 border-fuchsia-500/70 shadow-lg shadow-fuchsia-900/30 hover:border-fuchsia-400 hover:shadow-fuchsia-800/40 active:scale-[0.98] transition-all"
                    >
                      <div className="bg-gradient-to-br from-fuchsia-900/60 to-purple-900/40 px-5 py-6 flex flex-col items-center text-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-fuchsia-500/20 border-2 border-fuchsia-400/60 flex items-center justify-center">
                          <Calendar className="w-8 h-8 text-fuchsia-300 animate-pulse" />
                        </div>
                        <div>
                          <p className="text-fuchsia-200 text-xs font-bold uppercase tracking-widest mb-1">Agendamento de Atendimento</p>
                          {a.serviceName && <p className="text-white/50 text-xs mb-2">{a.serviceName}</p>}
                          <p className="text-white text-xl font-black">📅 Escolher Data e Horário</p>
                          <p className="text-white/50 text-sm mt-1">Toque aqui para agendar seu atendimento</p>
                        </div>
                        <div className="w-full py-4 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-base font-black flex items-center justify-center gap-2 mt-1 transition-colors">
                          <Calendar className="w-5 h-5" /> Agendar Agora
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            {/* === FORMULÁRIO DINÂMICO DE ACOMPANHAMENTO (perguntas enviadas individualmente) === */}
            {canAccess && registrationId > 0 && (() => {
              const assignments = assignmentsQuery.data || [];
              // Perguntas pendentes (sem resposta no banco e não submetidas nesta sessão)
              const pendingAssignments = assignments.filter((a: any) => !a.answer && !submittedAssignmentIds.has(a.questionId));
              // Perguntas já respondidas (no banco)
              const answeredAssignments = assignments.filter((a: any) => !!a.answer);
              if (pendingAssignments.length === 0 && answeredAssignments.length === 0) return null;
              return (
                <div className="bg-[#0d1a2a] rounded-2xl border border-blue-500/30 p-5 space-y-4">
                  <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Perguntas para Você
                  </p>

                  {/* Perguntas pendentes */}
                  {pendingAssignments.map((a: any) => {
                    const opts: { label: string; color?: string }[] = (() => { try { return JSON.parse(a.questionOptions || '[]'); } catch { return []; } })();
                    const selected = trackingFormAnswers[a.questionId];
                    const isSubmitted = submittedAssignmentIds.has(a.questionId);
                    return (
                      <div key={a.id} className="space-y-3">
                        <p className="text-sm font-medium text-white">{a.questionText}</p>
                        <div className="flex flex-wrap gap-2">
                          {opts.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => !isSubmitted && setTrackingFormAnswers(prev => ({ ...prev, [a.questionId]: opt.label }))}
                              disabled={isSubmitted}
                              className={`px-4 py-2 rounded-full text-sm font-bold transition-all border-2 ${
                                selected === opt.label
                                  ? 'border-white text-white scale-105 shadow-lg'
                                  : 'border-transparent text-white/80 hover:scale-105'
                              } ${isSubmitted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                              style={{ backgroundColor: selected === opt.label ? (opt.color || '#6b7280') : (opt.color || '#6b7280') + '55' }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {!isSubmitted && (
                          <button
                            onClick={() => handleSubmitAssignmentAnswer(a.questionId)}
                            disabled={!selected || saveAssignmentAnswerMut.isPending}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors"
                          >
                            {saveAssignmentAnswerMut.isPending ? 'Enviando...' : 'Confirmar Resposta'}
                          </button>
                        )}
                        {isSubmitted && (
                          <p className="text-xs text-green-400 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Resposta enviada: {selected}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Respostas já enviadas (com opção de editar) */}
                  {answeredAssignments.length > 0 && (
                    <div className="space-y-3">
                      {pendingAssignments.length > 0 && <hr className="border-white/10" />}
                      {answeredAssignments.map((a: any) => {
                        const opts: { label: string; color?: string }[] = (() => { try { return JSON.parse(a.questionOptions || '[]'); } catch { return []; } })();
                        const isEditing = trackingFormAnswers[`edit_${a.questionId}`] !== undefined;
                        const editSelected = trackingFormAnswers[`edit_${a.questionId}`];
                        return (
                          <div key={a.id} className="space-y-2">
                            <p className="text-sm font-medium text-white/80">{a.questionText}</p>
                            {!isEditing ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block px-3 py-1.5 rounded-full text-sm font-bold"
                                  style={{ backgroundColor: (opts.find(o => o.label === a.answer)?.color || '#6b7280') + '33', color: opts.find(o => o.label === a.answer)?.color || '#9ca3af', border: `1px solid ${opts.find(o => o.label === a.answer)?.color || '#6b7280'}55` }}
                                >
                                  {a.answer}
                                </span>
                                <button
                                  onClick={() => setTrackingFormAnswers(prev => ({ ...prev, [`edit_${a.questionId}`]: a.answer }))}
                                  className="text-[11px] text-blue-400/70 hover:text-blue-400 underline transition-colors"
                                >
                                  Editar
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  {opts.map((opt, i) => (
                                    <button
                                      key={i}
                                      onClick={() => setTrackingFormAnswers(prev => ({ ...prev, [`edit_${a.questionId}`]: opt.label }))}
                                      className={`px-4 py-2 rounded-full text-sm font-bold transition-all border-2 ${
                                        editSelected === opt.label
                                          ? 'border-white text-white scale-105 shadow-lg'
                                          : 'border-transparent text-white/80 hover:scale-105'
                                      } cursor-pointer`}
                                      style={{ backgroundColor: editSelected === opt.label ? (opt.color || '#6b7280') : (opt.color || '#6b7280') + '55' }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={async () => {
                                      if (!editSelected || editSelected === a.answer) {
                                        setTrackingFormAnswers(prev => { const n = { ...prev }; delete n[`edit_${a.questionId}`]; return n; });
                                        return;
                                      }
                                      await saveAssignmentAnswerMut.mutateAsync({ orderId: registrationId, questionId: a.questionId, answer: editSelected });
                                      setTrackingFormAnswers(prev => { const n = { ...prev }; delete n[`edit_${a.questionId}`]; return n; });
                                    }}
                                    disabled={!editSelected || saveAssignmentAnswerMut.isPending}
                                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors"
                                  >
                                    {saveAssignmentAnswerMut.isPending ? 'Salvando...' : 'Salvar'}
                                  </button>
                                  <button
                                    onClick={() => setTrackingFormAnswers(prev => { const n = { ...prev }; delete n[`edit_${a.questionId}`]; return n; })}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl text-sm transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Mensagem de cancelamento */}
            {latestStatus === 'cancelado' && (
              <div className="bg-red-500/10 rounded-2xl border border-red-500/30 p-5 text-center space-y-2">
                <div className="text-3xl">❌</div>
                <p className="text-red-400 font-bold">Pedido Cancelado</p>
                <p className="text-sm text-white/50">Este pedido foi cancelado. Entre em contato conosco se tiver dúvidas.</p>
              </div>
            )}



            {/* === BLOCO LOGIN / ENTREGUE — visível para o cliente apenas quando entregue === */}
            {(latestStatus === 'entregue' || latestStatus === 'pedido_entregue') && canAccess && (
              <div className="bg-[#0e1f12] rounded-2xl border border-lime-500/40 p-5 space-y-4">
                <p className="text-xs text-lime-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  Seus Dados de Acesso
                </p>
                <p className="text-xs text-white/50">Você está recebendo seu login e senha. Assista o vídeo no final da página para saber como usar.</p>
                {loginDataQuery.isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-lime-400" />
                  </div>
                ) : loginDataQuery.data ? (
                  <div className="space-y-3">
                    {(loginDataQuery.data as any).loginPhone && (
                      <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Número de Telefone</p>
                          <p className="text-sm font-mono text-white font-semibold break-all">{(loginDataQuery.data as any).loginPhone}</p>
                        </div>
                        <button
                          onClick={() => copyField((loginDataQuery.data as any).loginPhone!, 'phone')}
                          className="flex-shrink-0 p-2 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-400 transition-colors"
                          title="Copiar telefone"
                        >
                          {copiedField === 'phone' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                    {loginDataQuery.data.loginEmail && (
                      <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Login (Email ou Telefone enviado pelo sistema)</p>
                          <p className="text-sm font-mono text-white font-semibold break-all">{loginDataQuery.data.loginEmail}</p>
                        </div>
                        <button
                          onClick={() => copyField(loginDataQuery.data!.loginEmail!, 'email')}
                          className="flex-shrink-0 p-2 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-400 transition-colors"
                          title="Copiar login"
                        >
                          {copiedField === 'email' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                    {loginDataQuery.data.loginPassword && (
                      <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Senha do app Uber e do e-mail Outlook</p>
                          <p className="text-sm font-mono text-white font-semibold break-all">{loginDataQuery.data.loginPassword}</p>
                          <p className="text-[10px] text-lime-400/70 mt-1">🔑 Use esta senha para entrar no app Uber <strong>e</strong> também para acessar o e-mail Outlook cadastrado</p>
                        </div>
                        <button
                          onClick={() => copyField(loginDataQuery.data!.loginPassword!, 'password')}
                          className="flex-shrink-0 p-2 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-400 transition-colors"
                          title="Copiar senha"
                        >
                          {copiedField === 'password' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                    {loginDataQuery.data.authCode && (
                      <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Código Autenticador</p>
                          <p className="text-sm font-mono text-white font-semibold break-all">{loginDataQuery.data.authCode}</p>
                        </div>
                        <button
                          onClick={() => copyField(loginDataQuery.data!.authCode!, 'authcode')}
                          className="flex-shrink-0 p-2 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-400 transition-colors"
                          title="Copiar código"
                        >
                          {copiedField === 'authcode' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                    {(loginDataQuery.data as any).emailLink && (
                      <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Link de Acesso ao E-mail</p>
                          <p className="text-xs font-mono text-blue-300 break-all">{(loginDataQuery.data as any).emailLink}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => copyField((loginDataQuery.data as any).emailLink, 'emaillink')}
                            className="p-2 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-400 transition-colors"
                            title="Copiar link"
                          >
                            {copiedField === 'emaillink' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => {
                              const url = (loginDataQuery.data as any).emailLink;
                              const finalUrl = url.startsWith('http') ? url : 'https://' + url;
                              window.open(finalUrl, '_blank', 'noopener,noreferrer');
                            }}
                            className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 transition-colors"
                            title="Abrir e-mail em nova aba"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                    {(loginDataQuery.data as any).loginGroupLink && (
                      <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Link do Grupo</p>
                          <p className="text-xs font-mono text-green-300 break-all">{(loginDataQuery.data as any).loginGroupLink}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => copyField((loginDataQuery.data as any).loginGroupLink, 'grouplink')}
                            className="p-2 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-400 transition-colors"
                            title="Copiar link"
                          >
                            {copiedField === 'grouplink' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => {
                              const url = (loginDataQuery.data as any).loginGroupLink;
                              const finalUrl = url.startsWith('http') ? url : 'https://' + url;
                              window.open(finalUrl, '_blank', 'noopener,noreferrer');
                            }}
                            className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 transition-colors"
                            title="Abrir link do grupo"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                    {(loginDataQuery.data as any).loginNotes && (
                      <div className="bg-black/30 rounded-xl p-3">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">📝 Instruções</p>
                        <p className="text-xs text-white/80 whitespace-pre-line leading-relaxed">{(loginDataQuery.data as any).loginNotes}</p>
                      </div>
                    )}
                    {!loginDataQuery.data.loginEmail && !loginDataQuery.data.loginPassword && !loginDataQuery.data.authCode && !(loginDataQuery.data as any).emailLink && !(loginDataQuery.data as any).loginGroupLink && !(loginDataQuery.data as any).loginNotes && (
                      <p className="text-xs text-white/40 text-center py-2">Aguarde — os dados serão disponibilizados em breve.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-white/40 text-center py-2">Aguarde — os dados serão disponibilizados em breve.</p>
                )}
              </div>
            )}

            {/* Alerta de Documentos Pendentes solicitados pelo admin */}
            {canAccess && pendingDocReqQuery.data && pendingDocReqQuery.data.length > 0 && (
              <div className="bg-[#1a1200] rounded-2xl border border-amber-500/50 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="text-sm font-bold text-amber-400">Documento(s) Pendente(s)</p>
                    <p className="text-xs text-amber-300/70">O administrador precisa que você reenvie um ou mais documentos.</p>
                  </div>
                </div>
                {pendingDocReqQuery.data.map(req => (
                  <div key={req.id} className="rounded-xl border border-amber-500/30 overflow-hidden">
                    {/* Nome do documento — estilo badge/botão */}
                    {(req as any).docLabel && (
                      <div className="bg-amber-500 px-4 py-2 flex items-center gap-2">
                        <svg className="w-4 h-4 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-sm font-bold text-black tracking-wide">{(req as any).docLabel}</span>
                      </div>
                    )}
                    {/* Observação — estilo card */}
                    <div className="bg-[#1a1000] px-4 py-3">
                      <p className="text-[11px] font-semibold text-amber-400/70 uppercase tracking-wider mb-1">Observação</p>
                      <p className="text-sm text-white/85 leading-relaxed">{req.message}</p>
                    </div>
                    {/* Ação de envio */}
                    <div className="bg-[#120e00] px-4 py-3">
                      {answeringDocReqId === req.id ? (
                        <div className="space-y-2">
                          <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                            uploadingDocReq ? 'border-amber-500/20 text-white/30 cursor-not-allowed' : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/5'
                          }`}>
                            {uploadingDocReq ? (
                              <><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-amber-400" /><span className="text-xs">Enviando...</span></>
                            ) : pendingDocReqFile ? (
                              <><span className="text-xs text-amber-300">✓ {pendingDocReqFile.name}</span><span className="text-xs text-amber-400/60 ml-1">(trocar)</span></>
                            ) : (
                              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg><span className="text-xs font-medium">Selecionar arquivo (imagem ou PDF)</span></>
                            )}
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              disabled={uploadingDocReq}
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) setPendingDocReqFile(f);
                              }}
                            />
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDocReqUpload(req)}
                              disabled={!pendingDocReqFile || uploadingDocReq}
                              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-bold rounded-lg transition-colors"
                            >
                              {uploadingDocReq ? 'Enviando...' : 'Enviar Documento'}
                            </button>
                            <button
                              onClick={() => { setAnsweringDocReqId(null); setPendingDocReqFile(null); setPendingDocReqLabel(''); }}
                              className="px-4 py-2 border border-amber-500/30 text-amber-400 text-xs rounded-lg hover:bg-amber-500/10 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAnsweringDocReqId(req.id); setPendingDocReqFile(null); setPendingDocReqLabel(''); }}
                          className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg transition-colors"
                        >
                          Enviar Documento
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Documentos enviados pelo admin */}
            {adminFilesQuery.data && adminFilesQuery.data.length > 0 && (
              <div className="bg-[#12122a] rounded-2xl border border-emerald-500/30 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Documentos para Você
                  </p>
                  {adminFilesQuery.data.filter(f => !readDocs.has(f.id)).length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400 text-black leading-none animate-pulse">
                      {adminFilesQuery.data.filter(f => !readDocs.has(f.id)).length} novo{adminFilesQuery.data.filter(f => !readDocs.has(f.id)).length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {adminFilesQuery.data.map(f => {
                    const isPdf = f.mimeType.includes('pdf');
                    const isImg = f.mimeType.startsWith('image/');
                    const isVid = f.mimeType.startsWith('video/');
                    const isExternalVideo = f.mimeType === 'video/external';
                    const isNew = !readDocs.has(f.id);
                    if (isVid) {
                      const ytMatch = f.fileUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube\.com\/shorts\/)+([\w-]{11})/);
                      const ytId = ytMatch?.[1];
                      return (
                        <div
                          key={f.id}
                          onClick={() => markDocAsRead(f.id)}
                          className={`rounded-xl border overflow-hidden transition-colors ${
                            isNew
                              ? 'border-emerald-400/50'
                              : 'border-emerald-500/20'
                          }`}
                        >
                          <div className={`flex items-center gap-2 px-3 py-2 ${
                            isNew ? 'bg-emerald-500/10' : 'bg-emerald-500/5'
                          }`}>
                            <span className="text-lg">🎬</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-white truncate">{f.label}</p>
                                {isNew && (
                                  <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400 text-black leading-none animate-pulse">
                                    NOVO
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-emerald-400/70">Vídeo</p>
                            </div>
                          </div>
                          {isExternalVideo ? (
                            ytId ? (
                              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                                <iframe
                                  src={`https://www.youtube.com/embed/${ytId}`}
                                  title={f.label}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  className="absolute inset-0 w-full h-full"
                                  style={{ border: 'none' }}
                                />
                              </div>
                            ) : (
                              <a
                                href={f.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm font-semibold transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Assistir Vídeo
                              </a>
                            )
                          ) : (
                            <video
                              src={f.fileUrl}
                              controls
                              playsInline
                              controlsList="nodownload"
                              onContextMenu={e => e.preventDefault()}
                              className="w-full bg-black"
                              style={{ display: 'block', userSelect: 'none', WebkitUserSelect: 'none', maxHeight: '70vh' }}
                            />
                          )}
                        </div>
                      );
                    }
                    return (
                      <a
                        key={f.id}
                        href={f.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markDocAsRead(f.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                          isNew
                            ? 'bg-emerald-500/10 border-emerald-400/50 hover:bg-emerald-500/15'
                            : 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                        }`}
                      >
                        <span className="text-2xl flex-shrink-0">{isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">{f.label}</p>
                            {isNew && (
                              <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400 text-black leading-none animate-pulse">
                                NOVO
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-emerald-400/70">{isPdf ? 'PDF' : isImg ? 'Imagem' : 'Arquivo'} — Toque para abrir</p>
                        </div>
                        <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}


          </>
        )}
      </div>
    </div>
  );
}
