// ======================
// Conversation Management
// ======================

const { HIGHLIGHT_CLASS, SELECTORS } = require("./constants.js");
const { state, updateConversationsState, setFocusContext } = require("./state.js");
const { simulateHover, loc } = require("./utils.js");
const { announce } = require("./accessibility.js");

function updateConversationItems(isSearch = false) {
  let items = [];
  
  if (isSearch) {
      const popups = Array.from(document.querySelectorAll('.popover-v3, .zmenu-body'));
      const activePopup = popups.find(el => {
          const style = window.getComputedStyle(el);
          return el.offsetWidth > 0 && el.offsetHeight > 0 && style.opacity !== "0" && style.visibility !== "hidden";
      });
      
      let insidePopup = false;
      if (activePopup) {
          const popupItems = Array.from(activePopup.querySelectorAll(SELECTORS.contactSearchResults));
          const popupInput = activePopup.querySelector("input[type='text']");
          
          if (popupItems.length > 0 || popupInput) {
              insidePopup = true;
              items = popupItems;
              if (popupInput) {
                  if (!popupInput.hasAttribute("tabindex")) popupInput.setAttribute("tabindex", "0");
                  items.unshift(popupInput);
              }
          }
      }
      
      if (!insidePopup) {
          items = Array.from(document.querySelectorAll(SELECTORS.contactSearchResults));
      }
  } else {
      items = Array.from(document.querySelectorAll(SELECTORS.conversations));
  }

  const visibleItems = items.filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
  
  // Fix calendar and date picker labels dynamically for universality
  const datePickers = Array.from(document.querySelectorAll('.cal-preview-v3'));
  if (datePickers.length >= 2) {
      const startText = datePickers[0].innerText.replace(/\n/g, " ").trim();
      const endText = datePickers[1].innerText.replace(/\n/g, " ").trim();
      const periodStr = `${startText} -> ${endText}`;
      datePickers[0].setAttribute('aria-label', `[1] ${startText} (${periodStr})`);
      datePickers[1].setAttribute('aria-label', `[2] ${endText} (${periodStr})`);
  }
  
  // Localized labels for calendar and filters
  const locCancel = loc("Hủy chọn", "Cancel");
  const locDisabled = loc("Không thể chọn", "Disabled");
  const locSelected = loc("Đã chọn", "Selected");
  
  const monthStr = document.querySelector(".cal-title .main-title")?.innerText.trim() || "";
  
  // Calculate previous and next month names from current month title
  // monthStr is like "Tháng 2, 2026" or "February, 2026"
  let prevMonthStr = "";
  let nextMonthStr = "";
  const mainTitle = document.querySelector(".cal-title .main-title");
  if (mainTitle) {
      const monthParts = mainTitle.querySelectorAll("div");
      if (monthParts.length >= 2) {
          const monthName = monthParts[0]?.innerText.trim() || "";
          const yearStr = monthParts[1]?.innerText.trim() || "";
          // Extract month number from Vietnamese "Tháng X" or English month names
          let monthNum = -1;
          const viMatch = monthName.match(/(\d+)/);
          if (viMatch) {
              monthNum = parseInt(viMatch[1]);
          } else {
              const enMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
              const idx = enMonths.findIndex(m => monthName.toLowerCase().includes(m.toLowerCase()));
              if (idx >= 0) monthNum = idx + 1;
          }
          
          const yearNum = parseInt(yearStr) || new Date().getFullYear();
          
          if (monthNum > 0) {
              const isVi = monthName.includes("Tháng");
              const prevM = monthNum === 1 ? 12 : monthNum - 1;
              const prevY = monthNum === 1 ? yearNum - 1 : yearNum;
              const nextM = monthNum === 12 ? 1 : monthNum + 1;
              const nextY = monthNum === 12 ? yearNum + 1 : yearNum;
              
              if (isVi) {
                  prevMonthStr = `Tháng ${prevM}, ${prevY}`;
                  nextMonthStr = `Tháng ${nextM}, ${nextY}`;
              } else {
                  const enMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                  prevMonthStr = `${enMonths[prevM - 1]}, ${prevY}`;
                  nextMonthStr = `${enMonths[nextM - 1]}, ${nextY}`;
              }
          }
      }
  }
  
  const leftBtn = document.querySelector('.cal-title [icon="icon-solid-left"]');
  if (leftBtn) leftBtn.setAttribute("aria-label", prevMonthStr || loc("Tháng trước", "Previous month"));
  const rightBtn = document.querySelector('.cal-title [icon="icon-solid-right"]');
  if (rightBtn) rightBtn.setAttribute("aria-label", nextMonthStr || loc("Tháng sau", "Next month"));
  
  let seenCurrentMonth = false;
  document.querySelectorAll('.cal-item').forEach(item => {
      const dayStr = item.innerText.trim();
      const isOutMonth = item.classList.contains("out-month");
      
      if (!isOutMonth) {
          seenCurrentMonth = true;
      }
      
      let status = "";
      if (item.classList.contains("selected")) status = `${locSelected} `;
      if (item.classList.contains("disabled")) status = `${locDisabled} `;
      
      let suffix = "";
      if (isOutMonth) {
          if (!seenCurrentMonth) {
              suffix = " " + (prevMonthStr || monthStr);
          } else {
              suffix = " " + (nextMonthStr || monthStr);
          }
      } else {
          suffix = " " + monthStr;
      }
      item.setAttribute('aria-label', `${status}${dayStr}${suffix}`);
  });
  
  document.querySelectorAll('.search-message-filter__chip .fa-close_24, .cal-preview-v3 .fa-close_24').forEach(el => {
      if (!el.hasAttribute("aria-label")) {
          const parent = el.closest('.search-message-filter__chip, .cal-preview-v3');
          let context = "";
          if (parent) {
             context = parent.innerText.replace(/\n/g, " ").trim();
          }
          el.setAttribute("aria-label", `${locCancel} ${context}`);
      }
  });
  
  const ids = [];
  const map = new Map();

  visibleItems.forEach((item) => {
    let id = item.id;
    if (!id) {
       id = "conv_" + Math.random().toString(36).substr(2, 9);
       item.id = id;
    }
    if (!item.getAttribute("tabindex")) {
       item.setAttribute("tabindex", "0");
    }
    ids.push(id);
    map.set(id, item);
  });
  
  state.conversations.items = visibleItems;
  state.conversations.ids = ids;
  state.conversations.map = map;
}

function highlightConversationById(id, context = "conversations") {
  const el = state.conversations.map.get(id);
  if (!el) return;

  state.conversations.items.forEach((item) =>
    item.classList.remove(HIGHLIGHT_CLASS)
  );

  el.classList.add(HIGHLIGHT_CLASS);
  simulateHover(el);
  el.focus();
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  
  setFocusContext(context);
}

function navigateConversations(key, liveRegion, isSearch = false) {
  updateConversationItems(isSearch);
  
  const { ids, currentId } = state.conversations;
  if (ids.length === 0) {
      announce(loc("Không có hội thoại nào.", "No conversations found."), liveRegion);
      return;
  }

  let currentIndex = currentId ? ids.indexOf(currentId) : -1;

  if (key === "1" || key === "!" || key === "Home") {
    currentIndex = 0;
  } else if (key === "ArrowDown") {
    currentIndex = Math.min(ids.length - 1, currentIndex + 1);
  } else if (key === "ArrowUp") {
    currentIndex = Math.max(0, currentIndex - 1);
  } else if (key === "End") {
    currentIndex = ids.length - 1;
  }
  
  if (currentIndex === -1) currentIndex = 0;

  const newId = ids[currentIndex];
  state.conversations.currentId = newId;
  highlightConversationById(newId, isSearch ? "search_results" : "conversations");
}

function switchConversationTab(liveRegion) {
    // 1. Find the specific tabs using their translation keys
    const focusedInner = document.querySelector(SELECTORS.tabFocused);
    const otherInner = document.querySelector(SELECTORS.tabOther);
    
    if (!focusedInner || !otherInner) {
        announce(loc("Không tìm thấy các tab hội thoại.", "Conversation tabs not found."), liveRegion);
        return;
    }
    
    const tabFocused = focusedInner.closest('.tab-item');
    const tabOther = otherInner.closest('.tab-item');
    if (!tabFocused || !tabOther) return;

    // 2. Identify Current Selection
    const isFocusedSelected = tabFocused.classList.contains('selected');
    
    // 3. Determine Target (Toggle)
    const targetTab = isFocusedSelected ? tabOther : tabFocused;
    const targetInner = isFocusedSelected ? otherInner : focusedInner;
    
    // PATTERN: Focus first to ensure SR knows where we are.
    targetTab.focus();
    
    // Dispatch events to trigger React
    const opts = { bubbles: true, cancelable: true, view: window };
    targetTab.dispatchEvent(new MouseEvent("mousedown", opts));
    targetTab.dispatchEvent(new MouseEvent("mouseup", opts));
    targetTab.click();
    
    // 5. Announce exactly what the target tab's dynamic text says
    announce(targetInner.innerText.trim(), liveRegion);
    
    // 6. Update list after brief delay for DOM to refresh
    setTimeout(updateConversationItems, 200);
}

function activateConversation(liveRegion) {
  const { currentId, map } = state.conversations;
  const el = map.get(currentId);
  if (el) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        return; 
    }
  
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
    
    if (el.classList.contains("conv-item") || el.classList.contains("search-message__item")) {
        setFocusContext("messages");
        state.messages.linkFocused = false;
        state.messages.currentId = null;
    }
    
    // Dynamically announce based on the element's actual text/label for universal language support
    let label = el.getAttribute("aria-label") || el.title || el.innerText || el.textContent || "";
    label = label.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    if (label) {
        announce(label, liveRegion);
    }
  }
}

module.exports = {
  updateConversationItems,
  highlightConversationById,
  navigateConversations,
  switchConversationTab,
  activateConversation,
};
