import { useEffect, useState } from 'react';

/**
 * Theme switching for the web console. The token system already defines light
 * and dark themes (design/tokens.css): light on bare `:root`, dark under
 * `:root[data-theme='dark']` and the system `prefers-color-scheme` override.
 * This hook only decides whether to force an explicit `data-theme` attribute;
 * every component's styling is token-driven, so nothing else changes.
 *
 * The preference is remembered in localStorage. Before the first explicit
 * choice the console follows the operating system's scheme (no attribute).
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'erp.theme';

/** Pure resolver (unit-tested): explicit choice wins, else the system scheme. */
export function resolveTheme(stored: string | null, system: Theme): Theme {
  return stored === 'dark' ? 'dark' : stored === 'light' ? 'light' : system;
}

export function readStoredTheme(): string | null {
  return localStorage.getItem(THEME_KEY);
}

/** Force an explicit theme and remember it. */
export function writeTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
}

/** Drop the override and follow the operating system again. */
export function clearTheme(): void {
  delete document.documentElement.dataset.theme;
  localStorage.removeItem(THEME_KEY);
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [stored, setStored] = useState<string | null>(() => readStoredTheme());

  useEffect(() => {
    if (stored === 'light' || stored === 'dark') writeTheme(stored);
    else clearTheme();
  }, [stored]);

  const theme = resolveTheme(stored, systemTheme());
  const toggle = () => setStored(theme === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}