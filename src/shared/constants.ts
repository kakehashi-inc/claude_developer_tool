import { homedir } from 'os';
import { join } from 'path';
import { OSType, OtherCleanupItem, SettingsFieldSpec } from './types';

// Claude Desktopの設定ファイルパス
const getClaudeConfigPath = (platform: OSType): string => {
    if (platform === 'win32') {
        const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
        return join(appData, 'Claude');
    } else if (platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'Claude');
    } else {
        return join(homedir(), '.config', 'Claude');
    }
};

export const CLAUDE_CONFIG_PATHS: Record<OSType, string> = {
    win32: getClaudeConfigPath('win32'),
    darwin: getClaudeConfigPath('darwin'),
    linux: getClaudeConfigPath('linux'),
};

export const CLAUDE_CONFIG_FILENAME = 'claude_desktop_config.json';
export const CLAUDE_CONFIG_DISABLED_FILENAME = 'claude_desktop_config_disabled.json';

// Claude Code (CLI) の設定ファイル（ホーム直下）
export const CLAUDE_CODE_CONFIG_FILENAME = '.claude.json';
// 無効化した MCP の退避先（ホーム直下、ドットを増やさない固定名）
export const CLAUDE_CODE_DISABLED_FILENAME = '.claude-disabled-mcp.json';
// Claude Code のデータディレクトリ（ホーム直下）
export const CLAUDE_DIR = '.claude';

// Claude Code (CLI) MCP 管理用 IPC チャンネル
export const CLAUDE_CODE_CHANNELS = {
    GET_ENVIRONMENTS: 'claude-code:get-environments',
    GET_MCP_SERVERS: 'claude-code:get-mcp-servers',
    ENABLE: 'claude-code:enable-mcp-server',
    DISABLE: 'claude-code:disable-mcp-server',
    REORDER: 'claude-code:reorder-mcp-servers',
    REORDER_DISABLED: 'claude-code:reorder-disabled-mcp-servers',
} as const;

// Claude Code クリーンアップ用 IPC チャンネル
export const CLAUDE_CLEANUP_CHANNELS = {
    GET_ENVIRONMENTS: 'claude-cleanup:get-environments',
    SCAN: 'claude-cleanup:scan',
    DELETE: 'claude-cleanup:delete',
    GET_OTHER_ENVIRONMENTS: 'claude-cleanup:get-other-environments',
    SCAN_OTHER: 'claude-cleanup:scan-other',
    DELETE_OTHER: 'claude-cleanup:delete-other',
} as const;

// クリーンアップ候補ディレクトリ（~/.claude 配下、表示順・projects 先頭）。
// 対象は履歴／キャッシュ／一時／ログのみ。plugins/skills（インストール資産）や
// daemon/ide（稼働中ランタイム状態）、jobs/teams（設定）は対象外。
// backups は復旧用セーフティネットのためデフォルト未チェック。
export interface CleanupCandidateSpec {
    key: string;
    defaultChecked: boolean;
    // expandable=true の候補は「すべて削除／個別選択」を切り替えられる。
    expandable?: boolean;
    // expandable のときの子要素の種類。'dir'=サブディレクトリ単位（projects）、'file'=ファイル単位（plans）。
    childKind?: 'dir' | 'file';
    // 候補自体の種類。'dir'=ディレクトリ（既定）、'file'=単一ファイル（例: history.jsonl）。
    kind?: 'dir' | 'file';
    // ~/.claude 配下の実パス。key と異なる場合に指定（i18n キーにドットを使えないため history.jsonl 等で使用）。
    path?: string;
}

// デフォルトはすべてチェック OFF（ユーザーが明示的に選択する）。
export const CLEANUP_CANDIDATES: CleanupCandidateSpec[] = [
    { key: 'projects', defaultChecked: false, expandable: true, childKind: 'dir' },
    { key: 'plans', defaultChecked: false, expandable: true, childKind: 'file' },
    { key: 'file-history', defaultChecked: false },
    { key: 'history', defaultChecked: false, kind: 'file', path: 'history.jsonl' },
    { key: 'shell-snapshots', defaultChecked: false },
    { key: 'cache', defaultChecked: false },
    { key: 'debug', defaultChecked: false },
    { key: 'sessions', defaultChecked: false },
    { key: 'session-env', defaultChecked: false },
    { key: 'tasks', defaultChecked: false },
    { key: 'backups', defaultChecked: false },
];

// projects ディレクトリのキー（特別扱い用）
export const CLEANUP_PROJECTS_KEY = 'projects';

// Serena のデータディレクトリ（ホーム直下）
export const SERENA_DIR = '.serena';

// 「その他のツール」クリーンアップ項目の registry。
// 新しい外部ツール項目はここに 1 つ定義を追加するだけで UI まで反映される。
// targetPath / requiresPath はすべて HOME 相対。
export const OTHER_CLEANUP_ITEMS: OtherCleanupItem[] = [
    {
        key: 'serena-projects',
        action: 'yaml-list-clear',
        targetPath: '.serena/serena_config.yml',
        yamlKey: 'projects',
        metricKind: 'count',
        requiresPath: '.serena/serena_config.yml',
        defaultChecked: false,
        group: 'serena',
    },
    {
        key: 'serena-logs',
        action: 'dir-delete',
        targetPath: '.serena/logs',
        metricKind: 'size',
        requiresPath: '.serena/logs',
        defaultChecked: false,
        group: 'serena',
    },
];

// Claude Code Agent・Skill 管理用 IPC チャンネル
export const ASSET_MANAGER_CHANNELS = {
    GET_ENVIRONMENTS: 'asset-manager:get-environments',
    LIST: 'asset-manager:list',
    DOWNLOAD: 'asset-manager:download',
    INSPECT_UPLOAD: 'asset-manager:inspect-upload',
    UPLOAD: 'asset-manager:upload',
    UPLOAD_MD: 'asset-manager:upload-md',
    DELETE: 'asset-manager:delete',
    IS_GIT_AVAILABLE: 'asset-manager:is-git-available',
    LIST_OFFICIAL_SKILLS: 'asset-manager:list-official-skills',
    IMPORT_OFFICIAL_SKILLS: 'asset-manager:import-official-skills',
} as const;

// Claude Code 設定ファイル（~/.claude/settings.json）。CLAUDE_DIR 配下。
export const CLAUDE_CODE_SETTINGS_FILENAME = 'settings.json';

// 設定（settings.json）管理用 IPC チャンネル
export const SETTINGS_CHANNELS = {
    GET_ENVIRONMENTS: 'settings:get-environments',
    READ: 'settings:read',
    WRITE: 'settings:write',
    WRITE_RAW: 'settings:write-raw',
} as const;

// settings.json の編集対象項目（registry）。
// ここに 1 項目追加すると、読み取り・テーブル編集・保存まで反映される。
// 関係ない項目（permissions / enabledPlugins など）には一切触れない。
// settings.json の編集対象項目（registry）。
// group ごとにまとめて宣言する。SETTINGS_GROUP_ORDER の順で UI に見出し付きで表示される。
// defaultOn は未設定時に Claude Code が採用する既定値（公式ドキュメント準拠）。
export const SETTINGS_FIELDS: SettingsFieldSpec[] = [
    // === モデル・思考 ===
    { key: 'model', path: 'model', group: 'model', type: 'string', choices: ['opus', 'sonnet', 'haiku', 'fable'] },
    { key: 'advisorModel', path: 'advisorModel', group: 'model', type: 'string', choices: ['opus', 'sonnet', 'fable'] },
    { key: 'effortLevel', path: 'effortLevel', group: 'model', type: 'string', choices: ['low', 'medium', 'high', 'xhigh'] },
    { key: 'alwaysThinkingEnabled', path: 'alwaysThinkingEnabled', group: 'model', type: 'boolean', defaultOn: false },
    // language は任意の言語名を受け付ける自由文字列（japanese / english / spanish ...）。choices で限定しない。
    { key: 'language', path: 'language', group: 'model', type: 'string' },
    // outputStyle は組み込み（default / Explanatory / Learning）に加えカスタムも可。自由入力とする。
    { key: 'outputStyle', path: 'outputStyle', group: 'model', type: 'string' },

    // === エージェント ===
    // env オブジェクト内の CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS を ON/OFF するフラグ。
    // ON で "1" を設定、OFF で当該キーを削除する（env 内の他キーには触れない）。
    {
        key: 'agentTeams',
        path: 'env',
        group: 'agent',
        type: 'envFlag',
        envKey: 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
        onValue: '1',
    },
    { key: 'teammateMode', path: 'teammateMode', group: 'agent', type: 'string', choices: ['in-process', 'subprocess'] },
    { key: 'agentPushNotifEnabled', path: 'agentPushNotifEnabled', group: 'agent', type: 'boolean' },

    // === 表示・通知 ===
    { key: 'editorMode', path: 'editorMode', group: 'display', type: 'string', choices: ['normal', 'vim'] },
    {
        key: 'preferredNotifChannel',
        path: 'preferredNotifChannel',
        group: 'display',
        type: 'string',
        choices: ['auto', 'terminal_bell', 'iterm2', 'iterm2_with_bell', 'kitty', 'ghostty', 'notifications_disabled'],
    },
    { key: 'spinnerTipsEnabled', path: 'spinnerTipsEnabled', group: 'display', type: 'boolean', defaultOn: true },
    { key: 'showTurnDuration', path: 'showTurnDuration', group: 'display', type: 'boolean', defaultOn: true },
    { key: 'autoScrollEnabled', path: 'autoScrollEnabled', group: 'display', type: 'boolean', defaultOn: true },
    { key: 'awaySummaryEnabled', path: 'awaySummaryEnabled', group: 'display', type: 'boolean', defaultOn: true },

    // === 動作・データ ===
    { key: 'autoMemoryEnabled', path: 'autoMemoryEnabled', group: 'behavior', type: 'boolean', defaultOn: true },
    { key: 'includeCoAuthoredBy', path: 'includeCoAuthoredBy', group: 'behavior', type: 'boolean', defaultOn: true },
    { key: 'autoUpdatesChannel', path: 'autoUpdatesChannel', group: 'behavior', type: 'string', choices: ['stable', 'latest'] },
    { key: 'cleanupPeriodDays', path: 'cleanupPeriodDays', group: 'behavior', type: 'number', min: 1 },
];

// グループの表示順（UI の見出し順）。
export const SETTINGS_GROUP_ORDER: string[] = ['model', 'agent', 'display', 'behavior'];

// 公式スキルリポジトリ（Anthropic 公式 skills）。clone/pull のソースとして使用する。
export const OFFICIAL_SKILLS_REPO_URL = 'https://github.com/anthropics/skills.git';
// 公式リポジトリの既定ブランチ。
export const OFFICIAL_SKILLS_REPO_BRANCH = 'main';
// リポジトリ内のスキル格納ディレクトリ（リポジトリルートからの相対）。
export const OFFICIAL_SKILLS_REPO_SUBDIR = 'skills';
// clone 先ディレクトリ名（app.getPath('userData')/repos/<dir>）。
export const OFFICIAL_SKILLS_REPO_DIRNAME = 'anthropics-skills';

// 自動アップデート用 IPC チャンネル
export const UPDATER_CHANNELS = {
    CHECK: 'updater:check',
    DOWNLOAD: 'updater:download',
    QUIT_AND_INSTALL: 'updater:quit-and-install',
    GET_STATE: 'updater:get-state',
    STATE_CHANGED: 'updater:state-changed',
} as const;

// Claude Desktop実行ファイルパス
export const getClaudeExecutablePaths = (): string[] => {
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
        return [join(localAppData, 'AnthropicClaude', 'claude.exe')];
    } else if (process.platform === 'darwin') {
        // ユーザーレベルを優先、次にシステムレベル
        return [
            join(homedir(), 'Applications', 'Claude.app', 'Contents', 'MacOS', 'Claude'),
            '/Applications/Claude.app/Contents/MacOS/Claude',
        ];
    } else {
        return ['/usr/bin/claude', '/usr/local/bin/claude', join(homedir(), '.local', 'bin', 'claude')];
    }
};
