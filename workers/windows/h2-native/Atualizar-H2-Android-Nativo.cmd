@echo off
setlocal EnableExtensions DisableDelayedExpansion
title H2 Android - Atualizar Agente Existente
set "H2_NATIVE_UPDATE=%~dp0Atualizar-H2-Android-Nativo.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $p=Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',([char]34+$env:H2_NATIVE_UPDATE+[char]34)); exit $p.ExitCode } catch { Write-Host ('FALHA: '+$_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo A atualizacao nao foi concluida. Confira o erro no PowerShell.
  pause
  exit /b 1
)
echo Atualizacao H2 concluida.
pause
exit /b 0