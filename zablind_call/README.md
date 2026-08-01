# Zablind Call Handler

**Automatically handle Zalo incoming calls with keyboard shortcuts!**

A Windows application that monitors ZaloCall.exe and provides keyboard shortcuts to accept, deny, and manage Zalo calls.

## Features

- ✅ Automatically detects incoming Zalo calls
- ✅ Keyboard shortcuts for all call actions
- ✅ Speech announcements (caller name, call type)
- ✅ Smart voice switching (Vietnamese/English)
- ✅ Works with both audio and video calls
- ✅ Auto-start with Zalo (optional)

## Keyboard Shortcuts

### Incoming Call
- **`A`** - Accept call
- **`Ctrl+A`** - Accept video call without turning on camera
- **`D`** - Deny call

### During Active Call
- **`C`** - Toggle camera on/off
- **`M`** - Toggle microphone on/off
- **`E`** - End call

## Quick Start

### Option 1: Use Pre-built Executable (Recommended)

1. Copy `dist/ZablindCallHandler.exe` to your desired location
2. Run it (may require Administrator privileges)
3. The service will monitor for calls automatically

### Option 2: Build Your Own Executable

1. Install Python 3.10 or 3.11 (32-bit for universal x86 build)
   - Download from: https://www.python.org/downloads/
   - ✅ Check "Add Python to PATH" during installation

2. Install dependencies:
   ```cmd
   python -m pip install -r requirements.txt
   python -m pip install pyinstaller
   ```

3. Build executable:
   ```cmd
   build_exe_x86.bat
   ```

4. The executable will be in `dist/ZablindCallHandler.exe`

### Option 3: Run Python Script Directly

1. Install Python and dependencies (see Option 2)
2. Run:
   ```cmd
   python main.py
   ```

## Auto-Start with Zalo

The executable can automatically start when Zalo launches. See the main Zablind README for setup instructions.

## Requirements

- Windows (x64, ARM64, or x86)
- Python 3.8+ (only if building from source)
- Administrator privileges (for global hotkeys)

## Troubleshooting

### Executable shows "ModuleNotFoundError"

Rebuild the executable - the build script has been updated to include all dependencies.

### Hotkeys don't work

Run as Administrator. Global hotkeys require elevated privileges on Windows.

### Python not found

Install Python from https://www.python.org/downloads/ and make sure to check "Add Python to PATH".

## Files

- `main.py` - Main application code
- `requirements.txt` - Python dependencies
- `build_exe_x86.bat` - Build script for universal x86 executable
- `dist/ZablindCallHandler.exe` - Pre-built executable (if available)

## Notes

- The executable is universal x86 (32-bit) - runs on all Windows architectures
- On ARM64 Windows, it runs via emulation (slightly slower but works)
- The service runs in the background with no visible window
- Multiple instances are prevented automatically
