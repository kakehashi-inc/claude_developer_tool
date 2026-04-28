# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Auto update support via `electron-updater` with a Snackbar UI prompting users to apply new versions (i18n: ja/en).

### Changed

- Upgraded MUI (`@mui/material`, `@mui/icons-material`) from v7 to v9; migrated deprecated `primaryTypographyProps` and Typography/Stack system props to the v9 `slotProps` / `sx` API.
- TypeScript root config now uses `moduleResolution: "bundler"` (required by MUI v9 `.d.mts` types); the main-process tsconfig overrides this back to `"node"` to remain CommonJS-compatible.
- `electron-builder.yml` `publish.repo` is now the bare repository name and `releaseType` is `draft` so multi-platform releases aggregate into a single GitHub draft.
