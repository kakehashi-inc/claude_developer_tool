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
    // expandable のときの子要素の種類。'dir'=サブディレクトリ（projects）、'file'=ファイル（plans）。
    childKind?: 'dir' | 'file';
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
    // expandable 候補で個別選択された子要素名。キー=候補キー（projects / plans など）、
    // 値=選択された子要素名（サブディレクトリ名・ファイル名）の配列。
    // dirs に候補キー全体が含まれる場合、その候補の childSelections は無視される。
    childSelections: Record<string, string[]>;
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
    // 最終更新日時（エポックミリ秒）。
    // - agents（ファイル単位）: その .md ファイルの最終更新日時。
    // - skills（フォルダ単位）: フォルダ内ファイルの最終更新日時の最大値。
    // 取得できない場合は 0。
    mtimeMs: number;
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
    // アップロード前検査の種別整合チェック結果。
    // - 'warn': アップロード対象が現在のタブ（種別）と食い違う疑いがある（続行/キャンセルを確認）。
    //   この場合も ok:true で srcPath/zipPath/conflicts は通常どおり返す。
    // 'block' は ok:false ＋ message に理由コードを入れて返すため、ここでは扱わない。
    kindCheck?: 'warn';
    // kindCheck の理由コード（i18n キーの末尾。例 'agent-md-into-skill'）。
    kindMessage?: string;
}

// ============================================================
// Claude Code 設定（~/.claude/settings.json）管理
// ============================================================

// 設定項目の値の型。
// - boolean: true/false（スイッチで編集）。
// - string:  文字列（オプションで選択肢 choices を持つ場合はセレクト）。
// - number:  数値（オプションで min/max を持つ）。
// - envFlag: env オブジェクト内の特定キー（envKey）の有無で ON/OFF するフラグ。
//            ON で env[envKey] = onValue（既定 "1"）を設定、OFF で env[envKey] を削除する。
//            env 内の他キーには触れない。値の型は boolean。
export type SettingsFieldType = 'boolean' | 'string' | 'number' | 'envFlag';

// 編集対象の 1 設定項目の定義（registry）。
// path は settings.json 上のトップレベルキー（envMap は 'env' 固定）。
// この registry に項目を 1 つ追加すると、読み書き・UI 表示まで反映される。
export interface SettingsFieldSpec {
    key: string; // i18n キー兼識別子（'teammateMode' など）
    path: string; // settings.json 上のトップレベルキー（'teammateMode' / 'agentPushNotifEnabled' / 'env'）
    group: string; // UI のグループ見出し用キー（'model' / 'display' / 'agent' など）。i18n: settings.group.<group>
    type: SettingsFieldType;
    choices?: string[]; // type='string' で選択肢を限定する場合
    envKey?: string; // type='envFlag' のとき: env オブジェクト内の対象キー
    onValue?: string; // type='envFlag' のとき: ON 時に設定する値（既定 '1'）
    min?: number; // type='number' のとき: 最小値（クランプに使用）
    max?: number; // type='number' のとき: 最大値（クランプに使用）
    // type='boolean' のとき: 未設定時に Claude Code が実際に採用する既定値。
    // UI で「未設定（既定: 有効/無効）」と表示するために使う。未確定なら省略する。
    defaultOn?: boolean;
}

// 設定項目 1 件の現在値（読み取り結果）。
// type に応じて value の中身が決まる:
// - boolean / envFlag: boolean | undefined（envFlag は env[envKey] の有無）
// - string:            string | undefined
// - number:            number | undefined
export type SettingsFieldValue = boolean | string | number | undefined;

// 設定の読み取り結果（環境ごと）。
// available=false は実 OS パスに到達できない（WSL コマンドモードで UNC 不可など）。
export interface SettingsReadResult {
    env: ClaudeEnvironment;
    label: string;
    available: boolean;
    // 設定ファイルが存在するか（存在しなくても編集・新規作成は可能）。
    exists: boolean;
    // 各登録項目の現在値（key -> 値）。
    values: Record<string, SettingsFieldValue>;
    // 編集対象項目の定義（registry）。レンダラーはこれを使って UI を描くため、
    // os 依存の shared/constants を import する必要がない（schema の単一ソースはメイン側）。
    fields: SettingsFieldSpec[];
    // 直接編集用: 設定ファイルの生 JSON テキスト全体。存在しなければ null。
    rawJson: string | null;
}

// テーブル編集による設定保存の入力（key -> 値）。
// 関係ない項目には触れず、登録項目のみを差分マージで反映する。
export type SettingsValues = Record<string, SettingsFieldValue>;

// 設定保存の結果。
export interface SettingsWriteResult {
    ok: boolean;
    message?: string; // エラー詳細（'unavailable' / 'invalid-json' / 'write-failed' など）
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateState {
    status: UpdateStatus;
    version?: string;
    progress?: number;
    error?: string;
}
