import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { isValidCPF, normalizeCpf } from "@shared/cpf";
import { Link } from "wouter";
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Search, Zap, ArrowLeft
} from "lucide-react";

function maskCpf(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const STATUS_CONFIG = {
  pendente: {
    icon: Clock,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    label: "Em Análise",
    title: "Seu cadastro está em análise",
    message: "Nossa equipe está revisando suas informações. Em breve entraremos em contato pelo WhatsApp informado.",
  },
  aprovado: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    label: "Aprovado",
    title: "Parabéns! Seu cadastro foi aprovado",
    message: "Sua solicitação foi aprovada pela nossa equipe. Aguarde o contato pelo WhatsApp ou entre em contato conosco.",
  },
  reprovado: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    badge: "bg-red-500/20 text-red-300 border-red-500/30",
    label: "Não Aprovado",
    title: "Cadastro não aprovado",
    message: "Infelizmente seu cadastro não foi aprovado desta vez. Entre em contato conosco pelo WhatsApp para mais informações.",
  },
};

function maskPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function ConsultarCadastro() {
  const [input, setInput] = useState("");
  const [searchType, setSearchType] = useState<"cpf" | "phone">("cpf");
  const [searchedCpf, setSearchedCpf] = useState("");
  const [searchedPhone, setSearchedPhone] = useState("");
  const [enabled, setEnabled] = useState(false);

  // Prefill via query params (redirect do formulário)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cpfParam = params.get("cpf");
    const phoneParam = params.get("phone");
    if (cpfParam && isValidCPF(cpfParam)) {
      const formatted = normalizeCpf(cpfParam).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      setSearchType("cpf");
      setInput(formatted);
      setSearchedCpf(cpfParam);
      setEnabled(true);
    } else if (phoneParam && phoneParam.replace(/\D/g, "").length >= 10) {
      const formatted = maskPhone(phoneParam);
      setSearchType("phone");
      setInput(formatted);
      setSearchedPhone(phoneParam);
      setEnabled(true);
    }
  }, []);

  const cleanInput = input.replace(/\D/g, "");
  const isCpfMode = searchType === "cpf";
  const cpfInvalid = isCpfMode && cleanInput.length === 11 && !isValidCPF(cleanInput);
  const isReady = isCpfMode ? isValidCPF(cleanInput) : cleanInput.length >= 10;

  const { data, isLoading, error } = trpc.preRegistrations.checkStatus.useQuery(
    { cpf: searchedCpf || undefined, phone: searchedPhone || undefined },
    { enabled: enabled && (!!searchedCpf || !!searchedPhone), retry: false }
  );

  function handleInputChange(val: string) {
    if (isCpfMode) {
      setInput(maskCpf(val));
    } else {
      setInput(maskPhone(val));
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady) return;
    if (isCpfMode && !isValidCPF(cleanInput)) return;
    if (isCpfMode) {
      setSearchedCpf(cleanInput);
      setSearchedPhone("");
    } else {
      setSearchedPhone(cleanInput);
      setSearchedCpf("");
    }
    setEnabled(true);
  }

  // Compatibilidade com código antigo
  const cpf = input;
  const setCpf = (v: string) => handleInputChange(v);

  const cfg = data ? STATUS_CONFIG[data.status as keyof typeof STATUS_CONFIG] : null;
  const Icon = cfg?.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0d1a2e] to-[#0a0a1a] py-8 px-4">
      {/* Header */}
      <div className="max-w-md mx-auto mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-white tracking-wide">WALK AJUDA</h1>
              <p className="text-purple-400 text-xs font-medium">Atendimento para motoristas</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-3">
            <Search className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-purple-300 text-sm font-medium">Consultar Status do Cadastro</span>
          </div>
          <p className="text-gray-400 text-sm">
            Digite seu CPF ou WhatsApp para verificar o status do seu pré-cadastro.
          </p>
        </div>
      </div>

      {/* Formulário de busca */}
      <div className="max-w-md mx-auto">
        <form onSubmit={handleSearch} className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-lg mb-6">
          {/* Toggle CPF / WhatsApp */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => { setSearchType("cpf"); setInput(""); setEnabled(false); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                isCpfMode
                  ? "bg-purple-600/30 border border-purple-500/60 text-purple-200"
                  : "bg-white/5 border border-white/10 text-gray-400 hover:border-purple-500/30"
              }`}
            >
              CPF
            </button>
            <button
              type="button"
              onClick={() => { setSearchType("phone"); setInput(""); setEnabled(false); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                !isCpfMode
                  ? "bg-purple-600/30 border border-purple-500/60 text-purple-200"
                  : "bg-white/5 border border-white/10 text-gray-400 hover:border-purple-500/30"
              }`}
            >
              WhatsApp
            </button>
          </div>
          <label className="block text-gray-300 text-sm font-medium mb-3">
            {isCpfMode ? "CPF cadastrado" : "WhatsApp (com DDD)"}
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder={isCpfMode ? "000.000.000-00" : "(00) 00000-0000"}
              value={input}
              onChange={(e) => { handleInputChange(e.target.value); setEnabled(false); }}
              maxLength={isCpfMode ? 14 : 15}
              className={`flex-1 px-4 py-3 rounded-xl bg-white/5 border text-white placeholder:text-gray-500 focus:outline-none text-sm transition-colors ${cpfInvalid ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-purple-500/60'}`}
            />
            {cpfInvalid && <p className="absolute mt-14 text-xs font-medium text-red-400">CPF inválido. Digite um CPF válido para continuar.</p>}
            <button
              type="submit"
              disabled={!isReady || isLoading}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-semibold text-sm transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Consultar
            </button>
          </div>
        </form>

        {/* Resultado */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-semibold mb-1">Cadastro não encontrado</p>
            <p className="text-gray-400 text-sm">
              Nenhum pré-cadastro foi encontrado com este CPF. Verifique o CPF informado ou realize o pré-cadastro.
            </p>
            <Link
              href="/pre-cadastro"
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-600/30 transition-colors"
            >
              Fazer Pré-Cadastro
            </Link>
          </div>
        )}

        {data && cfg && Icon && (
          <div className={`${cfg.bg} border ${cfg.border} rounded-2xl p-6 text-center shadow-lg`}>
            {/* Ícone de status */}
            <div className={`w-20 h-20 rounded-full ${cfg.bg} border ${cfg.border} flex items-center justify-center mx-auto mb-4`}>
              <Icon className={`w-10 h-10 ${cfg.color}`} />
            </div>

            {/* Badge de status */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cfg.badge} mb-4`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.color.replace("text-", "bg-")}`} />
              {cfg.label}
            </span>

            {/* Nome */}
            <p className="text-gray-400 text-sm mb-1">Olá,</p>
            <h2 className="text-xl font-bold text-white mb-3">{data.fullName}</h2>

            {/* Mensagem */}
            <p className={`${cfg.color} text-sm leading-relaxed mb-5`}>
              {cfg.title}
            </p>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              {cfg.message}
            </p>

            {/* Botão WhatsApp para aprovados */}
            {data.status === "aprovado" && (
              <a
                href={`https://wa.me/5511978307371?text=${encodeURIComponent('Olá! Meu cadastro foi aprovado e gostaria de dar continuidade ao processo.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500 hover:bg-green-400 text-white font-semibold text-sm transition-all duration-200 hover:scale-105 shadow-lg shadow-green-500/30"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                Falar no WhatsApp
              </a>
            )}

            {/* Motivo da Reprovação */}
            {data.status === "reprovado" && data.rejectionReason && (
              <div className="mb-5 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-red-400 text-xs font-semibold uppercase tracking-wider">Motivo da Reprovação</span>
                </div>
                <p className="text-gray-200 text-sm leading-relaxed">{data.rejectionReason}</p>
              </div>
            )}

            {/* Botão para reprovados */}
            {data.status === "reprovado" && (
              <a
                href={`https://wa.me/5511978307371?text=${encodeURIComponent('Olá! Meu cadastro não foi aprovado e gostaria de entender o motivo.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-gray-300 font-semibold text-sm transition-all duration-200"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                Entrar em Contato
              </a>
            )}
          </div>
        )}

        {/* Link para pré-cadastro */}
        {!data && !error && (
          <div className="text-center mt-4">
            <p className="text-gray-600 text-sm">
              Ainda não fez o pré-cadastro?{" "}
              <Link href="/pre-cadastro" className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors">
                Clique aqui
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
