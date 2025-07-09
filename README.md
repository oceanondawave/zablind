# Zablind (Beta version 1.3)

_A lightweight tool designed to assist visually impaired users in navigating Zalo. Currently available for Windows (only supports NVDA)._

> ⚠️ **Disclaimer**: This tool modifies internal files of the Zalo desktop app. Use at your own risk. Always back up your original `app.asar` file before proceeding.

---

✅ Latest Supported Zalo Version: 25.7.1

✅ What It Currently Supports

- Press <code>Ctrl + Shift + M</code> / <code>Ctrl + Shift + N</code> to navigate forward / backward through recent contacts. ⚠️ Avoid pressing too quickly. Zalo may load older contacts, causing lag. If this happens, press <code>Ctrl + Shift + 1</code> to jump to the first contact and try again.
- Press <code>Enter</code> to jump to that chat window.
- Press <code>Ctrl + Shift + R</code> to read the latest message.
- Press <code>Ctrl + Shift + K</code> / <code>Ctrl + Shift + L</code> to read the previous / next message.
- If the message is a voice or video message, press <code>Tab</code> to play it. If it's a video message, after pressing <code>Tab</code> to play, you can press <code>Space</code> once then press <code>Space</code> one more time to pause/play the video. If it's a photo, you can also press <code>Tab</code> to view it. This also works for an album (which contains many photos/videos), but you can only view the first photo/video in the album for now.
- Press <code>ESC</code> to stop watching/viewing the photos/videos.
- Press the <code>Application</code> / <code>Context Menu</code> key to open the menu for each message.
- Use <code>Up</code> / <code>Down</code> arrow keys to navigate options.
- Press <code>Enter</code> to choose an option.
- Press <code>ESC</code> to exit the menu (note: while in the menu, you cannot navigate messages).
- Press <code>Ctrl + Shift + E</code> to jump to the typing section to write a message.
- You can reply to an message (if you choose that option in the menu, you'll jump to the typing section automatically). When you're replying to a message, if you want to cancel, press <code>ESC</code> once then press <code>ESC</code> one more time to go back to the typing section.
- ⚠️ While using <code>Ctrl + Shift + K</code> / <code>Ctrl + Shift + L</code> to navigate messages, avoid pressing too quickly. Zalo may load older messages, causing lag or misreads. If this happens, press <code>Ctrl + Shift + R</code> to reset and return to the latest message.
- More features coming soon!

---

## 🧪 How to Build and Test

Update Zalo to the latest supported version.

Clone the repository:

```bash
git clone https://github.com/oceanondawave/zablind.git
```

Navigate to:

```
C:\Users\<your-user-name>\AppData\Local\Programs\Zalo\<latest-Zalo-version>\resources
```

Copy the `app.asar` file and `app.asar.unpacked` folder found in that `resources` folder into a new folder called `original` in the root of this project (create one first).

Move `zablind.js` and `preload-wrapper.js` from `extracted/main-dist/` and `popup-viewer.html` from `extracted/pc-dist/` into the project root.

Install the `asar` tool globally using npm:

```bash
npm install -g asar
```

Create a folder named `extracted` in the root directory.

Extract the original `app.asar` using:

```bash
asar extract original/app.asar extracted
```

Move `zablind.js` and `preload-wrapper.js` into:

```
extracted/main-dist/
```

Move `popup-viewer.html` into:

```
extracted/pc-dist/
```

Open `extracted/main-dist/main.js` and find the line:

```js
u.join(__dirname, "preload-render.js");
```

Replace it with:

```js
u.join(__dirname, "preload-wrapper.js");
```

(Optional) To open Dev Tools by default, locate the line:

```js
k = new s(this.mainOpts),
```

And change it to:

```js
k = new s(this.mainOpts),
k.webContents.openDevTools({ mode: "detach" }),
```

Make changes to `zablind.js` and `popup-viewer.html` as needed, then save the files.

Repack the `app.asar` using:

```bash
asar pack extracted app.asar
```

A new `app.asar` will appear in the root directory.

Replace the original `app.asar` file in the Zalo directory with the one you just created.

Run Zalo to test the changes.

---

## 🛑 Disclaimer

This project is developed for the benefit of the visually impaired Zalo community. Contributions, improvements, and feedback are welcome. Modifying proprietary software may violate terms of service. Use responsibly.
Feel free to reach me at: minh.ngntri@gmail.com.
