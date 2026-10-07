import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { isValidCPF, normalizeCpf } from "@shared/cpf";
import { toast } from "sonner";
import { Gift, Lock, Trophy, Users, Ticket, CheckCircle2, Star, Phone, User, RefreshCw, Hash, LogOut, CalendarClock, Clock3, ShieldCheck, Sparkles, Info, AlertTriangle, UserPlus, ArrowLeft } from "lucide-react";

const RAFFLE_SESSION_KEY = "walk_raffle_access";

function normalizeRafflePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.slice(0, 11);
}

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
  const [showUnregisteredManifest, setShowUnregisteredManifest] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { data: config, isLoading: configLoading } = trpc.raffleAccess.config.useQuery();
  const { data: activeRaffle } = trpc.raffles.active.useQuery(undefined, { enabled: accessGranted });
  const { data: raffleResult } = trpc.raffles.result.useQuery(undefined, { enabled: accessGranted });
  const { data: raffleHistory } = trpc.raffles.history.useQuery(undefined, { enabled: accessGranted });
  const raffleId = useMemo(() => activeRaffle?.id ?? 0, [activeRaffle?.id]);
  const { data: raffleEntries, refetch: refetchEntries } = trpc.raffles.entries.useQuery(
    { raffleId },
    { enabled: accessGranted && !!activeRaffle, refetchInterval: 8000 }
  );
  const savedPhone = typeof window !== "undefined" ? localStorage.getItem("walk_client_phone") || "" : "";
  const normalizedTypedPhone = normalizeRafflePhone(phone);
  const normalizedSavedPhone = normalizeRafflePhone(savedPhone);
  const currentParticipantPhone = phone.trim()
    ? (normalizedTypedPhone.length === 11 ? normalizedTypedPhone : "")
    : normalizedSavedPhone;
  const { data: myEntry, refetch: refetchMyEntry } = trpc.raffles.myEntry.useQuery(
    { raffleId, phone: currentParticipantPhone },
    { enabled: accessGranted && !!activeRaffle && currentParticipantPhone.length === 11, refetchInterval: 8000 }
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
  const phoneDigits = normalizeRafflePhone(phone);
  const { data: phoneCheckData, isFetching: phoneCheckLoading } = trpc.customers.checkByPhone.useQuery(
    { phone: phoneDigits },
    { enabled: phoneDigits.length === 11 }
  );
  const isPhoneRegistered = phoneDigits.length === 11 ? (phoneCheckData?.exists ?? null) : null;

  useEffect(() => {
    if (phoneDigits.length === 11 && !phoneCheckLoading && isPhoneRegistered === false) {
      setShowUnregisteredManifest(true);
    }
  }, [phoneDigits, phoneCheckLoading, isPhoneRegistered]);

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

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const handleTryAnotherPhone = () => {
    setShowUnregisteredManifest(false);
    setPhone("");
    setName("");
    window.setTimeout(() => {
      document.getElementById("raffle-phone")?.focus();
    }, 0);
  };

  const handleChooseNumber = async () => {
    if (!activeRaffle || !selectedNumber) return;
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    if (!phone.trim() || phoneDigits.length < 11) { toast.error("Digite um telefone válido com DDD (11 dígitos)"); return; }
    // Verificar se o cliente tem CPF cadastrado
    if (phoneCheckData?.exists && !(phoneCheckData?.customer as any)?.cpf) {
      setNeedsCpfUpdate(true);
      return;
    }
    // Verificar se o telefone está cadastrado
    if (isPhoneRegistered === false) {
      setShowUnregisteredManifest(true);
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
        customerPhone: phoneDigits,
      });
      if (result.success) {
        localStorage.setItem("walk_client_phone", phoneDigits);
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
  const entryByNumber = useMemo(() => new Map((raffleEntries || []).map((entry: any) => [entry.number, entry])), [raffleEntries]);

  const scheduledAtMs = activeRaffle?.scheduledDrawAt ? new Date(activeRaffle.scheduledDrawAt).getTime() : null;
  const remainingMs = scheduledAtMs ? Math.max(0, scheduledAtMs - nowMs) : 0;
  const countdown = {
    days: Math.floor(remainingMs / 86400000),
    hours: Math.floor((remainingMs % 86400000) / 3600000),
    minutes: Math.floor((remainingMs % 3600000) / 60000),
    seconds: Math.floor((remainingMs % 60000) / 1000),
  };
  const format2 = (value: number) => String(value).padStart(2, "0");
  const scheduledLabel = activeRaffle?.scheduledDrawAt
    ? new Date(activeRaffle.scheduledDrawAt).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

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

  // Resultado / galeria de ganhadores
  if (!activeRaffle && raffleResult) {
    const winners = raffleHistory?.length ? raffleHistory : [raffleResult];
    return (
      <div className="min-h-screen bg-[#070912] text-white px-4 py-8 md:px-6 relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_30%)]" />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-2xl shadow-yellow-900/40">
              <Trophy className="h-10 w-10 text-white" />
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-yellow-300">H2 Colombiano</p>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">GALERIA DE GANHADORES</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-white/50 md:text-base">
              Confira quem já ganhou nos sorteios anteriores. Seu nome pode ser o próximo.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {winners.map((winner: any, index: number) => (
              <article
                key={winner.id}
                className={`relative overflow-hidden rounded-3xl border ${index === 0 ? "border-yellow-400/50 bg-gradient-to-br from-yellow-500/15 via-[#11152a] to-orange-500/10 shadow-xl shadow-yellow-950/20" : "border-white/10 bg-[#0c1120]/92"} p-5`}
              >
                {index === 0 && (
                  <div className="absolute right-4 top-4 rounded-full border border-yellow-300/30 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-yellow-200">
                    Mais recente
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-yellow-400/70 bg-purple-950">
                    {winner.winnerProfilePhotoUrl ? (
                      <img src={winner.winnerProfilePhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                        {String(winner.winnerName || "H2").split(/\s+/).filter(Boolean).slice(0,2).map((part: string) => part[0]).join("").toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider text-yellow-300">Ganhador</p>
                    <h2 className="mt-1 truncate text-lg font-black text-white">{winner.winnerName}</h2>
                    <p className="mt-1 text-sm text-white/45">{winner.title}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-4 text-center">
                  <div className="text-5xl font-black text-yellow-300">#{winner.winnerNumber}</div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-white/40">
                  <span>Sorteio realizado</span>
                  <span>
                    {winner.drawnAt
                      ? new Date(winner.drawnAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                      : ""}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Sorteio ativo
  return (
    <div className="min-h-screen bg-[#070912] text-white pb-12">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_32%)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070912]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-yellow-400/30 bg-yellow-400/10">
              <Gift className="h-5 w-5 text-yellow-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-300">H2 Colombiano</p>
              <p className="truncate text-sm font-bold text-white/85">Sorteio oficial</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-black text-emerald-300">SORTEIO ATIVO</span>
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem(RAFFLE_SESSION_KEY);
                localStorage.removeItem("walk_access_granted");
                localStorage.removeItem("walk_access_type");
                localStorage.removeItem("walk_client_phone");
                window.location.href = "/";
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      </header>

      {showUnregisteredManifest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="raffle-unregistered-title"
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-red-400/30 bg-[#0d1020] shadow-2xl shadow-black/60"
          >
            <div className="border-b border-white/10 bg-gradient-to-r from-red-500/15 via-orange-400/10 to-transparent p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-300" />
              </div>
              <h2 id="raffle-unregistered-title" className="mt-4 text-xl font-black text-white">
                Telefone não cadastrado
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Este número não consta no cadastro do H2 Colombiano. Para participar do sorteio, faça seu cadastro ou informe outro telefone.
              </p>
            </div>

            <div className="space-y-3 p-5">
              <a
                href="/pre-cadastro"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-300 px-4 py-3.5 font-black text-black transition active:scale-[0.98]"
              >
                <UserPlus className="h-5 w-5" />
                FAZER CADASTRO
              </a>

              <button
                type="button"
                onClick={handleTryAnotherPhone}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 font-bold text-white transition hover:bg-white/[0.08] active:scale-[0.98]"
              >
                <ArrowLeft className="h-5 w-5" />
                INFORMAR OUTRO TELEFONE
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-5 md:px-6 md:pt-8">
        <section className="overflow-hidden rounded-3xl border border-purple-400/20 bg-gradient-to-br from-[#11152a] via-[#0b1020] to-[#1a0f29] shadow-2xl shadow-purple-950/20">
          <div className="grid lg:grid-cols-[1.15fr_.85fr]">
            <div className="p-5 md:p-8 lg:p-10">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1.5 text-xs font-black text-yellow-300">
                <span className="h-2 w-2 rounded-full bg-yellow-300 animate-pulse" /> SORTEIO ATIVO
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                {activeRaffle?.title || config?.title || "Sorteio H2 Colombiano"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60 md:text-base">
                Escolha até <strong className="text-white">{maxAllowed}</strong> número(s) de 1 a 100. Participe com seu cadastro validado e acompanhe o resultado diretamente nesta página.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.07] p-4">
                  <Gift className="mb-2 h-5 w-5 text-yellow-300" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Prêmio</p>
                  <p className="mt-1 font-black text-yellow-200">Confira nas regras</p>
                </div>
                <div className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.05] p-4">
                  <Hash className="mb-2 h-5 w-5 text-blue-300" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Por pessoa</p>
                  <p className="mt-1 font-black">{maxAllowed} número(s)</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
                  <ShieldCheck className="mb-2 h-5 w-5 text-emerald-300" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Participação</p>
                  <p className="mt-1 font-black">Cadastro validado</p>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 bg-black/20 p-5 md:p-8 lg:border-l lg:border-t-0 lg:p-10">
              {activeRaffle?.drawMode === "automatic" && scheduledLabel ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-bold text-purple-200">
                    <CalendarClock className="h-5 w-5 text-yellow-300" /> SORTEIO PROGRAMADO
                  </div>
                  <p className="mt-2 text-sm text-white/55">{scheduledLabel} • horário de São Paulo</p>
                  <div className="mt-5 grid grid-cols-4 gap-2">
                    {[
                      [format2(countdown.days), "DIAS"],
                      [format2(countdown.hours), "HORAS"],
                      [format2(countdown.minutes), "MIN"],
                      [format2(countdown.seconds), "SEG"],
                    ].map(([value,label]) => (
                      <div key={label} className="rounded-2xl border border-purple-400/20 bg-[#11162a] px-2 py-4 text-center">
                        <div className="text-2xl font-black tabular-nums md:text-3xl">{value}</div>
                        <div className="mt-1 text-[9px] font-black tracking-wider text-white/35">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.06] px-3 py-2 text-xs text-yellow-100/80">
                    <Clock3 className="h-4 w-4 text-yellow-300" /> Contagem regressiva em tempo real.
                  </div>
                </>
              ) : (
                <div className="flex min-h-[180px] flex-col justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <CalendarClock className="h-8 w-8 text-yellow-300" />
                  <p className="mt-3 text-lg font-black">Sorteio manual</p>
                  <p className="mt-1 text-sm text-white/45">A equipe H2 realizará o sorteio e publicará o resultado aqui.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {activeRaffle?.description && (
          <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-300" />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-white/55">Regras e informações</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/65">{activeRaffle.description}</p>
              </div>
            </div>
          </section>
        )}

        {needsCpfUpdate && (
          <section className="mt-5 rounded-2xl border border-yellow-500/30 bg-yellow-500/[0.08] p-5">
            <p className="font-bold text-yellow-200">Atualização de cadastro necessária</p>
            <p className="mt-1 text-sm text-white/55">Informe seu CPF para continuar.</p>
            <div className="mt-3 max-w-md">
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
                  setCpfError(d.length === 11 && !isValidCPF(d) ? 'CPF inválido.' : '');
                }}
                placeholder="000.000.000-00"
                className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-center text-lg font-medium text-black outline-none ${cpfError ? 'border-red-500' : isValidCPF(cpfValue) ? 'border-green-500' : 'border-gray-300'}`}
              />
              {cpfError && <p className="mt-1 text-sm text-red-300">{cpfError}</p>}
              <button
                disabled={cpfLoading || !isValidCPF(cpfValue)}
                onClick={async () => {
                  const d = normalizeCpf(cpfValue);
                  if (!isValidCPF(d)) { setCpfError('CPF inválido.'); return; }
                  setCpfLoading(true);
                  try {
                    const res = await updateCpfMutation.mutateAsync({ phone: phoneDigits || savedPhone, cpf: d });
                    if (!res.success) { setCpfError(res.message || 'Erro ao salvar CPF'); return; }
                    setNeedsCpfUpdate(false);
                    toast.success('CPF cadastrado! Agora escolha seu número.');
                  } catch { setCpfError('Erro ao salvar. Tente novamente.'); }
                  finally { setCpfLoading(false); }
                }}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 px-4 py-3 font-black text-black disabled:opacity-50"
              >
                {cpfLoading ? 'Salvando...' : 'SALVAR E CONTINUAR'}
              </button>
            </div>
          </section>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-white/10 bg-[#0c1120]/90 p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-yellow-300" /><h2 className="text-lg font-black md:text-xl">Escolha seus números</h2></div>
                <p className="mt-1 text-xs text-white/40">Selecione de 1 a 100. Limite: {maxAllowed} por pessoa.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-white/50">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-white/10 border border-white/15" /> Disponível</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-red-500/70" /> Ocupado</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-yellow-400" /> Selecionado</span>
              </div>
            </div>

            {myEntry?.hasEntry && myChosenNumbers.length > 0 && (
              <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.08] p-3">
                <p className="text-xs font-bold text-emerald-200">Seus números: {myChosenNumbers.map(n => `#${n}`).join(" • ")}</p>
                {canChooseMore ? <p className="mt-1 text-[11px] text-white/45">Você ainda pode escolher mais {remainingChoices}.</p> : <p className="mt-1 text-[11px] font-bold text-yellow-200">Limite de {maxAllowed} número(s) atingido.</p>}
              </div>
            )}

            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => {
                const taken = takenNumbers.includes(num);
                const entry: any = entryByNumber.get(num);
                const isMyNumber = myChosenNumbers.includes(num);
                const isSelected = selectedNumber === num;
                return (
                  <button
                    key={num}
                    disabled={(taken && !isMyNumber) || !canChooseMore}
                    onClick={() => !taken && !isMyNumber && canChooseMore && setSelectedNumber(isSelected ? null : num)}
                    className={`relative aspect-square overflow-hidden rounded-xl border text-xs font-black transition-all duration-150 ${isMyNumber
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                      : taken
                        ? "border-red-500/25 bg-red-500/15 text-white/90 cursor-not-allowed"
                        : isSelected
                          ? "scale-105 border-yellow-300 bg-yellow-400 text-black shadow-lg shadow-yellow-500/20"
                          : !canChooseMore
                            ? "border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed"
                            : "border-white/10 bg-white/[0.04] text-white/75 hover:border-white/25 hover:bg-white/[0.08]"
                    }`}
                  >
                    {taken && entry?.profilePhotoUrl && <img src={entry.profilePhotoUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
                    {taken && <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />}
                    <span className="relative z-10 drop-shadow">{num}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[#0c1120]/90 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-white/45">Sua participação</p>
              <div className="mt-3 flex items-end justify-between">
                <div><div className="text-4xl font-black">{myChosenCount}<span className="text-xl text-white/30">/{maxAllowed}</span></div><p className="mt-1 text-xs text-white/40">números confirmados</p></div>
                <Ticket className="h-8 w-8 text-yellow-300" />
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-amber-300" style={{ width: `${Math.min(100, (myChosenCount / Math.max(1,maxAllowed))*100)}%` }} /></div>
            </div>

            {canChooseMore && !submitted && (
              <div className="rounded-3xl border border-yellow-400/20 bg-gradient-to-br from-yellow-400/[0.08] to-transparent p-5">
                <p className="font-black">Confirmar participação</p>
                <p className="mt-1 text-xs text-white/45">Selecione um número e confirme seus dados.</p>
                {selectedNumber && <div className="mt-4 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-center"><span className="text-xs text-yellow-100/60">Número selecionado</span><div className="text-3xl font-black text-yellow-200">#{selectedNumber}</div></div>}
                <div className="mt-4 space-y-3">
                  <div className="relative"><User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" /><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-10 pr-3 text-sm outline-none focus:border-yellow-400/40" /></div>
                  <div className="relative"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" /><input id="raffle-phone" type="tel" inputMode="numeric" maxLength={11} value={phone} onChange={(e) => { setPhone(normalizeRafflePhone(e.target.value)); if (showUnregisteredManifest) setShowUnregisteredManifest(false); }} placeholder="Telefone com DDD" className={`w-full rounded-xl border bg-black/30 py-3 pl-10 pr-9 text-sm outline-none ${isPhoneRegistered === true ? 'border-green-500/40' : isPhoneRegistered === false ? 'border-red-500/40' : 'border-white/10 focus:border-yellow-400/40'}`} />{phoneDigits.length === 11 && <div className="absolute right-3 top-1/2 -translate-y-1/2">{phoneCheckLoading ? <RefreshCw className="h-4 w-4 animate-spin text-white/30" /> : isPhoneRegistered === true ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <span className="font-bold text-red-400">×</span>}</div>}</div>
                </div>
                {isPhoneRegistered === false && <p className="mt-2 text-xs text-red-300">Telefone não cadastrado no sistema.</p>}
                {isPhoneRegistered === true && <p className="mt-2 text-xs text-emerald-300">Cliente confirmado.</p>}
                <button
                  onClick={handleChooseNumber}
                  disabled={!selectedNumber || !name.trim() || !phone.trim() || submitting || isPhoneRegistered === false || (phoneDigits.length === 11 && isPhoneRegistered === null)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-300 px-4 py-3.5 font-black text-black disabled:opacity-35"
                >
                  {submitting ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Ticket className="h-5 w-5" />}
                  {submitting ? "Confirmando..." : selectedNumber ? `CONFIRMAR #${selectedNumber}` : "SELECIONE UM NÚMERO"}
                </button>
              </div>
            )}

            {!canChooseMore && (
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.08] p-5 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                <p className="mt-2 font-black">Participação completa</p>
                <p className="mt-1 text-xs text-white/45">Você atingiu o limite de {maxAllowed} número(s) deste sorteio.</p>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-[#0c1120]/90 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-white/45">Resumo</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-white/45">Ocupados</span><strong>{takenNumbers.length}</strong></div>
                <div className="flex justify-between"><span className="text-white/45">Disponíveis</span><strong>{100 - takenNumbers.length}</strong></div>
                <div className="flex justify-between"><span className="text-white/45">Limite por pessoa</span><strong>{maxAllowed}</strong></div>
              </div>
            </div>
          </aside>
        </div>

        {submitted && (
          <section className="mt-5 rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.08] p-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
            <h3 className="mt-3 text-xl font-black">Participação confirmada!</h3>
            <p className="mt-1 text-sm text-white/45">Boa sorte! O resultado será publicado no sistema.</p>
          </section>
        )}
      </main>
    </div>
  );
}
