import React, { useState, useEffect } from 'react';
import {
    Box,
    IconButton,
    Typography,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Divider,
    Tooltip,
} from '@mui/material';
import {
    Menu as MenuIcon,
    Minimize as MinimizeIcon,
    CropSquare as MaximizeIcon,
    Close as CloseIcon,
    Storage as StorageIcon,
    PowerSettingsNew as ExitIcon,
    Brightness4 as DarkIcon,
    Brightness7 as LightIcon,
    Language as LanguageIcon,
} from '@mui/icons-material';
import { useAppStore } from '../store/useAppStore';
import { useTranslation } from 'react-i18next';

export const TitleBar: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { theme, language, setTheme, setLanguage } = useAppStore();
    const [isMaximized, setIsMaximized] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [langMenuAnchor, setLangMenuAnchor] = useState<null | HTMLElement>(null);
    const [appVersion, setAppVersion] = useState<string>('');

    useEffect(() => {
        window.api.window.isMaximized().then(setIsMaximized);
        window.api.system
            .getVersion()
            .then(setAppVersion)
            .catch(() => setAppVersion(''));
    }, []);

    const handleMinimize = () => {
        window.api.window.minimize();
    };

    const handleMaximize = async () => {
        await window.api.window.maximize();
        const maximized = await window.api.window.isMaximized();
        setIsMaximized(maximized);
    };

    const handleClose = () => {
        window.api.window.close();
    };

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setMenuAnchor(event.currentTarget);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
    };

    const handleLanguageMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setLangMenuAnchor(event.currentTarget);
    };

    const handleLanguageMenuClose = () => {
        setLangMenuAnchor(null);
    };

    const handleLanguageSelect = (lang: 'en' | 'ja') => {
        setLanguage(lang);
        i18n.changeLanguage(lang);
        handleLanguageMenuClose();
    };

    const handleThemeToggle = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    const handleExit = () => {
        handleMenuClose();
        window.api.window.close();
    };

    return (
        <Box
            sx={{
                height: 48,
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider',
                WebkitAppRegion: 'drag',
                userSelect: 'none',
            }}
        >
            {/* タイトル */}
            <Box sx={{ flexGrow: 1, ml: 2, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography
                    variant='body1'
                    sx={{
                        fontWeight: 500,
                        fontSize: '0.95rem',
                    }}
                >
                    {t('app.title')}
                </Typography>
                {appVersion && (
                    <Typography
                        variant='caption'
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.75rem',
                        }}
                    >
                        v{appVersion}
                    </Typography>
                )}
            </Box>

            {/* 右側：ツールメニュー */}
            <Box sx={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' }}>
                {/* 機能アイコン */}
                <Tooltip title={t('claudeDesktop.title')}>
                    <IconButton
                        size='medium'
                        sx={{
                            color: 'text.primary',
                        }}
                    >
                        <StorageIcon />
                    </IconButton>
                </Tooltip>

                {/* テーマ切り替え */}
                <Tooltip title={t('theme.' + (theme === 'light' ? 'dark' : 'light'))}>
                    <IconButton
                        size='medium'
                        onClick={handleThemeToggle}
                        sx={{
                            color: 'text.primary',
                        }}
                    >
                        {theme === 'light' ? <DarkIcon /> : <LightIcon />}
                    </IconButton>
                </Tooltip>

                {/* 言語ドロップダウン */}
                <Tooltip title={t('language.' + language)}>
                    <IconButton
                        size='medium'
                        onClick={handleLanguageMenuOpen}
                        sx={{
                            color: 'text.primary',
                        }}
                    >
                        <LanguageIcon />
                    </IconButton>
                </Tooltip>

                <Menu
                    anchorEl={langMenuAnchor}
                    open={Boolean(langMenuAnchor)}
                    onClose={handleLanguageMenuClose}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'right',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                >
                    <MenuItem onClick={() => handleLanguageSelect('ja')} selected={language === 'ja'}>
                        <ListItemText primary={t('language.ja')} primaryTypographyProps={{ fontSize: '0.95rem' }} />
                    </MenuItem>
                    <MenuItem onClick={() => handleLanguageSelect('en')} selected={language === 'en'}>
                        <ListItemText primary={t('language.en')} primaryTypographyProps={{ fontSize: '0.95rem' }} />
                    </MenuItem>
                </Menu>

                {/* バーガーメニュー */}
                <IconButton
                    size='medium'
                    onClick={handleMenuOpen}
                    sx={{
                        color: 'text.primary',
                    }}
                >
                    <MenuIcon />
                </IconButton>

                <Menu
                    anchorEl={menuAnchor}
                    open={Boolean(menuAnchor)}
                    onClose={handleMenuClose}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'right',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                >
                    <MenuItem>
                        <ListItemIcon>
                            <StorageIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary={t('claudeDesktop.title')}
                            primaryTypographyProps={{ fontSize: '0.95rem' }}
                        />
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={handleExit}>
                        <ListItemIcon>
                            <ExitIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('menu.exit')} primaryTypographyProps={{ fontSize: '0.95rem' }} />
                    </MenuItem>
                </Menu>
            </Box>

            {/* ウィンドウコントロールボタン */}
            <Box sx={{ display: 'flex', WebkitAppRegion: 'no-drag' }}>
                <IconButton
                    size='medium'
                    onClick={handleMinimize}
                    sx={{
                        borderRadius: 0,
                        width: 48,
                        height: 48,
                        color: 'text.primary',
                        '&:hover': {
                            bgcolor: 'action.hover',
                        },
                    }}
                >
                    <MinimizeIcon />
                </IconButton>
                <IconButton
                    size='medium'
                    onClick={handleMaximize}
                    sx={{
                        borderRadius: 0,
                        width: 48,
                        height: 48,
                        color: 'text.primary',
                        '&:hover': {
                            bgcolor: 'action.hover',
                        },
                    }}
                >
                    <MaximizeIcon />
                </IconButton>
                <IconButton
                    size='medium'
                    onClick={handleClose}
                    sx={{
                        borderRadius: 0,
                        width: 48,
                        height: 48,
                        color: 'text.primary',
                        '&:hover': {
                            bgcolor: 'error.main',
                            color: 'error.contrastText',
                        },
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </Box>
        </Box>
    );
};
