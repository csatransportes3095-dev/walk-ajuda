from pathlib import Path

p = Path("client/src/pages/H2Ads.tsx")
text = p.read_text(encoding="utf-8")

replacements = [
    (
        'const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false, staleTime: 3_000, refetchInterval: 12_000, refetchOnWindowFocus: false });',
        'const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false, staleTime: 0, refetchInterval: 1_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });',
    ),
    (
        'for (const delay of [350, 800, 1_500, 2_600, 4_000]) window.setTimeout(() => { void refresh(); }, delay);\n  window.setTimeout(() => setAction(instanceId, null), 4_600);',
        'for (const delay of [120, 300, 600, 1_000, 1_500, 2_200, 3_200, 4_800, 6_500]) window.setTimeout(() => { void refresh(); }, delay);\n  window.setTimeout(() => setAction(instanceId, null), 7_000);',
    ),
    (
        '  const instanceBusy = Boolean(actionState);\n  const browserState =',
        '  const actionCompleted = Boolean(actionState && ((actionState.startsWith("Preparando") && (browserRun?.state === "proxy_verified" || browserRun?.state === "blocked")) || (actionState.startsWith("Abrindo") && (browserRun?.state === "browser_open" || browserRun?.state === "blocked")) || (actionState.startsWith("Encerrando") && browserRun?.state === "closed")));\n  const visibleActionState = actionCompleted ? undefined : actionState;\n  const instanceBusy = Boolean(visibleActionState);\n  const browserState =',
    ),
    ('{actionState || browserState}', '{visibleActionState || browserState}'),
    ('<article className="rounded-2xl border border-white/10 bg-[#10131A]/90 p-4">', '<article className="rounded-2xl border border-white/10 bg-[#10131A]/90 p-5 xl:p-6">'),
    ('<h5 className="text-base font-black text-white">{instance.name}</h5>', '<h5 className="text-xl font-black tracking-tight text-white xl:text-2xl">{instance.name}</h5>'),
    ('<p className="mt-1 text-xs text-slate-500">{instance.notes || "Rota individual desta instância."}</p>', '<p className="mt-1.5 text-sm leading-5 text-slate-400">{instance.notes || "Rota individual desta instância."}</p>'),
    ('className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#F5B800] px-3 py-2 text-xs font-black text-[#171003] disabled:opacity-40"', 'className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003] disabled:opacity-40"'),
    ('className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs"', 'className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-white/8 bg-black/20 p-4 text-sm"'),
    ('<p className="text-slate-500">Rota</p><p className={`mt-1 font-bold', '<p className="text-sm font-semibold text-slate-400">Rota</p><p className={`mt-1.5 text-base font-black'),
    ('<p className="text-slate-500">Último teste</p><p className={`mt-1 font-bold', '<p className="text-sm font-semibold text-slate-400">Último teste</p><p className={`mt-1.5 text-base font-black'),
    ('<p className="text-slate-500">Resultado</p><p className="mt-1 font-semibold text-slate-200">', '<p className="text-sm font-semibold text-slate-400">Resultado</p><p className="mt-1.5 text-base font-bold text-slate-100">'),
    ('<p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8CC8FF]">Worker de execução</p>', '<p className="text-xs font-black uppercase tracking-[0.12em] text-[#8CC8FF]">Worker de execução</p>'),
    ('className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs font-bold text-slate-200 disabled:opacity-50"', 'className="mt-3 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm font-bold text-slate-100 disabled:opacity-50"'),
    ('<p className="mt-2 text-[11px] text-slate-500">{assignment ?', '<p className="mt-2.5 text-xs font-medium text-slate-400">{assignment ?'),
    ('<p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200">Sessão local</p>', '<p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Sessão local</p>'),
    ('<p className={`mt-1 text-[11px] ${browserRun?.state === "blocked"', '<p className={`mt-1.5 text-sm font-semibold leading-5 ${browserRun?.state === "blocked"'),
    ('className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100', 'className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-black text-emerald-100'),
    ('className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5B800] px-3 py-2 text-xs font-black text-[#171003]', 'className="inline-flex items-center gap-2 rounded-lg bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003]'),
    ('className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-black text-rose-100', 'className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-black text-rose-100'),
    ('<p className="mt-2 text-[10px] leading-4 text-slate-500">A abertura depende', '<p className="mt-3 text-xs leading-5 text-slate-400">A abertura depende'),
    ('<p className="min-w-0 truncate text-[11px] text-slate-500">{profile?.lastCheckMessage', '<p className="min-w-0 truncate text-xs font-medium text-slate-400">{profile?.lastCheckMessage'),
    ('className="text-xs font-bold text-slate-400 hover:text-white">Editar</button>', 'className="text-sm font-bold text-slate-300 hover:text-white">Editar</button>'),
    ('className="inline-flex items-center gap-1 text-xs font-bold text-rose-300', 'className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-300'),
    ('<h4 className="text-base font-black text-white">{group.name}</h4>', '<h4 className="text-lg font-black text-white xl:text-xl">{group.name}</h4>'),
    ('<p className="mt-1 text-xs text-slate-400">{group.description', '<p className="mt-1.5 text-sm text-slate-400">{group.description'),
    ('<p className="font-black text-white">{worker.name}</p>', '<p className="text-lg font-black text-white">{worker.name}</p>'),
    ('<p className="mt-1 text-xs text-slate-500">{worker.computerName', '<p className="mt-1.5 text-sm text-slate-400">{worker.computerName'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"expected snippet not found: {old[:120]}")
    text = text.replace(old, new, 1)

p.write_text(text, encoding="utf-8")
