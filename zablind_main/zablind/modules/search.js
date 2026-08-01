// ======================
// Search & Contact Management
// ======================

const { SELECTORS } = require("./constants.js");
const { state, setFocusContext } = require("./state.js");
const { announce } = require("./accessibility.js");
const { simulateHover, sleep, loc } = require("./utils.js");

async function focusContactSearch(liveRegion) {
  let searchInput = document.getElementById("contact-search-input");
  if (!searchInput) {
      searchInput = document.querySelector('[data-id="txt_Main_Search"]');
  }
  
  if (searchInput) {
    // PATTERN FROM input.js: Focus a reliable container first
    // We focus the document body or main wrapper to 'reset' focus state
    document.body.tabIndex = -1; // ensure body is focusing-capable if needed, usually is
    document.body.focus();
    
    await sleep(50);

    if (searchInput.getAttribute("tabindex") === "-1") {
        searchInput.setAttribute("tabindex", "0");
    }

    // Attempt to click the container/placeholder
    const placeholder = searchInput.previousElementSibling;
    if (placeholder && placeholder.classList.contains("fake-textholder")) {
        placeholder.click();
    } else {
        // Try clicking parent as well
        if (searchInput.parentElement) searchInput.parentElement.click();
        searchInput.click();
    }
    
    // Delay again before final focus
    await sleep(50);
    
    searchInput.focus();
    searchInput.select();
    
    setFocusContext("search");
    announce(loc("Tìm kiếm danh bạ", "Search contacts"), liveRegion);
  } else {
    announce(loc("Lỗi không tìm thấy ô tìm kiếm", "Search box not found"), liveRegion);
  }
}

function handleSearchNavigation(key, liveRegion) {
  if (key === "ArrowDown" || key === "ArrowUp") {
    const { navigateConversations } = require("./conversations.js");
    navigateConversations(key, liveRegion, true); 
  } else if (key === "Tab") {
     const addFriendBtn = document.querySelector(SELECTORS.addFriendBtn);
     if (addFriendBtn) {
       const target = addFriendBtn.closest('.clickable') || addFriendBtn;
       
       if (!target.getAttribute("tabindex") || target.getAttribute("tabindex") === "-1") {
           target.setAttribute("tabindex", "0");
       }
       target.focus();
       
       setFocusContext("add_friend_btn");
       announce(loc("Nút Thêm bạn", "Add friend button"), liveRegion);
     }
  }
}

function handleAddFriendNavigation(key, liveRegion) {
  if (key === "Enter") {
    const addFriendBtn = document.querySelector(SELECTORS.addFriendBtn);
    if (addFriendBtn) {
      // Simulate full click
      const target = addFriendBtn.closest('.clickable') || addFriendBtn;
      const opts = { bubbles: true, cancelable: true, view: window };
      target.dispatchEvent(new MouseEvent("mousedown", opts));
      target.dispatchEvent(new MouseEvent("mouseup", opts));
      target.click();

      setTimeout(() => {
        const phoneInput = document.querySelector(SELECTORS.addFriendPhoneInput);
        if (phoneInput) {
          phoneInput.focus();
          setFocusContext("add_friend_input");
          announce(loc("Nhập số điện thoại", "Enter phone number"), liveRegion);
        }
      }, 500);
    }
  } else if (key === "Tab") {
     focusContactSearch(liveRegion);
  }
}

function handleFriendProfileNavigation(key, liveRegion) {
    const addBtn = document.querySelector(SELECTORS.profileAddFriend);
    const chatBtn = document.querySelector(SELECTORS.profileChat);
    if (!addBtn && !chatBtn) return;
    
    if (key === "Tab" || key === "ArrowRight" || key === "ArrowLeft") {
        if (document.activeElement === addBtn && chatBtn) {
            chatBtn.focus();
            announce(loc("Nút Nhắn tin", "Chat button"), liveRegion);
        } else if (addBtn) {
            addBtn.focus();
            announce(loc("Nút Kết bạn", "Add friend button"), liveRegion);
        }
    }
}

module.exports = {
  focusContactSearch,
  handleSearchNavigation,
  handleAddFriendNavigation,
  handleFriendProfileNavigation
};
