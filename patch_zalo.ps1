# patch_zalo.ps1
# Zablind Auto-Patcher and Installer Script

$ErrorActionPreference = "Stop"

# 1. Kill any active Zalo or Zablind processes
echo "Stopping any running Zalo and Zablind Call Handler processes..."
Stop-Process -Name Zalo, ZaloExecutable, ZablindCallHandler, python -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 2. Find the active Zalo installation directory
$zaloDir = "C:\Users\Ocean\AppData\Local\Programs\Zalo"
if (-not (Test-Path $zaloDir)) {
    Write-Error "Zalo installation directory not found at $zaloDir. Please install Zalo first."
}

# Find the latest Zalo-<version> subdirectory
$versionDirs = Get-ChildItem -Path $zaloDir -Filter "Zalo-*" | Where-Object { $_.Attributes -match "Directory" }
if ($versionDirs.Count -eq 0) {
    Write-Error "Could not find any versioned Zalo directory (e.g. Zalo-26.5.10) under $zaloDir."
}

# Sort versions and pick the highest one
$latestVersionDir = $versionDirs | Sort-Object Name -Descending | Select-Object -First 1
$zaloActiveDir = $latestVersionDir.FullName
$resourcesDir = Join-Path $zaloActiveDir "resources"
echo "Found active Zalo directory: $zaloActiveDir"

# 3. Define source paths in workspace
$workspaceRoot = "c:\Projects\zablind"
$zablindSource = Join-Path $workspaceRoot "zablind_main\zablind"
$preloadWrapperSource = Join-Path $workspaceRoot "zablind_main\preload-wrapper.js"
$popupViewerSource = Join-Path $workspaceRoot "extracted\pc-dist\popup-viewer.html"
$callHandlerExe = Join-Path $workspaceRoot "zablind_call\ZablindCallHandler.exe"

# Verify source files exist
if (-not (Test-Path $zablindSource)) { Write-Error "Zablind main folder not found at $zablindSource" }
if (-not (Test-Path $preloadWrapperSource)) { Write-Error "preload-wrapper.js not found at $preloadWrapperSource" }
if (-not (Test-Path $popupViewerSource)) { Write-Error "popup-viewer.html not found at $popupViewerSource" }
if (-not (Test-Path $callHandlerExe)) { Write-Error "ZablindCallHandler.exe not found at $callHandlerExe. Please build it first." }

# 4. Set up temporary directory for extraction
$tempDir = Join-Path $env:TEMP "zalo_patch_temp"
if (Test-Path $tempDir) {
    Remove-Item -Path $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$extractedDir = Join-Path $tempDir "extracted"
New-Item -ItemType Directory -Path $extractedDir -Force | Out-Null

# 5. Locate original app.asar
$activeAsar = Join-Path $resourcesDir "app.asar"
$backupAsar = Join-Path $resourcesDir "app.asar.bak"
$backupUnpacked = Join-Path $resourcesDir "app.asar.bak.unpacked"  # Correct naming format for electron-asar tool

# Always ensure a clean backup exists
if (-not (Test-Path $backupAsar)) {
    echo "Creating a backup of the clean app.asar..."
    Copy-Item -Path $activeAsar -Destination $backupAsar -Force
}

if (-not (Test-Path $backupUnpacked)) {
    if (Test-Path (Join-Path $resourcesDir "app.asar.unpacked")) {
        echo "Creating a backup of the clean app.asar.unpacked..."
        Copy-Item -Path (Join-Path $resourcesDir "app.asar.unpacked") -Destination $backupUnpacked -Recurse -Force
    }
}

$sourceAsar = $backupAsar

# 6. Extract the source app.asar
echo "Extracting app.asar..."
npx --yes @electron/asar extract $sourceAsar $extractedDir

# 7. Inject Zablind
echo "Injecting Zablind files..."
$targetZablindDir = Join-Path $extractedDir "main-dist\zablind"
$targetBinDir = Join-Path $targetZablindDir "bin"

New-Item -ItemType Directory -Path $targetZablindDir -Force | Out-Null
New-Item -ItemType Directory -Path $targetBinDir -Force | Out-Null

# Copy zablind files
Copy-Item -Path "$zablindSource\*" -Destination $targetZablindDir -Recurse -Force
# Copy preload-wrapper.js
Copy-Item -Path $preloadWrapperSource -Destination (Join-Path $extractedDir "main-dist\preload-wrapper.js") -Force
# Copy patched popup-viewer.html
Copy-Item -Path $popupViewerSource -Destination (Join-Path $extractedDir "pc-dist\popup-viewer.html") -Force
# Copy ZablindCallHandler.exe
Copy-Item -Path $callHandlerExe -Destination (Join-Path $targetBinDir "ZablindCallHandler.exe") -Force

# 8. Patch main.js to load preload-wrapper.js instead of preload-render.js
$mainJsPath = Join-Path $extractedDir "main-dist\main.js"
if (-not (Test-Path $mainJsPath)) {
    Write-Error "Could not locate main.js in extracted archive."
}

echo "Patching main.js to load Zablind..."
$mainJsContent = Get-Content -Path $mainJsPath -Raw -Encoding utf8
if ($mainJsContent -match "preload-render\.js") {
    $mainJsContent = $mainJsContent -replace "preload-render\.js", "preload-wrapper.js"
    [System.IO.File]::WriteAllText($mainJsPath, $mainJsContent, [System.Text.Encoding]::UTF8)
    echo "Successfully patched main.js!"
} elseif ($mainJsContent -match "preload-wrapper\.js") {
    echo "main.js is already patched."
} else {
    Write-Error "Could not find preload-render.js reference in main.js to patch."
}

# 8.5. Patch bootstrap.js to load call-service.js early in main process boot
$bootstrapJsPath = Join-Path $extractedDir "bootstrap.js"
if (-not (Test-Path $bootstrapJsPath)) {
    Write-Error "Could not locate bootstrap.js in extracted archive."
}

echo "Patching bootstrap.js to load Zablind Call Service early..."
$bootstrapJsContent = Get-Content -Path $bootstrapJsPath -Raw -Encoding utf8
if (-not ($bootstrapJsContent -match "zablind/modules/call-service\.js")) {
    $patchBlock = @"
function bootstrap() {
  try {
    require('./main-dist/zablind/modules/call-service.js');
  } catch (e) {
    console.error('Failed to load Zablind Call Service in main process:', e);
  }
"@
    $bootstrapJsContent = $bootstrapJsContent -replace "function bootstrap\(\) \{", $patchBlock
    [System.IO.File]::WriteAllText($bootstrapJsPath, $bootstrapJsContent, [System.Text.Encoding]::UTF8)
    echo "Successfully patched bootstrap.js!"
} else {
    echo "bootstrap.js is already patched."
}

# 9. Copy correct version of native modules if backup exists
# This ensures we don't end up with native module mismatch
if (Test-Path $backupUnpacked) {
    echo "Restoring native modules from app.asar.bak.unpacked..."
    $targetNativeDir = Join-Path $extractedDir "native"
    if (Test-Path $targetNativeDir) {
        Remove-Item -Path $targetNativeDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $targetNativeDir -Force | Out-Null
    Copy-Item -Path "$backupUnpacked\native\*" -Destination $targetNativeDir -Recurse -Force
}

# 10. Repack app.asar
$repackedAsar = Join-Path $tempDir "app.asar"
$repackedUnpacked = Join-Path $tempDir "app.asar.unpacked"

echo "Repacking app.asar..."
npx --yes @electron/asar pack $extractedDir $repackedAsar --unpack "**/*.{node,dll,exe}"

# 11. Deploy to Zalo
echo "Cleaning up current deployed assets in Zalo..."
Remove-Item -Path $activeAsar -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $resourcesDir "app.asar.unpacked") -Recurse -Force -ErrorAction SilentlyContinue

echo "Deploying new app.asar..."
Copy-Item -Path $repackedAsar -Destination $activeAsar -Force

echo "Deploying new app.asar.unpacked..."
New-Item -ItemType Directory -Path (Join-Path $resourcesDir "app.asar.unpacked") -Force | Out-Null
Copy-Item -Path "$repackedUnpacked\*" -Destination (Join-Path $resourcesDir "app.asar.unpacked") -Recurse -Force

# 12. Clean up temporary directory
echo "Cleaning up temp files..."
Remove-Item -Path $tempDir -Recurse -Force

echo "================================================="
echo " Zablind installed successfully on version $latestVersionDir"
echo "================================================="
