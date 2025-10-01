# Claude Developer Tool

An Electron-based GUI tool for developers, including utilities for Claude Desktop.

## Features

- Claude Desktop MCP config: Enable or disable the developer MCP server settings for Claude Desktop
- i18n/theme: Japanese/English, light/dark modes

## Supported OS

- Windows 10/11 (with WSL detection/list)
- macOS 10.15+
- Linux (Ubuntu/Debian, RHEL/CentOS/Fedora)

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

In development the app uses BrowserRouter with `<http://localhost:3001>`, and in production it uses HashRouter to load `dist/renderer/index.html`.

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
│   ├── services/          #
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

## License

MIT

## For Developers

### Execution Modes

- Development: `yarn dev` (Vite: <http://localhost:3001>, BrowserRouter)
- Production: `yarn build && yarn start` (HashRouter loading `dist/renderer/index.html`)

### Create Windows Icon

```exec
magick public/icon.png -define icon:auto-resize=256,128,96,64,48,32,24,16 public/icon.ico
```
