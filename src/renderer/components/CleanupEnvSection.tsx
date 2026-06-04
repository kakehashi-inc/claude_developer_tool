import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    IconButton,
    Collapse,
    Button,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from '@mui/material';
import {
    KeyboardArrowDown as ExpandIcon,
    KeyboardArrowRight as CollapseIcon,
    DeleteSweep as DeleteIcon,
} from '@mui/icons-material';
import type { ClaudeEnvironment, CleanupCandidate, CleanupEnvReport } from '../../shared/types';
import { formatBytes } from '../utils/format';

interface Props {
    env: ClaudeEnvironment;
    label: string;
    onNotify: (message: string, severity: 'success' | 'error') => void;
}

const PROJECTS_KEY = 'projects';

// i18n キーは camelCase。ディレクトリ名（ハイフン区切り）を変換する。
function dirI18nKey(key: string): string {
    return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * 1 つの環境（native または WSL distro）のクリーンアップセクション。
 */
export const CleanupEnvSection: React.FC<Props> = ({ env, label, onNotify }) => {
    const { t } = useTranslation();
    const [report, setReport] = useState<CleanupEnvReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkedDirs, setCheckedDirs] = useState<Set<string>>(new Set());
    const [checkedProjects, setCheckedProjects] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const applyReport = (r: CleanupEnvReport) => {
        setReport(r);
        const defaults = new Set<string>();
        for (const c of r.candidates) {
            if (c.exists && c.defaultChecked) {
                defaults.add(c.key);
            }
        }
        setCheckedDirs(defaults);
        setCheckedProjects(new Set());
    };

    const load = async () => {
        try {
            const r = await window.api.claudeCleanup.scan(env);
            applyReport(r);
        } catch (error) {
            console.error('Failed to scan cleanup candidates:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [label]);

    const candidates = report?.candidates ?? [];
    const projectsCandidate = candidates.find(c => c.key === PROJECTS_KEY);
    const projectChildren = projectsCandidate?.children ?? [];

    const toggleDir = (key: string) => {
        setCheckedDirs(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
        // projects 全体を ON にしたら個別選択はクリア
        if (key === PROJECTS_KEY) {
            setCheckedProjects(new Set());
        }
    };

    const toggleProject = (name: string) => {
        setCheckedProjects(prev => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    };

    // projects 親チェックの状態（all / some / none）
    const projectsAllChecked = checkedDirs.has(PROJECTS_KEY);
    const projectsIndeterminate = !projectsAllChecked && checkedProjects.size > 0;

    const selection = useMemo(() => {
        const dirs = Array.from(checkedDirs);
        const projectDirs = checkedDirs.has(PROJECTS_KEY) ? [] : Array.from(checkedProjects);
        return { dirs, projectDirs };
    }, [checkedDirs, checkedProjects]);

    // 回収予定容量と件数
    const { reclaimSize, reclaimCount } = useMemo(() => {
        let size = 0;
        let count = 0;
        for (const c of candidates) {
            if (c.key === PROJECTS_KEY) {
                if (checkedDirs.has(PROJECTS_KEY)) {
                    size += c.size;
                    count += 1;
                } else {
                    for (const child of c.children ?? []) {
                        if (checkedProjects.has(child.name)) {
                            size += child.size;
                            count += 1;
                        }
                    }
                }
            } else if (checkedDirs.has(c.key)) {
                size += c.size;
                count += 1;
            }
        }
        return { reclaimSize: size, reclaimCount: count };
    }, [candidates, checkedDirs, checkedProjects]);

    const canDelete = reclaimCount > 0;

    const handleDelete = async () => {
        setConfirmOpen(false);
        setDeleting(true);
        try {
            const r = await window.api.claudeCleanup.delete(env, selection);
            applyReport(r);
            onNotify(t('cleanup.deleteSuccess'), 'success');
        } catch (error) {
            // 部分失敗でも再スキャンしたいので、エラーメッセージを表示しつつ再読込
            onNotify(error instanceof Error ? error.message : t('cleanup.deleteError'), 'error');
            await load();
        } finally {
            setDeleting(false);
        }
    };

    const visibleCandidates = candidates.filter(c => c.exists);

    const renderProjectsRow = (c: CleanupCandidate) => (
        <React.Fragment key={c.key}>
            <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                <TableCell padding='checkbox'>
                    <Checkbox
                        checked={projectsAllChecked}
                        indeterminate={projectsIndeterminate}
                        onChange={() => toggleDir(c.key)}
                    />
                </TableCell>
                <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton size='small' onClick={() => setExpanded(e => !e)}>
                            {expanded ? <ExpandIcon /> : <CollapseIcon />}
                        </IconButton>
                        <Typography variant='body2' sx={{ fontWeight: 'medium' }}>
                            {t(`cleanup.dir.${dirI18nKey(c.key)}`)}
                        </Typography>
                    </Box>
                </TableCell>
                <TableCell>
                    <Typography variant='body2' color='text.secondary'>
                        {t(`cleanup.desc.${dirI18nKey(c.key)}`)}
                    </Typography>
                </TableCell>
                <TableCell align='right'>
                    <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                        {formatBytes(c.size)}
                    </Typography>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell sx={{ py: 0, border: 0 }} colSpan={4}>
                    <Collapse in={expanded} timeout='auto' unmountOnExit>
                        <Box sx={{ pl: 6, py: 1 }}>
                            {projectChildren.length === 0 ? (
                                <Typography variant='body2' color='text.secondary'>
                                    {t('cleanup.noCandidates')}
                                </Typography>
                            ) : (
                                <Table size='small'>
                                    <TableBody>
                                        {projectChildren.map(child => (
                                            <TableRow key={child.name}>
                                                <TableCell padding='checkbox' sx={{ border: 0 }}>
                                                    <Checkbox
                                                        size='small'
                                                        checked={projectsAllChecked || checkedProjects.has(child.name)}
                                                        disabled={projectsAllChecked}
                                                        onChange={() => toggleProject(child.name)}
                                                    />
                                                </TableCell>
                                                <TableCell sx={{ border: 0 }}>
                                                    <Typography
                                                        variant='body2'
                                                        sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                                                    >
                                                        {child.name}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align='right' sx={{ border: 0 }}>
                                                    <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                                                        {formatBytes(child.size)}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );

    const renderDirRow = (c: CleanupCandidate) => (
        <TableRow key={c.key} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
            <TableCell padding='checkbox'>
                <Checkbox checked={checkedDirs.has(c.key)} onChange={() => toggleDir(c.key)} />
            </TableCell>
            <TableCell>
                <Typography variant='body2' sx={{ fontWeight: 'medium' }}>
                    {t(`cleanup.dir.${dirI18nKey(c.key)}`)}
                </Typography>
            </TableCell>
            <TableCell>
                <Typography variant='body2' color='text.secondary'>
                    {t(`cleanup.desc.${dirI18nKey(c.key)}`)}
                </Typography>
            </TableCell>
            <TableCell align='right'>
                <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                    {formatBytes(c.size)}
                </Typography>
            </TableCell>
        </TableRow>
    );

    return (
        <Box sx={{ mb: 4 }}>
            {loading ? (
                <Typography sx={{ px: 1 }}>{t('common.loading')}</Typography>
            ) : visibleCandidates.length === 0 ? (
                <Alert severity='info'>{t('cleanup.noCandidates')}</Alert>
            ) : (
                <>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding='checkbox'></TableCell>
                                    <TableCell>{t('cleanup.columnName')}</TableCell>
                                    <TableCell>{t('cleanup.columnDescription')}</TableCell>
                                    <TableCell align='right' width='120'>
                                        {t('cleanup.columnSize')}
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {visibleCandidates.map(c =>
                                    c.key === PROJECTS_KEY ? renderProjectsRow(c) : renderDirRow(c)
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Button
                            variant='contained'
                            color='error'
                            startIcon={<DeleteIcon />}
                            disabled={!canDelete || deleting}
                            onClick={() => setConfirmOpen(true)}
                            sx={{ textTransform: 'none' }}
                        >
                            {t('cleanup.deleteSelected')}
                        </Button>
                        {canDelete && (
                            <Typography variant='body2' color='text.secondary'>
                                {t('cleanup.reclaimable', { count: reclaimCount, size: formatBytes(reclaimSize) })}
                            </Typography>
                        )}
                    </Box>
                </>
            )}

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>{t('cleanup.confirmTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('cleanup.confirmBody', { count: reclaimCount, size: formatBytes(reclaimSize) })}
                    </DialogContentText>
                    <Alert severity='warning' sx={{ mt: 2 }}>
                        {t('cleanup.inUseWarning')}
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)} sx={{ textTransform: 'none' }}>
                        {t('cleanup.cancel')}
                    </Button>
                    <Button onClick={handleDelete} color='error' variant='contained' sx={{ textTransform: 'none' }}>
                        {t('cleanup.deleteSelected')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
