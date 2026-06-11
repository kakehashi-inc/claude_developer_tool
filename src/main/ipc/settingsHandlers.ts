import { ipcMain } from 'electron';
import { SETTINGS_CHANNELS } from '../../shared/constants';
import { ClaudeEnvironment, SettingsValues } from '../../shared/types';
import { SettingsManager } from '../services/SettingsManager';

/**
 * Claude Code 設定（~/.claude/settings.json）管理の IPC ハンドラを登録する。
 */
export function registerSettingsHandlers(manager: SettingsManager): void {
    // 環境一覧（native + Claude 入り WSL distro）を取得
    ipcMain.handle(SETTINGS_CHANNELS.GET_ENVIRONMENTS, () => {
        return manager.getEnvironments();
    });

    // 指定環境の settings.json を読み、登録項目の値と生 JSON を返す
    ipcMain.handle(SETTINGS_CHANNELS.READ, (_, env: ClaudeEnvironment) => {
        return manager.read(env);
    });

    // テーブル編集の保存（登録項目だけを差分マージ）
    ipcMain.handle(SETTINGS_CHANNELS.WRITE, (_, env: ClaudeEnvironment, values: SettingsValues) => {
        return manager.write(env, values);
    });

    // 直接編集の保存（生 JSON を構文チェックしてそのまま書き込み）
    ipcMain.handle(SETTINGS_CHANNELS.WRITE_RAW, (_, env: ClaudeEnvironment, rawJson: string) => {
        return manager.writeRaw(env, rawJson);
    });
}
