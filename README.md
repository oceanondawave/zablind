# Zablind

_A lightweight accessibility tool designed to assist visually impaired users in navigating Zalo PC on Windows._

> ⚠️ **Disclaimer**: This tool modifies internal files of the Zalo desktop app. Use at your own risk. Zablind is fully open-source and does not collect or transmit any user data.

---

## ⚡ What It Currently Supports

### 🧭 General & Help
- **Shortcut Help**: Press `Ctrl + Shift + H` to toggle the keyboard shortcuts help panel.
- **Language Selection**: Press `Ctrl + Shift + G` to automatically toggle between Vietnamese and English voice announcements.
- **Check for Updates**: Press `Ctrl + Shift + U` to manually trigger an update check for Zablind.
- **Dismiss/Close**: Press `Escape` to close active menus, dialogs, or media viewers.

### 🔍 Navigation
- **Contact Search**: Press `Ctrl + Shift + F` to focus on the contact search input box.
- **Select first chat**: Press `Ctrl + Shift + 1` to immediately select the first conversation in the list.
- **Contact/Chat List**: Press `Ctrl + Shift + M` to move down to the next conversation/result, or `Ctrl + Shift + N` to move up.
- **Focus Message Input**: Press `Ctrl + Shift + E` to focus on the chat input text box.
- **Switch Tabs**: Press `Ctrl + Shift + T` to toggle between the **Focus** (Ưu tiên) and **Other** (Khác) chat tabs.

### ✉️ Messaging
- **Read Messages**: Press `Ctrl + Shift + K` to read the previous message and `Ctrl + Shift + L` to read the next message.
- **Jump to Latest**: Press `Ctrl + Shift + R` to immediately read the latest message.
- **Voice & Media Messages**: Press `Tab` when focused on a message to play a voice message or open a photo/video.
- **Link Messages**: Use `ArrowDown` to focus on links inside a message, `ArrowUp` to focus back on the message text, and `Enter` to open the focused link.
- **Message Options**: Press the `ContextMenu` (or Application) key to open the options menu for the focused message.

### 🛠️ Actions
- **Add Friend**: Press `Ctrl + Shift + B` to open the "Add Friend by phone number" dialog.
- **Sync Messages**: Press `Ctrl + Shift + S` to synchronize messages from your mobile device.
- **Restart / Log Out Zalo**: Press `Ctrl + Shift + Q` to open the logout dialog with a one-click button to restart Zalo.
- **QR Code Fullscreen**: Press `Ctrl + Shift + D` on the login screen to open the Zalo login QR code full-screen in your default browser.
- **Send Attachments**: Press `Ctrl + Shift + O` to open the file/folder attachment menu.

### 📞 Calls & Call Management
- **Start a Call**: Press `Ctrl + Shift + C` to focus the audio call button, press `Tab` to switch to the video call button, and `Enter` to place the call.
- **Incoming Call (focused call window)**:
  - Press `A` to Accept the call.
  - Press `Ctrl + A` or `Ctrl + Shift + A` to Accept the video call without turning on your camera.
  - Press `D` to Deny/decline the call.
- **Active Call**:
  - Press `C` to toggle camera/video on/off.
  - Press `M` to toggle microphone/mute on/off.
  - Press `E` to end/hang up the call.

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
1. Update the `version` and `year` in [zablind_main/zablind/config.js](file:///c:/Projects/zablind/zablind_main/zablind/config.js).
2. Run the packaging script in the root directory:
   ```cmd
   python pack_release.py
   ```
   This will automatically build `ZablindCallHandler.exe`, compile `ZablindInstaller.exe`, and bundle all the files into a clean `zablind_release.zip` with the correct production layout.
3. Publish a new Release on your GitHub repository (`oceanondawave/zablind`) with a tag matching your new version (e.g., `v2.1`).
4. Upload `zablind_release.zip` and `ZablindInstaller.exe` as release assets to the GitHub Release page. The background updater will automatically check for this zip file to run the self-update.


### 4. Background Installer, Updater, & Watchdog
- **Auto-Installation**: The running service scans for new Zalo directories (`AppData/Local/Programs/Zalo/Zalo-*`). When Zalo installs a new version folder, the service kills Zalo, automatically applies the ASAR patch, deletes old version folders to save space, and restarts Zalo.
- **GitHub Updater**: The background thread checks your repository's latest release tag on startup. If a new version is found, it downloads the zip, renames the running executable to bypass Windows locks, extracts the new assets, and restarts the service.
- **Compatibility Watchdog**: Monitors Zalo processes. If Zalo launches but Zablind fails to start or encounters a critical JS crash, the watchdog logs telemetry to `zablind_crash.log` and alerts the user via TTS: *"Cảnh báo: Zablind không tương thích với phiên bản Zalo này. Đang ghi lại nhật ký lỗi."*

---

## 🛑 Disclaimer

This project is developed for the benefit of the visually impaired Zalo community. Contributions, improvements, and feedback are welcome. Feel free to contact the author at: minh.ngntri@gmail.com.
