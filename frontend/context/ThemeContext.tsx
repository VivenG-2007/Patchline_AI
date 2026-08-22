'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const STORAGE_KEY = 'patchline_theme';
export const LEGACY_STORAGE_KEY = 'patchline-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

  // Initialize theme from DOM attribute / localStorage
  useEffect(() => {
    try {
      const stored = (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)) as ThemeMode | null;
      const initialMode: ThemeMode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
      const resolved = initialMode === 'system' ? getSystemTheme() : initialMode;
      
      setThemeState(initialMode);
      setResolvedTheme(resolved);
      
      applyThemeToDom(initialMode, resolved);
    } catch {
      setThemeState('dark');
      setResolvedTheme('dark');
    }
  }, []);

  // Listen to OS system theme changes when mode is 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => {
      const nextResolved = e.matches ? 'light' : 'dark';
      setResolvedTheme(nextResolved);
      applyThemeToDom('system', nextResolved);
    };

    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const applyThemeToDom = (mode: ThemeMode, resolved: ResolvedTheme) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-mode', mode);
    if (resolved === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  };

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    const resolved = next === 'system' ? getSystemTheme() : next;
    setResolvedTheme(resolved);
    applyThemeToDom(next, resolved);

    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.setItem(LEGACY_STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable (private mode etc.) */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// Inline anti-flicker script injected into <head> by layout.tsx
export const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}') || localStorage.getItem('${LEGACY_STORAGE_KEY}');
    var isDarkPreferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = 'dark';
    
    if (stored === 'light') {
      resolved = 'light';
    } else if (stored === 'dark') {
      resolved = 'dark';
    } else if (stored === 'system') {
      resolved = isDarkPreferred ? 'dark' : 'light';
    } else {
      resolved = isDarkPreferred ? 'dark' : 'dark';
    }

    var root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-mode', stored || 'dark');
    if (resolved === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  }
})();
`;
