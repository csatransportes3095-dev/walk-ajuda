import { Clock3, ShieldCheck, Sparkles, UserRoundCog, Wrench } from "lucide-react";
import type { MaintenanceManifestConfig } from "@shared/maintenanceManifest";

function displayDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function MaintenanceManifestGate({ config }: { config: MaintenanceManifestConfig }) {
  const startsAt = displayDate(config.startsAt);
  const expectedReturnAt = displayDate(config.expectedReturnAt);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040714] px-4 py-8 text-white sm:flex sm:items-center sm:justify-center sm:p-8">
      <div className="pointer-events-none absolute inset-0 opacity-80" style={{ backgroundImage: "radial-gradient(circle at 14% 12%, rgba(34,211,238,.18), transparent 34%), radial-gradient(circle at 88% 78%, rgba(168,85,247,.20), transparent 34%), linear-gradient(125deg, rgba(15,23,42,.8), rgba(3,7,18,.98))" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.22) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />

      <section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-cyan-200/25 bg-slate-950/60 p-1 shadow-[0_0_80px_rgba(34,211,238,.16)] backdrop-blur-2xl">
        <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
        <div className="rounded-[1.8rem] border border-white/10 bg-gradient-to-br from-white/[0.10] via-white/[0.035] to-transparent px-6 py-8 sm:px-10 sm:py-11">
          <div className="flex flex-col gap-7 sm:flex-row sm:items-start">
            <div className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-cyan-200/30 bg-gradient-to-br from-cyan-300/25 to-violet-500/25 shadow-[0_0_28px_rgba(34,211,238,.28)]">
              <Wrench className="h-8 w-8 text-cyan-100" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1 text-[10px] font-black tracking-[0.18em] text-cyan-100"><Sparkles className="h-3.5 w-3.5" />{config.eyebrow}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-bold text-emerald-100"><ShieldCheck className="h-3.5 w-3.5" />Ambiente seguro</span>
              </div>
              <h1 className="max-w-xl text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-4xl">{config.title}</h1>
              <p className="mt-4 max-w-xl whitespace-pre-wrap text-sm leading-7 text-slate-200 sm:text-base">{config.message}</p>

              {(startsAt || expectedReturnAt) && <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {startsAt && <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-black tracking-[0.16em] text-slate-400">INÍCIO</p><p className="mt-1 text-sm font-bold text-white">{startsAt}</p></div>}
                {expectedReturnAt && <div className="rounded-2xl border border-violet-200/20 bg-violet-400/10 p-4"><p className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.16em] text-violet-100"><Clock3 className="h-3.5 w-3.5" />PREVISÃO DE RETORNO</p><p className="mt-1 text-sm font-bold text-white">{expectedReturnAt}</p></div>}
              </div>}
            </div>
          </div>
          <a href="/atualizarcadastro" className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-400 px-5 py-4 text-sm font-black tracking-wide text-slate-950 shadow-[0_0_30px_rgba(52,211,153,.22)] transition hover:bg-emerald-300 active:scale-[.99]"><UserRoundCog className="h-5 w-5" />ATUALIZAR CADASTRO</a>
          <div className="mt-8 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <p className="mt-5 text-center text-xs text-slate-400">Agradecemos sua compreensão. Estamos preparando uma experiência ainda melhor para você.</p>
        </div>
      </section>
    </main>
  );
}
