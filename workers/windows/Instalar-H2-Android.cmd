@echo off
setlocal
title Instalador H2 Android
cd /d "%~dp0"
echo ============================================
echo        INSTALADOR H2 ANDROID
echo ============================================
echo.
if not exist "%~dp0H2AndroidAgent.ps1" (
  echo ERRO: Arquivo H2AndroidAgent.ps1 nao encontrado nesta pasta.
  echo Extraia o ZIP completo antes de executar este instalador.
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0H2AndroidControl.ps1" (
  echo ERRO: Arquivo H2AndroidControl.ps1 nao encontrado nesta pasta.
  pause
  exit /b 1
)
echo Se ja esta pareado, os dados serao preservados.
echo No primeiro uso, informe o codigo do painel /adm/android.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0H2AndroidAgent.ps1" -Install
set "STATUS=%ERRORLEVEL%"
echo.
if not "%STATUS%"=="0" (
  echo A INSTALACAO NAO FOI CONCLUIDA.
  echo Leia o erro acima e tente novamente.
  pause
  exit /b %STATUS%
)
echo Agente H2 Android instalado e conectado.
echo Confira o status ONLINE no painel ADM.
echo.
pause
exit /b 0
