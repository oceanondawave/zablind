// preload-wrapper.js

// Load the default preload that came with the app
require("./preload-render.js");

// Load your custom script
require("./zablind/index.js");

try {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.code === 'KeyI'))) {
      try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('zablind-toggle-devtools');
      } catch (err) {}
    }
  }, true);
} catch (e) {}
