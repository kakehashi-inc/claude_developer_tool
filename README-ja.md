# Claude Developer Tool

開発者向けのElectronベースGUIツールです。Claude Desktopの各種ユーティリティを提供します。

[English](README.md) | 日本語

## 機能

- **Claude Desktop MCP Manager**:
  - 各OS（Windows/macOS/Linux）のClaude Desktop設定ファイルを自動検出
  - 開発者/ローカルMCPサーバーの有効化/無効化
  - 有効なMCPサーバーのドラッグ＆ドロップによる並べ替え
  - Claude Desktopの起動/再起動（Windows/macOSのみ）
- **i18n/テーマ**: 日本語/英語、ライト/ダークモード対応

## 対応OS

- Windows 10/11
- macOS 10.15+
- Linux (Ubuntu/Debian 対応予定)

## 開発環境

### 必要環境

- Node.js 22.x+
- yarn 4
- Git

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd claude_developer_tool

# 依存関係をインストール
yarn install

# 開発モードで起動 (main: tsc -w / renderer: Vite / Electron)
yarn dev
```

開発モードのDevTools:

- DevToolsは自動的に別ウィンドウで開きます
- F12 または Ctrl+Shift+I (macOSではCmd+Option+I) で切り替え可能

### ビルド/配布

- すべてのプラットフォーム: `yarn dist`
- Windows: `yarn dist:win`
- macOS: `yarn dist:mac`
- Linux: `yarn dist:linux`

開発モードでは `http://localhost:3001` でBrowserRouterを使用し、本番モードでは `dist/renderer/index.html` をHashRouterで読み込みます。

#### Windows前提条件: 開発者モード

Windowsで署名なしのローカルビルドを実行する場合は、開発者モードを有効にしてください：

1. 設定 → プライバシーとセキュリティ → 開発者向け を開く
2. 「開発者モード」をオンにする
3. Windowsが再起動を求めた場合は再起動する

注意: アプリはWindows上で署名されていません。SmartScreenが警告を表示する場合は「詳細情報」→「実行」をクリックしてください。

### プロジェクト構造（抜粋）

```text
src/
├── main/                  # Electronメインプロセス: IPCとマネージャー
│   ├── index.ts           # アプリ起動 / ウィンドウ / サービス初期化
│   ├── ipc/               # IPCハンドラー
│   ├── services/          # ClaudeDesktopManagerなど
│   └── utils/             # SystemUtils
├── preload/               # レンダラーへの安全なAPIブリッジ
├── renderer/              # React + MUI UI
├── shared/                # 型定義と定数（デフォルト/パス）
└── public/                # アイコン
```

### 技術スタック

- Electron
- React (MUI v7)
- TypeScript
- Zustand
- i18next
- Vite

### 実行モード

- 開発: `yarn dev` (Vite: http://localhost:3001, BrowserRouter)
- 本番: `yarn build && yarn start` (HashRouterで `dist/renderer/index.html` を読み込み)

### MCPサーバーの無効化

MCPサーバーを無効化すると、`claude_desktop_config.json` から該当サーバーの設定が削除され、同じディレクトリの `claude_desktop_config_disabled.json` に移動されます。設定は加工されずそのまま移動されます。

### MCPサーバーの有効化

無効化されたMCPサーバーを有効化すると、`claude_desktop_config_disabled.json` から `claude_desktop_config.json` に設定が戻されます。

### Windowsアイコンの作成

```exec
magick public/icon.png -define icon:auto-resize=256,128,96,64,48,32,24,16 public/icon.ico
```
