import { homedir } from 'os';
import { join } from 'path';
import { OSType } from './types';

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
