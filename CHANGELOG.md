# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Claude Code Agent / Skill Manager**: a new screen (placed just before Cleanup) to manage Claude Code agents and skills for both the host and WSL. Each agent and skill is listed with a summary (such as name and description), and a "View" action shows the full header details. Selected agents or skills can be downloaded together as a ZIP, a ZIP can be uploaded to import them, and selected items can be deleted. Agents and skills are separated by tabs, and WSL environments appear in their own sections. When importing items that already exist, a confirmation is shown before they are replaced.

## [v0.3.0] - 2026-06-04

### Added

- **Claude Code MCP Manager**: enable, disable, and reorder Claude Code (CLI) MCP servers from the GUI. When you use WSL, Claude Code inside WSL is managed in its own section.
- **Claude Code Cleanup**: review unneeded history, cache, and temporary data with their file counts and sizes and delete what you choose. Besides reclaiming disk space, this helps improve performance and clear stale memory that causes unexpected behavior. Per-project history can be cleaned individually or all at once.
- **Cleanup — Other tools**: a separate section for tools used alongside Claude Code. It can clear Serena's registered project list (while keeping your settings and comments) and delete Serena logs. WSL environments with Serena are handled in their own section. The section appears only when Serena is present.
- **Startup dashboard**: the app now opens on a dashboard where you can pick which tool to use.
- **Quick screen switching**: switch between tools at any time from the title bar.

## [v0.2.0] - 2026-05-21

### Added

- Auto update support via `electron-updater` with a Snackbar UI prompting users to apply new versions (i18n: ja/en).
- Windows portable build is now packaged as a `.zip` (the original `.exe` is removed) via an `afterAllArtifactBuild` hook (`scripts/zip-portable.js`), avoiding browser/AV warnings around unsigned bare executables.

### Changed

- `electron-updater` is now skipped entirely when running the portable build (detected via `process.env.PORTABLE_EXECUTABLE_FILE`) to prevent the NSIS installer from being downloaded and run from a portable session.
- Upgraded MUI (`@mui/material`, `@mui/icons-material`) from v7 to v9; migrated deprecated `primaryTypographyProps` and Typography/Stack system props to the v9 `slotProps` / `sx` API.
- TypeScript root config now uses `moduleResolution: "bundler"` (required by MUI v9 `.d.mts` types); the main-process tsconfig overrides this back to `"node"` to remain CommonJS-compatible.
- `electron-builder.yml` `publish.repo` is now the bare repository name and `releaseType` is `draft` so multi-platform releases aggregate into a single GitHub draft.
