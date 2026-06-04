import { CLAUDE_DIR, CLEANUP_CANDIDATES, CLEANUP_PROJECTS_KEY } from '../../shared/constants';
import {
    ClaudeEnvironment,
    CleanupCandidate,
    CleanupChild,
    CleanupEnvReport,
    CleanupSelection,
    OSType,
} from '../../shared/types';
import { ClaudeFs } from './wsl/ClaudeFs';
import { WslDetector } from './wsl/WslDetector';

const VALID_KEYS = new Set(CLEANUP_CANDIDATES.map(c => c.key));

/**
 * Claude Code (CLI) のデータディレクトリ（~/.claude 配下）のクリーンアップを行う。
 * - 対象は履歴／キャッシュ／一時／ログのみ（CLEANUP_CANDIDATES）。
 * - projects はプロジェクト個別 + 全体の両方を削除可能。
 * - projects 以外はディレクトリごと削除（Claude Code が必要時に自動再作成する）。
 * - native とすべての Claude 入り WSL distro を環境として扱う。
 */
export class ClaudeCleanupManager {
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

    private rel(dirKey: string): string {
        return `${CLAUDE_DIR}/${dirKey}`;
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
     * 環境ごとのクリーンアップ候補をスキャンする（各ディレクトリの存在とサイズ）。
     */
    async scan(env: ClaudeEnvironment): Promise<CleanupEnvReport> {
        const fs = this.fsFor(env);
        const label = env.kind === 'wsl' ? (env.distro ?? 'WSL') : this.nativeLabel();
        const candidates: CleanupCandidate[] = [];

        for (const spec of CLEANUP_CANDIDATES) {
            const relPath = this.rel(spec.key);
            const exists = await fs.exists(relPath);
            const size = exists ? await fs.dirSize(relPath) : 0;

            const candidate: CleanupCandidate = {
                key: spec.key,
                exists,
                size,
                defaultChecked: spec.defaultChecked,
                expandable: spec.expandable,
            };

            if (spec.key === CLEANUP_PROJECTS_KEY && exists) {
                const children: CleanupChild[] = [];
                const subdirs = await fs.listDirs(relPath);
                for (const name of subdirs) {
                    const childSize = await fs.dirSize(`${relPath}/${name}`);
                    children.push({ name, size: childSize });
                }
                children.sort((a, b) => b.size - a.size);
                candidate.children = children;
            }

            candidates.push(candidate);
        }

        return { env, label, candidates };
    }

    /**
     * 選択されたディレクトリ/プロジェクトを削除し、再スキャン結果を返す。
     */
    async deleteSelected(env: ClaudeEnvironment, selection: CleanupSelection): Promise<CleanupEnvReport> {
        const fs = this.fsFor(env);
        const errors: string[] = [];

        const deleteWholeProjects = selection.dirs.includes(CLEANUP_PROJECTS_KEY);

        // projects 以外のディレクトリ（および projects 全体指定時）はディレクトリごと削除
        for (const key of selection.dirs) {
            if (!VALID_KEYS.has(key) || this.isUnsafeName(key)) {
                errors.push(key);
                continue;
            }
            try {
                await fs.removeDir(this.rel(key));
            } catch (error) {
                console.error(`Failed to remove dir ${key} (${JSON.stringify(env)}):`, error);
                errors.push(key);
            }
        }

        // projects の個別プロジェクト削除（projects 全体削除が指定されていない場合のみ）
        if (!deleteWholeProjects) {
            const projectsRel = this.rel(CLEANUP_PROJECTS_KEY);
            const existing = new Set(await fs.listDirs(projectsRel));
            for (const name of selection.projectDirs) {
                if (this.isUnsafeName(name) || !existing.has(name)) {
                    errors.push(name);
                    continue;
                }
                try {
                    await fs.removeDir(`${projectsRel}/${name}`);
                } catch (error) {
                    console.error(`Failed to remove project ${name} (${JSON.stringify(env)}):`, error);
                    errors.push(name);
                }
            }
        }

        const report = await this.scan(env);
        if (errors.length > 0) {
            // 部分失敗をハンドラ側で検知できるよう例外を投げる
            const err = new Error(`Failed to delete: ${errors.join(', ')}`);
            (err as Error & { report?: CleanupEnvReport }).report = report;
            throw err;
        }
        return report;
    }

    /** パストラバーサル対策: 区切り文字や .. を含む名前を拒否する。 */
    private isUnsafeName(name: string): boolean {
        return name.includes('/') || name.includes('\\') || name.includes('..') || name.trim().length === 0;
    }
}
