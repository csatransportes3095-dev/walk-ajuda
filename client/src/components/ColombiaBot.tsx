/**
 * ColombiaBot — Chat acumulado com callbacks em ref
 * Cada mensagem carrega seu próprio handler, eliminando stale closure.
 * Sub-perguntas aparecem corretamente após a resposta do pai.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Camera, ChevronRight, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useVipMembership } from "@/hooks/useVipMembership";
import { QuestionAudioRecorder, type AudioDraft } from "@/components/QuestionAudioRecorder";
import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";
import { isPersistedOrderResult } from "@shared/orderSubmission";
import { getVehicleModels, getVehicleQuestionKind, VEHICLE_BRANDS, VEHICLE_COLORS, VEHICLE_YEARS } from "@shared/vehicleCatalog";
import { applyVipBenefitToPrice, isVipOnlyLocked, normalizeVipAccessMode, vipBenefitText } from "@shared/vipPricing";
import { globalPromotionIsActive, globalPromotionOverridesIndividual, globalPromotionPrice } from "@shared/globalPromotion";
import { ColombiaBotStorefrontCard } from "@/components/ColombiaBotStorefrontCard";
import { captureColombiaBotChoice } from "@/lib/colombiaBotNavigation";
import { getBotCheckoutTotals, findBotBlockedChoice, sameBotProgressOwner, type BotBlockedChoice } from "@/lib/colombiaBotCheckout";
import { requestProductManifest } from "@/lib/productManifest";
import { isUsableBotCouponCode, resolveBotCouponChoice, resolveBotResumeStep, sameBotSelectOption } from "@/lib/colombiaBotFlow";

// ── Tipos ────────────────────────────────────────────────────────────────────

type Product = {
  id: number; name: string; description?: string | null; iconUrl?: string | null; deliveryDays?: string | null;
  options: ProductOption[];
};
type OptionPriceModel = { id: number; optionId: number; label: string; price: string; originalPrice?: string | null; promoEndsAt?: number | null; sortOrder: number; isActive: number; vipAccessMode?: 'all' | 'benefit' | 'vip_only'; vipDiscountType?: 'percentage' | 'fixed'; vipDiscountValue?: number; vipHighlight?: number; vipHighlightText?: string | null; };
type ProductOption = {
  id: number; name: string; price?: string; label?: string; type?: string; isPdfOnly?: number; priceModels?: OptionPriceModel[];
  description?: string | null; warranty?: string | null; originalPrice?: string | null;
  questions: ProductQuestion[];
  documents: ProductDocument[];
};
type ProductQuestion = {
  id: number; question: string; fieldType: string; options: string | null;
  isRequired: number; sortOrder: number;
  helpText?: string | null; audioMinDurationSeconds?: number; audioMaxDurationSeconds?: number;
  allowAudioRerecord?: number; allowAudioFileUpload?: number;
  questionPresentation?: 'text' | 'audio'; questionAudioUrl?: string | null; showQuestionTextWithAudio?: number;
  parentQuestionId: number | null; triggerOption: string | null;
};
type ProductDocument = {
  id: number; label: string; isRequired?: number; sortOrder: number;
};

// ── Mensagem do chat ─────────────────────────────────────────────────────────

type ChatMsg =
  | { type: "bot"; id: string; text: string; audioUrl?: string | null; hideText?: boolean; questionLevel?: "principal" | "sub" }
  | { type: "user"; id: string; text: string }
  | { type: "options"; id: string; options: string[]; answered: boolean; questionLevel?: "principal" | "sub" }
  | { type: "storefront-options"; id: string; product: Product; options: ProductOption[]; answered: boolean }
  | { type: "storefront-guarantees"; id: string; product: Product; option: ProductOption; models: OptionPriceModel[]; answered: boolean }
  | { type: "input"; id: string; multiline: boolean; answered: boolean; questionLevel?: "principal" | "sub" }
  | { type: "audio-input"; id: string; question: ProductQuestion; answered: boolean; questionLevel?: "principal" | "sub" }
  | { type: "doc-upload"; id: string; docId: number; label: string; required: boolean; uploaded: boolean; previewUrl?: string; previewMime?: string }
  | { type: "pix-payment"; id: string; pixKey: string; pixName: string; pixBank: string; price: string; basePrice?: string; discountPrice?: string; uploaded: boolean; previewUrl?: string; previewMime?: string }
  | { type: "action"; id: string; label: string; done: boolean };

// ── Props ────────────────────────────────────────────────────────────────────

export type BotOrderData = {
  cartItems: Array<{ service: string; nameOption: string; price: string }>;
  answers: Array<{ question: string; answer: string; questionId?: number; answerType?: string; audioUrl?: string; durationSeconds?: number }>;
  docs: Array<{ label: string; url: string }>;
  totalValue: string;
  referrerName: string;
  referrerPhone: string;
  clientName: string;
  clientPhone: string;
  clientCity: string;
  scheduleUrl?: string;
};

interface Props {
  products: Product[];
  onStartNormal: () => void;
  onSelectProduct: (product: Product) => void;
  onSelectOption: (product: Product, option: ProductOption) => void;
  onOrderComplete: (data: BotOrderData) => void;
  botName?: string;
  botAvatar?: string;
  botWelcome?: string;
  /** Entrada exclusiva pelo link /bot: começa pelo serviço, sem tela de escolha. */
  directEntry?: boolean;
}

const BOT_PROGRESS_KEY = 'walk_bot_order_progress';
const BOT_UPLOADED_FILES_KEY = 'walk_bot_uploaded_files';
const LEGACY_PROGRESS_KEY = 'walk_order_progress';
const LEGACY_UPLOADED_FILES_KEY = 'walk_uploaded_files';

function createAudioFlowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => char === 'x' ? hex() : ((Math.floor(Math.random() * 4) + 8).toString(16)));
}

// ── Componente ───────────────────────────────────────────────────────────────────────────

export function ColombiaBot({ products, onStartNormal, onSelectProduct, onSelectOption, onOrderComplete, botName, botAvatar, botWelcome, directEntry = false }: Props) {
  const displayName = botName || 'Carminha';
  const displayAvatar = botAvatar || '';
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [blockedChoice, setBlockedChoice] = useState<BotBlockedChoice | null>(null);
  const [sendError, setSendError] = useState("");
  const [currentPhase, setCurrentPhase] = useState("Serviço");

  const submitMutation = trpc.uploads.submitFiles.useMutation();
  const validateCouponMutation = trpc.coupons.validate.useMutation();
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Callbacks armazenados em ref para evitar stale closure
  const callbacks = useRef<Record<string, (...args: any[]) => void>>({});
  const couponInputIds = useRef<Set<string>>(new Set());

  // Histórico de snapshots para o botão Voltar
  type Snapshot = {
    messages: ChatMsg[];
    inputValues: Record<string, string>;
    flowState: typeof flowState.current;
    callbacks: Record<string, (...args: any[]) => void>;
  };
  const history = useRef<Snapshot[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ msgId: string; docId: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Estado do fluxo em ref (sem re-render)
  const flowState = useRef<{
    product: Product | null;
    option: ProductOption | null;
    priceModel: OptionPriceModel | null;
    answers: Record<number, string>;
    audioAnswers: Record<number, AudioDraft>;
    audioFlowId: string;
    docFiles: Record<number, { file?: File; url?: string; fileKey?: string; mime?: string }>;
    clientName: string;
    clientPhone: string;
    pixProofUrl: string;
    pixProofMime: string;
    couponCode: string;
    couponDiscount: { type: string; value: number } | null;
  }>({ product: null, option: null, priceModel: null, answers: {}, audioAnswers: {}, audioFlowId: createAudioFlowId(), docFiles: {}, clientName: '', clientPhone: '', pixProofUrl: '', pixProofMime: '', couponCode: '', couponDiscount: null });

  const [pixCopied, setPixCopied] = useState(false);
  const [uploadingPix, setUploadingPix] = useState(false);
  const pixFileInputRef = useRef<HTMLInputElement>(null);
  const pendingPixMsgId = useRef<string>('');

  // Buscar pix ativo e nome do cliente logado
  const { data: activePix } = trpc.pix.getActive.useQuery();
  const { data: settingsData } = trpc.settings.getAll.useQuery();
  // Atualiza o Pix quando os dados de pagamento chegam depois da recuperação.
  useEffect(() => {
    const key = activePix?.pixKey || settingsData?.pix_key || "";
    if (!key) return;
    setMessages(prev => prev.map(msg => msg.type === "pix-payment" && !msg.uploaded && !msg.pixKey
      ? { ...msg, pixKey: key, pixName: activePix?.pixName || settingsData?.pix_name || "", pixBank: activePix?.pixBank || settingsData?.pix_bank || "" }
      : msg));
  }, [activePix?.pixKey, activePix?.pixName, activePix?.pixBank, settingsData?.pix_key, settingsData?.pix_name, settingsData?.pix_bank]);
  const clientPhone = typeof window !== 'undefined' ? localStorage.getItem('walk_client_phone') || '' : '';
  const { isVipCustomer } = useVipMembership();
  const { data: globalPromotion } = trpc.globalPromotion.get.useQuery(undefined, { refetchOnWindowFocus: true, refetchInterval: 15000 });
  const [promotionNowMs, setPromotionNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!globalPromotion?.active || !globalPromotion?.schedule) return;
    const timer = window.setInterval(() => setPromotionNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [globalPromotion?.active, globalPromotion?.schedule]);
  const sitePromoActive = globalPromotionIsActive(globalPromotion, promotionNowMs);
  const sitePromoOverrides = globalPromotionOverridesIndividual(globalPromotion, promotionNowMs);
  const priceForOption = (option: ProductOption | null | undefined) => option ? globalPromotionPrice({ price: option.price || "", originalPrice: (option as any).originalPrice || null }, globalPromotion) : "";
  const getModelPrice = (model: OptionPriceModel | null | undefined) => model ? sitePromoOverrides ? globalPromotionPrice(model, globalPromotion) : applyVipBenefitToPrice(model.price, model, isVipCustomer) : '';
  const profileQuery = trpc.customers.getMyProfile.useQuery(
    { phone: clientPhone },
    { enabled: !!clientPhone }
  );
  useEffect(() => {
    if (profileQuery.data?.name) flowState.current.clientName = profileQuery.data.name;
    if (profileQuery.data?.phone) flowState.current.clientPhone = profileQuery.data.phone.replace(/\D/g, '');
  }, [profileQuery.data?.name, profileQuery.data?.phone]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Inicializar: rascunhos do Bot só podem ser retomados dentro do próprio Bot.
  useEffect(() => {
    if (!restoreBotProgress()) startEntry();
  }, []); // eslint-disable-line

  // ── Helpers ────────────────────────────────────────────────────────────────

  const uid = () => Math.random().toString(36).slice(2, 9);

  // Salvar progresso do bot no localStorage (mesmo formato do fluxo manual)
  // Isso garante que ao recarregar a página, o modal "Continuar de onde parei" aparece
  const saveBotProgress = useCallback((step: string = 'cadastro', cadastroSubStep: string = 'pagamento') => {
    const fs = flowState.current;
    if (!fs.product) return;
    try {
      const progress = {
        step,
        cadastroSubStep,
        productId: fs.product.id,
        optionId: fs.option?.id ?? null,
        priceModelId: fs.priceModel?.id ?? null,
        questionAnswers: Object.entries(fs.answers).reduce((acc, [qId, ans]) => {
          // Converter Record<number, string> para o formato {[questionId]: answer}
          acc[qId] = ans;
          return acc;
        }, {} as Record<string, string>),
        questionAudioAnswers: fs.audioAnswers,
        questionAudioFlowId: fs.audioFlowId,
        clientName: fs.clientName || '',
        clientPhone: clientPhone.replace(/\D/g, '') || fs.clientPhone || '',
        clientCity: '',
        clientEmail: '',
        couponCode: fs.couponCode || '',
        carDocumentYear: '',
        savedAt: Date.now(),
        fromBot: true, // marcador para saber que veio do bot
      };
      localStorage.setItem(BOT_PROGRESS_KEY, JSON.stringify(progress));
      // Salvar URLs dos documentos já enviados
      const uploadedFiles: Record<string, { url: string; mimeType: string }> = {};
      Object.entries(fs.docFiles).forEach(([docId, df]) => {
        if (df.url) uploadedFiles[`doc_${docId}`] = { url: df.url, mimeType: df.mime || 'image/jpeg' };
      });
      if (fs.pixProofUrl) uploadedFiles['paymentProof'] = { url: fs.pixProofUrl, mimeType: fs.pixProofMime || 'image/jpeg' };
      if (Object.keys(uploadedFiles).length > 0) {
        localStorage.setItem(BOT_UPLOADED_FILES_KEY, JSON.stringify(uploadedFiles));
      }
    } catch {}
  }, []);

  // Pedido aceito não pode ser tratado como rascunho ao recarregar o Bot ou a vitrine.
  const clearCompletedBotProgress = useCallback(() => {
    try {
      localStorage.removeItem(BOT_PROGRESS_KEY);
      localStorage.removeItem(BOT_UPLOADED_FILES_KEY);
      const legacy = localStorage.getItem(LEGACY_PROGRESS_KEY);
      if (legacy && JSON.parse(legacy)?.fromBot) {
        localStorage.removeItem(LEGACY_PROGRESS_KEY);
        localStorage.removeItem(LEGACY_UPLOADED_FILES_KEY);
      }
    } catch {}
  }, []);

  // Registrar o checkpoint no clique; preservar a escolha anterior ainda ativa.
  const advanceTimers = useRef<Set<number>>(new Set());
  const queueAdvance = (next: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      advanceTimers.current.delete(timer);
      next();
    }, delayMs);
    advanceTimers.current.add(timer);
  };
  const cancelPendingAdvances = () => {
    advanceTimers.current.forEach(timer => window.clearTimeout(timer));
    advanceTimers.current.clear();
  };
  useEffect(() => () => cancelPendingAdvances(), []);

  const handleChoice = (messageId: string, ...args: any[]) => {
    const callback = callbacks.current[messageId];
    const checkpoint = captureColombiaBotChoice(messages, messageId);
    if (!callback || !checkpoint) return;
    if (couponInputIds.current.has(messageId) && !isUsableBotCouponCode(String(args[0] || ""))) return;
    history.current.push({
      messages: checkpoint,
      inputValues: { ...inputValues },
      flowState: {
        ...flowState.current,
        answers: { ...flowState.current.answers },
        audioAnswers: { ...flowState.current.audioAnswers },
        docFiles: { ...flowState.current.docFiles },
        couponDiscount: flowState.current.couponDiscount
          ? { ...flowState.current.couponDiscount } : null,
      },
      callbacks: { ...callbacks.current },
    });
    if (history.current.length > 20) history.current.shift();
    // O snapshot contém o handler original para o botão Voltar.
    delete callbacks.current[messageId];
    callback(...args);
  };

  const addMsgs = useCallback((...msgs: ChatMsg[]) => {
    setMessages(prev => [...prev, ...msgs]);
  }, []);

  const markAnswered = useCallback((id: string) => {
    setMessages(prev => prev.map(m =>
      (m.type === "options" || m.type === "storefront-options" || m.type === "storefront-guarantees" || m.type === "input" || m.type === "audio-input") && m.id === id
        ? { ...m, answered: true }
        : m
    ));
  }, []);

  const markDocUploaded = useCallback((id: string, previewUrl: string, previewMime: string) => {
    setMessages(prev => prev.map(m =>
      m.type === "doc-upload" && m.id === id ? { ...m, uploaded: true, previewUrl, previewMime } : m
    ));
  }, []);

  const markActionDone = useCallback((id: string) => {
    setMessages(prev => prev.map(m =>
      m.type === "action" && m.id === id ? { ...m, done: true } : m
    ));
  }, []);

  // Parseia opções — suporta string simples "A, B, C" e JSON array [{label:"A",...}]
  const parseOptions = (raw: string | null): string[] => {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        return arr.map((o: any) => (typeof o === 'string' ? o : o.label || String(o))).filter(Boolean);
      } catch { /* fallback */ }
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  };

  // Retorna perguntas visíveis ordenadas. Para veículo, perguntas legadas de modelo
  // por marca são compactadas em um único passo Marca -> Modelo.
  const getVisibleQuestions = (questions: ProductQuestion[], answers: Record<number, string>): ProductQuestion[] => {
    const visible = questions.filter(q => {
      if (!q.parentQuestionId) return true;
      const parent = questions.find(item => item.id === q.parentQuestionId);
      const parentAnswer = answers[q.parentQuestionId]?.trim() || "";
      if (getVehicleQuestionKind(q.question) === 'model' && parent && getVehicleQuestionKind(parent.question) === 'brand') {
        return !!parentAnswer;
      }
      if (!q.triggerOption) return !!parentAnswer;
      return sameBotSelectOption(parentAnswer, q.triggerOption);
    });

    const ordered: ProductQuestion[] = [];
    const roots = visible.filter(q => !q.parentQuestionId).sort((a, b) => a.sortOrder - b.sortOrder);

    const insertWithChildren = (q: ProductQuestion) => {
      ordered.push(q);
      const rawChildren = visible
        .filter(c => c.parentQuestionId === q.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const modelChildren = getVehicleQuestionKind(q.question) === 'brand'
        ? rawChildren.filter(child => getVehicleQuestionKind(child.question) === 'model')
        : [];
      const children = modelChildren.length > 0
        ? [modelChildren[0], ...rawChildren.filter(child => getVehicleQuestionKind(child.question) !== 'model')]
        : rawChildren;
      children.forEach(child => insertWithChildren(child));
    };

    roots.forEach(r => insertWithChildren(r));
    return ordered;
  };

  // Limpa tudo que pertence à opção anterior. Dados do cliente são preservados,
  // mas respostas, áudios, documentos, pagamento e cupom nunca podem migrar
  // para uma nova opção do pedido.
  const resetOptionFlow = () => {
    const fs = flowState.current;
    fs.option = null;
    fs.priceModel = null;
    fs.answers = {};
    fs.audioAnswers = {};
    fs.audioFlowId = createAudioFlowId();
    fs.docFiles = {};
    fs.pixProofUrl = '';
    fs.pixProofMime = '';
    fs.couponCode = '';
    fs.couponDiscount = null;
  };

  const restoreBotProgress = (): boolean => {
    try {
      let raw = localStorage.getItem(BOT_PROGRESS_KEY);
      if (!raw) {
        const legacyRaw = localStorage.getItem(LEGACY_PROGRESS_KEY);
        if (legacyRaw && JSON.parse(legacyRaw)?.fromBot) {
          raw = legacyRaw;
          localStorage.setItem(BOT_PROGRESS_KEY, legacyRaw);
          const legacyFiles = localStorage.getItem(LEGACY_UPLOADED_FILES_KEY);
          if (legacyFiles) localStorage.setItem(BOT_UPLOADED_FILES_KEY, legacyFiles);
          localStorage.removeItem(LEGACY_PROGRESS_KEY);
          localStorage.removeItem(LEGACY_UPLOADED_FILES_KEY);
        }
      }
      if (!raw) return false;

      const saved = JSON.parse(raw);
      if (!saved?.savedAt || Date.now() - saved.savedAt > 24 * 60 * 60 * 1000) {
        clearCompletedBotProgress();
        return false;
      }
      if (!sameBotProgressOwner(saved.clientPhone, clientPhone)) { clearCompletedBotProgress(); return false; }
      const product = products.find(item => item.id === saved.productId);
      const option = product?.options.find(item => item.id === saved.optionId);
      if (!product || !option) {
        clearCompletedBotProgress();
        return false;
      }

      const answers = Object.entries(saved.questionAnswers || {}).reduce<Record<number, string>>((acc, [questionId, answer]) => {
        acc[Number(questionId)] = String(answer);
        return acc;
      }, {});
      const uploads = JSON.parse(localStorage.getItem(BOT_UPLOADED_FILES_KEY) || '{}') as Record<string, { url?: string; mimeType?: string }>;
      const docFiles: typeof flowState.current.docFiles = {};
      Object.entries(uploads).forEach(([key, file]) => {
        if (!key.startsWith('doc_') || !file?.url) return;
        const docId = Number(key.slice(4));
        if (Number.isFinite(docId)) docFiles[docId] = { url: file.url, mime: file.mimeType || 'image/jpeg' };
      });

      flowState.current = {
        product,
        option,
        priceModel: option.priceModels?.find(model => model.id === saved.priceModelId) || null,
        answers,
        audioAnswers: saved.questionAudioAnswers || {},
        audioFlowId: saved.questionAudioFlowId || createAudioFlowId(),
        docFiles,
        clientName: saved.clientName || '',
        clientPhone: saved.clientPhone || '',
        pixProofUrl: uploads.paymentProof?.url || '',
        pixProofMime: uploads.paymentProof?.mimeType || '',
        couponCode: saved.couponCode || '',
        couponDiscount: null,
      };
      addMsgs({ type: 'bot', id: uid(), text: 'Encontrei seu pedido iniciado aqui no Bot. Vamos continuar de onde você parou. ✅' });

      const visibleQuestions = getVisibleQuestions(option.questions, answers);
      const requiredDocs = option.documents.filter(doc => doc.isRequired === undefined || doc.isRequired === 1);
      const nextStep = resolveBotResumeStep({
        hasUnansweredQuestions: visibleQuestions.some(question => answers[question.id] === undefined),
        hasMissingRequiredDocuments: requiredDocs.some(doc => !docFiles[doc.id]?.url),
        wasAtPayment: saved.cadastroSubStep === 'pagamento',
      });
      if (nextStep === 'questions') askQuestions(product, option, answers);
      else if (nextStep === 'documents') askDocuments(product, option);
      else if (nextStep === 'payment') {
        if (saved.couponCode && !sitePromoOverrides) {
          void validateCouponMutation.mutateAsync({ code: saved.couponCode }).then(result => {
            if (!result.valid) { flowState.current.couponCode = ''; flowState.current.couponDiscount = null; askCoupon(product, option); return; }
            flowState.current.couponDiscount = {type: result.discountType || result.coupon?.discountType || 'fixed', value: result.discountValue ?? result.coupon?.discountValue ?? 0};
            askPix(product, option);
          }).catch(() => askCoupon(product, option));
        } else askPix(product, option);
      }
      else askCoupon(product, option);
      return true;
    } catch {
      return false;
    }
  };

  // ── Fluxo ─────────────────────────────────────────────────────────────────

  const startWelcome = () => {
    const optId = uid();
    callbacks.current[optId] = (opt: string) => {
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: opt });
      if (opt === "Continuar sozinho") {
        clearCompletedBotProgress();
        queueAdvance(() => onStartNormal(), 200);
      } else {
        queueAdvance(() => askService(), 300);
      }
    };
    const welcomeMsg = botWelcome || `Olá! Sou o ${displayName}, seu assistente de pedidos. 👋\n\nComo prefere continuar?`;
    addMsgs(
      { type: "bot", id: uid(), text: welcomeMsg },
      { type: "options", id: optId, options: [`🤖 Quero ajuda do ${displayName}`, "Continuar sozinho"], answered: false }
    );
  };

  // Pelo link /bot o cliente já escolheu ser atendido pelo robô.
  // A vitrine normal ainda mantém a escolha entre atendimento guiado e manual.
  const startEntry = () => {
    if (!directEntry) {
      startWelcome();
      return;
    }
    addMsgs({ type: "bot", id: uid(), text: `Olá! Sou o ${displayName}, seu assistente de pedidos. 👋\n\nVamos escolher seu serviço.` });
    askService();
  };

  const askService = () => {
    setCurrentPhase("Serviço");
    const optId = uid();
    callbacks.current[optId] = (opt: string) => {
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: opt });
      const product = products.find(p => p.name === opt);
      if (!product) return;
      resetOptionFlow();
      flowState.current.product = product;
      saveBotProgress('questions', 'dados');
      queueAdvance(() => {
        if (product.options.length === 0) {
          finishWithProduct(product, null);
        } else if (product.options.length === 1) {
          flowState.current.option = product.options[0];
          queueAdvance(() => startOptionPricing(product, product.options[0]), 300);
        } else {
          askOption(product);
        }
      }, 300);
    };
    addMsgs(
      { type: "bot", id: uid(), text: "Qual serviço você precisa?" },
      { type: "options", id: optId, options: products.map(p => p.name), answered: false }
    );
  };

  const askOption = (product: Product) => {
    const optId = uid();
    // O card apenas apresenta os dados da vitrine: a seleção continua
    // usando o ID real da opção e o mesmo motor de perguntas e documentos.
    callbacks.current[optId] = async (optionId: string) => {
      const option = product.options.find(item => String(item.id) === optionId);
      if (!option) return;
      if (!(option.priceModels || []).length) {
        const accepted = await requestProductManifest([`option_manifest_${option.id}`], `bot:base:${option.id}`, option.label || option.name);
        if (!accepted) return;
      }
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: (option.label || option.name) });
      resetOptionFlow();
      flowState.current.product = product;
      flowState.current.option = option;
      saveBotProgress('questions', 'dados');
      queueAdvance(() => startOptionPricing(product, option), 300);
    };
    addMsgs(
      { type: "bot", id: uid(), text: "Escolha a opção de " + product.name + ". Confira os detalhes antes de selecionar." },
      { type: "storefront-options", id: optId, product, options: product.options, answered: false }
    );
  };

  const startOptionPricing = (product: Product, option: ProductOption) => {
    setCurrentPhase("Garantia / preço");
    const models = option.priceModels || [];
    if (models.length === 0) {
      flowState.current.priceModel = null;
      // Opção única também deve apresentar o manifesto obrigatório.
      void requestProductManifest([`option_manifest_${option.id}`], `bot:base:${option.id}`, option.label || option.name)
        .then(accepted => { if (accepted) queueAdvance(() => askQuestions(product, option, {}), 200); });
      return;
    }
    const displayLabel = (model: OptionPriceModel) => {
      const locked = isVipOnlyLocked(model, isVipCustomer);
      const mode = normalizeVipAccessMode(model.vipAccessMode);
      const prefix = locked ? '🔒 SOMENTE VIP • ' : (!sitePromoOverrides && mode !== 'all' ? '👑 VIP • ' : '');
      const benefit = !sitePromoOverrides && isVipCustomer ? vipBenefitText(model) : '';
      return prefix + model.label + ' — ' + getModelPrice(model) + (benefit ? ' • ' + benefit : '');
    };
    if (models.length === 1 && isVipOnlyLocked(models[0], isVipCustomer)) {
      addMsgs({ type: 'bot', id: uid(), text: '🔒 Este modelo / categoria é exclusivo para clientes VIP. Escolha outro serviço ou entre com uma senha VIP.' });
      queueAdvance(() => askService(), 450);
      return;
    }
    const msgId = uid();
    callbacks.current[msgId] = async (modelId: string) => {
      // Nunca resolver o modelo pela string visual: promoções e rótulos
      // podem mudar sem modificar o ID da escolha ou o preço salvo.
      const model = models.find(item => String(item.id) === modelId);
      if (!model) return;
      if (isVipOnlyLocked(model, isVipCustomer)) {
        addMsgs({ type: 'bot', id: uid(), text: '🔒 Este modelo / categoria é SOMENTE VIP. Entre com uma senha VIP para liberar esta escolha.' });
        queueAdvance(() => startOptionPricing(product, option), 350);
        return;
      }
      const accepted = await requestProductManifest([`price_model_manifest_${model.id}`, `option_manifest_${option.id}`], `bot:price:${model.id}`, model.label);
      if (!accepted) return;
      markAnswered(msgId);
      addMsgs({ type: 'user', id: uid(), text: displayLabel(model) });
      flowState.current.priceModel = model;
      saveBotProgress('questions', 'dados');
      queueAdvance(() => askQuestions(product, option, {}), 250);
    };
    const modelsAreGuarantees = models.some(model => /(corridas?|dias?|meses?|garantia)/i.test(model.label));
    addMsgs(
      { type: 'bot', id: uid(), text: modelsAreGuarantees
        ? 'Escolha a garantia do serviço. Corridas e dias são limites de GARANTIA, não a duração da conta.'
        : 'Escolha o modelo ou categoria de preço. Confira as informações antes de continuar.' },
      { type: 'storefront-guarantees', id: msgId, product, option, models, answered: false }
    );
  };

  const askQuestions = (product: Product, option: ProductOption, currentAnswers: Record<number, string>) => {
    setCurrentPhase("Dados");
    // Recalcular perguntas visíveis com as respostas atuais
    const visible = getVisibleQuestions(option.questions, currentAnswers);
    // Próxima pergunta ainda não respondida
    const nextQ = visible.find(q => currentAnswers[q.id] === undefined);

    if (!nextQ) {
      // Todas respondidas → documentos
      queueAdvance(() => askDocuments(product, option), 300);
      return;
    }

    const msgId = uid();

    if (nextQ.fieldType === "audio") {
      callbacks.current[msgId] = (audio: AudioDraft) => {
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: `Áudio anexado · ${String(Math.floor(audio.durationSeconds / 60)).padStart(2, '0')}:${String(Math.round(audio.durationSeconds % 60)).padStart(2, '0')}` });
        const newAnswers = { ...currentAnswers, [nextQ.id]: "Áudio anexado" };
        flowState.current.answers = newAnswers;
        flowState.current.audioAnswers = { ...flowState.current.audioAnswers, [nextQ.id]: audio };
        saveBotProgress('questions', 'dados');
        queueAdvance(() => askQuestions(product, option, newAnswers), 200);
      };
      const questionLevel = nextQ.parentQuestionId ? "sub" as const : "principal" as const;
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question, audioUrl: nextQ.questionPresentation === 'audio' ? nextQ.questionAudioUrl : null, hideText: nextQ.questionPresentation === 'audio' && nextQ.showQuestionTextWithAudio !== 1, questionLevel },
        { type: "audio-input", id: msgId, question: nextQ, answered: false, questionLevel }
      );
    } else if (getVehicleQuestionKind(nextQ.question)) {
      const kind = getVehicleQuestionKind(nextQ.question);
      const parentAnswer = nextQ.parentQuestionId ? currentAnswers[nextQ.parentQuestionId] || '' : '';
      const opts = kind === 'brand'
        ? VEHICLE_BRANDS
        : kind === 'model'
          ? getVehicleModels(parentAnswer)
          : kind === 'year'
            ? VEHICLE_YEARS
            : VEHICLE_COLORS;

      if (kind === 'model' && opts.length === 0) {
        callbacks.current[msgId] = (val: string) => {
          markAnswered(msgId);
          const normalized = val.toUpperCase();
          addMsgs({ type: "user", id: uid(), text: normalized });
          const newAnswers = { ...currentAnswers, [nextQ.id]: normalized };
          flowState.current.answers = newAnswers;
          saveBotProgress('questions', 'dados');
          queueAdvance(() => askQuestions(product, option, newAnswers), 300);
        };
        const questionLevel = nextQ.parentQuestionId ? "sub" as const : "principal" as const;
        addMsgs(
          { type: "bot", id: uid(), text: nextQ.question + (parentAnswer ? ' — ' + parentAnswer : ''), questionLevel },
          { type: "input", id: msgId, multiline: false, answered: false, questionLevel }
        );
      } else {
        callbacks.current[msgId] = (val: string) => {
          markAnswered(msgId);
          addMsgs({ type: "user", id: uid(), text: val });
          const newAnswers = { ...currentAnswers };
          if (kind === 'brand') {
            for (const child of option.questions.filter(item => item.parentQuestionId === nextQ.id)) delete newAnswers[child.id];
          }
          newAnswers[nextQ.id] = val;
          flowState.current.answers = newAnswers;
          saveBotProgress('questions', 'dados');
          queueAdvance(() => askQuestions(product, option, newAnswers), 300);
        };
        const questionLevel = nextQ.parentQuestionId ? "sub" as const : "principal" as const;
        addMsgs(
          { type: "bot", id: uid(), text: kind === 'model' && parentAnswer ? 'MODELO — ' + parentAnswer : nextQ.question, questionLevel },
          { type: "options", id: msgId, options: opts, answered: false, questionLevel }
        );
      }
    } else if (nextQ.fieldType === "select" && nextQ.options) {
      const opts = parseOptions(nextQ.options);
      callbacks.current[msgId] = (val: string) => {
        if (!opts.some(opt => sameBotSelectOption(val, opt))) return;
        const blocked = findBotBlockedChoice(nextQ, val, settingsData?.question_blocking_manifest_rules_v1);
        if (blocked) { setBlockedChoice(blocked); return; }
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: val });
        const selected = opts.find(opt => sameBotSelectOption(val, opt))!;
        const newAnswers = { ...currentAnswers, [nextQ.id]: selected };
        flowState.current.answers = newAnswers;
        saveBotProgress('questions', 'dados');
        // Continuar com as novas respostas — sub-perguntas serão recalculadas
        queueAdvance(() => askQuestions(product, option, newAnswers), 300);
      };
      const questionLevel = nextQ.parentQuestionId ? "sub" as const : "principal" as const;
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question, audioUrl: nextQ.questionPresentation === 'audio' ? nextQ.questionAudioUrl : null, hideText: nextQ.questionPresentation === 'audio' && nextQ.showQuestionTextWithAudio !== 1, questionLevel },
        { type: "options", id: msgId, options: opts, answered: false, questionLevel }
      );
    } else {
      callbacks.current[msgId] = (val: string) => {
        if (nextQ.isRequired === 1 && !val.trim()) {
          addMsgs({type:"bot",id:uid(),text:"Esta resposta é obrigatória. Preencha para continuar."});
          return;
        }
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: val || "(sem resposta)" });
        const newAnswers = { ...currentAnswers, [nextQ.id]: val };
        flowState.current.answers = newAnswers;
        saveBotProgress('questions', 'dados');
        queueAdvance(() => askQuestions(product, option, newAnswers), 300);
      };
      const questionLevel = nextQ.parentQuestionId ? "sub" as const : "principal" as const;
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question, audioUrl: nextQ.questionPresentation === 'audio' ? nextQ.questionAudioUrl : null, hideText: nextQ.questionPresentation === 'audio' && nextQ.showQuestionTextWithAudio !== 1, questionLevel },
        { type: "input", id: msgId, multiline: nextQ.fieldType === "textarea", answered: false, questionLevel }
      );
    }
  };

  const askDocuments = (product: Product, option: ProductOption) => {
    setCurrentPhase("Documentos");
    const docs = option.documents || [];
    if (docs.length === 0) {
      askCoupon(product, option);
      return;
    }
    const requiredDocs = docs.filter(doc => doc.isRequired === undefined || doc.isRequired === 1);
    if (requiredDocs.every(doc => flowState.current.docFiles[doc.id]?.url)) {
      askCoupon(product, option);
      return;
    }

    const docMsgs: ChatMsg[] = docs.map(doc => {
      const msgId = uid();
      const isRequired = doc.isRequired === undefined ? true : doc.isRequired === 1;
      callbacks.current[msgId] = async (file: File) => {
        if (file.size > 15 * 1024 * 1024) {
          addMsgs({ type: "bot", id: uid(), text: `${doc.label} está muito grande. Envie um arquivo de até 15 MB.` });
          return;
        }
        setUploadingDocId(doc.id);
        try {
          const uploaded = await uploadOrderFileReliably(file, doc.label);
          if (!uploaded.ok) {
            addMsgs({ type: "bot", id: uid(), text: uploaded.message });
            return;
          }
          flowState.current.docFiles[doc.id] = { file, url: uploaded.url, fileKey: uploaded.fileKey, mime: uploaded.mimeType };
          saveBotProgress('questions', 'documentos');
          markDocUploaded(msgId, uploaded.url, uploaded.mimeType);
          addMsgs({ type: "user", id: uid(), text: `\u2705 ${doc.label} enviado` });
          const required = docs.filter(d => d.isRequired === undefined ? true : d.isRequired === 1);
          const allDone = required.every(d => flowState.current.docFiles[d.id]?.url);
          if (allDone) {
            queueAdvance(() => askCoupon(product, option), 400);
          }
        } catch {
          addMsgs({ type: "bot", id: uid(), text: `Não consegui enviar ${doc.label}. Verifique sua conexão e tente novamente.` });
        } finally {
          setUploadingDocId(null);
        }
      };
      return { type: "doc-upload" as const, id: msgId, docId: doc.id, label: doc.label, required: isRequired, uploaded: Boolean(flowState.current.docFiles[doc.id]?.url) };
    });

    addMsgs(
      { type: "bot", id: uid(), text: `Agora preciso de ${docs.length === 1 ? "um documento" : `${docs.length} documentos`}. Envie abaixo. \ud83d\udcce` },
      ...docMsgs
    );
  };

  // Etapa de cupom de desconto — antes do Pix
  const askCoupon = (product: Product, option: ProductOption | null) => {
    setCurrentPhase("Cupom");
    if (sitePromoOverrides) {
      flowState.current.couponCode = "";
      flowState.current.couponDiscount = null;
      askPix(product, option);
      return;
    }
    // Cupom é uma etapa própria: não alterar respostas nem perguntas condicionais.
    saveBotProgress('questions', 'cupom');
    const msgId = uid();
    // Callback para quando o cliente clicar em Sim ou Não
    callbacks.current[msgId] = async (answer: string) => {
      setMessages(prev => prev.map(m =>
        m.type === 'options' && m.id === msgId ? { ...m, answered: true } : m
      ));
      addMsgs({ type: 'user', id: uid(), text: answer });
      const couponChoice = resolveBotCouponChoice(answer);
      if (couponChoice === 'invalid') return;
      if (couponChoice === 'enter-code') {
        // Pedir o código do cupom
        const inputId = uid();
        couponInputIds.current.add(inputId);
        callbacks.current[inputId] = async (code: string) => {
          if (!isUsableBotCouponCode(code) || isValidatingCoupon) return;
          couponInputIds.current.delete(inputId);
          setMessages(prev => prev.map(m =>
            m.type === 'input' && m.id === inputId ? { ...m, answered: true } : m
          ));
          addMsgs({ type: 'user', id: uid(), text: code });
          setIsValidatingCoupon(true);
          try {
            const result = await validateCouponMutation.mutateAsync({ code: code.trim() });
            if (result.valid) {
              flowState.current.couponCode = code.trim();
              const discountType = result.discountType || result.coupon?.discountType || 'fixed';
              const discountValue = result.discountValue ?? result.coupon?.discountValue ?? 0;
              flowState.current.couponDiscount = { type: discountType, value: discountValue };
              const discountText = discountType === 'percentage'
                ? `${discountValue}% de desconto`
                : `R$ ${Number(discountValue).toFixed(2).replace('.', ',')} de desconto`;
              addMsgs({ type: 'bot', id: uid(), text: `✅ Cupom aplicado! ${discountText}` });
            } else {
              flowState.current.couponCode = '';
              flowState.current.couponDiscount = null;
              addMsgs({ type: 'bot', id: uid(), text: `❌ Cupom inválido: ${result.reason || 'Código não encontrado.'}` });
            }
          } catch {
            flowState.current.couponCode = '';
            flowState.current.couponDiscount = null;
            addMsgs({ type: 'bot', id: uid(), text: '❌ Erro ao validar cupom. Continuando sem desconto.' });
          } finally {
            setIsValidatingCoupon(false);
            queueAdvance(() => askPix(product, option), 400);
          }
        };
        addMsgs(
          { type: 'bot', id: uid(), text: 'Digite o código do seu cupom:' },
          { type: 'input', id: inputId, multiline: false, answered: false }
        );
      } else if (couponChoice === 'skip') {
        // A ausência de cupom nunca modifica as respostas do formulário.
        flowState.current.couponCode = '';
        flowState.current.couponDiscount = null;
        queueAdvance(() => askPix(product, option), 400);
      }
    };
    addMsgs(
      { type: 'bot', id: uid(), text: 'Você tem um cupom de desconto?' },
      { type: 'options', id: msgId, options: ['SIM, TENHO UM CUPOM', 'NÃO TENHO CUPOM'], answered: false }
    );
  };

  // Etapa de pagamento Pix — mostra chave, botão copiar, upload comprovante
  const askPix = (product: Product, option: ProductOption | null) => {
    const pixKey = activePix?.pixKey || settingsData?.pix_key || '';
    const pixName = activePix?.pixName || settingsData?.pix_name || '';
    const pixBank = activePix?.pixBank || settingsData?.pix_bank || '';
    setCurrentPhase("Pagamento");
    const basePrice = getModelPrice(flowState.current.priceModel) || priceForOption(option);
    const totals = getBotCheckoutTotals(basePrice, sitePromoOverrides ? null : flowState.current.couponDiscount);
    const price = totals.total;

    const msgId = uid();
    pendingPixMsgId.current = msgId;

    callbacks.current[msgId] = async (file: File) => {
      if (file.size > 15 * 1024 * 1024) {
        addMsgs({ type: 'bot', id: uid(), text: 'O comprovante está muito grande. Envie um arquivo de até 15 MB.' });
        return;
      }
      setUploadingPix(true);
      try {
        const uploaded = await uploadOrderFileReliably(file, 'comprovante-pix');
        if (!uploaded.ok) {
          addMsgs({ type: 'bot', id: uid(), text: uploaded.message });
          return;
        }
        flowState.current.pixProofUrl = uploaded.url;
        flowState.current.pixProofMime = uploaded.mimeType || file.type || 'image/jpeg';
        setMessages(prev => prev.map(m =>
          m.type === 'pix-payment' && m.id === msgId ? { ...m, uploaded: true, previewUrl: uploaded.url, previewMime: uploaded.mimeType } : m
        ));
        addMsgs({ type: 'user', id: uid(), text: '\u2705 Comprovante enviado' });
        queueAdvance(() => finishWithProduct(product, option), 400);
      } catch {
        addMsgs({ type: 'bot', id: uid(), text: 'Não consegui enviar o comprovante. Verifique sua conexão e tente novamente.' });
      } finally {
        setUploadingPix(false);
      }
    };

    // Salvar progresso ao chegar na etapa de pagamento PIX
    saveBotProgress('cadastro', 'pagamento');
    const summary = `Resumo do pedido: ${product.name}${option ? " • " + (option.label || option.name) : ""}\n${flowState.current.priceModel ? "Plano: " + flowState.current.priceModel.label + "\n" : ""}Respostas: ${Object.keys(flowState.current.answers).length} • Documentos: ${Object.values(flowState.current.docFiles).filter(doc => Boolean(doc.url)).length}\nTotal a pagar: ${price}`;
    addMsgs(
      { type: 'bot', id: uid(), text: summary + "\n\nConfira os dados e faça o pagamento via Pix somente após conferir o valor." },
      { type: 'pix-payment', id: msgId, pixKey, pixName, pixBank, price, basePrice: totals.base, discountPrice: totals.discount, uploaded: false }
    );
  };

  const finishWithProduct = (product: Product, option: ProductOption | null) => {
    setCurrentPhase("Finalizar");
    const actionId = uid();
    callbacks.current[actionId] = async () => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSendError("");
      setIsSubmitting(true);

      // Considerar exclusivamente as perguntas de áudio visíveis da opção atual.
      // Isso impede que rascunhos gerados antes de uma troca de opção acompanhem
      // o novo pedido.
      const visibleQuestions = option ? getVisibleQuestions(option.questions, flowState.current.answers) : [];
      const visibleAudioQuestionIds = new Set(
        visibleQuestions.filter(q => q.fieldType === 'audio').map(q => q.id),
      );
      const audioAnswersForCurrentOption = Object.entries(flowState.current.audioAnswers).reduce<Record<number, AudioDraft>>((acc, [questionId, audio]) => {
        const numericQuestionId = Number(questionId);
        if (visibleAudioQuestionIds.has(numericQuestionId)) acc[numericQuestionId] = audio;
        return acc;
      }, {});
      const audioDraftIdsForSubmit = Object.values(audioAnswersForCurrentOption).map(audio => audio.id);
      const hasAudioAnswersForCurrentOption = audioDraftIdsForSubmit.length > 0;

      // Montar answers array
      const answersArray: Array<{ question: string; answer: string; questionId?: number; answerType?: string; audioUrl?: string; durationSeconds?: number }> = [];
      if (option) {
        visibleQuestions.forEach(q => {
          const audio = audioAnswersForCurrentOption[q.id];
          if (audio) answersArray.push({ question: q.question, questionId: q.id, answer: 'Áudio anexado', answerType: 'audio', audioUrl: audio.audioUrl, durationSeconds: audio.durationSeconds });
          else if (flowState.current.answers[q.id]) answersArray.push({ question: q.question, questionId: q.id, answer: flowState.current.answers[q.id] });
        });
      }

      // Montar documents array — mesmo formato que o Home.tsx usa
      const docsArray: Array<{ label: string; url: string; fileKey?: string; mime?: string }> = [];
      if (option) {
        option.documents.forEach(d => {
          const df = flowState.current.docFiles[d.id];
          if (df?.url) {
            docsArray.push({ label: d.label, url: df.url, fileKey: df.fileKey, mime: df.mime || 'image/jpeg' });
          }
        });
      }

      const cpToken = localStorage.getItem('cp_token') || '';
      // Usar telefone do flowState (salvo quando perfil carregou) ou fallbacks
      const clientPhoneForSubmit = profileQuery.data?.phone?.replace(/\D/g, '') || clientPhone.replace(/\D/g, '') || '';
      if (!clientPhoneForSubmit) { setSendError('Telefone autenticado não identificado. Entre novamente.'); submittingRef.current = false; setIsSubmitting(false); return; }

      try {
        addMsgs({ type: "bot", id: uid(), text: "Enviando seu pedido... \u23f3" });

        const result = await submitMutation.mutateAsync({
          clientName: flowState.current.clientName || profileQuery.data?.name || 'Cliente',
          service: product.name,
          nameOption: option ? `${option.label || option.name || 'N/A'}${flowState.current.priceModel ? ` — ${flowState.current.priceModel.label}` : ''}` : 'N/A',
          documents: docsArray.length > 0 ? docsArray : undefined,
          phone: clientPhoneForSubmit || undefined,
          city: profileQuery.data?.city || undefined,
          email: profileQuery.data?.email || undefined,
          cpToken: cpToken || undefined,
          answers: answersArray.length > 0 ? JSON.stringify(answersArray) : undefined,
          productId: product.id,
          optionId: option?.id,
          autoScheduleOptionId: option?.id,
          questionAudioFlowId: hasAudioAnswersForCurrentOption ? flowState.current.audioFlowId : undefined,
          audioDraftIds: hasAudioAnswersForCurrentOption ? audioDraftIdsForSubmit : undefined,
          couponCode: !sitePromoOverrides ? flowState.current.couponCode || undefined : undefined,
          originalPrice: getModelPrice(flowState.current.priceModel) || priceForOption(option),
          price: (() => {
            const rawPrice = getModelPrice(flowState.current.priceModel) || priceForOption(option);
            if (!rawPrice) return undefined;
            // O servidor recalcula o cupom uma única vez.
            return rawPrice;
          })(),
          priceModelId: flowState.current.priceModel?.id || undefined,
          paymentProofUrl: flowState.current.pixProofUrl || undefined,
          paymentProofMime: flowState.current.pixProofMime || undefined,
        });

        if (isPersistedOrderResult(result)) {
          markActionDone(actionId);
          // Limpar antes de fechar o Bot: evita que a vitrine recupere um pedido já concluído.
          clearCompletedBotProgress();
          addMsgs({ type: "bot", id: uid(), text: "Pedido enviado com sucesso! \u2705\n\nO admin j\u00e1 recebeu e entrar\u00e1 em contato em breve." });
          onOrderComplete({
            cartItems: [{ service: product.name, nameOption: option?.label || option?.name || 'N/A', price: getModelPrice(flowState.current.priceModel) || priceForOption(option) }],
            answers: answersArray,
            docs: docsArray,
            totalValue: getModelPrice(flowState.current.priceModel) || option?.price || '',
            referrerName: '',
            referrerPhone: '',
            clientName: flowState.current.clientName || profileQuery.data?.name || 'Cliente',
            clientPhone: clientPhoneForSubmit,
            clientCity: profileQuery.data?.city || '',
            scheduleUrl: (result as any).scheduleUrl || undefined,
          });
        } else {
          const message = (result as any).message || (result.success
            ? 'O servidor não confirmou o registro do pedido. Tente novamente.'
            : 'Tente novamente.');
          setSendError(`Erro ao enviar pedido: ${message}`);
        }
      } catch (err: any) {
        setSendError(`Envio não confirmado: ${err?.message || 'erro de conexão'}. Confira seus pedidos antes de tentar novamente.`);
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    };
    addMsgs(
      { type: "bot", id: uid(), text: "Perfeito! Tenho tudo que preciso. \u2705\n\nClique abaixo para finalizar seu pedido." },
      { type: "action", id: actionId, label: "\ud83d\ude80 Finalizar pedido", done: false }
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const BotAvatar = () => (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shrink-0 shadow-md">
      <Bot className="w-4 h-4 text-white" />
    </div>
  );

  const renderMsg = (msg: ChatMsg, idx: number) => {
    switch (msg.type) {
      case "bot": {
        const isQuestion = Boolean(msg.questionLevel);
        const isSubQuestion = msg.questionLevel === "sub";
        const glassClass = isSubQuestion
          ? "border-violet-300/45 bg-gradient-to-br from-violet-500/25 via-fuchsia-500/10 to-slate-950/65 shadow-[0_10px_32px_rgba(139,92,246,0.2)]"
          : isQuestion
            ? "border-cyan-300/45 bg-gradient-to-br from-cyan-400/20 via-blue-500/10 to-slate-950/65 shadow-[0_10px_32px_rgba(34,211,238,0.16)]"
            : "border-zinc-700 bg-zinc-800";
        return (
          <div key={idx} className="flex items-start gap-2 mb-3">
            <BotAvatar />
            <div className={`max-w-[82%] rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed text-zinc-100 whitespace-pre-line backdrop-blur-xl ${glassClass}`}>
              {isQuestion && <p className={`mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${isSubQuestion ? "text-violet-200" : "text-cyan-200"}`}>{isSubQuestion ? "Subpergunta" : "Pergunta"}</p>}
              {!msg.hideText && <p className="font-semibold">{msg.text}</p>}
              {msg.audioUrl && <div className={`mt-2 border-t pt-2 ${isSubQuestion ? "border-violet-200/20" : "border-cyan-200/20"}`}><p className={`mb-1 text-[10px] font-semibold ${isSubQuestion ? "text-violet-200" : "text-cyan-200"}`}>🔊 Ouça a pergunta</p><audio controls preload="metadata" src={msg.audioUrl} className="h-8 w-full" /></div>}
            </div>
          </div>
        );
      }

      case "user":
        return (
          <div key={idx} className="flex justify-end mb-2">
            <div className="bg-violet-600 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] text-sm text-white">
              {msg.text}
            </div>
          </div>
        );

      case "storefront-options": {
        if (msg.answered) return null;
        return (
          <div key={msg.id} data-testid="colombia-bot-storefront-options" className="ml-4 mb-4 space-y-3 sm:ml-10">
            {msg.options.map(option => (
              <ColombiaBotStorefrontCard
                key={option.id}
                productName={msg.product.name}
                optionName={option.label || option.name}
                iconUrl={msg.product.iconUrl}
                description={option.description || msg.product.description}
                deliveryDays={msg.product.deliveryDays}
                guarantee={option.warranty}
                price={(option.priceModels || []).length > 0 ? undefined : priceForOption(option)}
                selectLabel="Escolher esta opção"
                onSelect={() => handleChoice(msg.id, String(option.id))}
              />
            ))}
          </div>
        );
      }

      case "storefront-guarantees": {
        if (msg.answered) return null;
        return (
          <div key={msg.id} data-testid="colombia-bot-storefront-guarantees" className="ml-4 mb-4 space-y-3 sm:ml-10">
            {msg.models.map(model => {
              const vipOnly = isVipOnlyLocked(model, isVipCustomer);
              const warranty = /(corridas?|dias?|meses?|garantia)/i.test(model.label)
                ? model.label
                : (msg.option.warranty || null);
              const mode = normalizeVipAccessMode(model.vipAccessMode);
              const vipLabel = vipOnly ? "🔒 Somente VIP"
                : !sitePromoOverrides && mode !== "all" ? "👑 Benefício VIP" : null;
              return (
                <ColombiaBotStorefrontCard
                  key={model.id}
                  productName={msg.product.name}
                  optionName={msg.option.label || msg.option.name}
                  planName={model.label}
                  iconUrl={msg.product.iconUrl}
                  description={msg.option.description || msg.product.description}
                  deliveryDays={msg.product.deliveryDays}
                  guarantee={warranty}
                  price={getModelPrice(model)}
                  originalPrice={sitePromoOverrides ? model.price : model.originalPrice}
                  vipLabel={vipLabel}
                  guaranteeSelection={Boolean(warranty)}
                  disabled={vipOnly}
                  selectLabel="Selecionar este plano"
                  onSelect={() => handleChoice(msg.id, String(model.id))}
                />
              );
            })}
          </div>
        );
      }

      case "options": {
        if (msg.answered) return null;
        const isSubQuestion = msg.questionLevel === "sub";
        const optionTone = isSubQuestion
          ? "border-violet-300/30 bg-violet-500/[0.10] hover:border-violet-300/70 hover:bg-violet-500/20"
          : "border-cyan-300/30 bg-cyan-500/[0.09] hover:border-cyan-300/70 hover:bg-cyan-500/20";
        return (
          <div key={idx} className={`ml-10 mb-3 space-y-2 rounded-2xl border p-2 backdrop-blur-xl ${isSubQuestion ? "border-violet-400/25 bg-violet-950/20" : "border-cyan-400/25 bg-cyan-950/20"}`}>
            {msg.options.map(opt => (
              <button
                key={opt}
                onClick={() => {
                  handleChoice(msg.id, opt);
                }}
                className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-bold text-zinc-100 transition-all active:scale-[0.98] ${optionTone}`}
              >
                <span>{opt}</span>
                <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
              </button>
            ))}
          </div>
        );
      }

      case "input": {
        if (msg.answered) return null;
        const isSubQuestion = msg.questionLevel === "sub";
        const inputTone = isSubQuestion ? "border-violet-300/35 bg-violet-950/25 focus:border-violet-300" : "border-cyan-300/35 bg-cyan-950/25 focus:border-cyan-300";
        const confirmTone = isSubQuestion ? "from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500" : "from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500";
        return (
          <div key={idx} className={`ml-10 mb-3 space-y-2 rounded-2xl border p-2 backdrop-blur-xl ${isSubQuestion ? "border-violet-400/25 bg-violet-950/20" : "border-cyan-400/25 bg-cyan-950/20"}`}>
            {msg.multiline ? (
              <textarea
                className={`w-full rounded-xl border px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none resize-none backdrop-blur-xl ${inputTone}`}
                rows={3}
                placeholder="Digite sua resposta..."
                value={inputValues[msg.id] || ""}
                onChange={e => setInputValues(prev => ({ ...prev, [msg.id]: e.target.value }))}
              />
            ) : (
              <input
                type="text"
                className={`w-full rounded-xl border px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none backdrop-blur-xl ${inputTone}`}
                placeholder="Digite sua resposta..."
                value={inputValues[msg.id] || ""}
                onChange={e => setInputValues(prev => ({ ...prev, [msg.id]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const cb = callbacks.current[msg.id];
                    if (cb) { handleChoice(msg.id, inputValues[msg.id]?.trim() || ""); setInputValues(prev => { const n = { ...prev }; delete n[msg.id]; return n; }); }
                  }
                }}
              />
            )}
            <button
              onClick={() => {
                const cb = callbacks.current[msg.id];
                if (cb) { handleChoice(msg.id, inputValues[msg.id]?.trim() || ""); setInputValues(prev => { const n = { ...prev }; delete n[msg.id]; return n; }); }
              }}
              className={`w-full rounded-xl bg-gradient-to-r py-2.5 text-sm font-bold text-white shadow-lg transition-colors ${confirmTone}`}
            >
              Confirmar
            </button>
          </div>
        );
      }

      case "audio-input": {
        if (msg.answered) return null;
        if (!flowState.current.product || !flowState.current.option) return null;
        const isSubQuestion = msg.questionLevel === "sub";
        return (
          <div key={idx} className={`ml-10 mb-3 rounded-2xl border p-2 backdrop-blur-xl ${isSubQuestion ? "border-violet-400/25 bg-violet-950/20" : "border-cyan-400/25 bg-cyan-950/20"}`}>
            <QuestionAudioRecorder
              questionId={msg.question.id}
              productId={flowState.current.product.id}
              optionId={flowState.current.option.id}
              flowId={flowState.current.audioFlowId}
              phone={flowState.current.clientPhone || localStorage.getItem('walk_client_phone') || undefined}
              minDurationSeconds={msg.question.audioMinDurationSeconds || 1}
              maxDurationSeconds={msg.question.audioMaxDurationSeconds || 120}
              allowRerecord={msg.question.allowAudioRerecord !== 0}
              allowFileUpload={msg.question.allowAudioFileUpload !== 0}
              helpText={msg.question.helpText}
              value={flowState.current.audioAnswers[msg.question.id]}
              onConfirmed={audio => handleChoice(msg.id, audio)}
              onClear={() => { delete flowState.current.audioAnswers[msg.question.id]; delete flowState.current.answers[msg.question.id]; }}
            />
          </div>
        );
      }

      case "doc-upload":
        if (msg.uploaded) {
          const isPdf = msg.previewMime === "application/pdf" || /\.pdf(?:$|\?)/i.test(msg.previewUrl || "");
          return (
            <div key={idx} className="ml-10 mb-4 rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/10 p-4 shadow-lg shadow-emerald-500/10">
              <p className="mb-3 text-sm font-extrabold text-emerald-300">✓ {msg.label} RECEBIDO COM SUCESSO</p>
              {isPdf ? (
                <a href={msg.previewUrl} target="_blank" rel="noreferrer" className="flex min-h-20 items-center justify-center rounded-xl border border-emerald-400/40 bg-zinc-950 px-4 text-center text-sm font-bold text-emerald-200">PDF enviado — toque para conferir</a>
              ) : (
                <a href={msg.previewUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-emerald-400/40 bg-zinc-950">
                  <img src={msg.previewUrl} alt={`${msg.label} enviado`} className="h-44 w-full object-contain" />
                  <p className="border-t border-emerald-400/20 px-3 py-2 text-center text-xs font-bold text-emerald-200">Toque na foto para ampliar e conferir</p>
                </a>
              )}
            </div>
          );
        }
        return (
          <div key={idx} className="ml-10 mb-4 rounded-2xl border-2 border-cyan-400/70 bg-gradient-to-br from-cyan-500/20 via-blue-500/15 to-violet-500/20 p-4 shadow-xl shadow-cyan-500/10">
            <p className="mb-1 text-base font-black uppercase tracking-wide text-white">Envie agora: {msg.label}</p>
            <p className="mb-4 text-sm font-medium text-cyan-100">Toque no botão abaixo para abrir a câmera, a galeria ou os seus arquivos. Máximo 15 MB.</p>
            {uploadingDocId === msg.docId ? (
              <div className="flex min-h-16 items-center justify-center gap-3 rounded-xl bg-zinc-950/70 px-4 text-sm font-bold text-cyan-200">
                <div className="h-6 w-6 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
                ENVIANDO. AGUARDE A CONFIRMAÇÃO...
              </div>
            ) : (
              <button
                onClick={() => {
                  pendingUpload.current = { msgId: msg.id, docId: msg.docId };
                  fileInputRef.current?.click();
                }}
                className="w-full min-h-[4.5rem] rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-4 text-left text-white shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.01] hover:from-cyan-400 hover:to-blue-500 active:scale-[0.99]"
              >
                <span className="flex items-center gap-3"><Camera className="h-8 w-8 shrink-0" /><span><span className="block text-base font-black uppercase">Toque para enviar {msg.label}</span><span className="mt-0.5 block text-xs font-semibold text-cyan-50">Câmera • Galeria • Arquivos</span></span><ChevronRight className="ml-auto h-6 w-6" /></span>
              </button>
            )}
          </div>
        );

      case "pix-payment":
        if (msg.uploaded) {
          const isPdf = msg.previewMime === "application/pdf" || /\.pdf(?:$|\?)/i.test(msg.previewUrl || "");
          return (
            <div key={idx} className="ml-10 mb-4 rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/10 p-4 shadow-lg shadow-emerald-500/10">
              <p className="mb-3 text-sm font-extrabold text-emerald-300">✓ COMPROVANTE PIX RECEBIDO COM SUCESSO</p>
              {isPdf ? <a href={msg.previewUrl} target="_blank" rel="noreferrer" className="flex min-h-20 items-center justify-center rounded-xl border border-emerald-400/40 bg-zinc-950 px-4 text-center text-sm font-bold text-emerald-200">PDF enviado — toque para conferir</a> : <a href={msg.previewUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-emerald-400/40 bg-zinc-950"><img src={msg.previewUrl} alt="Comprovante Pix enviado" className="h-44 w-full object-contain" /><p className="border-t border-emerald-400/20 px-3 py-2 text-center text-xs font-bold text-emerald-200">Toque na foto para ampliar e conferir</p></a>}
            </div>
          );
        }
        return (
          <div key={idx} className="ml-10 mb-3 space-y-2">
            {/* Card Pix */}
            <div className="bg-zinc-800 border border-emerald-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <span>💚</span> CHAVE PIX
              </div>
              {!msg.pixKey && <p className="text-sm font-bold text-amber-200">Chave Pix indisponível. Não efetue o pagamento.</p>}
              {msg.pixName && <p className="text-xs text-zinc-400">Beneficiário: <span className="text-white font-semibold">{msg.pixName}</span>{msg.pixBank ? ` — ${msg.pixBank}` : ''}</p>}
              {msg.discountPrice && msg.discountPrice !== "R$ 0,00" && <><p className="text-xs text-zinc-400">Valor original: {msg.basePrice}</p><p className="text-xs text-emerald-300">Desconto: {msg.discountPrice}</p></>}
              {msg.price && <p className="text-sm text-zinc-200">Total a pagar: <span className="text-emerald-300 font-black text-lg">{msg.price}</span></p>}
              <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2">
                <span className="text-sm text-white font-mono flex-1 break-all">{msg.pixKey}</span>
                <button
                  disabled={!msg.pixKey}
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(msg.pixKey); setPixCopied(true); queueAdvance(() => setPixCopied(false), 2000); }
                    catch { addMsgs({type:"bot",id:uid(),text:"Não foi possível copiar a chave Pix."}); }
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                >
                  {pixCopied ? '✅ Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
            {/* Upload comprovante */}
            <div className="rounded-2xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-400/20 via-orange-500/15 to-emerald-500/15 p-4 shadow-xl shadow-amber-500/10">
              <p className="mb-1 text-base font-black uppercase tracking-wide text-amber-100">Último passo: envie o comprovante</p>
              <p className="mb-4 text-sm font-medium text-amber-50">Depois do pagamento Pix, toque no botão grande abaixo e escolha a foto ou PDF do comprovante. Sem o comprovante, o pedido não pode ser finalizado.</p>
              {uploadingPix ? (
                <div className="flex min-h-16 items-center justify-center gap-3 rounded-xl bg-zinc-950/70 px-4 text-sm font-bold text-amber-100">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
                  ENVIANDO COMPROVANTE. AGUARDE...
                </div>
              ) : (
                <button
                  disabled={!msg.pixKey}
                  onClick={() => {
                    pendingPixMsgId.current = msg.id;
                    pixFileInputRef.current?.click();
                  }}
                  className="w-full min-h-20 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-600 px-4 py-4 text-left text-zinc-950 shadow-lg shadow-amber-500/40 transition-all hover:scale-[1.01] hover:brightness-110 active:scale-[0.99]"
                >
                  <span className="flex items-center gap-3"><Camera className="h-9 w-9 shrink-0" /><span><span className="block text-lg font-black uppercase">Enviar comprovante Pix</span><span className="mt-0.5 block text-xs font-bold">Toque aqui • Foto, galeria ou PDF • Máximo 15 MB</span></span><ChevronRight className="ml-auto h-7 w-7" /></span>
                </button>
              )}
            </div>
          </div>
        );

      case "action":
        if (msg.done) return null;
        return (
          <div key={idx} className="ml-10 mb-3">
            <button
              onClick={() => { const cb = callbacks.current[msg.id]; if (cb) cb(); }}
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-sm font-bold transition-all shadow-lg shadow-violet-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : msg.label}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div data-colombia-bot className="fixed inset-0 z-[9990] flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
        {displayAvatar ? (
          <img src={displayAvatar} alt={displayName} className="w-10 h-10 rounded-full object-cover shadow-lg" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
        )}
        <div className="flex-1">
          <p className="font-bold text-white text-sm">{displayName}</p>
          <p className="text-xs text-cyan-300">Assistente automático • {currentPhase}</p>
        </div>
        <button onClick={() => { if (flowState.current.product && !window.confirm("Sair do assistente? Seu rascunho continuará salvo.")) return; onStartNormal(); }} aria-label="Fechar assistente" className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div aria-label={`Etapa atual: ${currentPhase}`} className="flex shrink-0 gap-1 border-b border-zinc-800 p-2">{["Serviço","Garantia / preço","Dados","Documentos","Cupom","Pagamento","Finalizar"].map((phase,i,steps)=><div key={phase} title={phase} className={`h-1.5 flex-1 rounded-full ${steps.indexOf(currentPhase)>=i ? "bg-cyan-400":"bg-zinc-700"}`}/>)}</div>
      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {messages.map((msg, idx) => renderMsg(msg, idx))}
        <div ref={chatEndRef} />
      </div>

      {sendError && <div role="alert" className="mx-3 my-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">{sendError} <a href="/acompanhar" className="font-bold underline">Conferir pedido</a></div>}
      {blockedChoice && <div role="alertdialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 p-4"><div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-400/60 bg-zinc-900 p-5 text-white"><h2 className="font-black text-xl text-amber-200">{blockedChoice.title}</h2><p className="text-sm">{blockedChoice.question}</p><p className="text-sm text-red-300">Resposta: {blockedChoice.answer}</p><p className="text-sm">{blockedChoice.message}</p><button type="button" className="w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-zinc-950" onClick={() => setBlockedChoice(null)}>{blockedChoice.buttonLabel}</button></div></div>}
      {/* Rodapé — botões Voltar e Recomeçar */}
      {!isSubmitting && (
        <div className="shrink-0 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-zinc-800/60 flex items-center justify-center gap-3">
          {/* Botão Voltar — só aparece quando há histórico */}
          <button
            onClick={() => {
              const snap = history.current.pop();
              cancelPendingAdvances();
              if (!snap) {
                addMsgs({type:"bot",id:uid(),text:"Rascunho preservado. Após atualizar a página, não é possível voltar uma etapa. Use Recomeçar para reiniciar."});
                return;
              }
              setMessages(snap.messages);
              setInputValues(snap.inputValues);
              flowState.current = snap.flowState;
              callbacks.current = snap.callbacks;
              couponInputIds.current.clear();
              pendingUpload.current = null;
              pendingPixMsgId.current = '';
              setUploadingDocId(null);
              setPixCopied(false);
              setUploadingPix(false);
              if (snap.flowState.product && snap.flowState.option) {
                saveBotProgress('questions', 'dados');
              } else {
                clearCompletedBotProgress();
              }
            }}
            className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors py-2 px-4 rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-800 hover:bg-zinc-700 font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Voltar
          </button>

          {/* Divisor */}
          <span className="text-zinc-700 text-xs">|</span>

          {/* Botão Recomeçar */}
          <button
            onClick={() => {
              if (!window.confirm("Recomeçar? As respostas ainda não enviadas serão apagadas.")) return;
              cancelPendingAdvances();
              clearCompletedBotProgress();
              couponInputIds.current.clear();
              history.current = [];
              setMessages([]);
              setInputValues({});
              setUploadingDocId(null);
              setPixCopied(false);
              setUploadingPix(false);
              flowState.current = { product: null, option: null, priceModel: null, answers: {}, audioAnswers: {}, audioFlowId: createAudioFlowId(), docFiles: {}, clientName: flowState.current.clientName, clientPhone: flowState.current.clientPhone, pixProofUrl: '', pixProofMime: '', couponCode: '', couponDiscount: null };
              callbacks.current = {};
              pendingUpload.current = null;
              pendingPixMsgId.current = '';
              startEntry();
            }}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-2 px-4 rounded-xl hover:bg-zinc-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Recomeçar
          </button>
        </div>
      )}

      {/* Input de arquivo oculto — documentos */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          const pending = pendingUpload.current;
          if (file && pending) {
            const cb = callbacks.current[pending.msgId];
            if (cb) cb(file);
          }
          e.target.value = "";
          pendingUpload.current = null;
        }}
      />
      {/* Input de arquivo oculto — comprovante Pix */}
      <input
        ref={pixFileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            const cb = callbacks.current[pendingPixMsgId.current];
            if (cb) cb(file);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
