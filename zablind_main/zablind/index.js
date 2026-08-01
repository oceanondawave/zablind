// ======================
// Zablind Main Entry Point
// ======================

const {
  createLiveRegion,
  announce,
  initializeAccessibility,
  injectStyles,
} = require("./modules/accessibility.js");
const { playWelcomeMessage, initializeTypingIndicator } = require("./modules/announcements.js");
const { updateConversationItems, highlightConversationById } = require("./modules/conversations.js");
const { updateMessageItems, initMessageObserver } = require("./modules/messages.js");
const { createKeyboardHandler, refreshAll } = require("./modules/keyboard.js");

// Call service is loaded in the main process via bootstrap.js to avoid renderer sandboxing limits.



function writeHeartbeat(status, errorDetails = null) {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const config = require('./config.js');
    
    const { getZablindDir } = require('./modules/utils.js');
    const zablindDir = getZablindDir();
    const candidates = [
      zablindDir,
      path.join(os.tmpdir(), 'Zablind')
    ];
    
    const data = {
      status: status,
      version: config.version || "2.0",
      pid: process.pid,
      timestamp: Date.now(),
      env_LOCALAPPDATA: process.env.LOCALAPPDATA || null,
      env_USERPROFILE: process.env.USERPROFILE || null,
      env_APPDATA: process.env.APPDATA || null,
      homedir: (() => { try { return os.homedir(); } catch(e) { return null; } })()
    };
    if (errorDetails) {
      data.error = errorDetails.message;
      data.stack = errorDetails.stack;
    }
    const payload = JSON.stringify(data, null, 2);
    
    for (const dir of candidates) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(path.join(dir, 'zablind_heartbeat.json'), payload, 'utf8');
        // Write once successfully, also write a debug marker
        fs.writeFileSync(path.join(dir, 'zablind_debug_path.txt'), dir, 'utf8');
        break; // Stop after first success
      } catch(writeErr) {
        // Try next candidate
      }
    }
  } catch (e) {}
}

// Write heartbeat immediately when preload loads — DOMContentLoaded may
// already have fired by the time event listeners are registered in preload.
writeHeartbeat("ok");

window.addEventListener('error', (event) => {
    const msg = (event.message || "").toLowerCase();
    if (msg.includes("resizeobserver") || msg.includes("script error")) {
        return;
    }
    writeHeartbeat("error", event.error || { message: event.message });
});

function initZablind() {
  try {
      initializeAccessibility();
      

      
      const liveRegion = createLiveRegion();
      document.body.appendChild(liveRegion);
      
      injectStyles();
      playWelcomeMessage(liveRegion);
      initializeTypingIndicator(liveRegion);
      
      const handleKeyDown = createKeyboardHandler(liveRegion);
      
      const safeHandler = (e) => {
          try {
              handleKeyDown(e);
          } catch (err) {
              // announce("Error Key: " + err.message, liveRegion);
          }
      };
      
      // USE CAPTURE PHASE to win against Zalo
      window.addEventListener("keydown", safeHandler, true);
      
      window.addEventListener("focus", () => refreshAll(liveRegion));
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshAll(liveRegion);
      });
      
      updateConversationItems();
      updateMessageItems();
      initMessageObserver();
      
      writeHeartbeat("ok");
  } catch (criticalError) {
      console.error(criticalError);
      writeHeartbeat("error", criticalError);
  }
}

// Handle the case where DOMContentLoaded already fired before preload ran
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initZablind);
} else {
  initZablind();
}
