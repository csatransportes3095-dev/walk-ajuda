/**
 * ColombiaBot — Assistente de pedido passo a passo
 * Aparece para clientes logados (cp_token) no step 'home'
 * Conduz: serviço → produto/opção → perguntas → fotos → entrega ao fluxo normal
 */
import { useState, useRef, useEffect } from "react";
import { Bot, X, ChevronRight, Camera, Upload, CheckCircle, ArrowLeft } from "lucide-react";

type Product = {
  id: number; name: string; description?: string; iconUrl?: string;
  options: ProductOption[];
};
type ProductOption = {
  id: number; name: string; price?: string; type?: string; isPdfOnly?: number;
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

type BotStep =
  | "welcome"
  | "select-service"
  | "select-option"
  | "questions"
  | "documents"
  | "done";

interface Props {
  products: Product[];
  onStartNormal: () => void; // cliente escolheu "fazer sozinho"
  onSelectProduct: (product: Product) => void;
  onSelectOption: (product: Product, option: ProductOption) => void;
}

export function ColombiaBot({ products, onStartNormal, onSelectProduct, onSelectOption }: Props) {
  const [botStep, setBotStep] = useState<BotStep>("welcome");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOption, setSelectedOption] = useState<ProductOption | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [docFiles, setDocFiles] = useState<Record<number, { file: File; preview: string; url?: string }>>({});
  const [uploadingDoc, setUploadingDoc] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocId, setPendingDocId] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [botStep, currentQIdx]);

  // Perguntas visíveis (respeitando parentQuestionId e triggerOption)
  const getVisibleQuestions = (questions: ProductQuestion[]): ProductQuestion[] => {
    return questions
      .filter(q => {
        if (!q.parentQuestionId) return true;
        const parentAnswer = questionAnswers[q.parentQuestionId]?.trim() || "";
        if (!q.triggerOption) return !!parentAnswer;
        return parentAnswer === q.triggerOption;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const visibleQuestions = selectedOption
    ? getVisibleQuestions(selectedOption.questions)
    : [];

  const currentQuestion = visibleQuestions[currentQIdx] || null;

  const handleAnswerQuestion = (answer: string) => {
    if (!currentQuestion) return;
    setQuestionAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));
    // Avançar para próxima pergunta ou documentos
    const next = currentQIdx + 1;
    if (next < visibleQuestions.length) {
      setCurrentQIdx(next);
    } else {
      // Verificar se há documentos
      const docs = selectedOption?.documents || [];
      if (docs.length > 0) {
        setBotStep("documents");
      } else {
        setBotStep("done");
      }
    }
  };

  const handleDocUpload = async (docId: number, file: File) => {
    setUploadingDoc(docId);
    const preview = URL.createObjectURL(file);
    setDocFiles(prev => ({ ...prev, [docId]: { file, preview } }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/client-file", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setDocFiles(prev => ({ ...prev, [docId]: { file, preview, url: data.url } }));
      }
    } catch {
      // silencioso — url fica undefined, será enviado via base64 no submit
    } finally {
      setUploadingDoc(null);
    }
  };

  const allDocsUploaded = () => {
    const docs = selectedOption?.documents || [];
    const required = docs.filter(d => d.isRequired === 1);
    return required.every(d => docFiles[d.id]);
  };

  const handleFinish = () => {
    if (!selectedProduct || !selectedOption) return;
    // Salvar respostas e documentos para o fluxo normal usar
    // Armazenar no localStorage para o Home.tsx pegar
    const answersObj: Record<string, string> = {};
    visibleQuestions.forEach(q => {
      if (questionAnswers[q.id]) answersObj[q.question] = questionAnswers[q.id];
    });
    localStorage.setItem("colombia_bot_answers", JSON.stringify(answersObj));

    const docsObj: Record<string, string> = {};
    (selectedOption.documents || []).forEach(d => {
      if (docFiles[d.id]?.url) docsObj[d.label] = docFiles[d.id].url!;
    });
    localStorage.setItem("colombia_bot_docs", JSON.stringify(docsObj));

    // Disparar o fluxo normal com produto e opção já selecionados
    onSelectOption(selectedProduct, selectedOption);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────

  const botAvatar = (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shrink-0 shadow-lg">
      <Bot className="w-5 h-5 text-white" />
    </div>
  );

  const BotMessage = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-start gap-2 mb-3">
      {botAvatar}
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm text-zinc-100 leading-relaxed">
        {children}
      </div>
    </div>
  );

  const OptionButton = ({ label, onClick, icon }: { label: string; onClick: () => void; icon?: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-violet-500 hover:bg-violet-500/10 text-sm font-medium text-zinc-200 transition-all active:scale-95"
    >
      <span className="flex items-center gap-2">{icon}{label}</span>
      <ChevronRight className="w-4 h-4 text-zinc-500" />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
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

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">

        {/* WELCOME */}
        {botStep === "welcome" && (
          <>
            <BotMessage>
              Olá! Sou o <strong>Colombia</strong>, seu assistente de pedidos. 👋
              <br /><br />
              Posso te ajudar a fazer seu pedido passo a passo de forma simples e rápida.
            </BotMessage>
            <BotMessage>
              Como prefere continuar?
            </BotMessage>
            <div className="ml-11 space-y-2 mt-2">
              <button
                onClick={() => setBotStep("select-service")}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-violet-500 bg-violet-500/15 hover:bg-violet-500/25 text-sm font-bold text-violet-300 transition-all active:scale-95"
              >
                <span>🤖 Quero ajuda do Colombia</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={onStartNormal}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-zinc-500 text-sm font-medium text-zinc-400 transition-all active:scale-95"
              >
                <span>Continuar sozinho</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* SELECT SERVICE */}
        {botStep === "select-service" && (
          <>
            <BotMessage>
              Ótimo! Qual serviço você precisa?
            </BotMessage>
            <div className="ml-11 space-y-2 mt-2">
              {products.map(p => (
                <OptionButton
                  key={p.id}
                  label={p.name}
                  icon={p.iconUrl ? <img src={p.iconUrl} className="w-6 h-6 object-contain" /> : undefined}
                  onClick={() => {
                    setSelectedProduct(p);
                    if (p.options.length === 1) {
                      setSelectedOption(p.options[0]);
                      if (p.options[0].questions.length > 0) {
                        setBotStep("questions");
                        setCurrentQIdx(0);
                      } else if (p.options[0].documents.length > 0) {
                        setBotStep("documents");
                      } else {
                        setBotStep("done");
                      }
                    } else if (p.options.length === 0) {
                      setBotStep("done");
                    } else {
                      setBotStep("select-option");
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* SELECT OPTION */}
        {botStep === "select-option" && selectedProduct && (
          <>
            <BotMessage>
              Qual opção de <strong>{selectedProduct.name}</strong> você quer?
            </BotMessage>
            <div className="ml-11 space-y-2 mt-2">
              {selectedProduct.options.map(opt => (
                <OptionButton
                  key={opt.id}
                  label={`${opt.name}${opt.price ? ` — R$ ${opt.price}` : ""}`}
                  onClick={() => {
                    setSelectedOption(opt);
                    setCurrentQIdx(0);
                    if (opt.questions.length > 0) {
                      setBotStep("questions");
                    } else if (opt.documents.length > 0) {
                      setBotStep("documents");
                    } else {
                      setBotStep("done");
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* QUESTIONS */}
        {botStep === "questions" && currentQuestion && (
          <>
            <BotMessage>
              {currentQuestion.question}
              {currentQuestion.isRequired === 0 && (
                <span className="text-xs text-zinc-500 ml-1">(opcional)</span>
              )}
            </BotMessage>
            <div className="ml-11 space-y-2 mt-2">
              {currentQuestion.fieldType === "select" && currentQuestion.options ? (
                currentQuestion.options.split(",").map(opt => opt.trim()).filter(Boolean).map(opt => (
                  <OptionButton key={opt} label={opt} onClick={() => handleAnswerQuestion(opt)} />
                ))
              ) : currentQuestion.fieldType === "textarea" || currentQuestion.fieldType === "text" ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
                    rows={currentQuestion.fieldType === "textarea" ? 3 : 1}
                    placeholder="Digite sua resposta..."
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const val = (e.target as HTMLTextAreaElement).value.trim();
                        if (val || currentQuestion.isRequired === 0) handleAnswerQuestion(val);
                      }
                    }}
                    id={`q-${currentQuestion.id}`}
                  />
                  <button
                    onClick={() => {
                      const el = document.getElementById(`q-${currentQuestion.id}`) as HTMLTextAreaElement;
                      const val = el?.value.trim() || "";
                      if (val || currentQuestion.isRequired === 0) handleAnswerQuestion(val);
                    }}
                    className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                  >
                    Confirmar
                  </button>
                  {currentQuestion.isRequired === 0 && (
                    <button
                      onClick={() => handleAnswerQuestion("")}
                      className="w-full py-2 rounded-xl border border-zinc-700 text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
                    >
                      Pular esta pergunta
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}

        {/* DOCUMENTS */}
        {botStep === "documents" && selectedOption && (
          <>
            <BotMessage>
              Agora preciso de alguns documentos. Vou pedir um por vez. 📎
            </BotMessage>
            {selectedOption.documents.map((doc, idx) => (
              <div key={doc.id} className="ml-11 mb-3">
                <BotMessage>
                  {idx + 1}. <strong>{doc.label}</strong>
                  {doc.isRequired === 0 && <span className="text-xs text-zinc-500 ml-1">(opcional)</span>}
                </BotMessage>
                <div className="mt-2">
                  {docFiles[doc.id] ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs text-emerald-300 truncate">{docFiles[doc.id].file.name}</span>
                      {uploadingDoc === doc.id && <span className="text-xs text-zinc-500 ml-auto">Enviando...</span>}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setPendingDocId(doc.id); fileInputRef.current?.click(); }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-zinc-700 hover:border-violet-500 text-zinc-400 hover:text-violet-300 text-sm transition-all"
                    >
                      <Camera className="w-4 h-4" />
                      Tirar foto ou selecionar arquivo
                    </button>
                  )}
                </div>
              </div>
            ))}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file && pendingDocId !== null) {
                  handleDocUpload(pendingDocId, file);
                }
                e.target.value = "";
              }}
            />
            {allDocsUploaded() && (
              <div className="ml-11 mt-2">
                <button
                  onClick={() => setBotStep("done")}
                  className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors"
                >
                  Continuar →
                </button>
              </div>
            )}
          </>
        )}

        {/* DONE */}
        {botStep === "done" && (
          <>
            <BotMessage>
              Perfeito! Tenho tudo que preciso. ✅
              <br /><br />
              Vou te levar para a tela de finalização do pedido agora.
            </BotMessage>
            <div className="ml-11 mt-2">
              <button
                onClick={handleFinish}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-sm font-bold transition-all shadow-lg shadow-violet-500/20"
              >
                🚀 Finalizar pedido
              </button>
            </div>
          </>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Back button */}
      {botStep !== "welcome" && botStep !== "done" && (
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900">
          <button
            onClick={() => {
              if (botStep === "select-service") setBotStep("welcome");
              else if (botStep === "select-option") setBotStep("select-service");
              else if (botStep === "questions") {
                if (currentQIdx > 0) setCurrentQIdx(i => i - 1);
                else setBotStep("select-option");
              }
              else if (botStep === "documents") setBotStep("questions");
            }}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar
          </button>
        </div>
      )}
    </div>
  );
}
