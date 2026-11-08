@echo off
setlocal
title H2 Android Independente - Diagnostico
echo.
echo =================================================
echo       H2 ANDROID INDEPENDENTE
echo       DIAGNOSTICO DO COMPUTADOR
echo =================================================
echo.
echo Somente leitura. Sem Android Studio ou instalacao.
echo Nao cria, altera ou inicia maquinas virtuais.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0H2NativeDoctor.ps1"
echo.
echo Se houver erro, envie uma captura desta janela.
echo.
pause
endlocal
