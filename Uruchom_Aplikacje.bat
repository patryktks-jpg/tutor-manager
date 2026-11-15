@echo off
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0"
echo ==============================================
echo   Uruchamianie Tutor Manager (PWA)...
echo ==============================================
echo.
npm run dev
pause
