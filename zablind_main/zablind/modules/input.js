// ======================
// Chat Input Management
// ======================

const { SELECTORS } = require("./constants.js");

function focusChatInput() {
  const chatView = document.getElementById(SELECTORS.chatView.substring(1));
  const chatInput = document.getElementById(SELECTORS.chatInput.substring(1));
  const richInput = document.getElementById(SELECTORS.richInput.substring(1));

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

module.exports = {
  focusChatInput,
};




