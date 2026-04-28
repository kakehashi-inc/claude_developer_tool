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
- Linux (Debian系/RHEL系)

注記: 本プロジェクトは Windows ではコード署名を行っていません。SmartScreen が警告を表示する場合は「詳細情報」→「実行」を選択してください。

### MCPサーバーの無効化

MCPサーバーを無効化すると、`claude_desktop_config.json` から該当サーバーの設定が削除され、同じディレクトリの `claude_desktop_config_disabled.json` に移動されます。設定は加工されずそのまま移動されます。

### MCPサーバーの有効化

無効化されたMCPサーバーを有効化すると、`claude_desktop_config_disabled.json` から `claude_desktop_config.json` に設定が戻されます。

## 開発者向けリファレンス

### 必要要件

- Node.js 22.x以上
- yarn 4
- Git

### インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd <repository-name>

# 依存関係のインストール
yarn install

# 開発起動
yarn dev
```

開発時のDevTools:

- DevTools はデタッチ表示で自動的に開きます
- F12 または Ctrl+Shift+I（macOSは Cmd+Option+I）でトグル可能

### ビルド/配布

- Windows: `yarn dist:win`
- macOS: `yarn dist:mac`
- Linux: `yarn dist:linux`

開発時は BrowserRouter で `<http://localhost:3001>` を、配布ビルドでは HashRouter で `dist/renderer/index.html` を読み込みます。

### GitHub への直接リリース (自動アップデート用)

`electron-builder.yml` の `publish:` に設定した GitHub リポジトリに、ビルド成果物と `latest*.yml` (自動アップデート用メタデータ) を直接アップロードするコマンドです。`releaseType: draft` 設定のため、各コマンドは GitHub 上の **同一バージョンのドラフトリリースに集約** されます。全プラットフォーム揃ってから GitHub UI で「Publish release」を押すとユーザーへ配信されます。

- Windows: `yarn release:win`
- macOS: `yarn release:mac`
- Linux: `yarn release:linux`

実行前に GitHub Personal Access Token (`public_repo` スコープ) を環境変数 `GH_TOKEN` に設定してください。

```bash
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

複数台で各プラットフォームをビルドする場合は、`package.json` の `version` を全マシンで一致させた上で、各マシンで該当する `release:*` を順に実行してください。

### macOS 事前準備: 署名・公証用の環境変数

macOS 向けに署名・公証付きビルドを行う場合は、`yarn dist:mac` の実行前に以下の環境変数を設定してください。

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

### Windows 事前準備: 開発者モード

Windows で署名なしのローカルビルド/配布物を実行・テストする場合は、OSの開発者モードを有効にしてください。

1. 設定 → プライバシーとセキュリティ → 開発者向け
2. 「開発者モード」をオンにする
3. OSを再起動

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

### 使用技術

- **Electron**
- **React (MUI v7)**
- **TypeScript**
- **Zustand**
- **i18next**
- **Vite**

### Windows用アイコンの作成

```exec
magick public/icon.png -define icon:auto-resize=256,128,96,64,48,32,24,16 public/icon.ico
```
