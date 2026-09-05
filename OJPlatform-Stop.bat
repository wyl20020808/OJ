@echo off
cd /d "%~dp0"
echo OJPlatform Stop: checking active Judge jobs...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-runtime.ps1" stop -All
if errorlevel 2 (
  echo OJPlatform Stop incomplete.
  echo Manual action may be required.
  pause
)
if not errorlevel 1 (
  timeout /t 2 /nobreak >nul
)
exit /b 0
