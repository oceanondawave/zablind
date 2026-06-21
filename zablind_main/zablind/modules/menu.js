// ======================
// Menu Management
// ======================

const { HIGHLIGHT_CLASS, ALLOWED_MENU_KEYS, SELECTORS } = require("./constants.js");
const { state, updateMenuState, resetMenuState } = require("./state.js");
const { simulateHover, sleep, loc } = require("./utils.js");

async function getAllowedMenuItems(timeout = 1000) {
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

function highlightMenuItem(index) {
  state.menu.items.forEach((item, i) => {
    item.classList.toggle(HIGHLIGHT_CLASS, i === index);
    if (i === index) {
      simulateHover(item);
      item.focus();
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

function handleMenuNavigation(event, liveRegion) {
  const { announce } = require("./accessibility.js");
  
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.menu.currentIndex =
      (state.menu.currentIndex + 1) % state.menu.items.length;
    highlightMenuItem(state.menu.currentIndex);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.menu.currentIndex =
      (state.menu.currentIndex - 1 + state.menu.items.length) %
      state.menu.items.length;
    highlightMenuItem(state.menu.currentIndex);
    return;
  }

  if (event.key === "Enter" && state.menu.currentIndex !== -1) {
    event.preventDefault();
    activateMenuItem();
    return;
  }

  if (event.key === "Escape") {
    closeMenu(liveRegion);
    return;
  }
}

function activateMenuItem() {
  const item = state.menu.items[state.menu.currentIndex];
  ["mousedown", "mouseup", "click"].forEach((evt) =>
    item.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
  );
  item.focus();

  setTimeout(() => {
    resetMenuState();
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

  const currentId = state.messages.currentId;
  const message = state.messages.map.get(currentId);

  if (message) {
    message.tabIndex = 0;
    message.focus();
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
  
  const items = await getAllowedMenuItems();
  updateMenuState(items, items.length > 0 ? 0 : -1);
  
  if (items.length > 0) {
    await sleep(150);
    highlightMenuItem(0);
  } else {
    announce(loc("Không có mục chọn hợp lệ trong menu.", "No valid menu items."), liveRegion);
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
};




