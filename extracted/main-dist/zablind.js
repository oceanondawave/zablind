window.addEventListener("DOMContentLoaded", () => {
  // ======================
  // Initial Setup
  // ======================
  const appRoot = document.getElementById("app") || document.body;
  appRoot.setAttribute("role", "application");

  // ======================
  // Constants
  // ======================
  const HIGHLIGHT_CLASS = "custom-hover-highlight";
  const MESSAGE_HIGHLIGHT_CLASS = "highlight-chat-message";
  const ALLOWED_MENU_KEYS = new Set([
    // Context Menu of a message
    "STR_REPLY_MSG",
    // "STR_FORWARD_MSG",
    "STR_COPY_TEXT",
    "STR_COPY_PHOTO",
    "STR_SAVE_TO_DEVICE",
    "STR_DELETE_MSG_FOR_ME",
    "STR_DELETE_MSG",
    "STR_RECALL_MSG",
    // Attachment Menu
    "STR_CHOOSE_FILE_COMPUTER",
    "STR_CHOOSE_FOLDER_COMPUTER",
  ]);

  // ======================
  // State Variables
  // ======================
  let state = {
    conversations: {
      items: [],
      selectedIndex: -1,
    },
    messages: {
      items: [],
      currentIndex: -1,
      lastHoveredIndex: -1,
    },
    menu: {
      items: [],
      currentIndex: -1,
    },
  };

  // ======================
  // Accessibility Setup
  // ======================
  const liveRegion = createLiveRegion();
  document.body.appendChild(liveRegion);

  // ======================
  // Core Functions
  // ======================
  function createLiveRegion() {
    const region = document.createElement("div");
    Object.assign(region, {
      "aria-live": "polite",
      "aria-atomic": "true",
      role: "status",
      style: `
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(1px, 1px, 1px, 1px);
      `,
    });
    return region;
  }

  function announce(text) {
    if (!text) return;
    liveRegion.textContent = "";
    setTimeout(() => {
      liveRegion.textContent = text;
    }, 10);
  }

  function simulateHover(element) {
    element?.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, cancelable: true })
    );
  }

  // ======================
  // Conversation List Functions
  // ======================
  function updateConversationItems() {
    state.conversations.items = Array.from(
      document.querySelectorAll(".conv-item")
    );
    state.conversations.items.forEach((item) => {
      item.setAttribute("tabindex", "0");
      item.setAttribute("role", "button");
      const name = item.querySelector(".truncate")?.textContent.trim();
      if (name) item.setAttribute("aria-label", name);
    });
  }

  function highlightConversation(index) {
    state.conversations.items.forEach((item) =>
      item.classList.remove(HIGHLIGHT_CLASS)
    );

    const item = state.conversations.items[index];
    if (!item) return;

    item.classList.add(HIGHLIGHT_CLASS);
    item.focus();
    item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ======================
  // Message Functions
  // ======================
  function updateMessageItems() {
    state.messages.items = Array.from(
      document.querySelectorAll(".chat-item, .chat-date")
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

    return linkHost
      ? `Link ${linkHost}${allText ? " " + allText : ""}`
      : allText || "(no text)";
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

    return [
      h && `${h} hour${h !== 1 ? "s" : ""}`,
      m && `${m} minute${m !== 1 ? "s" : ""}`,
      s && `${s} second${s !== 1 ? "s" : ""}`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function getMessageContent(messageElement) {
    const isSent = messageElement.classList.contains("me");
    const time =
      messageElement
        .querySelector(".card-send-time__sendTime")
        ?.textContent.trim() || "";
    const status = isSent ? "Sent at" : "Received at";

    // Get sender information
    const sender =
      messageElement
        .querySelector(".message-sender-name-content")
        ?.textContent.trim() || "";
    const mention =
      messageElement.querySelector(".mention-name")?.textContent.trim() || "";
    const namePrefix = [sender, mention].filter(Boolean).join(" ");

    // Message type handlers
    const handlers = {
      text: () => {
        const text =
          messageElement
            .querySelector(".text-message__container .text")
            ?.textContent.trim() || "(no text)";
        const quoteTitle = messageElement
          .querySelector(".message-quote-fragment__title")
          ?.textContent.trim();
        const quoteContent = messageElement
          .querySelector(".message-quote-fragment__description")
          ?.textContent.trim();

        return quoteTitle && quoteContent
          ? `${text} replied to ${quoteTitle} ${quoteContent}`
          : text;
      },
      photo: () => {
        const caption = extractCaptionWithShortenedLink(
          messageElement.querySelector(".img-msg-v2__cap")
        );
        return caption ? `Photo with caption ${caption}` : "Photo";
      },
      video: () => {
        const caption = extractCaptionWithShortenedLink(
          messageElement.querySelector(".video-message__w-caption-wrapper")
        );
        const rawDuration =
          messageElement
            .querySelector(".video-message__floaty-duration-wrapper")
            ?.textContent.trim() || "";
        const duration = formatDuration(rawDuration);

        return caption
          ? `Video with caption ${caption}${duration ? `, ${duration}` : ""}`
          : `Video${duration ? `, ${duration}` : ""}`;
      },
      album: () => {
        const count = messageElement.querySelectorAll(".album__item").length;
        return `${count} photos/videos`;
      },
      link: () => {
        return (
          extractCaptionWithShortenedLink(
            messageElement.querySelector(".link-message-v2")
          ) || "(no content)"
        );
      },
      file: () => {
        const titleNode = messageElement.querySelector(
          ".file-message__content-title"
        );
        const filename = titleNode
          ? Array.from(titleNode.querySelectorAll("div"))
              .map((d) => d.textContent.trim())
              .join("")
          : "";
        const size =
          messageElement
            .querySelector(".file-message__content-info-size")
            ?.textContent.trim() || "";
        return `File ${filename}${size ? ", size " + size : ""}`;
      },
      voice: () => {
        const rawDuration = messageElement
          .querySelector(".voice-message-normal__duration-wrapper")
          ?.textContent.trim();
        const duration = formatDuration(rawDuration);
        return `Voice message${duration ? `, ${duration}` : ""}`;
      },
      call: () => {
        const title =
          messageElement
            .querySelector(".call-message__title-wrapper")
            ?.textContent.trim() || "";
        const content =
          messageElement
            .querySelector(".call-message__content-txt-wrapper")
            ?.textContent.trim() || "";
        return `${title}. ${content}`;
      },
      date: () => {
        return messageElement
          .querySelector('[data-translate-inner="STR_DATE_TIME"]')
          ?.textContent.trim();
      },
    };

    // Determine message type
    const messageTypes = [
      {
        selector: '[data-translate-inner="STR_DATE_TIME"]',
        handler: handlers.date,
      },
      { selector: ".text-message__container", handler: handlers.text },
      { selector: ".img-msg-v2.photo-message-v2", handler: handlers.photo },
      {
        selector:
          ".video-message__non-caption-wrapper, .video-message__w-caption-wrapper",
        handler: handlers.video,
      },
      { selector: ".card--group-photo", handler: handlers.album },
      { selector: ".link-message-v2", handler: handlers.link },
      { selector: ".file-message__container", handler: handlers.file },
      { selector: ".voice-message", handler: handlers.voice },
      { selector: ".call-message", handler: handlers.call },
    ];

    for (const { selector, handler } of messageTypes) {
      if (messageElement.querySelector(selector)) {
        const content = handler();
        if (content) {
          const fullMessage = namePrefix ? `${namePrefix} ${content}` : content;
          return {
            content: fullMessage,
            announcement: time
              ? `${fullMessage}. ${status} ${time}`
              : fullMessage,
          };
        }
      }
    }

    return {
      content: "",
      announcement: "",
    };
  }

  function highlightMessage(index) {
    // Remove highlight from all messages
    state.messages.items.forEach((item) => {
      item.classList.remove(MESSAGE_HIGHLIGHT_CLASS);
    });

    const messageElement = state.messages.items[index];
    if (!messageElement) return;

    // Simulate hover out for previous message's text (right-clickable object)
    if (state.messages.lastHoveredIndex >= 0) {
      const prev = state.messages.items[state.messages.lastHoveredIndex];
      prev
        ?.querySelector('[data-id="div_DisabledTargetEventLayer"]')
        ?.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true, cancelable: true })
        );
    }

    state.messages.lastHoveredIndex = index;

    // Create announcement
    const { announcement } = getMessageContent(messageElement);

    // Apply visual highlight
    messageElement.classList.add(MESSAGE_HIGHLIGHT_CLASS);
    messageElement.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Create focus region for NVDA
    let focusRegion = messageElement.querySelector(".nvda-focus-region");
    if (!focusRegion) {
      focusRegion = document.createElement("div");
      Object.assign(focusRegion, {
        tabIndex: -1,
        className: "nvda-focus-region",
        style: `
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        `,
      });
      messageElement.prepend(focusRegion);
    }

    focusRegion.textContent = announcement;
    focusRegion.focus();
  }

  // ======================
  // Menu Functions
  // ======================
  function getAllowedMenuItems() {
    const popup = document.querySelector(".popover-v3");
    if (!popup) return [];

    popup.setAttribute("role", "menu");

    return Array.from(popup.querySelectorAll(".zmenu-item")).filter((item) => {
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

  // ======================
  // Event Handlers
  // ======================
  function handleKeyDown(event) {
    const isTyping =
      ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) ||
      document.activeElement.isContentEditable;

    // Focus chat input (Ctrl+Shift+E)
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      focusChatInput();
      return;
    }

    // Conversation navigation (Ctrl+Shift+M/N/1)
    if (
      event.ctrlKey &&
      event.shiftKey &&
      ["1", "!", "M", "N"].includes(event.key)
    ) {
      event.preventDefault();
      navigateConversations(event.key);
      return;
    }

    // Menu navigation (when menu is open)
    state.menu.items = getAllowedMenuItems();
    if (state.menu.items.length) {
      handleMenuNavigation(event);
      return;
    }

    // Message navigation (Ctrl+Shift+R/K/L)
    if (
      event.ctrlKey &&
      event.shiftKey &&
      ["R", "K", "L"].includes(event.key) &&
      !document.querySelector(".popover-v3:not([style*='display: none'])")
    ) {
      event.preventDefault();
      navigateMessages(event.key);
      return;
    }

    // Open context menu (Application key)
    if (event.key === "ContextMenu" && state.messages.currentIndex !== -1) {
      event.preventDefault();
      openContextMenu(event);
      return;
    }

    // Open attachment menu
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      openAttachmentMenu(event);
      return;
    }

    // Activate conversation (Enter)
    if (
      event.key === "Enter" &&
      state.conversations.selectedIndex !== -1 &&
      !isTyping
    ) {
      event.preventDefault();
      activateConversation();
      return;
    }

    // Play media (Tab)
    if (event.key === "Tab" && !isTyping) {
      event.preventDefault();
      playMedia();
      return;
    }
  }

  function focusChatInput() {
    const chatView = document.getElementById("chatView");
    const chatInput = document.getElementById("chatInput");
    const richInput = document.getElementById("richInput");

    if (chatView && chatInput && richInput) {
      chatView.tabIndex = 0;
      chatView.focus();

      setTimeout(() => {
        chatInput.classList.add("highlight-v3");
        Object.assign(richInput, {
          tabIndex: 0,
          "aria-label": "Type your message.",
        });
        richInput.focus();
        setTimeout(() => (richInput.tabIndex = 1), 1000);
      }, 50);
    }
  }

  function navigateConversations(key) {
    updateConversationItems();
    state.conversations.selectedIndex =
      key === "1" || key === "!"
        ? 0
        : key === "M"
        ? (state.conversations.selectedIndex + 1) %
          state.conversations.items.length
        : (state.conversations.selectedIndex -
            1 +
            state.conversations.items.length) %
          state.conversations.items.length;
    highlightConversation(state.conversations.selectedIndex);
  }

  function handleMenuNavigation(event) {
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
      event.preventDefault();
      closeMenu();
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
      state.menu.items = [];
      state.menu.currentIndex = -1;
    }, 200);
  }

  function closeMenu() {
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

    if (
      state.messages.currentIndex !== -1 &&
      state.messages.items[state.messages.currentIndex]
    ) {
      const message = state.messages.items[state.messages.currentIndex];
      message.tabIndex = 0;
      message.focus();
      simulateHover(message);
    }

    state.menu.items = [];
    state.menu.currentIndex = -1;
    announce("Menu closed");
  }

  function navigateMessages(key) {
    updateMessageItems();

    if (key === "R") {
      state.messages.currentIndex = state.messages.items.length - 1;
    } else if (key === "K") {
      state.messages.currentIndex = Math.max(
        0,
        state.messages.currentIndex - 1
      );
    } else if (key === "L") {
      state.messages.currentIndex = Math.min(
        state.messages.items.length - 1,
        state.messages.currentIndex + 1
      );
    }

    if (state.messages.currentIndex !== -1) {
      const prevMessage = state.messages.items[state.messages.currentIndex];
      if (prevMessage) {
        const prevContent = prevMessage.querySelector(
          ".message-content-render"
        );
        if (prevContent) {
          prevContent.removeAttribute("role");
          prevContent.removeAttribute("tabindex");
        }
      }
    }

    highlightMessage(state.messages.currentIndex);
  }

  function openContextMenu(event) {
    const message = state.messages.items[state.messages.currentIndex];
    const content = message.querySelector(
      '[data-id="div_DisabledTargetEventLayer"]'
    );

    if (!content) {
      announce("Message content not found.");
      return;
    }

    event.preventDefault();

    // 1. Make element interactive
    content.style.pointerEvents = "auto";
    content.setAttribute("tabindex", "0");
    content.focus();

    // 2. Get coordinates (slightly offset from center for better reliability)
    const rect = content.getBoundingClientRect();
    const clickX = rect.left + 10;
    const clickY = rect.top + 10;

    // 3. Create the complete right-click sequence
    const triggerRightClick = () => {
      content.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: clickX,
          clientY: clickY,
        })
      );
    };

    // 4. First simulate hover
    simulateHover(content);

    // 5. Then trigger right-click with slight delay
    setTimeout(triggerRightClick, 30);
    setTimeout(() => {
      state.menu.items = getAllowedMenuItems();
      if (state.menu.items.length) {
        state.menu.currentIndex = 0;
        highlightMenuItem(state.menu.currentIndex);
      } else {
        announce("No valid menu items");
      }
    }, 100);
  }

  function openAttachmentMenu(event) {
    const attachmentBtn = document.querySelector(
      '[data-translate-title="STR_TIP_ATTACH_FILE"]'
    );

    if (!attachmentBtn) {
      announce("Attachment button not found.");
      return;
    }

    event.preventDefault();

    // Focus NVDA on it
    attachmentBtn.style.pointerEvents = "auto";
    attachmentBtn.setAttribute("tabindex", "0");
    attachmentBtn.focus();

    // Stimulate hover
    simulateHover(attachmentBtn);

    attachmentBtn.click();
    setTimeout(() => {
      state.menu.items = getAllowedMenuItems();
      if (state.menu.items.length) {
        state.menu.currentIndex = 0;
        highlightMenuItem(state.menu.currentIndex);
      } else {
        announce("No valid menu items");
      }
    }, 100);
  }

  function activateConversation() {
    updateConversationItems();
    const conversation =
      state.conversations.items[state.conversations.selectedIndex];

    if (!conversation) return;

    conversation.focus();
    conversation.scrollIntoView({ behavior: "smooth", block: "nearest" });

    ["mouseover", "mousedown", "mouseup", "click"].forEach((evt) =>
      conversation.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
    );

    liveRegion.textContent =
      conversation.textContent.trim() || "Contact activated";
    state.conversations.selectedIndex = -1;
  }

  function playMedia() {
    const currentMessage =
      state.messages.items[state.messages.lastHoveredIndex];
    if (!currentMessage) return;

    // // 1. First check for PHOTOS/VIDEOS message control
    let control = currentMessage.querySelector(".img-center-box");

    if (!control) {
      const voiceMessage = currentMessage.querySelector(".voice-message");
      control = voiceMessage?.querySelector(
        ".voice-message-normal__player-control-wrapper"
      );
    }

    if (!control) {
      return;
    }

    // Standardize control for accessibility
    control.setAttribute("role", "button");
    control.setAttribute("tabindex", "0");

    // Execute click with focus
    setTimeout(() => {
      control.focus();
      control.click();
    }, 50);
  }

  function refreshAll() {
    updateConversationItems();
    if (state.conversations.selectedIndex >= 0) {
      highlightConversation(state.conversations.selectedIndex);
    }
    updateMessageItems();

    const popup = document.querySelector(".popover-v3");
    if (popup && popup.style.display !== "none") {
      announce("Menu opening");
    }
  }

  // ======================
  // Event Listeners
  // ======================
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("focus", refreshAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshAll();
  });

  // ======================
  // Style Injection
  // ======================
  const style = document.createElement("style");
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background-color: rgba(255,159,49,0.15) !important;
    }
    .${MESSAGE_HIGHLIGHT_CLASS} {
      outline: 3px dashed #0066cc;
      border-radius: 6px;
      background-color: rgba(0,102,204,0.1);
    }
  `;
  document.head.appendChild(style);

  // ======================
  // Initial Setup
  // ======================
  updateConversationItems();
  updateMessageItems();
});
