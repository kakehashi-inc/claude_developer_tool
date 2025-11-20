## Coding Style
- TypeScript-first across main/preload/renderer; maintain strict separation (renderer must never import `electron`).
- Use @mui/material + @emotion for UI; keep spacing/typography consistent with existing design tokens.
- IPC changes must be applied in all layers (main handler + preload exposure + renderer usage) to avoid runtime breakage.
- Respect shared types in `src/shared/types.ts`; update manager and renderer when schema changes.
- Config IO is synchronous in `ClaudeDesktopManager`; preserve order/error handling when editing.
- Follow ESLint 9 + Prettier 3 defaults; keep files ASCII unless already using Unicode.

## Security/Architecture Guidelines
- Maintain main/preload/renderer isolation (`contextIsolation: true`).
- Only expose necessary, typed APIs via `contextBridge`.
- Keep MCP config read/write logic platform-aware via `CLAUDE_CONFIG_PATHS`.
- UI should support i18n (English/Japanese) and light/dark themes.
- When editing, keep restart/launch behavior aligned with supported OSes (macOS/win32 only for restart).

## Testing/Validation Expectations
- Run lint/build commands after major edits (`yarn build`, `yarn dev` flows).
- Manual verification generally involves launching via `yarn dev` and exercising renderer UI + IPC interactions.