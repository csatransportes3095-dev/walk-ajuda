@echo off
setlocal
title H2 Android - Primeiro Aparelho
cd /d "%~dp0"
echo ============================================
echo      H2 ANDROID - PRIMEIRO APARELHO
echo ============================================
echo.
echo O assistente verifica Android SDK, Google Play e virtualizacao.
echo Nenhum download ou novo aparelho sera criado sem sua confirmacao.
echo H2 ADS e outros Androids nao serao alterados.
echo.
if not exist "%~dp0Preparar-H2Android-01.ps1" (
  echo [ERRO] Extrair o ZIP completo antes de executar.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Preparar-H2Android-01.ps1"
set "RESULTADO=%ERRORLEVEL%"
echo.
if not "%RESULTADO%"=="0" (
  echo O assistente nao concluiu. Veja acima o requisito faltante.
  echo Codigo de diagnostico: %RESULTADO%
) else (
  echo Assistente finalizado.
)
echo.
pause
exit /b %RESULTADO%
