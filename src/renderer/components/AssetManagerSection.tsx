import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Paper,
    Tabs,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    Button,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Typography,
    Tooltip,
} from '@mui/material';
import {
    Download as DownloadIcon,
    Upload as UploadIcon,
    Visibility as ViewIcon,
    DeleteOutlined as DeleteIcon,
} from '@mui/icons-material';
import type { AssetEntry, AssetKind, AssetListReport, ClaudeEnvironment } from '../../shared/types';
import { formatCount } from '../utils/format';

interface Props {
    env: ClaudeEnvironment;
    onNotify: (message: string, severity: 'success' | 'error' | 'warning') => void;
}

// frontmatter 列の表示設定（table-layout: auto と併用）。
// - fit:    内容に合わせて伸縮し、maxWidth で上限を制限する（name）。上限超過は省略（…）。
// - width:  固定幅（tools / model）。
// - flex:   残り幅をすべて使う伸縮列（description。width:100% で貪欲に確保）。
// 値はいずれも 1〜2 行省略（…）＋ Tooltip で全文表示する。
interface FmColumn {
    key: string;
    width?: number; // 固定幅（px）
    maxWidthPct?: number; // fit 列の最大幅（ウィンドウ幅に対する割合 0〜1）
    fit?: boolean; // 内容フィット（maxWidth 上限）
    flex?: boolean; // 残り幅を使う伸縮列
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

// name（fit 列）の最小幅と、1 文字あたりの概算 px（幅見積り用）。
const NAME_MIN_WIDTH = 80;
const NAME_CHAR_PX = 8;

/**
 * fit 列（name）の幅を実データから見積もる。名前とサブパスの長い方の文字数を基準に、
 * [NAME_MIN_WIDTH, maxWidthPx] の範囲へクランプする。maxWidthPx はウィンドウ幅に対する割合から
 * 算出する（呼び出し側で計算）。これにより table-layout: fixed のまま「内容に合わせて伸縮
 * （最大幅はウィンドウ幅の割合）」を実現する。
 */
function computeFitWidth(entries: AssetEntry[], maxWidthPx: number): number {
    let maxChars = 0;
    for (const e of entries) {
        const nameLen = (e.frontmatter?.name ?? e.name ?? '').length;
        const subLen = relSubDir(e.relPath).length;
        maxChars = Math.max(maxChars, nameLen, subLen);
    }
    const px = maxChars * NAME_CHAR_PX + 24; // セルの左右パディング分を加算
    return Math.min(Math.max(px, NAME_MIN_WIDTH), maxWidthPx);
}

/** 列の幅指定を sx 用に解決する。fit 列は事前計算した fitWidth を使う。 */
function colWidthSx(col: FmColumn, fitWidth: number): { width?: number | string } {
    if (col.flex) {
        return { width: 'auto' };
    }
    if (col.fit) {
        return { width: fitWidth };
    }
    return { width: col.width };
}

/**
 * relPath（asset 親からの相対パス）のうち、サブディレクトリ部分（最後の '/' より前）を返す。
 * 例: 'c-suite/cbdo.md' → 'c-suite/'、'foo.md' / 'apple-design' → ''（サブディレクトリなし）。
 */
function relSubDir(relPath: string): string {
    const idx = relPath.lastIndexOf('/');
    return idx <= 0 ? '' : relPath.slice(0, idx + 1);
}

/**
 * 1 環境分の Agent・Skill 管理セクション。
 * 「エージェント」「スキル」をタブで分離し、各タブで一覧 / ダウンロード / アップロードを行う。
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
    const [confirm, setConfirm] = useState<{ zipPath: string; conflicts: string[] } | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [viewEntry, setViewEntry] = useState<AssetEntry | null>(null);
    // name 列の最大幅をウィンドウ幅の割合で算出するため、ウィンドウ幅を監視する。
    const [windowWidth, setWindowWidth] = useState<number>(() => window.innerWidth);

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
    // ファイル数列は skills のみ表示（agents は 1 ファイル固定なので不要）。サイズ列は両タブとも非表示。
    const showFileCount = kind === 'skills';
    const allChecked = entries.length > 0 && entries.every(e => checkedKeys.has(e.relPath));
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
            if (!result.ok || !result.zipPath) {
                onNotify(t('assetManager.uploadError'), 'error');
                return;
            }
            const conflicts = result.conflicts ?? [];
            if (conflicts.length > 0) {
                // 同名衝突あり → 確認ダイアログ
                setConfirm({ zipPath: result.zipPath, conflicts });
                return;
            }
            await runUpload(result.zipPath, false);
        } catch {
            onNotify(t('assetManager.uploadError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const runUpload = async (zipPath: string, overwrite: boolean) => {
        const result = await window.api.assetManager.upload(env, kind, zipPath, overwrite);
        if (result.ok) {
            onNotify(t('assetManager.uploadSuccess', { count: result.importedCount ?? 0 }), 'success');
            await load();
        } else {
            onNotify(t('assetManager.uploadError'), 'error');
        }
    };

    const handleConfirmOverwrite = async () => {
        if (!confirm) {
            return;
        }
        const { zipPath } = confirm;
        setConfirm(null);
        setBusy(true);
        try {
            await runUpload(zipPath, true);
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
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
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
                        </Box>

                        {entries.length === 0 ? (
                            <Typography color='text.secondary' sx={{ py: 1 }}>
                                {t('assetManager.noEntries')}
                            </Typography>
                        ) : (
                            <TableContainer>
                                <Table size='small' sx={{ tableLayout: 'fixed', width: '100%' }}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell padding='checkbox' sx={{ width: 48 }}>
                                                <Checkbox
                                                    indeterminate={someChecked && !allChecked}
                                                    checked={allChecked}
                                                    onChange={toggleAll}
                                                />
                                            </TableCell>
                                            {columns.map(col => (
                                                <TableCell
                                                    key={col.key}
                                                    sx={{
                                                        ...colWidthSx(col, fitWidth),
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                    }}
                                                >
                                                    {t(`assetManager.col.${col.key}`)}
                                                </TableCell>
                                            ))}
                                            {showFileCount && (
                                                <TableCell align='right' sx={{ width: 72, whiteSpace: 'nowrap' }}>
                                                    {t('assetManager.columnFiles')}
                                                </TableCell>
                                            )}
                                            <TableCell align='center' sx={{ width: 96, whiteSpace: 'nowrap' }}>
                                                {t('assetManager.columnView')}
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {entries.map(entry => (
                                            <TableRow key={entry.relPath} hover>
                                                <TableCell padding='checkbox' sx={{ width: 48 }}>
                                                    <Checkbox
                                                        checked={checkedKeys.has(entry.relPath)}
                                                        onChange={() => toggle(entry.relPath)}
                                                    />
                                                </TableCell>
                                                {columns.map(col => {
                                                    // name 列はディレクトリ名 / ファイル名を基準に、frontmatter があれば優先。
                                                    // frontmatter が未定義（古い main ビルド等）でも落ちないようガードする。
                                                    const fmValue = entry.frontmatter?.[col.key];
                                                    const value =
                                                        fmValue ?? (col.key === 'name' ? (entry.name ?? '') : '');
                                                    // name 列のみ: agents/ からの相対サブパス（サブディレクトリ）があれば
                                                    // 名前の下に控えめ（ミュート）な色で表示してパスを判別できるようにする。
                                                    const subPath = col.key === 'name' ? relSubDir(entry.relPath) : '';
                                                    // name（fit 列）は 1 行で内容フィット＋maxWidth 超過を省略。
                                                    // その他の列は最大 2 行まで表示して超過を省略する。
                                                    const valueSx = col.fit
                                                        ? {
                                                              whiteSpace: 'nowrap' as const,
                                                              overflow: 'hidden',
                                                              textOverflow: 'ellipsis',
                                                          }
                                                        : {
                                                              display: '-webkit-box',
                                                              WebkitBoxOrient: 'vertical' as const,
                                                              WebkitLineClamp: 2,
                                                              overflow: 'hidden',
                                                              overflowWrap: 'anywhere' as const,
                                                          };
                                                    return (
                                                        <TableCell
                                                            key={col.key}
                                                            sx={{
                                                                ...colWidthSx(col, fitWidth),
                                                                verticalAlign: 'top',
                                                            }}
                                                        >
                                                            <Tooltip title={value} disableHoverListener={!value}>
                                                                <Box sx={valueSx}>{value}</Box>
                                                            </Tooltip>
                                                            {subPath && (
                                                                <Tooltip title={subPath}>
                                                                    <Box
                                                                        sx={{
                                                                            display: 'block',
                                                                            mt: 0.25,
                                                                            fontSize: '0.75rem',
                                                                            lineHeight: 1.3,
                                                                            color: 'text.secondary',
                                                                            whiteSpace: 'nowrap',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                        }}
                                                                    >
                                                                        {subPath}
                                                                    </Box>
                                                                </Tooltip>
                                                            )}
                                                        </TableCell>
                                                    );
                                                })}
                                                {showFileCount && (
                                                    <TableCell
                                                        align='right'
                                                        sx={{ width: 72, whiteSpace: 'nowrap', verticalAlign: 'top' }}
                                                    >
                                                        {formatCount(entry.fileCount ?? 0)}
                                                    </TableCell>
                                                )}
                                                <TableCell
                                                    align='center'
                                                    sx={{ width: 96, whiteSpace: 'nowrap', verticalAlign: 'top' }}
                                                >
                                                    <Button
                                                        size='small'
                                                        startIcon={<ViewIcon />}
                                                        disabled={!entry.frontmatterRaw}
                                                        onClick={() => setViewEntry(entry)}
                                                    >
                                                        {t('assetManager.view')}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </>
                )}
            </Box>

            {/* 上書き確認ダイアログ */}
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
        </Paper>
    );
};
