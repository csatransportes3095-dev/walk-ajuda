from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{path}: esperado 1 trecho, encontrado {count}")
    file.write_text(text.replace(before, after, 1), encoding="utf-8")


server = "server/h2ads.ts"
worker = "workers/windows/H2AdsWorker.ps1"

# 1) Repara estados antigos que ficaram como local_only mesmo tendo snapshot íntegro.
replace_once(
    server,
'''async function requireH2AdsDb() {\n  const db = await getDb();\n  if (!db) throw new Error("Banco indisponível para o H2 Ads.");\n  return db;\n}\n\nexport async function listH2AdsDashboard(): Promise<H2AdsDashboard> {\n  const db = await requireH2AdsDb();''',
'''async function requireH2AdsDb() {\n  const db = await getDb();\n  if (!db) throw new Error("Banco indisponível para o H2 Ads.");\n  return db;\n}\n\nfunction h2AdsSnapshotVersionFromKey(snapshotKey: string | null | undefined): number | null {\n  const match = typeof snapshotKey === "string" ? snapshotKey.match(/\\/v(\\d+)-/i) : null;\n  if (!match) return null;\n  const version = Number(match[1]);\n  return Number.isInteger(version) && version > 0 ? version : null;\n}\n\nfunction hasVerifiedH2AdsSnapshot(assignment: { snapshotKey?: string | null; integrityHash?: string | null; snapshotSizeBytes?: number | null }): boolean {\n  return Boolean(\n    assignment.snapshotKey &&\n    assignment.integrityHash &&\n    /^[a-f0-9]{64}$/i.test(assignment.integrityHash) &&\n    assignment.snapshotSizeBytes &&\n    assignment.snapshotSizeBytes > 0,\n  );\n}\n\nasync function repairH2AdsSnapshotProfileStates() {\n  const db = await requireH2AdsDb();\n  const rows = await db.select({\n    id: h2AdsInstanceWorkerAssignments.id,\n    profileState: h2AdsInstanceWorkerAssignments.profileState,\n    profileVersion: h2AdsInstanceWorkerAssignments.profileVersion,\n    snapshotKey: h2AdsInstanceWorkerAssignments.snapshotKey,\n    integrityHash: h2AdsInstanceWorkerAssignments.integrityHash,\n    snapshotSizeBytes: h2AdsInstanceWorkerAssignments.snapshotSizeBytes,\n  }).from(h2AdsInstanceWorkerAssignments).where(eq(h2AdsInstanceWorkerAssignments.profileState, "local_only"));\n\n  for (const assignment of rows) {\n    if (!hasVerifiedH2AdsSnapshot(assignment)) continue;\n    const snapshotVersion = h2AdsSnapshotVersionFromKey(assignment.snapshotKey);\n    await db.update(h2AdsInstanceWorkerAssignments).set({\n      profileState: "snapshot_ready",\n      profileVersion: Math.max(assignment.profileVersion || 0, snapshotVersion || 0, 1),\n      updatedAt: new Date(),\n    }).where(eq(h2AdsInstanceWorkerAssignments.id, assignment.id));\n  }\n}\n\nexport async function listH2AdsDashboard(): Promise<H2AdsDashboard> {\n  const db = await requireH2AdsDb();\n  await repairH2AdsSnapshotProfileStates();'''
)

# 2) Preparar nunca mais apaga snapshot_ready nem reseta versão para v1.
replace_once(
    server,
'''  if (input.state === "proxy_verified") {\n    await db.update(h2AdsInstanceWorkerAssignments).set({ profileState: "local_only", profileVersion: 1, updatedAt: new Date() }).where(and(eq(h2AdsInstanceWorkerAssignments.instanceId, command.instanceId), eq(h2AdsInstanceWorkerAssignments.workerId, input.workerId)));\n  }''',
'''  if (input.state === "proxy_verified") {\n    const assignments = await db.select({\n      id: h2AdsInstanceWorkerAssignments.id,\n      profileState: h2AdsInstanceWorkerAssignments.profileState,\n      profileVersion: h2AdsInstanceWorkerAssignments.profileVersion,\n      snapshotKey: h2AdsInstanceWorkerAssignments.snapshotKey,\n      integrityHash: h2AdsInstanceWorkerAssignments.integrityHash,\n      snapshotSizeBytes: h2AdsInstanceWorkerAssignments.snapshotSizeBytes,\n    }).from(h2AdsInstanceWorkerAssignments).where(and(eq(h2AdsInstanceWorkerAssignments.instanceId, command.instanceId), eq(h2AdsInstanceWorkerAssignments.workerId, input.workerId))).limit(1);\n    const assignment = assignments[0];\n    if (assignment) {\n      const hasSnapshot = hasVerifiedH2AdsSnapshot(assignment);\n      const snapshotVersion = h2AdsSnapshotVersionFromKey(assignment.snapshotKey);\n      await db.update(h2AdsInstanceWorkerAssignments).set({\n        profileState: hasSnapshot ? "snapshot_ready" : (assignment.profileState === "snapshot_ready" ? "snapshot_ready" : "local_only"),\n        profileVersion: Math.max(assignment.profileVersion || 0, hasSnapshot ? (snapshotVersion || 0) : 0, 1),\n        updatedAt: new Date(),\n      }).where(eq(h2AdsInstanceWorkerAssignments.id, assignment.id));\n    }\n  }'''
)

# 3) Ao fechar Firefox, não toca no backup canônico do Chrome e não tenta matar sessão do outro engine.
replace_once(
    worker,
'''function Close-BrowserSession([object]$Config, [object]$Payload) {\n  $instanceId = [int]$Payload.command.instanceId\n  $chromeProfileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId"\n  $firefoxProfileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId-firefox"\n  foreach ($profileDirectory in @($chromeProfileDirectory, $firefoxProfileDirectory)) {\n    $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"\n    if (Test-Path $sessionPath) {\n      $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json\n      if ($session.nodePid) {\n        $nodePid = [int]$session.nodePid\n        if (Get-Process -Id $nodePid -ErrorAction SilentlyContinue) { & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null }\n      }\n      Remove-Item -Force $sessionPath -ErrorAction SilentlyContinue\n    }\n  }\n  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress\n  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null\n  Queue-H2AdsProfileSnapshot $instanceId\n}''',
'''function Close-BrowserSession([object]$Config, [object]$Payload) {\n  $instanceId = [int]$Payload.command.instanceId\n  $engine = if ([string]$Payload.proxy.browserEngine -eq "firefox") { "firefox" } else { "chrome" }\n  $profileDirectory = if ($engine -eq "firefox") { Join-Path $ProfilesDirectory "instance-$instanceId-firefox" } else { Join-Path $ProfilesDirectory "instance-$instanceId" }\n  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"\n  if (Test-Path $sessionPath) {\n    $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json\n    if ($session.nodePid) {\n      $nodePid = [int]$session.nodePid\n      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $nodePid" -ErrorAction SilentlyContinue\n      if ($process -and [string]$process.CommandLine -like "*$SessionRunnerPath*") {\n        & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null\n      }\n    }\n    Remove-Item -Force $sessionPath -ErrorAction SilentlyContinue\n  }\n  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress\n  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null\n  if ($engine -eq "chrome") { Queue-H2AdsProfileSnapshot $instanceId }\n}'''
)

replace_once(worker, '$AgentVersion = "1.4.1"', '$AgentVersion = "1.4.2"')

server_text = Path(server).read_text(encoding="utf-8")
worker_text = Path(worker).read_text(encoding="utf-8")
if 'profileState: "local_only", profileVersion: 1' in server_text:
    raise RuntimeError("reset antigo de profileState/profileVersion ainda existe")
if 'foreach ($profileDirectory in @($chromeProfileDirectory, $firefoxProfileDirectory))' in worker_text:
    raise RuntimeError("fechamento ainda percorre os dois engines")
if 'if ($engine -eq "chrome") { Queue-H2AdsProfileSnapshot $instanceId }' not in worker_text:
    raise RuntimeError("snapshot canônico não ficou restrito ao Chrome")

print("Backup preservado: snapshot_ready não é mais rebaixado e Firefox não toca no snapshot do Chrome.")
