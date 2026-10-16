import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { calculateGlobalPromotionPrice, globalPromotionLabel, globalPromotionWindow, isValidGlobalPromotionSchedule, type GlobalPromotionSchedule } from "@shared/globalPromotion";
import AdminHeader from "@/components/AdminHeader";

export default function AdminGlobalPromotion() {
  const utils = trpc.useUtils();
  const query = trpc.globalPromotion.get.useQuery(undefined, { refetchOnWindowFocus: true });
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("10");
  const [ready, setReady] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"manual" | "period" | "weekly">("manual");
  const [startsOn, setStartsOn] = useState("2026-10-15");
  const [endsOn, setEndsOn] = useState("2026-10-16");
  const [startTime, setStartTime] = useState("23:00");
  const [endTime, setEndTime] = useState("06:00");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const localDateTime = (date: string, time: string) => date + "T" + time + ":00-03:00";
  const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  useEffect(() => {
    if (!query.data || ready) return;
    setType(query.data.type);
    setValue(String(query.data.value));
    if (query.data.schedule?.mode === "period") {
      setScheduleMode("period");
      setStartsOn(query.data.schedule.startAt.slice(0, 10));
      setEndsOn(query.data.schedule.endAt.slice(0, 10));
      setStartTime(query.data.schedule.startAt.slice(11, 16));
      setEndTime(query.data.schedule.endAt.slice(11, 16));
    } else if (query.data.schedule?.mode === "weekly") {
      setScheduleMode("weekly");
      setStartsOn(query.data.schedule.startsOn || "2026-10-15");
      setEndsOn(query.data.schedule.endsOn || "2026-10-16");
      setStartTime(query.data.schedule.startTime);
      setEndTime(query.data.schedule.endTime);
      setWeekdays(query.data.schedule.weekdays);
    }
    setReady(true);
  }, [query.data, ready]);
  const save = trpc.globalPromotion.save.useMutation({
    onSuccess: () => { void utils.globalPromotion.get.invalidate(); toast.success("Configuração da promoção salva."); },
    onError: e => toast.error(e.message),
  });
  const amount = Number(value.replace(",", "."));
  const valid = Number.isFinite(amount) && amount > 0 && (type !== "percentage" || amount <= 100) && amount <= 100000;
  const schedule: GlobalPromotionSchedule | null = scheduleMode === "manual" ? null
    : scheduleMode === "period"
      ? { mode: "period", startAt: localDateTime(startsOn, startTime), endAt: localDateTime(endsOn, endTime) }
      : { mode: "weekly", weekdays, startTime, endTime };
  const scheduleValid = schedule === null || isValidGlobalPromotionSchedule(schedule);
  const current = query.data;
  const windowState = globalPromotionWindow(current, nowMs);
  const statusLabel = !current?.active ? "DESATIVADA" : windowState.status === "active" ? "ATIVA" : windowState.status === "scheduled" ? "AGENDADA" : "ENCERRADA";

  const draft = { active: true, type, value: amount, revision: "preview", updatedAt: null, schedule: null };
  const preview = valid ? calculateGlobalPromotionPrice({ price: "400,00", originalPrice: "500,00" }, draft) : null;
  return <div className="min-h-screen bg-[#090b19] text-white">
    <AdminHeader title="Promoção Geral" />
    <main className="mx-auto max-w-3xl p-4 sm:p-8 space-y-5">
      <Link href="/admin/codes" className="text-sm text-violet-300">← Voltar ao ADM</Link>
      <h1 className="text-2xl font-black">🏷️ PROMOÇÃO GERAL DO SITE</h1>
      <p className="text-sm text-slate-300">Um clique ativa ou desativa o desconto em todos os preços dos produtos e suas opções. Os preços cadastrados continuam intactos.</p>
      <div className="rounded-xl border border-violet-400/30 bg-slate-900 p-5 space-y-4">
        <p className={windowState.active ? "font-bold text-emerald-400" : "font-bold text-slate-300"}>Situação atual: {statusLabel}</p>
        {windowState.active && <p className="text-amber-300 font-semibold">{globalPromotionLabel(current)}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Tipo de desconto
            <select value={type} onChange={e => setType(e.target.value as "percentage" | "fixed")} className="mt-2 w-full rounded-lg bg-white p-3 text-black">
              <option value="percentage">Porcentagem (%)</option>
              <option value="fixed">Valor fixo em cada item (R$)</option>
            </select>
          </label>
          <label className="text-sm">Valor
            <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-lg bg-white p-3 text-black" placeholder={type === "percentage" ? "Ex.: 20" : "Ex.: 50,00"} />
          </label>
        </div>
        <section className="rounded-xl border border-violet-300/30 bg-black/20 p-4 space-y-3">
          <h2 className="text-base font-bold">⏱️ Programação e cronômetro da vitrine</h2>
          <p className="text-xs text-slate-300">Horário de Brasília. O contador aparecerá em cada card somente durante a promoção programada e terminará automaticamente no horário definido.</p>
          <label className="text-sm block">Modo de ativação
            <select className="mt-1 w-full rounded-lg bg-white p-2 text-black" value={scheduleMode} onChange={e => setScheduleMode(e.target.value as "manual" | "period" | "weekly")}>
              <option value="manual">Manual — sem horário de encerramento</option>
              <option value="period">Data e hora de início e fim</option>
              <option value="weekly">Dias da semana e horários recorrentes</option>
            </select>
          </label>
          {scheduleMode !== "manual" && <>
            <div className="grid gap-2 sm:grid-cols-2">
              {scheduleMode === "period" && <><label className="text-sm">Data de início<input className="mt-1 w-full rounded-lg bg-white p-2 text-black" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></label>
              <label className="text-sm">Data final<input className="mt-1 w-full rounded-lg bg-white p-2 text-black" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} /></label></>}
              <label className="text-sm">Horário de início<input className="mt-1 w-full rounded-lg bg-white p-2 text-black" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></label>
              <label className="text-sm">Horário final<input className="mt-1 w-full rounded-lg bg-white p-2 text-black" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></label>
            </div>
            {scheduleMode === "weekly" && <fieldset className="space-y-2">
              <legend className="text-sm font-bold">Selecione os dias da semana em que a promoção começa</legend>
              <div className="flex flex-wrap gap-2">{weekdayLabels.map((label, day) => <label key={label} className={`inline-flex items-center gap-2 rounded-lg border p-2 text-sm ${weekdays.includes(day) ? "border-emerald-400 bg-emerald-950/50" : "border-slate-700"}`}><input type="checkbox" checked={weekdays.includes(day)} onChange={() => setWeekdays(old => old.includes(day) ? old.filter(x => x !== day) : [...old, day].sort())}/>{label}</label>)}</div>
              <p className="text-xs text-amber-200">Por exemplo, segunda e terça das 23h às 06h encerram na manhã do dia seguinte. A programação semanal repete automaticamente todas as semanas, sem escolher datas.</p>
            </fieldset>}
            {!scheduleValid && <p className="text-red-300 text-sm">Confira o período, o horário e os dias selecionados antes de salvar.</p>}
          </>}
          <p className="text-xs text-slate-300">{scheduleMode === "manual" ? "A promoção ativa continua sem cronômetro." : "Ao clicar em Ativar/Atualizar, o ADM grava esta programação, sem alterar os preços cadastrados."}</p>
          {current?.schedule && <p className="text-xs text-violet-200">Programação gravada: {current.schedule.mode === "period" ? "Período específico" : "Semanal, sem data final"} • {windowState.status === "active" ? "em andamento" : windowState.status === "scheduled" ? "aguardando horário" : windowState.status === "expired" ? "encerrada" : "desativada"}</p>}
        </section>
        <div className="rounded-lg bg-black/30 p-4 text-sm">
          <p className="font-bold">Exemplo demonstrativo</p>
          <p>Preço original: R$ 500,00 · preço promocional anterior: R$ 400,00</p>
          <p className="text-emerald-300 font-bold">Com a nova regra: {preview ? preview.final : "Informe um valor válido"}</p>
        </div>
        <p className="text-xs text-amber-200">Enquanto ativa, ignora descontos VIP, cupons, revendedor e promoções individuais no preço final. Restrições de acesso VIP continuam valendo. Desconto fixo é por item, não por carrinho. Pedidos já registrados não mudam.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" disabled={!valid || !scheduleValid || save.isPending || query.isLoading} onClick={() => { if (window.confirm("Ativar desconto geral em TODO o site? Os outros descontos não serão acumulados.")) save.mutate({ active: true, type, value: amount, schedule }); }} className="flex-1 rounded-lg bg-emerald-600 disabled:opacity-40 p-3 font-bold">🟢 ATIVAR / ATUALIZAR PROMOÇÃO</button>
          <button type="button" disabled={save.isPending || query.isLoading || !current?.active} onClick={() => { if (window.confirm("Desativar a promoção e restaurar todas as regras anteriores?")) save.mutate({ active: false, type: current?.type || type, value: current?.value || amount || 10, schedule: current?.schedule ?? null }); }} className="flex-1 rounded-lg bg-rose-700 disabled:opacity-40 p-3 font-bold">🔴 DESATIVAR PROMOÇÃO</button>
        </div>
        <p className="text-xs text-slate-400">Desligada por padrão. A ativação só acontece após confirmação do ADM.</p>
      </div>
    </main>
  </div>;
}
