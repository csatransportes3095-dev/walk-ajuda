import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Pencil, Trash2, Download, Search, X, Users, Gift, Camera, KeyRound, RefreshCw, Eye, EyeOff, ShieldCheck, ShieldOff, Lock, Unlock, Clock, FileText, FolderOpen, CheckSquare, Square, ListChecks, ExternalLink, Link2, Copy, Plus, DollarSign, BadgePercent, FileCheck, File, FileArchive, FileCode, FileJson, Music, Video, Upload, Image as ImageIcon } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { useTimezone } from "@/hooks/useTimezone";
import { useLocation } from "wouter";

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  cep?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  neighborhood?: string | null;
  addressComplement?: string | null;
  city: string | null;
  uf: string | null;
  referredBy: string | null;
  referredByPhone: string | null;
  profilePhotoUrl: string | null;
  lastAccessAt: number | Date | null;
  createdAt: number | Date;
  updatedAt: number | Date;
  hasOrder?: boolean;
  fixedPwdActive?: boolean;
  customerNumber?: number | null;
  orderNumber?: number | null;
  latestStatus?: string | null;
  isBlocked?: boolean;
  cpf?: string | null;
  blocked?: number;
  blockReason?: string | null;
  blockedAt?: number | Date | null;
};

// Apenas os objetos R2 recuperados precisam ignorar a cópia antiga marcada como imutável no navegador.
// A URL persistida em profilePhotoUrl nunca é alterada.
const REPAIRED_PROFILE_PHOTO_URLS = new Set([
  'https://midia.h2colombiano.com/profile-photos/11993425366-1786598497749.jpg',
  'https://midia.h2colombiano.com/profile-photos/11993425394-1786594938014.jpg',
  'https://midia.h2colombiano.com/profile-photos/11993425399-1786593788896.jpg',
]);

function getProfilePhotoDisplayUrl(profilePhotoUrl: string): string {
  if (!REPAIRED_PROFILE_PHOTO_URLS.has(profilePhotoUrl)) return profilePhotoUrl;
  return `${profilePhotoUrl}?repair=20260813`;
}

// formatDateBR agora usa useTimezone — ver abaixo no componente

// Mapa de status para label e cor
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  recebido:             { label: 'Pedido Recebido',        color: 'text-orange-400',  bg: 'bg-orange-500/20 border-orange-500/40' },
  pagamento_recebido:   { label: 'Pagamento Aprovado',     color: 'text-amber-400',   bg: 'bg-amber-500/20 border-amber-500/40' },
  em_andamento:         { label: 'Em Andamento',           color: 'text-orange-300',  bg: 'bg-orange-400/20 border-orange-400/40' },
  em_montagem:          { label: 'Montagens Documentos',   color: 'text-blue-400',    bg: 'bg-blue-500/20 border-blue-500/40' },
  documentos_aprovados: { label: 'Foto de Perfil Aprovada',color: 'text-amber-300',   bg: 'bg-amber-400/20 border-amber-400/40' },
  conta_ativa:          { label: 'Conta Ativa',            color: 'text-green-400',   bg: 'bg-green-500/20 border-green-500/40' },
  aguardando_ativa:     { label: 'Aguardando Ficar Ativa', color: 'text-lime-400',    bg: 'bg-lime-500/20 border-lime-500/40' },
  pedido_entregue:      { label: 'Pedido Entregue',        color: 'text-teal-400',    bg: 'bg-teal-500/20 border-teal-500/40' },
  cancelado:            { label: 'Cancelado',              color: 'text-red-400',     bg: 'bg-red-500/20 border-red-500/40' },
  aguardando_foto:      { label: 'Ag. Liberação Foto',     color: 'text-purple-400',  bg: 'bg-purple-500/20 border-purple-500/40' },
  foto_analise:         { label: 'Foto em Análise',        color: 'text-yellow-400',  bg: 'bg-yellow-500/20 border-yellow-500/40' },
  login_liberando:      { label: 'Login Liberando',        color: 'text-cyan-400',    bg: 'bg-cyan-500/20 border-cyan-500/40' },
};

// Botão que navega para a aba de pedidos com o pedido já filtrado/aberto
function GoToOrderButton({ orderNumber }: { orderNumber: number }) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        setLocation(`/admin/orders?search=%23${orderNumber}`);
      }}
      title={`Abrir pedido #${orderNumber} na aba de pedidos`}
      className="flex-shrink-0 p-0.5 rounded text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors"
    >
      <ExternalLink className="w-3 h-3" />
    </button>
  );
}

// Componente inline para buscar nome do indicador pelo telefone
function ReferrerAutoFill({ phone, onNameFound }: { phone: string; onNameFound: (name: string) => void }) {
  const cleanPhone = phone.replace(/\D/g, '');
  const q = trpc.orderStatus.lookupReferrerByPhone.useQuery(
    { phone: cleanPhone },
    { enabled: cleanPhone.length >= 10, staleTime: 0 }
  );
  useEffect(() => {
    if (q.data?.found && q.data.name) onNameFound(q.data.name);
  }, [q.data?.found, q.data?.name]);
  if (cleanPhone.length < 10) return null;
  if (q.isLoading) return <span className="text-xs text-muted-foreground block mt-0.5">Buscando...</span>;
  if (q.data?.found) return <span className="text-xs text-green-400 block mt-0.5">✓ {q.data.name}</span>;
  return <span className="text-xs text-yellow-400 block mt-0.5">⚠ Não encontrado no sistema</span>;
}

// Widget de controle de rotas permitidas por cliente
function RouteAccessWidget({ phone }: { phone: string }) {
  const { data, refetch } = trpc.spreadsheet.getClientRoutesByPhone.useQuery(
    { phone: phone.replace(/\D/g, '') },
    { staleTime: 0 }
  );
  const updateRoutesMut = trpc.spreadsheet.updateClientRoutesByPhone.useMutation({
    onSuccess: () => refetch(),
  });

  const ROUTES = [
    { key: 'site', label: 'Site Principal', icon: '🏠' },
    { key: 'gastos', label: 'Gastos', icon: '📊' },
    { key: 'emprestimo', label: 'Empréstimos', icon: '💳' },
  ];

  // A interface reage no mesmo toque; a fonte de verdade continua sendo a rota central no servidor.
  const [optimisticRoutes, setOptimisticRoutes] = useState<string[] | null>(null);
  const serverHasRestriction = !!(data?.allowedRoutes);
  const serverRoutes = (data?.allowedRoutes || '').split(',').map((r: string) => r.trim()).filter(Boolean);
  const hasRestriction = optimisticRoutes !== null || serverHasRestriction;
  const routes = optimisticRoutes ?? serverRoutes;

  const handleToggle = async (routeKey: string, checked: boolean) => {
    const routeLabel = ROUTES.find((route) => route.key === routeKey)?.label || routeKey;
    let restrictionReason: string | undefined;
    if (!checked) {
      const reason = window.prompt(
        `Informe o motivo da desativação de ${routeLabel}. Esse texto será exibido ao cliente como aviso do sistema.`,
        'Acesso temporariamente desativado pela administração.',
      );
      if (reason === null) return;
      const clean = reason.trim();
      if (!clean) {
        toast.error('Informe o motivo da desativação para continuar.');
        return;
      }
      restrictionReason = clean;
    }

    let newRoutes: string[];
    if (!hasRestriction) {
      newRoutes = checked ? ROUTES.map(r => r.key) : ROUTES.map(r => r.key).filter(k => k !== routeKey);
    } else {
      newRoutes = checked ? [...routes.filter(r => r !== routeKey), routeKey] : routes.filter(r => r !== routeKey);
    }
    setOptimisticRoutes(newRoutes);
    try {
      await updateRoutesMut.mutateAsync({
        phone: phone.replace(/\D/g, ''),
        allowedRoutes: newRoutes.join(','),
        disabledRoute: checked ? undefined : (routeKey as 'site' | 'gastos' | 'emprestimo'),
        restrictionReason,
      });
      toast.success(checked
        ? `${routeLabel} liberado.`
        : `${routeLabel} desativado. O motivo será exibido automaticamente ao cliente.`);
      await refetch();
    } finally {
      setOptimisticRoutes(null);
    }
  };

  return (
    <div className="w-full rounded-xl border border-slate-500/45 bg-gradient-to-r from-slate-700/20 to-slate-700/10 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-black text-slate-100">🔑 Rotas de acesso</span>
        {!hasRestriction && <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[8px] font-black text-green-300">TOTAL</span>}
      </div>
      <div className="grid gap-1.5">
        {ROUTES.map(({ key, label, icon }) => {
          const isAllowed = !hasRestriction || routes.includes(key);
          return <label key={key} className={`grid h-10 cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border px-2.5 transition-colors ${isAllowed ? 'border-green-400/30 bg-green-500/10' : 'border-red-400/20 bg-red-500/5'} ${updateRoutesMut.isPending ? 'cursor-wait opacity-70' : 'hover:bg-white/5'}`}>
            <span className={`min-w-0 truncate text-xs font-bold ${isAllowed ? 'text-green-200' : 'text-slate-400'}`}>{icon} {label}</span>
            <span className={`whitespace-nowrap text-[10px] font-black ${isAllowed ? 'text-green-300' : 'text-red-300'}`}>{isAllowed ? 'LIBERADO' : 'BLOQUEADO'}</span>
            <input type="checkbox" checked={isAllowed} disabled={updateRoutesMut.isPending} onChange={(event) => handleToggle(key, event.target.checked)} className="h-5 w-5 shrink-0 cursor-pointer accent-green-500" />
          </label>;
        })}
      </div>
      <p className="mt-1.5 text-[9px] font-medium leading-tight text-cyan-200/75">Liberação e bloqueio enviados ao cliente imediatamente.</p>
    </div>
  );
}

// Botão de contador de indicações
function ReferralCountButton({ phone, name }: { phone: string; name: string }) {
  const [, setLocation] = useLocation();
  const { data: stats } = trpc.referrals.getStats.useQuery(
    { phone: phone.replace(/\D/g, '') },
    { staleTime: 0 }
  );

  const totalReferred = stats?.totalReferred ?? 0;
  const hasReferrals = totalReferred > 0;
  const bgColor = hasReferrals ? "from-green-600/20 to-emerald-600/20 border-green-500/40" : "from-slate-600/20 to-slate-600/20 border-slate-500/40";
  const textColor = hasReferrals ? "text-green-400" : "text-slate-400";
  const countColor = hasReferrals ? "text-green-300" : "text-slate-300";
  return (
    <div className={`w-full px-2.5 py-1.5 bg-gradient-to-r ${bgColor} border rounded-lg`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${textColor}`}>
          <span>🚗</span> Indicou
        </span>
        <span className={`text-sm font-bold ${countColor}`}>{totalReferred}</span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setLocation(`/admin/referrals?phone=${phone.replace(/\D/g, '')}`);
          }}
          className={`flex-1 text-[10px] px-2 py-1 rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors ${!hasReferrals ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={!hasReferrals}
          title="Ver histórico de indicações"
        >
          Histórico
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setLocation(`/admin/referral-tree?phone=${phone.replace(/\D/g, '')}`);
          }}
          className="flex-1 text-[10px] px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors"
          title="Ver árvore genealógica de indicações"
        >
          Árvore
        </button>
      </div>
    </div>
  );
}

// Componente de formulário de indicação manual com autocomplete de nome
function ManualReferralForm({
  manualName,
  manualPhone,
  onNameChange,
  onPhoneChange,
  onConfirm,
  onCancel,
  isPending,
}: {
  manualName: string;
  manualPhone: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const cleanPhone = manualPhone.replace(/\D/g, '');
  const lookupQuery = trpc.orderStatus.lookupReferrerByPhone.useQuery(
    { phone: cleanPhone },
    { enabled: cleanPhone.length >= 10, staleTime: 0 }
  );

  useEffect(() => {
    if (lookupQuery.data?.found && lookupQuery.data.name && !manualName) {
      onNameChange(lookupQuery.data.name);
    }
  }, [lookupQuery.data?.found, lookupQuery.data?.name]);

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-400">Adicionar Indicação Manual</p>
      <div>
        <input
          type="text"
          placeholder="Telefone do indicado (ex: 11999999999)"
          value={manualPhone}
          onChange={(e) => onPhoneChange(e.target.value)}
          className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        {cleanPhone.length >= 10 && (
          <div className="mt-1">
            {lookupQuery.isLoading && <span className="text-xs text-muted-foreground">Buscando...</span>}
            {lookupQuery.data?.found && <span className="text-xs text-green-400">✓ {lookupQuery.data.name}</span>}
            {lookupQuery.data && !lookupQuery.data.found && <span className="text-xs text-yellow-400">⚠ Telefone não encontrado no sistema</span>}
          </div>
        )}
      </div>
      <input
        type="text"
        placeholder="Nome do indicado"
        value={manualName}
        onChange={(e) => onNameChange(e.target.value)}
        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      />
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {isPending ? 'Salvando...' : 'Confirmar'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground text-xs rounded-lg transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Componente de histórico de logins do cliente
function LoginHistoryColumn({ phone, formatDate }: { phone: string; formatDate: (ts: number) => string }) {
  const cleanPhone = phone.replace(/\D/g, '');
  const { data, isLoading } = trpc.customerPassword.adminGetLoginHistory.useQuery(
    { phone: cleanPhone },
    { enabled: cleanPhone.length >= 10, staleTime: 0 }
  );

  return (
    <div className="flex-shrink-0 w-[110px] border-r border-border/40 pr-2 mr-2">
      <div className="flex items-center gap-1 mb-1.5">
        <Clock className="w-3 h-3 text-blue-400 flex-shrink-0" />
        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">Acessos</span>
      </div>
      {isLoading ? (
        <div className="space-y-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-3 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="text-[11px] font-bold text-foreground mb-1.5">
            <span className="text-blue-400">{data?.total ?? 0}</span>
            <span className="text-muted-foreground font-normal"> total</span>
          </div>
          {data?.recent && data.recent.length > 0 ? (
            <div className="space-y-1">
              {data.recent.map((ts: number, i: number) => (
                <div key={i} className="text-[9px] text-muted-foreground leading-tight">
                  {formatDate(ts)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground/60 italic">Nenhum acesso</p>
          )}
        </>
      )}
    </div>
  );
}


export default function AdminCustomers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCep, setEditCep] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editAddressNumber, setEditAddressNumber] = useState("");
  const [editNeighborhood, setEditNeighborhood] = useState("");
  const [editAddressComplement, setEditAddressComplement] = useState("");
  const [editProfilePhotoUrl, setEditProfilePhotoUrl] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editUf, setEditUf] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editReferredBy, setEditReferredBy] = useState("");
  const [editReferredByPhone, setEditReferredByPhone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editCustomerNumber, setEditCustomerNumber] = useState<string>("");
  // Valores originais: o update envia somente o que o ADM realmente modificar.
  const [editOriginal, setEditOriginal] = useState<Record<string, string> | null>(null);
  const [editIsReseller, setEditIsReseller] = useState(false);
  const [editResellerDiscountType, setEditResellerDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [editResellerDiscountValue, setEditResellerDiscountValue] = useState<string>('0');
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<number | null>(null);
  // Estado apenas de interface: nunca substitui nem remove profilePhotoUrl no banco.
  const [failedProfilePhotoIds, setFailedProfilePhotoIds] = useState<Set<number>>(() => new Set());
  const [fixedPwdModal, setFixedPwdModal] = useState<Customer | null>(null);
  const [fixedPwdInput, setFixedPwdInput] = useState("");
  const [fixedPwdActive, setFixedPwdActive] = useState(false);
  const [fixedPwdVisible, setFixedPwdVisible] = useState(false);
  const [loadingFixedPwd, setLoadingFixedPwd] = useState(false);
  const [fixedPwdLastAccess, setFixedPwdLastAccess] = useState<number | string | null>(null);
  const [allowedProductIds, setAllowedProductIds] = useState<number[]>([]);
  const [filesModal, setFilesModal] = useState<Customer | null>(null);
  const [customerDocumentsModal, setCustomerDocumentsModal] = useState<Customer | null>(null);
  const [referralModal, setReferralModal] = useState<Customer | null>(null);
  const [newLinkCommission, setNewLinkCommission] = useState('');
  const [newLinkType, setNewLinkType] = useState<'fixed' | 'percent'>('fixed');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // O resumo dos cards fica compacto; dados operacionais continuam disponíveis ao expandir o cliente.
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<number>>(new Set());
  const [showOnlyOrders, setShowOnlyOrders] = useState(false);
  const [showOnlyBlocked, setShowOnlyBlocked] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">("newest");
  const { fmt: formatDateBR } = useTimezone();
  const [, setLocation] = useLocation();

  // Modal de cadastro manual
  const [createModal, setCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createCpf, setCreateCpf] = useState('');
  const [createCity, setCreateCity] = useState('');
  const [createUf, setCreateUf] = useState('');
  const [createPhotoUrl, setCreatePhotoUrl] = useState('');
  const [createReferrerPhone, setCreateReferrerPhone] = useState('');
  const [createError, setCreateError] = useState('');

  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ rows: number; headers: string[]; sample: string[] } | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ imported: number; duplicates: number; errors: number; details: string[] } | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const adminCreateMut = trpc.customerUpdate.adminCreatePartial.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Cliente cadastrado com sucesso!');
        setCreateModal(false);
        setCreateName(''); setCreatePhone(''); setCreateEmail('');
        setCreateCpf(''); setCreateCity(''); setCreateUf(''); setCreatePhotoUrl(''); setCreateReferrerPhone('');
        setCreateError('');
        customersQuery.refetch();
      }
    },
    onError: (e) => setCreateError(e.message || 'Erro ao cadastrar cliente'),
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPhotoModal(null); };
    if (photoModal) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [photoModal]);

  // A lista geral de Clientes permanece visível durante recargas transitórias.
  // Esta área não carrega nem apresenta informações de H2 Score.
  const customersQuery = trpc.customers.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
  const routeReleaseModesQuery = trpc.customers.routeReleaseModes.useQuery();
  const setRouteReleaseModeMut = trpc.customers.setRouteReleaseMode.useMutation({
    onSuccess: () => { routeReleaseModesQuery.refetch(); toast.success('Modo de liberação atualizado.'); },
    onError: (error) => toast.error(error.message || 'Não foi possível atualizar o modo de liberação.'),
  });
  const updateMut = trpc.customers.update.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Cliente atualizado!"); setEditingId(null); },
    onError: (error) => toast.error(error.message || "Erro ao atualizar cliente"),
  });
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ id: number; name: string } | null>(null);
  const [deleteWithOrdersLoading, setDeleteWithOrdersLoading] = useState(false);

  const deleteMut = trpc.customers.delete.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Cliente movido para a lixeira!"); setEditingId(null); setDeleteConfirmModal(null); },
    onError: (e) => {
      if (e.message?.includes('CUSTOMER_HAS_ORDERS')) {
        // Mostrar diálogo perguntando se quer excluir junto com os pedidos
        setDeleteConfirmModal(prev => prev ? { ...prev, hasOrders: true } as any : null);
        toast.error("⚠️ Este cliente possui pedidos ativos. Escolha como prosseguir.", { duration: 4000 });
      } else {
        toast.error("Erro ao excluir cliente");
      }
    },
  });

  const deleteWithOrdersMut = trpc.customers.deleteWithOrders.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Cliente e pedidos movidos para a lixeira!"); setDeleteConfirmModal(null); setDeleteWithOrdersLoading(false); },
    onError: () => { toast.error("Erro ao excluir cliente com pedidos"); setDeleteWithOrdersLoading(false); },
  });
  const setFixedPwdMut = trpc.customers.setFixedPassword.useMutation({
    onSuccess: () => { toast.success('Senha fixa salva!'); setFixedPwdModal(null); customersQuery.refetch(); },
    onError: () => toast.error('Erro ao salvar senha fixa'),
  });
  const setProductAccessMut = trpc.customers.setProductAccess.useMutation({
    onError: () => toast.error('Erro ao salvar permissões de produto'),
  });
  const setResellerMut = trpc.customers.setReseller.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success('Configuração de revendedor salva!'); },
    onError: () => toast.error('Erro ao salvar configuração de revendedor'),
  });
  const clearNotesMut = trpc.customers.clearNotes.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Avisos removidos!"); },
    onError: () => toast.error("Erro ao remover avisos"),
  });
  const [blockModal, setBlockModal] = useState<Customer | null>(null);
  const [blockReasonInput, setBlockReasonInput] = useState("");
  const blockMut = trpc.customers.block.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Cliente bloqueado!"); setBlockModal(null); setBlockReasonInput(""); },
    onError: () => toast.error("Erro ao bloquear cliente"),
  });
  const unblockMut = trpc.customers.unblock.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Cliente desbloqueado!"); },
    onError: () => toast.error("Erro ao desbloquear cliente"),
  });
  const productsQuery = trpc.products.listActive.useQuery();
  const utils = trpc.useUtils();

  const openFixedPwdModal = async (c: Customer) => {
    setFixedPwdModal(c);
    setFixedPwdInput('');
    setFixedPwdActive(false);
    setFixedPwdVisible(false);
    setFixedPwdLastAccess(null);
    setAllowedProductIds([]);
    setLoadingFixedPwd(true);
    try {
      const [pwdData, accessData] = await Promise.all([
        utils.customers.getFixedPassword.fetch({ phone: c.phone }),
        utils.customers.getProductAccess.fetch({ phone: c.phone }),
      ]);
      setFixedPwdInput(pwdData?.password ?? '');
      setFixedPwdActive(pwdData?.active ?? false);
      setFixedPwdLastAccess(pwdData?.lastAccessAt ?? null);
      setAllowedProductIds(accessData?.productIds ?? []);
    } catch { /* ignore */ }
    setLoadingFixedPwd(false);
  };

  const generateRandomPwd = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setFixedPwdInput(pwd);
  };

  const parseCsvLine = (line: string) => {
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
      } else if (char === ',' && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map(cell => cell.replace(/^"([\s\S]*)"$/, '$1').replace(/""/g, '"').trim());
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
      const response = await fetch("/api/clients/import-csv", {
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
        toast.success(`Importação concluída: ${data.imported ?? 0} clientes importados.`);
        await customersQuery.refetch();
      }
    } catch (error) {
      setCsvErrors(["Erro de rede ao enviar o CSV."]);
      toast.error("Erro de rede ao enviar o CSV.");
    } finally {
      setCsvImporting(false);
    }
  };

  const uploadPhotoMut = trpc.customers.uploadProfilePhoto.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Foto atualizada!"); setUploadingPhotoFor(null); },
    onError: () => { toast.error("Erro ao enviar foto"); setUploadingPhotoFor(null); },
  });

  const handlePhotoUpload = (customer: Customer, file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('A foto deve ter no máximo 5MB'); return; }
    setUploadingPhotoFor(customer.id);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      uploadPhotoMut.mutate({ imageBase64: base64, phone: customer.phone });
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePhotoUpload = (file: File) => {
    if (!createPhone || createPhone.length < 10) { setCreateError('Informe o telefone antes de enviar a foto'); return; }
    if (!file.type.startsWith('image/')) { setCreateError('Selecione uma imagem válida'); return; }
    if (file.size > 5 * 1024 * 1024) { setCreateError('A foto deve ter no máximo 5MB'); return; }
    setCreateError('');
    setUploadingPhotoFor(-1);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const result = await uploadPhotoMut.mutateAsync({ imageBase64: base64, phone: createPhone });
        setCreatePhotoUrl(result.url || '');
      } catch {
        setCreateError('Não foi possível enviar a foto');
      } finally {
        setUploadingPhotoFor(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const customers: Customer[] = (customersQuery.data || []) as unknown as Customer[];

  const sortedCustomers = [...customers].sort((a, b) => {
    if (sortOrder === "name") return a.name.localeCompare(b.name, 'pt-BR');
    if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
  });
  const filtered = sortedCustomers.filter((c) => {
    const rawTerm = searchTerm.trim();
    const term = rawTerm.toLowerCase();
    const isOrderSearch = rawTerm.startsWith("#");
    const isCadastroSearch = rawTerm.startsWith("*");
    const orderSearchNum = isOrderSearch ? rawTerm.slice(1) : "";
    const cadastroSearchNum = isCadastroSearch ? rawTerm.slice(1) : "";
    // Normalizar número de telefone: remover parênteses, espaços, hífens e +
    const termDigitsOnly = rawTerm.replace(/[^\d]/g, "");
    const isPureNumber = !isOrderSearch && !isCadastroSearch && /^\d+$/.test(term);
    const isFormattedPhone = !isOrderSearch && !isCadastroSearch && termDigitsOnly.length >= 8 && termDigitsOnly !== term;

    let matchSearch: boolean;
    if (!rawTerm) {
      matchSearch = true;
    } else if (isOrderSearch) {
      matchSearch = c.orderNumber != null && String(c.orderNumber) === orderSearchNum;
    } else if (isCadastroSearch) {
      matchSearch = c.customerNumber != null && String(c.customerNumber) === cadastroSearchNum;
    } else if (isPureNumber) {
      const exactMatch = c.customerNumber != null && String(c.customerNumber) === term;
      const fallback = !exactMatch && (
        (c.orderNumber != null && String(c.orderNumber) === term) ||
        c.phone.includes(term)
      );
      matchSearch = exactMatch || fallback;
    } else if (isFormattedPhone) {
      // Busca por telefone formatado: comparar apenas dígitos
      const phoneDigits = (c.phone || "").replace(/[^\d]/g, "");
      matchSearch = phoneDigits.includes(termDigitsOnly) || termDigitsOnly.includes(phoneDigits);
    } else {
      matchSearch = c.name.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        (c.phone || "").replace(/[^\d]/g, "").includes(termDigitsOnly) ||
        (c.email || "").toLowerCase().includes(term) ||
        (c.city || "").toLowerCase().includes(term) ||
        (c.referredBy || "").toLowerCase().includes(term) ||
        (c.referredByPhone || "").includes(term);
    }
    if (showOnlyOrders) return matchSearch && !!c.hasOrder;
    if (showOnlyBlocked) return matchSearch && c.blocked === 1;
    return matchSearch;
  });

  const startEdit = (c: Customer) => {
    setEditOriginal({
      name: String(c.name || '').trim(),
      phone: String(c.phone || '').replace(/\D/g, ''),
      cep: String(c.cep || '').trim(),
      street: String(c.street || '').trim(),
      addressNumber: String(c.addressNumber || '').trim(),
      neighborhood: String(c.neighborhood || '').trim(),
      addressComplement: String(c.addressComplement || '').trim(),
      profilePhotoUrl: String(c.profilePhotoUrl || '').trim(),
      city: String(c.city || '').trim(),
      uf: String(c.uf || '').trim().toUpperCase(),
      email: String(c.email || '').trim().toLowerCase(),
      referredBy: String(c.referredBy || '').trim(),
      referredByPhone: String(c.referredByPhone || '').replace(/\D/g, ''),
      cpf: String((c as any).cpf || '').replace(/\D/g, ''),
      customerNumber: (c as any).customerNumber ? String((c as any).customerNumber) : '',
    });
    setEditingId(c.id);
    setEditName(c.name);
    setEditPhone(c.phone || "");
    setEditCep(c.cep || "");
    setEditStreet(c.street || "");
    setEditAddressNumber(c.addressNumber || "");
    setEditNeighborhood(c.neighborhood || "");
    setEditAddressComplement(c.addressComplement || "");
    setEditProfilePhotoUrl(c.profilePhotoUrl || "");
    setEditCity(c.city || "");
    setEditUf(c.uf || "");
    setEditEmail(c.email || "");
    setEditReferredBy(c.referredBy || "");
    setEditReferredByPhone(c.referredByPhone || "");
    setEditCpf((c as any).cpf || "");
    setEditCustomerNumber((c as any).customerNumber ? String((c as any).customerNumber) : "");
    setEditIsReseller(!!(c as any).isReseller);
    setEditResellerDiscountType(((c as any).resellerDiscountType as 'percent' | 'fixed') || 'percent');
    setEditResellerDiscountValue(String((c as any).resellerDiscountValue ?? '0'));
  };

  const saveEdit = () => {
    if (!editingId) return;
    const parsedCustomerNumber = editCustomerNumber ? parseInt(editCustomerNumber, 10) : null;
    if (editCustomerNumber && (isNaN(parsedCustomerNumber!) || parsedCustomerNumber! <= 0)) {
      toast.error("Número de cadastro inválido");
      return;
    }

    // Não reenviar CPF, e-mail, número de cadastro ou outros campos se o ADM só
    // alterou o telefone. Isso impede que uma regra antiga de outro campo bloqueie
    // a atualização principal do telefone.
    const original = editOriginal || {};
    const payload: Record<string, any> = { id: editingId };
    const changed = (field: string, value: string) => value !== String(original[field] || '');
    const name = editName.trim();
    const cep = editCep.trim();
    const street = editStreet.trim();
    const addressNumber = editAddressNumber.trim();
    const neighborhood = editNeighborhood.trim();
    const addressComplement = editAddressComplement.trim();
    const profilePhotoUrl = editProfilePhotoUrl.trim();
    const city = editCity.trim();
    const uf = editUf.trim().toUpperCase();
    const email = editEmail.trim().toLowerCase();
    const referredBy = editReferredBy.trim();
    const referredByPhone = editReferredByPhone.replace(/\D/g, '');
    const cpf = editCpf.replace(/\D/g, '');
    const customerNumber = parsedCustomerNumber ? String(parsedCustomerNumber) : '';

    if (changed('name', name)) payload.name = name;
    if (changed('email', email)) payload.email = email;
    if (changed('cep', cep)) payload.cep = cep;
    if (changed('street', street)) payload.street = street;
    if (changed('addressNumber', addressNumber)) payload.addressNumber = addressNumber;
    if (changed('neighborhood', neighborhood)) payload.neighborhood = neighborhood;
    if (changed('addressComplement', addressComplement)) payload.addressComplement = addressComplement;
    if (changed('profilePhotoUrl', profilePhotoUrl)) payload.profilePhotoUrl = profilePhotoUrl;
    if (changed('city', city)) payload.city = city;
    if (changed('uf', uf)) payload.uf = uf;
    if (changed('referredBy', referredBy)) payload.referredBy = referredBy;
    if (changed('referredByPhone', referredByPhone)) payload.referredByPhone = referredByPhone;
    if (changed('cpf', cpf)) payload.cpf = cpf;
    if (changed('customerNumber', customerNumber)) payload.customerNumber = parsedCustomerNumber;

    if (Object.keys(payload).length === 1) {
      toast.info('Nenhuma alteração para salvar.');
      return;
    }
    updateMut.mutate(payload as any);
  };

  const handleDownloadPhoto = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const safeName = name.replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').trim().replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `foto_${safeName}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Foto salva!');
    } catch {
      toast.error('Erro ao baixar foto');
    }
  };

  const handleDelete = (id: number, name: string) => {
    setDeleteConfirmModal({ id, name });
  };

  const formatPhoneInput = (value: string) => {
    const d = value.replace(/\D/g, "").slice(0, 11);
    let f = d;
    if (d.length > 7) f = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    else if (d.length > 2) f = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return f;
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllWithOrders = () => {
    setShowOnlyOrders(true);
    const withOrders = customers.filter(c => c.hasOrder).map(c => c.id);
    setSelectedIds(new Set(withOrders));
  };

  const selectAllBlocked = () => {
    setShowOnlyBlocked(true);
    setShowOnlyOrders(false);
    const blocked = customers.filter(c => c.blocked === 1).map(c => c.id);
    setSelectedIds(new Set(blocked));
  };

  const clearSelection = () => { setSelectedIds(new Set()); setShowOnlyOrders(false); setShowOnlyBlocked(false); };

  const toggleCustomerDetails = (id: number) => {
    setExpandedCustomerIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    const headers = ["Nome", "Telefone", "Email", "Cidade", "UF", "Indicado por", "Tel. Indicador", "Data Cadastro"];
    const rows = filtered.map((c) => [
      c.name,
      c.phone,
      c.email || "",
      c.city || "",
      c.uf || "",
      c.referredBy || "",
      c.referredByPhone || "",
      formatDateBR(c.createdAt, false),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  return (
    <>
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader title={`Clientes (${filtered.length}${filtered.length !== customers.length ? ` de ${customers.length}` : ""})`} icon={<Users className="w-5 h-5" />} rightContent={
        <div className="flex items-center gap-1.5">
          <button onClick={() => setCreateModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Novo Cadastro</span>
          </button>
          <a href="/admin/trash" className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-600/30 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lixeira</span>
          </a>
          <a href="/admin/raffles" className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-600/30 transition-colors">
            <Gift className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sorteios</span>
          </a>

          <button onClick={() => setShowCsvImportModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Importar CSV</span>
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      } />

      <section className="mx-3 mt-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 sm:mx-4">
        <div className="mb-2">
          <p className="text-sm font-bold text-sky-100">Modo de liberação de acesso</p>
          <p className="text-xs text-sky-100/70">Automático libera a rota após o cadastro completo; manual envia para aprovação.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { key: 'site', label: 'Site de Pedidos' },
            { key: 'acompanhar', label: 'Acompanhar Pedido' },
            { key: 'gastos', label: 'Controle de Gastos' },
            { key: 'emprestimo', label: 'Empréstimos' },
          ].map((route) => {
            const mode = (routeReleaseModesQuery.data as any)?.[route.key] || 'automatico';
            return <div key={route.key} className="rounded-lg border border-sky-500/20 bg-background/50 p-2.5">
              <p className="mb-2 text-xs font-bold">{route.label}</p>
              <div className="flex gap-1">
                {(['automatico', 'manual'] as const).map((option) => <button key={option} onClick={() => setRouteReleaseModeMut.mutate({ route: route.key as any, mode: option })} disabled={setRouteReleaseModeMut.isPending} className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition-colors ${mode === option ? 'bg-sky-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{option === 'automatico' ? 'Automático' : 'Manual'}</button>)}
              </div>
            </div>;
          })}
        </div>
      </section>


      {showCsvImportModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Importar clientes CSV</h2>
                <p className="text-sm text-muted-foreground">Envie um arquivo CSV com clientes. Telefones duplicados no arquivo serão ignorados.</p>
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

      <div className="container py-4 space-y-4">
        {/* Busca + Ordenação */}
        <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, telefone, email, cidade, indicação, #nº pedido, *nº cadastro..."
            className="w-full pl-9 pr-9 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as "newest" | "oldest" | "name")}
          className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 flex-shrink-0"
        >
          <option value="newest">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
          <option value="name">Nome A-Z</option>
        </select>
        </div>

        {/* Barra de Seleção em Massa */}
        {(customers.some(c => c.hasOrder) || customers.some(c => c.blocked === 1) || selectedIds.size > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {!showOnlyOrders && customers.some(c => c.hasOrder) && (
          <button
            onClick={selectAllWithOrders}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium hover:bg-green-600/30 transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5" />
            Selecionar todos com pedidos ({customers.filter(c => c.hasOrder).length})
          </button>
          )}
          {!showOnlyBlocked && customers.some(c => c.blocked === 1) && (
          <button
            onClick={selectAllBlocked}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-600/30 transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5" />
            Ver somente bloqueados ({customers.filter(c => c.blocked === 1).length})
          </button>
          )}
          {showOnlyBlocked && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/30 border border-red-500/50 text-red-300 rounded-lg text-xs font-medium">
            <ListChecks className="w-3.5 h-3.5" />
            Mostrando {filtered.length} bloqueado(s)
          </span>
          )}
          {showOnlyOrders && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/30 border border-green-500/50 text-green-300 rounded-lg text-xs font-medium">
            <ListChecks className="w-3.5 h-3.5" />
            Mostrando {filtered.length} com pedidos
          </span>
          )}
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</span>
              <button
                onClick={() => {
                  const selectedCustomers = filtered.filter(c => selectedIds.has(c.id));
                  const headers = ["Nome", "Telefone", "Email", "Cidade", "UF", "Indicado por", "Tel. Indicador", "Data Cadastro"];
                  const rows = selectedCustomers.map(c => [c.name, c.phone, c.email || "", c.city || "", c.uf || "", c.referredBy || "", c.referredByPhone || "", new Date(c.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })]);
                  const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `clientes_selecionados_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`CSV exportado com ${selectedIds.size} clientes!`);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
              <button
                onClick={clearSelection}
                className="flex items-center gap-1 px-3 py-1.5 bg-muted border border-border text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Limpar
              </button>
            </>
          )}
        </div>
        )}

        {/* Grid de Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className={`rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 ${selectedIds.has(c.id) ? 'ring-2 ring-green-400' : editingId === c.id ? 'ring-2 ring-blue-400' : ''}`} style={{
                background: c.blocked === 1
                  ? 'linear-gradient(135deg, #450a0a 0%, #1c0606 100%)'
                  : c.hasOrder
                  ? 'linear-gradient(135deg, #052e16 0%, #021a0c 100%)'
                  : 'linear-gradient(135deg, #1e1b4b 0%, #0f0b2e 100%)',
                border: c.blocked === 1
                  ? '2px solid rgba(239,68,68,0.8)'
                  : c.hasOrder
                  ? '2px solid rgba(34,197,94,0.7)'
                  : '2px solid rgba(99,102,241,0.6)',
                boxShadow: c.blocked === 1
                  ? '0 4px 20px rgba(239,68,68,0.35)'
                  : c.hasOrder
                  ? '0 4px 20px rgba(34,197,94,0.3)'
                  : '0 4px 20px rgba(99,102,241,0.25)',
              }}>
              {/* Topo: foto + info + ações */}
              <div className="p-4 pb-3">
                {/* Linha 1: checkbox + foto + info + ações */}
                <div className="flex items-start gap-2">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(c.id)}
                    className={`mt-1 flex-shrink-0 transition-colors ${selectedIds.has(c.id) ? 'text-green-400' : 'text-muted-foreground hover:text-foreground'}`}
                    title={selectedIds.has(c.id) ? 'Desmarcar' : 'Selecionar'}
                  >
                    {selectedIds.has(c.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Foto */}
                  <div className="relative flex-shrink-0 group">
                    {c.isBlocked && (
                      <span
                        className="absolute -top-1 -right-1 z-10 w-4 h-4 rounded-full bg-red-500 border-2 border-background shadow-lg animate-pulse"
                        title="Telefone na lista negra do sistema"
                      />
                    )}
                    {c.profilePhotoUrl && !failedProfilePhotoIds.has(c.id) ? (
                      <img
                        src={getProfilePhotoDisplayUrl(c.profilePhotoUrl)}
                        alt=""
                        aria-label={`Foto de ${c.name}`}
                        className={`w-16 h-16 rounded-full object-cover shadow cursor-pointer hover:opacity-90 transition-opacity ${c.isBlocked ? 'border-2 border-red-500/60' : 'border-2 border-primary/30'}`}
                        onError={() => setFailedProfilePhotoIds((previous) => new Set(previous).add(c.id))}
                        onClick={() => setPhotoModal({ url: getProfilePhotoDisplayUrl(c.profilePhotoUrl!), name: c.name })}
                        title="Clique para ampliar a foto"
                      />
                    ) : (
                      <div className={`w-16 h-16 rounded-full bg-muted flex items-center justify-center ${c.isBlocked ? 'border-2 border-red-500/60' : 'border-2 border-border'}`}>
                        {uploadingPhotoFor === c.id
                          ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          : <ImageIcon className="w-6 h-6 text-muted-foreground" aria-label="Avatar padrão" />
                        }
                      </div>
                    )}
                    <label
                      className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center cursor-pointer shadow border-2 border-background hover:bg-primary/80 transition-colors"
                      title="Trocar foto"
                    >
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(c, f); e.target.value = ''; }} />
                      {uploadingPhotoFor === c.id
                        ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Camera className="w-3 h-3 text-white" />
                      }
                    </label>
                  </div>

                  {/* Info ao lado da foto */}
                  <div className="flex-1 min-w-0">
                    {/* Nome + badges */}
                    <p className="text-sm font-bold text-foreground leading-tight flex items-center gap-1.5 flex-wrap">
                      {c.customerNumber && (
                        <span className="flex-shrink-0 text-[11px] font-mono font-bold text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 leading-none" title="Número de cadastro">*{c.customerNumber}</span>
                      )}
                      <span className="truncate">{c.name}</span>
                      {c.fixedPwdActive && <Lock className="w-3 h-3 text-yellow-400 flex-shrink-0" aria-label="Senha fixa ativa" />}
                    </p>
                    {/* Badge bloqueado */}
                    {c.isBlocked && (
                      <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/40 uppercase tracking-wide" title="Telefone na lista negra">🚫 Bloqueado (IP)</span>
                    )}
                    {c.blocked === 1 && (
                      <div className="mt-1 px-2 py-1 rounded bg-red-900/40 border border-red-500/50 flex items-start gap-1.5">
                        <span className="text-red-400 text-[10px] flex-shrink-0 mt-0.5">🔒</span>
                        <div>
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide block">Cadastro Bloqueado</span>
                          {c.blockReason && <span className="text-[9px] text-red-300/80 block mt-0.5">{c.blockReason}</span>}
                        </div>
                      </div>
                    )}
                    {/* Status pedido */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {c.hasOrder
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Pedido</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted/50 text-muted-foreground border border-border">Cadastrado</span>
                      }
                    </div>
                    {/* Pedidos em aberto */}
                    {((c as any).openOrders?.length > 0) ? (
                      <div className="flex flex-col gap-1 mt-0.5">
                        {((c as any).openOrders as Array<{ orderNumber: number; latestStatus: string; registrationId: number }>).map((order) => (
                          <div key={order.registrationId} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-semibold text-primary/90">Pedido: #{order.orderNumber}</p>
                              <GoToOrderButton orderNumber={order.orderNumber} />
                            </div>
                            {order.latestStatus && STATUS_MAP[order.latestStatus] && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_MAP[order.latestStatus].bg} ${STATUS_MAP[order.latestStatus].color} w-fit`}>
                                {STATUS_MAP[order.latestStatus].label}
                              </span>
                            )}
                            {order.latestStatus && !STATUS_MAP[order.latestStatus] && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-muted/30 border-border text-muted-foreground w-fit">
                                {order.latestStatus.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : c.orderNumber ? (
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-semibold text-primary/90">Pedido: #{c.orderNumber}</p>
                          <GoToOrderButton orderNumber={c.orderNumber} />
                        </div>
                        {c.latestStatus && STATUS_MAP[c.latestStatus] && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_MAP[c.latestStatus].bg} ${STATUS_MAP[c.latestStatus].color} w-fit`}>
                            {STATUS_MAP[c.latestStatus].label}
                          </span>
                        )}
                        {c.latestStatus && !STATUS_MAP[c.latestStatus] && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-muted/30 border-border text-muted-foreground w-fit">
                            {c.latestStatus.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    ) : null}
                    {/* Ações */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      <button onClick={() => setReferralModal(c)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors" title="Links de Indicação">
                        <Link2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setFilesModal(c)} className="p-1.5 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors" title="Ver Documentos de Pedidos">
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button onClick={() => setCustomerDocumentsModal(c)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors" title="Documentos do Cliente">
                        <FileText className="w-4 h-4" />
                      </button>
                      <button onClick={() => setLocation(`/admin/codes?phone=${encodeURIComponent(c.phone)}`)} className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors" title="Gerenciar Senha de Acesso">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(c.name).then(() => toast.success('Nome copiado!')).catch(() => toast.error('Erro ao copiar')); }} className="p-1.5 text-violet-300 hover:bg-violet-400/10 rounded-lg transition-colors" title="Copiar nome">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => startEdit(c)} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {c.blocked ? (
                        <button onClick={() => unblockMut.mutate({ id: c.id })} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors" title="Desbloquear cadastro">
                          <Unlock className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => { setBlockModal(c); setBlockReasonInput(""); }} className="p-1.5 text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors" title="Bloquear cadastro">
                          <Lock className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Corpo: resumo compacto ou formulário de edição */}
              {editingId !== c.id ? (
                <div className="border-t px-3 pb-3 pt-2.5" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-slate-200">📱 {c.phone}</span>
                    {c.city && <span className="max-w-[42%] truncate text-slate-400">📍 {c.city}{c.uf ? `/${c.uf}` : ''}</span>}
                  </div>
                  <button type="button" onClick={() => toggleCustomerDetails(c.id)} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10px] font-bold text-cyan-100 transition hover:bg-cyan-500/10">
                    {expandedCustomerIds.has(c.id) ? 'Ocultar detalhes' : 'Ver dados e controles'}
                  </button>
                  {expandedCustomerIds.has(c.id) && <div className="mt-2 flex gap-0 border-t pt-2.5" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  {/* Coluna esquerda: histórico de logins + badge revendedor */}
                  <div className="flex flex-col gap-2">
                    <LoginHistoryColumn phone={c.phone} formatDate={(ts) => formatDateBR(ts)} />
                    {(c as any).isReseller && (
                      <div className="w-[110px] flex-shrink-0">
                        <div className="w-full px-2 py-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/50 rounded-lg flex flex-col items-center gap-1">
                          <span className="text-lg">🏷️</span>
                          <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wide text-center leading-tight">Revendedor</span>
                          {(c as any).resellerDiscountType && (c as any).resellerDiscountValue ? (
                            <span className="text-[10px] font-bold text-amber-300/80 text-center">
                              {(c as any).resellerDiscountType === 'percent'
                                ? `${(c as any).resellerDiscountValue}% desc.`
                                : `R$ ${Number((c as any).resellerDiscountValue).toFixed(2)} desc.`}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Coluna direita: infos do cliente */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                      <span className="text-muted-foreground">📱</span> {c.phone}
                    </p>
                    {c.phone && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          const digits = c.phone.replace(/\D/g, '');
                          navigator.clipboard.writeText(digits).then(() => toast.success('Telefone copiado!')).catch(() => toast.error('Erro ao copiar'));
                        }}
                        title="Copiar telefone"
                        className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                    )}
                    {c.phone && (
                      <a
                        href={`https://wa.me/55${c.phone.replace(/\D/g, '')}`}
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
                  {c.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span>📍</span> {c.city}{c.uf ? `/${c.uf}` : ""}
                    </p>
                  )}

                  {((c as any).street || (c as any).addressNumber || (c as any).neighborhood || (c as any).cep) && (
                    <div className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2 text-[11px] leading-5 text-slate-300">
                      <p className="font-bold text-cyan-200">📍 Endereço</p>
                      <p>{[(c as any).street, (c as any).addressNumber].filter(Boolean).join(", ")}</p>
                      <p>{[(c as any).neighborhood, c.city, c.uf].filter(Boolean).join(" · ")}</p>
                      {(c as any).addressComplement && <p>Complemento: {(c as any).addressComplement}</p>}
                      {(c as any).cep && <p>CEP: {(c as any).cep}</p>}
                    </div>
                  )}
                  <p className="text-xs flex items-center gap-1.5" style={{ color: c.referredBy === 'Não informou' ? '#f87171' : (c.referredBy || (c as any).resolvedReferrerName || c.referredByPhone) ? '#4ade80' : '#6b7280' }}>
                    <span>👤</span>
                    {c.referredBy === 'Não informou'
                      ? 'Indicação: Não informou'
                      : c.referredBy
                        ? `Indicado por: ${c.referredBy}`
                        : (c as any).resolvedReferrerName
                          ? `Indicado por: ${(c as any).resolvedReferrerName}`
                          : c.referredByPhone
                            ? `Indicador informado: ${String(c.referredByPhone).replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}`
                            : 'Indicação: Não respondeu'}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span>📅</span> <span className="text-muted-foreground/70">Cadastro:</span> {formatDateBR(c.createdAt, true)}
                  </p>
                  {c.lastAccessAt && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span className="text-muted-foreground/70">Último acesso:</span> {formatDateBR(c.lastAccessAt)}
                    </p>
                  )}
                  {(c as any).cpf && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span>🪪</span> <span className="text-muted-foreground/70">CPF:</span> {(c as any).cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                    </p>
                  )}
                  {!(c as any).cpf && (
                    <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                      <span>⚠️</span> CPF não cadastrado
                    </p>
                  )}
                  <ReferralCountButton phone={c.phone} name={c.name} />
                  <RouteAccessWidget phone={c.phone} />
                  {!c.email && (
                    <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                      <span>⚠️</span> Sem email cadastrado
                    </p>
                  )}
                  {(c as any).adminNotes && (
                    <div className="mt-2 bg-red-900/30 border border-red-500/40 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold text-red-400">⚠️ AVISOS DO SISTEMA</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Remover todos os avisos do sistema deste cliente?')) {
                              clearNotesMut.mutate({ id: c.id });
                            }
                          }}
                          disabled={clearNotesMut.isPending}
                          title="Remover avisos"
                          className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-red-300 bg-red-500/20 hover:bg-red-500/40 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Limpar
                        </button>
                      </div>
                      <pre className="text-[10px] text-red-300/80 whitespace-pre-wrap font-mono leading-relaxed">{(c as any).adminNotes}</pre>
                    </div>
                  )}
                  </div>{/* fim coluna direita */}
                </div>}
                </div>
              ) : (
                <div className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Nome</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Número de Cadastro</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground font-bold">*</span>
                      <input
                        type="number"
                        min="1"
                        value={editCustomerNumber}
                        onChange={(e) => setEditCustomerNumber(e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        placeholder="Ex: 136"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Número de identificação do cliente (ex: *136)</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Telefone</label>
                    <input type="tel" value={editPhone} readOnly disabled title="Telefone é a identidade fixa do cliente e não pode ser alterado" className="w-full px-2 py-1.5 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground mt-0.5 cursor-not-allowed" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-muted-foreground">CEP</label><input type="text" value={editCep} onChange={(e) => setEditCep(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>
                    <div><label className="text-xs text-muted-foreground">Número</label><input type="text" value={editAddressNumber} onChange={(e) => setEditAddressNumber(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">Rua / Logradouro</label><input type="text" value={editStreet} onChange={(e) => setEditStreet(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>
                  <div><label className="text-xs text-muted-foreground">Bairro</label><input type="text" value={editNeighborhood} onChange={(e) => setEditNeighborhood(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>
                  <div><label className="text-xs text-muted-foreground">Complemento</label><input type="text" value={editAddressComplement} onChange={(e) => setEditAddressComplement(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>
                  <div><label className="text-xs text-muted-foreground">URL da foto de perfil</label><input type="text" value={editProfilePhotoUrl} onChange={(e) => setEditProfilePhotoUrl(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" placeholder="Pode deixar vazio para exigir nova foto" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Cidade</label>
                      <input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">UF</label>
                      <input type="text" value={editUf} onChange={(e) => setEditUf(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">CPF</label>
                    <input
                      type="text"
                      value={editCpf}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                        let f = d;
                        if (d.length > 9) f = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
                        else if (d.length > 6) f = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
                        else if (d.length > 3) f = `${d.slice(0,3)}.${d.slice(3)}`;
                        setEditCpf(f);
                      }}
                      className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      placeholder="000.000.000-00"
                      maxLength={14}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Email</label>
                    <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="email@exemplo.com" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Tel. Indicador</label>
                    <input type="tel" value={editReferredByPhone} onChange={(e) => setEditReferredByPhone(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    <ReferrerAutoFill phone={editReferredByPhone} onNameFound={(name) => { if (!editReferredBy) setEditReferredBy(name); }} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Indicado por (nome)</label>
                    <input type="text" value={editReferredBy} onChange={(e) => setEditReferredBy(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="Preenchido automaticamente" />
                  </div>
                  {/* Seção de Revendedor */}
                  <div className="border border-blue-500/30 rounded-xl p-3 bg-blue-500/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BadgePercent className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-blue-300">Revendedor</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditIsReseller(v => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${editIsReseller ? 'bg-blue-500' : 'bg-muted'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${editIsReseller ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                    {editIsReseller && (
                      <div className="space-y-2">
                        <p className="text-xs text-blue-300/70">Desconto aplicado automaticamente no pedido (sem promoção ativa)</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditResellerDiscountType('percent')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              editResellerDiscountType === 'percent'
                                ? 'bg-blue-500 border-blue-400 text-white'
                                : 'bg-background border-border text-muted-foreground hover:border-blue-400'
                            }`}
                          >
                            % Percentual
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditResellerDiscountType('fixed')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              editResellerDiscountType === 'fixed'
                                ? 'bg-blue-500 border-blue-400 text-white'
                                : 'bg-background border-border text-muted-foreground hover:border-blue-400'
                            }`}
                          >
                            R$ Valor Fixo
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={editResellerDiscountType === 'percent' ? 100 : undefined}
                            step="0.01"
                            value={editResellerDiscountValue}
                            onChange={(e) => setEditResellerDiscountValue(e.target.value)}
                            className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                            placeholder={editResellerDiscountType === 'percent' ? 'Ex: 20' : 'Ex: 50.00'}
                          />
                          <span className="text-sm text-muted-foreground font-medium">{editResellerDiscountType === 'percent' ? '%' : 'R$'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!editingId) return;
                            setResellerMut.mutate({
                              id: editingId,
                              isReseller: editIsReseller,
                              resellerDiscountType: editResellerDiscountType,
                              resellerDiscountValue: parseFloat(editResellerDiscountValue) || 0,
                            });
                          }}
                          disabled={setResellerMut.isPending}
                          className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          {setResellerMut.isPending ? 'Salvando...' : '💾 Salvar Configuração Revendedor'}
                        </button>
                      </div>
                    )}
                    {!editIsReseller && (
                      <p className="text-xs text-muted-foreground text-center">Ative o toggle para configurar desconto de revendedor</p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEdit} disabled={updateMut.isPending} className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                      {updateMut.isPending ? "Salvando..." : "Salvar"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">{searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}</p>
          </div>
        )}
      </div>
    </div>

      {/* Modal de foto ampliada */}
      {photoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPhotoModal(null)}
        >
          <div
            className="relative bg-card rounded-2xl shadow-2xl max-w-sm w-full p-4 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPhotoModal(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={photoModal.url}
              alt={photoModal.name}
              className="w-full max-h-80 rounded-xl object-contain border-2 border-primary/30 shadow-lg bg-black/20"
            />
            <p className="text-foreground font-bold text-lg text-center">{photoModal.name}</p>
            <button
              onClick={() => handleDownloadPhoto(photoModal.url, photoModal.name)}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors shadow"
            >
              <Download className="w-4 h-4" />
              Salvar Foto
            </button>
          </div>
        </div>
      )}

      {/* Modal de Senha Fixa */}
      {fixedPwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setFixedPwdModal(null)}>
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setFixedPwdModal(null)} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Senha Fixa</h2>
                <p className="text-xs text-muted-foreground">{fixedPwdModal.name} • {fixedPwdModal.phone}</p>
              </div>
            </div>

            {loadingFixedPwd ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Status ativo/inativo */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border">
                  <div className="flex items-center gap-2">
                    {fixedPwdActive ? <ShieldCheck className="w-4 h-4 text-green-400" /> : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
                    <span className="text-sm font-medium">{fixedPwdActive ? 'Senha Ativa' : 'Senha Inativa'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFixedPwdActive(v => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      fixedPwdActive ? 'bg-green-500' : 'bg-muted'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      fixedPwdActive ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Campo de senha */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Senha Fixa do Cliente</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={fixedPwdVisible ? 'text' : 'password'}
                        value={fixedPwdInput}
                        onChange={(e) => setFixedPwdInput(e.target.value.toUpperCase())}
                        placeholder="Digite ou gere uma senha"
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground font-mono tracking-widest pr-10 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                      />
                      <button type="button" onClick={() => setFixedPwdVisible(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {fixedPwdVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={generateRandomPwd}
                      className="px-3 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-400 rounded-xl transition-colors"
                      title="Gerar senha aleatória"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">8 caracteres. O cliente usa essa senha junto com o telefone para entrar.</p>
                </div>

                {/* Último acesso */}
                <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-xl border border-border">
                  <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Último acesso do cliente</p>
                    <p className="text-sm font-medium text-foreground">
                      {fixedPwdLastAccess
                        ? formatDateBR(fixedPwdLastAccess)
                        : formatDateBR(fixedPwdModal?.lastAccessAt)
                      }
                    </p>
                  </div>
                </div>

                {/* Produtos permitidos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Produtos que o cliente pode acessar</p>
                    <span className="text-xs text-muted-foreground">{allowedProductIds.length === 0 ? 'Todos (sem restrição)' : `${allowedProductIds.length} selecionado(s)`}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sem seleção = cliente vê todos os produtos. Selecione para restringir o acesso.</p>
                  {productsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">Carregando produtos...</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {(productsQuery.data ?? []).map((p: { id: number; name: string }) => (
                        <label key={p.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          allowedProductIds.includes(p.id)
                            ? 'border-yellow-500/60 bg-yellow-500/10'
                            : 'border-border bg-muted/10 hover:bg-muted/20'
                        }`}>
                          <input
                            type="checkbox"
                            checked={allowedProductIds.includes(p.id)}
                            onChange={(e) => {
                              if (e.target.checked) setAllowedProductIds(prev => [...prev, p.id]);
                              else setAllowedProductIds(prev => prev.filter(id => id !== p.id));
                            }}
                            className="w-4 h-4 accent-yellow-500"
                          />
                          <span className="text-sm text-foreground">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {allowedProductIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAllowedProductIds([])}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Limpar seleção (liberar todos)
                    </button>
                  )}
                </div>

                {/* Aviso */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
                  <p className="text-blue-300 text-xs">Esta senha é exclusiva deste cliente. As senhas VIP e a senha geral continuam funcionando normalmente para os outros clientes.</p>
                </div>

                {/* Botões */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFixedPwdModal(null)}
                    className="flex-1 py-2.5 bg-muted text-foreground rounded-xl text-sm font-medium hover:bg-muted/80"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                     onClick={async () => {
                       if (!fixedPwdInput.trim()) { toast.error('Digite uma senha'); return; }
                       await setProductAccessMut.mutateAsync({ phone: fixedPwdModal.phone, productIds: allowedProductIds });
                       setFixedPwdMut.mutate({ phone: fixedPwdModal.phone, password: fixedPwdInput.trim(), active: fixedPwdActive });
                     }}
                     disabled={setFixedPwdMut.isPending || setProductAccessMut.isPending}
                     className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-xl text-sm disabled:opacity-50"
                   >
                     {(setFixedPwdMut.isPending || setProductAccessMut.isPending) ? 'Salvando...' : 'Salvar Senha'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Modal de Documentos de Pedidos */}
      {filesModal && (
        <FilesModal customer={filesModal} onClose={() => setFilesModal(null)} />
      )}
      {/* Modal de Documentos do Cliente */}
      {customerDocumentsModal && (
        <CustomerDocumentsModal customer={customerDocumentsModal} onClose={() => setCustomerDocumentsModal(null)} />
      )}
      {/* Modal de Links de Indicação */}
      {referralModal && (
        <ReferralModal customer={referralModal} onClose={() => setReferralModal(null)} />
      )}

      {/* Modal de Bloqueio de Cadastro */}
      {blockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-red-500/40 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-foreground font-bold text-lg">Bloquear Cadastro</h2>
                <p className="text-muted-foreground text-sm">{blockModal.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">O cliente não conseguirá acessar nenhuma página do sistema (login, acompanhar pedido, gestor de gastos).</p>
            <div className="mb-4">
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Motivo do bloqueio <span className="text-red-400">*</span></label>
              <textarea
                value={blockReasonInput}
                onChange={e => setBlockReasonInput(e.target.value)}
                placeholder="Ex: Inadimplência, comportamento inadequado..."
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { if (blockReasonInput.trim()) blockMut.mutate({ id: blockModal.id, reason: blockReasonInput.trim() }); else toast.error('Informe o motivo do bloqueio'); }}
                disabled={blockMut.isPending}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {blockMut.isPending ? 'Bloqueando...' : 'Confirmar Bloqueio'}
              </button>
              <button
                onClick={() => { setBlockModal(null); setBlockReasonInput(''); }}
                className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground text-sm rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Exclusão */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-foreground font-bold text-lg">Excluir cliente?</h2>
                <p className="text-muted-foreground text-sm">{(deleteConfirmModal as any).name}</p>
              </div>
            </div>

            {(deleteConfirmModal as any).hasOrders ? (
              <>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-5">
                  <p className="text-yellow-400 text-sm font-medium">⚠️ Este cliente possui pedidos vinculados.</p>
                  <p className="text-muted-foreground text-xs mt-1">Escolha como deseja prosseguir:</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setDeleteWithOrdersLoading(true); deleteWithOrdersMut.mutate({ id: deleteConfirmModal.id, reason: 'Excluído junto com o cliente' }); }}
                    disabled={deleteWithOrdersLoading}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    {deleteWithOrdersLoading ? 'Excluindo...' : '🗑️ Excluir cliente e todos os pedidos'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirmModal(null)}
                    className="w-full py-2.5 px-4 bg-muted hover:bg-muted/80 text-foreground rounded-lg font-medium text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm mb-5">O cliente será movido para a lixeira. Esta ação pode ser desfeita.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteConfirmModal(null)}
                    className="flex-1 py-2.5 px-4 bg-muted hover:bg-muted/80 text-foreground rounded-lg font-medium text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => deleteMut.mutate({ id: deleteConfirmModal.id })}
                    disabled={deleteMut.isPending}
                    className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    {deleteMut.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Cadastro Manual */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-bold text-foreground">Novo Cadastro Manual</h2>
              </div>
              <button onClick={() => { setCreateModal(false); setCreateError(''); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {createError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nome completo</label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Telefone (com DDD) *</label>
                <input
                  type="tel"
                  value={createPhone}
                  onChange={e => setCreatePhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="11999999999"
                  maxLength={11}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
                <label className="block text-xs font-bold text-amber-200 mb-1">Telefone do indicador cadastrado (opcional)</label>
                <p className="mb-2 text-[11px] leading-snug text-amber-100/70">Opcional no cadastro manual do ADM. Se informado, o sistema confere se o número pertence a um cliente.</p>
                <input
                  type="tel"
                  value={createReferrerPhone}
                  onChange={e => setCreateReferrerPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="11999999999"
                  maxLength={11}
                  className="w-full px-3 py-2 bg-background border border-amber-400/30 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">CPF</label>
                <input
                  type="text"
                  value={createCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                  onChange={e => setCreateCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={e => setCreateEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Foto de perfil</label>
                <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) handleCreatePhotoUpload(file); }} className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-3 file:py-2 file:text-primary" />
                {uploadingPhotoFor === -1 && <p className="mt-1 text-xs text-primary">Enviando foto...</p>}
                {createPhotoUrl && <p className="mt-1 text-xs text-green-500">✓ Foto enviada</p>}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cidade</label>
                  <input
                    type="text"
                    value={createCity}
                    onChange={e => setCreateCity(e.target.value)}
                    placeholder="São Paulo"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">UF</label>
                  <input
                    type="text"
                    value={createUf}
                    onChange={e => setCreateUf(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                    maxLength={2}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setCreateModal(false); setCreateError(''); }}
                  className="flex-1 py-2.5 px-4 bg-muted hover:bg-muted/80 text-foreground rounded-lg font-medium text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setCreateError('');
                    if (createPhone.length < 10) { setCreateError('Telefone inválido (mínimo 10 dígitos)'); return; }
                    adminCreateMut.mutate({
                      name: createName.trim() || undefined,
                      phone: createPhone,
                      email: createEmail.trim() || undefined,
                      cpf: createCpf || undefined,
                      profilePhotoUrl: createPhotoUrl || undefined,
                      referredByPhone: createReferrerPhone || undefined,
                      city: createCity.trim() || undefined,
                      uf: createUf || undefined,
                    });
                  }}
                  disabled={adminCreateMut.isPending}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition-colors"
                >
                  {adminCreateMut.isPending ? 'Cadastrando...' : 'Criar Cadastro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilesModal({ customer, onClose }: { customer: { name: string; phone: string; profilePhotoUrl?: string | null }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: groups, isLoading } = trpc.orderStatus.getFilesByPhoneGrouped.useQuery({ phone: customer.phone });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addUploading, setAddUploading] = useState(false);

  const deleteFileMut = trpc.orderStatus.deleteFile.useMutation({
    onSuccess: () => {
      toast.success('Documento removido!');
      utils.orderStatus.getFilesByPhoneGrouped.invalidate({ phone: customer.phone });
      setDeletingId(null);
    },
    onError: () => toast.error('Erro ao remover documento'),
  });

  const uploadFileMut = trpc.orderStatus.uploadFile.useMutation({
    onSuccess: () => {
      toast.success('Documento adicionado!');
      utils.orderStatus.getFilesByPhoneGrouped.invalidate({ phone: customer.phone });
      setAddingToGroup(null);
      setAddLabel('');
      setAddFile(null);
    },
    onError: () => toast.error('Erro ao adicionar documento'),
  });

  const handleAddSubmit = async (registrationId: number) => {
    if (!addFile || !addLabel.trim()) { toast.error('Preencha o nome e selecione um arquivo'); return; }
    setAddUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        await uploadFileMut.mutateAsync({
          registrationId,
          customerPhone: customer.phone,
          label: addLabel.trim(),
          fileBase64: base64,
          mimeType: addFile.type || 'application/octet-stream',
          fromAdmin: 1,
        });
        setAddUploading(false);
      };
      reader.readAsDataURL(addFile);
    } catch { setAddUploading(false); }
  };

  const handleDownload = async (url: string, label: string, mimeType: string | null) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const ext = mimeType?.includes('pdf') ? 'pdf' : mimeType?.includes('png') ? 'png' : 'jpg';
      const safeName = label.replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').trim().replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  };

  const totalFiles = groups?.reduce((sum, g) => sum + g.files.length, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {customer.profilePhotoUrl ? (
              <img src={customer.profilePhotoUrl} alt={customer.name} className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <FolderOpen className="w-5 h-5 text-cyan-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">Documentos de {customer.name}</h2>
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Foto de perfil em destaque */}
        {customer.profilePhotoUrl && (
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
              <img src={customer.profilePhotoUrl} alt={customer.name} className="w-14 h-14 rounded-xl object-cover border-2 border-primary/30 shadow" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-0.5">Foto de Perfil</p>
                <p className="text-sm font-medium text-foreground truncate">{customer.name}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <a href={customer.profilePhotoUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Abrir em nova aba">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </a>
                <button onClick={() => handleDownload(customer.profilePhotoUrl!, `foto_perfil_${customer.name}`, 'image/jpeg')} className="p-2 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors" title="Baixar foto">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de arquivos agrupados por pedido */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !groups || groups.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">Nenhum documento enviado ainda</p>
            </div>
          ) : (
            groups.map((group: { registrationId: number; serviceName: string | null; serviceOption: string | null; orderNumber: number | null; files: { id: number; label: string; fileUrl: string; mimeType: string | null; createdAt: string | Date; fromAdmin: number }[] }) => (
              <div key={group.registrationId} className="space-y-2">
                {/* Cabeçalho do grupo (pedido) */}
                <div className="flex items-center gap-2 px-1">
                  <div className="h-px flex-1 bg-border" />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {group.orderNumber && (
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">#{group.orderNumber}</span>
                    )}
                    {group.serviceName && (
                      <span className="text-[11px] font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 uppercase tracking-wide">{group.serviceName}{group.serviceOption ? ` — ${group.serviceOption}` : ''}</span>
                    )}
                    {!group.serviceName && !group.orderNumber && (
                      <span className="text-[11px] text-muted-foreground">Pedido #{group.registrationId}</span>
                    )}
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Arquivos do grupo */}
                {/* Botão Adicionar Documento ao grupo */}
                <button
                  onClick={() => { setAddingToGroup(addingToGroup === group.registrationId ? null : group.registrationId); setAddLabel(''); setAddFile(null); }}
                  className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded-lg px-2 py-1 transition-colors mb-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Adicionar documento
                </button>

                {/* Painel de upload inline */}
                {addingToGroup === group.registrationId && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 mb-2 space-y-2">
                    <p className="text-xs font-semibold text-green-400">Novo documento para este pedido</p>
                    <input
                      type="text"
                      placeholder="Nome do documento (ex: CNH, Comprovante...)"
                      value={addLabel}
                      onChange={(e) => setAddLabel(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <input
                      type="file"
                      onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
                      className="w-full text-xs text-muted-foreground file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-green-500/20 file:text-green-400 hover:file:bg-green-500/30"
                    />
                    {addFile && <p className="text-xs text-muted-foreground truncate">📎 {addFile.name}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddSubmit(group.registrationId)}
                        disabled={addUploading || uploadFileMut.isPending}
                        className="flex-1 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-black font-bold rounded-lg text-xs transition-colors"
                      >
                        {addUploading || uploadFileMut.isPending ? 'Enviando...' : '✓ Salvar'}
                      </button>
                      <button
                        onClick={() => { setAddingToGroup(null); setAddLabel(''); setAddFile(null); }}
                        className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {group.files.map((f) => (
                  <div key={f.id} className={`flex items-center gap-3 p-3 border rounded-xl transition-colors ${
                    f.fromAdmin ? 'bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/20' : 'bg-muted/20 hover:bg-muted/40 border-border'
                  }`}>
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {f.mimeType?.startsWith('image/') ? (
                        <img src={f.fileUrl} alt={f.label} className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <FileText className="w-4 h-4 text-cyan-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.label}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                        {f.fromAdmin ? <span className="text-[10px] text-blue-400 bg-blue-500/10 rounded px-1">Admin</span> : <span className="text-[10px] text-green-400 bg-green-500/10 rounded px-1">Cliente</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Abrir em nova aba">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </a>
                      <button onClick={() => handleDownload(f.fileUrl, f.label, f.mimeType)} className="p-2 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors" title="Baixar arquivo">
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (deletingId === f.id) {
                            deleteFileMut.mutate({ fileId: f.id });
                          } else {
                            setDeletingId(f.id);
                          }
                        }}
                        disabled={deleteFileMut.isPending && deletingId === f.id}
                        className={`p-2 rounded-lg transition-colors text-xs font-bold ${
                          deletingId === f.id
                            ? 'bg-red-500 text-white hover:bg-red-600'
                            : 'text-red-400 hover:bg-red-400/10'
                        }`}
                        title={deletingId === f.id ? 'Confirmar exclusão' : 'Deletar documento'}
                      >
                        {deletingId === f.id ? (
                          deleteFileMut.isPending ? '...' : <span className="text-[10px]">CONFIRMAR</span>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        )}
                      </button>
                      {deletingId === f.id && (
                        <button onClick={() => setDeletingId(null)} className="p-2 text-gray-400 hover:bg-gray-400/10 rounded-lg transition-colors" title="Cancelar">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {totalFiles > 0 && (
          <div className="px-5 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">{totalFiles} documento{totalFiles !== 1 ? 's' : ''} em {groups?.length ?? 0} pedido{(groups?.length ?? 0) !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal de Documentos do Cliente ────────────────────────────────────────────
function CustomerDocumentsModal({ customer, onClose }: { customer: { id: number; name: string; phone: string; profilePhotoUrl?: string | null }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: documents, isLoading } = trpc.customers.getDocuments.useQuery({ customerId: customer.id });
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const uploadMut = trpc.customers.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success('Documento adicionado!');
      utils.customers.getDocuments.invalidate({ customerId: customer.id });
      setLabel('');
      setFile(null);
      setUploading(false);
    },
    onError: () => {
      toast.error('Erro ao adicionar documento');
      setUploading(false);
    },
  });

  const deleteMut = trpc.customers.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success('Documento removido!');
      utils.customers.getDocuments.invalidate({ customerId: customer.id });
      setDeletingId(null);
    },
    onError: () => toast.error('Erro ao remover documento'),
  });

  const handleUpload = async () => {
    if (!file || !label.trim()) {
      toast.error('Preencha o nome e selecione um arquivo');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      await uploadMut.mutateAsync({
        customerId: customer.id,
        label: label.trim(),
        imageBase64: base64,
        mimeType: file.type,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const getFileIcon = (fileName: string, mimeType?: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const iconMap: Record<string, string> = {
      'pdf': '📕', 'doc': '📘', 'docx': '📘', 'txt': '📄', 'rtf': '📝',
      'xls': '📗', 'xlsx': '📗', 'csv': '📊', 'ods': '📊',
      'psd': '🎨', 'ai': '🎨', 'eps': '🎨', 'sketch': '🎨', 'figma': '🎨', 'svg': '🖼️',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'bmp': '🖼️', 'tiff': '🖼️',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'm4a': '🎵', 'aac': '🎵', 'ogg': '🎵', 'wma': '🎵',
      'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'mkv': '🎬', 'webm': '🎬', 'flv': '🎬', 'wmv': '🎬',
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦', 'iso': '💿',
      'json': '{ }', 'xml': '< >', 'yaml': '⚙️', 'html': '🌐', 'css': '🎨', 'js': '⚡', 'py': '🐍', 'java': '☕', 'cpp': '⚙️', 'sql': '🗄️',
      'ppt': '📊', 'pptx': '📊', 'odp': '📊',
      'exe': '⚙️', 'app': '📱', 'dmg': '🍎', 'apk': '📱',
    };
    const emoji = iconMap[ext] || '📄';
    return <span className="text-lg flex-shrink-0" title={ext.toUpperCase()}>{emoji}</span>;
  };

  const handleDownload = async (url: string, docLabel: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      // Extrair extensão da URL ou usar o tipo MIME
      const urlExt = url.split('.').pop()?.split('?')[0].toLowerCase() || 'bin';
      const safeName = docLabel.replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').trim().replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.${urlExt}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {customer.profilePhotoUrl ? (
              <img src={customer.profilePhotoUrl} alt={customer.name} className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <FileText className="w-5 h-5 text-green-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">Documentos de {customer.name}</h2>
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Upload Form */}
        <div className="p-4 border-b border-border bg-green-500/5">
          <p className="text-xs font-semibold text-green-400 mb-3">Adicionar novo documento</p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Nome do documento (ex: RG, CNH, Comprovante...)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:bg-green-500/20 file:border file:border-green-500/40 file:rounded-lg file:text-green-400 file:text-xs file:font-medium hover:file:bg-green-500/30 transition-colors"
            />
            <button
              onClick={handleUpload}
              disabled={uploading || !file || !label.trim()}
              className="w-full bg-green-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Enviando...' : 'Enviar Documento'}
            </button>
          </div>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !documents || documents.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">Nenhum documento adicionado</p>
            </div>
          ) : (
            documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-2 p-3 bg-muted/50 border border-border rounded-lg hover:bg-muted/70 transition-colors">
                {getFileIcon(doc.fileName || doc.label, doc.mimeType)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">Adicionado em {new Date(doc.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(doc.fileUrl, doc.label)}
                    className="p-2 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors"
                    title="Baixar"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (deletingId === doc.id) {
                        deleteMut.mutate({ documentId: doc.id });
                      } else {
                        setDeletingId(doc.id);
                      }
                    }}
                    disabled={deleteMut.isPending && deletingId === doc.id}
                    className={`p-2 rounded-lg transition-colors text-xs font-bold ${
                      deletingId === doc.id
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'text-red-400 hover:bg-red-400/10'
                    }`}
                    title={deletingId === doc.id ? 'Confirmar exclusão' : 'Deletar'}
                  >
                    {deletingId === doc.id ? (
                      deleteMut.isPending ? '...' : <span className="text-[10px]">CONFIRMAR</span>
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                  {deletingId === doc.id && (
                    <button
                      onClick={() => setDeletingId(null)}
                      className="p-2 text-gray-400 hover:bg-gray-400/10 rounded-lg transition-colors"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {documents && documents.length > 0 && (
          <div className="px-5 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">{documents.length} documento{documents.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal de Links de Indicação ────────────────────────────────────────────
function ReferralModal({ customer, onClose }: { customer: { id: number; name: string; phone: string }; onClose: () => void }) {
  const [commission, setCommission] = useState('');
  const [commissionType, setCommissionType] = useState<'fixed' | 'percent'>('fixed');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [manualLinkId, setManualLinkId] = useState<number | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const utils = trpc.useUtils();

  const { data: products } = trpc.products.list.useQuery();
  const { data: links, isLoading } = trpc.referral.listByCustomer.useQuery({ customerId: customer.id });

  const generateMut = trpc.referral.generateLink.useMutation({
    onSuccess: () => {
      toast.success('Link gerado com sucesso!');
      setCommission('');
      utils.referral.listByCustomer.invalidate({ customerId: customer.id });
    },
    onError: () => toast.error('Erro ao gerar link'),
  });

  const deleteMut = trpc.referral.deleteLink.useMutation({
    onSuccess: () => {
      toast.success('Link removido');
      utils.referral.listByCustomer.invalidate({ customerId: customer.id });
    },
    onError: () => toast.error('Erro ao remover link'),
  });

  const toggleMut = trpc.referral.toggleLink.useMutation({
    onSuccess: () => utils.referral.listByCustomer.invalidate({ customerId: customer.id }),
    onError: () => toast.error('Erro ao alterar status'),
  });

  const markPaidMut = trpc.referral.markCommissionPaid.useMutation({
    onSuccess: () => {
      toast.success('Comissão marcada como paga!');
      utils.referral.listByCustomer.invalidate({ customerId: customer.id });
    },
    onError: () => toast.error('Erro ao marcar comissão'),
  });

  const addManualMut = trpc.referral.addManualUsage.useMutation({
    onSuccess: () => {
      toast.success('Indicação adicionada manualmente!');
      setManualLinkId(null);
      setManualName('');
      setManualPhone('');
      utils.referral.listByCustomer.invalidate({ customerId: customer.id });
    },
    onError: () => toast.error('Erro ao adicionar indicação'),
  });

  const handleAddManual = () => {
    if (!manualLinkId) return;
    if (!manualName.trim()) { toast.error('Informe o nome do indicado'); return; }
    if (!manualPhone.trim()) { toast.error('Informe o telefone do indicado'); return; }
    addManualMut.mutate({ linkId: manualLinkId, clientName: manualName, clientPhone: manualPhone });
  };

  const handleGenerate = () => {
    const val = parseFloat(commission);
    if (!commission || isNaN(val) || val < 0) {
      toast.error('Informe um valor de comissão válido');
      return;
    }
    const selectedProduct = products?.find(p => p.id === selectedProductId);
    generateMut.mutate({
      customerId: customer.id,
      customerName: customer.name,
      commissionValue: val,
      commissionType,
      productId: selectedProductId ?? null,
      productName: selectedProduct?.name ?? null,
    });
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Link copiado!')).catch(() => toast.error('Erro ao copiar'));
  };

  const formatCommission = (link: { commissionValue: number; commissionType: string }) => {
    if (link.commissionType === 'percent') return `${link.commissionValue}%`;
    return `R$ ${link.commissionValue.toFixed(2).replace('.', ',')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">Links de Indicação</h2>
            <p className="text-xs text-muted-foreground truncate">{customer.name} • {customer.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gerar novo link */}
        <div className="p-5 border-b border-border space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gerar Novo Link</p>
          {/* Seletor de produto */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Produto que gera comissão</label>
            <select
              value={selectedProductId ?? ''}
              onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
            >
              <option value="">Qualquer produto (sem restrição)</option>
              {products?.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            {/* Tipo de comissão */}
            <div className="flex rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setCommissionType('fixed')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${commissionType === 'fixed' ? 'bg-green-500/20 text-green-400' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                Fixo
              </button>
              <button
                type="button"
                onClick={() => setCommissionType('percent')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${commissionType === 'percent' ? 'bg-green-500/20 text-green-400' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <BadgePercent className="w-3.5 h-3.5" />
                %
              </button>
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder={commissionType === 'fixed' ? 'Ex: 20.00' : 'Ex: 10'}
              className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generateMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Gerar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedProductId ? `Comissão gerada apenas ao comprar o produto selecionado.` : 'O link gerado será válido apenas para novos clientes (sem cadastro).'}
          </p>
        </div>

        {/* Lista de links */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !links || links.length === 0 ? (
            <div className="text-center py-8">
              <Link2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">Nenhum link gerado ainda</p>
            </div>
          ) : (
            links.map((link) => (
              <div key={link.id} className={`border rounded-xl p-4 space-y-3 transition-colors ${link.active ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/10 opacity-60'}`}>
                {/* Código e ações */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded">{link.code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${link.active ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        {link.active ? 'Ativo' : 'Inativo'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Comissão: <span className="font-semibold text-foreground">{formatCommission(link)}</span>
                      </span>
                      {link.productName && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">
                          {link.productName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{window.location.origin}/?ref={link.code}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => copyLink(link.code)}
                      className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                      title="Copiar link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleMut.mutate({ id: link.id, active: !link.active })}
                      className={`p-1.5 rounded-lg transition-colors ${link.active ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-green-400 hover:bg-green-400/10'}`}
                      title={link.active ? 'Desativar' : 'Ativar'}
                    >
                      {link.active
                        ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      }
                    </button>
                    <button
                      onClick={() => { if (confirm('Remover este link?')) deleteMut.mutate({ id: link.id }); }}
                      className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Usos */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Indicações ({link.usages?.length ?? 0})</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Total usos: {link.usageCount ?? 0}</span>
                      <button
                        onClick={() => setManualLinkId(manualLinkId === link.id ? null : link.id)}
                        className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded-full transition-colors"
                        title="Adicionar indicação manualmente"
                      >
                        <Plus className="w-3 h-3" />
                        Manual
                      </button>
                    </div>
                  </div>

                  {/* Formulário de indicação manual */}
                  {manualLinkId === link.id && (
                    <ManualReferralForm
                      manualName={manualName}
                      manualPhone={manualPhone}
                      onNameChange={setManualName}
                      onPhoneChange={setManualPhone}
                      onConfirm={handleAddManual}
                      onCancel={() => { setManualLinkId(null); setManualName(''); setManualPhone(''); }}
                      isPending={addManualMut.isPending}
                    />
                  )}


                  {link.usages && link.usages.length > 0 ? (
                    <div className="space-y-1.5">
                      {link.usages.map((usage) => (
                        <div key={usage.id} className="flex items-center gap-2 p-2 bg-muted/20 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{usage.clientName}</p>
                            <p className="text-xs text-muted-foreground">{usage.clientPhone}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {usage.commissionPaid ? (
                              <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Pago</span>
                            ) : (
                              <button
                                onClick={() => markPaidMut.mutate({ usageId: usage.id })}
                                className="text-xs text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 px-2 py-0.5 rounded-full transition-colors"
                              >
                                Marcar Pago
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Nenhuma indicação ainda</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
