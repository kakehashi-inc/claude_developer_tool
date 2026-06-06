import { execFile } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

/**
 * execFile を Promise 化し、stdout/stderr を文字列で受け取るヘルパー。
 * git の出力は UTF-8 のため文字列で扱える。windowsHide で子プロセスのウィンドウを抑止する。
 */
function execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFile('git', args, { encoding: 'utf8', windowsHide: true, cwd }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve({ stdout: stdout as string, stderr: stderr as string });
        });
    });
}

/**
 * git コマンドの実行を担うユーティリティ。
 * - 利用可否（git がインストールされているか）の判定。
 * - 指定リポジトリの clone もしくは更新（fetch + reset --hard）。
 *
 * 浅い clone（--depth 1）を前提とし、更新は origin の最新へ確実に合わせるため
 * fetch 後に reset --hard origin/<branch> を行う（ローカル変更は破棄してよいソース用途）。
 */
export class GitRunner {
    private available: boolean | null = null;

    /** git がインストールされ実行可能か（結果はキャッシュ）。 */
    async isAvailable(): Promise<boolean> {
        if (this.available !== null) {
            return this.available;
        }
        try {
            await execGit(['--version']);
            this.available = true;
        } catch {
            this.available = false;
        }
        return this.available;
    }

    /**
     * destDir にリポジトリを用意する。
     * - 未存在: 親を作成して shallow clone する。
     * - 既存（.git あり）: fetch して origin/<branch> へ reset --hard で最新化する。
     * - 既存だが .git が無い（壊れている）: 例外を投げる（呼び出し側でエラー通知）。
     *
     * 例外は握りつぶさず呼び出し側へ伝播する。
     */
    async cloneOrUpdate(repoUrl: string, destDir: string, branch: string): Promise<void> {
        const gitDir = join(destDir, '.git');
        if (existsSync(gitDir)) {
            // 既存リポジトリ: 最新を取得して強制的に合わせる。
            await execGit(['-C', destDir, 'fetch', '--depth', '1', 'origin', branch]);
            await execGit(['-C', destDir, 'reset', '--hard', `origin/${branch}`]);
            return;
        }
        if (existsSync(destDir)) {
            // ディレクトリは在るが git リポジトリでない（壊れている）。安全のため処理を中断する。
            throw new Error(`Destination exists but is not a git repository: ${destDir}`);
        }
        // 新規 clone: 親ディレクトリを作成してから shallow clone する。
        mkdirSync(dirname(destDir), { recursive: true });
        await execGit(['clone', '--depth', '1', '--branch', branch, repoUrl, destDir]);
    }
}
