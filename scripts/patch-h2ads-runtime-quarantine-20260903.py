from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{path}: esperado 1 trecho, encontrado {count}")
    p.write_text(text.replace(before, after, 1), encoding="utf-8")

browser = "workers/windows/browser-session.mjs"
route = "server/h2adsWorkerRoute.ts"
core = "server/h2ads.ts"
ui = "client/src/pages/H2Ads.tsx"

replace_once(
    browser,
    '  writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: reason, killSwitchTriggeredAt: new Date().toISOString() });\n  if (relay) await relay.close(true).catch(() => undefined);',
    '  writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: reason, killSwitchTriggeredAt: new Date().toISOString() });\n  await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "blocked", errorCategory: reason }).catch(() => undefined);\n  if (relay) await relay.close(true).catch(() => undefined);'
)

replace_once(
    browser,
    '        await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "closed" });',
    '        if (!killSwitchTriggered) await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "closed" });'
)

replace_once(
    route,
    '    const state = req.body?.state === "closed" || req.body?.state === "browser_open" ? req.body.state : null;\n    const observedIp = workerString(req.body?.observedIp, 64);\n    if (!Number.isInteger(instanceId) || instanceId < 1 || !state || (state === "browser_open" && !observedIp)) {',
    '    const state = req.body?.state === "closed" || req.body?.state === "browser_open" || req.body?.state === "blocked" ? req.body.state : null;\n    const observedIp = workerString(req.body?.observedIp, 64);\n    const errorCategory = workerString(req.body?.errorCategory, 64);\n    if (!Number.isInteger(instanceId) || instanceId < 1 || !state || (state === "browser_open" && !observedIp) || (state === "blocked" && !errorCategory)) {'
)

replace_once(
    route,
    '    const updated = state === "browser_open"\n      ? await recordH2AdsRuntimeIp({ workerId: worker.id, instanceId, observedIp: observedIp! })\n      : await recordH2AdsBrowserRuntimeState({ workerId: worker.id, instanceId, state: "closed" });',
    '    const updated = state === "browser_open"\n      ? await recordH2AdsRuntimeIp({ workerId: worker.id, instanceId, observedIp: observedIp! })\n      : await recordH2AdsBrowserRuntimeState({ workerId: worker.id, instanceId, state, errorCategory });'
)

replace_once(
    core,
    'export async function recordH2AdsBrowserRuntimeState(input: { workerId: number; instanceId: number; state: "closed" }): Promise<boolean> {',
    'export async function recordH2AdsBrowserRuntimeState(input: { workerId: number; instanceId: number; state: "closed" | "blocked"; errorCategory?: string | null }): Promise<boolean> {'
)

replace_once(
    core,
    '  await db.update(h2AdsInstanceBrowserRuns).set({ state: "closed", lastErrorCategory: null, lastChangedAt: new Date() }).where(eq(h2AdsInstanceBrowserRuns.id, runs[0].id));',
    '  await db.update(h2AdsInstanceBrowserRuns).set({ state: input.state, lastErrorCategory: input.state === "blocked" ? (input.errorCategory ?? "runtime_blocked") : null, lastChangedAt: new Date() }).where(eq(h2AdsInstanceBrowserRuns.id, runs[0].id));'
)

old_ui = '  const browserState = browserRun?.state === "browser_open" ? "Browser aberto no perfil local" : browserRun?.state === "closed" ? "Browser encerrado · perfil local preservado" : browserRun?.state === "proxy_verified" ? "Perfil local pronto · proxy confirmado" : browserRun?.state === "queued" ? "Comando na fila do Worker" : browserRun?.state === "preparing" ? "Verificando a rota pelo Worker" : browserRun?.state === "blocked" ? "Operação bloqueada: proxy ou browser indisponível" : "Browser ainda não preparado";'
new_ui = '  const blockedReason = browserRun?.lastErrorCategory === "google_sorry_detected" ? "Google recusou esta rota · sessão encerrada por segurança" : browserRun?.lastErrorCategory === "firefox_navigation_guard_unavailable" ? "Proteção do Firefox indisponível · sessão encerrada" : browserRun?.lastErrorCategory === "proxy_path_unverified" ? "Rota perdeu a validação · sessão encerrada" : browserRun?.lastErrorCategory === "proxy_rotation_unverified" ? "Rotação da rota não pôde ser validada · sessão encerrada" : "Operação bloqueada: proxy ou browser indisponível";\n  const browserState = browserRun?.state === "browser_open" ? "Browser aberto no perfil local" : browserRun?.state === "closed" ? "Browser encerrado · perfil local preservado" : browserRun?.state === "proxy_verified" ? "Perfil local pronto · proxy confirmado" : browserRun?.state === "queued" ? "Comando na fila do Worker" : browserRun?.state === "preparing" ? "Verificando a rota pelo Worker" : browserRun?.state === "blocked" ? blockedReason : "Browser ainda não preparado";'
replace_once(ui, old_ui, new_ui)

print("Quarentena runtime H2ADS aplicada.")
