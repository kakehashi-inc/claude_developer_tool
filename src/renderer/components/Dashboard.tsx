import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Card, CardActionArea, CardContent } from '@mui/material';
import {
    Storage as StorageIcon,
    Terminal as TerminalIcon,
    Inventory2 as AssetIcon,
    CleaningServices as CleanupIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface FeatureCard {
    path: string;
    titleKey: string;
    descKey: string;
    Icon: typeof StorageIcon;
    color: string;
}

const FEATURES: FeatureCard[] = [
    {
        path: '/claude-desktop',
        titleKey: 'nav.claudeDesktop',
        descKey: 'dashboard.claudeDesktopDesc',
        Icon: StorageIcon,
        color: '#5b8def',
    },
    {
        path: '/claude-code',
        titleKey: 'nav.claudeCode',
        descKey: 'dashboard.claudeCodeDesc',
        Icon: TerminalIcon,
        color: '#8a6df0',
    },
    {
        path: '/asset-manager',
        titleKey: 'nav.assetManager',
        descKey: 'dashboard.assetManagerDesc',
        Icon: AssetIcon,
        color: '#d98a3a',
    },
    {
        path: '/cleanup',
        titleKey: 'nav.cleanup',
        descKey: 'dashboard.cleanupDesc',
        Icon: CleanupIcon,
        color: '#3aa675',
    },
];

/**
 * 起動時に表示されるダッシュボード。各機能をカードで選択する。
 */
export const Dashboard: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <Box sx={{ p: 4 }}>
            <Typography variant='h4' component='h1' sx={{ mb: 1 }}>
                {t('dashboard.title')}
            </Typography>
            <Typography variant='body1' color='text.secondary' sx={{ mb: 4 }}>
                {t('dashboard.subtitle')}
            </Typography>

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
                    gap: 3,
                }}
            >
                {FEATURES.map(feature => (
                    <Card key={feature.path} variant='outlined' sx={{ height: '100%' }}>
                        <CardActionArea
                            onClick={() => navigate(feature.path)}
                            sx={{ height: '100%', alignItems: 'stretch' }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                <Box
                                    sx={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        bgcolor: feature.color,
                                        color: '#fff',
                                        mb: 2,
                                    }}
                                >
                                    <feature.Icon sx={{ fontSize: 32 }} />
                                </Box>
                                <Typography variant='h6' sx={{ mb: 1 }}>
                                    {t(feature.titleKey)}
                                </Typography>
                                <Typography variant='body2' color='text.secondary'>
                                    {t(feature.descKey)}
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                ))}
            </Box>
        </Box>
    );
};
