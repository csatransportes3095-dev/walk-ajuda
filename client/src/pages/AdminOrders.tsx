import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Package, Clock, FileCheck, Zap, ChevronDown, ChevronUp, Search,
  RefreshCw, Trash2, XCircle, DollarSign, User, MapPin, Phone,
  Mail, UserCheck, Edit3, Check, X, CheckSquare, Square, Trash, Plus, Camera, Download, Calendar, MessageCircle,
  ArrowUpDown, ArrowUp, ArrowDown, Wrench, Layers, Star, AlertCircle, Info, CheckCircle2, SlidersHorizontal, Upload, ZoomIn, FolderOpen,
} from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import OrderScheduleBlock from "@/components/OrderScheduleBlock";
import ScheduleStatusBadge from "@/components/ScheduleStatusBadge";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useTimezone } from "@/hooks/useTimezone";
import { NotesTab } from "@/components/NotesTab";
import { AuthenticatorQrAdminField, type PendingQr } from "@/components/AuthenticatorQrAdminField";
import { OrderLoginAuthenticatorCode } from "@/components/OrderLoginAuthenticatorCode";
import OrderH2AdsBrowserShortcut from "@/components/OrderH2AdsBrowserShortcut";
import { normalizePublicSiteLinks, normalizeWhatsAppTrackingLinks, publicSiteUrl, publicTrackingShareUrl } from "@shared/publicLinks";
import { getOperationalBucket } from "@shared/orderBuckets";
import { repairWhatsappReplacementIcons } from "@shared/whatsappMessageText";
import { selectWhatsappTemplateForStatus } from "@shared/whatsappTemplateSelection";
import { snapshotUnicodeText } from "@shared/whatsappUnicodeDiagnostics";
import { getConfiguredGlobalProgressKeys, getDefaultGlobalProgressKeys } from "@shared/orderProgressSequence";

type OrderStatus = "recebido" | "pagamento_recebido" | "em_andamento" | "em_montagem" | "documentos_aprovados" | "conta_ativa" | "aguardando_ativa" | "pedido_entregue" | "cancelado";

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  recebido:            { label: "Recebido",       color: "text-orange-400",  bg: "bg-orange-500/20 border-orange-500/40",   icon: <Package className="w-4 h-4" /> },
  pagamento_recebido:  { label: "Pgto. Recebido", color: "text-amber-400",   bg: "bg-amber-500/20 border-amber-500/40",     icon: <DollarSign className="w-4 h-4" /> },
  em_andamento:        { label: "Em Andamento",   color: "text-orange-300",  bg: "bg-orange-400/20 border-orange-400/40",   icon: <Clock className="w-4 h-4" /> },
  em_montagem:         { label: "Em Montagem",    color: "text-blue-400",    bg: "bg-blue-500/20 border-blue-500/40",       icon: <Wrench className="w-4 h-4" /> },
  documentos_aprovados:{ label: "Docs Aprovados", color: "text-amber-300",   bg: "bg-amber-400/20 border-amber-400/40",     icon: <FileCheck className="w-4 h-4" /> },
  conta_ativa:         { label: "Conta Ativa",    color: "text-green-400",   bg: "bg-green-500/20 border-green-500/40",     icon: <Zap className="w-4 h-4" /> },
  aguardando_ativa:    { label: "Ag. Ficar Ativa", color: "text-lime-400",    bg: "bg-lime-500/20 border-lime-500/40",       icon: <Clock className="w-4 h-4" /> },
  pedido_entregue:     { label: "Entregue",       color: "text-teal-400",    bg: "bg-teal-500/20 border-teal-500/40",       icon: <Package className="w-4 h-4" /> },
  cancelado:           { label: "Cancelado",      color: "text-red-400",     bg: "bg-red-500/20 border-red-500/40",         icon: <XCircle className="w-4 h-4" /> },
};

const STATUS_ORDER: OrderStatus[] = ["recebido", "pagamento_recebido", "em_andamento", "em_montagem", "documentos_aprovados", "conta_ativa", "aguardando_ativa", "pedido_entregue", "cancelado"];

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

type Order = {
  id: number;
  codeId: number;
  phone: string;
  accessedAt: number;
  submittedAt: number | null;
  consumed: number;
  codeClientName: string | null;
  codeType: string | null;
  customerId: number | null;
  customerEmail: string | null;
  customerName: string | null;
  customerCep: string | null;
  customerStreet: string | null;
  customerAddressNumber: string | null;
  customerNeighborhood: string | null;
  customerAddressComplement: string | null;
  customerCity: string | null;
  customerUf: string | null;
  customerReferredBy: string | null;
  customerReferredByPhone: string | null;
  customerProfilePhotoUrl: string | null;
  latestStatus: string | null;
  latestStatusAt: number | null;
  deliveredNotifiedAt: number | null;
  serviceName: string | null;
  serviceOption: string | null;
  pricePaid: string | null;
  answers: string | null;
  isUrgent: number;
  commissionPaid: number;
  orderNumber: number | null;
  customerNumber: number | null;
  deliveryEstimate: number | null;
  subOrderIndex: number;
  orderSource: string;
  refCode: string | null;
  refOwnerName: string | null;
  hasNewDocResponse?: boolean;
  hasNewTrackingAnswer?: boolean;
  folderName?: string | null;
  folderIcon?: string | null;
  isBlocked?: boolean;
  // Agrupamento de carrinho
  cartGroupId?: string | null;
  cartTotal?: number | null;
  cartCouponCode?: string | null;
  cartCouponDiscount?: number | null;
  cartItemIndex?: number;
  thirdPartyName?: string | null;
  resellerDiscountApplied?: number | null;
};
// Helper para gerar chave única de cada sub-pedidoo
const getOrderKey = (order: Order): string => `${order.id}_${order.subOrderIndex ?? 0}`;
const getIdFromKey = (key: string): number => parseInt(key.split('_')[0], 10);


type EditData = {
  name: string;
  phone: string;
  email: string;
  city: string;
  uf: string;
  referredBy: string;
  referredByPhone: string;
  customerNumber: string;
};

function EmailTrackingBadge({ registrationId, subOrderIndex }: { registrationId: number; subOrderIndex: number }) {
  const trackingQuery = trpc.orderStatus.getEmailTracking.useQuery(
    { registrationId, subOrderIndex },
    { refetchInterval: 30000 }
  );
  const tracking = trackingQuery.data;
  if (!tracking || (!tracking.sentAt && !tracking.opened)) return null;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
      tracking.opened
        ? 'bg-green-500/10 border-green-500/30 text-green-400'
        : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
    }`}>
      {tracking.opened ? (
        <>
          <span className="text-green-400">✉️</span>
          <span>Email lido</span>
          {tracking.openedAt && (
            <span className="text-green-500/70 ml-auto">
              {new Date(tracking.openedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {tracking.openCount > 1 && (
            <span className="text-green-500/60 text-[10px]">({tracking.openCount}x)</span>
          )}
        </>
      ) : (
        <>
          <span>📧</span>
          <span>Email enviado (não lido)</span>
        </>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <span className="text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className="text-foreground flex-1 truncate">{value}</span>
    </div>
  );
}

// Configuração global da sequência exibida para TODOS os clientes em /acompanhar.
function GlobalProgressSequenceModal({
  open,
  onClose,
  statuses,
  savedKeys,
  enabled,
  onSave,
  isSaving,
  statusConfig,
}: {
  open: boolean;
  onClose: () => void;
  statuses: any[];
  savedKeys: string[];
  enabled: boolean;
  onSave: (keys: string[]) => void;
  isSaving: boolean;
  statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }>;
}) {
  const initialKeys = React.useMemo(() => {
    if (enabled && savedKeys.length > 0) return savedKeys;
    const configured = getConfiguredGlobalProgressKeys(statuses);
    return configured.length > 0 ? configured : getDefaultGlobalProgressKeys(statuses);
  }, [enabled, savedKeys.join(','), statuses]);
  const [localKeys, setLocalKeys] = useState<string[]>(initialKeys);

  useEffect(() => { if (open) setLocalKeys(initialKeys); }, [open, initialKeys.join(',')]);
  if (!open) return null;

  const available = statuses.filter((s: any) => s.isActive === 1 && s.key !== 'cancelado');
  const add = (key: string) => setLocalKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  const remove = (key: string) => setLocalKeys(prev => prev.filter(k => k !== key));
  const move = (idx: number, delta: number) => setLocalKeys(prev => {
    const target = idx + delta;
    if (target < 0 || target >= prev.length) return prev;
    const next = [...prev];
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  });

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-purple-500/40 bg-[#09091a] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#09091a]/95 p-4 backdrop-blur">
          <div>
            <p className="text-sm font-black text-purple-300">SEQUÊNCIA GLOBAL DO CLIENTE</p>
            <p className="mt-1 text-xs text-white/45">Configure uma vez. Esta ordem passa a valer automaticamente para pedidos antigos e novos em /acompanhar.</p>
            <p className="mt-1 text-[10px] text-emerald-400/80">Não altera filtros, pastas, agendamentos, status atual, Arquivo, RG/CNH ou Entregues.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-white/10 p-2 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-4">
          {!enabled && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Modo seguro: nada muda para os clientes até você clicar em <b>Salvar sequência global</b> pela primeira vez.
            </div>
          )}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Ordem que o cliente verá</p>
            {localKeys.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/35">Adicione pelo menos um status.</p>}
            {localKeys.map((key, idx) => {
              const cfg = statusConfig[key];
              if (!cfg) return null;
              return (
                <div key={key} className={`flex items-center gap-2 rounded-xl border border-white/10 p-2.5 ${cfg.bg}`}>
                  <span className="w-6 text-center text-xs font-black text-white/50">{idx + 1}</span>
                  <span className="scale-90">{cfg.icon}</span>
                  <span className={`min-w-0 flex-1 text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === localKeys.length - 1} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
                  <button onClick={() => remove(key)} className="rounded-lg p-1.5 text-red-400/70 hover:bg-red-500/15 hover:text-red-300"><X className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Adicionar status</p>
            <div className="flex flex-wrap gap-2">
              {available.filter((s: any) => !localKeys.includes(s.key)).map((s: any) => {
                const cfg = statusConfig[s.key];
                if (!cfg) return null;
                return <button key={s.key} onClick={() => add(s.key)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65 hover:bg-white/10">+ {cfg.label}</button>;
              })}
            </div>
          </div>
          <button
            onClick={() => onSave(localKeys)}
            disabled={isSaving || localKeys.length === 0}
            className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-black text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? 'SALVANDO...' : 'SALVAR SEQUÊNCIA GLOBAL'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ===== SUB-COMPONENTE: STATUS TAB DA PASTA PERSONALIZADA =====
function FolderOrderStatusTab({ ar, folderId, customFolders, moveToFolderMut, removeFromFolderMut }: any) {
  const [movePastaOpen, setMovePastaOpen] = React.useState(false);
  const otherFolders = (customFolders || []).filter((f: any) => f.id !== folderId);
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status atual: <span className="text-foreground">{ar.latestStatus || 'sem status'}</span></p>
      {otherFolders.length > 0 && (
        <div>
          <button
            onClick={() => setMovePastaOpen(o => !o)}
            className={`w-full py-2 px-3 border rounded-lg text-xs font-medium transition-colors ${
              movePastaOpen
                ? 'bg-purple-500/25 border-purple-500/50 text-purple-200'
                : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
            }`}
          >
            📂 Mover para outra pasta {movePastaOpen ? '▲' : '▼'}
          </button>
          {movePastaOpen && (
            <div className="mt-1 flex flex-col border border-border rounded-lg overflow-hidden">
              {otherFolders.map((f: any) => (
                <button
                  key={f.id}
                  onClick={() => {
                    moveToFolderMut.mutate({ folderId: f.id, registrationId: ar.registrationId, subOrderIndex: ar.subOrderIndex });
                    setMovePastaOpen(false);
                  }}
                  disabled={moveToFolderMut?.isPending}
                  className="text-left px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors border-b border-border last:border-0"
                >
                  {f.icon ? `${f.icon} ` : '📁 '}{f.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => { if (confirm('Remover este pedido da pasta?')) removeFromFolderMut.mutate({ folderId, registrationId: ar.registrationId, subOrderIndex: ar.subOrderIndex }); }}
        className="w-full py-2 px-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
      >
        Remover da Pasta (volta para pedidos)
      </button>
    </div>
  );
}

// ===== COMPONENTE DE PASTA PERSONALIZADA =====
function CustomFolderTab({ folderId, expandedId, setExpandedId, expandedCustomFolderId, setExpandedCustomFolderId, activeTab, setActiveTab, removeFromFolderMut, moveToFolderMut, customFolders, historyQuery, filesQuery, orderNoteQuery, saveNoteMut, noteText, setNoteText, viewedOrders, formatDate }: any) {
  const folderOrdersQuery = trpc.folders.listOrders.useQuery({ folderId }, { staleTime: 0, refetchOnWindowFocus: true });
  const [cfSortKey, setCfSortKey] = React.useState<'number'|'name'|'date'>('number');
  const [cfSortDir, setCfSortDir] = React.useState<'asc'|'desc'>('asc');
  const [editingPrice, setEditingPrice] = React.useState<Record<string, string>>({});
  const updatePriceMutation = trpc.orderStatus.updateOrderData.useMutation({
    onSuccess: (_, vars) => {
      toast.success('Valor atualizado!');
      setEditingPrice(prev => { const n = { ...prev }; delete n[String(vars.registrationId)]; return n; });
      folderOrdersQuery.refetch();
    },
    onError: () => toast.error('Erro ao atualizar valor'),
  });
  const rawOrders = (folderOrdersQuery.data || []) as unknown as Array<{
    id: number; registrationId: number; customerPhone: string; customerName: string;
    customerNumber: number | null; city: string | null; uf: string | null;
    email: string | null; serviceName: string | null; serviceOption: string | null;
    pricePaid: string | null; orderNumber: number | null; answers: string | null; latestStatus: string | null;
    latestStatusAt: number | null; note: string | null; accessedAt: number | null;
    profilePhotoUrl: string | null; subOrderIndex: number;
  }>;
  const orders = React.useMemo(() => {
    const list = [...rawOrders];
    list.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (cfSortKey === 'number') { va = a.orderNumber ?? a.customerNumber ?? 0; vb = b.orderNumber ?? b.customerNumber ?? 0; }
      else if (cfSortKey === 'name') { va = (a.customerName || '').toLowerCase(); vb = (b.customerName || '').toLowerCase(); }
      else if (cfSortKey === 'date') { va = a.accessedAt ?? 0; vb = b.accessedAt ?? 0; }
      if (typeof va === 'string') return cfSortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return cfSortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return list;
  }, [rawOrders, cfSortKey, cfSortDir]);

  return (
    <div className="border border-purple-500/40 rounded-xl overflow-hidden">
      {rawOrders.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-500/20 bg-purple-500/5">
          <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
          {(['number', 'name', 'date'] as const).map(k => (
            <button
              key={k}
              onClick={() => { if (cfSortKey === k) setCfSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setCfSortKey(k); setCfSortDir('asc'); } }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                cfSortKey === k ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-card border-border text-muted-foreground hover:border-purple-500/40'
              }`}
            >
              {k === 'number' ? '*Número' : k === 'name' ? 'A–Z Nome' : 'Data'}
              {cfSortKey === k && (cfSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground/60">{rawOrders.length} pedido{rawOrders.length !== 1 ? 's' : ''}</span>
        </div>
      )}
      <div className="p-3 bg-background/40">
        {folderOrdersQuery.isLoading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-purple-400" />
          </div>
        )}
        {!folderOrdersQuery.isLoading && orders.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum pedido nesta pasta</p>
            <p className="text-xs mt-1">Mova pedidos para cá usando o botão "Mover para Pasta" nos pedidos</p>
          </div>
        )}
        {orders.map((ar) => {
          const cfKey = `cf_${folderId}_${ar.registrationId}`;
          const isExpanded = expandedCustomFolderId === cfKey;
          const waPhone = ar.customerPhone?.replace(/\D/g, '');
          const arKey = `cf_${folderId}_${ar.registrationId}`;
          return (
            <div key={cfKey} className="mb-2 border border-border rounded-xl overflow-hidden">
              {/* Card header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  if (isExpanded) {
                    setExpandedCustomFolderId(null);
                    setExpandedId(null);
                  } else {
                    setExpandedCustomFolderId(cfKey);
                    setExpandedId(`${ar.registrationId}_0`);
                  }
                }}
              >
                {ar.profilePhotoUrl ? (
                  <img src={ar.profilePhotoUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-purple-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ar.customerNumber && (
                      <span className="flex-shrink-0 text-[11px] font-mono font-bold text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 leading-none" title="Número de cadastro">
                        *{ar.customerNumber}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-foreground truncate">{ar.customerName || 'Cliente'}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{ar.customerPhone} {ar.city ? `• ${ar.city}` : ''}</p>
                </div>
                {ar.serviceName && (
                  <span className="text-xs px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-full">{ar.serviceName}</span>
                )}
                {ar.orderNumber && (
                  <span className="text-xs font-mono text-muted-foreground">#{ar.orderNumber}</span>
                )}
                {editingPrice[String(ar.registrationId)] !== undefined ? (
                  <span className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      className="text-sm font-black px-2 py-0.5 rounded-lg border-2 bg-black text-green-400 w-28"
                      style={{ borderColor: '#22c55e' }}
                      value={editingPrice[String(ar.registrationId)]}
                      onChange={e => setEditingPrice(prev => ({ ...prev, [String(ar.registrationId)]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') updatePriceMutation.mutate({ registrationId: ar.registrationId!, pricePaid: editingPrice[String(ar.registrationId)] });
                        if (e.key === 'Escape') setEditingPrice(prev => { const n = { ...prev }; delete n[String(ar.registrationId)]; return n; });
                      }}
                    />
                    <button onClick={() => updatePriceMutation.mutate({ registrationId: ar.registrationId!, pricePaid: editingPrice[String(ar.registrationId)] })} className="text-xs px-1.5 py-0.5 bg-green-600 text-white rounded">OK</button>
                    <button onClick={() => setEditingPrice(prev => { const n = { ...prev }; delete n[String(ar.registrationId)]; return n; })} className="text-xs px-1.5 py-0.5 bg-gray-600 text-white rounded">✕</button>
                  </span>
                ) : (
                  <span
                    className="flex-shrink-0 flex items-center gap-1 text-sm font-black px-2.5 py-1 rounded-lg border-2 cursor-pointer hover:opacity-80"
                    style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', borderColor: '#22c55e', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)', boxShadow: '0 0 8px rgba(34,197,94,0.4)' }}
                    onClick={e => { e.stopPropagation(); setEditingPrice(prev => ({ ...prev, [String(ar.registrationId)]: ar.pricePaid || '' })); }}
                    title="Clique para editar o valor"
                  >
                    💰 {ar.pricePaid || 'R$ 0,00'} ✏️
                  </span>
                )}
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </div>

              {/* Expanded content - same as Arquivo */}
              {isExpanded && (
                <div className="border-t border-border bg-background/60 p-3">
                  {/* Tabs */}
                  <div className="flex gap-1 mb-3 border-b border-border pb-2">
                    {(['status', 'cliente', 'historico', 'documentos', 'anotacoes'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab((prev: any) => ({ ...prev, [cfKey]: tab }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          (activeTab[cfKey] || 'status') === tab
                            ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab === 'status' ? 'Status' : tab === 'cliente' ? 'Cliente' : tab === 'historico' ? 'Histórico' : tab === 'documentos' ? 'Docs' : 'Notas'}
                      </button>
                    ))}
                  </div>

                  {/* Status tab */}
                  {(activeTab[cfKey] || 'status') === 'status' && (
                    <FolderOrderStatusTab
                      ar={ar}
                      folderId={folderId}
                      customFolders={customFolders}
                      moveToFolderMut={moveToFolderMut}
                      removeFromFolderMut={removeFromFolderMut}
                    />
                  )}

                  {/* Cliente tab */}
                  {(activeTab[cfKey] || 'status') === 'cliente' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><p className="text-xs text-muted-foreground">Nome</p><p className="text-sm text-foreground">{ar.customerName || '-'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Telefone</p><p className="text-sm text-foreground">{ar.customerPhone || '-'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm text-foreground">{ar.email || '-'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Cidade</p><p className="text-sm text-foreground">{ar.city ? `${ar.city}${ar.uf ? `/${ar.uf}` : ''}` : '-'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Serviço</p><p className="text-sm text-foreground">{ar.serviceName || '-'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Opção</p><div className="text-sm text-foreground space-y-1">{ar.serviceOption ? ar.serviceOption.split(/(?=Garantia)/i).map((part, idx) => <p key={idx}>— {part}</p>) : '-'}</div></div>
                      </div>
                      {waPhone && (
                        <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mt-2 px-3 py-2 bg-green-600/20 border border-green-500/40 text-green-300 rounded-lg text-xs font-medium hover:bg-green-600/30 transition-colors">
                          <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                        </a>
                      )}
                    </div>
                  )}

                  {/* Histórico tab */}
                  {(activeTab[cfKey] || 'status') === 'historico' && (
                    <div className="space-y-2">
                      {historyQuery.isLoading && <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" /></div>}
                      {historyQuery.data && historyQuery.data.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum histórico</p>}
                      {historyQuery.data && historyQuery.data.map((h: any) => (
                        <div key={h.id} className="flex items-start gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">{h.statusLabel || h.status}</p>
                            <p className="text-[10px] text-muted-foreground">{formatDate(h.createdAt instanceof Date ? h.createdAt.getTime() : h.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Documentos tab */}
                  {(activeTab[cfKey] || 'status') === 'documentos' && (
                    <div className="space-y-2">
                      {filesQuery.isLoading && <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" /></div>}
                      {filesQuery.data && filesQuery.data.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum documento</p>}
                      {filesQuery.data && filesQuery.data.map((f: any) => (
                        <div key={f.id} className="flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{f.label || 'Documento'}</p>
                            <p className="text-[10px] text-muted-foreground">{formatDate(f.createdAt instanceof Date ? f.createdAt.getTime() : f.createdAt)}</p>
                          </div>
                          <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Ver</a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notas tab */}
                  {(activeTab[cfKey] || 'status') === 'anotacoes' && (
                    <div className="space-y-3">
                      {!orderNoteQuery.isLoading && (
                        <>
                          <textarea
                            rows={6}
                            value={noteText[cfKey] ?? (orderNoteQuery.data?.content || '')}
                            onChange={e => setNoteText((prev: any) => ({ ...prev, [cfKey]: e.target.value }))}
                            placeholder="Escreva aqui informações internas..."
                            className="w-full bg-muted/30 border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <button
                            onClick={() => {
                              const content = noteText[cfKey] ?? (orderNoteQuery.data?.content || '');
                              if (!content.trim()) return;
                              saveNoteMut.mutate({ registrationId: ar.registrationId, content });
                            }}
                            className="w-full py-2 bg-primary/20 border border-primary/40 text-primary rounded-lg text-xs font-semibold hover:bg-primary/30 transition-colors"
                          >
                            Salvar Nota
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const [location, navigate] = useLocation();
  const { isAdmin, isLoading: authLoading, username: adminUsername } = useAdminAuth();

  // Lê parâmetro ?search=... da URL para navegação direta (ex: vindo de AdminCustomers)
  const urlSearch = (() => {
    try { return new URLSearchParams(window.location.search).get('search') || ''; } catch { return ''; }
  })();
  // Lê parâmetro ?open=ID para abrir card automaticamente (ex: vindo de Agendamentos)
  const urlOpenId = (() => {
    try { return new URLSearchParams(window.location.search).get('open') || ''; } catch { return ''; }
  })();
  const [search, setSearch] = useState(urlSearch);
  const [searchPending, setSearchPending] = useState(false);
  // Busca de emergência: ativada quando o termo começa com '/'
  const isEmergencySearch = search.trimStart().startsWith('/');
  const emergencyTerm = isEmergencySearch ? search.trimStart().slice(1).trim() : '';
  const [emergencySearchEnabled, setEmergencySearchEnabled] = useState(false);
  // Ativa a busca de emergência com debounce de 500ms após digitar
  const emergencyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (emergencyTimerRef.current) clearTimeout(emergencyTimerRef.current);
    if (isEmergencySearch && emergencyTerm.length >= 2) {
      // Mudar automaticamente para a aba Todos ao entrar no modo de busca global
      setActiveProductTab('__todos__');
      emergencyTimerRef.current = setTimeout(() => setEmergencySearchEnabled(true), 500);
    } else {
      setEmergencySearchEnabled(false);
    }
    return () => { if (emergencyTimerRef.current) clearTimeout(emergencyTimerRef.current); };
  }, [isEmergencySearch, emergencyTerm]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, "status" | "cliente" | "historico" | "documentos" | "anotacoes">>({});
  const [selectedStatus, setSelectedStatus] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [editingCustomer, setEditingCustomer] = useState<Record<string, EditData>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [openFolderMenuKey, setOpenFolderMenuKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [uploadingPhotoOrderId, setUploadingPhotoOrderId] = useState<string | null>(null);
  const [photoLightboxUrl, setPhotoLightboxUrl] = useState<string | null>(null);
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ rows: number; headers: string[]; sample: string[] } | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ imported: number; duplicates: number; errors: number; details: string[] } | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  // IDs arquivados localmente para remoção imediata da lista (sem esperar refetch)
  const [localArchivedIds, setLocalArchivedIds] = useState<Set<string>>(new Set());
  // Overrides de status locais para atualização imediata sem esperar refetch
  const [localStatusOverrides, setLocalStatusOverrides] = useState<Record<string, string>>({});
  // Status e expansão para cards arquivados
  const [archivedStatusExpanded, setArchivedStatusExpanded] = useState<Set<string>>(new Set());
  const [archivedSelectedStatus, setArchivedSelectedStatus] = useState<Record<string, string>>({});
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortBy, setSortBy] = useState<"date" | "status_date" | "name">("date");
  // Ordenação para abas Arquivo e Entregues
  type FolderSortKey = "number" | "name" | "date";
  type DeliveredSortKey = "number" | "name" | "date" | "notified";
  type FolderSortDir = "asc" | "desc";
  const [archivedSortKey, setArchivedSortKey] = useState<FolderSortKey>("number");
  const [archivedSortDir, setArchivedSortDir] = useState<FolderSortDir>("asc");
  const [deliveredSortKey, setDeliveredSortKey] = useState<DeliveredSortKey>("notified");
  const [deliveredSortDir, setDeliveredSortDir] = useState<FolderSortDir>("desc");
  const [deliveredPhoneFilter, setDeliveredPhoneFilter] = useState("");
  const [todosSortKey, setTodosSortKey] = useState<FolderSortKey>("date");
  const [todosSortDir, setTodosSortDir] = useState<FolderSortDir>("desc");
  const [todosQuickFilter, setTodosQuickFilter] = useState<"all" | "sem_status" | "agendamento_confirmado" | "agendamento" | "em_analise" | "novo" | "aguardando_ativa" | "conta_ativa">("all");
  // Estado para expandir cards individuais de ARQUIVO e RG/CNH
  const [expandedArchivedId, setExpandedArchivedId] = useState<string | null>(null);
  const [expandedRgCnhId, setExpandedRgCnhId] = useState<string | null>(null);
  // Status e expansão para cards RG/CNH Aprovado
  const [rgCnhStatusExpanded, setRgCnhStatusExpanded] = useState<Set<string>>(new Set());
  const [rgCnhSelectedStatus, setRgCnhSelectedStatus] = useState<Record<string, string>>({});
  const [rgCnhSortKey, setRgCnhSortKey] = useState<FolderSortKey>("number");
  const [rgCnhSortDir, setRgCnhSortDir] = useState<FolderSortDir>("asc");
  // IDs movidos para RG/CNH localmente para remoção imediata da lista
  const [localRgCnhIds, setLocalRgCnhIds] = useState<Set<string>>(new Set());
  // Aba Perguntas
  const TQ_COLORS_ADM = ['#22c55e','#ef4444','#eab308','#3b82f6','#a855f7','#f97316','#6b7280'];
  type TQOpt = { label: string; color: string };
  const [showNewTQAdm, setShowNewTQAdm] = useState(false);
  const [newTQTextAdm, setNewTQTextAdm] = useState('');
  const [newTQOptionsAdm, setNewTQOptionsAdm] = useState<TQOpt[]>([{ label: '', color: '#22c55e' }, { label: '', color: '#ef4444' }]);
  const [newTQShowOnceAdm, setNewTQShowOnceAdm] = useState(false);
  const [editingTQIdAdm, setEditingTQIdAdm] = useState<number | null>(null);
  const [editTQTextAdm, setEditTQTextAdm] = useState('');
  const [editTQOptionsAdm, setEditTQOptionsAdm] = useState<TQOpt[]>([]);
  const [editTQShowOnceAdm, setEditTQShowOnceAdm] = useState(false);
  const resetNewTQAdm = () => { setNewTQTextAdm(''); setNewTQOptionsAdm([{ label: '', color: '#22c55e' }, { label: '', color: '#ef4444' }]); setNewTQShowOnceAdm(false); };
  const [editingOrderData, setEditingOrderData] = useState<Record<string, {
    serviceName: string;
    serviceOption: string;
    pricePaid: string;
    answers: Array<{ question: string; answer: string }>;
  }>>({})
  // Edição inline do valor pago
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({});
  const updatePriceMutation = trpc.orderStatus.updateOrderData.useMutation({
    onSuccess: (_, vars) => {
      toast.success('Valor atualizado!');
      setEditingPrice(prev => { const n = { ...prev }; delete n[String(vars.registrationId)]; return n; });
      ordersQuery.refetch();
    },
    onError: () => toast.error('Erro ao atualizar valor'),
  });

  // Grupos de produto colapsados (por nome do produto)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (name: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const [activeProductTab, setActiveProductTab] = useState<string | null>(null);
  // Paleta de cores para os blocos de produto
  const PRODUCT_COLORS = [
    { border: "border-violet-500/60", header: "bg-violet-500/15 border-violet-500/40", badge: "bg-violet-500/20 text-violet-300", dot: "bg-violet-400" },
    { border: "border-sky-500/60",    header: "bg-sky-500/15 border-sky-500/40",    badge: "bg-sky-500/20 text-sky-300",    dot: "bg-sky-400" },
    { border: "border-emerald-500/60",header: "bg-emerald-500/15 border-emerald-500/40",badge: "bg-emerald-500/20 text-emerald-300",dot: "bg-emerald-400" },
    { border: "border-amber-500/60",  header: "bg-amber-500/15 border-amber-500/40",  badge: "bg-amber-500/20 text-amber-300",  dot: "bg-amber-400" },
    { border: "border-rose-500/60",   header: "bg-rose-500/15 border-rose-500/40",   badge: "bg-rose-500/20 text-rose-300",   dot: "bg-rose-400" },
    { border: "border-cyan-500/60",   header: "bg-cyan-500/15 border-cyan-500/40",   badge: "bg-cyan-500/20 text-cyan-300",   dot: "bg-cyan-400" },
    { border: "border-pink-500/60",   header: "bg-pink-500/15 border-pink-500/40",   badge: "bg-pink-500/20 text-pink-300",   dot: "bg-pink-400" },
    { border: "border-orange-500/60", header: "bg-orange-500/15 border-orange-500/40",badge: "bg-orange-500/20 text-orange-300",dot: "bg-orange-400" },
  ];

  // Bipe sonoro para novos pedidos
  const knownOrderIds = useRef<Set<number> | null>(null);
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { /* sem suporte a AudioContext */ }
  };

  // Rastrear pedidos já visualizados pelo admin (persiste no localStorage)
  const VIEWED_KEY = "walk_viewed_orders";
  const [viewedOrders, setViewedOrders] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(VIEWED_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch { return new Set(); }
  });

  // Carregar pedidos confirmados do banco de dados (persiste entre dispositivos e reloads)
  const viewedOrdersQuery = trpc.viewedOrders.list.useQuery(undefined, { refetchOnWindowFocus: false });
  useEffect(() => {
    if (viewedOrdersQuery.data) {
      setViewedOrders(prev => {
        const next = new Set(prev);
        for (const k of viewedOrdersQuery.data as string[]) next.add(k);
        try { localStorage.setItem(VIEWED_KEY, JSON.stringify(Array.from(next))); } catch {}
        return next;
      });
    }
  }, [viewedOrdersQuery.data]);

  const markViewedMut = trpc.viewedOrders.markViewed.useMutation();

  const markAsViewed = (orderId: string) => {
    setViewedOrders(prev => {
      if (prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.add(orderId);
      try { localStorage.setItem(VIEWED_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
    // Persistir no banco de dados
    markViewedMut.mutate({ orderKey: orderId });
  };

  const productsQuery = trpc.products.list.useQuery();
  const allProductNames = (productsQuery.data ?? []).map(p => p.name as string);
  // Status dinâmicos do banco
  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = statusTypesQuery.data ?? [];
  const [showGlobalProgressSequence, setShowGlobalProgressSequence] = useState(false);
  const globalProgressSequenceQuery = trpc.statusTypes.getProgressSequence.useQuery(undefined, { staleTime: 0 });
  const saveGlobalProgressSequence = trpc.statusTypes.setProgressSequence.useMutation({
    onSuccess: async () => {
      toast.success('Sequência global salva para todos os clientes!');
      await Promise.all([statusTypesQuery.refetch(), globalProgressSequenceQuery.refetch()]);
      setShowGlobalProgressSequence(false);
    },
    onError: (e) => toast.error(e.message || 'Erro ao salvar sequência global'),
  });
  // Template editável da mensagem WhatsApp de pedidos
  const waOrderTemplateQuery = trpc.settings.getWhatsappOrderTemplate.useQuery();
  const waOrderTemplate = waOrderTemplateQuery.data?.template || null;
  // Template editável da mensagem WhatsApp de login
  const waLoginTemplateQuery = trpc.settings.getWhatsappLoginTemplate.useQuery();
  const waLoginTemplate = waLoginTemplateQuery.data?.template || null;
  // Templates de mensagens rápidas WhatsApp
  const waTemplatesQuery = trpc.whatsappTemplates.list.useQuery();
  const waTemplates = waTemplatesQuery.data ?? [];
  // Estado do modal de seleção de mensagem rápida
  const [waModalOrder, setWaModalOrder] = useState<any>(null);
  const [waModalMsg, setWaModalMsg] = useState("");
  const [waModalSelectedId, setWaModalSelectedId] = useState<number | null>(null);
  // Mapa de ícones por nome (sincronizado com AdminStatusTypes)
  const ICON_MAP: Record<string, React.ReactNode> = {
    Clock: <Clock className="w-4 h-4" />,
    Package: <Package className="w-4 h-4" />,
    DollarSign: <DollarSign className="w-4 h-4" />,
    Zap: <Zap className="w-4 h-4" />,
    FileCheck: <FileCheck className="w-4 h-4" />,
    XCircle: <XCircle className="w-4 h-4" />,
    Wrench: <Wrench className="w-4 h-4" />,
    CheckCircle2: <CheckCircle2 className="w-4 h-4" />,
    Star: <Star className="w-4 h-4" />,
    AlertCircle: <AlertCircle className="w-4 h-4" />,
    Info: <Info className="w-4 h-4" />,
  };
  // Constrói STATUS_CONFIG dinâmico — sempre usa o banco quando disponível
  const ACTIVE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; description?: string }> =
    dynamicStatuses.length > 0
      ? Object.fromEntries(dynamicStatuses.map(s => [s.key, {
          label: s.label,
          color: s.color,
          bg: s.bgColor,
          icon: ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />,
          description: (s as any).description ?? '',
        }]))
      : STATUS_CONFIG as Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; description?: string }>;
  const ACTIVE_STATUS_ORDER: string[] = dynamicStatuses.length > 0
    ? dynamicStatuses.filter(s => s.isActive === 1).sort((a, b) => a.sortOrder - b.sortOrder).map(s => s.key)
    : STATUS_ORDER;
  const INITIAL_STATUS_KEY = ACTIVE_STATUS_ORDER[0] || 'recebido';
  const isManualSelectableStatus = (s: string) => s !== 'cancelado' && s !== 'recebido' && s !== INITIAL_STATUS_KEY;

  // autoMarkUrgent automático REMOVIDO — urgência agora é somente manual pelo admin

  const trpcUtils = trpc.useUtils();

  // ─── MARCAÇÃO "EM ATENDIMENTO" ────────────────────────────────────────────────
  const attentionQuery = trpc.attention.list.useQuery(undefined, {
    refetchInterval: 15000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  // Mapa registrationId → adminName para acesso rápido
  const attentionMap = new Map<number, string>(
    (attentionQuery.data ?? []).map((a: any) => [a.registrationId, a.adminName])
  );
  const markAttentionMut = trpc.attention.mark.useMutation({
    onSuccess: () => trpcUtils.attention.list.invalidate(),
  });
  const clearAttentionMut = trpc.attention.clear.useMutation({
    onSuccess: () => trpcUtils.attention.list.invalidate(),
  });
  function toggleAttention(registrationId: number) {
    const currentAdmin = attentionMap.get(registrationId);
    if (currentAdmin) {
      clearAttentionMut.mutate({ registrationId });
    } else {
      markAttentionMut.mutate({ registrationId, adminName: adminUsername || 'Admin' });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const ordersQuery = trpc.orderStatus.listOrders.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    // Manter dados anteriores visíveis durante o refetch (evita lista vazia ao buscar)
    placeholderData: (prev: any) => prev,
  });

  // Consulta de poucos bytes: detecta mudança externa em status/agendamento sem buscar a lista inteira.
  const ordersUpdateMarkerQuery = trpc.orderStatus.getUpdateMarker.useQuery(undefined, {
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const lastOrdersUpdateMarkerRef = React.useRef<string | null>(null);
  useEffect(() => {
    const marker = ordersUpdateMarkerQuery.data?.marker;
    if (!marker) return;
    if (lastOrdersUpdateMarkerRef.current === null) {
      lastOrdersUpdateMarkerRef.current = marker;
      return;
    }
    if (marker === lastOrdersUpdateMarkerRef.current) return;
    lastOrdersUpdateMarkerRef.current = marker;
    void ordersQuery.refetch();
  }, [ordersUpdateMarkerQuery.data?.marker]);

  // Função de busca forçada: invalida cache e faz novo fetch do servidor
  const handleForcedSearch = async () => {
    setSearchPending(true);
    try {
      await trpcUtils.orderStatus.listOrders.invalidate();
      await ordersQuery.refetch();
    } catch {
      // silencioso
    } finally {
      setSearchPending(false);
    }
  };

  // Refetch ao limpar a busca (para garantir dados atualizados ao voltar ao estado vazio)
  useEffect(() => {
    if (!search.trim()) {
      ordersQuery.refetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Query de busca de emergência — só executa quando o termo começa com '/'
  const emergencyQuery = trpc.orderStatus.emergencySearch.useQuery(
    { term: emergencyTerm || '_' },
    {
      enabled: emergencySearchEnabled && emergencyTerm.length >= 2,
      staleTime: 0,
      refetchOnWindowFocus: false,
    }
  );
  const emergencyResults = emergencyQuery.data ?? [];

  // autoMarkUrgent automático REMOVIDO — urgência agora é somente manual pelo admin

  // Abrir card automaticamente via ?open=registrationId (ex: vindo de Agendamentos)
  const openedViaUrl = React.useRef(false);
  useEffect(() => {
    if (!urlOpenId || openedViaUrl.current) return;
    const data = ordersQuery.data as Order[] | undefined;
    if (!data) return;
    const target = data.find(o => String(o.id) === String(urlOpenId));
    if (target) {
      const key = getOrderKey(target);
      setExpandedId(key);
      setActiveProductTab('__todos__');
      openedViaUrl.current = true;
      // Scroll suave para o card após um tick
      setTimeout(() => {
        const el = document.getElementById(`order-card-${key}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [ordersQuery.data, urlOpenId]);

  // Detectar novos pedidos e tocar bipe
  useEffect(() => {
    const data = ordersQuery.data as Order[] | undefined;
    if (!data) return;
    const currentIds = new Set(data.map(o => o.id));
    if (knownOrderIds.current === null) {
      // Primeira carga: apenas registrar IDs sem tocar bipe
      knownOrderIds.current = currentIds;
      return;
    }
    const hasNew = data.some(o => !knownOrderIds.current!.has(o.id));
    if (hasNew) {
      playBeep();
      knownOrderIds.current = currentIds;
    } else {
      knownOrderIds.current = currentIds;
    }
  }, [ordersQuery.data]);

  const showStatusEmailResult = (
    data: {
      success?: boolean;
      error?: string;
      notifications?: {
        customerEmailSent?: boolean;
        customerEmailError?: string | null;
      };
    },
    vars: { skipEmail?: boolean }
  ) => {
    if (data?.success === false) {
      toast.error(data.error || "Status não foi atualizado.");
      return;
    }

    if (vars.skipEmail) {
      toast.success("Status atualizado sem notificar o cliente.");
      return;
    }

    if (data?.notifications?.customerEmailSent) {
      toast.success("Status atualizado + e-mail enviado ao cliente.");
      return;
    }

    const reason = data?.notifications?.customerEmailError || "Falha no envio do e-mail ao cliente";
    toast.warning("Status atualizado, mas o e-mail não foi enviado.", {
      description: `${reason}. Use o botão “Reenviar Email do Status Atual”.`,
      duration: 12000,
    });
  };

  const updateMutation = trpc.orderStatus.updateStatus.useMutation({
    onMutate: async (vars) => {
      // Atualização imediata via estado local (independente do cache tRPC)
      const orderKey = `${vars.registrationId}_${vars.subOrderIndex ?? 0}`;
      setLocalStatusOverrides(prev => ({ ...prev, [orderKey]: vars.status }));
      return { orderKey };
    },
    onSuccess: (data, vars) => {
      showStatusEmailResult(data, vars);
      // Aguardar servidor persistir, depois refetch e limpar override
      setTimeout(() => {
        ordersQuery.refetch().then(() => {
          const orderKey = `${vars.registrationId}_${vars.subOrderIndex ?? 0}`;
          setLocalStatusOverrides(prev => { const n = { ...prev }; delete n[orderKey]; return n; });
        });
      }, 800);
    },
    onError: (_err, vars) => {
      // Reverter override em caso de erro
      const orderKey = `${vars.registrationId}_${vars.subOrderIndex ?? 0}`;
      setLocalStatusOverrides(prev => { const n = { ...prev }; delete n[orderKey]; return n; });
      toast.error("Erro ao atualizar status");
    },
  });

  const deleteMutation = trpc.orderStatus.deleteOrder.useMutation({
    onSuccess: () => {
      toast.success("Pedido removido com sucesso!");
      setConfirmDelete(null);
      setExpandedId(null);
      ordersQuery.refetch();
    },
    onError: () => toast.error("Erro ao remover pedido"),
  });

  const updateOrderDataMutation = trpc.orderStatus.updateOrderData.useMutation({
    onSuccess: (_, vars) => {
      toast.success("Dados do pedido atualizados!");
      setEditingOrderData(prev => { const n = { ...prev }; delete n[vars.registrationId]; return n; });
      ordersQuery.refetch();
    },
    onError: () => toast.error("Erro ao atualizar dados do pedido"),
  });

  const archiveMutation = trpc.orderStatus.archiveOrder.useMutation({
    onMutate: (vars) => {
      // Remove imediatamente da lista local antes do refetch
      setLocalArchivedIds(prev => new Set(Array.from(prev).concat(String(vars.registrationId))));
      setExpandedId(null);
    },
    onSuccess: () => {
      toast.success("Pedido arquivado! Acesse a aba Arquivo para consultar.");
      ordersQuery.refetch().then(() => {
        // Após refetch confirmado, limpar o estado local (o servidor já filtra)
        setLocalArchivedIds(new Set());
      });
      archivedQuery.refetch();
    },
    onError: (_, vars) => {
      // Reverter remoção local em caso de erro
      setLocalArchivedIds(prev => { const next = new Set(prev); next.delete(String(vars.registrationId)); return next; });
      toast.error("Erro ao arquivar pedido");
    },
  });

  const unarchiveMutation = trpc.orderStatus.unarchiveOrder.useMutation({
    onSuccess: () => {
      toast.success("Pedido restaurado para os cards ativos!");
      // Limpar qualquer ID local arquivado ao restaurar
      setLocalArchivedIds(new Set());
      ordersQuery.refetch();
      archivedQuery.refetch();
    },
    onError: () => toast.error("Erro ao restaurar pedido"),
  });

  const updateArchivedStatusMutation = trpc.orderStatus.updateStatus.useMutation({
    onSuccess: (data, vars) => {
      showStatusEmailResult(data, vars);
      // Fechar o seletor e limpar o status selecionado
      setArchivedStatusExpanded(prev => { const n = new Set(prev); n.delete(String(vars.registrationId)); return n; });
      setArchivedSelectedStatus(prev => { const n = { ...prev }; delete n[String(vars.registrationId)]; return n; });
      archivedQuery.refetch();
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  const archivedQuery = trpc.orderStatus.listArchivedOrders.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const moveToRgCnhMutation = trpc.orderStatus.moveToRgCnhApproved.useMutation({
    onMutate: (vars) => {
      setLocalRgCnhIds(prev => new Set(Array.from(prev).concat(String(vars.registrationId))));
      setExpandedId(null);
    },
    onSuccess: () => {
      toast.success("Pedido movido para RG/CNH Aprovado!");
      ordersQuery.refetch().then(() => setLocalRgCnhIds(new Set()));
      rgCnhQuery.refetch();
    },
    onError: (_, vars) => {
      setLocalRgCnhIds(prev => { const next = new Set(prev); next.delete(String(vars.registrationId)); return next; });
      toast.error("Erro ao mover pedido");
    },
  });

  const removeFromRgCnhMutation = trpc.orderStatus.removeFromRgCnhApproved.useMutation({
    onSuccess: () => {
      toast.success("Pedido restaurado para os cards ativos!");
      setLocalRgCnhIds(new Set());
      ordersQuery.refetch();
      rgCnhQuery.refetch();
    },
    onError: () => toast.error("Erro ao restaurar pedido"),
  });

  const updateRgCnhStatusMutation = trpc.orderStatus.updateStatus.useMutation({
    onSuccess: (data, vars) => {
      showStatusEmailResult(data, vars);
      setRgCnhStatusExpanded(prev => { const n = new Set(prev); n.delete(String(vars.registrationId)); return n; });
      setRgCnhSelectedStatus(prev => { const n = { ...prev }; delete n[String(vars.registrationId)]; return n; });
      rgCnhQuery.refetch();
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  const rgCnhQuery = trpc.orderStatus.listRgCnhApprovedOrders.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // ===== PASTAS PERSONALIZADAS =====
  const customFoldersQuery = trpc.folders.list.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const folderConfigQuery = trpc.folderConfig.getAll.useQuery(undefined, { staleTime: 0 });
  const [customFolderOrders, setCustomFolderOrders] = React.useState<Record<number, any[]>>({});
  const [expandedCustomFolderId, setExpandedCustomFolderId] = React.useState<string | null>(null);
  const [customFolderSortKey, setCustomFolderSortKey] = React.useState<Record<number, 'number'|'name'|'date'>>({});
  const [customFolderSortDir, setCustomFolderSortDir] = React.useState<Record<number, 'asc'|'desc'>>({});
  const [showFolderManager, setShowFolderManager] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [editingFolderId, setEditingFolderId] = React.useState<number | null>(null);
  const [editFolderName, setEditFolderName] = React.useState('');
  const [editFolderIcon, setEditFolderIcon] = React.useState('');
  const [editFolderColor, setEditFolderColor] = React.useState('');
  const [editingFixedFolder, setEditingFixedFolder] = React.useState<string | null>(null);
  const [editFixedFolderName, setEditFixedFolderName] = React.useState('');
  const [showMoveToFolder, setShowMoveToFolder] = React.useState<string | null>(null);

  const createFolderMut = trpc.folders.create.useMutation({
    onSuccess: () => { toast.success('Pasta criada!'); setNewFolderName(''); customFoldersQuery.refetch(); },
    onError: () => toast.error('Erro ao criar pasta'),
  });
  const updateFolderMut = trpc.folders.update.useMutation({
    onSuccess: () => { toast.success('Pasta atualizada!'); setEditingFolderId(null); customFoldersQuery.refetch(); },
    onError: () => toast.error('Erro ao atualizar pasta'),
  });
  const deleteFolderMut = trpc.folders.delete.useMutation({
    onSuccess: () => { toast.success('Pasta removida!'); customFoldersQuery.refetch(); },
    onError: () => toast.error('Erro ao remover pasta'),
  });
  const moveToFolderMut = trpc.folders.moveOrder.useMutation({
    onSuccess: (_, vars) => {
      toast.success('Pedido movido para a pasta!');
      setShowMoveToFolder(null);
      setExpandedId(null);
      ordersQuery.refetch();
      // Refetch da pasta de destino
      trpc.folders.listOrders.useQuery;
      customFoldersQuery.refetch();
    },
    onError: () => toast.error('Erro ao mover pedido'),
  });
  const removeFromFolderMut = trpc.folders.removeOrder.useMutation({
    onSuccess: () => { toast.success('Pedido removido da pasta!'); setExpandedCustomFolderId(null); setExpandedId(null); ordersQuery.refetch(); customFoldersQuery.refetch(); },
    onError: () => toast.error('Erro ao remover da pasta'),
  });
  const saveFixedFolderMut = trpc.folderConfig.save.useMutation({
    onSuccess: () => { toast.success('Nome da pasta salvo!'); setEditingFixedFolder(null); folderConfigQuery.refetch(); },
    onError: () => toast.error('Erro ao salvar nome da pasta'),
  });
  const reorderTabsMut = trpc.folderConfig.reorderTabs.useMutation({
    onSuccess: () => { toast.success('Ordem das abas salva!'); folderConfigQuery.refetch(); customFoldersQuery.refetch(); },
    onError: () => toast.error('Erro ao salvar ordem das abas'),
  });
  const toggleHiddenFixedMut = trpc.folderConfig.toggleHiddenFixed.useMutation({
    onSuccess: () => { folderConfigQuery.refetch(); },
    onError: () => toast.error('Erro ao ocultar/mostrar pasta'),
  });
  const toggleHiddenCustomMut = trpc.folderConfig.toggleHiddenCustom.useMutation({
    onSuccess: () => { customFoldersQuery.refetch(); },
    onError: () => toast.error('Erro ao ocultar/mostrar pasta'),
  });

  // Carregar pedidos de cada pasta personalizada quando a aba é selecionada
  const loadFolderOrders = async (folderId: number) => {
    // Será feito via query individual por pasta
  };

  const deleteBulkMutation = trpc.orderStatus.deleteOrdersBulk.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deleted} pedido(s) removido(s)!`);
      setSelected(new Set());
      setConfirmBulkDelete(false);
      ordersQuery.refetch();
    },
    onError: () => toast.error("Erro ao remover pedidos"),
  });

  const uploadPhotoMut = trpc.customers.uploadProfilePhoto.useMutation({
    onSuccess: () => { toast.success("Foto atualizada!"); ordersQuery.refetch(); setUploadingPhotoOrderId(null); },
    onError: () => { toast.error("Erro ao enviar foto"); setUploadingPhotoOrderId(null); },
  });

  const handlePhotoUpload = (orderId: string, phone: string, file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('A foto deve ter no máximo 5MB'); return; }
    setUploadingPhotoOrderId(orderId);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      uploadPhotoMut.mutate({ imageBase64: base64, phone });
    };
    reader.readAsDataURL(file);
  };

  const updateCustomerMutation = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Dados do cliente atualizados!");
      ordersQuery.refetch();
    },
    onError: () => toast.error("Erro ao atualizar dados do cliente"),
  });

  const resendEmailMutation = trpc.orderStatus.resendEmail.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success("Email reenviado com sucesso!");
      else toast.error("Erro ao reenviar email");
    },
    onError: () => toast.error("Erro ao reenviar email"),
  });

  const toggleUrgentMutation = trpc.orderStatus.toggleUrgent.useMutation({
    onSuccess: () => ordersQuery.refetch(),
    onError: () => toast.error("Erro ao atualizar urgência"),
  });

  // ===== GRUPOS CUSTOMIZADOS =====
  const customGroupsQuery = trpc.orderGroups.list.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const createGroupMut = trpc.orderGroups.create.useMutation({ onSuccess: () => { customGroupsQuery.refetch(); setShowCreateGroup(false); setNewGroupName(''); } });
  const updateGroupMut = trpc.orderGroups.update.useMutation({ onSuccess: () => { customGroupsQuery.refetch(); setEditingGroupId(null); } });
  const deleteGroupMut = trpc.orderGroups.delete.useMutation({ onSuccess: () => customGroupsQuery.refetch() });
  const addMemberMut = trpc.orderGroups.addMember.useMutation({ onSuccess: () => customGroupsQuery.refetch() });
  const removeMemberMut = trpc.orderGroups.removeMember.useMutation({ onSuccess: () => customGroupsQuery.refetch() });
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('red');
  const [newGroupIcon, setNewGroupIcon] = useState('🔖');
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupColor, setEditGroupColor] = useState('');
  const [editGroupIcon, setEditGroupIcon] = useState('');
  const [groupMenuOrderId, setGroupMenuOrderId] = useState<number | null>(null);
  const [groupMenuPos, setGroupMenuPos] = useState<{ top: number; left: number } | null>(null);
  // Estado de colapso dos grupos extras (todos recolhidos por padrão)
  const [collapsedExtraGroups, setCollapsedExtraGroups] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('walk_collapsed_extra_groups');
      if (saved) return new Set(JSON.parse(saved) as number[]);
    } catch {}
    return new Set<number>();
  });
  const [extraGroupsInitialized, setExtraGroupsInitialized] = useState(false);
  // Inicializar todos os grupos como recolhidos na primeira carga (se não houver estado salvo)
  useEffect(() => {
    if (extraGroupsInitialized) return;
    const groups = customGroupsQuery.data;
    if (!groups || groups.length === 0) return;
    const saved = localStorage.getItem('walk_collapsed_extra_groups');
    if (!saved) {
      // Primeira vez: recolher todos
      const allIds = groups.map((g: any) => g.id);
      const allSet = new Set<number>(allIds);
      setCollapsedExtraGroups(allSet);
      try { localStorage.setItem('walk_collapsed_extra_groups', JSON.stringify(Array.from(allSet))); } catch {}
    } else {
      // Adicionar novos grupos ao set de recolhidos
      const savedIds = new Set<number>(JSON.parse(saved));
      const newIds = groups.map((g: any) => g.id).filter((id: number) => !savedIds.has(id));
      if (newIds.length > 0) {
        const next = new Set<number>(Array.from(savedIds).concat(newIds));
        setCollapsedExtraGroups(next);
        try { localStorage.setItem('walk_collapsed_extra_groups', JSON.stringify(Array.from(next))); } catch {}
      }
    }
    setExtraGroupsInitialized(true);
  }, [customGroupsQuery.data, extraGroupsInitialized]);

  const toggleExtraGroup = (id: number) => {
    setCollapsedExtraGroups(prev => {
      const next = new Set<number>(Array.from(prev));
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('walk_collapsed_extra_groups', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const [showReorderGroups, setShowReorderGroups] = useState(false);
  const [reorderList, setReorderList] = useState<any[]>([]);
  const [dragReorderIdx, setDragReorderIdx] = useState<number | null>(null);
  const [dragOverReorderIdx, setDragOverReorderIdx] = useState<number | null>(null);
  const reorderGroupsMut = trpc.orderGroups.reorder.useMutation({
    onSuccess: () => { customGroupsQuery.refetch(); setShowReorderGroups(false); toast.success('Ordem dos grupos salva!'); },
    onError: () => toast.error('Erro ao salvar a ordem.'),
  });
  const GROUP_COLOR_MAP: Record<string, { border: string; header: string; card: string; text: string; badge: string; hex: string }> = {
    red:     { border: 'border-red-500/60',     header: 'bg-red-600/30 border-red-500/40',     card: 'bg-red-950/40 border-red-500/50 hover:border-red-400 hover:bg-red-950/60',     text: 'text-red-300',     badge: 'bg-red-500',     hex: '#ef4444' },
    orange:  { border: 'border-orange-500/60',  header: 'bg-orange-600/30 border-orange-500/40',  card: 'bg-orange-950/40 border-orange-500/50 hover:border-orange-400 hover:bg-orange-950/60',  text: 'text-orange-300',  badge: 'bg-orange-500',  hex: '#f97316' },
    amber:   { border: 'border-amber-500/60',   header: 'bg-amber-600/30 border-amber-500/40',   card: 'bg-amber-950/40 border-amber-500/50 hover:border-amber-400 hover:bg-amber-950/60',   text: 'text-amber-300',   badge: 'bg-amber-500',   hex: '#f59e0b' },
    yellow:  { border: 'border-yellow-500/60',  header: 'bg-yellow-600/30 border-yellow-500/40',  card: 'bg-yellow-950/40 border-yellow-500/50 hover:border-yellow-400 hover:bg-yellow-950/60',  text: 'text-yellow-300',  badge: 'bg-yellow-500',  hex: '#eab308' },
    lime:    { border: 'border-lime-500/60',    header: 'bg-lime-600/30 border-lime-500/40',    card: 'bg-lime-950/40 border-lime-500/50 hover:border-lime-400 hover:bg-lime-950/60',    text: 'text-lime-300',    badge: 'bg-lime-500',    hex: '#84cc16' },
    green:   { border: 'border-green-500/60',   header: 'bg-green-600/30 border-green-500/40',   card: 'bg-green-950/40 border-green-500/50 hover:border-green-400 hover:bg-green-950/60',   text: 'text-green-300',   badge: 'bg-green-500',   hex: '#22c55e' },
    emerald: { border: 'border-emerald-500/60', header: 'bg-emerald-600/30 border-emerald-500/40', card: 'bg-emerald-950/40 border-emerald-500/50 hover:border-emerald-400 hover:bg-emerald-950/60', text: 'text-emerald-300', badge: 'bg-emerald-500', hex: '#10b981' },
    teal:    { border: 'border-teal-500/60',    header: 'bg-teal-600/30 border-teal-500/40',    card: 'bg-teal-950/40 border-teal-500/50 hover:border-teal-400 hover:bg-teal-950/60',    text: 'text-teal-300',    badge: 'bg-teal-500',    hex: '#14b8a6' },
    cyan:    { border: 'border-cyan-500/60',    header: 'bg-cyan-600/30 border-cyan-500/40',    card: 'bg-cyan-950/40 border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-950/60',    text: 'text-cyan-300',    badge: 'bg-cyan-500',    hex: '#06b6d4' },
    sky:     { border: 'border-sky-500/60',     header: 'bg-sky-600/30 border-sky-500/40',     card: 'bg-sky-950/40 border-sky-500/50 hover:border-sky-400 hover:bg-sky-950/60',     text: 'text-sky-300',     badge: 'bg-sky-500',     hex: '#0ea5e9' },
    blue:    { border: 'border-blue-500/60',    header: 'bg-blue-600/30 border-blue-500/40',    card: 'bg-blue-950/40 border-blue-500/50 hover:border-blue-400 hover:bg-blue-950/60',    text: 'text-blue-300',    badge: 'bg-blue-500',    hex: '#3b82f6' },
    indigo:  { border: 'border-indigo-500/60',  header: 'bg-indigo-600/30 border-indigo-500/40',  card: 'bg-indigo-950/40 border-indigo-500/50 hover:border-indigo-400 hover:bg-indigo-950/60',  text: 'text-indigo-300',  badge: 'bg-indigo-500',  hex: '#6366f1' },
    violet:  { border: 'border-violet-500/60',  header: 'bg-violet-600/30 border-violet-500/40',  card: 'bg-violet-950/40 border-violet-500/50 hover:border-violet-400 hover:bg-violet-950/60',  text: 'text-violet-300',  badge: 'bg-violet-500',  hex: '#8b5cf6' },
    purple:  { border: 'border-purple-500/60',  header: 'bg-purple-600/30 border-purple-500/40',  card: 'bg-purple-950/40 border-purple-500/50 hover:border-purple-400 hover:bg-purple-950/60',  text: 'text-purple-300',  badge: 'bg-purple-500',  hex: '#a855f7' },
    fuchsia: { border: 'border-fuchsia-500/60', header: 'bg-fuchsia-600/30 border-fuchsia-500/40', card: 'bg-fuchsia-950/40 border-fuchsia-500/50 hover:border-fuchsia-400 hover:bg-fuchsia-950/60', text: 'text-fuchsia-300', badge: 'bg-fuchsia-500', hex: '#d946ef' },
    pink:    { border: 'border-pink-500/60',    header: 'bg-pink-600/30 border-pink-500/40',    card: 'bg-pink-950/40 border-pink-500/50 hover:border-pink-400 hover:bg-pink-950/60',    text: 'text-pink-300',    badge: 'bg-pink-500',    hex: '#ec4899' },
    rose:    { border: 'border-rose-500/60',    header: 'bg-rose-600/30 border-rose-500/40',    card: 'bg-rose-950/40 border-rose-500/50 hover:border-rose-400 hover:bg-rose-950/60',    text: 'text-rose-300',    badge: 'bg-rose-500',    hex: '#f43f5e' },
    slate:   { border: 'border-slate-400/60',   header: 'bg-slate-600/30 border-slate-500/40',   card: 'bg-slate-900/40 border-slate-500/50 hover:border-slate-400 hover:bg-slate-900/60',   text: 'text-slate-300',   badge: 'bg-slate-500',   hex: '#94a3b8' },
    zinc:    { border: 'border-zinc-400/60',    header: 'bg-zinc-600/30 border-zinc-500/40',    card: 'bg-zinc-900/40 border-zinc-500/50 hover:border-zinc-400 hover:bg-zinc-900/60',    text: 'text-zinc-300',    badge: 'bg-zinc-500',    hex: '#a1a1aa' },
    white:   { border: 'border-white/40',       header: 'bg-white/10 border-white/20',          card: 'bg-white/5 border-white/20 hover:border-white/40 hover:bg-white/10',             text: 'text-white',       badge: 'bg-white',       hex: '#ffffff' },
  };

  const toggleCommissionPaidMutation = trpc.orderStatus.toggleCommissionPaid.useMutation({
    onSuccess: () => { ordersQuery.refetch(); toast.success("Comissão atualizada!"); },
    onError: () => toast.error("Erro ao atualizar comissão"),
  });

  const updateOrderSourceMutation = trpc.orderStatus.updateOrderSource.useMutation({
    onSuccess: (_, vars) => {
      // Atualização otimista local
      ordersQuery.refetch();
      toast.success(vars.orderSource === 'manual' ? 'Marcado como Manual' : 'Marcado como Automático');
    },
    onError: () => toast.error('Erro ao atualizar origem do pedido'),
  });

  const expandedNumericId = expandedId ? getIdFromKey(expandedId) : 0;

  const historyQuery = trpc.orderStatus.getHistory.useQuery(
    { registrationId: expandedNumericId },
        { enabled: expandedId !== null && (activeTab[expandedId!] === "historico" || activeTab[expandedId!] === "status" || !activeTab[expandedId!]), staleTime: 30000 }
  );
  const filesQuery = trpc.orderStatus.getFiles.useQuery(
    { registrationId: expandedNumericId },
    { enabled: expandedId !== null, staleTime: 0 }
  );

  // Busca TODOS os docs do cliente por telefone (inclui outros pedidos)
  const expandedOrder = expandedId ? (ordersQuery.data ?? []).find(o => getOrderKey(o) === expandedId) : null;
  const expandedPhone = expandedOrder?.phone ?? '';
  const filesByPhoneQuery = trpc.orderStatus.getFilesByPhone.useQuery(
    { phone: expandedPhone },
    { enabled: expandedId !== null && !!expandedPhone && activeTab[expandedId!] === 'documentos', staleTime: 0 }
  );

  const orderNoteQuery = trpc.orderNotes.get.useQuery(
    { registrationId: expandedNumericId },
    { enabled: expandedId !== null && activeTab[expandedId!] === "anotacoes" }
  );

  const loginDataQuery = trpc.loginData.get.useQuery(
    { registrationId: expandedNumericId },
    { enabled: expandedId !== null && activeTab[expandedId!] === "status" }
  );

  // Buscar PIN gerado para o cliente (senha de acompanhamento)
  const customerPinQuery = trpc.customerPin.adminGet.useQuery(
    { phone: expandedPhone },
    { enabled: !!expandedPhone && expandedId !== null && activeTab[expandedId!] === "status" }
  );

  // Queries para aba Perguntas
  const tqListQuery = trpc.trackingQuestions.list.useQuery();
  const createTQMutAdm = trpc.trackingQuestions.create.useMutation({ onSuccess: () => { toast.success('Pergunta criada!'); tqListQuery.refetch(); setShowNewTQAdm(false); resetNewTQAdm(); }, onError: () => toast.error('Erro ao criar') });
  const updateTQMutAdm = trpc.trackingQuestions.update.useMutation({ onSuccess: () => { toast.success('Pergunta atualizada!'); tqListQuery.refetch(); setEditingTQIdAdm(null); }, onError: () => toast.error('Erro ao atualizar') });
  const deleteTQMutAdm = trpc.trackingQuestions.delete.useMutation({ onSuccess: () => { toast.success('Pergunta removida!'); tqListQuery.refetch(); }, onError: () => toast.error('Erro ao remover') });
  const toggleTQMutAdm = trpc.trackingQuestions.toggle.useMutation({ onSuccess: () => tqListQuery.refetch(), onError: () => toast.error('Erro ao alterar status') });

  // Respostas do formulário dinâmico de acompanhamento
  const trackingAnswersQuery = trpc.trackingQuestions.getAnswersByOrder.useQuery(
    { orderId: expandedNumericId },
    { enabled: expandedId !== null && expandedNumericId > 0 && activeTab[expandedId!] === "status" }
  );

  // Perguntas enviadas individualmente para o pedido expandido (assignments)
  const assignmentsQuery = trpc.trackingQuestions.getAssignments.useQuery(
    { orderId: expandedNumericId },
    { enabled: expandedId !== null && expandedNumericId > 0 && activeTab[expandedId!] === "status" }
  );
  const assignToOrderMut = trpc.trackingQuestions.assignToOrder.useMutation({
    onSuccess: () => { toast.success('Pergunta enviada para o pedido!'); assignmentsQuery.refetch(); },
    onError: () => toast.error('Erro ao enviar pergunta'),
  });
  const deleteAssignmentMut = trpc.trackingQuestions.deleteAssignment.useMutation({
    onSuccess: () => { toast.success('Pergunta removida do pedido!'); assignmentsQuery.refetch(); },
    onError: () => toast.error('Erro ao remover pergunta'),
  });

  // Solicitações de documentos pendentes
  const docRequestsQuery = trpc.docRequests.listByRegistration.useQuery(
    { registrationId: expandedNumericId },
    { enabled: expandedId !== null && activeTab[expandedId!] === "documentos" }
  );
  const [docReqMsg, setDocReqMsg] = useState<Record<string, string>>({});
  const [docReqLabel, setDocReqLabel] = useState<Record<string, string>>({});
  const [showDocReqForm, setShowDocReqForm] = useState<string | null>(null);
  const createDocReqMut = trpc.docRequests.create.useMutation({
    onSuccess: () => {
      toast.success('Solicitação enviada ao cliente!');
      setShowDocReqForm(null);
      setDocReqMsg(prev => ({ ...prev, [expandedId!]: '' }));
      docRequestsQuery.refetch();
    },
    onError: () => toast.error('Erro ao criar solicitação'),
  });
  const closeDocReqMut = trpc.docRequests.close.useMutation({
    onSuccess: () => { toast.success('Solicitação encerrada'); docRequestsQuery.refetch(); },
  });
  const deleteDocReqMut = trpc.docRequests.delete.useMutation({
    onSuccess: () => { toast.success('Solicitação removida'); docRequestsQuery.refetch(); },
  });
  const [loginFields, setLoginFields] = useState<Record<string, { loginPhone: string; loginEmail: string; loginPassword: string; authCode: string; emailLink: string; loginNotes: string; loginGroupLink: string }>>({})
  const [loginAuthenticatorQr, setLoginAuthenticatorQr] = useState<Record<string, PendingQr>>({});
  // Inicializar loginFields com dados do banco somente se o admin ainda não editou esse pedido
  useEffect(() => {
    if (!loginDataQuery.data || !expandedId) return;
    const key = expandedId;
    setLoginFields(prev => {
      if (prev[key] !== undefined) return prev;
      const saved = loginDataQuery.data as any;
      return {
        ...prev,
        [key]: {
          loginPhone: saved.loginPhone ?? '',
          loginEmail: saved.loginEmail ?? '',
          loginPassword: saved.loginPassword ?? '',
          authCode: saved.authCode ?? '',
          emailLink: saved.emailLink ?? '',
          loginNotes: saved.loginNotes ?? '',
          loginGroupLink: saved.loginGroupLink ?? '',
        },
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginDataQuery.data, expandedId]);
  const saveLoginDataMut = trpc.loginData.save.useMutation({
    onSuccess: (_result, variables) => {
      toast.success('Dados de login salvos!');
      setLoginAuthenticatorQr(prev => { const next = { ...prev }; delete next[`order_${variables.registrationId}`]; delete next[`rgcnh_${variables.registrationId}`]; delete next[String(variables.registrationId)]; return next; });
      loginDataQuery.refetch();
    },
    onError: (error) => toast.error(error.message || 'Erro ao salvar dados de login'),
  });
  const saveNoteMut = trpc.orderNotes.save.useMutation({
    onSuccess: () => { toast.success('Anotação salva!'); orderNoteQuery.refetch(); },
    onError: () => toast.error('Erro ao salvar anotação'),
  });
  const deleteNoteMut = trpc.orderNotes.delete.useMutation({
    onSuccess: () => { toast.success('Anotação removida!'); orderNoteQuery.refetch(); },
    onError: () => toast.error('Erro ao remover anotação'),
  });
  const [noteText, setNoteText] = useState<Record<string, string>>({});

  const [uploadingDocFor, setUploadingDocFor] = useState<string | null>(null);
  const [newDocLabel, setNewDocLabel] = useState<Record<string, string>>({});
  const [showUploadFor, setShowUploadFor] = useState<string | null>(null);
  const [newAdminDocLabel, setNewAdminDocLabel] = useState<Record<string, string>>({});
  const [showAdminUploadFor, setShowAdminUploadFor] = useState<string | null>(null);
  const [uploadingAdminDocFor, setUploadingAdminDocFor] = useState<string | null>(null);
  // URL de vídeo externo
  const [showVideoUrlFor, setShowVideoUrlFor] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState<Record<string, string>>({});
  const [videoUrlLabel, setVideoUrlLabel] = useState<Record<string, string>>({});
  const [savingVideoUrlFor, setSavingVideoUrlFor] = useState<string | null>(null);
  // Reutilizar documentos do cadastro
  const [showReuseDocsFor, setShowReuseDocsFor] = useState<string | null>(null);
  const [reusingFileId, setReusingFileId] = useState<number | null>(null);

  const uploadFileMut = trpc.orderStatus.uploadFile.useMutation({
    onSuccess: () => {
      toast.success('Documento enviado!');
      setUploadingDocFor(null);
      setShowUploadFor(null);
      filesQuery.refetch();
    },
    onError: () => { toast.error('Erro ao enviar documento'); setUploadingDocFor(null); },
  });

  const uploadAdminFileMut = trpc.orderStatus.uploadFile.useMutation({
    onSuccess: () => {
      toast.success('Documento enviado ao cliente!');
      setUploadingAdminDocFor(null);
      setShowAdminUploadFor(null);
      setNewAdminDocLabel(prev => ({ ...prev }));
      filesQuery.refetch();
    },
    onError: () => { toast.error('Erro ao enviar documento'); setUploadingAdminDocFor(null); },
  });

  const deleteFileMut = trpc.orderStatus.deleteFile.useMutation({
    onSuccess: () => { toast.success('Documento removido!'); filesQuery.refetch(); filesByPhoneQuery.refetch(); trpcUtils.orderStatus.getAdminFilesForClient.invalidate(); },
    onError: () => toast.error('Erro ao remover documento'),
  });

  const addVideoUrlMut = trpc.orderStatus.addVideoUrl.useMutation({
    onSuccess: () => {
      toast.success('Vídeo adicionado ao cliente!');
      setSavingVideoUrlFor(null);
      setShowVideoUrlFor(null);
      filesQuery.refetch();
    },
    onError: () => { toast.error('Erro ao salvar URL do vídeo'); setSavingVideoUrlFor(null); },
  });

  const reuseFileMut = trpc.orderStatus.reuseFile.useMutation({
    onSuccess: () => {
      toast.success('Documento adicionado ao pedido!');
      setReusingFileId(null);
      filesQuery.refetch();
      filesByPhoneQuery.refetch();
    },
    onError: () => { toast.error('Erro ao reutilizar documento'); setReusingFileId(null); },
  });

  // Observação editável do status Entregue
  const [deliveryNote, setDeliveryNote] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [deliveryEstimate, setDeliveryEstimate] = useState<Record<string, string>>({});
  const [savingEstimate, setSavingEstimate] = useState<string | null>(null);
  const [editOrderNumber, setEditOrderNumber] = useState<Record<string, string>>({});
  const [savingOrderNumber, setSavingOrderNumber] = useState<string | null>(null);

  const updateOrderNumberMutation = trpc.orderStatus.updateOrderNumber.useMutation({
    onSuccess: (_, vars) => {
      ordersQuery.refetch();
      setSavingOrderNumber(null);
      toast.success(vars.orderNumber ? `Número #${vars.orderNumber} salvo!` : 'Número removido!');
    },
    onError: () => { setSavingOrderNumber(null); toast.error('Erro ao salvar número do pedido'); },
  });

  // Desbloqueio de PIN
  const unlockPinMut = trpc.orderStatus.unlockPin.useMutation({
    onSuccess: () => toast.success('PIN desbloqueado! O cliente pode tentar novamente.'),
    onError: () => toast.error('Erro ao desbloquear PIN'),
  });
  // Reset de senha do cliente (volta para 4 últimos dígitos do telefone)
  const resetPinMut = trpc.customerPin.adminReset.useMutation({
    onSuccess: () => { toast.success('Senha resetada!'); customerPinQuery.refetch(); },
    onError: () => toast.error('Erro ao resetar senha'),
  });
  // Edição manual do PIN pelo admin
  const [adminPinEdit, setAdminPinEdit] = useState<Record<string, string>>({});
  const setAdminPinMut = trpc.customerPin.adminSet.useMutation({
    onSuccess: () => { toast.success('Senha de acompanhamento atualizada!'); customerPinQuery.refetch(); },
    onError: () => toast.error('Erro ao salvar senha'),
  });

  const updateNoteMut = trpc.orderStatus.updateNote.useMutation({
    onSuccess: () => {
      toast.success('Observação salva!');
      setSavingNote(null);
      historyQuery.refetch();
    },
    onError: () => { toast.error('Erro ao salvar observação'); setSavingNote(null); },
  });

  // ─── ETAPAS INTERNAS ──────────────────────────────────────────────────────
  const stagesListQuery = trpc.stages.list.useQuery();
  const [selectedStageId, setSelectedStageId] = useState<Record<number, number | null>>({});
  // IDs de todos os pedidos visíveis para batch query de etapas
  const allVisibleOrderIds = React.useMemo(
    () => ((ordersQuery.data || []) as Order[]).map(o => o.id),
    [ordersQuery.data]
  );
  const orderStagesBatchQuery = trpc.stages.getOrderStagesBatch.useQuery(
    { registrationIds: allVisibleOrderIds },
    { enabled: allVisibleOrderIds.length > 0, staleTime: 10000 }
  );
  // Mapa de registrationId -> { stageId, setAt }
  const orderStagesMap = React.useMemo(() => {
    const map = new Map<number, { stageId: number; setAt: number }>();
    (orderStagesBatchQuery.data ?? []).forEach((entry: any) => {
      if (entry.stageId) map.set(entry.registrationId, { stageId: entry.stageId, setAt: entry.setAt });
    });
    return map;
  }, [orderStagesBatchQuery.data]);
  const setOrderStageMut = trpc.stages.setOrderStage.useMutation({
    onSuccess: (_, vars) => {
      toast.success('Etapa atualizada!');
      setSelectedStageId(prev => ({ ...prev, [vars.registrationId]: vars.stageId }));
      orderStagesBatchQuery.refetch();
    },
    onError: () => toast.error('Erro ao atualizar etapa'),
  });
  // ─────────────────────────────────────────────────────────────────────────

  const updateDeliveryEstimateMut = trpc.orderStatus.updateDeliveryEstimate.useMutation({
    onSuccess: () => {
      toast.success('Previsão de entrega salva!');
      setSavingEstimate(null);
      ordersQuery.refetch();
    },
    onError: (err) => { console.error('[updateDeliveryEstimate] erro:', err); toast.error('Erro ao salvar previsão de entrega'); setSavingEstimate(null); },
  });

  const handleDocUpload = async (order: Order, file: File) => {
    const label = newDocLabel[getOrderKey(order)]?.trim();
    if (!label) { toast.error('Informe o nome do documento'); return; }
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxSize) { toast.error(isVideo ? 'Vídeo muito grande (máx 200MB)' : 'Arquivo muito grande (máx 20MB)'); return; }
    setUploadingDocFor(getOrderKey(order));
    try {
      if (isVideo) {
        // Vídeo: upload chunked
        const CHUNK_SIZE = 20 * 1024 * 1024;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const initResp = await fetch('/api/upload/init-chunked', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: String(order.id), customerPhone: order.phone, label, fromAdmin: '0', mimeType: file.type || 'video/mp4', totalChunks }),
        });
        if (!initResp.ok) { const err = await initResp.json().catch(() => ({})); throw new Error(err.error || 'Erro ao iniciar upload'); }
        const { uploadId } = await initResp.json();
        for (let i = 0; i < totalChunks; i++) {
          const chunkBlob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
          const chunkForm = new FormData();
          chunkForm.append('chunk', chunkBlob, `chunk-${i}`);
          chunkForm.append('uploadId', uploadId);
          chunkForm.append('chunkIndex', String(i));
          const chunkResp = await fetch('/api/upload/chunk', { method: 'POST', body: chunkForm });
          if (!chunkResp.ok) { const err = await chunkResp.json().catch(() => ({})); throw new Error(err.error || `Erro no chunk ${i}`); }
        }
        const finalResp = await fetch('/api/upload/finalize-chunked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId }) });
        if (!finalResp.ok) { const err = await finalResp.json().catch(() => ({})); throw new Error(err.error || 'Erro ao finalizar upload'); }
        toast.success('Vídeo enviado com sucesso!');
      } else {
        // Imagem/PDF: upload multipart direto (sem base64, sem tRPC)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('registrationId', String(order.id));
        formData.append('customerPhone', order.phone);
        formData.append('label', label);
        formData.append('fromAdmin', '0');
        formData.append('addedByAdmin', '1');
        const resp = await fetch('/api/upload/admin-file', { method: 'POST', body: formData, credentials: 'include' });
        if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || 'Erro ao enviar arquivo'); }
        toast.success('Arquivo enviado com sucesso!');
      }
      await new Promise(r => setTimeout(r, 500));
      await trpcUtils.orderStatus.getFiles.invalidate();
      await filesQuery.refetch();
      ordersQuery.refetch();
      setShowUploadFor(null);
      setNewDocLabel(prev => { const n = { ...prev }; delete n[getOrderKey(order)]; return n; });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar arquivo');
    } finally {
      setUploadingDocFor(null);
    }
  };

  // Recebe uma imagem copiada (print) e reutiliza exatamente o upload já usado pelos documentos do pedido.
  const handlePasteDoc = async (order: Order) => {
    const label = newDocLabel[getOrderKey(order)]?.trim();
    if (!label) { toast.error('Informe o nome do documento antes de colar o print'); return; }
    if (!navigator.clipboard?.read) {
      toast.error('Seu navegador não permite ler prints copiados. Use Selecionar arquivo.');
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      const imageItem = clipboardItems.find((item) => item.types.some((type) => type.startsWith('image/')));
      const imageType = imageItem?.types.find((type) => type.startsWith('image/'));
      if (!imageItem || !imageType) {
        toast.error('Copie um print ou uma imagem e toque em Colar print novamente.');
        return;
      }

      const blob = await imageItem.getType(imageType);
      const extension = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const printFile = new File([blob], `print-${Date.now()}.${extension}`, { type: imageType });
      await handleDocUpload(order, printFile);
    } catch (error) {
      console.warn('[Pedido] Não foi possível colar print:', error);
      toast.error('Não foi possível acessar o print copiado. Copie a imagem e permita o acesso quando o navegador solicitar.');
    }
  };

  const handleAdminDocUpload = async (order: Order, file: File) => {
    const label = newAdminDocLabel[getOrderKey(order)]?.trim();
    if (!label) { toast.error('Informe o nome do documento'); return; }
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxSize) { toast.error(isVideo ? 'Vídeo muito grande (máx 200MB)' : 'Arquivo muito grande (máx 20MB)'); return; }
    setUploadingAdminDocFor(getOrderKey(order));
    try {
      if (isVideo) {
        // Vídeo: upload em chunks de 20MB
        const CHUNK_SIZE = 20 * 1024 * 1024;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const initResp = await fetch('/api/upload/init-chunked', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: String(order.id), customerPhone: order.phone, label, fromAdmin: '1', mimeType: file.type || 'video/mp4', totalChunks }),
        });
        if (!initResp.ok) { const err = await initResp.json().catch(() => ({})); throw new Error(err.error || 'Erro ao iniciar upload'); }
        const { uploadId } = await initResp.json();
        for (let i = 0; i < totalChunks; i++) {
          const chunkBlob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
          let lastChunkErr: Error | null = null;
          let chunkSent = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const chunkForm = new FormData();
              chunkForm.append('chunk', chunkBlob, `chunk-${i}`);
              chunkForm.append('uploadId', uploadId);
              chunkForm.append('chunkIndex', String(i));
              const chunkResp = await fetch('/api/upload/chunk', { method: 'POST', body: chunkForm });
              if (!chunkResp.ok) { const err = await chunkResp.json().catch(() => ({})); throw new Error(err.error || `Erro no chunk ${i}`); }
              chunkSent = true;
              break;
            } catch (e: any) {
              lastChunkErr = e;
              if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            }
          }
          if (!chunkSent) throw lastChunkErr || new Error(`Falha no chunk ${i} após 3 tentativas`);
        }
        const finalResp = await fetch('/api/upload/finalize-chunked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId }) });
        if (!finalResp.ok) { const err = await finalResp.json().catch(() => ({})); throw new Error(err.error || 'Erro ao finalizar upload'); }
        toast.success('Vídeo enviado com sucesso!');
      } else {
        // Imagem/PDF: upload multipart direto (sem base64, sem tRPC)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('registrationId', String(order.id));
        formData.append('customerPhone', order.phone);
        formData.append('label', label);
        formData.append('fromAdmin', '1');
        const resp = await fetch('/api/upload/admin-file', { method: 'POST', body: formData, credentials: 'include' });
        if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || 'Erro ao enviar arquivo'); }
        toast.success('Documento enviado ao cliente!');
      }
      await new Promise(r => setTimeout(r, 500));
      await trpcUtils.orderStatus.getFiles.invalidate();
      await filesQuery.refetch();
      ordersQuery.refetch();
      setShowAdminUploadFor(null);
      setNewAdminDocLabel(prev => { const n = { ...prev }; delete n[getOrderKey(order)]; return n; });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar arquivo');
    } finally {
      setUploadingAdminDocFor(null);
    }
  };

  const handleDownloadFile = async (url: string, label: string, mimeType: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
      const safeName = label.replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').trim().replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${label} salvo!`);
    } catch {
      toast.error('Erro ao baixar arquivo');
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
    </div>
  );
  if (!isAdmin) return null;

  // Filtrar pedidos arquivados/RG-CNH localmente para remoção imediata sem esperar refetch
  // Aplicar overrides de status locais para atualização imediata
  const orders: Order[] = ((ordersQuery.data || []) as Order[])
    .filter(o => !localArchivedIds.has(String(o.id)))
    .filter(o => !localRgCnhIds.has(String(o.id)))
    .filter(o => !o.folderName) // Pedidos em pastas personalizadas ficam somente na pasta (Opção A)
    .map(o => {
      const key = getOrderKey(o);
      if (localStatusOverrides[key] !== undefined) {
        return { ...o, latestStatus: localStatusOverrides[key] };
      }
      return o;
    });

  const exportCSV = () => {
    const headers = ["Nome", "Telefone", "Email", "Cidade", "UF", "Serviço", "Opção", "Status", "Data do Pedido"];
    const rows = filtered.map(o => [
      o.customerName || o.codeClientName || "",
      o.phone || "",
      o.customerEmail || "",
      o.customerCity || "",
      o.customerUf || "",
      o.serviceName || "",
      o.serviceOption || "",
      o.latestStatus ? (ACTIVE_STATUS_CONFIG[o.latestStatus]?.label || o.latestStatus) : "Sem status",
      o.accessedAt ? new Date(o.accessedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV exportado! (${filtered.length} pedidos)`);
  };

  const normalizeCsvField = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 ]/g, "");

  const getCsvFieldName = (field: string) => {
    const normalized = normalizeCsvField(field);
    if (["name", "nome"].includes(normalized)) return "name";
    if (["phone", "telefone", "celular", "fone"].includes(normalized)) return "phone";
    if (["email", "e mail", "e-mail", "email"].includes(normalized)) return "email";
    if (["city", "cidade"].includes(normalized)) return "city";
    if (["uf", "estado"].includes(normalized)) return "uf";
    if (["referredby", "referred by", "indicacao", "indicado por", "recomendado por", "indicador"].includes(normalized)) return "referredBy";
    if (["referredbyphone", "referred by phone", "telefone do indicado", "telefone indicador", "telefone indicacao"].includes(normalized)) return "referredByPhone";
    if (["service", "servico", "serviço", "servicename", "nome do servico"].includes(normalized)) return "serviceName";
    if (["serviceoption", "service option", "opcao", "opção", "opcao do servico", "opção do serviço"].includes(normalized)) return "serviceOption";
    if (["status", "situacao", "situação"].includes(normalized)) return "status";
    if (["note", "observacao", "observação", "obs"].includes(normalized)) return "note";
    if (["answers", "respostas", "answer"].includes(normalized)) return "answers";
    if (["date", "data", "data do pedido", "order date", "orderdate"].includes(normalized)) return "date";
    return null;
  };

  const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map(cell => cell.replace(/^"([\s\S]*)"$/, "$1").replace(/""/g, '"').trim());
  };

  const parseCsvText = (text: string) => {
    const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    const lines = normalizedText.split("\n").filter(line => line.trim().length > 0);
    if (lines.length === 0) return { headers: [] as string[], rows: [] as string[][] };
    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(parseCsvLine);
    return { headers, rows };
  };

  const buildCsvPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const { headers, rows } = parseCsvText(text);
      setCsvPreview({ rows: rows.length, headers, sample: rows.slice(0, 3).map(row => row.join(", ")) });
      setCsvErrors([]);
      setCsvImportResult(null);
    };
    reader.onerror = () => {
      setCsvPreview(null);
      setCsvErrors(["Não foi possível ler o arquivo CSV."]);
      setCsvImportResult(null);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleCsvFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setCsvFile(file);
    setCsvImportResult(null);
    setCsvErrors([]);
    if (file) {
      buildCsvPreview(file);
    } else {
      setCsvPreview(null);
    }
  };

  const handleImportCsv = async () => {
    if (!csvFile) {
      toast.error("Selecione um arquivo CSV antes de importar.");
      return;
    }
    setCsvImporting(true);
    setCsvErrors([]);
    setCsvImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const response = await fetch("/api/orders/import-csv", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error || "Falha ao importar o CSV.";
        setCsvErrors([message]);
        toast.error(message);
      } else {
        setCsvImportResult({
          imported: Number(data.imported ?? 0),
          duplicates: Number(data.duplicates ?? 0),
          errors: Number(data.errors ?? 0),
          details: Array.isArray(data.details) ? data.details.slice(0, 10) : [],
        });
        toast.success(`Importação concluída: ${data.imported ?? 0} pedidos importados.`);
        await ordersQuery.refetch();
      }
    } catch (error) {
      setCsvErrors(["Erro de rede ao enviar o CSV."]);
      toast.error("Erro de rede ao enviar o CSV.");
    } finally {
      setCsvImporting(false);
    }
  };

  // Helper para verificar se um status é "entregue" — declarado antes de filtered para uso global
  const isDeliveredStatus = (status: string | null) =>
    status === "entregue" || status === "login_de_acesso" || status === "pedido_entregue";

  const filtered = orders.filter(o => {
    const name = (o.customerName || o.codeClientName || "").toLowerCase();
    const phone = (o.phone || "").toLowerCase();
    const phoneDigits = (o.phone || "").replace(/\D/g, ""); // telefone só com dígitos para busca
    const email = (o.customerEmail || "").toLowerCase();
    const numericPrefix = (o.customerName || o.codeClientName || "").trim().match(/^(\d+)/)?.[1] || "";
    const rawTerm = search.trim();
    const term = rawTerm.toLowerCase();
    const termDigits = rawTerm.replace(/\D/g, ""); // termo de busca só com dígitos

    // Detectar tipo de busca:
    // #10001 → busca por número de pedido exato
    // *37 ou 37 (número puro) → busca por número de cadastro exato
    // texto → busca por nome/telefone/email
    const isOrderSearch = rawTerm.startsWith("#");
    const isCadastroSearch = rawTerm.startsWith("*");
    const orderSearchNum = isOrderSearch ? rawTerm.slice(1) : "";
    const cadastroSearchNum = isCadastroSearch ? rawTerm.slice(1) : "";
    const isPureNumber = !isOrderSearch && !isCadastroSearch && /^\d+$/.test(term);

    let matchSearch: boolean;
    if (!rawTerm) {
      matchSearch = true;
    } else if (isOrderSearch) {
      // Busca por #número: match exato no orderNumber
      matchSearch = o.orderNumber != null && String(o.orderNumber) === orderSearchNum;
    } else if (isCadastroSearch) {
      // Busca por *número: match exato no customerNumber
      matchSearch = o.customerNumber != null && String(o.customerNumber) === cadastroSearchNum;
    } else if (isPureNumber) {
      // Número puro: match exato por customerNumber (número de cadastro)
      const exactMatch = o.customerNumber != null && String(o.customerNumber) === term;
      // Se tem 8+ dígitos, também busca por telefone (número digitado sem formatação)
      const phoneMatch = termDigits.length >= 8 && phoneDigits.includes(termDigits);
      // Fallback: se não achar por cadastro, busca por orderNumber, prefixo numérico do nome ou telefone
      const fallback = !exactMatch && (
        (o.orderNumber != null && String(o.orderNumber) === term) ||
        (!!numericPrefix && numericPrefix === term) ||
        phoneMatch
      );
      matchSearch = exactMatch || fallback;
    } else {
      // Busca textual normal — compara nome, email e telefone (com e sem formatação)
      const phoneMatch = phone.includes(term) || (termDigits.length >= 6 && phoneDigits.includes(termDigits));
      matchSearch = name.includes(term) || phoneMatch || email.includes(term) ||
        (!!numericPrefix && numericPrefix.startsWith(term));
    }

    const isGroupFilter = filterStatus.startsWith('group_');
    const groupFilterId = isGroupFilter ? parseInt(filterStatus.replace('group_', '')) : null;
    const matchStatus = filterStatus === "all"
      || filterStatus === "urgente"
      || filterStatus === "com_indicador"
      || o.latestStatus === filterStatus
      || (filterStatus === "sem_status" && !o.latestStatus)
      || (isGroupFilter && groupFilterId !== null && (customGroupsQuery.data || []).find((g: any) => g.id === groupFilterId)?.memberIds.includes(o.id));
    const matchUrgent = filterStatus !== "urgente" || o.isUrgent === 1;
    const matchIndicador = filterStatus !== "com_indicador" || !!o.customerReferredByPhone;
    // Filtro por data
    let matchDate = true;
    if (dateFilter !== "all") {
      const now = new Date();
      const rawDate = o.accessedAt || o.submittedAt;
      if (!rawDate) {
        matchDate = false;
      } else {
        const orderDate = new Date(rawDate);
        if (dateFilter === "today") {
          const toLocalDateStr = (d: Date) =>
            `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          matchDate = toLocalDateStr(orderDate) === toLocalDateStr(now);
        } else if (dateFilter === "week") {
          const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          matchDate = orderDate >= weekAgo;
        } else if (dateFilter === "month") {
          const monthAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
          matchDate = orderDate >= monthAgo;
        } else if (dateFilter === "custom") {
          if (dateFrom) {
            const from = new Date(dateFrom + "T00:00:00");
            if (orderDate < from) matchDate = false;
          }
          if (dateTo && matchDate) {
            const to = new Date(dateTo + "T23:59:59");
            if (orderDate > to) matchDate = false;
          }
        }
      }
    }
    // Se houver busca ativa, ignorar filtros de status e data (busca global)
    // Sempre excluir entregues do filtered — entregues ficam somente na aba Entregues
    const isDelivered = isDeliveredStatus(o.latestStatus);
    if (rawTerm) return matchSearch && !isDelivered;
    return matchSearch && matchStatus && matchUrgent && matchIndicador && matchDate && !isDelivered;
  });

  const getOrderNumber = (order: Order) => {
    const name = (order.customerName || order.codeClientName || "").trim();
    const match = name.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : order.id;
  };
  // Excluir entregues das contagens de urgentes e indicadores (entregues ficam somente na aba Entregues)
  const activeOrdersForCount = orders.filter(o => !isDeliveredStatus(o.latestStatus));
  const urgentCount = activeOrdersForCount.filter(o => o.isUrgent === 1).length;
  const indicadorCount = activeOrdersForCount.filter(o => !!o.customerReferredByPhone).length;
  const commissionPendingCount = activeOrdersForCount.filter(o => !!o.customerReferredByPhone && o.commissionPaid !== 1).length;
  const sorted = [...filtered].sort((a, b) => {
    let valA: number | string;
    let valB: number | string;
    if (sortBy === "status_date") {
      valA = new Date(a.latestStatusAt || a.submittedAt || a.accessedAt).getTime();
      valB = new Date(b.latestStatusAt || b.submittedAt || b.accessedAt).getTime();
    } else if (sortBy === "name") {
      valA = (a.customerName || a.codeClientName || "").toLowerCase();
      valB = (b.customerName || b.codeClientName || "").toLowerCase();
      return sortOrder === "asc"
        ? (valA < valB ? -1 : valA > valB ? 1 : 0)
        : (valA > valB ? -1 : valA < valB ? 1 : 0);
    } else {
      // date: data do pedido (accessedAt / submittedAt)
      valA = new Date(a.submittedAt || a.accessedAt).getTime();
      valB = new Date(b.submittedAt || b.accessedAt).getTime();
    }
    return sortOrder === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
  });
  const allFilteredIds = sorted.map(o => getOrderKey(o));
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id as string));
  const someSelected = selected.size > 0;

  // activeOrders: sorted já não inclui entregues (filtered exclui entregues)
  const activeOrders = sorted;

  // Agrupar pedidos com mesmo cartGroupId em grupos de carrinho
  // Pedidos sem cartGroupId ficam como grupos de 1 item
  type CartGroup = { cartGroupId: string | null; orders: Order[]; primaryOrder: Order };
  const cartGroupedOrders: CartGroup[] = [];
  const cartGroupMap = new Map<string, CartGroup>();
  for (const o of activeOrders) {
    const cgId = o.cartGroupId || null;
    if (cgId) {
      if (!cartGroupMap.has(cgId)) {
        const group: CartGroup = { cartGroupId: cgId, orders: [], primaryOrder: o };
        cartGroupMap.set(cgId, group);
        cartGroupedOrders.push(group);
      }
      const group = cartGroupMap.get(cgId)!;
      group.orders.push(o);
      // O primaryOrder é o item com cartItemIndex=0 (ou o primeiro encontrado)
      if ((o.cartItemIndex ?? 0) < (group.primaryOrder.cartItemIndex ?? 0)) {
        group.primaryOrder = o;
      }
    } else {
      // Pedido sem carrinho: grupo de 1 item
      cartGroupedOrders.push({ cartGroupId: null, orders: [o], primaryOrder: o });
    }
  }
  // Ordenar itens dentro de cada grupo por cartItemIndex
  for (const g of cartGroupedOrders) {
    if (g.cartGroupId) {
      g.orders.sort((a, b) => (a.cartItemIndex ?? 0) - (b.cartItemIndex ?? 0));
    }
  }

  // Helper de ordenação para pastas (Arquivo e Entregues)
  function sortFolderOrders<T extends { customerName?: string | null; customerNumber?: number | null; orderNumber?: number | null; latestStatusAt?: number | null; accessedAt?: number | null }>(list: T[], key: "number" | "name" | "date", dir: "asc" | "desc"): T[] {
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (key === "number") {
        const na = a.customerNumber ?? a.orderNumber ?? 999999;
        const nb = b.customerNumber ?? b.orderNumber ?? 999999;
        cmp = na - nb;
      } else if (key === "name") {
        const na = (a.customerName || "").toLowerCase();
        const nb = (b.customerName || "").toLowerCase();
        cmp = na.localeCompare(nb, "pt-BR");
      } else {
        const da = a.latestStatusAt ?? a.accessedAt ?? 0;
        const db = b.latestStatusAt ?? b.accessedAt ?? 0;
        cmp = da - db;
      }
      return dir === "asc" ? cmp : -cmp;
    });
  }
  function sortDeliveredOrders(list: Order[], key: DeliveredSortKey, dir: "asc" | "desc"): Order[] {
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (key === "number") {
        const na = a.customerNumber ?? a.orderNumber ?? 999999;
        const nb = b.customerNumber ?? b.orderNumber ?? 999999;
        cmp = na - nb;
      } else if (key === "name") {
        const na = (a.customerName || "").toLowerCase();
        const nb = (b.customerName || "").toLowerCase();
        cmp = na.localeCompare(nb, "pt-BR");
      } else if (key === "notified") {
        const da = a.deliveredNotifiedAt ?? a.latestStatusAt ?? 0;
        const db = b.deliveredNotifiedAt ?? b.latestStatusAt ?? 0;
        cmp = da - db;
      } else {
        const da = a.latestStatusAt ?? a.accessedAt ?? 0;
        const db = b.latestStatusAt ?? b.accessedAt ?? 0;
        cmp = da - db;
      }
      return dir === "asc" ? cmp : -cmp;
    });
  }

  // deliveredOrders: buscar diretamente de orders (não de sorted, pois filtered já exclui entregues)
  const deliveredPhoneClean = deliveredPhoneFilter.replace(/\D/g, '');
  const deliveredOrders = sortDeliveredOrders(
    orders.filter(o => {
      if (!isDeliveredStatus(o.latestStatus)) return false;
      if (!deliveredPhoneClean) return true;
      const orderPhone = (o.phone || '').replace(/\D/g, '');
      return orderPhone.includes(deliveredPhoneClean);
    }),
    deliveredSortKey, deliveredSortDir
  );

  // Agrupar pedidos ATIVOS por produto (serviceName)
  const SEM_PRODUTO = "(Sem produto)";
  const productGroups: { name: string; orders: typeof sorted }[] = [];
  const groupMap = new Map<string, typeof sorted>();
  for (const o of activeOrders) {
    const key = o.serviceName?.trim() || SEM_PRODUTO;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(o);
  }
  // Ordenar grupos: produtos com mais pedidos primeiro, "Sem produto" por último
  const sortedGroupKeys = Array.from(groupMap.keys()).sort((a, b) => {
    if (a === SEM_PRODUTO) return 1;
    if (b === SEM_PRODUTO) return -1;
    return (groupMap.get(b)?.length || 0) - (groupMap.get(a)?.length || 0);
  });
  for (const key of sortedGroupKeys) productGroups.push({ name: key, orders: groupMap.get(key)! });
  // Adicionar produtos sem pedidos (da lista completa de produtos)
  // Usa comparação normalizada (trim + lowercase) para evitar duplicatas por espaços/acentos
  for (const prodName of allProductNames) {
    const normalizedNew = prodName.trim().toLowerCase();
    const alreadyExists = productGroups.some(g => g.name.trim().toLowerCase() === normalizedNew);
    if (!alreadyExists && prodName !== SEM_PRODUTO) {
      productGroups.push({ name: prodName, orders: [] });
    }
  }
  // Mapear produto -> índice de cor
  const productColorIndex = new Map<string, number>();
  productGroups.forEach((g, i) => productColorIndex.set(g.name, i % PRODUCT_COLORS.length));

  // Sub-agrupar por opção (serviceOption) dentro de cada produto
  const SEM_OPCAO = "(Sem opção)";
  type OptionGroup = { name: string; orders: typeof sorted };
  function buildOptionGroups(orders: typeof sorted): OptionGroup[] {
    const optMap = new Map<string, typeof sorted>();
    for (const o of orders) {
      const key = o.serviceOption?.trim() || SEM_OPCAO;
      if (!optMap.has(key)) optMap.set(key, []);
      optMap.get(key)!.push(o);
    }
    // Se só há uma opção ou nenhuma, não sub-agrupar
    if (optMap.size <= 1) return [{ name: "", orders }];
    const sortedOptKeys = Array.from(optMap.keys()).sort((a, b) => {
      if (a === SEM_OPCAO) return 1;
      if (b === SEM_OPCAO) return -1;
      return (optMap.get(b)?.length || 0) - (optMap.get(a)?.length || 0);
    });
    return sortedOptKeys.map(k => ({ name: k, orders: optMap.get(k)! }));
  }

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allFilteredIds));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleUpdateStatus = (order: Order) => {
    const status = selectedStatus[getOrderKey(order)] || order.latestStatus || "em_andamento";
    // Nunca enviar 'recebido' manualmente — criaria sub-pedido duplicado
    if (status === 'recebido') {
      toast.error('Status "Recebido" é gerado automaticamente e não pode ser definido manualmente.');
      return;
    }
    updateMutation.mutate({
      registrationId: order.id,
      subOrderIndex: order.subOrderIndex ?? 0,
      customerPhone: order.phone,
      customerEmail: order.customerEmail || undefined,
      customerName: order.customerName || order.codeClientName || undefined,
      status,
      note: note[getOrderKey(order)] || undefined,
      serviceName: order.serviceName || undefined,
      serviceOption: order.serviceOption || undefined,
      customerNumber: order.customerNumber || undefined,
      orderNumber: order.orderNumber || undefined,
      customerCity: order.customerCity || undefined,
      customerUf: order.customerUf || undefined,
      deliveryEstimate: order.deliveryEstimate || undefined,
      skipEmail: false,
    });
  };
  const handleUpdateStatusSilent = (order: Order) => {
    const status = selectedStatus[getOrderKey(order)] || order.latestStatus || "em_andamento";
    if (status === 'recebido') {
      toast.error('Status "Recebido" é gerado automaticamente e não pode ser definido manualmente.');
      return;
    }
    updateMutation.mutate({
      registrationId: order.id,
      subOrderIndex: order.subOrderIndex ?? 0,
      customerPhone: order.phone,
      customerEmail: order.customerEmail || undefined,
      customerName: order.customerName || order.codeClientName || undefined,
      status,
      note: note[getOrderKey(order)] || undefined,
      serviceName: order.serviceName || undefined,
      serviceOption: order.serviceOption || undefined,
      customerNumber: order.customerNumber || undefined,
      orderNumber: order.orderNumber || undefined,
      customerCity: order.customerCity || undefined,
      customerUf: order.customerUf || undefined,
      deliveryEstimate: order.deliveryEstimate || undefined,
      skipEmail: true,
    });
  };
  const handleCancelOrder = (order: Order) => {
    updateMutation.mutate({
      registrationId: order.id,
      subOrderIndex: order.subOrderIndex ?? 0,
      customerPhone: order.phone,
      customerEmail: order.customerEmail || undefined,
      customerName: order.customerName || order.codeClientName || undefined,
      status: "cancelado",
      note: note[getOrderKey(order)] || undefined,
      serviceName: order.serviceName || undefined,
      serviceOption: order.serviceOption || undefined,
      customerNumber: order.customerNumber || undefined,
      orderNumber: order.orderNumber || undefined,
      customerCity: order.customerCity || undefined,
      customerUf: order.customerUf || undefined,
      deliveryEstimate: order.deliveryEstimate || undefined,
    });
  };

  const startEditCustomer = (order: Order) => {
    setEditingCustomer(prev => ({
      ...prev,
      [getOrderKey(order)]: {
        name: order.customerName || "",
        phone: order.phone || "",
        email: order.customerEmail || "",
        city: order.customerCity || "",
        uf: order.customerUf || "",
        referredBy: order.customerReferredBy || "",
        referredByPhone: order.customerReferredByPhone || "",
        customerNumber: order.customerNumber != null ? String(order.customerNumber) : "",
      }
    }));
  };

  const cancelEditCustomer = (orderId: string) => {
    setEditingCustomer(prev => { const n = { ...prev }; delete n[orderId]; return n; });
  };

  const handleSaveCustomer = (order: Order) => {
    if (!order.customerId) { toast.error("Cliente não encontrado no banco"); return; }
    const data = editingCustomer[getOrderKey(order)];
    if (!data) return;
    const phoneDigits = data.phone.replace(/\D/g, "");
    if (phoneDigits && phoneDigits.length < 10) {
      toast.error("Telefone inválido (mínimo 10 dígitos)");
      return;
    }
    const parsedCustomerNumber = data.customerNumber ? parseInt(data.customerNumber, 10) : null;
    if (data.customerNumber && (isNaN(parsedCustomerNumber!) || parsedCustomerNumber! <= 0)) {
      toast.error("Número de cadastro inválido");
      return;
    }
    updateCustomerMutation.mutate({
      id: order.customerId,
      name: data.name || undefined,
      phone: phoneDigits || undefined,
      email: data.email || undefined,
      city: data.city || undefined,
      uf: data.uf || undefined,
      referredBy: data.referredBy || undefined,
      referredByPhone: data.referredByPhone || undefined,
      customerNumber: parsedCustomerNumber,
    });
    cancelEditCustomer(getOrderKey(order));
  };

  const getTab = (id: string) => activeTab[id] || "status";
  const setTab = (id: string, tab: "status" | "cliente" | "historico" | "documentos" | "anotacoes") => {
    setActiveTab(prev => ({ ...prev, [id]: tab }));
  };

  const formatPhone = (p: string) => {
    const d = p.replace(/\D/g, "");
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return p;
  };

  const { fmt: fmtTz } = useTimezone();
  const formatDate = (d: Date | string | null | number) => fmtTz(d);

  const selectedOrders = filtered.filter(o => selected.has(getOrderKey(o)));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalProgressSequenceModal
        open={showGlobalProgressSequence}
        onClose={() => setShowGlobalProgressSequence(false)}
        statuses={dynamicStatuses as any[]}
        savedKeys={globalProgressSequenceQuery.data?.keys ?? []}
        enabled={globalProgressSequenceQuery.data?.enabled === true}
        onSave={(keys) => saveGlobalProgressSequence.mutate({ statusKeys: keys })}
        isSaving={saveGlobalProgressSequence.isPending}
        statusConfig={ACTIVE_STATUS_CONFIG}
      />
      {/* Lightbox de foto do cliente */}
      {photoLightboxUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPhotoLightboxUrl(null)}
        >
          <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={photoLightboxUrl}
              alt="Foto do cliente"
              className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setPhotoLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center hover:bg-zinc-700 transition-colors shadow-lg"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      <AdminHeader
        title="Pedidos"
        icon={<Package className="w-5 h-5" />}
        rightContent={
          <div className="flex items-center gap-1">
            {/* Dropdown de ordenação */}
            <div className="relative group">
              <button
                className="flex items-center gap-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs font-medium hover:border-primary/50 transition-colors"
                title="Ordenação"
                onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
              >
                {sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-primary" /> : <ArrowDown className="w-3.5 h-3.5 text-primary" />}
                <span className="hidden sm:inline text-[10px] text-muted-foreground">
                  {sortBy === "date" ? "Data" : sortBy === "status_date" ? "Status" : "Nome"}
                </span>
              </button>
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 min-w-[160px] py-1 hidden group-hover:block">
                <div className="px-3 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Ordenar por</div>
                {(["date", "status_date", "name"] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors ${
                      sortBy === k ? "text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    {sortBy === k && <Check className="w-3 h-3" />}
                    {k === "date" && "Data do pedido"}
                    {k === "status_date" && "Data do status"}
                    {k === "name" && "Nome do cliente"}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <div className="px-3 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Direção</div>
                <button
                  onClick={() => setSortOrder("asc")}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors ${
                    sortOrder === "asc" ? "text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  {sortOrder === "asc" && <Check className="w-3 h-3" />}
                  <ArrowUp className="w-3 h-3" /> Crescente
                </button>
                <button
                  onClick={() => setSortOrder("desc")}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors ${
                    sortOrder === "desc" ? "text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  {sortOrder === "desc" && <Check className="w-3 h-3" />}
                  <ArrowDown className="w-3 h-3" /> Decrescente
                </button>
              </div>
            </div>
            {someSelected && (
              <button onClick={() => setConfirmBulkDelete(true)} className="flex items-center gap-1 px-2 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
                <Trash className="w-3.5 h-3.5" />{selected.size}
              </button>
            )}
            {commissionPendingCount > 0 && (
              <button onClick={() => navigate("/admin/commissions")} className="flex items-center gap-1 px-2 py-1.5 bg-amber-500/20 border border-amber-500/50 text-amber-400 rounded-lg text-xs font-semibold hover:bg-amber-500/30 transition-colors animate-pulse">
                💰{commissionPendingCount}
              </button>
            )}
            <button onClick={() => setShowGlobalProgressSequence(true)} className="flex items-center gap-1 px-2 py-1.5 bg-purple-600/20 border border-purple-500/40 text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-600/30 transition-colors" title="Definir uma única sequência de progresso para todos os clientes">
              <Layers className="w-3.5 h-3.5" /><span className="hidden lg:inline">Sequência do Cliente</span>
            </button>
            <button onClick={() => navigate("/admin/orders/new")} className="flex items-center gap-1 px-2 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline">Novo</span>
            </button>
            <button onClick={() => setShowCsvImportModal(true)} className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors">
              <Upload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Importar CSV</span>
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1 px-2 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">
              <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">CSV</span>
            </button>
            <button onClick={() => ordersQuery.refetch()} className="p-1.5 rounded-lg hover:bg-card transition-colors">
              <RefreshCw className={`w-4 h-4 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {showCsvImportModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Importar pedidos CSV</h2>
                <p className="text-sm text-muted-foreground">Envie um arquivo CSV com os pedidos. Os valores duplicados por telefone/data serão ignorados.</p>
              </div>
              <button onClick={() => setShowCsvImportModal(false)} className="rounded-full p-2 text-muted-foreground hover:bg-card transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Arquivo CSV</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="block w-full rounded-2xl border border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary"
                />
              </div>
              {csvFile && (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{csvFile.name}</span>
                    <span>({Math.round(csvFile.size / 1024)} KB)</span>
                  </div>
                  {csvPreview && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <div>Linhas: {csvPreview.rows}</div>
                      <div>Colunas: {csvPreview.headers.length}</div>
                    </div>
                  )}
                </div>
              )}
              {csvImportResult && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-foreground">
                  <div className="font-semibold">Resultado da importação</div>
                  <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                    <div>Importados: {csvImportResult.imported}</div>
                    <div>Duplicatas ignoradas: {csvImportResult.duplicates}</div>
                    <div>Erros: {csvImportResult.errors}</div>
                  </div>
                  {csvImportResult.details.length > 0 && (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {csvImportResult.details.map((detail, index) => (
                        <div key={index}>• {detail}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {csvErrors.length > 0 && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
                  {csvErrors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:justify-end sm:items-center">
              <button
                type="button"
                onClick={() => {
                  setShowCsvImportModal(false);
                  setCsvFile(null);
                  setCsvPreview(null);
                  setCsvImportResult(null);
                  setCsvErrors([]);
                }}
                className="rounded-2xl border border-border px-4 py-2 text-sm text-foreground hover:bg-card transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportCsv}
                disabled={!csvFile || csvImporting}
                className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors disabled:opacity-50"
              >
                {csvImporting ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-[57px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">

        {/* Busca */}
        <div className="px-4 pb-2 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter') {
                    // Tentar abrir imediatamente com dados em cache
                    const tryOpen = () => {
                      const currentFiltered = (ordersQuery.data ?? []).filter(o => {
                        const rawTerm = search.trim();
                        if (!rawTerm) return false;
                        const term = rawTerm.toLowerCase();
                        const isOrderSearch = rawTerm.startsWith('#');
                        const isCadastroSearch = rawTerm.startsWith('*');
                        const isPureNumber = !isOrderSearch && !isCadastroSearch && /^\d+$/.test(term);
                        if (isOrderSearch) return o.orderNumber != null && String(o.orderNumber) === rawTerm.slice(1);
                        if (isCadastroSearch) return o.customerNumber != null && String(o.customerNumber) === rawTerm.slice(1);
                        if (isPureNumber) return o.customerNumber != null && String(o.customerNumber) === term;
                        const name = (o.customerName || o.codeClientName || '').toLowerCase();
                        const phone = (o.phone || '').toLowerCase();
                        const phoneDigits = (o.phone || '').replace(/\D/g, '');
                        const termDigits = rawTerm.replace(/\D/g, '');
                        const phoneMatch = phone.includes(term) || (termDigits.length >= 6 && phoneDigits.includes(termDigits));
                        return name.includes(term) || phoneMatch || (o.customerEmail || '').toLowerCase().includes(term);
                      });
                      if (currentFiltered.length === 1) {
                        const only = currentFiltered[0];
                        const key = getOrderKey(only);
                        setExpandedId(key);
                        setTab(key, 'status');
                        markAsViewed(key);
                        setTimeout(() => {
                          const el = document.getElementById(`order-card-${key}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 150);
                        return true;
                      }
                      return false;
                    };
                    // Tenta abrir imediatamente (cache hit)
                    if (!tryOpen()) {
                      // Se não abriu, aguarda refetch e tenta novamente
                      await handleForcedSearch();
                      setTimeout(() => {
                      const currentFiltered = (ordersQuery.data ?? []).filter(o => {
                        const rawTerm = search.trim();
                        if (!rawTerm) return false;
                        const term = rawTerm.toLowerCase();
                        const isOrderSearch = rawTerm.startsWith('#');
                        const isCadastroSearch = rawTerm.startsWith('*');
                        const isPureNumber = !isOrderSearch && !isCadastroSearch && /^\d+$/.test(term);
                        if (isOrderSearch) return o.orderNumber != null && String(o.orderNumber) === rawTerm.slice(1);
                        if (isCadastroSearch) return o.customerNumber != null && String(o.customerNumber) === rawTerm.slice(1);
                        if (isPureNumber) return o.customerNumber != null && String(o.customerNumber) === term;
                        const name = (o.customerName || o.codeClientName || '').toLowerCase();
                        const phone = (o.phone || '').toLowerCase();
                        const phoneDigits = (o.phone || '').replace(/\D/g, '');
                        const termDigits = rawTerm.replace(/\D/g, '');
                        const phoneMatch = phone.includes(term) || (termDigits.length >= 6 && phoneDigits.includes(termDigits));
                        return name.includes(term) || phoneMatch || (o.customerEmail || '').toLowerCase().includes(term);
                      });
                      if (currentFiltered.length === 1) {
                        const only = currentFiltered[0];
                        const key = getOrderKey(only);
                        setExpandedId(key);
                        setTab(key, 'status');
                        markAsViewed(key);
                        setTimeout(() => {
                          const el = document.getElementById(`order-card-${key}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 150);
                      }
                      }, 150); // fim setTimeout
                    } // fim if(!tryOpen())
                  } // fim if(Enter)
                }}
                placeholder="Telefone, #pedido, *cadastro, nome... ou /termo para busca global"
                className={`w-full pl-9 pr-4 py-2 bg-card border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-colors ${
                  isEmergencySearch
                    ? 'border-orange-500 focus:ring-orange-500/50 bg-orange-950/20'
                    : 'border-border focus:ring-primary/50'
                }`}
              />
              {isEmergencySearch && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-orange-400 bg-orange-950/60 px-1.5 py-0.5 rounded">
                  🚨 GLOBAL
                </span>
              )}
            </div>
            {/* Botão de busca dedicado */}
            <button
              onClick={handleForcedSearch}
              disabled={searchPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-all min-w-[90px] justify-center"
              title="Buscar pedidos"
            >
              {searchPending
                ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <Search className="w-4 h-4" />
              }
              <span>{searchPending ? 'Buscando...' : 'Buscar'}</span>
            </button>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                showFilters
                  ? "bg-primary text-primary-foreground border-primary"
                  : (dateFilter !== "all" || filterStatus !== "all")
                    ? "bg-amber-500/20 border-amber-500 text-amber-400"
                    : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
              title={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showFilters ? "Ocultar" : "Filtros"}</span>
              {(() => {
                const activeCount = (dateFilter !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0);
                return activeCount > 0 && !showFilters ? (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-bold ml-0.5">{activeCount}</span>
                ) : null;
              })()}
            </button>
          </div>

          {/* Filtros colápsáveis */}
          {showFilters && (<>
          {/* Cabeçalho dos filtros com botão Limpar */}
          <div className="flex items-center justify-between pb-0.5">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Período</span>
            {(dateFilter !== "all" || filterStatus !== "all") && (
              <button
                onClick={() => { setDateFilter("all"); setDateFrom(""); setDateTo(""); setFilterStatus("all"); }}
                className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-semibold transition-colors"
              >
                <X className="w-3 h-3" /> Limpar filtros
              </button>
            )}
          </div>
          {/* Filtros de período - grid 5 colunas */}
          <div className="grid grid-cols-5 gap-1.5">
            {([
              { value: "all", label: "Todos", icon: "📋" },
              { value: "today", label: "Hoje", icon: "📅" },
              { value: "week", label: "7 dias", icon: "📆" },
              { value: "month", label: "30 dias", icon: "🗓️" },
              { value: "custom", label: "Intervalo", icon: "🔎" },
            ] as const).map(f => (
              <button
                key={f.value}
                onClick={() => setDateFilter(f.value)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-semibold border transition-all ${
                  dateFilter === f.value
                    ? "bg-amber-500 text-black border-amber-500 shadow-md shadow-amber-500/20"
                    : "bg-card border-border text-muted-foreground hover:border-amber-500/50 hover:text-foreground"
                }`}
              >
                <span className="text-base leading-none">{f.icon}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
          {/* Seletor de intervalo personalizado */}
          {dateFilter === "custom" && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground font-semibold block mb-0.5">De</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground font-semibold block mb-0.5">Até</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="mt-4 p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-red-500/50 transition-colors"
                  title="Limpar datas"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          {/* Separador de status */}
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Status</span>
          </div>

          {/* Filtros de status - grid 4 colunas */}
          <div className="grid grid-cols-4 gap-1.5">
            {/* Todos */}
            <button
              onClick={() => setFilterStatus("all")}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-semibold border transition-all ${
                filterStatus === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <span className="text-base leading-none">📊</span>
              <span>Todos</span>
            </button>
            {/* Urgente */}
            <button
              onClick={() => setFilterStatus("urgente")}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-bold border transition-all relative ${
                filterStatus === "urgente"
                  ? "bg-red-600 text-white border-red-600 shadow-md"
                  : urgentCount > 0
                    ? "bg-red-600/20 border-red-500 text-red-400 animate-pulse"
                    : "bg-card border-border text-muted-foreground"
              }`}
            >
              {urgentCount > 0 && filterStatus !== "urgente" && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">{urgentCount > 9 ? '9+' : urgentCount}</span>
              )}
              <span className="text-base leading-none">🚨</span>
              <span>Urgente</span>
            </button>
            {/* Com Indicador */}
            <button
              onClick={() => setFilterStatus("com_indicador")}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-bold border transition-all relative ${
                filterStatus === "com_indicador"
                  ? "bg-amber-600 text-white border-amber-600 shadow-md"
                  : commissionPendingCount > 0
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse"
                    : indicadorCount > 0
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-500/70"
                      : "bg-card border-border text-muted-foreground"
              }`}
            >
              {commissionPendingCount > 0 && filterStatus !== "com_indicador" && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">{commissionPendingCount > 9 ? '9+' : commissionPendingCount}</span>
              )}
              <span className="text-base leading-none">💰</span>
              <span>Indicador</span>
            </button>
            {/* Sem Status */}
            <button
              onClick={() => setFilterStatus("sem_status")}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-semibold border transition-all ${
                filterStatus === "sem_status"
                  ? "bg-gray-600 text-white border-gray-600 shadow-md"
                  : "bg-card border-border text-muted-foreground hover:border-gray-500/50 hover:text-foreground"
              }`}
            >
              <span className="text-base leading-none">❓</span>
              <span>Sem status</span>
            </button>
            {/* Status dinâmicos */}
            {ACTIVE_STATUS_ORDER.map(s => {
              const cfg = ACTIVE_STATUS_CONFIG[s];
              const statusCount = (orders || []).filter((o: any) => !isDeliveredStatus(o.latestStatus) && o.latestStatus === s).length;
              if (statusCount === 0 && filterStatus !== s) return null;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`relative flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-semibold border transition-all ${
                    filterStatus === s
                      ? `${cfg?.bg || "bg-primary/20 border-primary/40"} ${cfg?.color || "text-primary"} shadow-md ring-1 ring-current/30`
                      : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {statusCount > 0 && filterStatus !== s && (
                    <span className="absolute -top-1 -right-1 bg-zinc-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">{statusCount > 9 ? '9+' : statusCount}</span>
                  )}
                  <span className="text-base leading-none">{cfg?.icon ?? "📦"}</span>
                  <span className="text-center leading-tight line-clamp-2">{cfg?.label || s}</span>
                </button>
              );
            })}
            {/* Filtros de grupos customizados */}
            {(customGroupsQuery.data || []).map((g: any) => {
              const c = GROUP_COLOR_MAP[g.color] || GROUP_COLOR_MAP.red;
              const groupKey = `group_${g.id}`;
              const count = (orders || []).filter((o: any) => !isDeliveredStatus(o.latestStatus) && g.memberIds.includes(o.id)).length;
              if (count === 0 && filterStatus !== groupKey) return null;
              return (
                <button
                  key={g.id}
                  onClick={() => setFilterStatus(filterStatus === groupKey ? 'all' : groupKey)}
                  className={`relative flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-bold border transition-all ${
                    filterStatus === groupKey
                      ? `${c.header} ${c.text} shadow-md ring-1`
                      : `bg-card ${c.border} ${c.text} hover:opacity-80`
                  }`}
                >
                  {count > 0 && filterStatus !== groupKey && (
                    <span className={`absolute -top-1 -right-1 ${c.badge} text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold`}>{count > 9 ? '9+' : count}</span>
                  )}
                  <span className="text-base leading-none">{g.icon || '🔖'}</span>
                  <span className="text-center leading-tight line-clamp-2">{g.name}</span>
                </button>
              );
            })}
          </div>

          </>)}

          {/* Seleção em massa */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 pb-1">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {allSelected
                  ? <CheckSquare className="w-4 h-4 text-primary" />
                  : <Square className="w-4 h-4" />
                }
                {allSelected ? "Desmarcar todos" : `Selecionar todos (${filtered.length})`}
              </button>
              {someSelected && (
                <span className="text-xs text-primary font-medium">{selected.size} selecionado(s)</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmação de deleção em massa */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-base text-red-400">Deletar {selected.size} pedido(s)?</h3>
            <p className="text-sm text-muted-foreground">
              Esta ação é irreversível. Os pedidos e todo o histórico de status serão removidos permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteBulkMutation.mutate({
                  orders: selectedOrders.map(o => ({ registrationId: o.id, customerPhone: o.phone, subOrderIndex: o.subOrderIndex ?? 0 }))
                })}
                disabled={deleteBulkMutation.isPending}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteBulkMutation.isPending ? "Deletando..." : "Confirmar Deleção"}
              </button>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="flex-1 py-2 bg-card border border-border text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted/20 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PAINEL DE URGÊNCIAS ===== */}
      {filtered.filter(o => o.isUrgent === 1 && !isDeliveredStatus(o.latestStatus)).length > 0 && (
        <div className="mx-4 mt-4 mb-2 border-2 border-red-500/60 rounded-xl overflow-hidden bg-red-950/20">
          {/* Cabeçalho do painel */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-red-600/30 border-b border-red-500/40">
            <div className="flex items-center gap-2">
              <span className="text-red-400 animate-pulse text-base">🚨</span>
              <span className="text-red-300 font-black text-sm uppercase tracking-wider">Pedidos Urgentes</span>
              <span className="bg-red-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5">
                {filtered.filter(o => o.isUrgent === 1 && !isDeliveredStatus(o.latestStatus)).length}
              </span>
            </div>
          </div>
          {/* Cards dos pedidos urgentes */}
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.filter(o => o.isUrgent === 1 && !isDeliveredStatus(o.latestStatus)).map(order => {
              const urgentStatusCfg = order.latestStatus ? ACTIVE_STATUS_CONFIG[order.latestStatus] : null;
              const urgentName = order.customerName || order.codeClientName || "Cliente";
              return (
                <div
                  key={getOrderKey(order)}
                  className="bg-red-950/40 border border-red-500/50 rounded-xl p-3 flex flex-col gap-2 cursor-pointer hover:border-red-400 hover:bg-red-950/60 transition-all"
                  onClick={() => {
                    setExpandedId(getOrderKey(order) === expandedId ? null : getOrderKey(order));
                    // Scroll até o card na lista principal
                    setTimeout(() => {
                      const el = document.getElementById(`order-card-${getOrderKey(order)}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {order.customerProfilePhotoUrl ? (
                      <img src={order.customerProfilePhotoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-red-500/40 flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-red-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-xs truncate">{urgentName}</p>
                      <p className="text-red-300/70 text-[11px] truncate">{order.phone}</p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        toggleUrgentMutation.mutate({ registrationId: order.id, urgent: false });
                      }}
                      className="flex-shrink-0 p-1 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-colors"
                      title="Remover urgência"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {urgentStatusCfg ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${urgentStatusCfg.bg} ${urgentStatusCfg.color}`}>
                        {urgentStatusCfg.icon}
                        {urgentStatusCfg.label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">Sem status</span>
                    )}
                    {order.serviceName && (
                      <span className="text-[11px] text-muted-foreground truncate">{order.serviceName}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* ===== GRUPOS CUSTOMIZADOS ===== */}
      {(() => {
        const groups = customGroupsQuery.data || [];
        const allOrders = ordersQuery.data || [];
        const COLORS = Object.keys(GROUP_COLOR_MAP);
        const ICONS = ['🔖', '⚠️', '🔥', '⭐', '🚨', '🎯', '📌', '🔴', '🟡', '🟢', '🔵', '🟣'];
        return (
          <>
            {/* Botão criar grupo + Alterar Ordem */}
            <div className="mx-4 mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowCreateGroup(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar Grupo
              </button>
              {groups.length > 1 && (
                <button
                  onClick={() => { setReorderList([...groups]); setShowReorderGroups(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 border border-zinc-700 hover:border-amber-500/60 text-zinc-300 hover:text-amber-300 rounded-lg text-xs font-medium transition-colors"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Alterar Ordem dos Grupos
                </button>
              )}
              {groups.length > 0 && (
                <span className="text-xs text-zinc-500">{groups.length} grupo{groups.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {/* Modal de reordenação de grupos */}
            {showReorderGroups && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowReorderGroups(false)}>
                <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">Alterar Ordem dos Grupos</h3>
                    <button onClick={() => setShowReorderGroups(false)} className="text-zinc-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <p className="text-xs text-zinc-500 mb-3">Arraste ou use os botões para reorganizar. Clique em "Salvar Ordem" para confirmar.</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {reorderList.map((g: any, idx: number) => {
                      const c = GROUP_COLOR_MAP[g.color] || GROUP_COLOR_MAP.red;
                      return (
                        <div
                          key={g.id}
                          draggable
                          onDragStart={() => setDragReorderIdx(idx)}
                          onDragOver={e => { e.preventDefault(); setDragOverReorderIdx(idx); }}
                          onDrop={() => {
                            if (dragReorderIdx === null || dragReorderIdx === idx) return;
                            const next = [...reorderList];
                            const [moved] = next.splice(dragReorderIdx, 1);
                            next.splice(idx, 0, moved);
                            setReorderList(next);
                            setDragReorderIdx(null);
                            setDragOverReorderIdx(null);
                          }}
                          onDragEnd={() => { setDragReorderIdx(null); setDragOverReorderIdx(null); }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none ${
                            dragOverReorderIdx === idx && dragReorderIdx !== idx
                              ? 'border-amber-400/60 bg-amber-950/30 scale-[1.02]'
                              : dragReorderIdx === idx
                              ? 'opacity-50 border-zinc-600'
                              : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                          }`}
                        >
                          <span className="text-zinc-500 cursor-grab">&#8942;&#8942;</span>
                          <span className="text-base">{g.icon}</span>
                          <span className={`text-xs font-semibold flex-1 ${c.text}`}>{g.name}</span>
                          <div className="flex gap-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => {
                                if (idx === 0) return;
                                const next = [...reorderList];
                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                setReorderList(next);
                              }}
                              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                              title="Subir"
                            ><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button
                              disabled={idx === reorderList.length - 1}
                              onClick={() => {
                                if (idx === reorderList.length - 1) return;
                                const next = [...reorderList];
                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                setReorderList(next);
                              }}
                              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                              title="Descer"
                            ><ArrowDown className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => reorderGroupsMut.mutate({ orderedIds: reorderList.map((g: any) => g.id) })}
                      disabled={reorderGroupsMut.isPending}
                      className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                    >
                      {reorderGroupsMut.isPending ? 'Salvando...' : 'Salvar Ordem'}
                    </button>
                    <button onClick={() => setShowReorderGroups(false)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs transition-colors">Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Formulário criar grupo */}
            {showCreateGroup && (
              <div className="mx-4 mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-zinc-300">Novo Grupo</p>
                <input
                  type="text"
                  placeholder="Nome do grupo (ex: EMERGÊNCIA, PRIORIDADE...)"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">Cor</p>
                    <div className="space-y-2">
                      {[
                        { label: '🔴 Quentes', keys: ['red','rose','pink','fuchsia','orange','amber','yellow'] },
                        { label: '🟢 Frios', keys: ['lime','green','emerald','teal','cyan','sky','blue'] },
                        { label: '🟣 Outros', keys: ['indigo','violet','purple','slate','zinc','white'] },
                      ].map(group => (
                        <div key={group.label}>
                          <p className="text-[9px] text-zinc-600 mb-1">{group.label}</p>
                          <div className="flex gap-2">
                            {group.keys.map(c => (
                              <button
                                key={c}
                                onClick={() => setNewGroupColor(c)}
                                title={c}
                                style={{ backgroundColor: GROUP_COLOR_MAP[c]?.hex || '#888' }}
                                className={`w-7 h-7 rounded-full border-2 transition-all shadow-sm ${newGroupColor === c ? 'border-white scale-125 shadow-lg ring-2 ring-white/30' : 'border-transparent opacity-75 hover:opacity-100 hover:scale-110 hover:border-white/50'}`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">Ícone</p>
                    <div className="flex gap-1 flex-wrap">
                      {ICONS.map(ic => (
                        <button
                          key={ic}
                          onClick={() => setNewGroupIcon(ic)}
                          className={`w-7 h-7 rounded-lg text-base flex items-center justify-center transition-all ${newGroupIcon === ic ? 'bg-zinc-600 ring-1 ring-white/40' : 'hover:bg-zinc-700'}`}
                        >{ic}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (newGroupName.trim()) createGroupMut.mutate({ name: newGroupName.trim(), color: newGroupColor, icon: newGroupIcon }); }}
                    disabled={!newGroupName.trim() || createGroupMut.isPending}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    {createGroupMut.isPending ? 'Criando...' : 'Criar Grupo'}
                  </button>
                  <button onClick={() => setShowCreateGroup(false)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {/* Botão expandir/recolher todos os grupos */}
            {groups.length > 0 && (
              <div className="mx-4 mt-2 flex gap-2">
                <button
                  onClick={() => {
                    const allIds = groups.map((g: any) => g.id);
                    setCollapsedExtraGroups(new Set(allIds));
                    try { localStorage.setItem('walk_collapsed_extra_groups', JSON.stringify(allIds)); } catch {}
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <span>⊖</span> Recolher todos
                </button>
                <button
                  onClick={() => {
                    setCollapsedExtraGroups(new Set());
                    try { localStorage.setItem('walk_collapsed_extra_groups', JSON.stringify([])); } catch {}
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <span>⊕</span> Expandir todos
                </button>
              </div>
            )}

            {/* Paineis dos grupos */}
            {groups.map((group: any) => {
              const colorCfg = GROUP_COLOR_MAP[group.color] || GROUP_COLOR_MAP.red;
              const groupOrders = allOrders.filter((o: any) => group.memberIds.includes(o.id) && !isDeliveredStatus(o.latestStatus));
              // Ocultar grupo inteiro se há card expandido que não pertence a este grupo
              const groupHasExpanded = expandedId !== null && groupOrders.some((o: any) => getOrderKey(o) === expandedId);
              if (expandedId !== null && !groupHasExpanded) return null;
              return (
                <div key={group.id} className={`mx-4 mt-3 border-2 ${colorCfg.border} rounded-xl overflow-hidden`}>
                  {/* Cabeçalho */}
                  <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${colorCfg.header} border-b`}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-base">{group.icon}</span>
                      <span className={`${colorCfg.text} min-w-0 truncate font-black text-sm uppercase tracking-wider`}>{group.name}</span>
                      <span className={`${colorCfg.badge} shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white`}>{groupOrders.length}</span>
                    </div>
                    <div className="flex w-full items-center gap-1 sm:w-auto">
                      <button
                        onClick={() => toggleExtraGroup(group.id)}
                        className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
                        title={collapsedExtraGroups.has(group.id) ? 'Expandir grupo' : 'Recolher grupo'}
                      >
                        {collapsedExtraGroups.has(group.id)
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronUp className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setFilterStatus(filterStatus === `group_${group.id}` ? 'all' : `group_${group.id}`)}
                        className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all sm:flex-none ${
                          filterStatus === `group_${group.id}`
                            ? 'bg-white/20 text-white ring-1 ring-white/40'
                            : 'bg-white/5 hover:bg-white/15 text-white/60 hover:text-white'
                        }`}
                        title={filterStatus === `group_${group.id}` ? 'Mostrar todos os pedidos' : 'Filtrar somente este grupo'}
                      >
                        <span className="sm:hidden">{filterStatus === `group_${group.id}` ? '✕ Limpar' : '🔍 Ver grupo'}</span>
                        <span className="hidden sm:inline">{filterStatus === `group_${group.id}` ? '✕ Limpar filtro' : '🔍 Ver só este grupo'}</span>
                      </button>
                      <button
                        onClick={() => { setEditingGroupId(group.id); setEditGroupName(group.name); setEditGroupColor(group.color); setEditGroupIcon(group.icon || '🔖'); }}
                        disabled={editingGroupId === group.id}
                        className="shrink-0 rounded-lg bg-white/5 p-1.5 text-white/50 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-default disabled:opacity-40"
                        title={editingGroupId === group.id ? 'Editando grupo' : 'Editar grupo'}
                      ><Edit3 className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => { if (confirm(`Deletar o grupo "${group.name}"? Os pedidos não serão apagados.`)) deleteGroupMut.mutate({ id: group.id }); }}
                        className="shrink-0 rounded-lg bg-red-500/10 p-1.5 text-red-400/60 transition-colors hover:bg-red-500/30 hover:text-red-400"
                        title="Deletar grupo"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {editingGroupId === group.id && (
                    <div className="border-b border-white/10 bg-black/20 px-3 py-3 sm:px-4">
                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/60">Nome do grupo</span>
                          <input
                            type="text"
                            value={editGroupName}
                            onChange={e => setEditGroupName(e.target.value)}
                            className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/50"
                            autoFocus
                          />
                        </label>
                        <div>
                          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-white/60">Cor do grupo</p>
                          <div className="grid max-w-[220px] grid-cols-7 gap-2">
                            {['red','rose','pink','fuchsia','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','slate','zinc','white'].map(c => (
                              <button
                                key={c}
                                onClick={() => setEditGroupColor(c)}
                                title={c}
                                style={{ backgroundColor: GROUP_COLOR_MAP[c]?.hex || '#888' }}
                                className={`h-6 w-6 rounded-full border-2 transition-all ${editGroupColor === c ? 'border-white scale-110 ring-1 ring-white/40' : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105 hover:border-white/40'}`}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-white/60">Ícone do grupo</p>
                          <div className="grid w-fit grid-cols-6 gap-1.5">
                            {ICONS.slice(0, 6).map(ic => (
                              <button
                                key={ic}
                                onClick={() => setEditGroupIcon(ic)}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors ${editGroupIcon === ic ? 'bg-white/20 ring-1 ring-white/40' : 'bg-white/5 hover:bg-white/10'}`}
                              >{ic}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 border-t border-white/10 pt-3 sm:justify-end">
                          <button
                            onClick={() => updateGroupMut.mutate({ id: group.id, name: editGroupName, color: editGroupColor, icon: editGroupIcon })}
                            disabled={updateGroupMut.isPending}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-green-400 disabled:opacity-60 sm:flex-none"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {updateGroupMut.isPending ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button onClick={() => setEditingGroupId(null)} className="flex-1 rounded-lg bg-zinc-700 px-3 py-2 text-xs font-bold text-white/70 transition-colors hover:bg-zinc-600 hover:text-white sm:flex-none">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Cards dos pedidos do grupo - ocultos se recolhido */}
                  {!collapsedExtraGroups.has(group.id) && groupOrders.length === 0 && (
                    <div className="px-4 py-4 text-center text-xs text-zinc-500">
                      Nenhum pedido neste grupo. Use o botão 🔖 nos pedidos abaixo para adicionar.
                    </div>
                  )}
                  {!collapsedExtraGroups.has(group.id) && groupOrders.length > 0 && (
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {groupOrders.map((order: any) => {
                        const statusCfg = order.latestStatus ? ACTIVE_STATUS_CONFIG[order.latestStatus] : null;
                        const name = order.customerName || order.codeClientName || 'Cliente';
                        // Ocultar cards do grupo que não estão expandidos
                        if (expandedId !== null && getOrderKey(order) !== expandedId) return null;
                        const isExpandedGroupCard = expandedId === getOrderKey(order);
                        return (
                          <div
                            key={getOrderKey(order)}
                            id={`order-card-${getOrderKey(order)}`}
                            className={`${colorCfg.card} border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all${isExpandedGroupCard ? ' col-span-full' : ''}`}
                            onClick={() => {
                              setExpandedId(getOrderKey(order) === expandedId ? null : getOrderKey(order));
                              setTimeout(() => {
                                const el = document.getElementById(`order-card-${getOrderKey(order)}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 100);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              {order.customerProfilePhotoUrl ? (
                                <img src={order.customerProfilePhotoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-white/20 flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                  <User className="w-4 h-4 text-white/40" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-xs truncate">{name}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {order.customerNumber && (
                                    <span className="flex-shrink-0 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded px-1 py-0.5 leading-none" title="Número de cadastro">
                                      *{order.customerNumber}
                                    </span>
                                  )}
                                  {order.customerNumber && <span className="text-white/20 text-[10px]">·</span>}
                                  <p className={`${colorCfg.text} opacity-70 text-[11px] truncate`}>{order.phone}</p>
                                </div>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); removeMemberMut.mutate({ groupId: group.id, registrationId: order.id }); }}
                                className="flex-shrink-0 p-1 rounded-full bg-white/5 hover:bg-red-500/30 text-white/40 hover:text-red-400 transition-colors"
                                title="Remover do grupo"
                              ><X className="w-3.5 h-3.5" /></button>
                            </div>
                            {statusCfg && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusCfg.bg} ${statusCfg.color}`}>
                                {statusCfg.icon}{statusCfg.label}
                              </span>
                            )}
                            {order.serviceName && <span className="text-[11px] text-zinc-400 truncate">{order.serviceName}</span>}
                            <ScheduleStatusBadge registrationId={order.id} subOrderIndex={order.subOrderIndex ?? 0} customerPhone={order.phone} orderStatus={order.latestStatus} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        );
      })()}

      {/* Lista de pedidos */}
      <div className="p-4 space-y-3">
        {ordersQuery.isLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          </div>
        )}

        {!ordersQuery.isLoading && sorted.length === 0 && !isEmergencySearch && activeProductTab !== '__perguntas__' && activeProductTab !== '__rgcnh__' && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum pedido encontrado</p>
          </div>
        )}

        {/* ===== ABAS HORIZONTAIS DE PRODUTO ===== */}
        {!ordersQuery.isLoading && (() => {
          // Nomes das pastas fixas (editáveis)
          const fixedFolderConfig = (folderConfigQuery.data || {}) as Record<string, { id: number; name: string; icon: string; color: string; tabOrder: number; hidden: number }>;
          const fixedKeyMap: Record<string, string> = { '__entregue__': 'entregues', '__arquivo__': 'arquivo', '__rgcnh__': 'rgcnh', '__perguntas__': 'perguntas' };
          const getFixedName = (key: string, defaultName: string) => {
            const k = fixedKeyMap[key] ?? key.replace(/__/g, '');
            return fixedFolderConfig[k]?.name || defaultName;
          };
          const customFolders = customFoldersQuery.data || [];
          // Abas fixas e personalizadas ordenadas pelo tabOrder/sortOrder salvo
          const fixedTabOrder: Record<string, number> = {
            '__entregue__': fixedFolderConfig['entregues']?.tabOrder ?? 0,
            '__arquivo__': fixedFolderConfig['arquivo']?.tabOrder ?? 1,
            '__rgcnh__': fixedFolderConfig['rgcnh']?.tabOrder ?? 2,
            '__perguntas__': fixedFolderConfig['perguntas']?.tabOrder ?? 3,
          };
          const sortableFixedTabs = [
            ...(deliveredOrders.length > 0 && !(fixedFolderConfig['entregues']?.hidden === 1) ? [{ key: "__entregue__", label: getFixedName('__entregue__', '📦 Entregues'), orders: deliveredOrders, colorIdx: -1, isDelivered: true, isAll: false, _order: fixedTabOrder['__entregue__'] }] : []),
            ...(fixedFolderConfig['arquivo']?.hidden === 1 ? [] : [{ key: "__arquivo__", label: getFixedName('__arquivo__', '📁 Arquivo'), orders: [] as Order[], colorIdx: -3, isDelivered: false, isAll: false, archivedCount: (archivedQuery.data || []).length, _order: fixedTabOrder['__arquivo__'] }]),
            ...(fixedFolderConfig['rgcnh']?.hidden === 1 ? [] : [{ key: "__rgcnh__", label: getFixedName('__rgcnh__', '🪷 RG/CNH Aprovado'), orders: [] as Order[], colorIdx: -5, isDelivered: false, isAll: false, rgCnhCount: (rgCnhQuery.data || []).length, _order: fixedTabOrder['__rgcnh__'] }]),
            ...(fixedFolderConfig['perguntas']?.hidden === 1 ? [] : [{ key: "__perguntas__", label: getFixedName('__perguntas__', '❓ Perguntas'), orders: [] as Order[], colorIdx: -4, isDelivered: false, isAll: false, _order: fixedTabOrder['__perguntas__'] }]),
            ...customFolders.filter((f: any) => f.hidden !== 1).map((f: any) => ({ key: `__custom_${f.id}__`, label: f.icon ? `${f.icon} ${f.name}` : f.name, orders: [] as Order[], colorIdx: -6, isDelivered: false, isAll: false, customFolderId: f.id, customFolderCount: f.orderCount ?? 0, _order: f.sortOrder ?? 99 })),
          ].sort((a, b) => (a._order ?? 99) - (b._order ?? 99));
          const allTabs = [
            { key: "__todos__", label: "Todos", orders: activeOrders, colorIdx: -2, isDelivered: false, isAll: true },
            ...productGroups.map((g, i) => ({ key: g.name, label: g.name, orders: g.orders, colorIdx: productColorIndex.get(g.name) ?? (i % PRODUCT_COLORS.length), isDelivered: false, isAll: false })),
            ...sortableFixedTabs,
          ];
          const currentTabKey = activeProductTab && allTabs.find(t => t.key === activeProductTab) ? activeProductTab : allTabs[0]?.key;
          const currentTab = allTabs.find(t => t.key === currentTabKey);
          return (
            <div>
              {/* Barra de abas */}
              <div className="flex flex-wrap gap-2 mb-3">
                {allTabs.map(tab => {
                  const color = (!tab.isDelivered && tab.colorIdx >= 0) ? PRODUCT_COLORS[tab.colorIdx] : null;
                  const isActive = tab.key === currentTabKey;
                  const isArquivoTab = tab.key === "__arquivo__";
                  const isRgCnhTab = tab.key === "__rgcnh__";
                  const isCustomFolder = tab.key.startsWith('__custom_');
                  const tabUrgent = tab.orders.filter(o => o.isUrgent === 1).length;
                  const tabNew = tab.orders.filter(o => !viewedOrders.has(getOrderKey(o))).length;
                  const isAllTab = tab.key === "__todos__";
                  const displayCount = isArquivoTab ? ((tab as any).archivedCount ?? 0) : isRgCnhTab ? ((tab as any).rgCnhCount ?? 0) : isCustomFolder ? ((tab as any).customFolderCount ?? 0) : tab.orders.length;
                  // Ocultar tabs de produto sem pedidos (exceto: Todos, especiais e aba ativa)
                  const isSpecialTab = tab.isDelivered || isArquivoTab || isRgCnhTab || isCustomFolder || isAllTab;
                  if (!isSpecialTab && displayCount === 0 && tab.key !== currentTabKey) return null;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveProductTab(tab.key)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all"
                      style={(() => {
                        // Determine base color for this tab type — always solid
                        if (tab.isDelivered) {
                          return isActive
                            ? { backgroundColor: '#0d9488', borderColor: '#14b8a6', color: '#fff' }
                            : { backgroundColor: '#0f766e', borderColor: '#0d9488', color: '#ccfbf1' };
                        }
                        if (isArquivoTab) {
                          return isActive
                            ? { backgroundColor: '#52525b', borderColor: '#71717a', color: '#fff' }
                            : { backgroundColor: '#3f3f46', borderColor: '#52525b', color: '#e4e4e7' };
                        }
                        if (isRgCnhTab) {
                          return isActive
                            ? { backgroundColor: '#16a34a', borderColor: '#22c55e', color: '#fff' }
                            : { backgroundColor: '#14532d', borderColor: '#16a34a', color: '#bbf7d0' };
                        }
                        if (isCustomFolder) {
                          return isActive
                            ? { backgroundColor: '#7c3aed', borderColor: '#8b5cf6', color: '#fff' }
                            : { backgroundColor: '#4c1d95', borderColor: '#7c3aed', color: '#ddd6fe' };
                        }
                        if (isAllTab) {
                          return isActive
                            ? { backgroundColor: '#d97706', borderColor: '#f59e0b', color: '#fff' }
                            : { backgroundColor: '#92400e', borderColor: '#d97706', color: '#fde68a' };
                        }
                        // Product tabs use their color scheme
                        return isActive ? {} : {};
                      })()}
                    >
                      {isAllTab && <Layers className="w-3.5 h-3.5 flex-shrink-0" />}
                      {!tab.isDelivered && !isAllTab && !isArquivoTab && !isRgCnhTab && !isCustomFolder && <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive && color ? color.dot : "bg-muted-foreground/40"}`} />}
                      {tab.isDelivered && <Package className="w-3.5 h-3.5 flex-shrink-0" />}
                      <span className="truncate max-w-[140px]">{tab.label}</span>
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                        style={isActive ? (
                          tab.isDelivered
                            ? { backgroundColor: '#0f766e', color: '#fff' }
                            : isArquivoTab
                              ? { backgroundColor: '#3f3f46', color: '#fff' }
                              : isRgCnhTab
                                ? { backgroundColor: '#15803d', color: '#fff' }
                                : isCustomFolder
                                  ? { backgroundColor: '#6d28d9', color: '#fff' }
                                  : isAllTab
                                    ? { backgroundColor: '#b45309', color: '#fff' }
                                    : { backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }
                        ) : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                      >{displayCount}</span>
                      {tabUrgent > 0 && <span className="text-[10px] font-bold text-red-400 animate-pulse">🚨{tabUrgent}</span>}
                      {tabNew > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">{tabNew > 99 ? "99+" : tabNew}</span>}
                    </button>
                  );
                })}
                {/* Botão Gerenciar Pastas */}
                <button
                  onClick={() => setShowFolderManager(prev => !prev)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  title="Gerenciar pastas"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>+ Pasta</span>
                </button>
              </div>

              {/* ===== GERENCIADOR DE PASTAS ===== */}
              {showFolderManager && (
                <div className="mb-4 p-4 bg-card border border-border rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><FolderOpen className="w-4 h-4" /> Gerenciar Pastas</h3>
                    <button onClick={() => setShowFolderManager(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                  </div>

                  {/* ===== ORDEM DAS ABAS ===== */}
                  {(() => {
                    // Montar lista unificada de todas as abas (fixas + personalizadas) para reordenar
                    const FIXED_TABS = [
                      { key: '__entregue__', dbKey: 'entregues', defaultName: '📦 Entregues' },
                      { key: '__arquivo__', dbKey: 'arquivo', defaultName: '📁 Arquivo' },
                      { key: '__rgcnh__', dbKey: 'rgcnh', defaultName: '🪷 RG/CNH Aprovado' },
                      { key: '__perguntas__', dbKey: 'perguntas', defaultName: '❓ Perguntas' },
                    ];
                    // Combinar fixas (com tabOrder) + personalizadas (com sortOrder) em lista ordenada
                    type TabItem = { type: 'fixed'; key: string; dbKey: string | null; defaultName: string; order: number; hidden?: number } | { type: 'custom'; id: number; name: string; icon: string; order: number; hidden?: number };
                    const allTabItems: TabItem[] = [
                      ...FIXED_TABS.map(fp => ({ type: 'fixed' as const, key: fp.key, dbKey: fp.dbKey, defaultName: fp.defaultName, order: fixedFolderConfig[fp.dbKey ?? fp.key.replace(/__/g, '')]?.tabOrder ?? 99, hidden: fixedFolderConfig[fp.dbKey ?? fp.key.replace(/__/g, '')]?.hidden ?? 0 })),
                      ...customFolders.map((f: any) => ({ type: 'custom' as const, id: f.id, name: f.name, icon: f.icon || '', order: f.sortOrder ?? 99, hidden: Number(f.hidden ?? 0) })),
                    ].sort((a, b) => a.order - b.order);

                    const moveTab = (idx: number, dir: -1 | 1) => {
                      const newList = [...allTabItems];
                      const swapIdx = idx + dir;
                      if (swapIdx < 0 || swapIdx >= newList.length) return;
                      [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
                      // Reatribuir ordens 0..n
                      const fixedOrder = newList
                        .filter(t => t.type === 'fixed' && (t as any).dbKey)
                        .map((t, i) => ({ folderKey: (t as any).dbKey as string, tabOrder: newList.indexOf(t) }));
                      const customOrder = newList
                        .filter(t => t.type === 'custom')
                        .map(t => ({ id: (t as any).id as number, sortOrder: newList.indexOf(t) }));
                      reorderTabsMut.mutate({ fixedOrder, customOrder });
                    };

                    return (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Ordem das abas</p>
                        <div className="space-y-1.5">
                          {allTabItems.map((tab, idx) => {
                            const label = tab.type === 'fixed' ? getFixedName(tab.key, tab.defaultName) : `${tab.icon ? tab.icon + ' ' : ''}${tab.name}`;
                            // Determine hidden state for this tab (uses tab.hidden set during allTabItems build)
                            const isHidden = (tab.hidden ?? 0) === 1;
                            return (
                              <div key={tab.type === 'fixed' ? tab.key : `cf_${tab.id}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isHidden ? 'bg-muted/10 opacity-60' : 'bg-muted/30'}`}>
                                <span className="text-xs text-muted-foreground w-5 text-center font-mono">{idx + 1}</span>
                                <span className={`flex-1 text-sm ${isHidden ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{label}</span>
                                {tab.type === 'fixed' && (
                                  <span className="text-[10px] text-muted-foreground/50 bg-muted/40 px-1.5 py-0.5 rounded">fixa</span>
                                )}
                                {/* Botão Ocultar/Mostrar */}
                                <button
                                  onClick={() => {
                                    if (tab.type === 'fixed' && (tab as any).dbKey) {
                                      toggleHiddenFixedMut.mutate({ folderKey: (tab as any).dbKey as 'entregues' | 'arquivo' | 'rgcnh' | 'perguntas', hidden: !isHidden });
                                    } else if (tab.type === 'custom') {
                                      toggleHiddenCustomMut.mutate({ id: (tab as any).id, hidden: !isHidden });
                                    }
                                  }}
                                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${isHidden ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'}`}
                                  title={isHidden ? 'Mostrar aba' : 'Ocultar aba'}
                                >
                                  {isHidden ? '👁 Mostrar' : '🙈 Ocultar'}
                                </button>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => moveTab(idx, -1)}
                                    disabled={idx === 0 || reorderTabsMut.isPending}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                                    title="Mover para cima"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                  </button>
                                  <button
                                    onClick={() => moveTab(idx, 1)}
                                    disabled={idx === allTabItems.length - 1 || reorderTabsMut.isPending}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                                    title="Mover para baixo"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Pastas fixas editáveis */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Pastas fixas (renomear)</p>
                    <div className="space-y-2">
                      {[{ key: '__entregue__', dbKey: 'entregues', defaultName: 'Entregues' }, { key: '__arquivo__', dbKey: 'arquivo', defaultName: 'Arquivo' }, { key: '__rgcnh__', dbKey: 'rgcnh', defaultName: 'RG/CNH Aprovado' }, { key: '__perguntas__', dbKey: null, defaultName: 'Perguntas' }].map(fp => (
                        <div key={fp.key} className="flex items-center gap-2">
                          {editingFixedFolder === fp.key ? (
                            <>
                              <input
                                value={editFixedFolderName}
                                onChange={e => setEditFixedFolderName(e.target.value)}
                                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
                                placeholder={fp.defaultName}
                              />
                              <button onClick={() => { if (fp.dbKey) saveFixedFolderMut.mutate({ folderKey: fp.dbKey as 'entregues' | 'arquivo' | 'rgcnh', name: editFixedFolderName }); }} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium" disabled={!fp.dbKey}>Salvar</button>
                              <button onClick={() => setEditingFixedFolder(null)} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs">Cancelar</button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-foreground">{getFixedName(fp.key, fp.defaultName)}</span>
                              <button onClick={() => { setEditingFixedFolder(fp.key); setEditFixedFolderName(getFixedName(fp.key, fp.defaultName) || fp.defaultName); }} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs hover:text-foreground">Renomear</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pastas personalizadas */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Pastas personalizadas</p>
                    <div className="space-y-2">
                      {customFolders.map((f: any) => (
                        <div key={f.id} className="flex items-center gap-2">
                          {editingFolderId === f.id ? (
                            <>
                              <input value={editFolderIcon} onChange={e => setEditFolderIcon(e.target.value)} className="w-12 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-center" placeholder="📂" />
                              <input value={editFolderName} onChange={e => setEditFolderName(e.target.value)} className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground" placeholder="Nome da pasta" />
                              <button onClick={() => updateFolderMut.mutate({ id: f.id, name: editFolderName, icon: editFolderIcon || undefined })} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium">Salvar</button>
                              <button onClick={() => setEditingFolderId(null)} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs">Cancelar</button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-foreground">{f.icon ? `${f.icon} ` : ''}{f.name}</span>
                              <span className="text-xs text-muted-foreground">{f.orderCount ?? 0} pedidos</span>
                              <button onClick={() => { setEditingFolderId(f.id); setEditFolderName(f.name); setEditFolderIcon(f.icon || ''); }} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs hover:text-foreground">Editar</button>
                              <button onClick={() => { if (confirm(`Remover pasta "${f.name}"? Os pedidos serão restaurados.`)) deleteFolderMut.mutate({ id: f.id }); }} className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30">Remover</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Criar nova pasta */}
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newFolderName.trim()) createFolderMut.mutate({ name: newFolderName.trim() }); }}
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground"
                        placeholder="Nome da nova pasta..."
                      />
                      <button
                        onClick={() => { if (newFolderName.trim()) createFolderMut.mutate({ name: newFolderName.trim() }); }}
                        disabled={!newFolderName.trim() || createFolderMut.isPending}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        Criar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== ABA ARQUIVO ===== */}
              {currentTabKey === "__arquivo__" && (() => {
                console.log('ARCHIVED DATA:', JSON.stringify(archivedQuery.data?.slice(0,1)));
                const archivedOrders = (archivedQuery.data || []) as Array<{
                  id: number; registrationId: number; customerPhone: string; customerName: string;
                  customerNumber: number | null; city: string | null; uf: string | null;
                  email: string | null; serviceName: string | null; serviceOption: string | null;
                  orderNumber: number | null; answers: string | null; latestStatus: string | null;
                  latestStatusAt: number | null; note: string | null; accessedAt: number | null;
                  profilePhotoUrl: string | null;
                }>;
                return (
                  <div className="border border-zinc-500/40 rounded-xl overflow-hidden">
                    {/* Barra de ordenação do Arquivo */}
                    {archivedOrders.length > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-600/30 bg-zinc-500/5">
                        <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
                        {(["number", "name", "date"] as const).map(k => (
                          <button
                            key={k}
                            onClick={() => {
                              if (archivedSortKey === k) setArchivedSortDir(d => d === "asc" ? "desc" : "asc");
                              else { setArchivedSortKey(k); setArchivedSortDir("asc"); }
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                              archivedSortKey === k
                                ? "bg-zinc-500/30 border-zinc-400/60 text-zinc-200"
                                : "bg-card border-border text-muted-foreground hover:border-zinc-400/40"
                            }`}
                          >
                            {k === "number" ? "*Número" : k === "name" ? "A–Z Nome" : "Data"}
                            {archivedSortKey === k && (
                              archivedSortDir === "asc"
                                ? <ArrowUp className="w-3 h-3" />
                                : <ArrowDown className="w-3 h-3" />
                            )}
                          </button>
                        ))}
                        <span className="ml-auto text-xs text-muted-foreground/60">{archivedOrders.length} arquivado{archivedOrders.length !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    <div className="p-3 bg-background/40">
                      {archivedQuery.isLoading && (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-zinc-400" />
                        </div>
                      )}
                      {!archivedQuery.isLoading && archivedOrders.length === 0 && (
                        <div className="text-center py-12">
                          <div className="text-4xl mb-3">📁</div>
                          <p className="text-muted-foreground text-sm">Nenhum pedido arquivado</p>
                          <p className="text-muted-foreground/60 text-xs mt-1">Pedidos arquivados aparecem aqui e podem ser restaurados a qualquer momento</p>
                        </div>
                      )}
                      {archivedOrders.length > 0 && (
                        <div className="space-y-4">
                          {(() => {
                            const groups: Record<string, typeof archivedOrders> = {};
                            for (const ar of archivedOrders) {
                              const key = ar.latestStatus || '__sem_status__';
                              if (!groups[key]) groups[key] = [];
                              groups[key].push(ar);
                            }
                            const orderedKeys = [
                              ...ACTIVE_STATUS_ORDER.filter(s => groups[s]),
                              ...Object.keys(groups).filter(k => !ACTIVE_STATUS_ORDER.includes(k)),
                            ];
                            return orderedKeys.map(statusKey => {
                              const groupOrders = sortFolderOrders(groups[statusKey], archivedSortKey, archivedSortDir);
                              const cfg = ACTIVE_STATUS_CONFIG[statusKey];
                              const label = cfg?.label || (statusKey === '__sem_status__' ? 'Sem Status' : statusKey);
                              return (
                                <div key={statusKey} className="border border-zinc-600/30 rounded-xl overflow-hidden">
                                  <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-zinc-600/20 ${cfg ? cfg.bg : 'bg-zinc-500/10'}`}>
                                    {cfg?.icon && <span>{cfg.icon}</span>}
                                    <span className={`font-semibold text-sm ${cfg ? cfg.color : 'text-zinc-300'}`}>{label}</span>
                                    <span className={`ml-1 text-xs font-normal opacity-70 ${cfg ? cfg.color : 'text-zinc-400'}`}>({groupOrders.length})</span>
                                  </div>
                                  <div className="p-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                      {groupOrders.map(ar => {
                                        const statusCfg = ar.latestStatus ? ACTIVE_STATUS_CONFIG[ar.latestStatus] : null;
                            const name = (ar.customerName || ar.customerPhone || '?') as string;
                            const svcName = ar.serviceName && ar.serviceName !== 'NULL' ? ar.serviceName : null;
                            const svcOpt = ar.serviceOption && ar.serviceOption !== 'NULL' ? ar.serviceOption : null;
                            const orderNum = ar.orderNumber ? ar.orderNumber : null;
                            const rawStatus = ar.latestStatus && ar.latestStatus !== 'NULL' ? ar.latestStatus : null;
                            const isExpanded = expandedArchivedId === String(ar.registrationId);
                            return (
                              <div key={ar.registrationId} className={`bg-card border rounded-xl overflow-hidden cursor-pointer transition-all ${
                                isExpanded ? "border-zinc-400/60 col-span-full" : "border-zinc-600/40"
                              }`} onClick={() => { const newId = isExpanded ? null : String(ar.registrationId); setExpandedArchivedId(newId); setExpandedId(newId ? `${ar.registrationId}_0` : null); }}>
                                {/* Cabeçalho com foto + nome */}
                                <div className="px-4 py-3 border-b border-border">
                                  <div className="flex items-center gap-3">
                                    {ar.profilePhotoUrl && ar.profilePhotoUrl !== 'NULL' ? (
                                      <img src={ar.profilePhotoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-zinc-600" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 text-zinc-300 text-sm font-bold">
                                        {name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-semibold text-sm text-foreground truncate">{name}</span>
                                        {orderNum && <span className="text-xs text-muted-foreground flex-shrink-0">#{orderNum}</span>}
                                      </div>
                                      <div className="flex items-center gap-1 mt-0.5">
                                        {ar.customerNumber && (
                                          <span className="flex-shrink-0 text-[11px] font-mono font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded px-1.5 py-0.5 leading-none" title="Número de cadastro">
                                            *{ar.customerNumber}
                                          </span>
                                        )}
                                        {ar.customerNumber && <span className="text-muted-foreground/40 text-xs">·</span>}
                                        <span className="text-xs text-muted-foreground">{ar.customerPhone}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {/* Corpo com serviço, cidade e status */}
                                {!isExpanded && (
                                <div className="px-4 py-3 space-y-2">
                                  {svcName && (
                                    <div className="text-xs">
                                      <span className="font-semibold text-foreground/90">{svcName}</span>
                                      {svcOpt && <span className="text-muted-foreground"> · {svcOpt}</span>}
                                    </div>
                                  )}
                                  {(ar.city || ar.uf) && (
                                    <div className="text-xs text-muted-foreground">
                                      📍 {[ar.city, ar.uf].filter(Boolean).join(' — ')}
                                    </div>
                                  )}
                                  {statusCfg ? (
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.color}`}>
                                      {statusCfg.icon}{statusCfg.label}
                                    </div>
                                  ) : rawStatus ? (
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border bg-zinc-500/20 border-zinc-500/40 text-zinc-300">
                                      {rawStatus}
                                    </div>
                                  ) : null}
                                  <div className="text-xs text-muted-foreground/50">
                                    Entrada: {formatDate(ar.accessedAt)}
                                  </div>
                                </div>
                                )}
                                {isExpanded && (
                                <div className="border-t border-border bg-background/50" onClick={e => e.stopPropagation()}>
                                  {/* Abas */}
                                  <div className="flex border-b border-border">
                                    {(['status', 'cliente', 'historico', 'documentos', 'anotacoes'] as const).map(t => (
                                      <button
                                        key={t}
                                        onClick={() => setTab(`arquivo_${ar.registrationId}`, t)}
                                        className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                                          (activeTab[`arquivo_${ar.registrationId}`] || 'status') === t
                                            ? 'text-primary border-b-2 border-primary bg-primary/5'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                      >
                                        {t === 'status' ? '📋 Status' : t === 'cliente' ? '👤 Cliente' : t === 'historico' ? '🕐 Histórico' : t === 'documentos' ? '📁 Docs' : '📝 Notas'}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Conteúdo das abas */}
                                  <div className="p-4">
                                    {(activeTab[`arquivo_${ar.registrationId}`] || 'status') === 'status' && (
                                      <div className="space-y-3">
                                        <p className="text-xs font-medium text-muted-foreground">Atualizar status do pedido</p>
                                        <div className="grid grid-cols-2 gap-2">
                                          {ACTIVE_STATUS_ORDER.filter(isManualSelectableStatus).map(s => {
                                            const cfg = ACTIVE_STATUS_CONFIG[s];
                                            if (!cfg) return null;
                                            const isSel = (archivedSelectedStatus[String(ar.registrationId)] || rawStatus) === s;
                                            return (
                                              <button
                                                key={s}
                                                onClick={() => setArchivedSelectedStatus(prev => ({ ...prev, [String(ar.registrationId)]: s }))}
                                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                                                  isSel
                                                    ? `${cfg.bg} ${cfg.color} border-current`
                                                    : 'bg-card border-border text-muted-foreground hover:border-primary/50'
                                                }`}
                                              >
                                                {cfg.icon}
                                                {cfg.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                        <button
                                          onClick={() => {
                                            const status = archivedSelectedStatus[String(ar.registrationId)] || rawStatus;
                                            if (!status) return;
                                            updateArchivedStatusMutation.mutate({
                                              registrationId: ar.registrationId,
                                              subOrderIndex: 0,
                                              customerPhone: ar.customerPhone || '',
                                              status,
                                            });
                                          }}
                                          disabled={updateArchivedStatusMutation.isPending}
                                          className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                          {updateArchivedStatusMutation.isPending ? 'Salvando...' : 'Salvar Status'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => unarchiveMutation.mutate({ registrationId: ar.registrationId })}
                                          disabled={unarchiveMutation.isPending}
                                          className="w-full py-2 px-4 bg-zinc-500/10 border border-zinc-500/30 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-500/20 transition-colors disabled:opacity-50"
                                        >
                                          {unarchiveMutation.isPending ? (
                                            <>Restaurando...</>
                                          ) : (
                                            <>↩ Restaurar para Ativos</>
                                          )}
                                        </button>

                                        {/* === DADOS DE LOGIN === */}
                                        {(() => {
                                          const arKey = `arquivo_${ar.registrationId}`;
                                          const saved = loginDataQuery.data;
                                          const fields = loginFields[arKey] ?? { loginPhone: '', loginEmail: '', loginPassword: '', authCode: '', emailLink: '', loginNotes: '', loginGroupLink: '' };
                                          const setField = (f: 'loginPhone'|'loginEmail'|'loginPassword'|'authCode'|'emailLink'|'loginNotes'|'loginGroupLink', v: string) =>
                                            setLoginFields(prev => ({ ...prev, [arKey]: { ...(prev[arKey] ?? { loginPhone: '', loginEmail: '', loginPassword: '', authCode: '', emailLink: '', loginNotes: '', loginGroupLink: '' }), [f]: v } }));
                                          const waPhone = ar.customerPhone ? (ar.customerPhone.replace(/\D/g, '').startsWith('55') ? ar.customerPhone.replace(/\D/g, '') : `55${ar.customerPhone.replace(/\D/g, '')}`) : '';
                                          const hasLoginData = fields.loginEmail || fields.loginPassword || fields.authCode || fields.emailLink || fields.loginNotes || fields.loginGroupLink;
                                          const pinKey = arKey;
                                          const currentPin = adminPinEdit[pinKey] !== undefined ? adminPinEdit[pinKey] : (customerPinQuery.data?.pin ?? '');
                                          return (
                                            <div className="space-y-3 mt-2">
                                              {/* Senha de Acompanhamento */}
                                              <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3 space-y-2">
                                                <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                                  Senha de Acompanhamento do Pedido
                                                </p>
                                                <div className="flex items-center gap-2">
                                                  <input type="text" inputMode="numeric" maxLength={4} value={currentPin}
                                                    onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setAdminPinEdit(prev => ({ ...prev, [pinKey]: v })); }}
                                                    placeholder="_ _ _ _"
                                                    className="w-24 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 font-mono font-bold tracking-widest text-center text-base focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                                  />
                                                  <button onClick={() => { if (currentPin.length === 4) { setAdminPinMut.mutate({ phone: ar.customerPhone || '', pin: currentPin }); } else { toast.error('A senha deve ter exatamente 4 dígitos'); } }} disabled={setAdminPinMut.isPending} className="px-2.5 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50">Salvar</button>
                                                  <button onClick={() => { const newPin = Math.floor(1000 + Math.random() * 9000).toString(); setAdminPinEdit(prev => ({ ...prev, [pinKey]: newPin })); setAdminPinMut.mutate({ phone: ar.customerPhone || '', pin: newPin }); }} disabled={setAdminPinMut.isPending} className="px-2.5 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-semibold hover:bg-purple-500/30 transition-colors disabled:opacity-50">Gerar</button>
                                                  <button onClick={() => { navigator.clipboard.writeText(currentPin); toast.success('Senha copiada!'); }} className="p-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors" title="Copiar senha">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                  </button>
                                                </div>
                                                <p className="text-xs text-blue-400/60">Enviada ao cliente em todos os emails de status</p>
                                              </div>

                                              {/* Perguntas enviadas */}
                                              {trackingAnswersQuery.data && trackingAnswersQuery.data.length > 0 && (
                                                <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3 space-y-2">
                                                  <p className="text-xs font-semibold text-blue-400">Respostas do Formulário de Acompanhamento</p>
                                                  {trackingAnswersQuery.data.map((ans: any) => (
                                                    <div key={ans.id} className="bg-black/20 border border-white/5 rounded-lg px-3 py-2">
                                                      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{ans.questionText}</p>
                                                      <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">{ans.answer}</span>
                                                      <p className="text-[10px] text-white/30 mt-1">{new Date(ans.answeredAt).toLocaleString('pt-BR')}</p>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                              {/* Dados de Login */}
                                              <div className="bg-lime-500/5 border border-lime-500/30 rounded-lg p-3 space-y-3">
                                                <p className="text-xs font-semibold text-lime-400 flex items-center gap-1.5">
                                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                                                  Dados de Login para o Cliente
                                                </p>
                                                <div className="space-y-2">
                                                  <div><label className="text-xs text-muted-foreground mb-1 block">📱 Login 1 — Telefone <span className="text-lime-400/70">(cliente pode usar este para entrar)</span></label><div className="flex gap-1"><input type="text" value={fields.loginPhone} onChange={e => setField('loginPhone', e.target.value)} placeholder="Ex: (21) 99999-9999" className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginPhone && <button onClick={() => setField('loginPhone', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div><div><label className="text-xs text-muted-foreground mb-1 block">✉️ Login 2 — Email <span className="text-lime-400/70">(cliente pode usar este para entrar)</span></label><div className="flex gap-1"><input type="text" value={fields.loginEmail} onChange={e => setField('loginEmail', e.target.value)} placeholder="Ex: usuario@email.com" className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginEmail && <button onClick={() => setField('loginEmail', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                  <div><label className="text-xs text-muted-foreground mb-1 block">Senha para entrar na sua conta</label><div className="flex gap-1"><input type="text" value={fields.loginPassword} onChange={e => setField('loginPassword', e.target.value)} placeholder="Ex: senha123" className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginPassword && <button onClick={() => setField('loginPassword', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                  <div><label className="text-xs text-muted-foreground mb-1 block">Código Autenticador</label><div className="flex gap-1"><input type="text" value={fields.authCode} onChange={e => setField('authCode', e.target.value.replace(/-/g, ''))} placeholder="Ex: GJ6W76PV4B23..." className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.authCode && <button onClick={() => setField('authCode', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                  <AuthenticatorQrAdminField
                                                    registrationId={ar.registrationId}
                                                    hasExistingQr={Boolean((saved as any)?.hasAuthenticatorQr)}
                                                    pendingValue={loginAuthenticatorQr[arKey]}
                                                    onPendingValueChange={value => setLoginAuthenticatorQr(prev => ({ ...prev, [arKey]: value }))}
                                                    disabled={saveLoginDataMut.isPending}
                                                  />
                                                  <div><label className="text-xs text-muted-foreground mb-1 block">👥 Link do Grupo</label><div className="flex gap-1"><input type="text" value={fields.loginGroupLink} onChange={e => setField('loginGroupLink', e.target.value)} placeholder="Ex: https://chat.whatsapp.com/..." className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginGroupLink && <button onClick={() => setField('loginGroupLink', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                  <div><label className="text-xs text-muted-foreground mb-1 block">📝 Texto / Instruções para o Cliente</label><div className="flex gap-1 items-start"><textarea value={fields.loginNotes} onChange={e => setField('loginNotes', e.target.value)} placeholder="Ex: Acesse o app, vá em configurações e ative a conta..." rows={3} className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60 resize-none" />{fields.loginNotes && <button onClick={() => setField('loginNotes', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                </div>
                                                <div className="flex gap-2">
                                                  <button onClick={() => { const pendingQr = loginAuthenticatorQr[arKey]; saveLoginDataMut.mutate({ registrationId: ar.registrationId, customerPhone: ar.customerPhone || '', loginPhone: fields.loginPhone, loginEmail: fields.loginEmail, loginPassword: fields.loginPassword, authCode: fields.authCode, emailLink: fields.emailLink, loginNotes: fields.loginNotes, loginGroupLink: fields.loginGroupLink, authenticatorQrData: pendingQr && typeof pendingQr === 'object' ? pendingQr.data : undefined, authenticatorQrAction: pendingQr === null ? 'delete' : pendingQr ? 'replace' : 'keep' }); }} disabled={saveLoginDataMut.isPending} className="flex-1 py-1.5 px-3 bg-lime-500/20 border border-lime-500/40 text-lime-300 rounded-lg text-xs font-semibold hover:bg-lime-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                    {saveLoginDataMut.isPending ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-lime-300" />Salvando...</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar Dados de Login</>)}
                                                  </button>
                                                  {waPhone && hasLoginData && (
                                                    <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`🔐 Seus dados de acesso estão prontos! Acesse: ${publicTrackingShareUrl()}`)}`} target="_blank" rel="noopener noreferrer" className="py-1.5 px-3 bg-green-600/20 border border-green-500/40 text-green-300 rounded-lg text-xs font-semibold hover:bg-green-600/30 transition-colors flex items-center gap-1.5">
                                                      <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                                                    </a>
                                                  )}
                                                </div>
                                                {saved && (saved.loginEmail || saved.loginPassword || saved.authCode || (saved as any).emailLink || (saved as any).loginNotes || (saved as any).loginGroupLink) && (
                                                  <p className="text-xs text-lime-400/70 text-center">✓ Dados salvos — visíveis para o cliente quando status for Entregue</p>
                                                )}
                                              </div>

                                              {/* Agendamento */}
                                              <OrderScheduleBlock
                                                registrationId={ar.registrationId}
                                                subOrderIndex={0}
                                                customerPhone={ar.customerPhone || ''}
                                                customerName={ar.customerName || ''}
                                                customerEmail={ar.email || ''}
                                                customerPhotoUrl={ar.profilePhotoUrl || ''}
                                              />

                                              {/* Previsão de Entrega */}
                                              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                                                <p className="text-xs font-semibold text-blue-400 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Previsão de Entrega</p>
                                                <div className="flex gap-2">
                                                  <input type="date" value={deliveryEstimate[arKey] ? deliveryEstimate[arKey].split('T')[0] : ''} onChange={e => { const time = deliveryEstimate[arKey]?.split('T')[1] || '18:00'; setDeliveryEstimate(prev => ({ ...prev, [arKey]: `${e.target.value}T${time}` })); }} className="flex-1 px-3 py-2 bg-background border border-blue-500/30 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                                                  <input type="time" value={deliveryEstimate[arKey] ? deliveryEstimate[arKey].split('T')[1]?.slice(0,5) : '18:00'} onChange={e => { const date = deliveryEstimate[arKey]?.split('T')[0] || new Date().toISOString().slice(0,10); setDeliveryEstimate(prev => ({ ...prev, [arKey]: `${date}T${e.target.value}` })); }} className="w-28 px-3 py-2 bg-background border border-blue-500/30 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                                                </div>
                                                <button type="button" onClick={() => { const val = deliveryEstimate[arKey]; if (!val) { toast.error('Selecione uma data e hora'); return; } setSavingEstimate(arKey); updateDeliveryEstimateMut.mutate({ registrationId: ar.registrationId, deliveryEstimate: new Date(val).getTime() }); }} disabled={savingEstimate === arKey} className="w-full py-1.5 px-3 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                  {savingEstimate === arKey ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-blue-300" />Salvando...</>) : (<><Calendar className="w-3.5 h-3.5" />Salvar Previsão</>)}
                                                </button>
                                              </div>

                                              {/* Número do Pedido */}
                                              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                                                <p className="text-xs font-semibold text-blue-400 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>Número do Pedido</p>
                                                <div className="flex gap-2">
                                                  <input type="number" placeholder="Ex: 430001" value={editOrderNumber[arKey] ?? ''} onChange={e => setEditOrderNumber(prev => ({ ...prev, [arKey]: e.target.value }))} className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                                  <button onClick={() => { const val = editOrderNumber[arKey]; setSavingOrderNumber(arKey); updateOrderNumberMutation.mutate({ registrationId: ar.registrationId, subOrderIndex: 0, orderNumber: val ? parseInt(val) : null }); setEditOrderNumber(prev => ({ ...prev, [arKey]: '' })); }} disabled={savingOrderNumber === arKey} className="py-1.5 px-3 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex items-center gap-1">
                                                    {savingOrderNumber === arKey ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-blue-300" />Salvando...</>) : (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar</>)}
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Acesso PIN */}
                                              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-2">
                                                <p className="text-xs font-semibold text-red-400 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>Acesso PIN</p>
                                                <p className="text-xs text-muted-foreground">Se o cliente errou a senha 3 vezes e foi bloqueado, clique abaixo para liberar o acesso novamente.</p>
                                                <button onClick={() => unlockPinMut.mutate({ phone: ar.customerPhone || '' })} disabled={unlockPinMut.isPending} className="w-full py-1.5 px-3 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                  {unlockPinMut.isPending ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-red-300" />Desbloqueando...</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>Desbloquear PIN do Cliente</>)}
                                                </button>
                                                <button onClick={() => resetPinMut.mutate({ phone: ar.customerPhone || '' })} disabled={resetPinMut.isPending} className="w-full py-1.5 px-3 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 rounded-lg text-xs font-semibold hover:bg-yellow-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                  {resetPinMut.isPending ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-yellow-300" />Resetando...</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Resetar Senha (volta ao telefone)</>)}
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {(activeTab[`arquivo_${ar.registrationId}`] || 'status') === 'cliente' && (
                                      <div className="space-y-3">
                                        {ar.customerName && (
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-1">Nome</p>
                                            <p className="text-sm text-foreground">{ar.customerName}</p>
                                          </div>
                                        )}
                                        {ar.customerPhone && (
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-1">Telefone</p>
                                            <p className="text-sm text-foreground">{ar.customerPhone}</p>
                                          </div>
                                        )}
                                        {ar.email && (
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-1">Email</p>
                                            <p className="text-sm text-foreground">{ar.email}</p>
                                          </div>
                                        )}
                                        {(ar.city || ar.uf) && (
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-1">Localização</p>
                                            <p className="text-sm text-foreground">{[ar.city, ar.uf].filter(Boolean).join(' - ')}</p>
                                          </div>
                                        )}
                                        {svcName && (
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-1">Serviço</p>
                                            <p className="text-sm text-foreground">{svcName}{svcOpt && ` - ${svcOpt}`}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {(activeTab[`arquivo_${ar.registrationId}`] || 'status') === 'historico' && (
                                      <div className="p-0 space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Histórico de Status</p>
                                        {historyQuery.isLoading && (
                                          <div className="flex justify-center py-4">
                                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
                                          </div>
                                        )}
                                        {historyQuery.data && historyQuery.data.length === 0 && (
                                          <p className="text-xs text-muted-foreground text-center py-4">Nenhum histórico registrado</p>
                                        )}
                                        {historyQuery.data && historyQuery.data.map(h => {
                                          const cfg = ACTIVE_STATUS_CONFIG[h.status];
                                          return (
                                            <div key={h.id} className="flex items-start gap-2 text-xs">
                                              <span className={`mt-0.5 flex-shrink-0 ${cfg?.color || "text-muted-foreground"}`}>{cfg?.icon}</span>
                                              <div className="flex-1">
                                                <span className={`font-medium ${cfg?.color || ""}`}>{cfg?.label || h.status}</span>
                                                {h.note && <p className="text-muted-foreground mt-0.5">{h.note}</p>}
                                              </div>
                                              <span className="text-muted-foreground flex-shrink-0">{formatDate(h.createdAt)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {(activeTab[`arquivo_${ar.registrationId}`] || 'status') === 'documentos' && (
                                      <div className="p-0 space-y-3">
                                        {filesQuery.isLoading && (
                                          <div className="flex justify-center py-4">
                                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
                                          </div>
                                        )}
                                        {filesQuery.data && filesQuery.data.length === 0 && (
                                          <p className="text-xs text-muted-foreground text-center py-4">Nenhum documento enviado</p>
                                        )}
                                        {filesQuery.data && filesQuery.data.map(f => (
                                          <div key={f.id} className="flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2">
                                            <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium text-foreground truncate">{f.label || 'Documento'}</p>
                                              <p className="text-[10px] text-muted-foreground">{formatDate(f.createdAt instanceof Date ? f.createdAt.getTime() : f.createdAt)}</p>
                                            </div>
                                            <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex-shrink-0">Ver</a>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {(activeTab[`arquivo_${ar.registrationId}`] || 'status') === 'anotacoes' && (
                                      <div className="p-1">
                                        <NotesTab registrationId={ar.registrationId} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                                )}
                              </div>
                            );
                          })}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ===== ABA RG/CNH APROVADO ===== */}
              {currentTabKey === "__rgcnh__" && (() => {
                const rgCnhOrders = (rgCnhQuery.data || []) as Array<{
                  id: number; registrationId: number; customerPhone: string; customerName: string;
                  customerNumber: number | null; city: string | null; uf: string | null;
                  email: string | null; serviceName: string | null; serviceOption: string | null;
                  orderNumber: number | null; answers: string | null; latestStatus: string | null;
                  latestStatusAt: number | null; note: string | null; accessedAt: number | null;
                  profilePhotoUrl: string | null;
                }>;
                return (
                  <div className="border border-green-500/40 rounded-xl overflow-hidden">
                    {/* Barra de ordenação */}
                    {rgCnhOrders.length > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-green-600/30 bg-green-500/5">
                        <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
                        {(["number", "name", "date"] as const).map(k => (
                          <button
                            key={k}
                            onClick={() => {
                              if (rgCnhSortKey === k) setRgCnhSortDir(d => d === "asc" ? "desc" : "asc");
                              else { setRgCnhSortKey(k); setRgCnhSortDir("asc"); }
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                              rgCnhSortKey === k
                                ? "bg-green-500/30 border-green-400/60 text-green-200"
                                : "bg-card border-border text-muted-foreground hover:border-green-400/40"
                            }`}
                          >
                            {k === "number" ? "*Número" : k === "name" ? "A–Z Nome" : "Data"}
                            {rgCnhSortKey === k && (
                              rgCnhSortDir === "asc"
                                ? <ArrowUp className="w-3 h-3" />
                                : <ArrowDown className="w-3 h-3" />
                            )}
                          </button>
                        ))}
                        <span className="ml-auto text-xs text-muted-foreground/60">{rgCnhOrders.length} aprovado{rgCnhOrders.length !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    <div className="p-3 bg-background/40">
                      {rgCnhQuery.isLoading && (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-green-400" />
                        </div>
                      )}
                      {!rgCnhQuery.isLoading && rgCnhOrders.length === 0 && (
                        <div className="text-center py-12">
                          <div className="text-4xl mb-3">🪪</div>
                          <p className="text-muted-foreground text-sm">Nenhum pedido nesta pasta</p>
                          <p className="text-muted-foreground/60 text-xs mt-1">Pedidos com RG/CNH aprovado aparecem aqui e podem ser restaurados a qualquer momento</p>
                        </div>
                      )}
                      {rgCnhOrders.length > 0 && (
                        <div className="space-y-4">
                          {(() => {
                            const groups: Record<string, typeof rgCnhOrders> = {};
                            for (const ar of rgCnhOrders) {
                              const key = ar.latestStatus || '__sem_status__';
                              if (!groups[key]) groups[key] = [];
                              groups[key].push(ar);
                            }
                            const orderedKeys = [
                              ...ACTIVE_STATUS_ORDER.filter(s => groups[s]),
                              ...Object.keys(groups).filter(k => !ACTIVE_STATUS_ORDER.includes(k)),
                            ];
                            return orderedKeys.map(statusKey => {
                              const groupOrders = sortFolderOrders(groups[statusKey], rgCnhSortKey, rgCnhSortDir);
                              const cfg = ACTIVE_STATUS_CONFIG[statusKey];
                              const label = cfg?.label || (statusKey === '__sem_status__' ? 'Sem Status' : statusKey);
                              return (
                                <div key={statusKey} className="border border-green-600/30 rounded-xl overflow-hidden">
                                  <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-green-600/20 ${cfg ? cfg.bg : 'bg-green-500/10'}`}>
                                    {cfg?.icon && <span>{cfg.icon}</span>}
                                    <span className={`font-semibold text-sm ${cfg ? cfg.color : 'text-green-300'}`}>{label}</span>
                                    <span className={`ml-1 text-xs font-normal opacity-70 ${cfg ? cfg.color : 'text-green-400'}`}>({groupOrders.length})</span>
                                  </div>
                                  <div className="p-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                      {groupOrders.map(ar => {
                                        const statusCfg = ar.latestStatus ? ACTIVE_STATUS_CONFIG[ar.latestStatus] : null;
                                        const name = (ar.customerName || ar.customerPhone || '?') as string;
                                        const svcName = ar.serviceName && ar.serviceName !== 'NULL' ? ar.serviceName : null;
                                        const svcOpt = ar.serviceOption && ar.serviceOption !== 'NULL' ? ar.serviceOption : null;
                                        const orderNum = ar.orderNumber ? ar.orderNumber : null;
                                        const rawStatus = ar.latestStatus && ar.latestStatus !== 'NULL' ? ar.latestStatus : null;
                                        const isExpanded = expandedRgCnhId === String(ar.registrationId);
                                        return (
                                          <div key={ar.registrationId} className={`bg-card border rounded-xl overflow-hidden cursor-pointer transition-all ${
                                            isExpanded ? "border-green-400/60 col-span-full" : "border-green-600/40"
                                          }`} onClick={() => { const newId = isExpanded ? null : String(ar.registrationId); setExpandedRgCnhId(newId); setExpandedId(newId ? `${ar.registrationId}_0` : null); }}>
                                            {/* Cabeçalho com foto + nome */}
                                            <div className="px-4 py-3 border-b border-border">
                                              <div className="flex items-center gap-3">
                                                {ar.profilePhotoUrl && ar.profilePhotoUrl !== 'NULL' ? (
                                                  <img src={ar.profilePhotoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-green-600" />
                                                ) : (
                                                  <div className="w-9 h-9 rounded-full bg-green-900/40 flex items-center justify-center flex-shrink-0 text-green-300 text-sm font-bold">
                                                    {name.charAt(0).toUpperCase()}
                                                  </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="font-semibold text-sm text-foreground truncate">{name}</span>
                                                    {orderNum && <span className="text-xs text-muted-foreground flex-shrink-0">#{orderNum}</span>}
                                                  </div>
                                                  <div className="flex items-center gap-1 mt-0.5">
                                                    {ar.customerNumber && (
                                                      <span className="flex-shrink-0 text-[11px] font-mono font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded px-1.5 py-0.5 leading-none" title="Número de cadastro">
                                                        *{ar.customerNumber}
                                                      </span>
                                                    )}
                                                    {ar.customerNumber && <span className="text-muted-foreground/40 text-xs">·</span>}
                                                    <span className="text-xs text-muted-foreground">{ar.customerPhone}</span>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                            {/* Corpo com serviço, cidade e status */}
                                            {!isExpanded && (
                                            <div className="px-4 py-3 space-y-2">
                                              {svcName && (
                                                <div className="text-xs">
                                                  <span className="font-semibold text-foreground/90">{svcName}</span>
                                                  {svcOpt && <span className="text-muted-foreground"> · {svcOpt}</span>}
                                                </div>
                                              )}
                                              {(ar.city || ar.uf) && (
                                                <div className="text-xs text-muted-foreground">
                                                  📍 {[ar.city, ar.uf].filter(Boolean).join(' — ')}
                                                </div>
                                              )}
                                              {statusCfg ? (
                                                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.color}`}>
                                                  {statusCfg.icon}{statusCfg.label}
                                                </div>
                                              ) : rawStatus ? (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border bg-green-500/20 border-green-500/40 text-green-300">
                                                  {rawStatus}
                                                </div>
                                              ) : null}
                                              <div className="text-xs text-muted-foreground/50">
                                                Entrada: {formatDate(ar.accessedAt)}
                                              </div>
                                            </div>
                                            )}
                                            {isExpanded && (
                                            <div className="border-t border-border bg-background/50" onClick={e => e.stopPropagation()}>
                                              {/* Abas */}
                                              <div className="flex border-b border-border">
                                                {(['status', 'cliente', 'historico', 'documentos', 'anotacoes'] as const).map(t => (
                                                  <button
                                                    key={t}
                                                    onClick={() => setTab(`rgcnh_${ar.registrationId}`, t)}
                                                    className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                                                      (activeTab[`rgcnh_${ar.registrationId}`] || 'status') === t
                                                        ? 'text-primary border-b-2 border-primary bg-primary/5'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                                  >
                                                    {t === 'status' ? '📋 Status' : t === 'cliente' ? '👤 Cliente' : t === 'historico' ? '🕐 Histórico' : t === 'documentos' ? '📁 Docs' : '📝 Notas'}
                                                  </button>
                                                ))}
                                              </div>

                                              {/* Conteúdo das abas */}
                                              <div className="p-4">
                                                {(activeTab[`rgcnh_${ar.registrationId}`] || 'status') === 'status' && (
                                                  <div className="space-y-3">
                                                    <p className="text-xs font-medium text-muted-foreground">Atualizar status do pedido</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                      {ACTIVE_STATUS_ORDER.filter(isManualSelectableStatus).map(s => {
                                                        const cfg = ACTIVE_STATUS_CONFIG[s];
                                                        if (!cfg) return null;
                                                        const isSel = (rgCnhSelectedStatus[String(ar.registrationId)] || rawStatus) === s;
                                                        return (
                                                          <button
                                                            key={s}
                                                            onClick={() => setRgCnhSelectedStatus(prev => ({ ...prev, [String(ar.registrationId)]: s }))}
                                                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                                                              isSel
                                                                ? `${cfg.bg} ${cfg.color} border-current`
                                                                : 'bg-card border-border text-muted-foreground hover:border-primary/50'
                                                            }`}
                                                          >
                                                            {cfg.icon}
                                                            {cfg.label}
                                                          </button>
                                                        );
                                                      })}
                                                    </div>
                                                    <button
                                                      onClick={() => {
                                                        const status = rgCnhSelectedStatus[String(ar.registrationId)] || rawStatus;
                                                        if (!status) return;
                                                        updateRgCnhStatusMutation.mutate({
                                                          registrationId: ar.registrationId,
                                                          subOrderIndex: 0,
                                                          customerPhone: ar.customerPhone || '',
                                                          status,
                                                        });
                                                      }}
                                                      disabled={updateRgCnhStatusMutation.isPending}
                                                      className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                                    >
                                                      {updateRgCnhStatusMutation.isPending ? 'Salvando...' : 'Salvar Status'}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => removeFromRgCnhMutation.mutate({ registrationId: ar.registrationId })}
                                                      disabled={removeFromRgCnhMutation.isPending}
                                                      className="w-full py-2 px-4 bg-green-500/10 border border-green-500/30 text-green-300 rounded-lg text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                                                    >
                                                      {removeFromRgCnhMutation.isPending ? (
                                                        <>Restaurando...</>
                                                      ) : (
                                                        <>↩ Restaurar para Ativos</>
                                                      )}
                                                    </button>

                                                    {/* === DADOS DE LOGIN === */}
                                                    {(() => {
                                                      const arKey = `rgcnh_${ar.registrationId}`;
                                                      const saved = loginDataQuery.data;
                                                      const fields = loginFields[arKey] ?? { loginPhone: '', loginEmail: '', loginPassword: '', authCode: '', emailLink: '', loginNotes: '', loginGroupLink: '' };
                                                      const setField = (f: 'loginPhone'|'loginEmail'|'loginPassword'|'authCode'|'emailLink'|'loginNotes'|'loginGroupLink', v: string) =>
                                                        setLoginFields(prev => ({ ...prev, [arKey]: { ...(prev[arKey] ?? { loginPhone: '', loginEmail: '', loginPassword: '', authCode: '', emailLink: '', loginNotes: '', loginGroupLink: '' }), [f]: v } }));
                                                      const waPhone = ar.customerPhone ? (ar.customerPhone.replace(/\D/g, '').startsWith('55') ? ar.customerPhone.replace(/\D/g, '') : `55${ar.customerPhone.replace(/\D/g, '')}`) : '';
                                                      const hasLoginData = fields.loginEmail || fields.loginPassword || fields.authCode || fields.emailLink || fields.loginNotes || fields.loginGroupLink;
                                                      const pinKey = arKey;
                                                      const currentPin = adminPinEdit[pinKey] !== undefined ? adminPinEdit[pinKey] : (customerPinQuery.data?.pin ?? '');
                                                      return (
                                                        <div className="space-y-3 mt-2">
                                                          {/* Senha de Acompanhamento */}
                                                          <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                                              Senha de Acompanhamento do Pedido
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                              <input type="text" inputMode="numeric" maxLength={4} value={currentPin}
                                                                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setAdminPinEdit(prev => ({ ...prev, [pinKey]: v })); }}
                                                                placeholder="_ _ _ _"
                                                                className="w-24 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 font-mono font-bold tracking-widest text-center text-base focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                                              />
                                                              <button onClick={() => { if (currentPin.length === 4) { setAdminPinMut.mutate({ phone: ar.customerPhone || '', pin: currentPin }); } else { toast.error('A senha deve ter exatamente 4 dígitos'); } }} disabled={setAdminPinMut.isPending} className="px-2.5 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50">Salvar</button>
                                                              <button onClick={() => { const newPin = Math.floor(1000 + Math.random() * 9000).toString(); setAdminPinEdit(prev => ({ ...prev, [pinKey]: newPin })); setAdminPinMut.mutate({ phone: ar.customerPhone || '', pin: newPin }); }} disabled={setAdminPinMut.isPending} className="px-2.5 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-semibold hover:bg-purple-500/30 transition-colors disabled:opacity-50">Gerar</button>
                                                              <button onClick={() => { navigator.clipboard.writeText(currentPin); toast.success('Senha copiada!'); }} className="p-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors" title="Copiar senha">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                              </button>
                                                            </div>
                                                            <p className="text-xs text-blue-400/60">Enviada ao cliente em todos os emails de status</p>
                                                          </div>

                                                          {/* Perguntas enviadas */}
                                                          {trackingAnswersQuery.data && trackingAnswersQuery.data.length > 0 && (
                                                            <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3 space-y-2">
                                                              <p className="text-xs font-semibold text-blue-400">Respostas do Formulário de Acompanhamento</p>
                                                              {trackingAnswersQuery.data.map((ans: any) => (
                                                                <div key={ans.id} className="bg-black/20 border border-white/5 rounded-lg px-3 py-2">
                                                                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{ans.questionText}</p>
                                                                  <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">{ans.answer}</span>
                                                                  <p className="text-[10px] text-white/30 mt-1">{new Date(ans.answeredAt).toLocaleString('pt-BR')}</p>
                                                                </div>
                                                              ))}
                                                            </div>
                                                          )}

                                                          {/* Dados de Login */}
                                                          <div className="bg-lime-500/5 border border-lime-500/30 rounded-lg p-3 space-y-3">
                                                            <p className="text-xs font-semibold text-lime-400 flex items-center gap-1.5">
                                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                                                              Dados de Login para o Cliente
                                                            </p>
                                                            <div className="space-y-2">
                                                              <div><label className="text-xs text-muted-foreground mb-1 block">📱 Login 1 — Telefone <span className="text-lime-400/70">(cliente pode usar este para entrar)</span></label><div className="flex gap-1"><input type="text" value={fields.loginPhone} onChange={e => setField('loginPhone', e.target.value)} placeholder="Ex: (21) 99999-9999" className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginPhone && <button onClick={() => setField('loginPhone', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div><div><label className="text-xs text-muted-foreground mb-1 block">✉️ Login 2 — Email <span className="text-lime-400/70">(cliente pode usar este para entrar)</span></label><div className="flex gap-1"><input type="text" value={fields.loginEmail} onChange={e => setField('loginEmail', e.target.value)} placeholder="Ex: usuario@email.com" className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginEmail && <button onClick={() => setField('loginEmail', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                              <div><label className="text-xs text-muted-foreground mb-1 block">Senha para entrar na sua conta</label><div className="flex gap-1"><input type="text" value={fields.loginPassword} onChange={e => setField('loginPassword', e.target.value)} placeholder="Ex: senha123" className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginPassword && <button onClick={() => setField('loginPassword', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                              <div><label className="text-xs text-muted-foreground mb-1 block">Código Autenticador</label><div className="flex gap-1"><input type="text" value={fields.authCode} onChange={e => setField('authCode', e.target.value.replace(/-/g, ''))} placeholder="Ex: GJ6W76PV4B23..." className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.authCode && <button onClick={() => setField('authCode', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                              <AuthenticatorQrAdminField
                                                                registrationId={ar.registrationId}
                                                                hasExistingQr={Boolean((saved as any)?.hasAuthenticatorQr)}
                                                                pendingValue={loginAuthenticatorQr[arKey]}
                                                                onPendingValueChange={value => setLoginAuthenticatorQr(prev => ({ ...prev, [arKey]: value }))}
                                                                disabled={saveLoginDataMut.isPending}
                                                              />
                                                              <div><label className="text-xs text-muted-foreground mb-1 block">👥 Link do Grupo</label><div className="flex gap-1"><input type="text" value={fields.loginGroupLink} onChange={e => setField('loginGroupLink', e.target.value)} placeholder="Ex: https://chat.whatsapp.com/..." className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />{fields.loginGroupLink && <button onClick={() => setField('loginGroupLink', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                              <div><label className="text-xs text-muted-foreground mb-1 block">📝 Texto / Instruções para o Cliente</label><div className="flex gap-1 items-start"><textarea value={fields.loginNotes} onChange={e => setField('loginNotes', e.target.value)} placeholder="Ex: Acesse o app, vá em configurações e ative a conta..." rows={3} className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60 resize-none" />{fields.loginNotes && <button onClick={() => setField('loginNotes', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors">✕</button>}</div></div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                              <button onClick={() => { const pendingQr = loginAuthenticatorQr[arKey]; saveLoginDataMut.mutate({ registrationId: ar.registrationId, customerPhone: ar.customerPhone || '', loginPhone: fields.loginPhone, loginEmail: fields.loginEmail, loginPassword: fields.loginPassword, authCode: fields.authCode, emailLink: fields.emailLink, loginNotes: fields.loginNotes, loginGroupLink: fields.loginGroupLink, authenticatorQrData: pendingQr && typeof pendingQr === 'object' ? pendingQr.data : undefined, authenticatorQrAction: pendingQr === null ? 'delete' : pendingQr ? 'replace' : 'keep' }); }} disabled={saveLoginDataMut.isPending} className="flex-1 py-1.5 px-3 bg-lime-500/20 border border-lime-500/40 text-lime-300 rounded-lg text-xs font-semibold hover:bg-lime-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                                {saveLoginDataMut.isPending ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-lime-300" />Salvando...</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar Dados de Login</>)}
                                                              </button>
                                                              {waPhone && hasLoginData && (
                                                                <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`🔐 Seus dados de acesso estão prontos! Acesse: ${publicTrackingShareUrl()}`)}`} target="_blank" rel="noopener noreferrer" className="py-1.5 px-3 bg-green-600/20 border border-green-500/40 text-green-300 rounded-lg text-xs font-semibold hover:bg-green-600/30 transition-colors flex items-center gap-1.5">
                                                                  <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                                                                </a>
                                                              )}
                                                            </div>
                                                            {saved && (saved.loginEmail || saved.loginPassword || saved.authCode || (saved as any).emailLink || (saved as any).loginNotes || (saved as any).loginGroupLink) && (
                                                              <p className="text-xs text-lime-400/70 text-center">✓ Dados salvos — visíveis para o cliente quando status for Entregue</p>
                                                            )}
                                                          </div>

                                                          {/* Agendamento */}
                                                          <OrderScheduleBlock
                                                            registrationId={ar.registrationId}
                                                            subOrderIndex={0}
                                                            customerPhone={ar.customerPhone || ''}
                                                            customerName={ar.customerName || ''}
                                                            customerEmail={ar.email || ''}
                                                            customerPhotoUrl={ar.profilePhotoUrl || ''}
                                                          />

                                                          {/* Previsão de Entrega */}
                                                          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-blue-400 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Previsão de Entrega</p>
                                                            <div className="flex gap-2">
                                                              <input type="date" value={deliveryEstimate[arKey] ? deliveryEstimate[arKey].split('T')[0] : ''} onChange={e => { const time = deliveryEstimate[arKey]?.split('T')[1] || '18:00'; setDeliveryEstimate(prev => ({ ...prev, [arKey]: `${e.target.value}T${time}` })); }} className="flex-1 px-3 py-2 bg-background border border-blue-500/30 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                                                              <input type="time" value={deliveryEstimate[arKey] ? deliveryEstimate[arKey].split('T')[1]?.slice(0,5) : '18:00'} onChange={e => { const date = deliveryEstimate[arKey]?.split('T')[0] || new Date().toISOString().slice(0,10); setDeliveryEstimate(prev => ({ ...prev, [arKey]: `${date}T${e.target.value}` })); }} className="w-28 px-3 py-2 bg-background border border-blue-500/30 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                                                            </div>
                                                            <button type="button" onClick={() => { const val = deliveryEstimate[arKey]; if (!val) { toast.error('Selecione uma data e hora'); return; } setSavingEstimate(arKey); updateDeliveryEstimateMut.mutate({ registrationId: ar.registrationId, deliveryEstimate: new Date(val).getTime() }); }} disabled={savingEstimate === arKey} className="w-full py-1.5 px-3 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                              {savingEstimate === arKey ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-blue-300" />Salvando...</>) : (<><Calendar className="w-3.5 h-3.5" />Salvar Previsão</>)}
                                                            </button>
                                                          </div>

                                                          {/* Número do Pedido */}
                                                          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-blue-400 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>Número do Pedido</p>
                                                            <div className="flex gap-2">
                                                              <input type="number" placeholder="Ex: 430001" value={editOrderNumber[arKey] ?? ''} onChange={e => setEditOrderNumber(prev => ({ ...prev, [arKey]: e.target.value }))} className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                                              <button onClick={() => { const val = editOrderNumber[arKey]; setSavingOrderNumber(arKey); updateOrderNumberMutation.mutate({ registrationId: ar.registrationId, subOrderIndex: 0, orderNumber: val ? parseInt(val) : null }); setEditOrderNumber(prev => ({ ...prev, [arKey]: '' })); }} disabled={savingOrderNumber === arKey} className="py-1.5 px-3 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex items-center gap-1">
                                                                {savingOrderNumber === arKey ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-blue-300" />Salvando...</>) : (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar</>)}
                                                              </button>
                                                            </div>
                                                          </div>

                                                          {/* Acesso PIN */}
                                                          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-red-400 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>Acesso PIN</p>
                                                            <p className="text-xs text-muted-foreground">Se o cliente errou a senha 3 vezes e foi bloqueado, clique abaixo para liberar o acesso novamente.</p>
                                                            <button onClick={() => unlockPinMut.mutate({ phone: ar.customerPhone || '' })} disabled={unlockPinMut.isPending} className="w-full py-1.5 px-3 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                              {unlockPinMut.isPending ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-red-300" />Desbloqueando...</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>Desbloquear PIN do Cliente</>)}
                                                            </button>
                                                            <button onClick={() => resetPinMut.mutate({ phone: ar.customerPhone || '' })} disabled={resetPinMut.isPending} className="w-full py-1.5 px-3 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 rounded-lg text-xs font-semibold hover:bg-yellow-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                              {resetPinMut.isPending ? (<><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-yellow-300" />Resetando...</>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Resetar Senha (volta ao telefone)</>)}
                                                            </button>
                                                          </div>
                                                        </div>
                                                      );
                                                    })()}
                                                  </div>
                                                )}

                                                {(activeTab[`rgcnh_${ar.registrationId}`] || 'status') === 'cliente' && (
                                                  <div className="space-y-3">
                                                    {ar.customerName && (
                                                      <div>
                                                        <p className="text-xs font-semibold text-muted-foreground mb-1">Nome</p>
                                                        <p className="text-sm text-foreground">{ar.customerName}</p>
                                                      </div>
                                                    )}
                                                    {ar.customerPhone && (
                                                      <div>
                                                        <p className="text-xs font-semibold text-muted-foreground mb-1">Telefone</p>
                                                        <p className="text-sm text-foreground">{ar.customerPhone}</p>
                                                      </div>
                                                    )}
                                                    {ar.email && (
                                                      <div>
                                                        <p className="text-xs font-semibold text-muted-foreground mb-1">Email</p>
                                                        <p className="text-sm text-foreground">{ar.email}</p>
                                                      </div>
                                                    )}
                                                    {(ar.city || ar.uf) && (
                                                      <div>
                                                        <p className="text-xs font-semibold text-muted-foreground mb-1">Localização</p>
                                                        <p className="text-sm text-foreground">{[ar.city, ar.uf].filter(Boolean).join(' - ')}</p>
                                                      </div>
                                                    )}
                                                    {svcName && (
                                                      <div>
                                                        <p className="text-xs font-semibold text-muted-foreground mb-1">Serviço</p>
                                                        <p className="text-sm text-foreground">{svcName}{svcOpt && ` - ${svcOpt}`}</p>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}

                                                {(activeTab[`rgcnh_${ar.registrationId}`] || 'status') === 'historico' && (
                                                  <div className="space-y-2">
                                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Histórico de Status</p>
                                                    {historyQuery.isLoading && (
                                                      <div className="flex justify-center py-4">
                                                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
                                                      </div>
                                                    )}
                                                    {historyQuery.data && historyQuery.data.length === 0 && (
                                                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum histórico registrado</p>
                                                    )}
                                                    {historyQuery.data && historyQuery.data.map(h => {
                                                      const cfg = ACTIVE_STATUS_CONFIG[h.status];
                                                      return (
                                                        <div key={h.id} className="flex items-start gap-2 text-xs">
                                                          <span className={`mt-0.5 flex-shrink-0 ${cfg?.color || "text-muted-foreground"}`}>{cfg?.icon}</span>
                                                          <div className="flex-1">
                                                            <span className={`font-medium ${cfg?.color || ""}`}>{cfg?.label || h.status}</span>
                                                            {h.note && <p className="text-muted-foreground mt-0.5">{h.note}</p>}
                                                          </div>
                                                          <span className="text-muted-foreground flex-shrink-0">{formatDate(h.createdAt)}</span>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}

                                                {(activeTab[`rgcnh_${ar.registrationId}`] || 'status') === 'documentos' && (
                                                  <div className="space-y-3">
                                                    {filesQuery.isLoading && (
                                                      <div className="flex justify-center py-4">
                                                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
                                                      </div>
                                                    )}
                                                    {filesQuery.data && filesQuery.data.length === 0 && (
                                                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum documento enviado</p>
                                                    )}
                                                    {filesQuery.data && filesQuery.data.map(f => (
                                                      <div key={f.id} className="flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2">
                                                        <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                        <div className="flex-1 min-w-0">
                                                          <p className="text-xs font-medium text-foreground truncate">{f.label || 'Documento'}</p>
                                                          <p className="text-[10px] text-muted-foreground">{formatDate(f.createdAt instanceof Date ? f.createdAt.getTime() : f.createdAt)}</p>
                                                        </div>
                                                        <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex-shrink-0">Ver</a>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}

                                                {(activeTab[`rgcnh_${ar.registrationId}`] || 'status') === 'anotacoes' && (
                                                  <div className="p-1">
                                                    <NotesTab registrationId={ar.registrationId} />
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ===== ABA PASTAS PERSONALIZADAS ===== */}
              {currentTabKey?.startsWith('__custom_') && (() => {
                const folderId = parseInt(currentTabKey.replace('__custom_', '').replace('__', ''));
                return <CustomFolderTab key={currentTabKey} folderId={folderId} expandedId={expandedId} setExpandedId={setExpandedId} expandedCustomFolderId={expandedCustomFolderId} setExpandedCustomFolderId={setExpandedCustomFolderId} activeTab={activeTab} setActiveTab={setActiveTab} removeFromFolderMut={removeFromFolderMut} moveToFolderMut={moveToFolderMut} customFolders={customFoldersQuery.data || []} historyQuery={historyQuery} filesQuery={filesQuery} orderNoteQuery={orderNoteQuery} saveNoteMut={saveNoteMut} noteText={noteText} setNoteText={setNoteText} viewedOrders={viewedOrders} formatDate={formatDate} />;
              })()}

              {/* ===== ABA PERGUNTAS ===== */}
              {currentTabKey === "__perguntas__" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">Perguntas para Clientes</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Perguntas que aparecem na tela /acompanhar para o cliente responder</p>
                    </div>
                    <button onClick={() => setShowNewTQAdm(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                      <Plus className="w-4 h-4" /> Nova Pergunta
                    </button>
                  </div>

                  {/* Formulário nova pergunta */}
                  {showNewTQAdm && (
                    <div className="bg-[#111128] border border-purple-500/30 rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-bold text-purple-400">Nova Pergunta</h3>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Texto da Pergunta</label>
                        <input value={newTQTextAdm} onChange={e => setNewTQTextAdm(e.target.value)} placeholder="Ex: Você tem CNH válida?" className="w-full bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-gray-400">Opções de Resposta</label>
                          <button onClick={() => setNewTQOptionsAdm(prev => [...prev, { label: '', color: '#6b7280' }])} className="text-xs text-purple-400 hover:text-purple-300">+ Adicionar opção</button>
                        </div>
                        <div className="space-y-2">
                          {newTQOptionsAdm.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input value={opt.label} onChange={e => setNewTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, label: e.target.value } : o))} placeholder={`Opção ${i + 1}`} className="flex-1 bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                              <div className="flex gap-1">
                                {TQ_COLORS_ADM.map(c => (
                                  <button key={c} onClick={() => setNewTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, color: c } : o))} className={`w-5 h-5 rounded-full border-2 transition-all ${opt.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                                ))}
                              </div>
                              <button onClick={() => setNewTQOptionsAdm(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 p-1"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="newTQShowOnceAdm" checked={newTQShowOnceAdm} onChange={e => setNewTQShowOnceAdm(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                        <label htmlFor="newTQShowOnceAdm" className="text-sm text-gray-300">Mostrar apenas uma vez por pedido</label>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowNewTQAdm(false); resetNewTQAdm(); }} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm">Cancelar</button>
                        <button onClick={() => createTQMutAdm.mutate({ text: newTQTextAdm, options: newTQOptionsAdm.filter(o => o.label.trim()), showOnce: newTQShowOnceAdm })} disabled={!newTQTextAdm.trim() || newTQOptionsAdm.filter(o => o.label.trim()).length < 1 || createTQMutAdm.isPending} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                          {createTQMutAdm.isPending ? 'Salvando...' : 'Criar Pergunta'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de perguntas */}
                  {(tqListQuery.data || []).length === 0 && !showNewTQAdm && (
                    <div className="bg-[#111128] border border-white/10 rounded-xl p-8 text-center">
                      <p className="text-gray-400 text-sm">Nenhuma pergunta criada ainda.</p>
                      <p className="text-gray-500 text-xs mt-1">Clique em "Nova Pergunta" para começar.</p>
                    </div>
                  )}

                  {(tqListQuery.data || []).map((q: any) => {
                    const opts: Array<{label:string;color:string}> = (() => { try { return JSON.parse(q.options); } catch { return []; } })();
                    const isEditing = editingTQIdAdm === q.id;
                    return (
                      <div key={q.id} className={`bg-[#111128] border rounded-xl p-4 space-y-3 ${q.isActive ? 'border-purple-500/40' : 'border-white/10 opacity-60'}`}>
                        {isEditing ? (
                          <div className="space-y-3">
                            <input value={editTQTextAdm} onChange={e => setEditTQTextAdm(e.target.value)} className="w-full bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <div className="space-y-2">
                              {editTQOptionsAdm.map((opt, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <input value={opt.label} onChange={e => setEditTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, label: e.target.value } : o))} className="flex-1 bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500" />
                                  <div className="flex gap-1">
                                    {TQ_COLORS_ADM.map(c => (
                                      <button key={c} onClick={() => setEditTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, color: c } : o))} className={`w-5 h-5 rounded-full border-2 transition-all ${opt.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                                    ))}
                                  </div>
                                  <button onClick={() => setEditTQOptionsAdm(prev => prev.filter((_, j) => j !== i))} className="text-red-400 p-1"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                              <button onClick={() => setEditTQOptionsAdm(prev => [...prev, { label: '', color: '#6b7280' }])} className="text-xs text-purple-400 hover:text-purple-300">+ Adicionar opção</button>
                            </div>
                            <div className="flex items-center gap-2">
                              <input type="checkbox" checked={editTQShowOnceAdm} onChange={e => setEditTQShowOnceAdm(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                              <span className="text-sm text-gray-300">Mostrar apenas uma vez por pedido</span>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingTQIdAdm(null)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm">Cancelar</button>
                              <button onClick={() => updateTQMutAdm.mutate({ id: q.id, text: editTQTextAdm, options: editTQOptionsAdm.filter(o => o.label.trim()), showOnce: editTQShowOnceAdm })} disabled={updateTQMutAdm.isPending} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium">
                                {updateTQMutAdm.isPending ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-white">{q.text}</p>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {opts.map((o, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: o.color + '33', border: `1px solid ${o.color}66`, color: o.color }}>
                                      {o.label}
                                    </span>
                                  ))}
                                </div>
                                {q.showOnce === 1 && <p className="text-[10px] text-gray-500 mt-1">Mostra apenas uma vez por pedido</p>}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={() => toggleTQMutAdm.mutate({ id: q.id, isActive: !q.isActive })} className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${q.isActive ? 'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/40' : 'bg-gray-500/20 text-gray-400 border border-gray-500/40 hover:bg-green-500/20 hover:text-green-400 hover:border-green-500/40'}`}>
                                  {q.isActive ? 'Ativa' : 'Inativa'}
                                </button>
                                <button onClick={() => { setEditingTQIdAdm(q.id); setEditTQTextAdm(q.text); try { setEditTQOptionsAdm(JSON.parse(q.options)); } catch { setEditTQOptionsAdm([]); } setEditTQShowOnceAdm(q.showOnce === 1); }} className="p-1.5 text-blue-400 hover:text-blue-300 bg-blue-500/10 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => { if (confirm('Remover esta pergunta?')) deleteTQMutAdm.mutate({ id: q.id }); }} className="p-1.5 text-red-400 hover:text-red-300 bg-red-500/10 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-colors"><Trash className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Conteúdo da aba ativa */}
              {currentTab && currentTabKey !== "__arquivo__" && currentTabKey !== "__perguntas__" && currentTabKey !== "__rgcnh__" && !currentTabKey?.startsWith('__custom_') && (() => {
                const group = currentTab;
                const colorIdx = group.colorIdx;
                const color = (!group.isDelivered && colorIdx >= 0) ? PRODUCT_COLORS[colorIdx] : null;
                const isAllTab = group.key === "__todos__";
                const groupIdx = 0;
                const isCollapsed = false;
                const groupUrgentCount = group.orders.filter(o => o.isUrgent === 1).length;
                const groupNewCount = group.orders.filter(o => !viewedOrders.has(getOrderKey(o))).length;
          // Contagem por status
          const statusCounts: Record<string, number> = {};
          for (const o of group.orders) {
            const s = o.latestStatus || "sem_status";
            statusCounts[s] = (statusCounts[s] || 0) + 1;
          }
          return (
            <div key={group.key} className={`border rounded-xl overflow-hidden ${group.isDelivered ? "border-teal-500/40" : isAllTab ? "border-amber-500/40" : color ? color.border : "border-border"}`}>
              {/* Cabeçalho do grupo — oculto pois usamos abas */}
              {/* Barra de ordenação para aba Todos */}
              {isAllTab && (
                <div className={`flex items-center gap-2 px-3 py-2 border-b ${
                  isEmergencySearch ? 'border-orange-500/30 bg-orange-500/8' : 'border-amber-500/20 bg-amber-500/5'
                }`}>
                  {isEmergencySearch ? (
                    <>
                      <span className="text-orange-400 text-xs font-bold">🚨 BUSCA GLOBAL</span>
                      <span className="text-orange-300/60 text-xs">— todas as pastas</span>
                      {emergencyTerm.length >= 2 && (
                        <span className="bg-orange-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5 ml-1">
                          {emergencyQuery.isLoading ? '...' : emergencyResults.length}
                        </span>
                      )}
                      <button onClick={() => setSearch('')} className="ml-auto text-orange-400/60 hover:text-orange-300 text-xs flex items-center gap-1 transition-colors">
                        <X className="w-3 h-3" /> Limpar
                      </button>
                    </>
                  ) : (
                    (() => {
                      const quickFilters = [
                        { id: "all",                   label: "Todos",             desc: "Todos os pedidos",       icon: Layers,       glow: "#f59e0b", ab: "linear-gradient(135deg,#78350f,#92400e)", ac: "#f59e0b", at: "#fde68a" },
                        { id: "sem_status",            label: "Sem Agendamento",  desc: "Não agendados",          icon: Calendar,     glow: "#ef4444", ab: "linear-gradient(135deg,#7f1d1d,#991b1b)", ac: "#ef4444", at: "#fca5a5" },
                        { id: "agendamento_confirmado", label: "Agend. Confirmado", desc: "Agenda confirmada",       icon: CheckCircle2, glow: "#22c55e", ab: "linear-gradient(135deg,#14532d,#166534)", ac: "#22c55e", at: "#86efac" },
                        { id: "agendamento",            label: "Aguardando",        desc: "Aguardando confirmação", icon: Clock,        glow: "#eab308", ab: "linear-gradient(135deg,#713f12,#854d0e)", ac: "#eab308", at: "#fef08a" },
                        { id: "em_analise",             label: "Em Análise",        desc: "Foto em análise",        icon: Search,       glow: "#38bdf8", ab: "linear-gradient(135deg,#0c4a6e,#075985)", ac: "#38bdf8", at: "#bae6fd" },
                        { id: "novo",                   label: "Novos",             desc: "Não visualizados",       icon: Star,         glow: "#6366f1", ab: "linear-gradient(135deg,#1e1b4b,#312e81)", ac: "#6366f1", at: "#a5b4fc" },
                        { id: "aguardando_ativa",       label: "Ag. Ficar Ativa",   desc: "Aguardando ficar ativa", icon: Zap,          glow: "#84cc16", ab: "linear-gradient(135deg,#1a2e05,#365314)", ac: "#84cc16", at: "#bef264" },
                        { id: "conta_ativa",            label: "Conta Ativa",       desc: "Conta já ativa",         icon: UserCheck,    glow: "#10b981", ab: "linear-gradient(135deg,#022c22,#064e3b)", ac: "#10b981", at: "#6ee7b7" },
                      ] as const;
                      const counts: Record<string, number> = { all: group.orders.length, novo: 0 };
                      for (const order of group.orders) {
                        const bucket = getOperationalBucket(order);
                        counts[bucket] = (counts[bucket] || 0) + 1;
                        if (!viewedOrders.has(getOrderKey(order))) counts.novo += 1;
                      }
                      return (
                        <div className="flex w-full items-stretch gap-2 overflow-x-auto pb-1 pr-1 snap-x" style={{ scrollbarWidth: "none" }} aria-label="Filtros operacionais de pedidos">
                          {quickFilters.map(f => {
                            const count = counts[f.id] || 0;
                            const active = todosQuickFilter === f.id;
                            const Icon = f.icon;
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => setTodosQuickFilter(f.id)}
                                title={`${f.label}: ${f.desc} (${count})`}
                                aria-pressed={active}
                                style={active ? { background: f.ab, borderColor: f.ac, color: f.at, boxShadow: `0 0 14px ${f.glow}66` } : {}}
                                className={`group shrink-0 snap-start min-w-[148px] sm:min-w-[158px] min-h-[58px] flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                                  active
                                    ? "scale-[1.015]"
                                    : f.id === "novo" && count === 0
                                      ? "bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"
                                      : "bg-zinc-900/95 border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                                }`}
                              >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${active ? "border-white/20 bg-black/15" : "border-white/10 bg-white/5 text-zinc-400 group-hover:text-white"}`}>
                                  <Icon className="w-4 h-4" />
                                </span>
                                <div className="min-w-0 flex-1 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xl font-black leading-none tabular-nums ${active ? "" : "text-zinc-100"}`}>{count}</span>
                                    <span className="truncate text-[12px] font-bold leading-tight">{f.label}</span>
                                  </div>
                                  <span className="mt-0.5 block truncate text-[10px] leading-tight opacity-65">{f.desc}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </div>
              )}
              {/* Barra de ordenação para aba Entregues */}
              {group.isDelivered && (
                <div className="flex flex-col gap-2 px-3 py-2 border-b border-teal-500/20 bg-teal-500/5">
                  {/* Filtro por telefone */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={deliveredPhoneFilter}
                      onChange={e => setDeliveredPhoneFilter(e.target.value)}
                      placeholder="Filtrar por telefone..."
                      className="flex-1 h-8 px-3 rounded-lg bg-black/30 border border-teal-500/30 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-teal-400/60"
                    />
                    {deliveredPhoneFilter && (
                      <button onClick={() => setDeliveredPhoneFilter('')} className="h-8 px-2 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs hover:bg-teal-500/30">✕ Limpar</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
                  {(["number", "name", "date", "notified"] as const).map(k => (
                    <button
                      key={k}
                      onClick={() => {
                        if (deliveredSortKey === k) setDeliveredSortDir(d => d === "asc" ? "desc" : "asc");
                        else { setDeliveredSortKey(k); setDeliveredSortDir(k === "notified" || k === "date" ? "desc" : "asc"); }
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        deliveredSortKey === k
                          ? k === "notified"
                            ? "bg-teal-400/25 border-teal-400/60 text-teal-200"
                            : "bg-teal-500/20 border-teal-500/50 text-teal-300"
                          : "bg-card border-border text-muted-foreground hover:border-teal-500/40"
                      }`}
                    >
                      {k === "number" ? "*Número"
                        : k === "name" ? "A–Z Nome"
                        : k === "notified"
                          ? (deliveredSortKey === k
                            ? (deliveredSortDir === "desc" ? "✉️ ↓ Notificado" : "✉️ ↑ Notificado")
                            : "✉️ Notificado")
                          : (deliveredSortKey === k
                            ? (deliveredSortDir === "desc" ? "↓ Mais Recente" : "↑ Mais Antigo")
                            : "Mais Recente")}
                      {deliveredSortKey === k && (
                        deliveredSortDir === "asc"
                          ? <ArrowUp className="w-3 h-3" />
                          : <ArrowDown className="w-3 h-3" />
                      )}
                    </button>
                  ))}
                    <span className="ml-auto text-xs text-muted-foreground/60">{group.orders.length} pedido{group.orders.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              )}
              {/* Cards dos pedidos dentro do grupo, sub-agrupados por opção */}
              {true && (
                <div className="p-3 space-y-4 bg-background/40">
                  {/* ===== MODO BUSCA GLOBAL (/) ===== */}
                  {isAllTab && isEmergencySearch && (() => {
                    if (emergencyTerm.length < 2) return (
                      <div className="py-6 text-center text-orange-300/60 text-sm">
                        Digite ao menos 2 caracteres após <code className="bg-orange-900/30 px-1 rounded">/</code> para buscar em todas as pastas.
                      </div>
                    );
                    if (emergencyQuery.isLoading) return (
                      <div className="flex items-center justify-center gap-2 py-8 text-orange-300/70 text-sm">
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
                        Buscando em todas as pastas...
                      </div>
                    );
                    if (emergencyResults.length === 0) return (
                      <div className="py-8 text-center text-muted-foreground text-sm">
                        Nenhum pedido encontrado em nenhuma pasta.
                      </div>
                    );
                    const folderColorMap: Record<string, string> = {
                      active: 'border-blue-500/50',
                      archived: 'border-zinc-500/50',
                      rgcnh: 'border-green-500/50',
                      custom: 'border-violet-500/50',
                    };
                    const folderBadgeMap: Record<string, string> = {
                      active: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                      archived: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
                      rgcnh: 'bg-green-500/20 text-green-300 border-green-500/30',
                      custom: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
                    };
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {(emergencyResults as any[]).map((r: any) => {
                          const statusCfg = r.latestStatus ? ACTIVE_STATUS_CONFIG[r.latestStatus] : null;
                          const displayName = r.customerName || r.customerPhone;
                          const cardBorder = folderColorMap[r.folderType] || folderColorMap.active;
                          const badgeColor = folderBadgeMap[r.folderType] || folderBadgeMap.active;
                          return (
                            <div key={`emg-${r.registrationId}-${r.subOrderIndex ?? 0}`}
                              className={`bg-card border rounded-xl overflow-hidden transition-all ${cardBorder}`}
                            >
                              {/* Faixa da pasta */}
                              <div className={`px-3 py-1 border-b border-white/5 flex items-center gap-1.5 ${
                                r.folderType === 'archived' ? 'bg-zinc-800/60' :
                                r.folderType === 'rgcnh' ? 'bg-green-950/60' :
                                r.folderType === 'custom' ? 'bg-violet-950/60' :
                                'bg-blue-950/60'
                              }`}>
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>{r.folderLabel}</span>
                              </div>
                              {/* Cabeçalho */}
                              <div className="px-4 py-3 border-b border-border">
                                <div className="flex items-center gap-3">
                                  {r.profilePhotoUrl ? (
                                    <img src={r.profilePhotoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-white/10" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground text-sm font-bold">
                                      {(displayName || '?').charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-semibold text-sm text-foreground truncate">{displayName}</span>
                                      {r.orderNumber && <span className="text-xs text-muted-foreground flex-shrink-0">#{r.orderNumber}</span>}
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="text-xs text-muted-foreground">{r.customerPhone}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Corpo */}
                              <div className="px-4 py-3 space-y-2">
                                {r.serviceName && (
                                  <div className="text-xs space-y-2">
                                    <div className="font-semibold text-foreground/90">📦 {r.serviceName}</div>
                                    {r.serviceOption && (() => {
                                      const garantiaMatch = r.serviceOption.match(/^(.*?)\s*-\s*(Garantia:.*)$/i);
                                      if (garantiaMatch) {
                                        const servicePart = garantiaMatch[1];
                                        const garantiaPart = garantiaMatch[2];
                                        return (
                                          <>
                                            {servicePart && <div className="text-muted-foreground text-[11px] break-words">— {servicePart.trim()}</div>}
                                            {garantiaPart && (
                                              <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                                                <span className="text-amber-400">🛡️</span>
                                                <span className="text-amber-300 text-[11px] font-semibold">{garantiaPart.trim()}</span>
                                              </div>
                                            )}
                                          </>
                                        );
                                      } else {
                                        return <div className="text-muted-foreground text-[11px] break-words">— {r.serviceOption}</div>;
                                      }
                                    })()}
                                  </div>
                                )}
                                {statusCfg ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusCfg.bg} ${statusCfg.color}`}>
                                    {statusCfg.icon} {statusCfg.label}
                                  </span>
                                ) : r.latestStatus ? (
                                  <span className="text-[11px] text-muted-foreground">{r.latestStatus}</span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground/40">Sem status</span>
                                )}
                              </div>
                              {/* Ações */}
                              <div className="px-4 py-2 border-t border-border flex flex-wrap gap-1.5">
                                {/* Botão Restaurar para origem — aparece quando pedido está em Arquivo, RG/CNH ou pasta personalizada */}
                                {(r.archived || r.rgCnhApproved || r.folderType === 'custom') && (
                                  <button onClick={() => {
                                    if (r.archived) unarchiveMutation.mutate({ registrationId: r.registrationId });
                                    else if (r.rgCnhApproved) removeFromRgCnhMutation.mutate({ registrationId: r.registrationId });
                                    else if (r.folderType === 'custom' && r.folderId) removeFromFolderMut.mutate({ registrationId: r.registrationId, subOrderIndex: r.subOrderIndex ?? 0 });
                                  }}
                                    className="text-[11px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 border border-emerald-500/30 transition-colors font-semibold"
                                  >↩ Restaurar</button>
                                )}
                                {!r.archived && (
                                  <button onClick={() => archiveMutation.mutate({ registrationId: r.registrationId })}
                                    className="text-[11px] px-2 py-1 rounded bg-zinc-500/20 text-zinc-300 hover:bg-zinc-500/40 border border-zinc-500/30 transition-colors"
                                  >📁 Arquivo</button>
                                )}
                                {!r.rgCnhApproved && (
                                  <button onClick={() => moveToRgCnhMutation.mutate({ registrationId: r.registrationId })}
                                    className="text-[11px] px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/40 border border-green-500/30 transition-colors"
                                  >🪷 RG/CNH</button>
                                )}
                                {r.folderType === 'custom' && r.folderId && (
                                  <button onClick={() => removeFromFolderMut.mutate({ registrationId: r.registrationId, subOrderIndex: r.subOrderIndex ?? 0 })}
                                    className="text-[11px] px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/40 border border-red-500/30 transition-colors"
                                  >✕ Remover da pasta</button>
                                )}
                              </div>
                              {/* Aviso de pasta */}
                              {(r.archived || r.rgCnhApproved || r.folderType === 'custom') && (
                                <div className="text-[10px] text-muted-foreground/70 px-3 py-1.5 border-t border-border/30 bg-muted/20">
                                  📂 {r.archived ? 'Em Arquivo' : r.rgCnhApproved ? 'RG/CNH Aprovado' : r.folderName || 'Pasta Personalizada'}
                                </div>
                              )}
                              {/* Botão Mover em estilo card */}
                              {((customFoldersQuery.data as any[]) || []).length > 0 && (
                                <div className="mt-2 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                                  <p className="text-xs font-semibold text-violet-300 mb-2">📂 Mover para Pasta</p>
                                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                    {(customFoldersQuery.data as any[]).map((f: any) => (
                                      <button key={f.id}
                                        onClick={() => moveToFolderMut.mutate({ folderId: f.id, registrationId: r.registrationId, subOrderIndex: r.subOrderIndex ?? 0 })}
                                        className="w-full text-left text-xs px-2.5 py-1.5 rounded bg-violet-500/20 text-violet-300 hover:bg-violet-500/40 border border-violet-500/30 transition-colors truncate"
                                      >{f.icon ? `${f.icon} ` : ''}{f.name}</button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {/* ===== MODO NORMAL ===== */}
                  {(!isAllTab || !isEmergencySearch) && (isAllTab
                    ? [{ name: "", orders: (() => {
                        const filtered = group.orders.filter((o: any) => {
                          if (todosQuickFilter === "novo") return !viewedOrders.has(getOrderKey(o));
                          if (todosQuickFilter !== "all") return getOperationalBucket(o) === todosQuickFilter;
                          return true;
                        });
                        // Quando filtro é agendamento_confirmado, ordenar por slotDate+slotTime crescente (mais cedo primeiro)
                        // Fallback: usa confirmedAt quando slotDate/slotTime não estão disponíveis
                        if (todosQuickFilter === "agendamento_confirmado") {
                          return [...filtered].sort((a: any, b: any) => {
                            const getKey = (o: any): string => {
                              if (o.scheduleSlotDate && o.scheduleSlotTime) return `${o.scheduleSlotDate}T${o.scheduleSlotTime}`;
                              if (o.scheduleConfirmedAt) return o.scheduleConfirmedAt;
                              return '9999-99-99T99:99';
                            };
                            return getKey(a).localeCompare(getKey(b));
                          });
                        }
                        return sortFolderOrders(filtered, todosSortKey, todosSortDir);
                      })() }]
                    : group.isDelivered
                      ? [{ name: "", orders: sortDeliveredOrders(group.orders, deliveredSortKey, deliveredSortDir) }]
                      : buildOptionGroups(group.orders)
                  ).map((optGroup) => (
                    <div key={optGroup.name || "__all__"}>
                      {/* Cabeçalho da opção (só exibe se há sub-grupos e não é aba Todos) */}
                      {optGroup.name && !isAllTab && (
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <div className="h-px flex-1 bg-border/50" />
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-0.5 rounded bg-muted/40 border border-border/40">
                            {optGroup.name}
                            <span className="ml-1.5 text-[10px] font-normal opacity-70">({optGroup.orders.length})</span>
                          </span>
                          <div className="h-px flex-1 bg-border/50" />
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {/* Agrupar por cartGroupId antes de renderizar */}
                  {(() => {
                    // Construir grupos de carrinho para este optGroup
                    const cgMap = new Map<string, Order[]>();
                    const cgOrder: string[] = [];
                    for (const o of optGroup.orders) {
                      const cgId = o.cartGroupId || `__single__${getOrderKey(o)}`;
                      if (!cgMap.has(cgId)) { cgMap.set(cgId, []); cgOrder.push(cgId); }
                      cgMap.get(cgId)!.push(o);
                    }
                    // Ordenar itens de cada grupo por cartItemIndex
                    cgOrder.forEach(k => {
                      cgMap.get(k)!.sort((a: Order, b: Order) => (a.cartItemIndex ?? 0) - (b.cartItemIndex ?? 0));
                    });
                    return cgOrder.map((cgId) => {
                      const cgItems = cgMap.get(cgId)!;
                      const isCartGroup = !cgId.startsWith('__single__');
                      const order = isCartGroup ? cgItems[0] : cgItems[0]; // primaryOrder = primeiro item
                      const latestStatus = order.latestStatus as string | null;
                      const statusCfg = latestStatus ? ACTIVE_STATUS_CONFIG[latestStatus] : null;
                      const isExpanded = expandedId === getOrderKey(order);
                      const name = order.customerName || order.codeClientName || "Cliente";
                      const tab = getTab(getOrderKey(order));
                      const isSelectedCard = selected.has(getOrderKey(order));
                      const editData = editingCustomer[getOrderKey(order)];

                      // Ocultar cards que não estão em foco quando algum está expandido
                      if (expandedId !== null && !isExpanded) return null;

                      return (
            <div
              key={getOrderKey(order)}
              id={`order-card-${getOrderKey(order)}`}
              className={`bg-card border rounded-xl overflow-hidden transition-all ${
                isExpanded ? "col-span-full" : ""
              } ${(() => {
                const groups = customGroupsQuery.data || [];
                const orderGroup = groups.find((g: any) => g.memberIds.includes(order.id));
                if (order.isUrgent === 1 || filterStatus === 'urgente') return 'border-red-500 ring-1 ring-red-500/40';
                if (orderGroup) {
                  const c = GROUP_COLOR_MAP[orderGroup.color] || GROUP_COLOR_MAP.red;
                  return c.border + ' ring-1 ring-offset-0';
                }
                if (attentionMap.has(order.id)) return 'border-green-400 ring-2 ring-green-400/50 shadow-lg shadow-green-500/20';
                if (isSelectedCard) return 'border-primary/60 ring-1 ring-primary/30';
                return 'border-border';
              })()}`}
            >
              {(order.isUrgent === 1 || filterStatus === 'urgente') && (
                <div className="bg-red-600/20 border-b border-red-500/40 px-4 py-1 flex items-center gap-2">
                  <span className="text-red-400 text-xs font-bold animate-pulse">🚨 URGENTE</span>
                </div>
              )}
              {/* Faixa do grupo */}
              {(() => {
                const groups = customGroupsQuery.data || [];
                const orderGroup = groups.find((g: any) => g.memberIds.includes(order.id));
                if (!orderGroup || order.isUrgent === 1) return null;
                const c = GROUP_COLOR_MAP[orderGroup.color] || GROUP_COLOR_MAP.red;
                return (
                  <div className={`${c.header} border-b px-4 py-1 flex items-center gap-2`}>
                    <span className={`${c.text} text-xs font-bold`}>{orderGroup.icon} {orderGroup.name}</span>
                  </div>
                );
              })()}
              {/* Faixa "Em atendimento" */}
              {attentionMap.has(order.id) && (
                <div className="bg-green-500/20 border-b border-green-400/60 px-4 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-green-300 text-xs font-bold tracking-wide" style={{textShadow:'0 0 8px #4ade80'}}>👤 EM ATENDIMENTO: {attentionMap.get(order.id)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); clearAttentionMut.mutate({ registrationId: order.id }); }}
                    className="text-green-400/70 hover:text-red-400 text-xs transition-colors font-bold"
                    title="Liberar pedido"
                  >✕</button>
                </div>
              )}
              {/* Faixa "Entregue em" — só na aba Entregues */}
              {group.isDelivered && (order.deliveredNotifiedAt || order.latestStatusAt) && (
                <div className="bg-teal-500/15 border-b border-teal-500/30 px-4 py-1.5 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="text-teal-300 text-xs font-bold tracking-wide">
                    {order.deliveredNotifiedAt
                      ? `✉️ Notificado em: ${formatDate(order.deliveredNotifiedAt)}`
                      : `Entregue em: ${formatDate(order.latestStatusAt)}`
                    }
                  </span>
                </div>
              )}
              {/* Cabeçalho do card */}
              <div className="flex items-stretch">
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelect(getOrderKey(order))}
                  className="flex items-center justify-center px-3 hover:bg-muted/10 transition-colors border-r border-border"
                >
                  {isSelectedCard
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4 text-muted-foreground" />
                  }
                </button>

                {/* Conteúdo clicável */}
                <div
                  role="button"
                  tabIndex={0}
                  className="flex-1 text-left p-4 cursor-pointer"
                  onClick={() => {
                    const opening = !isExpanded;
                    setExpandedId(opening ? getOrderKey(order) : null);
                    if (opening) {
                      if (!activeTab[getOrderKey(order)]) setTab(getOrderKey(order), "status");
                      markAsViewed(getOrderKey(order));
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { const opening = !isExpanded; setExpandedId(opening ? getOrderKey(order) : null); if (opening) { if (!activeTab[getOrderKey(order)]) setTab(getOrderKey(order), 'status'); markAsViewed(getOrderKey(order)); } } }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                        <div className="relative">
                          {order.isBlocked && (
                            <span
                              className="absolute -top-1 -right-1 z-10 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-background shadow animate-pulse"
                              title="Telefone na lista negra do sistema"
                            />
                          )}
                          {order.customerProfilePhotoUrl ? (
                            <img
                              src={order.customerProfilePhotoUrl}
                              alt={name}
                              className={`w-10 h-10 rounded-full object-cover border ${order.isBlocked ? 'border-red-500/60' : 'border-border'}`}
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border ${order.isBlocked ? 'border-red-500/60' : 'border-border'}`}>
                              <User className="w-5 h-5 text-primary/60" />
                            </div>
                          )}
                        </div>
                        {/* Etapas Internas abaixo da foto */}
                        {(() => {
                          const stages = stagesListQuery.data ?? [];
                          if (stages.length === 0) return null;
                          const batchEntry = orderStagesMap.get(order.id);
                          const currentStageId = selectedStageId[order.id] ?? batchEntry?.stageId ?? null;
                          return (
                            <div className="flex flex-col gap-1 mt-2 w-[72px]">
                              {stages.map(stage => {
                                const isActive = currentStageId === stage.id;
                                return (
                                  <button
                                    key={stage.id}
                                    onClick={e => {
                                      e.stopPropagation();
                                      setOrderStageMut.mutate({ registrationId: order.id, stageId: stage.id });
                                    }}
                                    disabled={setOrderStageMut.isPending}
                                    title={stage.name}
                                    className={`w-full px-1.5 py-1 rounded-lg border text-center transition-all duration-200 ${
                                      isActive
                                        ? 'shadow-md scale-[1.02]'
                                        : 'bg-[#0d0d1f] border-white/5 hover:border-white/20 hover:bg-white/5'
                                    }`}
                                    style={isActive ? {
                                      backgroundColor: stage.color + '33',
                                      borderColor: stage.color + '99',
                                      boxShadow: `0 0 8px ${stage.color}44`,
                                    } : {}}
                                  >
                                    <span
                                      className="text-[9px] font-semibold leading-tight block truncate"
                                      style={isActive ? { color: stage.color } : { color: '#6b7280' }}
                                    >
                                      {stage.name}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {order.customerNumber && (
                            <span className="flex-shrink-0 text-[11px] font-mono font-bold text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 leading-none" title="Número de cadastro">
                              *{order.customerNumber}
                            </span>
                          )}
                          <p className="font-semibold text-sm">{name}</p>
                        </div>
                        {/* Linha do telefone + botões Copiar Nome e Deletar na mesma largura */}
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <p className="text-xs text-muted-foreground">{formatPhone(order.phone)}</p>
                          {order.phone && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                const digits = order.phone.replace(/\D/g, '');
                                navigator.clipboard.writeText(digits).then(() => toast.success('Telefone copiado!')).catch(() => toast.error('Erro ao copiar'));
                              }}
                              title="Copiar telefone"
                              className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          )}
                          {order.phone && (
                            <a
                              href={`https://wa.me/55${order.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Abrir WhatsApp"
                              className="flex-shrink-0 p-0.5 rounded text-green-500 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </a>
                          )}
                        </div>
                        {/* Botões Copiar Nome e Deletar — coluna, largura da linha do telefone */}
                        <div className="flex flex-col gap-1 mt-1 w-fit" onClick={e => e.stopPropagation()}>
                          <button
                            onPointerDown={e => {
                              e.stopPropagation();
                              const txt = name;
                              const fallback = () => { try { const el = document.createElement('textarea'); el.value = txt; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(el); el.focus(); el.select(); document.execCommand('copy'); document.body.removeChild(el); toast.success('Nome copiado!'); } catch { toast.error('Erro ao copiar'); } };
                              if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(() => toast.success('Nome copiado!')).catch(fallback); } else { fallback(); }
                            }}
                            className="py-1 px-3 rounded text-[11px] font-semibold bg-zinc-700/60 hover:bg-zinc-600/80 active:bg-zinc-500/80 text-zinc-200 border border-zinc-600/40 transition-colors flex items-center gap-1.5 touch-manipulation select-none"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            Copiar Nome
                          </button>
                          {confirmDelete === getOrderKey(order) ? (
                            <div className="flex gap-1">
                              <button
                                onPointerDown={e => { e.stopPropagation(); deleteMutation.mutate({ registrationId: order.id, customerPhone: order.phone, subOrderIndex: order.subOrderIndex ?? 0 }); }}
                                disabled={deleteMutation.isPending}
                                className="py-1 px-3 bg-red-600 text-white rounded text-[11px] font-semibold hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 touch-manipulation select-none"
                              >
                                {deleteMutation.isPending ? '...' : 'Confirmar'}
                              </button>
                              <button
                                onPointerDown={e => { e.stopPropagation(); setConfirmDelete(null); }}
                                className="py-1 px-3 bg-card border border-border text-muted-foreground rounded text-[11px] font-medium hover:bg-muted/20 active:bg-muted/40 transition-colors touch-manipulation select-none"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              onPointerDown={e => { e.stopPropagation(); setConfirmDelete(getOrderKey(order)); }}
                              className="py-1 px-3 rounded text-[11px] font-semibold bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 border border-red-500/20 transition-colors flex items-center gap-1.5 touch-manipulation select-none"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              Deletar
                            </button>
                          )}
                        </div>
                        {order.orderNumber && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-xs font-semibold text-primary/90">
                              Pedido: #{order.orderNumber}
                            </p>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(String(order.orderNumber)).then(() => toast.success(`#${order.orderNumber} copiado!`)).catch(() => toast.error('Erro ao copiar'));
                              }}
                              title={`Copiar #${order.orderNumber}`}
                              className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        )}
                        {order.customerEmail && (
                          <p className="text-xs text-muted-foreground truncate">{order.customerEmail}</p>
                        )}
                        {(order.customerStreet || order.customerAddressNumber || order.customerNeighborhood || order.customerCep || order.customerCity || order.customerUf) && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {(order.customerStreet || order.customerAddressNumber) && <p>{[order.customerStreet, order.customerAddressNumber].filter(Boolean).join(", ")}</p>}
                            {(order.customerNeighborhood || order.customerCity || order.customerUf) && <p>{[order.customerNeighborhood, order.customerCity, order.customerUf].filter(Boolean).join(" · ")}</p>}
                            {order.customerAddressComplement && <p>Complemento: {order.customerAddressComplement}</p>}
                            {order.customerCep && <p>CEP: {order.customerCep}</p>}
                          </div>
                        )}
                        <div className="mt-1">
                          {editingPrice[String(order.id)] !== undefined ? (
                            <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                className="text-sm font-black px-2 py-0.5 rounded-lg border-2 bg-black text-green-400 w-32"
                                style={{ borderColor: '#22c55e' }}
                                value={editingPrice[String(order.id)]}
                                onChange={e => setEditingPrice(prev => ({ ...prev, [String(order.id)]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') updatePriceMutation.mutate({ registrationId: order.id, pricePaid: editingPrice[String(order.id)] });
                                  if (e.key === 'Escape') setEditingPrice(prev => { const n = { ...prev }; delete n[String(order.id)]; return n; });
                                }}
                              />
                              <button onClick={() => updatePriceMutation.mutate({ registrationId: order.id, pricePaid: editingPrice[String(order.id)] })} className="text-xs px-1.5 py-0.5 bg-green-600 text-white rounded">OK</button>
                              <button onClick={() => setEditingPrice(prev => { const n = { ...prev }; delete n[String(order.id)]; return n; })} className="text-xs px-1.5 py-0.5 bg-gray-600 text-white rounded">✕</button>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-base font-black px-3 py-1 rounded-lg border-2 cursor-pointer hover:opacity-80"
                              style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', borderColor: '#22c55e', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)', boxShadow: '0 0 10px rgba(34,197,94,0.5)' }}
                              onClick={e => { e.stopPropagation(); setEditingPrice(prev => ({ ...prev, [String(order.id)]: order.pricePaid || '' })); }}
                              title="Clique para editar o valor"
                            >
                              💰 {order.pricePaid || 'R$ 0,00'} ✏️
                            </span>
                          )}
                        </div>
                        {/* Bloco de carrinho: lista todos os produtos se for grupo de carrinho */}
                        {isCartGroup && cgItems.length > 1 ? (
                          <div className="mt-1 space-y-1">
                            <p className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">🛒 Carrinho ({cgItems.length} itens)</p>
                            {cgItems.map((item, idx) => {
                              const svcOpt = item.serviceOption;
                              const gMatch = svcOpt ? svcOpt.match(/^(.*?)\s*-?\s*(Garantia:.*)$/i) : null;
                              const mainOpt = gMatch ? gMatch[1].replace(/\s*-\s*$/, '').trim() : svcOpt;
                              const gPart = gMatch ? gMatch[2] : null;
                              return (
                                <div key={item.id} className="bg-primary/5 border border-primary/20 rounded-lg px-2 py-1.5">
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-primary/90 font-semibold truncate">
                                        {idx + 1}. {item.serviceName || '(Sem produto)'}{mainOpt ? ` — ${mainOpt}` : ''}
                                      </p>
                                      {gPart && <p className="text-[10px] text-amber-400/70 truncate">🛡️ {gPart}</p>}
                                      {item.orderNumber && (
                                        <p className="text-[10px] text-primary/60">Pedido #{item.orderNumber}</p>
                                      )}
                                    </div>
                                    {item.pricePaid && (
                                      <span className="flex-shrink-0 text-xs font-bold text-green-400">{item.pricePaid}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {/* Rodapé do carrinho: total e desconto */}
                            {(() => {
                              const cartTotalVal = order.cartTotal;
                              const cartDiscount = order.cartCouponDiscount;
                              if (!cartTotalVal) return null;
                              const totalPago = cartDiscount ? cartTotalVal - cartDiscount : cartTotalVal;
                              return (
                                <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-2 py-1.5 space-y-0.5">
                                  {cartDiscount && cartDiscount > 0 && (
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-muted-foreground">Subtotal:</span>
                                      <span className="text-muted-foreground">R$ {cartTotalVal.toFixed(2).replace('.', ',')}</span>
                                    </div>
                                  )}
                                  {cartDiscount && cartDiscount > 0 && (
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-amber-400">
                                        🏷️ Cupom{order.cartCouponCode ? ` (${order.cartCouponCode})` : ''}:
                                      </span>
                                      <span className="text-amber-400 font-bold">-R$ {cartDiscount.toFixed(2).replace('.', ',')}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-green-300">💰 Total Pago:</span>
                                    <span className="text-sm font-black text-green-300">R$ {totalPago.toFixed(2).replace('.', ',')}</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          order.serviceName && (() => {
                          const svcOpt = order.serviceOption;
                          const garantiaMatch = svcOpt ? svcOpt.match(/^(.*?)\s*-?\s*(Garantia:.*)$/i) : null;
                          const mainOpt = garantiaMatch ? garantiaMatch[1].replace(/\s*-\s*$/, '').trim() : svcOpt;
                          const garantiaPart = garantiaMatch ? garantiaMatch[2] : null;
                          return (
                            <div className="mt-0.5">
                              <p className="text-xs text-primary/80 font-medium truncate">
                                📦 {order.serviceName}{mainOpt ? ` — ${mainOpt}` : ''}
                              </p>
                              {garantiaPart && (
                                <p className="text-xs text-amber-400/80 font-medium truncate">
                                  🛡️ {garantiaPart}
                                </p>
                              )}
                            </div>
                          );
                        })()
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {order.customerReferredBy === 'Não informou' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 border border-red-500/50 text-red-400">
                                🚫 Não informou indicador
                              </span>
                            ) : order.customerReferredBy ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/25 border border-amber-400/70 text-amber-300" style={{boxShadow: '0 0 6px rgba(251,191,36,0.3)'}}>
                                👥 Indicado por: {order.customerReferredBy}
                              </span>
                            ) : null}
                            {order.customerReferredByPhone && (
                              order.commissionPaid === 1 ? (
                                <button
                                  onClick={e => { e.stopPropagation(); toggleCommissionPaidMutation.mutate({ registrationId: order.id, paid: false }); }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400 transition-colors"
                                  title="Clique para desfazer"
                                >
                                  ✅ Comissão Paga
                                </button>
                              ) : (
                                <button
                                  onClick={e => { e.stopPropagation(); toggleCommissionPaidMutation.mutate({ registrationId: order.id, paid: true }); }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse hover:bg-green-500/20 hover:border-green-500/50 hover:text-green-400 transition-colors"
                                  title="Clique para marcar como paga"
                                >
                                  💰 PAGAR COMISSÃO
                                </button>
                              )
                            )}
                          </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(order.accessedAt)}</p>
                        {/* Botões de ação abaixo da data/hora */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {/* Botão Automático/Manual */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateOrderSourceMutation.mutate({
                                registrationId: order.id,
                                orderSource: (order.orderSource ?? 'auto') === 'auto' ? 'manual' : 'auto',
                              });
                            }}
                            title={(order.orderSource ?? 'auto') === 'auto' ? 'Pedido Automático — clique para marcar como Manual' : 'Pedido Manual — clique para marcar como Automático'}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                              (order.orderSource ?? 'auto') === 'manual'
                                ? 'bg-orange-500/20 border-orange-500/50 text-orange-400 hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-400'
                                : 'bg-blue-500/10 border-blue-500/30 text-blue-400/70 hover:bg-orange-500/20 hover:border-orange-500/50 hover:text-orange-400'
                            }`}
                          >
                            {(order.orderSource ?? 'auto') === 'manual' ? '✋ Manual' : '🤖 Auto'}
                          </button>
                          {/* Badge Link de Indicação */}
                          {order.refCode && (
                            <span
                              title={`Acesso via link de indicação de: ${order.refOwnerName || 'desconhecido'}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-purple-500/20 border-purple-500/50 text-purple-300 cursor-default"
                            >
                              🔗 Link{order.refOwnerName ? ` • ${order.refOwnerName}` : ''}
                            </span>
                          )}
                          {/* Botão Grupos Customizados */}
                          {(() => {
                            const groups = customGroupsQuery.data || [];
                            if (groups.length === 0) return null;
                            const orderGroups = groups.filter((g: any) => g.memberIds.includes(order.id));
                            const isOpen = groupMenuOrderId === order.id;
                            return (
                              <div className="relative">
                                <button
                                  ref={el => {
                                    if (el && isOpen && groupMenuPos === null) {
                                      const rect = el.getBoundingClientRect();
                                      setGroupMenuPos({ top: rect.top, left: rect.right });
                                    }
                                  }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (isOpen) {
                                      setGroupMenuOrderId(null);
                                      setGroupMenuPos(null);
                                    } else {
                                      const btn = e.currentTarget as HTMLButtonElement;
                                      const rect = btn.getBoundingClientRect();
                                      setGroupMenuPos({ top: rect.top, left: rect.right });
                                      setGroupMenuOrderId(order.id);
                                    }
                                  }}
                                  title="Adicionar/remover de grupo"
                                  className={`p-1 rounded-full transition-colors ${
                                    orderGroups.length > 0 ? 'text-yellow-400 hover:text-yellow-300' : 'text-muted-foreground/40 hover:text-yellow-400'
                                  }`}
                                >
                                  <span className="text-base leading-none">🔖</span>
                                </button>
                                {isOpen && groupMenuPos && createPortal(
                                  <>
                                    <div
                                      className="fixed inset-0"
                                      style={{ zIndex: 9998 }}
                                      onClick={() => { setGroupMenuOrderId(null); setGroupMenuPos(null); }}
                                    />
                                    <div
                                      style={{
                                        position: 'fixed',
                                        top: groupMenuPos.top,
                                        left: groupMenuPos.left + 8,
                                        transform: 'translateY(-100%)',
                                        background: '#18181b',
                                        border: '1px solid #52525b',
                                        borderRadius: '12px',
                                        boxShadow: '0 20px 60px rgba(0,0,0,0.95), 0 4px 16px rgba(0,0,0,0.8)',
                                        zIndex: 9999,
                                        minWidth: '200px',
                                        padding: '4px 0',
                                      }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <p style={{ padding: '6px 12px', fontSize: '10px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #27272a' }}>Grupos</p>
                                      {groups.map((g: any) => {
                                        const isMember = g.memberIds.includes(order.id);
                                        return (
                                          <button
                                            key={g.id}
                                            onClick={() => {
                                              if (isMember) {
                                                // Já está neste grupo → remover
                                                removeMemberMut.mutate({ groupId: g.id, registrationId: order.id });
                                              } else {
                                                // Remover de todos os outros grupos antes de adicionar
                                                const otherGroups = (groups as any[]).filter((og: any) => og.id !== g.id && og.memberIds.includes(order.id));
                                                for (const og of otherGroups) {
                                                  removeMemberMut.mutate({ groupId: og.id, registrationId: order.id });
                                                }
                                                addMemberMut.mutate({ groupId: g.id, registrationId: order.id });
                                              }
                                              setGroupMenuOrderId(null);
                                              setGroupMenuPos(null);
                                            }}
                                            style={{
                                              width: '100%',
                                              textAlign: 'left',
                                              padding: '8px 12px',
                                              fontSize: '12px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              background: 'transparent',
                                              border: 'none',
                                              cursor: 'pointer',
                                              color: isMember ? '#fde047' : '#d4d4d8',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = isMember ? 'rgba(234,179,8,0.1)' : '#27272a')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                          >
                                            <span>{g.icon || '🔖'}</span>
                                            <span style={{ flex: 1 }}>{g.name}</span>
                                            {isMember && <span style={{ fontSize: '10px', color: '#facc15' }}>✓ adicionado</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </>,
                                  document.body
                                )}
                              </div>
                            );
                          })()}
                          {/* Botão urgente */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleUrgentMutation.mutate({ registrationId: order.id, urgent: order.isUrgent !== 1 });
                            }}
                            title={order.isUrgent === 1 ? 'Remover urgência' : 'Marcar como urgente'}
                            className={`p-1 rounded-full transition-colors ${
                              order.isUrgent === 1
                                ? 'text-red-400 hover:text-red-300'
                                : 'text-muted-foreground/40 hover:text-red-400'
                            }`}
                          >
                            <span className="text-base leading-none">🚨</span>
                          </button>
                          {/* Botão Em atendimento */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAttention(order.id); }}
                            title={attentionMap.has(order.id) ? `Em atendimento: ${attentionMap.get(order.id)} — clique para liberar` : 'Marcar como em atendimento'}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                              attentionMap.has(order.id)
                                ? 'bg-red-600/40 border-red-500 text-red-300 shadow-md shadow-red-500/40 animate-pulse'
                                : 'bg-green-500/15 border-green-500/60 text-green-400 hover:bg-green-500/30 hover:border-green-400 hover:text-green-300'
                            }`}
                          >
                            👤 {attentionMap.has(order.id) ? attentionMap.get(order.id) : 'Atender'}
                          </button>
                          <OrderH2AdsBrowserShortcut registrationId={order.id} subOrderIndex={order.subOrderIndex ?? 0} customerNumber={order.customerNumber} serviceName={order.serviceName} serviceOption={order.serviceOption} />
                          {/* Selo NOVO */}
                          {!viewedOrders.has(getOrderKey(order)) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse shadow-sm shadow-red-500/50">
                              NOVO
                            </span>
                          )}
                          {/* Selo DOC */}
                          {order.hasNewDocResponse && (
                            <button
                              onClick={e => { e.stopPropagation(); setTab(getOrderKey(order), 'documentos'); setExpandedId(getOrderKey(order)); }}
                              title="Cliente respondeu solicitação de documento — clique para ver"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black animate-pulse shadow-sm shadow-amber-500/50 hover:bg-amber-400 transition-colors"
                            >
                              📄 DOC
                            </button>
                          )}
                          {/* Selo RESPOSTA */}
                          {order.hasNewTrackingAnswer && (
                            <button
                              onClick={e => { e.stopPropagation(); setTab(getOrderKey(order), 'status'); setExpandedId(getOrderKey(order)); }}
                              title="Cliente respondeu pergunta de acompanhamento — clique para ver"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500 text-white animate-pulse shadow-sm shadow-violet-500/50 hover:bg-violet-400 transition-colors"
                            >
                              💬 RESP
                            </button>
                          )}
                        </div>

                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      {order.folderName && (
                        <span className="flex items-center justify-center gap-1 w-full px-2 py-0.5 rounded-2xl text-[10px] font-semibold border bg-amber-500/15 border-amber-500/40 text-amber-300 text-center leading-tight break-words" title={`Pasta: ${order.folderName}`}>
                          {order.folderIcon || '📁'} {order.folderName}
                        </span>
                      )}
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status do pedido (rodapé, largura total) */}
              <div className="px-3 pt-2 border-t border-border">
                {statusCfg ? (
                  <div className={`w-full rounded-2xl border-2 px-5 py-4 ${statusCfg.bg} ${statusCfg.color}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]">{statusCfg.icon}</span>
                      <span className="text-xs font-extrabold tracking-[0.12em] uppercase">
                        Status do Pedido
                      </span>
                    </div>
                    <p className="text-xl font-extrabold leading-tight">
                      {statusCfg.label}
                    </p>
                    <p className="text-sm opacity-70 leading-tight mt-1">
                      Situação atual do atendimento
                    </p>
                  </div>
                ) : (
                  <div className="w-full rounded-2xl border-2 border-zinc-500/40 bg-zinc-500/[0.08] px-5 py-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Clock className="w-[18px] h-[18px] text-zinc-400 shrink-0" />
                      <span className="text-xs font-extrabold tracking-[0.12em] text-zinc-400 uppercase">
                        Status do Pedido
                      </span>
                    </div>
                    <p className="text-xl font-extrabold leading-tight text-zinc-300">
                      Sem status
                    </p>
                    <p className="text-sm text-zinc-400/70 leading-tight mt-1">
                      Nenhum status definido ainda
                    </p>
                  </div>
                )}
              </div>

              {/* Destaque do status de agendamento do cliente (rodapé, largura total) */}
              <div className="px-3 pt-2 pb-2">
                <ScheduleStatusBadge registrationId={order.id} subOrderIndex={order.subOrderIndex ?? 0} customerPhone={order.phone} orderStatus={order.latestStatus} />
              </div>

              {/* Aviso de pedido novo piscando no rodé do card */}
              {!viewedOrders.has(getOrderKey(order)) && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-green-600/20 border-t border-green-500/40 animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">🔔</span>
                    <span className="text-xs font-bold text-green-400">Pedido novo! Confirmar recebimento</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); markAsViewed(getOrderKey(order)); }}
                    className="flex-shrink-0 bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full transition-colors"
                  >
                    ✓ Confirmar
                  </button>
                </div>
              )}

              {/* Painel expandido */}
              {isExpanded && (
                <div className="border-t border-border bg-background/50">
                  {/* Abas */}
                  <div className="flex border-b border-border">
                    {(["status", "cliente", "historico", "documentos", "anotacoes"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTab(getOrderKey(order), t)}
                        className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                          tab === t
                            ? "text-primary border-b-2 border-primary bg-primary/5"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t === "status" ? "📋 Status" : t === "cliente" ? "👤 Cliente" : t === "historico" ? "🕐 Histórico" : t === "documentos" ? "📁 Docs" : "📝 Notas"}
                      </button>
                    ))}
                  </div>

                  {/* === ABA STATUS === */}
                  {tab === "status" && (
                    <div className="p-4 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Atualizar status do pedido</p>
                      <div className="grid grid-cols-2 gap-2">
                        {ACTIVE_STATUS_ORDER.filter(isManualSelectableStatus).map(s => {
                          const cfg = ACTIVE_STATUS_CONFIG[s];
                          if (!cfg) return null;
                          const isSel = (selectedStatus[getOrderKey(order)] || latestStatus) === s;
                          // Buscar data/hora em que este status foi aplicado
                          const statusEntry = historyQuery.data?.find(h => h.status === s);
                          const appliedAt = statusEntry?.createdAt
                            ? new Date(statusEntry.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : null;
                          return (
                            <button
                              key={s}
                              onClick={() => setSelectedStatus(prev => ({ ...prev, [getOrderKey(order)]: s }))}
                              className={`flex flex-col items-start gap-0.5 p-2 rounded-lg border text-xs font-medium transition-all ${
                                isSel
                                  ? `${cfg.bg} ${cfg.color} border-current`
                                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
                              }`}
                            >
                              <span className="flex items-center gap-1.5">{cfg.icon}{cfg.label}</span>
                              {appliedAt && (
                                <span className={`text-[10px] font-normal ${
                                  isSel ? 'opacity-70' : 'text-green-400/70'
                                }`}>✓ {appliedAt}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* === CONTROLE DE PROGRESSO DO CLIENTE === */}
                      <textarea
                        value={note[getOrderKey(order)] || ""}
                        onChange={e => setNote(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                        placeholder="Observação para o cliente (opcional)..."
                        rows={2}
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />

                      <button
                        onClick={() => handleUpdateStatus(order)}
                        disabled={updateMutation.isPending}
                        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {updateMutation.isPending ? "Enviando..." : "Salvar e Notificar Cliente"}
                      </button>

                      <button
                        onClick={() => handleUpdateStatusSilent(order)}
                        disabled={updateMutation.isPending}
                        className="w-full py-2 px-4 bg-zinc-700/60 border border-zinc-600/50 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                        {updateMutation.isPending ? "Salvando..." : "Salvar Sem Notificar Cliente"}
                      </button>

                      {order.customerEmail && order.latestStatus && (
                        <button
                          onClick={() => resendEmailMutation.mutate({
                            customerEmail: order.customerEmail!,
                            customerName: order.customerName || order.codeClientName || undefined,
                            customerPhone: order.phone || undefined,
                            status: order.latestStatus!,
                            note: note[getOrderKey(order)] || undefined,
                            serviceName: order.serviceName || undefined,
                            serviceOption: order.serviceOption || undefined,
                            customerNumber: order.customerNumber || undefined,
                            orderNumber: order.orderNumber || undefined,
                            customerCity: order.customerCity || undefined,
                            customerUf: order.customerUf || undefined,
                            deliveryEstimate: order.deliveryEstimate || undefined,
                          })}
                          disabled={resendEmailMutation.isPending}
                          className="w-full py-2 px-4 bg-blue-600/20 border border-blue-500/40 text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          {resendEmailMutation.isPending ? "Reenviando..." : "Reenviar Email do Status Atual"}
                        </button>
                      )}
                      {!order.customerEmail && (
                        <p className="text-xs text-yellow-400/80 text-center">⚠️ Cliente sem email — status será salvo mas sem notificação</p>
                      )}
                      {/* Badge de leitura de e-mail */}
                      {order.customerEmail && (
                        <EmailTrackingBadge
                          registrationId={order.id}
                          subOrderIndex={order.subOrderIndex ?? 0}
                        />
                      )}
                      {/* Botão WhatsApp */}
                      {order.phone && (() => {
                        const currentStatus = selectedStatus[getOrderKey(order)] || order.latestStatus || "recebido";
                        const statusCfgWa = ACTIVE_STATUS_CONFIG[currentStatus];
                        const statusLabel = statusCfgWa?.label || currentStatus;
                        const statusDescription = statusCfgWa?.description || '';
                        const clientName = order.customerName || order.codeClientName || "Cliente";
                        const numCadastro = order.customerNumber ? `*${order.customerNumber}` : '';
                        const numPedido = order.orderNumber ? `#${order.orderNumber}` : '';
                        const servico = order.serviceName && order.serviceName !== 'NULL' ? order.serviceName : '';
                        const opcao = order.serviceOption && order.serviceOption !== 'NULL' ? order.serviceOption : '';
                        const cidade = order.customerCity || '';
                        const uf = order.customerUf || '';
                        const localidade = cidade && uf ? `${cidade} — ${uf}` : cidade || uf || '';
                        const previsao = order.deliveryEstimate ? new Date(order.deliveryEstimate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                        const pinForWa = customerPinQuery.data?.pin || adminPinEdit[getOrderKey(order)] || '';
                        const observacao = note[getOrderKey(order)] || '';
                        const cleanDesc = statusDescription
                          ? statusDescription.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\*\*(.*?)\*\*/g, '*$1*').trim()
                          : '';
                        const now = new Date();
                        const dia = String(now.getDate()).padStart(2, '0');
                        const mes = String(now.getMonth() + 1).padStart(2, '0');
                        const ano = String(now.getFullYear());
                        const servicoCompleto = servico ? `${servico}${opcao ? ` — ${opcao}` : ''}` : '';

                        // Usar template editável se disponível, senão usar mensagem padrão
                        let msg: string;
                        if (waOrderTemplate) {
                          msg = repairWhatsappReplacementIcons(normalizeWhatsAppTrackingLinks(waOrderTemplate
                            .replace(/\{nome\}/gi, clientName)
                            .replace(/\{status\}/gi, statusLabel)
                            .replace(/\{descricao_status\}/gi, cleanDesc)
                            .replace(/\{cadastro\}/gi, numCadastro)
                            .replace(/\{pedido\}/gi, numPedido)
                            .replace(/\{servico\}/gi, servicoCompleto)
                            .replace(/\{cidade\}/gi, localidade)
                            .replace(/\{senha\}/gi, pinForWa)
                            .replace(/\{previsao\}/gi, previsao)
                            .replace(/\{observacao\}/gi, observacao)
                            .replace(/\{DIA\}/g, dia)
                            .replace(/\{MES\}/g, mes)
                            .replace(/\{ANO\}/g, ano)));
                        } else {
                          // Mensagem padrão (fallback)
                          const linhas: string[] = [];
                          linhas.push(`*Walk Ajuda* — Atualização de Pedido`);
                          linhas.push(``);
                          linhas.push(`Olá, *${clientName}*! 👋`);
                          linhas.push(``);
                          linhas.push(`*Status:* ✅ ${statusLabel}`);
                          linhas.push(``);
                          if (cleanDesc) { linhas.push(cleanDesc); linhas.push(``); }
                          if (numCadastro || numPedido || servicoCompleto || localidade || previsao) {
                            linhas.push(`*Detalhes do pedido:*`);
                            if (numCadastro) linhas.push(`• Cadastro: *${numCadastro}*`);
                            if (numPedido) linhas.push(`• Pedido: *${numPedido}*`);
                            if (servicoCompleto) linhas.push(`• Serviço: ${servicoCompleto}`);
                            if (localidade) linhas.push(`• Cidade: ${localidade}`);
                            if (previsao) linhas.push(`• Previsão de Entrega: *${previsao}*`);
                            linhas.push(``);
                          }
                          if (observacao) { linhas.push(`*Observação:* _${observacao}_`); linhas.push(``); }
                          linhas.push(`Acompanhe seu pedido em:`);
                          linhas.push(publicTrackingShareUrl());
                          if (pinForWa) {
                            linhas.push(``);
                            linhas.push(`🔐 *Senha de acesso:* ${pinForWa}`);
                            linhas.push(`⚠️ _Não compartilhe esta senha com ningém para evitar bloqueios de acesso._`);
                          }
                          msg = linhas.join('\n');
                        }

                        const phone = order.phone.replace(/\D/g, "");
                        const waPhone = phone.startsWith("55") ? phone : `55${phone}`;
                        return (
                          <button
                            onClick={() => {
                              // Encontrar template padrão para o status atual
                              const defaultTemplate = selectWhatsappTemplateForStatus(waTemplates as any[], currentStatus);
                              setWaModalOrder({ ...order, latestStatus: currentStatus, waPhone, defaultMsg: msg });
                              if (defaultTemplate) {
                                const baseMsg2 = normalizePublicSiteLinks(defaultTemplate.message
                                  .replace(/\{nome\}/gi, order.customerName || order.codeClientName || '')
                                  .replace(/\{status\}/gi, statusLabel)
                                  .replace(/\{pedido\}/gi, String(order.orderNumber || order.id))
                                  .replace(/\{telefone\}/gi, order.phone || '')
                                  .replace(/\{servico\}/gi, order.serviceName && order.serviceName !== 'NULL' ? `${order.serviceName}${order.serviceOption && order.serviceOption !== 'NULL' ? ` — ${order.serviceOption}` : ''}` : '')
                                  .replace(/\{cidade\}/gi, order.customerCity ? `${order.customerCity}${order.customerUf ? ` — ${order.customerUf}` : ''}` : '')
                                  .replace(/\{previsao\}/gi, order.deliveryEstimate ? new Date(order.deliveryEstimate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''));
                                const mediaLines2: string[] = [];
                                if ((defaultTemplate as any).imageUrl) mediaLines2.push(normalizePublicSiteLinks((defaultTemplate as any).imageUrl));
                                if ((defaultTemplate as any).videoUrl) mediaLines2.push(normalizePublicSiteLinks((defaultTemplate as any).videoUrl));
                                if ((defaultTemplate as any).mediaFileUrl) mediaLines2.push(normalizePublicSiteLinks((defaultTemplate as any).mediaFileUrl));
                                setWaModalMsg(repairWhatsappReplacementIcons(mediaLines2.length > 0 ? baseMsg2 + '\n\n' + mediaLines2.join('\n') : baseMsg2));
                              } else {
                                setWaModalMsg(msg);
                              }
                              setWaModalSelectedId(defaultTemplate?.id ?? null);
                            }}
                            className="w-full py-2 px-4 bg-green-600/20 border border-green-500/40 text-green-300 rounded-lg text-sm font-medium hover:bg-green-600/30 transition-colors flex items-center justify-center gap-2"
                          >
                            <MessageCircle className="w-4 h-4" />
                            Notificar via WhatsApp
                          </button>
                        );
                      })()}

                      {/* Observação editável quando status é Entregue */}
                      {/* === DADOS DE LOGIN — visível para o admin em QUALQUER status === */}
                      {(() => {
                        const key = getOrderKey(order);
                        const saved = loginDataQuery.data;
                        // Usar loginFields[key] se existir (editado pelo admin ou inicializado pelo useEffect)
                        // Fallback vazio — o useEffect popula os campos quando os dados chegam do banco
                        const fields = loginFields[key] ?? { loginPhone: '', loginEmail: '', loginPassword: '', authCode: '', emailLink: '', loginNotes: '', loginGroupLink: '' };
                        const setField = (f: 'loginPhone'|'loginEmail'|'loginPassword'|'authCode'|'emailLink'|'loginNotes'|'loginGroupLink', v: string) =>
                          setLoginFields(prev => ({ ...prev, [key]: { ...(prev[key] ?? { loginPhone: '', loginEmail: '', loginPassword: '', authCode: '', emailLink: '', loginNotes: '', loginGroupLink: '' }), [f]: v } }));
                        // Montar mensagem WhatsApp com dados de login
                        const buildLoginWaMsg = () => {
                          const nome = order.customerName || order.codeClientName || '';
                          const pinLogin = customerPinQuery.data?.pin || adminPinEdit[key] || '';
                          const telefone = order.phone || '';
                          const now = new Date();
                          const DIA = String(now.getDate()).padStart(2, '0');
                          const MES = String(now.getMonth() + 1).padStart(2, '0');
                          const ANO = String(now.getFullYear());
                          // Usar template do banco se disponível
                          if (waLoginTemplate) {
                            return repairWhatsappReplacementIcons(normalizeWhatsAppTrackingLinks(waLoginTemplate
                              .replace(/\{nome\}/g, nome)
                              .replace(/\{senha\}/g, pinLogin)
                              .replace(/\{telefone\}/g, telefone)
                              .replace(/\{DIA\}/g, DIA)
                              .replace(/\{MES\}/g, MES)
                              .replace(/\{ANO\}/g, ANO)));
                          }
                          // Fallback: mensagem padrão hardcoded
                          const linhas: string[] = [];
                          linhas.push(`🔐 Seus dados de acesso estão prontos!`);
                          linhas.push(``);
                          linhas.push(`Olá${nome ? `, ${nome}` : ''}!`);
                          linhas.push(``);
                          linhas.push(`Seu pedido já foi liberado.`);
                          linhas.push(``);
                          linhas.push(`⚠️ IMPORTANTE: Os dados de acesso não são enviados por mensagem. Eles devem ser resgatados exclusivamente através do site abaixo:`);
                          linhas.push(``);
                          linhas.push(`🌐 ${publicTrackingShareUrl()}`);
                          if (pinLogin) {
                            linhas.push(``);
                            linhas.push(`🔐 *Senha de acesso:* ${pinLogin}`);
                            linhas.push(`⚠️ _Não compartilhe esta senha com ninguém para evitar bloqueios de acesso._`);
                          }
                          linhas.push(``);
                          linhas.push(`Para resgatar seus dados:`);
                          linhas.push(``);
                          linhas.push(`✅ Acesse o site`);
                          linhas.push(`✅ Informe seu telefone e a senha de 4 dígitos`);
                          linhas.push(`✅ Os dados de acesso serão exibidos na página do seu pedido`);
                          linhas.push(``);
                          linhas.push(`❌ Não tente acessar diretamente pelo aplicativo`);
                          linhas.push(`❌ Os dados não são fornecidos por WhatsApp`);
                          linhas.push(``);
                          linhas.push(`🔒 Por segurança, o resgate dos dados é realizado somente pela área do cliente.`);
                          linhas.push(``);
                          linhas.push(`Equipe Walk Ajuda`);
                          return linhas.join('\n');
                        };
                        const waPhone = order.phone ? (order.phone.replace(/\D/g, '').startsWith('55') ? order.phone.replace(/\D/g, '') : `55${order.phone.replace(/\D/g, '')}`) : '';
                        const hasLoginData = fields.loginEmail || fields.loginPassword || fields.authCode || fields.emailLink || fields.loginNotes || fields.loginGroupLink;
                        return (
                          <div className="space-y-3">
                            {/* Seção: Senha de Acompanhamento de Pedido */}
                            {(() => {
                              const pinKey = getOrderKey(order);
                              const currentPin = adminPinEdit[pinKey] !== undefined ? adminPinEdit[pinKey] : (customerPinQuery.data?.pin ?? '');
                              return (
                                <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3 space-y-2">
                                  <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                    Senha de Acompanhamento do Pedido
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={4}
                                      value={currentPin}
                                      onChange={e => {
                                        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                                        setAdminPinEdit(prev => ({ ...prev, [pinKey]: v }));
                                      }}
                                      placeholder="_ _ _ _"
                                      className="w-24 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 font-mono font-bold tracking-widest text-center text-base focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    />
                                    <button
                                      onClick={() => {
                                        if (currentPin.length === 4) {
                                          setAdminPinMut.mutate({ phone: order.phone, pin: currentPin });
                                        } else {
                                          toast.error('A senha deve ter exatamente 4 dígitos');
                                        }
                                      }}
                                      disabled={setAdminPinMut.isPending}
                                      className="px-2.5 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                                    >
                                      Salvar
                                    </button>
                                    <button
                                      onClick={() => {
                                        const newPin = Math.floor(1000 + Math.random() * 9000).toString();
                                        setAdminPinEdit(prev => ({ ...prev, [pinKey]: newPin }));
                                        setAdminPinMut.mutate({ phone: order.phone, pin: newPin });
                                      }}
                                      disabled={setAdminPinMut.isPending}
                                      className="px-2.5 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-semibold hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                                    >
                                      Gerar
                                    </button>
                                    <button
                                      onClick={() => { navigator.clipboard.writeText(currentPin); toast.success('Senha copiada!'); }}
                                      className="p-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors"
                                      title="Copiar senha"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    </button>
                                  </div>
                                  <p className="text-xs text-blue-400/60">Enviada ao cliente em todos os emails de status</p>
                                </div>
                              );
                            })()}
                            {/* Seção: Respostas do Formulário de Acompanhamento */}
                            {trackingAnswersQuery.data && trackingAnswersQuery.data.length > 0 && (
                              <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Respostas do Formulário de Acompanhamento
                                </p>
                                {trackingAnswersQuery.data.map((ans: any) => (
                                  <div key={ans.id} className="bg-black/20 border border-white/5 rounded-lg px-3 py-2">
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{ans.questionText}</p>
                                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                      {ans.answer}
                                    </span>
                                    <p className="text-[10px] text-white/30 mt-1">{new Date(ans.answeredAt).toLocaleString('pt-BR')}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Seção: Enviar Pergunta Individual para este Pedido */}
                            {(() => {
                              const activeQs = (tqListQuery.data || []).filter((q: any) => q.isActive === 1);
                              const assignments = assignmentsQuery.data || [];
                              const assignedIds = new Set(assignments.map((a: any) => a.questionId));
                              return (
                                <div className="bg-violet-500/5 border border-violet-500/30 rounded-lg p-3 space-y-3">
                                  <p className="text-xs font-semibold text-violet-400 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Perguntas Enviadas para este Pedido
                                  </p>

                                  {/* Perguntas já enviadas */}
                                  {assignments.length > 0 && (
                                    <div className="space-y-1.5">
                                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Já enviadas</p>
                                      {assignments.map((a: any) => (
                                        <div key={a.id} className="flex items-start gap-2 bg-black/20 border border-white/5 rounded-lg px-2.5 py-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white/70 truncate">{a.questionText}</p>
                                            {/* Data/hora de envio pelo admin */}
                                            {a.sentAt && (
                                              <p className="text-[10px] text-white/25 mt-0.5">
                                                Enviada em {new Date(a.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                              </p>
                                            )}
                                            {a.answer ? (
                                              <div className="mt-1 space-y-0.5">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-300 border border-green-500/30">{a.answer}</span>
                                                </div>
                                                {a.answeredAt && (
                                                  <p className="text-[10px] text-green-400/50">
                                                    Respondida em {new Date(a.answeredAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                  </p>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-[10px] text-amber-400/70 mt-0.5 block">Aguardando resposta...</span>
                                            )}
                                          </div>
                                          <button
                                            onClick={() => deleteAssignmentMut.mutate({ id: a.id })}
                                            disabled={deleteAssignmentMut.isPending}
                                            className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                                            title="Remover pergunta deste pedido"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Perguntas disponíveis para enviar */}
                                  {/* Lista de todas as perguntas (ativas e inativas) com ações */}
                                  {(tqListQuery.data || []).length > 0 && (
                                    <div className="space-y-1.5">
                                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Enviar pergunta</p>
                                      {(tqListQuery.data || []).map((q: any) => {
                                        const isEditingThis = editingTQIdAdm === q.id;
                                        const opts: Array<{label:string;color:string}> = (() => { try { return JSON.parse(q.options); } catch { return []; } })();
                                        if (isEditingThis) {
                                          return (
                                            <div key={q.id} className="bg-black/30 border border-purple-500/30 rounded-lg p-2.5 space-y-2">
                                              <input
                                                value={editTQTextAdm}
                                                onChange={e => setEditTQTextAdm(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                                              />
                                              <div className="space-y-1">
                                                {editTQOptionsAdm.map((opt, i) => (
                                                  <div key={i} className="flex items-center gap-1.5">
                                                    <input
                                                      value={opt.label}
                                                      onChange={e => setEditTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, label: e.target.value } : o))}
                                                      className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                                                    />
                                                    <div className="flex gap-0.5">
                                                      {TQ_COLORS_ADM.map(c => (
                                                        <button key={c} onClick={() => setEditTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, color: c } : o))} className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${opt.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                                                      ))}
                                                    </div>
                                                    <button onClick={() => setEditTQOptionsAdm(prev => prev.filter((_, j) => j !== i))} className="text-red-400 p-0.5"><X className="w-3 h-3" /></button>
                                                  </div>
                                                ))}
                                                <button onClick={() => setEditTQOptionsAdm(prev => [...prev, { label: '', color: '#6b7280' }])} className="text-[10px] text-purple-400 hover:text-purple-300">+ Opção</button>
                                              </div>
                                              <div className="flex gap-1.5 justify-end">
                                                <button onClick={() => setEditingTQIdAdm(null)} className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px]">Cancelar</button>
                                                <button
                                                  onClick={() => updateTQMutAdm.mutate({ id: q.id, text: editTQTextAdm, options: editTQOptionsAdm.filter(o => o.label.trim()), showOnce: editTQShowOnceAdm })}
                                                  disabled={updateTQMutAdm.isPending}
                                                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-semibold disabled:opacity-50"
                                                >
                                                  {updateTQMutAdm.isPending ? 'Salvando...' : 'Salvar'}
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        }
                                        return (
                                          <div key={q.id} className={`flex items-center gap-2 border rounded-lg px-2.5 py-1.5 ${q.isActive ? 'bg-black/10 border-white/5' : 'bg-black/5 border-white/5 opacity-50'}`}>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs text-white/70 truncate">{q.text}</p>
                                              <div className="flex flex-wrap gap-1 mt-0.5">
                                                {opts.slice(0,3).map((o, i) => (
                                                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: o.color + '33', color: o.color, border: `1px solid ${o.color}55` }}>{o.label}</span>
                                                ))}
                                                {!q.isActive && <span className="text-[9px] text-gray-500">(inativa)</span>}
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              <button
                                                onClick={() => { setEditingTQIdAdm(q.id); setEditTQTextAdm(q.text); try { setEditTQOptionsAdm(JSON.parse(q.options)); } catch { setEditTQOptionsAdm([]); } setEditTQShowOnceAdm(q.showOnce === 1); }}
                                                className="p-1 text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                title="Editar"
                                              >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                              </button>
                                              <button
                                                onClick={() => { if (confirm('Deletar esta pergunta permanentemente?')) deleteTQMutAdm.mutate({ id: q.id }); }}
                                                className="p-1 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title="Deletar"
                                              >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                              </button>
                                              {assignedIds.has(q.id) ? (
                                                <span className="text-[10px] text-violet-400/60 px-1">Enviada</span>
                                              ) : q.isActive ? (
                                                <button
                                                  onClick={() => assignToOrderMut.mutate({
                                                    orderId: expandedNumericId,
                                                    questionId: q.id,
                                                    questionText: q.text,
                                                    questionOptions: q.options || '[]',
                                                  })}
                                                  disabled={assignToOrderMut.isPending}
                                                  className="px-2.5 py-1 bg-violet-500/20 border border-violet-500/30 text-violet-300 rounded text-[10px] font-semibold hover:bg-violet-500/30 transition-colors disabled:opacity-50"
                                                >
                                                  Enviar
                                                </button>
                                              ) : null}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Criar nova pergunta inline */}
                                  {(() => {
                                    const inlineKey = `inline_new_tq_${expandedNumericId}`;
                                    const showForm = showNewTQAdm;
                                    return (
                                      <div className="space-y-2">
                                        {!showForm && (
                                          <button
                                            onClick={() => setShowNewTQAdm(true)}
                                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg text-xs font-semibold hover:bg-purple-500/20 transition-colors"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                            Nova Pergunta
                                          </button>
                                        )}
                                        {showForm && (
                                          <div className="bg-black/30 border border-purple-500/30 rounded-lg p-3 space-y-3">
                                            <p className="text-xs font-bold text-purple-400">Nova Pergunta</p>
                                            <input
                                              value={newTQTextAdm}
                                              onChange={e => setNewTQTextAdm(e.target.value)}
                                              placeholder="Ex: Você tem CNH válida?"
                                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                            />
                                            <div>
                                              <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[10px] text-white/40 uppercase tracking-wider">Opções de Resposta</span>
                                                <button onClick={() => setNewTQOptionsAdm(prev => [...prev, { label: '', color: '#6b7280' }])} className="text-[10px] text-purple-400 hover:text-purple-300">+ Adicionar</button>
                                              </div>
                                              <div className="space-y-1.5">
                                                {newTQOptionsAdm.map((opt, i) => (
                                                  <div key={i} className="flex items-center gap-1.5">
                                                    <input
                                                      value={opt.label}
                                                      onChange={e => setNewTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, label: e.target.value } : o))}
                                                      placeholder={`Opção ${i + 1}`}
                                                      className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                                    />
                                                    <div className="flex gap-0.5">
                                                      {TQ_COLORS_ADM.map(c => (
                                                        <button key={c} onClick={() => setNewTQOptionsAdm(prev => prev.map((o, j) => j === i ? { ...o, color: c } : o))} className={`w-4 h-4 rounded-full border-2 transition-all ${opt.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                                                      ))}
                                                    </div>
                                                    <button onClick={() => setNewTQOptionsAdm(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 p-0.5"><X className="w-3 h-3" /></button>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                              <button onClick={() => { setShowNewTQAdm(false); resetNewTQAdm(); }} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs">Cancelar</button>
                                              <button
                                                onClick={() => createTQMutAdm.mutate({ text: newTQTextAdm, options: newTQOptionsAdm.filter(o => o.label.trim()), showOnce: false })}
                                                disabled={!newTQTextAdm.trim() || newTQOptionsAdm.filter(o => o.label.trim()).length < 1 || createTQMutAdm.isPending}
                                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                                              >
                                                {createTQMutAdm.isPending ? 'Salvando...' : 'Criar Pergunta'}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })()}

                            {/* Seção: Dados de Login do Serviço */}
                            <div className="bg-lime-500/5 border border-lime-500/30 rounded-lg p-3 space-y-3">
                            <p className="text-xs font-semibold text-lime-400 flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                              Dados de Login para o Cliente
                            </p>
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">📱 Login 1 — Telefone <span className="text-lime-400/70">(cliente pode usar este para entrar)</span></label>
                                <div className="flex gap-1">
                                  <input type="text" value={fields.loginPhone} onChange={e => setField('loginPhone', e.target.value)}
                                    placeholder="Ex: (21) 99999-9999"
                                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />
                                  {fields.loginPhone && <button onClick={() => setField('loginPhone', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors" title="Limpar">✕</button>}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">✉️ Login 2 — Email <span className="text-lime-400/70">(cliente pode usar este para entrar)</span></label>
                                <div className="flex gap-1">
                                  <input type="text" value={fields.loginEmail} onChange={e => setField('loginEmail', e.target.value)}
                                    placeholder="Ex: usuario@email.com ou (11) 99999-9999"
                                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />
                                  {fields.loginEmail && <button onClick={() => setField('loginEmail', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors" title="Limpar">✕</button>}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Senha para entrar na sua conta</label>
                                <div className="flex gap-1">
                                  <input type="text" value={fields.loginPassword} onChange={e => setField('loginPassword', e.target.value)}
                                    placeholder="Ex: senha123"
                                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />
                                  {fields.loginPassword && <button onClick={() => setField('loginPassword', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors" title="Limpar">✕</button>}
                                </div>
                              </div>
                              <OrderLoginAuthenticatorCode registrationId={order.id} />
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Código Autenticador</label>
                                <div className="flex gap-1">
                                  <input type="text" value={fields.authCode} onChange={e => setField('authCode', e.target.value.replace(/-/g, ''))}
                                    placeholder="Ex: GJ6W76PV4B23GNTUEP7ZRJKI46HTZ6DE"
                                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />
                                  {fields.authCode && <button onClick={() => setField('authCode', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors" title="Limpar">✕</button>}
                                </div>
                              </div>
                              <AuthenticatorQrAdminField
                                registrationId={order.id}
                                hasExistingQr={Boolean((saved as any)?.hasAuthenticatorQr)}
                                pendingValue={loginAuthenticatorQr[key]}
                                onPendingValueChange={value => setLoginAuthenticatorQr(prev => ({ ...prev, [key]: value }))}
                                disabled={saveLoginDataMut.isPending}
                              />
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">🔗 Link de Acesso ao E-mail</label>
                                <div className="flex gap-1">
                                  <input type="text" value={fields.emailLink} onChange={e => setField('emailLink', e.target.value)}
                                    placeholder="Ex: https://mail.google.com/..."
                                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />
                                  {fields.emailLink && <button onClick={() => setField('emailLink', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors" title="Limpar">✕</button>}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">👥 Link do Grupo (WhatsApp, Telegram, etc.)</label>
                                <div className="flex gap-1">
                                  <input type="text" value={fields.loginGroupLink} onChange={e => setField('loginGroupLink', e.target.value)}
                                    placeholder="Ex: https://chat.whatsapp.com/..."
                                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60" />
                                  {fields.loginGroupLink && <button onClick={() => setField('loginGroupLink', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors" title="Limpar">✕</button>}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">📝 Texto / Instruções para o Cliente</label>
                                <div className="flex gap-1 items-start">
                                  <textarea value={fields.loginNotes} onChange={e => setField('loginNotes', e.target.value)}
                                    placeholder="Ex: Acesse o app, vá em configurações e ative a conta..."
                                    rows={3}
                                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime-500/60 resize-none" />
                                  {fields.loginNotes && <button onClick={() => setField('loginNotes', '')} className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors" title="Limpar">✕</button>}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { const pendingQr = loginAuthenticatorQr[key]; saveLoginDataMut.mutate({ registrationId: order.id, customerPhone: order.phone, loginPhone: fields.loginPhone, loginEmail: fields.loginEmail, loginPassword: fields.loginPassword, authCode: fields.authCode, emailLink: fields.emailLink, loginNotes: fields.loginNotes, loginGroupLink: fields.loginGroupLink, authenticatorQrData: pendingQr && typeof pendingQr === 'object' ? pendingQr.data : undefined, authenticatorQrAction: pendingQr === null ? 'delete' : pendingQr ? 'replace' : 'keep' }); }}
                                disabled={saveLoginDataMut.isPending}
                                className="flex-1 py-1.5 px-3 bg-lime-500/20 border border-lime-500/40 text-lime-300 rounded-lg text-xs font-semibold hover:bg-lime-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                              >
                                {saveLoginDataMut.isPending ? (
                                  <><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-lime-300" />Salvando...</>
                                ) : (
                                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar Dados de Login</>
                                )}
                              </button>
                              {waPhone && hasLoginData && (
                                <a
                                  href={`https://wa.me/${waPhone}?text=${encodeURIComponent(buildLoginWaMsg())}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="py-1.5 px-3 bg-green-600/20 border border-green-500/40 text-green-300 rounded-lg text-xs font-semibold hover:bg-green-600/30 transition-colors flex items-center gap-1.5"
                                  title="Enviar dados de login via WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  WhatsApp
                                </a>
                              )}
                            </div>
                            {saved && (saved.loginEmail || saved.loginPassword || saved.authCode || (saved as any).emailLink || (saved as any).loginNotes || (saved as any).loginGroupLink) && (
                              <p className="text-xs text-lime-400/70 text-center">✓ Dados salvos — visíveis para o cliente quando status for Entregue</p>
                            )}
                          </div>
                          </div>
                        );
                      })()}
                      {/* Agendamento de atendimento */}
                      <OrderScheduleBlock
                        registrationId={order.id}
                        subOrderIndex={order.subOrderIndex ?? 0}
                        customerPhone={order.phone}
                        customerName={order.customerName}
                        customerEmail={order.customerEmail}
                        customerPhotoUrl={order.customerProfilePhotoUrl}
                      />

                      {(latestStatus === "entregue" || latestStatus === "pedido_entregue") && (
                        <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-teal-400 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Observação do Pedido Entregue
                          </p>
                          <textarea
                            value={deliveryNote[getOrderKey(order)] ?? (historyQuery.data?.find(h => h.status === 'entregue' || h.status === 'pedido_entregue')?.note ?? '')}
                            onChange={e => setDeliveryNote(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                            placeholder="Ex: Conta criada! Login: usuario@email.com | Senha: 1234 | Plataforma: Uber"
                            rows={3}
                            className="w-full px-3 py-2 bg-background border border-teal-500/30 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40 resize-none"
                          />
                          <button
                            onClick={() => {
                              setSavingNote(getOrderKey(order));
                              updateNoteMut.mutate({
                                registrationId: order.id,
                                status: latestStatus ?? 'entregue',
                                note: deliveryNote[getOrderKey(order)] ?? (historyQuery.data?.find(h => h.status === 'entregue' || h.status === 'pedido_entregue')?.note ?? ''),
                              });
                            }}
                            disabled={savingNote === getOrderKey(order)}
                            className="w-full py-1.5 px-3 bg-teal-500/20 border border-teal-500/40 text-teal-300 rounded-lg text-xs font-semibold hover:bg-teal-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {savingNote === getOrderKey(order) ? (
                              <><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-teal-300" />Salvando...</>
                            ) : (
                              <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar Observação</>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Previsão de Entrega */}
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          Previsão de Entrega
                        </p>
                        {order.deliveryEstimate && !deliveryEstimate[getOrderKey(order)] && (
                          <p className="text-xs text-muted-foreground">
                            Atual: <span className="text-blue-300 font-medium">{new Date(order.deliveryEstimate).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="date"
                            value={deliveryEstimate[getOrderKey(order)] ? deliveryEstimate[getOrderKey(order)].split('T')[0] : (order.deliveryEstimate ? new Date(Number(order.deliveryEstimate) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '')}
                            onChange={e => {
                              const key = getOrderKey(order);
                              const current = deliveryEstimate[key] ?? (order.deliveryEstimate ? new Date(Number(order.deliveryEstimate) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : 'T00:00');
                              const time = current.includes('T') ? current.split('T')[1] : '00:00';
                              setDeliveryEstimate(prev => ({ ...prev, [key]: `${e.target.value}T${time}` }));
                            }}
                            className="flex-1 px-3 py-2 bg-background border border-blue-500/30 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                          <input
                            type="time"
                            value={deliveryEstimate[getOrderKey(order)] ? deliveryEstimate[getOrderKey(order)].split('T')[1]?.slice(0,5) : (order.deliveryEstimate ? new Date(Number(order.deliveryEstimate) - new Date().getTimezoneOffset() * 60000).toISOString().slice(11, 16) : '18:00')}
                            onChange={e => {
                              const key = getOrderKey(order);
                              const current = deliveryEstimate[key] ?? (order.deliveryEstimate ? new Date(Number(order.deliveryEstimate) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
                              const date = current.includes('T') ? current.split('T')[0] : current;
                              setDeliveryEstimate(prev => ({ ...prev, [key]: `${date}T${e.target.value}` }));
                            }}
                            className="w-28 px-3 py-2 bg-background border border-blue-500/30 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              // Usar estado local se alterado, senão usar valor do banco convertido
                              const localVal = deliveryEstimate[getOrderKey(order)];
                              const bankVal = order.deliveryEstimate
                                ? new Date(Number(order.deliveryEstimate) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                                : '';
                              const val = localVal || bankVal;
                              if (!val) { toast.error('Selecione uma data e hora'); return; }
                              setSavingEstimate(getOrderKey(order));
                              updateDeliveryEstimateMut.mutate({
                                registrationId: Number(order.id),
                                deliveryEstimate: new Date(val).getTime(),
                              });
                            }}
                            disabled={savingEstimate === getOrderKey(order)}
                            className="flex-1 py-1.5 px-3 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {savingEstimate === getOrderKey(order) ? (
                              <><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-blue-300" />Salvando...</>
                            ) : (
                              <><Calendar className="w-3.5 h-3.5" />Salvar Previsão</>
                            )}
                          </button>
                          {order.deliveryEstimate && (
                            <button
                              type="button"
                              onClick={() => {
                                setSavingEstimate(getOrderKey(order));
                                setDeliveryEstimate(prev => ({ ...prev, [getOrderKey(order)]: '' }));
                                updateDeliveryEstimateMut.mutate({
                                  registrationId: Number(order.id),
                                  deliveryEstimate: null,
                                });
                              }}
                              disabled={savingEstimate === getOrderKey(order)}
                              className="py-1.5 px-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Número do Pedido */}
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                          Número do Pedido
                        </p>
                        {order.orderNumber && !editOrderNumber[getOrderKey(order)] && (
                          <p className="text-xs text-muted-foreground">
                            Atual: <span className="text-blue-300 font-bold">#{order.orderNumber}</span>
                          </p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder={order.orderNumber ? `Atual: #${order.orderNumber}` : 'Ex: 430001'}
                            value={editOrderNumber[getOrderKey(order)] ?? ''}
                            onChange={e => setEditOrderNumber(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => {
                              const key = getOrderKey(order);
                              const val = editOrderNumber[key];
                              if (!val && !order.orderNumber) return;
                              setSavingOrderNumber(key);
                              updateOrderNumberMutation.mutate({
                                registrationId: order.id,
                                subOrderIndex: order.subOrderIndex ?? 0,
                                orderNumber: val ? parseInt(val) : null,
                              });
                              setEditOrderNumber(prev => ({ ...prev, [key]: '' }));
                            }}
                            disabled={savingOrderNumber === getOrderKey(order)}
                            className="py-1.5 px-3 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {savingOrderNumber === getOrderKey(order) ? (
                              <><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-blue-300" />Salvando...</>
                            ) : (
                              <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar</>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Desbloqueio de PIN */}
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          Acesso PIN
                        </p>
                        <p className="text-xs text-muted-foreground">Se o cliente errou a senha 3 vezes e foi bloqueado, clique abaixo para liberar o acesso novamente.</p>
                        <button
                          onClick={() => unlockPinMut.mutate({ phone: order.phone })}
                          disabled={unlockPinMut.isPending}
                          className="w-full py-1.5 px-3 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {unlockPinMut.isPending ? (
                            <><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-red-300" />Desbloqueando...</>
                          ) : (
                            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>Desbloquear PIN do Cliente</>
                          )}
                        </button>
                        <button
                          onClick={() => resetPinMut.mutate({ phone: order.phone })}
                          disabled={resetPinMut.isPending}
                          className="w-full py-1.5 px-3 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 rounded-lg text-xs font-semibold hover:bg-yellow-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {resetPinMut.isPending ? (
                            <><div className="animate-spin rounded-full h-3 w-3 border-t-2 border-yellow-300" />Resetando...</>
                          ) : (
                            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Resetar Senha (volta ao telefone)</>
                          )}
                        </button>
                      </div>
                      {/* Cancelar / Arquivar / Deletar */}
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
                        <button
                          onClick={() => handleCancelOrder(order)}
                          disabled={updateMutation.isPending || latestStatus === "cancelado"}
                          className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-orange-600 border border-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-500 transition-colors disabled:opacity-40 min-w-0"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancelar Pedido
                        </button>

                        <button
                          type="button"
                          onClick={() => archiveMutation.mutate({ registrationId: order.id })}
                          disabled={archiveMutation.isPending}
                          className="flex items-center justify-center gap-1 py-2 px-2.5 bg-zinc-600 border border-zinc-500 text-white rounded-lg text-xs font-bold hover:bg-zinc-500 transition-colors disabled:opacity-50 min-w-0"
                          title="Mover para o Arquivo (pedidos aguardando por mais tempo)"
                        >
                          {archiveMutation.isPending ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-zinc-300" />
                          ) : (
                            <span>📁</span>
                          )}
                          Arquivar
                        </button>

                        <button
                          type="button"
                          onClick={() => moveToRgCnhMutation.mutate({ registrationId: order.id })}
                          disabled={moveToRgCnhMutation.isPending}
                          className="flex items-center justify-center gap-1 py-2 px-2.5 bg-green-600 border border-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-500 transition-colors disabled:opacity-50 min-w-0"
                          title={`Mover para ${(folderConfigQuery.data as any)?.['rgcnh']?.name || 'RG/CNH Aprovado'}`}
                        >
                          {moveToRgCnhMutation.isPending ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-white" />
                          ) : (
                            <span>🢪</span>
                          )}
                          {(folderConfigQuery.data as any)?.['rgcnh']?.name || 'RG/CNH'}
                        </button>

                        {/* Mover para pasta personalizada */}
                        {(customFoldersQuery.data || []).length > 0 && (() => {
                          const fmKey = `fm_${getOrderKey(order)}`;
                          const isOpen = openFolderMenuKey === fmKey;
                          return (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setOpenFolderMenuKey(isOpen ? null : fmKey); }}
                                className={`flex items-center justify-center gap-1 py-2 px-2.5 border rounded-lg text-xs font-medium transition-colors min-w-0 ${
                                  isOpen
                                    ? 'bg-purple-500/30 border-purple-500/60 text-purple-200'
                                    : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
                                }`}
                                title="Mover para pasta personalizada"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                Pasta
                              </button>
                              {isOpen && (
                                <div className="absolute bottom-full left-0 mb-1 flex flex-col bg-card border border-border rounded-lg shadow-xl z-50 min-w-[160px] py-1">
                                  <p className="px-3 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide border-b border-border mb-1">Mover para:</p>
                                  {(customFoldersQuery.data || []).map((f: any) => (
                                    <button
                                      key={f.id}
                                      onClick={() => { moveToFolderMut.mutate({ folderId: f.id, registrationId: order.id, subOrderIndex: order.subOrderIndex ?? 0 }); setOpenFolderMenuKey(null); }}
                                      disabled={moveToFolderMut.isPending}
                                      className="text-left px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors"
                                    >
                                      {f.icon ? `${f.icon} ` : '📁 '}{f.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}


                      </div>
                    </div>
                  )}

                  {/* === ABA CLIENTE === */}
                  {tab === "cliente" && (
                    <div className="p-4 space-y-3">
                      {editData ? (
                        /* Formulário de edição */
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Edit3 className="w-3.5 h-3.5" /> Editando dados do cliente
                          </p>

                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Nome</label>
                            <input
                              type="text"
                              value={editData.name}
                              onChange={e => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], name: e.target.value } }))}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              placeholder="Nome completo"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Número de Cadastro</label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground font-bold">*</span>
                              <input
                                type="number"
                                min="1"
                                value={editData.customerNumber}
                                onChange={e => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], customerNumber: e.target.value } }))}
                                className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="Ex: 136"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Número de identificação do cliente (ex: *136)</p>
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Telefone</label>
                            <input
                              type="tel"
                              value={editData.phone}
                              onChange={e => {
                                const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                                let formatted = digits;
                                if (digits.length > 7) formatted = `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
                                else if (digits.length > 2) formatted = `(${digits.slice(0,2)}) ${digits.slice(2)}`;
                                setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], phone: formatted } }));
                              }}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              placeholder="(11) 99999-9999"
                            />
                            <p className="text-xs text-amber-400 mt-1">⚠️ Alterar o telefone atualiza o cadastro do cliente</p>
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Email</label>
                            <input
                              type="email"
                              value={editData.email}
                              onChange={e => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], email: e.target.value } }))}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              placeholder="email@exemplo.com"
                            />
                            <div className="mt-1.5 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                              <Mail className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-amber-300 leading-relaxed">
                                <strong>Não é para criar conta.</strong> Usado apenas para notificações do pedido.
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-muted-foreground block mb-1">Cidade</label>
                              <input
                                type="text"
                                value={editData.city}
                                onChange={e => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], city: e.target.value } }))}
                                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="Cidade"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground block mb-1">UF</label>
                              <select
                                value={editData.uf}
                                onChange={e => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], uf: e.target.value } }))}
                                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              >
                                <option value="">UF</option>
                                {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Telefone do indicador</label>
                            <input
                              type="tel"
                              value={editData.referredByPhone}
                              onChange={e => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], referredByPhone: e.target.value } }))}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              placeholder="(11) 99999-9999"
                            />
                            <div className="mt-1">
                              <ReferrerLookup
                                phone={editData.referredByPhone}
                                onNameFound={(name) => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], referredBy: name } }))}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Quem indicou (nome)</label>
                            <input
                              type="text"
                              value={editData.referredBy}
                              onChange={e => setEditingCustomer(p => ({ ...p, [getOrderKey(order)]: { ...p[getOrderKey(order)], referredBy: e.target.value } }))}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              placeholder="Nome do indicador (preenchido automaticamente)"
                            />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveCustomer(order)}
                              disabled={updateCustomerMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" />
                              {updateCustomerMutation.isPending ? "Salvando..." : "Salvar"}
                            </button>
                            <button
                              onClick={() => cancelEditCustomer(getOrderKey(order))}
                              className="flex-1 flex items-center justify-center gap-2 py-2 bg-card border border-border text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted/20 transition-colors"
                            >
                              <X className="w-4 h-4" />
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Visualização */
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dados do Cliente</p>
                            {order.customerId && (
                              <button
                                onClick={() => startEditCustomer(order)}
                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Editar
                              </button>
                            )}
                          </div>

                          <div className="flex justify-center">
                            <div className="relative">
                              <label className="relative cursor-pointer group" title="Clique para trocar a foto">
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(getOrderKey(order), order.phone, f); e.target.value = ''; }} />
                                {order.customerProfilePhotoUrl ? (
                                  <img src={order.customerProfilePhotoUrl} alt={order.customerName || ''} className="w-20 h-20 rounded-full object-cover border-2 border-primary/30" />
                                ) : (
                                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center border-2 border-border">
                                    {uploadingPhotoOrderId === getOrderKey(order) ? (
                                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <span className="text-2xl font-bold text-primary">{(order.customerName || order.phone).charAt(0).toUpperCase()}</span>
                                    )}
                                  </div>
                                )}
                                <div className="absolute inset-0 rounded-full bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                                  {uploadingPhotoOrderId === getOrderKey(order) ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <Camera className="w-5 h-5 text-white" />
                                      <span className="text-white text-xs font-medium">Trocar foto</span>
                                    </>
                                  )}
                                </div>
                              </label>
                              {/* Botão expandir foto */}
                              {order.customerProfilePhotoUrl && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setPhotoLightboxUrl(order.customerProfilePhotoUrl); }}
                                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center hover:bg-zinc-700 transition-colors shadow-lg"
                                  title="Expandir foto"
                                >
                                  <ZoomIn className="w-3.5 h-3.5 text-white" />
                                </button>
                              )}
                            </div>
                          </div>


                          <div className="space-y-2">
                            <InfoRow icon={<User className="w-3.5 h-3.5" />} label="Nome" value={order.customerName || "—"} />
                            <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Telefone" value={formatPhone(order.phone)} />
                            <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={order.customerEmail || "—"} />
                            <InfoRow
                              icon={<MapPin className="w-3.5 h-3.5" />}
                              label="Localização"
                              value={[order.customerCity, order.customerUf].filter(Boolean).join(" - ") || "—"}
                            />
                            <InfoRow icon={<UserCheck className="w-3.5 h-3.5" />} label="Indicado por" value={order.customerReferredBy || "—"} />
                            {order.customerReferredByPhone && (
                              <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Tel. indicador" value={formatPhone(order.customerReferredByPhone)} />
                            )}
                          </div>

                          {/* Produto e respostas */}
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Informações do Pedido</p>
                              {!editingOrderData[getOrderKey(order)] && (
                                <button
                                  onClick={() => {
                                    let parsedAnswers: Array<{ question: string; answer: string }> = [];
                                    try { parsedAnswers = JSON.parse(order.answers || '[]'); } catch {}
                                    setEditingOrderData(prev => ({
                                      ...prev,
                                      [getOrderKey(order)]: {
                                        serviceName: order.serviceName || '',
                                        serviceOption: order.serviceOption || '',
                                        pricePaid: order.pricePaid || '',
                                        answers: parsedAnswers,
                                      }
                                    }));
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Editar
                                </button>
                              )}
                            </div>

                            {editingOrderData[getOrderKey(order)] ? (
                              <div className="space-y-2 bg-card/50 border border-border rounded-lg p-3">
                                <div>
                                  <label className="text-xs text-muted-foreground">Serviço</label>
                                  <select
                                    value={editingOrderData[getOrderKey(order)].serviceName}
                                    onChange={e => setEditingOrderData(prev => ({ ...prev, [getOrderKey(order)]: { ...prev[getOrderKey(order)], serviceName: e.target.value, serviceOption: '' } }))}
                                    className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground"
                                  >
                                    <option value="">— Selecione o serviço —</option>
                                    {(productsQuery.data ?? []).map(p => (
                                      <option key={p.id} value={p.name}>{p.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">Nome / Opção escolhida</label>
                                  {(() => {
                                    const selProd = (productsQuery.data ?? []).find(p => p.name === editingOrderData[getOrderKey(order)].serviceName);
                                    const opts = selProd?.options ?? [];
                                    // Encontrar a opção que melhor corresponde ao serviceOption salvo (pode ter garantia concatenada)
                                    const currentSvcOpt = (editingOrderData[getOrderKey(order)].serviceOption || '').trim();
                                    const matchedOptLabel = opts.find((o: any) => {
                                      const lbl = (o.label || '').trim();
                                      return lbl === currentSvcOpt || currentSvcOpt.startsWith(lbl) || (lbl && currentSvcOpt.toLowerCase().includes(lbl.toLowerCase()));
                                    })?.label || currentSvcOpt;
                                    return opts.length > 0 ? (
                                      <select
                                        value={matchedOptLabel}
                                        onChange={e => setEditingOrderData(prev => ({ ...prev, [getOrderKey(order)]: { ...prev[getOrderKey(order)], serviceOption: e.target.value } }))}
                                        className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground"
                                      >
                                        <option value="">— Selecione a opção —</option>
                                        {opts.map((opt: { id: number; label: string }) => (
                                          <option key={opt.id} value={opt.label}>{opt.label}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        value={editingOrderData[getOrderKey(order)].serviceOption}
                                        onChange={e => setEditingOrderData(prev => ({ ...prev, [getOrderKey(order)]: { ...prev[getOrderKey(order)], serviceOption: e.target.value } }))}
                                        className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground"
                                        placeholder="Ex: PRIMEIRO / NOME"
                                      />
                                    );
                                  })()}
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">Valor (R$)</label>
                                  <input
                                    type="text"
                                    value={editingOrderData[getOrderKey(order)].pricePaid}
                                    onChange={e => setEditingOrderData(prev => ({ ...prev, [getOrderKey(order)]: { ...prev[getOrderKey(order)], pricePaid: e.target.value } }))}
                                    className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground"
                                    placeholder="Ex: 400,00"
                                  />
                                </div>
                                {(() => {
                                  const ed = editingOrderData[getOrderKey(order)];
                                  const selProd = (productsQuery.data ?? []).find(p => p.name === ed.serviceName);
                                  // Match flexível: serviceOption pode ter " - Garantia: ..." concatenado ou espaços extras
                                  const svcOptTrimmed = (ed.serviceOption || '').trim();
                                  const selOpt = selProd?.options?.find((o: any) => {
                                    const lbl = (o.label || '').trim();
                                    if (lbl === svcOptTrimmed) return true;
                                    if (svcOptTrimmed.startsWith(lbl)) return true;
                                    if (lbl && svcOptTrimmed.toLowerCase().includes(lbl.toLowerCase())) return true;
                                    return false;
                                  });
                                  // Se não encontrou option específica, buscar perguntas de todas as options do produto
                                  let productQs = selOpt?.questions ?? [];
                                  if (productQs.length === 0 && selProd?.options) {
                                    // Tentar todas as options do produto para encontrar perguntas
                                    for (const opt of selProd.options) {
                                      if (opt.questions && opt.questions.length > 0) {
                                        productQs = opt.questions;
                                        break;
                                      }
                                    }
                                  }
                                  // Se o pedido já tem respostas, mostra elas; senão carrega perguntas do produto
                                  const displayAnswers = ed.answers.length > 0 ? ed.answers : productQs.map((q: any) => ({ question: q.text || q.question || q.label || '', answer: '' }));

                                  // Helper: parsear options de uma pergunta
                                  const parseSelectOpts = (rawOpts: string | null | undefined): Array<{label: string; color?: string | null}> => {
                                    if (!rawOpts) return [];
                                    try {
                                      const parsed = JSON.parse(rawOpts);
                                      if (Array.isArray(parsed)) {
                                        return parsed.map((o: any) => typeof o === 'string' ? { label: o.trim() } : { label: (o.label || '').trim(), color: o.color });
                                      }
                                    } catch {
                                      if (typeof rawOpts === 'string' && rawOpts.includes(',')) {
                                        return rawOpts.split(',').map(s => ({ label: s.trim() })).filter(s => s.label);
                                      } else if (typeof rawOpts === 'string' && rawOpts.trim()) {
                                        return [{ label: rawOpts.trim() }];
                                      }
                                    }
                                    return [];
                                  };

                                  // Helper: encontrar pergunta correspondente no produto
                                  const findMatchedQ = (questionText: string) => {
                                    const itemQTrimmed = (questionText || '').trim().toLowerCase();
                                    return productQs.find((q: any) => {
                                      const qText = (q.question || q.text || q.label || '').trim().toLowerCase();
                                      return qText === itemQTrimmed;
                                    }) || (itemQTrimmed.length > 3 ? productQs.find((q: any) => {
                                      const qText = (q.question || q.text || q.label || '').trim().toLowerCase();
                                      return qText.includes(itemQTrimmed) || itemQTrimmed.includes(qText);
                                    }) : undefined);
                                  };

                                  // Helper: verificar se uma sub-pergunta deve ser visível baseado na resposta da pergunta pai
                                  const isSubQuestionVisible = (matchedQ: any) => {
                                    if (!matchedQ?.parentQuestionId) return true; // pergunta raiz = sempre visível
                                    // Encontrar a pergunta pai no productQs
                                    const parentQ = productQs.find((q: any) => q.id === matchedQ.parentQuestionId);
                                    if (!parentQ) return true; // se não encontrar pai, mostrar
                                    // Encontrar a resposta da pergunta pai nos displayAnswers
                                    const parentQText = (parentQ.question || '').trim().toLowerCase();
                                    const parentAnswer = displayAnswers.find((a: any) => {
                                      const aQ = (a.question || '').trim().toLowerCase();
                                      return aQ === parentQText || (parentQText.length > 3 && (aQ.includes(parentQText) || parentQText.includes(aQ)));
                                    });
                                    const parentAnswerVal = (parentAnswer?.answer || '').trim();
                                    // Se tem triggerOption, só mostrar quando a resposta pai bate
                                    if (matchedQ.triggerOption) {
                                      return parentAnswerVal.toLowerCase() === matchedQ.triggerOption.trim().toLowerCase();
                                    }
                                    // Se não tem triggerOption, mostrar quando pai tem qualquer resposta
                                    return !!parentAnswerVal;
                                  };

                                  // Renderizar campo de pergunta
                                  const renderQuestionField = (item: any, i: number, matchedQ: any, indent: boolean = false) => {
                                    const fieldType = matchedQ?.fieldType || 'text';
                                    const selectOptions = fieldType === 'select' ? parseSelectOpts(matchedQ?.options) : [];
                                    const handleChange = (val: string) => {
                                      setEditingOrderData(prev => {
                                        const currentAnswers = prev[getOrderKey(order)].answers.length > 0 ? [...prev[getOrderKey(order)].answers] : displayAnswers.map((a: any) => ({ ...a }));
                                        currentAnswers[i] = { ...currentAnswers[i], answer: val };
                                        return { ...prev, [getOrderKey(order)]: { ...prev[getOrderKey(order)], answers: currentAnswers } };
                                      });
                                    };
                                    return (
                                      <div key={i} className={indent ? 'ml-3 pl-2 border-l-2 border-blue-500/30' : ''}>
                                        <label className="text-xs text-muted-foreground">{indent ? '└ ' : ''}{item.question}</label>
                                        {fieldType === 'select' && selectOptions.length > 0 ? (
                                          <select
                                            value={item.answer}
                                            onChange={e => handleChange(e.target.value)}
                                            className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground"
                                          >
                                            <option value="">— Selecione —</option>
                                            {selectOptions.map((opt, oi) => (
                                              <option key={oi} value={opt.label}>{opt.label}</option>
                                            ))}
                                          </select>
                                        ) : fieldType === 'textarea' ? (
                                          <textarea
                                            value={item.answer}
                                            onChange={e => handleChange(e.target.value)}
                                            className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground min-h-[60px]"
                                          />
                                        ) : (
                                          <input
                                            type="text"
                                            value={item.answer}
                                            onChange={e => handleChange(e.target.value)}
                                            className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground"
                                          />
                                        )}
                                      </div>
                                    );
                                  };

                                  // Reorganizar: agrupar sub-perguntas logo após sua pergunta pai
                                  const orderedItems: Array<{item: any; idx: number; isChild: boolean}> = [];
                                  const usedIndices = new Set<number>();
                                  
                                  // Primeiro pass: identificar perguntas raiz e suas sub-perguntas
                                  displayAnswers.forEach((item: any, i: number) => {
                                    if (usedIndices.has(i)) return;
                                    const matchedQ = findMatchedQ(item.question);
                                    // Se é sub-pergunta, pular (será adicionada após o pai)
                                    if (matchedQ?.parentQuestionId) return;
                                    // Adicionar pergunta raiz
                                    orderedItems.push({ item, idx: i, isChild: false });
                                    usedIndices.add(i);
                                    // Buscar sub-perguntas desta pergunta pai
                                    if (matchedQ?.id) {
                                      displayAnswers.forEach((subItem: any, si: number) => {
                                        if (usedIndices.has(si)) return;
                                        const subMatchedQ = findMatchedQ(subItem.question);
                                        if (subMatchedQ?.parentQuestionId === matchedQ.id) {
                                          // Verificar visibilidade (trigger)
                                          if (isSubQuestionVisible(subMatchedQ)) {
                                            orderedItems.push({ item: subItem, idx: si, isChild: true });
                                            usedIndices.add(si);
                                          }
                                        }
                                      });
                                    }
                                  });
                                  // Adicionar itens restantes que não foram agrupados (sem match)
                                  displayAnswers.forEach((item: any, i: number) => {
                                    if (!usedIndices.has(i)) {
                                      const matchedQ = findMatchedQ(item.question);
                                      if (matchedQ?.parentQuestionId && !isSubQuestionVisible(matchedQ)) return;
                                      orderedItems.push({ item, idx: i, isChild: !!matchedQ?.parentQuestionId });
                                    }
                                  });

                                  return orderedItems.length > 0 ? (
                                    <div className="space-y-1.5">
                                      <p className="text-xs text-muted-foreground">Dados do formulário:</p>
                                      {orderedItems.map(({ item, idx, isChild }) => {
                                        const matchedQ = findMatchedQ(item.question);
                                        return renderQuestionField(item, idx, matchedQ, isChild);
                                      })}
                                    </div>
                                  ) : null;
                                })()}
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={() => {
                                      const ed = editingOrderData[getOrderKey(order)];
                                      updateOrderDataMutation.mutate({
                                        registrationId: order.id,
                                        serviceName: ed.serviceName || undefined,
                                        serviceOption: ed.serviceOption || undefined,
                                        pricePaid: ed.pricePaid || undefined,
                                        answers: ed.answers.length > 0 ? JSON.stringify(ed.answers) : undefined,
                                      });
                                    }}
                                    disabled={updateOrderDataMutation.isPending}
                                    className="flex-1 py-1.5 bg-green-600 text-white rounded text-xs font-medium disabled:opacity-50"
                                  >
                                    {updateOrderDataMutation.isPending ? 'Salvando...' : 'Salvar'}
                                  </button>
                                  <button
                                    onClick={() => setEditingOrderData(prev => { const n = { ...prev }; delete n[getOrderKey(order)]; return n; })}
                                    className="flex-1 py-1.5 bg-muted text-foreground rounded text-xs font-medium"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {order.serviceName ? (
                                  <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                                    <p className="text-xs text-muted-foreground">Serviço</p>
                                    <p className="text-xs font-bold text-primary mt-0.5">{order.serviceName}</p>
                                  </div>
                                ) : (
                                  <div className="bg-muted/10 border border-border/50 rounded-lg px-3 py-2">
                                    <p className="text-xs text-muted-foreground">Serviço</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5">{order.codeClientName || '—'}</p>
                                  </div>
                                )}

                                {order.serviceOption && (
                                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                    <p className="text-xs text-muted-foreground">Nome / Opção escolhida</p>
                                    <div className="text-xs font-bold text-amber-300 mt-0.5 space-y-1">{order.serviceOption?.split(/(?=Garantia)/i).map((part, idx) => <p key={idx}>— {part}</p>)}</div>
                                  </div>
                                )}

                                {order.answers && (() => {
                                  try {
                                    const parsed = JSON.parse(order.answers) as Array<{ question: string; answer: string; optionsMeta?: string; answerType?: string; audioUrl?: string; durationSeconds?: number }>;
                                    if (parsed.length > 0) return (
                                      <div className="space-y-2">
                                        <p className="text-xs font-semibold text-purple-400/80 flex items-center gap-1">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                          Respostas do Formulário
                                        </p>
                                        {parsed.map((item, i) => {
                                          // Tentar parsear optionsMeta para obter a cor da resposta
                                          let answerColor: string | null = null;
                                          if (item.optionsMeta) {
                                            try {
                                              const meta = JSON.parse(item.optionsMeta) as Array<{ label: string; color: string | null }>;
                                              const found = meta.find(m => m.label === item.answer);
                                              if (found?.color) answerColor = found.color;
                                            } catch {}
                                          }
                                          return (
                                            <div key={i} className="bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
                                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">{item.question}</p>
                                              {item.answerType === 'audio' && item.audioUrl ? (
                                                <div className="space-y-1.5">
                                                  <p className="text-xs font-bold text-sky-300">Áudio · {String(Math.floor((item.durationSeconds || 0) / 60)).padStart(2, '0')}:{String(Math.round((item.durationSeconds || 0) % 60)).padStart(2, '0')}</p>
                                                  <audio controls preload="metadata" className="w-full h-9" src={item.audioUrl}>Seu navegador não suporta reprodução de áudio.</audio>
                                                </div>
                                              ) : answerColor ? (
                                                <span
                                                  className="inline-block px-3 py-1 rounded-full text-xs font-bold"
                                                  style={{ backgroundColor: answerColor + '25', color: answerColor, border: `1.5px solid ${answerColor}60` }}
                                                >
                                                  {item.answer}
                                                </span>
                                              ) : (
                                                <p className="text-sm font-semibold text-white">{item.answer}</p>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  } catch { return null; }
                                })()}

                                {/* Informações de Revendedor */}
                                {((order as any).thirdPartyName || (order as any).resellerDiscountApplied) && (
                                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 space-y-1">
                                    <p className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                                      🏷️ Pedido de Revendedor
                                    </p>
                                    {(order as any).thirdPartyName && (
                                      <div>
                                        <p className="text-[10px] text-blue-300/60 uppercase tracking-wider">Cliente Final</p>
                                        <p className="text-xs font-bold text-blue-200">{(order as any).thirdPartyName}</p>
                                      </div>
                                    )}
                                    {(order as any).resellerDiscountApplied && (
                                      <div>
                                        <p className="text-[10px] text-blue-300/60 uppercase tracking-wider">Desconto Aplicado</p>
                                        <p className="text-xs font-bold text-green-300">-R$ {parseFloat((order as any).resellerDiscountApplied).toFixed(2).replace('.', ',')}</p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {!order.serviceName && !order.serviceOption && !order.answers && !(order as any).thirdPartyName && !(order as any).resellerDiscountApplied && (
                                  <p className="text-xs text-muted-foreground text-center py-2">Nenhuma informação adicional do pedido</p>
                                )}
                              </>
                            )}
                          </div>

                          {!order.customerId && (
                            <p className="text-xs text-yellow-400/80 text-center">⚠️ Cliente não encontrado no cadastro</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* === ABA DOCUMENTOS === */}
                  {tab === "documentos" && (
                    <div className="p-4 space-y-3">
                      {/* === SEÇÃO: DOCUMENTOS DO ADMIN PARA O CLIENTE === */}
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Enviar para o Cliente</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setShowVideoUrlFor(showVideoUrlFor === getOrderKey(order) ? null : getOrderKey(order)); setShowAdminUploadFor(null); }}
                              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                              title="Enviar vídeo por URL"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              Vídeo URL
                            </button>
                            <button
                              onClick={() => { setShowAdminUploadFor(showAdminUploadFor === getOrderKey(order) ? null : getOrderKey(order)); setShowVideoUrlFor(null); }}
                              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                              Arquivo
                            </button>
                          </div>
                        </div>

                        {/* Formulário de upload do admin para cliente */}
                        {showAdminUploadFor === getOrderKey(order) && (
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-2">
                            <input
                              type="text"
                              placeholder="Nome do documento (ex: Contrato, Guia de Ativação...)"
                              value={newAdminDocLabel[getOrderKey(order)] || ''}
                              onChange={e => setNewAdminDocLabel(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                              className="w-full text-xs bg-background border border-emerald-500/30 rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-400"
                            />
                            <label className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                              uploadingAdminDocFor === getOrderKey(order)
                                ? 'border-emerald-500/30 text-muted-foreground cursor-not-allowed'
                                : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/5'
                            }`}>
                              {uploadingAdminDocFor === getOrderKey(order) ? (
                                <><div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-emerald-400" /><span className="text-xs">Enviando...</span></>
                              ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg><span className="text-xs font-medium">Selecionar arquivo (imagem ou PDF)</span></>
                              )}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                disabled={uploadingAdminDocFor === getOrderKey(order)}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleAdminDocUpload(order, f); e.target.value = ''; }}
                              />
                            </label>
                          </div>
                        )}
                        {/* Formulário de URL de vídeo externo */}
                        {showVideoUrlFor === getOrderKey(order) && (
                          <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-semibold text-purple-400">🎬 Enviar Vídeo por URL</p>
                            <input
                              type="text"
                              placeholder="Nome do vídeo (ex: Tutorial de Ativação...)"
                              value={videoUrlLabel[getOrderKey(order)] || ''}
                              onChange={e => setVideoUrlLabel(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                              className="w-full text-xs bg-background border border-purple-500/30 rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-purple-400"
                            />
                            <input
                              type="url"
                              placeholder="Cole aqui a URL do vídeo (YouTube, Google Drive, Vimeo...)"
                              value={videoUrlInput[getOrderKey(order)] || ''}
                              onChange={e => setVideoUrlInput(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                              className="w-full text-xs bg-background border border-purple-500/30 rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-purple-400"
                            />
                            <button
                              disabled={savingVideoUrlFor === getOrderKey(order) || !videoUrlInput[getOrderKey(order)]?.trim() || !videoUrlLabel[getOrderKey(order)]?.trim()}
                              onClick={() => {
                                const url = videoUrlInput[getOrderKey(order)]?.trim();
                                const label = videoUrlLabel[getOrderKey(order)]?.trim();
                                if (!url || !label) return;
                                setSavingVideoUrlFor(getOrderKey(order));
                                addVideoUrlMut.mutate({
                                  registrationId: order.id,
                                  customerPhone: order.phone,
                                  label,
                                  videoUrl: url,
                                });
                                setVideoUrlInput(prev => { const n = { ...prev }; delete n[getOrderKey(order)]; return n; });
                                setVideoUrlLabel(prev => { const n = { ...prev }; delete n[getOrderKey(order)]; return n; });
                              }}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                            >
                              {savingVideoUrlFor === getOrderKey(order) ? (
                                <><div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-white" /><span>Salvando...</span></>
                              ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg><span>Salvar URL do Vídeo</span></>
                              )}
                            </button>
                          </div>
                        )}

                        {/* Lista de docs enviados pelo admin */}
                        {filesQuery.data && filesQuery.data.filter(f => Number(f.fromAdmin) === 1).length === 0 && (
                          <p className="text-xs text-emerald-400/60 text-center py-1">Nenhum documento enviado ao cliente neste pedido</p>
                        )}
                        {filesQuery.data && filesQuery.data.filter(f => Number(f.fromAdmin) === 1).map(f => {
                          const isPdf = f.mimeType.includes('pdf');
                          const isImg = f.mimeType.startsWith('image/');
                          const isVid = f.mimeType.startsWith('video/');
                          return (
                            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-red-400/35 bg-red-500/10 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-base flex-shrink-0">{isPdf ? '📄' : isImg ? '🖼️' : isVid ? '🎬' : '📎'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate">{f.label}</p>
                                  <p className="text-xs font-medium text-red-300/90">{isPdf ? 'PDF' : isImg ? 'Imagem' : isVid ? 'Vídeo' : 'Arquivo'} • Enviado pelo ADM • Visível ao cliente</p>
                                </div>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <a href={f.fileUrl} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="Visualizar">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                </a>
                                <button onClick={() => { if (confirm(`Remover "${f.label}"?`)) deleteFileMut.mutate({ fileId: f.id }); }}
                                  className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Excluir">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {/* Docs de OUTROS pedidos do mesmo cliente */}
                        {(() => {
                          const otherDocs = (filesByPhoneQuery.data ?? []).filter(f => Number(f.fromAdmin) === 1 && f.registrationId !== expandedNumericId);
                          if (otherDocs.length === 0) return null;
                          return (
                            <div className="mt-2 border-t border-orange-500/20 pt-2 space-y-1.5">
                              <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Visível ao cliente — enviado em outro pedido
                              </p>
                              {otherDocs.map(f => {
                                const isPdf = f.mimeType.includes('pdf');
                                const isImg = f.mimeType.startsWith('image/');
                                const isVid = f.mimeType.startsWith('video/');
                                return (
                                  <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-red-400/35 bg-red-500/10 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className="text-base flex-shrink-0">{isPdf ? '📄' : isImg ? '🖼️' : isVid ? '🎬' : '📎'}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-foreground truncate">{f.label}</p>
                                        <p className="text-xs font-medium text-red-300/90">{isPdf ? 'PDF' : isImg ? 'Imagem' : isVid ? 'Vídeo' : 'Arquivo'} • Enviado pelo ADM em outro pedido (#{f.registrationId}){f.createdAt && <span className="ml-1.5 text-[10px] text-amber-300/90">📅 {new Date(f.createdAt instanceof Date ? f.createdAt.getTime() : f.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <a href={f.fileUrl} target="_blank" rel="noopener noreferrer"
                                        className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="Visualizar">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                      </a>
                                      <button onClick={() => { if (confirm(`Remover "${f.label}" (de outro pedido)?`)) deleteFileMut.mutate({ fileId: f.id }); }}
                                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Excluir">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {/* === SEÇÃO: DOCUMENTOS DO CLIENTE === */}
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documentos do Pedido (Cliente)</p>
                        <button
                          onClick={() => setShowUploadFor(showUploadFor === getOrderKey(order) ? null : getOrderKey(order))}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Adicionar
                        </button>
                      </div>

                      {/* Formulário de upload do cliente */}
                      {showUploadFor === getOrderKey(order) && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-medium text-primary">Novo Documento</p>
                          <input
                            type="text"
                            placeholder="Nome do documento (ex: CNH, Comprovante...)"
                            value={newDocLabel[getOrderKey(order)] || ''}
                            onChange={e => setNewDocLabel(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                            className="w-full text-xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                              uploadingDocFor === getOrderKey(order)
                                ? 'border-primary/30 text-muted-foreground cursor-not-allowed'
                                : 'border-primary/40 text-primary hover:bg-primary/5'
                            }`}>
                              {uploadingDocFor === getOrderKey(order) ? (
                                <><div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-primary" /><span className="text-xs">Enviando...</span></>
                              ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg><span className="text-xs font-medium">Selecionar arquivo (imagem, PDF ou vídeo)</span></>
                              )}
                              <input
                                type="file"
                                accept="image/*,application/pdf,video/*"
                                className="hidden"
                                disabled={uploadingDocFor === getOrderKey(order)}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(order, f); e.target.value = ''; }}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={uploadingDocFor === getOrderKey(order)}
                              onClick={() => { void handlePasteDoc(order); }}
                              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border-2 border-dashed border-cyan-400/45 text-cyan-300 hover:bg-cyan-400/10 disabled:border-primary/30 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
                              title="Cole um print ou imagem e toque aqui"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v11a2 2 0 002 2h9a2 2 0 002-2v-2M15 4h5m0 0v5m0-5L9 15" /></svg>
                              <span className="text-xs font-medium">Colar print</span>
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Copie um print, informe o nome do documento e toque em <strong className="text-cyan-300">Colar print</strong>.</p>
                        </div>
                      )}

                      {filesQuery.isLoading && (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
                        </div>
                      )}
                      {filesQuery.data && filesQuery.data.filter(f => Number(f.fromAdmin) !== 1).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">Nenhum documento do cliente</p>
                      )}
                      {filesQuery.data && filesQuery.data.filter(f => Number(f.fromAdmin) !== 1).map(f => {
                        const isPdf = f.mimeType.includes('pdf');
                        const isImg = f.mimeType.startsWith('image/');
                        const wasAddedByAdmin = Number((f as any).addedByAdmin) === 1;
                        const uploadDate = f.createdAt ? new Date(f.createdAt instanceof Date ? f.createdAt.getTime() : f.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
                        return (
                          <div key={f.id} className={`flex items-center justify-between gap-2 rounded-lg p-2.5 ${wasAddedByAdmin ? 'border border-red-400/35 bg-red-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm' : 'border border-border bg-card'}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-lg flex-shrink-0">{isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{f.label}</p>
                                <p className={`text-xs ${wasAddedByAdmin ? 'font-medium text-red-300/90' : 'text-muted-foreground'}`}>{isPdf ? 'PDF' : isImg ? 'Imagem' : 'Arquivo'}{wasAddedByAdmin && <span> • Anexado pelo ADM</span>}{uploadDate && <span className="ml-1.5 text-[10px] text-amber-400/80">📅 {uploadDate}</span>}</p>
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <a
                                href={f.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                                title="Visualizar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              </a>
                              <button
                                onClick={() => handleDownloadFile(f.fileUrl, f.label, f.mimeType)}
                                className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors"
                                title="Baixar"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => { if (confirm(`Remover "${f.label}"?`)) deleteFileMut.mutate({ fileId: f.id }); }}
                                className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                title="Excluir"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* === SEÇÃO: REUTILIZAR DOCUMENTOS DO CADASTRO === */}
                  {tab === "documentos" && (() => {
                    const customerDocs = (filesByPhoneQuery.data ?? []).filter(f => Number(f.fromAdmin) !== 1);
                    if (customerDocs.length === 0) return null;
                    // Bug fix: filtrar por registrationId (não por fileUrl) para excluir docs do pedido atual
                    const availableDocs = customerDocs.filter(f => f.registrationId !== expandedNumericId);
                    if (availableDocs.length === 0) return null;
                    return (
                      <div className="px-4 pb-2 pt-0">
                        <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide">Documentos do Cadastro</p>
                              <span className="text-[10px] bg-violet-500/20 text-violet-300 rounded-full px-1.5 py-0.5 font-bold">{availableDocs.length}</span>
                            </div>
                            <button
                              onClick={() => setShowReuseDocsFor(showReuseDocsFor === getOrderKey(order) ? null : getOrderKey(order))}
                              className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
                            >
                              {showReuseDocsFor === getOrderKey(order) ? 'Ocultar' : 'Ver documentos'}
                            </button>
                          </div>
                          <p className="text-[10px] text-violet-300/60">Documentos enviados pelo cliente em outros pedidos. Clique em "Usar" para adicioná-lo a este pedido sem novo upload.</p>
                          {showReuseDocsFor === getOrderKey(order) && (
                            <div className="space-y-1.5 pt-1">
                              {availableDocs.map(f => {
                                const isPdf = f.mimeType?.includes('pdf');
                                const isImg = f.mimeType?.startsWith('image/');
                                const isReusing = reusingFileId === f.id;
                                return (
                                  <div key={f.id} className="flex items-center justify-between gap-2 p-2 bg-violet-500/5 rounded-lg border border-violet-500/20">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className="text-sm flex-shrink-0">{isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-foreground truncate">{f.label}</p>
                                        <p className="text-[10px] text-violet-300/60">Pedido #{f.registrationId}{f.createdAt && <span className="ml-1.5">📅 {new Date(f.createdAt instanceof Date ? f.createdAt.getTime() : f.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <a href={f.fileUrl} target="_blank" rel="noopener noreferrer"
                                        className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="Visualizar">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                      </a>
                                      <button
                                        disabled={isReusing || reuseFileMut.isPending}
                                        onClick={() => {
                                          setReusingFileId(f.id);
                                          reuseFileMut.mutate({
                                            sourceFileId: f.id,
                                            targetRegistrationId: order.id,
                                            targetCustomerPhone: order.phone,
                                            label: f.label,
                                            fromAdmin: 0,
                                          });
                                        }}
                                        className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded text-[10px] font-bold transition-colors"
                                        title="Usar este documento neste pedido"
                                      >
                                        {isReusing ? (
                                          <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-white" />
                                        ) : (
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                        )}
                                        Usar
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* === SEÇÃO: SOLICITAÇÕES DE DOCUMENTOS PENDENTES (dentro da aba documentos) === */}
                  {tab === "documentos" && (
                    <div className="px-4 pb-2 pt-0">
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">⚠️</span>
                            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Solicitar Documento Pendente</p>
                            {(docRequestsQuery.data?.filter(r => r.status === 'pending').length ?? 0) > 0 && (
                              <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {docRequestsQuery.data!.filter(r => r.status === 'pending').length} pendente(s)
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => setShowDocReqForm(showDocReqForm === getOrderKey(order) ? null : getOrderKey(order))}
                            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Nova solicitação
                          </button>
                        </div>

                        {/* Formulário de nova solicitação */}
                        {showDocReqForm === getOrderKey(order) && (
                          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-2">
                            <p className="text-xs text-amber-300/70">Nome do documento solicitado:</p>
                            <input
                              type="text"
                              placeholder="Ex: CNH, Comprovante de residência, Foto..."
                              value={docReqLabel[getOrderKey(order)] || ''}
                              onChange={e => setDocReqLabel(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                              className="w-full text-xs bg-background border border-amber-500/30 rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-400"
                            />
                            <p className="text-xs text-amber-300/70">Mensagem para o cliente:</p>
                            <textarea
                              rows={3}
                              placeholder="Ex: Sua CNH está ilegível, por favor reenvie uma foto mais nítida..."
                              value={docReqMsg[getOrderKey(order)] || ''}
                              onChange={e => setDocReqMsg(prev => ({ ...prev, [getOrderKey(order)]: e.target.value }))}
                              className="w-full text-xs bg-background border border-amber-500/30 rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-400 resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  const msg = docReqMsg[getOrderKey(order)]?.trim();
                                  if (!msg) return toast.error('Digite uma mensagem');
                                  createDocReqMut.mutate({
                                    registrationId: getIdFromKey(getOrderKey(order)),
                                    customerPhone: order.phone || '',
                                    message: msg,
                                    docLabel: docReqLabel[getOrderKey(order)]?.trim() || undefined,
                                  });
                                }}
                                disabled={createDocReqMut.isPending}
                                className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold rounded transition-colors"
                              >
                                {createDocReqMut.isPending ? 'Enviando...' : 'Enviar Solicitação'}
                              </button>
                              <button
                                onClick={() => setShowDocReqForm(null)}
                                className="px-3 py-1.5 border border-amber-500/30 text-amber-400 text-xs rounded hover:bg-amber-500/10 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Lista de solicitações existentes */}
                        {(docRequestsQuery.data?.length ?? 0) > 0 && (
                          <div className="space-y-1.5 mt-1">
                            {docRequestsQuery.data!.map(req => (
                              <div key={req.id} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${
                                req.status === 'pending' ? 'bg-amber-500/5 border-amber-500/20' :
                                req.status === 'answered' ? 'bg-emerald-500/5 border-emerald-500/20' :
                                'bg-muted/30 border-border'
                              }`}>
                                <span className="mt-0.5 text-sm">{req.status === 'pending' ? '⏳' : req.status === 'answered' ? '✅' : '🔒'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-foreground/90 break-words">{req.message}</p>
                                  <p className="text-muted-foreground mt-0.5">
                                    {req.status === 'pending' ? 'Aguardando cliente' : req.status === 'answered' ? 'Cliente respondeu — veja nos documentos acima' : 'Encerrada'}
                                    {' • '}{new Date(req.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                  </p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  {req.status === 'pending' && (
                                    <button
                                      onClick={() => closeDocReqMut.mutate({ id: req.id })}
                                      title="Encerrar solicitação"
                                      className="p-1 text-muted-foreground hover:text-amber-400 transition-colors"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteDocReqMut.mutate({ id: req.id })}
                                    title="Excluir"
                                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* === ABA NOTAS === */}
                  {tab === "anotacoes" && (
                    <div className="p-4">
                      <NotesTab registrationId={order.id} />
                    </div>
                  )}

                  {tab === "historico" && (
                    <div className="p-4 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Histórico de Status</p>
                      {historyQuery.isLoading && (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
                        </div>
                      )}
                      {historyQuery.data && historyQuery.data.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">Nenhum histórico registrado</p>
                      )}
                      {historyQuery.data && historyQuery.data.map(h => {
                        const cfg = ACTIVE_STATUS_CONFIG[h.status];
                        return (
                          <div key={h.id} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 flex-shrink-0 ${cfg?.color || "text-muted-foreground"}`}>{cfg?.icon}</span>
                            <div className="flex-1">
                              <span className={`font-medium ${cfg?.color || ""}`}>{cfg?.label || h.status}</span>
                              {h.note && <p className="text-muted-foreground mt-0.5">{h.note}</p>}
                            </div>
                            <span className="text-muted-foreground flex-shrink-0">{formatDate(h.createdAt)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
                      );
                    })
                  })()
                  }
              </div>
                    </div>
                  ))}

                </div>
              )}
            </div>
          );
          })()}
            </div>
          );
        })()}

        {/* Arquivados não aparecem na busca — acesse a aba Arquivo para consultá-los */}
      </div>

      {/* ===== MODAL DE MENSAGENS RÁPIDAS WHATSAPP ===== */}
      {waModalOrder && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setWaModalOrder(null); } }}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-zinc-700">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-400" />
                Enviar via WhatsApp
              </h2>
              <button onClick={() => setWaModalOrder(null)} className="p-1 rounded hover:bg-white/10 text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Seleção de template */}
              {(waTemplates as any[]).length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 mb-2 font-medium">Escolher mensagem pré-molde:</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {(waTemplates as any[]).map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setWaModalSelectedId(t.id);
                          const nome = waModalOrder.customerName || waModalOrder.codeClientName || '';
                          const statusLabel2 = (dynamicStatuses as any[]).find((s: any) => s.key === waModalOrder.latestStatus)?.label || waModalOrder.latestStatus || '';
                          const baseMsg = t.message
                            .replace(/\{nome\}/gi, nome)
                            .replace(/\{status\}/gi, statusLabel2)
                            .replace(/\{pedido\}/gi, String(waModalOrder.orderNumber || waModalOrder.id))
                            .replace(/\{telefone\}/gi, waModalOrder.phone || '')
                            .replace(/\{servico\}/gi, waModalOrder.serviceName && waModalOrder.serviceName !== 'NULL' ? `${waModalOrder.serviceName}${waModalOrder.serviceOption && waModalOrder.serviceOption !== 'NULL' ? ` — ${waModalOrder.serviceOption}` : ''}` : '')
                            .replace(/\{cidade\}/gi, waModalOrder.customerCity ? `${waModalOrder.customerCity}${waModalOrder.customerUf ? ` — ${waModalOrder.customerUf}` : ''}` : '')
                            .replace(/\{previsao\}/gi, waModalOrder.deliveryEstimate ? new Date(waModalOrder.deliveryEstimate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
                          const mediaLines: string[] = [];
                          if (t.imageUrl) mediaLines.push(t.imageUrl);
                          if (t.videoUrl) mediaLines.push(t.videoUrl);
                          if (t.mediaFileUrl) mediaLines.push(t.mediaFileUrl);
                          setWaModalMsg(repairWhatsappReplacementIcons(mediaLines.length > 0 ? baseMsg + '\n\n' + mediaLines.join('\n') : baseMsg));
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                          waModalSelectedId === t.id
                            ? 'border-green-500/60 bg-green-500/10 text-green-200'
                            : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t.title}</span>
                          {t.isDefault === 1 && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded-full">Padrão</span>}
                          {t.statusKey && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">{t.statusKey}</span>}
                        </div>
                        {(t.imageUrl || t.videoUrl || t.mediaFileUrl) && (
                          <div className="flex flex-col gap-0.5 mt-1">
                            {t.imageUrl && <span className="text-[10px] text-zinc-400">🖼️ {t.imageTitle || 'imagem'}</span>}
                            {t.videoUrl && <span className="text-[10px] text-zinc-400">🎥 {t.videoTitle || 'vídeo'}</span>}
                            {t.mediaFileUrl && <span className="text-[10px] text-zinc-400">{t.mediaType === 'video' ? '🎥' : '🖼️'} arquivo</span>}
                          </div>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setWaModalSelectedId(null);
                        setWaModalMsg(waModalOrder.defaultMsg || '');
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                        waModalSelectedId === null
                          ? 'border-green-500/60 bg-green-500/10 text-green-200'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
                      }`}
                    >
                      <span className="font-medium">Mensagem padrão do sistema</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Texto editável */}
              <div>
                <p className="text-xs text-zinc-400 mb-2 font-medium">Texto da mensagem (editável):</p>
                <textarea
                  value={waModalMsg}
                  onChange={e => setWaModalMsg(e.target.value)}
                  rows={6}
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-green-500/60"
                />
              </div>
              {/* Pré-visualização da mensagem */}
              <div className="bg-[#0d1f16] border border-green-900/40 rounded-xl p-4">
                <p className="text-[10px] text-green-500/70 mb-2 font-medium uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                  Pré-visualização — como o cliente vai receber
                </p>
                <div className="bg-[#1a2e1e] rounded-xl rounded-tl-none px-4 py-3 text-sm text-white/90 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto font-sans shadow-inner">
                  {waModalMsg || <span className="text-zinc-500 italic">Nenhuma mensagem digitada</span>}
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">O cliente receberá exatamente este texto no WhatsApp.</p>
              </div>

              {/* Mídia do template selecionado */}
              {waModalSelectedId !== null && (() => {
                const t = (waTemplates as any[]).find((t: any) => t.id === waModalSelectedId);
                if (!t) return null;
                const mediaUrl = t.mediaFileUrl || t.imageUrl || t.videoUrl || null;
                if (!mediaUrl) return null;
                return (
                  <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3">
                    <p className="text-xs text-zinc-400 mb-2">Mídia anexada:</p>
                    {(t.mediaType === 'video' || t.videoUrl) ? (
                      <video src={mediaUrl} controls className="w-full rounded-lg max-h-40" />
                    ) : (
                      <img src={mediaUrl} alt="mídia" className="w-full rounded-lg max-h-40 object-contain" />
                    )}
                    <p className="text-[10px] text-zinc-500 mt-1 truncate">{mediaUrl}</p>
                  </div>
                );
              })()}

              <details className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-50/85">
                <summary className="cursor-pointer font-semibold text-amber-100">Diagnóstico temporário — payload real antes de abrir wa.me</summary>
                <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({
                  selectedTemplateId: waModalSelectedId,
                  payload: snapshotUnicodeText(waModalMsg),
                  url: `https://wa.me/${waModalOrder.waPhone}?text=${encodeURIComponent(waModalMsg)}`,
                  decodedUrlPayload: snapshotUnicodeText(new URL(`https://wa.me/${waModalOrder.waPhone}?text=${encodeURIComponent(waModalMsg)}`).searchParams.get("text") ?? ""),
                }, null, 2)}</pre>
              </details>

              {/* Botões de ação */}
              <div className="flex gap-3 pt-2">
                <a
                  href={`https://wa.me/${waModalOrder.waPhone}?text=${encodeURIComponent(waModalMsg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWaModalOrder(null)}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Abrir WhatsApp
                </a>
                <button
                  onClick={() => setWaModalOrder(null)}
                  className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
