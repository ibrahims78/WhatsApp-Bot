import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@workspace/api-client-react/src/generated/api.schemas';
import type { SupportedLanguage } from '@/lib/i18n';

interface AppState {
  // Auth
  token: string | null;
  user: User | null;
  mustChangePassword: boolean;
  setAuth: (token: string, user: User & { mustChangePassword?: boolean }) => void;
  clearAuth: () => void;
  setMustChangePassword: (v: boolean) => void;
  
  // Theme & Lang
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

export function applyTheme(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function applyLanguage(language: SupportedLanguage) {
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
}

// Apply defaults immediately before hydration
applyTheme('light');
applyLanguage('ar');

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      mustChangePassword: false,
      setAuth: (token, user) => {
        const { mustChangePassword: mcp, ...safeUser } = user as any;
        set({ token, user: safeUser, mustChangePassword: !!mcp });
      },
      clearAuth: () => set({ token: null, user: null, mustChangePassword: false }),
      setMustChangePassword: (v) => set({ mustChangePassword: v }),
      
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
