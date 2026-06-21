// ======================
// Call Management Module
// ======================

const { announce } = require("./accessibility.js");
const { state, setFocusContext } = require("./state.js");
const { simulateHover, sleep, loc } = require("./utils.js");

// Store call type for communication with call handler
// This will be written to a file that the call handler can read
let outgoingCallType = null;
let callButtonsContainer = null;
let currentCallButtonIndex = 0;

/**
 * Focus NVDA cursor on call buttons container
 * This allows user to navigate between audio and video call buttons
 */
function focusCallButtons(liveRegion) {
  try {
    // Find the headerBtns container
    const container = document.getElementById("headerBtns");
    
    if (!container) {
      announce(loc("Không tìm thấy nút gọi. Đảm bảo bạn đang ở cửa sổ chat.", "Call buttons not found. Make sure you are in a chat window."), liveRegion);
      return false;
    }
    
    // Find the call buttons (audio and video)
    const audioButton = container.querySelector('[icon="outline-call"]');
    const videoButton = container.querySelector('[icon="icon-outline-video"]');
    
    if (!audioButton || !videoButton) {
      announce(loc("Không tìm thấy nút gọi thoại hoặc video.", "Audio or video call button not found."), liveRegion);
      console.error("[CALLS] Buttons not found:", { audioButton: !!audioButton, videoButton: !!videoButton });
      return false;
    }
    
    callButtonsContainer = container;
    currentCallButtonIndex = 0; // Start with audio button
    
    // Make buttons focusable temporarily for keyboard navigation
    // Store original tabindex to restore later
    const originalAudioTabIndex = audioButton.getAttribute("tabindex");
    const originalVideoTabIndex = videoButton.getAttribute("tabindex");
    
    // Set tabindex to make buttons focusable
    audioButton.setAttribute("tabindex", "0");
    videoButton.setAttribute("tabindex", "0");
    
    // Focus the audio button
    audioButton.focus();
    
    // Announce current button - use title attribute (will be in user's language)
    const audioTitle = audioButton.getAttribute("title") || audioButton.getAttribute("data-translate-title") || loc("Cuộc gọi thoại", "Audio call");
    announce(loc(
        `Nút gọi: ${audioTitle}. Nhấn Tab để chuyển sang video, Enter để chọn.`,
        `Call button: ${audioTitle}. Press Tab to switch to video, Enter to select.`
    ), liveRegion);
    
    return true;
  } catch (error) {
    console.error("[CALLS] Error focusing call buttons:", error);
    announce(loc("Lỗi khi tìm nút gọi.", "Error finding call buttons."), liveRegion);
    return false;
  }
}

/**
 * Navigate between call buttons using Tab
 */
function navigateCallButtons(event, liveRegion) {
  if (!callButtonsContainer) {
    return false;
  }
  
  try {
    const audioButton = callButtonsContainer.querySelector('[icon="outline-call"]');
    const videoButton = callButtonsContainer.querySelector('[icon="icon-outline-video"]');
    
    if (!audioButton || !videoButton) {
      return false;
    }
    
    // Ensure buttons are focusable
    if (!audioButton.getAttribute("tabindex")) {
      audioButton.setAttribute("tabindex", "0");
    }
    if (!videoButton.getAttribute("tabindex")) {
      videoButton.setAttribute("tabindex", "0");
    }
    
    // Tab key pressed
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      
      // Move to next button
      currentCallButtonIndex = (currentCallButtonIndex + 1) % 2;
      
      const button = currentCallButtonIndex === 0 ? audioButton : videoButton;
      button.focus();
      // Use title attribute (will be in user's language) or fallback to Vietnamese
      const buttonTitle = button.getAttribute("title") || button.getAttribute("data-translate-title") || 
                         (currentCallButtonIndex === 0 ? loc("Cuộc gọi thoại", "Audio call") : loc("Cuộc gọi video", "Video call"));
      announce(loc(
          `Nút ${currentCallButtonIndex === 0 ? "gọi thoại" : "gọi video"}: ${buttonTitle}. Nhấn Enter để gọi.`,
          `${currentCallButtonIndex === 0 ? "Audio" : "Video"} call button: ${buttonTitle}. Press Enter to call.`
      ), liveRegion);
      
      return true;
    }
    
    // Shift+Tab (go back)
    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      
      // Move to previous button
      currentCallButtonIndex = (currentCallButtonIndex - 1 + 2) % 2;
      
      const button = currentCallButtonIndex === 0 ? audioButton : videoButton;
      button.focus();
      // Use title attribute (will be in user's language) or fallback to Vietnamese
      const buttonTitle = button.getAttribute("title") || button.getAttribute("data-translate-title") || 
                         (currentCallButtonIndex === 0 ? loc("Cuộc gọi thoại", "Audio call") : loc("Cuộc gọi video", "Video call"));
      announce(loc(
          `Nút ${currentCallButtonIndex === 0 ? "gọi thoại" : "gọi video"}: ${buttonTitle}. Nhấn Enter để gọi.`,
          `${currentCallButtonIndex === 0 ? "Audio" : "Video"} call button: ${buttonTitle}. Press Enter to call.`
      ), liveRegion);
      
      return true;
    }
    
    // Enter key - activate the focused button
    if (event.key === "Enter") {
      event.preventDefault();
      
      console.log(`[CALLS] Enter pressed, currentCallButtonIndex: ${currentCallButtonIndex}`);
      
      let buttonToClick = null;
      let callType = null;
      
      if (currentCallButtonIndex === 0) {
        buttonToClick = audioButton;
        callType = "audio";
        console.log(`[CALLS] Selected audio button`);
      } else {
        buttonToClick = videoButton;
        callType = "video";
        console.log(`[CALLS] Selected video button`);
      }
      
      // Store call type locally (for reference)
      outgoingCallType = callType;
      
      // Notify Python handler immediately via HTTP POST BEFORE clicking
      // This ensures Python receives the notification before call becomes active
      console.log(`[CALLS] About to send HTTP notification for: ${callType}`);
      notifyCallHandler(callType);
      console.log(`[CALLS] HTTP notification sent (check Python console for [HTTP] logs)`);
      
      // Small delay to ensure HTTP notification is sent before clicking
      // This helps avoid race conditions
      sleep(50).then(() => {
        // DON'T modify button styles - just click it directly
        // Let Zalo handle all button state and click handlers
        buttonToClick.focus();
        simulateHover(buttonToClick);
        
        // Use zablind's pattern: sleep then dispatch events (like menu.js line 198-199)
        sleep(30).then(() => {
        // Use zablind's exact pattern from menu.js (line 94-96)
        ["mousedown", "mouseup", "click"].forEach((evt) =>
          buttonToClick.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
        );
        
        // Also try direct click (like menu.js line 199)
        buttonToClick.click();
        
        const buttonTitle = buttonToClick.getAttribute("title") || buttonToClick.getAttribute("data-translate-title") || 
                           (callType === "audio" ? loc("Cuộc gọi thoại", "Audio call") : loc("Cuộc gọi video", "Video call"));
        announce(loc(`Đang gọi ${buttonTitle}...`, `Calling ${buttonTitle}...`), liveRegion);
        
          // Reset after a delay
          setTimeout(() => {
            callButtonsContainer = null;
            currentCallButtonIndex = 0;
            setFocusContext("conversations");
          }, 1000);
        });
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("[CALLS] Error navigating call buttons:", error);
    return false;
  }
}

/**
 * Notify Python call handler via file-based IPC when call button is clicked
 * More reliable than HTTP - writes to a file that Python polls
 */
function notifyCallHandler(callType) {
  try {
    const { ipcRenderer } = require("electron");
    console.log(`[CALLS] Sending outgoing call type via Electron IPC: ${callType}`);
    ipcRenderer.send("zablind-outgoing-call", callType);
    
    // Also store locally for reference
    localStorage.setItem("zablind_outgoing_call_type", callType);
    localStorage.setItem("zablind_outgoing_call_time", Date.now().toString());
    window.zablindOutgoingCallType = callType;
    window.zablindOutgoingCallTime = Date.now();
  } catch (error) {
    console.error("[CALLS] Error sending call type via IPC:", error);
  }
}

/**
 * Store call type locally (for reference only)
 * @deprecated Use notifyCallHandler instead
 */
function storeCallTypeForHandler(callType) {
  notifyCallHandler(callType);
}

/**
 * Get stored call type (for call handler to read)
 */
function getStoredCallType() {
  try {
    const callType = localStorage.getItem("zablind_outgoing_call_type");
    const callTime = parseInt(localStorage.getItem("zablind_outgoing_call_time") || "0");
    
    // Only return if call was initiated recently (within last 5 seconds)
    if (callType && Date.now() - callTime < 5000) {
      return callType;
    }
    
    return null;
  } catch (error) {
    console.error("[CALLS] Error getting stored call type:", error);
    return null;
  }
}

/**
 * Clear stored call type
 */
function clearStoredCallType() {
  try {
    localStorage.removeItem("zablind_outgoing_call_type");
    localStorage.removeItem("zablind_outgoing_call_time");
    delete window.zablindOutgoingCallType;
    delete window.zablindOutgoingCallTime;
  } catch (error) {
    console.error("[CALLS] Error clearing call type:", error);
  }
}

module.exports = {
  focusCallButtons,
  navigateCallButtons,
  storeCallTypeForHandler,
  getStoredCallType,
  clearStoredCallType,
};

