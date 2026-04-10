@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not on PATH. Install from https://nodejs.org/ then try again.
  exit /b 1
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo PowerShell is required for verify and dev cleanup.
  exit /b 1
)

if "%SKIP_VERIFY%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\verify.ps1"
  if errorlevel 1 exit /b 1
) else (
  echo SKIP_VERIFY is set — skipping scripts\verify.ps1
  echo.
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-dev-sessions.ps1"

where ollama >nul 2>&1
if errorlevel 1 (
  echo Ollama not on PATH — Avatars will run; local LLM stays offline until you install Ollama and add it to PATH.
  echo.
) else (
  rem Ollama Windows installer often runs a service already bound to 11434 — a second "ollama serve" fails with "address already in use"
  rem Avoid findstr ":11434" — leading ":" can confuse cmd.exe
  netstat -ano | findstr "LISTENING" | findstr "11434" >nul 2>&1
  if errorlevel 1 (
    start "Ollama" cmd /k "ollama serve"
  ) else (
    echo Ollama already listening on port 11434 — skipping ollama serve ^(close duplicate terminals if you started it twice^).
    echo.
  )
)

call npm run tauri dev
