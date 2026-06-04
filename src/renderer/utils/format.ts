import type { ClaudeEnvironment } from '../../shared/types';

/**
 * バイト数を人間が読みやすい単位（B/KB/MB/GB）に整形する。
 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    const fixed = i === 0 ? 0 : value < 10 ? 2 : 1;
    return `${value.toFixed(fixed)} ${units[i]}`;
}

/**
 * ファイル数を桁区切りで整形する。
 */
export function formatCount(n: number): string {
    if (!Number.isFinite(n) || n <= 0) {
        return '0';
    }
    return Math.round(n).toLocaleString();
}

/**
 * ClaudeEnvironment を React の key / 状態マップ用の安定キーに変換する。
 */
export function envId(env: ClaudeEnvironment): string {
    return env.kind === 'wsl' ? `wsl:${env.distro ?? ''}` : 'native';
}
