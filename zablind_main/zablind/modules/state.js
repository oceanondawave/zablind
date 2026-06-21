// ======================
// State Management
// ======================

const state = {
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
    isOpen: false,
  },
  // Active Navigation Context
  focusContext: "conversations", // default
  hasAnnouncedLoginQR: false,
  previousActiveElement: null,
  previousFocusContext: "conversations",
};

function updateMenuState(items, index) {
  state.menu.items = items;
  state.menu.currentIndex = index;
  state.menu.isOpen = items.length > 0;
}

function resetMenuState() {
  state.menu.items = [];
  state.menu.currentIndex = -1;
  state.menu.isOpen = false;
  // Note: We do NOT reset focusContext here because we usually 
  // return to the previous context (e.g. messages)
}

function setFocusContext(context) {
    if (["conversations", "messages", "search", "search_results", "input", "call_buttons", "add_friend_btn", "add_friend_input", "logout_modal", "sync_modal", "login_qr", "find_friend_modal", "help_modal"].includes(context)) {
        state.focusContext = context;
    }
}

module.exports = {
  state,
  updateMenuState,
  resetMenuState,
  setFocusContext
};
