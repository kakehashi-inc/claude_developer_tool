import { BrowserWindow, ipcMain } from 'electron';
import { ASSET_MANAGER_CHANNELS } from '../../shared/constants';
import { AssetKind, ClaudeEnvironment } from '../../shared/types';
import { AssetManager } from '../services/AssetManager';

/**
 * Claude Code Agent・Skill 管理の IPC ハンドラを登録する。
 * ダウンロード/アップロードのダイアログ表示に親ウィンドウが必要なため、
 * 現在の mainWindow を返す getter を受け取る。
 */
export function registerAssetManagerHandlers(manager: AssetManager, getMainWindow: () => BrowserWindow | null): void {
    // 環境一覧（native + Claude 入り WSL distro）を取得
    ipcMain.handle(ASSET_MANAGER_CHANNELS.GET_ENVIRONMENTS, () => {
        return manager.getEnvironments();
    });

    // 指定環境・種別のサブディレクトリ一覧を取得
    ipcMain.handle(ASSET_MANAGER_CHANNELS.LIST, (_, env: ClaudeEnvironment, kind: AssetKind) => {
        return manager.list(env, kind);
    });

    // 選択したサブディレクトリを 1 つの ZIP にまとめてダウンロード
    ipcMain.handle(ASSET_MANAGER_CHANNELS.DOWNLOAD, (_, env: ClaudeEnvironment, kind: AssetKind, names: string[]) => {
        return manager.download(env, kind, names, getMainWindow());
    });

    // アップロード前検査（ZIP 選択 + 同名衝突の検出）
    ipcMain.handle(ASSET_MANAGER_CHANNELS.INSPECT_UPLOAD, (_, env: ClaudeEnvironment, kind: AssetKind) => {
        return manager.inspectUpload(env, kind, getMainWindow());
    });

    // ZIP を対象フォルダへ展開（overwrite 時は同名を丸ごと置換）
    ipcMain.handle(
        ASSET_MANAGER_CHANNELS.UPLOAD,
        (_, env: ClaudeEnvironment, kind: AssetKind, zipPath: string, overwrite: boolean) => {
            return manager.upload(env, kind, zipPath, overwrite);
        }
    );

    // md 単体を取り込む（skills は SKILL.md 化、agents は .md をそのまま配置）
    ipcMain.handle(
        ASSET_MANAGER_CHANNELS.UPLOAD_MD,
        (_, env: ClaudeEnvironment, kind: AssetKind, mdPath: string, overwrite: boolean) => {
            return manager.uploadMd(env, kind, mdPath, overwrite);
        }
    );

    // 選択したエージェント / スキルを削除
    ipcMain.handle(ASSET_MANAGER_CHANNELS.DELETE, (_, env: ClaudeEnvironment, kind: AssetKind, relPaths: string[]) => {
        return manager.deleteSelected(env, kind, relPaths);
    });

    // git が利用可能か（公式スキルインポートボタンの活性判定）
    ipcMain.handle(ASSET_MANAGER_CHANNELS.IS_GIT_AVAILABLE, () => {
        return manager.isGitAvailable();
    });

    // 公式スキルリポジトリを clone/更新し、スキル一覧を返す
    ipcMain.handle(ASSET_MANAGER_CHANNELS.LIST_OFFICIAL_SKILLS, () => {
        return manager.listOfficialSkills();
    });

    // 選択した公式スキルを対象環境へ取り込む（公式同士は確認なしで置換）
    ipcMain.handle(ASSET_MANAGER_CHANNELS.IMPORT_OFFICIAL_SKILLS, (_, env: ClaudeEnvironment, relPaths: string[]) => {
        return manager.importOfficialSkills(env, relPaths);
    });
}
