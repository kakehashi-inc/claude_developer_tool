import { ipcMain } from 'electron';
import { CLAUDE_CLEANUP_CHANNELS } from '../../shared/constants';
import { ClaudeEnvironment, CleanupSelection } from '../../shared/types';
import { ClaudeCleanupManager } from '../services/ClaudeCleanupManager';

export function registerClaudeCleanupHandlers(manager: ClaudeCleanupManager): void {
    // 環境一覧（native + Claude 入り WSL distro）を取得
    ipcMain.handle(CLAUDE_CLEANUP_CHANNELS.GET_ENVIRONMENTS, () => {
        return manager.getEnvironments();
    });

    // クリーンアップ候補をスキャン
    ipcMain.handle(CLAUDE_CLEANUP_CHANNELS.SCAN, (_, env: ClaudeEnvironment) => {
        return manager.scan(env);
    });

    // 選択された対象を削除して再スキャン結果を返す
    ipcMain.handle(CLAUDE_CLEANUP_CHANNELS.DELETE, (_, env: ClaudeEnvironment, selection: CleanupSelection) => {
        return manager.deleteSelected(env, selection);
    });
}
