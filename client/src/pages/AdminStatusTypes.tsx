import { isGlobalStatus } from "@shared/orderStatusScope";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link, useSearch } from "wouter";
import {
  Plus, Pencil, Trash2, Save, X, Lock, Eye, EyeOff,
  Clock, Package, DollarSign, Zap, FileCheck, XCircle, Wrench, CheckCircle2, Star, AlertCircle, Info
} from "lucide-react";
import AdminHeader from "@/components/AdminHeader";

// Mapa de ícones disponíveis
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

const COLOR_OPTIONS = [
  { value: "text-blue-400",    label: "Azul",        preview: "bg-blue-400" },
  { value: "text-emerald-400", label: "Esmeralda",   preview: "bg-emerald-400" },
  { value: "text-yellow-400",  label: "Amarelo",     preview: "bg-yellow-400" },
  { value: "text-orange-400",  label: "Laranja",     preview: "bg-orange-400" },
  { value: "text-purple-400",  label: "Roxo",        preview: "bg-purple-400" },
  { value: "text-green-400",   label: "Verde",       preview: "bg-green-400" },
  { value: "text-lime-400",    label: "Verde-limão", preview: "bg-lime-400" },
  { value: "text-teal-400",    label: "Teal",        preview: "bg-teal-400" },
  { value: "text-red-400",     label: "Vermelho",    preview: "bg-red-400" },
  { value: "text-pink-400",    label: "Rosa",        preview: "bg-pink-400" },
  { value: "text-cyan-400",    label: "Ciano",       preview: "bg-cyan-400" },
  { value: "text-gray-400",    label: "Cinza",       preview: "bg-gray-400" },
];

const BG_MAP: Record<string, string> = {
  "text-blue-400":    "bg-blue-500/20 border-blue-500/40",
  "text-emerald-400": "bg-emerald-500/20 border-emerald-500/40",
  "text-yellow-400":  "bg-yellow-500/20 border-yellow-500/40",
  "text-orange-400":  "bg-orange-500/20 border-orange-500/40",
  "text-purple-400":  "bg-purple-500/20 border-purple-500/40",
  "text-green-400":   "bg-green-500/20 border-green-500/40",
  "text-lime-400":    "bg-lime-500/20 border-lime-500/40",
  "text-teal-400":    "bg-teal-500/20 border-teal-500/40",
  "text-red-400":     "bg-red-500/20 border-red-500/40",
  "text-pink-400":    "bg-pink-500/20 border-pink-500/40",
  "text-cyan-400":    "bg-cyan-500/20 border-cyan-500/40",
  "text-gray-400":    "bg-gray-500/20 border-gray-500/40",
};

type StatusType = {
  id: number;
  key: string;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  imageUrl?: string | null;
  description: string | null;
  sortOrder: number;
  isSystem: number;
  isActive: number;
  isGlobal?: number;
  pulseColor?: string | null;
  showInProgress?: number;
  progressOrder?: number;
};

type FormData = {
  key: string;
  label: string;
  color: string;
  icon: string;
  description: string;
  sortOrder: number;
  pulseColor: string;
  flowId: number;
};

const defaultForm: FormData = {
  key: "",
  label: "",
  color: "text-blue-400",
  icon: "Clock",
  description: "",
  sortOrder: 50,
  pulseColor: "#ffffff",
  flowId: 0,
};

export default function AdminStatusTypes() {
  useAdminAuth();
  const utils = trpc.useUtils();
  const params = new URLSearchParams(useSearch());
  const requestedFlowId = Number(params.get('flowId')) || 0;
  const restoreKey = params.get('restoreKey') || '';
  const flowsQuery = trpc.statusFlows.list.useQuery();
  const [scopeView, setScopeView] = useState<'global' | 'custom' | 'all'>(requestedFlowId ? 'custom' : 'global');
  const refreshScopes = () => {
    void utils.statusTypes.list.invalidate();
    void utils.statusTypes.getProgressSequence.invalidate();
    void utils.statusFlows.list.invalidate();
    void utils.statusFlows.orderMap.invalidate();
    void utils.statusFlows.forOrder.invalidate();
  };

  const { data: statuses = [], isLoading } = trpc.statusTypes.list.useQuery();
  const createMutation = trpc.statusTypes.create.useMutation({
    onSuccess: () => { refreshScopes(); utils.statusTypes.list.refetch(); toast.success("Status criado!"); setShowCreate(false); setForm(defaultForm); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.statusTypes.update.useMutation({
    onSuccess: () => { refreshScopes(); utils.statusTypes.list.refetch(); toast.success("Status atualizado!"); setEditingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.statusTypes.delete.useMutation({
    onSuccess: () => { refreshScopes(); utils.statusTypes.list.refetch(); toast.success("Status removido!"); },
    onError: (e) => toast.error(e.message),
  });
  const uploadImageMutation = trpc.statusTypes.uploadImage.useMutation({
    onError: (e) => toast.error(e.message || "Não foi possível enviar a imagem."),
  });

  // Presentation-only status rules: select only flows that contain the selected status.
  const [visibilityStatus, setVisibilityStatus] = useState<StatusType | null>(null);
  const [visibilityFlowId, setVisibilityFlowId] = useState<number>(0);
  const [visibilityMode, setVisibilityMode] = useState<"normal" | "hide_selected" | "current_only">("normal");
  const [hiddenVisibilityKeys, setHiddenVisibilityKeys] = useState<string[]>([]);
  const [visibilityNext, setVisibilityNext] = useState(true);
  const [visibilityProgress, setVisibilityProgress] = useState(true);
  const loadedVisibilityContext = useRef<string | null>(null);
  const visibilityDialogRef = useRef<HTMLElement | null>(null);
  const defaultFlowId = Number((flowsQuery.data ?? []).find(f => f.isDefault === 1)?.id ?? 0);
  const visibilityFlowOptions = (flowsQuery.data ?? []).filter(flow =>
    flow.isActive === 1 && !!visibilityStatus &&
    (flow.isDefault === 1 ? isGlobalStatus(visibilityStatus) : flow.statusKeys.includes(visibilityStatus.key))
  );
  const suggestedVisibilityFlowId = visibilityFlowOptions.find(flow => flow.isDefault === 1)?.id ?? visibilityFlowOptions[0]?.id ?? 0;
  const effectiveVisibilityFlowId = visibilityFlowId || suggestedVisibilityFlowId;
  const visibilityRulesQuery = trpc.statusVisibility.list.useQuery(
    { flowId: effectiveVisibilityFlowId },
    { enabled: !!visibilityStatus && effectiveVisibilityFlowId > 0 }
  );
  const selectedVisibilityRule = visibilityRulesQuery.data?.find(rule => rule.currentStatusKey === visibilityStatus?.key);

  // Hydrate once per status and flow. Prevent accidentally resetting an existing rule by clicking Save.
  useEffect(() => {
    if (!visibilityStatus || !effectiveVisibilityFlowId || !visibilityRulesQuery.isSuccess) return;
    const contextKey = `${visibilityStatus.key}:${effectiveVisibilityFlowId}`;
    if (loadedVisibilityContext.current === contextKey) return;
    const saved = visibilityRulesQuery.data?.find(rule => rule.currentStatusKey === visibilityStatus.key);
    setVisibilityMode(saved?.mode ?? "normal");
    setHiddenVisibilityKeys(saved?.hiddenStatusKeys ?? []);
    setVisibilityNext(saved?.showNextStep !== false);
    setVisibilityProgress(saved?.showProgress !== false);
    loadedVisibilityContext.current = contextKey;
  }, [visibilityStatus?.key, effectiveVisibilityFlowId, visibilityRulesQuery.isSuccess, visibilityRulesQuery.data]);

  const visibilitySave = trpc.statusVisibility.save.useMutation({
    onSuccess: () => {
      toast.success("Visibilidade salva!");
      void utils.statusVisibility.list.invalidate();
      void utils.statusVisibility.forOrder.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const openVisibility = (status: StatusType) => {
    loadedVisibilityContext.current = null;
    setVisibilityStatus(status);
    setVisibilityFlowId(0);
    setVisibilityMode("normal");
    setHiddenVisibilityKeys([]);
    setVisibilityNext(true);
    setVisibilityProgress(true);
  };
  // Keep the editor above the clicked status card, regardless of page scroll.
  // Focus the dialog, lock background scrolling and restore both on close.
  useEffect(() => {
    if (!visibilityStatus) return;
    const originalOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    visibilityDialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVisibilityStatus(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocus?.focus();
    };
  }, [visibilityStatus]);
  const visibilityCatalog = (statuses as StatusType[]).filter(status =>
    status.isActive === 1 && status.key !== visibilityStatus?.key &&
    (effectiveVisibilityFlowId === defaultFlowId
      ? isGlobalStatus(status)
      : (flowsQuery.data ?? []).find(flow => flow.id === effectiveVisibilityFlowId)?.statusKeys.includes(status.key))
  );
  const [showCreate, setShowCreate] = useState(!!requestedFlowId);
  const [form, setForm] = useState<FormData>({ ...defaultForm, flowId: requestedFlowId, key: restoreKey });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<FormData & { isActive: number; imageUrl: string | null }>>({});

  function startEdit(s: StatusType) {
    setEditingId(s.id);
    setEditForm({
      label: s.label,
      color: s.color,
      icon: s.icon,
      imageUrl: s.imageUrl ?? null,
      description: s.description ?? "",
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      pulseColor: s.pulseColor ?? "#ffffff",
      showInProgress: s.showInProgress ?? 0,
      progressOrder: s.progressOrder ?? 0,
    } as any);
  }

  // Gera slug a partir do label: minúsculas, sem acentos, espaços -> _, remove chars especiais
  function slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s_]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 64);
  }

  function handleCreate() {
    if (!form.label) { toast.error("Nome exibido é obrigatório"); return; }
    const key = form.key || slugify(form.label);
    if (!key) { toast.error("Não foi possível gerar a chave. Preencha o nome."); return; }
    createMutation.mutate({
      key,
      label: form.label,
      color: form.color,
      bgColor: BG_MAP[form.color] || "bg-gray-500/20 border-gray-500/40",
      icon: form.icon,
      description: form.description || undefined,
      sortOrder: form.sortOrder,
      isActive: 1,
      isGlobal: form.flowId ? 0 : 1,
      flowId: form.flowId || undefined,
      pulseColor: form.pulseColor || "#ffffff",
    });
  }

  function handleUpdate(id: number) {
    updateMutation.mutate({
      id,
      label: editForm.label,
      color: editForm.color,
      bgColor: editForm.color ? (BG_MAP[editForm.color] || "bg-gray-500/20 border-gray-500/40") : undefined,
      icon: editForm.icon,
      imageUrl: editForm.imageUrl ?? null,
      description: editForm.description ?? null,
      sortOrder: editForm.sortOrder,
      isActive: editForm.isActive,
      pulseColor: (editForm as any).pulseColor ?? null,
      showInProgress: (editForm as any).showInProgress ?? 0,
      progressOrder: (editForm as any).progressOrder ?? 0,
    });
  }

  async function handleStatusImageSelect(statusId: number, file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Envie uma imagem JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo de 5 MB.');
      return;
    }
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadImageMutation.mutateAsync({
        id: statusId,
        imageBase64,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
      });
      if (!result.url) throw new Error('Upload sem URL');
      setEditForm(current => ({ ...current, imageUrl: result.url }));
      toast.success('Imagem enviada. Clique em Salvar para aplicar.');
    } catch {
      toast.error('Não foi possível enviar a imagem do status.');
    }
  }

  const inputCls = "bg-[#0d0d1a] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-white/30";

  return (
    <div className="min-h-screen bg-[#07071a] text-white">
      <AdminHeader title="Status de Pedido" rightContent={
        <div className="flex items-center gap-2">
          <Link href="/admin/status-flows">
            <Button variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-xs h-auto px-3 py-1.5" size="sm">
              Sequências
            </Button>
          </Link>
          <Button onClick={() => { setShowCreate(v => !v); setForm(defaultForm); }} className="bg-primary hover:bg-primary/80 text-white text-xs gap-1 px-3 py-1.5 h-auto" size="sm">
            {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{showCreate ? "Cancelar" : "Novo Status"}</span>
          </Button>
        </div>
      } />
      <div className="p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {visibilityStatus && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) setVisibilityStatus(null); }}>
            <section ref={visibilityDialogRef} role="dialog" aria-modal="true" aria-labelledby="visibility-dialog-heading" tabIndex={-1} className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-cyan-400/40 bg-[#101b2e] p-4 space-y-3 shadow-2xl outline-none sm:p-6">
          <div className="flex items-center justify-between gap-3"><h2 id="visibility-dialog-heading" className="font-bold text-base">Visibilidade: {visibilityStatus.label}</h2><button type="button" onClick={()=>setVisibilityStatus(null)} aria-label="Fechar visibilidade" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10"><X className="w-5 h-5"/></button></div>
          <label className="block text-sm">Aplicar na sequência
            <select className="mt-1 block w-full rounded-lg border border-white/20 bg-[#0d0d1a] p-2" value={effectiveVisibilityFlowId} onChange={e=>{loadedVisibilityContext.current=null;setVisibilityFlowId(Number(e.target.value));setVisibilityMode("normal");setHiddenVisibilityKeys([]);setVisibilityNext(true);setVisibilityProgress(true);}}>
              {visibilityFlowOptions.map(flow=><option key={flow.id} value={flow.id}>{flow.name}</option>)}
            </select>
          </label>
          {visibilityRulesQuery.isLoading ? <p className="text-sm text-white/60">Carregando configuração salva...</p> : visibilityRulesQuery.isError ? <p className="text-sm text-red-300">Não foi possível carregar a configuração. Tente novamente.</p> : <p className="text-sm text-cyan-200/70">{selectedVisibilityRule ? "Configuração salva carregada automaticamente." : "Nenhuma regra salva nesta sequência: exibição normal."}</p>}
          <div className="space-y-2">{(["normal","hide_selected","current_only"] as const).map(mode=><label key={mode} className="flex items-center gap-2 rounded-lg border border-white/10 p-2 text-sm"><input type="radio" checked={visibilityMode===mode} onChange={()=>setVisibilityMode(mode)}/>{mode==="normal"?"Exibir normalmente":mode==="hide_selected"?"Ocultar etapas selecionadas":"Mostrar somente status atual"}</label>)}</div>
          {visibilityMode==="hide_selected" && <div className="space-y-2 rounded-lg border border-white/10 p-3">
            <p className="text-sm font-semibold">Ocultar enquanto {visibilityStatus.label} estiver ativo:</p>
            <div className="max-h-52 space-y-2 overflow-y-auto">{visibilityCatalog.map(st=><label key={st.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hiddenVisibilityKeys.includes(st.key)} onChange={e=>setHiddenVisibilityKeys(prev=>e.target.checked?[...prev,st.key]:prev.filter(v=>v!==st.key))}/>{st.label}</label>)}</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visibilityNext} onChange={e=>setVisibilityNext(e.target.checked)}/>Mostrar próximo passo</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visibilityProgress} onChange={e=>setVisibilityProgress(e.target.checked)}/>Mostrar barra de progresso</label>
          </div>}
          <p className="text-xs text-white/50">Isso altera somente a apresentação em /acompanhar. Nenhum status é apagado ou desativado.</p>
          <Button disabled={visibilitySave.isPending||!effectiveVisibilityFlowId||!visibilityRulesQuery.isSuccess||loadedVisibilityContext.current !== `${visibilityStatus.key}:${effectiveVisibilityFlowId}`} className="w-full bg-emerald-600" onClick={()=>visibilitySave.mutate({flowId:effectiveVisibilityFlowId,currentStatusKey:visibilityStatus.key,mode:visibilityMode,hiddenStatusKeys:visibilityMode==="hide_selected"?hiddenVisibilityKeys:[],showNextStep:visibilityMode==="hide_selected"?visibilityNext:true,showProgress:visibilityMode==="hide_selected"?visibilityProgress:true})}>Salvar visibilidade</Button>
            </section>
          </div>,
          document.body
        )}

        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm text-cyan-100/80">
          Global e personalizado agora tem participacao separada. Use <strong>Retirar do global</strong> para ocultar apenas do Padrao H2.
          Excluir ou desativar um cadastro em uso fica bloqueado para preservar outras sequencias e o historico.
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Escopo dos status">
          {(['global', 'custom', 'all'] as const).map(scope => <button key={scope} type="button" onClick={() => setScopeView(scope)} className={`rounded-lg border px-4 py-2 text-sm ${scopeView === scope ? 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100' : 'border-white/10 text-white/60'}`}>
            {scope === 'global' ? 'Globais' : scope === 'custom' ? 'Personalizados / compartilhados' : 'Todos os cadastros'}
          </button>)}
        </div>
        {requestedFlowId > 0 && <Link href="/admin/status-flows" className="block text-sm text-cyan-200 underline">Voltar as sequencias</Link>}

        {/* Formulário de criação */}
        {showCreate && (
          <div className="bg-[#12122a] rounded-2xl border border-white/10 p-5 space-y-4">
            <p className="text-sm font-semibold text-white/80">{restoreKey ? 'Restaurar cadastro com a chave original' : 'Novo Status'}</p>
            <label className="block space-y-1 text-xs text-white/60">Onde este status sera utilizado?
              <select value={form.flowId} onChange={e => setForm(f => ({ ...f, flowId: Number(e.target.value) }))} className={`${inputCls} block w-full`}>
                <option value={0}>Global / Padrao H2</option>
                {(flowsQuery.data ?? []).filter(flow => flow.isDefault !== 1).map(flow => <option key={flow.id} value={flow.id}>Somente: {flow.name}</option>)}
              </select>
            </label>
            {form.flowId > 0 && <p className="text-xs text-cyan-200">Sera vinculado a esta sequencia e nao aparecera automaticamente no global.</p>}
            {restoreKey && <p className="text-xs text-amber-200">Informe somente nome e dados confirmados. A chave original preserva os vinculos existentes.</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-white/50">Nome exibido <span className="text-red-400">*</span></label>
                <Input
                  className={inputCls}
                  placeholder="ex: Aguardando Documentos"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Chave interna (opcional — gerada automaticamente)</label>
              <Input
                className={inputCls}
                placeholder={form.label ? slugify(form.label) || "gerada-automaticamente" : "ex: aguardando_docs"}
                readOnly={!!restoreKey}
                value={form.key}
                onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
              />
              {!form.key && form.label && (
                <p className="text-[10px] text-white/30 mt-0.5">Será usada: <span className="text-white/50">{slugify(form.label) || "..."}</span></p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-white/50">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${c.preview} ${form.color === c.value ? "border-white scale-125" : "border-transparent"}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-white/50">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(ICON_MAP).map(iconName => (
                    <button
                      key={iconName}
                      title={iconName}
                      onClick={() => setForm(f => ({ ...f, icon: iconName }))}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${form.icon === iconName ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-white/40 hover:border-white/30"}`}
                    >
                      {ICON_MAP[iconName]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Descrição para o cliente (opcional)</label>
              <Textarea
                className={`${inputCls} resize-none whitespace-pre-wrap`}
                rows={4}
                placeholder="Texto explicativo exibido na tela de acompanhamento do cliente...\nUse Enter para quebras de linha."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1 w-24">
                <label className="text-xs text-white/50">Ordem</label>
                <Input
                  type="number"
                  className={inputCls}
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-white/50">Cor do Neon/Pulso</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.pulseColor}
                    onChange={e => setForm(f => ({ ...f, pulseColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                  />
                  <span className="text-xs text-white/40">{form.pulseColor}</span>
                </div>
              </div>
              {/* Preview */}
              <div className="flex-1">
                <label className="text-xs text-white/50 block mb-1">Preview</label>
                <div className="relative inline-flex items-center justify-center w-10 h-10">
                  <span className="absolute inline-flex w-full h-full rounded-full opacity-40 animate-ping" style={{ backgroundColor: form.pulseColor }} />
                  <div className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full border ${form.color} ${BG_MAP[form.color] || "bg-gray-500/20 border-gray-500/40"}`}>
                    {ICON_MAP[form.icon]}
                  </div>
                </div>
              </div>
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {createMutation.isPending ? "Criando..." : "Criar Status"}
            </Button>
          </div>
        )}

        {/* Lista de status */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {(statuses as StatusType[]).filter(s => scopeView === 'all' || (scopeView === 'global' ? isGlobalStatus(s) : !isGlobalStatus(s) || (flowsQuery.data ?? []).some(f => f.isDefault !== 1 && f.statusKeys.includes(s.key)))).map(s => (
              <div
                key={s.id}
                className={`bg-[#12122a] rounded-2xl border p-4 transition-all ${s.isActive ? "border-white/10" : "border-white/5 opacity-60"}`}
              >
                {editingId === s.id ? (
                  // Modo edição
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Nome exibido</label>
                        <Input
                          className={inputCls}
                          value={editForm.label ?? ""}
                          onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Ordem</label>
                        <Input
                          type="number"
                          className={inputCls}
                          value={editForm.sortOrder ?? 0}
                          onChange={e => setEditForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Cor</label>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_OPTIONS.map(c => (
                            <button
                              key={c.value}
                              title={c.label}
                              onClick={() => setEditForm(f => ({ ...f, color: c.value }))}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${c.preview} ${editForm.color === c.value ? "border-white scale-125" : "border-transparent"}`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Ícone</label>
                        <div className="flex flex-wrap gap-2">
                          {Object.keys(ICON_MAP).map(iconName => (
                            <button
                              key={iconName}
                              title={iconName}
                              onClick={() => setEditForm(f => ({ ...f, icon: iconName }))}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${editForm.icon === iconName ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-white/40 hover:border-white/30"}`}
                            >
                              {ICON_MAP[iconName]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-white/50">Imagem personalizada do status</label>
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className={`relative w-14 h-14 rounded-xl border flex items-center justify-center overflow-hidden ${editForm.color ?? "text-gray-400"} ${BG_MAP[editForm.color ?? ""] || "bg-gray-500/20 border-gray-500/40"}`}>
                          {(editForm as any).imageUrl
                            ? <img src={(editForm as any).imageUrl} alt="Prévia do status" className="w-full h-full object-contain p-1" />
                            : (ICON_MAP[editForm.icon ?? "Clock"] ?? <Clock className="w-4 h-4" />)}
                        </div>
                        <label className="cursor-pointer rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/25">
                          {uploadImageMutation.isPending ? 'Enviando...' : 'Escolher imagem'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={uploadImageMutation.isPending}
                            onChange={e => { void handleStatusImageSelect(s.id, e.target.files?.[0]); e.currentTarget.value = ''; }}
                          />
                        </label>
                        {(editForm as any).imageUrl && (
                          <button
                            type="button"
                            onClick={() => setEditForm(current => ({ ...current, imageUrl: null }))}
                            className="text-xs font-bold text-red-300 hover:text-red-200"
                          >
                            Remover imagem
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-white/35">PNG, JPG ou WEBP até 5 MB. Sem imagem, continua usando o ícone atual.</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-white/50">Descrição para o cliente</label>
                      <Textarea
                        className={`${inputCls} resize-none whitespace-pre-wrap`}
                        rows={4}
                        value={editForm.description ?? ""}
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-white/50">Cor do Neon/Pulso</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={(editForm as any).pulseColor ?? "#ffffff"}
                          onChange={e => setEditForm(f => ({ ...f, pulseColor: e.target.value } as any))}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                        />
                        <span className="text-xs text-white/40">{(editForm as any).pulseColor ?? "#ffffff"}</span>
                        {/* Preview animado */}
                        <div className="relative inline-flex items-center justify-center w-10 h-10">
                          <span className="absolute inline-flex w-full h-full rounded-full opacity-40 animate-ping" style={{ backgroundColor: (editForm as any).pulseColor ?? "#ffffff" }} />
                          <div className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full border overflow-hidden ${editForm.color ?? "text-gray-400"} ${BG_MAP[editForm.color ?? ""] || "bg-gray-500/20 border-gray-500/40"}`}>
                            {(editForm as any).imageUrl
                              ? <img src={(editForm as any).imageUrl} alt="" className="w-full h-full object-contain p-0.5" />
                              : (ICON_MAP[editForm.icon ?? "Clock"] ?? null)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-white/45">
                      A sequência exibida ao cliente é configurada uma única vez em <b>Pedidos → Sequência do Cliente</b>.
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(s.id)}
                        disabled={updateMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                      >
                        <Save className="w-3.5 h-3.5" /> Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        className="border-white/20 text-white/60 hover:text-white gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Modo visualização
                  <div className="flex items-start gap-3">
                    {/* Badge de preview com neon */}
                    <div className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center">
                      {s.pulseColor && <span className="absolute inset-0 rounded-xl opacity-30 animate-pulse" style={{ backgroundColor: s.pulseColor }} />}
                      <div className={`relative w-9 h-9 rounded-xl border flex items-center justify-center overflow-hidden ${s.color} ${s.bgColor}`}>
                        {s.imageUrl
                          ? <img src={s.imageUrl} alt="" className="w-full h-full object-contain p-0.5" />
                          : (ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
                        <span className="rounded border border-cyan-400/20 px-2 py-0.5 text-[10px] text-cyan-200">{isGlobalStatus(s) ? 'GLOBAL' : 'FORA DO GLOBAL'}</span>
                        {(flowsQuery.data ?? []).filter(f => f.isDefault !== 1 && f.statusKeys.includes(s.key)).map(f => <span key={f.id} className="text-[10px] text-white/50">{f.name}</span>)}
                        {s.isActive === 0 && (
                          <span className="text-[10px] text-white/30 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">Inativo</span>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-xs text-white/40 mt-1 line-clamp-1">{s.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[10px] text-white/20">Ordem: {s.sortOrder}</p>
                      </div>
                    </div>
                    {/* Ações */}
                    <div className="flex flex-wrap items-center justify-end gap-1 max-w-[12rem]">
                      <button type="button" disabled={updateMutation.isPending} title="Altera somente a participacao no global; preserva todos os vinculos personalizados" onClick={() => {
                        if (confirm(isGlobalStatus(s) ? 'Retirar somente do global? As sequencias personalizadas continuam usando este status.' : 'Adicionar este status ao global?')) updateMutation.mutate({ id: s.id, isGlobal: isGlobalStatus(s) ? 0 : 1 });
                      }} className="rounded-lg border border-cyan-400/25 px-2 py-1 text-[10px] text-cyan-100 disabled:opacity-40">{isGlobalStatus(s) ? 'Retirar do global' : 'Adicionar ao global'}</button>
                      <button type="button" title="Configurar visibilidade apenas para o cliente" onClick={()=>openVisibility(s)} className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-200">Visibilidade</button>
                      {/* Ativar/Desativar */}
                      <button
                        title={s.isActive ? "Desativar cadastro inteiro (bloqueado quando em uso)" : "Ativar cadastro"}
                        onClick={() => updateMutation.mutate({ id: s.id, isActive: s.isActive === 1 ? 0 : 1 })}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${s.isActive ? "border-white/10 text-white/40 hover:text-white/70" : "border-green-500/30 text-green-400/60 hover:text-green-400"}`}
                      >
                        {s.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      {/* Editar */}
                      <button
                        title="Editar"
                        onClick={() => startEdit(s)}
                        className="w-7 h-7 rounded-lg border border-white/10 text-white/40 hover:text-white/70 flex items-center justify-center transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {/* Excluir — todos os status podem ser excluídos */}
                      <button
                        title="Excluir"
                        onClick={() => {
                          if (confirm(`Excluir definitivamente o cadastro "${s.label}"? Para retirar apenas do Padrao H2, cancele e use Retirar do global. A exclusao sera bloqueada se houver vinculos ou historico.`)) {
                            deleteMutation.mutate({ id: s.id });
                          }
                        }}
                        className="w-7 h-7 rounded-lg border border-red-500/20 text-red-400/50 hover:text-red-400 flex items-center justify-center transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-white/20 text-center pb-4">
          Cadastros em uso sao protegidos. Retirar do global nao exclui etapas personalizadas.
        </p>
      </div>
      </div>
    </div>
  );
}
