import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Snackbar, Alert, Divider } from '@mui/material';
import type { ClaudeEnvironment } from '../../shared/types';
import { envId } from '../utils/format';
import { CleanupEnvSection } from './CleanupEnvSection';

/**
 * 画面3: Claude Code (CLI) のディレクトリクリーンアップ。
 * native セクションに加え、Windows では Claude 入り WSL distro を別セクションで表示する。
 */
export const Cleanup: React.FC = () => {
    const { t } = useTranslation();
    const [environments, setEnvironments] = useState<{ env: ClaudeEnvironment; label: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    useEffect(() => {
        const load = async () => {
            try {
                const envs = await window.api.claudeCleanup.getEnvironments();
                setEnvironments(envs);
            } catch (error) {
                console.error('Failed to load cleanup environments:', error);
            } finally {
                setLoading(false);
            }
        };
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
            <Typography variant='h4' component='h1' sx={{ mb: 1 }}>
                {t('cleanup.title')}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                {t('cleanup.description')}
            </Typography>

            {nativeEnvs.map(({ env, label }) => (
                <Box key={envId(env)}>
                    <Typography variant='h6' sx={{ mb: 1 }}>
                        {label}
                    </Typography>
                    <CleanupEnvSection env={env} label={label} onNotify={notify} />
                </Box>
            ))}

            {wslEnvs.length > 0 && (
                <>
                    <Divider sx={{ my: 3 }} />
                    <Typography variant='h5' sx={{ mb: 2 }}>
                        WSL
                    </Typography>
                    {wslEnvs.map(({ env, label }) => (
                        <Box key={envId(env)}>
                            <Typography variant='h6' sx={{ mb: 1 }}>
                                {t('cleanup.wslSection', { distro: label })}
                            </Typography>
                            <CleanupEnvSection env={env} label={label} onNotify={notify} />
                        </Box>
                    ))}
                </>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};
