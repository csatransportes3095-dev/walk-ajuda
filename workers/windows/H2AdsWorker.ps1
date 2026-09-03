param(
  [switch]$Install,
  [switch]$Run,
  [switch]$Update,
  [switch]$SnapshotQueueWorker,
  [string]$PanelUrl = "https://h2colombiano.com",
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$AgentVersion = "1.4.2"
$WorkerDirectory = Join-Path $env:LOCALAPPDATA "H2AdsWorker"
$ConfigPath = Join-Path $WorkerDirectory "worker.json"
$InstalledScriptPath = Join-Path $WorkerDirectory "H2AdsWorker.ps1"
$RunnerPath = Join-Path $WorkerDirectory "browser-runner.mjs"
$SessionRunnerPath = Join-Path $WorkerDirectory "browser-session.mjs"
$ProfilesDirectory = Join-Path $WorkerDirectory "profiles"
$SnapshotQueueDirectory = Join-Path $WorkerDirectory "snapshot-queue"
$PackagePath = Join-Path $WorkerDirectory "package.json"
$ProxyChainPackagePath = Join-Path $WorkerDirectory "node_modules\proxy-chain\package.json"
$WsPackagePath = Join-Path $WorkerDirectory "node_modules\ws\package.json"
$DedicatedBrowserDirectory = Join-Path $WorkerDirectory "browser\chrome"
$DedicatedChromePath = Join-Path $DedicatedBrowserDirectory "chrome.exe"
$DedicatedFirefoxDirectory = Join-Path $WorkerDirectory "browser\firefox"
$DedicatedFirefoxPath = Join-Path $DedicatedFirefoxDirectory "firefox.exe"
$FirewallRuleV4Name = "H2ADS Dedicated Chrome - Block Direct IPv4"
$FirewallRuleV6Name = "H2ADS Dedicated Chrome - Block Direct IPv6"
$FirefoxFirewallRuleV4Name = "H2ADS Dedicated Firefox - Block Direct IPv4"
$FirefoxFirewallRuleV6Name = "H2ADS Dedicated Firefox - Block Direct IPv6"
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

function Get-SystemFirefoxExecutable {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Mozilla Firefox\firefox.exe"),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "Mozilla Firefox\firefox.exe" }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Mozilla Firefox\firefox.exe" })
  ) | Where-Object { $_ -and (Test-Path $_) }
  return $candidates | Select-Object -First 1
}

function Assert-MozillaFirefoxSignature([string]$Path) {
  if (!(Test-Path $Path)) { throw "Firefox dedicado do H2ADS não está disponível." }
  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne "Valid" -or !$signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch '(?i)Mozilla') {
    throw "A assinatura do Firefox usado pelo H2ADS não pôde ser validada."
  }
}

function Ensure-DedicatedFirefox {
  if (Test-Path $DedicatedFirefoxPath) {
    Assert-MozillaFirefoxSignature $DedicatedFirefoxPath
    return
  }
  $sourceFirefox = Get-SystemFirefoxExecutable
  if (!$sourceFirefox) { throw "Mozilla Firefox não está instalado neste Worker." }
  Assert-MozillaFirefoxSignature $sourceFirefox
  $sourceDirectory = Split-Path $sourceFirefox -Parent
  if (Test-Path $DedicatedFirefoxDirectory) { Remove-Item -Recurse -Force $DedicatedFirefoxDirectory }
  New-Item -ItemType Directory -Force -Path $DedicatedFirefoxDirectory | Out-Null
  Copy-Item -Path (Join-Path $sourceDirectory "*") -Destination $DedicatedFirefoxDirectory -Recurse -Force
  Assert-MozillaFirefoxSignature $DedicatedFirefoxPath
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

function Test-H2AdsFirefoxFirewall {
  if (!(Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue)) { return $false }
  foreach ($ruleName in @($FirefoxFirewallRuleV4Name, $FirefoxFirewallRuleV6Name)) {
    $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq "True" -and $_.Direction -eq "Outbound" -and $_.Action -eq "Block" } | Select-Object -First 1
    if (!$rule) { return $false }
    $application = $rule | Get-NetFirewallApplicationFilter
    if (!$application -or !([string]$application.Program).Equals($DedicatedFirefoxPath, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  }
  return $true
}

function Ensure-H2AdsFirefoxFirewall {
  if (Test-H2AdsFirefoxFirewall) { return }
  if (!(Test-IsAdministrator)) { throw "Firewall Firefox H2ADS obrigatório ausente. Atualize o Worker como Administrador." }
  Get-NetFirewallRule -DisplayName $FirefoxFirewallRuleV4Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $FirefoxFirewallRuleV6Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $FirefoxFirewallRuleV4Name -Direction Outbound -Program $DedicatedFirefoxPath -Action Block -Protocol Any -RemoteAddress @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255") -Profile Any -Enabled True | Out-Null
  New-NetFirewallRule -DisplayName $FirefoxFirewallRuleV6Name -Direction Outbound -Program $DedicatedFirefoxPath -Action Block -Protocol Any -RemoteAddress "Internet6" -Profile Any -Enabled True | Out-Null
  if (!(Test-H2AdsFirefoxFirewall)) { throw "O kill switch rígido do Firefox H2ADS não foi aplicado corretamente." }
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
  @{ name = "h2ads-worker-local"; private = $true; type = "module"; dependencies = @{ "proxy-chain" = "3.0.0"; "ws" = "8.21.3" } } | ConvertTo-Json -Compress | Set-Content -Path $PackagePath -Encoding UTF8 -NoNewline
  if (!(Test-Path $ProxyChainPackagePath) -or !(Test-Path $WsPackagePath)) {
    & npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund --prefix $WorkerDirectory | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar os componentes de proteção local deste Worker." }
  }
}

function Test-H2AdsProfileHasBrowserData([string]$ProfileDirectory) {
  if (!(Test-Path $ProfileDirectory)) { return $false }
  foreach ($relative in @("Local State", "Default\Preferences", "Default\Network\Cookies", "Default\Cookies")) {
    if (Test-Path (Join-Path $ProfileDirectory $relative)) { return $true }
  }
  return $false
}

function Send-H2AdsProfileSnapshot([object]$Config, [int]$InstanceId) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$InstanceId"
  if (!(Test-H2AdsProfileHasBrowserData $profileDirectory)) { return $false }
  if (!(Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "tar.exe não está disponível para criar o snapshot H2ADS." }
  $archivePath = Join-Path $env:TEMP "h2ads-profile-$InstanceId-$([guid]::NewGuid().ToString('N')).tar.gz"
  try {
    & tar.exe -czf $archivePath -C $profileDirectory .
    if ($LASTEXITCODE -ne 0 -or !(Test-Path $archivePath)) { throw "Não foi possível compactar o perfil H2ADS." }
    $file = Get-Item $archivePath
    if ($file.Length -lt 1) { throw "Snapshot H2ADS vazio." }
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

function Start-H2AdsSnapshotQueueWorker {
  if (!(Test-Path $SnapshotQueueDirectory)) { return }
  $pending = Get-ChildItem -Path $SnapshotQueueDirectory -Filter "*.pending" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (!$pending) { return }
  $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -SnapshotQueueWorker"
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru
  try { $process.PriorityClass = "BelowNormal" } catch { }
}

function Queue-H2AdsProfileSnapshot([int]$InstanceId) {
  if ($InstanceId -lt 1) { return }
  New-Item -ItemType Directory -Force -Path $SnapshotQueueDirectory | Out-Null
  Get-ChildItem -Path $SnapshotQueueDirectory -Filter "*-instance-$InstanceId-*.pending" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
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
  $engine = if ([string]$Payload.proxy.browserEngine -eq "firefox") { "firefox" } else { "chrome" }
  $profileDirectory = if ($engine -eq "firefox") { Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)-firefox" } else { Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)" }
  New-Item -ItemType Directory -Force -Path $profileDirectory | Out-Null
  $manifestPath = Join-Path $profileDirectory "h2ads-profile.json"
  if (!(Test-Path $manifestPath)) { @{ instanceId = [int]$Payload.command.instanceId; browserEngine = $engine; profileVersion = 1; createdAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json -Compress | Set-Content -Path $manifestPath -Encoding UTF8 -NoNewline }
  if ($engine -eq "firefox") {
    Ensure-DedicatedFirefox
    Ensure-H2AdsFirefoxFirewall
    $browserExecutable = $DedicatedFirefoxPath
  } else {
    Ensure-DedicatedBrowser
    Ensure-H2AdsBrowserFirewall
    $browserExecutable = $DedicatedChromePath
  }
  $env:H2ADS_PANEL_URL = $Config.panelUrl
  $env:H2ADS_WORKER_KEY = $Config.workerKey
  $env:H2ADS_WORKER_TOKEN = Get-WorkerToken $Config
  $env:H2ADS_INSTANCE_ID = [string]$Payload.command.instanceId
  $env:H2ADS_COMMAND_ID = [string]$Payload.command.id
  $env:H2ADS_PROXY_JSON = ($Payload.proxy | ConvertTo-Json -Compress)
  $env:H2ADS_PROFILE_DIRECTORY = $profileDirectory
  $env:H2ADS_BROWSER_EXECUTABLE = $browserExecutable
  $env:H2ADS_BROWSER_ENGINE = $engine
  try {
    Start-Process -FilePath "node.exe" -ArgumentList "`"$SessionRunnerPath`"" -WindowStyle Hidden | Out-Null
  } finally {
    Remove-Item Env:H2ADS_PANEL_URL, Env:H2ADS_WORKER_KEY, Env:H2ADS_WORKER_TOKEN, Env:H2ADS_INSTANCE_ID, Env:H2ADS_COMMAND_ID, Env:H2ADS_PROXY_JSON, Env:H2ADS_PROFILE_DIRECTORY, Env:H2ADS_BROWSER_EXECUTABLE, Env:H2ADS_BROWSER_ENGINE -ErrorAction SilentlyContinue
  }
}

function Close-BrowserSession([object]$Config, [object]$Payload) {
  $instanceId = [int]$Payload.command.instanceId
  $engine = if ([string]$Payload.proxy.browserEngine -eq "firefox") { "firefox" } else { "chrome" }
  $profileDirectory = if ($engine -eq "firefox") { Join-Path $ProfilesDirectory "instance-$instanceId-firefox" } else { Join-Path $ProfilesDirectory "instance-$instanceId" }
  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"
  if (Test-Path $sessionPath) {
    $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
    if ($session.nodePid) {
      $nodePid = [int]$session.nodePid
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $nodePid" -ErrorAction SilentlyContinue
      if ($process -and [string]$process.CommandLine -like "*$SessionRunnerPath*") {
        & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null
      }
    }
    Remove-Item -Force $sessionPath -ErrorAction SilentlyContinue
  }
  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null
  if ($engine -eq "chrome") { Queue-H2AdsProfileSnapshot $instanceId }
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
  if ($message -like "*Firefox dedicado*" -or $message -like "*Mozilla Firefox*") { return "firefox_unavailable" }
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
    while ($true) {
      $pending = Get-ChildItem -Path $SnapshotQueueDirectory -Filter "*.pending" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc | Select-Object -First 1
      if (!$pending) { break }
      if ($pending.Name -notmatch 'instance-(\d+)-') {
        Remove-Item -Force $pending.FullName -ErrorAction SilentlyContinue
        continue
      }
      $instanceId = [int]$Matches[1]
      $workingPath = "$($pending.FullName).working"
      Move-Item -Path $pending.FullName -Destination $workingPath -Force
      try {
        Start-Sleep -Milliseconds 750
        Send-H2AdsProfileSnapshot $config $instanceId | Out-Null
        Remove-Item -Force $workingPath -ErrorAction SilentlyContinue
      } catch {
        $retryPath = $workingPath -replace '\.working$', ''
        if (!(Test-Path $retryPath)) {
          Move-Item -Path $workingPath -Destination $retryPath -Force -ErrorAction SilentlyContinue
        }
        break
      }
    }
  } finally {
    try { $snapshotMutex.ReleaseMutex() } catch { }
    $snapshotMutex.Dispose()
  }
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
  if (Get-SystemFirefoxExecutable) { Ensure-DedicatedFirefox; Ensure-H2AdsFirefoxFirewall }
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
  if (Get-SystemFirefoxExecutable) { Ensure-DedicatedFirefox; Ensure-H2AdsFirefoxFirewall }
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
      if ($now -ge $nextSnapshotQueueCheckAt) {
        try { Start-H2AdsSnapshotQueueWorker } catch { }
        $nextSnapshotQueueCheckAt = $now.AddMinutes(2)
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