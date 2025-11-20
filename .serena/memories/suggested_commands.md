## Essential Commands
- Install deps: `yarn install`
- Dev mode (tsc watch + Vite + Electron): `yarn dev`
- Build (tsc main + Vite renderer): `yarn build`
- Start app from build artifacts: `yarn start`
- Package for all platforms: `yarn dist`
- Platform builds: `yarn dist:win`, `yarn dist:mac`, `yarn dist:linux`
- Release (publish artifacts): `yarn release:win|mac|linux`
- Clean caches/output: `yarn clean`

## Tooling
- Linting handled via ESLint 9 (run `yarn eslint .` if configured; or rely on `yarn build` for type-check feedback).
- Formatting via Prettier 3 (use editor integration or `yarn prettier` if script exists).
- Uses Yarn 4 and Node 22; rely on `concurrently`, `wait-on`, `electron-builder` per scripts.