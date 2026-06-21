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
    
    const tempFile = path.join(os.tmpdir(), "zablind_heartbeat.json");
    const data = {
      status: status,
      version: config.version || "2.0",
      pid: process.pid,
      timestamp: Date.now()
    };
    if (errorDetails) {
      data.error = errorDetails.message;
      data.stack = errorDetails.stack;
    }
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

window.addEventListener('error', (event) => {
    const msg = (event.message || "").toLowerCase();
    if (msg.includes("resizeobserver") || msg.includes("script error")) {
        return;
    }
    writeHeartbeat("error", event.error || { message: event.message });
});

window.addEventListener("DOMContentLoaded", () => {
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
});
