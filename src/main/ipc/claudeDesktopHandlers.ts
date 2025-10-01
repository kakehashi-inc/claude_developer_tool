import { ipcMain } from 'electron';
import { ClaudeDesktopManager } from '../services/ClaudeDesktopManager';

export function registerClaudeDesktopHandlers(manager: ClaudeDesktopManager): void {
    // Claude Desktop情報を取得
    ipcMain.handle('claude-desktop:get-info', () => {
        return manager.getClaudeDesktopInfo();
    });

    // MCPサーバーリストを取得
    ipcMain.handle('claude-desktop:get-mcp-servers', () => {
        return manager.getMCPServers();
    });

    // MCPサーバーを無効化
    ipcMain.handle('claude-desktop:disable-mcp-server', (_, serverName: string) => {
        manager.disableMCPServer(serverName);
        return manager.getMCPServers();
    });

    // MCPサーバーを有効化
    ipcMain.handle('claude-desktop:enable-mcp-server', (_, serverName: string) => {
        manager.enableMCPServer(serverName);
        return manager.getMCPServers();
    });

    // MCPサーバーの順序を変更（有効）
    ipcMain.handle('claude-desktop:reorder-mcp-servers', (_, serverNames: string[]) => {
        manager.reorderMCPServers(serverNames);
        return manager.getMCPServers();
    });

    // MCPサーバーの順序を変更（無効）
    ipcMain.handle('claude-desktop:reorder-disabled-mcp-servers', (_, serverNames: string[]) => {
        manager.reorderDisabledMCPServers(serverNames);
        return manager.getMCPServers();
    });

    // Claude Desktopを再起動
    ipcMain.handle('claude-desktop:restart', async () => {
        await manager.restartClaudeDesktop();
    });
}
