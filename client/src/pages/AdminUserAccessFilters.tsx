"use client";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Users, Clock, TrendingUp, WifiOff, MessageCircle,
  FileText, Loader2, Search, Phone, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";

function fmtDate(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
}

type Client = {
  id: number;
  name: string;
  phone: string;
  cpf?: string | null;
  lastAccess: string | null;
  totalAccess: number;
  accessLast7Days: number;
  passwordStatus: string;
  profilePhotoUrl?: string | null;
};

type OfferState = {
  clientName: string;
  clientPhone: string;
  offerAmount: string;
  paymentType: "diario" | "semanal" | "quinzenal" | "mensal";
  workDays: "seg_sab" | "seg_dom";
  customMessage: string;
};

const DEFAULT_OFFER: OfferState = {
  clientName: "",
  clientPhone: "",
  offerAmount: "1000",
  paymentType: "diario",
  workDays: "seg_sab",
  customMessage: "",
};

export default function AdminUserAccessFilters() {
  const [activeFilter, setActiveFilter] = useState<"today" | "ranking" | "inactive">("today");
  const [search, setSearch] = useState("");
  const [offerModal, setOfferModal] = useState<OfferState | null>(null);
  const [offerResult, setOfferResult] = useState<{ pdfUrl: string; whatsappUrl: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const clientsQuery = trpc.spreadsheet.adminListClientsWithStatus.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const generateOffer = trpc.loans.generateLoanOffer.useMutation();

  const allClients: Client[] = clientsQuery.data || [];
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const todayClients = useMemo(() =>
    allClients.filter(c => c.lastAccess && new Date(c.lastAccess) >= todayStart),
    [allClients]
  );

  const rankingClients = useMemo(() =>
    [...allClients].sort((a, b) => (b.totalAccess ?? 0) - (a.totalAccess ?? 0)).slice(0, 50),
    [allClients]
  );

  const inactiveClients = useMemo(() => {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    return allClients.filter(c => {
      if (!c.lastAccess) return true;
      return new Date(c.lastAccess).getTime() < sevenDaysAgo;
    });
  }, [allClients]);

  const displayList = useMemo(() => {
    const base = activeFilter === "today" ? todayClients
      : activeFilter === "ranking" ? rankingClients
      : inactiveClients;
    if (!search.trim()) return base;
    const s = search.toLowerCase();
    return base.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.phone.replace(/\D/g,"").includes(s.replace(/\D/g,""))
    );
  }, [activeFilter, todayClients, rankingClients, inactiveClients, search]);

  const handleOpenOffer = (c: Client) => {
    setOfferResult(null);
    setOfferModal({ ...DEFAULT_OFFER, clientName: c.name, clientPhone: c.phone });
  };

  const handleGenerateOffer = async () => {
    if (!offerModal) return;
    try {
      const res = await generateOffer.mutateAsync({
        clientPhone: offerModal.clientPhone,
        offerAmount: parseFloat(offerModal.offerAmount) || 1000,
        paymentType: offerModal.paymentType,
        workDays: offerModal.workDays,
        customMessage: offerModal.customMessage || undefined,
      });
      setOfferResult({ pdfUrl: res.pdfUrl, whatsappUrl: res.whatsappUrl });
    } catch (e: any) {
      alert("Erro ao gerar oferta: " + (e?.message || "Tente novamente"));
    }
  };

  const filterCards = [
    {
      id: "today" as const,
      label: "Acesso Hoje",
      count: todayClients.length,
      icon: Clock,
      color: "from-emerald-600 to-emerald-800",
      border: "border-emerald-500/40",
      badge: "bg-emerald-500",
    },
    {
      id: "ranking" as const,
      label: "Ranking de Acesso",
      count: rankingClients.length,
      icon: TrendingUp,
      color: "from-blue-600 to-blue-800",
      border: "border-blue-500/40",
      badge: "bg-blue-500",
    },
    {
      id: "inactive" as const,
      label: "Sem Acesso 7+ dias",
      count: inactiveClients.length,
      icon: WifiOff,
      color: "from-red-600 to-red-800",
      border: "border-red-500/40",
      badge: "bg-red-500",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <div>
          <h1 className="text-xl font-bold text-white">Filtros de Acesso</h1>
          <p className="text-slate-400 text-xs">Planilha de Motoristas</p>
        </div>
        <button
          onClick={() => clientsQuery.refetch()}
          disabled={clientsQuery.isFetching}
          className="ml-auto text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${clientsQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Cards de filtro */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {filterCards.map(fc => {
          const Icon = fc.icon;
          const isActive = activeFilter === fc.id;
          return (
            <button
              key={fc.id}
              onClick={() => setActiveFilter(fc.id)}
              className={`rounded-2xl p-4 flex flex-col items-center gap-2 border transition-all duration-200 ${
                isActive
                  ? `bg-gradient-to-b ${fc.color} ${fc.border} shadow-lg scale-[1.03]`
                  : "bg-slate-800/60 border-slate-700/40 hover:border-slate-500/60"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? "bg-white/15" : "bg-slate-700/60"}`}>
                <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-400"}`} />
              </div>
              <span className={`text-xs font-bold text-center leading-tight ${isActive ? "text-white" : "text-slate-400"}`}>
                {fc.label}
              </span>
              <span className={`text-2xl font-black ${isActive ? "text-white" : "text-slate-300"}`}>
                {clientsQuery.isLoading ? "—" : fc.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
        />
      </div>

      {/* Lista */}
      {clientsQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      )}

      {!clientsQuery.isLoading && displayList.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum cliente encontrado neste filtro.</p>
        </div>
      )}

      <div className="space-y-3">
        {displayList.map((c, idx) => {
          const isExpanded = expandedId === c.id;
          const daysSince = c.lastAccess
            ? Math.floor((now - new Date(c.lastAccess).getTime()) / (1000 * 60 * 60 * 24))
            : null;

          return (
            <div
              key={c.id}
              className="bg-slate-800/70 border border-slate-700/50 rounded-2xl overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                {/* Avatar */}
                {c.profilePhotoUrl ? (
                  <img src={c.profilePhotoUrl} alt={c.name} className="w-11 h-11 rounded-full object-cover border-2 border-slate-600 flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 border-2 border-slate-600">
                    <span className="text-white font-bold text-base">{(c.name || "?")[0].toUpperCase()}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {/* Ranking badge */}
                  {activeFilter === "ranking" && (
                    <span className="text-xs font-bold text-blue-400 mr-1">#{idx + 1}</span>
                  )}
                  <p className="text-white font-bold text-sm truncate">{c.name}</p>
                  <p className="text-slate-400 text-xs">{fmtPhone(c.phone)}</p>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {activeFilter === "ranking" && (
                    <span className="text-xs font-bold text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded-full">
                      {c.totalAccess} acessos
                    </span>
                  )}
                  {activeFilter === "today" && (
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded-full">
                      Hoje
                    </span>
                  )}
                  {activeFilter === "inactive" && daysSince !== null && (
                    <span className="text-xs font-bold text-red-300 bg-red-900/40 px-2 py-0.5 rounded-full">
                      {daysSince}d sem acesso
                    </span>
                  )}
                  {activeFilter === "inactive" && daysSince === null && (
                    <span className="text-xs font-bold text-slate-400 bg-slate-700/60 px-2 py-0.5 rounded-full">
                      Nunca acessou
                    </span>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 mt-1" />}
                </div>
              </button>

              {/* Detalhes expandidos */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-700/40 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-700/40 rounded-xl p-3">
                      <p className="text-slate-400 mb-1">Último acesso</p>
                      <p className="text-white font-bold">{fmtDate(c.lastAccess)}</p>
                    </div>
                    <div className="bg-slate-700/40 rounded-xl p-3">
                      <p className="text-slate-400 mb-1">Total de acessos</p>
                      <p className="text-white font-bold">{c.totalAccess}</p>
                    </div>
                    <div className="bg-slate-700/40 rounded-xl p-3">
                      <p className="text-slate-400 mb-1">Últimos 7 dias</p>
                      <p className="text-white font-bold">{c.accessLast7Days}</p>
                    </div>
                    <div className="bg-slate-700/40 rounded-xl p-3">
                      <p className="text-slate-400 mb-1">Status senha</p>
                      <p className={`font-bold capitalize ${
                        c.passwordStatus === "active" ? "text-emerald-400"
                        : c.passwordStatus === "expired" ? "text-red-400"
                        : c.passwordStatus === "pending" ? "text-amber-400"
                        : "text-slate-400"
                      }`}>{c.passwordStatus}</p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={`https://wa.me/55${c.phone.replace(/\D/g,"")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                    <button
                      onClick={() => handleOpenOffer(c)}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Oferta Empréstimo
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de oferta de empréstimo */}
      {offerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-blue-500/30 rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                Oferta de Empréstimo
              </h3>
              <button onClick={() => { setOfferModal(null); setOfferResult(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {!offerResult ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Cliente</label>
                  <Input
                    value={offerModal.clientName}
                    onChange={e => setOfferModal(p => p ? { ...p, clientName: e.target.value } : p)}
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Telefone</label>
                  <Input
                    value={offerModal.clientPhone}
                    onChange={e => setOfferModal(p => p ? { ...p, clientPhone: e.target.value } : p)}
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valor da Oferta (R$)</label>
                  <Input
                    type="number"
                    value={offerModal.offerAmount}
                    onChange={e => setOfferModal(p => p ? { ...p, offerAmount: e.target.value } : p)}
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">Juros e prazo serão buscados do perfil do cliente</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tipo de Pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["diario", "semanal", "quinzenal", "mensal"] as const).map(pt => (
                      <button
                        key={pt}
                        onClick={() => setOfferModal(p => p ? { ...p, paymentType: pt } : p)}
                        className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                          offerModal.paymentType === pt
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-slate-700 border-slate-600 text-slate-300 hover:border-blue-500"
                        }`}
                      >
                        {pt === "diario" ? "Diário" : pt === "semanal" ? "Semanal" : pt === "quinzenal" ? "Quinzenal" : "Mensal"}
                      </button>
                    ))}
                  </div>
                </div>
                {offerModal.paymentType === "diario" && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Dias Úteis</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["seg_sab", "seg_dom"] as const).map(wd => (
                        <button
                          key={wd}
                          onClick={() => setOfferModal(p => p ? { ...p, workDays: wd } : p)}
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                            offerModal.workDays === wd
                              ? "bg-emerald-600 border-emerald-500 text-white"
                              : "bg-slate-700 border-slate-600 text-slate-300 hover:border-emerald-500"
                          }`}
                        >
                          {wd === "seg_sab" ? "Seg–Sáb" : "Seg–Dom"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Mensagem personalizada (opcional)</label>
                  <textarea
                    value={offerModal.customMessage}
                    onChange={e => setOfferModal(p => p ? { ...p, customMessage: e.target.value } : p)}
                    placeholder="Deixe em branco para usar mensagem padrão..."
                    rows={3}
                    className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
                  />
                </div>
                <Button
                  onClick={handleGenerateOffer}
                  disabled={generateOffer.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {generateOffer.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Gerando PDF...</>
                  ) : (
                    <><FileText className="w-4 h-4 mr-2" />Gerar PDF + Link WhatsApp</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">✅</div>
                  <p className="text-emerald-300 font-bold text-sm">PDF gerado com sucesso!</p>
                </div>
                <a
                  href={offerResult.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold px-4 py-3 rounded-xl transition-colors"
                >
                  <FileText className="w-4 h-4 text-blue-400" />
                  Ver PDF da Oferta
                </a>
                <a
                  href={offerResult.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-3 rounded-xl transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Enviar via WhatsApp
                </a>
                <Button
                  onClick={() => setOfferResult(null)}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white"
                >
                  Gerar outra oferta
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
