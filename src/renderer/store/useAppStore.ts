import { create } from 'zustand';

interface AppState {
    theme: 'light' | 'dark';
    language: 'en' | 'ja';
    setTheme: (theme: 'light' | 'dark') => void;
    setLanguage: (language: 'en' | 'ja') => void;
}

export const useAppStore = create<AppState>(set => ({
    theme: 'light',
    language: 'ja',
    setTheme: theme => set({ theme }),
    setLanguage: language => set({ language }),
}));
