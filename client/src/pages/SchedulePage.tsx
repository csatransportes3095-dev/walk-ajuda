import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, AlertTriangle, Clock, CalendarDays, Loader2, ShieldAlert, MessageCircle, AlertCircle } from "lucide-react";

export default function SchedulePage() {
  const params = useParams();
  const token = (params as any).token as string;
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.schedule.getByToken.useQuery({ token }, { enabled: !!token });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [showChangeDate, setShowChangeDate] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'all' | 'morning' | 'afternoon' | 'night' | 'midnight'>('all');
  const [showMidnightWarning, setShowMidnightWarning] = useState(false);

  const confirmMut = trpc.schedule.confirm.useMutation({
    onSuccess: () => { toast.success("Horário agendado com sucesso!"); utils.schedule.getByToken.invalidate({ token }); },
    onError: (e) => {
      toast.error(e.message);
      utils.schedule.getByToken.invalidate({ token });
      setSelectedSlot(null);
    },
  });

  const accent = (data?.found && data.config?.accentColor) || "#8b5cf6";

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
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    if (data?.found && data.slots && Array.isArray(data.slots)) {
      data.slots.forEach((s: any) => { 
        (g[s.slotDate] ||= []).push(s); 
      });
    }
    return g;
  }, [data?.slots]);

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

  const appt = data.appointment;
  const cfg = data.config;
  
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
                      confirmMut.mutate({ token, slotId: selectedSlot });
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
                  confirmMut.mutate({ token, slotId: selectedSlot });
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
