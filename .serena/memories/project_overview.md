## Purpose
Electron + React tool to manage Claude Desktop MCP servers, providing GUI utilities such as enabling/disabling MCP servers, reordering them, and restarting Claude Desktop on macOS/Windows. Targets GitHub distribution (not App Store) and supports Windows/macOS/Linux configs.

## Architecture
- Electron main process under `src/main` handles app lifecycle, IPC, and config management via `ClaudeDesktopManager`.
- Preload (`src/preload`) exposes a typed `window.api` surface (`claudeDesktop`, `window`, `system`).
- Renderer (`src/renderer`) is React + MUI (Vite) for the UI interacting via preload APIs.
- Shared constants/types under `src/shared`. Public assets in `public/`.

## Key Files
- `src/main/index.ts`: app bootstrapping and window creation.
- `src/main/ipc/*.ts`: IPC handlers mirroring preload API.
- `src/main/services/ClaudeDesktopManager.ts`: reads/writes Claude config files and restarts Claude Desktop.
- `src/preload/index.ts`: contextBridge definitions.
- `src/renderer/components/ClaudeDesktopManager.tsx` and `src/renderer/App.tsx`: primary UI components.

## Tech Stack
Electron 38, React 19, MUI 7, TypeScript 5, Zustand, i18next, Vite 7. Node 22 + Yarn 4 required.

## Distribution
`yarn dist` aggregates builds; platform-specific scripts (`dist:win/mac/linux`); release scripts publish artifacts. Unsigned binaries distributed via GitHub, not App Store.