import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { OrderLoginCopyButton } from '@/components/OrderLoginCopyButton';
import { AuthenticatorQrAdminField, type PendingQr } from '@/components/AuthenticatorQrAdminField';
import { OrderLoginCnhField, OrderLoginGlobalGroup } from '@/components/OrderLoginExtrasFields';
import { cnhCodeSchema } from '@shared/orderLoginPresentation';

type Draft = {
  label: string; loginPhone: string; loginEmail: string; loginPassword: string;
  authCode: string; cnhCode: string; emailLink: string; loginNotes: string; loginGroupLink: string;
};
type Field = keyof Draft;
const fields: Array<[Field, string]> = [
  ['loginPhone', 'Telefone'], ['loginEmail', 'E-mail'], ['loginPassword', 'Senha'],
  ['emailLink', 'Link de acesso ao e-mail'],
];
const asDraft = (row: Partial<Record<keyof Draft, string | null>>): Draft => ({
  label: row.label || '', loginPhone: row.loginPhone || '', loginEmail: row.loginEmail || '',
  loginPassword: row.loginPassword || '', authCode: row.authCode || '',
  cnhCode: row.cnhCode || '', emailLink: row.emailLink || '',
  loginNotes: row.loginNotes || '', loginGroupLink: row.loginGroupLink || '',
});

function AdditionalLoginCard({
  registrationId, id, displayOrder, initial, hasAuthenticatorQr, onDeleted,
}: {
  registrationId: number; id: number; displayOrder: number; initial: Draft;
  hasAuthenticatorQr: boolean; onDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState(initial);
  const [pendingQr, setPendingQr] = useState<PendingQr>(undefined);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const setField = (key: Field, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const save = trpc.loginData.saveAdditional.useMutation({
    onSuccess: async () => {
      setDirty(false);
      setPendingQr(undefined);
      await utils.loginData.listAdditional.invalidate({ registrationId });
      await utils.loginData.getAdditionalQrForAdmin.invalidate({ registrationId, id });
      toast.success('Login ' + displayOrder + ' salvo.');
    },
    onError: error => toast.error(error.message || 'Falha ao salvar este login.'),
  });
  const remove = trpc.loginData.deleteAdditional.useMutation({
    onSuccess: async () => {
      await utils.loginData.listAdditional.invalidate({ registrationId });
      onDeleted();
      toast.success('Login adicional excluído.');
    },
    onError: error => toast.error(error.message || 'Não foi possível excluir.'),
  });
  const code = trpc.loginData.getAdditionalAuthenticatorCodeForAdmin.useQuery(
    { registrationId, id },
    { enabled: expanded, refetchInterval: expanded ? 5000 : false, staleTime: 0 },
  );
  useEffect(() => {
    if (!expanded) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expanded]);
  const seconds = code.data?.expiresAt ? Math.max(0, Math.ceil((code.data.expiresAt - now) / 1000)) : 0;
  const generatePhone = () => {
    const digits = Array.from(crypto.getRandomValues(new Uint32Array(9))).map(n => String(n % 10)).join('');
    const ddds = ['71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99'];
    const ddd = ddds[digits.charCodeAt(0) % ddds.length];
    setField('loginPhone', '(' + ddd + ') 9' + digits.slice(0, 4) + '-' + digits.slice(4, 8));
  };
  const generateEmail = trpc.loginData.generateOrderH2Email.useMutation({
    onSuccess: result => { setDraft(prev => ({ ...prev, loginEmail: result.email, loginPassword: 'fusca123' })); setDirty(true); },
    onError: error => toast.error(error.message || 'Erro ao gerar e-mail H2.'),
  });
  const submit = () => {
    if (!cnhCodeSchema.safeParse(draft.cnhCode).success) { toast.error('Código CNH inválido.'); return; }
    save.mutate({
      registrationId, id, ...draft,
      authCode: draft.authCode.replace(/[\s-]/g, ''),
      authenticatorQrData: pendingQr && typeof pendingQr === 'object' ? pendingQr.data : undefined,
      authenticatorQrAction: pendingQr === null ? 'delete' : pendingQr ? 'replace' : 'keep',
    });
  };
  const busy = save.isPending || remove.isPending || generateEmail.isPending;
  return (
    <div className="rounded-xl border border-violet-400/30 bg-violet-500/[0.04] p-3 space-y-3" data-additional-login={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 text-sm font-black text-violet-200">
          🔐 {draft.label || 'Login ' + displayOrder} {dirty && <span className="text-xs text-amber-300">• Não salvo</span>}
          <span className="text-xs text-white/50">{expanded ? 'Recolher' : 'Editar'}</span>
        </button>
        <button type="button" disabled={busy} onClick={() => {
          if (window.confirm('Excluir somente este login adicional? Os demais permanecerão intactos.')) remove.mutate({ registrationId, id });
        }} className="rounded-lg border border-red-400/25 px-2 py-1.5 text-xs text-red-300 disabled:opacity-50">
          <Trash2 className="mr-1 inline h-3.5 w-3.5" />Excluir
        </button>
      </div>
      {expanded && (
        <div className="space-y-3">
          <label className="block text-xs text-white/60">Identificação do cartão
            <input value={draft.label} onChange={e => setField('label', e.target.value)}
              maxLength={80} className="mt-1 w-full rounded-lg border border-white/15 bg-background px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={generatePhone} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200">⚡ Gerar telefone</button>
            <button type="button" disabled={busy} onClick={() => generateEmail.mutate({ registrationId })} className="rounded-lg border border-blue-400/30 px-3 py-2 text-xs text-blue-200">✉️ Gerar e-mail H2</button>
            <button type="button" disabled={busy} onClick={() => setField('loginPassword', 'fusca123')} className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-200">🔐 Senha padrão</button>
            <button type="button" disabled={busy} onClick={async () => {
              if ((draft.loginPhone || draft.loginEmail || draft.loginPassword) && !window.confirm('Substituir telefone, e-mail e senha deste login?')) return;
              try {
                const generated = await generateEmail.mutateAsync({ registrationId });
                const digits = Array.from(crypto.getRandomValues(new Uint32Array(9))).map(n => String(n % 10)).join('');
                const ddds = ['71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99'];
                const ddd = ddds[digits.charCodeAt(0) % ddds.length];
                setDraft(prev => ({ ...prev, loginPhone: '(' + ddd + ') 9' + digits.slice(0, 4) + '-' + digits.slice(4, 8),
                  loginEmail: generated.email, loginPassword: 'fusca123' }));
                setDirty(true);
              } catch { /* Error is reported by mutation. */ }
            }} className="rounded-lg border border-violet-300/40 bg-violet-600 px-3 py-2 text-xs font-bold text-white">⚡ Gerar tudo</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([key, label]) => (
              <label key={key} className="min-w-0 text-xs text-white/60">{label}
                <div className="mt-1 flex min-w-0 gap-1">
                  <input value={draft[key]} onChange={e => setField(key, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-white/15 bg-background px-3 py-2 text-xs text-white" />
                  <OrderLoginCopyButton value={draft[key]} label={label} />
                </div>
              </label>
            ))}
            <OrderLoginCnhField value={draft.cnhCode} onChange={v => setField('cnhCode', v)} />
            <label className="min-w-0 text-xs text-white/60">Código autenticador
              <div className="mt-1 flex gap-1">
                <input value={draft.authCode} onChange={e => setField('authCode', e.target.value.toUpperCase().replace(/[\s-]/g, ''))}
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-background px-3 py-2 font-mono text-xs text-white" />
                <OrderLoginCopyButton value={draft.authCode} label="Autenticador" />
              </div>
            </label>
          </div>
          <OrderLoginGlobalGroup legacyLink={draft.loginGroupLink} />
          <label className="block text-xs text-white/60">Texto / Instruções para o cliente
            <textarea rows={3} value={draft.loginNotes} onChange={e => setField('loginNotes', e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-background px-3 py-2 text-xs text-white" />
          </label>
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3">
            <p className="mb-2 text-xs font-bold text-red-200">AUTENTICADOR DESTE LOGIN</p>
            <p className="mb-2 text-[11px] text-white/50">A chave e o QR deste cartão são independentes do Login 1.</p>
            {code.data?.code && <p className="mb-2 font-mono text-xl font-bold tracking-widest text-cyan-200">{code.data.code} <span className="text-xs text-cyan-200/60">({seconds}s)</span></p>}
            <AuthenticatorQrAdminField registrationId={registrationId} additionalLoginId={id}
              authenticatorSecret={draft.authCode} hasExistingQr={hasAuthenticatorQr}
              pendingValue={pendingQr} onPendingValueChange={v => { setPendingQr(v); setDirty(true); }} disabled={busy} />
          </div>
          <button type="button" disabled={busy || !cnhCodeSchema.safeParse(draft.cnhCode).success}
            onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-lg bg-lime-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            {save.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {save.isPending ? 'Salvando...' : 'Salvar dados deste login'}
          </button>
        </div>
      )}
    </div>
  );
}

export function OrderAdditionalLoginsAdmin({ registrationId }: { registrationId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.loginData.listAdditional.useQuery({ registrationId }, { enabled: registrationId > 0, staleTime: 0 });
  const create = trpc.loginData.createAdditional.useMutation({
    onSuccess: async () => {
      await utils.loginData.listAdditional.invalidate({ registrationId });
      toast.success('Novo login criado. Preencha e salve os dados.');
    },
    onError: error => toast.error(error.message || 'Não foi possível criar login.'),
  });
  return (
    <section className="space-y-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-black text-violet-200">Logins adicionais</h3>
          <p className="text-[11px] text-white/50">Cada login tem dados independentes. Na entrega, escolha quais liberar ao cliente.</p></div>
        <button type="button" disabled={create.isPending || list.isLoading || list.isError}
          onClick={() => create.mutate({ registrationId })}
          className="flex items-center gap-1 rounded-lg border border-violet-300/40 bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
          <Plus className="h-4 w-4" />{create.isPending ? 'Criando...' : '+ Criar login'}
        </button>
      </div>
      {list.isError && <p className="text-xs text-red-300">Não foi possível carregar os logins adicionais. Nenhum dado foi alterado.</p>}
      {list.isLoading && <p className="text-xs text-white/50">Carregando logins...</p>}
      {list.data?.map(row => (
        <AdditionalLoginCard key={row.id} registrationId={registrationId} id={row.id}
          displayOrder={row.displayOrder} initial={asDraft(row)} hasAuthenticatorQr={row.hasAuthenticatorQr}
          onDeleted={() => void list.refetch()} />
      ))}
    </section>
  );
}
