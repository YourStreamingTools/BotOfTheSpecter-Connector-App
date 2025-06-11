@echo off
title BotOfTheSpecter OBS Connector - Test & Run
echo ============================================
echo BotOfTheSpecter OBS Connector - Test & Run
echo ============================================
echo.

REM Clean and build
echo 1. Cleaning previous build...
if exist bin rmdir /s /q bin
if exist obj rmdir /s /q obj
echo    Clean completed.
echo.

echo 2. Building application in Release mode...
dotnet build BotOfTheSpecterOBSConnector.csproj --configuration Release --verbosity minimal
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed! Please check the error messages above.
    echo.
    pause
    exit /b 1
)
echo    Build completed successfully!
echo.

echo 3. Starting application...
echo.
echo Application should now be running. 
echo Check the UI window that opened.
echo.
echo Testing checklist:
echo [ ] 1. Application window opens with dark theme
echo [ ] 2. Connection status shows "Connecting" initially
echo [ ] 3. Can navigate between tabs (Main, API Settings, OBS Settings, etc.)
echo [ ] 4. API Settings tab allows entering API key
echo [ ] 5. OBS Settings tab allows configuring WebSocket connection
echo [ ] 6. Event Settings tab shows event filtering options
echo [ ] 7. Logs tab displays application logs
echo [ ] 8. About tab shows application information
echo.
echo Press any key to run the application...
pause > nul

REM Run the application
start "" "bin\Release\net8.0-windows\BotOfTheSpecterOBSConnector.exe"

echo.
echo Application started! Check the window that opened.
echo.
echo To test WebSocket connections:
echo 1. Enter your BotOfTheSpecter API key in API Settings
echo 2. Configure OBS WebSocket settings (default: localhost:4455)
echo 3. Make sure OBS Studio is running with WebSocket server enabled
echo 4. Check connection status indicators turn green when connected
echo.
echo Press any key to exit this script...
pause > nul
