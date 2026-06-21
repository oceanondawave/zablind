# Zablind Modular Structure

This directory contains the refactored modular version of Zablind accessibility script.

## Directory Structure

```
zablind/
├── index.js                           # Main entry point (47 lines)
├── modules/
│   ├── accessibility.js               # Accessibility utilities (58 lines)
│   ├── announcements.js               # Welcome message & typing indicator (60 lines)
│   ├── constants.js                   # Configuration constants (60 lines)
│   ├── conversations.js               # Conversation list navigation (94 lines)
│   ├── input.js                       # Chat input handling (31 lines)
│   ├── keyboard.js                    # Keyboard event handler (103 lines)
│   ├── media.js                       # Media playback control (38 lines)
│   ├── menu.js                        # Context & attachment menus (221 lines)
│   ├── messages.js                    # Message parsing & navigation (269 lines)
│   ├── state.js                       # State management (57 lines)
│   └── utils.js                       # Utility functions (69 lines)
```

## Module Responsibilities

### Core Modules

- **index.js**: Main entry point that initializes all modules and sets up event listeners
- **constants.js**: All configuration constants, selectors, and allowed menu keys
- **state.js**: Centralized state management for conversations, messages, and menus
- **utils.js**: Shared utility functions (hover simulation, duration formatting, etc.)

### Feature Modules

- **accessibility.js**: ARIA live region, announcements, and accessibility setup
- **announcements.js**: Welcome message and typing indicator monitoring
- **conversations.js**: Conversation list management and navigation
- **messages.js**: Message parsing, content extraction, and navigation
- **menu.js**: Context menu and attachment menu handling
- **input.js**: Chat input focus management
- **media.js**: Photo, video, and voice message playback
- **keyboard.js**: Centralized keyboard event handling

## Improvements Over Monolithic Version

### Code Organization
- **Before**: Single 923-line file
- **After**: 12 focused modules totaling ~1107 lines
- Logic is separated by concern, making it easier to understand and maintain

### Maintainability
- Each module has a single, well-defined responsibility
- Functions are grouped logically
- Constants are centralized
- State is managed in one place

### Development Workflow
- Easier to locate specific functionality
- Reduced risk of merge conflicts
- Simpler unit testing
- Better code reuse opportunities

### Bug Fixes
- Fixed `state.messages.currentIndex` bug (should be `currentId`)
- Fixed `isTyping` reference bug (should be function call `isTyping()`)

## Module Dependencies

```
index.js
  ├── accessibility.js
  ├── announcements.js
  ├── conversations.js
  ├── messages.js
  └── keyboard.js
      ├── state.js
      ├── constants.js
      ├── utils.js
      ├── conversations.js
      ├── messages.js
      ├── menu.js
      ├── input.js
      └── media.js
          └── state.js
      └── accessibility.js
```

## Usage

The modular version is loaded via `preload-wrapper.js`:

```javascript
require("./preload-render.js");
require("./zablind/index.js");
```

All functionality is preserved from the original monolithic version while providing better structure for future development.




