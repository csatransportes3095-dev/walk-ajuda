# H2 Android Native: painel local Windows (PowerShell 5.1 e WinForms).
# Ao abrir: SOMENTE interface. Nao modifica Windows, rede ou VMs.
[CmdletBinding()]
param()
$ErrorActionPreference="Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw "Somente Windows." }
Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
Add-Type -AssemblyName System.Drawing -ErrorAction Stop
[Windows.Forms.Application]::EnableVisualStyles()
Import-Module (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Force -ErrorAction Stop
$script:isoScript=Join-Path $PSScriptRoot "H2NativeIsoBootstrap.ps1"
$script:diskScript=Join-Path $PSScriptRoot "H2NativeInstalledBoot.ps1"
$script:firstScript=Join-Path $PSScriptRoot "H2NativeFirstBoot.ps1"
$script:doctor=Join-Path $PSScriptRoot "H2NativeDoctor.ps1"
$script:verifiedIso=""
$script:verifiedHash=""
$script:busy=$false
$script:buttons=@()
$bg=[Drawing.Color]::FromArgb(13,20,31)
$panelBg=[Drawing.Color]::FromArgb(25,36,52)
$fg=[Drawing.Color]::FromArgb(234,244,247)
$mint=[Drawing.Color]::FromArgb(0,220,188)
$form=[Windows.Forms.Form]::new()
$form.Text="H2 Android Independente - Painel local"
$form.StartPosition="CenterScreen"
$form.Size=[Drawing.Size]::new(940,720)
$form.MinimumSize=[Drawing.Size]::new(940,720)
$form.BackColor=$bg
$form.ForeColor=$fg
$form.Font=[Drawing.Font]::new("Segoe UI",10)
$form.MaximizeBox=$false
$form.FormBorderStyle="FixedSingle"
function Add-H2Label([string]$value,[int]$x,[int]$y,[int]$width,[int]$height=25,[bool]$head=$false) {
  $c=[Windows.Forms.Label]::new()
  $c.Text=$value
  $c.Location=[Drawing.Point]::new($x,$y)
  $c.Size=[Drawing.Size]::new($width,$height)
  $c.ForeColor=$(if($head){$mint}else{$fg})
  if($head){$c.Font=[Drawing.Font]::new("Segoe UI Semibold",15)}
  $form.Controls.Add($c)
  return $c
}
function Add-H2Text([int]$x,[int]$y,[int]$width,[string]$value="") {
  $c=[Windows.Forms.TextBox]::new()
  $c.Location=[Drawing.Point]::new($x,$y)
  $c.Size=[Drawing.Size]::new($width,30)
  $c.Text=$value
  $c.BackColor=$panelBg
  $c.ForeColor=$fg
  $form.Controls.Add($c)
  return $c
}
function Add-H2Button([string]$value,[int]$x,[int]$y,[int]$width) {
  $c=[Windows.Forms.Button]::new()
  $c.Text=$value
  $c.Location=[Drawing.Point]::new($x,$y)
  $c.Size=[Drawing.Size]::new($width,45)
  $c.FlatStyle="Flat"
  $c.FlatAppearance.BorderColor=$mint
  $c.BackColor=$panelBg
  $c.ForeColor=$fg
  $form.Controls.Add($c)
  $script:buttons+=,$c
  return $c
}
Add-H2Label "H2 ANDROID | CONTROLE LOCAL" 24 15 850 44 $true | Out-Null
Add-H2Label "Sem Android Studio. Sem servidor web. Instancias H2 sempre offline ate proxy validado." 24 64 880 | Out-Null
Add-H2Label "MAQUINA H2" 24 105 230 | Out-Null
Add-H2Label "ISO ANDROID (ARQUIVO LOCAL)" 250 105 470 | Out-Null
$vm=Add-H2Text 24 132 205 "H2N_001"
$iso=Add-H2Text 250 132 476
$browse=Add-H2Button "Escolher ISO" 736 130 170
Add-H2Label "SHA-256 OFICIAL DA ISO (OBTIDO DE FONTE CONFIAVEL)" 24 183 850 | Out-Null
$hash=Add-H2Text 24 211 880
$opt=[Windows.Forms.CheckBox]::new()
$opt.Text="Autorizo desativar Secure Boot apenas nesta nova VM, se a imagem exigir"
$opt.Location=[Drawing.Point]::new(24,254)
$opt.Size=[Drawing.Size]::new(880,30)
$opt.ForeColor=$fg
$form.Controls.Add($opt)
$hostBtn=Add-H2Button "Verificar Windows" 24 303 206
$checkBtn=Add-H2Button "Validar ISO" 247 303 206
$createBtn=Add-H2Button "Criar VM H2" 470 303 206
$auditBtn=Add-H2Button "Auditar VM" 693 303 211
$startBtn=Add-H2Button "Iniciar" 24 361 206
$screenBtn=Add-H2Button "Abrir tela" 247 361 206
$stopBtn=Add-H2Button "Desligar" 470 361 206
$diskBtn=Add-H2Button "Iniciar pelo disco" 693 361 211
$restoreBtn=Add-H2Button "Restaurar instalador ISO" 693 419 211
Add-H2Label "RESULTADOS E AVISOS" 24 439 560 | Out-Null
$log=[Windows.Forms.TextBox]::new()
$log.Location=[Drawing.Point]::new(24,470)
$log.Size=[Drawing.Size]::new(652,159)
$log.Multiline=$true
$log.ReadOnly=$true
$log.ScrollBars="Vertical"
$log.BackColor=$panelBg
$log.ForeColor=$fg
$log.Font=[Drawing.Font]::new("Consolas",9)
$form.Controls.Add($log)
Add-H2Label "SEM REDE / PROXY PENDENTE" 695 489 220 50 | Out-Null
Add-H2Label "Android instalado e boot real ainda precisam ser comprovados na tela." 695 548 205 75 | Out-Null
Add-H2Label "Projeto experimental. Play Store, camera e apps nao verificados." 24 644 840 25 | Out-Null

function Log-H2([string]$message) {
  $log.AppendText(("["+(Get-Date -Format "HH:mm:ss")+"] "+$message+[Environment]::NewLine))
  $log.SelectionStart=$log.TextLength
  $log.ScrollToCaret()
}
function Run-H2([scriptblock]$work) {
  if($script:busy){return}
  $script:busy=$true
  foreach($button in $script:buttons){$button.Enabled=$false}
  $form.UseWaitCursor=$true
  $form.Refresh()
  try{ & $work }
  catch {
    Log-H2 ("ERRO: "+$_.Exception.Message)
    [Windows.Forms.MessageBox]::Show($_.Exception.Message,"H2 Android",
      [Windows.Forms.MessageBoxButtons]::OK,
      [Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
  } finally {
    $script:busy=$false
    foreach($button in $script:buttons){$button.Enabled=$true}
    $form.UseWaitCursor=$false
  }
}
function H2-Name {
  $name=$vm.Text.Trim()
  Assert-H2NativeName $name
  return $name
}
function H2-Mode([string]$name) {
  Get-H2NativeOwnedVm -VMName $name | Out-Null
  $path=Join-Path (Split-Path (Get-H2NativeDiskPath $name) -Parent) "manifest.json"
  $data=Get-Content -LiteralPath $path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  return [string]$data.mode
}
function H2-Json([scriptblock]$command) {
  $raw=(& $command | Out-String)
  if([string]::IsNullOrWhiteSpace($raw)){throw "Operacao sem retorno."}
  return ($raw | ConvertFrom-Json -ErrorAction Stop)
}
function H2-Confirm([string]$prompt) {
  return ([Windows.Forms.MessageBox]::Show($prompt,"Confirmar operacao H2",
    [Windows.Forms.MessageBoxButtons]::YesNo,
    [Windows.Forms.MessageBoxIcon]::Question) -eq [Windows.Forms.DialogResult]::Yes)
}
$iso.Add_TextChanged({$script:verifiedIso="";$script:verifiedHash=""})
$hash.Add_TextChanged({$script:verifiedIso="";$script:verifiedHash=""})
$browse.Add_Click({
  $dialog=[Windows.Forms.OpenFileDialog]::new()
  $dialog.Title="ISO Android x86_64"
  $dialog.Filter="Imagem ISO (*.iso)|*.iso"
  $dialog.CheckFileExists=$true
  if($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK){
    $iso.Text=$dialog.FileName
    Log-H2 "ISO selecionada. Informe SHA-256 oficial e valide."
  }
})
$hostBtn.Add_Click({Run-H2 {
  $data=H2-Json { & $script:doctor -Json }
  Log-H2 ("Windows: "+$data.host.edition+" | Hyper-V pronto: "+$data.host.hyperVReady)
  Log-H2 ("RAM livre: "+$data.host.freeRamGb+" GB; disco livre: "+$data.host.availableDiskGb+" GB")
  Log-H2 $data.nextStep
  foreach($w in @($data.warnings)){if($w){Log-H2 ("Aviso: "+$w)}}
}})
$checkBtn.Add_Click({Run-H2 {
  if(!(Test-H2NativeHash $hash.Text.Trim())){throw "Informe SHA-256 oficial com 64 caracteres."}
  Log-H2 "Conferindo hash e arquivos da ISO. Pode demorar em imagens grandes."
  $data=H2-Json { & $script:isoScript -Action CheckMedia -IsoPath $iso.Text.Trim() -ExpectedSha256 $hash.Text.Trim() -Json }
  if(!$data.readyForOfflineInstallAttempt){throw "ISO sem UEFI/Android x86 reconhecido. Criacao bloqueada."}
  $script:verifiedIso=$data.path
  $script:verifiedHash=$data.isoSha256
  Log-H2 ("ISO candidata UEFI/Android: "+$data.androidLayout+". Boot real NAO verificado.")
}})
$createBtn.Add_Click({Run-H2 {
  $name=H2-Name
  $isoFile=$iso.Text.Trim()
  $officialHash=$hash.Text.Trim()
  if(!$script:verifiedIso -or ![string]::Equals($script:verifiedIso,$isoFile,[StringComparison]::OrdinalIgnoreCase) -or $script:verifiedHash -ine $officialHash){
    throw "Antes de criar a VM, valide a ISO com SHA-256 oficial."
  }
  Assert-H2NativeReady
  if(!(H2-Confirm ("Criar apenas "+$name+" (4 GB RAM, disco 32 GB, REDE DESLIGADA)?"))){return}
  $data=H2-Json { & $script:isoScript -Action Prepare -VMName $name -IsoPath $isoFile -ExpectedSha256 $officialHash -AllowUnsignedBoot:$opt.Checked -Json }
  Log-H2 ("VM "+$name+" criada para instalacao offline. Android nao instalado.")
}})
$auditBtn.Add_Click({Run-H2 {
  $name=H2-Name
  $data=H2-Json { & $script:doctor -VMName $name -Json }
  Log-H2 ("VM "+$name+" | boot offline permitido: "+$data.readyToAttemptOfflineBoot)
  foreach($w in @($data.warnings)){if($w){Log-H2 ("Aviso: "+$w)}}
}})
$startBtn.Add_Click({Run-H2 {
  $name=H2-Name
  $mode=H2-Mode $name
  if(!(H2-Confirm ("Iniciar "+$name+" SEM REDE?"))){return}
  $data=if($mode -ceq "ISO_INSTALLER"){
    H2-Json { & $script:isoScript -Action Start -VMName $name -Json }
  }elseif($mode -ceq "DISK_FIRST_BOOT"){
    H2-Json { & $script:diskScript -Action Start -VMName $name -Json }
  }else{
    H2-Json { & $script:firstScript -Action Start -VMName $name -Json }
  }
  Log-H2 ("VM "+$name+" "+$data.state+". Android inicializado: NAO CONFIRMADO.")
}})
$screenBtn.Add_Click({Run-H2 {
  $name=H2-Name
  $mode=H2-Mode $name
  if($mode -ceq "ISO_INSTALLER"){
    & $script:isoScript -Action Console -VMName $name | Out-Null
  }elseif($mode -ceq "DISK_FIRST_BOOT"){
    & $script:diskScript -Action Console -VMName $name | Out-Null
  }else{
    & $script:firstScript -Action Console -VMName $name | Out-Null
  }
  Log-H2 ("Tela da VM "+$name+" aberta. Verifique boot Android real.")
}})
$stopBtn.Add_Click({Run-H2 {
  $name=H2-Name
  if(!(H2-Confirm ("Desligar somente "+$name+"?"))){return}
  $status=Stop-H2NativeVm -VMName $name
  Log-H2 ("VM "+$name+" "+$status.state)
}})
$diskBtn.Add_Click({Run-H2 {
  $name=H2-Name
  if(!(H2-Confirm ("Android ja foi INSTALADO e a VM esta DESLIGADA? Ejetar ISO e iniciar pelo disco?"))){return}
  $data=H2-Json { & $script:diskScript -Action SwitchToDisk -VMName $name -InstallationCompleted -Json }
  Log-H2 ("VM "+$name+" alterada: "+$data.phase+". Boot nao confirmado.")
}})
$restoreBtn.Add_Click({Run-H2 {
  $name=H2-Name
  if(!(H2-Confirm ("VM desligada? Reanexar a ISO original em "+$name+" sem apagar disco?"))){return}
  $data=H2-Json { & $script:diskScript -Action RestoreInstaller -VMName $name -Json }
  Log-H2 ("VM "+$name+" voltou: "+$data.phase)
}})
Log-H2 "Painel aberto. Comece por VERIFICAR WINDOWS. Nenhuma VM foi iniciada."
[Windows.Forms.Application]::Run($form)
