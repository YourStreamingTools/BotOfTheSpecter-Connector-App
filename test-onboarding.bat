@echo off
echo Testing BotOfTheSpecter OBS Connector User Onboarding Flow
echo =========================================================
echo.

echo 1. Building the project...
dotnet build BotOfTheSpecterOBSConnector.csproj
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo Build successful!
echo.

echo 2. Checking for any configuration files...
if exist "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini" (
    echo Configuration file found. Backing up...
    copy "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini" "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini.backup"
    del "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini"
    echo Configuration file removed for testing.
) else (
    echo No existing configuration file found.
)
echo.

echo 3. Starting the application...
echo The application should show:
echo   - Configuration warning banner at the top
echo   - "Configuration Required" status messages
echo   - Services should NOT start automatically
echo.
echo Test the following:
echo   a) Configuration warning banner is visible
echo   b) Enter API key in API Settings tab - banner should remain
echo   c) Enter OBS settings - banner should disappear when all required fields are filled
echo   d) Click "X" on banner to dismiss manually
echo   e) Validate API key functionality
echo   f) Test OBS reconnection
echo.
echo Press any key to start the application...
pause > nul

start "" /wait dotnet run --project BotOfTheSpecterOBSConnector.csproj

echo.
echo 4. Restoring configuration if backup exists...
if exist "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini.backup" (
    copy "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini.backup" "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini"
    del "%LOCALAPPDATA%\YourStreamingTools\BotOfTheSpecter\OBSConnectorSettings.ini.backup"
    echo Configuration restored.
)

echo.
echo Testing complete!
pause
