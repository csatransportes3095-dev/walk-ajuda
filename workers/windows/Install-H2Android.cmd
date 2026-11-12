@echo off
setlocal EnableExtensions DisableDelayedExpansion
title H2 Android - Instalar no Windows

echo.
echo   H2 ANDROID - Instalador do agente Windows
echo   Site: https://h2colombiano.com/ADIMIN/ANDROID
echo.
set "PSFILE=%TEMP%\H2Android-Install-%RANDOM%-%RANDOM%.ps1"
where curl.exe >nul 2>&1
if errorlevel 1 goto download_error

curl.exe --fail --location --silent --show-error --max-time 45 --output "%PSFILE%" "https://h2colombiano.com/api/h2-android/install-windows.ps1"
if errorlevel 1 goto download_error
if not exist "%PSFILE%" goto download_error
findstr /C:"# H2 Android native installer" "%PSFILE%" >nul 2>&1
if errorlevel 1 goto download_error

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PSFILE%"
set "INSTALL_RESULT=%ERRORLEVEL%"
del /q "%PSFILE%" >nul 2>&1
if not "%INSTALL_RESULT%"=="0" goto install_error

echo.
echo Instalador concluido. Veja o status do agente no painel H2 Android.
echo.
pause
exit /b 0

:download_error
echo.
echo Falha ao baixar o instalador oficial do site H2 Colombiano.
echo Verifique a conexao ou tente novamente pelo ADM.
echo.
if exist "%PSFILE%" del /q "%PSFILE%" >nul 2>&1
pause
exit /b 1

:install_error
echo.
echo Nao foi possivel concluir a instalacao. Leia o erro exibido acima.
echo.
pause
exit /b %INSTALL_RESULT%
