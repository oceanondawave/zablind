<#
.SYNOPSIS
    Test script to simulate an older version of Zablind for testing manual update checks (Ctrl + Shift + U).

.DESCRIPTION
    Switches the installed Zablind local configuration between an older version (2.0.0)
    and the current release version (2.2.0) to test the update notification dialog and speech.

.EXAMPLE
    .\test_update_older_version.ps1 -SetOlder
    # Sets version to 2.0.0. Open Zalo and press Ctrl + Shift + U to hear:
    # "Có phiên bản mới ... Bắt đầu cập nhật"

.EXAMPLE
    .\test_update_older_version.ps1 -Restore
    # Restores version to 2.2.0. Open Zalo and press Ctrl + Shift + U to hear:
    # "Zablind đã được cập nhật phiên bản mới nhất."
#>

param (
    [switch]$SetOlder,
    [switch]$Restore
)

$localAppData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
$installedConfig = Join-Path $localAppData "Programs\zablind_call\zablind\config.js"
$devConfig = "c:\Projects\zablind\zablind_main\zablind\config.js"

$configPath = $null
if (Test-Path $installedConfig) {
    $configPath = $installedConfig
} elseif (Test-Path $devConfig) {
    $configPath = $devConfig
} else {
    Write-Host "[ERROR] config.js not found in installed location or project directory." -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Target config.js: $configPath" -ForegroundColor Gray

$content = Get-Content -Path $configPath -Raw -Encoding UTF8

if ($SetOlder) {
    Write-Host "[TEST] Setting installed Zablind version to 2.0.0 (simulated older version)..." -ForegroundColor Cyan
    $newContent = $content -replace "version:\s*['`"][^'`"]+['`"]", "version: `"2.0.0`""
    Set-Content -Path $configPath -Value $newContent -Encoding UTF8
    Write-Host "[SUCCESS] Version set to 2.0.0 in $configPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "HOW TO TEST:" -ForegroundColor Yellow
    Write-Host "1. Switch to Zalo window." -ForegroundColor White
    Write-Host "2. Press Ctrl + Shift + U." -ForegroundColor White
    Write-Host "3. NVDA will announce: 'Có phiên bản mới ... Bắt đầu cập nhật.'" -ForegroundColor White
    Write-Host "4. After testing, run: .\test_update_older_version.ps1 -Restore" -ForegroundColor White
}
elseif ($Restore) {
    Write-Host "[TEST] Restoring installed Zablind version to 2.1.3..." -ForegroundColor Cyan
    $newContent = $content -replace "version:\s*['`"][^'`"]+['`"]", "version: `"2.1.3`""
    Set-Content -Path $configPath -Value $newContent -Encoding UTF8
    Write-Host "[SUCCESS] Version restored to 2.1.3 in $configPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "HOW TO TEST:" -ForegroundColor Yellow
    Write-Host "1. Switch to Zalo window." -ForegroundColor White
    Write-Host "2. Press Ctrl + Shift + U." -ForegroundColor White
    Write-Host "3. NVDA will announce: 'Zablind đã được cập nhật phiên bản mới nhất.'" -ForegroundColor White
}
else {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\test_update_older_version.ps1 -SetOlder   (Simulate older version 2.0.0)"
    Write-Host "  .\test_update_older_version.ps1 -Restore    (Restore to latest version 2.1.3)"
}
