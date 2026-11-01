import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { ToggleLeft, ToggleRight, KeyRound, Bell, CalendarClock, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Clock, X, Check, Loader2, Search, Eye, EyeOff, Ban, UserX, Plus, Trash2, Ticket, Package, Globe, Send, TrendingUp, ShoppingBag, Lock, HelpCircle, Layers, MapPin, Upload, Mail, LayoutGrid, Users, Gift, Shield, Phone, FileSearch, MessageCircle, Settings2, RotateCcw, Save, ArrowLeftRight, Bot, MailPlus, Monitor, ScanFace, DatabaseZap, Car } from "lucide-react";
import { TIMEZONE_OPTIONS, DEFAULT_TIMEZONE } from "@/hooks/useTimezone";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const whiteInputStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', color: '#000000', fontSize: '16px',
  textAlign: 'center' as const, border: '2px solid #333', borderRadius: '8px',
  padding: '10px 12px', width: '100%', outline: 'none', fontWeight: 500,
};

const ADMIN_CARD_ORDER_KEY = 'admin_dashboard_card_order';

type AdminShortcut = {
  id: string;
  href: string;
  label: string;
  icon?: React.ElementType;
  emoji?: string;
  tone: string;
  iconTone?: string;
};

const ADMIN_SHORTCUTS: AdminShortcut[] = [
  { id: "h2-auto", href: "/admin/h2-auto", label: "H2 AUTO", icon: Bot, tone: "bg-cyan-500/20 border-cyan-400/40 hover:bg-cyan-500/30", iconTone: "text-cyan-300" },
  { id: "android-lab", href: "/adm/android-lab", label: "CELULAR ANDROID", icon: Monitor, tone: "bg-emerald-500/20 border-emerald-400/40 hover:bg-emerald-500/30", iconTone: "text-emerald-300" },
  { id: 'schedule', href: '/admin/schedule', label: 'Agendamentos', icon: CalendarClock, tone: 'bg-fuchsia-600/20 border-fuchsia-500/30 hover:bg-fuchsia-600/30', iconTone: 'text-fuchsia-400' },
  { id: 'h2ads', href: '/h2ads', label: 'H2 ADS', icon: Monitor, tone: 'bg-[#F5B800]/15 border-[#F5B800]/40 hover:bg-[#F5B800]/25', iconTone: 'text-[#FFE37A]' },
  { id: 'similaridade', href: '/similaridade', label: 'Similaridade', icon: ScanFace, tone: 'bg-cyan-600/20 border-cyan-500/35 hover:bg-cyan-600/30', iconTone: 'text-cyan-300' },
  { id: 'h2bico', href: '/admin/h2bico', label: 'H2BICO', icon: DatabaseZap, tone: 'bg-emerald-600/20 border-emerald-500/35 hover:bg-emerald-600/30', iconTone: 'text-emerald-300' },
  { id: 'banners', href: '/admin/banners', label: 'Banners', icon: Bell, tone: 'bg-teal-600/20 border-teal-500/30 hover:bg-teal-600/30', iconTone: 'text-teal-400' },
  { id: 'site-security', href: '/admin/site-security', label: 'Segurança do Site', icon: ShieldCheck, tone: 'bg-amber-600/20 border-amber-500/40 hover:bg-amber-600/30', iconTone: 'text-amber-300' },
  { id: 'ip-block', href: '/admin/ip-block', label: 'Bloquear IP', icon: Shield, tone: 'bg-red-600/20 border-red-500/30 hover:bg-red-600/30', iconTone: 'text-red-400' },
  { id: 'authenticator', href: '/admin/authenticator', label: 'Autenticador', icon: Lock, tone: 'bg-cyan-600/20 border-cyan-500/30 hover:bg-cyan-600/30', iconTone: 'text-cyan-300' },
  { id: 'referrer-bypass', href: '/admin/referrer-bypass', label: 'Bypass Indicador', icon: KeyRound, tone: 'bg-indigo-600/20 border-indigo-500/30 hover:bg-indigo-600/30', iconTone: 'text-indigo-400' },
  { id: 'products', href: '/admin/products', label: 'Cards', icon: Package, tone: 'bg-blue-600/20 border-blue-500/30 hover:bg-blue-600/30', iconTone: 'text-blue-400' },
  { id: 'vip', href: '/admin/vip', label: 'VIP', emoji: '👑', tone: 'bg-amber-600/20 border-amber-500/35 hover:bg-amber-600/30' },
  { id: 'feature-cards', href: '/admin/feature-cards', label: 'Cards Início', icon: Layers, tone: 'bg-indigo-600/20 border-indigo-500/30 hover:bg-indigo-600/30', iconTone: 'text-indigo-400' },
  { id: 'customers', href: '/admin/customers', label: 'Clientes', icon: Users, tone: 'bg-cyan-600/20 border-cyan-500/30 hover:bg-cyan-600/30', iconTone: 'text-cyan-400' },
  { id: 'commissions', href: '/admin/commissions', label: 'Comissões', icon: TrendingUp, tone: 'bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/30', iconTone: 'text-emerald-400' },
  { id: 'settings', href: '/admin/settings', label: 'Configurações', icon: Globe, tone: 'bg-orange-600/20 border-orange-500/30 hover:bg-orange-600/30', iconTone: 'text-orange-400' },
  { id: 'cep', href: '/admin/cep', label: 'Consulta CEP', icon: MapPin, tone: 'bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/30', iconTone: 'text-emerald-400' },
  { id: 'consultas', href: '/admin/consultas', label: 'Consultas', icon: FileSearch, tone: 'bg-orange-600/20 border-orange-500/30 hover:bg-orange-600/30', iconTone: 'text-orange-400' },
  { id: 'global-promo', href: '/admin/promocao-geral', label: 'Promoção Geral', icon: Ticket, tone: 'bg-rose-600/20 border-rose-500/40 hover:bg-rose-600/30', iconTone: 'text-rose-300' },
  { id: 'coupons', href: '/admin/coupons', label: 'Cupons', icon: Ticket, tone: 'bg-green-600/20 border-green-500/30 hover:bg-green-600/30', iconTone: 'text-green-400' },
  { id: 'email', href: '/admin/email', label: 'Emails', icon: Mail, tone: 'bg-blue-600/20 border-blue-500/30 hover:bg-blue-600/30', iconTone: 'text-blue-400' },
  { id: 'email-generator', href: '/admin/gerador-emails', label: 'Gerador E-mails', icon: MailPlus, tone: 'bg-yellow-600/20 border-yellow-500/35 hover:bg-yellow-600/30', iconTone: 'text-yellow-300' },
  { id: 'zoho-config', href: '/admin/zoho-config', label: 'Zoho Config', icon: ShieldCheck, tone: 'bg-purple-600/20 border-purple-500/30 hover:bg-purple-600/30', iconTone: 'text-purple-400' },
  { id: 'loans', href: '/admin/loans', label: 'Empréstimos', emoji: '💳', tone: 'bg-violet-600/20 border-violet-500/30 hover:bg-violet-600/30' },
  { id: 'cartoes-users', href: '/admin/cartoes-users', label: 'Cartões', emoji: '🃏', tone: 'bg-purple-600/20 border-purple-500/30 hover:bg-purple-600/30' },
  { id: 'broadcast', href: '/admin/broadcast', label: 'Envio em Massa', icon: Send, tone: 'bg-blue-600/20 border-blue-500/30 hover:bg-blue-600/30', iconTone: 'text-blue-400' },
  { id: 'faq', href: '/admin/faq', label: 'FAQ/Ajuda', icon: HelpCircle, tone: 'bg-violet-600/20 border-violet-500/30 hover:bg-violet-600/30', iconTone: 'text-violet-400' },
  { id: 'financeiro', href: '/admin/financeiro', label: 'Financeiro', icon: TrendingUp, tone: 'bg-green-600/20 border-green-500/30 hover:bg-green-600/30', iconTone: 'text-green-400' },
  { id: 'access-filters', href: '/admin/access-filters', label: 'Filtros Acesso', icon: Users, tone: 'bg-cyan-600/20 border-cyan-500/30 hover:bg-cyan-600/30', iconTone: 'text-cyan-400' },
  { id: 'flow-config', href: '/admin/flow-config', label: 'Fluxo', icon: Layers, tone: 'bg-sky-600/20 border-sky-500/30 hover:bg-sky-600/30', iconTone: 'text-sky-400' },
  { id: 'protected-photo', href: '/admin/protected-photo', label: 'Foto Prot.', icon: Lock, tone: 'bg-purple-900/30 border-purple-500/30 hover:bg-purple-900/50', iconTone: 'text-purple-400' },
  { id: 'gastos', href: '/admin/gastos', label: 'Gastos', icon: TrendingUp, tone: 'bg-purple-600/20 border-purple-500/30 hover:bg-purple-600/30', iconTone: 'text-purple-400' },
  { id: 'telefone', href: '/admin/telefone', label: 'Gerar Tel.', icon: Phone, tone: 'bg-green-600/20 border-green-500/30 hover:bg-green-600/30', iconTone: 'text-green-400' },
  { id: 'gerador-chassi', href: '/adm/chassis', label: 'Gerador Chassi', icon: Car, tone: 'bg-cyan-600/20 border-cyan-500/30 hover:bg-cyan-600/30', iconTone: 'text-cyan-300' },
  { id: 'conferencia-veiculo', href: '/adm/placa', label: 'Placa / Chassi Usados', icon: Search, tone: 'bg-fuchsia-600/20 border-fuchsia-500/35 hover:bg-fuchsia-600/30', iconTone: 'text-fuchsia-300' },
  { id: 'hub-central', href: '/admin/hub-central', label: 'Hub Central', icon: LayoutGrid, tone: 'bg-sky-600/20 border-sky-500/30 hover:bg-sky-600/30', iconTone: 'text-sky-400' },
  { id: 'online-support', href: '/admin/online-support', label: 'Atendimento', icon: MessageCircle, tone: 'bg-blue-600/20 border-blue-500/30 hover:bg-blue-600/30', iconTone: 'text-blue-400' },
  { id: 'orders', href: '/admin/orders', label: 'Pedidos', icon: Package, tone: 'bg-pink-600/20 border-pink-500/30 hover:bg-pink-600/30', iconTone: 'text-pink-400' },
  { id: 'pre-cadastros', href: '/admin/pre-cadastros', label: 'Pré-Cadastros', emoji: '📋', tone: 'bg-purple-600/20 border-purple-500/30 hover:bg-purple-600/30' },
  { id: 'propagandas', href: '/admin/propagandas', label: 'Propagandas', icon: Bell, tone: 'bg-cyan-600/20 border-cyan-500/30 hover:bg-cyan-600/30', iconTone: 'text-cyan-400' },
  { id: 'resellers', href: '/admin/resellers', label: 'Revendedores', icon: ShoppingBag, tone: 'bg-amber-600/20 border-amber-500/30 hover:bg-amber-600/30', iconTone: 'text-amber-400' },
  { id: 'codes', href: '/admin/codes', label: 'Análise Cadastros', icon: KeyRound, tone: 'bg-purple-600/20 border-purple-500/40 hover:bg-purple-600/30', iconTone: 'text-purple-400' },
  { id: 'raffles', href: '/admin/raffles', label: 'Sorteios', icon: Gift, tone: 'bg-yellow-600/20 border-yellow-500/30 hover:bg-yellow-600/30', iconTone: 'text-yellow-400' },
  { id: 'status-types', href: '/admin/status-types', label: 'Status', icon: Shield, tone: 'bg-indigo-600/20 border-indigo-500/30 hover:bg-indigo-600/30', iconTone: 'text-indigo-400' },
  { id: 'media', href: '/admin/media', label: 'Upload Mídia', icon: Upload, tone: 'bg-violet-600/20 border-violet-500/30 hover:bg-violet-600/30', iconTone: 'text-violet-400' },
  { id: 'whatsapp-templates', href: '/admin/whatsapp-templates', label: 'Msgs WhatsApp', icon: MessageCircle, tone: 'bg-green-600/20 border-green-500/30 hover:bg-green-600/30', iconTone: 'text-green-400' },
  { id: 'vpn', href: '/admin/vpn', label: 'VPN', icon: ShieldX, tone: 'bg-rose-600/20 border-rose-500/30 hover:bg-rose-600/30', iconTone: 'text-rose-400' },
];

export default function AdminCodes() {
  const search = useSearch();
  const urlPhone = new URLSearchParams(search).get('phone') ?? '';

  // ─── Timezone ─────────────────────────────────────────────────────────────
  const [selectedTz, setSelectedTz] = useState(DEFAULT_TIMEZONE);
  const configQuery = trpc.config.get.useQuery();
  const setConfigMutation = trpc.config.set.useMutation({
    onSuccess: () => toast.success('Fuso horário salvo!'),
    onError: () => toast.error('Erro ao salvar fuso horário'),
  });
  const trpcUtils = trpc.useUtils();
  const [cardOrder, setCardOrder] = useState<string[]>(() => ADMIN_SHORTCUTS.map((card) => card.id));
  const [isOrganizingCards, setIsOrganizingCards] = useState(false);
  const [cardOrderDirty, setCardOrderDirty] = useState(false);
  const [selectedCardForSwap, setSelectedCardForSwap] = useState<string | null>(null);
  const [showAllShortcuts, setShowAllShortcuts] = useState(false);
  const savedCardOrder = configQuery.data?.[ADMIN_CARD_ORDER_KEY];
  const saveCardOrderMutation = trpc.config.set.useMutation({
    onSuccess: () => {
      trpcUtils.config.get.invalidate();
      toast.success('Posição dos cards salva!');
    },
    onError: () => toast.error('Não foi possível salvar a posição dos cards.'),
  });

  useEffect(() => {
    if (!savedCardOrder) return;
    try {
      const saved = JSON.parse(savedCardOrder);
      if (!Array.isArray(saved)) return;
      const validIds = new Set(ADMIN_SHORTCUTS.map((card) => card.id));
      const ordered = saved.filter((id: unknown): id is string => typeof id === 'string' && validIds.has(id));
      const missing = ADMIN_SHORTCUTS.map((card) => card.id).filter((id) => !ordered.includes(id));
      if (ordered.length > 0) {
        setCardOrder(ordered.includes("h2-auto") ? [...ordered, ...missing] : ["h2-auto", ...ordered, ...missing.filter(id => id !== "h2-auto")]);
        setCardOrderDirty(false);
      }
    } catch {
      // Mantém a ordem padrão se uma configuração antiga estiver inválida.
    }
  }, [savedCardOrder]);

  const byAdminShortcutId = new Map(ADMIN_SHORTCUTS.map((card) => [card.id, card]));
  const orderedAdminShortcuts = [
    ...cardOrder.map((id) => byAdminShortcutId.get(id)).filter(Boolean) as AdminShortcut[],
    ...ADMIN_SHORTCUTS.filter((card) => !cardOrder.includes(card.id)),
  ];
  const featuredAdminShortcuts = orderedAdminShortcuts.slice(0, 12);
  const secondaryAdminShortcuts = orderedAdminShortcuts.slice(12);

  const saveCardOrder = () => {
    saveCardOrderMutation.mutate(
      { key: ADMIN_CARD_ORDER_KEY, value: JSON.stringify(cardOrder) },
      { onSuccess: () => setCardOrderDirty(false) },
    );
  };

  const swapCards = (cardId: string) => {
    if (!selectedCardForSwap) {
      setSelectedCardForSwap(cardId);
      return;
    }
    if (selectedCardForSwap === cardId) {
      setSelectedCardForSwap(null);
      return;
    }
    const firstIndex = cardOrder.indexOf(selectedCardForSwap);
    const secondIndex = cardOrder.indexOf(cardId);
    if (firstIndex < 0 || secondIndex < 0) return;
    const nextOrder = [...cardOrder];
    [nextOrder[firstIndex], nextOrder[secondIndex]] = [nextOrder[secondIndex], nextOrder[firstIndex]];
    setCardOrder(nextOrder);
    setCardOrderDirty(true);
    setSelectedCardForSwap(null);
  };

  const restoreDefaultCardOrder = () => {
    setCardOrder(ADMIN_SHORTCUTS.map((card) => card.id));
    setCardOrderDirty(true);
    setSelectedCardForSwap(null);
  };


  useEffect(() => {
    if (configQuery.data?.['timezone']) {
      setSelectedTz(configQuery.data['timezone']);
    }
  }, [configQuery.data]);

  const handleSaveTz = () => {
    setConfigMutation.mutate({ key: 'timezone', value: selectedTz }, {
      onSuccess: () => trpcUtils.config.get.invalidate(),
    });
  };

  // ─── Blocklist ────────────────────────────────────────────────────────────
  const [blockType, setBlockType] = useState<'name' | 'phone' | 'both'>('phone');
  const [blockName, setBlockName] = useState('');
  const [blockPhone, setBlockPhone] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [isAddingBlock, setIsAddingBlock] = useState(false);

  const blocklistQuery = trpc.blocklist.list.useQuery();
  const addBlockMutation = trpc.blocklist.add.useMutation({
    onSuccess: () => {
      toast.success('Bloqueio adicionado!');
      setBlockName(''); setBlockPhone(''); setBlockReason(''); setBlockType('phone'); setIsAddingBlock(false);
      blocklistQuery.refetch();
    },
    onError: (e) => toast.error(e.message || 'Erro ao adicionar bloqueio'),
  });
  const removeBlockMutation = trpc.blocklist.remove.useMutation({
    onSuccess: () => { toast.success('Bloqueio removido!'); blocklistQuery.refetch(); },
    onError: () => toast.error('Erro ao remover bloqueio'),
  });

  // Análise de novos cadastros: controle unificado, sem senhas de clientes.
  const [expandedPhoto,setExpandedPhoto] = useState<{url:string;name:string}|null>(null);
  const reviewModeQuery = trpc.registrationReview.mode.useQuery();
  const reviewsQuery = trpc.registrationReview.list.useQuery(undefined,{refetchInterval:30000});
  const reviewModeMutation = trpc.registrationReview.setMode.useMutation({
    onSuccess: () => { void reviewModeQuery.refetch(); void reviewsQuery.refetch(); toast.success("Modo de análise atualizado."); },
    onError: e => toast.error(e.message || "Falha ao alterar o modo."),
  });
  const approveReviewMutation = trpc.registrationReview.approve.useMutation({
    onSuccess: () => { void reviewsQuery.refetch(); toast.success("Cadastro aprovado. Acesso liberado."); },
    onError: e => toast.error(e.message || "Falha ao aprovar o cadastro."),
  });
  const reviewMode = reviewModeQuery.data || "automatico";
  const pendingReviews = (reviewsQuery.data || []).filter(item => item.status === "pending");

  const renderShortcutCard = (card: AdminShortcut, index: number, featured = false) => {
    const Icon = card.icon;
    const content = <>
      {card.emoji ? <span className="mb-1 block text-xl leading-5">{card.emoji}</span> : Icon ? <Icon className={`mx-auto mb-1 ${featured ? 'h-6 w-6' : 'h-5 w-5'} ${card.iconTone || 'text-white'}`} /> : null}
      <span className={`${featured ? 'text-sm' : 'text-xs'} font-bold text-white`}>{card.label}</span>
    </>;
    const surfaceClass = `${featured ? 'min-h-[96px] p-4' : 'min-h-[76px] p-3'} rounded-xl text-center transition-all ${card.tone}`;

    return (
      <div
        key={card.id}
        className={`relative min-w-0 rounded-xl border transition-all ${isOrganizingCards ? 'cursor-pointer ring-1 ring-purple-400/35 hover:scale-[1.02]' : ''} ${selectedCardForSwap === card.id ? 'ring-2 ring-cyan-300 bg-cyan-300/10 shadow-[0_0_22px_rgba(103,232,249,.28)]' : ''}`}
      >
        {isOrganizingCards && (
          <div className="pointer-events-none absolute inset-x-1 top-1 z-10 flex items-center justify-between gap-1">
            <span className="rounded-md bg-black/55 px-1.5 py-1 text-[10px] font-black text-purple-100" title="Posição atual">#{String(index + 1).padStart(2, '0')}</span>
            {selectedCardForSwap === card.id ? (
              <span className="rounded-md bg-cyan-300 px-1.5 py-1 text-[10px] font-black text-slate-950">1º escolhido</span>
            ) : (
              <span className="rounded-md bg-black/55 p-1 text-purple-200"><ArrowLeftRight className="h-3.5 w-3.5" /></span>
            )}
          </div>
        )}
        {isOrganizingCards ? (
          <button type="button" onClick={() => swapCards(card.id)} className={`${surfaceClass} w-full select-none pt-8`}>{content}</button>
        ) : (
          <a href={card.href} className={`block ${surfaceClass} hover:-translate-y-0.5 hover:shadow-lg`}>{content}</a>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      {/* Header */}
      <AdminHeader title="Painel Admin" icon={<KeyRound className="w-5 h-5" />} backTo="/" />

      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">

        {/* Atalhos administrativos — ordem configurável pelo ADM */}
        <section className="space-y-4" aria-label="Atalhos do painel administrativo">
          <div className="rounded-2xl border border-purple-400/20 bg-gradient-to-r from-purple-600/15 via-[#111127] to-transparent p-4 shadow-[0_12px_38px_rgba(0,0,0,.16)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-extrabold text-white"><LayoutGrid className="h-4 w-4 text-purple-300" /> Painel de acesso rápido</p>
                <p className="mt-1 text-xs text-white/55">{isOrganizingCards ? 'Toque em dois cards para trocar apenas as posições deles.' : 'As áreas mais usadas ficam em destaque; os demais atalhos continuam disponíveis abaixo.'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isOrganizingCards && (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={restoreDefaultCardOrder} disabled={saveCardOrderMutation.isPending} className="border-white/15 bg-white/5 text-white hover:bg-white/10"><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Padrão</Button>
                    <Button type="button" size="sm" onClick={saveCardOrder} disabled={!cardOrderDirty || saveCardOrderMutation.isPending} className="bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-45"><Save className="mr-1.5 h-3.5 w-3.5" /> Salvar ordem</Button>
                  </>
                )}
                <Button type="button" size="sm" onClick={() => { setIsOrganizingCards((value) => !value); setSelectedCardForSwap(null); }} className={isOrganizingCards ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-purple-600 text-white hover:bg-purple-500'}><Settings2 className="mr-1.5 h-3.5 w-3.5" />{isOrganizingCards ? 'Concluir' : 'Organizar cards'}</Button>
              </div>
            </div>
          </div>

          {isOrganizingCards ? (
            <>
              <div className="rounded-xl border border-purple-400/35 bg-purple-500/10 px-3 py-2 text-xs leading-relaxed text-purple-100">Toque no <strong>primeiro card</strong> e depois no <strong>segundo card</strong>. Somente esses dois cards trocam de lugar; todos os outros ficam parados. Quando terminar, toque em <strong>Salvar ordem</strong>.</div>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-6">{orderedAdminShortcuts.map((card, index) => renderShortcutCard(card, index))}</div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-purple-200">Uso diário</p><p className="mt-1 text-xs text-white/45">Os doze primeiros atalhos seguem a ordem que você definir.</p></div><span className="rounded-full border border-purple-300/20 bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-100">12 em destaque</span></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{featuredAdminShortcuts.map((card, index) => renderShortcutCard(card, index, true))}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.025]">
                <button type="button" onClick={() => setShowAllShortcuts((value) => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.035]">
                  <span><span className="block text-sm font-bold text-white">Todos os atalhos</span><span className="mt-1 block text-xs text-white/45">Configurações, comunicação, segurança e módulos complementares.</span></span>
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-purple-100">{showAllShortcuts ? 'Ocultar' : `Ver ${secondaryAdminShortcuts.length} atalhos`}</span>
                </button>
                {showAllShortcuts && <div className="border-t border-white/10 p-3 sm:p-4"><div className="grid grid-cols-3 gap-3 md:grid-cols-6">{secondaryAdminShortcuts.map((card, index) => renderShortcutCard(card, index + featuredAdminShortcuts.length))}</div></div>}
              </div>
            </>
          )}
        </section>

        {/* Gestão de novos cadastros: não usar o sistema legado de senhas. */}
        <section className="space-y-4 rounded-2xl border border-purple-500/30 bg-black/40 p-4 backdrop-blur-md md:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                <ShieldCheck className="h-6 w-6 text-purple-300" /> Análise de Novos Cadastros
              </h2>
              <p className="mt-1 text-sm text-white/60">O cliente confirma o e-mail e aguarda aprovação somente quando o modo manual estiver ativo.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-white/5 p-1.5">
              <button type="button" disabled={reviewModeMutation.isPending || reviewModeQuery.isLoading}
                onClick={() => reviewModeMutation.mutate({mode:"automatico"})}
                className={`rounded-lg px-3 py-2 text-xs font-black ${reviewMode==="automatico"?"bg-green-600 text-white":"text-white/60 hover:bg-white/10"}`}>AUTOMÁTICO</button>
              <button type="button" disabled={reviewModeMutation.isPending || reviewModeQuery.isLoading}
                onClick={() => reviewModeMutation.mutate({mode:"manual"})}
                className={`rounded-lg px-3 py-2 text-xs font-black ${reviewMode==="manual"?"bg-amber-500 text-black":"text-white/60 hover:bg-white/10"}`}>MANUAL</button>
            </div>
          </div>
          <p className="text-xs text-white/65">{reviewMode==="manual"
            ? "MANUAL: novos cadastros ficam aguardando o OK APROVADO do ADM."
            : "AUTOMÁTICO: novos cadastros são aprovados após cumprir as validações obrigatórias."}</p>
          {reviewsQuery.isLoading && <p className="text-sm text-white/50">Carregando cadastros...</p>}
          {reviewsQuery.isError && <p className="text-sm text-red-300">Não foi possível consultar as análises.</p>}
          <div className="space-y-3">
            <p className="text-sm font-bold text-amber-200">{pendingReviews.length} cadastro(s) aguardando análise</p>
            {pendingReviews.map(c => (
              <div key={c.customerId} className="flex flex-col gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center">
                {c.profilePhotoUrl && <button type="button" onClick={()=>setExpandedPhoto({url:c.profilePhotoUrl!,name:c.name})}
                  aria-label={`Ver foto de ${c.name}`}>
                  <img src={c.profilePhotoUrl} alt="" className="h-12 w-12 rounded-full border border-amber-400 object-cover" />
                </button>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{c.name} {c.customerNumber ? `*${c.customerNumber}` : ""}</p>
                  <p className="text-xs text-amber-100/70">{c.phone}</p>
                  <p className="text-xs text-amber-300">AGUARDANDO APROVAÇÃO</p>
                </div>
                <button type="button" disabled={approveReviewMutation.isPending}
                  onClick={()=>approveReviewMutation.mutate({customerId:c.customerId})}
                  className="rounded-xl bg-green-500 px-4 py-3 text-sm font-black text-black disabled:opacity-50">
                  OK APROVADO
                </button>
              </div>
            ))}
            {!reviewsQuery.isLoading && !reviewsQuery.isError && pendingReviews.length === 0 &&
              <p className="rounded-xl border border-white/10 p-3 text-center text-sm text-white/50">Nenhum cadastro aguardando aprovação.</p>}
          </div>
        </section>

        {/* ─── Bloqueio de Cadastro ───────────────────────────────────────────── */}
        <div className="bg-black/20 border border-red-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-400" />
              <h3 className="text-white font-semibold text-base">Bloqueio de Cadastro</h3>
              {blocklistQuery.data && blocklistQuery.data.length > 0 && (
                <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">{blocklistQuery.data.length}</span>
              )}
            </div>
            <button onClick={() => setIsAddingBlock(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-semibold transition-colors">
              <Plus className="w-3 h-3" /> Adicionar Bloqueio
            </button>
          </div>

          {isAddingBlock && (
            <div className="bg-black/30 border border-red-500/20 rounded-xl p-4 space-y-3">
              <p className="text-white/60 text-xs">Bloqueie um cadastro por nome, telefone ou ambos. O cliente não conseguirá se cadastrar.</p>
              <div className="flex gap-2">
                {(['phone', 'name', 'both'] as const).map(t => (
                  <button key={t} onClick={() => setBlockType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      blockType === t ? 'bg-red-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}>
                    {t === 'phone' ? '📱 Telefone' : t === 'name' ? '👤 Nome' : '🔒 Ambos'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {(blockType === 'phone' || blockType === 'both') && (
                  <input style={whiteInputStyle} placeholder="Telefone (somente números)" value={blockPhone}
                    onChange={e => setBlockPhone(e.target.value.replace(/\D/g, ''))}
                    maxLength={11} inputMode="numeric" />
                )}
                {(blockType === 'name' || blockType === 'both') && (
                  <input style={whiteInputStyle} placeholder="Nome completo (exato)" value={blockName}
                    onChange={e => setBlockName(e.target.value)} />
                )}
                <input style={whiteInputStyle} placeholder="Motivo (opcional)" value={blockReason}
                  onChange={e => setBlockReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => addBlockMutation.mutate({ type: blockType, name: blockName || undefined, phone: blockPhone || undefined, reason: blockReason || undefined })}
                  disabled={addBlockMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs flex-1">
                  <Ban className="w-3 h-3 mr-1" /> Confirmar Bloqueio
                </Button>
                <Button onClick={() => setIsAddingBlock(false)} variant="outline" className="text-xs">
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {blocklistQuery.isLoading ? (
            <p className="text-white/40 text-sm text-center py-2">Carregando...</p>
          ) : !blocklistQuery.data || blocklistQuery.data.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-3">Nenhum cadastro bloqueado.</p>
          ) : (
            <div className="space-y-2">
              {blocklistQuery.data.map(entry => (
                <div key={entry.id} className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserX className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase">
                          {entry.type === 'phone' ? 'Tel' : entry.type === 'name' ? 'Nome' : 'Ambos'}
                        </span>
                        {entry.phone && <span className="text-white font-mono text-sm">{entry.phone}</span>}
                        {entry.name && <span className="text-white/80 text-sm">{entry.name}</span>}
                      </div>
                      {entry.reason && <p className="text-white/40 text-xs mt-0.5 truncate">{entry.reason}</p>}
                    </div>
                  </div>
                  <button onClick={() => { if (confirm('Remover este bloqueio?')) removeBlockMutation.mutate({ id: entry.id }); }}
                    className="ml-2 flex-shrink-0 px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-semibold transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Fuso Horário ───────────────────────────────────────────────────── */}
        <div className="border-2 border-blue-500/50 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-blue-500/15">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-blue-300 text-sm">Fuso Horário do Sistema</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-white/60">Selecione o fuso horário para exibição de datas e horários em todo o painel.</p>
            <div className="flex gap-2">
              <select
                value={selectedTz}
                onChange={e => setSelectedTz(e.target.value)}
                style={{ ...whiteInputStyle, textAlign: 'left' }}
              >
                {TIMEZONE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={handleSaveTz}
                disabled={setConfigMutation.isPending}
                className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {setConfigMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
            <div className="text-xs text-white/50">
              Horário atual: <span className="text-white/80 font-mono">
                {new Date().toLocaleString('pt-BR', { timeZone: selectedTz, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Modal de foto expandida */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setExpandedPhoto(null)}
        >
          <div className="relative max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExpandedPhoto(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-7 h-7" />
            </button>
            <img
              src={expandedPhoto.url}
              alt={expandedPhoto.name}
              className="w-full rounded-2xl object-cover shadow-2xl border-2 border-amber-400/40"
            />
            <p className="text-center text-white font-bold mt-3 text-base">{expandedPhoto.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
