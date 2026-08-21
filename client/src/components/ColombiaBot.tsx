/**
 * ColombiaBot — Chat acumulado com callbacks em ref
 * Cada mensagem carrega seu próprio handler, eliminando stale closure.
 * Sub-perguntas aparecem corretamente após a resposta do pai.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Camera, ChevronRight, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { QuestionAudioRecorder, type AudioDraft } from "@/components/QuestionAudioRecorder";
import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";

// ── Tipos ────────────────────────────────────────────────────────────────────

type Product = {
  id: number; name: string; description?: string; iconUrl?: string;
  options: ProductOption[];
};
type ProductOption = {
  id: number; name: string; price?: string; label?: string; type?: string; isPdfOnly?: number;
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
  | { type: "bot"; id: string; text: string; audioUrl?: string | null; hideText?: boolean }
  | { type: "user"; id: string; text: string }
  | { type: "options"; id: string; options: string[]; answered: boolean }
  | { type: "input"; id: string; multiline: boolean; answered: boolean }
  | { type: "audio-input"; id: string; question: ProductQuestion; answered: boolean }
  | { type: "doc-upload"; id: string; docId: number; label: string; required: boolean; uploaded: boolean; previewUrl?: string; previewMime?: string }
  | { type: "pix-payment"; id: string; pixKey: string; pixName: string; pixBank: string; price: string; uploaded: boolean; previewUrl?: string; previewMime?: string }
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
  trackingPin?: string;
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

export function ColombiaBot({ products, onStartNormal, onSelectProduct, onSelectOption, onOrderComplete, botName, botAvatar, botWelcome }: Props) {
  const displayName = botName || 'Carminha';
  const displayAvatar = botAvatar || '';
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitMutation = trpc.uploads.submitFiles.useMutation();
  const validateCouponMutation = trpc.coupons.validate.useMutation();
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Callbacks armazenados em ref para evitar stale closure
  const callbacks = useRef<Record<string, (...args: any[]) => void>>({});

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
  }>({ product: null, option: null, answers: {}, audioAnswers: {}, audioFlowId: createAudioFlowId(), docFiles: {}, clientName: '', clientPhone: '', pixProofUrl: '', pixProofMime: '', couponCode: '', couponDiscount: null });

  const [pixCopied, setPixCopied] = useState(false);
  const [uploadingPix, setUploadingPix] = useState(false);
  const pixFileInputRef = useRef<HTMLInputElement>(null);
  const pendingPixMsgId = useRef<string>('');

  // Buscar pix ativo e nome do cliente logado
  const { data: activePix } = trpc.pix.getActive.useQuery();
  const { data: settingsData } = trpc.settings.getAll.useQuery();
  const clientPhone = typeof window !== 'undefined' ? localStorage.getItem('walk_client_phone') || '' : '';
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
    if (!restoreBotProgress()) startWelcome();
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
        questionAnswers: Object.entries(fs.answers).reduce((acc, [qId, ans]) => {
          // Converter Record<number, string> para o formato {[questionId]: answer}
          acc[qId] = ans;
          return acc;
        }, {} as Record<string, string>),
        questionAudioAnswers: fs.audioAnswers,
        questionAudioFlowId: fs.audioFlowId,
        clientName: fs.clientName || '',
        clientPhone: fs.clientPhone || '',
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

  // Salvar snapshot do estado atual antes de uma nova pergunta (para o botão Voltar)
  const saveSnapshot = useCallback(() => {
    setMessages(prev => {
      setInputValues(iv => {
        history.current.push({
          messages: prev,
          inputValues: iv,
          flowState: JSON.parse(JSON.stringify(flowState.current)),
          callbacks: { ...callbacks.current },
        });
        // Manter no máximo 20 snapshots
        if (history.current.length > 20) history.current.shift();
        return iv;
      });
      return prev;
    });
  }, []);

  const addMsgs = useCallback((...msgs: ChatMsg[]) => {
    setMessages(prev => [...prev, ...msgs]);
  }, []);

  const markAnswered = useCallback((id: string) => {
    setMessages(prev => prev.map(m =>
      (m.type === "options" || m.type === "input" || m.type === "audio-input") && m.id === id
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

  // Retorna perguntas visíveis ordenadas de forma que sub-perguntas aparecem logo após o pai
  const getVisibleQuestions = (questions: ProductQuestion[], answers: Record<number, string>): ProductQuestion[] => {
    const visible = questions.filter(q => {
      if (!q.parentQuestionId) return true;
      const parentAnswer = answers[q.parentQuestionId]?.trim() || "";
      if (!q.triggerOption) return !!parentAnswer;
      return parentAnswer === q.triggerOption;
    });

    // Ordenar: cada sub-pergunta fica logo após seu pai
    const ordered: ProductQuestion[] = [];
    const roots = visible.filter(q => !q.parentQuestionId).sort((a, b) => a.sortOrder - b.sortOrder);

    const insertWithChildren = (q: ProductQuestion) => {
      ordered.push(q);
      // Filhos diretos desta pergunta que estão visíveis
      const children = visible
        .filter(c => c.parentQuestionId === q.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
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

      if (saved.cadastroSubStep === 'pagamento') {
        askPix(product, option);
        return true;
      }
      const visibleQuestions = getVisibleQuestions(option.questions, answers);
      if (visibleQuestions.some(question => answers[question.id] === undefined)) {
        askQuestions(product, option, answers);
        return true;
      }
      const requiredDocs = option.documents.filter(doc => doc.isRequired === undefined || doc.isRequired === 1);
      if (requiredDocs.some(doc => !docFiles[doc.id]?.url)) {
        askDocuments(product, option);
        return true;
      }
      askCoupon(product, option);
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
        setTimeout(() => onStartNormal(), 200);
      } else {
        setTimeout(() => askService(), 300);
      }
    };
    const welcomeMsg = botWelcome || `Olá! Sou o ${displayName}, seu assistente de pedidos. 👋\n\nComo prefere continuar?`;
    addMsgs(
      { type: "bot", id: uid(), text: welcomeMsg },
      { type: "options", id: optId, options: [`🤖 Quero ajuda do ${displayName}`, "Continuar sozinho"], answered: false }
    );
  };

  const askService = () => {
    saveSnapshot();
    const optId = uid();
    callbacks.current[optId] = (opt: string) => {
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: opt });
      const product = products.find(p => p.name === opt);
      if (!product) return;
      resetOptionFlow();
      flowState.current.product = product;
      saveBotProgress('questions', 'dados');
      setTimeout(() => {
        if (product.options.length === 0) {
          finishWithProduct(product, null);
        } else if (product.options.length === 1) {
          flowState.current.option = product.options[0];
          setTimeout(() => askQuestions(product, product.options[0], {}), 300);
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
    saveSnapshot();
    const optId = uid();
    callbacks.current[optId] = (opt: string) => {
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: opt });
      const option = product.options.find(o => {
        const label = `${o.label || o.name}${o.price ? ` — R$ ${o.price}` : ""}`;
        return label === opt;
      });
      if (!option) return;
      resetOptionFlow();
      flowState.current.product = product;
      flowState.current.option = option;
      saveBotProgress('questions', 'dados');
      setTimeout(() => askQuestions(product, option, {}), 300);
    };
    addMsgs(
      { type: "bot", id: uid(), text: `Qual opção de ${product.name} você quer?` },
      {
        type: "options",
        id: optId,
        options: product.options.map(o => `${o.label || o.name}${o.price ? ` — R$ ${o.price}` : ""}`),
        answered: false
      }
    );
  };

  const askQuestions = (product: Product, option: ProductOption, currentAnswers: Record<number, string>) => {
    // Recalcular perguntas visíveis com as respostas atuais
    const visible = getVisibleQuestions(option.questions, currentAnswers);
    // Próxima pergunta ainda não respondida
    const nextQ = visible.find(q => currentAnswers[q.id] === undefined);

    if (!nextQ) {
      // Todas respondidas → documentos
      setTimeout(() => askDocuments(product, option), 300);
      return;
    }

    saveSnapshot();
    const msgId = uid();

    if (nextQ.fieldType === "audio") {
      callbacks.current[msgId] = (audio: AudioDraft) => {
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: `Áudio anexado · ${String(Math.floor(audio.durationSeconds / 60)).padStart(2, '0')}:${String(Math.round(audio.durationSeconds % 60)).padStart(2, '0')}` });
        const newAnswers = { ...currentAnswers, [nextQ.id]: "Áudio anexado" };
        flowState.current.answers = newAnswers;
        flowState.current.audioAnswers = { ...flowState.current.audioAnswers, [nextQ.id]: audio };
        saveBotProgress('questions', 'dados');
        setTimeout(() => askQuestions(product, option, newAnswers), 200);
      };
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question, audioUrl: nextQ.questionPresentation === 'audio' ? nextQ.questionAudioUrl : null, hideText: nextQ.questionPresentation === 'audio' && nextQ.showQuestionTextWithAudio !== 1 },
        { type: "audio-input", id: msgId, question: nextQ, answered: false }
      );
    } else if (nextQ.fieldType === "select" && nextQ.options) {
      const opts = parseOptions(nextQ.options);
      callbacks.current[msgId] = (val: string) => {
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: val });
        const newAnswers = { ...currentAnswers, [nextQ.id]: val };
        flowState.current.answers = newAnswers;
        saveBotProgress('questions', 'dados');
        // Continuar com as novas respostas — sub-perguntas serão recalculadas
        setTimeout(() => askQuestions(product, option, newAnswers), 300);
      };
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question, audioUrl: nextQ.questionPresentation === 'audio' ? nextQ.questionAudioUrl : null, hideText: nextQ.questionPresentation === 'audio' && nextQ.showQuestionTextWithAudio !== 1 },
        { type: "options", id: msgId, options: opts, answered: false }
      );
    } else {
      callbacks.current[msgId] = (val: string) => {
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: val || "(sem resposta)" });
        const newAnswers = { ...currentAnswers, [nextQ.id]: val };
        flowState.current.answers = newAnswers;
        saveBotProgress('questions', 'dados');
        setTimeout(() => askQuestions(product, option, newAnswers), 300);
      };
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question, audioUrl: nextQ.questionPresentation === 'audio' ? nextQ.questionAudioUrl : null, hideText: nextQ.questionPresentation === 'audio' && nextQ.showQuestionTextWithAudio !== 1 },
        { type: "input", id: msgId, multiline: nextQ.fieldType === "textarea", answered: false }
      );
    }
  };

  const askDocuments = (product: Product, option: ProductOption) => {
    saveSnapshot();
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
            setTimeout(() => askCoupon(product, option), 400);
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
    saveSnapshot();
    const msgId = uid();
    // Callback para quando o cliente clicar em Sim ou Não
    callbacks.current[msgId] = async (answer: string) => {
      setMessages(prev => prev.map(m =>
        m.type === 'options' && m.id === msgId ? { ...m, answered: true } : m
      ));
      addMsgs({ type: 'user', id: uid(), text: answer });
      if (answer === 'SIM, TENHO UM CUPOM') {
        // Pedir o código do cupom
        const inputId = uid();
        callbacks.current[inputId] = async (code: string) => {
          setMessages(prev => prev.map(m =>
            m.type === 'input' && m.id === inputId ? { ...m, answered: true } : m
          ));
          addMsgs({ type: 'user', id: uid(), text: code });
          setIsValidatingCoupon(true);
          try {
            const result = await validateCouponMutation.mutateAsync({ code: code.trim() });
            if (result.valid) {
              flowState.current.couponCode = code.trim();
              flowState.current.couponDiscount = result.discount ? { type: result.discount.type, value: result.discount.value } : null;
              const discountText = result.discount?.type === 'percentage'
                ? `${result.discount.value}% de desconto`
                : `R$ ${result.discount?.value?.toFixed(2).replace('.', ',')} de desconto`;
              addMsgs({ type: 'bot', id: uid(), text: `✅ Cupom aplicado! ${discountText}` });
            } else {
              addMsgs({ type: 'bot', id: uid(), text: `❌ Cupom inválido: ${result.reason || 'Código não encontrado.'}` });
            }
          } catch {
            addMsgs({ type: 'bot', id: uid(), text: '❌ Erro ao validar cupom. Continuando sem desconto.' });
          } finally {
            setIsValidatingCoupon(false);
            setTimeout(() => askPix(product, option), 400);
          }
        };
        addMsgs(
          { type: 'bot', id: uid(), text: 'Digite o código do seu cupom:' },
          { type: 'input', id: inputId, multiline: false, answered: false }
        );
      } else {
        // Não tem cupom — ir direto para o Pix
        setTimeout(() => askPix(product, option), 400);
      }
    };
    addMsgs(
      { type: 'bot', id: uid(), text: 'Você tem um cupom de desconto?' },
      { type: 'options', id: msgId, options: ['SIM, TENHO UM CUPOM', 'NÃO TENHO CUPOM'], answered: false }
    );
  };

  // Etapa de pagamento Pix — mostra chave, botão copiar, upload comprovante
  const askPix = (product: Product, option: ProductOption | null) => {
    saveSnapshot();
    const pixKey = activePix?.pixKey || settingsData?.pix_key || '';
    const pixName = activePix?.pixName || settingsData?.pix_name || '';
    const pixBank = activePix?.pixBank || settingsData?.pix_bank || '';
    const price = option?.price || '';

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
        setTimeout(() => finishWithProduct(product, option), 400);
      } catch {
        addMsgs({ type: 'bot', id: uid(), text: 'Não consegui enviar o comprovante. Verifique sua conexão e tente novamente.' });
      } finally {
        setUploadingPix(false);
      }
    };

    // Salvar progresso ao chegar na etapa de pagamento PIX
    saveBotProgress('cadastro', 'pagamento');
    addMsgs(
      { type: 'bot', id: uid(), text: `Agora faça o pagamento via Pix${price ? ` de R$ ${price}` : ''} e envie o comprovante abaixo.` },
      { type: 'pix-payment', id: msgId, pixKey, pixName, pixBank, price, uploaded: false }
    );
  };

  const finishWithProduct = (product: Product, option: ProductOption | null) => {
    const actionId = uid();
    callbacks.current[actionId] = async () => {
      markActionDone(actionId);
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
      const clientPhoneForSubmit = flowState.current.clientPhone
        || profileQuery.data?.phone?.replace(/\D/g, '')
        || localStorage.getItem('walk_client_phone')?.replace(/\D/g, '')
        || '';

      try {
        addMsgs({ type: "bot", id: uid(), text: "Enviando seu pedido... \u23f3" });

        const result = await submitMutation.mutateAsync({
          clientName: flowState.current.clientName || profileQuery.data?.name || 'Cliente',
          service: product.name,
          nameOption: option?.label || option?.name || 'N/A',
          documents: docsArray.length > 0 ? docsArray : undefined,
          phone: clientPhoneForSubmit || undefined,
          city: profileQuery.data?.city || undefined,
          email: profileQuery.data?.email || undefined,
          cpToken: cpToken || undefined,
          answers: answersArray.length > 0 ? JSON.stringify(answersArray) : undefined,
          productId: product.id,
          optionId: option?.id,
          questionAudioFlowId: hasAudioAnswersForCurrentOption ? flowState.current.audioFlowId : undefined,
          audioDraftIds: hasAudioAnswersForCurrentOption ? audioDraftIdsForSubmit : undefined,
          couponCode: flowState.current.couponCode || undefined,
          price: (() => {
            const rawPrice = option?.price;
            if (!rawPrice) return undefined;
            const discount = flowState.current.couponDiscount;
            if (!discount) return rawPrice;
            // Extrair valor numérico do preço (ex: "R$ 350,00" -> 350)
            const num = parseFloat(rawPrice.replace(/[^\d,]/g, '').replace(',', '.'));
            if (isNaN(num)) return rawPrice;
            const final = discount.type === 'percentage'
              ? num - (num * discount.value / 100)
              : num - discount.value;
            return `R$ ${Math.max(0, final).toFixed(2).replace('.', ',')}`;
          })(),
          paymentProofUrl: flowState.current.pixProofUrl || undefined,
          paymentProofMime: flowState.current.pixProofMime || undefined,
        });

        if (result.success) {
          // Limpar antes de fechar o Bot: evita que a vitrine recupere um pedido já concluído.
          clearCompletedBotProgress();
          addMsgs({ type: "bot", id: uid(), text: "Pedido enviado com sucesso! \u2705\n\nO admin j\u00e1 recebeu e entrar\u00e1 em contato em breve." });
          onOrderComplete({
            cartItems: [{ service: product.name, nameOption: option?.label || option?.name || 'N/A', price: option?.price || '' }],
            answers: answersArray,
            docs: docsArray,
            totalValue: option?.price || '',
            referrerName: '',
            referrerPhone: '',
            clientName: flowState.current.clientName || profileQuery.data?.name || 'Cliente',
            clientPhone: clientPhoneForSubmit,
            clientCity: profileQuery.data?.city || '',
            trackingPin: (result as any).trackingPin || undefined,
          });
        } else {
          addMsgs({ type: "bot", id: uid(), text: `Erro ao enviar pedido: ${(result as any).message || 'Tente novamente.'}` });
        }
      } catch (err: any) {
        addMsgs({ type: "bot", id: uid(), text: `Erro ao enviar: ${err?.message || 'Tente novamente.'}` });
      } finally {
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
      case "bot":
        return (
          <div key={idx} className="flex items-start gap-2 mb-3">
            <BotAvatar />
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[82%] text-sm text-zinc-100 leading-relaxed whitespace-pre-line">
              {!msg.hideText && msg.text}
              {msg.audioUrl && <div className="mt-2 border-t border-zinc-700 pt-2"><p className="mb-1 text-[10px] font-semibold text-cyan-300">🔊 Ouça a pergunta</p><audio controls preload="metadata" src={msg.audioUrl} className="h-8 w-full" /></div>}
            </div>
          </div>
        );

      case "user":
        return (
          <div key={idx} className="flex justify-end mb-2">
            <div className="bg-violet-600 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] text-sm text-white">
              {msg.text}
            </div>
          </div>
        );

      case "options":
        if (msg.answered) return null;
        return (
          <div key={idx} className="ml-10 space-y-2 mb-3">
            {msg.options.map(opt => (
              <button
                key={opt}
                onClick={() => {
                  const cb = callbacks.current[msg.id];
                  if (cb) cb(opt);
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-violet-500 hover:bg-violet-500/10 text-sm font-medium text-zinc-200 transition-all active:scale-95 text-left"
              >
                <span>{opt}</span>
                <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
              </button>
            ))}
          </div>
        );

      case "input":
        if (msg.answered) return null;
        return (
          <div key={idx} className="ml-10 space-y-2 mb-3">
            {msg.multiline ? (
              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
                rows={3}
                placeholder="Digite sua resposta..."
                value={inputValues[msg.id] || ""}
                onChange={e => setInputValues(prev => ({ ...prev, [msg.id]: e.target.value }))}
              />
            ) : (
              <input
                type="text"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                placeholder="Digite sua resposta..."
                value={inputValues[msg.id] || ""}
                onChange={e => setInputValues(prev => ({ ...prev, [msg.id]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const cb = callbacks.current[msg.id];
                    if (cb) { cb(inputValues[msg.id]?.trim() || ""); setInputValues(prev => { const n = { ...prev }; delete n[msg.id]; return n; }); }
                  }
                }}
              />
            )}
            <button
              onClick={() => {
                const cb = callbacks.current[msg.id];
                if (cb) { cb(inputValues[msg.id]?.trim() || ""); setInputValues(prev => { const n = { ...prev }; delete n[msg.id]; return n; }); }
              }}
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
            >
              Confirmar
            </button>
          </div>
        );

      case "audio-input":
        if (msg.answered) return null;
        if (!flowState.current.product || !flowState.current.option) return null;
        return (
          <div key={idx} className="ml-10 mb-3">
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
              onConfirmed={audio => callbacks.current[msg.id]?.(audio)}
              onClear={() => { delete flowState.current.audioAnswers[msg.question.id]; delete flowState.current.answers[msg.question.id]; }}
            />
          </div>
        );

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
              {msg.pixName && <p className="text-xs text-zinc-400">Beneficiário: <span className="text-white font-semibold">{msg.pixName}</span>{msg.pixBank ? ` — ${msg.pixBank}` : ''}</p>}
              {msg.price && <p className="text-xs text-zinc-400">Valor: <span className="text-emerald-400 font-bold text-sm">R$ {msg.price}</span></p>}
              <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2">
                <span className="text-sm text-white font-mono flex-1 break-all">{msg.pixKey}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(msg.pixKey).catch(() => {});
                    setPixCopied(true);
                    setTimeout(() => setPixCopied(false), 2000);
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
    <div className="fixed inset-0 z-[9990] flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
        {displayAvatar ? (
          <img src={displayAvatar} alt={displayName} className="w-10 h-10 rounded-full object-cover shadow-lg" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
        )}
        <div className="flex-1">
          <p className="font-bold text-white text-sm">{displayName}</p>
          <p className="text-xs text-emerald-400">● Online agora</p>
        </div>
        <button onClick={onStartNormal} className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg, idx) => renderMsg(msg, idx))}
        <div ref={chatEndRef} />
      </div>

      {/* Rodapé — botões Voltar e Recomeçar */}
      {!isSubmitting && (
        <div className="shrink-0 px-4 py-2 border-t border-zinc-800/60 flex items-center justify-center gap-3">
          {/* Botão Voltar — só aparece quando há histórico */}
          <button
            onClick={() => {
              const snap = history.current.pop();
              if (!snap) return;
              setMessages(snap.messages);
              setInputValues(snap.inputValues);
              flowState.current = snap.flowState;
              callbacks.current = snap.callbacks;
              pendingUpload.current = null;
              pendingPixMsgId.current = '';
              setUploadingDocId(null);
              setPixCopied(false);
              setUploadingPix(false);
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
              history.current = [];
              setMessages([]);
              setInputValues({});
              setUploadingDocId(null);
              setPixCopied(false);
              setUploadingPix(false);
              flowState.current = { product: null, option: null, answers: {}, audioAnswers: {}, audioFlowId: createAudioFlowId(), docFiles: {}, clientName: flowState.current.clientName, clientPhone: flowState.current.clientPhone, pixProofUrl: '', pixProofMime: '', couponCode: '', couponDiscount: null };
              callbacks.current = {};
              pendingUpload.current = null;
              pendingPixMsgId.current = '';
              setTimeout(() => startWelcome(), 100);
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
