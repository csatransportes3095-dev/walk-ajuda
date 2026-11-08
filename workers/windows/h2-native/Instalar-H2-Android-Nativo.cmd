@echo off
setlocal
title H2 Android Nativo - Substituir agente antigo
echo H2 Android Native - Instalacao de migracao
echo Este processo nao remove Android Studio nem H2 ADS.
echo O pareamento atual e mantido. Sem Hyper-V pronto a migracao e bloqueada.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0H2NativeAgent.ps1" -Status
echo.
choice /C SN /M "Instalar novo agente nativo e substituir a tarefa antiga"
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0H2NativeAgent.ps1" -Install
if errorlevel 1 (
  echo Agente antigo mantido. Veja os erros acima.
  pause
  exit /b 1
)
echo Novo agente registrado. Confira ONLINE no ADM.
pause
endlocal
