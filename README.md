# Claude Developer Tool

An Electron-based GUI tool for managing the configuration and data of Claude Desktop and Claude Code (CLI) in one place.

English | [日本語](README-ja.md)

## Features

- **Claude Desktop MCP server management**: Enable, disable, and reorder MCP servers from the GUI, and start or restart Claude Desktop (Windows / macOS).
- **Claude Code MCP server management**: Manage MCP servers for Claude Code (CLI). When you use WSL, Claude Code inside WSL is covered too.
- **Claude Code agent / skill management**: Review your agents and skills with a summary of each, download or import them together as ZIP archives (for sharing or backup), and delete the ones you no longer need. When you use WSL, agents and skills inside WSL are covered too.
- **Claude Code cleanup**: Tidy up unneeded history, cache, and temporary data to reclaim disk space and keep things running smoothly, including tools used alongside Claude Code (e.g. Serena).
- **Localization & theme**: Japanese / English, light / dark modes.

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
