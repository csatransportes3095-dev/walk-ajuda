@echo off
setlocal EnableExtensions DisableDelayedExpansion
title H2 Android Nativo - Substituir agente antigo
set "H2_NATIVE_INSTALLER=%~f0"
set "H2_NATIVE_DIR=%~dp0"
rem Pedir UAC ANTES da verificacao; sem isso o Hyper-V sempre parece indisponivel.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$id=[Security.Principal.WindowsIdentity]::GetCurrent(); $principal=New-Object Security.Principal.WindowsPrincipal($id); if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 5 }"
if errorlevel 1 (
  echo Este instalador precisa abrir com permissao de administrador.
  echo A solicitacao afeta apenas a instalacao do agente H2 Android.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $arguments='/c '+[char]34+[char]34+$env:H2_NATIVE_INSTALLER+[char]34+[char]34; $p=Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -Verb RunAs -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { Write-Host ('ERRO: permissao de administrador nao concedida: '+$_.Exception.Message) -ForegroundColor Red; exit 1 }"
  if errorlevel 1 (
    echo.
    echo Instalacao interrompida. O agente antigo nao foi removido.
    pause
    exit /b 1
  )
  exit /b 0
)
rem Tarefa H2 nativa existente: use atualizador e nao reinstalador.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$t=Get-ScheduledTask -TaskName 'H2 Android Agent' -ErrorAction SilentlyContinue; if ($null -eq $t) { exit 1 }; $a=@($t.Actions | Where-Object { $_.Arguments -like '*H2NativeAgent.ps1*' -and $_.Arguments -like '*-Run*' }); if ($a.Count -eq 1) { exit 0 }; exit 1"
if not errorlevel 1 (
  echo Agente H2 Android ja instalado. Executando atualizacao segura.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%H2_NATIVE_DIR%Atualizar-H2-Android-Nativo.ps1"
  if errorlevel 1 (
    echo Falha na atualizacao. Os arquivos originais foram preservados ou restaurados.
    pause
    exit /b 1
  )
  echo Atualizacao concluida. Nenhum agente duplicado foi instalado.
  pause
  exit /b 0
)
echo.
echo ============================================================
echo            H2 ANDROID NATIVO - INSTALACAO
echo ============================================================
echo Executando como administrador. Sem Android Studio, ADB e H2 ADS.
echo Nenhum agente sera removido se o Hyper-V nao estiver pronto.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%H2_NATIVE_DIR%H2NativeAgent.ps1" -Status
if errorlevel 1 (
  echo ERRO: nao foi possivel verificar este computador. Nada foi alterado.
  pause
  exit /b 1
)
echo.
choice /C SN /M "Deseja instalar o agente nativo e substituir somente a tarefa H2 Android"
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%H2_NATIVE_DIR%H2NativeAgent.ps1" -Install
if errorlevel 1 (
  echo.
  echo ERRO DO INSTALADOR ACIMA. Hyper-V, token ou permissao podem estar pendentes.
  echo Agente antigo mantido ou restaurado. Nao exclua a pasta anterior.
  pause
  exit /b 1
)
echo.
echo Novo agente registrado. Verifique o status no ADM.
pause
exit /b 0
