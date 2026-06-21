# Zablind

_A lightweight accessibility tool designed to assist visually impaired users in navigating Zalo PC on Windows._

> ⚠️ **Disclaimer**: This tool modifies internal files of the Zalo desktop app. Use at your own risk. Zablind is fully open-source and does not collect or transmit any user data.

---

## ⚡ What It Currently Supports

- **Contact Navigation**: Press `Ctrl + Shift + M` / `Ctrl + Shift + N` to navigate forward / backward through recent contacts.
- **Open Chats**: Press `Enter` to jump to the selected chat window.
- **Read Messages**: Press `Ctrl + Shift + R` to read the latest message, and `Ctrl + Shift + K` / `Ctrl + Shift + L` to read the previous / next message.
- **Voice & Media Messages**: Press `Tab` to play voice messages or open images/videos. For video messages, press `Space` to pause/resume playback.
- **Image Description**: Press `Ctrl + Shift + I` to hear descriptions from the Zablind Image API.
- **Message Menus**: Press the `Application` (or `Context Menu`) key to open the options menu for a message.
- **Send Attachments**: Press `Ctrl + Shift + A` to open the attachment menu, use `Up` / `Down` arrows to navigate, and `Enter` to choose.
- **Keyboard Shortcut Help**: Press `Escape` twice when focused on message lists/panels to access helper modals.
- **Making Calls**: Press `Ctrl + Shift + C` to focus on the audio call button, use `Tab` to switch to video, and press `Enter` to call.
- **Call Management**: Accept/deny calls, toggle camera/microphone on/off, and end calls using simple keyboard shortcuts:
  - **Incoming Call (focused)**: `A` to Accept, `Ctrl + A` to Accept without camera, `D` to Deny.
  - **Active Call**: `C` to Toggle Camera, `M` to Toggle Microphone, `E` to End Call.

---

## 🛠️ Developer Guide: Configuration & Auto-Updates

Zablind now features fully automated installation, updating, and health-checking routines running natively on Python inside `ZablindCallHandler.exe`. You no longer need Node.js or NPM installed on user machines.

### 1. Configuration (`config.js`)
All global settings are defined in [zablind_main/zablind/config.js](file:///c:/Projects/zablind/zablind_main/zablind/config.js):
- `version`: The current version string (e.g. `"2.0"`).
- `year`: The copyright or current year string (e.g. `"2026"`).
- `enableDevTools`: Set to `true` to automatically open detached Chrome DevTools on Zalo start (keep `false` in production).
- `showCallHandlerConsole`: Set to `true` to show the background handler's console window (keep `false` in production).

### 2. Compilation
To build the background service executable:
1. Ensure Python 3 (32-bit x86 preferred) is installed.
2. Navigate to `zablind_call` and run:
   ```cmd
   build_exe_x86.bat
   ```
This compiles the background service into `ZablindCallHandler.exe` and places it in both `zablind_call` and `zablind_main/zablind/bin/` folders automatically.

To build the setup installer executable:
1. Run the root build script:
   ```cmd
   build_installer.bat
   ```
This compiles the setup installer into a single-executable offline installer `ZablindInstaller.exe` in the root folder, which user can run to install Zablind.

### 3. Creating a Release
To publish an update that will auto-update on all user machines:
1. Update the `version` and `year` in `config.js`.
2. Compile the new executable using `build_exe_x86.bat`.
3. Create a zip archive containing:
   - `ZablindCallHandler.exe`
   - `zablind/` (the entire JS folder containing `config.js` and modules)
   - `preload-wrapper.js`
   - `popup-viewer.html`
4. Publish a new Release on your GitHub repository (`oceanondawave/zablind`) with a tag matching your new version (e.g., `v2.1`), and upload the zip file as a release asset.

### 4. Background Installer, Updater, & Watchdog
- **Auto-Installation**: The running service scans for new Zalo directories (`AppData/Local/Programs/Zalo/Zalo-*`). When Zalo installs a new version folder, the service kills Zalo, automatically applies the ASAR patch, deletes old version folders to save space, and restarts Zalo.
- **GitHub Updater**: The background thread checks your repository's latest release tag on startup. If a new version is found, it downloads the zip, renames the running executable to bypass Windows locks, extracts the new assets, and restarts the service.
- **Compatibility Watchdog**: Monitors Zalo processes. If Zalo launches but Zablind fails to start or encounters a critical JS crash, the watchdog logs telemetry to `zablind_crash.log` and alerts the user via TTS: *"Cảnh báo: Zablind không tương thích với phiên bản Zalo này. Đang ghi lại nhật ký lỗi."*

---

## 🛑 Disclaimer

This project is developed for the benefit of the visually impaired Zalo community. Contributions, improvements, and feedback are welcome. Feel free to contact the author at: minh.ngntri@gmail.com.
