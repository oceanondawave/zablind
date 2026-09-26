// ======================
// Menu Management
// ======================

const { HIGHLIGHT_CLASS, ALLOWED_MENU_KEYS, SELECTORS } = require("./constants.js");
const { state, updateMenuState, resetMenuState } = require("./state.js");
const { simulateHover, sleep, loc } = require("./utils.js");

async function getAllowedMenuItems(timeout = 1000, isAttachment = false) {
  const start = Date.now();
  let popup = null;

  while (!popup && Date.now() - start < timeout) {
    popup = document.querySelector(SELECTORS.menuPopup);
    if (popup) break;
    await sleep(30);
  }

  if (!popup) return [];

  let items = [];
  while (items.length === 0 && Date.now() - start < timeout) {
    items = Array.from(popup.querySelectorAll(SELECTORS.menuItems));
    if (items.length > 0) break;
    await sleep(30);
  }

  popup.setAttribute("role", "menu");

  return items.filter((item) => {
    if (isAttachment) {
      item.setAttribute("role", "menuitem");
      item.tabIndex = 0;
      item.setAttribute("aria-hidden", "false");
      return true;
    }

    const key =
      item
        .querySelector("span[data-translate-inner]")
        ?.dataset.translateInner?.trim() || "";
    const isAllowed =
      ALLOWED_MENU_KEYS.has(key) ||
      /^Lưu\s+\d+(\s+ảnh\/video)?\s+về máy$/i.test(key) ||
      /^Download\s+\d+\s+(photos?|videos?|photos\/videos)$/i.test(key);

    item.setAttribute("role", isAllowed ? "menuitem" : "");
    item.tabIndex = isAllowed ? 0 : -1;
    item.setAttribute("aria-hidden", isAllowed ? "false" : "true");

    return isAllowed;
  });
}

function highlightMenuItem(index, liveRegion) {
  const { announce } = require("./accessibility.js");
  state.menu.items.forEach((item, i) => {
    item.classList.toggle(HIGHLIGHT_CLASS, i === index);
    if (i === index) {
      // If item is inside .zmenu-sub, ensure parent .zmenu-sub is visible
      const parentSub = item.closest('.zmenu-sub');
      if (parentSub) {
        parentSub.style.display = 'block';
        parentSub.style.opacity = '1';
        parentSub.style.visibility = 'visible';
        const parentMute = parentSub.closest('.zmenu-item');
        if (parentMute) simulateHover(parentMute);
      }
      // If item has a child .zmenu-sub (like mute item), keep it ready
      const childSub = item.querySelector('.zmenu-sub');
      if (childSub) {
        childSub.style.display = 'block';
        childSub.style.opacity = '1';
        childSub.style.visibility = 'visible';
      }

      simulateHover(item);
      item.focus();
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });

      const customLabel = item.getAttribute("data-zablind-label");
      const label = customLabel || item.innerText.replace(/\s+/g, " ").trim();
      if (liveRegion && label) {
        announce(label, liveRegion);
      }
    }
  });
}

function handleMenuNavigation(event, liveRegion) {
  const { announce } = require("./accessibility.js");
  
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.menu.currentIndex =
      (state.menu.currentIndex + 1) % state.menu.items.length;
    highlightMenuItem(state.menu.currentIndex, liveRegion);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.menu.currentIndex =
      (state.menu.currentIndex - 1 + state.menu.items.length) %
      state.menu.items.length;
    highlightMenuItem(state.menu.currentIndex, liveRegion);
    return;
  }

  if (event.key === "ArrowRight") {
    const currentItem = state.menu.items[state.menu.currentIndex];
    const subContainer = currentItem?.querySelector('.zmenu-sub, .sub-menu');
    const subItems = subContainer ? Array.from(subContainer.querySelectorAll('.zmenu-item, div-14.zmenu-item')) : [];
    if (subItems.length > 0) {
      event.preventDefault();
      state.menu.parentItems = state.menu.items;
      state.menu.parentIndex = state.menu.currentIndex;
      state.menu.items = subItems;
      state.menu.currentIndex = 0;
      subItems.forEach((sub, idx) => {
        sub.setAttribute("role", "menuitem");
        sub.tabIndex = idx === 0 ? 0 : -1;
        sub.style.display = '';
        sub.style.pointerEvents = 'auto';
      });
      highlightMenuItem(0, liveRegion);
      return;
    }
  }

  if (event.key === "ArrowLeft") {
    if (state.menu.parentItems && state.menu.parentItems.length > 0) {
      event.preventDefault();
      state.menu.items = state.menu.parentItems;
      state.menu.currentIndex = state.menu.parentIndex || 0;
      state.menu.parentItems = null;
      highlightMenuItem(state.menu.currentIndex, liveRegion);
      return;
    }
  }

  if (event.key === "Enter" && state.menu.currentIndex !== -1) {
    const currentItem = state.menu.items[state.menu.currentIndex];
    const subContainer = currentItem?.querySelector('.zmenu-sub, .sub-menu');
    const subItems = subContainer ? Array.from(subContainer.querySelectorAll('.zmenu-item, div-14.zmenu-item')) : [];
    if (subItems.length > 0) {
      event.preventDefault();
      state.menu.parentItems = state.menu.items;
      state.menu.parentIndex = state.menu.currentIndex;
      state.menu.items = subItems;
      state.menu.currentIndex = 0;
      subItems.forEach((sub, idx) => {
        sub.setAttribute("role", "menuitem");
        sub.tabIndex = idx === 0 ? 0 : -1;
        sub.style.display = '';
        sub.style.pointerEvents = 'auto';
      });
      highlightMenuItem(0, liveRegion);
      return;
    }

    event.preventDefault();
    activateMenuItem(liveRegion);
    return;
  }

  if (event.key === "Escape") {
    if (state.menu.parentItems && state.menu.parentItems.length > 0) {
      event.preventDefault();
      state.menu.items = state.menu.parentItems;
      state.menu.currentIndex = state.menu.parentIndex || 0;
      state.menu.parentItems = null;
      highlightMenuItem(state.menu.currentIndex, liveRegion);
      return;
    }
    closeMenu(liveRegion);
    return;
  }
}

function activateMenuItem(liveRegion) {
  const item = state.menu.items[state.menu.currentIndex];
  if (!item) return;

  const customLabel = item.getAttribute("data-zablind-label");
  const label = customLabel || item.innerText.replace(/\s+/g, " ").trim();

  // Try React onClick handler first if available
  try {
    const key = Object.keys(item).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
    if (key && item[key]) {
      const props = item[key];
      if (typeof props.onClick === 'function') {
        props.onClick(new MouseEvent('click', { bubbles: true }));
      }
    }
  } catch (err) {}

  ["mousedown", "mouseup", "click"].forEach((evt) =>
    item.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
  );
  try { item.click(); } catch(e) {}

  const { announce } = require("./accessibility.js");
  if (liveRegion && label) {
    announce(loc(`Đã chọn: ${label}`, `Selected: ${label}`), liveRegion);
  }

  setTimeout(() => {
    resetMenuState();
    // Return focus to conversation or message
    if (state.focusContext === "conversations" || state.focusContext === "search_results") {
      const { updateConversationItems } = require("./conversations.js");
      updateConversationItems(state.focusContext === "search_results");
      let conv = state.conversations.map.get(state.conversations.currentId);
      if (!conv || !document.contains(conv)) {
        if (state.conversations.items.length > 0) {
          const nextId = state.conversations.items[0];
          state.conversations.currentId = nextId;
          conv = state.conversations.map.get(nextId);
        }
      }
      if (conv) conv.focus();
    } else if (state.focusContext === "messages") {
      const msg = state.messages.map.get(state.messages.currentId);
      if (msg) msg.focus();
    }
  }, 200);
}

function closeMenu(liveRegion) {
  const { announce } = require("./accessibility.js");
  const richInput = document.getElementById("richInput");
  const chatInput = document.getElementById("chatInput");

  if (richInput === document.activeElement) {
    const dummy = document.createElement("div");
    dummy.tabIndex = -1;
    document.body.appendChild(dummy);
    dummy.focus();

    setTimeout(() => {
      dummy.remove();
      richInput.blur();
      chatInput?.classList.remove("highlight-v3");
      richInput.tabIndex = 1;
    }, 10);
  }

  const popup = document.querySelector(SELECTORS.menuPopup);
  if (popup) {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    document.body.click();
  }

  if (state.focusContext === "conversations" || state.focusContext === "search_results") {
    const conv = state.conversations.map.get(state.conversations.currentId);
    if (conv) {
      conv.tabIndex = 0;
      conv.focus();
    }
  } else {
    const currentId = state.messages.currentId;
    const message = state.messages.map.get(currentId);
    if (message) {
      message.tabIndex = 0;
      message.focus();
    }
  }

  resetMenuState();
  announce(loc("Menu đã đóng", "Menu closed"), liveRegion);
}

async function openContextMenu(event, liveRegion) {
  const { announce } = require("./accessibility.js");
  const currentId = state.messages.currentId;
  const message = state.messages.map.get(currentId);
  
  let targetElement = message.querySelector(
    '[data-id="div_DisabledTargetEventLayer"]'
  );

  if (state.messages.linkFocused) {
    const linkEl = message.querySelector("a.text-is-link");
    if (linkEl) {
      targetElement = linkEl;
    }
  }

  if (!targetElement) {
    announce(loc("Không có nội dung tin nhắn.", "No message content."), liveRegion);
    return;
  }

  event.preventDefault();

  targetElement.style.pointerEvents = "auto";
  targetElement.setAttribute("tabindex", "0");
  targetElement.focus();

  const rect = targetElement.getBoundingClientRect();
  const clickX = rect.left + 10;
  const clickY = rect.top + 10;

  simulateHover(targetElement);

  await sleep(30);
  targetElement.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: clickX,
      clientY: clickY,
    })
  );

  const items = await getAllowedMenuItems();
  updateMenuState(items, items.length > 0 ? 0 : -1);

  if (items.length > 0) {
    await sleep(150);
    highlightMenuItem(0);
  } else {
    announce(loc("Không có mục chọn hợp lệ trong menu.", "No valid menu items."), liveRegion);
  }
}

async function openAttachmentMenu(event, liveRegion) {
  const { announce } = require("./accessibility.js");
  const attachmentBtn = document.querySelector(SELECTORS.attachmentBtn);

  if (!attachmentBtn) {
    announce(loc("Không có nút chọn tệp/thư mục.", "Attachment button not found."), liveRegion);
    return;
  }

  event.preventDefault();

  attachmentBtn.style.pointerEvents = "auto";
  attachmentBtn.setAttribute("tabindex", "0");
  attachmentBtn.focus();

  simulateHover(attachmentBtn);

  await sleep(30);
  attachmentBtn.click();
  await sleep(30);
  
  const items = await getAllowedMenuItems(1000, true);
  updateMenuState(items, items.length > 0 ? 0 : -1);
  
  if (items.length > 0) {
    await sleep(150);
    highlightMenuItem(0);
  } else {
    announce(loc("Không có mục chọn hợp lệ trong menu.", "No valid menu items."), liveRegion);
  }
}

async function openConversationContextMenu(event, liveRegion) {
  const { announce } = require("./accessibility.js");
  const { updateConversationItems } = require("./conversations.js");
  
  const isSearch = state.focusContext === "search_results";
  updateConversationItems(isSearch);

  let convItem = null;
  if (state.conversations.currentId) {
    convItem = state.conversations.map.get(state.conversations.currentId);
  }
  if (!convItem) {
    convItem = document.querySelector('.conv-item.selected') || document.querySelector('.conv-item');
  }

  if (!convItem) {
    announce(loc("Chưa chọn cuộc hội thoại nào.", "No conversation selected."), liveRegion);
    return;
  }

  if (event) {
    event.preventDefault();
  }

  convItem.focus();
  simulateHover(convItem);
  await sleep(40);

  const rect = convItem.getBoundingClientRect();
  const clickX = rect.left + 50;
  const clickY = rect.top + 20;

  // Try dispatching contextmenu event
  convItem.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: clickX,
      clientY: clickY,
    })
  );

  let popup = document.querySelector(SELECTORS.menuPopup);
  if (!popup) {
    await sleep(80);
    popup = document.querySelector(SELECTORS.menuPopup);
    if (!popup) {
      const moreBtn = convItem.querySelector('.conv-action__menu-v2, [icon="More_24_Line"], [data-translate-title="Thêm"]');
      if (moreBtn) {
        moreBtn.click();
      }
    }
  }

  const start = Date.now();
  while (!popup && Date.now() - start < 1000) {
    popup = document.querySelector(SELECTORS.menuPopup);
    if (popup) break;
    await sleep(30);
  }

  if (!popup) {
    announce(loc("Không mở được menu cho hội thoại.", "Could not open conversation menu."), liveRegion);
    return;
  }

  let rawItems = [];
  while (rawItems.length === 0 && Date.now() - start < 1000) {
    rawItems = Array.from(popup.querySelectorAll('.zmenu-item, [class*="zmenu-item"]'));
    if (rawItems.length > 0) break;
    await sleep(30);
  }

  popup.setAttribute("role", "menu");

  const allowedItems = [];

  // 1. Find Pin item ("Ghim hội thoại" or "Bỏ ghim hội thoại")
  const pinItem = rawItems.find(item => {
    const text = item.innerText.toLowerCase();
    return (text.includes("ghim") || text.includes("pin")) && !text.includes("phân loại");
  });

  // 2. Find Move Tab item ("Chuyển sang mục Khác" / "Chuyển sang mục Ưu tiên" / "Chuyển về mục Ưu tiên")
  const moveTabItem = rawItems.find(item => {
    const text = item.innerText.toLowerCase();
    return (text.includes("chuyển") && (text.includes("khác") || text.includes("ưu tiên"))) ||
           (text.includes("move") && (text.includes("other") || text.includes("focus") || text.includes("priority")));
  });

  // 3. Find Unmute item ("Bật thông báo")
  const unmuteItem = rawItems.find(item => {
    const text = item.innerText.toLowerCase();
    return text.includes("bật thông báo") || text.includes("unmute") || text.includes("turn on notification");
  });

  // 4. Find Mute item ("Tắt thông báo")
  const muteItem = rawItems.find(item => {
    const text = item.innerText.toLowerCase();
    return (text.includes("tắt thông báo") || text.includes("mute") || text.includes("turn off notification")) && !text.includes("bật");
  });

  if (pinItem) {
    pinItem.style.display = '';
    pinItem.setAttribute('role', 'menuitem');
    pinItem.tabIndex = 0;
    pinItem.setAttribute('aria-hidden', 'false');
    pinItem.style.pointerEvents = 'auto';
    const pinText = pinItem.innerText.replace(/\s+/g, ' ').trim();
    pinItem.setAttribute('data-zablind-label', pinText);
    allowedItems.push(pinItem);
  }

  if (moveTabItem) {
    moveTabItem.style.display = '';
    moveTabItem.setAttribute('role', 'menuitem');
    moveTabItem.tabIndex = allowedItems.length === 0 ? 0 : -1;
    moveTabItem.setAttribute('aria-hidden', 'false');
    moveTabItem.style.pointerEvents = 'auto';
    const moveText = moveTabItem.innerText.replace(/\s+/g, ' ').trim();
    moveTabItem.setAttribute('data-zablind-label', moveText);
    allowedItems.push(moveTabItem);
  }

  const notifItem = unmuteItem || muteItem;
  if (notifItem) {
    notifItem.style.display = '';
    notifItem.setAttribute('role', 'menuitem');
    notifItem.tabIndex = allowedItems.length === 0 ? 0 : -1;
    notifItem.setAttribute('aria-hidden', 'false');
    notifItem.style.pointerEvents = 'auto';

    if (notifItem === muteItem) {
      notifItem.setAttribute('data-zablind-label', loc("Tắt thông báo, menu con. Bấm Enter hoặc Mũi tên phải để chọn thời gian.", "Mute notifications, submenu. Press Enter or Right Arrow to choose duration."));

      // Ensure all sub-items inside .zmenu-sub are enabled and labeled
      const subItems = Array.from(muteItem.querySelectorAll('.zmenu-sub .zmenu-item, .sub-menu .zmenu-item, .zmenu-sub [class*="zmenu-item"], .sub-menu [class*="zmenu-item"]'));
      subItems.forEach((sub) => {
        sub.style.display = '';
        sub.setAttribute('role', 'menuitem');
        sub.tabIndex = -1;
        sub.setAttribute('aria-hidden', 'false');
        sub.style.pointerEvents = 'auto';
        const subText = sub.innerText.replace(/\s+/g, ' ').trim();
        sub.setAttribute('data-zablind-label', loc(`Tắt thông báo: ${subText}`, `Mute notifications: ${subText}`));
      });
    } else {
      notifItem.setAttribute('data-zablind-label', loc("Bật thông báo", "Turn on notifications"));
    }

    allowedItems.push(notifItem);
  }

  if (allowedItems.length > 0) {
    allowedItems[0].tabIndex = 0;
  }

  // Lock and hide all other children in popup
  const menuContainer = popup.querySelector('.zmenu-body > div > div') || popup.querySelector('.zmenu-body');
  const allChildren = Array.from(menuContainer ? menuContainer.children : popup.querySelectorAll('.zmenu-item, .zmenu-separator'));

  allChildren.forEach(child => {
    const isAllowed = allowedItems.some(allowed => allowed === child || child.contains(allowed));
    if (!isAllowed) {
      child.style.display = 'none';
      child.setAttribute('aria-hidden', 'true');
      child.style.pointerEvents = 'none';
      child.querySelectorAll('*').forEach(el => {
        el.tabIndex = -1;
        el.setAttribute('aria-hidden', 'true');
      });
    }
  });

  popup.querySelectorAll('.zmenu-separator').forEach(sep => {
    sep.style.display = 'none';
  });

  state.menu.parentItems = null;
  state.menu.parentIndex = 0;
  updateMenuState(allowedItems, allowedItems.length > 0 ? 0 : -1);

  if (allowedItems.length > 0) {
    await sleep(50);
    highlightMenuItem(0, liveRegion);
  } else {
    announce(loc("Không có lựa chọn hợp lệ trong menu.", "No valid options in menu."), liveRegion);
  }
}

module.exports = {
  getAllowedMenuItems,
  highlightMenuItem,
  handleMenuNavigation,
  activateMenuItem,
  closeMenu,
  openContextMenu,
  openAttachmentMenu,
  openConversationContextMenu,
};




