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
echo Abra o painel /adm/android e clique em Gerar codigo.
echo Cole o codigo temporario quando solicitado.
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
