import { useId, useState } from 'react';
import { Copy, Check, Users, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cnhCodeSchema, globalOrderGroupSchema, resolveOrderGroupLink } from '@shared/orderLoginPresentation';

export function OrderLoginCnhField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const invalid = !cnhCodeSchema.safeParse(value).success;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.error('Não foi possível copiar. Selecione o código manualmente.'); }
  };
  return <div className="min-w-0" data-login-field="cnh">
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-lime-200">Código de Habilitação CNH <span className="text-white/40">· manual</span></label>
    <div className="flex min-w-0 gap-1.5">
      <input id={id} type="text" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-invalid={invalid} aria-describedby={`${id}-hint`} placeholder="Ex: 012345"
        className="min-w-0 flex-1 rounded-lg border border-lime-500/30 bg-background px-3 py-2 font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-lime-500/40" />
      <button type="button" onClick={copy} disabled={!value || invalid} title="Copiar código CNH" className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-lime-200 disabled:opacity-30">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
      {value && <button type="button" onClick={() => onChange('')} title="Limpar código CNH" className="shrink-0 rounded-lg border border-red-400/30 px-3 py-2 text-red-300">×</button>}
    </div>
    <p id={`${id}-hint`} className={`mt-1 text-[11px] ${invalid ? 'text-red-300' : 'text-white/45'}`}>
      {invalid ? 'Complete os 6 números antes de salvar.' : 'Preencha manualmente. Opcional. Não é o código do autenticador.'}
    </p>
  </div>;
}

export function OrderLoginGlobalGroup({ legacyLink }: { legacyLink: string }) {
  const utils = trpc.useUtils();
  const query = trpc.loginData.getGlobalGroup.useQuery(undefined, { staleTime: 0, refetchInterval: 15000, refetchOnWindowFocus: true });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [revision, setRevision] = useState(0);
  const [opening, setOpening] = useState(false);
  const save = trpc.loginData.setGlobalGroup.useMutation({
    onSuccess: async result => {
      utils.loginData.getGlobalGroup.setData(undefined, result);
      await utils.loginData.getGlobalGroup.invalidate();
      setOpen(false);
      toast.success(result.groupLink ? 'Grupo atualizado para todos os pedidos.' : 'Grupo removido de todos os pedidos.');
    },
    onError: error => toast.error(error.message || 'Não foi possível salvar o grupo.'),
  });
  const edit = async () => {
    setOpening(true);
    try {
      const data = await utils.loginData.getGlobalGroup.fetch();
      setDraft(data.configured ? data.groupLink ?? '' : legacyLink || '');
      setRevision(data.revision); setOpen(true);
    } catch { toast.error('Falha ao carregar o grupo. Tente novamente.'); }
    finally { setOpening(false); }
  };
  const commit = (remove: boolean) => {
    const input = { groupLink: remove ? '' : draft, expectedRevision: revision };
    if (!globalOrderGroupSchema.safeParse(input).success) { toast.error('Informe um link http ou https válido.'); return; }
    if (!remove && !draft.trim()) { toast.error('Cole o link ou utilize Remover de todos.'); return; }
    if (window.confirm(remove ? 'Remover o grupo de todos os pedidos antigos e novos? Os links antigos não voltarão a aparecer.' : 'Aplicar este grupo a todos os pedidos antigos e novos?')) save.mutate(input);
  };
  const effective = query.data ? resolveOrderGroupLink(query.data.configured ? query.data : null, legacyLink) : null;
  return <div className="order-login-full rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-3" data-login-field="group">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-200"><Users className="h-4 w-4 shrink-0" />Grupo do WhatsApp <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px]">PADRÃO GLOBAL</span></p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/50">Configure uma vez para todos os pedidos. Alterar o grupo não modifica o login ou a senha do cliente.</p>
        <p className="mt-2 break-all text-xs text-emerald-100/80">{query.isError ? 'Não foi possível carregar o grupo.' : !query.data ? 'Carregando grupo...' : effective || (query.data.configured ? 'Grupo removido de todos os pedidos.' : 'Nenhum grupo global configurado.')}</p>
        {query.data && !query.data.configured && legacyLink && <p className="mt-1 text-[11px] text-amber-200/80">Link antigo deste pedido preservado até a primeira configuração global.</p>}
      </div>
      <button type="button" onClick={edit} disabled={opening} className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-40"><Settings2 className="h-4 w-4" />{opening ? 'Carregando...' : 'Alterar para todos'}</button>
    </div>
    <Dialog open={open} onOpenChange={next => { if (!save.isPending) setOpen(next); }}>
      <DialogContent className="max-w-lg border-emerald-400/25 bg-slate-950 text-white">
        <DialogHeader><DialogTitle>Grupo de todos os pedidos</DialogTitle><DialogDescription>Esta configuração é salva no servidor. Vale para pedidos antigos e novos, respeitando a liberação dos dados ao cliente.</DialogDescription></DialogHeader>
        <label className="text-sm">Link do grupo<input type="url" value={draft} onChange={e => setDraft(e.target.value)} maxLength={1024} placeholder="https://chat.whatsapp.com/..." disabled={save.isPending} className="mt-2 w-full min-w-0 rounded-lg border border-white/20 bg-black/30 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" /></label>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <button type="button" onClick={() => commit(true)} disabled={save.isPending} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-200 disabled:opacity-40">Remover de todos</button>
          <button type="button" onClick={() => setOpen(false)} disabled={save.isPending} className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-40">Cancelar</button>
          <button type="button" onClick={() => commit(false)} disabled={save.isPending || !draft.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold disabled:opacity-40">{save.isPending ? 'Salvando...' : 'Salvar para todos'}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
