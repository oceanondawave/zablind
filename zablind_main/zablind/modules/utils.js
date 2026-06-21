// ======================
// Utility Functions
// ======================

function simulateHover(element) {
  element?.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, cancelable: true })
  );
}

function extractCaptionWithShortenedLink(container) {
  if (!container) return "";

  const linkEl = container.querySelector("a.text-is-link");
  let linkHost = "";

  if (linkEl?.dataset.content) {
    try {
      linkHost = new URL(linkEl.dataset.content).hostname;
    } catch {
      linkHost = linkEl.textContent.trim();
    }
  }

  let allText = container.textContent.trim();
  if (linkEl && allText.includes(linkEl.textContent.trim())) {
    allText = allText.replace(linkEl.textContent.trim(), "").trim();
  }

  const linkPrefix = loc("Liên kết", "Link");
  const noContent = loc("(không có nội dung)", "(no content)");
  return linkHost
    ? `${linkPrefix} ${linkHost}${allText ? " " + allText : ""}`
    : allText || noContent;
}

function formatDuration(rawDuration) {
  if (!rawDuration) return "";

  const parts = rawDuration.split(":").map(Number);
  const [h = 0, m = 0, s = 0] =
    parts.length === 3
      ? parts
      : parts.length === 2
      ? [0, ...parts]
      : [0, 0, ...parts];

  return [h && `${h} ${loc("giờ", "h")}`, m && `${m} ${loc("phút", "m")}`, s && `${s} ${loc("giây", "s")}`]
    .filter(Boolean)
    .join(" ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectLanguage() {
  // Primary: Check the settings text - always visible in sidebar
  const settingTextEl = document.querySelector('[data-translate-inner="STR_MENU_SETTING"]');
  if (settingTextEl) {
      const text = settingTextEl.innerText.toLowerCase();
      if (text.includes("cài đặt")) return "vi";
      if (text.includes("setting")) return "en";
  }
  
  // Secondary: Check the settings button title
  const settingsBtn = document.querySelector('[data-id="div_Main_TabSetting"]');
  if (settingsBtn) {
      const title = settingsBtn.getAttribute("title") || "";
      if (title.toLowerCase().includes("cài đặt")) return "vi";
      if (title.toLowerCase().includes("setting")) return "en";
  }

  // Tertiary: Check any data-translate-inner element's rendered text vs its key
  const strAll = document.querySelector('[data-translate-inner="STR_ALL"]');
  if (strAll) {
      return strAll.innerText.toLowerCase().includes("all") ? "en" : "vi";
  }
  // Tertiary: Check if language menu is open (settings already visible)
  const vieLangItem = document.querySelector('[data-id="div_Lang_VIE"]');
  if (vieLangItem) {
      const hasCheck = vieLangItem.querySelector('.checked, .fa-Check_24_Line');
      return hasCheck ? "vi" : "en";
  }
  return "vi"; // default to Vietnamese
}

function loc(viText, enText) {
  return detectLanguage() === "vi" ? viText : enText;
}

function isTyping() {
  return (
    ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) ||
    document.activeElement.isContentEditable
  );
}

module.exports = {
  simulateHover,
  extractCaptionWithShortenedLink,
  formatDuration,
  sleep,
  isTyping,
  detectLanguage,
  loc,
};




