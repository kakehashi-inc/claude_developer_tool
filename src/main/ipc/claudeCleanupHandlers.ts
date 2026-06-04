import { ipcMain } from 'electron';
import { CLAUDE_CLEANUP_CHANNELS } from '../../shared/constants';
import { ClaudeEnvironment, CleanupSelection, OtherCleanupSelection } from '../../shared/types';
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

    // 「その他のツール」: 環境一覧（native + ~/.serena を持つ WSL distro）
    ipcMain.handle(CLAUDE_CLEANUP_CHANNELS.GET_OTHER_ENVIRONMENTS, () => {
        return manager.getOtherEnvironments();
    });

    // 「その他のツール」: 項目をスキャン
    ipcMain.handle(CLAUDE_CLEANUP_CHANNELS.SCAN_OTHER, (_, env: ClaudeEnvironment) => {
        return manager.scanOther(env);
    });

    // 「その他のツール」: 選択項目を実行して再スキャン結果を返す
    ipcMain.handle(
        CLAUDE_CLEANUP_CHANNELS.DELETE_OTHER,
        (_, env: ClaudeEnvironment, selection: OtherCleanupSelection) => {
            return manager.deleteOther(env, selection);
        }
    );
}
