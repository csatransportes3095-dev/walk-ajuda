/**
 * ColombiaBot — Assistente de pedido estilo chat com histórico acumulado
 * Cada pergunta e resposta ficam visíveis na tela (não apaga ao avançar)
 * Sub-perguntas aparecem após a resposta da pergunta pai
 */
import { useState, useRef, useEffect } from "react";
import { Bot, X, Camera, ChevronRight } from "lucide-react";

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
  id: number; label: string; isRequired: number; sortOrder: number;
};

// ── Mensagem do chat ─────────────────────────────────────────────────────────

type ChatMsg =
  | { type: "bot"; text: string }
  | { type: "user"; text: string }
  | { type: "options"; id: string; options: string[]; answered?: string }
  | { type: "input"; id: string; questionId: number; placeholder: string; multiline?: boolean; answered?: string }
  | { type: "doc-upload"; id: string; docId: number; label: string; required: boolean; uploaded?: boolean }
  | { type: "action"; id: string; label: string; done?: boolean };

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  products: Product[];
  onStartNormal: () => void;
  onSelectProduct: (product: Product) => void;
  onSelectOption: (product: Product, option: ProductOption) => void;
}

// ── Componente ───────────────────────────────────────────────────────────────

export function ColombiaBot({ products, onStartNormal, onSelectProduct, onSelectOption }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOption, setSelectedOption] = useState<ProductOption | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [docFiles, setDocFiles] = useState<Record<number, { file: File; url?: string }>>({});
  const [uploadingDoc, setUploadingDoc] = useState<number | null>(null);
  const [pendingDocId, setPendingDocId] = useState<number | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Referências mutáveis para uso em callbacks (evitar stale closure)
  const selectedProductRef = useRef<Product | null>(null);
  const selectedOptionRef = useRef<ProductOption | null>(null);
  const questionAnswersRef = useRef<Record<number, string>>({});
  const docFilesRef = useRef<Record<number, { file: File; url?: string }>>({});

  useEffect(() => { selectedProductRef.current = selectedProduct; }, [selectedProduct]);
  useEffect(() => { selectedOptionRef.current = selectedOption; }, [selectedOption]);
  useEffect(() => { questionAnswersRef.current = questionAnswers; }, [questionAnswers]);
  useEffect(() => { docFilesRef.current = docFiles; }, [docFiles]);

  // Inicializar
  useEffect(() => { startFlow(); }, []); // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const uid = () => Math.random().toString(36).slice(2);

  const push = (...msgs: ChatMsg[]) => setMessages(prev => [...prev, ...msgs]);

  const markAnswered = (id: string, val: string) => {
    setMessages(prev => prev.map(m => {
      if ((m.type === "options" || m.type === "input") && m.id === id) {
        return { ...m, answered: val } as ChatMsg;
      }
      return m;
    }));
  };

  const markDocUploaded = (id: string) => {
    setMessages(prev => prev.map(m => {
      if (m.type === "doc-upload" && m.id === id) return { ...m, uploaded: true };
      return m;
    }));
  };

  const markActionDone = (id: string) => {
    setMessages(prev => prev.map(m => {
      if (m.type === "action" && m.id === id) return { ...m, done: true };
      return m;
    }));
  };

  const getVisibleQuestions = (questions: ProductQuestion[], answers: Record<number, string>): ProductQuestion[] => {
    return questions
      .filter(q => {
        if (!q.parentQuestionId) return true;
        const parentAnswer = answers[q.parentQuestionId]?.trim() || "";
        if (!q.triggerOption) return !!parentAnswer;
        return parentAnswer === q.triggerOption;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  // ── Fluxo ─────────────────────────────────────────────────────────────────

  const startFlow = () => {
    const optId = uid();
    push(
      { type: "bot", text: "Olá! Sou o Colombia, seu assistente de pedidos. 👋\n\nComo prefere continuar?" },
      { type: "options", id: optId, options: ["🤖 Quero ajuda do Colombia", "Continuar sozinho"] }
    );
  };

  const handleOptionClick = (msgId: string, opt: string) => {
    markAnswered(msgId, opt);
    push({ type: "user", text: opt });

    if (opt === "Continuar sozinho") {
      setTimeout(() => onStartNormal(), 200);
      return;
    }

    // Detectar qual tipo de mensagem foi respondida
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    if (msg.type === "options") {
      // Boas-vindas → mostrar serviços
      if (msg.options[0] === "🤖 Quero ajuda do Colombia") {
        setTimeout(() => askService(), 300);
        return;
      }

      // Seleção de serviço
      const product = products.find(p => p.name === opt);
      if (product) {
        setSelectedProduct(product);
        selectedProductRef.current = product;
        setTimeout(() => {
          if (product.options.length === 0) {
            finishWithProduct(product, null);
          } else if (product.options.length === 1) {
            setSelectedOption(product.options[0]);
            selectedOptionRef.current = product.options[0];
            setTimeout(() => askQuestions(product, product.options[0], {}), 300);
          } else {
            askOption(product);
          }
        }, 300);
        return;
      }

      // Seleção de opção
      const prod = selectedProductRef.current;
      if (prod) {
        const option = prod.options.find(o => {
          const label = `${o.label || o.name}${o.price ? ` — R$ ${o.price}` : ""}`;
          return label === opt || o.name === opt || (o.label || o.name) === opt;
        });
        if (option) {
          setSelectedOption(option);
          selectedOptionRef.current = option;
          setTimeout(() => askQuestions(prod, option, {}), 300);
          return;
        }
      }

      // Resposta de pergunta select
      // Encontrar qual pergunta estava sendo respondida pelo contexto
      handleQuestionAnswer(msgId, opt);
    }
  };

  const askService = () => {
    const optId = uid();
    push(
      { type: "bot", text: "Qual serviço você precisa?" },
      { type: "options", id: optId, options: products.map(p => p.name) }
    );
  };

  const askOption = (product: Product) => {
    const optId = uid();
    push(
      { type: "bot", text: `Qual opção de ${product.name} você quer?` },
      {
        type: "options",
        id: optId,
        options: product.options.map(o => `${o.label || o.name}${o.price ? ` — R$ ${o.price}` : ""}`)
      }
    );
  };

  // Mapa de msgId → questionId para rastrear qual pergunta cada options/input representa
  const questionMsgMap = useRef<Record<string, number>>({});

  const askQuestions = (product: Product, option: ProductOption, currentAnswers: Record<number, string>) => {
    const visible = getVisibleQuestions(option.questions, currentAnswers);
    const nextQ = visible.find(q => currentAnswers[q.id] === undefined);

    if (!nextQ) {
      setTimeout(() => askDocuments(product, option, currentAnswers), 300);
      return;
    }

    const msgId = uid();
    questionMsgMap.current[msgId] = nextQ.id;

    if (nextQ.fieldType === "select" && nextQ.options) {
      const opts = nextQ.options.split(",").map(o => o.trim()).filter(Boolean);
      push(
        { type: "bot", text: nextQ.question },
        { type: "options", id: msgId, options: opts }
      );
    } else {
      push(
        { type: "bot", text: nextQ.question },
        { type: "input", id: msgId, questionId: nextQ.id, placeholder: "Digite sua resposta...", multiline: nextQ.fieldType === "textarea" }
      );
    }
  };

  const handleQuestionAnswer = (msgId: string, val: string) => {
    const qId = questionMsgMap.current[msgId];
    if (!qId) return;

    markAnswered(msgId, val);
    push({ type: "user", text: val || "(sem resposta)" });

    const newAnswers = { ...questionAnswersRef.current, [qId]: val };
    setQuestionAnswers(newAnswers);
    questionAnswersRef.current = newAnswers;

    const prod = selectedProductRef.current;
    const opt = selectedOptionRef.current;
    if (prod && opt) {
      setTimeout(() => askQuestions(prod, opt, newAnswers), 300);
    }
  };

  const handleInputSubmit = (msgId: string) => {
    const val = inputValues[msgId]?.trim() || "";
    handleQuestionAnswer(msgId, val);
    setInputValues(prev => { const n = { ...prev }; delete n[msgId]; return n; });
  };

  const askDocuments = (product: Product, option: ProductOption, _answers: Record<number, string>) => {
    const docs = option.documents || [];
    if (docs.length === 0) {
      finishWithProduct(product, option);
      return;
    }

    const docMsgs: ChatMsg[] = docs.map(doc => ({
      type: "doc-upload" as const,
      id: uid(),
      docId: doc.id,
      label: doc.label,
      required: doc.isRequired === 1
    }));

    push(
      { type: "bot", text: `Agora preciso de ${docs.length === 1 ? "um documento" : `${docs.length} documentos`}. Envie abaixo. 📎` },
      ...docMsgs
    );
  };

  const handleDocUpload = async (msgId: string, docId: number, file: File) => {
    setUploadingDoc(docId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/client-file", { method: "POST", body: formData });
      const data = await res.json();
      const newDocFiles = { ...docFilesRef.current, [docId]: { file, url: data.url } };
      setDocFiles(newDocFiles);
      docFilesRef.current = newDocFiles;
    } catch {
      const newDocFiles = { ...docFilesRef.current, [docId]: { file } };
      setDocFiles(newDocFiles);
      docFilesRef.current = newDocFiles;
    } finally {
      setUploadingDoc(null);
      markDocUploaded(msgId);
      push({ type: "user", text: `✅ Documento enviado` });

      // Verificar se todos os obrigatórios foram enviados
      const prod = selectedProductRef.current;
      const opt = selectedOptionRef.current;
      if (prod && opt) {
        const docs = opt.documents || [];
        const required = docs.filter(d => d.isRequired === 1);
        const current = docFilesRef.current;
        const allDone = required.every(d => current[d.id]);
        if (allDone) {
          setTimeout(() => finishWithProduct(prod, opt), 400);
        }
      }
    }
  };

  const finishWithProduct = (product: Product, option: ProductOption | null) => {
    const actionId = uid();
    push(
      { type: "bot", text: "Perfeito! Tenho tudo que preciso. ✅\n\nClique abaixo para finalizar seu pedido." },
      { type: "action", id: actionId, label: "🚀 Finalizar pedido" }
    );
  };

  const handleFinish = (actionId: string) => {
    markActionDone(actionId);

    const product = selectedProductRef.current;
    const option = selectedOptionRef.current;
    if (!product) return;

    // Salvar respostas e docs no localStorage
    const answersObj: Record<string, string> = {};
    if (option) {
      const visible = getVisibleQuestions(option.questions, questionAnswersRef.current);
      visible.forEach(q => {
        if (questionAnswersRef.current[q.id]) answersObj[q.question] = questionAnswersRef.current[q.id];
      });
    }
    localStorage.setItem("colombia_bot_answers", JSON.stringify(answersObj));

    const docsObj: Record<string, string> = {};
    if (option) {
      option.documents.forEach(d => {
        if (docFilesRef.current[d.id]?.url) docsObj[d.label] = docFilesRef.current[d.id].url!;
      });
    }
    localStorage.setItem("colombia_bot_docs", JSON.stringify(docsObj));

    if (option) {
      onSelectOption(product, option);
    } else {
      onSelectProduct(product);
    }
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
        if (msg.answered !== undefined) return null; // já respondida, resposta aparece como "user"
        return (
          <div key={idx} className="ml-10 space-y-2 mb-3">
            {msg.options.map(opt => (
              <button
                key={opt}
                onClick={() => handleOptionClick(msg.id, opt)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-violet-500 hover:bg-violet-500/10 text-sm font-medium text-zinc-200 transition-all active:scale-95 text-left"
              >
                <span>{opt}</span>
                <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
              </button>
            ))}
          </div>
        );

      case "input":
        if (msg.answered !== undefined) return null;
        return (
          <div key={idx} className="ml-10 space-y-2 mb-3">
            {msg.multiline ? (
              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
                rows={3}
                placeholder={msg.placeholder}
                value={inputValues[msg.id] || ""}
                onChange={e => setInputValues(prev => ({ ...prev, [msg.id]: e.target.value }))}
              />
            ) : (
              <input
                type="text"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                placeholder={msg.placeholder}
                value={inputValues[msg.id] || ""}
                onChange={e => setInputValues(prev => ({ ...prev, [msg.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleInputSubmit(msg.id); }}
              />
            )}
            <button
              onClick={() => handleInputSubmit(msg.id)}
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
            {uploadingDoc === msg.docId ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-400">
                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                Enviando...
              </div>
            ) : (
              <button
                onClick={() => { setPendingDocId(msg.docId); (fileInputRef.current as any)._pendingMsgId = msg.id; fileInputRef.current?.click(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-zinc-700 hover:border-violet-500 text-zinc-400 hover:text-violet-300 text-sm transition-all"
              >
                <Camera className="w-4 h-4" />
                {msg.label}{!msg.required ? " (opcional)" : ""}
              </button>
            )}
          </div>
        );

      case "action":
        if (msg.done) return null;
        return (
          <div key={idx} className="ml-10 mb-3">
            <button
              onClick={() => handleFinish(msg.id)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-sm font-bold transition-all shadow-lg shadow-violet-500/20"
            >
              {msg.label}
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

      {/* Input de arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          const msgId = (fileInputRef.current as any)?._pendingMsgId;
          if (file && pendingDocId !== null && msgId) {
            handleDocUpload(msgId, pendingDocId, file);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
