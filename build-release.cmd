@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  exit /b 1
)

if not exist "node_modules\" (
  echo Run npm install once in this folder, then run build-release.cmd again.
  exit /b 1
)

echo Building release (no verify/tests in this script^)...
call npm run tauri build
exit /b %ERRORLEVEL%
