@echo off
cd /d "%~dp0"
echo OJPlatform Stop: checking active Judge jobs...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-runtime.ps1" stop
if errorlevel 1 (
  echo OJPlatform Stop failed:
  pause
)
if not errorlevel 1 (
  timeout /t 2 /nobreak >nul
)
