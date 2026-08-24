import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Power, Route, Save, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { MAINTENANCE_ROUTE_OPTIONS, type MaintenanceManifestConfig, type MaintenanceRouteId } from "@shared/maintenanceManifest";

const emptyConfig: MaintenanceManifestConfig = {
  enabled: false,
  routeIds: ["home", "login", "loan", "gastos", "tracking"],
  eyebrow: "COMUNICADO OPERACIONAL",
  title: "Estamos em manutenção programada",
  message: "Estamos aprimorando esta área para oferecer uma experiência mais rápida e segura. Volte em breve.",
  startsAt: "",
  expectedReturnAt: "",
};

function localDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function MaintenanceManifestSettings() {
  const utils = trpc.useUtils();
  const configQuery = trpc.maintenanceManifest.get.useQuery(undefined, { staleTime: 0 });
  const [draft, setDraft] = useState<MaintenanceManifestConfig>(emptyConfig);

  useEffect(() => {
    if (!configQuery.data) return;
    setDraft({
      ...configQuery.data,
      routeIds: [...configQuery.data.routeIds],
      startsAt: localDateTime(configQuery.data.startsAt),
      expectedReturnAt: localDateTime(configQuery.data.expectedReturnAt),
    });
  }, [configQuery.data]);

  const selectedRoutes = useMemo(() => new Set(draft.routeIds), [draft.routeIds]);
  const saveMutation = trpc.maintenanceManifest.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.maintenanceManifest.get.invalidate(), utils.settings.getAll.invalidate()]);
      toast.success(draft.enabled ? "Manifesto de manutenção ativado e salvo." : "Manifesto de manutenção salvo como desativado.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar o manifesto."),
  });

  const toggleRoute = (routeId: MaintenanceRouteId) => {
    setDraft((current) => ({
      ...current,
      routeIds: current.routeIds.includes(routeId)
        ? current.routeIds.filter((id) => id !== routeId)
        : [...current.routeIds, routeId],
    }));
  };

  const save = () => {
    if (draft.enabled && draft.routeIds.length === 0) {
      toast.error("Escolha pelo menos uma rota antes de ativar o manifesto.");
      return;
    }
    saveMutation.mutate({
      ...draft,
      eyebrow: draft.eyebrow.trim(),
      title: draft.title.trim(),
      message: draft.message.trim(),
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : "",
      expectedReturnAt: draft.expectedReturnAt ? new Date(draft.expectedReturnAt).toISOString() : "",
    });
  };

  if (configQuery.isLoading) return <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-sm text-slate-400">Carregando manifesto de manutenção...</div>;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-[#071326] p-5 shadow-[0_0_40px_rgba(34,211,238,.08)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(circle at 84% 8%, rgba(168,85,247,.22), transparent 32%), radial-gradient(circle at 8% 100%, rgba(34,211,238,.15), transparent 35%)" }} />
      <div className="relative space-y-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3"><div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/10"><Wrench className="h-6 w-6 text-cyan-100" /></div><div><p className="text-[11px] font-black tracking-[0.18em] text-cyan-200">CONTROLE DE COMUNICADO</p><h2 className="text-xl font-black text-white">Manifesto de Manutenção</h2><p className="mt-1 max-w-2xl text-sm text-slate-300">Quando ativo, o card bloqueia somente as rotas marcadas abaixo. Desative a qualquer momento para liberar as páginas imediatamente.</p></div></div>
          <button type="button" onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black transition ${draft.enabled ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100" : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"}`}><Power className="h-4 w-4" />{draft.enabled ? "Manifesto ativo" : "Manifesto desativado"}</button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5">
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-300">Identificação do card</span><input value={draft.eyebrow} onChange={(event) => setDraft((current) => ({ ...current, eyebrow: event.target.value }))} maxLength={64} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-300">Título</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={120} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-300">Informativo para o cliente</span><textarea value={draft.message} onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))} maxLength={600} rows={4} className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-cyan-300/60" /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-300"><Clock3 className="h-3.5 w-3.5 text-cyan-200" />Início — opcional</span><input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60" /></label><label className="block space-y-1.5"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-300"><Clock3 className="h-3.5 w-3.5 text-violet-200" />Previsão de retorno — opcional</span><input type="datetime-local" value={draft.expectedReturnAt} onChange={(event) => setDraft((current) => ({ ...current, expectedReturnAt: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-300/60" /></label></div>
          </div>

          <aside className="rounded-2xl border border-cyan-200/15 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center gap-2"><Route className="h-4 w-4 text-cyan-200" /><h3 className="font-black text-white">Rotas em manutenção</h3></div><p className="mt-1 text-xs leading-5 text-slate-400">Selecione somente onde deseja mostrar o card e interromper o acesso durante a manutenção.</p><div className="mt-4 space-y-2">{MAINTENANCE_ROUTE_OPTIONS.map((route) => { const checked = selectedRoutes.has(route.id); return <button type="button" key={route.id} onClick={() => toggleRoute(route.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${checked ? "border-cyan-300/35 bg-cyan-300/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}><span><span className="block text-sm font-bold text-white">{route.label}</span><span className="mt-0.5 block font-mono text-[11px] text-slate-400">{route.path}</span></span>{checked ? <CheckCircle2 className="h-5 w-5 flex-none text-cyan-200" /> : <span className="h-5 w-5 flex-none rounded-full border border-slate-500" />}</button>; })}</div><div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Rotas não selecionadas continuam funcionando normalmente.</div></aside>
        </div>

        <footer className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-400">Estado atual: <strong className={draft.enabled ? "text-emerald-200" : "text-slate-300"}>{draft.enabled ? `${draft.routeIds.length} rota(s) bloqueada(s)` : "nenhuma rota bloqueada"}</strong></p><button type="button" onClick={save} disabled={saveMutation.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-sky-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(34,211,238,.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saveMutation.isPending ? "Salvando manifesto..." : "Salvar manifesto"}</button></footer>
      </div>
    </section>
  );
}
