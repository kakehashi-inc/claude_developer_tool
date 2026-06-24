import { app, BrowserWindow, dialog } from 'electron';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, extname, join } from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import {
    CLAUDE_DIR,
    OFFICIAL_SKILLS_REPO_BRANCH,
    OFFICIAL_SKILLS_REPO_DIRNAME,
    OFFICIAL_SKILLS_REPO_SUBDIR,
    OFFICIAL_SKILLS_REPO_URL,
} from '../../shared/constants';
import { AssetEntry, AssetKind, AssetListReport, AssetOpResult, ClaudeEnvironment, OSType } from '../../shared/types';
import { ClaudeFs } from './wsl/ClaudeFs';
import { WslDetector } from './wsl/WslDetector';
import { GitRunner } from './git/GitRunner';
import { parseFrontmatter } from '../utils/frontmatter';
import { recursiveDirStats } from '../utils/fsSize';

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
    private readonly git: GitRunner;

    constructor(detector: WslDetector, git: GitRunner = new GitRunner()) {
        this.detector = detector;
        this.git = git;
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
                // フォルダ単位: 配下ファイルの最終更新日時の最大値。
                mtimeMs: stats.mtimeMs,
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
                // 最終更新日時のみファイル単位で取得する。
                const md = await fs.readText(fileRel);
                const fm = parseFrontmatter(md);
                const stats = await fs.fileStats(fileRel);
                entries.push({
                    name: file.replace(/\.md$/i, ''),
                    relPath,
                    isFile: true,
                    frontmatter: fm?.fields ?? {},
                    frontmatterRaw: fm?.raw ?? null,
                    // ファイル単位: その .md ファイルの最終更新日時。
                    mtimeMs: stats.mtimeMs,
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

        // ZIP に加えて md 単体アップロードを受け付ける。拡張子で取り込み方を分岐する。
        const filters = [
            { name: 'Skill / Archive', extensions: ['zip', 'md'] },
            { name: 'ZIP Archives', extensions: ['zip'] },
            { name: 'Markdown', extensions: ['md'] },
        ];
        const openResult = window
            ? await dialog.showOpenDialog(window, { filters, properties: ['openFile'] })
            : await dialog.showOpenDialog({ filters, properties: ['openFile'] });

        if (openResult.canceled || openResult.filePaths.length === 0) {
            return { ok: false, canceled: true };
        }

        const srcPath = openResult.filePaths[0];
        if (extname(srcPath).toLowerCase() === '.md') {
            return this.inspectMdUpload(fs, parentRel, kind, srcPath);
        }

        let zip: AdmZip;
        try {
            zip = new AdmZip(srcPath);
        } catch (error) {
            console.error(`Failed to read archive ${srcPath}:`, error);
            return { ok: false, message: 'invalid-archive' };
        }

        // 種別整合チェック（エージェント / スキルの誤アップロード防止）。
        const cls = this.classifyZipKind(zip, kind);
        if (cls.verdict === 'block') {
            return { ok: false, message: `kind-block-${cls.reason}` };
        }

        const conflicts = await this.computeConflicts(fs, parentRel, zip, kind);
        const warn = cls.verdict === 'warn' ? { kindCheck: 'warn' as const, kindMessage: cls.reason } : {};
        return { ok: true, uploadKind: 'zip', zipPath: srcPath, conflicts, ...warn };
    }

    /**
     * md 単体アップロードの前検査。取り込み先の名前を算出し、既存との衝突を返す。
     * - skills: ファイル名（大小無視）が SKILL.md なら frontmatter の name を、
     *   それ以外はファイル名（拡張子除去・小文字化）をディレクトリ名にする。
     *   取り込み先は <dir>/SKILL.md（大文字固定）。衝突判定は <dir> の存在。
     * - agents: 元ファイル名そのままで .claude/agents 直下へ配置。衝突判定は同名ファイルの存在。
     */
    private async inspectMdUpload(
        fs: ClaudeFs,
        parentRel: string,
        kind: AssetKind,
        mdPath: string
    ): Promise<AssetOpResult> {
        const target = await this.resolveMdTarget(kind, mdPath);
        if (!target.ok || !target.name) {
            return target;
        }
        const conflictRel = kind === 'skills' ? `${parentRel}/${target.name}` : `${parentRel}/${target.relPath}`;
        const conflicts = (await fs.exists(conflictRel)) ? [target.name] : [];

        // 種別整合チェック（md は誤りでもブロックせず警告のみ）。
        const cls = this.classifyMdKind(mdPath);
        const verdict = kind === 'skills' ? cls.skills : cls.agents;
        const reason = kind === 'skills' ? cls.reasonSkills : 'skillmd-into-agent';
        const warn = verdict === 'warn' ? { kindCheck: 'warn' as const, kindMessage: reason } : {};

        return { ok: true, uploadKind: 'md', srcPath: mdPath, targetName: target.name, conflicts, ...warn };
    }

    /**
     * md ファイルから取り込み先（ディレクトリ名 / 相対パス）を算出する。
     * 失敗時は AssetOpResult のエラーを返す（name 未取得など）。
     */
    private async resolveMdTarget(
        kind: AssetKind,
        mdPath: string
    ): Promise<AssetOpResult & { name?: string; relPath?: string }> {
        const fileName = basename(mdPath);
        if (kind === 'agents') {
            // agents は .md ファイルそのものが 1 エントリ。元ファイル名のまま配置する。
            if (this.isUnsafeName(fileName)) {
                return { ok: false, message: 'invalid-md' };
            }
            return { ok: true, name: fileName, relPath: fileName };
        }
        // skills
        let dirName: string;
        if (fileName.toLowerCase() === 'skill.md') {
            let content: string;
            try {
                content = readFileSync(mdPath, 'utf-8');
            } catch (error) {
                console.error(`Failed to read md ${mdPath}:`, error);
                return { ok: false, message: 'invalid-md' };
            }
            const fm = parseFrontmatter(content);
            const name = fm?.fields?.name?.trim();
            if (!name || this.isUnsafeName(name)) {
                return { ok: false, message: 'md-no-name' };
            }
            dirName = name;
        } else {
            // SKILL.md 以外: ファイル名の拡張子を除き小文字化したものをディレクトリ名にする。
            dirName = basename(fileName, extname(fileName)).toLowerCase();
            if (!dirName || this.isUnsafeName(dirName)) {
                return { ok: false, message: 'invalid-md' };
            }
        }
        return { ok: true, name: dirName, relPath: `${dirName}/SKILL.md` };
    }

    /**
     * md 単体を取り込む。
     * - skills: <dir>/SKILL.md（大文字固定）として配置。overwrite 時は <dir> を削除してから書く。
     * - agents: 元ファイル名のまま .claude/agents 直下へ配置。overwrite 時は既存を削除してから書く。
     */
    async uploadMd(
        env: ClaudeEnvironment,
        kind: AssetKind,
        mdPath: string,
        overwrite: boolean
    ): Promise<AssetOpResult> {
        const fs = this.fsFor(env);
        const parentRel = this.parentRel(kind);
        const parentReal = await fs.resolveRealPath(parentRel);
        if (parentReal === null) {
            return { ok: false, message: 'unavailable' };
        }

        const target = await this.resolveMdTarget(kind, mdPath);
        if (!target.ok || !target.name || !target.relPath) {
            return target;
        }

        let content: string;
        try {
            content = readFileSync(mdPath, 'utf-8');
        } catch (error) {
            console.error(`Failed to read md ${mdPath}:`, error);
            return { ok: false, message: 'invalid-md' };
        }

        try {
            if (kind === 'skills') {
                const dirRel = `${parentRel}/${target.name}`;
                if (overwrite && (await fs.exists(dirRel))) {
                    await fs.removeDir(dirRel);
                }
                await fs.writeText(`${parentRel}/${target.relPath}`, content);
            } else {
                const fileRel = `${parentRel}/${target.relPath}`;
                if (overwrite && (await fs.exists(fileRel))) {
                    await fs.deleteFile(fileRel);
                }
                await fs.writeText(fileRel, content);
            }
            return { ok: true, importedCount: 1 };
        } catch (error) {
            console.error(`Failed to upload md (${JSON.stringify(env)}, ${kind}):`, error);
            return { ok: false, message: 'upload-failed' };
        }
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

    // ============================================================
    // 公式スキルインポート（anthropics/skills）
    // ============================================================

    /** 公式リポジトリの clone 先（app userData 配下の repos）。 */
    private officialReposDir(): string {
        return join(app.getPath('userData'), 'repos');
    }

    /** 公式スキルリポジトリの clone 先ディレクトリ（実 OS パス）。 */
    private officialSkillsRepoDir(): string {
        return join(this.officialReposDir(), OFFICIAL_SKILLS_REPO_DIRNAME);
    }

    /** リポジトリ内のスキル格納ディレクトリ（<repo>/skills）。 */
    private officialSkillsSourceDir(): string {
        return join(this.officialSkillsRepoDir(), OFFICIAL_SKILLS_REPO_SUBDIR);
    }

    /** git がインストールされ利用可能か。公式インポートボタンの活性判定に使う。 */
    async isGitAvailable(): Promise<boolean> {
        return this.git.isAvailable();
    }

    /**
     * 公式スキルリポジトリを clone/更新し、skills/ 配下のスキル一覧を返す。
     * 一覧の各要素は既存スキル一覧（listSkills）と同形の AssetEntry。
     * relPath は repo の skills ディレクトリからの相対（例 'apple-design' / 'docx'）。
     */
    async listOfficialSkills(): Promise<AssetOpResult> {
        if (!(await this.git.isAvailable())) {
            return { ok: false, message: 'git-unavailable' };
        }
        const repoDir = this.officialSkillsRepoDir();
        try {
            await this.git.cloneOrUpdate(OFFICIAL_SKILLS_REPO_URL, repoDir, OFFICIAL_SKILLS_REPO_BRANCH);
        } catch (error) {
            console.error('Failed to clone/update official skills repository:', error);
            return { ok: false, message: 'repo-update-failed' };
        }

        const sourceDir = this.officialSkillsSourceDir();
        if (!existsSync(sourceDir)) {
            return { ok: false, message: 'repo-update-failed' };
        }

        try {
            const entries = this.scanOfficialSkills(sourceDir);
            entries.sort((a, b) => a.name.localeCompare(b.name));
            return { ok: true, entries };
        } catch (error) {
            console.error('Failed to scan official skills:', error);
            return { ok: false, message: 'repo-update-failed' };
        }
    }

    /**
     * sourceDir（repo の skills/）配下から SKILL.md を持つスキルディレクトリを収集する。
     * 公式リポは一部スキルが 1 階層ネスト（例 document-skills/docx）するため、深さ 2 まで探索する。
     * relPath は sourceDir からの相対パス（'/' 区切り）。
     */
    private scanOfficialSkills(sourceDir: string): AssetEntry[] {
        const entries: AssetEntry[] = [];

        const visit = (relDir: string, depth: number): void => {
            const absDir = relDir ? join(sourceDir, relDir) : sourceDir;
            let dirents;
            try {
                dirents = readdirSync(absDir, { withFileTypes: true });
            } catch {
                return;
            }
            const hasSkillMd = dirents.some(d => d.isFile() && d.name.toLowerCase() === 'skill.md');
            if (hasSkillMd && relDir) {
                entries.push(this.buildOfficialEntry(sourceDir, relDir));
                return; // スキルディレクトリ配下はこれ以上潜らない
            }
            if (depth >= 2) {
                return;
            }
            for (const d of dirents) {
                if (!d.isDirectory() || d.isSymbolicLink() || this.isUnsafeName(d.name) || d.name.startsWith('.')) {
                    continue;
                }
                visit(relDir ? `${relDir}/${d.name}` : d.name, depth + 1);
            }
        };

        visit('', 0);
        return entries;
    }

    /** repo の skills/ 配下の相対パス（skillRel）から 1 件分の AssetEntry を構築する。 */
    private buildOfficialEntry(sourceDir: string, skillRel: string): AssetEntry {
        const absDir = join(sourceDir, skillRel);
        // SKILL.md（大小無視）の実ファイル名を解決して frontmatter を読む。
        let mdContent: string | null = null;
        try {
            const mdName = readdirSync(absDir, { withFileTypes: true }).find(
                d => d.isFile() && d.name.toLowerCase() === 'skill.md'
            )?.name;
            if (mdName) {
                mdContent = readFileSync(join(absDir, mdName), 'utf-8');
            }
        } catch {
            mdContent = null;
        }
        const fm = parseFrontmatter(mdContent);
        const stats = recursiveDirStats(absDir);
        // 表示名は frontmatter.name があればそれ、無ければディレクトリ名末尾。
        const dirName = skillRel.split('/').pop() ?? skillRel;
        return {
            name: fm?.fields?.name ?? dirName,
            relPath: skillRel,
            isFile: false,
            fileCount: stats.fileCount,
            frontmatter: fm?.fields ?? {},
            frontmatterRaw: fm?.raw ?? null,
            mtimeMs: stats.mtimeMs,
        };
    }

    /**
     * 選択した公式スキル（relPaths は repo の skills/ からの相対）を対象環境へ取り込む。
     * 取り込み先のディレクトリ名は relPath の末尾セグメント（= スキルディレクトリ名）。
     * 公式スキル同士の置換のため、同名は確認なしで削除→展開する。
     *
     * native / WSL(UNC) 両対応のため、選択スキルを一時 ZIP に固めてから既存の展開ロジックを通す。
     * WSL コマンドモード（UNC 不可）では展開不可（unavailable）。
     */
    async importOfficialSkills(env: ClaudeEnvironment, relPaths: string[]): Promise<AssetOpResult> {
        if (!(await this.git.isAvailable())) {
            return { ok: false, message: 'git-unavailable' };
        }

        const fs = this.fsFor(env);
        const parentRel = this.parentRel('skills');
        const parentReal = await fs.resolveRealPath(parentRel);
        if (parentReal === null) {
            return { ok: false, message: 'unavailable' };
        }

        const sourceDir = this.officialSkillsSourceDir();
        // 取り込み対象: 安全な relPath かつ実在するスキルディレクトリのみ。
        const targets = relPaths
            .filter(p => !this.isUnsafeRelPath(p))
            .map(p => ({ rel: p, abs: join(sourceDir, p), dirName: p.split('/').pop() ?? p }))
            .filter(t => !this.isUnsafeName(t.dirName) && existsSync(t.abs));
        if (targets.length === 0) {
            return { ok: false, message: 'no-selection' };
        }

        // 選択スキルを一時 ZIP に固める（ZIP 内はトップレベル <dirName>/... の構成）。
        const tmpZip = join(tmpdir(), `official-skills-${process.pid}-${targets.length}.zip`);
        try {
            await this.zipDirectories(
                targets.map(t => ({ abs: t.abs, name: t.dirName })),
                tmpZip
            );

            const zip = new AdmZip(tmpZip);
            // 公式同士の置換: 各トップレベルディレクトリを既存があれば削除してから展開する。
            for (const dir of this.zipTopLevelDirsFrom(zip)) {
                if (this.isUnsafeName(dir)) {
                    continue;
                }
                const targetRel = `${parentRel}/${dir}`;
                if (await fs.exists(targetRel)) {
                    await fs.removeDir(targetRel);
                }
            }
            // 親ディレクトリが無ければ作成する。
            await fs.writeText(`${parentRel}/.asset-manager-keep`, '');
            await fs.deleteFile(`${parentRel}/.asset-manager-keep`);

            this.extractZipTo(zip, parentReal);
            return { ok: true, importedCount: targets.length };
        } catch (error) {
            console.error(`Failed to import official skills (${JSON.stringify(env)}):`, error);
            return { ok: false, message: 'official-import-failed' };
        } finally {
            try {
                rmSync(tmpZip, { force: true });
            } catch {
                // 一時ファイルの削除失敗は無視
            }
        }
    }

    /** 複数のディレクトリ（実 OS パス）を ZIP に固める。ZIP 内のトップは指定 name。 */
    private zipDirectories(dirs: { abs: string; name: string }[], destZip: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const output = createWriteStream(destZip);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', () => resolve());
            output.on('error', reject);
            archive.on('error', reject);
            archive.pipe(output);
            for (const d of dirs) {
                archive.directory(d.abs, d.name);
            }
            archive.finalize();
        });
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

    // ============================================================
    // 種別整合チェック（エージェント / スキルの誤アップロード防止）
    // ============================================================

    /**
     * ZIP の構造的な特徴を抽出する。
     * - hasSkillDir:  トップレベルディレクトリ配下に SKILL.md（大小無視）を持つものがある（= スキル構造）。
     * - hasTopLevelMd: トップレベル（ディレクトリ配下でない）に .md ファイルが直置きされている（= エージェント構造）。
     * - hasAnyMd:     どこかに .md ファイルがある。
     */
    private detectZipStructure(zip: AdmZip): {
        hasSkillDir: boolean;
        hasTopLevelMd: boolean;
        hasAnyMd: boolean;
    } {
        let hasSkillDir = false;
        let hasTopLevelMd = false;
        let hasAnyMd = false;
        for (const file of this.zipFileEntries(zip)) {
            const segments = file.split('/').filter(s => s.length > 0);
            if (segments.length === 0) {
                continue;
            }
            const base = segments[segments.length - 1];
            const isMd = base.toLowerCase().endsWith('.md');
            if (isMd) {
                hasAnyMd = true;
            }
            // トップレベル直置きの .md（サブディレクトリに属さない）
            if (isMd && segments.length === 1) {
                hasTopLevelMd = true;
            }
            // <topdir>/SKILL.md（大小無視）。深さは問わずトップレベルディレクトリ直下を見る。
            if (segments.length === 2 && base.toLowerCase() === 'skill.md') {
                hasSkillDir = true;
            }
        }
        return { hasSkillDir, hasTopLevelMd, hasAnyMd };
    }

    /**
     * ZIP の構造と取り込み先の種別（kind）の整合を判定する。
     * 戻り値:
     * - { verdict: 'ok' }          問題なし（無音で取り込み）。
     * - { verdict: 'block', reason } 明白な誤り（取り込み不可）。
     * - { verdict: 'warn', reason }  疑いあり（続行/キャンセルを確認）。
     */
    private classifyZipKind(zip: AdmZip, kind: AssetKind): { verdict: 'ok' | 'block' | 'warn'; reason?: string } {
        const s = this.detectZipStructure(zip);
        if (kind === 'skills') {
            // スキルに必須の SKILL.md ディレクトリが無く、エージェント構造（.md 直置き）→ ブロック
            if (!s.hasSkillDir && s.hasTopLevelMd) {
                return { verdict: 'block', reason: 'agent-into-skill' };
            }
            // SKILL.md ディレクトリがある → 正当なスキル
            if (s.hasSkillDir) {
                return { verdict: 'ok' };
            }
            // ディレクトリ構成だが SKILL.md が無い（他構成）→ 注意
            return { verdict: 'warn', reason: 'skill-no-skillmd' };
        }
        // agents
        // スキルの確定構造（SKILL.md ディレクトリ）→ ブロック
        if (s.hasSkillDir) {
            return { verdict: 'block', reason: 'skill-into-agent' };
        }
        // .md を 1 つも含まない → エージェントとして取り込む意味がない → ブロック
        if (!s.hasAnyMd) {
            return { verdict: 'block', reason: 'no-md' };
        }
        return { verdict: 'ok' };
    }

    /**
     * 単一 md の内容・ファイル名と取り込み先の種別（kind）の整合を判定する。
     * - skills へ: SKILL.md なら OK。frontmatter に tools/model（エージェント特有）があれば warn。
     * - agents へ: ファイル名が SKILL.md（スキル由来の疑い）なら warn。それ以外は OK。
     */
    private classifyMdKind(mdPath: string): { skills: 'ok' | 'warn'; agents: 'ok' | 'warn'; reasonSkills?: string } {
        const fileName = basename(mdPath);
        const isSkillMd = fileName.toLowerCase() === 'skill.md';
        let hasAgentKeys = false;
        try {
            const fm = parseFrontmatter(readFileSync(mdPath, 'utf-8'));
            hasAgentKeys = !!(fm?.fields?.tools !== undefined || fm?.fields?.model !== undefined);
        } catch {
            hasAgentKeys = false;
        }
        // skills 側: SKILL.md は OK。エージェント特有キーがあれば warn。
        const skills: 'ok' | 'warn' = !isSkillMd && hasAgentKeys ? 'warn' : 'ok';
        // agents 側: SKILL.md という名前はスキル由来の疑い → warn。
        const agents: 'ok' | 'warn' = isSkillMd ? 'warn' : 'ok';
        return { skills, agents, reasonSkills: skills === 'warn' ? 'agent-md-into-skill' : undefined };
    }
}
