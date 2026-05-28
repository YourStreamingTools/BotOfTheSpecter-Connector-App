param(
    [switch]$Clean = $false,
    [string]$Name = "BotOfTheSpecter",
    [switch]$OneFile,
    [switch]$Console = $false
)

$ErrorActionPreference = 'Stop'

if (-not $PSBoundParameters.ContainsKey('OneFile')) {
    $OneFile = $true
}

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

# Create version file for executable metadata
Write-Host "Creating version metadata file..."
$versionFileContent = @"
# UTF-8
VSVersionInfo(
    ffi=FixedFileInfo(
        mask=0x3f,
        mask_ex=0x0,
        reserved=0x0,
        serial=0x0,
        struct=((1, 1, 0, 0), (1, 1, 0, 0))
    ),
    VarFileInfo=[VarFileInfo([1033, 1200])],
    StringFileInfo=[
        StringFileInfo([
            StringTable(
                u'040904B0',
                [(u'CompanyName', u'YourStreamingTools'),
                    (u'FileDescription', u'Real-time OBS control connector for BotOfTheSpecter'),
                    (u'FileVersion', u'1.2.0.0'),
                    (u'InternalName', u'BotOfTheSpecter'),
                    (u'LegalCopyright', u'© 2025 YourStreamingTools'),
                    (u'OriginalFilename', u'BotOfTheSpecter.exe'),
                    (u'ProductName', u'BotOfTheSpecter'),
                    (u'ProductVersion', u'1.2.0.0')])
        ])
    ]
)
"@

$versionFilePath = Join-Path -Path (Get-Location) -ChildPath "version.txt"
Set-Content -Path $versionFilePath -Value $versionFileContent -Encoding UTF8
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

# Prefer a bundled app icon in assets/icons if present; otherwise, include repo-root icon if present
if (Test-Path ".\assets\icons\app.png") {
    Write-Host "Found assets/icons/app.png - including as application icon"
    $pyinstallerArgs += "--icon"
    $pyinstallerArgs += ".\assets\icons\app.png"
} elseif (Test-Path ".\botofthespecter.png") {
    Write-Host "Found botofthespecter.png - including as application icon"
    $pyinstallerArgs += "--icon"
    $pyinstallerArgs += ".\botofthespecter.png"
}

# Include assets/icons directory (all files) so bundled icons and SVGs are available at runtime
if (Test-Path ".\assets\icons") {
    Write-Host "Including assets/icons/ in build data"
    $pyinstallerArgs += "--add-data"
    # PyInstaller expects the format: SOURCE;DEST (on Windows)
    $pyinstallerArgs += ".\assets\icons;assets/icons"
}

# Add version metadata file
$pyinstallerArgs += "--version-file"
$pyinstallerArgs += $versionFilePath

# Add the entry point
$pyinstallerArgs += "main.py"

Write-Host "Running PyInstaller with arguments:"
Write-Host "  $($pyinstallerArgs -join ' ')"

# Run PyInstaller
& python -m PyInstaller @pyinstallerArgs

# Report result and update EXE metadata
$exePath = Join-Path -Path (Resolve-Path .\dist) -ChildPath ("$Name.exe")
if (-not (Test-Path $exePath)) {
    $exePath = Join-Path -Path (Resolve-Path ".\dist\$Name") -ChildPath ("$Name.exe")
}

if (Test-Path $exePath) {
    Write-Host "Build succeeded: $exePath"
    # Verify EXE metadata
    Write-Host "EXE Properties:"
    $fileInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exePath)
    Write-Host "  Product Name: $($fileInfo.ProductName)"
    Write-Host "  Company Name: $($fileInfo.CompanyName)"
    Write-Host "  File Version: $($fileInfo.FileVersion)"
    Write-Host "  Product Version: $($fileInfo.ProductVersion)"
    Write-Host "  Copyright: $($fileInfo.LegalCopyright)"
    Write-Host "  Description: $($fileInfo.FileDescription)"
    Write-Host ""
    Write-Host "Launching application..."
    & $exePath
} else {
    Write-Host "Build finished but executable not found in dist. Check PyInstaller output above for errors."
}

# Cleanup temporary version file
if (Test-Path $versionFilePath) {
    Remove-Item $versionFilePath -Force -ErrorAction SilentlyContinue
}

Write-Host "Done."
