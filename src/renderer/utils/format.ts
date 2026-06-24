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

// 「直近」と判定する期間（ミリ秒）。これ以内の更新を NEW 扱いにする。
const RECENT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 最終更新日時（エポックミリ秒）を 'YYYY-MM-DD HH:mm' 形式に整形する。
 * 0・未取得・不正値の場合は空文字を返す。
 */
export function formatDateTime(mtimeMs: number | undefined): string {
    if (!mtimeMs || !Number.isFinite(mtimeMs) || mtimeMs <= 0) {
        return '';
    }
    const d = new Date(mtimeMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
}

/**
 * 最終更新日時が直近 7 日間以内かどうかを判定する（NEW マーク表示用）。
 */
export function isRecent(mtimeMs: number | undefined, now: number = Date.now()): boolean {
    if (!mtimeMs || !Number.isFinite(mtimeMs) || mtimeMs <= 0) {
        return false;
    }
    return now - mtimeMs <= RECENT_THRESHOLD_MS && mtimeMs <= now + RECENT_THRESHOLD_MS;
}

// 相対表示の単位種別。count を持つものと持たないもの（単数固定）に分かれる。
// i18n キー `assetManager.relative.<key>` に対応する。
export interface RelativeTimePart {
    key: 'today' | 'yesterday' | 'daysAgo' | 'monthAgo' | 'monthsAgo' | 'yearAgo' | 'yearsAgo';
    count?: number;
}

/**
 * 最終更新日時（エポックミリ秒）を「現在からの差」を表す相対表示の構成要素に変換する。
 * 段階は 今日 / 昨日 / N日前 / Nヵ月前 / N年前 の 5 種類（暦ベース）。
 * - 日数は暦日基準（同じ暦日=今日、1 暦日前=昨日）。
 * - 月数・年数は暦上の完全な経過月数 / 年数で算出する。
 * 取得不能・不正値の場合は null を返す。
 */
export function relativeTimeParts(mtimeMs: number | undefined, now: number = Date.now()): RelativeTimePart | null {
    if (!mtimeMs || !Number.isFinite(mtimeMs) || mtimeMs <= 0) {
        return null;
    }
    const then = new Date(mtimeMs);
    const nowDate = new Date(now);

    // 暦日の差（時刻成分を落として日付だけで比較する）。
    const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
    const startNow = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.round((startNow.getTime() - startThen.getTime()) / dayMs);

    if (days <= 0) {
        return { key: 'today' };
    }
    if (days === 1) {
        return { key: 'yesterday' };
    }

    // 暦上の完全な経過月数（日にちが足りなければ 1 減らす）。
    let months = (nowDate.getFullYear() - then.getFullYear()) * 12 + (nowDate.getMonth() - then.getMonth());
    if (nowDate.getDate() < then.getDate()) {
        months -= 1;
    }
    if (months < 1) {
        return { key: 'daysAgo', count: days };
    }

    const years = Math.floor(months / 12);
    if (years < 1) {
        return months === 1 ? { key: 'monthAgo' } : { key: 'monthsAgo', count: months };
    }
    return years === 1 ? { key: 'yearAgo' } : { key: 'yearsAgo', count: years };
}
