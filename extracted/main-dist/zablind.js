// const { describeImageFromPath } = require("./zbimage_api.js");

window.addEventListener("DOMContentLoaded", () => {
  // ======================
  // Welcome Message
  // ======================
  window.speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();
    const englishVoice =
      voices.find((voice) => voice.lang.startsWith("en")) || voices[0]; // fallback

    const msg = new SpeechSynthesisUtterance();
    msg.lang = "en-US";
    msg.voice = englishVoice;
    msg.text = "Zablind Beta 1.4";
    msg.volume = 1.0;
    msg.rate = 1.0;

    window.speechSynthesis.speak(msg);
  };

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
      ids: [],
      map: new Map(),
      currentId: null,
    },
    messages: {
      items: [],
      ids: [],
      map: new Map(),
      currentId: null,
      lastHoveredId: null,
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
    const items = Array.from(document.querySelectorAll(".conv-item"));
    const ids = [];
    const map = new Map();

    items.forEach((item) => {
      const parent = item.closest("[anim-data-id]");
      const id = parent?.getAttribute("anim-data-id");
      if (!id) return;

      item.setAttribute("tabindex", "0");
      item.setAttribute("role", "button");

      const name = item.querySelector(".truncate")?.textContent.trim();
      if (name) item.setAttribute("aria-label", name);

      ids.push(id);
      map.set(id, item);
    });

    state.conversations.items = items;
    state.conversations.ids = ids;
    state.conversations.map = map;
  }

  function highlightConversationById(id) {
    state.conversations.items.forEach((item) =>
      item.classList.remove(HIGHLIGHT_CLASS)
    );

    const item = state.conversations.map.get(id);
    if (!item) return;

    item.classList.add(HIGHLIGHT_CLASS);
    item.focus();
    item.scrollIntoView({ behavior: "smooth", block: "nearest" });

    state.conversations.currentId = id;
  }

  // ======================
  // Message Functions
  // ======================
  function updateMessageItems() {
    const elements = Array.from(
      document.querySelectorAll(".chat-item, .chat-date")
    );
    state.messages.items = elements;
    state.messages.map = new Map();
    state.messages.ids = [];

    for (const el of elements) {
      let id = null;

      if (el.classList.contains("chat-item")) {
        const innerDiv = el.querySelector("div[id^='bb_msg_id_']");
        if (innerDiv) {
          id = innerDiv.id; // Use full id, e.g., "bb_msg_id_1752322227848"
          el.setAttribute("data-id", id); // Optional: store on element for clarity
        }
      }

      if (!id) {
        // Fallback for chat-date or items without ID — use fallback hash or skip
        id = `auto_${state.messages.ids.length}`; // Simple fallback
      }

      state.messages.map.set(id, el);
      state.messages.ids.push(id);
    }
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
      ? `Liên kết ${linkHost}${allText ? " " + allText : ""}`
      : allText || "(không có nội dung)";
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

    return [h && `${h} giờ`, m && `${m} phút`, s && `${s} giây`]
      .filter(Boolean)
      .join(" ");
  }

  function getMessageContent(messageElement) {
    const isSent = messageElement.classList.contains("me");
    const time =
      messageElement
        .querySelector(".card-send-time__sendTime")
        ?.textContent.trim() || "";
    const status = isSent ? "Gửi vào lúc" : "Nhận vào lúc";

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
            ?.textContent.trim() || "(không có nội dung)";
        const quoteTitle = messageElement
          .querySelector(".message-quote-fragment__title")
          ?.textContent.trim();
        const quoteContent = messageElement
          .querySelector(".message-quote-fragment__description")
          ?.textContent.trim();

        return quoteTitle && quoteContent
          ? `${text} đã trả lời ${quoteTitle} ${quoteContent}`
          : text;
      },
      photo: () => {
        const caption = extractCaptionWithShortenedLink(
          messageElement.querySelector(".img-msg-v2__cap")
        );
        return caption ? `Hình ảnh với tiêu đề ${caption}` : "Hình ảnh";
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
          ? `Video với tiêu đề ${caption}${duration ? `, ${duration}` : ""}`
          : `Video${duration ? `, ${duration}` : ""}`;
      },
      album: () => {
        const count = messageElement.querySelectorAll(".album__item").length;
        return `Album có ${count} ảnh hoặc video`;
      },
      sticker: () => {
        const stickerMessage = messageElement.querySelector(".sticker");
        return stickerMessage
          ? "Nhãn dán. Có thể mô tả nhãn dán"
          : "Không có nội dung";
      },
      link: () => {
        return (
          extractCaptionWithShortenedLink(
            messageElement.querySelector(".link-message-v2")
          ) || "(không có nội dung)"
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
        return `Tệp hoặc thư mục ${filename}${size ? ", kích cỡ " + size : ""}`;
      },
      voice: () => {
        const rawDuration = messageElement
          .querySelector(".voice-message-normal__duration-wrapper")
          ?.textContent.trim();
        const duration = formatDuration(rawDuration);
        return `Tin nhắn thoại ${duration ? `, ${duration}` : ""}`;
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
      { selector: ".sticker", handler: handlers.sticker },
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

  function highlightMessageById(id) {
    const el = state.messages.map.get(id);
    if (!el) return;

    // Remove highlight from all
    state.messages.items.forEach((item) =>
      item.classList.remove(MESSAGE_HIGHLIGHT_CLASS)
    );

    // Simulate mouseout for previous
    if (state.messages.lastHoveredId) {
      const prev = state.messages.map.get(state.messages.lastHoveredId);
      prev
        ?.querySelector('[data-id="div_DisabledTargetEventLayer"]')
        ?.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true, cancelable: true })
        );
    }

    state.messages.lastHoveredId = id;

    el.classList.add(MESSAGE_HIGHLIGHT_CLASS);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // NVDA focus
    let focusRegion = el.querySelector(".nvda-focus-region");
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
      el.prepend(focusRegion);
    }

    focusRegion.textContent = getMessageContent(el).announcement;
    focusRegion.focus();
  }

  // Announce when someone is typing
  (function () {
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("role", "status");
    liveRegion.style.cssText =
      "position:absolute;left:-9999px;height:1px;width:1px;overflow:hidden;";
    document.body.appendChild(liveRegion);

    // Track previous announcement to avoid repeats
    let lastAnnouncedText = "";

    // Configuration
    const typingIndicatorSelector = ".doing-something.message-view__typing";

    // Check for typing indicator periodically
    const checkInterval = setInterval(() => {
      const typingIndicator = document.querySelector(typingIndicatorSelector);

      if (typingIndicator) {
        const currentText = typingIndicator.textContent.trim();

        // Only announce if text has changed
        if (currentText !== lastAnnouncedText) {
          liveRegion.textContent = currentText;
          lastAnnouncedText = currentText;
        }
      } else if (lastAnnouncedText !== "") {
        // Typing has stopped - clear announcement
        liveRegion.textContent = "";
        lastAnnouncedText = "";
      }
    }, 1000); // Check every second

    // Clean up
    window.addEventListener("beforeunload", () => {
      clearInterval(checkInterval);
      liveRegion.remove();
    });
  })();

  // ======================
  // Menu Functions
  // ======================
  async function getAllowedMenuItems(timeout = 1000) {
    const start = Date.now();
    let popup = null;

    while (!popup && Date.now() - start < timeout) {
      popup = document.querySelector(".popover-v3");
      if (popup) break;
      await new Promise((r) => setTimeout(r, 30));
    }

    if (!popup) return [];

    // Wait for zmenu-items to load
    let items = [];
    while (items.length === 0 && Date.now() - start < timeout) {
      items = Array.from(popup.querySelectorAll(".zmenu-item"));
      if (items.length > 0) break;
      await new Promise((r) => setTimeout(r, 30));
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
    if (event.key === "Enter" && state.conversations.currentId && !isTyping) {
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
          "aria-label": "Nhập tin nhắn.",
        });
        richInput.focus();
        setTimeout(() => (richInput.tabIndex = 1), 1000);
      }, 50);
    }
  }

  function navigateConversations(key) {
    updateConversationItems();

    const { ids, currentId } = state.conversations;

    if (ids.length === 0) return;

    let index = ids.indexOf(currentId);

    if (key === "1" || key === "!") {
      index = 0;
    } else if (key === "M") {
      index = (index + 1) % ids.length;
    } else {
      index = (index - 1 + ids.length) % ids.length;
    }

    const newId = ids[index];
    highlightConversationById(newId);
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

    // Shift focus off richInput temporarily
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

    state.menu.items = [];
    state.menu.currentIndex = -1;
    announce("Menu đã đóng");
  }

  function navigateMessages(key) {
    updateMessageItems(); // Refresh DOM map

    const { ids, map, currentId } = state.messages;

    // Determine current index based on ID
    let currentIndex = currentId ? ids.indexOf(currentId) : -1;

    if (key === "R") {
      currentIndex = ids.length - 1;
    } else if (key === "K") {
      currentIndex = Math.max(0, currentIndex - 1);
    } else if (key === "L") {
      currentIndex = Math.min(ids.length - 1, currentIndex + 1);
    }

    const newId = ids[currentIndex];
    if (!newId) return;

    // Remove tabindex/role from previously focused message
    const prevMessage = map.get(state.messages.currentId);
    if (prevMessage) {
      const prevContent = prevMessage.querySelector(".message-content-render");
      if (prevContent) {
        prevContent.removeAttribute("role");
        prevContent.removeAttribute("tabindex");
      }
    }

    state.messages.currentId = newId;
    highlightMessageById(newId);
  }

  async function openContextMenu(event) {
    const currentId = state.messages.currentId;
    const message = state.messages.map.get(currentId);
    const content = message.querySelector(
      '[data-id="div_DisabledTargetEventLayer"]'
    );

    if (!content) {
      announce("Không có nội dung tin nhắn.");
      return;
    }

    event.preventDefault();

    // 1. Make element interactive
    content.style.pointerEvents = "auto";
    content.setAttribute("tabindex", "0");
    content.focus();

    // 2. Get coordinates
    const rect = content.getBoundingClientRect();
    const clickX = rect.left + 10;
    const clickY = rect.top + 10;

    // 3. Trigger hover
    simulateHover(content);

    // 4. Trigger right-click
    await new Promise((r) => setTimeout(r, 30));
    content.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: clickX,
        clientY: clickY,
      })
    );

    // 5. Wait and get allowed items
    state.menu.items = await getAllowedMenuItems();

    if (state.menu.items.length) {
      state.menu.currentIndex = 0;
      highlightMenuItem(state.menu.currentIndex);
    } else {
      announce("Không có mục chọn hợp lệ trong menu.");
    }
  }

  async function openAttachmentMenu(event) {
    const attachmentBtn = document.querySelector(
      '[data-translate-title="STR_TIP_ATTACH_FILE"]'
    );

    if (!attachmentBtn) {
      announce("Không có nút chọn tệp/thư mục.");
      return;
    }

    event.preventDefault();

    // Focus NVDA on it
    attachmentBtn.style.pointerEvents = "auto";
    attachmentBtn.setAttribute("tabindex", "0");
    attachmentBtn.focus();

    // Stimulate hover
    simulateHover(attachmentBtn);

    await new Promise((r) => setTimeout(r, 30));
    attachmentBtn.click();
    await new Promise((r) => setTimeout(r, 30));
    state.menu.items = await getAllowedMenuItems();
    if (state.menu.items.length) {
      state.menu.currentIndex = 0;
      highlightMenuItem(state.menu.currentIndex);
    } else {
      announce("Không có mục chọn hợp lệ trong menu.");
    }
  }

  function activateConversation() {
    updateConversationItems();

    const id = state.conversations.currentId;
    const conversation = state.conversations.map.get(id);

    if (!conversation) return;

    conversation.focus();
    conversation.scrollIntoView({ behavior: "smooth", block: "nearest" });

    ["mouseover", "mousedown", "mouseup", "click"].forEach((evt) =>
      conversation.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
    );

    liveRegion.textContent =
      conversation.textContent.trim() || "Đã chọn liên hệ";

    state.conversations.currentId = null;
  }

  function playMedia() {
    const currentId = state.messages.currentId;
    const message = state.messages.map.get(currentId);
    const currentMessage = message;
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
    if (state.conversations.currentId) {
      highlightConversationById(state.conversations.currentId);
    }
    updateMessageItems();

    const popup = document.querySelector(".popover-v3");
    if (popup && popup.style.display !== "none") {
      announce("Menu đang mở.");
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
