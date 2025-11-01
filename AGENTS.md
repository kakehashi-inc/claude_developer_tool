# AI Agent Guidelines (Claude Developer Tool)

This document consolidates guidance from `.github/copilot-instructions.md` and `.cursor/rules/global.mdc` to help AI coding agents work effectively in this codebase.

---

## Working Principles

### Context Gathering

**Goal**: Get enough context fast. Parallelize discovery and stop as soon as you can act.

**Method**:

- Start broad, then fan out to focused subqueries
- Launch varied queries in parallel; read top hits per query. Deduplicate paths and cache; don't repeat queries
- Avoid over-searching for context. If needed, run targeted searches in one parallel batch

**Early stop criteria**:

- You can name exact content to change
- Top hits converge (~70%) on one area/path

**Escalate once**:

- If signals conflict or scope is fuzzy, run one refined parallel batch, then proceed

**Depth**:

- Trace only symbols you'll modify or whose contracts you rely on; avoid transitive expansion unless necessary

**Loop**:

- Batch search → minimal plan → complete task
- Search again only if validation fails or new unknowns appear. Prefer acting over more searching

### Self-Reflection

- First, spend time thinking of a rubric until you are confident
- Think deeply about every aspect of what makes for a world-class solution
- Use the rubric to internally think and iterate on the best possible solution
- Remember that if your response is not hitting the top marks across all categories, you need to start again

### Persistence

- You are an agent — keep going until the user's query is completely resolved before ending your turn
- Only terminate when you are sure that the problem is solved
- Never stop or hand back when you encounter uncertainty — research or deduce the most reasonable approach and continue
- Do not ask the human to confirm or clarify assumptions — decide the most reasonable assumption, proceed with it, and document it after you finish acting

---

## Project Architecture

### Big Picture

- This is an **Electron + React (Vite)** app with a clear **main/renderer/preload** separation
- **Main process**: `src/main` — app lifecycle, single-instance lock, window creation, and registration of IPC handlers
- **Preload**: `src/preload/index.ts` — exposes a safe `window.api` via `contextBridge`. Use this for all main<->renderer interactions
- **Renderer**: `src/renderer` — React + MUI UI. In development the renderer runs on Vite at `http://localhost:3001` (BrowserRouter). In production the built `dist/renderer/index.html` is loaded with HashRouter
- **Core service**: `src/main/services/ClaudeDesktopManager.ts` — reads/writes Claude config files under platform-specific paths (`src/shared/constants.ts`) and can restart/launch the external Claude Desktop app on macOS/Windows

### IPC / API Contract (use these exactly)

Main handles (see `src/main/ipc/*.ts`) and preload expose these invocations on `window.api`:

- `window.api.claudeDesktop.getInfo()` → returns `ClaudeDesktopInfo` (see `src/shared/types.ts`)
- `window.api.claudeDesktop.getMCPServers()` → `{ enabled, disabled }`
- `window.api.claudeDesktop.disableMCPServer(name)` / `enableMCPServer(name)`
- `window.api.claudeDesktop.reorderMCPServers(names[])` / `reorderDisabledMCPServers(names[])`
- `window.api.claudeDesktop.restart()`
- `window.api.window.*` → `minimize`, `maximize`, `close`, `isMaximized`
- `window.api.system.*` → `getTheme`, `getLocale`, `getVersion`

**When changing IPC names or shapes**: update both `src/main/ipc/*` and `src/preload/index.ts` together and adjust renderer usages in `src/renderer`.

---

## Development Conventions

### Tech Stack

**Frontend**:

- Coding: TypeScript 5
- Styling: @mui/material
- Icons: @mui/icons-material

**Developer Tools**:

- Packaging: yarn 4 (Node.js 22)
- Builder: electron-builder
- TS/JS Linter: ESLint 9
- TS/JS Formatter: Prettier 3

### Important Files

- Main entry: `src/main/index.ts`
- IPC handlers: `src/main/ipc/claudeDesktopHandlers.ts`, `systemHandlers.ts`, `windowHandlers.ts`
- Service logic: `src/main/services/ClaudeDesktopManager.ts`
- Preload API: `src/preload/index.ts` (source of truth for renderer API)
- Shared types/constants: `src/shared/types.ts`, `src/shared/constants.ts`
- Renderer components that call the API: `src/renderer/components/ClaudeDesktopManager.tsx`, `src/renderer/App.tsx`

### Workflow (scripts in `package.json`)

- **Use `yarn`** (project expects Yarn 4). Node >= 22 is required (see `package.json.engines`)
- `yarn dev` runs three processes: main TypeScript watch (`tsc -w -p tsconfig.main.json`), Vite dev server, and `electron` after build output is ready. Dev renderer is at `http://localhost:3001`
- `yarn build` = `tsc -p tsconfig.main.json && vite build`
- `yarn start` runs the packaged app with `electron .` (expect `dist/main/index.js` present for production)

### Platform-Specific Config

- Config files live under `CLAUDE_CONFIG_PATHS` (see `src/shared/constants.ts`)
- Tests or code that modify configs must respect the platform-specific path logic
- The manager writes two files: `claude_desktop_config.json` (enabled) and `claude_desktop_config_disabled.json` (disabled)
- Moving between enabled/disabled is implemented by reading/writing these files in `ClaudeDesktopManager`

---

## Code Style & Safety

### Guiding Principles

- **Readability**: For programming language code including comments, avoid using environment-dependent characters, emojis, or other non-standard character strings
- **Maintainability**: Follow proper directory structure, maintain consistent naming conventions, and organize shared logic appropriately
- **Consistency**: The user interface must adhere to a consistent design system—color tokens, typography, spacing, and components must be unified
- **Visual Quality**: Follow the high visual quality bar (spacing, padding, hover states, etc.)

### Electron Security

- The app uses strict separation between main and renderer. **Do not import `electron` into renderer files** — use `window.api` instead
- `contextIsolation: true` and `contextBridge.exposeInMainWorld` are used; keep the preload surface minimal and typed (see exported `API` type in `src/preload/index.ts`)
- IO operations (reading/writing config files) are synchronous in `ClaudeDesktopManager`. Be careful to preserve ordering and error handling when refactoring to async

---

## Common Tasks & Pitfalls

### Add or Change an IPC Handler

1. Update `src/main/ipc/*`
2. Expose call in `src/preload/index.ts`
3. Consume in renderer

**Missing any of these 3 will break runtime behavior.**

### Modify Config Schema

1. Update `src/shared/types.ts`
2. Update `ClaudeDesktopManager` read/write logic
3. Update renderer components that render `MCPServerConfig` fields

### Restart/Launch Behavior

- `ClaudeDesktopManager.restartClaudeDesktop()` only supports `win32` and `darwin`
- If adding Linux support, implement executable discovery and process management carefully

---

## Debug & Run Tips

### Running Locally

1. Run `yarn install` (Yarn v4)
2. Run `yarn dev`
3. Wait for `dist/main/index.js` to be generated by `tsc` before electron starts (script handles this via `wait-on`)

### Debugging Renderer

- Open DevTools (dev mode automatically opens detached DevTools)
- Renderer uses BrowserRouter in dev — when testing routes in dev use `http://localhost:3001`

### Debugging Main Process

- Add console logs in `src/main/*` and inspect stdout from the `yarn dev` terminal (concurrently runs multiple processes)

---

## Changing Build or Runtime Scripts

- Update `package.json` scripts and ensure `yarn dev` still runs three processes (main watch, vite, electron)
- Update README and developer instructions accordingly

---

## Need More Details?

If anything above is unclear or you want additional examples (unit tests, refactors, or adding an IPC endpoint), tell me which area to expand and I will update this file.
