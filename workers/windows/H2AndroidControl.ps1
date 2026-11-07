# H2 Android controls v0.2.0. Isolated from H2 ADS.
# Commands are allowlisted and never invoke an arbitrary remote shell.
function H2-Invoke([string]$exe, [string]$argsText, [bool]$binary = $false, [int]$timeoutMs = 30000, [string]$inputText = "") {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $exe
  $info.Arguments = $argsText
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.RedirectStandardInput = $true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $info
  try {
    if (!$proc.Start()) { throw "Nao iniciou o processo." }
    if ($inputText) { $proc.StandardInput.WriteLine($inputText) }
    $proc.StandardInput.Close()
    if ($binary) {
      $memory = New-Object System.IO.MemoryStream
      try {
        $proc.StandardOutput.BaseStream.CopyTo($memory)
        $errorText = $proc.StandardError.ReadToEnd()
        if (!$proc.WaitForExit($timeoutMs) -or $proc.ExitCode -ne 0) { throw ("Falha ADB: " + $errorText) }
        return @{code=0; text=""; data=$memory.ToArray()}
      } finally { $memory.Dispose() }
    }
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $proc.StandardError.ReadToEnd()
    if (!$proc.WaitForExit($timeoutMs)) {
      try { $proc.Kill() } catch {}
      throw "O comando excedeu o limite de tempo."
    }
    return @{code=$proc.ExitCode; text=($out + " " + $err).Trim()}
  } finally { $proc.Dispose() }
}

function H2-CheckName([string]$name) {
  if ($name -cnotmatch '^H2Android_[0-9]{2,3}$') { throw "Android fora do padrao H2Android_01." }
}

function H2-Avds {
  $emulator = Find-AndroidTool "emulator"
  if (!$emulator) { return @() }
  $result = H2-Invoke $emulator "-list-avds"
  if ($result.code -ne 0) { throw $result.text }
  return @(($result.text -split "[\r\n]+") | Where-Object { $_ -match '^H2Android_[0-9]{2,3}$' })
}

function H2-RunningMap {
  $map = @{}
  $adb = Find-AndroidTool "adb"
  if (!$adb) { return $map }
  try {
    $list = H2-Invoke $adb "devices"
    foreach ($line in ($list.text -split "[\r\n]+")) {
      if ($line -notmatch '^(emulator-[0-9]+)\s+device') { continue }
      $serial = $matches[1]
      $result = H2-Invoke $adb ("-s " + $serial + " emu avd name")
      $name = @(($result.text -split "[\r\n]+") | Where-Object { $_ -match '^H2Android_[0-9]{2,3}$' } | Select-Object -First 1)
      if ($name.Count -gt 0) { $map[$name[0]] = $serial }
    }
  } catch {
    Write-Warning ("Consulta ADB falhou: " + $_.Exception.Message)
  }
  return $map
}

function Get-H2RunningAvds {
  return @((H2-RunningMap).Keys | Select-Object -First 10)
}

function H2-ProxyPath {
  return (Join-Path $Folder "proxies.json")
}
function H2-Proxies {
  $result = @{}
  $file = H2-ProxyPath
  if (!(Test-Path -LiteralPath $file)) { return $result }
  try {
    $json = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    foreach ($item in $json.PSObject.Properties) {
      if ($item.Name -match '^H2Android_[0-9]{2,3}$' -and
          $item.Value -match '^http://[a-zA-Z0-9.-]+:[0-9]{1,5}$') {
        $result[$item.Name] = [string]$item.Value
      }
    }
  } catch {}
  return $result
}

function Run-H2Control($command) {
  $name = [string]$command.avdName
  H2-CheckName $name
  $action = [string]$command.action
  if ($action -notin @("create","start","stop","tap","key","proxy")) { throw "Comando nao autorizado." }
  $adb = Find-AndroidTool "adb"
  $emu = Find-AndroidTool "emulator"
  if (!$adb -or !$emu) { throw "Ferramentas Android ausentes no computador." }
  $avds = @(H2-Avds)
  $exists = $avds -contains $name
  if ($action -eq "create") {
    if ($exists) { throw "Android ja existe." }
    $sdkRoot = Split-Path (Split-Path $emu -Parent) -Parent
    $manager = Join-Path $sdkRoot "cmdline-tools\latest\bin\avdmanager.bat"
    $image = Join-Path $sdkRoot "system-images\android-35\google_apis_playstore\x86_64\system.img"
    if (!(Test-Path -LiteralPath $manager) -or !(Test-Path -LiteralPath $image)) {
      throw "Imagem Android 15 Google Play necessaria. Instale as ferramentas do SDK no computador."
    }
    $argsText = '/d /s /c ""' + $manager + '" create avd -n ' + $name + ' -k "system-images;android-35;google_apis_playstore;x86_64" -d pixel_8"'
    $result = H2-Invoke $env:ComSpec $argsText $false 120000 "no"
    if ($result.code -ne 0 -or !((H2-Avds) -contains $name)) { throw ("Nao criou Android: " + $result.text) }
    return "Android criado. Pode iniciar pelo painel."
  }
  if (!$exists) { throw "Android nao encontrado." }
  $running = H2-RunningMap
  if ($action -eq "proxy") {
    $proxyHost = [string]$command.payload.host
    $port = [int]$command.payload.port
    if (($proxyHost -eq "") -ne ($port -eq 0)) { throw "Host e porta devem estar preenchidos juntos." }
    if ($proxyHost -and ($proxyHost -notmatch '^[a-zA-Z0-9.-]{1,253}$' -or $port -lt 1 -or $port -gt 65535)) { throw "Proxy invalido." }
    if ($running.ContainsKey($name)) { throw "Desligue o Android antes de modificar proxy." }
    $proxies = H2-Proxies
    if ($proxyHost) { $proxies[$name] = "http://" + $proxyHost + ":" + $port } else { $proxies.Remove($name) }
    $proxies | ConvertTo-Json -Compress | Set-Content -LiteralPath (H2-ProxyPath) -Encoding UTF8
    if ($proxyHost) { return "Proxy HTTP salvo para a proxima inicializacao." }
    return "Proxy HTTP removido."
  }
  if ($action -eq "start") {
    if ($running.ContainsKey($name)) { return "Android ja esta ligado." }
    if ($running.Count -ge 5) { throw "Limite de cinco Androids simultaneos." }
    $args = @("-avd", $name, "-no-window", "-no-audio", "-no-snapshot-load", "-gpu", "swiftshader_indirect")
    $proxies = H2-Proxies
    if ($proxies.ContainsKey($name)) { $args += @("-http-proxy", $proxies[$name]) }
    Start-Process -FilePath $emu -ArgumentList $args -WorkingDirectory (Split-Path $emu -Parent) -WindowStyle Hidden | Out-Null
    return "Iniciando Android sem abrir Android Studio."
  }
  if (!$running.ContainsKey($name)) { throw "Android desligado. Ligue pelo site." }
  $serial = $running[$name]
  if ($action -eq "stop") {
    $result = H2-Invoke $adb ("-s " + $serial + " emu kill")
    if ($result.code -ne 0) { throw ("Nao desligou Android: " + $result.text) }
    return "Android desligando."
  }
  if ($action -eq "tap") {
    $x = [int]$command.payload.x
    $y = [int]$command.payload.y
    if ($x -lt 0 -or $x -gt 5000 -or $y -lt 0 -or $y -gt 10000) { throw "Coordenadas invalidas." }
    $args = "-s " + $serial + " shell input tap " + $x + " " + $y
  } else {
    $key = [string]$command.payload.key
    if ($key -notin @("BACK","HOME","ENTER","POWER")) { throw "Tecla nao autorizada." }
    $code = @{BACK=4; HOME=3; ENTER=66; POWER=26}[$key]
    $args = "-s " + $serial + " shell input keyevent " + $code
  }
  $result = H2-Invoke $adb $args
  if ($result.code -ne 0) { throw ("Comando ADB falhou: " + $result.text) }
  return "Comando executado."
}

function Capture-H2Screen([string]$name) {
  H2-CheckName $name
  $running = H2-RunningMap
  if (!$running.ContainsKey($name)) { return }
  $adb = Find-AndroidTool "adb"
  $result = H2-Invoke $adb ("-s " + $running[$name] + " exec-out screencap -p") $true 25000
  if ($result.data.Length -lt 100 -or $result.data.Length -gt 3300000) { return }
  $body = @{avdName=$name; pngBase64=[Convert]::ToBase64String($result.data)} | ConvertTo-Json -Compress
  Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$PanelUrl/api/h2-android/agent/frame" -Headers @{Authorization="Bearer $script:H2AgentToken"} -ContentType "application/json" -Body $body -TimeoutSec 25 | Out-Null
}
