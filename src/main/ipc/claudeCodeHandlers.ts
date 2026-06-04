import { ipcMain } from 'electron';
import { CLAUDE_CODE_CHANNELS } from '../../shared/constants';
import { ClaudeEnvironment } from '../../shared/types';
import { ClaudeCodeManager } from '../services/ClaudeCodeManager';

export function registerClaudeCodeHandlers(manager: ClaudeCodeManager): void {
    // 環境一覧（native + Claude 入り WSL distro）を取得
    ipcMain.handle(CLAUDE_CODE_CHANNELS.GET_ENVIRONMENTS, () => {
        return manager.getEnvironments();
    });

    // MCP サーバーリストを取得
    ipcMain.handle(CLAUDE_CODE_CHANNELS.GET_MCP_SERVERS, (_, env: ClaudeEnvironment) => {
        return manager.getMCPServers(env);
    });

    // MCP サーバーを無効化
    ipcMain.handle(CLAUDE_CODE_CHANNELS.DISABLE, (_, env: ClaudeEnvironment, serverName: string) => {
        return manager.disableMCPServer(env, serverName);
    });

    // MCP サーバーを有効化
    ipcMain.handle(CLAUDE_CODE_CHANNELS.ENABLE, (_, env: ClaudeEnvironment, serverName: string) => {
        return manager.enableMCPServer(env, serverName);
    });

    // MCP サーバーの順序を変更（有効）
    ipcMain.handle(CLAUDE_CODE_CHANNELS.REORDER, (_, env: ClaudeEnvironment, serverNames: string[]) => {
        return manager.reorderMCPServers(env, serverNames);
    });

    // MCP サーバーの順序を変更（無効）
    ipcMain.handle(CLAUDE_CODE_CHANNELS.REORDER_DISABLED, (_, env: ClaudeEnvironment, serverNames: string[]) => {
        return manager.reorderDisabledMCPServers(env, serverNames);
    });
}
