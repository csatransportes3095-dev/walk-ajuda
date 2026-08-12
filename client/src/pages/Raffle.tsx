import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { isValidCPF, normalizeCpf } from "@shared/cpf";
import { toast } from "sonner";
import { Gift, Lock, Trophy, Users, Ticket, CheckCircle2, Star, Phone, User, RefreshCw, Hash, LogOut } from "lucide-react";

const RAFFLE_SESSION_KEY = "walk_raffle_access";

export default function Raffle() {
  const [accessGranted, setAccessGranted] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [checking, setChecking] = useState(true);

  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastChosenNumber, setLastChosenNumber] = useState<number | null>(null);
  const [phoneChecked, setPhoneChecked] = useState(false); // true após digitar 11 dígitos

  const { data: config, isLoading: configLoading } = trpc.raffleAccess.config.useQuery();
  const { data: activeRaffle } = trpc.raffles.active.useQuery(undefined, { enabled: accessGranted });
  const { data: raffleResult } = trpc.raffles.result.useQuery(undefined, { enabled: accessGranted });
  const raffleId = useMemo(() => activeRaffle?.id ?? 0, [activeRaffle?.id]);
  const { data: raffleEntries, refetch: refetchEntries } = trpc.raffles.entries.useQuery(
    { raffleId },
    { enabled: accessGranted && !!activeRaffle, refetchInterval: 8000 }
  );
  const savedPhone = typeof window !== "undefined" ? localStorage.getItem("walk_client_phone") || "" : "";
  const { data: myEntry, refetch: refetchMyEntry } = trpc.raffles.myEntry.useQuery(
    { raffleId, phone: savedPhone },
    { enabled: accessGranted && !!activeRaffle && !!savedPhone }
  );
  const chooseNumberMutation = trpc.raffles.chooseNumber.useMutation();
  const verifyMutation = trpc.raffleAccess.verify.useMutation();
  const updateCpfMutation = trpc.customers.updateCpfByPhone.useMutation();

  // Estado para tela de atualização de CPF
  const [needsCpfUpdate, setNeedsCpfUpdate] = useState(false);
  const [cpfValue, setCpfValue] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [cpfLoading, setCpfLoading] = useState(false);
  const { data: customerData } = trpc.customers.checkByPhone.useQuery(
    { phone: savedPhone },
    { enabled: !!savedPhone }
  );
  // Verificar se o telefone digitado no formulário está cadastrado
  const phoneDigits = phone.replace(/\D/g, '');
  const { data: phoneCheckData, isFetching: phoneCheckLoading } = trpc.customers.checkByPhone.useQuery(
    { phone: phoneDigits },
    { enabled: phoneDigits.length === 11 }
  );
  const isPhoneRegistered = phoneDigits.length === 11 ? (phoneCheckData?.exists ?? null) : null;

  // Verificar acesso na sessão
  useEffect(() => {
    if (configLoading) return;
    const sessionType = localStorage.getItem("walk_access_type");
    const sessionGranted = localStorage.getItem("walk_access_granted");
    if (sessionGranted === "true" && sessionType === "raffle") {
      setAccessGranted(true);
      setChecking(false);
      return;
    }
    if (!config?.passwordRequired) {
      setAccessGranted(true);
      setChecking(false);
      return;
    }
    const session = sessionStorage.getItem(RAFFLE_SESSION_KEY);
    if (session === "ok") {
      setAccessGranted(true);
    }
    setChecking(false);
  }, [config, configLoading]);

  // Pré-preencher telefone e nome
  useEffect(() => {
    if (savedPhone) setPhone(savedPhone);
  }, [savedPhone]);
  useEffect(() => {
    if (customerData?.customer?.name) setName(customerData.customer.name);
  }, [customerData]);

  const handleVerify = async () => {
    if (!password.trim()) { setPasswordError("Digite a senha"); return; }
    setVerifying(true);
    setPasswordError("");
    try {
      const result = await verifyMutation.mutateAsync({ password: password.trim() });
      if (result.success) {
        sessionStorage.setItem(RAFFLE_SESSION_KEY, "ok");
        setAccessGranted(true);
      } else {
        setPasswordError("Senha incorreta. Tente novamente.");
      }
    } catch {
      setPasswordError("Erro ao verificar. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  };

  const maxAllowed = activeRaffle?.maxNumbersPerPerson ?? 1;
  const myChosenCount = myEntry?.count ?? 0;
  const myChosenNumbers = myEntry?.numbers ?? [];
  const canChooseMore = myChosenCount < maxAllowed;
  const remainingChoices = maxAllowed - myChosenCount;

  const handleChooseNumber = async () => {
    if (!activeRaffle || !selectedNumber) return;
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 11) { toast.error("Digite um telefone válido com DDD (11 dígitos)"); return; }
    // Verificar se o cliente tem CPF cadastrado
    if (phoneCheckData?.exists && !(phoneCheckData?.customer as any)?.cpf) {
      setNeedsCpfUpdate(true);
      return;
    }
    // Verificar se o telefone está cadastrado
    if (isPhoneRegistered === false) {
      toast.error("Este número não está cadastrado. O sorteio é exclusivo para clientes cadastrados.");
      return;
    }
    if (isPhoneRegistered === null || phoneCheckLoading) {
      toast.error("Aguarde a verificação do telefone...");
      return;
    }
    setSubmitting(true);
    try {
      const result = await chooseNumberMutation.mutateAsync({
        raffleId: activeRaffle.id,
        number: selectedNumber,
        customerName: name.trim(),
        customerPhone: phone.replace(/\D/g, ""),
      });
      if (result.success) {
        setLastChosenNumber(selectedNumber);
        setSelectedNumber(null);
        await refetchEntries();
        await refetchMyEntry();
        const newCount = myChosenCount + 1;
        if (newCount < maxAllowed) {
          toast.success(`Número ${selectedNumber} confirmado! Você ainda pode escolher mais ${maxAllowed - newCount} número(s).`);
        } else {
          setSubmitted(true);
          toast.success(`Número ${selectedNumber} escolhido com sucesso!`);
        }
      } else {
        toast.error(result.error || "Erro ao escolher número");
        refetchEntries();
      }
    } catch {
      toast.error("Erro ao participar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const takenNumbers = useMemo(() => raffleEntries?.map(e => e.number) || activeRaffle?.takenNumbers || [], [raffleEntries, activeRaffle]);

  // Loading
  if (checking || configLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Tela de senha
  if (!accessGranted) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-900/10 via-transparent to-orange-900/10" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-700/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-700/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="relative z-10 w-full max-w-sm mx-auto flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-yellow-900/40">
            <Gift className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-1">{config?.title || "SORTEIO"}</h1>
          <p className="text-white/50 text-sm mb-8">{config?.subtitle || "Área exclusiva"}</p>
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white/60 text-sm">
              <Lock className="w-4 h-4 text-yellow-400" />
              <span>Digite a senha para acessar</span>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="Senha de acesso"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 text-center text-lg tracking-widest"
              autoFocus
            />
            {passwordError && <p className="text-red-400 text-sm text-center">{passwordError}</p>}
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:opacity-50 text-white font-black text-lg rounded-xl py-4 transition-all duration-300 transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
            >
              {verifying ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
              {verifying ? "Verificando..." : "ACESSAR SORTEIO"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sem sorteio ativo
  if (!activeRaffle && !raffleResult) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <Gift className="w-10 h-10 text-white/30" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Nenhum sorteio ativo</h2>
        <p className="text-white/40 text-sm text-center">Fique de olho! Em breve teremos novidades.</p>
      </div>
    );
  }

  // Resultado do sorteio
  if (!activeRaffle && raffleResult) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-900/10 via-transparent to-orange-900/10" />
        <div className="relative z-10 w-full max-w-sm mx-auto text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-yellow-900/40">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">GANHADOR!</h1>
          <p className="text-white/50 text-sm mb-6">{raffleResult.title}</p>
          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-2xl p-6 space-y-3">
            <div className="text-6xl font-black text-yellow-400">#{raffleResult.winnerNumber}</div>
            <div className="text-xl font-bold text-white">{raffleResult.winnerName}</div>
            <div className="text-white/50 text-sm">{raffleResult.winnerPhone}</div>
          </div>
        </div>
      </div>
    );
  }

  // Sorteio ativo
  return (
    <div className="min-h-screen bg-[#0a0a1a] pb-10">
      {/* Header com botão de sair */}
      <div className="bg-black/40 backdrop-blur-md border-b border-yellow-500/20 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          {/* Esquerda: ícone + título */}
          <div className="flex items-center gap-2 min-w-0">
            <Gift className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <span className="font-black text-white truncate">{activeRaffle?.title || config?.title || "SORTEIO"}</span>
          </div>
          {/* Centro: badge ABERTO */}
          <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/30 rounded-full px-2.5 py-1 flex-shrink-0">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400 text-xs font-bold">ABERTO</span>
          </div>
          {/* Direita: botão Sair */}
          <button
            onClick={() => {
              sessionStorage.removeItem(RAFFLE_SESSION_KEY);
              localStorage.removeItem("walk_access_granted");
              localStorage.removeItem("walk_access_type");
              localStorage.removeItem("walk_client_phone");
              window.location.href = "/";
            }}
            className="flex items-center gap-1.5 text-white/40 hover:text-red-400 transition-colors text-sm flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-xs">Sair</span>
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        {/* Tela de atualização de CPF obrigatória */}
        {needsCpfUpdate && (
          <div className="bg-black/40 border border-yellow-500/30 rounded-2xl p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="text-3xl">📋</div>
              <p className="text-white font-semibold">Atualização de cadastro necessária</p>
              <p className="text-sm text-yellow-300">Para participar do sorteio, informe seu CPF. Este dado é obrigatório.</p>
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
                  setCpfError(d.length === 11 && !isValidCPF(d) ? 'CPF inválido. Digite um CPF válido para continuar.' : '');
                }}
                placeholder="000.000.000-00"
                className={`w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 outline-none transition-all ${
                  cpfError ? 'border-red-500' : isValidCPF(cpfValue) ? 'border-green-500' : 'border-gray-300'
                }`}
              />
              {cpfError && <p className="text-red-400 text-sm mt-1">{cpfError}</p>}
            </div>
            <button
              disabled={cpfLoading || !isValidCPF(cpfValue)}
              onClick={async () => {
                const d = normalizeCpf(cpfValue);
                if (!isValidCPF(d)) { setCpfError('CPF inválido. Digite um CPF válido para continuar.'); return; }
                setCpfLoading(true);
                try {
                  const res = await updateCpfMutation.mutateAsync({ phone: phoneDigits || savedPhone, cpf: d });
                  if (!res.success) { setCpfError(res.message || 'Erro ao salvar CPF'); return; }
                  setNeedsCpfUpdate(false);
                  toast.success('CPF cadastrado! Agora escolha seu número.');
                } catch { setCpfError('Erro ao salvar. Tente novamente.'); }
                finally { setCpfLoading(false); }
              }}
              className="w-full px-4 py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-600/80 hover:to-yellow-500/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all"
            >
              {cpfLoading ? 'Salvando...' : 'SALVAR E CONTINUAR'}
            </button>
          </div>
        )}

        {/* Descrição */}
        {activeRaffle?.description && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 space-y-3">
            <h3 className="text-white font-bold text-center text-sm">REGRAS DO SORTEIO GRÁTIS</h3>
            <p className="text-white/70 text-sm whitespace-pre-wrap break-words text-left">{activeRaffle.description}</p>
          </div>
        )}

        {/* Limite de números */}
        {maxAllowed > 1 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-yellow-400" />
              <span className="text-white/70 text-sm">Números por pessoa:</span>
            </div>
            <span className="text-yellow-400 font-black text-lg">{maxAllowed}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <Users className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-white">{takenNumbers.length}</p>
            <p className="text-xs text-white/40">Números ocupados</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <Ticket className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-white">{100 - takenNumbers.length}</p>
            <p className="text-xs text-white/40">Números livres</p>
          </div>
        </div>

        {/* Números já escolhidos pelo cliente */}
        {myEntry?.hasEntry && myChosenNumbers.length > 0 && (
          <div className="bg-green-500/15 border border-green-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-white font-bold">Seus números escolhidos</p>
                {canChooseMore ? (
                  <p className="text-yellow-400 text-sm">Você ainda pode escolher mais <strong>{remainingChoices}</strong> número(s)!</p>
                ) : (
                  <p className="text-white/50 text-sm">Você usou todos os {maxAllowed} número(s) disponíveis.</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {myChosenNumbers.map((n) => (
                <span key={n} className="bg-green-500/20 border border-green-500/40 text-green-400 font-black text-lg rounded-xl px-3 py-1">
                  #{n}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Formulário — só aparece se ainda pode escolher */}
        {canChooseMore && !submitted && (
          <div className="bg-black/40 border border-white/10 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-black flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400" />
              {myChosenCount > 0 ? `Escolha mais ${remainingChoices} número(s)` : "Escolha seu número"}
              {maxAllowed > 1 && (
                <span className="ml-auto text-xs text-white/40 font-normal">
                  {myChosenCount}/{maxAllowed} escolhidos
                </span>
              )}
            </h3>

            {/* Grid de números */}
            <div className="grid grid-cols-10 gap-1.5">
              {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => {
                const taken = takenNumbers.includes(num);
                const isMyNumber = myChosenNumbers.includes(num);
                const isSelected = selectedNumber === num;
                return (
                  <button
                    key={num}
                    disabled={taken && !isMyNumber}
                    onClick={() => !taken && !isMyNumber && setSelectedNumber(isSelected ? null : num)}
                    className={`
                      aspect-square rounded-lg text-xs font-bold transition-all duration-150
                      ${isMyNumber
                        ? "bg-green-500/30 text-green-400 cursor-default border border-green-500/40"
                        : taken
                          ? "bg-red-500/20 text-red-400/50 cursor-not-allowed border border-red-500/20"
                          : isSelected
                            ? "bg-gradient-to-br from-yellow-500 to-orange-500 text-white shadow-lg shadow-yellow-900/40 scale-110 border-2 border-yellow-400"
                            : "bg-white/5 text-white/70 hover:bg-white/15 hover:text-white border border-white/10"
                      }
                    `}
                  >
                    {num}
                  </button>
                );
              })}
            </div>

            {selectedNumber && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                <p className="text-yellow-400 font-bold">Número selecionado: <span className="text-2xl">#{selectedNumber}</span></p>
              </div>
            )}

            {/* Dados do participante */}
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Seu telefone com DDD (11 dígitos)"
                  className={`w-full bg-black/40 border rounded-xl pl-10 pr-10 py-3 text-white placeholder-white/30 focus:outline-none transition-colors ${
                    isPhoneRegistered === true ? 'border-green-500/60 focus:border-green-500' :
                    isPhoneRegistered === false ? 'border-red-500/60 focus:border-red-500' :
                    'border-white/10 focus:border-yellow-500/50'
                  }`}
                />
                {/* Ícone de status do telefone */}
                {phoneDigits.length === 11 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {phoneCheckLoading ? (
                      <RefreshCw className="w-4 h-4 text-white/40 animate-spin" />
                    ) : isPhoneRegistered === true ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : isPhoneRegistered === false ? (
                      <span className="text-red-400 text-lg font-bold">✕</span>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Mensagem de não cadastrado */}
              {isPhoneRegistered === false && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                  <span className="text-red-400 text-lg mt-0.5">⚠</span>
                  <div>
                    <p className="text-red-300 font-bold text-sm">Número não cadastrado</p>
                    <p className="text-red-300/70 text-xs mt-0.5">O sorteio é exclusivo para clientes cadastrados. Entre em contato para se cadastrar.</p>
                  </div>
                </div>
              )}
              {/* Mensagem de cliente confirmado */}
              {isPhoneRegistered === true && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-green-300 text-xs font-semibold">Cliente cadastrado — você pode participar!</p>
                </div>
              )}
            </div>

            <button
              onClick={handleChooseNumber}
              disabled={!selectedNumber || !name.trim() || !phone.trim() || submitting || isPhoneRegistered === false || (phoneDigits.length === 11 && isPhoneRegistered === null)}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-lg rounded-xl py-4 transition-all duration-300 transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
            >
              {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Ticket className="w-5 h-5" />}
              {submitting ? "Confirmando..." : selectedNumber ? `CONFIRMAR NÚMERO ${selectedNumber}` : "SELECIONE UM NÚMERO"}
            </button>
          </div>
        )}

        {/* Sucesso final */}
        {submitted && (
          <div className="bg-green-500/15 border border-green-500/30 rounded-2xl p-6 text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
            <h3 className="text-xl font-black text-white">Participação confirmada!</h3>
            {lastChosenNumber && (
              <p className="text-white/60 text-sm">Último número: <strong className="text-green-400 text-xl">#{lastChosenNumber}</strong></p>
            )}
            {myChosenNumbers.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center pt-1">
                {myChosenNumbers.map((n) => (
                  <span key={n} className="bg-green-500/20 border border-green-500/40 text-green-400 font-bold rounded-lg px-2 py-0.5 text-sm">
                    #{n}
                  </span>
                ))}
              </div>
            )}
            <p className="text-white/40 text-xs">Boa sorte! 🍀</p>
          </div>
        )}
      </div>
    </div>
  );
}
