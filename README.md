# Claude Developer Tool

An Electron-based GUI tool for developers, providing various utilities for Claude Desktop.

English | [日本語](README-ja.md)

## Features

- **Claude Desktop MCP Manager**:
  - Auto-detect Claude Desktop configuration for each OS (Windows/macOS/Linux)
  - Enable/disable MCP servers
  - Drag & drop reordering of enabled MCP servers
  - Start/restart Claude Desktop (Windows/macOS only)
- **Claude Code MCP Manager**:
  - Enable/disable/reorder Claude Code (CLI) MCP servers
  - When you use WSL, also manage Claude Code inside WSL in a separate section
- **Claude Code Cleanup**:
  - List unneeded history, cache, and temporary data with their file counts and sizes and delete the selected ones
  - Besides reclaiming disk space, this can improve performance and clear stale memory that causes unexpected behavior
  - Per-project history can be cleaned individually or all at once
  - An "Other tools" section can also tidy up tools used alongside Claude Code (e.g. Serena), shown only when they are present
- **i18n/theme**: Japanese/English, light/dark modes

## Supported OS

- Windows 10/11
- macOS 10.15+
- Linux (Debian-based/RHEL-based)

Note: This project is not code-signed on Windows. If SmartScreen displays a warning, click "More info" → "Run anyway".

## Developer Reference

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

- Windows: `yarn dist:win`
- macOS: `yarn dist:mac`
- Linux: `yarn dist:linux`

In development the app uses BrowserRouter with `<http://localhost:3001>`, and in production it uses HashRouter to load `dist/renderer/index.html`.

### Direct Release to GitHub (for Auto Update)

These commands upload build artifacts and `latest*.yml` (auto-update metadata) directly to the GitHub repository configured under `publish:` in `electron-builder.yml`. Because `releaseType: draft` is set, each command **aggregates artifacts into the same draft release for that version on GitHub**. Once all platforms are ready, press "Publish release" in the GitHub UI to deliver the update to users.

- Windows: `yarn release:win`
- macOS: `yarn release:mac`
- Linux: `yarn release:linux`

Before running, set a GitHub Personal Access Token (with the `public_repo` scope) in the `GH_TOKEN` environment variable:

```bash
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

When building each platform on different machines, make sure the `version` field in `package.json` matches across all machines, then run the corresponding `release:*` command on each machine in turn.

### macOS Prerequisite: Signing & Notarization Environment Variables

To build a signed and notarized macOS distribution, set the following environment variables before running `yarn dist:mac`:

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

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
- **React (MUI v9)**
- **TypeScript**
- **Zustand**
- **i18next**
- **Vite**

### Create Windows Icon

```exec
magick public/icon.png -define icon:auto-resize=256,128,96,64,48,32,24,16 public/icon.ico
```
