// ======================
// Zablind Help Module
// ======================

const { state, setFocusContext } = require("./state.js");
const { loc, sleep } = require("./utils.js");

const shortcutsData = [
  {
    keys: ["Ctrl", "Shift", "H"],
    descVi: "Mở hoặc đóng bảng danh sách phím tắt này",
    descEn: "Open or close this shortcuts list",
    category: "General"
  },
  {
    keys: ["Ctrl", "Shift", "F"],
    descVi: "Chuyển đến ô tìm kiếm bạn bè, tin nhắn (hoặc ô tìm người nhận khi chia sẻ)",
    descEn: "Go to the search box (or recipient search in the Share dialog)",
    category: "Navigation"
  },
  {
    keys: ["Ctrl", "Shift", "M"],
    descVi: "Chuyển xuống cuộc trò chuyện hoặc kết quả tìm kiếm tiếp theo",
    descEn: "Move down to the next chat or search result",
    category: "Navigation"
  },
  {
    keys: ["Ctrl", "Shift", "N"],
    descVi: "Chuyển lên cuộc trò chuyện hoặc kết quả tìm kiếm phía trên",
    descEn: "Move up to the previous chat or search result",
    category: "Navigation"
  },
  {
    keys: ["Ctrl", "Shift", "1"],
    descVi: "Chọn nhanh cuộc trò chuyện đầu tiên trong danh sách",
    descEn: "Select the first chat in the list",
    category: "Navigation"
  },
  {
    keys: ["Ctrl", "Shift", "K"],
    descVi: "Đọc tin nhắn cũ hơn (lên trên)",
    descEn: "Move up to read an older message",
    category: "Messages"
  },
  {
    keys: ["Ctrl", "Shift", "L"],
    descVi: "Đọc tin nhắn mới hơn (xuống dưới)",
    descEn: "Move down to read a newer message",
    category: "Messages"
  },
  {
    keys: ["Ctrl", "Shift", "R"],
    descVi: "Chuyển nhanh đến tin nhắn mới nhất vừa nhận",
    descEn: "Jump to the latest message",
    category: "Messages"
  },
  {
    keys: ["Ctrl", "Shift", "E"],
    descVi: "Chuyển đến ô soạn tin nhắn để gõ chữ",
    descEn: "Go to the message typing box",
    category: "Navigation"
  },
  {
    keys: ["Ctrl", "Shift", "O"],
    descVi: "Mở danh sách chọn gửi tệp hoặc thư mục",
    descEn: "Open the menu to send a file or folder",
    category: "Actions"
  },
  {
    keys: ["Ctrl", "Shift", "T"],
    descVi: "Chuyển qua lại giữa mục Ưu tiên và mục Khác",
    descEn: "Switch between Focus and Other chat tabs",
    category: "Navigation"
  },
  {
    keys: ["Ctrl", "Shift", "C"],
    descVi: "Chọn nút gọi thoại (nhấn Enter để gọi ngay, hoặc bấm Tab để chuyển sang gọi video rồi nhấn Enter)",
    descEn: "Go to the call buttons (press Enter for audio call, or Tab then Enter for video call)",
    category: "Calls"
  },
  {
    keys: ["A"],
    descVi: "Nhận cuộc gọi đến (chỉ dùng khi đang mở cửa sổ cuộc gọi)",
    descEn: "Answer incoming call (only when the call window is focused)",
    category: "Calls"
  },
  {
    keys: ["Ctrl", "A"],
    descVi: "Nhận cuộc gọi video nhưng tắt sẵn camera (chỉ dùng khi đang mở cửa sổ cuộc gọi)",
    descEn: "Answer video call without camera (only when the call window is focused)",
    category: "Calls"
  },
  {
    keys: ["Ctrl", "Shift", "A"],
    descVi: "Nhận cuộc gọi video nhưng tắt sẵn camera (cách bấm thứ hai, khi đang ở cửa sổ cuộc gọi)",
    descEn: "Answer video call without camera (alternate shortcut, when call window is focused)",
    category: "Calls"
  },
  {
    keys: ["D"],
    descVi: "Từ chối cuộc gọi đến (chỉ dùng khi đang mở cửa sổ cuộc gọi)",
    descEn: "Decline incoming call (only when the call window is focused)",
    category: "Calls"
  },
  {
    keys: ["C"],
    descVi: "Bật hoặc tắt camera khi đang gọi (chỉ dùng khi đang mở cửa sổ cuộc gọi)",
    descEn: "Turn camera on or off during a call (only when the call window is focused)",
    category: "Calls"
  },
  {
    keys: ["M"],
    descVi: "Bật hoặc tắt micrô khi đang gọi (chỉ dùng khi đang mở cửa sổ cuộc gọi)",
    descEn: "Mute or unmute microphone during a call (only when the call window is focused)",
    category: "Calls"
  },
  {
    keys: ["E"],
    descVi: "Kết thúc cuộc gọi (chỉ dùng khi đang mở cửa sổ cuộc gọi)",
    descEn: "Hang up the call (only when the call window is focused)",
    category: "Calls"
  },
  {
    keys: ["Ctrl", "Shift", "G"],
    descVi: "Đổi ngôn ngữ sử dụng của Zalo (Tiếng Việt / Tiếng Anh)",
    descEn: "Switch Zalo display language (Vietnamese / English)",
    category: "General"
  },
  {
    keys: ["Ctrl", "Shift", "B"],
    descVi: "Mở cửa sổ tìm và kết bạn bằng số điện thoại",
    descEn: "Open the Add Friend by phone number window",
    category: "Actions"
  },
  {
    keys: ["Ctrl", "Shift", "S"],
    descVi: "Mở cửa sổ Đồng bộ hoặc Sao lưu tin nhắn với điện thoại",
    descEn: "Open the message Sync and Backup window",
    category: "Actions"
  },
  {
    keys: ["Ctrl", "Shift", "Q"],
    descVi: "Mở cửa sổ Đăng xuất hoặc Khởi động lại Zalo",
    descEn: "Open the Log Out / Restart Zalo window",
    category: "Actions"
  },
  {
    keys: ["Ctrl", "Shift", "D"],
    descVi: "Phóng to mã QR toàn màn hình để dễ quét (tại màn hình đăng nhập)",
    descEn: "Open login QR code fullscreen in browser (on login screen)",
    category: "General"
  },
  {
    keys: ["Ctrl", "Shift", "X"],
    descVi: "Bật hoặc tắt chế độ dùng phím mũi tên đọc tự do (như khi chưa cài Zablind; tự tắt lại khi mở lại Zalo)",
    descEn: "Turn free arrow-key reading on or off (turns off automatically when Zalo restarts)",
    category: "General"
  },
  {
    keys: ["Menu / Shift+F10"],
    descVi: "Mở menu tùy chọn nhanh: Ghim, Tắt/Bật thông báo, Chuyển mục cho hội thoại hoặc thao tác trên tin nhắn",
    descEn: "Open quick options menu for the selected chat or message (Pin, Mute, Move tab, Actions)",
    category: "Actions"
  },
  {
    keys: ["Tab"],
    descVi: "Mở ảnh, xem video hoặc nghe tin nhắn thoại đang chọn",
    descEn: "Open photo, video, or play the selected voice message",
    category: "Messages"
  },
  {
    keys: ["ArrowDown"],
    descVi: "Trong tin nhắn có đường dẫn web: đi xuống để chọn vào đường dẫn đó",
    descEn: "On a link message: move down onto the web link",
    category: "Messages"
  },
  {
    keys: ["ArrowUp"],
    descVi: "Trong tin nhắn có đường dẫn web: quay lại đọc nội dung tin nhắn",
    descEn: "On a link message: move back up to the message text",
    category: "Messages"
  },
  {
    keys: ["Enter"],
    descVi: "Mở trang web của đường dẫn đang chọn",
    descEn: "Open the selected web link",
    category: "Messages"
  },
  {
    keys: ["Escape"],
    descVi: "Đóng cửa sổ, menu hoặc ảnh/video đang mở",
    descEn: "Close the open dialog, menu, or photo/video viewer",
    category: "General"
  },
  {
    keys: ["Ctrl", "Shift", "U"],
    descVi: "Kiểm tra và cập nhật phiên bản mới cho Zablind",
    descEn: "Check for Zablind updates",
    category: "General"
  },
  {
    keys: ["ArrowDown"],
    descVi: "Chuyển xuống người nhận tiếp theo (khi đang ở cửa sổ Chia sẻ tin nhắn)",
    descEn: "Move down to the next person (inside the Share dialog)",
    category: "Navigation"
  },
  {
    keys: ["ArrowUp"],
    descVi: "Chuyển lên người nhận phía trên (khi đang ở cửa sổ Chia sẻ tin nhắn)",
    descEn: "Move up to the previous person (inside the Share dialog)",
    category: "Navigation"
  }
];

let previousActiveElement = null;
let previousFocusContext = "conversations";
let stylesInjected = false;

function injectHelpStyles() {
  if (stylesInjected) return;
  
  const style = document.createElement("style");
  style.id = "zablind-help-styles";
  style.textContent = `
    .zablind-modal-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background-color: rgba(0, 0, 0, 0.75) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      z-index: 100000 !important;
      animation: zb-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    }

    .zablind-modal {
      width: 90% !important;
      max-width: 680px !important;
      height: 80vh !important;
      max-height: 600px !important;
      background: rgba(22, 22, 28, 0.92) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) !important;
      display: flex !important;
      flex-direction: column !important;
      color: #e2e8f0 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      overflow: hidden !important;
      animation: zb-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      outline: none !important;
    }

    .zablind-modal:focus {
      border-color: #0084ff !important;
      box-shadow: 0 0 0 3px rgba(0, 132, 255, 0.4), 0 20px 40px rgba(0, 0, 0, 0.6) !important;
    }

    .zablind-modal-header {
      padding: 20px 24px !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
      display: grid !important;
      grid-template-columns: 1fr auto !important;
      gap: 16px !important;
      position: relative !important;
      align-items: center !important;
    }

    .zablind-modal-title {
      font-size: 20px !important;
      font-weight: 700 !important;
      margin: 0 !important;
      color: #ffffff !important;
      background: linear-gradient(135deg, #0084ff, #00c6ff) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
    }

    .zablind-search-wrapper {
      grid-column: 1 / -1 !important;
      width: 100% !important;
    }

    .zablind-modal-header input {
      width: 100% !important;
      padding: 12px 16px !important;
      background: rgba(255, 255, 255, 0.05) !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px !important;
      color: #ffffff !important;
      font-size: 14px !important;
      transition: all 0.2s ease !important;
      box-sizing: border-box !important;
    }

    .zablind-modal-header input:focus {
      outline: none !important;
      border-color: #0084ff !important;
      background: rgba(255, 255, 255, 0.08) !important;
      box-shadow: 0 0 0 3px rgba(0, 132, 255, 0.3) !important;
    }

    .zablind-close-btn {
      background: transparent !important;
      border: none !important;
      color: #a0aec0 !important;
      cursor: pointer !important;
      padding: 6px !important;
      border-radius: 50% !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      transition: all 0.2s ease !important;
      position: absolute !important;
      top: 16px !important;
      right: 16px !important;
      outline: none !important;
    }

    .zablind-close-btn:hover {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #ffffff !important;
      transform: rotate(90deg) !important;
    }

    .zablind-close-btn:focus {
      background: rgba(255, 255, 255, 0.1) !important;
      color: #ffffff !important;
      box-shadow: 0 0 0 2px #0084ff !important;
    }

    .zablind-modal-body {
      flex: 1 !important;
      padding: 16px 24px !important;
      overflow-y: auto !important;
      background: rgba(0, 0, 0, 0.15) !important;
      outline: none !important;
    }

    .zablind-modal-body::-webkit-scrollbar {
      width: 8px !important;
    }

    .zablind-modal-body::-webkit-scrollbar-track {
      background: transparent !important;
    }

    .zablind-modal-body::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12) !important;
      border-radius: 4px !important;
    }

    .zablind-modal-body::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2) !important;
    }

    .zablind-shortcuts-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
    }

    .zablind-shortcut-item {
      display: grid !important;
      grid-template-columns: 180px 1fr !important;
      gap: 16px !important;
      padding: 12px 16px !important;
      background: rgba(255, 255, 255, 0.02) !important;
      border: 1px solid rgba(255, 255, 255, 0.05) !important;
      border-radius: 10px !important;
      align-items: center !important;
      transition: all 0.2s ease !important;
    }

    .zablind-shortcut-item:hover {
      background: rgba(255, 255, 255, 0.04) !important;
      border-color: rgba(0, 132, 255, 0.25) !important;
      transform: translateY(-1px) !important;
    }

    .zablind-shortcut-item:focus {
      outline: none !important;
      background: rgba(255, 255, 255, 0.08) !important;
      border-color: #0084ff !important;
      box-shadow: 0 0 0 2px rgba(0, 132, 255, 0.4) !important;
    }

    .zablind-keys-wrapper {
      display: flex !important;
      gap: 4px !important;
      flex-wrap: wrap !important;
    }

    .zablind-keycap {
      font-family: Consolas, Monaco, "Andale Mono", monospace !important;
      background: linear-gradient(180deg, #2d3748 0%, #1a202c 100%) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      border-bottom: 3px solid rgba(255, 255, 255, 0.1) !important;
      box-shadow: 0 2px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3) !important;
      border-radius: 6px !important;
      color: #ffffff !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 4px 8px !important;
      line-height: 1.2 !important;
    }

    .zablind-desc-wrapper {
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
    }

    .zablind-desc-vi {
      font-size: 14px !important;
      font-weight: 500 !important;
      color: #e2e8f0 !important;
    }

    .zablind-desc-en {
      font-size: 12px !important;
      font-weight: 400 !important;
      color: #718096 !important;
    }

    .zablind-help-empty {
      text-align: center !important;
      padding: 40px !important;
      color: #a0aec0 !important;
      font-size: 15px !important;
      font-weight: 500 !important;
    }

    .zablind-modal-footer {
      padding: 16px 24px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      font-size: 12px !important;
      color: #718096 !important;
    }

    .zablind-btn-primary {
      background: #0084ff !important;
      border: none !important;
      border-radius: 8px !important;
      color: #ffffff !important;
      padding: 8px 16px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
      outline: none !important;
    }

    .zablind-btn-primary:hover {
      background: #006bde !important;
    }

    .zablind-btn-primary:focus {
      background: #006bde !important;
      box-shadow: 0 0 0 2px #16161c, 0 0 0 4px #0084ff !important;
    }

    /* Sidebar Help Button */
    .zablind-help-tab-item {
      width: 48px !important;
      height: 48px !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      cursor: pointer !important;
      color: rgba(255, 255, 255, 0.65) !important;
      transition: all 0.2s ease !important;
      border-radius: 8px !important;
      margin: 6px auto !important;
      position: relative !important;
      outline: none !important;
    }

    .zablind-help-tab-item:hover {
      background-color: rgba(255, 255, 255, 0.1) !important;
      color: #ffffff !important;
    }

    .zablind-help-tab-item:focus {
      background-color: rgba(255, 255, 255, 0.15) !important;
      color: #ffffff !important;
      box-shadow: 0 0 0 2px #0084ff !important;
    }

    .zablind-help-tab-item svg {
      width: 22px !important;
      height: 22px !important;
    }

    @keyframes zb-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes zb-slide-up {
      from { transform: translateY(30px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function renderShortcuts(query = "") {
  const container = document.getElementById("zablind-shortcuts-list");
  if (!container) return 0;
  
  const cleanQuery = query.toLowerCase().trim();
  const filtered = shortcutsData.filter((item) => {
    return (
      item.keys.join(" ").toLowerCase().includes(cleanQuery) ||
      item.descVi.toLowerCase().includes(cleanQuery) ||
      item.descEn.toLowerCase().includes(cleanQuery) ||
      item.category.toLowerCase().includes(cleanQuery)
    );
  });
  
  container.innerHTML = "";
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "zablind-help-empty";
    empty.innerText = loc(
      "Không tìm thấy phím tắt phù hợp.",
      "No matching shortcuts found."
    );
    container.appendChild(empty);
    return 0;
  }
  
  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "zablind-shortcut-item";
    row.setAttribute("tabindex", "0");
    row.setAttribute("role", "listitem");
    
    // Set a clean aria-label matching active language to avoid screen reader noise
    const keyString = item.keys.join(" + ");
    const descString = loc(item.descVi, item.descEn);
    const labelString = loc(
      `Phím ${keyString}: ${descString}.`,
      `Shortcut ${keyString}: ${descString}.`
    );
    row.setAttribute("aria-label", labelString);
    
    // Keycaps
    const keysWrapper = document.createElement("div");
    keysWrapper.className = "zablind-keys-wrapper";
    item.keys.forEach((k) => {
      const kbd = document.createElement("kbd");
      kbd.className = "zablind-keycap";
      kbd.innerText = k;
      keysWrapper.appendChild(kbd);
    });
    
    // Descriptions
    const descWrapper = document.createElement("div");
    descWrapper.className = "zablind-desc-wrapper";
    
    const viText = document.createElement("div");
    viText.className = "zablind-desc-vi";
    viText.innerText = item.descVi;
    
    const enText = document.createElement("div");
    enText.className = "zablind-desc-en";
    enText.innerText = item.descEn;
    
    descWrapper.appendChild(viText);
    descWrapper.appendChild(enText);
    
    row.appendChild(keysWrapper);
    row.appendChild(descWrapper);
    container.appendChild(row);
  });
  
  return filtered.length;
}

let searchDebounce = null;
function handleSearchInput(e, liveRegion) {
  if (searchDebounce) {
    clearTimeout(searchDebounce);
  }
  
  const query = e.target.value;
  searchDebounce = setTimeout(() => {
    const count = renderShortcuts(query);
    const { announce } = require("./accessibility.js");
    
    if (count > 0) {
      announce(
        loc(`Tìm thấy ${count} kết quả.`, `Found ${count} matching shortcuts.`),
        liveRegion
      );
    } else {
      announce(
        loc("Không tìm thấy phím tắt phù hợp.", "No matching shortcuts found."),
        liveRegion
      );
    }
  }, 400);
}

function openHelpModal(liveRegion) {
  injectHelpStyles();
  
  // If already open, close it (acting as a toggle)
  if (document.getElementById("zablind-help-modal-overlay")) {
    closeHelpModal(liveRegion);
    return;
  }

  previousActiveElement = document.activeElement;
  previousFocusContext = state.focusContext;
  
  const overlay = document.createElement("div");
  overlay.id = "zablind-help-modal-overlay";
  overlay.className = "zablind-modal-overlay";
  
  overlay.innerHTML = `
    <div id="zablind-help-modal" class="zablind-modal" role="dialog" aria-modal="true" tabindex="-1">
      <div class="zablind-modal-header">
        <h2 class="zablind-modal-title">${loc("Danh sách phím tắt Zablind", "Zablind Keyboard Shortcuts")}</h2>
        <div class="zablind-search-wrapper">
          <input type="text" id="zablind-help-search" placeholder="${loc("Tìm nhanh phím tắt... (ví dụ: gọi, tin nhắn, tìm kiếm...)", "Search shortcuts... (e.g. call, message, search...)")}" tabindex="0" />
        </div>
        <button id="zablind-help-close-btn" class="zablind-close-btn" aria-label="${loc("Đóng danh sách phím tắt", "Close shortcuts panel")}" tabindex="0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="zablind-modal-body" tabindex="-1">
        <div id="zablind-shortcuts-list" class="zablind-shortcuts-list">
          <!-- Dynamic List -->
        </div>
      </div>
      <div class="zablind-modal-footer">
        <span id="zablind-help-version-span" tabindex="0" aria-label="${loc("Zablind hỗ trợ Zalo cho người khiếm thị, phiên bản " + require('../config.js').version, "Zablind for visually impaired Zalo users, version " + require('../config.js').version)}">Zablind - v${require('../config.js').version}</span>
        <button id="zablind-help-footer-close" class="zablind-btn-primary" tabindex="0">${loc("Đóng", "Close")}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Hide background elements from screen readers
  const siblings = Array.from(document.body.children);
  siblings.forEach((child) => {
    if (child.id !== "zablind-help-modal-overlay" && child.tagName !== "SCRIPT" && child.tagName !== "STYLE") {
      const origHidden = child.getAttribute("aria-hidden");
      if (origHidden !== null) {
        child.setAttribute("data-zablind-orig-aria-hidden", origHidden);
      }
      child.setAttribute("aria-hidden", "true");
    }
  });
  
  // Render all shortcuts initially
  renderShortcuts("");
  
  // Bind search event
  const searchInput = overlay.querySelector("#zablind-help-search");
  searchInput.addEventListener("input", (e) => handleSearchInput(e, liveRegion));
  
  // Bind close buttons
  const closeBtn = overlay.querySelector("#zablind-help-close-btn");
  closeBtn.addEventListener("click", () => closeHelpModal(liveRegion));
  
  const footerClose = overlay.querySelector("#zablind-help-footer-close");
  footerClose.addEventListener("click", () => closeHelpModal(liveRegion));
  
  // Close when clicking outside modal body
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeHelpModal(liveRegion);
    }
  });

  setFocusContext("help_modal");
  
  // Announcement
  const { announce } = require("./accessibility.js");
  announce(
    loc(
      `Đã mở bảng phím tắt Zablind. Có ${shortcutsData.length} phím tắt. Đang ở ô tìm kiếm.`,
      `Shortcuts list opened. ${shortcutsData.length} shortcuts available. Focused on search box.`
    ),
    liveRegion
  );
  
  // Focus Search Input
  setTimeout(() => {
    if (searchInput) {
      searchInput.focus();
    }
  }, 100);
}

function closeHelpModal(liveRegion) {
  try {
    const overlay = document.getElementById("zablind-help-modal-overlay");
    if (!overlay) return;
    
    // Restore background elements
    const siblings = Array.from(document.body.children);
    siblings.forEach((child) => {
      try {
        if (child.id !== "zablind-help-modal-overlay") {
          const origHidden = child.getAttribute("data-zablind-orig-aria-hidden");
          if (origHidden !== null) {
            child.setAttribute("aria-hidden", origHidden);
            child.removeAttribute("data-zablind-orig-aria-hidden");
          } else {
            child.removeAttribute("aria-hidden");
          }
        }
      } catch (err) {
        console.error("[HELP-MODAL] Error restoring sibling:", err);
      }
    });

    overlay.remove();
    
    if (previousActiveElement && document.body.contains(previousActiveElement)) {
      try {
        previousActiveElement.focus();
      } catch (err) {
        console.error("[HELP-MODAL] Error restoring focus:", err);
      }
    }
    
    setFocusContext(previousFocusContext);
    
    try {
      const { announce } = require("./accessibility.js");
      announce(loc("Đã đóng bảng trợ giúp.", "Help shortcuts panel closed."), liveRegion);
    } catch (err) {
      console.error("[HELP-MODAL] Error announcing close:", err);
    }
  } catch (criticalErr) {
    console.error("[HELP-MODAL] Critical error in closeHelpModal:", criticalErr);
  }
}

function handleHelpModalKeys(event, liveRegion) {
  try {
    const k = event.key;
    const overlay = document.getElementById("zablind-help-modal-overlay");
    if (!overlay) return;
    
    const searchInput = document.getElementById("zablind-help-search");
    const closeBtn = document.getElementById("zablind-help-close-btn");
    const footerClose = document.getElementById("zablind-help-footer-close");
    
    // Dynamically query visible shortcut rows
    const shortcutRows = Array.from(document.querySelectorAll(".zablind-shortcut-item"));
    
    const versionSpan = document.getElementById("zablind-help-version-span");
    
    // Build items array in tab sequence order
    const items = [
      searchInput,
      ...shortcutRows,
      closeBtn,
      versionSpan,
      footerClose
    ].filter(Boolean);
    
    const active = document.activeElement;
    
    if (k === "Escape" || k === "Esc") {
      closeHelpModal(liveRegion);
      return;
    }
    
    if (k === "Enter" || k === " ") {
      if (active === closeBtn || active === footerClose) {
        closeHelpModal(liveRegion);
        return;
      }
      
      // Programmatically click buttons to trigger event handlers under prevented defaults
      if (active && (active.tagName === "BUTTON" || active.getAttribute("role") === "button")) {
        active.click();
        return;
      }
    }
  
  if (k === "Tab") {
    event.preventDefault();
    const isShift = event.shiftKey;
    let idx = items.indexOf(active);
    if (idx === -1) {
      idx = isShift ? items.length - 1 : 0;
    }
    const step = isShift ? -1 : 1;
    const next = items[(idx + step + items.length) % items.length];
    next.focus();
    
    // Announce focused element
    const { announce } = require("./accessibility.js");
    if (next === searchInput) {
      announce(loc("Ô tìm kiếm phím tắt", "Search shortcuts box"), liveRegion);
    } else if (next === closeBtn) {
      announce(loc("Nút đóng", "Close button"), liveRegion);
    } else if (next === footerClose) {
      announce(loc("Nút đóng", "Close button"), liveRegion);
    }
  }
  } catch (err) {
    console.error("[HELP-MODAL] Error in handleHelpModalKeys:", err);
  }
}

function injectHelpButton() {
  injectHelpStyles();
  
  const settingsBtn = document.querySelector('[data-id="div_Main_TabSetting"]');
  if (settingsBtn && !document.getElementById("zablind-help-tab-btn")) {
    const helpBtn = document.createElement("div");
    helpBtn.id = "zablind-help-tab-btn";
    helpBtn.className = "zablind-help-tab-item nav-item";
    helpBtn.setAttribute("title", loc("Trợ giúp phím tắt Zablind (Ctrl+Shift+H)", "Zablind Keyboard Shortcuts Help (Ctrl+Shift+H)"));
    helpBtn.setAttribute("tabindex", "-1");
    helpBtn.setAttribute("role", "button");
    helpBtn.setAttribute("aria-label", loc("Trợ giúp phím tắt Zablind", "Zablind Keyboard Shortcuts Help"));
    
    helpBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    `;
    
    helpBtn.addEventListener("click", () => {
      openHelpModal();
    });
    
    settingsBtn.parentNode.insertBefore(helpBtn, settingsBtn);
  }
}

module.exports = {
  openHelpModal,
  closeHelpModal,
  handleHelpModalKeys,
  injectHelpButton
};
