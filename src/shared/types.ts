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

// Agent・Skill 管理: 対象種別（~/.claude/agents・~/.claude/skills）
export type AssetKind = 'agents' | 'skills';

// agents/ skills/ 配下の 1 件（= 各エージェント / 各スキル）
// - skills: <skill>/ ディレクトリ（frontmatter は <skill>/SKILL.md から読む）
// - agents: agents/ 直下の .md ファイル、およびサブディレクトリ配下の .md ファイル（再帰）
export interface AssetEntry {
    name: string; // 表示名（skills=ディレクトリ名 / agents=.md のファイル名から拡張子を除いたもの）
    relPath: string; // asset 親（.claude/<kind>）からの相対パス（DL/UL の単位。例 'apple-design' / 'foo.md' / 'sub/bar.md'）
    isFile: boolean; // true=単一 .md ファイル（agents） / false=ディレクトリ（skills）
    // 再帰ファイル数。skills でのみ取得・表示する（agents は 1 ファイル固定のため取得しない）。
    fileCount?: number;
    // frontmatter（先頭の --- で囲まれたヘッダー部）。無い場合は fields 空・raw は null。
    frontmatter: Record<string, string>;
    frontmatterRaw: string | null;
}

// Agent・Skill 管理の一覧レポート（環境 × 種別）
export interface AssetListReport {
    env: ClaudeEnvironment;
    label: string;
    kind: AssetKind;
    // 実 OS パス（native 絶対パス / WSL UNC パス）に到達でき、ZIP 操作が可能か。
    // false の場合（WSL コマンドモードで UNC 不可など）は DL/UL を行わない。
    available: boolean;
    entries: AssetEntry[];
}

// Agent・Skill 管理の操作結果（ダウンロード / アップロード / アップロード前検査 / 公式スキル一覧）
export interface AssetOpResult {
    ok: boolean;
    canceled?: boolean; // ダイアログをキャンセルした
    message?: string; // エラー詳細（任意）
    conflicts?: string[]; // アップロード前検査で検出した同名サブディレクトリ
    zipPath?: string; // アップロード前検査で選択された ZIP の実パス
    importedCount?: number; // アップロードで展開したサブディレクトリ数
    deletedCount?: number; // 削除に成功した件数
    skipped?: string[]; // 使用中などで削除できなかった対象（relPath）
    // アップロード前検査で選択されたファイル種別（zip / md）。renderer が確定 IPC を呼び分ける。
    uploadKind?: 'zip' | 'md';
    // md アップロード時の元ファイル実パス（zipPath と役割分担）。
    srcPath?: string;
    // md アップロード時に算出した取り込み先ディレクトリ名（skills）／ファイル名（agents）。表示・衝突確認用。
    targetName?: string;
    // 公式スキル一覧返却用（list-official-skills）。既存スキル一覧と同形の AssetEntry。
    entries?: AssetEntry[];
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateState {
    status: UpdateStatus;
    version?: string;
    progress?: number;
    error?: string;
}
