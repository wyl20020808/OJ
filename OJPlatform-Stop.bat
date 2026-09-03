@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-runtime.ps1" stop
if errorlevel 1 pause
