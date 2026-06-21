// ======================
// Keyboard Event Handler
// ======================

const { SELECTORS } = require("./constants.js");
const { state, setFocusContext } = require("./state.js");
const { isTyping, loc } = require("./utils.js");
const { focusChatInput } = require("./input.js");
const { navigateConversations, activateConversation, switchConversationTab } = require("./conversations.js");
const { handleMenuNavigation, openContextMenu, openAttachmentMenu } = require("./menu.js");
const { navigateMessages } = require("./messages.js");
const { playMedia } = require("./media.js");
const { announce } = require("./accessibility.js");
const { focusCallButtons, navigateCallButtons } = require("./calls.js");
const { focusContactSearch, handleSearchNavigation, handleAddFriendNavigation, handleFriendProfileNavigation } = require("./search.js");

function setupContextListeners() {
    document.addEventListener("mousedown", (e) => {
        // Do not change focus context while a modal is open
        if (state.focusContext === "help_modal" || state.focusContext === "sync_modal" || state.focusContext === "logout_modal" || state.focusContext === "find_friend_modal") {
            return;
        }
        const target = e.target;
        // link-message might be part of chatView, so this is covered if inside,
        // but if robust selectors are needed:
        if (target.closest(SELECTORS.chatView)) {
            setFocusContext("messages");
        } else if (target.closest("#conversationListId-Scroll") || target.closest(".conv-item")) {
            setFocusContext("conversations");
        } else if (target.closest(SELECTORS.contactSearchInput)) {
            setFocusContext("search");
        }
    }, true);
    
    document.addEventListener("focus", (e) => {
        // Do not change focus context while a modal is open
        if (state.focusContext === "help_modal" || state.focusContext === "sync_modal" || state.focusContext === "logout_modal" || state.focusContext === "find_friend_modal") {
            return;
        }
        const target = e.target;
         if (target.closest(SELECTORS.chatView)) {
            setFocusContext("messages");
        } else if (target.closest(SELECTORS.contactSearchInput)) {
            setFocusContext("search");
        } else if (target.closest(SELECTORS.conversations)) { 
            setFocusContext("conversations");
        }
    }, true);
}

function createKeyboardHandler(liveRegion) {
  setupContextListeners();
  
  return function handleKeyDown(event) {
    const key = event.key;
    const lowerKey = key.toLowerCase();
    
    const isCtrl = event.ctrlKey || event.metaKey; 
    const isShift = event.shiftKey;
    const isCtrlShift = isCtrl && isShift;
    
    let handled = false;

    // --- SYNC MODAL CONTEXT TRAP ---
    if (state.focusContext === "sync_modal") {
        const syncModal = document.querySelector('.count-down-screen');
        if (!syncModal) {
            setFocusContext("conversations");
        } else {
            const k = event.key;
            if (!event.ctrlKey && !event.metaKey && (k === 'Tab' || k === 'Enter' || k === 'Escape' || k === ' ')) {
                handled = true;
                
                if (event.type === 'keydown') {
                    const closeBtn = syncModal.querySelector('.close-btn');
                    const retryBtn = findRetryBtn(syncModal, closeBtn);
                    const items = [closeBtn, retryBtn].filter(Boolean);
                    
                    if (k === 'Escape') {
                        if (previousActiveElement && document.body.contains(previousActiveElement)) {
                            previousActiveElement.focus();
                        }
                        setFocusContext(previousFocusContext);
                        
                        if (closeBtn) {
                            fireClick(closeBtn);
                        } else {
                            document.body.click();
                        }
                    } 
                    else if (k === 'Enter' || k === ' ') {
                        const active = document.activeElement;
                        if (active && items.includes(active)) {
                            if (active === closeBtn || closeBtn.contains(active)) {
                                if (previousActiveElement && document.body.contains(previousActiveElement)) {
                                    previousActiveElement.focus();
                                }
                                setFocusContext(previousFocusContext);
                                fireClick(closeBtn);
                            } 
                            else if (active === retryBtn || retryBtn.contains(active)) {
                                fireClick(retryBtn);
                                announce(loc("Đang thử lại đồng bộ", "Retrying sync"), liveRegion);
                            }
                        } else {
                            const target = retryBtn || closeBtn;
                            if (target === closeBtn) {
                                if (previousActiveElement && document.body.contains(previousActiveElement)) {
                                    previousActiveElement.focus();
                                }
                                setFocusContext(previousFocusContext);
                            }
                            fireClick(target);
                        }
                    }
                    else if (k === 'Tab') {
                        const isShift = event.shiftKey;
                        const active = document.activeElement;
                        let idx = items.indexOf(active);
                        if (idx === -1) {
                            idx = isShift ? 1 : 0;
                        }
                        const step = isShift ? -1 : 1;
                        const next = items[(idx + step + items.length) % items.length];
                        
                        items.forEach(el => { if(el) el.style.outline = 'none'; });
                        next.setAttribute("tabindex", "0");
                        next.focus();
                        next.style.outline = '2px solid #0068ff';
                        next.style.outlineOffset = '2px';
                        
                        if (next === closeBtn) {
                            announce(loc("Nút đóng", "Close button"), liveRegion);
                        } else if (next === retryBtn) {
                            announce(loc("Nút thử lại", "Retry button"), liveRegion);
                        }
                    }
                }
            } else {
                // Completely block all other key presses inside the modal to prevent background triggers!
                handled = true;
            }
        }
    }

    // --- FIND FRIEND MODAL CONTEXT TRAP ---
    if (state.focusContext === "find_friend_modal") {
        const findFriendModal = document.querySelector('#FIND_FRIEND');
        if (!findFriendModal) {
            setFocusContext(state.previousFocusContext || "conversations");
        } else {
            const k = event.key;
            const active = document.activeElement;
            const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.classList.contains('phone-i-input') || active.classList.contains('friend-profile__addfriend__msg') || active.type === 'text');
            
            const isNavigationKey = k === 'Tab' || k === 'Escape' || (k === 'Enter' && active.tagName !== 'TEXTAREA');
            const isActionKey = !isInput && k === ' ';
            
            if (!event.ctrlKey && !event.metaKey && (isNavigationKey || isActionKey)) {
                handled = true;
                
                if (event.type === 'keydown') {
                    const items = queryInteractiveElements(findFriendModal);
                    
                    if (k === 'Escape') {
                        const closeBtn = findFriendModal.querySelector('.modal-header-icon:not(.zl-modal__dialog__back), [icon="close f16"]');
                        if (closeBtn) {
                            fireClick(closeBtn);
                        } else {
                            if (state.previousActiveElement && document.body.contains(state.previousActiveElement)) {
                                state.previousActiveElement.focus();
                            }
                            setFocusContext(state.previousFocusContext || "conversations");
                        }
                    }
                    else if (k === 'Tab') {
                        const isShift = event.shiftKey;
                        let idx = items.indexOf(active);
                        if (idx === -1) {
                            idx = items.findIndex(el => el.contains(active));
                        }
                        
                        if (idx === -1) {
                            idx = isShift ? items.length - 1 : 0;
                        }
                        
                        const step = isShift ? -1 : 1;
                        const next = items[(idx + step + items.length) % items.length];
                        
                        items.forEach(el => { if (el) el.style.outline = 'none'; });
                        next.setAttribute("tabindex", "0");
                        next.focus();
                        next.style.outline = '2px solid #0068ff';
                        next.style.outlineOffset = '2px';
                        
                        announceElement(next, liveRegion);
                    }
                    else if (k === 'Enter') {
                        if (isInput) {
                            const searchBtn = findFriendModal.querySelector('[data-id="btn_Main_AddFrd_Search"]');
                            if (searchBtn) {
                                fireClick(searchBtn);
                            }
                        } else if (items.includes(active)) {
                            fireClick(active);
                        } else {
                            const defaultActionBtn = findFriendModal.querySelector('[data-id="btn_Main_AddFrd_Search"]') || findFriendModal.querySelector('[data-translate-inner="STR_PROFILE_ADD_FRIEND"]')?.closest('.z--btn--v2');
                            if (defaultActionBtn) {
                                fireClick(defaultActionBtn);
                            }
                        }
                    }
                    else if (k === ' ' && !isInput) {
                        if (items.includes(active)) {
                            fireClick(active);
                        }
                    }
                }
            } else {
                if (!isInput) {
                    handled = true;
                }
            }
        }
    }

    // --- LOGOUT MODAL CONTEXT TRAP ---
    if (state.focusContext === "logout_modal") {
        const liveModal = document.querySelector('.zl-modal__dialog');
        if (!liveModal) {
            setFocusContext("conversations");
        } else {
            const k = event.key;
            if (!event.ctrlKey && !event.metaKey && (k === 'Tab' || k === 'Enter' || k === 'Escape' || k === ' ')) {
                handled = true;
                
                // Only trigger the actions on keydown to prevent double-firing
                if (event.type === 'keydown') {
                    const cb = liveModal.querySelector('.z-checkbox');
                    const no = liveModal.querySelector('[data-id="btn_Logout_No"]');
                    const yes = liveModal.querySelector('[data-id="btn_Logout_Logout"]');
                    const restart = liveModal.querySelector('[data-id="btn_Logout_Restart"]');
                    const items = [cb, no, yes, restart].filter(Boolean);
                    
                    if (k === 'Tab') {
                        const isShiftTab = event.shiftKey;
                        const active = document.activeElement;
                        let idx = items.indexOf(active);
                        if (idx === -1) {
                            idx = isShiftTab ? items.length : -1;
                        }
                        const step = isShiftTab ? -1 : 1;
                        const next = items[(idx + step + items.length) % items.length];
                        
                        items.forEach(el => { if(el) el.style.outline = 'none'; });
                        next.setAttribute("tabindex", "0");
                        next.focus();
                        next.style.outline = '2px solid #0068ff';
                        next.style.outlineOffset = '2px';
                        
                        if (next === cb) {
                            const lbl = cb.querySelector('[data-translate-inner]');
                            const isChecked = cb.getAttribute('data-id') !== 'false';
                            announce(`${lbl ? lbl.innerText.trim() : ''}, ${isChecked ? loc('đã chọn', 'checked') : loc('chưa chọn', 'unchecked')}`, liveRegion);
                        } else {
                            announce(next.innerText.trim(), liveRegion);
                        }
                    }
                    else if (k === ' ' && cb && (document.activeElement === cb || cb.contains(document.activeElement))) {
                        // Use native .click() — React handles this correctly; fireClick coordinates
                        // fail when element position is awkward (returns 0,0 rect)
                        try { cb.click(); } catch(e) {}
                        setTimeout(() => {
                            const freshCb = document.querySelector('.zl-modal__dialog .z-checkbox');
                            if (freshCb) {
                                const lbl = freshCb.querySelector('[data-translate-inner]');
                                const isChecked = freshCb.getAttribute('data-id') !== 'false';
                                announce(`${lbl ? lbl.innerText.trim() : ''}, ${isChecked ? loc('đã chọn', 'checked') : loc('chưa chọn', 'unchecked')}`, liveRegion);
                            }
                        }, 100);
                    }
                    else if (k === ' ' && (document.activeElement === no || document.activeElement === yes || document.activeElement === restart)) {
                        const target = document.activeElement;
                        setTimeout(() => {
                            if (target === no) {
                                if (previousActiveElement && document.body.contains(previousActiveElement)) {
                                    previousActiveElement.focus();
                                }
                                setFocusContext(previousFocusContext);
                            } else if (target === yes) {
                                setFocusContext("conversations");
                            }
                        }, 200);
                        fireClick(target);
                    }
                    else if (k === 'Enter') {
                        const active = document.activeElement;
                        const target = (active && items.includes(active)) ? active : yes;
                        // If Enter on checkbox, toggle it (same as Space)
                        if (target === cb) {
                            try { cb.click(); } catch(e) {}
                            setTimeout(() => {
                                const freshCb = document.querySelector('.zl-modal__dialog .z-checkbox');
                                if (freshCb) {
                                    const lbl = freshCb.querySelector('[data-translate-inner]');
                                    const isChecked = freshCb.getAttribute('data-id') !== 'false';
                                    announce(`${lbl ? lbl.innerText.trim() : ''}, ${isChecked ? loc('đã chọn', 'checked') : loc('chưa chọn', 'unchecked')}`, liveRegion);
                                }
                            }, 100);
                        } else {
                            setTimeout(() => {
                                if (target === no) {
                                    if (previousActiveElement && document.body.contains(previousActiveElement)) {
                                        previousActiveElement.focus();
                                    }
                                    setFocusContext(previousFocusContext);
                                } else if (target === yes) {
                                    setFocusContext("conversations");
                                }
                            }, 200);
                            fireClick(target);
                        }
                    }
                    else if (k === 'Escape') {
                        setTimeout(() => {
                            if (previousActiveElement && document.body.contains(previousActiveElement)) {
                                window.open('', '_self', ''); // Avoid warning
                                previousActiveElement.focus();
                            }
                            setFocusContext(previousFocusContext);
                        }, 200);
                        fireClick(no);
                    }
                }
            } else {
                // Completely block all other key presses inside the modal to prevent background triggers!
                handled = true;
            }
        }
    }

    // --- CALL BUTTONS CONTEXT TRAP ---
    if (state.focusContext === "call_buttons") {
        const k = event.key;
        if (!event.ctrlKey && !event.metaKey && (k === "Tab" || k === "Enter" || k === "Escape")) {
            handled = true;
            if (event.type === 'keydown') {
                if (k === "Escape") {
                    setFocusContext("conversations");
                    announce(loc("Đã thoát nút gọi", "Exited call buttons"), liveRegion);
                    const inputEl = document.querySelector(SELECTORS.chatInput);
                    if (inputEl) {
                        inputEl.focus();
                    } else {
                        document.body.focus();
                    }
                } else {
                    navigateCallButtons(event, liveRegion);
                }
            }
        }
    }

    // --- HELP MODAL CONTEXT TRAP ---
    if (state.focusContext === "help_modal") {
        const k = event.key;
        const active = document.activeElement;
        const isSearchInput = active && active.id === 'zablind-help-search';
        
        // If focused on search input, do NOT block Space or Enter so they can type spaces and submit queries.
        // We only intercept Tab (to cycle focus) and Escape (to close the modal).
        const shouldIntercept = isSearchInput 
            ? (k === 'Tab' || k === 'Escape' || k === 'Esc') 
            : (k === 'Tab' || k === 'Enter' || k === 'Escape' || k === 'Esc' || k === ' ');
            
        if (!event.ctrlKey && !event.metaKey && shouldIntercept) {
            handled = true;
            if (event.type === 'keydown') {
                const { handleHelpModalKeys } = require("./help.js");
                handleHelpModalKeys(event, liveRegion);
            }
        } else {
            // Block other keys when not typing in the search box
            if (!isSearchInput) {
                handled = true;
            }
        }
    }
    
    // For non-modal events, only process keydown!
    if (event.type !== 'keydown') {

        return;
    }
    
    // --- SEARCH ---
    if (isCtrlShift && lowerKey === "f") {
        handled = true;
        document.activeElement?.blur();
        focusContactSearch(liveRegion);
    }
    
    // --- CONVERSATIONS ---
    else if (isCtrlShift && lowerKey === "m") {
      handled = true;
      if (state.focusContext === "search" || state.focusContext === "search_results") {
          handleSearchNavigation("ArrowDown", liveRegion);
      } else {
          setFocusContext("conversations");
          navigateConversations("ArrowDown", liveRegion);
      }
    }
    else if (isCtrlShift && lowerKey === "n") {
       handled = true;
       if (state.focusContext === "search" || state.focusContext === "search_results") {
          handleSearchNavigation("ArrowUp", liveRegion);
       } else {
          setFocusContext("conversations");
          navigateConversations("ArrowUp", liveRegion);
       }
    }
    else if (isCtrlShift && (key === "1" || key === "!" || event.code === "Digit1" || event.keyCode === 49)) {
        handled = true;
        setFocusContext("conversations");
        navigateConversations("1", liveRegion);
    }
    
    // --- MESSAGES ---
    else if (isCtrlShift && lowerKey === "k") {
      handled = true;
      navigateMessages("ArrowUp");
      setFocusContext("messages");
    }
    else if (isCtrlShift && lowerKey === "l") {
      handled = true;
      navigateMessages("ArrowDown");
      setFocusContext("messages");
    }
    else if (isCtrlShift && lowerKey === "r") {
      handled = true;
      navigateMessages("R");
      setFocusContext("messages");
    }
    
    // --- OTHERS ---
    else if (isCtrlShift && lowerKey === "c") {
      handled = true;
      focusCallButtons(liveRegion);
      setFocusContext("call_buttons");
    }
    else if (isCtrlShift && lowerKey === "e") {
      handled = true;
      focusChatInput();
      setFocusContext("input"); 
    }
    else if (isCtrlShift && lowerKey === "o") {
      handled = true;
      openAttachmentMenu(event, liveRegion);
    }
    else if (isCtrlShift && lowerKey === "t") {
      handled = true;
      const { switchConversationTab } = require("./conversations.js");
      switchConversationTab(liveRegion);
    }
    else if (isCtrlShift && lowerKey === "q") {
      handled = true;
      signOut(liveRegion);
    }
    else if (isCtrlShift && lowerKey === "s") {
      handled = true;
      syncData(liveRegion);
    }
    else if (isCtrlShift && lowerKey === "b") {
      handled = true;
      openAddFriendModal(liveRegion);
    }
    else if (isCtrlShift && lowerKey === "h") {
      handled = true;
      const { openHelpModal } = require("./help.js");
      openHelpModal(liveRegion);
    }

    // (logout_modal handled at top of function)
    
    else if (key === "ContextMenu") {
        if (state.focusContext === "messages" && state.messages.currentId) {
             handled = true;
             openContextMenu(event, liveRegion);
        }
    }
    
    else if (state.menu.items.length > 0) {
      if (key === "ArrowUp" || key === "ArrowDown" || key === "Enter" || key === "Escape") {
          handleMenuNavigation(event, liveRegion);
          if (key !== "Escape") {
              handled = true;
          }
      }
    }
    
    else if (key === "Tab") {
        if (state.focusContext === "messages" && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
            const active = document.activeElement;
            const isFocusRegion = active && active.classList.contains("nvda-focus-region");
            if (isFocusRegion) {
                const currentId = state.messages.currentId;
                const messageEl = state.messages.map.get(currentId);
                if (openMessageMedia(messageEl)) {
                    handled = true;
                }
            }
        }
    }
    
    // --- LANGUAGE TOGGLE ---
    else if (isCtrlShift && lowerKey === "g") {
        handled = true;
        toggleLanguage(liveRegion);
    }
    
    // --- ACCESSIBLE FULLSCREEN QR CODE ---
    else if (isCtrlShift && lowerKey === "d") {
        const loginPage = document.querySelector('.login-qr-page');
        if (loginPage) {
            handled = true;
            toggleFullscreenQR(liveRegion);
        }
    }
    
    else if (key === "Enter" || key === " ") {
        if (key === "Enter" && (state.focusContext === "conversations" || state.focusContext === "search_results")) {
            handled = true;
            activateConversation(liveRegion);
        }
        else if (key === "Enter" && state.focusContext === "add_friend_btn") {
            handled = true;
            handleAddFriendNavigation(key, liveRegion);
        }
        else if (state.focusContext === "messages") {
            const active = document.activeElement;
            if (active && active.classList.contains("text-is-link")) {
                handled = true;
                ["mousedown", "mouseup", "click"].forEach((evt) =>
                    active.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
                );
                if (typeof active.click === "function") {
                    active.click();
                }
            }
        }
    }
    
    if (handled) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }
  };
}

module.exports = {
  createKeyboardHandler,
  refreshAll, // Keep if referenced by index.js
};

let previousActiveElement = null;
let previousFocusContext = "conversations";

function refreshAll() {}

function openMessageMedia(messageEl) {
    const { announce } = require("./accessibility.js");
    if (!messageEl) {
        announce("Zablind: No message element focused");
        return false;
    }
    
    // 1. Try to find and play voice message first
    // Look for the specific play control wrapper first to avoid hitting outer containers
    let voiceTarget = messageEl.querySelector(
        '.voice-message-normal-old__player-control-wrapper, ' +
        '.voice-message-normal__player-control-wrapper, ' +
        '[class*="player-control-wrapper"]'
    );
    
    if (!voiceTarget) {
        voiceTarget = messageEl.querySelector(
            '.voice-message-normal-old, ' +
            '.voice-message-normal, ' +
            '.voice-message-old, ' +
            '[class*="voice-message"]'
        );
    }
    
    if (voiceTarget) {
        announce(loc("Đang phát tin nhắn thoại", "Playing voice message"));
        voiceTarget.setAttribute("role", "button");
        voiceTarget.setAttribute("tabindex", "0");
        
        setTimeout(() => {
            voiceTarget.focus();
            fireClick(voiceTarget);
        }, 50);
        return true;
    }
    
    // 2. Try to find photo or video elements
    const targetMedia = messageEl.querySelector('.message-action img.zimg-el, .message-action img');

    if (targetMedia) {
        announce(loc("Đang mở ảnh hoặc video", "Opening photo or video"));
        fireClick(targetMedia);
        return true;
    }
    
    announce(loc("Không tìm thấy phương tiện để mở", "No media found to open"));
    return false;
}

let qrServer = null;

// Trigger Zalo QR reload by clicking the expired QR image or retry elements.
// React only responds to standard mousedown/mouseup sequence followed by click.
// Returns true if reload action was initiated.
function triggerZaloQrReload() {
    const loginPage = document.querySelector('.login-qr-page');
    if (!loginPage) return false;

    // 1. Try specific retry overlay/button elements first
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
            fireClick(el);
            return true;
        }
    }

    // 2. Fallback: click the QR container itself
    const qrContainer = loginPage.querySelector('.qr-container, .qr-code-container, [class*="qr-container"], [class*="qr-code"]');
    if (qrContainer) {
        fireClick(qrContainer);
        return true;
    }

    // 3. Fallback: QR still valid — force refresh via tab switch
    const allEls = Array.from(document.querySelectorAll('*'));
    const phoneTab = allEls.find(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return (t === 'với số điện thoại' || t === 'số điện thoại' || t === 'phone number') && el.offsetWidth > 0;
    });
    const qrTab = allEls.find(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return (t === 'với mã qr' || t === 'mã qr' || t === 'qr code') && el.offsetWidth > 0;
    });
    if (phoneTab && qrTab) {
        fireClick(phoneTab);
        setTimeout(() => fireClick(qrTab), 200);
        return true;
    }

    return false;
}

function startQrServer() {
    if (state.qrServerPort) return;
    
    try {
        const http = require('http');
        qrServer = http.createServer((req, res) => {
            const url = require('url').parse(req.url).pathname;
            
            if (url === '/qr-data') {
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' 
                });
                
                let qrSrc = '';
                let isExpired = false;
                
                const loginPage = document.querySelector('.login-qr-page');
                const mainApp = document.querySelector('#sidebarNav');
                const loggedIn = !loginPage && !!mainApp;
                
                if (loginPage) {
                    const sourceQr = loginPage.querySelector('.qr-image, .qr-image--none, img[class*="qr-image"]');
                    if (sourceQr) {
                        qrSrc = sourceQr.src;
                        state.latestQrCode = qrSrc; // Update state cache as fallback
                    } else {
                        qrSrc = state.latestQrCode || '';
                    }
                    
                    // Check if Zalo is showing the reload button/mask overlay
                    const refreshBtn = loginPage.querySelector('[data-translate-inner="STR_LOGIN_QR_PAGE_RETRY_GET_QR"], .mask--none, i[class*="Retry"]');
                    isExpired = !!(refreshBtn && refreshBtn.offsetWidth > 0);
                } else {
                    qrSrc = state.latestQrCode || '';
                }
                
                res.end(JSON.stringify({ qrSrc, expired: isExpired, loggedIn }));
                return;
            }
            
            if (url === '/reload') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('ok');
                
                // Trigger reload in Zalo context
                triggerZaloQrReload();
                return;
            }
            
            res.writeHead(200, { 
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' 
            });
            
            const qrSrc = state.latestQrCode || '';
            const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Zablind Accessible QR Login</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #000000;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        img {
            max-width: 95vmin;
            max-height: 95vmin;
            width: 95vmin;
            height: 95vmin;
            border: 24px solid #ffffff;
            border-radius: 16px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.9);
            image-rendering: pixelated;
            image-rendering: crisp-edges;
            transition: all 0.3s ease;
        }
        .reloading img {
            opacity: 0.5;
        }
        #expired-overlay {
            display: none;
            position: absolute;
            background-color: rgba(0, 0, 0, 0.85);
            color: #ff3333;
            font-size: 32px;
            font-weight: bold;
            text-align: center;
            padding: 32px 48px;
            border: 4px solid #ff3333;
            border-radius: 16px;
            box-shadow: 0 0 50px rgba(255, 51, 51, 0.4);
            pointer-events: none;
            z-index: 10;
            max-width: 80%;
            line-height: 1.4;
        }
        .expired img {
            opacity: 0.2;
            border-color: #ff3333;
        }
        .expired #expired-overlay {
            display: block;
        }
    </style>
</head>
<body>
    <img id="qr-img" src="${qrSrc}" alt="Zalo QR Code">
    <div id="expired-overlay">MÃ QR ĐÃ HẾT HẠN<br><span style="font-size: 22px; font-weight: normal; color: #ffffff;">Đang tự động tải lại mã mới...</span></div>
    <div id="sr-announcement" aria-live="assertive" role="alert" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(1px, 1px, 1px, 1px);"></div>
    
    <script>
        const qrImg = document.getElementById('qr-img');
        const container = document.body;
        const srAnnounce = document.getElementById('sr-announcement');
        let hasAnnouncedExpired = false;
        let failCount = 0;
        
        const handleLoginSuccess = () => {
            srAnnounce.textContent = "Đăng nhập thành công! Đang tự đóng tab.";
            setTimeout(() => {
                window.open('', '_self', '');
                window.close();
                document.body.innerHTML = '<div style="color: #00ff00; font-size: 32px; font-weight: bold; text-align: center; max-width: 80%; line-height: 1.4;">ĐĂNG NHẬP THÀNH CÔNG!<br><span style="font-size: 20px; font-weight: normal; color: #ffffff;">Tab này sẽ tự động đóng. Bạn cũng có thể đóng nó thủ công.</span></div>';
            }, 300);
        };
        
        // Polling to keep the QR code always synchronized
        setInterval(async () => {
            try {
                const res = await fetch('/qr-data');
                const data = await res.json();
                failCount = 0;
                
                if (data.loggedIn) {
                    handleLoginSuccess();
                    return;
                }
                
                if (data.qrSrc && qrImg.src !== data.qrSrc) {
                    qrImg.src = data.qrSrc;
                    
                    // If it was expired and is now updated, announce success
                    if (hasAnnouncedExpired && !data.expired) {
                        srAnnounce.textContent = "";
                        setTimeout(() => {
                            srAnnounce.textContent = "Đã tải mã QR mới thành công.";
                        }, 50);
                        hasAnnouncedExpired = false;
                    }
                }
                
                if (data.expired) {
                    container.classList.add('expired');
                    container.classList.remove('reloading');
                    
                    if (!hasAnnouncedExpired) {
                        srAnnounce.textContent = "";
                        setTimeout(() => {
                            srAnnounce.textContent = "Mã QR đã hết hạn. Đang tự động tải lại mã mới...";
                        }, 50);
                        hasAnnouncedExpired = true;
                    }
                } else {
                    container.classList.remove('expired');
                }
            } catch (e) {
                failCount++;
                if (failCount >= 2) {
                    handleLoginSuccess();
                }
            }
        }, 800);
    </script>
</body>
</html>`;
            res.end(htmlContent);
        });
        
        qrServer.listen(0, '127.0.0.1', () => {
            state.qrServerPort = qrServer.address().port;
        });
    } catch (e) {
        // Silent catch
    }
}

function toggleFullscreenQR(liveRegion) {
    const { announce } = require("./accessibility.js");
    const { loc } = require("./utils.js");
    const { shell } = require('electron');
    
    const sourceQr = document.querySelector('.login-qr-page .qr-image, .login-qr-page .qr-image--none, .login-qr-page img[class*="qr-image"]');
    if (!sourceQr) {
        announce(loc("Không tìm thấy mã QR đăng nhập.", "QR code login not found."), liveRegion);
        return;
    }
    
    state.latestQrCode = sourceQr.src;
    
    if (!state.qrServerPort) {
        startQrServer();
    }
    
    const openBrowser = () => {
        if (state.qrServerPort) {
            shell.openExternal(`http://127.0.0.1:${state.qrServerPort}/`);
            announce(loc(
                "Đã mở mã QR trong trình duyệt web của bạn.",
                "Opened QR code in your web browser."
            ), liveRegion);
        } else {
            announce(loc("Lỗi khi mở trình duyệt.", "Error opening browser."), liveRegion);
        }
    };
    
    if (state.qrServerPort) {
        openBrowser();
    } else {
        setTimeout(openBrowser, 100);
    }
}

function findRetryBtn(modal, closeBtn) {
    if (!modal) return null;
    
    // 1. Look for elements containing the exact words "thử lại" or "retry"
    const allElements = Array.from(modal.querySelectorAll('*'));
    
    // First pass: exact match on trimmed lowercase text
    for (const el of allElements) {
        if (closeBtn && (el === closeBtn || closeBtn.contains(el))) continue;
        const text = (el.textContent || el.innerText || "").trim().toLowerCase();
        if (text === "thử lại" || text === "retry" || text === "thử lại ngay" || text === "retry now") {
            const parent = el.closest('button, [role="button"], [class*="btn"], [class*="button"], .z--btn--v2');
            return parent || el;
        }
    }
    
    // Second pass: looser match for buttons containing "thử lại" or "retry"
    for (const el of allElements) {
        if (closeBtn && (el === closeBtn || closeBtn.contains(el))) continue;
        const text = (el.textContent || el.innerText || "").trim().toLowerCase();
        if (text.length < 30 && (text.includes("thử lại") || text.includes("retry"))) {
            const parent = el.closest('button, [role="button"], [class*="btn"], [class*="button"], .z--btn--v2');
            return parent || el;
        }
    }

    // Third pass: check attributes (data-translate-inner, data-id, title, class)
    for (const el of allElements) {
        if (closeBtn && (el === closeBtn || closeBtn.contains(el))) continue;
        const attrs = ['data-translate-inner', 'data-id', 'title', 'class'];
        for (const attr of attrs) {
            const val = (el.getAttribute(attr) || "").toLowerCase();
            if (val.includes("retry") || val.includes("thulai") || val.includes("thu_lai")) {
                const parent = el.closest('button, [role="button"], [class*="btn"], [class*="button"], .z--btn--v2');
                return parent || el;
            }
        }
    }
    
    // Fourth pass: select by class name/structure
    let btn = modal.querySelector('.z--btn--v2:not(.close-btn)');
    if (btn) return btn;
    
    const els = Array.from(modal.querySelectorAll('button, [role="button"], [data-id], [class*="btn"], [class*="button"]'));
    return els.find(el => {
        return closeBtn ? (el !== closeBtn && !closeBtn.contains(el) && !el.classList.contains('close-btn')) : !el.classList.contains('close-btn');
    });
}

function restartZalo() {
    try {
        // Set the localStorage flag so Zablind announces the successful restart on launch
        localStorage.setItem('zablind_just_restarted', 'true');
    } catch (e) {}

    try {
        // Spawn a fresh, detached Zalo process immediately
        const { spawn } = require('child_process');
        spawn(process.execPath, [], {
            detached: true,
            stdio: 'ignore'
        }).unref();
    } catch (e) {}

    try {
        // Force-kill the Zalo parent main process instantly via SIGKILL (under 10ms!)
        process.kill(process.ppid, 'SIGKILL');
    } catch (e) {}

    try {
        // Exit the current renderer immediately
        process.exit(0);
    } catch (e) {}
}

async function signOut(liveRegion) {
    setFocusContext("logout_modal");
    const { announce } = require("./accessibility.js");
    const { sleep, loc } = require("./utils.js");
    const { SELECTORS } = require("./constants.js");

    // Save the pre-modal focus state so we can restore it when closed
    previousActiveElement = document.activeElement;
    previousFocusContext = state.focusContext;

    // Stealth style: hide the user popup menu, but NOT the confirmation modal
    const hideStyle = document.createElement("style");
    hideStyle.id = "zablind-signout-hide";
    hideStyle.textContent = "body.zablind-toggling .popover-v3, body.zablind-toggling .zmenu-body { opacity: 0 !important; pointer-events: none !important; }";
    document.head.appendChild(hideStyle);
    document.body.classList.add("zablind-toggling");

    try {
        // Step 1: Click the user avatar to open the user menu popup (hidden)
        const avatarBtn = document.querySelector(SELECTORS.userAvatarBtn);
        if (!avatarBtn) {
            announce(loc("Không tìm thấy nút người dùng", "User button not found"), liveRegion);
            return;
        }
        fireClick(avatarBtn);
        await sleep(400);

        // Step 2: Find and click the logout item (still hidden)
        const logoutEl = document.querySelector(SELECTORS.logoutItem);
        if (!logoutEl) {
            announce(loc("Không tìm thấy nút đăng xuất", "Sign out button not found"), liveRegion);
            document.body.click();
            return;
        }
        const logoutItem = logoutEl.closest('.zmenu-item') || logoutEl;
        fireClick(logoutItem);
    } finally {
        // Remove stealth BEFORE modal appears so the modal is visible
        document.body.classList.remove("zablind-toggling");
        hideStyle.remove();
    }

    // Step 3: Wait reliably for the confirmation modal to appear (up to 2 seconds)
    let modal = null;
    for (let i = 0; i < 20; i++) {
        await sleep(100);
        modal = document.querySelector('.zl-modal__dialog');
        if (modal) break;
    }
    if (!modal) return;

    // Inject the custom "Khởi động lại Zalo" button next to the "Đăng xuất" button
    try {
        const btnContainer = modal.querySelector('.zl-modal__footer__button-action .flx');
        if (btnContainer && !modal.querySelector('[data-id="btn_Logout_Restart"]')) {
            // Apply responsive wrapping and elegant spacing to the flex container
            btnContainer.style.flexWrap = "wrap";
            btnContainer.style.justifyContent = "flex-end";
            btnContainer.style.gap = "8px";
            btnContainer.style.rowGap = "12px";
            
            const restartBtn = document.createElement("div");
            restartBtn.setAttribute("data-id", "btn_Logout_Restart");
            restartBtn.setAttribute("class", "z--btn--v2 btn-neutral large zl-modal__footer__button --rounded zl-modal__footer__button");
            restartBtn.setAttribute("tabindex", "0");
            restartBtn.style.margin = "0"; // Let flex gap handle spacing cleanly
            restartBtn.style.minWidth = "max-content";
            restartBtn.style.flex = "1 1 auto"; // Grow to fill space cleanly if wrapped
            
            const label = document.createElement("div");
            label.setAttribute("class", "truncate");
            label.innerText = loc("Khởi động lại Zalo", "Restart Zalo");
            restartBtn.appendChild(label);
            
            restartBtn.addEventListener("click", () => {
                setFocusContext("conversations");
                restartZalo();
            });
            
            btnContainer.appendChild(restartBtn);
        }
    } catch (e) {}

    // TRAP VIRTUAL CURSOR: Tell NVDA this is a true modal dialog
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("tabindex", "-1");

    // Step 4: Read the modal content to user
    const titleEl = modal.querySelector('.zl-modal__dialog__header__title-text');
    const bodyEl = modal.querySelector('.zl-modal__dialog-body .content span');
    const title = titleEl ? titleEl.innerText.trim() : "";
    const body = bodyEl ? bodyEl.innerText.trim() : "";

    // Step 5: Focus the modal so NVDA enters it
    modal.focus();
    await sleep(50);

    // Step 6: Move to checkbox and announce
    const checkbox = modal.querySelector('.z-checkbox');
    const cancelBtn = modal.querySelector('[data-id="btn_Logout_No"]');
    const confirmBtn = modal.querySelector('[data-id="btn_Logout_Logout"]');

    if (checkbox) {
        // Force the checkbox to be unchecked if checked by default.
        // We poll multiple times over 400ms to override any asynchronous React state restoring from localStorage/DB.
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                const isChecked = checkbox.getAttribute('data-id') !== 'false';
                if (isChecked) {
                    fireClick(checkbox);
                }
            } catch (e) {}
            await sleep(100);
        }

        checkbox.setAttribute("tabindex", "0");
        checkbox.focus();
        const checkLabel = checkbox.querySelector('[data-translate-inner]');
        const checked = checkbox.getAttribute('data-id') !== 'false';
        const cbText = `${checkLabel ? checkLabel.innerText.trim() : ''}, ${checked ? loc('đã chọn', 'checked') : loc('chưa chọn', 'unchecked')}`;
        announce(`${title}. ${body}. ${cbText}`, liveRegion);
    } else {
        announce(`${title}. ${body}`, liveRegion);
        if (cancelBtn) {
            cancelBtn.setAttribute("tabindex", "0");
            cancelBtn.focus();
        }
    }

    setFocusContext("logout_modal");
}

function openAddFriendModal(liveRegion) {
    const addFriendBtn = document.querySelector('[data-id="btn_Main_AddFrd"]');
    if (!addFriendBtn) {
        announce(loc("Không tìm thấy nút Thêm bạn", "Add friend button not found"), liveRegion);
        return;
    }
    
    // Click the button naturally — DO NOT lock context before clicking,
    // as that interferes with the mousedown event flow Zalo expects.
    addFriendBtn.click();
    
    // Lock context and focus input once the dialog DOM appears
    const checkForDialog = (attempts) => {
        if (attempts <= 0) return;
        const modal = document.getElementById('FIND_FRIEND') || document.querySelector('#FIND_FRIEND, .zl-modal__dialog:not([data-id="btn_Logout_No"])');
        if (modal) {
            setFocusContext("find_friend_modal");
            const { announce: ann } = require('./accessibility.js');
            ann(loc("Hộp thoại Thêm bạn đã mở", "Add friend dialog opened"), liveRegion);
            const phoneInput = document.querySelector('[data-id="txt_Main_AddFrd_Phone"], .phone-i-input');
            if (phoneInput) phoneInput.focus();
        } else {
            setTimeout(() => checkForDialog(attempts - 1), 200);
        }
    };
    setTimeout(() => checkForDialog(5), 300);
}


async function toggleLanguage(liveRegion) {
    const { announce } = require("./accessibility.js");
    const { sleep, detectLanguage, loc } = require("./utils.js");
    const { simulateHover } = require("./utils.js");
    
    const currentLang = detectLanguage();
    const isVietnamese = currentLang === "vi";
    
    // Inject a style to hide popups ONLY during programmatic toggle
    const hideStyle = document.createElement("style");
    hideStyle.id = "zablind-lang-hide";
    hideStyle.textContent = "body.zablind-toggling .popover-v3, body.zablind-toggling .zmenu-body { opacity: 0 !important; pointer-events: none !important; }";
    document.head.appendChild(hideStyle);
    document.body.classList.add("zablind-toggling");
    
    try {
        // Step 1: Click the settings tab in the left sidebar
        const settingsBtn = document.querySelector('[data-id="div_Main_TabSetting"]');
        
        if (!settingsBtn) {
            announce(loc("Không tìm thấy nút cài đặt", "Settings button not found"), liveRegion);
            return;
        }
        
        fireClick(settingsBtn);
        await sleep(400);
        
        // Step 2: Find and hover the Language submenu using data-id
        let langMenuItem = document.querySelector('[data-id="div_TabSetting_Language"]');
        
        if (!langMenuItem) {
            const items = Array.from(document.querySelectorAll('.zmenu-item'));
            langMenuItem = items.find(el => {
                const span = el.querySelector('[data-translate-inner="STR_MENU_LANGUAGE"]');
                return span || el.innerText.includes("Ngôn ngữ") || el.innerText.includes("Language");
            });
        }
        
        if (!langMenuItem) {
            announce(loc("Không tìm thấy menu ngôn ngữ", "Language menu not found"), liveRegion);
            document.body.click();
            return;
        }
        
        // Hover to open submenu
        simulateHover(langMenuItem);
        langMenuItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        langMenuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await sleep(400);
        
        // Step 3: Click the target language
        const targetId = isVietnamese ? "div_Lang_EN" : "div_Lang_VIE";
        const targetBtn = document.querySelector(`[data-id="${targetId}"]`);
        if (targetBtn) {
            fireClick(targetBtn);
            
            // Wait briefly for Zalo's massive React re-render to settle
            await sleep(500);
            
            // Announce after the dust settles. Pass null so it creates a fresh live region.
            announce(isVietnamese ? "Switched to English" : "Đã chuyển sang Tiếng Việt", null);
        } else {
            announce(loc("Không tìm thấy tùy chọn ngôn ngữ", "Language option not found"), liveRegion);
            
            // Close menu
            await sleep(200);
            document.body.click();
        }
    } finally {
        // Clean up
        document.body.classList.remove("zablind-toggling");
        hideStyle.remove();
    }
}

function fireClick(btn) {
    if (!btn) return;
    
    const target = btn;
    
    try {
        let rect = target.getBoundingClientRect();
        let currentTarget = target;
        while ((rect.width === 0 || rect.height === 0 || (rect.left === 0 && rect.top === 0)) && currentTarget.parentElement) {
            currentTarget = currentTarget.parentElement;
            rect = currentTarget.getBoundingClientRect();
        }
        let x = Math.floor(rect.left + (rect.width / 2));
        let y = Math.floor(rect.top + (rect.height / 2));
        
        if (x === 0 && y === 0) {
            x = window.innerWidth / 2;
            y = window.innerHeight / 2;
        }
        
        const opts = { 
            bubbles: true, 
            cancelable: true, 
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            detail: 1,
            pointerId: 1
        };
        
        target.dispatchEvent(new MouseEvent("mousedown", opts));
        target.dispatchEvent(new MouseEvent("mouseup", opts));
        target.dispatchEvent(new MouseEvent("click", opts));
        if (typeof target.click === "function") {
            target.click();
        }
    } catch(e) {}
};

async function syncData(liveRegion) {
    setFocusContext("sync_modal");
    const { announce } = require("./accessibility.js");
    const { sleep, loc } = require("./utils.js");
    const { simulateHover } = require("./utils.js");
    
    try {
        // Step 1: Click the settings button to open the settings popover menu
        const settingsBtn = document.querySelector('[data-id="div_Main_TabSetting"]');
        if (!settingsBtn) {
            announce(loc("Không tìm thấy nút cài đặt", "Settings button not found"), liveRegion);
            return;
        }
        
        fireClick(settingsBtn);
        await sleep(400);
        
        // Step 2: Find the "Dữ liệu" (STR_DATA) submenu trigger
        // Menu path: Settings → Dữ liệu → Đồng bộ và sao lưu (STR_SYNC_CONFIGURATION)
        let dataMenuItem = document.querySelector('[data-translate-inner="STR_DATA"]');
        if (dataMenuItem) dataMenuItem = dataMenuItem.closest('div-14, .zmenu-item') || dataMenuItem;
        
        if (!dataMenuItem) {
            const allItems = Array.from(document.querySelectorAll('div-14.zmenu-item, .zmenu-item'));
            dataMenuItem = allItems.find(el => {
                const span = el.querySelector('[data-translate-inner="STR_DATA"]');
                const txt = (el.innerText || '').trim().toLowerCase();
                return span || txt === 'dữ liệu' || txt === 'data';
            });
        }
        
        if (!dataMenuItem) {
            announce(loc("Không tìm thấy menu Dữ liệu", "Data menu not found"), liveRegion);
            await sleep(200);
            document.body.click();
            return;
        }
        
        // Step 3: Hover the "Dữ liệu" item — same as toggleLanguage hovers the Language item
        simulateHover(dataMenuItem);
        dataMenuItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        dataMenuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await sleep(400);
        
        // Step 4: Find "Đồng bộ và sao lưu" (STR_SYNC_CONFIGURATION) WITHIN the Dữ liệu submenu
        const syncSpan = dataMenuItem.querySelector('[data-translate-inner="STR_SYNC_CONFIGURATION"]');
        const syncBtn = syncSpan ? (syncSpan.closest('div-14, .zmenu-item') || syncSpan) : null;
        
        if (!syncBtn || !syncSpan) {
            announce(loc("Không tìm thấy tùy chọn Đồng bộ và sao lưu", "Sync and backup option not found"), liveRegion);
            await sleep(200);
            document.body.click();
            return;
        }

        // Step 5: Click the button directly, exactly like toggleLanguage does for the language buttons.
        // Since JS hover/mouseover events do not trigger CSS :hover, the submenu is hidden.
        // We temporarily force all ancestors between the button and the parent menu item to be visible
        // so the browser computes real, non-zero coordinates for syncBtn.
        const forcedElements = [];
        let curr = syncBtn.parentElement;
        while (curr && curr !== dataMenuItem) {
            const origDisplay = curr.style.display;
            const origOpacity = curr.style.opacity;
            const origVisibility = curr.style.visibility;
            
            curr.style.setProperty('display', 'block', 'important');
            curr.style.setProperty('opacity', '1', 'important');
            curr.style.setProperty('visibility', 'visible', 'important');
            
            forcedElements.push({
                el: curr,
                display: origDisplay,
                opacity: origOpacity,
                visibility: origVisibility
            });
            
            curr = curr.parentElement;
        }
        
        try {
            // fireClick will get the correct screen coordinates of syncBtn and dispatch events.
            fireClick(syncBtn);
        } finally {
            // Restore original styles
            for (const item of forcedElements) {
                if (item.display !== undefined && item.display !== "") {
                    item.el.style.setProperty('display', item.display);
                } else {
                    item.el.style.removeProperty('display');
                }
                
                if (item.opacity !== undefined && item.opacity !== "") {
                    item.el.style.setProperty('opacity', item.opacity);
                } else {
                    item.el.style.removeProperty('opacity');
                }
                
                if (item.visibility !== undefined && item.visibility !== "") {
                    item.el.style.setProperty('visibility', item.visibility);
                } else {
                    item.el.style.removeProperty('visibility');
                }
            }
        }
        
        // Step 6: Zalo's UI update requires clicking the sync card in the middle popup
        // or falling back to the old "Đồng bộ ngay" (Sync Now) button.
        let clicked = false;
        for (let i = 0; i < 20; i++) {
            await sleep(100);
            
            // Check for the middle popup card
            const syncCard = document.querySelector('.sync-msg-setting-popup__card.clickable') || 
                             document.querySelector('[data-translate-inner="STR_PROFILE_SYNC_MESSAGES"]')?.closest('.clickable');
            if (syncCard) {
                fireClick(syncCard);
                clicked = true;
                break;
            }
            
            // Fallback to old "Đồng bộ ngay" button
            const span = document.querySelector('[data-translate-inner="STR_SYNC_DB_MSG_SYNC_NOW"]');
            if (span) {
                const syncNowBtn = span.closest('.z--btn--v2, button, div') || span;
                fireClick(syncNowBtn);
                clicked = true;
                break;
            }
        }
        
        // Wait for the sync dialog/modal to appear (up to 2 seconds)
        let syncModal = null;
        for (let i = 0; i < 20; i++) {
            await sleep(100);
            syncModal = document.querySelector('.count-down-screen');
            if (syncModal) break;
        }
        
        if (syncModal) {
            setFocusContext("sync_modal");
            
            const titleEl = syncModal.querySelector('.title');
            const descEl = syncModal.querySelector('.desc');
            const titleText = titleEl ? titleEl.innerText.trim() : "";
            const descText = descEl ? descEl.innerText.trim() : "";
            
            announce(`${titleText}. ${descText}`, liveRegion);
            
            const closeBtn = syncModal.querySelector('.close-btn');
            const retryBtn = findRetryBtn(syncModal, closeBtn);
            
            if (closeBtn) {
                closeBtn.setAttribute("tabindex", "0");
                closeBtn.focus();
            }
            if (retryBtn) {
                retryBtn.setAttribute("tabindex", "0");
            }

            // Close the settings/middle dialog if it is still open
            try {
                const dialogs = Array.from(document.querySelectorAll('.zl-modal__dialog'));
                for (const dlg of dialogs) {
                    if (dlg.querySelector('.sync-msg-setting-popup__wrapper, .sync-msg-setting-popup')) {
                        const settingsCloseBtn = dlg.querySelector('.modal-header-icon:not(.zl-modal__dialog__back), [icon="close f16"], .fa-close, .close-btn');
                        if (settingsCloseBtn) {
                            fireClick(settingsCloseBtn);
                        }
                    }
                }
            } catch (e) {}
        }
    } finally {
        // Nothing to clean up — no hide style injected
    }
}


function queryInteractiveElements(modal) {
    const items = [];
    
    // 1. Back button (in header)
    const backBtn = modal.querySelector('.zl-modal__dialog__back, [icon="icon-solid-left"]');
    if (backBtn && backBtn.offsetWidth > 0) items.push(backBtn);
    
    // 2. Close button (in header)
    const closeBtn = modal.querySelector('.modal-header-icon:not(.zl-modal__dialog__back), [icon="close f16"]');
    if (closeBtn && closeBtn.offsetWidth > 0) items.push(closeBtn);
    
    // 3. Phone input (in search page)
    const phoneInput = modal.querySelector('.phone-i-input, [data-id="txt_Main_AddFrd_Phone"]');
    if (phoneInput && phoneInput.offsetWidth > 0) items.push(phoneInput);
    
    // Recent searched contacts (in search page)
    try {
        const recentItems = modal.querySelectorAll('#findFriend .rs-item, #findFriend [class*="rs-item"], #findFriend .recent-search-item, #findFriend .clickable-item, #findFriend [class*="recent-search"]');
        recentItems.forEach(el => {
            if (el && el.offsetWidth > 0 && !el.classList.contains('rs-empty')) {
                const container = el.closest('.rs-item, .recent-search-item, .clickable-item, [class*="recent-search-item"]') || el;
                const clickable = container.closest('.clickable, button, [role="button"]') || container;
                if (!items.includes(clickable)) {
                    items.push(clickable);
                }
            }
        });
    } catch (e) {}
    
    // 4. Contact Name element (for reading account name in card pages)
    const nameEl = modal.querySelector('.pi-mini-info-section__name .truncate, .pi-mini-info-section__name [title]');
    if (nameEl && nameEl.offsetWidth > 0) items.push(nameEl);
    
    // 5. Unblock banner button (if present on blocked profile)
    const bannerUnblockBtn = modal.querySelector('.friend-profile__block-friend');
    if (bannerUnblockBtn && bannerUnblockBtn.offsetWidth > 0) {
        const clickable = bannerUnblockBtn.closest('.clickable, button, [role="button"]') || bannerUnblockBtn;
        if (!items.includes(clickable)) {
            items.push(clickable);
        }
    }
    
    // 6. Textarea greeting message (in add friend screen)
    const textarea = modal.querySelector('textarea.friend-profile__addfriend__msg, [data-id="txt_AddFrd_Msg"]');
    if (textarea && textarea.offsetWidth > 0) items.push(textarea);
    
    // 7. Toggle "Chặn người này xem nhật ký..." (in add friend screen)
    const toggle = modal.querySelector('.friend-profile__block-stories, .z-toggle');
    if (toggle && toggle.offsetWidth > 0) items.push(toggle);
    
    // 8. Add friend / Undo request button (in card page)
    const addFrdBtn = modal.querySelector('[data-translate-inner="STR_PROFILE_ADD_FRIEND"], [data-translate-inner="STR_UNDO_REQUEST"], [data-translate-inner="STR_REMOVE_FRIEND"]')?.closest('.z--btn--v2') || modal.querySelector('[aria-label="Kết bạn"]')?.closest('.z--btn--v2');
    if (addFrdBtn && addFrdBtn.offsetWidth > 0) items.push(addFrdBtn);
    
    // 9. Chat button (in card page)
    const chatBtn = modal.querySelector('[data-translate-inner="STR_CHAT"]')?.closest('.z--btn--v2') || modal.querySelector('[aria-label="Nhắn tin"]')?.closest('.z--btn--v2');
    if (chatBtn && chatBtn.offsetWidth > 0) items.push(chatBtn);
    
    // 10. Mutual groups item
    const mutualBtn = modal.querySelector('[data-translate-inner="STR_PROFILE_GROUP_MUTUAL"]')?.closest('.pi-action-item');
    if (mutualBtn && mutualBtn.offsetWidth > 0 && !mutualBtn.classList.contains('pi-action-item_disabled')) items.push(mutualBtn);
    
    
    // 12. Block / Unblock item
    const blockBtn = modal.querySelector('[data-id="btn_UserProfile_Unblock"], [data-id="btn_UserProfile_Block"], .pi-action-item [data-translate-inner="STR_BLOCK_MSG_CALL"], .pi-action-item [data-translate-inner="STR_UNBLOCK"]')?.closest('.pi-action-item');
    if (blockBtn && blockBtn.offsetWidth > 0 && !blockBtn.classList.contains('pi-action-item_disabled')) items.push(blockBtn);
    

    
    // 14. Search page footer buttons: Cancel & Search
    const cancelBtn = modal.querySelector('[data-id="btn_Main_AddFrd_CXL"]');
    if (cancelBtn && cancelBtn.offsetWidth > 0) items.push(cancelBtn);
    
    const searchBtn = modal.querySelector('[data-id="btn_Main_AddFrd_Search"]');
    if (searchBtn && searchBtn.offsetWidth > 0) items.push(searchBtn);
    
    // 15. Add Friend footer buttons: "Thông tin" & "Kết bạn"
    const addInfoBtn = modal.querySelector('[data-id="btn_AddFrd_Info"]');
    if (addInfoBtn && addInfoBtn.offsetWidth > 0) items.push(addInfoBtn);
    
    const addAddBtn = modal.querySelector('[data-id="btn_AddFrd_Add"]');
    if (addAddBtn && addAddBtn.offsetWidth > 0) items.push(addAddBtn);
    
    return items;
}

function announceElement(el, liveRegion) {
    if (!el) return;
    
    // 1. Contact Name element
    if (el.classList.contains('truncate') && el.closest('.pi-mini-info-section__name')) {
        announce(`${loc("Tên tài khoản", "Account name")}: ${el.innerText.trim()}`, liveRegion);
        return;
    }
    
    // Blocked Profile Unblock Banner warning + button
    if (el.classList.contains('friend-profile__block-friend') || el.closest('.friend-profile__block-friend')) {
        const text = el.innerText.replace(/\n/g, ". ").trim();
        announce(`${text}, ${loc("Nút", "Button")}`, liveRegion);
        return;
    }
    
    // Recent search clear button announcement
    const rsItemForClear = el.closest('#findFriend .rs-item, #findFriend [class*="rs-item"], #findFriend .recent-search-item, #findFriend [class*="recent-search"]');
    if (rsItemForClear && (el.classList.contains('fa-close') || el.querySelector('.fa-close') || el.querySelector('i[class*="close"]') || el.querySelector('i[class*="delete"]') || el.getAttribute('icon')?.includes('close') || el.getAttribute('data-id')?.includes('clear') || el.getAttribute('data-id')?.includes('delete') || el.closest('[icon*="close"]'))) {
        const nameEl = rsItemForClear.querySelector('.name, .title, .truncate, span');
        const nameText = nameEl ? nameEl.innerText.trim() : "";
        announce(`${loc("Xóa tìm kiếm gần đây", "Clear recent search")}: ${nameText}, ${loc("Nút", "Button")}`, liveRegion);
        return;
    }
    
    // Recent search item announcement
    if (el.classList.contains('rs-item') || el.closest('[class*="rs-item"]') || el.closest('[class*="recent-search"]')) {
        const nameEl = el.querySelector('.name, .title, .truncate, span');
        const nameText = nameEl ? nameEl.innerText.trim() : el.innerText.trim();
        announce(`${loc("Tìm kiếm gần đây", "Recent search")}: ${nameText}, ${loc("Nút", "Button")}`, liveRegion);
        return;
    }
    
    // 2. Input element
    if (el.tagName === 'INPUT' || el.classList.contains('phone-i-input')) {
        const placeholder = el.getAttribute('placeholder') || loc("Số điện thoại", "Phone number");
        announce(`${placeholder}, ${loc("ô nhập chữ, có thể gõ nội dung", "text input, edit box")}`, liveRegion);
        return;
    }
    
    // 3. Textarea greeting
    if (el.tagName === 'TEXTAREA' || el.classList.contains('friend-profile__addfriend__msg')) {
        announce(`${loc("Nhập lời chào", "Enter greeting")}, ${loc("ô nhập chữ nhiều dòng, có thể gõ nội dung", "multi-line text input, edit box")}`, liveRegion);
        return;
    }
    
    // 4. Toggle block stories
    if (el.classList.contains('friend-profile__block-stories') || el.classList.contains('z-toggle')) {
        const uncheckedIcon = el.querySelector('.fa-toggle-unchecked-24');
        const isToggled = !uncheckedIcon;
        const text = el.innerText.trim() || loc("Chặn xem nhật ký", "Block stories");
        announce(`${text}, ${isToggled ? loc("đang bật", "enabled") : loc("đang tắt", "disabled")}`, liveRegion);
        return;
    }
    
    // 5. Back button
    if (el.classList.contains('zl-modal__dialog__back') || el.querySelector('.fa-icon-solid-left')) {
        announce(loc("Quay lại, Nút", "Back, Button"), liveRegion);
        return;
    }
    
    // 6. Close button
    if (el.classList.contains('modal-header-icon') || el.querySelector('.fa-close')) {
        announce(loc("Đóng, Nút", "Close, Button"), liveRegion);
        return;
    }
    
    // 7. General BEM / Custom buttons (like Cancel, Search, Add Friend, Chat, etc.)
    const labelEl = el.querySelector('[data-translate-inner], .truncate, .pi-action-item__title, span');
    const textLabel = labelEl ? labelEl.innerText.trim() : el.innerText.trim();
    if (textLabel) {
        announce(`${textLabel}, ${loc("Nút", "Button")}`, liveRegion);
    } else {
        announce(loc("Nút hành động", "Action button"), liveRegion);
    }
}
