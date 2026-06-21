@echo off
echo ========================================
echo Building Universal x86 Executable
echo ========================================
echo.
echo This will build a 32-bit executable that runs on ALL Windows architectures:
echo   - x64 Windows (most common)
echo   - ARM64 Windows (Surface Pro X, etc.)
echo   - x86 Windows
echo.
echo Note: The x86 version will run slower on ARM64 (emulation), but it's universal.
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

REM Check if pip is available
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pip not found!
    echo.
    echo Python is installed but pip is not available.
    echo Try: python -m ensurepip --upgrade
    echo Or reinstall Python with "Add Python to PATH" option.
    echo.
    pause
    exit /b 1
)

REM Check if PyInstaller is installed
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo PyInstaller not found. Installing...
    python -m pip install pyinstaller
    if errorlevel 1 (
        echo [ERROR] Failed to install PyInstaller
        echo.
        echo Try manually: python -m pip install pyinstaller
        pause
        exit /b 1
    )
)

REM Check if gTTS is installed
python -c "from gtts import gTTS; print('gTTS OK')" 2>nul
if errorlevel 1 (
    echo gTTS not found. Installing...
    python -m pip install gtts
    if errorlevel 1 (
        echo [WARNING] Failed to install gTTS - Vietnamese TTS may not work
    )
)

REM Check if pygame is installed
python -c "import pygame; print('pygame OK')" 2>nul
if errorlevel 1 (
    echo pygame not found. Installing...
    python -m pip install pygame
    if errorlevel 1 (
        echo [WARNING] Failed to install pygame - Vietnamese TTS may not work
    )
)

echo.
echo Installing all required dependencies from requirements.txt...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [WARNING] Some dependencies from requirements.txt may have failed to install
    echo Continuing anyway...
)

echo.
echo Verifying all dependencies are installed...
python -c "import psutil; import comtypes; import keyboard; import win32com.client; import win32gui; from gtts import gTTS; import pygame; print('All dependencies OK!')" 2>nul
if errorlevel 1 (
    echo [WARNING] Some dependencies may be missing. The build may fail.
    echo Make sure all dependencies are installed: python -m pip install -r requirements.txt
    pause
)

echo.
echo Building executable...
echo.
echo IMPORTANT: PyInstaller builds for the architecture of your Python interpreter.
echo.
echo Checking Python architecture...
python -c "import platform; import sys; arch = platform.architecture()[0]; machine = platform.machine(); print('Python architecture:', arch); print('Machine:', machine); print('Python executable:', sys.executable); print(''); print('NOTE: To build universal x86 executable:'); print('  - If you see \"32bit\" above: You will get x86 executable (runs everywhere)'); print('  - If you see \"64bit\" or \"ARM64\" above: You will get architecture-specific executable'); print('  - On ARM64 Windows: Install 32-bit (x86) Python to build universal x86 executable'); print('  - ARM64 Windows can run x86 Python via emulation')"
echo.
pause
echo.

REM Build with PyInstaller for x86
REM --onefile: Create single executable
REM --name: Output filename
REM Note: PyInstaller will build for the Python architecture you're using

pyinstaller --onefile ^
    --name="ZablindCallHandler_x86" ^
    --add-data="README.md;." ^
    --hidden-import=psutil ^
    --hidden-import=comtypes ^
    --hidden-import=comtypes.client ^
    --hidden-import=comtypes.gen.UIAutomationClient ^
    --hidden-import=keyboard ^
    --hidden-import=win32com.client ^
    --hidden-import=win32gui ^
    --hidden-import=win32con ^
    --hidden-import=win32api ^
    --hidden-import=gtts ^
    --hidden-import=gtts.gtts ^
    --hidden-import=pygame ^
    --hidden-import=pygame.mixer ^
    --collect-all=psutil ^
    --collect-all=comtypes ^
    --collect-all=keyboard ^
    --collect-all=gtts ^
    --collect-all=pygame ^
    main.py

if errorlevel 1 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

REM Also create generic name copy for convenience
copy "dist\ZablindCallHandler_x86.exe" "dist\ZablindCallHandler.exe" >nul 2>&1
copy "dist\ZablindCallHandler.exe" "ZablindCallHandler.exe" >nul 2>&1
if not exist "..\zablind_main\zablind\bin" mkdir "..\zablind_main\zablind\bin"
copy "dist\ZablindCallHandler.exe" "..\zablind_main\zablind\bin\ZablindCallHandler.exe" >nul 2>&1

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Executable location: dist\ZablindCallHandler_x86.exe
echo Generic copy: dist\ZablindCallHandler.exe
echo.
echo Architecture: x86 (32-bit) - UNIVERSAL
echo.
echo This executable will run on:
echo   - x64 Windows (most common)
echo   - ARM64 Windows (Surface Pro X, etc.) - slower due to emulation
echo   - x86 Windows
echo.
echo IMPORTANT: For auto-start with Zalo:
echo   1. Copy dist\ZablindCallHandler.exe to the zablind_call directory
echo   2. OR keep it in dist\ folder (auto-start will find it)
echo.
echo Note: The executable can run on any Windows machine WITHOUT Python installed!
echo Note: It may require Administrator privileges for global hotkeys.
echo.
echo WARNING: If you built this with 64-bit Python, it may not be true x86.
echo          For true x86, use 32-bit Python or build on x86 Windows.
echo.
pause

