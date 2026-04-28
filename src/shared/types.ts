// 共有型定義
export interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
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

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateState {
    status: UpdateStatus;
    version?: string;
    progress?: number;
    error?: string;
}
