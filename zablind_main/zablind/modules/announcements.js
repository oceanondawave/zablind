// ======================
// Announcements and Typing Indicator
// ======================

const { SELECTORS, APP_VERSION } = require("./constants.js");

function playWelcomeMessage(liveRegion) {
  const config = require("../config.js");
  const { announce } = require("./accessibility.js");
  const { loc } = require("./utils.js");
  
  // Zalo's UI loads asynchronously, so a small delay helps screen readers catch the announcement on startup
  setTimeout(() => {
    announce(loc(
      `Zablind phiên bản ${config.version || "2.0"} năm ${config.year || "2026"}`,
      `Zablind version ${config.version || "2.0"} ${config.year || "2026"}`
    ), liveRegion);
  }, 1500);
}

function initializeTypingIndicator(liveRegion) {
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("role", "status");
  liveRegion.style.cssText =
    "position:absolute;left:-9999px;height:1px;width:1px;overflow:hidden;";
  document.body.appendChild(liveRegion);

  let lastAnnouncedText = "";
  const typingIndicatorSelector = SELECTORS.typingIndicator;

  const checkInterval = setInterval(() => {
    const typingIndicator = document.querySelector(typingIndicatorSelector);

    if (typingIndicator) {
      const currentText = typingIndicator.textContent.trim();

      if (currentText !== lastAnnouncedText) {
        liveRegion.textContent = currentText;
        lastAnnouncedText = currentText;
      }
    } else if (lastAnnouncedText !== "") {
      liveRegion.textContent = "";
      lastAnnouncedText = "";
    }
  }, 1000);

  window.addEventListener("beforeunload", () => {
    clearInterval(checkInterval);
    liveRegion.remove();
  });
}

module.exports = {
  playWelcomeMessage,
  initializeTypingIndicator,
};




