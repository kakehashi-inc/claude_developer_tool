import { existsSync, readdirSync, statSync, lstatSync } from 'fs';
import { join } from 'path';

/**
 * 指定ディレクトリ（絶対パス）の合計サイズをバイト単位で再帰的に計算する。
 * - symlink はスキップして無限ループ・二重計上を防ぐ。
 * - 存在しないパスは 0 を返す。
 * - 読み取り不能なエントリは無視して継続する。
 */
export function recursiveDirSize(absPath: string): number {
    if (!existsSync(absPath)) {
        return 0;
    }

    let total = 0;

    let entries;
    try {
        entries = readdirSync(absPath, { withFileTypes: true });
    } catch {
        return 0;
    }

    for (const entry of entries) {
        const entryPath = join(absPath, entry.name);

        // symlink はスキップ
        if (entry.isSymbolicLink()) {
            continue;
        }

        try {
            if (entry.isDirectory()) {
                total += recursiveDirSize(entryPath);
            } else if (entry.isFile()) {
                total += statSync(entryPath).size;
            } else {
                // Dirent の種別が不明な場合は lstat で確認
                const st = lstatSync(entryPath);
                if (st.isSymbolicLink()) {
                    continue;
                }
                if (st.isDirectory()) {
                    total += recursiveDirSize(entryPath);
                } else if (st.isFile()) {
                    total += st.size;
                }
            }
        } catch {
            // アクセス不能なエントリは無視
        }
    }

    return total;
}
