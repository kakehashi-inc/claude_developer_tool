import { BrowserWindow, dialog } from 'electron';
import { createWriteStream, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { CLAUDE_DIR } from '../../shared/constants';
import { AssetEntry, AssetKind, AssetListReport, AssetOpResult, ClaudeEnvironment, OSType } from '../../shared/types';
import { ClaudeFs } from './wsl/ClaudeFs';
import { WslDetector } from './wsl/WslDetector';
import { parseFrontmatter } from '../utils/frontmatter';

// agents/ サブディレクトリを再帰探索する深さの上限（暴走防止）。
const AGENT_SCAN_MAX_DEPTH = 5;

/**
 * Claude Code (CLI) の ~/.claude/agents・~/.claude/skills を管理する。
 *
 * 一覧の単位は種別で異なる:
 * - skills: skills/ 直下の各サブディレクトリ（frontmatter は <skill>/SKILL.md から読む）。
 * - agents: agents/ 直下の .md ファイル、およびサブディレクトリ配下の .md ファイル（再帰）。
 *           ディレクトリ自体はエージェントではなく、その配下の .md を 1 件ずつ展開する。
 *
 * いずれも先頭の YAML frontmatter（--- で囲まれたヘッダー部）を読み取り、UI で展開・参照できる。
 *
 * DL/UL は ZIP で行う:
 * - 選択した各エントリ（skills=ディレクトリ / agents=.md ファイル）を 1 つの ZIP にまとめる。
 * - アップロードは ZIP を対象フォルダへ解凍・展開する（同名は確認後に丸ごと置換）。
 *
 * ZIP 圧縮・解凍は実 OS パス（native 絶対パス / WSL UNC パス）に対する通常の fs で行う。
 * WSL でコマンドモードへフォールバックする（UNC 到達不可）環境では操作不可（available:false）。
 */
export class AssetManager {
    private readonly detector: WslDetector;

    constructor(detector: WslDetector) {
        this.detector = detector;
    }

    private nativeLabel(): string {
        const platform = process.platform as OSType;
        if (platform === 'win32') return 'Windows';
        if (platform === 'darwin') return 'macOS';
        return 'Linux';
    }

    private fsFor(env: ClaudeEnvironment): ClaudeFs {
        return new ClaudeFs(env, this.detector);
    }

    /** agents/ skills/ の HOME 相対パス（'.claude/agents' など）。 */
    private parentRel(kind: AssetKind): string {
        return `${CLAUDE_DIR}/${kind}`;
    }

    /** パストラバーサル対策: 区切り文字や .. を含む名前を拒否する。 */
    private isUnsafeName(name: string): boolean {
        return name.includes('/') || name.includes('\\') || name.includes('..') || name.trim().length === 0;
    }

    /** 相対パス（区切りは '/'）が安全か。各セグメントを isUnsafeName で検証する。 */
    private isUnsafeRelPath(relPath: string): boolean {
        const normalized = relPath.replace(/\\/g, '/');
        if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
            return true;
        }
        const segments = normalized.split('/').filter(s => s.length > 0);
        if (segments.length === 0) {
            return true;
        }
        return segments.some(s => this.isUnsafeName(s));
    }

    /** 管理対象の環境一覧（native + Claude 入り WSL distro）。 */
    async getEnvironments(): Promise<{ env: ClaudeEnvironment; label: string }[]> {
        const result: { env: ClaudeEnvironment; label: string }[] = [];
        result.push({ env: { kind: 'native' }, label: this.nativeLabel() });
        const distros = await this.detector.getClaudeDistros();
        for (const d of distros) {
            result.push({ env: { kind: 'wsl', distro: d.distro }, label: d.distro });
        }
        return result;
    }

    /**
     * 指定環境・種別の一覧を返す。
     * 実 OS パスに到達できない（UNC 不可）場合は available:false で空一覧。
     */
    async list(env: ClaudeEnvironment, kind: AssetKind): Promise<AssetListReport> {
        const label = env.kind === 'wsl' ? (env.distro ?? '') : this.nativeLabel();
        const fs = this.fsFor(env);
        const parentRel = this.parentRel(kind);

        const real = await fs.resolveRealPath(parentRel);
        if (real === null) {
            // WSL コマンドモード（UNC 不可）: ZIP 操作不可
            return { env, label, kind, available: false, entries: [] };
        }

        const entries = kind === 'skills' ? await this.listSkills(fs, parentRel) : await this.listAgents(fs, parentRel);
        entries.sort((a, b) => a.name.localeCompare(b.name));
        return { env, label, kind, available: true, entries };
    }

    /** skills/: 直下サブディレクトリを 1 件とし、<skill>/SKILL.md の frontmatter を読む。 */
    private async listSkills(fs: ClaudeFs, parentRel: string): Promise<AssetEntry[]> {
        const entries: AssetEntry[] = [];
        const dirs = await fs.listDirs(parentRel);
        for (const name of dirs) {
            if (this.isUnsafeName(name)) {
                continue;
            }
            const dirRel = `${parentRel}/${name}`;
            // skills はファイル数のみ表示する（サイズは取得・保持しない）。
            const stats = await fs.dirStats(dirRel);
            const md = await fs.readText(`${dirRel}/SKILL.md`);
            const fm = parseFrontmatter(md);
            entries.push({
                name,
                relPath: name,
                isFile: false,
                fileCount: stats.fileCount,
                frontmatter: fm?.fields ?? {},
                frontmatterRaw: fm?.raw ?? null,
            });
        }
        return entries;
    }

    /**
     * agents/: 直下の .md ファイル、およびサブディレクトリ配下の .md ファイル（再帰）を 1 件ずつ展開。
     * ディレクトリ自体は対象にせず、その配下の .md を対象とする。
     */
    private async listAgents(fs: ClaudeFs, parentRel: string): Promise<AssetEntry[]> {
        const entries: AssetEntry[] = [];

        const walk = async (relDir: string, depth: number): Promise<void> => {
            // 直下の .md ファイル
            const files = await fs.listFiles(relDir);
            for (const file of files) {
                if (!file.toLowerCase().endsWith('.md') || this.isUnsafeName(file)) {
                    continue;
                }
                const fileRel = `${relDir}/${file}`;
                const relPath = fileRel.slice(parentRel.length + 1); // 親からの相対
                // agents は 1 ファイル固定でサイズ・ファイル数を表示しないため取得しない。
                const md = await fs.readText(fileRel);
                const fm = parseFrontmatter(md);
                entries.push({
                    name: file.replace(/\.md$/i, ''),
                    relPath,
                    isFile: true,
                    frontmatter: fm?.fields ?? {},
                    frontmatterRaw: fm?.raw ?? null,
                });
            }
            // サブディレクトリを再帰
            if (depth < AGENT_SCAN_MAX_DEPTH) {
                const subdirs = await fs.listDirs(relDir);
                for (const sub of subdirs) {
                    if (this.isUnsafeName(sub)) {
                        continue;
                    }
                    await walk(`${relDir}/${sub}`, depth + 1);
                }
            }
        };

        await walk(parentRel, 0);
        return entries;
    }

    /**
     * 選択したエントリ（relPaths）を 1 つの ZIP にまとめて保存する。
     * 複数選択でも 1 ファイルにまとめる。保存先はダイアログで指定。
     * relPaths は list() が返した AssetEntry.relPath（skills=ディレクトリ名 / agents=.md の相対パス）。
     */
    async download(
        env: ClaudeEnvironment,
        kind: AssetKind,
        relPaths: string[],
        window: BrowserWindow | null
    ): Promise<AssetOpResult> {
        const fs = this.fsFor(env);
        const parentRel = this.parentRel(kind);
        const parentReal = await fs.resolveRealPath(parentRel);
        if (parentReal === null) {
            return { ok: false, message: 'unavailable' };
        }

        const safe = relPaths.filter(p => !this.isUnsafeRelPath(p));
        if (safe.length === 0) {
            return { ok: false, message: 'no-selection' };
        }

        const distroSuffix = env.kind === 'wsl' && env.distro ? `-${env.distro}` : '';
        const defaultName = `${kind}${distroSuffix}.zip`;

        const saveResult = window
            ? await dialog.showSaveDialog(window, {
                  defaultPath: defaultName,
                  filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
              })
            : await dialog.showSaveDialog({
                  defaultPath: defaultName,
                  filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
              });

        if (saveResult.canceled || !saveResult.filePath) {
            return { ok: false, canceled: true };
        }

        try {
            await this.zipEntries(parentReal, safe, kind, saveResult.filePath);
            return { ok: true };
        } catch (error) {
            console.error(`Failed to create archive (${JSON.stringify(env)}, ${kind}):`, error);
            return { ok: false, message: 'download-failed' };
        }
    }

    /**
     * 選択エントリを ZIP に追加する。
     * - skills（ディレクトリ）: <name>/ としてディレクトリごと追加。
     * - agents（.md ファイル）: 親からの相対パスを保持して追加（サブディレクトリ構造を維持）。
     */
    private zipEntries(parentReal: string, relPaths: string[], kind: AssetKind, destZip: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const output = createWriteStream(destZip);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', () => resolve());
            output.on('error', reject);
            archive.on('error', reject);
            archive.pipe(output);
            for (const rel of relPaths) {
                // ZIP 内のパスは agents ディレクトリからの相対パスを '/' 区切りで維持する。
                const zipPath = rel.replace(/\\/g, '/');
                const sourceAbs = join(parentReal, rel);
                if (kind === 'skills') {
                    archive.directory(sourceAbs, zipPath);
                } else {
                    archive.file(sourceAbs, { name: zipPath });
                }
            }
            archive.finalize();
        });
    }

    /**
     * アップロード前検査: ZIP を選択させ、トップレベルディレクトリ名と既存の衝突を返す。
     * 実際の展開は upload() で行う（renderer が衝突確認後に呼ぶ）。
     * 衝突判定:
     * - skills: ZIP のトップレベルディレクトリ名 vs 既存サブディレクトリ。
     * - agents: ZIP の各エントリの相対パス vs 既存ファイル（同一パスのファイルがあれば衝突）。
     */
    async inspectUpload(env: ClaudeEnvironment, kind: AssetKind, window: BrowserWindow | null): Promise<AssetOpResult> {
        const fs = this.fsFor(env);
        const parentRel = this.parentRel(kind);
        const parentReal = await fs.resolveRealPath(parentRel);
        if (parentReal === null) {
            return { ok: false, message: 'unavailable' };
        }

        const openResult = window
            ? await dialog.showOpenDialog(window, {
                  filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
                  properties: ['openFile'],
              })
            : await dialog.showOpenDialog({
                  filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
                  properties: ['openFile'],
              });

        if (openResult.canceled || openResult.filePaths.length === 0) {
            return { ok: false, canceled: true };
        }

        const zipPath = openResult.filePaths[0];
        let zip: AdmZip;
        try {
            zip = new AdmZip(zipPath);
        } catch (error) {
            console.error(`Failed to read archive ${zipPath}:`, error);
            return { ok: false, message: 'invalid-archive' };
        }

        const conflicts = await this.computeConflicts(fs, parentRel, zip, kind);
        return { ok: true, zipPath, conflicts };
    }

    /**
     * ZIP を対象フォルダへ展開する。
     * overwrite=true の場合、衝突する対象（skills=ディレクトリ / agents=ファイル）を削除してから展開する。
     */
    async upload(env: ClaudeEnvironment, kind: AssetKind, zipPath: string, overwrite: boolean): Promise<AssetOpResult> {
        const fs = this.fsFor(env);
        const parentRel = this.parentRel(kind);
        const parentReal = await fs.resolveRealPath(parentRel);
        if (parentReal === null) {
            return { ok: false, message: 'unavailable' };
        }

        let zip: AdmZip;
        try {
            zip = new AdmZip(zipPath);
        } catch (error) {
            console.error(`Failed to read archive ${zipPath}:`, error);
            return { ok: false, message: 'invalid-archive' };
        }

        const allEntries = zip.getEntries();
        if (allEntries.length === 0) {
            return { ok: false, message: 'empty-archive' };
        }

        // パストラバーサル対策: 不正なエントリ名を含む ZIP は拒否する。
        for (const entry of allEntries) {
            const name = entry.entryName.replace(/\\/g, '/');
            if (name.includes('..') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) {
                console.error(`Rejected archive with unsafe entry: ${entry.entryName}`);
                return { ok: false, message: 'invalid-archive' };
            }
        }

        try {
            // 親ディレクトリが無ければ作成する（agents/ skills/ が未作成のケース）。
            await fs.writeText(`${parentRel}/.asset-manager-keep`, '');
            await fs.deleteFile(`${parentRel}/.asset-manager-keep`);

            if (overwrite) {
                if (kind === 'skills') {
                    // skills: ZIP に含まれる各トップレベルディレクトリを、既存があれば「ディレクトリごと削除」
                    // してから展開する。これにより対象スキルは古いファイルが残らないクリーンな置換になる
                    // （extractAllTo はファイル単位の上書きのため、削除前提のディレクトリ置換にはならない）。
                    for (const dir of this.zipTopLevelDirsFrom(zip)) {
                        if (this.isUnsafeName(dir)) {
                            continue;
                        }
                        const target = `${parentRel}/${dir}`;
                        if (await fs.exists(target)) {
                            await fs.removeDir(target);
                        }
                    }
                } else {
                    // agents: ファイル単位の上書き。同一相対パスの既存ファイルを削除してから展開する。
                    for (const file of this.zipFileEntries(zip)) {
                        if (this.isUnsafeRelPath(file)) {
                            continue;
                        }
                        if (await fs.exists(`${parentRel}/${file}`)) {
                            await fs.deleteFile(`${parentRel}/${file}`);
                        }
                    }
                }
            }

            this.extractZipTo(zip, parentReal);
            const importedCount =
                kind === 'skills' ? this.zipTopLevelDirsFrom(zip).length : this.zipFileEntries(zip).length;
            return { ok: true, importedCount };
        } catch (error) {
            console.error(`Failed to extract archive (${JSON.stringify(env)}, ${kind}):`, error);
            return { ok: false, message: 'upload-failed' };
        }
    }

    /**
     * 選択したエントリ（relPaths）を削除する。
     * - skills: ディレクトリごと削除（ベストエフォート。使用中で消せない分は skipped に報告）。
     * - agents: .md ファイルを削除。
     * 例外は投げず、削除できた件数（deletedCount）と消せなかった対象（skipped）を返す。
     */
    async deleteSelected(env: ClaudeEnvironment, kind: AssetKind, relPaths: string[]): Promise<AssetOpResult> {
        const fs = this.fsFor(env);
        const parentRel = this.parentRel(kind);
        const parentReal = await fs.resolveRealPath(parentRel);
        if (parentReal === null) {
            return { ok: false, message: 'unavailable' };
        }

        const safe = relPaths.filter(p => !this.isUnsafeRelPath(p));
        if (safe.length === 0) {
            return { ok: false, message: 'no-selection' };
        }

        const skipped: string[] = [];
        let deletedCount = 0;
        for (const rel of safe) {
            const target = `${parentRel}/${rel}`;
            try {
                if (kind === 'skills') {
                    const { removedAll } = await fs.removeDirBestEffort(target);
                    if (removedAll) {
                        deletedCount++;
                    } else {
                        skipped.push(rel);
                    }
                } else {
                    await fs.deleteFile(target);
                    deletedCount++;
                }
            } catch (error) {
                console.error(`Failed to delete ${rel} (${JSON.stringify(env)}, ${kind}):`, error);
                skipped.push(rel);
            }
        }

        return { ok: skipped.length === 0, deletedCount, skipped: skipped.length > 0 ? skipped : undefined };
    }

    /**
     * ZIP を destDir 配下へ展開する（adm-zip の extractAllTo は使わない）。
     * adm-zip の extractAllTo は展開後に各ファイルへ chmodSync を呼ぶが、WSL の UNC パス
     * （\\wsl.localhost\...）では chmod が ENOENT で失敗する。chmod を行わない writeFileSync で
     * 自前展開することで native / WSL(UNC) の両方で確実に動作させる。
     * destDir は実 OS パス（native 絶対パス / WSL UNC パス）。
     */
    private extractZipTo(zip: AdmZip, destDir: string): void {
        for (const entry of zip.getEntries()) {
            const rel = entry.entryName.replace(/\\/g, '/');
            // join はプラットフォーム区切りに正規化する（Windows=\ なので UNC パスにも正しく連結される）。
            const outPath = join(destDir, rel);
            if (entry.isDirectory) {
                mkdirSync(outPath, { recursive: true });
                continue;
            }
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, entry.getData());
        }
    }

    /** ZIP と既存内容から衝突一覧を計算する（表示用）。 */
    private async computeConflicts(fs: ClaudeFs, parentRel: string, zip: AdmZip, kind: AssetKind): Promise<string[]> {
        if (kind === 'skills') {
            const existing = new Set(await fs.listDirs(parentRel));
            return this.zipTopLevelDirsFrom(zip).filter(d => existing.has(d));
        }
        const conflicts: string[] = [];
        for (const file of this.zipFileEntries(zip)) {
            if (this.isUnsafeRelPath(file)) {
                continue;
            }
            if (await fs.exists(`${parentRel}/${file}`)) {
                conflicts.push(file);
            }
        }
        return conflicts;
    }

    /** AdmZip インスタンスからトップレベルディレクトリ名一覧を抽出する（skills 用）。 */
    private zipTopLevelDirsFrom(zip: AdmZip): string[] {
        const dirs = new Set<string>();
        for (const entry of zip.getEntries()) {
            const name = entry.entryName.replace(/\\/g, '/');
            const top = name.split('/')[0];
            if (top && top.length > 0) {
                dirs.add(top);
            }
        }
        return Array.from(dirs);
    }

    /** AdmZip インスタンスからファイルエントリの相対パス一覧を抽出する（agents 用）。 */
    private zipFileEntries(zip: AdmZip): string[] {
        const files: string[] = [];
        for (const entry of zip.getEntries()) {
            if (entry.isDirectory) {
                continue;
            }
            files.push(entry.entryName.replace(/\\/g, '/'));
        }
        return files;
    }
}
