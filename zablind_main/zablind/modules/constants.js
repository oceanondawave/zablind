// ======================
// Constants Configuration
// ======================

const HIGHLIGHT_CLASS = "custom-hover-highlight";
const MESSAGE_HIGHLIGHT_CLASS = "highlight-chat-message";

const ALLOWED_MENU_KEYS = new Set([
  "STR_REPLY_MSG",
  "STR_COPY_TEXT",
  "STR_COPY_LINK",
  "STR_COPY_PHOTO",
  "STR_SAVE_TO_DEVICE",
  "STR_DELETE_MSG_FOR_ME",
  "STR_DELETE_MSG",
  "STR_RECALL_MSG",
  "STR_CHOOSE_FILE_COMPUTER",
  "STR_CHOOSE_FOLDER_COMPUTER",
]);

const APP_VERSION = "Zablind Beta 1.6";

// Selectors
const SELECTORS = {
  conversations: ".conv-item",
  // Added .link-message here to ensure standalone links are caught
  messages: ".chat-item, .chat-date, .link-message", 
  typingIndicator: ".doing-something.message-view__typing",
  menuPopup: ".popover-v3",
  menuItems: ".zmenu-item",
  attachmentBtn: '[data-translate-title="STR_TIP_ATTACH_FILE"]',
  chatView: "#chatView",
  chatInput: "#chatInput",
  richInput: "#richInput",
  
  // New Selectors
  contactSearchInput: '[data-id="txt_Main_Search"]',
  contactSearchResults: ".conv-item, .search-message__item, .list__moremsg, .search-message-filter__chip, .search-message-filter__chip .fa-close_24, .zmenu-item, .cal-preview-v3, .cal-preview-v3 .fa-close_24, .cal-item, .cal-title [icon], .cal-extend .z--btn--v2",
  addFriendBtn: '[data-id="btn_Main_AddFrd"]',
  addFriendPhoneInput: '[data-id="txt_Main_AddFrd_Phone"]',
  
  // Conversation Tabs
  tabFocused: '[data-translate-inner="STR_TAB_CONV_FOCUS"]',
  tabOther: '[data-translate-inner="STR_TAB_CONV_OTHER"]',
  
  // User menu
  userAvatarBtn: '[idelement="avatar"]',
  logoutItem: '[data-translate-inner="STR_MENU_LOGOUT"]',
  
  // Profile
  profileAddFriend: '[data-translate-inner="STR_PROFILE_ADD_FRIEND"]',
  profileChat: '[data-translate-inner="STR_CHAT"]',
  
  // General
  clickable: ".clickable",
};

// Message type selectors
const MESSAGE_TYPE_SELECTORS = {
  date: '[data-translate-inner="STR_DATE_TIME"]',
  text: ".text-message__container",
  photo: ".img-msg-v2.photo-message-v2",
  video: ".video-message__non-caption-wrapper, .video-message__w-caption-wrapper",
  album: ".card--group-photo",
  sticker: ".sticker",
  link: ".link-message",
  file: ".file-message__container",
  voice: ".voice-message, .voice-message-old, [class*=\"voice-message\"]",
  call: ".call-message",
};

module.exports = {
  HIGHLIGHT_CLASS,
  MESSAGE_HIGHLIGHT_CLASS,
  ALLOWED_MENU_KEYS,
  APP_VERSION,
  SELECTORS,
  MESSAGE_TYPE_SELECTORS,
};
