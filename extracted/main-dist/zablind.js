window.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.getElementById("app") || document.body;
  appRoot.setAttribute("role", "application");

  let selectedIndex = -1,
    items = [];
  const highlightClass = "custom-hover-highlight";

  let chatItems = [],
    chatIndex = -1,
    lastHoveredChatIndex = -1;
  const messageHighlightClass = "highlight-chat-message";

  const richInput = document.getElementById("richInput");
  let isTypingAllowed = false;

  let menuItems = [],
    menuIndex = -1;
  const allowedMenuKeys = new Set([
    "STR_REPLY_MSG",
    "STR_FORWARD_MSG",
    "STR_COPY_TEXT",
    "STR_COPY_PHOTO",
    "STR_SAVE_TO_DEVICE",
    "STR_DELETE_MSG_FOR_ME",
    "STR_DELETE_MSG",
    "STR_RECALL_MSG",
  ]);

  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");
  liveRegion.setAttribute("role", "status");
  Object.assign(liveRegion.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(1px, 1px, 1px, 1px)",
  });
  document.body.appendChild(liveRegion);

  function announce(text) {
    if (!text) return;
    // Clear first to ensure repeated messages work
    liveRegion.textContent = "";
    setTimeout(() => {
      liveRegion.textContent = text;
    }, 10); // Delay ensures NVDA registers it
  }

  function updateItems() {
    items = Array.from(document.querySelectorAll(".conv-item"));
    items.forEach((el) => {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      const name = el.querySelector(".truncate")?.textContent.trim();
      if (name) el.setAttribute("aria-label", name);
    });
  }

  function highlightItem(i) {
    items.forEach((el) => el.classList.remove(highlightClass));
    const el = items[i];
    if (!el) return;
    el.classList.add(highlightClass);
    el.focus();
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function updateChatItems() {
    chatItems = Array.from(document.querySelectorAll(".chat-item, .chat-date"));
  }

  function highlightChatMessage(i) {
    chatItems.forEach((el) => el.classList.remove(messageHighlightClass));
    const el = chatItems[i];
    if (!el) return;

    if (lastHoveredChatIndex !== -1 && chatItems[lastHoveredChatIndex]) {
      const prev = chatItems[lastHoveredChatIndex];
      const prevContent = prev.querySelector(".message-content-render");
      if (prevContent) {
        prevContent.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true, cancelable: true })
        );
      }
    }

    el.classList.add(messageHighlightClass);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const content = el.querySelector(".message-content-render");
    if (content) simulateHover(content);

    lastHoveredChatIndex = i;

    const isItem = el.classList.contains("chat-item");
    if (isItem) {
      const text = el.querySelector(".text")?.textContent.trim() || "";
      const time =
        el.querySelector(".card-send-time__sendTime")?.textContent.trim() || "";
      announce(time ? `${text}. Sent at ${time}` : text);
    } else {
      liveRegion.textContent =
        el
          .querySelector('[data-translate-inner="STR_DATE_TIME"]')
          ?.textContent.trim() || "";
    }
  }

  function disableTyping() {
    isTypingAllowed = false;
    richInput?.blur();
  }

  function enableTyping() {
    isTypingAllowed = true;
    richInput?.focus();
    announce("Enable editing");
  }

  function simulateHover(el) {
    el.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, cancelable: true })
    );
  }

  function getAllowedMenuItems() {
    const pop = document.querySelector(".popover-v3");
    if (!pop) return [];

    pop.setAttribute("role", "menu");

    const allItems = Array.from(pop.querySelectorAll(".zmenu-item"));
    const allowed = [];

    allItems.forEach((item) => {
      const span = item.querySelector("span[data-translate-inner]");
      const value = span?.getAttribute("data-translate-inner")?.trim() || "";

      const isAllowedKey = allowedMenuKeys.has(value);

      const matchesDynamicDownload =
        /^Lưu\s+\d+(\s+ảnh\/video)?\s+về máy$/i.test(value) ||
        /^Download\s+\d+\s+(photos?|videos?|photos\/videos)$/i.test(value);

      if (isAllowedKey || matchesDynamicDownload) {
        item.setAttribute("role", "menuitem");
        item.setAttribute("tabindex", "0");
        item.setAttribute("aria-hidden", "false");
        allowed.push(item);
      } else {
        item.setAttribute("aria-hidden", "true");
        item.setAttribute("tabindex", "-1");
      }
    });

    return allowed;
  }

  function highlightMenuItem(i) {
    menuItems.forEach((el, idx) => {
      el.classList.toggle(highlightClass, idx === i);
      if (idx === i) {
        simulateHover(el);
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    const isTextKey =
      e.key.length === 1 || e.key === "Backspace" || e.key === "Enter";

    if (
      isTextKey &&
      !isTypingAllowed &&
      !(e.ctrlKey || e.metaKey || e.altKey)
    ) {
      // Allow Space if a message is selected (for NVDA activation)
      const allowSpace = e.key === " " && chatItems[chatIndex];
      if (!allowSpace) {
        e.preventDefault();
      }
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      enableTyping();
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key === "M") {
      e.preventDefault();
      updateItems();
      selectedIndex = (selectedIndex + 1) % items.length;
      highlightItem(selectedIndex);
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key === "N") {
      e.preventDefault();
      updateItems();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      highlightItem(selectedIndex);
      return;
    }

    // Always update menuItems
    menuItems = getAllowedMenuItems();

    if (menuItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        menuIndex = (menuIndex + 1) % menuItems.length;
        highlightMenuItem(menuIndex);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;
        highlightMenuItem(menuIndex);
        return;
      }

      if (e.key === "Enter" && menuIndex !== -1) {
        e.preventDefault();
        const item = menuItems[menuIndex];
        if (item) {
          item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          item.focus();
        }

        setTimeout(() => {
          menuItems = [];
          menuIndex = -1;
          const moreButton = document.querySelector(
            '[data-translate-title="STR_MORE_OPTIONS"]'
          );
          if (moreButton) moreButton.setAttribute("aria-expanded", "false");
        }, 200);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        menuItems = [];
        menuIndex = -1;
        announce("Menu closed");
        const moreButton = document.querySelector(
          '[data-translate-title="STR_MORE_OPTIONS"]'
        );
        if (moreButton) moreButton.setAttribute("aria-expanded", "false");
        return;
      }
    }

    // Chat message navigation
    if (
      e.ctrlKey &&
      e.shiftKey &&
      ["R", "K", "L"].includes(e.key) &&
      !document.querySelector(".popover-v3:not([style*='display: none'])")
    ) {
      e.preventDefault();
      updateChatItems();
      if (e.key === "R") chatIndex = chatItems.length - 1;
      if (e.key === "K") chatIndex = Math.max(0, chatIndex - 1);
      if (e.key === "L")
        chatIndex = Math.min(chatItems.length - 1, chatIndex + 1);
      highlightChatMessage(chatIndex);
      disableTyping();
      return;
    } else if (["R", "K", "L"].includes(e.key)) {
      announce("Press ESC to close menu first.");
    }

    // Application key on open sub menu
    if (e.key === "ContextMenu" && chatIndex !== -1 && chatItems[chatIndex]) {
      e.preventDefault();
      const ci = chatItems[chatIndex];
      const content = ci.querySelector(".message-content-render");
      if (!content) {
        announce("Message content not found.");
        return;
      }

      simulateHover(content);

      setTimeout(() => {
        const moreButton = ci.querySelector(
          '[data-translate-title="STR_MORE_OPTIONS"]'
        );
        if (!moreButton) {
          announce("More button not found.");
          return;
        }

        moreButton.setAttribute("role", "button");
        moreButton.setAttribute("tabindex", "0");
        moreButton.click();
      }, 100);

      return;
    }

    document.addEventListener("contextmenu", (e) => {
      if (
        e.sourceCapabilities &&
        !e.sourceCapabilities.firesTouchEvents &&
        !e.sourceCapabilities.pointerType
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Fix: Enter on selected contact (more robust after refocus)
    if (e.key === "Enter" && selectedIndex !== -1 && items[selectedIndex]) {
      e.preventDefault();
      const el = items[selectedIndex];

      // Re-query item to ensure it's the freshest DOM node
      updateItems();
      const updatedEl = items[selectedIndex];
      if (!updatedEl) return;

      // Stronger interaction chain
      updatedEl.focus();
      updatedEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      updatedEl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      updatedEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      updatedEl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      updatedEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      liveRegion.textContent =
        updatedEl.textContent.trim() || "Contact activated";
      return;
    }
  });

  window.addEventListener("focus", () => {
    updateItems();
    if (selectedIndex !== -1) {
      highlightItem(selectedIndex);
    }
    updateChatItems();

    // Only disable typing if not currently navigating messages
    if (chatIndex === -1 || !chatItems[chatIndex]) {
      disableTyping();
    }

    const pop = document.querySelector(".popover-v3");
    if (pop && pop.style.display !== "none") {
      announce("Menu opening");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateItems();
      if (selectedIndex !== -1) {
        highlightItem(selectedIndex);
      }
      updateChatItems();

      if (chatIndex === -1 || !chatItems[chatIndex]) {
        disableTyping();
      }
    }

    const pop = document.querySelector(".popover-v3");
    if (pop && pop.style.display !== "none") {
      announce("Menu opening");
    }
  });

  document.addEventListener("click", (ev) => {
    if (richInput && !richInput.contains(ev.target)) {
      disableTyping();
    }
  });

  const style = document.createElement("style");
  style.textContent = `
    .${highlightClass} {
      background-color: rgba(255,159,49,0.15) !important;
    }
    .${messageHighlightClass} {
      outline: 3px dashed #0066cc;
      border-radius: 6px;
      background-color: rgba(0,102,204,0.1);
    }
  `;
  document.head.appendChild(style);

  disableTyping();
});
