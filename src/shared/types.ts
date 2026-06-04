// 共有型定義
export interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
    // Claude Code (CLI) のエントリは "stdio" などの type を持つ場合がある。
    // 有効/無効の移動時にこのフィールドを落とさないよう保持する。
    type?: string;
    [key: string]: unknown;
}

export interface ClaudeDesktopConfig {
    mcpServers: Record<string, MCPServerConfig>;
    [key: string]: unknown;
}

export interface MCPServerInfo {
    name: string;
    config: MCPServerConfig;
    enabled: boolean;
}

export interface ClaudeDesktopInfo {
    configPath: string;
    configExists: boolean;
    disabledConfigPath: string;
    claudeExecutable?: string;
}

export type OSType = 'win32' | 'darwin' | 'linux';

// Claude 環境（native = ホストOS、wsl = Windows 上の WSL distro）
export type ClaudeEnvKind = 'native' | 'wsl';

export interface ClaudeEnvironment {
    kind: ClaudeEnvKind;
    distro?: string;
}

// Claude Code (CLI) の環境ごとの情報
export interface ClaudeCodeEnvInfo {
    env: ClaudeEnvironment;
    label: string;
    configPath: string;
    configExists: boolean;
    disabledConfigPath: string;
}

// WSL distro の情報
export interface WslDistroInfo {
    distro: string;
    hasClaude: boolean;
    home: string;
}

// クリーンアップ: projects 配下の個別プロジェクト
export interface CleanupChild {
    name: string;
    size: number;
    fileCount: number;
}

// クリーンアップ候補ディレクトリ
export interface CleanupCandidate {
    key: string;
    exists: boolean;
    size: number;
    fileCount: number;
    defaultChecked: boolean;
    expandable?: boolean;
    children?: CleanupChild[];
}

// クリーンアップの環境ごとのレポート
export interface CleanupEnvReport {
    env: ClaudeEnvironment;
    label: string;
    candidates: CleanupCandidate[];
    // 使用中（ロック）などで完全に削除できず一部スキップした対象のキー一覧。
    // 例外は投げずに best-effort で削除し、スキップした分をここで報告する。
    skipped?: string[];
}

// クリーンアップ削除の選択内容
export interface CleanupSelection {
    dirs: string[];
    projectDirs: string[];
}

// 「その他のツール」クリーンアップ: 各項目が自分の掃除方法を宣言で内包する汎用モデル
export type OtherCleanupActionKind = 'dir-delete' | 'yaml-list-clear';
export type OtherCleanupMetricKind = 'size' | 'count';

// 静的定義（registry に並べる）
export interface OtherCleanupItem {
    key: string; // 'serena-projects' | 'serena-logs'
    action: OtherCleanupActionKind;
    targetPath: string; // HOME 相対（'.serena/logs' など）
    yamlKey?: string; // yaml-list-clear 用（'projects'）
    metricKind: OtherCleanupMetricKind; // dir-delete→size, yaml-list-clear→count
    requiresPath: string; // この相対パスが存在する時のみ表示
    defaultChecked: boolean;
    group: string; // 'serena'（将来のグルーピング用）
}

// 実行時の各項目の状態
export interface OtherCleanupItemStatus {
    key: string;
    available: boolean;
    metricKind: OtherCleanupMetricKind;
    metricValue: number; // size=バイト, count=件数
    fileCount?: number; // dir-delete のときファイル数も
}

// 「その他」の環境ごとのレポート
export interface OtherCleanupReport {
    env: ClaudeEnvironment;
    label: string;
    items: OtherCleanupItemStatus[];
    // 使用中（ロック）などで完全に処理できず一部スキップした項目のキー一覧。
    skipped?: string[];
}

// 「その他」削除の選択内容（項目キーの配列）
export type OtherCleanupSelection = string[];

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateState {
    status: UpdateStatus;
    version?: string;
    progress?: number;
    error?: string;
}
