'use client';

import { useTheme } from './theme-provider';

/** Cycles light -> dark -> system. Uses the shared .icon-btn primitive from
 *  globals.css so it matches the rest of the chrome (search icon, cart icon)
 *  without any component-specific CSS. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function cycle() {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  }

  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto';

  return (
    <button type="button" className="icon-btn" onClick={cycle} aria-label={`Theme: ${label}. Click to change.`} title={`Theme: ${label}`}>
      {theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '◐'}
    </button>
  );
}
