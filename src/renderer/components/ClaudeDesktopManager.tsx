import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Button,
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
    AlertTitle,
    Snackbar,
    Tooltip,
} from '@mui/material';
import {
    ToggleOn as EnableIcon,
    ToggleOff as DisableIcon,
    Refresh as RestartIcon,
    DragIndicator as DragIcon,
} from '@mui/icons-material';
import type { ClaudeDesktopInfo, MCPServerInfo } from '../../shared/types';

export const ClaudeDesktopManager: React.FC = () => {
    const { t } = useTranslation();
    const [info, setInfo] = useState<ClaudeDesktopInfo | null>(null);
    const [enabledServers, setEnabledServers] = useState<MCPServerInfo[]>([]);
    const [disabledServers, setDisabledServers] = useState<MCPServerInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [draggedDisabledIndex, setDraggedDisabledIndex] = useState<number | null>(null);

    const loadData = async () => {
        try {
            const [infoData, serversData] = await Promise.all([
                window.api.claudeDesktop.getInfo(),
                window.api.claudeDesktop.getMCPServers(),
            ]);
            setInfo(infoData);
            setEnabledServers(serversData.enabled);
            setDisabledServers(serversData.disabled);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleDisable = async (serverName: string) => {
        try {
            const result = await window.api.claudeDesktop.disableMCPServer(serverName);
            setEnabledServers(result.enabled);
            setDisabledServers(result.disabled);
            setSnackbar({ open: true, message: t('common.success'), severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error instanceof Error ? error.message : t('common.error'),
                severity: 'error',
            });
        }
    };

    const handleEnable = async (serverName: string) => {
        try {
            const result = await window.api.claudeDesktop.enableMCPServer(serverName);
            setEnabledServers(result.enabled);
            setDisabledServers(result.disabled);
            setSnackbar({ open: true, message: t('common.success'), severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error instanceof Error ? error.message : t('common.error'),
                severity: 'error',
            });
        }
    };

    const handleRestart = async () => {
        try {
            await window.api.claudeDesktop.restart();
            setSnackbar({ open: true, message: t('claudeDesktop.restartSuccess'), severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error instanceof Error ? error.message : t('claudeDesktop.restartError'),
                severity: 'error',
            });
        }
    };

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newServers = [...enabledServers];
        const draggedServer = newServers[draggedIndex];
        newServers.splice(draggedIndex, 1);
        newServers.splice(index, 0, draggedServer);

        setEnabledServers(newServers);
        setDraggedIndex(index);
    };

    const handleDragEnd = async () => {
        if (draggedIndex === null) return;

        try {
            const serverNames = enabledServers.map(s => s.name);
            await window.api.claudeDesktop.reorderMCPServers(serverNames);
            setSnackbar({ open: true, message: t('common.success'), severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error instanceof Error ? error.message : t('common.error'),
                severity: 'error',
            });
            await loadData(); // エラー時は元に戻す
        } finally {
            setDraggedIndex(null);
        }
    };

    const handleDisabledDragStart = (index: number) => {
        setDraggedDisabledIndex(index);
    };

    const handleDisabledDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedDisabledIndex === null || draggedDisabledIndex === index) return;

        const newServers = [...disabledServers];
        const draggedServer = newServers[draggedDisabledIndex];
        newServers.splice(draggedDisabledIndex, 1);
        newServers.splice(index, 0, draggedServer);

        setDisabledServers(newServers);
        setDraggedDisabledIndex(index);
    };

    const handleDisabledDragEnd = async () => {
        if (draggedDisabledIndex === null) return;

        try {
            const serverNames = disabledServers.map(s => s.name);
            await window.api.claudeDesktop.reorderDisabledMCPServers(serverNames);
            setSnackbar({ open: true, message: t('common.success'), severity: 'success' });
        } catch (error) {
            setSnackbar({
                open: true,
                message: error instanceof Error ? error.message : t('common.error'),
                severity: 'error',
            });
            await loadData(); // エラー時は元に戻す
        } finally {
            setDraggedDisabledIndex(null);
        }
    };

    if (loading) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography>{t('common.loading')}</Typography>
            </Box>
        );
    }

    if (!info?.configExists) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity='warning'>
                    <AlertTitle>{t('claudeDesktop.notFound')}</AlertTitle>
                    {t('claudeDesktop.notFoundDescription')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant='h4' component='h1'>
                    {t('claudeDesktop.title')}
                </Typography>
                {info.claudeExecutable && (
                    <Button
                        variant='contained'
                        startIcon={<RestartIcon />}
                        onClick={handleRestart}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('claudeDesktop.restart')}
                    </Button>
                )}
            </Box>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
                    {t('claudeDesktop.standardConfigPath')}: {info.configPath}
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                    {t('claudeDesktop.disabledConfigPath')}: {info.disabledConfigPath}
                </Typography>
            </Paper>

            {/* 有効なMCPサーバー */}
            <Box sx={{ mb: 4 }}>
                <Typography variant='h6' sx={{ mb: 2 }}>
                    {t('claudeDesktop.enabledServers')}
                    {enabledServers.length > 0 && (
                        <Typography variant='caption' color='text.secondary' sx={{ ml: 2 }}>
                            ({t('claudeDesktop.dragToReorder')})
                        </Typography>
                    )}
                </Typography>
                {enabledServers.length === 0 ? (
                    <Alert severity='info'>{t('claudeDesktop.noServers')}</Alert>
                ) : (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell width='40'></TableCell>
                                    <TableCell>{t('claudeDesktop.serverName')}</TableCell>
                                    <TableCell>{t('claudeDesktop.command')}</TableCell>
                                    <TableCell>{t('claudeDesktop.args')}</TableCell>
                                    <TableCell width='100'>{t('claudeDesktop.actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {enabledServers.map((server, index) => (
                                    <TableRow
                                        key={server.name}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragOver={e => handleDragOver(e, index)}
                                        onDragEnd={handleDragEnd}
                                        sx={{
                                            cursor: 'move',
                                            opacity: draggedIndex === index ? 0.5 : 1,
                                            '&:hover': { bgcolor: 'action.hover' },
                                        }}
                                    >
                                        <TableCell>
                                            <DragIcon sx={{ color: 'action.disabled' }} />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant='body2' fontWeight='medium'>
                                                {server.name}
                                            </Typography>
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
                                            <Tooltip title={t('claudeDesktop.disable')}>
                                                <IconButton
                                                    size='medium'
                                                    color='success'
                                                    onClick={() => handleDisable(server.name)}
                                                >
                                                    <EnableIcon sx={{ fontSize: 32 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            {/* 無効なMCPサーバー */}
            <Box>
                <Typography variant='h6' sx={{ mb: 2 }}>
                    {t('claudeDesktop.disabledServers')}
                    {disabledServers.length > 0 && (
                        <Typography variant='caption' color='text.secondary' sx={{ ml: 2 }}>
                            ({t('claudeDesktop.dragToReorder')})
                        </Typography>
                    )}
                </Typography>
                {disabledServers.length === 0 ? (
                    <Alert severity='info'>{t('claudeDesktop.noServers')}</Alert>
                ) : (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell width='40'></TableCell>
                                    <TableCell>{t('claudeDesktop.serverName')}</TableCell>
                                    <TableCell>{t('claudeDesktop.command')}</TableCell>
                                    <TableCell>{t('claudeDesktop.args')}</TableCell>
                                    <TableCell width='100'>{t('claudeDesktop.actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {disabledServers.map((server, index) => (
                                    <TableRow
                                        key={server.name}
                                        draggable
                                        onDragStart={() => handleDisabledDragStart(index)}
                                        onDragOver={e => handleDisabledDragOver(e, index)}
                                        onDragEnd={handleDisabledDragEnd}
                                        sx={{
                                            cursor: 'move',
                                            opacity: draggedDisabledIndex === index ? 0.5 : 1,
                                            '&:hover': { bgcolor: 'action.hover' },
                                        }}
                                    >
                                        <TableCell>
                                            <DragIcon sx={{ color: 'action.disabled' }} />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant='body2' fontWeight='medium'>
                                                {server.name}
                                            </Typography>
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
                                            <Tooltip title={t('claudeDesktop.enable')}>
                                                <IconButton
                                                    size='medium'
                                                    color='error'
                                                    onClick={() => handleEnable(server.name)}
                                                >
                                                    <DisableIcon sx={{ fontSize: 32 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={3000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};
