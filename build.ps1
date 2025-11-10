param(
    [switch]$Clean = $false,
    [string]$Name = "BotOfTheSpecter-OBS-Connector",
    [switch]$OneFile = $true,
    [switch]$Console = $false
)

$ErrorActionPreference = 'Stop'

# Test for Python availability
Write-Host "Testing Python availability..."
$python = $null

try {
    $testPython = & python --version 2>&1
    $python = "python"
    Write-Host "Found python command: $testPython"
} catch {
    Write-Host "python command not found"
}

if ($null -eq $python) {
    Write-Host "ERROR: Could not find Python executable. Please ensure Python is installed and in PATH."
    exit 1
}

Write-Host "Using Python: $python"

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
& python -m pip install --upgrade pip

if (Test-Path .\requirements.txt) {
    & python -m pip install -r .\requirements.txt
} else {
    Write-Host "No requirements.txt found; continuing without installing project requirements."
}

Write-Host "Installing PyInstaller (if not present)..."
& python -m pip install pyinstaller

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
if ($OneFile) { 
    $pyinstallerArgs += "--onefile" 
}
if ($Console) { 
    $pyinstallerArgs += "--console" 
} else { 
    $pyinstallerArgs += "--windowed" 
}
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

# Add modular Python files as data files to ensure they are included
Write-Host "Including modular application files..."
$moduleFiles = @("constants.py", "config.py", "bot_connector.py", "obs_connector.py", "ui.py")
foreach ($module in $moduleFiles) {
    if (Test-Path ".\$module") {
        Write-Host "  - Including $module"
        $moduleName = [System.IO.Path]::GetFileNameWithoutExtension($module)
        $pyinstallerArgs += "--collect-all"
        $pyinstallerArgs += $moduleName
    } else {
        Write-Host "  - Warning: $module not found!"
    }
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
& python -m PyInstaller @pyinstallerArgs

# Report result
$exePath = Join-Path -Path (Resolve-Path .\dist) -ChildPath ("$Name.exe")
if (Test-Path $exePath) {
    Write-Host "Build succeeded: $exePath"
    Write-Host "Launching application..."
    & $exePath
} else {
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
