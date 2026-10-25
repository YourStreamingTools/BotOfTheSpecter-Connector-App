@echo off
REM ============================================================
REM  BotOfTheSpecter Desktop - release build (Windows)
REM
REM  build.bat                Windows + Linux packages -> dist\
REM                           Windows: setup .exe + portable .exe
REM                           Linux:   .tar.gz (AppImage needs a Linux/macOS host - use build.sh there)
REM  build.bat --win          Windows only
REM  build.bat --linux        Linux only
REM  build.bat --skip-checks  skip the typecheck and tests
REM
REM  macOS apps are built and signed on a Mac with: ./build.sh --mac
REM ============================================================
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on your PATH.
  echo Install Node.js 18 or newer from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

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

node scripts\build.mjs %*
set "BUILD_EXIT=%ERRORLEVEL%"

echo.
if not "%BUILD_EXIT%"=="0" (
  echo [ERROR] Build failed - see the messages above.
) else (
  echo Build finished. Packages are in the dist folder.
)
pause
endlocal & exit /b %BUILD_EXIT%
