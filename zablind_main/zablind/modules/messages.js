// ======================
// Message List Management
// ======================

const {
  SELECTORS,
  MESSAGE_HIGHLIGHT_CLASS,
  MESSAGE_TYPE_SELECTORS,
} = require("./constants.js");
const { state, setFocusContext } = require("./state.js");
const { formatDuration, announce, loc } = require("./utils.js"); 

let navDebounceTimer = null;

function updateMessageItems() {
  const chatView = document.querySelector(SELECTORS.chatView);
  if (!chatView) return;

  let items = Array.from(chatView.querySelectorAll(SELECTORS.messages));

  // Filter out elements that are descendants of another element in the list to avoid duplicates
  items = items.filter((el) => {
    return !items.some((other) => other !== el && other.contains(el));
  });

  state.messages.items = items;
  state.messages.ids = items.map((el) => {
    if (!el.id) {
       el.id = el.getAttribute("data-id") || "msg_" + Math.random().toString(36).substr(2, 9);
    }
    return el.id;
  });

  state.messages.map.clear();
  items.forEach((el, index) => {
    state.messages.map.set(state.messages.ids[index], el);
  });
}

let emojiMap = {};
try {
  emojiMap = require("../emoji-labels.json");
} catch (e) {
  console.error("Failed to load emoji-labels.json:", e);
}

function translateEmojisInElement(element) {
  if (!element) return "";
  const clone = element.cloneNode(true);
  clone.querySelectorAll(".emoji-sizer").forEach((emojiEl) => {
    const rawEmojiText = emojiEl.textContent.trim();
    if (emojiMap[rawEmojiText]) {
      const mappedVal = emojiMap[rawEmojiText];
      if (mappedVal !== rawEmojiText) {
        emojiEl.textContent = " " + mappedVal + " ";
      }
    }
  });
  return clone.textContent.trim();
}

function getMessageContent(messageElement) {
  let namePrefix = "";
  const nameEl = messageElement.querySelector(".chat-name, .card__name");
  if (nameEl) namePrefix = nameEl.textContent.trim() + ": ";

  const status = messageElement.querySelector(".message-status")?.textContent.trim() || "";
  const time = messageElement.querySelector(".message-time")?.textContent.trim() || "";

  const handlers = {
    text: () => {
      const container = messageElement.querySelector(".text-message__container");
      const quote = messageElement.querySelector(".quote-banner__content, .quote-banner");
      let text = "";
      if (container) {
        text = translateEmojisInElement(container);
      }
      if (quote) {
        text = "Trả lời: " + translateEmojisInElement(quote) + ". " + text;
      }
      return text;
    },
    photo: () => {
      const count = messageElement.querySelectorAll(".img-msg-v2").length;
      const captionEl = messageElement.querySelector(".caption-text");
      const caption = captionEl ? translateEmojisInElement(captionEl) : "";
      return caption
        ? `Ảnh: ${caption}`
        : count > 1 ? `${count} Ảnh` : "Ảnh";
    },
    video: () => {
      const captionEl = messageElement.querySelector(
        ".video-message__caption, .caption-text"
      );
      const caption = captionEl ? translateEmojisInElement(captionEl) : "";
      const rawDuration =
        messageElement
          .querySelector(".video-message__floaty-duration-wrapper")
          ?.textContent.trim() || "";
      const duration = formatDuration(rawDuration);

      return caption
        ? `Video: ${caption}${duration ? `, ${duration}` : ""}`
        : `Video${duration ? `, ${duration}` : ""}`;
    },
    album: () => {
      const count = messageElement.querySelectorAll(".album__item").length;
      return `Album ${count} ảnh/video`;
    },
    sticker: () => {
      const container = messageElement.querySelector(MESSAGE_TYPE_SELECTORS.sticker);
      if (container) {
        const img = container.querySelector("img");
        if (img) {
          const desc = img.getAttribute("alt") || img.getAttribute("title") || img.getAttribute("data-title") || "";
          if (desc) {
            return `${loc("Nhãn dán: ", "Sticker: ")}${desc}`;
          }
        }
      }
      return loc("Nhãn dán", "Sticker");
    },
    link: () => {
      const container = messageElement.querySelector(".link-message");
      if (!container) return "";
      
      let messageText = "";
      const textContainer = container.querySelector('[data-component="text-container"]');
      if (textContainer) {
        const clone = textContainer.cloneNode(true);
        clone.querySelectorAll("a.text-is-link").forEach(el => el.remove());
        messageText = translateEmojisInElement(clone);
      }
      if (!messageText) {
        const textEl = container.querySelector(".text");
        if (textEl) messageText = translateEmojisInElement(textEl);
      }

      const title = container.querySelector(".link-message__link-title")?.textContent.trim();
      const prefix = loc("Liên kết: ", "Link: ");
      let linkText = "";
      
      if (title) {
          linkText = `${prefix}${title}`;
      } else {
          // Fallback: extract domain or short link text instead of reading the whole URL
          const urlText = container.querySelector("a.text-is-link")?.textContent.trim() || "";
          if (urlText) {
              try {
                  const url = new URL(urlText.startsWith("http") ? urlText : "http://" + urlText);
                  linkText = `${prefix}${url.hostname}`;
              } catch(e) {
                  linkText = `${prefix}${urlText.substring(0, 30)}${urlText.length > 30 ? "..." : ""}`;
              }
          } else {
              linkText = `${prefix}${loc("Tin nhắn liên kết", "Link message")}`;
          }
      }
      
      if (messageText) {
          return `${messageText}. ${linkText}`;
      }
      return linkText;
    },
    file: () => {
      const titleNode = messageElement.querySelector(
        ".file-message__content-title"
      );
      const filename = titleNode
        ? Array.from(titleNode.querySelectorAll("div"))
            .map((d) => d.textContent.trim())
            .join("")
        : "Tệp";
      const size =
        messageElement
          .querySelector(".file-message__content-info-size")
          ?.textContent.trim() || "";
      return `Tệp: ${filename}${size ? ", " + size : ""}`;
    },
    voice: () => {
      const rawDuration = messageElement
        .querySelector(".voice-message-normal__duration-wrapper, .voice-message-normal-old__duration-wrapper, [class*=\"duration-wrapper\"]")
        ?.textContent.trim();
      const duration = formatDuration(rawDuration);
      return `${loc("Tin nhắn thoại", "Voice message")}${duration ? `, ${duration}` : ""}`;
    },
    call: () => {
      const title =
        messageElement
          .querySelector(".call-message__title-wrapper")
          ?.textContent.trim() || "";
       return `Cuộc gọi: ${title}`;
    },
    date: () => {
      return messageElement
        .querySelector('[data-translate-inner="STR_DATE_TIME"]')
        ?.textContent.trim();
    },
  };

  const messageTypes = [
    { selector: MESSAGE_TYPE_SELECTORS.date, handler: handlers.date },
    { selector: MESSAGE_TYPE_SELECTORS.text, handler: handlers.text },
    { selector: MESSAGE_TYPE_SELECTORS.photo, handler: handlers.photo },
    { selector: MESSAGE_TYPE_SELECTORS.video, handler: handlers.video },
    { selector: MESSAGE_TYPE_SELECTORS.album, handler: handlers.album },
    { selector: MESSAGE_TYPE_SELECTORS.sticker, handler: handlers.sticker },
    { selector: MESSAGE_TYPE_SELECTORS.link, handler: handlers.link },
    { selector: MESSAGE_TYPE_SELECTORS.file, handler: handlers.file },
    { selector: MESSAGE_TYPE_SELECTORS.voice, handler: handlers.voice },
    { selector: MESSAGE_TYPE_SELECTORS.call, handler: handlers.call },
  ];

  for (const { selector, handler } of messageTypes) {
    if (messageElement.querySelector(selector)) {
      const content = handler();
      if (content) {
        const fullMessage = namePrefix ? `${namePrefix} ${content}` : content;
        return {
          content: fullMessage,
          announcement: time
            ? `${fullMessage}. ${time}`
            : fullMessage,
        };
      }
    }
  }

  const rawText = messageElement.innerText.trim();
  if (rawText) {
      return { content: rawText, announcement: rawText };
  }

  return {
    content: "",
    announcement: "",
  };
}

function performHighlight(id) {
  const el = state.messages.map.get(id);
  if (!el) return;

  state.messages.items.forEach((item) =>
    item.classList.remove(MESSAGE_HIGHLIGHT_CLASS)
  );

  state.messages.lastHoveredId = id;

  el.classList.add(MESSAGE_HIGHLIGHT_CLASS);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });

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

  const content = getMessageContent(el).announcement;
  
  if (focusRegion.textContent !== content) {
      focusRegion.textContent = content;
  }
  
  if (!state.menu.isOpen) {
      focusRegion.focus();
  }
  
  setFocusContext("messages");
}

function highlightMessageById(id, immediate = false) {
  if (navDebounceTimer) {
    clearTimeout(navDebounceTimer);
    navDebounceTimer = null;
  }

  if (immediate) {
    performHighlight(id);
  } else {
    navDebounceTimer = setTimeout(() => {
        performHighlight(id);
    }, 50);
  }
}

function navigateMessages(key) {
  updateMessageItems();
  const { ids, currentId } = state.messages;
  if (ids.length === 0) return;

  let currentIndex = -1;
  if (currentId && ids.includes(currentId)) {
    currentIndex = ids.indexOf(currentId);
  } else {
    currentIndex = ids.length - 1;
  }

  const currentEl = currentIndex !== -1 ? state.messages.map.get(ids[currentIndex]) : null;
  const isCurrentLink = currentEl && currentEl.querySelector(MESSAGE_TYPE_SELECTORS.link) !== null;

  if (key === "ArrowDown") {
    if (isCurrentLink && !state.messages.linkFocused) {
      state.messages.linkFocused = true;
      const linkEl = currentEl.querySelector("a.text-is-link");
      if (linkEl) {
        const title = currentEl.querySelector(".link-message__link-title")?.textContent.trim();
        if (title) {
          linkEl.setAttribute("aria-label", `${loc("Liên kết: ", "Link: ")}${title}`);
        } else {
          try {
            const urlText = linkEl.textContent.trim();
            const url = new URL(urlText.startsWith("http") ? urlText : "http://" + urlText);
            linkEl.setAttribute("aria-label", `${loc("Liên kết: ", "Link: ")}${url.hostname}`);
          } catch(e) {
            linkEl.setAttribute("aria-label", `${loc("Liên kết: ", "Link: ")}${linkEl.textContent}`);
          }
        }
        linkEl.setAttribute("tabindex", "0");
        linkEl.focus();
        return;
      }
    }
    currentIndex = Math.min(ids.length - 1, currentIndex + 1);
    state.messages.linkFocused = false;
  } else if (key === "ArrowUp") {
    if (isCurrentLink && state.messages.linkFocused) {
      state.messages.linkFocused = false;
      const newId = ids[currentIndex];
      highlightMessageById(newId, true);
      return;
    }
    currentIndex = Math.max(0, currentIndex - 1);
    const newEl = currentIndex !== -1 ? state.messages.map.get(ids[currentIndex]) : null;
    const isNewLink = newEl && newEl.querySelector(MESSAGE_TYPE_SELECTORS.link) !== null;
    if (isNewLink) {
      state.messages.linkFocused = true;
      state.messages.currentId = ids[currentIndex];
      highlightMessageById(ids[currentIndex], true);
      setTimeout(() => {
        const linkEl = newEl.querySelector("a.text-is-link");
        if (linkEl) {
          const title = newEl.querySelector(".link-message__link-title")?.textContent.trim();
          if (title) {
            linkEl.setAttribute("aria-label", `${loc("Liên kết: ", "Link: ")}${title}`);
          } else {
            try {
              const urlText = linkEl.textContent.trim();
              const url = new URL(urlText.startsWith("http") ? urlText : "http://" + urlText);
              linkEl.setAttribute("aria-label", `${loc("Liên kết: ", "Link: ")}${url.hostname}`);
            } catch(e) {
              linkEl.setAttribute("aria-label", `${loc("Liên kết: ", "Link: ")}${linkEl.textContent}`);
            }
          }
          linkEl.setAttribute("tabindex", "0");
          linkEl.focus();
        }
      }, 60);
      return;
    }
    state.messages.linkFocused = false;
  } else if (key === "R" || key === "End") {
    currentIndex = ids.length - 1;
    state.messages.linkFocused = false;
  }

  const newId = ids[currentIndex];
  state.messages.currentId = newId;
  highlightMessageById(newId, false);
}

// Auto-focus new messages observer
let messageObserver = null;
function initMessageObserver() {
    if (messageObserver) messageObserver.disconnect();
    
    // Find the wrapper using ID without hash
    const chatView = document.getElementById(SELECTORS.chatView.substring(1));
    if (!chatView) return;
    
    messageObserver = new MutationObserver((mutations) => {
        if (state.menu.isOpen) return;

        let hasNewMessages = false;
        
        for (const mut of mutations) {
            if (mut.addedNodes.length > 0) {
                for (const node of mut.addedNodes) {
                    if (node.nodeType === 1) { 
                        if (node.classList.contains('chat-item') || 
                            node.classList.contains('chat-date') ||
                            node.querySelector('.chat-item')) {
                            hasNewMessages = true;
                            break;
                        }
                    }
                }
            }
        }
        
        if (hasNewMessages) {
             updateMessageItems();
             const lastId = state.messages.ids[state.messages.ids.length - 1];
             if (lastId && lastId !== state.messages.currentId) {
                 state.messages.currentId = lastId;
                 highlightMessageById(lastId, false);
             }
        }
    });
    
    messageObserver.observe(chatView, { childList: true, subtree: true });
}

module.exports = {
  updateMessageItems,
  getMessageContent,
  highlightMessageById,
  navigateMessages,
  initMessageObserver
};
