// ======================
// Zablind Call Service Auto-Start
// ======================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CONFIG = require('../config.js');

let callServiceProcess = null;
let callServiceStarted = false;

const debugLog = (msg) => {
  try {
    const os = require('os');
    const path = require('path');
    fs.appendFileSync(path.join(os.tmpdir(), 'call_service_debug.log'), `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch (e) {}
};

// Top level debug log
try {
  const os = require('os');
  fs.appendFileSync(path.join(os.tmpdir(), 'call_service_top_level.log'), `[${new Date().toISOString()}] call-service.js loaded! process.type=${process.type}, hasApp=${!!(require('electron') && require('electron').app)}\n`, 'utf8');
} catch (e) {
  try {
    const os = require('os');
    fs.appendFileSync(path.join(os.tmpdir(), 'call_service_top_level.log'), `[${new Date().toISOString()}] top level error: ${e.message}\n${e.stack}\n`, 'utf8');
  } catch (err) {}
}

/**
 * Setup process event handlers (stdout, stderr, exit, error)
 */
function setupProcessHandlers() {
  if (!callServiceProcess) return;

  // Log output for debugging (optional)
  callServiceProcess.stdout.on('data', (data) => {
    // Only log important messages to avoid spam
    const output = data.toString();
    if (output.includes('[ERROR]') || output.includes('[INCOMING CALL]') || output.includes('Hotkeys registered')) {
      console.log(`[CALL-SERVICE] ${output.trim()}`);
    }
  });

  callServiceProcess.stderr.on('data', (data) => {
    console.error(`[CALL-SERVICE] ${data.toString().trim()}`);
  });

  callServiceProcess.on('exit', (code, signal) => {
    console.log(`[CALL-SERVICE] Process exited with code ${code}, signal ${signal}`);
    callServiceStarted = false;
    callServiceProcess = null;
    
    // Optionally restart after a delay if it crashed
    if (code !== 0 && code !== null) {
      console.log('[CALL-SERVICE] Service crashed, will not auto-restart');
    }
  });

  callServiceProcess.on('error', (error) => {
    console.error(`[CALL-SERVICE] Failed to start: ${error.message}`);
    callServiceStarted = false;
    callServiceProcess = null;
  });
}

/**
 * Start the Zablind Call Service (Python script or executable)
 * This runs in the background to handle call shortcuts
 * Priority: 1. Executable (no Python needed), 2. Python script (requires Python)
 */
function startCallService() {
  debugLog('startCallService initialized');

  // Prevent multiple instances
  if (callServiceStarted) {
    debugLog('Service already started, skipping...');
    return;
  }

  try {
    debugLog(`__dirname: ${__dirname}`);
    debugLog(`process.resourcesPath: ${process.resourcesPath}`);

    // Get the path to zablind_call directory
    let zablindCallPath = process.env.ZABLIND_CALL_PATH || null;
    
    // Construct default writable path on disk outside app.asar
    let defaultCallPath = null;
    if (process.env.LOCALAPPDATA) {
      defaultCallPath = path.join(process.env.LOCALAPPDATA, 'Programs/zablind_call');
    } else {
      defaultCallPath = path.join(process.env.USERPROFILE || process.env.HOME || '', 'AppData/Local/Programs/zablind_call');
    }
    
    // Strategy 2: Try relative paths from current location
    if (!zablindCallPath) {
      const possiblePaths = [
        defaultCallPath,
        process.resourcesPath ? path.join(process.resourcesPath, '../../zablind_call') : null,
        process.resourcesPath ? path.join(process.resourcesPath, '../zablind_call') : null,
        path.join('c:/Projects/zablind/zablind_call'),
        path.join(process.env.USERPROFILE || process.env.HOME || '', 'zablind/zablind_call'),
      ].filter(Boolean);

      for (const possiblePath of possiblePaths) {
        if (possiblePath && fs.existsSync(possiblePath)) {
          zablindCallPath = possiblePath;
          break;
        }
      }
    }

    // If still not found, use default path
    if (!zablindCallPath) {
      zablindCallPath = defaultCallPath;
    }

    // Automatically extract ZablindCallHandler.exe from app.asar if present
    const sourceExe = path.join(__dirname, '../bin/ZablindCallHandler.exe');
    const targetExe = path.join(zablindCallPath, 'ZablindCallHandler.exe');

    debugLog(`sourceExe: ${sourceExe}`);
    debugLog(`targetExe: ${targetExe}`);
    debugLog(`sourceExists: ${fs.existsSync(sourceExe)}`);

    if (fs.existsSync(sourceExe)) {
      try {
        if (!fs.existsSync(zablindCallPath)) {
          debugLog(`Creating directory: ${zablindCallPath}`);
          fs.mkdirSync(zablindCallPath, { recursive: true });
        }

        let shouldExtract = false;
        if (!fs.existsSync(targetExe)) {
          shouldExtract = true;
        } else {
          // Compare size of source and target to overwrite outdated version
          const sourceStats = fs.statSync(sourceExe);
          const targetStats = fs.statSync(targetExe);
          debugLog(`Source size: ${sourceStats.size}, Target size: ${targetStats.size}`);
          if (sourceStats.size !== targetStats.size) {
            shouldExtract = true;
            debugLog('Call handler executable size mismatch, re-extracting...');
          }
        }

        if (shouldExtract) {
          debugLog(`Extracting Call Handler from ASAR to: ${targetExe}`);
          const buffer = fs.readFileSync(sourceExe);
          fs.writeFileSync(targetExe, buffer);
          debugLog(`Extraction successful!`);
        } else {
          debugLog('No extraction needed (file already up to date)');
        }
      } catch (extractError) {
        debugLog(`Error extracting executable: ${extractError.message}\n${extractError.stack}`);
        console.error('[CALL-SERVICE] Error extracting executable from ASAR:', extractError);
      }
    } else {
      debugLog('sourceExe does not exist!');
    }

    console.log(`[CALL-SERVICE] Found zablind_call directory: ${zablindCallPath}`);

    // PRIORITY 1: Check for executable (ZablindCallHandler.exe) - no Python needed!
    // Detect system architecture to find the right executable
    const os = require('os');
    const arch = os.arch().toLowerCase();
    let archSuffix = '';
    
    // Map Node.js arch to executable suffix
    if (arch === 'arm64' || arch === 'aarch64') {
      archSuffix = '_ARM64';
      console.log('[CALL-SERVICE] Detected ARM64 architecture');
    } else if (arch === 'x64' || arch === 'amd64') {
      archSuffix = '_x64';
      console.log('[CALL-SERVICE] Detected x64 architecture');
    } else if (arch === 'ia32' || arch === 'x32') {
      archSuffix = '_x86';
      console.log('[CALL-SERVICE] Detected x86 architecture');
    } else {
      console.log(`[CALL-SERVICE] Unknown architecture: ${arch}, trying generic executable`);
    }
    
    // Try architecture-specific executable first, then generic
    const exePaths = [
      // Architecture-specific in dist folder
      path.join(zablindCallPath, 'dist', `ZablindCallHandler${archSuffix}.exe`),
      // Generic in dist folder
      path.join(zablindCallPath, 'dist', 'ZablindCallHandler.exe'),
      // Architecture-specific in root
      path.join(zablindCallPath, `ZablindCallHandler${archSuffix}.exe`),
      // Generic in root
      path.join(zablindCallPath, 'ZablindCallHandler.exe'),
    ];
    
    let finalExePath = null;
    for (const exePath of exePaths) {
      if (fs.existsSync(exePath)) {
        finalExePath = exePath;
        break;
      }
    }
    
    if (finalExePath) {
      console.log(`[CALL-SERVICE] Found executable: ${finalExePath}`);
      console.log('[CALL-SERVICE] Using executable (no Python required)');
      
      if (CONFIG.showCallHandlerConsole) {
        // Use cmd.exe /c start to spawn in a new visible console window with its own working stdout/stderr
        callServiceProcess = spawn('cmd.exe', [
          '/c',
          'start',
          'Zablind Call Handler Debug Window',
          finalExePath,
          process.pid.toString()
        ], {
          cwd: path.dirname(finalExePath),
          detached: true,
          stdio: 'ignore'
        });
      } else {
        callServiceProcess = spawn(finalExePath, [process.pid.toString()], {
          cwd: path.dirname(finalExePath),
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
      }
      callServiceProcess.unref();
      
      callServiceStarted = true;
      console.log('[CALL-SERVICE] Call service started successfully (executable)');
      console.log('[CALL-SERVICE] PID:', callServiceProcess.pid);
      return;
    }

    // PRIORITY 2: Try Python script (requires Python installed)
    const pythonScriptPath = path.join(zablindCallPath, 'main.py');
    
    if (!fs.existsSync(pythonScriptPath)) {
      console.warn('[CALL-SERVICE] Could not find main.py or executable');
      console.warn('[CALL-SERVICE] Expected files:');
      console.warn(`  - ${pythonScriptPath}`);
      console.warn(`  - ${exePath}`);
      console.warn('[CALL-SERVICE] Solutions:');
      console.warn('  1. Build executable: cd zablind_call && build_exe.bat');
      console.warn('  2. Install Python and ensure main.py exists');
      return;
    }

    console.log(`[CALL-SERVICE] Found Python script: ${pythonScriptPath}`);

    // Check if Python is available
    const pythonCommands = ['python', 'python3', 'py'];
    let pythonCmd = null;

    for (const cmd of pythonCommands) {
      try {
        // Try to find Python in PATH
        const { execSync } = require('child_process');
        execSync(`${cmd} --version`, { stdio: 'ignore' });
        pythonCmd = cmd;
        break;
      } catch (e) {
        // Try next command
        continue;
      }
    }

    if (!pythonCmd) {
      console.error('[CALL-SERVICE] ============================================');
      console.error('[CALL-SERVICE] Python not found in PATH!');
      console.error('[CALL-SERVICE] ============================================');
      console.error('[CALL-SERVICE] Solutions:');
      console.error('[CALL-SERVICE]   1. Install Python from https://www.python.org/downloads/');
      console.error('[CALL-SERVICE]      (Make sure to check "Add Python to PATH" during installation)');
      console.error('[CALL-SERVICE]   2. OR build executable (no Python needed):');
      console.error(`[CALL-SERVICE]      cd "${zablindCallPath}"`);
      console.error('[CALL-SERVICE]      build_exe.bat');
      console.error('[CALL-SERVICE]      (Then place dist/ZablindCallHandler.exe in zablind_call directory)');
      console.error('[CALL-SERVICE] ============================================');
      return;
    }

    // Spawn the Python process
    if (CONFIG.showCallHandlerConsole) {
      callServiceProcess = spawn('cmd.exe', [
        '/c',
        'start',
        'Zablind Call Handler Debug Window',
        pythonCmd,
        pythonScriptPath,
        process.pid.toString()
      ], {
        cwd: zablindCallPath,
        detached: true,
        stdio: 'ignore'
      });
    } else {
      callServiceProcess = spawn(pythonCmd, [pythonScriptPath, process.pid.toString()], {
        cwd: zablindCallPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
    }
    callServiceProcess.unref();

    callServiceStarted = true;
    console.log('[CALL-SERVICE] Call service started successfully (Python script)');
    console.log('[CALL-SERVICE] PID:', callServiceProcess.pid);

  } catch (error) {
    debugLog(`Critical error in startCallService: ${error.message}\n${error.stack}`);
    console.error('[CALL-SERVICE] Error starting call service:', error);
    callServiceStarted = false;
  }
}

/**
 * Stop the call service
 */
function stopCallService() {
  if (callServiceProcess) {
    console.log('[CALL-SERVICE] Stopping call service...');
    callServiceProcess.kill();
    callServiceProcess = null;
    callServiceStarted = false;
  }
}

// Auto-start when module is loaded (ONLY in Electron main process)
if (process.type === 'browser') {
  // Add a small delay to ensure Zalo is fully initialized
  setTimeout(() => {
    startCallService();
  }, 2000); // Wait 2 seconds after Zalo starts

  // Clean up on process exit
  process.on('exit', () => {
    stopCallService();
  });

  const { app } = require('electron');

  // Open DevTools on browser window creation if enabled
  if (CONFIG.enableDevTools) {
    app.on('browser-window-created', (event, window) => {
      try {
        window.webContents.openDevTools({ mode: 'detach' });
      } catch (e) {
        debugLog(`Error opening DevTools: ${e.message}`);
      }
    });
  }

  // Ensure Call Handler is killed when app quits
  app.on('will-quit', () => {
    stopCallService();
  });

  // Register main process IPC listener for outgoing calls
  try {
    const { ipcMain } = require('electron');
    ipcMain.on('zablind-outgoing-call', (event, callType) => {
      try {
        const tempFile = path.join(require('os').tmpdir(), "zablind_outgoing_call_type.json");
        const data = {
          callType: callType,
          timestamp: Date.now(),
          pid: process.pid || 0
        };
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf8");
        debugLog(`[IPC] Outgoing call notified: ${callType}`);
      } catch (error) {
        debugLog(`[IPC] Error writing call type in main process: ${error.message}`);
      }
    });
    debugLog('[IPC] Registered zablind-outgoing-call listener in main process');
  } catch (ipcError) {
    debugLog(`[IPC] Error registering ipcMain listener: ${ipcError.message}`);
  }
}

// Export functions for manual control if needed
module.exports = {
  startCallService,
  stopCallService,
  isRunning: () => callServiceStarted
};

