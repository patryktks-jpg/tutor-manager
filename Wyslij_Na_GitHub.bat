@echo off
set "PATH=%LOCALAPPDATA%\Programs\git\cmd;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0"
echo ==============================================
echo   Wysylanie Tutor Manager na GitHub...
echo ==============================================
echo.
git push -u origin main
echo.
pause
