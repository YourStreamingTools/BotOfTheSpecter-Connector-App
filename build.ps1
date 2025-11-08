param(
    [switch]$Clean = $false,
    [string]$Name = "BotOfTheSpecter-OBS-Connector",
    [switch]$OneFile = $true,
    [switch]$Console = $false
)

$ErrorActionPreference = 'Stop'

$python = "python"

Write-Host "Using Python executable: $python"

# Force close any running instance of the app
Write-Host "Closing any running instances of BotOfTheSpecter-OBS-Connector..."
$runningProcess = Get-Process -Name "BotOfTheSpecter-OBS-Connector" -ErrorAction SilentlyContinue
if ($runningProcess) {
    Write-Host "Found running instance(s), force closing..."
    $runningProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Host "Application closed successfully."
} else {
    Write-Host "No running instances found."
}

# Ensure pip is up-to-date and install dependencies
Write-Host "Installing/Updating pip and project requirements..."
& $python -m pip install --upgrade pip
if (Test-Path .\requirements.txt) {
    & $python -m pip install -r .\requirements.txt
} else {
    Write-Host "No requirements.txt found; continuing without installing project requirements."
}
# Ensure PyInstaller is available
Write-Host "Installing PyInstaller (if not present)..."
& $python -m pip install pyinstaller

# Optional clean
if ($Clean) {
    Write-Host "Cleaning build/dist/__pycache__ and spec files..."
    foreach ($item in @("build", "dist", "__pycache__")) {
        if (Test-Path $item) {
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $item
        }
    }
    if (Test-Path "$Name.spec") {
        Remove-Item -Force -ErrorAction SilentlyContinue "$Name.spec"
    }
}

# Build pyinstaller argument list
$pyinstallerArgs = @("--noconfirm")
if ($OneFile) { $pyinstallerArgs += "--onefile" }
if ($Console) { $pyinstallerArgs += "--console" } else { $pyinstallerArgs += "--windowed" }
$pyinstallerArgs += "--name"
$pyinstallerArgs += $Name

# Add hidden imports for dependencies that PyInstaller might miss
$hiddenImports = @(
    "PyQt6.sip",
    "engineio",
    "engineio.async_drivers.aiohttp_polling",
    "engineio.async_drivers.aiohttp_websocket"
)
foreach ($import in $hiddenImports) {
    $pyinstallerArgs += "--hidden-import=$import"
}

# If an icon file exists in repo root, include it
if (Test-Path ".\botofthespecter.png") {
    Write-Host "Found botofthespecter.png - including as application icon"
    $pyinstallerArgs += "--icon"
    $pyinstallerArgs += ".\botofthespecter.png"
}

# Add the entry point
$pyinstallerArgs += "main.py"

Write-Host "Running PyInstaller with arguments:"
Write-Host "  $($pyinstallerArgs -join ' ')"

# Run PyInstaller
& $python -m PyInstaller @pyinstallerArgs

# Report result
$exePath = Join-Path -Path (Resolve-Path .\dist) -ChildPath ("$Name.exe")
if (Test-Path $exePath) {
    Write-Host "Build succeeded: $exePath"
    Write-Host "Launching application..."
    & $exePath
} else {
    # Check for folder variant dist\Name\Name.exe
    $altExe = Join-Path -Path (Resolve-Path ".\dist\$Name") -ChildPath ("$Name.exe")
    if (Test-Path $altExe) {
        Write-Host "Build succeeded: $altExe"
        Write-Host "Launching application..."
        & $altExe
    } else {
        Write-Host "Build finished but executable not found in dist. Check PyInstaller output above for errors."
    }
}

Write-Host "Done."
