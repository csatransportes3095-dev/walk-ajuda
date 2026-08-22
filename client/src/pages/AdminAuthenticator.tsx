import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Check, Copy, Eye, EyeOff, KeyRound, Link2, LockKeyhole, Plus, Search, ShieldCheck, Trash2, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function secondsLeft(expiresAt?: number) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

export default function AdminAuthenticator() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [label, setLabel] = useState("");
  const [issuer, setIssuer] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [revealedEntryId, setRevealedEntryId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [linkingEntryId, setLinkingEntryId] = useState<number | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [submittedLinkSearch, setSubmittedLinkSearch] = useState<string | null>(null);
  const [entrySearch, setEntrySearch] = useState("");

  const entriesQuery = trpc.adminAuthenticator.list.useQuery(undefined, { staleTime: 0 });
  const codeQuery = trpc.adminAuthenticator.getCode.useQuery(
    { id: revealedEntryId ?? 0 },
    { enabled: revealedEntryId !== null, staleTime: 0, gcTime: 0, refetchInterval: revealedEntryId !== null ? 5000 : false },
  );
  const orderSearchQuery = trpc.adminAuthenticator.searchOpenOrders.useQuery(
    { query: submittedLinkSearch || "#0" },
    { enabled: linkingEntryId !== null && Boolean(submittedLinkSearch), retry: false },
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const hideWhenPageIsNotVisible = () => {
      if (document.hidden) setRevealedEntryId(null);
    };
    document.addEventListener("visibilitychange", hideWhenPageIsNotVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hideWhenPageIsNotVisible);
    };
  }, []);

  useEffect(() => {
    if (revealedEntryId === null) return;
    const timeout = window.setTimeout(() => setRevealedEntryId(null), 60_000);
    return () => window.clearTimeout(timeout);
  }, [revealedEntryId, codeQuery.data?.code]);

  const createMutation = trpc.adminAuthenticator.create.useMutation({
    onSuccess: (created) => {
      setLabel("");
      setIssuer("");
      setSecret("");
      setShowSecret(false);
      setLinkingEntryId(created.id);
      setLinkSearch("");
      setSubmittedLinkSearch(null);
      void utils.adminAuthenticator.list.invalidate();
      toast.success("Conta adicionada. Escolha agora a página de login do pedido.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar a conta."),
  });

  const linkMutation = trpc.adminAuthenticator.linkToOrder.useMutation({
    onSuccess: () => {
      setLinkingEntryId(null);
      setLinkSearch("");
      setSubmittedLinkSearch(null);
      void utils.adminAuthenticator.list.invalidate();
      toast.success("Chave direcionada para a página de login do pedido.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível direcionar a chave."),
  });

  const unlinkMutation = trpc.adminAuthenticator.unlinkFromOrder.useMutation({
    onSuccess: () => {
      void utils.adminAuthenticator.list.invalidate();
      toast.success("Chave removida da página de login do pedido.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível remover o direcionamento."),
  });

  const deleteMutation = trpc.adminAuthenticator.delete.useMutation({
    onSuccess: () => {
      setRevealedEntryId(null);
      void utils.adminAuthenticator.list.invalidate();
      toast.success("Conta removida definitivamente.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível remover a conta."),
  });

  const activeEntry = useMemo(
    () => (entriesQuery.data || []).find((entry) => entry.id === revealedEntryId),
    [entriesQuery.data, revealedEntryId],
  );
  const linkingEntry = useMemo(
    () => (entriesQuery.data || []).find((entry) => entry.id === linkingEntryId),
    [entriesQuery.data, linkingEntryId],
  );
  const filteredEntries = useMemo(() => {
    const normalizedSearch = entrySearch.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedSearch) return entriesQuery.data || [];
    return (entriesQuery.data || []).filter((entry) =>
      `${entry.label} ${entry.issuer || ""}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
    );
  }, [entriesQuery.data, entrySearch]);
  const remaining = secondsLeft(codeQuery.data?.expiresAt);
  const progress = Math.max(0, Math.min(100, (remaining / 30) * 100));

  const addEntry = () => {
    if (!label.trim() || !secret.trim()) {
      toast.error("Informe o nome da conta e a chave secreta Base32.");
      return;
    }
    createMutation.mutate({ label: label.trim(), issuer: issuer.trim() || undefined, secret: secret.trim() });
  };

  const copyCurrentCode = async () => {
    if (!codeQuery.data?.code) return;
    try {
      await navigator.clipboard.writeText(codeQuery.data.code);
      setCopied(true);
      toast.success("Código copiado.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  return (
    <div className="min-h-screen bg-[#070b16] px-4 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 to-slate-950 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 p-3"><ShieldCheck className="h-6 w-6 text-cyan-300" /></div>
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">COFRE PESSOAL</p>
              <h1 className="text-xl font-black">Autenticador</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">Gere códigos TOTP das suas próprias contas. As chaves ficam cifradas e não aparecem nesta tela depois de salvas.</p>
            </div>
          </div>
          <button onClick={() => setLocation("/admin/codes")} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10">Voltar ao ADM</button>
        </header>

        <section className="rounded-2xl border border-amber-300/20 bg-amber-400/5 p-4 text-sm text-amber-100">
          <div className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 flex-none text-amber-300" /><p>Cadastre somente contas suas. Guarde os códigos de recuperação do serviço externo antes de remover uma conta do Google Authenticator.</p></div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
          <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-cyan-300" /><h2 className="font-bold">Adicionar conta</h2></div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-400">Nome da conta</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={128} placeholder="Ex.: Uber Motorista" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-cyan-300/60" /></label>
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-400">Emissor — opcional</span><input value={issuer} onChange={(event) => setIssuer(event.target.value)} maxLength={128} placeholder="Ex.: Uber" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-cyan-300/60" /></label>
            <label className="space-y-1 md:col-span-2"><span className="text-xs font-semibold text-slate-400">Chave secreta Base32</span><div className="flex rounded-xl border border-white/10 bg-slate-900 focus-within:border-cyan-300/60"><input value={secret} onChange={(event) => setSecret(event.target.value)} type={showSecret ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="Cole a chave fornecida pela conta" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm outline-none" /><button type="button" onClick={() => setShowSecret((value) => !value)} aria-label={showSecret ? "Ocultar chave" : "Mostrar chave"} className="px-3 text-slate-300 hover:text-white">{showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><p className="text-xs text-slate-500">A chave é cifrada ao salvar e não poderá ser lida novamente pelo ADM.</p></label>
          </div>
          <button onClick={addEntry} disabled={createMutation.isPending} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"><KeyRound className="h-4 w-4" />{createMutation.isPending ? "Protegendo chave..." : "Adicionar conta"}</button>
        </section>

        {linkingEntryId !== null && <section className="rounded-2xl border border-lime-300/30 bg-lime-300/5 p-5"><div className="flex items-start gap-3"><Link2 className="mt-0.5 h-5 w-5 flex-none text-lime-300" /><div className="min-w-0 flex-1"><p className="font-black text-lime-100">Direcionar chave para página de login</p><p className="mt-1 text-sm text-slate-300">{linkingEntry?.label || "Nova conta"} ficará gerando código na seção Dados de Login do pedido escolhido. Só pedidos em aberto aparecem.</p><div className="mt-4 flex gap-2"><input value={linkSearch} onChange={(event) => setLinkSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && linkSearch.trim()) setSubmittedLinkSearch(linkSearch.trim()); }} placeholder="Telefone, CPF, *cadastro ou #pedido" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-lime-300/60" /><button onClick={() => setSubmittedLinkSearch(linkSearch.trim())} disabled={!linkSearch.trim() || orderSearchQuery.isFetching} className="rounded-xl bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">{orderSearchQuery.isFetching ? "Buscando..." : "Buscar"}</button><button onClick={() => { setLinkingEntryId(null); setSubmittedLinkSearch(null); setLinkSearch(""); }} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">Cancelar</button></div>{orderSearchQuery.isError && <p className="mt-3 text-sm text-red-300">{orderSearchQuery.error.message}</p>}{submittedLinkSearch && !orderSearchQuery.isFetching && !orderSearchQuery.isError && orderSearchQuery.data?.length === 0 && <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">Nenhum pedido em aberto encontrado para esta busca.</p>}{orderSearchQuery.data && orderSearchQuery.data.length > 0 && <div className="mt-3 space-y-2">{orderSearchQuery.data.map((order) => <button key={order.registrationId} onClick={() => linkMutation.mutate({ entryId: linkingEntryId, registrationId: order.registrationId })} disabled={linkMutation.isPending} className="w-full rounded-xl border border-white/10 bg-slate-950/70 p-3 text-left hover:border-lime-300/50 hover:bg-lime-300/5 disabled:opacity-60"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-white">#{order.orderNumber || order.registrationId} · {order.customerName || "Cliente"}</p><p className="mt-1 text-xs text-slate-400">Cadastro {order.customerNumber ? `*${order.customerNumber}` : "não informado"} · {order.customerPhone || "telefone não informado"}{order.customerCpfMasked ? ` · CPF ${order.customerCpfMasked}` : ""}</p><p className="mt-1 text-xs text-lime-200">{order.serviceName || "Pedido"}{order.serviceOption ? ` — ${order.serviceOption}` : ""}</p></div><span className="rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300">{order.latestStatus}</span></div></button>)}</div>}</div></div></section>}

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:justify-start"><h2 className="text-base font-black">Contas cadastradas</h2><span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-slate-400">{entrySearch.trim() ? `${filteredEntries.length}/${entriesQuery.data?.length || 0}` : entriesQuery.data?.length || 0}</span></div>
            <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200" /><input value={entrySearch} onChange={(event) => setEntrySearch(event.target.value)} maxLength={128} placeholder="Pesquisar por nome da conta" aria-label="Pesquisar conta por nome" className="w-full rounded-xl border border-cyan-300/20 bg-slate-950/80 py-2.5 pl-10 pr-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" />{entrySearch && <button type="button" onClick={() => setEntrySearch("")} aria-label="Limpar pesquisa" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>}</div>
          </div>
          {entriesQuery.isLoading ? <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">Carregando cofre...</p> : filteredEntries.length ? filteredEntries.map((entry) => (
            <article key={entry.id} className={`rounded-2xl border p-4 transition-colors ${revealedEntryId === entry.id ? "border-cyan-300/50 bg-cyan-400/5" : "border-white/10 bg-slate-950/75"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{entry.label}</p><p className="text-xs text-slate-400">{entry.issuer || "Sem emissor informado"}</p>{entry.linkedRegistrationId && <p className="mt-1 text-xs font-bold text-lime-300">Direcionada ao pedido #{entry.linkedRegistrationId}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => setRevealedEntryId(revealedEntryId === entry.id ? null : entry.id)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/20">{revealedEntryId === entry.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{revealedEntryId === entry.id ? "Ocultar" : "Ver código"}</button>{entry.linkedRegistrationId ? <button onClick={() => unlinkMutation.mutate({ id: entry.id })} disabled={unlinkMutation.isPending} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-300/20"><Unlink className="h-4 w-4" />Remover do pedido</button> : <button onClick={() => { setLinkingEntryId(entry.id); setLinkSearch(""); setSubmittedLinkSearch(null); }} className="inline-flex items-center gap-2 rounded-xl border border-lime-300/30 bg-lime-300/10 px-3 py-2 text-xs font-bold text-lime-100 hover:bg-lime-300/20"><Link2 className="h-4 w-4" />Direcionar para login</button>}<button onClick={() => { if (window.confirm(`Excluir ${entry.label}? A chave não poderá ser recuperada.`)) deleteMutation.mutate({ id: entry.id }); }} disabled={deleteMutation.isPending} className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-400/20"><Trash2 className="h-4 w-4" />Excluir</button></div></div>
              {revealedEntryId === entry.id && <div className="mt-4 rounded-xl border border-cyan-300/20 bg-black/30 p-4"><p className="text-center text-xs font-bold tracking-[0.18em] text-cyan-200">{activeEntry?.label}</p>{codeQuery.isLoading ? <p className="py-4 text-center text-sm text-slate-400">Gerando código...</p> : codeQuery.data?.code ? <><button onClick={copyCurrentCode} className="mx-auto mt-2 flex items-center gap-3 rounded-xl px-3 py-2 font-mono text-4xl font-black tracking-[0.22em] text-white hover:bg-white/5"><span>{codeQuery.data.code}</span>{copied ? <Check className="h-5 w-5 text-emerald-300" /> : <Copy className="h-5 w-5 text-cyan-300" />}</button><div className="mx-auto mt-2 max-w-xs"><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-300 transition-[width] duration-1000" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-center text-xs text-slate-400">Novo código em {remaining}s · tela oculta automaticamente em 1 minuto</p></div></> : <p className="py-4 text-center text-sm text-red-300">Não foi possível gerar o código. Confira a configuração da chave.</p>}</div>}
            </article>
          )) : entrySearch.trim() ? <p className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-400/5 p-8 text-center text-sm text-slate-300">Nenhuma conta encontrada para “{entrySearch.trim()}”.</p> : <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-500">Nenhuma conta cadastrada. Adicione sua primeira chave acima.</p>}
        </section>
      </div>
    </div>
  );
}
