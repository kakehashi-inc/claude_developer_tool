import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmSync, mkdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { ClaudeEnvironment } from '../../../shared/types';
import { recursiveDirStats, type DirStats } from '../../utils/fsSize';
import { WslDetector } from './WslDetector';

/**
 * ClaudeEnvironment（native / wsl）に対するファイル操作を抽象化する。
 *
 * - native: os.homedir() を基点に通常の fs を使用。
 * - wsl: \\wsl.localhost\<distro>\<home> もしくは \\wsl$\<distro>\<home> を UNC 基点として
 *        通常の fs を使用。どちらの UNC も到達できない場合は wsl コマンドモードへフォールバックする。
 *
 * relPath はすべて Linux ホームからの相対パス（例: '.claude.json', '.claude/projects'）。
 */
export class ClaudeFs {
    private readonly env: ClaudeEnvironment;
    private readonly detector: WslDetector;

    // WSL 用に解決済みの UNC 基点（例: \\wsl.localhost\Ubuntu-24.04\home\yendo）。
    // null = 未解決、'' = UNC 不可（コマンドモードを使う）。
    private uncBase: string | null = null;

    constructor(env: ClaudeEnvironment, detector: WslDetector) {
        this.env = env;
        this.detector = detector;
    }

    private get isWsl(): boolean {
        return this.env.kind === 'wsl';
    }

    private get distro(): string {
        if (!this.env.distro) {
            throw new Error('WSL environment requires a distro name');
        }
        return this.env.distro;
    }

    /**
     * WSL の UNC 基点を解決する。到達できない場合は '' を返し、コマンドモードへ切り替える。
     */
    private async resolveUncBase(): Promise<string> {
        if (this.uncBase !== null) {
            return this.uncBase;
        }
        const distro = this.distro;
        let home: string;
        try {
            home = await this.detector.resolveHome(distro);
        } catch {
            home = '';
        }
        if (home) {
            // Linux パス /home/user を Windows UNC の相対部分に変換
            const rel = home.replace(/^\//, '').replace(/\//g, '\\');
            const candidates = [`\\\\wsl.localhost\\${distro}\\${rel}`, `\\\\wsl$\\${distro}\\${rel}`];
            for (const base of candidates) {
                try {
                    if (existsSync(base)) {
                        this.uncBase = base;
                        return base;
                    }
                } catch {
                    // 次の候補へ
                }
            }
        }
        // UNC 不可 → コマンドモード
        this.uncBase = '';
        return '';
    }

    /** native のホーム基点 */
    private nativeBase(): string {
        return homedir();
    }

    /**
     * relPath を実 OS パス（native の絶対パス、または WSL UNC の絶対パス）に解決する。
     * コマンドモードが必要な場合は null を返す。
     */
    private async resolveAbs(relPath: string): Promise<string | null> {
        if (!this.isWsl) {
            return join(this.nativeBase(), relPath);
        }
        const base = await this.resolveUncBase();
        if (!base) {
            return null; // コマンドモード
        }
        const rel = relPath.replace(/\//g, '\\');
        return `${base}\\${rel}`;
    }

    /**
     * ZIP 圧縮・解凍など外部処理向けに実 OS パス（native 絶対パス / WSL UNC パス）を返す。
     * WSL でコマンドモードへフォールバックする（UNC 到達不可）場合は null。
     * その場合、呼び出し側は ZIP 操作不可として扱うこと。
     */
    async resolveRealPath(relPath: string): Promise<string | null> {
        return this.resolveAbs(relPath);
    }

    /** WSL コマンドモードで使う Linux 絶対パス */
    private async linuxPath(relPath: string): Promise<string> {
        const home = await this.detector.resolveHome(this.distro);
        return `${home}/${relPath}`;
    }

    /** 表示用のパス文字列（実際のアクセス可否に関わらず人間に分かる形） */
    async displayPath(relPath: string): Promise<string> {
        if (!this.isWsl) {
            return join(this.nativeBase(), relPath);
        }
        try {
            const home = await this.detector.resolveHome(this.distro);
            return `${home}/${relPath}`;
        } catch {
            return `~/${relPath}`;
        }
    }

    async exists(relPath: string): Promise<boolean> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            return existsSync(abs);
        }
        // コマンドモード
        try {
            await this.detector.runInDistro(this.distro, `test -e ${this.shellQuote(await this.linuxPath(relPath))}`);
            return true;
        } catch {
            return false;
        }
    }

    async readJson<T = unknown>(relPath: string): Promise<T | null> {
        const abs = await this.resolveAbs(relPath);
        try {
            if (abs !== null) {
                if (!existsSync(abs)) {
                    return null;
                }
                const content = readFileSync(abs, 'utf-8');
                return JSON.parse(content) as T;
            }
            // コマンドモード
            const lp = await this.linuxPath(relPath);
            const buf = await this.detector.runInDistro(this.distro, `cat ${this.shellQuote(lp)} 2>/dev/null || true`);
            const content = buf.toString('utf8');
            if (!content.trim()) {
                return null;
            }
            return JSON.parse(content) as T;
        } catch (error) {
            console.error(`Failed to read JSON from ${relPath} (${JSON.stringify(this.env)}):`, error);
            return null;
        }
    }

    async writeJson(relPath: string, data: unknown): Promise<void> {
        const content = JSON.stringify(data, null, 2);
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, content, 'utf-8');
            return;
        }
        // コマンドモード: base64 で投入してエスケープ問題を回避
        const lp = await this.linuxPath(relPath);
        const b64 = Buffer.from(content, 'utf8').toString('base64');
        await this.detector.runInDistro(
            this.distro,
            `mkdir -p ${this.shellQuote(this.dirnamePosix(lp))} && printf %s ${this.shellQuote(b64)} | base64 -d > ${this.shellQuote(lp)}`
        );
    }

    /** 生のテキストファイルを読み込む（JSON.parse せず、trim もしない）。存在しなければ null。 */
    async readText(relPath: string): Promise<string | null> {
        const abs = await this.resolveAbs(relPath);
        try {
            if (abs !== null) {
                if (!existsSync(abs)) {
                    return null;
                }
                return readFileSync(abs, 'utf-8');
            }
            // コマンドモード
            const lp = await this.linuxPath(relPath);
            const exists = await this.exists(relPath);
            if (!exists) {
                return null;
            }
            const buf = await this.detector.runInDistro(this.distro, `cat ${this.shellQuote(lp)}`);
            return buf.toString('utf8');
        } catch (error) {
            console.error(`Failed to read text from ${relPath} (${JSON.stringify(this.env)}):`, error);
            return null;
        }
    }

    /** 生のテキストを書き込む（content をそのまま、バイト忠実に。改行コードを保持）。 */
    async writeText(relPath: string, content: string): Promise<void> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, content, 'utf-8');
            return;
        }
        // コマンドモード: base64 で投入してエスケープ問題・改行変換を回避
        const lp = await this.linuxPath(relPath);
        const b64 = Buffer.from(content, 'utf8').toString('base64');
        await this.detector.runInDistro(
            this.distro,
            `mkdir -p ${this.shellQuote(this.dirnamePosix(lp))} && printf %s ${this.shellQuote(b64)} | base64 -d > ${this.shellQuote(lp)}`
        );
    }

    async deleteFile(relPath: string): Promise<void> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            if (existsSync(abs)) {
                unlinkSync(abs);
            }
            return;
        }
        const lp = await this.linuxPath(relPath);
        await this.detector.runInDistro(this.distro, `rm -f ${this.shellQuote(lp)}`);
    }

    /** ディレクトリ内のサブディレクトリ名一覧（ファイルは除く） */
    async listDirs(relPath: string): Promise<string[]> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            if (!existsSync(abs)) {
                return [];
            }
            try {
                return readdirSync(abs, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => d.name);
            } catch {
                return [];
            }
        }
        // コマンドモード
        try {
            const lp = await this.linuxPath(relPath);
            const buf = await this.detector.runInDistro(
                this.distro,
                `find ${this.shellQuote(lp)} -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' 2>/dev/null || true`
            );
            return buf
                .toString('utf8')
                .split(/\r?\n/)
                .map(s => s.trim())
                .filter(s => s.length > 0);
        } catch {
            return [];
        }
    }

    /** ディレクトリ内のファイル名一覧（サブディレクトリは除く）。 */
    async listFiles(relPath: string): Promise<string[]> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            if (!existsSync(abs)) {
                return [];
            }
            try {
                return readdirSync(abs, { withFileTypes: true })
                    .filter(d => d.isFile())
                    .map(d => d.name);
            } catch {
                return [];
            }
        }
        // コマンドモード
        try {
            const lp = await this.linuxPath(relPath);
            const buf = await this.detector.runInDistro(
                this.distro,
                `find ${this.shellQuote(lp)} -mindepth 1 -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null || true`
            );
            return buf
                .toString('utf8')
                .split(/\r?\n/)
                .map(s => s.trim())
                .filter(s => s.length > 0);
        } catch {
            return [];
        }
    }

    /** ディレクトリの再帰サイズ（バイト）とファイル数。存在しなければ {0,0}。 */
    async dirStats(relPath: string): Promise<DirStats> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            return recursiveDirStats(abs);
        }
        // コマンドモード: du -sb（バイト）と find ... -type f | wc -l（ファイル数）
        try {
            const lp = await this.linuxPath(relPath);
            const buf = await this.detector.runInDistro(
                this.distro,
                `du -sb ${this.shellQuote(lp)} 2>/dev/null | cut -f1 || echo 0; find ${this.shellQuote(lp)} -type f 2>/dev/null | wc -l || echo 0`
            );
            const [sizeLine, countLine] = buf.toString('utf8').split(/\r?\n/);
            const size = parseInt((sizeLine ?? '0').trim(), 10);
            const fileCount = parseInt((countLine ?? '0').trim(), 10);
            return {
                size: Number.isFinite(size) ? size : 0,
                fileCount: Number.isFinite(fileCount) ? fileCount : 0,
            };
        } catch {
            return { size: 0, fileCount: 0 };
        }
    }

    /** ディレクトリの再帰サイズ（バイト）。存在しなければ 0。dirStats の薄いラッパー。 */
    async dirSize(relPath: string): Promise<number> {
        return (await this.dirStats(relPath)).size;
    }

    /** 単一ファイルのサイズ（バイト）とファイル数（存在すれば 1）。存在しなければ {0,0}。 */
    async fileStats(relPath: string): Promise<DirStats> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            try {
                const st = statSync(abs);
                return { size: st.size, fileCount: 1 };
            } catch {
                return { size: 0, fileCount: 0 };
            }
        }
        // コマンドモード: stat -c %s でバイト数を取得。
        try {
            const lp = await this.linuxPath(relPath);
            const buf = await this.detector.runInDistro(
                this.distro,
                `stat -c %s ${this.shellQuote(lp)} 2>/dev/null || echo 0`
            );
            const size = parseInt(buf.toString('utf8').trim(), 10);
            const valid = Number.isFinite(size) && size > 0;
            return { size: valid ? size : 0, fileCount: valid ? 1 : 0 };
        } catch {
            return { size: 0, fileCount: 0 };
        }
    }

    /** ディレクトリを丸ごと削除する（再帰）。 */
    async removeDir(relPath: string): Promise<void> {
        const abs = await this.resolveAbs(relPath);
        if (abs !== null) {
            rmSync(abs, { recursive: true, force: true });
            return;
        }
        const lp = await this.linuxPath(relPath);
        await this.detector.runInDistro(this.distro, `rm -rf ${this.shellQuote(lp)}`);
    }

    /**
     * ディレクトリをベストエフォートで削除する。
     * 使用中（ロック）などで一部が消せなくても、削除できたものは削除し、全削除できたかを返す。
     * 稼働中のツール（例: Serena）がログを掴んでいるケースで「消せた分は消す」を実現する。
     */
    async removeDirBestEffort(relPath: string): Promise<{ removedAll: boolean }> {
        const abs = await this.resolveAbs(relPath);
        if (abs === null) {
            // WSL コマンドモード: rm -rf はロックに比較的寛容。成否は存在確認で判定。
            const lp = await this.linuxPath(relPath);
            await this.detector.runInDistro(this.distro, `rm -rf ${this.shellQuote(lp)} 2>/dev/null || true`);
            const stillExists = await this.exists(relPath);
            return { removedAll: !stillExists };
        }

        // まず通常の一括削除を試す
        try {
            rmSync(abs, { recursive: true, force: true });
            return { removedAll: true };
        } catch {
            // 一部がロックされている → エントリ単位で可能な範囲を削除する
        }
        const removedAll = this.removeEntriesBestEffort(abs);
        return { removedAll };
    }

    /** abs 配下を可能な限り削除し、自身も削除できたかを返す（同期・ベストエフォート）。 */
    private removeEntriesBestEffort(abs: string): boolean {
        let allRemoved = true;
        let entries;
        try {
            entries = readdirSync(abs, { withFileTypes: true });
        } catch {
            return false;
        }
        for (const entry of entries) {
            // native の絶対パスに対する結合のため、プラットフォーム適切な区切りで join する
            // （Windows=\、macOS/Linux=/）。
            const child = join(abs, entry.name);
            try {
                if (entry.isDirectory() && !entry.isSymbolicLink()) {
                    if (!this.removeEntriesBestEffort(child)) {
                        allRemoved = false;
                    }
                } else {
                    rmSync(child, { force: true });
                }
            } catch {
                allRemoved = false;
            }
        }
        if (allRemoved) {
            try {
                rmSync(abs, { recursive: true, force: true });
            } catch {
                allRemoved = false;
            }
        }
        return allRemoved;
    }

    // ---- ヘルパー ----

    private shellQuote(s: string): string {
        // POSIX シェル向けのシングルクォートエスケープ
        return `'${s.replace(/'/g, `'\\''`)}'`;
    }

    private dirnamePosix(p: string): string {
        const idx = p.lastIndexOf('/');
        return idx <= 0 ? '/' : p.slice(0, idx);
    }
}
