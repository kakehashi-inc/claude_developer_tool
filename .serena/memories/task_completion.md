## Before Submitting Changes
1. Ensure TypeScript compiles (`yarn build`) and renderer bundles cleanly.
2. Run linting/formatting (ESLint/Prettier) if scripts exist or editor prompts.
3. Manually launch via `yarn dev` when touching IPC/UI to validate preload ↔ renderer interactions and Claude config side effects.
4. Verify platform-specific logic (especially config paths/restart behavior) against `CLAUDE_CONFIG_PATHS` constants.
5. Summarize edits referencing key files and suggest follow-up steps (tests, builds) in final response.