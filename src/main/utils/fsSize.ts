import { existsSync, readdirSync, statSync, lstatSync } from 'fs';
import { join } from 'path';

export interface DirStats {
    size: number;
    fileCount: number;
}

/**
 * 指定ディレクトリ（絶対パス）の合計サイズ（バイト）とファイル数を再帰的に集計する。
 * - symlink はスキップして無限ループ・二重計上を防ぐ。
 * - 存在しないパスは { size: 0, fileCount: 0 } を返す。
 * - 読み取り不能なエントリは無視して継続する。
 */
export function recursiveDirStats(absPath: string): DirStats {
    if (!existsSync(absPath)) {
        return { size: 0, fileCount: 0 };
    }

    let size = 0;
    let fileCount = 0;

    let entries;
    try {
        entries = readdirSync(absPath, { withFileTypes: true });
    } catch {
        return { size: 0, fileCount: 0 };
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
            } else if (entry.isFile()) {
                size += statSync(entryPath).size;
                fileCount += 1;
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
                } else if (st.isFile()) {
                    size += st.size;
                    fileCount += 1;
                }
            }
        } catch {
            // アクセス不能なエントリは無視
        }
    }

    return { size, fileCount };
}

/**
 * 指定ディレクトリの合計サイズ（バイト）を再帰的に計算する。
 * 後方互換のため recursiveDirStats のサイズだけを返す薄いラッパー。
 */
export function recursiveDirSize(absPath: string): number {
    return recursiveDirStats(absPath).size;
}
