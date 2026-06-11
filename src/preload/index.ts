import { contextBridge, ipcRenderer } from 'electron';
import type {
    AssetKind,
    AssetListReport,
    AssetOpResult,
    ClaudeCodeEnvInfo,
    ClaudeDesktopInfo,
    ClaudeEnvironment,
    CleanupEnvReport,
    CleanupSelection,
    MCPServerInfo,
    OtherCleanupReport,
    OtherCleanupSelection,
    SettingsReadResult,
    SettingsValues,
    SettingsWriteResult,
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

// preload はサンドボックス下のため定数 import 不可。以下のチャンネル文字列は
// shared/constants.ts の ASSET_MANAGER_CHANNELS と一致させること。
const ASSET_MANAGER_CHANNELS = {
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

// shared/constants.ts の SETTINGS_CHANNELS と一致させること。
const SETTINGS_CHANNELS = {
    GET_ENVIRONMENTS: 'settings:get-environments',
    READ: 'settings:read',
    WRITE: 'settings:write',
    WRITE_RAW: 'settings:write-raw',
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
    assetManager: {
        getEnvironments: (): Promise<{ env: ClaudeEnvironment; label: string }[]> =>
            ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.GET_ENVIRONMENTS),

        list: (env: ClaudeEnvironment, kind: AssetKind): Promise<AssetListReport> =>
            ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.LIST, env, kind),

        download: (env: ClaudeEnvironment, kind: AssetKind, names: string[]): Promise<AssetOpResult> =>
            ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.DOWNLOAD, env, kind, names),

        inspectUpload: (env: ClaudeEnvironment, kind: AssetKind): Promise<AssetOpResult> =>
            ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.INSPECT_UPLOAD, env, kind),

        upload: (
            env: ClaudeEnvironment,
            kind: AssetKind,
            zipPath: string,
            overwrite: boolean
        ): Promise<AssetOpResult> => ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.UPLOAD, env, kind, zipPath, overwrite),

        uploadMd: (
            env: ClaudeEnvironment,
            kind: AssetKind,
            mdPath: string,
            overwrite: boolean
        ): Promise<AssetOpResult> => ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.UPLOAD_MD, env, kind, mdPath, overwrite),

        deleteSelected: (env: ClaudeEnvironment, kind: AssetKind, relPaths: string[]): Promise<AssetOpResult> =>
            ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.DELETE, env, kind, relPaths),

        isGitAvailable: (): Promise<boolean> => ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.IS_GIT_AVAILABLE),

        listOfficialSkills: (): Promise<AssetOpResult> =>
            ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.LIST_OFFICIAL_SKILLS),

        importOfficialSkills: (env: ClaudeEnvironment, relPaths: string[]): Promise<AssetOpResult> =>
            ipcRenderer.invoke(ASSET_MANAGER_CHANNELS.IMPORT_OFFICIAL_SKILLS, env, relPaths),
    },
    settings: {
        getEnvironments: (): Promise<{ env: ClaudeEnvironment; label: string }[]> =>
            ipcRenderer.invoke(SETTINGS_CHANNELS.GET_ENVIRONMENTS),

        read: (env: ClaudeEnvironment): Promise<SettingsReadResult> => ipcRenderer.invoke(SETTINGS_CHANNELS.READ, env),

        write: (env: ClaudeEnvironment, values: SettingsValues): Promise<SettingsWriteResult> =>
            ipcRenderer.invoke(SETTINGS_CHANNELS.WRITE, env, values),

        writeRaw: (env: ClaudeEnvironment, rawJson: string): Promise<SettingsWriteResult> =>
            ipcRenderer.invoke(SETTINGS_CHANNELS.WRITE_RAW, env, rawJson),
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
