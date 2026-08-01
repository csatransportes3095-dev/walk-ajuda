/**
 * ColombiaBot — Chat acumulado com callbacks em ref
 * Cada mensagem carrega seu próprio handler, eliminando stale closure.
 * Sub-perguntas aparecem corretamente após a resposta do pai.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Camera, ChevronRight, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

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
  parentQuestionId: number | null; triggerOption: string | null;
};
type ProductDocument = {
  id: number; label: string; isRequired?: number; sortOrder: number;
};

// ── Mensagem do chat ─────────────────────────────────────────────────────────

type ChatMsg =
  | { type: "bot"; id: string; text: string }
  | { type: "user"; id: string; text: string }
  | { type: "options"; id: string; options: string[]; answered: boolean }
  | { type: "input"; id: string; multiline: boolean; answered: boolean }
  | { type: "doc-upload"; id: string; docId: number; label: string; required: boolean; uploaded: boolean }
  | { type: "pix-payment"; id: string; pixKey: string; pixName: string; pixBank: string; price: string; uploaded: boolean }
  | { type: "action"; id: string; label: string; done: boolean };

// ── Props ────────────────────────────────────────────────────────────────────

export type BotOrderData = {
  cartItems: Array<{ service: string; nameOption: string; price: string }>;
  answers: Array<{ question: string; answer: string }>;
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
}

// ── Componente ───────────────────────────────────────────────────────────────

export function ColombiaBot({ products, onStartNormal, onSelectProduct, onSelectOption, onOrderComplete }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitMutation = trpc.uploads.submitFiles.useMutation();

  // Callbacks armazenados em ref para evitar stale closure
  const callbacks = useRef<Record<string, (...args: any[]) => void>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ msgId: string; docId: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Estado do fluxo em ref (sem re-render)
  const flowState = useRef<{
    product: Product | null;
    option: ProductOption | null;
    answers: Record<number, string>;
    docFiles: Record<number, { file: File; url?: string }>;
    clientName: string;
    clientPhone: string;
    pixProofUrl: string;
    pixProofMime: string;
  }>({ product: null, option: null, answers: {}, docFiles: {}, clientName: '', clientPhone: '', pixProofUrl: '', pixProofMime: '' });

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

  // Inicializar
  useEffect(() => { startWelcome(); }, []); // eslint-disable-line

  // ── Helpers ────────────────────────────────────────────────────────────────

  const uid = () => Math.random().toString(36).slice(2, 9);

  const addMsgs = useCallback((...msgs: ChatMsg[]) => {
    setMessages(prev => [...prev, ...msgs]);
  }, []);

  const markAnswered = useCallback((id: string) => {
    setMessages(prev => prev.map(m =>
      (m.type === "options" || m.type === "input") && m.id === id
        ? { ...m, answered: true }
        : m
    ));
  }, []);

  const markDocUploaded = useCallback((id: string) => {
    setMessages(prev => prev.map(m =>
      m.type === "doc-upload" && m.id === id ? { ...m, uploaded: true } : m
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

  // ── Fluxo ─────────────────────────────────────────────────────────────────

  const startWelcome = () => {
    const optId = uid();
    callbacks.current[optId] = (opt: string) => {
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: opt });
      if (opt === "Continuar sozinho") {
        setTimeout(() => onStartNormal(), 200);
      } else {
        setTimeout(() => askService(), 300);
      }
    };
    addMsgs(
      { type: "bot", id: uid(), text: "Olá! Sou o Colombia, seu assistente de pedidos. 👋\n\nComo prefere continuar?" },
      { type: "options", id: optId, options: ["🤖 Quero ajuda do Colombia", "Continuar sozinho"], answered: false }
    );
  };

  const askService = () => {
    const optId = uid();
    callbacks.current[optId] = (opt: string) => {
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: opt });
      const product = products.find(p => p.name === opt);
      if (!product) return;
      flowState.current.product = product;
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
    const optId = uid();
    callbacks.current[optId] = (opt: string) => {
      markAnswered(optId);
      addMsgs({ type: "user", id: uid(), text: opt });
      const option = product.options.find(o => {
        const label = `${o.label || o.name}${o.price ? ` — R$ ${o.price}` : ""}`;
        return label === opt;
      });
      if (!option) return;
      flowState.current.option = option;
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

    const msgId = uid();

    if (nextQ.fieldType === "select" && nextQ.options) {
      const opts = parseOptions(nextQ.options);
      callbacks.current[msgId] = (val: string) => {
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: val });
        const newAnswers = { ...currentAnswers, [nextQ.id]: val };
        flowState.current.answers = newAnswers;
        // Continuar com as novas respostas — sub-perguntas serão recalculadas
        setTimeout(() => askQuestions(product, option, newAnswers), 300);
      };
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question },
        { type: "options", id: msgId, options: opts, answered: false }
      );
    } else {
      callbacks.current[msgId] = (val: string) => {
        markAnswered(msgId);
        addMsgs({ type: "user", id: uid(), text: val || "(sem resposta)" });
        const newAnswers = { ...currentAnswers, [nextQ.id]: val };
        flowState.current.answers = newAnswers;
        setTimeout(() => askQuestions(product, option, newAnswers), 300);
      };
      addMsgs(
        { type: "bot", id: uid(), text: nextQ.question },
        { type: "input", id: msgId, multiline: nextQ.fieldType === "textarea", answered: false }
      );
    }
  };

  const askDocuments = (product: Product, option: ProductOption) => {
    const docs = option.documents || [];
    if (docs.length === 0) {
      askPix(product, option);
      return;
    }

      const docMsgs: ChatMsg[] = docs.map(doc => {
      const msgId = uid();
      // isRequired ausente = obrigatório por padrão
      const isRequired = doc.isRequired === undefined ? true : doc.isRequired === 1;
      callbacks.current[msgId] = async (file: File) => {
        setUploadingDocId(doc.id);
        try {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/upload/client-file", { method: "POST", body: formData });
          const data = await res.json();
          flowState.current.docFiles[doc.id] = { file, url: data.url };
        } catch {
          flowState.current.docFiles[doc.id] = { file };
        } finally {
          setUploadingDocId(null);
          markDocUploaded(msgId);
          addMsgs({ type: "user", id: uid(), text: `✅ ${doc.label} enviado` });
          // Verificar se todos os obrigatórios foram enviados
          const required = docs.filter(d => d.isRequired === undefined ? true : d.isRequired === 1);
          const allDone = required.every(d => flowState.current.docFiles[d.id]);
          if (allDone) {
            setTimeout(() => askPix(product, option), 400);
          }
        }
      };
      return { type: "doc-upload" as const, id: msgId, docId: doc.id, label: doc.label, required: isRequired, uploaded: false };
    });

    addMsgs(
      { type: "bot", id: uid(), text: `Agora preciso de ${docs.length === 1 ? "um documento" : `${docs.length} documentos`}. Envie abaixo. 📎` },
      ...docMsgs
    );
  };

  // Etapa de pagamento Pix — mostra chave, botão copiar, upload comprovante
  const askPix = (product: Product, option: ProductOption | null) => {
    const pixKey = activePix?.pixKey || settingsData?.pix_key || '';
    const pixName = activePix?.pixName || settingsData?.pix_name || '';
    const pixBank = activePix?.pixBank || settingsData?.pix_bank || '';
    const price = option?.price || '';

    const msgId = uid();
    pendingPixMsgId.current = msgId;

    callbacks.current[msgId] = async (file: File) => {
      setUploadingPix(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload/client-file', { method: 'POST', body: formData });
        const data = await res.json();
        flowState.current.pixProofUrl = data.url || '';
        flowState.current.pixProofMime = file.type || 'image/jpeg';
      } catch {
        flowState.current.pixProofUrl = '';
      } finally {
        setUploadingPix(false);
        setMessages(prev => prev.map(m =>
          m.type === 'pix-payment' && m.id === msgId ? { ...m, uploaded: true } : m
        ));
        addMsgs({ type: 'user', id: uid(), text: '✅ Comprovante enviado' });
        setTimeout(() => finishWithProduct(product, option), 400);
      }
    };

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

      // Montar answers array
      const answersArray: Array<{ question: string; answer: string }> = [];
      if (option) {
        const visible = getVisibleQuestions(option.questions, flowState.current.answers);
        visible.forEach(q => {
          if (flowState.current.answers[q.id]) {
            answersArray.push({ question: q.question, answer: flowState.current.answers[q.id] });
          }
        });
      }

      // Montar documents array
      const docsArray: Array<{ label: string; url: string; mime?: string }> = [];
      if (option) {
        option.documents.forEach(d => {
          const df = flowState.current.docFiles[d.id];
          if (df?.url) docsArray.push({ label: d.label, url: df.url });
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
          price: option?.price || undefined,
          paymentProofUrl: flowState.current.pixProofUrl || undefined,
          paymentProofMime: flowState.current.pixProofMime || undefined,
        });

        if (result.success) {
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
              {msg.text}
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

      case "doc-upload":
        if (msg.uploaded) return null;
        return (
          <div key={idx} className="ml-10 mb-3">
            {uploadingDocId === msg.docId ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-400">
                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                Enviando...
              </div>
            ) : (
              <button
                onClick={() => {
                  pendingUpload.current = { msgId: msg.id, docId: msg.docId };
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-zinc-700 hover:border-violet-500 text-zinc-400 hover:text-violet-300 text-sm transition-all"
              >
                <Camera className="w-4 h-4" />
                {msg.label}{!msg.required ? " (opcional)" : ""}
              </button>
            )}
          </div>
        );

      case "pix-payment":
        if (msg.uploaded) return null;
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
            {uploadingPix ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                Enviando comprovante...
              </div>
            ) : (
              <button
                onClick={() => {
                  pendingPixMsgId.current = msg.id;
                  pixFileInputRef.current?.click();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-zinc-700 hover:border-emerald-500 text-zinc-400 hover:text-emerald-300 text-sm transition-all"
              >
                <Camera className="w-4 h-4" />
                Enviar comprovante Pix
              </button>
            )}
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
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-white text-sm">Colombia</p>
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
