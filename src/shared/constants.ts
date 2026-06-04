import { homedir } from 'os';
import { join } from 'path';
import { OSType, OtherCleanupItem } from './types';

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
    expandable?: boolean;
}

// デフォルトはすべてチェック OFF（ユーザーが明示的に選択する）。
export const CLEANUP_CANDIDATES: CleanupCandidateSpec[] = [
    { key: 'projects', defaultChecked: false, expandable: true },
    { key: 'file-history', defaultChecked: false },
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
