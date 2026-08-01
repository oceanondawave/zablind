@echo off
echo ========================================
echo Building ZablindInstaller Executable
echo ========================================
echo.

REM Verify PyInstaller is installed
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo PyInstaller not found. Installing...
    python -m pip install pyinstaller
)

REM Build the installer
pyinstaller --onefile ^
    --name="ZablindInstaller" ^
    --icon="docs/favicon.ico" ^
    --add-data="zablind_call/ZablindCallHandler.exe;." ^
    --add-data="zablind_main/preload-wrapper.js;." ^
    --add-data="zablind_main/html/popup-viewer.html;." ^
    --add-data="zablind_main/zablind;zablind" ^
    --hidden-import=psutil ^
    --collect-all=psutil ^
    zablind_installer.py

if errorlevel 1 (
    echo [ERROR] Build failed!
    exit /b 1
)

copy "dist\ZablindInstaller.exe" "ZablindInstaller.exe" >nul 2>&1

REM Clean up PyInstaller build artifacts from root to keep workspace clean
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist ZablindInstaller.spec del /q ZablindInstaller.spec

echo.
echo ========================================
echo Build Complete: ZablindInstaller.exe
echo ========================================
