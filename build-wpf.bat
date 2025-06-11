@echo off
echo Building BotOfTheSpecter OBS Connector WPF Application...
echo.

REM Clean previous build
if exist bin rmdir /s /q bin
if exist obj rmdir /s /q obj

REM Build the application
dotnet build --configuration Release

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Build completed successfully!
    echo.
    echo You can find the executable in: bin\Release\net8.0-windows\
    echo.
    pause
) else (
    echo.
    echo Build failed! Please check the error messages above.
    echo.
    pause
    exit /b 1
)
