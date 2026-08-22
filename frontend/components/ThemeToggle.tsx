'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`relative w-8 h-8 shrink-0 rounded-md border border-border text-muted hover:text-ink hover:border-border-strong transition-colors flex items-center justify-center ${className}`}
    >
      <Sun
        size={15}
        strokeWidth={1.75}
        className={`absolute transition-all duration-200 ${theme === 'dark' ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90'}`}
      />
      <Moon
        size={15}
        strokeWidth={1.75}
        className={`absolute transition-all duration-200 ${theme === 'light' ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-90'}`}
      />
    </button>
  );
}
