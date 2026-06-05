import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Typography, Snackbar, Alert, Divider } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import type { ClaudeEnvironment } from '../../shared/types';
import { envId } from '../utils/format';
import { PlatformCleanupSection } from './PlatformCleanupSection';

/**
 * 画面3: クリーンアップ。
 * Windows / macOS / Linux / WSL distro といったプラットフォーム単位でセクションを並べる。
 * 各セクションが Claude Code（~/.claude）と その他のツール（~/.serena 等）の両方をまとめて扱う。
 */
export const Cleanup: React.FC = () => {
    const { t } = useTranslation();
    const [environments, setEnvironments] = useState<{ env: ClaudeEnvironment; label: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const load = async () => {
        setLoading(true);
        try {
            const [claudeEnvs, otherEnvs] = await Promise.all([
                window.api.claudeCleanup.getEnvironments(),
                window.api.claudeCleanup.getOtherEnvironments(),
            ]);
            // Claude Code を持つ環境と Serena 等を持つ環境の和集合（envId で重複排除）
            const merged = new Map<string, { env: ClaudeEnvironment; label: string }>();
            for (const e of [...claudeEnvs, ...otherEnvs]) {
                const id = envId(e.env);
                if (!merged.has(id)) {
                    merged.set(id, e);
                }
            }
            setEnvironments(Array.from(merged.values()));
        } catch (error) {
            console.error('Failed to load cleanup environments:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const notify = (message: string, severity: 'success' | 'error' | 'warning') => {
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
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                <Box>
                    <Typography variant='h4' component='h1' sx={{ mb: 1 }}>
                        {t('cleanup.title')}
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                        {t('cleanup.description')}
                    </Typography>
                </Box>
                <Button
                    variant='outlined'
                    startIcon={<RefreshIcon />}
                    onClick={load}
                    sx={{ textTransform: 'none', flexShrink: 0 }}
                >
                    {t('common.refresh')}
                </Button>
            </Box>

            {nativeEnvs.map(({ env, label }) => (
                <Box key={envId(env)}>
                    <Typography variant='h6' sx={{ mb: 1 }}>
                        {label}
                    </Typography>
                    <PlatformCleanupSection env={env} label={label} onNotify={notify} />
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
                            <PlatformCleanupSection env={env} label={label} onNotify={notify} />
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
