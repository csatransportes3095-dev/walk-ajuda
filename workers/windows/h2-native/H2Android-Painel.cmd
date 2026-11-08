@echo off
setlocal
title H2 Android Independente - Painel
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0H2NativePanel.ps1"
if errorlevel 1 (
  echo Erro: confira a versao do Windows e o PowerShell 5.1.
  pause
)
endlocal
