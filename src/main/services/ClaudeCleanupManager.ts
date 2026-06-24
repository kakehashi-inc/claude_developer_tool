import { CLAUDE_DIR, CLEANUP_CANDIDATES, OTHER_CLEANUP_ITEMS } from '../../shared/constants';
import {
    ClaudeEnvironment,
    CleanupCandidate,
    CleanupChild,
    CleanupEnvReport,
    CleanupSelection,
    OSType,
    OtherCleanupItemStatus,
    OtherCleanupReport,
    OtherCleanupSelection,
} from '../../shared/types';
import { ClaudeFs } from './wsl/ClaudeFs';
import { WslDetector } from './wsl/WslDetector';
import { clearYamlList, countYamlListEntries, needsYamlListNormalize } from '../utils/yamlPreserve';

const VALID_KEYS = new Set(CLEANUP_CANDIDATES.map(c => c.key));
const OTHER_VALID_KEYS = new Set(OTHER_CLEANUP_ITEMS.map(i => i.key));

/**
 * Claude Code (CLI) のデータディレクトリ（~/.claude 配下）のクリーンアップを行う。
 * - 対象は履歴／キャッシュ／一時／ログのみ（CLEANUP_CANDIDATES）。
 * - expandable 候補（projects=サブディレクトリ単位 / plans=ファイル単位）は個別 + 全体の両方を削除可能。
 * - それ以外はディレクトリごと削除（Claude Code が必要時に自動再作成する）。
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
     * 環境ごとのクリーンアップ候補をスキャンする（各ディレクトリの存在・サイズ・ファイル数）。
     */
    async scan(env: ClaudeEnvironment): Promise<CleanupEnvReport> {
        const fs = this.fsFor(env);
        const label = env.kind === 'wsl' ? (env.distro ?? 'WSL') : this.nativeLabel();
        const candidates: CleanupCandidate[] = [];

        for (const spec of CLEANUP_CANDIDATES) {
            const relPath = this.rel(spec.path ?? spec.key);
            const exists = await fs.exists(relPath);
            const stats = exists
                ? spec.kind === 'file'
                    ? await fs.fileStats(relPath)
                    : await fs.dirStats(relPath)
                : { size: 0, fileCount: 0, mtimeMs: 0 };

            const candidate: CleanupCandidate = {
                key: spec.key,
                exists,
                size: stats.size,
                fileCount: stats.fileCount,
                defaultChecked: spec.defaultChecked,
                expandable: spec.expandable,
                childKind: spec.childKind,
            };

            // expandable 候補は子要素（projects=サブディレクトリ / plans=ファイル）を個別選択できるよう展開する。
            if (spec.expandable && spec.childKind && exists) {
                const children: CleanupChild[] = [];
                if (spec.childKind === 'dir') {
                    const subdirs = await fs.listDirs(relPath);
                    for (const name of subdirs) {
                        const childStats = await fs.dirStats(`${relPath}/${name}`);
                        children.push({ name, size: childStats.size, fileCount: childStats.fileCount });
                    }
                } else {
                    const files = await fs.listFiles(relPath);
                    for (const name of files) {
                        const childStats = await fs.fileStats(`${relPath}/${name}`);
                        children.push({ name, size: childStats.size, fileCount: childStats.fileCount });
                    }
                }
                children.sort((a, b) => b.size - a.size);
                candidate.children = children;
            }

            candidates.push(candidate);
        }

        return { env, label, candidates };
    }

    /**
     * 選択されたディレクトリ／子要素（projects のサブディレクトリ、plans のファイル）を削除し、
     * 再スキャン結果を返す。
     */
    async deleteSelected(env: ClaudeEnvironment, selection: CleanupSelection): Promise<CleanupEnvReport> {
        const fs = this.fsFor(env);
        // 使用中（ロック）などで完全に削除できなかった対象。例外は投げずにここへ集約して報告する。
        const skipped: string[] = [];

        // dirs に含まれる候補はディレクトリごと削除（expandable 候補を全体指定した場合も含む）。
        // 稼働中の Claude Code がファイルを掴んでいてもベストエフォートで消せる分を消し、
        // ロック残存はスキップとして報告する（例外は投げない）。不正キーは無視。
        for (const key of selection.dirs) {
            if (!VALID_KEYS.has(key) || this.isUnsafeName(key)) {
                continue;
            }
            const spec = CLEANUP_CANDIDATES.find(c => c.key === key);
            const relPath = this.rel(spec?.path ?? key);
            try {
                if (spec?.kind === 'file') {
                    // 単一ファイル候補（history.jsonl 等）はベストエフォート削除。残ればスキップ報告。
                    await fs.deleteFile(relPath);
                    if (await fs.exists(relPath)) {
                        skipped.push(key);
                    }
                } else {
                    const { removedAll } = await fs.removeDirBestEffort(relPath);
                    if (!removedAll) {
                        skipped.push(key);
                    }
                }
            } catch (error) {
                console.error(`Failed to remove ${key} (${JSON.stringify(env)}):`, error);
                skipped.push(key);
            }
        }

        // expandable 候補（projects=サブディレクトリ / plans=ファイル）の個別削除。
        // 当該候補が dirs に含まれている（＝全体削除指定）場合はスキップする。
        const childSelections = selection.childSelections ?? {};
        for (const spec of CLEANUP_CANDIDATES) {
            if (!spec.expandable || !spec.childKind) {
                continue;
            }
            if (selection.dirs.includes(spec.key)) {
                continue;
            }
            const names = childSelections[spec.key];
            if (!names || names.length === 0) {
                continue;
            }
            const baseRel = this.rel(spec.key);
            const existing = new Set(spec.childKind === 'file' ? await fs.listFiles(baseRel) : await fs.listDirs(baseRel));
            for (const name of names) {
                if (this.isUnsafeName(name) || !existing.has(name)) {
                    continue;
                }
                const childRel = `${baseRel}/${name}`;
                try {
                    if (spec.childKind === 'file') {
                        // ファイル単位（plans）はベストエフォート削除。ロック等で残った場合はスキップ報告。
                        await fs.deleteFile(childRel);
                        if (await fs.exists(childRel)) {
                            skipped.push(name);
                        }
                    } else {
                        const { removedAll } = await fs.removeDirBestEffort(childRel);
                        if (!removedAll) {
                            skipped.push(name);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to remove child ${spec.key}/${name} (${JSON.stringify(env)}):`, error);
                    skipped.push(name);
                }
            }
        }

        const report = await this.scan(env);
        if (skipped.length > 0) {
            report.skipped = skipped;
        }
        return report;
    }

    /** パストラバーサル対策: 区切り文字や .. を含む名前を拒否する。 */
    private isUnsafeName(name: string): boolean {
        return name.includes('/') || name.includes('\\') || name.includes('..') || name.trim().length === 0;
    }

    // ===== 「その他のツール」クリーンアップ（Serena など、~/.claude 配下ではないもの）=====

    /**
     * 「その他」クリーンアップの対象環境一覧。
     * native ＋（WSL で ~/.serena を持つ distro）。~/.serena 検出は ~/.claude と独立。
     */
    async getOtherEnvironments(): Promise<{ env: ClaudeEnvironment; label: string }[]> {
        const result: { env: ClaudeEnvironment; label: string }[] = [];
        result.push({ env: { kind: 'native' }, label: this.nativeLabel() });
        const distros = await this.detector.getSerenaDistros();
        for (const distro of distros) {
            result.push({ env: { kind: 'wsl', distro }, label: distro });
        }
        return result;
    }

    /**
     * 環境ごとの「その他」クリーンアップ項目をスキャンする。
     * 各項目の requiresPath が存在する場合のみ available として返す（存在しなければ非表示）。
     */
    async scanOther(env: ClaudeEnvironment): Promise<OtherCleanupReport> {
        const fs = this.fsFor(env);
        const label = env.kind === 'wsl' ? (env.distro ?? 'WSL') : this.nativeLabel();
        const items: OtherCleanupItemStatus[] = [];

        for (const item of OTHER_CLEANUP_ITEMS) {
            const available = await fs.exists(item.requiresPath);
            if (!available) {
                continue;
            }

            if (item.action === 'dir-delete') {
                const stats = await fs.dirStats(item.targetPath);
                // クリーンアップ対象が無い（ファイル 0 件）項目は表示しない
                if (stats.fileCount === 0) {
                    continue;
                }
                items.push({
                    key: item.key,
                    available: true,
                    metricKind: 'size',
                    metricValue: stats.size,
                    fileCount: stats.fileCount,
                });
            } else if (item.action === 'yaml-list-clear' && item.yamlKey) {
                const text = await fs.readText(item.targetPath);
                const count = text ? countYamlListEntries(text, item.yamlKey) : 0;
                // 登録 0 件でも、`key:`（値なし）のまま未正規化なら `key: []` 化のため表示する。
                const needsNormalize = text ? needsYamlListNormalize(text, item.yamlKey) : false;
                if (count === 0 && !needsNormalize) {
                    continue;
                }
                items.push({
                    key: item.key,
                    available: true,
                    metricKind: 'count',
                    metricValue: count,
                });
            }
        }

        return { env, label, items };
    }

    /**
     * 選択された「その他」項目を実行し、再スキャン結果を返す。
     * - dir-delete: 対象ディレクトリを丸ごと削除。
     * - yaml-list-clear: YAML の対象キー直下リストのみをクリア（書式・コメントは保持）。
     * registry がホワイトリストのためパストラバーサルは不可能。
     */
    async deleteOther(env: ClaudeEnvironment, selection: OtherCleanupSelection): Promise<OtherCleanupReport> {
        const fs = this.fsFor(env);
        // 使用中（ロック）などで完全に処理できなかった項目。例外は投げずにここへ集約して報告する。
        const skipped: string[] = [];

        for (const key of selection) {
            if (!OTHER_VALID_KEYS.has(key)) {
                continue;
            }
            const item = OTHER_CLEANUP_ITEMS.find(i => i.key === key);
            if (!item) {
                continue;
            }
            try {
                if (item.action === 'dir-delete') {
                    // 稼働中ツール（例: Serena）がファイルを掴んでいても、消せる分は消すベストエフォート削除。
                    // ロックで一部が残った場合はスキップとして報告する（例外は投げない）。
                    const { removedAll } = await fs.removeDirBestEffort(item.targetPath);
                    if (!removedAll) {
                        skipped.push(key);
                    }
                } else if (item.action === 'yaml-list-clear' && item.yamlKey) {
                    const text = await fs.readText(item.targetPath);
                    if (text === null) {
                        skipped.push(key);
                        continue;
                    }
                    const next = clearYamlList(text, item.yamlKey);
                    if (next !== text) {
                        await fs.writeText(item.targetPath, next);
                    }
                }
            } catch (error) {
                console.error(`Failed to run other-cleanup ${key} (${JSON.stringify(env)}):`, error);
                skipped.push(key);
            }
        }

        const report = await this.scanOther(env);
        if (skipped.length > 0) {
            report.skipped = skipped;
        }
        return report;
    }
}
