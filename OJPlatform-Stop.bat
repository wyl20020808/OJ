@echo off
cd /d "%~dp0"
echo OJPlatform Stop: checking active Judge jobs...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-runtime.ps1" stop -All
set "OJ_STOP_CODE=%errorlevel%"
if errorlevel 2 (
  echo OJPlatform Stop incomplete.
  echo Manual action may be required.
  pause
)
if errorlevel 1 if not errorlevel 2 (
  echo OJPlatform Stop failed.
  pause
)
if "%OJ_STOP_CODE%"=="0" (
  echo OJPlatform Stop completed.
  timeout /t 2 /nobreak >nul
)
exit /b %OJ_STOP_CODE%
