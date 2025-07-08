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

    // Common helpers
    const isSent = el.classList.contains("me");
    const time =
      el.querySelector(".card-send-time__sendTime")?.textContent.trim() || "";
    const status = isSent ? "Sent at" : "Received at";

    function extractCaptionWithShortenedLink(container) {
      if (!container) return "";

      const linkEl = container.querySelector("a.text-is-link");
      let linkHost = "";

      if (linkEl && linkEl.dataset.content) {
        try {
          linkHost = new URL(linkEl.dataset.content).hostname;
        } catch {
          linkHost = linkEl.textContent.trim(); // fallback to displayed link text
        }
      }

      // Get all visible text, even if not inside .text class
      let allText = container.textContent.trim();

      // Remove link text from overall text if duplicated
      if (linkEl && allText.includes(linkEl.textContent.trim())) {
        allText = allText.replace(linkEl.textContent.trim(), "").trim();
      }

      return linkHost
        ? `Link ${linkHost}${allText ? " " + allText : ""}`
        : allText || "(no text)";
    }

    // Sender & Mention
    const sender =
      el.querySelector(".message-sender-name-content")?.textContent.trim() ||
      "";
    const mention = el.querySelector(".mention-name")?.textContent.trim() || "";
    const namePrefix = [sender, mention].filter(Boolean).join(" ");

    let message = "";

    // Quoted message
    const quoteTitle = el
      .querySelector(".message-quote-fragment__title")
      ?.textContent.trim();
    const quoteContent = el
      .querySelector(".message-quote-fragment__description")
      ?.textContent.trim();

    if (el.querySelector(".text-message__container")) {
      const text =
        el
          .querySelector(".text-message__container .text")
          ?.textContent.trim() || "(no text)";
      message = text;

      if (quoteTitle && quoteContent) {
        message += ` replied to ${quoteTitle} ${quoteContent}`;
      }
    } else if (el.querySelector(".img-msg-v2.photo-message-v2")) {
      const captionContainer = el.querySelector(".img-msg-v2__cap");
      const caption = captionContainer
        ? extractCaptionWithShortenedLink(captionContainer)
        : "";
      message = caption ? `Photo with caption ${caption}` : "Photo";
    } else if (
      el.querySelector(".video-message__non-caption-wrapper") ||
      el.querySelector(".video-message__w-caption-wrapper")
    ) {
      const captionContainer = el.querySelector(
        ".video-message__w-caption-wrapper"
      );
      const caption = captionContainer
        ? extractCaptionWithShortenedLink(captionContainer)
        : "";

      // Get duration
      const rawDuration =
        el
          .querySelector(".video-message__floaty-duration-wrapper")
          ?.textContent.trim() || "";

      let spokenDuration = "";
      if (rawDuration) {
        const parts = rawDuration.split(":").map(Number);
        const [h, m, s] =
          parts.length === 3
            ? parts
            : parts.length === 2
            ? [0, ...parts]
            : [0, 0, ...parts];

        const hText = h ? `${h} hour${h !== 1 ? "s" : ""}` : "";
        const mText = m ? `${m} minute${m !== 1 ? "s" : ""}` : "";
        const sText = s ? `${s} second${s !== 1 ? "s" : ""}` : "";

        spokenDuration = [hText, mText, sText].filter(Boolean).join(" ");
      }

      message = caption
        ? `Video with caption ${caption}${
            spokenDuration ? `, ${spokenDuration}` : ""
          }`
        : `Video${spokenDuration ? `, ${spokenDuration}` : ""}`;
    } else if (el.querySelector(".card--group-photo")) {
      const items = el.querySelectorAll(".album__item");
      const count = items.length;
      message = `${count} photos/videos`;
    } else if (el.querySelector(".link-message-v2")) {
      const container = el.querySelector(".link-message-v2");
      const caption = extractCaptionWithShortenedLink(container);
      message = caption || "(no content)";
    } else if (el.querySelector(".file-message__container")) {
      const titleNode = el.querySelector(".file-message__content-title");
      let filename = "";
      if (titleNode) {
        const parts = Array.from(titleNode.querySelectorAll("div"));
        filename = parts.map((div) => div.textContent.trim()).join("");
      }
      const size =
        el
          .querySelector(".file-message__content-info-size")
          ?.textContent.trim() || "";
      message = `File ${filename}${size ? ", size " + size : ""}`;
    } else if (el.querySelector(".voice-message")) {
      const rawDuration = el
        .querySelector(".voice-message-normal__duration-wrapper")
        ?.textContent.trim();
      let spokenDuration = "";
      if (rawDuration) {
        const [min, sec] = rawDuration.split(":").map(Number);
        if (min === 0) {
          spokenDuration = `${sec} second${sec !== 1 ? "s" : ""}`;
        } else {
          const minText = `${min} minute${min !== 1 ? "s" : ""}`;
          const secText =
            sec > 0 ? ` ${sec} second${sec !== 1 ? "s" : ""}` : "";
          spokenDuration = `${minText}${secText}`;
        }
      }
      message = `Voice message, ${spokenDuration}`;
    } else if (el.querySelector(".call-message")) {
      const title =
        el.querySelector(".call-message__title-wrapper")?.textContent.trim() ||
        "";
      const callContent =
        el
          .querySelector(".call-message__content-txt-wrapper")
          ?.textContent.trim() || "";
      message = `${title}. ${callContent}`;
    } else {
      message =
        el
          .querySelector('[data-translate-inner="STR_DATE_TIME"]')
          ?.textContent.trim() || "";
    }

    const fullMessage = namePrefix ? `${namePrefix} ${message}` : message;
    const announcement = time
      ? `${fullMessage}. ${status} ${time}`
      : fullMessage;

    // Create or update NVDA focus region
    let focusRegion = el.querySelector(".nvda-focus-region");
    if (!focusRegion) {
      focusRegion = document.createElement("div");
      focusRegion.tabIndex = -1;
      focusRegion.className = "nvda-focus-region";
      focusRegion.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      `;
      el.prepend(focusRegion);
    }
    focusRegion.textContent = announcement;
    focusRegion.focus();
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

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
      e.preventDefault();

      const chatView = document.getElementById("chatView");
      const chatInputWrapper = document.getElementById("chatInput");
      const richInput = document.getElementById("richInput");

      if (chatView && chatInputWrapper && richInput) {
        // Step 1: Focus chatView to force NVDA into focus mode
        chatView.setAttribute("tabindex", "0");
        chatView.focus();

        // Optional: short delay ensures NVDA registers it
        setTimeout(() => {
          chatInputWrapper.classList.add("highlight-v3");

          richInput.setAttribute("tabindex", "0");
          richInput.setAttribute("aria-label", "Type your message.");
          richInput.focus();

          setTimeout(() => {
            richInput.setAttribute("tabindex", "1");
          }, 1000);
        }, 50);
      }
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

        const richInput = document.getElementById("richInput");
        const chatInputWrapper = document.getElementById("chatInput");

        if (richInput && richInput === document.activeElement) {
          // ⚠️ Force focus to a neutral element first
          const dummy = document.createElement("div");
          dummy.setAttribute("tabindex", "-1");
          document.body.appendChild(dummy);
          dummy.focus();

          // Then remove dummy and blur
          setTimeout(() => {
            dummy.remove();
            richInput.blur();

            chatInputWrapper?.classList.remove("highlight-v3");
            richInput.setAttribute("tabindex", "1");
          }, 10);
        }

        if (chatIndex !== -1 && chatItems[chatIndex]) {
          const el = chatItems[chatIndex];
          el.setAttribute("tabindex", "0");
          el.focus();
          simulateHover(el);
        }

        menuItems = [];
        menuIndex = -1;

        const moreButton = document.querySelector(
          '[data-translate-title="STR_MORE_OPTIONS"]'
        );
        if (moreButton) moreButton.setAttribute("aria-expanded", "false");

        announce("Menu closed");
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
        moreButton.focus();
        moreButton.click();

        setTimeout(() => {
          menuItems = getAllowedMenuItems();
          if (menuItems.length > 0) {
            announce("Menu opened");
            menuIndex = 0;
            highlightMenuItem(menuIndex);
          } else {
            announce("No valid menu items");
          }
        }, 150);
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

    // Enter on selected contact (more robust after refocus)
    if (e.key === "Enter" && selectedIndex !== -1 && items[selectedIndex]) {
      e.preventDefault();

      const el = items[selectedIndex];

      // Re-query item to ensure it's fresh
      updateItems();
      const updatedEl = items[selectedIndex];
      if (!updatedEl) return;

      // Simulate click interaction
      updatedEl.focus();
      updatedEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      updatedEl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      updatedEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      updatedEl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      updatedEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      liveRegion.textContent =
        updatedEl.textContent.trim() || "Contact activated";

      selectedIndex = -1;
      return;
    }

    // Tab for playing/pausing voice message/video
    if (e.key === "Tab") {
      const isTyping =
        document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA" ||
        document.activeElement.isContentEditable;

      if (isTyping) return;

      const current = chatItems[lastHoveredChatIndex];
      if (!current) return;

      const voiceMessage = current.querySelector(".voice-message");
      let control = null;

      if (voiceMessage) {
        control = voiceMessage.querySelector(
          ".voice-message-normal__player-control-wrapper"
        );
      } else {
        // Try to get video play button
        control = current.querySelector(".video-message__floaty-icon-wrapper");
      }

      if (!control) return;

      // Ensure it's focusable and recognized by screen readers
      control.setAttribute("role", "button");
      control.setAttribute("tabindex", "0");

      e.preventDefault();
      control.focus();

      // Trigger play
      control.click();
    }
  });

  window.addEventListener("focus", () => {
    updateItems();
    if (selectedIndex !== -1) {
      highlightItem(selectedIndex);
    }
    updateChatItems();

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
    }

    const pop = document.querySelector(".popover-v3");
    if (pop && pop.style.display !== "none") {
      announce("Menu opening");
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
});
