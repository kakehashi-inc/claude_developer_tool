# Claude Developer Tool

An Electron-based GUI tool for developers, including utilities for Claude Desktop.

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
- Linux (Ubuntu/Debian, RHEL/CentOS/Fedora)

Claude Desktop configuration file paths for each OS:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

## Setup

### Requirements

- Node.js 22.x+
- yarn 4
- Git

### Install

```bash
# Clone the repository
git clone <repository-url>
cd claude_developer_tool

# Install dependencies
yarn install

# Start development (main: tsc -w / renderer: Vite / Electron)
yarn dev
```

DevTools in development:

- DevTools open in detached mode automatically
- Toggle with F12 or Ctrl+Shift+I (Cmd+Option+I on macOS)

## Build/Distribute

- All platforms: `yarn dist`
- Windows: `yarn dist:win`
- macOS: `yarn dist:mac`
- Linux: `yarn dist:linux`

In development the app uses BrowserRouter with `http://localhost:3001`, and in production it uses HashRouter to load `dist/renderer/index.html`.

### Windows prerequisite: Developer Mode

When building or running unsigned local releases on Windows, enable Developer Mode:

1. Open Settings → Privacy & security → For developers
2. Turn on "Developer Mode"
3. Reboot if Windows asks you to

Note: The app is not code-signed on Windows. SmartScreen may show a warning; click "More info" → "Run anyway".

## Project Structure (excerpt)

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

## Tech Stack

- Electron
- React (MUI v7)
- TypeScript
- Zustand
- i18next
- Vite

## For Developers

### Execution Modes

- Development: `yarn dev` (Vite: http://localhost:3001, BrowserRouter)
- Production: `yarn build && yarn start` (HashRouter loading `dist/renderer/index.html`)

### Disabling MCP Servers

When you disable an MCP server, its configuration is removed from `claude_desktop_config.json` and moved to `claude_desktop_config_disabled.json` in the same directory. The configuration is moved as-is without modification.

### Enabling MCP Servers

When you enable a disabled MCP server, the configuration is moved back from `claude_desktop_config_disabled.json` to `claude_desktop_config.json`.

### Create Windows Icon

```exec
magick public/icon.png -define icon:auto-resize=256,128,96,64,48,32,24,16 public/icon.ico
```
