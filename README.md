# Claude Developer Tool

An Electron-based GUI tool for developers, providing various utilities for Claude Desktop.

English | [日本語](README-ja.md)

## Features

- **Claude Desktop MCP Manager**:
  - Auto-detect Claude Desktop configuration files for each OS (Windows/macOS/Linux)
  - Enable/disable developer/local MCP servers
  - Drag & drop reordering of enabled MCP servers
  - Start/restart Claude Desktop (Windows/macOS only)
- **i18n/theme**: Japanese/English, light/dark modes

## Supported OS

- Windows 10/11
- macOS 10.15+
- Linux (Debian-based/RHEL-based)

Note: This project is not code-signed on Windows. If SmartScreen displays a warning, click "More info" → "Run anyway".

### Disabling MCP Servers

When you disable an MCP server, its configuration is removed from `claude_desktop_config.json` and moved to `claude_desktop_config_disabled.json` in the same directory. The configuration is moved as-is without modification.

### Enabling MCP Servers

When you enable a disabled MCP server, the configuration is moved back from `claude_desktop_config_disabled.json` to `claude_desktop_config.json`.

## Developer Reference

### Development Rules

- Developer documentation (except `README.md`, `README-ja.md`) should be placed in the `Documents` directory.
- Always run the linter after making changes and apply appropriate fixes. If intentionally allowing lint errors, document this in a comment. **Building is only for releases; linting is sufficient for debugging.**
- When implementing models, place files on a per-table basis.
- Create files in the `modules` directory for componentized implementations.
- Place temporary scripts (e.g., investigation scripts) in the `scripts` directory.
- When creating or modifying models, update `Documents/Table Definitions.md`. Table definitions should be expressed as tables, with column names, types, and relations within the table.
- When system behavior changes, update `Documents/System Specifications.md`.

### Requirements

- Node.js 22.x+
- yarn 4
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd <repository-name>

# Install dependencies
yarn install

# Start development
yarn dev
```

DevTools in development:

- DevTools open in detached mode automatically
- Toggle with F12 or Ctrl+Shift+I (Cmd+Option+I on macOS)

### Build/Distribution

- All platforms: `yarn dist`
- Windows: `yarn dist:win`
- macOS: `yarn dist:mac`
- Linux: `yarn dist:linux`

In development the app uses BrowserRouter with `<http://localhost:3001>`, and in production it uses HashRouter to load `dist/renderer/index.html`.

### Windows Prerequisite: Developer Mode

When building or running unsigned local releases on Windows, enable Developer Mode:

1. Open Settings → Privacy & security → For developers
2. Turn on "Developer Mode"
3. Reboot

### Project Structure (excerpt)

```text
src/
├── main/                  # Electron main: IPC and managers
│   ├── index.ts           # App boot / window / service init
│   ├── ipc/               # IPC handlers
│   ├── services/          # ClaudeDesktopManager etc.
│   └── utils/             # SystemUtils
├── preload/               # Safe bridge APIs to renderer
├── renderer/              # React + MUI UI
├── shared/                # Types and constants (defaults/paths)
└── public/                # Icons
```

### Tech Stack

- **Electron**
- **React (MUI v7)**
- **TypeScript**
- **Zustand**
- **i18next**
- **Vite**

### Create Windows Icon

```exec
magick public/icon.png -define icon:auto-resize=256,128,96,64,48,32,24,16 public/icon.ico
```
