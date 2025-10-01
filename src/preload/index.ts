import { contextBridge, ipcRenderer } from 'electron';
import type { ClaudeDesktopInfo, MCPServerInfo } from '../shared/types';

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
};

// APIをグローバルに公開
contextBridge.exposeInMainWorld('api', api);

// 型定義をエクスポート（レンダラープロセスで使用）
export type API = typeof api;
