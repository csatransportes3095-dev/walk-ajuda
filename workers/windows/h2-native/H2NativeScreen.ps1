# H2 Android: host Hyper-V video and input through Microsoft virtualization WMI v2.
# Captures only a real running owned H2N VM; no Android SDK/ADB, no fake frames.
# If the host or guest video/input device does not support WMI, fail explicitly.
Set-StrictMode -Version Latest

function Get-H2NativeWmiConsole {
  param([Parameter(Mandatory=$true)][string]$VMName)
  $owned = Get-H2NativeOwnedVm -VMName $VMName
  if ([string]$owned.State -cne "Running") { throw "O Android precisa estar ligado para acessar a tela." }
  $connected = @((Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop) |
    Where-Object { ![string]::IsNullOrWhiteSpace([string]$_.SwitchName) })
  if ($connected.Count -gt 0) { throw "Rede nao isolada: acesso remoto recusado." }

  $vmId = $owned.Id.ToString()
  $vm = Get-WmiObject -Namespace "root\virtualization\v2" -Class "Msvm_ComputerSystem" -Filter "Name='$vmId'" -ErrorAction Stop |
    Select-Object -First 1
  if (!$vm -or [string]$vm.Name -ine $vmId) {
    throw "Console Hyper-V da VM H2 selecionada nao encontrado."
  }
  return $vm
}

function Get-H2NativeConsoleVideo {
  param([Parameter(Mandatory=$true)]$VmWmi)
  # Gen2 guests may expose synthetic or emulated video, depending on boot phase.
  foreach ($controllerType in @("Msvm_SyntheticDisplayController","Msvm_S3DisplayController")) {
    try {
      foreach ($controller in @($VmWmi.GetRelated($controllerType))) {
        foreach ($head in @($controller.GetRelated("Msvm_VideoHead"))) {
          # Hyper-V can expose an empty value or the literal "x" while the
          # guest display is still initializing. Never cast that value directly
          # to Int32; skip it and let the thumbnail fallback sizes run.
          $width = 0
          $height = 0
          $widthText = [string]$head.CurrentHorizontalResolution
          $heightText = [string]$head.CurrentVerticalResolution
          $widthOk = [int]::TryParse($widthText, [Globalization.NumberStyles]::Integer,
            [Globalization.CultureInfo]::InvariantCulture, [ref]$width)
          $heightOk = [int]::TryParse($heightText, [Globalization.NumberStyles]::Integer,
            [Globalization.CultureInfo]::InvariantCulture, [ref]$height)
          if (!$widthOk -or !$heightOk) { continue }
          if ($width -ge 64 -and $height -ge 64 -and
              $width -le 8192 -and $height -le 8192) {
            return [pscustomobject]@{ width=$width; height=$height }
          }
        }
      }
    } catch {
      # Missing video-head metadata must not prevent a real WMI thumbnail capture.
    }
  }
  throw "Resolucao de video Hyper-V indisponivel."
}
function Convert-H2NativeRgb565ToPng {
  param([Parameter(Mandatory=$true)][byte[]]$ImageData,
        [Parameter(Mandatory=$true)][int]$Width,
        [Parameter(Mandatory=$true)][int]$Height)
  if ($Width -lt 64 -or $Width -gt 1024 -or $Height -lt 64 -or $Height -gt 1024) {
    throw "Resolucao de captura invalida."
  }
  if ($ImageData.Length -eq 0 -or ($ImageData.Length % $Height) -ne 0) {
    throw ("RGB565: comprimento invalido " + $ImageData.Length + " bytes.")
  }
  $rowBytes = [int]($ImageData.Length / $Height)
  if ($rowBytes -lt $Width*2 -or $rowBytes -gt ($Width*2+256) -or $rowBytes % 2 -ne 0) {
    throw ("RGB565: stride invalido " + $rowBytes + " bytes.")
  }
  Add-Type -AssemblyName System.Drawing -ErrorAction Stop
  $bitmap = [System.Drawing.Bitmap]::new($Width,$Height,[System.Drawing.Imaging.PixelFormat]::Format16bppRgb565)
  $stream = New-Object System.IO.MemoryStream
  $rect = [System.Drawing.Rectangle]::new(0,0,$Width,$Height)
  $data = $null
  try {
    $data = $bitmap.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::WriteOnly,
      [System.Drawing.Imaging.PixelFormat]::Format16bppRgb565)
    for ($y=0; $y -lt $Height; $y++) {
      $target = [IntPtr]::Add($data.Scan0,$y*$data.Stride)
      [System.Runtime.InteropServices.Marshal]::Copy($ImageData,$y*$rowBytes,$target,$Width*2)
    }
    $bitmap.UnlockBits($data)
    $data = $null
    $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
    if ($stream.Length -lt 100 -or $stream.Length -gt 3300000) { throw "PNG fora do limite." }
    return [Convert]::ToBase64String($stream.ToArray())
  } finally {
    if ($null -ne $data) { $bitmap.UnlockBits($data) }
    $stream.Dispose()
    $bitmap.Dispose()
  }
}

function Get-H2NativeScreenPngBase64 {
  param([Parameter(Mandatory=$true)][string]$VMName)
  $vm = Get-H2NativeWmiConsole -VMName $VMName
  $settings = @($vm.GetRelated("Msvm_VirtualSystemSettingData",
    "Msvm_SettingsDefineState", $null, $null, "SettingData", "ManagedElement", $false, $null))
  # Msvm_VirtualSystemSettingData does not expose SettingType on Hyper-V WMI v2.
  # Filter by the documented realized-system discriminator and avoid snapshots.
  $realized = @($settings | Where-Object {
    [string]$_.VirtualSystemType -eq "Microsoft:Hyper-V:System:Realized"
  })
  if ($realized.Count -ne 1) {
    throw ("Configuracao corrente Hyper-V ausente (atuais=" + $realized.Count + ").")
  }
  $service = Get-WmiObject -Namespace "root\virtualization\v2" -Class "Msvm_VirtualSystemManagementService" -ErrorAction Stop |
    Select-Object -First 1
  if (!$service) { throw "Servico de captura Hyper-V indisponivel." }
  # Store dimensions as typed records, not nested PowerShell arrays (which can be unrolled).
  $sizes = New-Object 'System.Collections.Generic.List[object]'
  try {
    $video = Get-H2NativeConsoleVideo -VmWmi $vm
    $scale = [Math]::Min(1.0,[Math]::Min(640.0 / $video.width,480.0 / $video.height))
    $w = [int]([Math]::Floor($video.width * $scale / 2) * 2)
    $h = [int][Math]::Floor($video.height * $scale)
    if ($w -ge 64 -and $h -ge 64) {
      $sizes.Add([pscustomobject]@{ Width=$w; Height=$h })
    }
  } catch {
    # Guest video-head metadata is optional; static fallback sizes remain available.
  }
  foreach ($dimensions in @(@(640,480),@(320,240),@(160,120))) {
    $sizes.Add([pscustomobject]@{ Width=[int]$dimensions[0]; Height=[int]$dimensions[1] })
  }
  $diagnostics = @()
  foreach ($size in $sizes) {
    $width = [int]$size.Width
    $height = [int]$size.Height
    try {
      $request = $service.GetMethodParameters("GetVirtualSystemThumbnailImage")
      $request["TargetSystem"] = [string]$realized[0].__PATH
      $request["WidthPixels"] = [uint16]$width
      $request["HeightPixels"] = [uint16]$height
      $answer = $service.InvokeMethod("GetVirtualSystemThumbnailImage",$request,$null)
      if (!$answer -or [uint32]$answer["ReturnValue"] -ne 0) {
        $code = if ($answer) { [string]$answer["ReturnValue"] } else { "sem resposta" }
        $diagnostics += ($width + "x" + $height + ": WMI=" + $code)
        continue
      }
      [byte[]]$rgb = $answer["ImageData"]
      $expected = $width*$height*2
      if (!$rgb -or $rgb.Length -eq 0) {
        $diagnostics += ($width + "x" + $height + ": 0/" + $expected + " bytes")
        continue
      }
      try {
        return Convert-H2NativeRgb565ToPng -ImageData $rgb -Width $width -Height $height
      } catch {
        $diagnostics += ($width + "x" + $height + ": " + $rgb.Length + "/" + $expected + " bytes")
      }
    } catch {
      $diagnostics += ($width + "x" + $height + ": erro WMI")
    }
  }
  $reason = [string]::Join("; ",[string[]]$diagnostics)
  if ($reason.Length -gt 150) { $reason = $reason.Substring(0,150) }
  throw ("Quadro RGB565 indisponivel: " + $reason)
}
function Invoke-H2NativeConsoleTap {
  param(
    [Parameter(Mandatory=$true)][string]$VMName,
    [Parameter(Mandatory=$true)][int]$X,
    [Parameter(Mandatory=$true)][int]$Y
  )
  if($X -lt 0 -or $X -gt 10000 -or $Y -lt 0 -or $Y -gt 10000) {
    throw "Coordenadas fora da tela."
  }
  $vm = Get-H2NativeWmiConsole -VMName $VMName
  $video = Get-H2NativeConsoleVideo -VmWmi $vm
  $mouse = @($vm.GetRelated("Msvm_SyntheticMouse") | Select-Object -First 1)
  if($mouse.Count -ne 1 -or !$mouse[0] -or [int]$mouse[0].EnabledState -ne 2) {
    throw "Mouse virtual Hyper-V indisponivel neste Android."
  }
  $set = $mouse[0].GetMethodParameters("SetAbsolutePosition")
  $set["horizontalPosition"] = [int][Math]::Round(($video.width - 1) * $X / 10000.0)
  $set["verticalPosition"] = [int][Math]::Round(($video.height - 1) * $Y / 10000.0)
  $setAnswer = $mouse[0].InvokeMethod("SetAbsolutePosition",$set,$null)
  if(!$setAnswer -or [uint32]$setAnswer["ReturnValue"] -ne 0) {
    throw "O convidado nao aceitou o movimento do mouse Hyper-V."
  }
  $click = $mouse[0].GetMethodParameters("ClickButton")
  $click["buttonIndex"] = [uint32]1
  $clickAnswer = $mouse[0].InvokeMethod("ClickButton",$click,$null)
  if(!$clickAnswer -or [uint32]$clickAnswer["ReturnValue"] -ne 0) {
    throw "O convidado nao aceitou o toque pelo mouse Hyper-V."
  }
}

function Invoke-H2NativeConsoleKey {
  param([Parameter(Mandatory=$true)][string]$VMName,[Parameter(Mandatory=$true)][string]$Key)
  # These are Windows virtual keys, not Android keycodes; guest mappings may vary.
  $keys = @{ BACK=27; HOME=36; ENTER=13 }
  if(!$keys.ContainsKey($Key)) { throw "Tecla nao disponivel no console nativo." }
  $vm = Get-H2NativeWmiConsole -VMName $VMName
  $keyboard = @($vm.GetRelated("Msvm_Keyboard") | Select-Object -First 1)
  if($keyboard.Count -ne 1 -or !$keyboard[0]) {
    throw "Teclado virtual Hyper-V indisponivel."
  }
  $params = $keyboard[0].GetMethodParameters("TypeKey")
  $params["keyCode"] = [uint32]$keys[$Key]
  $answer = $keyboard[0].InvokeMethod("TypeKey",$params,$null)
  if(!$answer -or [uint32]$answer["ReturnValue"] -ne 0) {
    throw "A tecla nao foi aceita pelo console Hyper-V."
  }
}
