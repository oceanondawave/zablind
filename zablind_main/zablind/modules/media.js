// ======================
// Media Playback Management
// ======================

const { state } = require("./state.js");

function playMedia() {
  const currentId = state.messages.currentId;
  const message = state.messages.map.get(currentId);
  const currentMessage = message;
  if (!currentMessage) return;

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

  control.setAttribute("role", "button");
  control.setAttribute("tabindex", "0");

  setTimeout(() => {
    control.focus();
    control.click();
  }, 50);
}

module.exports = {
  playMedia,
};




