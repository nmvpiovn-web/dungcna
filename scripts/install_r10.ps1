<#
.SYNOPSIS
    Installs Tieng Anh Co Dung Android APK onto authorized DOOGEE R10 tablet safely via ADB.
.DESCRIPTION
    Enforces fail-closed preflight verification BEFORE any device mutation:
      1. Trusted immutable manifest anchor (src/lib/apkIntegrityManifest.json)
      2. Exact byte length & SHA-256 file hash verification (no caller anchor override)
      3. Android SDK package preflight (aapt2/aapt/apkanalyzer) -> exact package_id, versionCode, versionName
      4. Android SDK signature preflight (apksigner verify --print-certs) -> exact X.509 SHA-256 digest
      5. Authorized ADB device & DOOGEE R10 hardware model verification
      6. Non-destructive 'adb install -r' followed by postflight 'pm path' & 'dumpsys package' verification
.PARAMETER Device
    Specific ADB device serial or host:port. If omitted, discovers connected authorized DOOGEE R10 devices.
.PARAMETER ApkPath
    Path to the APK file. Default: static/downloads/tienganhcodung-latest.apk
.PARAMETER ExpectedSha256
    Optional SHA-256 hash assertion from caller. Cannot override the trusted manifest anchor; must match it if provided.
.PARAMETER ManifestPath
    Path to the trusted APK integrity manifest JSON. Default: src/lib/apkIntegrityManifest.json
.PARAMETER DryRun
    Executes all preflight and device checks without running adb install.
.PARAMETER AllowModelOverride
    Allows overriding DOOGEE R10 model verification (default: false, fail-closed).
#>
[CmdletBinding()]
param (
    [string]$Device = "",
    [string]$ApkPath = "static/downloads/tienganhcodung-latest.apk",
    [string]$ExpectedSha256 = "",
    [string]$ManifestPath = "src/lib/apkIntegrityManifest.json",
    [switch]$DryRun,
    [switch]$AllowModelOverride
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================================="
Write-Host " Tieng Anh Co Dung - DOOGEE R10 ADB Installer (Phase 5 R2)"
Write-Host "=========================================================="

# 1. Load Trusted Security Anchor Manifest
$resolvedManifest = Resolve-Path $ManifestPath -ErrorAction SilentlyContinue
if (-not $resolvedManifest -or -not (Test-Path $resolvedManifest)) {
    Write-Error "ERROR: Trusted APK integrity manifest not found at: '$ManifestPath'"
    exit 1
}

try {
    $manifest = Get-Content -Path $resolvedManifest -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Write-Error "ERROR: Failed to parse trusted APK integrity manifest JSON at: '$resolvedManifest'"
    exit 1
}

$trustedPackageId = [string]$manifest.package_id
$trustedVersionName = [string]$manifest.version_name
$trustedVersionCode = [string]$manifest.version_code
$trustedSha256 = ([string]$manifest.sha256).Trim().ToLower()
$trustedBytes = [int64]$manifest.bytes
$trustedCertSha256 = ([string]$manifest.signing_cert_sha256).Trim().ToLower()

if (-not $trustedPackageId -or -not $trustedVersionName -or -not $trustedVersionCode -or $trustedSha256.Length -ne 64 -or $trustedCertSha256.Length -ne 64) {
    Write-Error "ERROR: Trusted manifest '$resolvedManifest' is incomplete or invalid."
    exit 1
}

# Reject caller attempts to override the trusted SHA-256 security anchor
if ($ExpectedSha256 -ne "") {
    $callerHash = $ExpectedSha256.Trim().ToLower()
    if ($callerHash -ne $trustedSha256) {
        Write-Error "ERROR: SHA-256 hash mismatch against trusted security anchor! Caller ExpectedSha256 ($callerHash) cannot override manifest anchor ($trustedSha256)."
        exit 1
    }
}

Write-Host "[OK] Trusted manifest loaded: $trustedPackageId v$trustedVersionName ($trustedVersionCode)"

# 2. Verify APK file existence, byte size, and SHA-256 hash BEFORE any tool/device call
$resolvedApk = Resolve-Path $ApkPath -ErrorAction SilentlyContinue
if (-not $resolvedApk -or -not (Test-Path $resolvedApk)) {
    Write-Error "ERROR: APK file not found at: '$ApkPath'"
    exit 1
}

$apkFileInfo = Get-Item $resolvedApk
if ($trustedBytes -gt 0 -and $apkFileInfo.Length -ne $trustedBytes) {
    Write-Error "ERROR: APK file size mismatch! Expected $trustedBytes bytes, actual $($apkFileInfo.Length) bytes."
    exit 1
}

$fileHash = (Get-FileHash -Path $resolvedApk -Algorithm SHA256).Hash.ToLower()
if ($fileHash -ne $trustedSha256) {
    Write-Error "ERROR: SHA-256 hash mismatch!`n  Expected (manifest): $trustedSha256`n  Actual (file):       $fileHash"
    exit 1
}

Write-Host "[OK] APK file & SHA-256 verified ($($apkFileInfo.Length) bytes): $fileHash"

# 3. Locate Android SDK preflight tools (aapt2/aapt/apkanalyzer AND apksigner) - Fail-Closed if missing
$disableSdkFallback = ($env:R10_DISABLE_SDK_FALLBACK -eq "1")

function Find-SdkTool {
    param (
        [string]$EnvOverride,
        [string[]]$CommandNames,
        [string[]]$FileNames
    )
    if ($EnvOverride -ne "") {
        if (Test-Path $EnvOverride) {
            return (Resolve-Path $EnvOverride).Path
        }
        return $null
    }
    foreach ($cmd in $CommandNames) {
        $cmdObj = Get-Command $cmd -ErrorAction SilentlyContinue
        $found = if ($cmdObj) { $cmdObj.Source } else { $null }
        if ($found -and (Test-Path $found)) {
            return $found
        }
    }
    if ($disableSdkFallback) {
        return $null
    }
    $sdkRoots = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        "$env:LOCALAPPDATA\Android\Sdk",
        "C:\Users\admin\.gemini\antigravity\scratch\tim-bao-khiem-slither\android\sdk"
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($root in $sdkRoots) {
        foreach ($fname in $FileNames) {
            $match = Get-ChildItem -Path $root -Filter $fname -Recurse -File -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
            if ($match -and (Test-Path $match)) {
                return $match
            }
        }
    }
    return $null
}

$aaptBin = Find-SdkTool -EnvOverride ([string]$env:R10_AAPT_BIN) -CommandNames @("aapt2", "aapt", "apkanalyzer") -FileNames @("aapt2.exe", "aapt.exe", "apkanalyzer.bat")
if (-not $aaptBin) {
    Write-Error "ERROR: Required Android SDK package inspection tool (aapt2, aapt, or apkanalyzer) not found. Refusing to run adb install."
    exit 1
}
Write-Host "[OK] Using package inspector: $aaptBin"

$apksignerBin = Find-SdkTool -EnvOverride ([string]$env:R10_APKSIGNER_BIN) -CommandNames @("apksigner") -FileNames @("apksigner.bat", "apksigner.exe")
if (-not $apksignerBin) {
    Write-Error "ERROR: Required Android SDK signature verifier (apksigner) not found. Refusing to run adb install."
    exit 1
}
Write-Host "[OK] Using signature verifier: $apksignerBin"

# 4. Execute APK Package & Version Preflight BEFORE any ADB mutation
if ($aaptBin -match "apkanalyzer") {
    $badgingRaw = & $aaptBin manifest print "$resolvedApk" 2>&1
    $badgingExit = $LASTEXITCODE
} else {
    $badgingRaw = & $aaptBin dump badging "$resolvedApk" 2>&1
    $badgingExit = $LASTEXITCODE
}
$badgingText = ($badgingRaw | Out-String)

if ($badgingExit -ne 0) {
    Write-Error "ERROR: APK package preflight command failed with exit code $badgingExit.`n$badgingText"
    exit 1
}

$pkgMatch = [regex]::Match($badgingText, "package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'")
if (-not $pkgMatch.Success) {
    Write-Error "ERROR: Could not parse package metadata (name/versionCode/versionName) from APK preflight output.`n$badgingText"
    exit 1
}

$actualPkgId = $pkgMatch.Groups[1].Value
$actualVerCode = $pkgMatch.Groups[2].Value
$actualVerName = $pkgMatch.Groups[3].Value

if ($actualPkgId -ne $trustedPackageId -or $actualVerCode -ne $trustedVersionCode -or $actualVerName -ne $trustedVersionName) {
    Write-Error "ERROR: APK package/version preflight mismatch!`n  Expected: package='$trustedPackageId' versionCode='$trustedVersionCode' versionName='$trustedVersionName'`n  Actual:   package='$actualPkgId' versionCode='$actualVerCode' versionName='$actualVerName'"
    exit 1
}

Write-Host "[OK] APK package preflight verified: $actualPkgId v$actualVerName (versionCode $actualVerCode)"

# 5. Execute APK Signing Certificate Preflight BEFORE any ADB mutation
if (-not (Get-Command java -ErrorAction SilentlyContinue) -and -not $disableSdkFallback) {
    $jdkBin = Get-ChildItem -Path "C:\Program Files\Eclipse Adoptium" -Filter "java.exe" -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty DirectoryName
    if ($jdkBin) {
        $env:PATH = "$jdkBin;$env:PATH"
    }
}
$signerRaw = & $apksignerBin verify --print-certs "$resolvedApk" 2>&1
$signerExit = $LASTEXITCODE
$signerText = ($signerRaw | Out-String)

if ($signerExit -ne 0) {
    Write-Error "ERROR: apksigner verification failed with exit code $signerExit.`n$signerText"
    exit 1
}

$certMatch = [regex]::Match($signerText, "Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]{64})")
if (-not $certMatch.Success) {
    Write-Error "ERROR: Could not extract Signer #1 certificate SHA-256 digest from apksigner output.`n$signerText"
    exit 1
}

$actualCertSha256 = $certMatch.Groups[1].Value.ToLower()
if ($actualCertSha256 -ne $trustedCertSha256) {
    Write-Error "ERROR: APK signing certificate SHA-256 mismatch!`n  Expected (manifest): $trustedCertSha256`n  Actual (APK cert):   $actualCertSha256"
    exit 1
}

Write-Host "[OK] APK signing certificate verified: $actualCertSha256"

# 6. Locate ADB binary
$adbBin = $null
if ($env:R10_ADB_BIN -and (Test-Path $env:R10_ADB_BIN)) {
    $adbBin = (Resolve-Path $env:R10_ADB_BIN).Path
} else {
    $adbCmdObj = Get-Command adb -ErrorAction SilentlyContinue
    $adbBin = if ($adbCmdObj) { $adbCmdObj.Source } else { $null }
    if (-not $adbBin -and -not $disableSdkFallback) {
        $wingetAdb = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "adb.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
        if ($wingetAdb -and (Test-Path $wingetAdb)) {
            $adbBin = $wingetAdb
        }
    }
}

if (-not $adbBin) {
    Write-Error "ERROR: 'adb' executable not found in PATH or standard winget location. Please install Android Platform Tools."
    exit 1
}

Write-Host "[OK] Using ADB: $adbBin"

# 7. Check connected devices
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
        exit 1
    }
} else {
    if ($authorizedDevices.Count -eq 0) {
        Write-Error "ERROR: No authorized Android device connected."
        exit 1
    } elseif ($authorizedDevices.Count -gt 1) {
        Write-Error "ERROR: Multiple devices connected: $($authorizedDevices -join ', '). Please specify -Device <serial>."
        exit 1
    } else {
        $targetDevice = $authorizedDevices[0]
    }
}

Write-Host "[OK] Target device selected: $targetDevice"

# 8. Validate Model (Fail-Closed DOOGEE R10 check)
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
    Write-Host "[OK] Device model verified: DOOGEE R10 (Android $androidVer)"
}

# 9. Check currently installed package version (if any)
$packageRaw = & $adbBin -s $targetDevice shell pm list packages $trustedPackageId 2>&1
$packageCheck = if ($packageRaw) { ($packageRaw | Out-String).Trim() } else { "" }

if ($packageCheck -match "package:$([regex]::Escape($trustedPackageId))") {
    $versionRaw = & $adbBin -s $targetDevice shell dumpsys package $trustedPackageId 2>&1 | Select-String "versionName"
    $versionInfo = if ($versionRaw) { ($versionRaw | Out-String).Trim() } else { "Unknown" }
    Write-Host "[i] Currently installed on device: $versionInfo"
} else {
    Write-Host "[i] App '$trustedPackageId' is not currently installed on device (fresh install)."
}

# 10. DryRun mode
if ($DryRun) {
    Write-Host "`n=========================================================="
    Write-Host "[DRY-RUN] Verification complete! All safety gates passed:"
    Write-Host "  - Target:  $targetDevice ($manufacturer $model, Android $androidVer)"
    Write-Host "  - APK:     $resolvedApk"
    Write-Host "  - Package: $actualPkgId v$actualVerName ($actualVerCode)"
    Write-Host "  - Signer:  $actualCertSha256"
    Write-Host "  - SHA256:  $fileHash"
    Write-Host "  - Command that would run: $adbBin -s $targetDevice install -r $resolvedApk"
    Write-Host "=========================================================="
    exit 0
}

# 11. Execute actual non-destructive installation
Write-Host "`nExecuting installation (adb install -r)..."
$installOut = & $adbBin -s $targetDevice install -r "$resolvedApk" 2>&1
$installExit = $LASTEXITCODE
$installText = ($installOut | Out-String)

Write-Host $installText

if ($installExit -ne 0 -or $installText -notmatch "Success") {
    Write-Error "ERROR: Installation failed on device $targetDevice (exit code $installExit)."
    exit 1
}

# 12. Postflight verification (pm path + dumpsys package versionName/versionCode)
$pmPathRaw = & $adbBin -s $targetDevice shell pm path $trustedPackageId 2>&1
$pmPathExit = $LASTEXITCODE
$pmPathText = if ($pmPathRaw) { ($pmPathRaw | Out-String).Trim() } else { "" }

if ($pmPathExit -ne 0 -or $pmPathText -notmatch "^package:") {
    Write-Error "ERROR: Postflight pm path verification failed for $trustedPackageId! Output: $pmPathText"
    exit 1
}

$dumpsysRaw = & $adbBin -s $targetDevice shell dumpsys package $trustedPackageId 2>&1
$dumpsysExit = $LASTEXITCODE
$dumpsysText = if ($dumpsysRaw) { ($dumpsysRaw | Out-String) } else { "" }

if ($dumpsysExit -ne 0 -or $dumpsysText -notmatch "versionName=$([regex]::Escape($trustedVersionName))" -or $dumpsysText -notmatch "versionCode=$([regex]::Escape($trustedVersionCode))") {
    Write-Error "ERROR: Postflight dumpsys version verification failed for $trustedPackageId! Expected versionName=$trustedVersionName and versionCode=$trustedVersionCode."
    exit 1
}

Write-Host "`n=========================================================="
Write-Host " [SUCCESS] Application installed and postflight verified!"
Write-Host " Device:   $targetDevice ($manufacturer $model)"
Write-Host " Package:  $trustedPackageId v$trustedVersionName (versionCode $trustedVersionCode)"
Write-Host " APK Path: $pmPathText"
Write-Host "=========================================================="
exit 0
