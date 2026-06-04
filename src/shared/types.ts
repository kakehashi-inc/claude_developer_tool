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
}

// クリーンアップ候補ディレクトリ
export interface CleanupCandidate {
    key: string;
    exists: boolean;
    size: number;
    defaultChecked: boolean;
    expandable?: boolean;
    children?: CleanupChild[];
}

// クリーンアップの環境ごとのレポート
export interface CleanupEnvReport {
    env: ClaudeEnvironment;
    label: string;
    candidates: CleanupCandidate[];
}

// クリーンアップ削除の選択内容
export interface CleanupSelection {
    dirs: string[];
    projectDirs: string[];
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateState {
    status: UpdateStatus;
    version?: string;
    progress?: number;
    error?: string;
}
