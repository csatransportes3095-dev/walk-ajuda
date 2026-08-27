import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { useState, useMemo, useEffect, type FormEvent } from "react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, AlertTriangle, Clock, CalendarDays, Loader2, ShieldAlert, MessageCircle, AlertCircle, ShieldCheck, UserRoundCog, Upload } from "lucide-react";
import { isValidCPF, normalizeCpf } from "@shared/cpf";

export default function SchedulePage() {
  const params = useParams();
  const token = (params as any).token as string;
  const utils = trpc.useUtils();
  const accessStorageKey = `schedule_access_${token}`;
  const [accessToken, setAccessToken] = useState(() => {
    try { return sessionStorage.getItem(accessStorageKey) || ""; } catch { return ""; }
  });
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [authStep, setAuthStep] = useState<"identity" | "password">("identity");
  const [needsPasswordCreation, setNeedsPasswordCreation] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileCpf, setProfileCpf] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [profileUf, setProfileUf] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");

  const { data, isLoading, isError } = trpc.schedule.getByToken.useQuery(
    { token, accessToken: accessToken || undefined },
    { enabled: !!token, retry: false },
  );
  const passwordStatusMut = trpc.schedule.checkPasswordStatus.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        setNeedsPasswordCreation(false);
        setPassword("");
        setAuthStep("identity");
        return toast.error("Telefone/CPF não corresponde a este agendamento.");
      }
      if (result.status === "no_password" || result.status === "expired") {
        setNeedsPasswordCreation(true);
        setPassword("");
        setAuthStep("identity");
        return toast.info("Este cadastro precisa criar uma nova senha no login principal.");
      }
      if (result.status === "pending_approval") {
        setNeedsPasswordCreation(false);
        setPassword("");
        setAuthStep("identity");
        return toast.info("A senha deste cadastro ainda aguarda aprovação.");
      }
      setNeedsPasswordCreation(false);
      setAuthStep("password");
    },
    onError: () => toast.error("Não foi possível verificar o estado da senha."),
  });

  const authorizeMut = trpc.schedule.authorize.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        const messages: Record<string, string> = {
          invalid: "Telefone/CPF não corresponde a este agendamento.",
          no_password: "Sua senha foi resetada ou ainda não foi criada.",
          pending_approval: "Sua senha ainda aguarda aprovação.",
          expired: "Sua senha expirou. Crie uma nova senha no login principal.",
          wrong_password: "Senha incorreta.",
        };
        setPassword("");
        setAuthStep("identity");
        setNeedsPasswordCreation(result.error === "no_password" || result.error === "expired");
        return toast.error(messages[result.error] || "Não foi possível confirmar os dados para este agendamento.");
      }
      try { sessionStorage.setItem(accessStorageKey, result.accessToken); } catch { /* sessão continua em memória */ }
      setAccessToken(result.accessToken);
      setIdentity("");
      setPassword("");
      setAuthStep("identity");
      setNeedsPasswordCreation(false);
      toast.success("Acesso confirmado.");
    },
    onError: () => toast.error("Não foi possível confirmar os dados para este agendamento."),
  });
  const saveMissingProfileMut = trpc.schedule.saveMissingProfile.useMutation({
    onSuccess: () => {
      toast.success("Dados faltantes atualizados.");
      utils.schedule.getByToken.invalidate({ token, accessToken });
    },
    onError: (error) => toast.error(error.message),
  });
  const uploadMissingPhotoMut = trpc.schedule.uploadMissingProfilePhoto.useMutation({
    onSuccess: () => {
      toast.success("Foto atualizada.");
      utils.schedule.getByToken.invalidate({ token, accessToken });
    },
    onError: (error) => toast.error(error.message),
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [showChangeDate, setShowChangeDate] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'all' | 'morning' | 'afternoon' | 'night' | 'midnight'>('all');
  const [showMidnightWarning, setShowMidnightWarning] = useState(false);

  const confirmMut = trpc.schedule.confirm.useMutation({
    onSuccess: () => { toast.success("Horário agendado com sucesso!"); utils.schedule.getByToken.invalidate({ token, accessToken }); },
    onError: (e) => {
      toast.error(e.message);
      utils.schedule.getByToken.invalidate({ token, accessToken });
      setSelectedSlot(null);
    },
  });

  const loadedProfile = data && "profile" in data ? data.profile : null;

  useEffect(() => {
    const profile = loadedProfile;
    if (profile) {
      setProfileName(profile.name || "");
      setProfilePhone(profile.phone || "");
      setProfileEmail(profile.email || "");
      setProfileCpf(profile.cpf || "");
      setProfileCity(profile.city || "");
      setProfileUf(profile.uf || "");
      setProfilePhoto(profile.profilePhotoUrl || "");
    }
  }, [loadedProfile?.name, loadedProfile?.phone, loadedProfile?.email, loadedProfile?.cpf, loadedProfile?.city, loadedProfile?.uf, loadedProfile?.profilePhotoUrl]);

  useEffect(() => {
    if (!isError || !accessToken) return;
    try { sessionStorage.removeItem(accessStorageKey); } catch { /* ignora */ }
    setAccessToken("");
    setPassword("");
    setAuthStep("identity");
    setNeedsPasswordCreation(false);
    toast.error("Sua sessão do agendamento expirou. Identifique-se novamente.");
  }, [isError, accessToken, accessStorageKey]);

  // Processa variáveis de template no texto de aviso
  const processWarningText = (text: string) => {
    if (!text) return '';
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = String(now.getFullYear());
    const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let result = text
      .replace(/\{DIA\}/g, d)
      .replace(/\{MES\}/g, m)
      .replace(/\{ANO\}/g, y)
      .replace(/\{hora_atual\}/gi, hh)
      .replace(/\{nome\}/gi, '')
      .replace(/\{telefone\}/gi, '')
      .replace(/\{cadastro\}/gi, '')
      .replace(/\{data\}/gi, '')
      .replace(/\{hora\}/gi, '')
      .replace(/\{servico\}/gi, '')
      .replace(/\{status\}/gi, '')
      .replace(/\{link\}/gi, '');
    // Remover marcação markdown (###, **, __, ~~, *texto*, _texto_)
    result = result
      .replace(/#{1,6}\s?/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1');
    return result.trim();
  };

  // Funções auxiliares de formatação
  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'short', month: 'short', day: 'numeric' });
  };
  
  const formatDateFull = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getPeriod = (time: string): 'morning' | 'afternoon' | 'night' | 'midnight' => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 1 && hour < 6) return 'midnight';
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'night';
  };

  const getPeriodColor = (period: 'morning' | 'afternoon' | 'night' | 'midnight') => {
    switch (period) {
      case 'morning': return { bg: 'from-yellow-500/20 to-yellow-600/10', border: 'border-yellow-500/30', text: 'text-yellow-300' };
      case 'afternoon': return { bg: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/30', text: 'text-orange-300' };
      case 'night': return { bg: 'from-blue-500/20 to-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-300' };
      case 'midnight': return { bg: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/30', text: 'text-purple-300' };
    }
  };

  const getPeriodLabel = (period: 'morning' | 'afternoon' | 'night' | 'midnight') => {
    switch (period) {
      case 'morning': return 'Manhã';
      case 'afternoon': return 'Tarde';
      case 'night': return 'Noite';
      case 'midnight': return 'Madrugada';
    }
  };

  // Agrupar slots disponíveis por data
  const availableSlots = data && data.found && "slots" in data ? data.slots : undefined;
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    if (Array.isArray(availableSlots)) {
      availableSlots.forEach((s: any) => {
        (g[s.slotDate] ||= []).push(s);
      });
    }
    return g;
  }, [availableSlots]);

  // Obter datas disponíveis
  const dates = useMemo(() => {
    return Object.keys(grouped).sort();
  }, [grouped]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 text-center">
        <div className="bg-black/40 border border-yellow-500/20 rounded-2xl p-8 max-w-md">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">Agendamento temporariamente indisponível</h1>
          <p className="text-white/60 text-sm">Não foi possível carregar este agendamento agora. Aguarde alguns instantes e tente abrir o link novamente.</p>
        </div>
      </div>
    );
  }

  if (!data?.found) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 text-center">
        <div className="bg-black/40 border border-white/10 rounded-2xl p-8 max-w-md">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">Link inválido</h1>
          <p className="text-white/60 text-sm">Este link de agendamento não foi encontrado ou expirou. Entre em contato para receber um novo link.</p>
        </div>
      </div>
    );
  }

  if (data.requiresIdentity) {
    return (
      <ScheduleIdentityGate
        identity={identity}
        setIdentity={setIdentity}
        password={password}
        setPassword={setPassword}
        step={authStep}
        setStep={setAuthStep}
        needsPasswordCreation={needsPasswordCreation}
        onCreatePassword={() => {
          const returnTo = `/agendar/${encodeURIComponent(token)}`;
          window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        }}
        busy={passwordStatusMut.isPending || authorizeMut.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (authStep === "identity") {
            if (!identity.trim()) return toast.error("Digite seu telefone ou CPF.");
            passwordStatusMut.mutate({ token, identity: identity.trim() });
            return;
          }
          if (!password) return toast.error("Digite sua senha.");
          authorizeMut.mutate({ token, identity: identity.trim(), password });
        }}
      />
    );
  }

  const logout = () => {
    try { sessionStorage.removeItem(accessStorageKey); } catch { /* ignora */ }
    setAccessToken("");
    setIdentity("");
    setPassword("");
    setAuthStep("identity");
  };

  const accent = data.config?.accentColor || "#8b5cf6";
  const appt = data.appointment;
  const cfg = data.config;
  const missingFields = data.profile?.missing || [];
  const profileUpdateRequired = data.profile?.updateRequired === true;

  if (missingFields.length > 0) {
    return (
      <ScheduleMissingProfileGate
        missingFields={missingFields}
        updateRequired={profileUpdateRequired}
        name={profileName}
        phone={profilePhone}
        setName={setProfileName}
        setPhone={setProfilePhone}
        email={profileEmail}
        setEmail={setProfileEmail}
        cpf={profileCpf}
        setCpf={setProfileCpf}
        city={profileCity}
        setCity={setProfileCity}
        uf={profileUf}
        setUf={setProfileUf}
        photoUrl={profilePhoto}
        onLogout={logout}
        uploading={uploadMissingPhotoMut.isPending}
        saving={saveMissingProfileMut.isPending}
        onPhoto={(file) => {
          if (!file) return;
          if (file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
            return toast.error("Envie uma foto JPG, PNG ou WEBP de até 5 MB.");
          }
          const reader = new FileReader();
          reader.onload = () => uploadMissingPhotoMut.mutate({ token, accessToken, imageBase64: String(reader.result || "") });
          reader.readAsDataURL(file);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (missingFields.includes("cpf") && !isValidCPF(normalizeCpf(profileCpf))) return toast.error("Digite um CPF válido.");
          saveMissingProfileMut.mutate({
            token,
            accessToken,
            ...(missingFields.includes("name") ? { name: profileName } : {}),
            ...(missingFields.includes("phone") ? { phone: profilePhone } : {}),
            ...(missingFields.includes("email") ? { email: profileEmail } : {}),
            ...(missingFields.includes("cpf") ? { cpf: profileCpf } : {}),
            ...(missingFields.includes("city") ? { city: profileCity } : {}),
            ...(missingFields.includes("uf") ? { uf: profileUf } : {}),
          });
        }}
      />
    );
  }

  // Slots do dia selecionado
  const slotsOfDay = selectedDate ? (grouped[selectedDate] || []) : [];
  
  // Obter slot selecionado para verificar se é madrugada
  const selectedSlotData = selectedSlot && slotsOfDay.find(s => s.id === selectedSlot);
  const selectedIsMidnight = selectedSlotData && getPeriod(selectedSlotData.slotTime) === 'midnight';

  // Já confirmado
  if (appt.status === "confirmed") {
    if (showChangeDate) {
      // Modal de alteração de data/hora
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-2xl">
            <button 
              onClick={() => {
                setShowChangeDate(false);
                setSelectedDate(null);
                setSelectedSlot(null);
                setPeriodFilter('all');
              }}
              className="mb-4 text-white/60 hover:text-white text-sm flex items-center gap-2 transition-colors">
              ← Voltar
            </button>
            <div className="bg-black/40 border border-white/10 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-fuchsia-400" />
                Alterar Data e Hora
              </h2>
              
              {/* Seleção de datas */}
              <div className="mb-6">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Selecione uma data
                </h3>
                {dates.length === 0 ? (
                  <p className="text-white/60 text-sm">Nenhuma data disponível</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {dates.map(date => (
                      <button
                        key={date}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedSlot(null);
                          setPeriodFilter('all');
                        }}
                        className={`p-3 rounded-lg text-sm font-semibold transition-all ${
                          selectedDate === date
                            ? 'bg-fuchsia-600 text-white border border-fuchsia-400'
                            : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                        }`}>
                        {formatDateShort(date)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Seleção de horários */}
              {selectedDate && slotsOfDay.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Selecione um horário
                  </h3>
                  
                  {/* Filtros de período */}
                  <div className="mb-4 flex gap-2 flex-wrap">
                    {(['all', 'morning', 'afternoon', 'night', 'midnight'] as const).map(period => (
                      <button
                        key={period}
                        onClick={() => setPeriodFilter(period)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          periodFilter === period
                            ? 'text-white shadow-lg'
                            : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                        }`}
                        style={periodFilter === period ? { background: accent, borderColor: accent } : {}}>
                        {period === 'all' ? 'Todos' : getPeriodLabel(period as any)}
                      </button>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slotsOfDay
                      .filter(s => periodFilter === 'all' || getPeriod(s.slotTime) === periodFilter)
                      .map((slot: any) => {
                        const active = selectedSlot === slot.id;
                        const period = getPeriod(slot.slotTime);
                        const colors = getPeriodColor(period);
                        return (
                          <div key={slot.id} className="flex flex-col items-center">
                            <button
                              onClick={() => setSelectedSlot(slot.id)}
                              disabled={slot.isBooked}
                              className={`w-full p-2 rounded-lg text-sm font-semibold transition-all ${
                                slot.isBooked
                                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                  : active
                                  ? 'bg-green-600 text-white border border-green-400'
                                  : `bg-gradient-to-br ${colors?.bg} border ${colors?.border} text-white/80 hover:text-white`
                              }`}>
                              {slot.slotTime}
                            </button>
                            {period === 'midnight' && <span className="text-[10px] text-purple-300 mt-1 font-semibold">madrugada</span>}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              
              {/* Botão de confirmação */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowChangeDate(false);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                    setPeriodFilter('all');
                  }}
                  className="flex-1 px-4 py-3 bg-white/5 text-white border border-white/10 rounded-lg hover:bg-white/10 font-semibold transition-all">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (selectedSlot) {
                      confirmMut.mutate({ token, accessToken, slotId: selectedSlot });
                    } else {
                      toast.error('Selecione um horário');
                    }
                  }}
                  disabled={!selectedSlot || confirmMut.isPending}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar Nova Data
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Parser de texto em seções estruturadas
    const parseConfirmationMessage = (text: string) => {
      if (!text) return null;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const sections: { type: 'intro' | 'section' | 'item' | 'subitem' | 'text'; content: string; emoji?: string }[] = [];
      // Emojis que indicam título de seção
      const sectionEmojis = ['📸', '📱', '⚠️', '🏠', '📋', '🔔', '💡', '📌', '🎯', '🔑', '📝', '🛡️', '⭐', '🚨', '📢'];
      // Emojis que indicam item de lista
      const itemEmojis = ['❌', '✅', '🔄', '⚡', '🔒', '🔓', '📲', '💬', '🖼️', '🔴', '🟢', '🟡', '🔵', '⚫', '⚪'];
      for (const line of lines) {
        const firstEmoji = Array.from(line).find(c => c.codePointAt(0)! > 127 && c !== ' ');
        const isSectionTitle = sectionEmojis.some(e => line.startsWith(e)) || (line.toUpperCase() === line && line.length > 5 && !line.startsWith('•'));
        const isItem = itemEmojis.some(e => line.startsWith(e));
        const isSubItem = line.startsWith('•');
        if (isSectionTitle) {
          sections.push({ type: 'section', content: line, emoji: firstEmoji });
        } else if (isItem) {
          sections.push({ type: 'item', content: line, emoji: firstEmoji });
        } else if (isSubItem) {
          sections.push({ type: 'subitem', content: line.replace(/^•\s*/, '') });
        } else {
          sections.push({ type: 'text', content: line });
        }
      }
      // Agrupar em blocos de seção
      const blocks: { title?: string; titleEmoji?: string; items: typeof sections }[] = [];
      let currentBlock: { title?: string; titleEmoji?: string; items: typeof sections } = { items: [] };
      for (const s of sections) {
        if (s.type === 'section') {
          if (currentBlock.items.length > 0 || currentBlock.title) blocks.push(currentBlock);
          currentBlock = { title: s.content, titleEmoji: s.emoji, items: [] };
        } else {
          currentBlock.items.push(s);
        }
      }
      if (currentBlock.items.length > 0 || currentBlock.title) blocks.push(currentBlock);
      return blocks;
    };

    const confirmationBlocks = parseConfirmationMessage(cfg?.confirmationMessage || '');

    // Tela de confirmação de agendamento — layout profissional
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] px-4 py-8">
        <div className="max-w-md mx-auto">

          {/* Cabeçalho de sucesso */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/40 mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Atendimento agendado!</h1>
            {appt.serviceName && (
              <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300">
                {appt.serviceName}
              </span>
            )}
          </div>

          <ScheduleOrderContext order={data.order} onLogout={logout} />

          {/* Card de data e hora */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 mb-5">
            <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-green-400 to-emerald-600" />
            <div className="p-5 pl-6 text-center">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-2">Data e Horário Confirmados</p>
              <p className="text-xl font-bold text-white leading-tight">{formatDateFull(appt.slotDate!)}</p>
              <div className="inline-flex items-center gap-2 mt-2 px-4 py-1.5 rounded-full bg-green-500/15 border border-green-500/30">
                <Clock className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-300 font-bold text-lg">às {appt.slotTime}</span>
              </div>
            </div>
          </div>

          {/* Blocos de instruções parseados */}
          {confirmationBlocks && confirmationBlocks.length > 0 && (
            <div className="space-y-3 mb-5">
              {confirmationBlocks.map((block, bi) => (
                <div key={bi} className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/4">
                  <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-white/20 to-white/5" />
                  <div className="p-4 pl-5">
                    {block.title && (
                      <p className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="text-base">{block.titleEmoji}</span>
                        <span>{block.title.replace(/^[^\w\u00C0-\u024F]+/, '').trim()}</span>
                      </p>
                    )}
                    {block.items.length > 0 && (
                      <div className="space-y-2">
                        {block.items.map((item, ii) => (
                          <div key={ii}>
                            {item.type === 'item' && (
                              <div className="flex items-start gap-2.5">
                                <span className="text-base shrink-0 mt-0.5">{item.emoji}</span>
                                <p className="text-white/80 text-sm leading-relaxed">
                                  {item.content.replace(/^[^\w\u00C0-\u024F]+/, '').trim()}
                                </p>
                              </div>
                            )}
                            {item.type === 'subitem' && (
                              <div className="flex items-start gap-2 ml-7">
                                <span className="text-white/30 text-xs mt-1 shrink-0">›</span>
                                <p className="text-white/60 text-xs leading-relaxed">{item.content}</p>
                              </div>
                            )}
                            {item.type === 'text' && (
                              <p className="text-white/70 text-sm leading-relaxed">{item.content}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Aviso de não comparecimento */}
          {cfg?.noShowWarning && (
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/12 via-amber-500/5 to-transparent mb-5">
              <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" />
              <div className="p-4 pl-5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-amber-200 text-xs font-bold uppercase tracking-wide">Atenção</p>
                </div>
                <p className="text-amber-100/80 text-sm leading-relaxed whitespace-pre-line">{processWarningText(cfg.noShowWarning)}</p>
              </div>
            </div>
          )}

          {/* Botão alterar */}
          <button
            onClick={() => setShowChangeDate(true)}
            className="w-full px-4 py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
            <CalendarClock className="w-4 h-4" />
            Alterar Data/Hora
          </button>

        </div>
      </div>
    );
  }

  // Cancelado
  if (appt.status === "cancelled") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 text-center">
        <div className="bg-black/40 border border-white/10 rounded-2xl p-8 max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">Agendamento cancelado</h1>
          <p className="text-white/60 text-sm">Este agendamento foi cancelado. Entre em contato para mais informações.</p>
        </div>
      </div>
    );
  }

  // Pendente: escolher data e horário
  const formatDateParts = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase();
    const rest = date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
    return [weekday, rest];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] px-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* Alerta de madrugada */}
        {showMidnightWarning && selectedIsMidnight && (
          <div className="mb-6 relative overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-500/15 via-purple-500/5 to-transparent shadow-lg shadow-purple-900/20">
            <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-purple-400 to-purple-600" />
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/40 shrink-0">
                  <AlertCircle className="w-5 h-5 text-purple-300" />
                </span>
                <div className="leading-tight">
                  <p className="text-purple-200 text-sm font-extrabold uppercase tracking-wide">Confirmação de madrugada</p>
                </div>
              </div>
              <p className="text-purple-50/90 text-sm leading-relaxed mb-3">Você selecionou um horário de madrugada. Tem certeza que deseja agendar neste horário?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowMidnightWarning(false);
                    setSelectedSlot(null);
                  }}
                  className="flex-1 px-3 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 text-sm font-semibold transition-all">
                  Voltar
                </button>
                <button
                  onClick={() => setShowMidnightWarning(false)}
                  className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-semibold transition-all">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mb-6 flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: `${accent}22`, border: `1px solid ${accent}55` }}>
            <CalendarClock className="w-7 h-7" style={{ color: accent }} />
          </div>
          <h1 className="text-2xl font-bold text-white">{cfg?.title || "Agende seu atendimento"}</h1>
          {appt.serviceName && <p className="text-fuchsia-300 text-sm mt-1 font-semibold">{appt.serviceName}</p>}
          {cfg?.introMessage && <p className="text-white/60 text-sm mt-2 whitespace-pre-line">{cfg.introMessage}</p>}
          {appt.instructions && <p className="w-full text-white/60 text-sm mt-3 bg-white/5 border border-white/10 rounded-lg p-4 text-left whitespace-pre-line leading-relaxed">{appt.instructions}</p>}
        </div>

        <ScheduleOrderContext order={data.order} onLogout={logout} />

        {/* Aviso de reagendamento */}
        {cfg?.noShowWarning && (
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent shadow-lg shadow-amber-900/20">
            <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" />
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-300" />
                </span>
                <div className="leading-tight">
                  <p className="text-amber-200 text-sm font-extrabold uppercase tracking-wide">Atenção importante</p>
                  <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-green-300 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-0.5">
                    <MessageCircle className="w-3 h-3" /> Atendimento via WhatsApp
                  </span>
                </div>
              </div>
              <p className="text-amber-50/90 text-sm leading-relaxed whitespace-pre-line">{processWarningText(cfg.noShowWarning)}</p>
            </div>
          </div>
        )}

        {dates.length === 0 ? (
          <div className="bg-black/40 border border-white/10 rounded-2xl p-8 text-center">
            <Clock className="w-8 h-8 text-white/40 mx-auto mb-3" />
            <p className="text-white/60 text-sm">No momento não há horários disponíveis. Por favor, tente novamente mais tarde ou entre em contato.</p>
          </div>
        ) : (
          <>
            {/* Passo 1: escolher data */}
            <div className="bg-black/40 border border-white/10 rounded-2xl p-5 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold shrink-0" style={{ background: accent }}>1</span>
                <p className="text-base font-bold text-white flex items-center gap-2"><CalendarDays className="w-4 h-4" style={{ color: accent }} /> Escolha o dia</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {dates.map(d => {
                  const active = selectedDate === d;
                  const [wd, rest] = formatDateParts(d);
                  return (
                    <button key={d} onClick={() => { setSelectedDate(d); setSelectedSlot(null); setPeriodFilter('all'); }}
                      className={`flex flex-col items-center py-3 px-2 rounded-xl border transition-all active:scale-[0.97] ${active ? "text-white shadow-lg" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"}`}
                      style={active ? { background: accent, borderColor: accent, boxShadow: `0 8px 20px -8px ${accent}` } : {}}>
                      <span className={`text-[11px] uppercase font-semibold tracking-wide ${active ? "text-white/80" : "text-white/45"}`}>{wd}</span>
                      <span className="text-base font-extrabold leading-tight mt-0.5">{rest}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Passo 2: escolher horário */}
            {selectedDate && (
              <div className="bg-black/40 border border-white/10 rounded-2xl p-5 mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold shrink-0" style={{ background: accent }}>2</span>
                  <p className="text-base font-bold text-white flex items-center gap-2"><Clock className="w-4 h-4" style={{ color: accent }} /> Escolha o horário</p>
                </div>
                
                {/* Filtros de período */}
                <div className="mb-4 flex gap-2 flex-wrap">
                  {(['all', 'morning', 'afternoon', 'night', 'midnight'] as const).map(period => (
                    <button
                      key={period}
                      onClick={() => setPeriodFilter(period)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        periodFilter === period
                          ? 'text-white shadow-lg'
                          : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                      }`}
                      style={periodFilter === period ? { background: accent, borderColor: accent } : {}}>
                      {period === 'all' ? 'Todos' : getPeriodLabel(period as any)}
                    </button>
                  ))}
                </div>
                
                {slotsOfDay.length === 0 ? (
                  <p className="text-white/60 text-sm">Nenhum horário disponível para este dia</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {slotsOfDay
                      .filter(s => periodFilter === 'all' || getPeriod(s.slotTime) === periodFilter)
                      .map(s => {
                        const active = selectedSlot === s.id;
                        const period = getPeriod(s.slotTime);
                        const colors = getPeriodColor(period);
                        return (
                          <div key={s.id} className="flex flex-col items-center">
                            <button onClick={() => {
                              if (period === 'midnight') setShowMidnightWarning(true);
                              setSelectedSlot(s.id);
                            }}
                              className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-[0.97] ${
                                s.isBooked
                                  ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                                  : active
                                  ? 'text-white shadow-lg'
                                  : `bg-gradient-to-br ${colors?.bg} border ${colors?.border} text-white/80 hover:text-white`
                              }`}
                              style={active && !s.isBooked ? { background: accent, borderColor: accent, boxShadow: `0 8px 20px -8px ${accent}` } : {}}
                              disabled={s.isBooked}>
                              {s.slotTime}
                            </button>
                            {period === 'midnight' && <span className="text-[10px] text-purple-300 mt-1 font-semibold">madrugada</span>}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Passo 3: confirmar */}
            <button
              onClick={() => {
                if (selectedSlot) {
                  confirmMut.mutate({ token, accessToken, slotId: selectedSlot });
                } else {
                  toast.error('Selecione um horário');
                }
              }}
              disabled={!selectedSlot || confirmMut.isPending}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={selectedSlot && !confirmMut.isPending ? { background: accent } : { background: `${accent}44` }}>
              {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {confirmMut.isPending ? 'Confirmando...' : 'Confirmar Agendamento'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}


type TextSetter = (value: string) => void;

function ScheduleIdentityGate({
  identity,
  setIdentity,
  password,
  setPassword,
  step,
  setStep,
  needsPasswordCreation,
  onCreatePassword,
  busy,
  onSubmit,
}: {
  identity: string;
  setIdentity: TextSetter;
  password: string;
  setPassword: TextSetter;
  step: "identity" | "password";
  setStep: (value: "identity" | "password") => void;
  needsPasswordCreation: boolean;
  onCreatePassword: () => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  const isPasswordStep = step === "password";
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/40 bg-violet-500/15 shadow-[0_0_35px_rgba(139,92,246,.25)]">
            <ShieldCheck className="h-8 w-8 text-violet-300" />
          </div>
          <p className="text-xs font-black tracking-[.2em] text-violet-300">WALK AJUDA</p>
          <h1 className="mt-2 text-3xl font-black">{needsPasswordCreation ? "Crie sua senha" : isPasswordStep ? "Digite sua senha" : "Confirme seu acesso"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{needsPasswordCreation ? "Use o login principal para criar a senha e voltar a este agendamento." : isPasswordStep ? "A senha protege os dados do seu pedido e cadastro." : "Informe o telefone ou CPF do cadastro principal para continuar com este agendamento."}</p>
        </header>
        <form onSubmit={onSubmit} className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur sm:p-7">
          <div className="mb-5 rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4 text-sm text-violet-100">
            <p className="flex items-center gap-2 font-bold"><UserRoundCog className="h-5 w-5" />Acesso vinculado ao pedido</p>
            <p className="mt-1 text-xs text-violet-100/70">Os dados do pedido só aparecem depois da confirmação.</p>
          </div>
          {!isPasswordStep ? (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Telefone ou CPF</span>
              <input autoFocus value={identity} onChange={(event) => setIdentity(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15" placeholder="Telefone ou CPF" autoComplete="username" inputMode="numeric" />
            </label>
          ) : (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Senha</span>
              <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15" placeholder="Digite sua senha" autoComplete="current-password" minLength={4} />
            </label>
          )}
          {!needsPasswordCreation && <button type="submit" disabled={busy} className="mt-5 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-4 font-black shadow-lg shadow-violet-950/50 transition active:scale-[.98] disabled:opacity-50">
            {busy ? "CONFIRMANDO..." : isPasswordStep ? "ENTRAR" : "CONTINUAR"}
          </button>}
          {isPasswordStep && <button type="button" onClick={() => setStep("identity")} disabled={busy} className="mt-3 w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 disabled:opacity-50">Voltar e corrigir telefone/CPF</button>}
          {needsPasswordCreation && <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-center"><p className="text-sm font-bold text-amber-100">Este cadastro precisa de uma nova senha.</p><p className="mt-1 text-xs text-amber-100/75">Use o mesmo login principal para criar a senha e depois volte a este agendamento.</p><button type="button" onClick={onCreatePassword} className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-3 font-black text-slate-950 transition hover:bg-amber-400">CRIAR NOVA SENHA NO /LOGIN</button></div>}
          <p className="mt-4 text-center text-xs text-slate-500">Se não reconhecer este agendamento, não continue e fale com o atendimento.</p>
        </form>
      </div>
    </main>
  );
}

const PROFILE_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: "Nome completo",
  email: "E-mail",
  cpf: "CPF",
  city: "Cidade",
  uf: "UF",
  profilePhotoUrl: "Foto de perfil",
};

function ScheduleMissingProfileGate({
  missingFields,
  updateRequired,
  name,
  setName,
  phone,
  setPhone,
  email,
  setEmail,
  cpf,
  setCpf,
  city,
  setCity,
  uf,
  setUf,
  photoUrl,
  onLogout,
  uploading,
  saving,
  onPhoto,
  onSubmit,
}: {
  missingFields: string[];
  updateRequired: boolean;
  name: string;
  setName: TextSetter;
  phone: string;
  setPhone: TextSetter;
  email: string;
  setEmail: TextSetter;
  cpf: string;
  setCpf: TextSetter;
  city: string;
  setCity: TextSetter;
  uf: string;
  setUf: TextSetter;
  photoUrl: string;
  onLogout: () => void;
  uploading: boolean;
  saving: boolean;
  onPhoto: (file?: File) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const has = (field: string) => missingFields.includes(field);
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/15 shadow-[0_0_35px_rgba(245,158,11,.2)]">
            <UserRoundCog className="h-8 w-8 text-amber-300" />
          </div>
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-black tracking-[.2em] text-violet-300">WALK AJUDA</p><button type="button" onClick={onLogout} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/5">Sair</button></div>
          <h1 className="mt-2 text-3xl font-black">{updateRequired ? "Atualização cadastral obrigatória" : "Complete apenas o que falta"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{updateRequired ? "Atualização cadastral obrigatória pelo administrador. Conclua os campos solicitados e a foto antes de continuar." : `Encontramos ${missingFields.length} dado(s) incompleto(s) no cadastro principal. Os demais dados não serão alterados.`}</p>
        </header>
        <form onSubmit={onSubmit} className="space-y-5 rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur sm:p-7">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            <p className="font-bold">Dados necessários: {missingFields.map((field) => PROFILE_FIELD_LABELS[field] || field).join(", ")}</p>
            <p className="mt-1 text-xs text-amber-100/70">Campos já completos permanecem preservados.</p>
          </div>
          {has("profilePhotoUrl") && (
            <label className="block cursor-pointer rounded-2xl border border-dashed border-violet-400/50 bg-violet-400/5 p-4 text-center hover:bg-violet-400/10">
              {photoUrl ? <img src={photoUrl} alt="Pré-visualização da foto" className="mx-auto h-24 w-24 rounded-full object-cover ring-2 ring-violet-400" /> : <Upload className="mx-auto h-9 w-9 text-violet-300" />}
              <span className="mt-2 block text-sm font-bold">{uploading ? "Enviando foto..." : "Enviar foto de perfil"}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" disabled={uploading} onChange={(event) => onPhoto(event.target.files?.[0])} />
            </label>
          )}
          {has("phone") && <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Telefone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none focus:border-violet-500" required inputMode="tel" autoComplete="tel" /></label>}
          {has("name") && <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Nome completo</span><input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none focus:border-violet-500" required minLength={2} autoComplete="name" /></label>}
          {has("email") && <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">E-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none focus:border-violet-500" required type="email" autoComplete="email" /></label>}
          {has("cpf") && <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">CPF</span><input value={cpf} onChange={(event) => setCpf(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none focus:border-violet-500" required inputMode="numeric" placeholder="000.000.000-00" /></label>}
          {has("city") && <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Cidade</span><input value={city} onChange={(event) => setCity(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none focus:border-violet-500" required /></label>}
          {has("uf") && <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">UF</span><select value={uf} onChange={(event) => setUf(event.target.value)} className="w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none focus:border-violet-500" required><option value="">Selecione a UF</option>{PROFILE_UFS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
          {missingFields.some((field) => field !== "profilePhotoUrl") && <button type="submit" disabled={saving || uploading} className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-4 font-black shadow-lg shadow-violet-950/50 transition active:scale-[.98] disabled:opacity-50">{saving ? "SALVANDO..." : "SALVAR DADOS FALTANTES"}</button>}
        </form>
      </div>
    </main>
  );
}

function ScheduleOrderContext({ order, onLogout }: { order: any; onLogout: () => void }) {
  const appointmentLabels: Record<string, string> = { pending: "Aguardando escolha", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído" };
  return (
    <div className="mb-5 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-violet-200"><ShieldCheck className="h-4 w-4" /><p className="text-xs font-black uppercase tracking-wider">Resumo do pedido</p></div><button type="button" onClick={onLogout} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/5">Sair</button></div>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <p className="text-white/80"><span className="text-white/45">Pedido:</span> #{order?.registrationId}</p>
        <p className="text-white/80"><span className="text-white/45">Agendamento:</span> {appointmentLabels[order?.appointmentStatus] || "Em atualização"}</p>
        <p className="text-white/80 sm:col-span-2"><span className="text-white/45">Status do pedido:</span> <strong className="text-violet-200">{order?.orderStatusLabel || "Ainda não informado"}</strong></p>
      </div>
    </div>
  );
}
