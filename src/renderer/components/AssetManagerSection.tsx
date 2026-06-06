import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Paper,
    Tabs,
    Tab,
    Button,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Typography,
    Tooltip,
    CircularProgress,
} from '@mui/material';
import {
    Download as DownloadIcon,
    Upload as UploadIcon,
    DeleteOutlined as DeleteIcon,
    CloudDownloadOutlined as CloudDownloadIcon,
} from '@mui/icons-material';
import type { AssetEntry, AssetKind, AssetListReport, ClaudeEnvironment } from '../../shared/types';
import { AssetEntriesTable, computeFitWidth, type FmColumn } from './AssetEntriesTable';

interface Props {
    env: ClaudeEnvironment;
    onNotify: (message: string, severity: 'success' | 'error' | 'warning') => void;
}

const FRONTMATTER_COLUMNS: Record<AssetKind, FmColumn[]> = {
    agents: [
        { key: 'name', fit: true, maxWidthPct: 0.3 },
        { key: 'tools', width: 200 },
        { key: 'model', width: 90 },
        { key: 'description', flex: true },
    ],
    skills: [
        { key: 'name', fit: true, maxWidthPct: 0.3 },
        { key: 'description', flex: true },
    ],
};

// 公式スキルダイアログの一覧は skills 列構成（name + description）を使う。
const OFFICIAL_COLUMNS: FmColumn[] = FRONTMATTER_COLUMNS.skills;

/**
 * 1 環境分の Agent・Skill 管理セクション。
 * 「エージェント」「スキル」をタブで分離し、各タブで一覧 / ダウンロード / アップロードを行う。
 * スキルタブでは公式スキル（anthropics/skills）の取り込みも行える（git が必要）。
 * 各エントリの frontmatter（ヘッダー部）を固定列で展開表示し、「参照」で生のヘッダー部全体を見られる。
 */
export const AssetManagerSection: React.FC<Props> = ({ env, onNotify }) => {
    const { t } = useTranslation();
    const [kind, setKind] = useState<AssetKind>('agents');
    const [reports, setReports] = useState<Record<AssetKind, AssetListReport | null>>({
        agents: null,
        skills: null,
    });
    const [loading, setLoading] = useState(true);
    const [checked, setChecked] = useState<Record<AssetKind, Set<string>>>({
        agents: new Set(),
        skills: new Set(),
    });
    const [busy, setBusy] = useState(false);
    // 上書き確認: zip / md 共通。uploadKind で確定 IPC を呼び分ける。
    const [confirm, setConfirm] = useState<{
        srcPath: string;
        conflicts: string[];
        uploadKind: 'zip' | 'md';
    } | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [viewEntry, setViewEntry] = useState<AssetEntry | null>(null);
    // name 列の最大幅をウィンドウ幅の割合で算出するため、ウィンドウ幅を監視する。
    const [windowWidth, setWindowWidth] = useState<number>(() => window.innerWidth);

    // 公式スキルインポート関連。
    const [gitAvailable, setGitAvailable] = useState(false);
    const [officialOpen, setOfficialOpen] = useState(false);
    const [officialEntries, setOfficialEntries] = useState<AssetEntry[]>([]);
    const [officialChecked, setOfficialChecked] = useState<Set<string>>(new Set());
    const [officialLoading, setOfficialLoading] = useState(false);

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const load = async () => {
        try {
            const [agents, skills] = await Promise.all([
                window.api.assetManager.list(env, 'agents').catch(() => null),
                window.api.assetManager.list(env, 'skills').catch(() => null),
            ]);
            setReports({ agents, skills });
            setChecked({ agents: new Set(), skills: new Set() });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // git の利用可否を判定（公式スキルインポートボタンの活性に使う）。
        window.api.assetManager
            .isGitAvailable()
            .then(setGitAvailable)
            .catch(() => setGitAvailable(false));
        // env は安定参照（親で固定）。マウント時に一度ロードする。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const report = reports[kind];
    const checkedKeys = checked[kind];
    const entries = useMemo(() => report?.entries ?? [], [report]);
    const columns = FRONTMATTER_COLUMNS[kind];
    // name（fit 列）の幅を実データから見積もる（内容に合わせて伸縮・最大幅はウィンドウ幅の割合でクランプ）。
    const fitWidth = useMemo(() => {
        const fitCol = columns.find(c => c.fit);
        if (!fitCol) {
            return 0;
        }
        const maxWidthPx = Math.round(windowWidth * (fitCol.maxWidthPct ?? 0.25));
        return computeFitWidth(entries, maxWidthPx);
    }, [columns, entries, windowWidth]);
    // 公式ダイアログ用の fit 幅（skills 列構成）。
    const officialFitWidth = useMemo(() => {
        const fitCol = OFFICIAL_COLUMNS.find(c => c.fit);
        if (!fitCol) {
            return 0;
        }
        const maxWidthPx = Math.round(windowWidth * (fitCol.maxWidthPct ?? 0.25));
        return computeFitWidth(officialEntries, maxWidthPx);
    }, [officialEntries, windowWidth]);
    // ファイル数列は skills のみ表示（agents は 1 ファイル固定なので不要）。
    const showFileCount = kind === 'skills';
    const someChecked = entries.some(e => checkedKeys.has(e.relPath));

    const setKindChecked = (next: Set<string>) => {
        setChecked(prev => ({ ...prev, [kind]: next }));
    };

    const toggle = (relPath: string) => {
        const next = new Set(checkedKeys);
        if (next.has(relPath)) {
            next.delete(relPath);
        } else {
            next.add(relPath);
        }
        setKindChecked(next);
    };

    const allChecked = entries.length > 0 && entries.every(e => checkedKeys.has(e.relPath));
    const toggleAll = () => {
        if (allChecked) {
            setKindChecked(new Set());
        } else {
            setKindChecked(new Set(entries.map(e => e.relPath)));
        }
    };

    const handleDownload = async () => {
        const relPaths = entries.filter(e => checkedKeys.has(e.relPath)).map(e => e.relPath);
        if (relPaths.length === 0) {
            return;
        }
        setBusy(true);
        try {
            const result = await window.api.assetManager.download(env, kind, relPaths);
            if (result.canceled) {
                return;
            }
            if (result.ok) {
                onNotify(t('assetManager.downloadSuccess'), 'success');
            } else {
                onNotify(t('assetManager.downloadError'), 'error');
            }
        } catch {
            onNotify(t('assetManager.downloadError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleUploadClick = async () => {
        setBusy(true);
        try {
            const result = await window.api.assetManager.inspectUpload(env, kind);
            if (result.canceled) {
                return;
            }
            // md の name 未取得などの検査エラーは個別メッセージを優先する。
            if (!result.ok) {
                onNotify(
                    t(result.message === 'md-no-name' ? 'assetManager.mdNoName' : 'assetManager.uploadError'),
                    'error'
                );
                return;
            }
            const uploadKind = result.uploadKind ?? 'zip';
            const srcPath = uploadKind === 'md' ? result.srcPath : result.zipPath;
            if (!srcPath) {
                onNotify(t('assetManager.uploadError'), 'error');
                return;
            }
            const conflicts = result.conflicts ?? [];
            if (conflicts.length > 0) {
                // 同名衝突あり → 確認ダイアログ
                setConfirm({ srcPath, conflicts, uploadKind });
                return;
            }
            await runUpload(srcPath, uploadKind, false);
        } catch {
            onNotify(t('assetManager.uploadError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const runUpload = async (srcPath: string, uploadKind: 'zip' | 'md', overwrite: boolean) => {
        const result =
            uploadKind === 'md'
                ? await window.api.assetManager.uploadMd(env, kind, srcPath, overwrite)
                : await window.api.assetManager.upload(env, kind, srcPath, overwrite);
        if (result.ok) {
            onNotify(t('assetManager.uploadSuccess', { count: result.importedCount ?? 0 }), 'success');
            await load();
        } else {
            onNotify(
                t(result.message === 'md-no-name' ? 'assetManager.mdNoName' : 'assetManager.uploadError'),
                'error'
            );
        }
    };

    const handleConfirmOverwrite = async () => {
        if (!confirm) {
            return;
        }
        const { srcPath, uploadKind } = confirm;
        setConfirm(null);
        setBusy(true);
        try {
            await runUpload(srcPath, uploadKind, true);
        } catch {
            onNotify(t('assetManager.uploadError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleConfirmDelete = async () => {
        setDeleteConfirmOpen(false);
        const relPaths = entries.filter(e => checkedKeys.has(e.relPath)).map(e => e.relPath);
        if (relPaths.length === 0) {
            return;
        }
        setBusy(true);
        try {
            const result = await window.api.assetManager.deleteSelected(env, kind, relPaths);
            if (result.ok) {
                onNotify(t('assetManager.deleteSuccess', { count: result.deletedCount ?? 0 }), 'success');
            } else if ((result.deletedCount ?? 0) > 0 || (result.skipped?.length ?? 0) > 0) {
                // 一部のみ削除できた（使用中などでスキップ）
                onNotify(t('assetManager.deletePartial'), 'warning');
            } else {
                onNotify(t('assetManager.deleteError'), 'error');
            }
            await load();
        } catch {
            onNotify(t('assetManager.deleteError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    // 公式スキルインポート: リポジトリを更新して一覧を取得し、ダイアログを開く。
    const handleOpenOfficial = async () => {
        setBusy(true);
        setOfficialLoading(true);
        setOfficialOpen(true);
        setOfficialEntries([]);
        setOfficialChecked(new Set());
        try {
            const result = await window.api.assetManager.listOfficialSkills();
            if (result.ok && result.entries) {
                setOfficialEntries(result.entries);
            } else {
                onNotify(t('assetManager.officialListError'), 'error');
                setOfficialOpen(false);
            }
        } catch {
            onNotify(t('assetManager.officialListError'), 'error');
            setOfficialOpen(false);
        } finally {
            setOfficialLoading(false);
            setBusy(false);
        }
    };

    const toggleOfficial = (relPath: string) => {
        const next = new Set(officialChecked);
        if (next.has(relPath)) {
            next.delete(relPath);
        } else {
            next.add(relPath);
        }
        setOfficialChecked(next);
    };

    const officialAllChecked = officialEntries.length > 0 && officialEntries.every(e => officialChecked.has(e.relPath));
    const toggleOfficialAll = () => {
        if (officialAllChecked) {
            setOfficialChecked(new Set());
        } else {
            setOfficialChecked(new Set(officialEntries.map(e => e.relPath)));
        }
    };

    // 公式スキルを取り込む（公式同士は確認なしで置換）。
    const handleImportOfficial = async () => {
        const relPaths = officialEntries.filter(e => officialChecked.has(e.relPath)).map(e => e.relPath);
        if (relPaths.length === 0) {
            return;
        }
        setBusy(true);
        try {
            const result = await window.api.assetManager.importOfficialSkills(env, relPaths);
            if (result.ok) {
                onNotify(t('assetManager.officialImportSuccess', { count: result.importedCount ?? 0 }), 'success');
                setOfficialOpen(false);
                await load();
            } else {
                onNotify(t('assetManager.officialImportError'), 'error');
            }
        } catch {
            onNotify(t('assetManager.officialImportError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <Paper variant='outlined' sx={{ p: 2, mb: 2 }}>
                <Typography color='text.secondary'>{t('common.loading')}</Typography>
            </Paper>
        );
    }

    return (
        <Paper variant='outlined' sx={{ mb: 3 }}>
            <Tabs
                value={kind}
                onChange={(_, v: AssetKind) => setKind(v)}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
                <Tab value='agents' label={t('assetManager.tabAgents')} />
                <Tab value='skills' label={t('assetManager.tabSkills')} />
            </Tabs>

            <Box sx={{ p: 2 }}>
                {report && !report.available ? (
                    <Alert severity='info'>{t('assetManager.unavailable')}</Alert>
                ) : (
                    <>
                        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                            <Button
                                variant='contained'
                                size='small'
                                startIcon={<DownloadIcon />}
                                disabled={busy || !someChecked}
                                onClick={handleDownload}
                            >
                                {t('assetManager.download')}
                            </Button>
                            <Button
                                variant='outlined'
                                size='small'
                                startIcon={<UploadIcon />}
                                disabled={busy}
                                onClick={handleUploadClick}
                            >
                                {t('assetManager.upload')}
                            </Button>
                            <Button
                                variant='outlined'
                                color='error'
                                size='small'
                                startIcon={<DeleteIcon />}
                                disabled={busy || !someChecked}
                                onClick={() => setDeleteConfirmOpen(true)}
                            >
                                {t('assetManager.delete')}
                            </Button>
                            {/* スキルタブのみ: 公式スキルインポートを右寄せで配置 */}
                            {kind === 'skills' && (
                                <>
                                    <Box sx={{ flexGrow: 1 }} />
                                    <Tooltip title={gitAvailable ? '' : t('assetManager.gitRequired')}>
                                        <span>
                                            <Button
                                                variant='outlined'
                                                size='small'
                                                startIcon={<CloudDownloadIcon />}
                                                disabled={busy || !gitAvailable}
                                                onClick={handleOpenOfficial}
                                            >
                                                {t('assetManager.importOfficial')}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                </>
                            )}
                        </Box>

                        {entries.length === 0 ? (
                            <Typography color='text.secondary' sx={{ py: 1 }}>
                                {t('assetManager.noEntries')}
                            </Typography>
                        ) : (
                            <AssetEntriesTable
                                entries={entries}
                                columns={columns}
                                fitWidth={fitWidth}
                                showFileCount={showFileCount}
                                checkedKeys={checkedKeys}
                                onToggle={toggle}
                                onToggleAll={toggleAll}
                                onView={setViewEntry}
                            />
                        )}
                    </>
                )}
            </Box>

            {/* 上書き確認ダイアログ（zip / md 共通） */}
            <Dialog open={confirm !== null} onClose={() => setConfirm(null)}>
                <DialogTitle>{t('assetManager.overwriteConfirmTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('assetManager.overwriteConfirmBody', {
                            count: confirm?.conflicts.length ?? 0,
                            names: (confirm?.conflicts ?? []).join(', '),
                        })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirm(null)}>{t('assetManager.cancel')}</Button>
                    <Button color='error' variant='contained' onClick={handleConfirmOverwrite}>
                        {t('assetManager.overwrite')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* 削除確認ダイアログ */}
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                <DialogTitle>{t('assetManager.deleteConfirmTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('assetManager.deleteConfirmBody', { count: checkedKeys.size })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)}>{t('assetManager.cancel')}</Button>
                    <Button color='error' variant='contained' onClick={handleConfirmDelete}>
                        {t('assetManager.delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* frontmatter 参照ダイアログ */}
            <Dialog open={viewEntry !== null} onClose={() => setViewEntry(null)} maxWidth='md' fullWidth>
                <DialogTitle>{t('assetManager.viewTitle', { name: viewEntry?.name ?? '' })}</DialogTitle>
                <DialogContent>
                    <Box
                        component='pre'
                        sx={{
                            m: 0,
                            p: 2,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}
                    >
                        {viewEntry?.frontmatterRaw ?? ''}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setViewEntry(null)}>{t('assetManager.close')}</Button>
                </DialogActions>
            </Dialog>

            {/* 公式スキルインポートダイアログ */}
            <Dialog open={officialOpen} onClose={() => !busy && setOfficialOpen(false)} maxWidth='lg' fullWidth>
                <DialogTitle>{t('assetManager.importOfficialTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>{t('assetManager.importOfficialDesc')}</DialogContentText>
                    {officialLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                            <CircularProgress size={20} />
                            <Typography color='text.secondary'>{t('assetManager.repoUpdating')}</Typography>
                        </Box>
                    ) : officialEntries.length === 0 ? (
                        <Typography color='text.secondary' sx={{ py: 1 }}>
                            {t('assetManager.noEntries')}
                        </Typography>
                    ) : (
                        <AssetEntriesTable
                            entries={officialEntries}
                            columns={OFFICIAL_COLUMNS}
                            fitWidth={officialFitWidth}
                            showFileCount
                            checkedKeys={officialChecked}
                            onToggle={toggleOfficial}
                            onToggleAll={toggleOfficialAll}
                            onView={setViewEntry}
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOfficialOpen(false)} disabled={busy}>
                        {t('assetManager.cancel')}
                    </Button>
                    <Button
                        variant='contained'
                        startIcon={<CloudDownloadIcon />}
                        onClick={handleImportOfficial}
                        disabled={busy || officialChecked.size === 0}
                    >
                        {t('assetManager.import')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
