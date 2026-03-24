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

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme });
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },
      
      language: 'en',
      setLanguage: (language) => {
        set({ language });
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = language;
      },
    }),
    {
      name: 'whatsapp-dashboard-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Apply DOM mutations on load
          if (state.theme === 'dark') document.documentElement.classList.add('dark');
          else document.documentElement.classList.remove('dark');
          
          document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';
          document.documentElement.lang = state.language;
        }
      }
    }
  )
);
