import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme.ts';

describe('theme resolution (WEB-POLISH-1)', () => {
  it('follows the stored choice when present', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });

  it('falls back to the system scheme with no stored choice', () => {
    expect(resolveTheme(null, 'dark')).toBe('dark');
    expect(resolveTheme(null, 'light')).toBe('light');
    expect(resolveTheme('', 'dark')).toBe('dark');
  });

  it('treats an unknown stored value as no choice', () => {
    expect(resolveTheme('sepia', 'light')).toBe('light');
  });
});