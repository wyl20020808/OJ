@echo off
cd /d "%~dp0"
echo OJPlatform Status: checking runtime...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-runtime.ps1" status
if errorlevel 1 (
  echo OJPlatform Status failed:
  pause
)
if not errorlevel 1 (
  timeout /t 2 /nobreak >nul
)
