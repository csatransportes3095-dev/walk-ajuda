param(
  [switch]$Install,
  [switch]$Run,
  [switch]$Update,
  [switch]$EnableExtensionBrowser,
  [switch]$SnapshotQueueWorker,
  [string]$PanelUrl = "https://h2colombiano.com",
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$AgentVersion = "1.4.0"
$WorkerDirectory = Join-Path $env:LOCALAPPDATA "H2AdsWorker"
$ConfigPath = Join-Path $WorkerDirectory "worker.json"
$InstalledScriptPath = Join-Path $WorkerDirectory "H2AdsWorker.ps1"
$RunnerPath = Join-Path $WorkerDirectory "browser-runner.mjs"
$SessionRunnerPath = Join-Path $WorkerDirectory "browser-session.mjs"
$MobileRemotePath = Join-Path $WorkerDirectory "mobile-remote.mjs"
$ProfilesDirectory = Join-Path $WorkerDirectory "profiles"
$SnapshotQueueDirectory = Join-Path $WorkerDirectory "snapshot-queue"
$DeletionPriorityPath = Join-Path $WorkerDirectory "snapshot-queue-deletion-priority.signal"
$PackagePath = Join-Path $WorkerDirectory "package.json"
$ProxyChainPackagePath = Join-Path $WorkerDirectory "node_modules\proxy-chain\package.json"
$DedicatedBrowserDirectory = Join-Path $WorkerDirectory "browser\chrome"
$DedicatedChromePath = Join-Path $DedicatedBrowserDirectory "chrome.exe"
$TestingDirectory = Join-Path $WorkerDirectory "browser\\chrome-for-testing"
$TestingChromePath = Join-Path $TestingDirectory "chrome-win64\\chrome.exe"
$TestingV4Rule = "H2ADS Testing Chrome - Block Direct IPv4"
$TestingV6Rule = "H2ADS Testing Chrome - Block Direct IPv6"
$TestingRelease = "156.0.8078.12"
$FirewallRuleV4Name = "H2ADS Dedicated Chrome - Block Direct IPv4"
$FirewallRuleV6Name = "H2ADS Dedicated Chrome - Block Direct IPv6"
$TaskName = "H2 Ads Browser Worker"
$ShortcutName = "Iniciar H2Ads Worker.lnk"
$LauncherPath = Join-Path $WorkerDirectory "StartH2AdsWorker.vbs"

function Get-ComputerLabel {
  $name = $env:COMPUTERNAME
  if ([string]::IsNullOrWhiteSpace($name)) { throw "Não foi possível identificar este computador." }
  return $name.Trim()
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-SystemChromeExecutable {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe" }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe" })
  ) | Where-Object { $_ -and (Test-Path $_) }
  return $candidates | Select-Object -First 1
}

function Assert-GoogleChromeSignature([string]$Path) {
  if (!(Test-Path $Path)) { throw "Chrome dedicado do H2ADS não está disponível." }
  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne "Valid") { throw "A assinatura do Chrome usado pelo H2ADS não pôde ser validada." }
}

function Ensure-DedicatedBrowser {
  if (Test-Path $DedicatedChromePath) {
    Assert-GoogleChromeSignature $DedicatedChromePath
    return
  }
  $sourceChrome = Get-SystemChromeExecutable
  if (!$sourceChrome) { throw "Google Chrome não está instalado neste Worker." }
  Assert-GoogleChromeSignature $sourceChrome
  $sourceDirectory = Split-Path $sourceChrome -Parent
  if (Test-Path $DedicatedBrowserDirectory) { Remove-Item -Recurse -Force $DedicatedBrowserDirectory }
  New-Item -ItemType Directory -Force -Path $DedicatedBrowserDirectory | Out-Null
  Copy-Item -Path (Join-Path $sourceDirectory "*") -Destination $DedicatedBrowserDirectory -Recurse -Force
  Assert-GoogleChromeSignature $DedicatedChromePath
}

function Test-H2AdsTestingFirewall {
  if (!(Test-Path $TestingChromePath)) { return $false }
  foreach ($name in @($TestingV4Rule, $TestingV6Rule)) {
    $rule = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq "True" -and $_.Direction -eq "Outbound" -and $_.Action -eq "Block" } | Select-Object -First 1
    if (!$rule) { return $false }
    $filter = $rule | Get-NetFirewallApplicationFilter
    if (!$filter -or !([string]$filter.Program).Equals($TestingChromePath, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  }
  return $true
}

function Ensure-H2AdsTestingFirewall {
  if (Test-H2AdsTestingFirewall) { return }
  if (!(Test-IsAdministrator)) { throw "Chrome for Testing sem firewall validado. Execute como Administrador." }
  foreach ($name in @($TestingV4Rule, $TestingV6Rule)) {
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  }
  New-NetFirewallRule -DisplayName $TestingV4Rule -Direction Outbound -Program $TestingChromePath -Action Block -Protocol Any -RemoteAddress @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255") -Profile Any -Enabled True | Out-Null
  New-NetFirewallRule -DisplayName $TestingV6Rule -Direction Outbound -Program $TestingChromePath -Action Block -Protocol Any -RemoteAddress "Internet6" -Profile Any -Enabled True | Out-Null
  if (!(Test-H2AdsTestingFirewall)) { throw "Kill switch do Chrome for Testing nao validado." }
}

function Assert-H2AdsTestingExecutable {
  if (!(Test-Path $TestingChromePath)) { return $false }
  $actual = (Get-Item $TestingChromePath).VersionInfo.ProductVersion
  if ($actual -ne $TestingRelease) { throw "Versao inesperada do Chrome for Testing: $actual" }
  return $true
}

function Install-H2AdsTestingBrowser {
  if (!(Test-IsAdministrator)) { throw "Execute como Administrador para instalar o Chrome for Testing isolado." }
  if (Test-Path $TestingChromePath) {
    Assert-H2AdsTestingExecutable | Out-Null
    Ensure-H2AdsTestingFirewall
    return
  }
  $running = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction Stop | Where-Object {
    [string]$_.ExecutablePath -like "$WorkerDirectory*"
  })
  if ($running.Count -gt 0) { throw "Feche normalmente todas as instancias H2ADS antes da instalacao. Nenhum navegador foi encerrado." }
  $temp = Join-Path $WorkerDirectory "cft-setup-$([guid]::NewGuid().ToString('N'))"
  $url = "https://storage.googleapis.com/chrome-for-testing-public/$TestingRelease/win64/chrome-win64.zip"
  try {
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    $archive = Join-Path $temp "chrome-win64.zip"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
    if ((Get-Item $archive).Length -lt 10000000) { throw "Arquivo do Chrome for Testing incompleto." }
    $staging = Join-Path $temp "unpacked"
    Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
    $stagedExecutable = Join-Path $staging "chrome-win64\\chrome.exe"
    if (!(Test-Path $stagedExecutable)) { throw "Pacote oficial invalido." }
    if ((Get-Item $stagedExecutable).VersionInfo.ProductVersion -ne $TestingRelease) { throw "Versao do navegador nao corresponde ao pacote solicitado." }
    # Never overwrite the signed Chrome installation. The testing binary stays in a separate directory.
    New-Item -ItemType Directory -Force -Path (Split-Path $TestingDirectory -Parent) | Out-Null
    if (Test-Path $TestingDirectory) { throw "Pasta de teste existente: revise antes de instalar." }
    Move-Item -LiteralPath $staging -Destination $TestingDirectory
    Ensure-H2AdsTestingFirewall
    Assert-H2AdsTestingExecutable | Out-Null
  } finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Test-H2AdsBrowserFirewall {
  if (!(Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue)) { return $false }
  foreach ($ruleName in @($FirewallRuleV4Name, $FirewallRuleV6Name)) {
    $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq "True" -and $_.Direction -eq "Outbound" -and $_.Action -eq "Block" } | Select-Object -First 1
    if (!$rule) { return $false }
    $application = $rule | Get-NetFirewallApplicationFilter
    if (!$application -or !([string]$application.Program).Equals($DedicatedChromePath, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  }
  return $true
}

function Ensure-H2AdsBrowserFirewall {
  if (Test-H2AdsBrowserFirewall) { return }
  if (!(Test-IsAdministrator)) {
    throw "Firewall H2ADS obrigatório ausente. Execute a atualização do Worker como Administrador."
  }
  Get-NetFirewallRule -DisplayName $FirewallRuleV4Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $FirewallRuleV6Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $FirewallRuleV4Name -Direction Outbound -Program $DedicatedChromePath -Action Block -Protocol Any -RemoteAddress @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255") -Profile Any -Enabled True | Out-Null
  New-NetFirewallRule -DisplayName $FirewallRuleV6Name -Direction Outbound -Program $DedicatedChromePath -Action Block -Protocol Any -RemoteAddress "Internet6" -Profile Any -Enabled True | Out-Null
  if (!(Test-H2AdsBrowserFirewall)) { throw "O kill switch rígido do H2ADS não foi aplicado corretamente." }
}

function Read-PairingCode {
  if ([string]::IsNullOrWhiteSpace($PairingCode)) {
    $securePairingCode = Read-Host "Cole o código temporário criado no painel H2 Ads" -AsSecureString
    $credential = [System.Management.Automation.PSCredential]::new("pairing", $securePairingCode)
    $PairingCode = $credential.GetNetworkCredential().Password
  }
  $candidate = $PairingCode.Trim()
  if ($candidate -notmatch '^H2W-[A-Za-z0-9_-]{24}$') {
    throw "Código de pareamento inválido. Crie um novo código no painel e cole somente o código solicitado pelo agente."
  }
  return $candidate
}

function Save-WorkerConfig([object]$Claimed) {
  $secureToken = ConvertTo-SecureString -String $Claimed.workerToken -AsPlainText -Force
  $protectedToken = ConvertFrom-SecureString -SecureString $secureToken
  $config = [ordered]@{
    panelUrl = $PanelUrl.TrimEnd("/")
    workerKey = $Claimed.workerKey
    protectedToken = $protectedToken
    workerName = $Claimed.workerName
    capacity = $Claimed.capacity
    agentVersion = $AgentVersion
  }
  $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8 -NoNewline
}

function Get-WorkerToken([object]$Config) {
  $secureToken = ConvertTo-SecureString -String $Config.protectedToken
  $credential = [System.Management.Automation.PSCredential]::new("worker", $secureToken)
  return $credential.GetNetworkCredential().Password
}

function Get-WorkerHeaders([object]$Config) {
  return @{
    Authorization = "Bearer $(Get-WorkerToken $Config)"
    "X-H2ADS-Worker-Key" = $Config.workerKey
    "X-H2ADS-Agent-Version" = $AgentVersion
  }
}

function Invoke-WorkerHeartbeat([object]$Config) {
  $body = @{ computerName = Get-ComputerLabel; agentVersion = $AgentVersion } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/heartbeat" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null
}

function Ensure-BrowserPreparationComponent([object]$Config) {
  if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) { throw "Node.js não está disponível neste Worker." }
  if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm não está disponível neste Worker." }
  Invoke-WebRequest -UseBasicParsing -Uri "$($Config.panelUrl)/api/h2ads/worker/windows-browser-runner.mjs" -OutFile $RunnerPath
  Invoke-WebRequest -UseBasicParsing -Uri "$($Config.panelUrl)/api/h2ads/worker/windows-browser-session.mjs" -OutFile $SessionRunnerPath
  Invoke-WebRequest -UseBasicParsing -Uri "$($Config.panelUrl)/api/h2ads/worker/windows-extension-sync.mjs" -OutFile (Join-Path $WorkerDirectory "h2ads-extension-sync.mjs")
  Invoke-WebRequest -UseBasicParsing -Uri "$($Config.panelUrl)/api/h2ads/worker/windows-mobile-remote.mjs" -OutFile $MobileRemotePath
  @{ name = "h2ads-worker-local"; private = $true; type = "module"; dependencies = @{ "proxy-chain" = "3.0.0" } } | ConvertTo-Json -Compress | Set-Content -Path $PackagePath -Encoding UTF8 -NoNewline
  if (!(Test-Path $ProxyChainPackagePath)) {
    & npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund --prefix $WorkerDirectory | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar o relay local deste Worker." }
  }
}

function Test-H2AdsProfileHasBrowserData([string]$ProfileDirectory) {
  if (!(Test-Path $ProfileDirectory)) { return $false }
  foreach ($relative in @("Local State", "Default\Preferences", "Default\Network\Cookies", "Default\Cookies")) {
    if (Test-Path (Join-Path $ProfileDirectory $relative)) { return $true }
  }
  return $false
}

# The backup worker must NEVER tar a profile being used by Chrome or the Node
# session runner. Read-only inspection; uncertainty delays upload, not user work.
function Test-H2AdsProfileBusy([string]$ProfileDirectory) {
  $lockPath = Join-Path $ProfileDirectory "h2ads-session-runner.lock"
  if (Test-Path -LiteralPath $lockPath) {
    try {
      $lock = Get-Content -Raw -LiteralPath $lockPath -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
      $lockPid = [int]$lock.pid
      if ($lockPid -gt 0 -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) { return $true }
    } catch {
      # Treat unreadable lock files as busy until they can be inspected.
      return $true
    }
  }

  $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction Stop)
  foreach ($process in $processes) {
    if (-not [string]::Equals([string]$process.ExecutablePath, $DedicatedChromePath, [StringComparison]::OrdinalIgnoreCase)) { continue }
    $commandLine = [string]$process.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) { return $true }
    if ($commandLine.IndexOf("--user-data-dir=", [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $commandLine.IndexOf($ProfileDirectory, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
  }
  return $false
}

# Persist only approved diagnostic categories. Never write HTTP bodies, keys,
# profile paths or proxy credentials to diagnostic files.
function Get-H2AdsSnapshotFailureCode([object]$ErrorRecord) {
  $message = [string]$ErrorRecord.Exception.Message
  $details = [string]$ErrorRecord.ErrorDetails.Message
  $status = 0
  try { $status = [int]$ErrorRecord.Exception.Response.StatusCode } catch { }

  if ($status -eq 409 -and [string]::IsNullOrWhiteSpace($details)) {
    try {
      $stream = $ErrorRecord.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        try { $details = $reader.ReadToEnd() } finally { $reader.Dispose() }
      }
    } catch { }
  }
  $reason = "$message $details"
  if ($reason -match "profile_busy_local") { return "profile_busy_local" }
  if ($reason -match "profile_not_ready") { return "profile_not_ready" }
  if ($reason -match "(?i)snapshot bloqueado enquanto.*browser.*aberto") { return "server_browser_open" }
  if ($reason -match "(?i)BACKUP_ENCRYPTION_KEY") { return "encryption_key_unavailable" }
  if ($reason -match "(?i)\b(R2|bucket|storage)\b") { return "storage_unavailable" }
  if ($reason -match "(?i)banco indispon") { return "database_unavailable" }
  if ($reason -match "(?i)inst.ncia n.o atribu") { return "assignment_rejected" }
  if ($status -eq 409) { return "http_409_unclassified" }
  if ($status -eq 401 -or $status -eq 403) { return "authentication_rejected" }
  if ($status -eq 429) { return "rate_limited" }
  if ($status -ge 500) { return "server_unavailable" }
  if ($reason -match "(?i)timed out|timeout|tempo limite") { return "network_timeout" }
  if ($reason -match "(?i)connect|dns|resolve|conex") { return "network_unavailable" }
  return "snapshot_upload_failed"
}

# Called only while holding the named snapshot-worker mutex. Existing
# .pending markers win: never overwrite one, and never remove a working marker.
function Restore-H2AdsAbandonedSnapshotQueue {
  $cutoff = (Get-Date).ToUniversalTime().AddMinutes(-30)
  $abandoned = @(Get-ChildItem -LiteralPath $SnapshotQueueDirectory -Filter "*.pending.working" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -lt $cutoff } | Sort-Object LastWriteTimeUtc)
  foreach ($item in $abandoned) {
    $retryPath = $item.FullName -replace '\.working$', ''
    if (Test-Path -LiteralPath $retryPath) { continue }
    try {
      Move-Item -LiteralPath $item.FullName -Destination $retryPath -ErrorAction Stop
    } catch {
      # Keep the source .working marker intact for later review/recovery.
    }
  }
}

function Send-H2AdsProfileSnapshot([object]$Config, [int]$InstanceId) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$InstanceId"
  if (!(Test-H2AdsProfileHasBrowserData $profileDirectory)) { return $false }
  if (Test-H2AdsProfileBusy $profileDirectory) { throw "profile_busy_local" }
  if (!(Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "tar.exe não está disponível para criar o snapshot H2ADS." }
  $archivePath = Join-Path $env:TEMP "h2ads-profile-$InstanceId-$([guid]::NewGuid().ToString('N')).tar.gz"
  try {
    & tar.exe -czf $archivePath -C $profileDirectory .
    if ($LASTEXITCODE -ne 0 -or !(Test-Path $archivePath)) { throw "Não foi possível compactar o perfil H2ADS." }
    $file = Get-Item $archivePath
    if ($file.Length -lt 1) { throw "Snapshot H2ADS vazio." }
    if (Test-H2AdsProfileBusy $profileDirectory) { throw "profile_busy_local" }
    $sha256 = (Get-FileHash -Algorithm SHA256 -Path $archivePath).Hash.ToLowerInvariant()
    $headers = Get-WorkerHeaders $Config
    $headers["X-H2ADS-Snapshot-Size"] = [string]$file.Length
    $headers["X-H2ADS-Snapshot-SHA256"] = $sha256
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/profiles/$InstanceId/snapshot" -Headers $headers -ContentType "application/octet-stream" -InFile $archivePath | Out-Null
    return $true
  } finally {
    Remove-Item -Force $archivePath -ErrorAction SilentlyContinue
  }
}

# A solicitação de exclusão deve passar na frente de novos backups. Sinal
# temporário por Worker: o backup em curso termina, os próximos aguardam a
# limpeza; um sinal abandonado expira após 5 minutos.
function Test-H2AdsDeletionPriority {
  if (!(Test-Path -LiteralPath $DeletionPriorityPath)) { return $false }
  try {
    $flag = Get-Item -LiteralPath $DeletionPriorityPath -ErrorAction Stop
    if ($flag.LastWriteTimeUtc -ge (Get-Date).ToUniversalTime().AddMinutes(-5)) { return $true }
    Remove-Item -LiteralPath $DeletionPriorityPath -Force -ErrorAction Stop
    return $false
  } catch {
    # Falha de leitura nunca pode permitir um backup durante exclusão.
    return $true
  }
}

function Start-H2AdsSnapshotQueueWorker {
  if (Test-H2AdsDeletionPriority) { return }
  if (!(Test-Path $SnapshotQueueDirectory)) { return }
  $pending = Get-ChildItem -LiteralPath $SnapshotQueueDirectory -Filter "*.pending" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  $staleWorking = Get-ChildItem -LiteralPath $SnapshotQueueDirectory -Filter "*.pending.working" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddMinutes(-30) } | Select-Object -First 1
  if (!$pending -and !$staleWorking) { return }
  $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -SnapshotQueueWorker"
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru
  try { $process.PriorityClass = "BelowNormal" } catch { }
}

function Queue-H2AdsProfileSnapshot([int]$InstanceId) {
  if ($InstanceId -lt 1) { return }
  New-Item -ItemType Directory -Force -Path $SnapshotQueueDirectory | Out-Null
  # Reuse an existing unsaved request; never erase older pending evidence.
  $existing = Get-ChildItem -LiteralPath $SnapshotQueueDirectory -Filter "*-instance-$InstanceId-*.pending" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existing) { Start-H2AdsSnapshotQueueWorker; return }
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmssfff")
  $pendingPath = Join-Path $SnapshotQueueDirectory "$stamp-instance-$InstanceId-$([guid]::NewGuid().ToString('N')).pending"
  [string]$InstanceId | Set-Content -Path $pendingPath -Encoding ASCII -NoNewline
  Start-H2AdsSnapshotQueueWorker
}

function Restore-H2AdsProfileSnapshot([object]$Config, [int]$InstanceId) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$InstanceId"
  if (Test-H2AdsProfileHasBrowserData $profileDirectory) { return $false }
  if (!(Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "tar.exe não está disponível para restaurar o snapshot H2ADS." }
  $archivePath = Join-Path $env:TEMP "h2ads-restore-$InstanceId-$([guid]::NewGuid().ToString('N')).tar.gz"
  $stagingDirectory = Join-Path $env:TEMP "h2ads-restore-$InstanceId-$([guid]::NewGuid().ToString('N'))"
  $headers = Get-WorkerHeaders $Config
  try {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($Config.panelUrl)/api/h2ads/worker/profiles/$InstanceId/snapshot" -Headers $headers -OutFile $archivePath -PassThru
    } catch {
      $statusCode = $null
      try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
      if ($statusCode -eq 404) { return $false }
      throw
    }
    if (!(Test-Path $archivePath)) { throw "Snapshot H2ADS não foi baixado." }
    $expectedHash = [string]$response.Headers["X-H2ADS-Snapshot-SHA256"]
    $actualHash = (Get-FileHash -Algorithm SHA256 -Path $archivePath).Hash.ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($expectedHash) -or $actualHash -ne $expectedHash.Trim().ToLowerInvariant()) { throw "Integridade do snapshot H2ADS restaurado não confere." }
    New-Item -ItemType Directory -Force -Path $stagingDirectory | Out-Null
    & tar.exe -xzf $archivePath -C $stagingDirectory
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível extrair o snapshot H2ADS." }
    if (!(Test-H2AdsProfileHasBrowserData $stagingDirectory)) { throw "O snapshot H2ADS não contém dados de navegador válidos." }
    if (Test-Path $profileDirectory) { Remove-Item -Recurse -Force $profileDirectory }
    Move-Item -Path $stagingDirectory -Destination $profileDirectory
    $body = @{ state = "restored" } | ConvertTo-Json -Compress
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/profiles/$InstanceId/restore-result" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
    return $true
  } catch {
    try {
      $body = @{ state = "failed" } | ConvertTo-Json -Compress
      Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/profiles/$InstanceId/restore-result" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
    } catch { }
    throw
  } finally {
    Remove-Item -Force $archivePath -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $stagingDirectory -ErrorAction SilentlyContinue
  }
}

function Invoke-BrowserSession([object]$Config, [object]$Payload) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)"
  if (!(Test-Path (Join-Path $profileDirectory "h2ads-profile.json"))) { throw "Perfil local não preparado." }
  Ensure-DedicatedBrowser
  Ensure-H2AdsBrowserFirewall
  $env:H2ADS_PANEL_URL = $Config.panelUrl
  $env:H2ADS_WORKER_KEY = $Config.workerKey
  $env:H2ADS_WORKER_TOKEN = Get-WorkerToken $Config
  $env:H2ADS_INSTANCE_ID = [string]$Payload.command.instanceId
  $env:H2ADS_COMMAND_ID = [string]$Payload.command.id
  $env:H2ADS_PROXY_JSON = ($Payload.proxy | ConvertTo-Json -Compress)
  $env:H2ADS_PROFILE_DIRECTORY = $profileDirectory
  $extensionExecutable = $DedicatedChromePath
  if (Test-Path $TestingChromePath) {
    Assert-H2AdsTestingExecutable | Out-Null
    if (!(Test-H2AdsTestingFirewall)) { throw "Chrome for Testing sem kill switch verificado. Nao abrir instancia." }
    $extensionExecutable = $TestingChromePath
  }
  $env:H2ADS_BROWSER_EXECUTABLE = $extensionExecutable
  $env:H2ADS_REMOTE_DEBUG = $(if ($Payload.mobileRemoteEnabled -eq $true) { "1" } else { "0" })
  try {
    Start-Process -FilePath "node.exe" -ArgumentList "`"$SessionRunnerPath`"" -WindowStyle Hidden | Out-Null
  } finally {
    Remove-Item Env:H2ADS_PANEL_URL, Env:H2ADS_WORKER_KEY, Env:H2ADS_WORKER_TOKEN, Env:H2ADS_INSTANCE_ID, Env:H2ADS_COMMAND_ID, Env:H2ADS_PROXY_JSON, Env:H2ADS_PROFILE_DIRECTORY, Env:H2ADS_BROWSER_EXECUTABLE, Env:H2ADS_REMOTE_DEBUG -ErrorAction SilentlyContinue
  }
}

function Get-H2AdsProfileLastSnapshotAt([string]$ProfileDirectory) {
  $manifestPath = Join-Path $ProfileDirectory "h2ads-profile.json"
  if (!(Test-Path $manifestPath)) { return $null }
  try {
    $manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
    return [string]$manifest.lastSnapshotAt
  } catch {
    return $null
  }
}

function Close-BrowserSession([object]$Config, [object]$Payload) {
  $instanceId = [int]$Payload.command.instanceId
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId"
  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"
  $snapshotBefore = Get-H2AdsProfileLastSnapshotAt $profileDirectory
  $nodePid = $null
  $browserPid = $null

  if (Test-Path $sessionPath) {
    try {
      $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
      if ($session.nodePid) { $nodePid = [int]$session.nodePid }
      if ($session.browserPid) { $browserPid = [int]$session.browserPid }
    } catch { }
  }

  # Fecha primeiro o Chrome para permitir que ele grave cookies, preferencias e bancos locais.
  if ($browserPid) {
    $browserProcess = Get-Process -Id $browserPid -ErrorAction SilentlyContinue
    if ($browserProcess) {
      try { $null = $browserProcess.CloseMainWindow() } catch { }
      $browserDeadline = (Get-Date).AddSeconds(15)
      while ((Get-Date) -lt $browserDeadline -and (Get-Process -Id $browserPid -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 250
      }
      if (Get-Process -Id $browserPid -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $browserPid /T /F 1>$null 2>$null
      }
    }
  } elseif ($nodePid -and (Get-Process -Id $nodePid -ErrorAction SilentlyContinue)) {
    # Compatibilidade com sessoes antigas que nao registravam browserPid.
    & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null
  }

  # O Node da sessao recebe o evento de saida do Chrome e tenta o snapshot antes de encerrar.
  if ($nodePid) {
    $nodeDeadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $nodeDeadline -and (Get-Process -Id $nodePid -ErrorAction SilentlyContinue)) {
      Start-Sleep -Milliseconds 250
    }
  }

  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null

  $snapshotAfter = Get-H2AdsProfileLastSnapshotAt $profileDirectory
  if ([string]::IsNullOrWhiteSpace($snapshotAfter) -or $snapshotAfter -eq $snapshotBefore) {
    # Fallback independente: nunca apaga o perfil local e so remove o pending apos HTTP de sucesso.
    Queue-H2AdsProfileSnapshot $instanceId
  }
}

function Initialize-InstanceProfile([int]$InstanceId) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$InstanceId"
  New-Item -ItemType Directory -Force -Path $profileDirectory | Out-Null
  $manifestPath = Join-Path $profileDirectory "h2ads-profile.json"
  if (!(Test-Path $manifestPath)) {
    @{ instanceId = $InstanceId; profileVersion = 1; createdAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json -Compress | Set-Content -Path $manifestPath -Encoding UTF8 -NoNewline
  }
}

function Get-WorkerErrorCategory([object]$ErrorRecord) {
  $message = [string]$ErrorRecord.Exception.Message
  if ($message -like "*Node.js*") { return "node_missing" }
  if ($message -like "*npm*") { return "npm_missing" }
  if ($message -like "*Perfil local*") { return "profile_missing" }
  if ($message -like "*snapshot H2ADS*" -or $message -like "*Snapshot H2ADS*") { return "profile_snapshot_failed" }
  if ($message -like "*relay local*") { return "relay_setup_failed" }
  if ($message -like "*Firewall H2ADS*" -or $message -like "*kill switch rígido*") { return "hard_kill_switch_unavailable" }
  if ($message -like "*Chrome dedicado*" -or $message -like "*Google Chrome*") { return "dedicated_browser_unavailable" }
  return "worker_execution_failed"
}

function Complete-LocalCommandFailure([object]$Config, [object]$Payload, [string]$ErrorCategory) {
  if ($null -eq $Payload -or $null -eq $Payload.command) { return }
  $commandName = [string]$Payload.command.command
  if ($commandName -notin @("prepare_browser", "launch_browser", "close_browser")) { return }
  $body = @{ command = $commandName; state = "blocked"; errorCategory = $ErrorCategory } | ConvertTo-Json -Compress
  try {
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null
  } catch { }
}

function Invoke-H2AdsPendingInstanceDeletion([object]$Config) {
  $headers = Get-WorkerHeaders $Config
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($Config.panelUrl)/api/h2ads/worker/deletions/next" -Headers $headers -TimeoutSec 12
  } catch { return }
  if ($response.StatusCode -eq 204 -or [string]::IsNullOrWhiteSpace($response.Content)) { return }
  $request = $response.Content | ConvertFrom-Json
  $instanceId = [int]$request.instanceId
  if ($instanceId -le 0) { return }
  if ($request.state -eq "pending") {
    $profile = Join-Path $ProfilesDirectory "instance-$instanceId"
    $sessionFile = Join-Path $profile "h2ads-browser-session.json"
    $lockFile = Join-Path $profile "h2ads-session-runner.lock"
    if (Test-Path -LiteralPath $lockFile) {
      try {
        $locked = Get-Content -Raw -LiteralPath $lockFile | ConvertFrom-Json
        if ($locked.pid -and (Get-Process -Id ([int]$locked.pid) -ErrorAction SilentlyContinue)) { return }
      } catch { return }
    }
    if (Test-Path -LiteralPath $sessionFile) {
      try {
        $session = Get-Content -Raw -LiteralPath $sessionFile | ConvertFrom-Json
        foreach ($pidToCheck in @($session.nodePid, $session.browserPid)) {
          if ($pidToCheck -and (Get-Process -Id ([int]$pidToCheck) -ErrorAction SilentlyContinue)) { return }
        }
      } catch { return }
    }
    try {
      $all = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'node.exe' OR Name = 'tar.exe'" -ErrorAction Stop)
      foreach ($proc in $all) {
        $line = [string]$proc.CommandLine
        if ([string]::IsNullOrWhiteSpace($line)) { return }
        if ($line.IndexOf($profile, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return }
      }
    } catch { return }
    # Mutex below is shared with the snapshot process. A running but idle
    # snapshot worker is safe; it cannot overlap this cleanup.
    $safeWorkerKey = ([string]$Config.workerKey) -replace '[^A-Za-z0-9_-]', '_'
    $createdNew = $false
    $queueMutex = New-Object System.Threading.Mutex($true, "Local\H2AdsSnapshotQueue-$safeWorkerKey", [ref]$createdNew)
    # Antes de tentar o mutex, pede ao processador de snapshots para
    # ceder a vez após o arquivo atual, sem interromper uma gravação.
    [string]$instanceId | Set-Content -LiteralPath $DeletionPriorityPath -Encoding ASCII -NoNewline -ErrorAction Stop
    if (!$createdNew) { $queueMutex.Dispose(); return }
    try {
      if (!(Test-Path -LiteralPath $SnapshotQueueDirectory)) {
        New-Item -ItemType Directory -Path $SnapshotQueueDirectory -Force -ErrorAction Stop | Out-Null
      }
      if (Test-Path -LiteralPath $profile) {
        $rootInfo = Get-Item -LiteralPath $profile -Force -ErrorAction Stop
        if ($rootInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { return }
        $linked = @(Get-ChildItem -LiteralPath $profile -Recurse -Force -Attributes ReparsePoint -ErrorAction Stop)
        if ($linked.Count -gt 0) { return }
      }
      $files = @(Get-ChildItem -LiteralPath $SnapshotQueueDirectory -File -ErrorAction Stop |
        Where-Object { $_.Name -match "^(?:\d+-)?instance-$instanceId(?:-|\.)" })
      foreach ($file in $files) { Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop }
      if (Test-Path -LiteralPath $profile) { Remove-Item -LiteralPath $profile -Force -Recurse -ErrorAction Stop }
      if (Test-Path -LiteralPath $profile) { return }
      $remaining = @(Get-ChildItem -LiteralPath $SnapshotQueueDirectory -File -ErrorAction Stop |
        Where-Object { $_.Name -match "^(?:\d+-)?instance-$instanceId(?:-|\.)" })
      if ($remaining.Count -gt 0) { return }

      # Limpa arquivos temporários órfãos desta instância, inclusive arquivos
      # criados por um snapshot ou restauração interrompidos abruptamente.
      if (Test-Path -LiteralPath $env:TEMP) {
        foreach ($pattern in @("h2ads-profile-$instanceId-*.tar.gz", "h2ads-restore-$instanceId-*.tar.gz")) {
          $tempArchives = @(Get-ChildItem -LiteralPath $env:TEMP -Filter $pattern -File -ErrorAction Stop)
          foreach ($archive in $tempArchives) {
            if ($archive.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { return }
            Remove-Item -LiteralPath $archive.FullName -Force -ErrorAction Stop
          }
          if (@(Get-ChildItem -LiteralPath $env:TEMP -Filter $pattern -File -ErrorAction Stop).Count -gt 0) { return }
        }
        $tempDirs = @(Get-ChildItem -LiteralPath $env:TEMP -Filter "h2ads-restore-$instanceId-*" -Directory -ErrorAction Stop)
        foreach ($dir in $tempDirs) {
          if ($dir.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { return }
          if (@(Get-ChildItem -LiteralPath $dir.FullName -Recurse -Force -Attributes ReparsePoint -ErrorAction Stop).Count -gt 0) { return }
          Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction Stop
        }
        if (@(Get-ChildItem -LiteralPath $env:TEMP -Filter "h2ads-restore-$instanceId-*" -Directory -ErrorAction Stop).Count -gt 0) { return }
      }
    } finally {
      try { $queueMutex.ReleaseMutex() } catch { }
      $queueMutex.Dispose()
      Remove-Item -LiteralPath $DeletionPriorityPath -Force -ErrorAction SilentlyContinue
    }
  }
  try {
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/deletions/$instanceId/local-removed" -Headers $headers -TimeoutSec 15 | Out-Null
  } catch { }
}

function Invoke-PendingBrowserCommand([object]$Config) {
  $headers = Get-WorkerHeaders $Config
  $payload = $null
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/next" -Headers $headers
    if ($response.StatusCode -eq 204 -or [string]::IsNullOrWhiteSpace($response.Content)) { return }
    $payload = $response.Content | ConvertFrom-Json
    if ($payload.command.command -eq "prepare_browser") {
      Ensure-BrowserPreparationComponent $Config
      $runnerInput = @{ command = $payload.command.command; proxy = $payload.proxy } | ConvertTo-Json -Depth 5 -Compress
      $runnerOutput = $runnerInput | & node.exe $RunnerPath
      $result = $runnerOutput | ConvertFrom-Json
      if ($result.state -eq "proxy_verified" -and ![string]::IsNullOrWhiteSpace($result.observedIp)) {
        Restore-H2AdsProfileSnapshot $Config ([int]$payload.command.instanceId) | Out-Null
        Initialize-InstanceProfile ([int]$payload.command.instanceId)
        $resultBody = @{ command = "prepare_browser"; state = "proxy_verified"; observedIp = $result.observedIp } | ConvertTo-Json -Compress
      } else {
        $resultBody = @{ command = "prepare_browser"; state = "blocked"; errorCategory = "proxy_unavailable" } | ConvertTo-Json -Compress
      }
      Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($payload.command.id)/result" -Headers $headers -ContentType "application/json" -Body $resultBody | Out-Null
      return
    }
    if ($payload.command.command -eq "launch_browser") {
      Ensure-BrowserPreparationComponent $Config
      Invoke-BrowserSession $Config $payload
      return
    }
    if ($payload.command.command -eq "close_browser") {
      Close-BrowserSession $Config $payload
      return
    }
  } catch {
    Complete-LocalCommandFailure $Config $payload (Get-WorkerErrorCategory $_)
  }
}

function Stop-ExistingWorkerProcesses {
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" | Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -like "*$InstalledScriptPath*" -and
      $_.CommandLine -match '(?i)(?:^|\s)-Run(?:\s|$)'
    }
    foreach ($process in $processes) {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  } catch { }
}

function Ensure-WorkerScheduledTask {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Presença autenticada e controle local do H2 Ads Browser Worker" -Force | Out-Null
}

function Ensure-BackgroundLauncher {
  $taskNameEscaped = $TaskName.Replace('"', '""')
  $launcherContent = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "schtasks.exe /Run /TN ""$taskNameEscaped""", 0, False
Set shell = Nothing
"@
  $launcherContent | Set-Content -Path $LauncherPath -Encoding ASCII -NoNewline
}

function Start-InstalledWorker {
  try {
    Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    return
  } catch { }
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run" -WindowStyle Hidden
}

function Ensure-DesktopShortcut {
  $desktop = [Environment]::GetFolderPath("Desktop")
  if ([string]::IsNullOrWhiteSpace($desktop)) { return }
  Ensure-BackgroundLauncher
  $shortcutPath = Join-Path $desktop $ShortcutName
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
  $shortcut.Arguments = "`"$LauncherPath`""
  $shortcut.WorkingDirectory = $WorkerDirectory
  $shortcut.Description = "Iniciar H2 Ads Browser Worker em segundo plano"
  $shortcut.IconLocation = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe,0"
  $shortcut.Save()
}

function Acquire-WorkerMutex([object]$Config) {
  $safeWorkerKey = ([string]$Config.workerKey) -replace '[^A-Za-z0-9_-]', '_'
  $createdNew = $false
  $mutex = New-Object System.Threading.Mutex($true, "Local\H2AdsWorker-$safeWorkerKey", [ref]$createdNew)
  if (!$createdNew) {
    $mutex.Dispose()
    return $null
  }
  return $mutex
}

if ($SnapshotQueueWorker) {
  if (!(Test-Path $ConfigPath)) { exit 0 }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  New-Item -ItemType Directory -Force -Path $SnapshotQueueDirectory | Out-Null
  $safeWorkerKey = ([string]$config.workerKey) -replace '[^A-Za-z0-9_-]', '_'
  $createdNew = $false
  $snapshotMutex = New-Object System.Threading.Mutex($true, "Local\H2AdsSnapshotQueue-$safeWorkerKey", [ref]$createdNew)
  if (!$createdNew) {
    $snapshotMutex.Dispose()
    exit 0
  }
  try {
    # Restore only abandoned requests while holding the exclusive snapshot mutex.
    Restore-H2AdsAbandonedSnapshotQueue
    # Congela a lista desta rodada. Um item com erro nao pode bloquear snapshots de outras instancias.
    $pendingItems = @(Get-ChildItem -LiteralPath $SnapshotQueueDirectory -Filter "*.pending" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc | Select-Object -First 8)
    foreach ($pending in $pendingItems) {
      if (Test-H2AdsDeletionPriority) { break }
      if ($pending.Name -notmatch 'instance-(\d+)-') {
        # Invalid queue names are preserved for investigation, not deleted.
        continue
      }
      $instanceId = [int]$Matches[1]
      $workingPath = "$($pending.FullName).working"
      try {
        Move-Item -Path $pending.FullName -Destination $workingPath -Force
      } catch {
        continue
      }

      $saved = $false
      $lastError = $null
      foreach ($delaySeconds in @(1, 3, 8)) {
        try {
          Start-Sleep -Seconds $delaySeconds
          $saved = [bool](Send-H2AdsProfileSnapshot $config $instanceId)
          if ($saved) { break }
          $lastError = "profile_not_ready"
        } catch {
          $lastError = Get-H2AdsSnapshotFailureCode $_
          # Conflicts, busy profiles and missing configuration do not improve
          # with immediate repetition. Retry them in a later queue cycle.
          if ($lastError -in @("profile_busy_local", "server_browser_open", "http_409_unclassified", "encryption_key_unavailable", "storage_unavailable", "assignment_rejected")) { break }
        }
      }

      if ($saved) {
        Remove-Item -Force $workingPath -ErrorAction SilentlyContinue
        Remove-Item -Force (Join-Path $SnapshotQueueDirectory "instance-$instanceId.last-error.txt") -ErrorAction SilentlyContinue
        continue
      }

      $retryPath = $workingPath -replace '\.working$', ''
      if ((Test-Path -LiteralPath $workingPath) -and !(Test-Path -LiteralPath $retryPath)) {
        Move-Item -LiteralPath $workingPath -Destination $retryPath -ErrorAction SilentlyContinue
      }
      $safeError = if ([string]::IsNullOrWhiteSpace($lastError)) { "profile_snapshot_failed" } else { $lastError }
      if ($safeError.Length -gt 240) { $safeError = $safeError.Substring(0, 240) }
      $safeError | Set-Content -Path (Join-Path $SnapshotQueueDirectory "instance-$instanceId.last-error.txt") -Encoding UTF8 -NoNewline
      # Continua para a proxima instancia; nao usa break aqui.
    }
  } finally {
    try { $snapshotMutex.ReleaseMutex() } catch { }
    $snapshotMutex.Dispose()
  }
  exit 0
}

if ($EnableExtensionBrowser) {
  Install-H2AdsTestingBrowser
  Write-Output "Chrome for Testing H2ADS instalado e firewall isolado validado. Chrome original preservado."
  exit 0
}

if ($Install) {
  if (!(Test-IsAdministrator)) { throw "Instale o H2ADS como Administrador para ativar o kill switch obrigatório." }
  if (!(Get-SystemChromeExecutable)) { throw "Google Chrome não está instalado neste computador." }
  New-Item -ItemType Directory -Force -Path $WorkerDirectory | Out-Null
  $validatedPairingCode = Read-PairingCode
  $claimBody = @{ pairingCode = $validatedPairingCode; computerName = Get-ComputerLabel; agentVersion = $AgentVersion } | ConvertTo-Json -Compress
  Remove-Variable -Name validatedPairingCode -ErrorAction SilentlyContinue
  $claimed = Invoke-RestMethod -Method Post -Uri "$($PanelUrl.TrimEnd('/'))/api/h2ads/worker/claim" -ContentType "application/json" -Body $claimBody
  Save-WorkerConfig $claimed
  Copy-Item -Path $PSCommandPath -Destination $InstalledScriptPath -Force
  Ensure-DedicatedBrowser
  Ensure-H2AdsBrowserFirewall
  Ensure-WorkerScheduledTask
  Ensure-BackgroundLauncher
  Ensure-DesktopShortcut
  Stop-ExistingWorkerProcesses
  Start-InstalledWorker
  Write-Output "Worker H2 Ads pareado com isolamento rígido e iniciado."
  exit 0
}

if ($Update) {
  if (!(Test-IsAdministrator)) { throw "Atualize o H2ADS como Administrador para instalar/verificar o kill switch obrigatório." }
  if (!(Test-Path $ConfigPath)) { throw "Configuração do Worker não encontrada. Faça o pareamento primeiro." }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  $downloadPath = Join-Path $WorkerDirectory "H2AdsWorker.ps1.download"
  Invoke-WebRequest -UseBasicParsing -Uri "$($config.panelUrl)/api/h2ads/worker/windows-agent.ps1" -OutFile $downloadPath
  if (!(Test-Path $downloadPath) -or (Get-Item $downloadPath).Length -lt 1000) { throw "O agente atualizado não foi baixado corretamente." }
  Stop-ExistingWorkerProcesses
  Copy-Item -Path $downloadPath -Destination $InstalledScriptPath -Force
  Remove-Item -Force $downloadPath -ErrorAction SilentlyContinue
  Ensure-DedicatedBrowser
  Ensure-H2AdsBrowserFirewall
  Start-InstalledWorker
  Write-Output "Agente H2 Ads atualizado com isolamento rígido e iniciado."
  exit 0
}

if ($Run) {
  if (!(Test-Path $ConfigPath)) { throw "Configuração do Worker não encontrada. Faça o pareamento primeiro." }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  try { Ensure-WorkerScheduledTask } catch { }
  try { Ensure-BackgroundLauncher } catch { }
  try { Ensure-DesktopShortcut } catch { }
  Stop-ExistingWorkerProcesses
  Start-Sleep -Milliseconds 250
  $workerMutex = Acquire-WorkerMutex $config
  if ($null -eq $workerMutex) { exit 0 }
  $nextHeartbeatAt = Get-Date
  $nextSnapshotQueueCheckAt = Get-Date
  try {
    while ($true) {
      $now = Get-Date
      if ($now -ge $nextHeartbeatAt) {
        try { Invoke-WorkerHeartbeat $config } catch { }
        $nextHeartbeatAt = $now.AddSeconds(20)
      }
      # A exclusão tem prioridade sobre o disparo de novos backups.
      try { Invoke-H2AdsPendingInstanceDeletion $config } catch { }
      if ($now -ge $nextSnapshotQueueCheckAt) {
        try { Start-H2AdsSnapshotQueueWorker } catch { }
        $nextSnapshotQueueCheckAt = $now.AddSeconds(20)
      }
      try { Invoke-PendingBrowserCommand $config } catch { }
      Start-Sleep -Seconds 2
    }
  } finally {
    try { $workerMutex.ReleaseMutex() } catch { }
    $workerMutex.Dispose()
  }
}

Write-Output "Use -Install para iniciar o pareamento ou -Update para atualizar um Worker já pareado."