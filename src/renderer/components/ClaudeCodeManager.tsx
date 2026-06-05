import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Typography, Snackbar, Alert, Divider } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import type { ClaudeCodeEnvInfo } from '../../shared/types';
import { envId } from '../utils/format';
import { ClaudeEnvMcpSection } from './ClaudeEnvMcpSection';

/**
 * 画面2: Claude Code (CLI) のプロファイル MCP 管理。
 * native セクションに加え、Windows では Claude 入り WSL distro を別セクションで表示する。
 */
export const ClaudeCodeManager: React.FC = () => {
    const { t } = useTranslation();
    const [environments, setEnvironments] = useState<ClaudeCodeEnvInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const load = async () => {
        setLoading(true);
        try {
            const envs = await window.api.claudeCode.getEnvironments();
            setEnvironments(envs);
        } catch (error) {
            console.error('Failed to load Claude Code environments:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const notify = (message: string, severity: 'success' | 'error') => {
        setSnackbar({ open: true, message, severity });
    };

    if (loading) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography>{t('common.loading')}</Typography>
            </Box>
        );
    }

    const nativeEnvs = environments.filter(e => e.env.kind === 'native');
    const wslEnvs = environments.filter(e => e.env.kind === 'wsl');

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant='h4' component='h1'>
                    {t('claudeCode.title')}
                </Typography>
                <Button variant='outlined' startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none' }}>
                    {t('common.refresh')}
                </Button>
            </Box>

            {nativeEnvs.map(info => (
                <Box key={envId(info.env)}>
                    <Typography variant='h6' sx={{ mb: 1 }}>
                        {info.label}
                    </Typography>
                    <ClaudeEnvMcpSection info={info} onNotify={notify} />
                </Box>
            ))}

            {wslEnvs.length > 0 && (
                <>
                    <Divider sx={{ my: 3 }} />
                    <Typography variant='h5' sx={{ mb: 2 }}>
                        WSL
                    </Typography>
                    {wslEnvs.map(info => (
                        <Box key={envId(info.env)}>
                            <Typography variant='h6' sx={{ mb: 1 }}>
                                {t('claudeCode.wslSection', { distro: info.label })}
                            </Typography>
                            <ClaudeEnvMcpSection info={info} onNotify={notify} />
                        </Box>
                    ))}
                </>
            )}

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
