'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

const THEME_KEY = 'pillcount_theme';

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(THEME_KEY) : null;
    const initial = stored === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const nextTheme = theme === 'light' ? 'dark' : 'light';

  return (
    <Button
      variant='ghost'
      size='sm'
      aria-label='Toggle theme'
      onClick={() => {
        setTheme(nextTheme);
        if (typeof window !== 'undefined') {
          localStorage.setItem(THEME_KEY, nextTheme);
        }
        applyTheme(nextTheme);
      }}
    >
      {theme === 'light' ? <Moon className='h-4 w-4' /> : <Sun className='h-4 w-4' />}
    </Button>
  );
}
