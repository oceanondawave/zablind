// ======================
// Accessibility Functions
// ======================

const { HIGHLIGHT_CLASS, MESSAGE_HIGHLIGHT_CLASS, SELECTORS } = require("./constants.js");
const { state } = require("./state.js");
const { loc } = require("./utils.js");

function createLiveRegion() {
  const region = document.createElement("div");
  Object.assign(region, {
    "aria-live": "assertive",
    "aria-atomic": "true",
    "role": "alert", 
    id: "zablind-live-region",
    style: `
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(1px, 1px, 1px, 1px);
      z-index: 9999;
    `,
  });
  return region;
}

function announce(text, liveRegion) {
  if (!text) return;
  let region = liveRegion || document.getElementById("zablind-live-region");
  
  // Always recreate the live region for maximum reliability in React apps.
  // NVDA can lose track of old regions after heavy DOM manipulation.
  if (region) {
      region.remove();
  }
  
  region = createLiveRegion();
  if (document.body) {
      document.body.appendChild(region);
  } else {
      return; // Nowhere to attach
  }
  
  region.textContent = "";
  region.style.display = "none"; 
  
  setTimeout(() => {
    region.style.display = "block";
    region.textContent = text;
  }, 50);
}

// OBSERVER
let roleObserver = null;
let lastSyncSuccessBanner = null;
let lastNotificationText = "";

let emojiMap = {};
try {
  emojiMap = require("../emoji-labels.json");
} catch (e) {}

function translateLegacyEmojiElements(root) {
  const emojiSizers = root.querySelectorAll(".emoji-sizer");
  emojiSizers.forEach((el) => {
    if (el.hasAttribute("aria-label")) return;
    const rawText = el.textContent.trim();
    if (emojiMap[rawText]) {
      const mappedVal = emojiMap[rawText];
      if (mappedVal !== rawText) {
        el.setAttribute("aria-label", mappedVal);
      }
    }
  });
}

function initializeAccessibility() {
  document.body.setAttribute("role", "application");
  
  // Check if Zalo just restarted
  try {
      if (localStorage.getItem('zablind_just_restarted') === 'true') {
          localStorage.removeItem('zablind_just_restarted');
          announce(loc("Đã khởi động lại Zalo thành công.", "Zalo restarted successfully."));
      }
  } catch (e) {}

  // Initial Pass
  fixInteractiveElements(document);
  stripRoles(document);
  translateLegacyEmojiElements(document);
  try {
      const { injectHelpButton } = require("./help.js");
      injectHelpButton();
  } catch (e) {}

  // Check if QR login page is already visible on startup
  const qrPage = document.querySelector('.login-qr-page');
  if (qrPage && !state.hasAnnouncedLoginQR) {
      state.hasAnnouncedLoginQR = true;
      state.qrWasExpired = false;

      announce(loc(
          "Màn hình đăng nhập mã QR đang hiển thị. Nhấn Ctrl + Shift + D để xem mã QR toàn màn hình trong trình duyệt. Để điện thoại cách màn hình 30 đến 50 cm để quét mã.",
          "QR code login screen is visible. Press Ctrl + Shift + D to view the QR code fullscreen in your browser. Hold your phone 30 to 50 centimeters from the screen to scan."
      ));

      _watchQrImage(qrPage);
  }

  roleObserver = new MutationObserver((mutations) => {
      let needsFix = false;
      for (const m of mutations) {
          if (m.addedNodes.length > 0) needsFix = true;
      }
      if (needsFix) {
          fixInteractiveElements(document);
          stripRoles(document);
          translateLegacyEmojiElements(document);
          try {
              const { injectHelpButton } = require("./help.js");
              injectHelpButton();
          } catch (e) {}
      }
      
      // Auto-announcement of the accessible QR login guide
      const qrPage = document.querySelector('.login-qr-page');
      if (qrPage) {
          if (!state.hasAnnouncedLoginQR) {
              state.hasAnnouncedLoginQR = true;
              state.qrWasExpired = false;

              announce(loc(
                  "Màn hình đăng nhập mã QR đang hiển thị. Nhấn Ctrl + Shift + D để xem mã QR toàn màn hình trong trình duyệt. Để điện thoại cách màn hình 30 đến 50 cm để quét mã.",
                  "QR code login screen is visible. Press Ctrl + Shift + D to view the QR code fullscreen in your browser. Hold your phone 30 to 50 centimeters from the screen to scan."
              ));

              // Start watching the QR image for expiry/renewal
              _watchQrImage(qrPage);
          }
      } else {
          if (state.hasAnnouncedLoginQR) {
              state.hasAnnouncedLoginQR = false;
              state.qrWasExpired = false;
              if (state._qrImageObserver) {
                  state._qrImageObserver.disconnect();
                  state._qrImageObserver = null;
              }
          }
      }

      // Auto-announcement of the message sync success banner
      const successBanner = document.querySelector('.sync-db-banner-v3.sync--success');
      if (successBanner) {
          if (lastSyncSuccessBanner !== successBanner) {
              lastSyncSuccessBanner = successBanner;
              
              const titleEl = successBanner.querySelector('.title__banner, [data-translate-inner="STR_SUCCESS_SYNC_DB_BANNER_TITLE"]');
              const descEl = successBanner.querySelector('.desc__banner, [data-translate-inner="STR_SUCCESS_SYNC_DB_BANNER_DESCRIPTION"]');
              const title = titleEl ? titleEl.innerText.trim() : loc("Đồng bộ tin nhắn thành công", "Message sync successful");
              const desc = descEl ? descEl.innerText.trim() : loc("Tin nhắn của bạn đã được đồng bộ với điện thoại.", "Your messages have been synced with your phone.");
              
              announce(`${title}. ${desc}`);
          }
      } else {
          lastSyncSuccessBanner = null;
      }

      // Auto-announcement of toast notifications (success messages, alerts, etc.)
      const notifications = document.querySelectorAll('.zl-mini-notification, .mn-modal');
      notifications.forEach(notif => {
          const text = notif.innerText ? notif.innerText.trim() : "";
          if (text && text.length > 0 && lastNotificationText !== text) {
              lastNotificationText = text;
              announce(text);
              
              // Clear the deduplication cache after 3 seconds so the same toast can be spoken again later!
              setTimeout(() => {
                  if (lastNotificationText === text) {
                      lastNotificationText = "";
                  }
              }, 3000);
          }
      });

      // Auto-announcement and focus management for Find Friend modal
      const findFriendModal = document.querySelector('#FIND_FRIEND');
      if (findFriendModal) {
          if (state._findFriendResetTimeout) {
              clearTimeout(state._findFriendResetTimeout);
              state._findFriendResetTimeout = null;
          }
          const isCardPage = !!findFriendModal.querySelector('.pi-info-layout');
          const currentPageType = isCardPage ? 'card' : 'search';
          
          if (isCardPage) {
              const isBlocked = !!findFriendModal.querySelector('.friend-profile__block-friend');
              if (state._lastIsBlocked !== undefined && state._lastIsBlocked !== isBlocked) {
                  if (isBlocked) {
                      announce(loc("Đã chặn thành công.", "Blocked successfully."));
                  } else {
                      announce(loc("Đã bỏ chặn thành công.", "Unblocked successfully."));
                  }
              }
              state._lastIsBlocked = isBlocked;
              
              const hasUndoRequest = !!findFriendModal.querySelector('[data-translate-inner="STR_UNDO_REQUEST"]');
              if (state._lastHasUndoRequest !== undefined && state._lastHasUndoRequest !== hasUndoRequest) {
                  if (hasUndoRequest) {
                      announce(loc("Đã gửi yêu cầu kết bạn thành công.", "Friend request sent successfully."));
                  } else {
                      announce(loc("Đã hủy yêu cầu kết bạn thành công.", "Friend request canceled successfully."));
                  }
              }
              state._lastHasUndoRequest = hasUndoRequest;
          } else {
              // Only reset when we are actually back on the search page within the modal,
              // or when the modal is closed. This prevents intermediate unmount/remount ticks
              // from resetting the states.
              const searchInput = findFriendModal.querySelector('.phone-i-input, [data-id="txt_Main_AddFrd_Phone"]');
              if (searchInput && searchInput.offsetWidth > 0) {
                  state._lastIsBlocked = undefined;
                  state._lastHasUndoRequest = undefined;
              }
          }
          
          if (state.focusContext !== "find_friend_modal" || state._lastFindFriendPage !== currentPageType) {
              if (state.focusContext !== "find_friend_modal") {
                  state.previousActiveElement = document.activeElement;
                  state.previousFocusContext = state.focusContext;
                  state.focusContext = "find_friend_modal";
              }
              
              state._lastFindFriendPage = currentPageType;
              
              const titleEl = findFriendModal.querySelector('.zl-modal__dialog__header__title-text');
              const title = titleEl ? titleEl.innerText.trim() : (isCardPage ? loc("Thông tin tài khoản", "Account information") : loc("Thêm bạn", "Add friend"));
              
              announce(`${title}. ${loc("Hộp thoại đang hiển thị.", "Dialog is visible.")}`);
              
              setTimeout(() => {
                  const phoneInput = findFriendModal.querySelector('.phone-i-input, [data-id="txt_Main_AddFrd_Phone"]');
                  if (phoneInput && phoneInput.offsetWidth > 0) {
                      phoneInput.setAttribute("tabindex", "0");
                      phoneInput.focus();
                  } else {
                      const backBtn = findFriendModal.querySelector('.zl-modal__dialog__back');
                      const firstBtn = backBtn || findFriendModal.querySelector('.modal-header-icon, [icon="close f16"]');
                      if (firstBtn) {
                          firstBtn.setAttribute("tabindex", "0");
                          firstBtn.focus();
                      }
                  }
              }, 200);
          }
      } else {
          if (state.focusContext === "find_friend_modal") {
              state.focusContext = state.previousFocusContext || "conversations";
              state._lastFindFriendPage = null;
              if (state.previousActiveElement && document.body.contains(state.previousActiveElement)) {
                  state.previousActiveElement.focus();
              }
          }
          if (state._findFriendResetTimeout) {
              clearTimeout(state._findFriendResetTimeout);
          }
          state._findFriendResetTimeout = setTimeout(() => {
              state._lastIsBlocked = undefined;
              state._lastHasUndoRequest = undefined;
              state._findFriendResetTimeout = null;
          }, 300);
      }
  });
  
  roleObserver.observe(document.body, { 
      childList: true, 
      subtree: true
  });
}

function fixInteractiveElements(root) {
    // 1. Label TABS
    const tabs = root.querySelectorAll('.tab-item');
    tabs.forEach((tab, index) => {
        if (!tab.hasAttribute('role')) {
             tab.setAttribute('role', 'button');
             tab.setAttribute('tabindex', '0');
             const label = index === 0 ? "Tab Ưu tiên" : "Tab Khác";
             tab.setAttribute('aria-label', label);
             
             // Visual hint for sighted users (optional but good for consistency)
             if (tab.classList.contains('selected')) {
                 tab.setAttribute('aria-pressed', 'true');
             } else {
                 tab.setAttribute('aria-pressed', 'false');
             }
        }
    });

    // 2. Label Add Friend Button
    const addFriendBtn = root.querySelector(SELECTORS.addFriendBtn); // Needs SELECTORS import working
    if (addFriendBtn && !addFriendBtn.hasAttribute('role')) {
        addFriendBtn.setAttribute('role', 'button');
        addFriendBtn.setAttribute('tabindex', '0');
        addFriendBtn.setAttribute('aria-label', "Thêm bạn");
    }
    
    // 3. Label Profile Buttons (if visible)
    const profileAdd = root.querySelector(SELECTORS.profileAddFriend);
    if (profileAdd && !profileAdd.hasAttribute('role')) {
        profileAdd.setAttribute('role', 'button');
        profileAdd.setAttribute('aria-label', "Kết bạn");
    }
    const profileChat = root.querySelector(SELECTORS.profileChat);
    if (profileChat && !profileChat.hasAttribute('role')) {
        profileChat.setAttribute('role', 'button');
        profileChat.setAttribute('aria-label', "Nhắn tin");
    }
}

function stripRoles(root) {
    // We only strip the BAD roles that conflict with navigation
    const grids = root.querySelectorAll('[role="grid"], [role="listbox"], [role="treegrid"]');
    for (const el of grids) {
        el.removeAttribute("role");
        el.removeAttribute("aria-label"); 
    }
    
    // Silence Zalo's native live regions so it doesn't read all search results
    const liveRegions = root.querySelectorAll('[aria-live], [role="alert"], [role="status"], [role="log"]');
    for (const el of liveRegions) {
        if (el.id !== "zablind-live-region") {
             if (el.hasAttribute("role") && ["alert", "status", "log"].includes(el.getAttribute("role"))) {
                 el.removeAttribute("role");
             }
             el.removeAttribute("aria-live");
             el.removeAttribute("aria-atomic");
             el.removeAttribute("aria-relevant");
        }
    }
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background-color: rgba(255,159,49,0.15) !important;
      outline: 2px solid #ff9f31 !important;
    }
    .${MESSAGE_HIGHLIGHT_CLASS} {
      outline: 3px dashed #0066cc;
      border-radius: 6px;
      background-color: rgba(0,102,204,0.1);
    }
    :focus {
        outline: none;
    }
    html.zablind-fullscreen-active,
    body.zablind-fullscreen-active {
      width: 100vw !important;
      height: 100vh !important;
      min-width: 100vw !important;
      min-height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      position: static !important;
      overflow: visible !important;
      transform: none !important;
      zoom: 1 !important;
      scale: 1 !important;
    }
    #zablind-fullscreen-qr {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background-color: #000000 !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      z-index: 999999 !important;
      box-sizing: border-box !important;
      padding: 24px !important;
      color: #ffffff !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      transform: none !important;
      zoom: 1 !important;
      scale: 1 !important;
    }
    #zablind-fullscreen-qr:fullscreen,
    #zablind-fullscreen-qr:-webkit-full-screen {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      background-color: #000000 !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      z-index: 999999 !important;
      margin: 0 !important;
      padding: 24px !important;
      transform: none !important;
      zoom: 1 !important;
      scale: 1 !important;
    }
    .zablind-fullscreen-qr-img {
      max-width: 80vmin !important;
      max-height: 80vmin !important;
      width: 80vmin !important;
      height: 80vmin !important;
      border: 24px solid #ffffff !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9) !important;
      image-rendering: pixelated !important;
      image-rendering: crisp-edges !important;
      transform: none !important;
      zoom: 1 !important;
      scale: 1 !important;
    }
    .zablind-fullscreen-qr-instruction {
      margin-top: 32px !important;
      font-size: 20px !important;
      line-height: 28px !important;
      font-weight: 600 !important;
      text-align: center !important;
      max-width: 650px !important;
      background: rgba(255, 255, 255, 0.15) !important;
      padding: 16px 32px !important;
      border-radius: 12px !important;
      backdrop-filter: blur(10px) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1) !important;
    }
  `;
  document.head.appendChild(style);
}

// Watch the QR image element for expiry/renewal and announce accordingly.
// Triggers reload via keyboard events (not mouse), keeping everything accessible.
function _watchQrImage(qrPage) {
    // Disconnect any previous observer on this login session
    if (state._qrImageObserver) {
        state._qrImageObserver.disconnect();
        state._qrImageObserver = null;
    }

    state.qrWasExpired = false;

    // Helper: click the expired QR image or retry elements
    const triggerReload = () => {
        const loginPage = document.querySelector('.login-qr-page');
        if (!loginPage) return;
        
        // Try all possible expired / reload elements
        const retryElements = [
            loginPage.querySelector('[data-translate-inner="STR_LOGIN_QR_PAGE_RETRY_GET_QR"]'),
            loginPage.querySelector('.mask--none'),
            loginPage.querySelector('i[class*="Retry"]'),
            loginPage.querySelector('i[class*="retry"]'),
            loginPage.querySelector('.qr-image--none'),
            loginPage.querySelector('img[class*="qr-image"]')
        ].filter(Boolean);

        for (const el of retryElements) {
            if (el && el.offsetWidth > 0) {
                try {
                    const rect = el.getBoundingClientRect();
                    const x = Math.floor(rect.left + (rect.width / 2)) || 0;
                    const y = Math.floor(rect.top + (rect.height / 2)) || 0;
                    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
                    el.dispatchEvent(new MouseEvent("mousedown", opts));
                    el.dispatchEvent(new MouseEvent("mouseup", opts));
                } catch (e) {}
                el.click();
                return;
            }
        }
        
        // Fallback: click the QR container itself
        const qrContainer = loginPage.querySelector('.qr-container, .qr-code-container, [class*="qr-container"], [class*="qr-code"]');
        if (qrContainer) {
            try {
                const rect = qrContainer.getBoundingClientRect();
                const x = Math.floor(rect.left + (rect.width / 2)) || 0;
                const y = Math.floor(rect.top + (rect.height / 2)) || 0;
                const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
                qrContainer.dispatchEvent(new MouseEvent("mousedown", opts));
                qrContainer.dispatchEvent(new MouseEvent("mouseup", opts));
            } catch (e) {}
            qrContainer.click();
        }
    };

    const checkQrState = () => {
        const refreshBtn = qrPage.querySelector('[data-translate-inner="STR_LOGIN_QR_PAGE_RETRY_GET_QR"], .mask--none, i[class*="Retry"], i[class*="retry"]');
        const hasExpiredBtn = !!(refreshBtn && refreshBtn.offsetWidth > 0);

        const img = qrPage.querySelector('.qr-image, .qr-image--none, img[class*="qr-image"]');
        const hasExpiredImg = !!(img && img.classList.contains('qr-image--none'));

        const isExpired = hasExpiredBtn || hasExpiredImg;

        if (isExpired && !state.qrWasExpired) {
            state.qrWasExpired = true;
            announce(loc(
                "Mã QR đã hết hạn. Đang tự động tải lại mã mới...",
                "QR code has expired. Automatically reloading a new code..."
            ));
            // Auto-click the expired QR image/retry button to trigger Zalo's reload.
            // Timeout increased to 2000ms to allow screen readers to fully speak the warning before the reload triggers success.
            setTimeout(triggerReload, 2000);
        } else if (!isExpired && state.qrWasExpired) {
            state.qrWasExpired = false;
            announce(loc(
                "Đã tải mã QR mới thành công. Để điện thoại cách màn hình 30 đến 50 cm để quét mã.",
                "New QR code loaded successfully. Hold your phone 30 to 50 centimeters from the screen to scan."
            ));
        }
    };

    // Run an initial check immediately since it might already be expired
    checkQrState();

    const observer = new MutationObserver(() => {
        checkQrState();
    });

    observer.observe(qrPage, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'src', 'style'],
    });

    state._qrImageObserver = observer;
}

module.exports = {
  createLiveRegion,
  announce,
  initializeAccessibility,
  injectStyles,
};
