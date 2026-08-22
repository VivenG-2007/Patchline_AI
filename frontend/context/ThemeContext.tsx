'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'patchline-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline script in layout.tsx already set document.documentElement's
  // data-theme attribute before hydration (avoids a flash of the wrong
  // theme); read it back here so React state agrees with the DOM instead of
  // re-deciding and risking a mismatch.
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
    setThemeState(current);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable (private mode etc.) — theme just won't persist */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// Inline script string injected into <head> by layout.tsx, executed before
// React hydrates — this is what prevents a flash of dark-theme-on-light (or
// vice versa) on page load.
export const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
