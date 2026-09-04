@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-runtime.ps1" status
if errorlevel 1 (
  echo OJPlatform Status failed:
  pause
)
