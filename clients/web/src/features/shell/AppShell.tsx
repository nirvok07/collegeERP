import { createContext, useContext, useEffect, useState, type ReactNode, type SVGProps } from 'react';
import { Button } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';
import type { Actor } from '../../lib/auth.ts';
import { useTheme } from '../../design/theme.ts';
import './shell.css';

export interface NavItem {
  key: string;
  label: string;
  render: () => ReactNode;
}

/**
 * Lets a section (e.g. the dashboard's module grid) switch the active tab
 * without owning the shell's state or threading callbacks through every screen.
 */
export const ShellNav = createContext<(key: string) => void>(() => {/* no-op outside shell */});
export function useShellNav(): (key: string) => void {
  return useContext(ShellNav);
}

/**
 * One shell for both actor kinds. Navigation is built from what the signed-in
 * actor can actually do, so a section is absent rather than disabled: a disabled
 * tab advertises a capability the user will never have and generates a support
 * call.
 */
export function AppShell({
  actor, items, onSignOut, scopeLabel,
}: {
  actor: Actor;
  items: NavItem[];
  onSignOut: () => void;
  scopeLabel: string;
}) {
  const [active, setActive] = useState(items[0]?.key ?? '');
  const current = items.find((i) => i.key === active) ?? items[0];

  // Number keys jump between sections, faster than reaching for a mouse when
  // moving between people and institutions repeatedly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < items.length) {
        e.preventDefault();
        setActive(items[index]!.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items]);

  return (
    <div className="shell">
      <ShellNav.Provider value={setActive}>
      <header className="shell__bar">
        <div className="shell__brand">
          <span className="shell__mark" aria-hidden="true">C</span>
          <span className="shell__product">College</span>
          <span className="shell__scope">{scopeLabel}</span>
        </div>

        {items.length > 1 && (
          <nav className="shell__nav" aria-label="Sections">
            {items.map((item, i) => (
              <button
                key={item.key}
                className={`shell__tab${item.key === current?.key ? ' shell__tab--on' : ''}`}
                aria-current={item.key === current?.key ? 'page' : undefined}
                onClick={() => setActive(item.key)}
              >
                {item.label}
                <kbd className="shell__kbd" aria-hidden="true">{i + 1}</kbd>
              </button>
            ))}
          </nav>
        )}

        <div className="shell__actor">
          <span className="shell__name">{actor.fullName}</span>
          <ThemeToggle />
          <Button variant="text" onClick={onSignOut}>Sign out</Button>
        </div>
      </header>

      {/* Keyed on the section, so switching remounts and replays the entrance.
          One animated element, not one per row of whatever it contains. */}
      <main className="page">
        <div className="shell__section" key={current?.key}>{current?.render()}</div>
      </main>
      </ShellNav.Provider>
    </div>
  );
}

/** Reads the permission set once, so screens ask a question rather than a role. */
export async function loadPermissions(api: ApiClient): Promise<Set<string>> {
  const result = await api.get<{ permissions: string[] }>('/v1/auth/me');
  return new Set(result.ok ? result.value.permissions : []);
}

/** Switches the console between light and dark; the choice persists (WEB-POLISH-1). */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="shell__theme"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
    </button>
  );
}

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinejoin="round" />
    </svg>
  );
}
