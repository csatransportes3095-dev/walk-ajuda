import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, ChevronRight, Zap, RefreshCw } from "lucide-react";

// â”€â”€ MÃ¡scaras e validaÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function maskCpf(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validateCpf(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(c[10]);
}

function validateEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// â”€â”€ Componente de campo dinÃ¢mico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Question {
  id: number;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder?: string | null;
  options?: { value: string; label: string }[] | null;
  required: boolean;
  parentQuestionId?: number | null;
  triggerOption?: string | null;
}

interface FieldProps {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

function DynamicField({ q, value, onChange, error }: FieldProps) {
  const base = "w-full px-4 py-3 rounded-xl bg-white/5 border text-white placeholder:text-gray-500 focus:outline-none text-sm transition-colors";
  const borderClass = error ? "border-red-500/60 focus:border-red-500" : "border-white/10 focus:border-purple-500/60";

  if (q.fieldType === "radio" && q.options?.length) {
    const cols = q.options.length <= 2 ? "grid-cols-2" : "grid-cols-2";
    return (
      <div className={`grid ${cols} gap-3`}>
        {q.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${
              value === opt.value
                ? "bg-purple-600/30 border-purple-500/60 text-purple-200 shadow-lg shadow-purple-500/20"
                : "bg-white/5 border-white/10 text-gray-400 hover:border-purple-500/30 hover:text-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (q.fieldType === "select" && q.options?.length) {
    return (
      <div className="flex flex-col gap-2">
        {q.placeholder && !value && (
          <p className="text-xs text-gray-500 mb-1">{q.placeholder}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex-1 min-w-[120px] py-3 px-4 rounded-xl text-sm font-medium border transition-all duration-150 active:scale-[0.97] ${
                value === opt.value
                  ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20"
                  : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (q.fieldType === "textarea") {
    return (
      <textarea
        rows={3}
        placeholder={q.placeholder || ""}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} ${borderClass} resize-none`}
      />
    );
  }

  if (q.fieldType === "cpf") {
    return (
      <input
        type="text"
        inputMode="numeric"
        placeholder={q.placeholder || "000.000.000-00"}
        value={value}
        onChange={(e) => onChange(maskCpf(e.target.value))}
        maxLength={14}
        className={`${base} ${borderClass}`}
      />
    );
  }

  if (q.fieldType === "phone") {
    return (
      <input
        type="tel"
        inputMode="numeric"
        placeholder={q.placeholder || "(00) 00000-0000"}
        value={value}
        onChange={(e) => onChange(maskPhone(e.target.value))}
        maxLength={15}
        className={`${base} ${borderClass}`}
      />
    );
  }

  if (q.fieldType === "number") {
    return (
      <input
        type="number"
        inputMode="numeric"
        min="0"
        placeholder={q.placeholder || "0"}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className={`${base} ${borderClass}`}
      />
    );
  }

  if (q.fieldType === "email") {
    return (
      <input
        type="email"
        inputMode="email"
        placeholder={q.placeholder || "seu@email.com"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} ${borderClass}`}
      />
    );
  }

  // Tipo informativo: bloco de texto somente leitura (aviso/instruÃ§Ã£o)
  if (q.fieldType === "informativo" || q.fieldType === "aviso") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-transparent shadow-lg shadow-cyan-500/5">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-400 to-purple-500" />
        <div className="px-5 py-4 pl-6">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-cyan-300 uppercase tracking-wider mb-1.5">{q.label}</p>
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{q.placeholder || q.label}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // text (default)
  return (
    <input
      type="text"
      placeholder={q.placeholder || ""}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} ${borderClass}`}
    />
  );
}

// â”€â”€ PÃ¡gina principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function PreCadastro() {
  const { data: questions, isLoading, error: loadError } = trpc.preCadastroQuestions.listActive.useQuery();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [duplicateRedirect, setDuplicateRedirect] = useState<string | null>(null);

  // Verificar duplicado quando CPF ou telefone estiver completo
  const cpfClean = (values.cpf ?? "").replace(/\D/g, "");
  const phoneClean = (values.phone ?? "").replace(/\D/g, "");
  const { data: dupCheck } = trpc.preRegistrations.checkDuplicate.useQuery(
    { cpf: cpfClean.length === 11 ? cpfClean : undefined, phone: phoneClean.length >= 10 ? phoneClean : undefined },
    { enabled: cpfClean.length === 11 || phoneClean.length >= 10, staleTime: 5000 }
  );

  useEffect(() => {
    if (dupCheck?.exists) {
      const params = new URLSearchParams();
      if (cpfClean.length === 11) params.set("cpf", cpfClean);
      else if (phoneClean.length >= 10) params.set("phone", phoneClean);
      // Redirecionar automaticamente para a pÃ¡gina de status
      window.location.href = `/consultar-cadastro?${params.toString()}`;
    } else {
      setDuplicateRedirect(null);
    }
  }, [dupCheck?.exists, cpfClean, phoneClean]);

  const submitMutation = trpc.preRegistrations.submitDynamic.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err) => {
      toast.error(err.message);
      setErrors({ _global: err.message });
    },
  });

  const setValue = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors((prev) => { const e = { ...prev }; delete e[key]; return e; });
  };

  // â”€â”€ Visibilidade condicional â”€â”€
  // Uma pergunta Ã© visÃ­vel se:
  //   1. NÃ£o tem pergunta pai (parentQuestionId === null) â†’ sempre visÃ­vel
  //   2. Tem pergunta pai E a pergunta pai estÃ¡ visÃ­vel E o valor selecionado na pai === triggerOption
  function isQuestionVisible(q: Question, allQuestions: Question[]): boolean {
    if (!q.parentQuestionId) return true;
    const parent = allQuestions.find(p => p.id === q.parentQuestionId);
    if (!parent) return false;
    // A pergunta pai tambÃ©m precisa estar visÃ­vel (suporte a 2 nÃ­veis)
    if (!isQuestionVisible(parent, allQuestions)) return false;
    // O valor selecionado Ã© opt.value, mas triggerOption pode ser opt.label
    // Comparar contra ambos (value e label) da opÃ§Ã£o selecionada na pai
    const selectedValue = (values[parent.fieldKey] ?? "").trim().toLowerCase();
    const trigger = (q.triggerOption ?? "").trim().toLowerCase();
    if (!trigger) return false;
    // ComparaÃ§Ã£o direta
    if (selectedValue === trigger) return true;
    // Comparar: se o valor selecionado Ã© opt.value, verificar se o label da opÃ§Ã£o selecionada === trigger
    if (parent.options?.length) {
      const selectedOpt = parent.options.find(o => o.value.toLowerCase() === selectedValue);
      if (selectedOpt && selectedOpt.label.trim().toLowerCase() === trigger) return true;
      // TambÃ©m verificar se trigger Ã© o value e o selecionado Ã© o label
      const triggerOpt = parent.options.find(o => o.label.trim().toLowerCase() === trigger || o.value.toLowerCase() === trigger);
      if (triggerOpt && (selectedValue === triggerOpt.value.toLowerCase() || selectedValue === triggerOpt.label.trim().toLowerCase())) return true;
    }
    return false;
  }

  function validate(): boolean {
    if (!questions) return false;
    const errs: Record<string, string> = {};
    for (const q of questions) {
      // Ignorar perguntas que nÃ£o estÃ£o visÃ­veis
      if (!isQuestionVisible(q, questions)) continue;
      // Ignorar campos informativos (nÃ£o sÃ£o preenchÃ­veis)
      if (q.fieldType === "informativo" || q.fieldType === "aviso") continue;
      const val = (values[q.fieldKey] ?? "").trim();
      if (q.required && !val) {
        errs[q.fieldKey] = "Campo obrigatÃ³rio";
        continue;
      }
      if (!val) continue;
      if (q.fieldType === "cpf") {
        if (val.replace(/\D/g, "").length !== 11) { errs[q.fieldKey] = "CPF incompleto"; continue; }
        if (!validateCpf(val)) { errs[q.fieldKey] = "CPF invÃ¡lido"; continue; }
      }
      if (q.fieldType === "email" && !validateEmail(val)) {
        errs[q.fieldKey] = "E-mail invÃ¡lido"; continue;
      }
      if (q.fieldType === "number" && (isNaN(parseInt(val)) || parseInt(val) < 0)) {
        errs[q.fieldKey] = "Informe um nÃºmero vÃ¡lido"; continue;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!questions) return;

    // Montar array de respostas dinÃ¢micas com todas as perguntas visÃ­veis (exceto informativos)
    const answers = questions
      .filter(q => isQuestionVisible(q, questions) && q.fieldType !== "informativo" && q.fieldType !== "aviso")
      .map(q => ({
        questionId: q.id,
        fieldKey: q.fieldKey,
        answer: (values[q.fieldKey] ?? "").trim(),
      }));

    submitMutation.mutate({
      answers,
      userAgent: navigator.userAgent,
    });
  }

  // â”€â”€ Tela de sucesso â”€â”€
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#0d1a2e] to-[#0a0a1a] p-4">
        <div className="w-full max-w-md bg-black/60 border border-emerald-500/30 rounded-2xl p-10 flex flex-col items-center gap-6 text-center shadow-2xl shadow-emerald-500/10">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">PrÃ©-cadastro enviado!</h2>
            <p className="text-emerald-300 text-base leading-relaxed">Em breve nossa equipe entrarÃ¡ em contato.</p>
          </div>
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-4 py-1.5 rounded-full text-sm font-medium">
            âœ“ Recebido com sucesso
          </span>
          <div className="mt-2 p-4 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400 leading-relaxed">
            Quer saber quando seu cadastro foi analisado?{" "}
            <a href="/consultar-cadastro" className="text-purple-400 hover:text-purple-300 underline underline-offset-2 font-medium transition-colors">
              Consulte o status pelo CPF
            </a>
          </div>
        </div>
      </div>
    );
  }

  // â”€â”€ Loading â”€â”€
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#0d1a2e] to-[#0a0a1a]">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
          <p className="text-sm">Carregando formulÃ¡rio...</p>
        </div>
      </div>
    );
  }

  // â”€â”€ Erro ao carregar â”€â”€
  if (loadError || !questions) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#0d1a2e] to-[#0a0a1a] p-4">
        <div className="text-center text-red-400">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm">Erro ao carregar o formulÃ¡rio. Tente novamente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0d1a2e] to-[#0a0a1a] py-8 px-4">
      {/* Header */}
      <div className="max-w-lg mx-auto mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black text-white tracking-wide">H2 COLOMBIANO</h1>
            <p className="text-purple-400 text-xs font-medium">Atendimento para motoristas</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-3">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          <span className="text-purple-300 text-sm font-medium">PrÃ©-Cadastro do Cliente</span>
        </div>
        <p className="text-gray-400 text-sm leading-relaxed">
          Antes de iniciar o procedimento, preencha todas as informaÃ§Ãµes abaixo.<br />
          <span className="text-purple-400 font-medium">
            {questions.some(q => q.required) ? "Campos obrigatÃ³rios marcados com *" : "Preencha os campos abaixo."}
          </span>
        </p>
      </div>

      {/* ===== BOTÃƒO CONSULTAR PRÃ‰-CADASTRO ===== */}
      <div className="max-w-lg mx-auto mb-4">
        <a
          href="/consultar-cadastro"
          className="relative flex items-center gap-4 w-full px-5 py-4 rounded-2xl overflow-hidden group transition-all duration-200 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(109,40,217,0.35) 100%)',
            border: '1.5px solid rgba(139,92,246,0.5)',
            boxShadow: '0 0 24px rgba(139,92,246,0.2)'
          }}
        >
          <span className="absolute inset-0 rounded-2xl animate-pulse" style={{ background: 'rgba(139,92,246,0.08)' }} />
          <span className="relative flex-shrink-0">
            <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(139,92,246,0.4)' }} />
            <span className="relative flex items-center justify-center w-12 h-12 rounded-full" style={{ background: 'rgba(139,92,246,0.3)', border: '1.5px solid rgba(139,92,246,0.6)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </span>
          </span>
          <div className="relative flex-1 min-w-0">
            <p className="text-white font-black text-base leading-tight">JÃ¡ se cadastrou?</p>
            <p className="text-purple-300 text-sm font-medium mt-0.5">Consulte o status do seu prÃ©-cadastro</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="relative flex-shrink-0 group-hover:translate-x-1 transition-transform">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </a>
      </div>

      {/* Banner de duplicado detectado */}
      {duplicateRedirect && (
        <div className="max-w-lg mx-auto mb-4">
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 shadow-lg">
            <div className="absolute inset-0 bg-amber-500/5 animate-pulse rounded-2xl" />
            <div className="relative flex items-start gap-3">
              <span className="flex-shrink-0 text-2xl">âš ï¸</span>
              <div className="flex-1">
                <p className="text-amber-300 font-bold text-sm">Cadastro jÃ¡ encontrado!</p>
                <p className="text-amber-200/80 text-xs mt-0.5 leading-relaxed">
                  Este CPF ou WhatsApp jÃ¡ foi cadastrado anteriormente.
                </p>
                <a
                  href={duplicateRedirect}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                >
                  Ver status do meu cadastro â†’
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FormulÃ¡rio dinÃ¢mico */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-4">
        {questions.filter(q => !q.parentQuestionId && isQuestionVisible(q, questions)).map((q) => {
          // Buscar sub-perguntas (filhas diretas) desta pergunta
          const subQuestions = questions.filter(sq => sq.parentQuestionId === q.id && isQuestionVisible(sq, questions));
          return (
            <div key={q.id} className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-5 shadow-lg">
              <label className="block text-gray-300 text-sm font-medium mb-3">
                {q.label}
                {q.required && <span className="text-purple-400 ml-1">*</span>}
              </label>
              <DynamicField
                q={q}
                value={values[q.fieldKey] ?? ""}
                onChange={(v) => setValue(q.fieldKey, v)}
                error={errors[q.fieldKey]}
              />
              {errors[q.fieldKey] && (
                <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" /> {errors[q.fieldKey]}
                </p>
              )}
              {/* Sub-perguntas aparecem dentro do mesmo bloco */}
              {subQuestions.map((sq) => {
                const subSubQuestions = questions.filter(ssq => ssq.parentQuestionId === sq.id && isQuestionVisible(ssq, questions));
                return (
                  <div key={sq.id} className="mt-4 pt-4 border-t border-white/10">
                    {(sq.fieldType !== "informativo" && sq.fieldType !== "aviso") && (
                      <label className="block text-gray-300 text-sm font-medium mb-3">
                        {sq.label}
                        {sq.required && <span className="text-purple-400 ml-1">*</span>}
                      </label>
                    )}
                    <DynamicField
                      q={sq}
                      value={values[sq.fieldKey] ?? ""}
                      onChange={(v) => setValue(sq.fieldKey, v)}
                      error={errors[sq.fieldKey]}
                    />
                    {errors[sq.fieldKey] && (
                      <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" /> {errors[sq.fieldKey]}
                      </p>
                    )}
                    {/* Sub-sub-perguntas (3o nÃ­vel) */}
                    {subSubQuestions.map((ssq) => (
                      <div key={ssq.id} className="mt-3 pt-3 border-t border-white/5 ml-3">
                        <label className="block text-gray-300 text-sm font-medium mb-3">
                          {ssq.label}
                          {ssq.required && <span className="text-purple-400 ml-1">*</span>}
                        </label>
                        <DynamicField
                          q={ssq}
                          value={values[ssq.fieldKey] ?? ""}
                          onChange={(v) => setValue(ssq.fieldKey, v)}
                          error={errors[ssq.fieldKey]}
                        />
                        {errors[ssq.fieldKey] && (
                          <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" /> {errors[ssq.fieldKey]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}

        {errors._global && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errors._global}
          </div>
        )}

        <button
          type="submit"
          disabled={submitMutation.isPending}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white shadow-xl shadow-purple-500/30 rounded-2xl border-0 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitMutation.isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              Enviar PrÃ©-Cadastro
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>

        <p className="text-center text-gray-600 text-xs pb-6">
          Seus dados estÃ£o protegidos e serÃ£o usados apenas para contato.
        </p>
      </form>

    </div>
  );
}
