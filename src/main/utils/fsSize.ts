import { existsSync, readdirSync, statSync, lstatSync } from 'fs';
import { join } from 'path';

export interface DirStats {
    size: number;
    fileCount: number;
    // フォルダ内ファイルの最終更新日時（エポックミリ秒）の最大値。ファイルが無ければ 0。
    mtimeMs: number;
}

/**
 * 指定ディレクトリ（絶対パス）の合計サイズ（バイト）・ファイル数・最終更新日時（最大）を再帰的に集計する。
 * - symlink はスキップして無限ループ・二重計上を防ぐ。
 * - 存在しないパスは { size: 0, fileCount: 0, mtimeMs: 0 } を返す。
 * - 読み取り不能なエントリは無視して継続する。
 */
export function recursiveDirStats(absPath: string): DirStats {
    if (!existsSync(absPath)) {
        return { size: 0, fileCount: 0, mtimeMs: 0 };
    }

    let size = 0;
    let fileCount = 0;
    let mtimeMs = 0;

    let entries;
    try {
        entries = readdirSync(absPath, { withFileTypes: true });
    } catch {
        return { size: 0, fileCount: 0, mtimeMs: 0 };
    }

    for (const entry of entries) {
        const entryPath = join(absPath, entry.name);

        // symlink はスキップ
        if (entry.isSymbolicLink()) {
            continue;
        }

        try {
            if (entry.isDirectory()) {
                const sub = recursiveDirStats(entryPath);
                size += sub.size;
                fileCount += sub.fileCount;
                mtimeMs = Math.max(mtimeMs, sub.mtimeMs);
            } else if (entry.isFile()) {
                const st = statSync(entryPath);
                size += st.size;
                fileCount += 1;
                mtimeMs = Math.max(mtimeMs, st.mtimeMs);
            } else {
                // Dirent の種別が不明な場合は lstat で確認
                const st = lstatSync(entryPath);
                if (st.isSymbolicLink()) {
                    continue;
                }
                if (st.isDirectory()) {
                    const sub = recursiveDirStats(entryPath);
                    size += sub.size;
                    fileCount += sub.fileCount;
                    mtimeMs = Math.max(mtimeMs, sub.mtimeMs);
                } else if (st.isFile()) {
                    size += st.size;
                    fileCount += 1;
                    mtimeMs = Math.max(mtimeMs, st.mtimeMs);
                }
            }
        } catch {
            // アクセス不能なエントリは無視
        }
    }

    return { size, fileCount, mtimeMs };
}

/**
 * 指定ディレクトリの合計サイズ（バイト）を再帰的に計算する。
 * 後方互換のため recursiveDirStats のサイズだけを返す薄いラッパー。
 */
export function recursiveDirSize(absPath: string): number {
    return recursiveDirStats(absPath).size;
}
