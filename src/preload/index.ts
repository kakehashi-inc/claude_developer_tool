import { contextBridge, ipcRenderer } from 'electron';
import type {
    ClaudeCodeEnvInfo,
    ClaudeDesktopInfo,
    ClaudeEnvironment,
    CleanupEnvReport,
    CleanupSelection,
    MCPServerInfo,
    OtherCleanupReport,
    OtherCleanupSelection,
    UpdateState,
} from '../shared/types';

// preload はサンドボックス下で単一ファイル実行されるため、共有定数を import せずに文字列を直接記述する
// (shared/constants.ts の UPDATER_CHANNELS と一致させること)
const UPDATER_CHANNELS = {
    CHECK: 'updater:check',
    DOWNLOAD: 'updater:download',
    QUIT_AND_INSTALL: 'updater:quit-and-install',
    GET_STATE: 'updater:get-state',
    STATE_CHANGED: 'updater:state-changed',
} as const;

// preload はサンドボックス下のため定数 import 不可。以下のチャンネル文字列は
// shared/constants.ts の CLAUDE_CODE_CHANNELS / CLAUDE_CLEANUP_CHANNELS と一致させること。
const CLAUDE_CODE_CHANNELS = {
    GET_ENVIRONMENTS: 'claude-code:get-environments',
    GET_MCP_SERVERS: 'claude-code:get-mcp-servers',
    ENABLE: 'claude-code:enable-mcp-server',
    DISABLE: 'claude-code:disable-mcp-server',
    REORDER: 'claude-code:reorder-mcp-servers',
    REORDER_DISABLED: 'claude-code:reorder-disabled-mcp-servers',
} as const;

const CLAUDE_CLEANUP_CHANNELS = {
    GET_ENVIRONMENTS: 'claude-cleanup:get-environments',
    SCAN: 'claude-cleanup:scan',
    DELETE: 'claude-cleanup:delete',
    GET_OTHER_ENVIRONMENTS: 'claude-cleanup:get-other-environments',
    SCAN_OTHER: 'claude-cleanup:scan-other',
    DELETE_OTHER: 'claude-cleanup:delete-other',
} as const;

type MCPServers = { enabled: MCPServerInfo[]; disabled: MCPServerInfo[] };

// レンダラープロセスに公開するAPI
const api = {
    claudeDesktop: {
        getInfo: (): Promise<ClaudeDesktopInfo> => ipcRenderer.invoke('claude-desktop:get-info'),

        getMCPServers: (): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> =>
            ipcRenderer.invoke('claude-desktop:get-mcp-servers'),

        disableMCPServer: (serverName: string): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> =>
            ipcRenderer.invoke('claude-desktop:disable-mcp-server', serverName),

        enableMCPServer: (serverName: string): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> =>
            ipcRenderer.invoke('claude-desktop:enable-mcp-server', serverName),

        reorderMCPServers: (serverNames: string[]): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> =>
            ipcRenderer.invoke('claude-desktop:reorder-mcp-servers', serverNames),

        reorderDisabledMCPServers: (
            serverNames: string[]
        ): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> =>
            ipcRenderer.invoke('claude-desktop:reorder-disabled-mcp-servers', serverNames),

        restart: (): Promise<void> => ipcRenderer.invoke('claude-desktop:restart'),
    },
    claudeCode: {
        getEnvironments: (): Promise<ClaudeCodeEnvInfo[]> => ipcRenderer.invoke(CLAUDE_CODE_CHANNELS.GET_ENVIRONMENTS),

        getMCPServers: (env: ClaudeEnvironment): Promise<MCPServers> =>
            ipcRenderer.invoke(CLAUDE_CODE_CHANNELS.GET_MCP_SERVERS, env),

        enableMCPServer: (env: ClaudeEnvironment, serverName: string): Promise<MCPServers> =>
            ipcRenderer.invoke(CLAUDE_CODE_CHANNELS.ENABLE, env, serverName),

        disableMCPServer: (env: ClaudeEnvironment, serverName: string): Promise<MCPServers> =>
            ipcRenderer.invoke(CLAUDE_CODE_CHANNELS.DISABLE, env, serverName),

        reorderMCPServers: (env: ClaudeEnvironment, serverNames: string[]): Promise<MCPServers> =>
            ipcRenderer.invoke(CLAUDE_CODE_CHANNELS.REORDER, env, serverNames),

        reorderDisabledMCPServers: (env: ClaudeEnvironment, serverNames: string[]): Promise<MCPServers> =>
            ipcRenderer.invoke(CLAUDE_CODE_CHANNELS.REORDER_DISABLED, env, serverNames),
    },
    claudeCleanup: {
        getEnvironments: (): Promise<{ env: ClaudeEnvironment; label: string }[]> =>
            ipcRenderer.invoke(CLAUDE_CLEANUP_CHANNELS.GET_ENVIRONMENTS),

        scan: (env: ClaudeEnvironment): Promise<CleanupEnvReport> =>
            ipcRenderer.invoke(CLAUDE_CLEANUP_CHANNELS.SCAN, env),

        delete: (env: ClaudeEnvironment, selection: CleanupSelection): Promise<CleanupEnvReport> =>
            ipcRenderer.invoke(CLAUDE_CLEANUP_CHANNELS.DELETE, env, selection),

        getOtherEnvironments: (): Promise<{ env: ClaudeEnvironment; label: string }[]> =>
            ipcRenderer.invoke(CLAUDE_CLEANUP_CHANNELS.GET_OTHER_ENVIRONMENTS),

        scanOther: (env: ClaudeEnvironment): Promise<OtherCleanupReport> =>
            ipcRenderer.invoke(CLAUDE_CLEANUP_CHANNELS.SCAN_OTHER, env),

        deleteOther: (env: ClaudeEnvironment, selection: OtherCleanupSelection): Promise<OtherCleanupReport> =>
            ipcRenderer.invoke(CLAUDE_CLEANUP_CHANNELS.DELETE_OTHER, env, selection),
    },
    window: {
        minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),

        maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),

        close: (): Promise<void> => ipcRenderer.invoke('window:close'),

        isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    },
    system: {
        getTheme: (): Promise<'light' | 'dark'> => ipcRenderer.invoke('system:get-theme'),

        getLocale: (): Promise<string> => ipcRenderer.invoke('system:get-locale'),

        getVersion: (): Promise<string> => ipcRenderer.invoke('system:get-version'),
    },
    updater: {
        getState: (): Promise<UpdateState> => ipcRenderer.invoke(UPDATER_CHANNELS.GET_STATE),

        check: (): Promise<void> => ipcRenderer.invoke(UPDATER_CHANNELS.CHECK),

        download: (): Promise<void> => ipcRenderer.invoke(UPDATER_CHANNELS.DOWNLOAD),

        quitAndInstall: (): Promise<void> => ipcRenderer.invoke(UPDATER_CHANNELS.QUIT_AND_INSTALL),

        onStateChanged: (callback: (state: UpdateState) => void): (() => void) => {
            const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
                callback(state);
            };
            ipcRenderer.on(UPDATER_CHANNELS.STATE_CHANGED, listener);
            return () => {
                ipcRenderer.removeListener(UPDATER_CHANNELS.STATE_CHANGED, listener);
            };
        },
    },
};

// APIをグローバルに公開
contextBridge.exposeInMainWorld('api', api);

// 型定義をエクスポート（レンダラープロセスで使用）
export type API = typeof api;
