<#
.SYNOPSIS
    Installs Tieng Anh Co Dung Android APK onto authorized DOOGEE R10 tablet safely via ADB.
.PARAMETER Device
    Specific ADB device serial or host:port. If omitted, discovers connected authorized DOOGEE R10 devices.
.PARAMETER ApkPath
    Path to the APK file. Default: static/downloads/tienganhcodung-latest.apk
.PARAMETER ExpectedSha256
    Expected SHA-256 hash of the APK file. Default: 075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97
.PARAMETER DryRun
    Simulates checks without running adb install.
.PARAMETER AllowModelOverride
    Allows overriding DOOGEE R10 model verification (default: false, fail-closed).
#>
[CmdletBinding()]
param (
    [string]$Device = "",
    [string]$ApkPath = "static/downloads/tienganhcodung-latest.apk",
    [string]$ExpectedSha256 = "075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97",
    [switch]$DryRun,
    [switch]$AllowModelOverride
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================================="
Write-Host " Tiếng Anh Cô Dung - DOOGEE R10 ADB Installer (Phase 5)"
Write-Host "=========================================================="

# 1. Locate ADB binary
$adbBin = (Get-Command adb -ErrorAction SilentlyContinue)?.Source
if (-not $adbBin) {
    # Check common Winget installation path on Windows
    $wingetAdb = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "adb.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($wingetAdb -and (Test-Path $wingetAdb)) {
        $adbBin = $wingetAdb
    }
}

if (-not $adbBin) {
    Write-Error "ERROR: 'adb' executable not found in PATH or standard winget location. Please install Android Platform Tools."
    exit 1
}

Write-Host "[✓] Using ADB: $adbBin"

# 2. Verify APK file existence and SHA-256 hash
$resolvedApk = Resolve-Path $ApkPath -ErrorAction SilentlyContinue
if (-not $resolvedApk -or -not (Test-Path $resolvedApk)) {
    Write-Error "ERROR: APK file not found at: '$ApkPath'"
    exit 1
}

Write-Host "[✓] Located APK: $resolvedApk"

$fileHash = (Get-FileHash -Path $resolvedApk -Algorithm SHA256).Hash.ToLower()
$targetHash = $ExpectedSha256.Trim().ToLower()

if ($fileHash -ne $targetHash) {
    Write-Error "ERROR: SHA-256 hash mismatch!`n  Expected: $targetHash`n  Actual:   $fileHash"
    exit 1
}

Write-Host "[✓] SHA-256 verified: $fileHash"

# 3. Check connected devices
$rawDevices = & $adbBin devices
$lines = $rawDevices -split "`r?`n"
$authorizedDevices = @()
$unauthorizedDevices = @()

foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed -match "^List of devices attached") { continue }
    $parts = $trimmed -split "\s+"
    if ($parts.Length -ge 2) {
        $serial = $parts[0]
        $state = $parts[1]
        if ($state -eq "device") {
            $authorizedDevices += $serial
        } else {
            $unauthorizedDevices += "$serial ($state)"
        }
    }
}

if ($unauthorizedDevices.Count -gt 0) {
    Write-Warning "Detected unready/unauthorized device(s): $($unauthorizedDevices -join ', ')"
}

# Resolve target device
$targetDevice = ""
if ($Device -ne "") {
    if ($authorizedDevices -contains $Device) {
        $targetDevice = $Device
    } else {
        Write-Error "ERROR: Specified device '$Device' is not in the list of authorized devices ($($authorizedDevices -join ', '))."
        Write-Host "`nActionable steps to connect and authorize device:"
        Write-Host "  1. On tablet: Enable Developer Options -> USB Debugging."
        Write-Host "  2. Connect via USB and accept RSA fingerprint prompt on tablet."
        Write-Host "  3. Or for wireless: run 'adb pair <ip>:<port> <code>' then 'adb connect <ip>:<port>'."
        exit 1
    }
} else {
    if ($authorizedDevices.Count -eq 0) {
        Write-Error "ERROR: No authorized Android device connected."
        Write-Host "`nActionable steps to connect DOOGEE R10 tablet:"
        Write-Host "  1. USB: Connect tablet via USB Type-C, enable 'USB Debugging' and tap 'Always allow'."
        Write-Host "  2. Wi-Fi: Settings -> Developer Options -> Wireless Debugging."
        Write-Host "     - Pair once: 'adb pair 192.168.1.40:<pair-port> <pin>'"
        Write-Host "     - Connect:   'adb connect 192.168.1.40:<connect-port>'"
        Write-Host "  3. Verify with 'adb devices' before re-running."
        exit 1
    } elseif ($authorizedDevices.Count -gt 1) {
        Write-Error "ERROR: Multiple devices connected: $($authorizedDevices -join ', '). Please specify -Device <serial>."
        exit 1
    } else {
        $targetDevice = $authorizedDevices[0]
    }
}

Write-Host "[✓] Target device selected: $targetDevice"

# 4. Validate Model (Fail-Closed DOOGEE R10 check)
$mRaw = & $adbBin -s $targetDevice shell getprop ro.product.manufacturer 2>&1
$manufacturer = if ($mRaw) { ($mRaw | Out-String).Trim() } else { "" }

$modRaw = & $adbBin -s $targetDevice shell getprop ro.product.model 2>&1
$model = if ($modRaw) { ($modRaw | Out-String).Trim() } else { "" }

$verRaw = & $adbBin -s $targetDevice shell getprop ro.build.version.release 2>&1
$androidVer = if ($verRaw) { ($verRaw | Out-String).Trim() } else { "" }

Write-Host "[i] Detected hardware: $manufacturer $model (Android $androidVer)"

$isDoogeeR10 = ($manufacturer -eq "DOOGEE" -and $model -eq "R10")

if (-not $isDoogeeR10) {
    if ($AllowModelOverride) {
        Write-Warning "WARNING: Device is not DOOGEE R10 ($manufacturer $model), but -AllowModelOverride was explicitly set. Proceeding..."
    } else {
        Write-Error "ERROR: Fail-closed model check! Expected 'DOOGEE R10', but detected '$manufacturer $model'. Use -AllowModelOverride only if intentional."
        exit 1
    }
} else {
    Write-Host "[✓] Device model verified: DOOGEE R10 (Android $androidVer)"
}

# 5. Check currently installed package version (if any)
$packageRaw = & $adbBin -s $targetDevice shell pm list packages vn.edu.tienganhcodung.app 2>&1
$packageCheck = if ($packageRaw) { ($packageRaw | Out-String).Trim() } else { "" }

if ($packageCheck -match "package:vn.edu.tienganhcodung.app") {
    $versionRaw = & $adbBin -s $targetDevice shell dumpsys package vn.edu.tienganhcodung.app 2>&1 | Select-String "versionName"
    $versionInfo = if ($versionRaw) { ($versionRaw | Out-String).Trim() } else { "Unknown" }
    Write-Host "[i] Currently installed on device: $versionInfo"
} else {
    Write-Host "[i] App 'vn.edu.tienganhcodung.app' is not currently installed on device (fresh install)."
}

# 6. DryRun mode
if ($DryRun) {
    Write-Host "`n=========================================================="
    Write-Host "[DRY-RUN] Verification complete! All safety gates passed:"
    Write-Host "  - Target: $targetDevice ($manufacturer $model, Android $androidVer)"
    Write-Host "  - APK:    $resolvedApk"
    Write-Host "  - SHA256: $fileHash"
    Write-Host "  - Command that would run: $adbBin -s $targetDevice install -r $resolvedApk"
    Write-Host "  - Data preservation: -r (reinstall keeping user data/settings)"
    Write-Host "=========================================================="
    exit 0
}

# 7. Execute actual non-destructive installation
Write-Host "`nExecuting installation (adb install -r)..."
$installOut = & $adbBin -s $targetDevice install -r $resolvedApk 2>&1

Write-Host $installOut

if ($LASTEXITCODE -ne 0 -or $installOut -notmatch "Success") {
    Write-Error "ERROR: Installation failed on device $targetDevice."
    exit 1
}

# 8. Post-installation verification
$postVersion = (& $adbBin -s $targetDevice shell dumpsys package vn.edu.tienganhcodung.app 2>&1 | Select-String "versionName").ToString().Trim()
Write-Host "`n=========================================================="
Write-Host " [SUCCESS] Application installed successfully on DOOGEE R10!"
Write-Host " Device:  $targetDevice ($manufacturer $model)"
Write-Host " Status:  $postVersion"
Write-Host "=========================================================="
exit 0
