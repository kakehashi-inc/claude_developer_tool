import React, { useEffect, useState } from 'react';
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
    IconButton,
    Alert,
    Chip,
    Tooltip,
} from '@mui/material';
import {
    ToggleOn as EnableIcon,
    ToggleOff as DisableIcon,
    DragIndicator as DragIcon,
} from '@mui/icons-material';
import type { ClaudeCodeEnvInfo, MCPServerInfo } from '../../shared/types';

interface Props {
    info: ClaudeCodeEnvInfo;
    onNotify: (message: string, severity: 'success' | 'error') => void;
}

/**
 * 1 つの Claude 環境（native または WSL distro）の MCP サーバーを管理するセクション。
 * 有効/無効の 2 テーブル、ドラッグ並べ替え、有効化/無効化トグルを提供する。
 * 状態はセクション内ローカルで完結させる。
 */
export const ClaudeEnvMcpSection: React.FC<Props> = ({ info, onNotify }) => {
    const { t } = useTranslation();
    const { env } = info;
    const [enabledServers, setEnabledServers] = useState<MCPServerInfo[]>([]);
    const [disabledServers, setDisabledServers] = useState<MCPServerInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [draggedDisabledIndex, setDraggedDisabledIndex] = useState<number | null>(null);

    const loadData = async () => {
        try {
            const servers = await window.api.claudeCode.getMCPServers(env);
            setEnabledServers(servers.enabled);
            setDisabledServers(servers.disabled);
        } catch (error) {
            console.error('Failed to load Claude Code MCP servers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [info.configPath]);

    const handleDisable = async (serverName: string) => {
        try {
            const result = await window.api.claudeCode.disableMCPServer(env, serverName);
            setEnabledServers(result.enabled);
            setDisabledServers(result.disabled);
            onNotify(t('common.success'), 'success');
        } catch (error) {
            onNotify(error instanceof Error ? error.message : t('common.error'), 'error');
        }
    };

    const handleEnable = async (serverName: string) => {
        try {
            const result = await window.api.claudeCode.enableMCPServer(env, serverName);
            setEnabledServers(result.enabled);
            setDisabledServers(result.disabled);
            onNotify(t('common.success'), 'success');
        } catch (error) {
            onNotify(error instanceof Error ? error.message : t('common.error'), 'error');
        }
    };

    const handleDragStart = (index: number) => setDraggedIndex(index);

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        const newServers = [...enabledServers];
        const dragged = newServers[draggedIndex];
        newServers.splice(draggedIndex, 1);
        newServers.splice(index, 0, dragged);
        setEnabledServers(newServers);
        setDraggedIndex(index);
    };

    const handleDragEnd = async () => {
        if (draggedIndex === null) return;
        try {
            const names = enabledServers.map(s => s.name);
            await window.api.claudeCode.reorderMCPServers(env, names);
            onNotify(t('common.success'), 'success');
        } catch (error) {
            onNotify(error instanceof Error ? error.message : t('common.error'), 'error');
            await loadData();
        } finally {
            setDraggedIndex(null);
        }
    };

    const handleDisabledDragStart = (index: number) => setDraggedDisabledIndex(index);

    const handleDisabledDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedDisabledIndex === null || draggedDisabledIndex === index) return;
        const newServers = [...disabledServers];
        const dragged = newServers[draggedDisabledIndex];
        newServers.splice(draggedDisabledIndex, 1);
        newServers.splice(index, 0, dragged);
        setDisabledServers(newServers);
        setDraggedDisabledIndex(index);
    };

    const handleDisabledDragEnd = async () => {
        if (draggedDisabledIndex === null) return;
        try {
            const names = disabledServers.map(s => s.name);
            await window.api.claudeCode.reorderDisabledMCPServers(env, names);
            onNotify(t('common.success'), 'success');
        } catch (error) {
            onNotify(error instanceof Error ? error.message : t('common.error'), 'error');
            await loadData();
        } finally {
            setDraggedDisabledIndex(null);
        }
    };

    const renderTable = (
        servers: MCPServerInfo[],
        variant: 'enabled' | 'disabled',
        onDragStart: (index: number) => void,
        onDragOver: (e: React.DragEvent, index: number) => void,
        onDragEnd: () => void,
        draggingIndex: number | null
    ) => (
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell width='40'></TableCell>
                        <TableCell>{t('claudeCode.serverName')}</TableCell>
                        <TableCell>{t('claudeCode.command')}</TableCell>
                        <TableCell>{t('claudeCode.args')}</TableCell>
                        <TableCell width='120'>{t('claudeCode.actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {servers.map((server, index) => (
                        <TableRow
                            key={server.name}
                            draggable
                            onDragStart={() => onDragStart(index)}
                            onDragOver={e => onDragOver(e, index)}
                            onDragEnd={onDragEnd}
                            sx={{
                                cursor: 'move',
                                opacity: draggingIndex === index ? 0.5 : 1,
                                '&:hover': { bgcolor: 'action.hover' },
                            }}
                        >
                            <TableCell>
                                <DragIcon sx={{ color: 'action.disabled' }} />
                            </TableCell>
                            <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant='body2' sx={{ fontWeight: 'medium' }}>
                                        {server.name}
                                    </Typography>
                                    {server.config.type && (
                                        <Chip label={server.config.type} size='small' variant='outlined' />
                                    )}
                                </Box>
                            </TableCell>
                            <TableCell>
                                <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                                    {server.config.command}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                                    {server.config.args?.join(' ') || '-'}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                {variant === 'enabled' ? (
                                    <Tooltip title={t('claudeCode.disable')}>
                                        <IconButton size='large' color='success' onClick={() => handleDisable(server.name)}>
                                            <EnableIcon sx={{ fontSize: 40 }} />
                                        </IconButton>
                                    </Tooltip>
                                ) : (
                                    <Tooltip title={t('claudeCode.enable')}>
                                        <IconButton size='large' color='error' onClick={() => handleEnable(server.name)}>
                                            <DisableIcon sx={{ fontSize: 40 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );

    return (
        <Box sx={{ mb: 4 }}>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant='body2' color='text.secondary' sx={{ mb: 0.5 }}>
                    {t('claudeCode.configPath')}: {info.configPath}
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                    {t('claudeCode.disabledConfigPath')}: {info.disabledConfigPath}
                </Typography>
            </Paper>

            {loading ? (
                <Typography sx={{ px: 1 }}>{t('common.loading')}</Typography>
            ) : !info.configExists ? (
                <Alert severity='info'>{t('claudeCode.notFound')}</Alert>
            ) : (
                <>
                    <Box sx={{ mb: 3 }}>
                        <Typography variant='subtitle1' sx={{ mb: 1 }}>
                            {t('claudeCode.enabledServers')}
                            {enabledServers.length > 0 && (
                                <Typography variant='caption' color='text.secondary' sx={{ ml: 2 }}>
                                    ({t('claudeCode.dragToReorder')})
                                </Typography>
                            )}
                        </Typography>
                        {enabledServers.length === 0 ? (
                            <Alert severity='info'>{t('claudeCode.noServers')}</Alert>
                        ) : (
                            renderTable(
                                enabledServers,
                                'enabled',
                                handleDragStart,
                                handleDragOver,
                                handleDragEnd,
                                draggedIndex
                            )
                        )}
                    </Box>

                    <Box>
                        <Typography variant='subtitle1' sx={{ mb: 1 }}>
                            {t('claudeCode.disabledServers')}
                            {disabledServers.length > 0 && (
                                <Typography variant='caption' color='text.secondary' sx={{ ml: 2 }}>
                                    ({t('claudeCode.dragToReorder')})
                                </Typography>
                            )}
                        </Typography>
                        {disabledServers.length === 0 ? (
                            <Alert severity='info'>{t('claudeCode.noServers')}</Alert>
                        ) : (
                            renderTable(
                                disabledServers,
                                'disabled',
                                handleDisabledDragStart,
                                handleDisabledDragOver,
                                handleDisabledDragEnd,
                                draggedDisabledIndex
                            )
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
};
