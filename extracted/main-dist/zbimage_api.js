// const axios = require("axios");

const API_KEY = "zbimage";

let loadingAudio = null;

function playGettingLoop() {
  loadingAudio = new Audio("file://" + __dirname + "/audio_assets/getting.mp3");
  loadingAudio.loop = true;
  loadingAudio.play().catch(console.error);
}

function stopGettingLoop() {
  if (loadingAudio) {
    loadingAudio.pause();
    loadingAudio.currentTime = 0;
    loadingAudio = null;
  }
}

async function describeImageFromPath(imagePath) {
  playGettingLoop();

  try {
    const response = await fetch("http://127.0.0.1:47860/caption", {
      method: "POST",
      headers: {
        "X-Auth": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: imagePath }),
    });

    stopGettingLoop();

    const result = await response.json();
    return result || null;
  } catch (err) {
    stopGettingLoop();
    const failAudio = new Audio(
      "file://" + __dirname + "/audio_assets/fail.mp3"
    );
    failAudio.play().catch(console.error);
    console.error("❌ Failed to get caption:", err);
    return null;
  }
}

module.exports = {
  describeImageFromPath,
};
