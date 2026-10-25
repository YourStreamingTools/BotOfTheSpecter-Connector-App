@echo off
REM ============================================================
REM  BotOfTheSpecter Desktop - dev launcher
REM  Double-click to run, or launch from a terminal.
REM  Runs the Electron app in dev mode (hot reload).
REM  Main-process logs print in THIS window.
REM  In the app window, press Ctrl+Shift+I for the renderer console.
REM ============================================================
setlocal
cd /d "%~dp0"

echo ============================================
echo  BotOfTheSpecter Desktop - dev launcher
echo ============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js / npm was not found on your PATH.
  echo Install Node.js 18 or newer from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

REM Verify Node is new enough — the app targets Node 18+ (see package.json engines).
set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%a in ('node --version 2^>nul') do set "NODE_MAJOR=%%a"
if not defined NODE_MAJOR (
  echo [ERROR] Could not determine the Node.js version. Install Node.js 18 or newer from https://nodejs.org
  echo.
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 18 (
  echo [ERROR] Node.js 18 or newer is required ^(found v%NODE_MAJOR%^). Update from https://nodejs.org
  echo.
  pause
  exit /b 1
)

node scripts\ensure-deps.mjs
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist "resources\mediamtx\win32-x64\mediamtx.exe" (
  echo Downloading the local camera server ^(MediaMTX, one-time^)...
  call npm run fetch:mediamtx -- win32-x64
  if errorlevel 1 (
    echo [WARN] MediaMTX download failed - the Cameras screen will say the camera server is not bundled.
  )
  echo.
)

echo Starting the app...
echo   - Close the app window, or press Ctrl+C here, to stop.
echo   - Errors and logs from the main process appear in this window.
echo.
call npm run dev

echo.
echo App exited. Review any messages above, then press a key to close.
pause
endlocal
