import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@workspace/api-client-react/src/generated/api.schemas';
import type { SupportedLanguage } from '@/lib/i18n';

interface AppState {
  // Auth
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  
  // Theme & Lang
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

function applyTheme(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function applyLanguage(language: SupportedLanguage) {
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      
      language: 'ar',
      setLanguage: (language) => {
        set({ language });
        applyLanguage(language);
      },
    }),
    {
      name: 'whatsapp-dashboard-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          applyLanguage(state.language);
        }
      }
    }
  )
);
