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
          $width = [int]$head.CurrentHorizontalResolution
          $height = [int]$head.CurrentVerticalResolution
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
function Get-H2NativeScreenPngBase64 {
  param([Parameter(Mandatory=$true)][string]$VMName)
  $vm = Get-H2NativeWmiConsole -VMName $VMName
  # The documented thumbnail API accepts a requested resolution even when the
  # guest does not expose Msvm_VideoHead (common while Android-x86 boots).
  try { $video = Get-H2NativeConsoleVideo -VmWmi $vm }
  catch { $video = [pscustomobject]@{width=640; height=480} }
  $scale = [Math]::Min(1.0,[Math]::Min(768.0 / $video.width, 1024.0 / $video.height))
  # Even width keeps 16-bit RGB565 row stride aligned on a 4-byte boundary.
  $width = [int]([Math]::Floor($video.width * $scale / 2.0) * 2)
  $height = [int][Math]::Floor($video.height * $scale)
  if ($width -lt 64 -or $height -lt 64) { throw "Resolucao pequena demais." }

  $settings = @($vm.GetRelated("Msvm_VirtualSystemSettingData",
    "Msvm_SettingsDefineState", $null, $null, "SettingData", "ManagedElement", $false, $null))
  if ($settings.Count -lt 1) { throw "Configuracao grafica Hyper-V indisponivel." }
  $service = Get-WmiObject -Namespace "root\virtualization\v2" -Class "Msvm_VirtualSystemManagementService" -ErrorAction Stop |
    Select-Object -First 1
  if (!$service) { throw "Servico de captura Hyper-V indisponivel." }
  $request = $service.GetMethodParameters("GetVirtualSystemThumbnailImage")
  $request["TargetSystem"] = [string]$settings[0].__PATH
  $request["WidthPixels"] = [uint16]$width
  $request["HeightPixels"] = [uint16]$height
  $answer = $service.InvokeMethod("GetVirtualSystemThumbnailImage", $request, $null)
  if (!$answer -or [uint32]$answer["ReturnValue"] -ne 0) {
    $status = if ($answer) { [string]$answer["ReturnValue"] } else { "sem resposta" }
    throw ("O video real da VM nao esta disponivel (WMI " + $status + ").")
  }
  [byte[]]$rgb565 = $answer["ImageData"]
  if (!$rgb565 -or $rgb565.Length -ne ($width * $height * 2)) {
    throw "Dados de video Hyper-V incompletos."
  }

  Add-Type -AssemblyName System.Drawing -ErrorAction Stop
  $bitmap = [System.Drawing.Bitmap]::new($width,$height,[System.Drawing.Imaging.PixelFormat]::Format16bppRgb565)
  $stream = New-Object System.IO.MemoryStream
  $rect = [System.Drawing.Rectangle]::new(0,0,$width,$height)
  $data = $null
  try {
    $data = $bitmap.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::WriteOnly,
      [System.Drawing.Imaging.PixelFormat]::Format16bppRgb565)
    for($y=0; $y -lt $height; $y++){
      $target = [IntPtr]::Add($data.Scan0,$y*$data.Stride)
      [System.Runtime.InteropServices.Marshal]::Copy($rgb565,$y*$width*2,$target,$width*2)
    }
    $bitmap.UnlockBits($data)
    $data = $null
    $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
    if ($stream.Length -lt 100 -or $stream.Length -gt 3300000) {
      throw "Quadro PNG fora dos limites permitidos."
    }
    return [Convert]::ToBase64String($stream.ToArray())
  } finally {
    if ($null -ne $data) { $bitmap.UnlockBits($data) }
    $stream.Dispose()
    $bitmap.Dispose()
  }
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
