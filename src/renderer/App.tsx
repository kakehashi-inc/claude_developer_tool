import React, { useMemo, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAppStore } from './store/useAppStore';
import { Layout } from './components/Layout';
import { ClaudeDesktopManager } from './components/ClaudeDesktopManager';

const isDev = import.meta.env.DEV;
const Router = isDev ? BrowserRouter : HashRouter;

export const App: React.FC = () => {
    const { theme, setTheme, setLanguage } = useAppStore();
    const { i18n } = useTranslation();

    // OSの設定を読み込み
    useEffect(() => {
        const loadSystemSettings = async () => {
            try {
                // OSのテーマ設定を取得
                const systemTheme = await window.api.system.getTheme();
                setTheme(systemTheme);

                // OSの言語設定を取得
                const systemLocale = await window.api.system.getLocale();
                const language = systemLocale.startsWith('ja') ? 'ja' : 'en';
                setLanguage(language);
                i18n.changeLanguage(language);
            } catch (error) {
                console.error('Failed to load system settings:', error);
            }
        };

        loadSystemSettings();
    }, [setTheme, setLanguage, i18n]);

    const muiTheme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode: theme,
                },
            }),
        [theme]
    );

    return (
        <ThemeProvider theme={muiTheme}>
            <CssBaseline />
            <Router>
                <Layout>
                    <Routes>
                        <Route path='/' element={<ClaudeDesktopManager />} />
                    </Routes>
                </Layout>
            </Router>
        </ThemeProvider>
    );
};
