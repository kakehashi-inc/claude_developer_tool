import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Snackbar, Alert, Divider } from '@mui/material';
import type { ClaudeEnvironment } from '../../shared/types';
import { envId } from '../utils/format';
import { AssetManagerSection } from './AssetManagerSection';

/**
 * 画面: Claude Code Agent・Skill 管理。
 * native（Windows/macOS/Linux）と WSL distro ごとに、~/.claude/agents・~/.claude/skills の
 * サブディレクトリ（= 各エージェント / 各スキル）を ZIP で DL/UL する。
 * 環境セクションの並べ方は Cleanup 画面の仕様を踏襲する。
 */
export const AssetManager: React.FC = () => {
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

    useEffect(() => {
        const load = async () => {
            try {
                const envs = await window.api.assetManager.getEnvironments();
                setEnvironments(envs);
            } catch (error) {
                console.error('Failed to load asset manager environments:', error);
            } finally {
                setLoading(false);
            }
        };
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
            <Typography variant='h4' component='h1' sx={{ mb: 1 }}>
                {t('assetManager.title')}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                {t('assetManager.description')}
            </Typography>

            {nativeEnvs.map(({ env, label }) => (
                <Box key={envId(env)}>
                    <Typography variant='h6' sx={{ mb: 1 }}>
                        {label}
                    </Typography>
                    <AssetManagerSection env={env} onNotify={notify} />
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
                                {t('assetManager.wslSection', { distro: label })}
                            </Typography>
                            <AssetManagerSection env={env} onNotify={notify} />
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
