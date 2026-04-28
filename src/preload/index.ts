import { contextBridge, ipcRenderer } from 'electron';
import type { ClaudeDesktopInfo, MCPServerInfo, UpdateState } from '../shared/types';

// preload はサンドボックス下で単一ファイル実行されるため、共有定数を import せずに文字列を直接記述する
// (shared/constants.ts の UPDATER_CHANNELS と一致させること)
const UPDATER_CHANNELS = {
    CHECK: 'updater:check',
    DOWNLOAD: 'updater:download',
    QUIT_AND_INSTALL: 'updater:quit-and-install',
    GET_STATE: 'updater:get-state',
    STATE_CHANGED: 'updater:state-changed',
} as const;

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
