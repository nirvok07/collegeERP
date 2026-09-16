import { createContext, useContext, useEffect, useState, type ReactNode, type SVGProps } from 'react';
import { Button } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';
import type { Actor } from '../../lib/auth.ts';
import { useTheme } from '../../design/theme.ts';
import './shell.css';

export interface NavItem {
  key: string;
  label: string;
  /** A section the item belongs to, shown as an eyebrow grouping in the sidebar. */
  section?: string;
  /** Decorative inline icon; the label is the accessible name, so it is aria-hidden. */
  icon?: ReactNode;
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
 *
 * Layout is a left sidebar (chrome + navigation) beside a content column whose
 * slim top bar holds the actor cluster. Below 1024px the rail collapses to
 * icons; below 720px it becomes an off-canvas drawer opened from a hamburger.
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
  const [navOpen, setNavOpen] = useState(false);
  const current = items.find((i) => i.key === active) ?? items[0];

  const select = (key: string) => {
    setActive(key);
    setNavOpen(false); // close the off-canvas drawer after a choice on narrow screens
  };

  // Number keys jump between sections, faster than reaching for a mouse when
  // moving between people and institutions repeatedly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && navOpen) { setNavOpen(false); return; }
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < items.length) {
        e.preventDefault();
        select(items[index]!.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, navOpen]);

  const groups = groupSections(items);

  return (
    <div className="shell">
      <ShellNav.Provider value={select}>
        {/* Off-canvas scrim (narrow screens): closes on scrim click, never on content. */}
        {navOpen && <div className="shell__scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

        <aside className={`shell__side${navOpen ? ' shell__side--open' : ''}`} aria-label="Sections">
          <div className="shell__brand">
            <span className="shell__mark" aria-hidden="true">C</span>
            <div className="shell__brand-text">
              <span className="shell__product">College</span>
              <span className="shell__scope">{scopeLabel}</span>
            </div>
          </div>

          <nav className="shell__nav">
            {groups.map((group) => (
              <div className="shell__group" key={group.label}>
                {group.label && <div className="shell__group-label">{group.label}</div>}
                {group.items.map((item, i) => (
                  <button
                    key={item.key}
                    className={`shell__tab${item.key === current?.key ? ' shell__tab--on' : ''}`}
                    aria-current={item.key === current?.key ? 'page' : undefined}
                    onClick={() => select(item.key)}
                    title={item.label}
                  >
                    <span className="shell__tab-icon" aria-hidden="true">{item.icon}</span>
                    <span className="shell__tab-label">{item.label}</span>
                    <kbd className="shell__kbd" aria-hidden="true">{i + 1}</kbd>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="shell__main">
          <header className="shell__bar">
            <button
              type="button"
              className="shell__hamburger"
              onClick={() => setNavOpen(true)}
              aria-label="Open sections"
            >
              <MenuIcon width={18} height={18} />
            </button>
            <div className="shell__actor">
              <span className="shell__name">{actor.fullName}</span>
              <ThemeToggle />
              <Button variant="text" onClick={onSignOut}>Sign out</Button>
            </div>
          </header>

          {/* Keyed on the section, so switching remounts and replays the entrance.
              One animated element, not one per row of whatever it contains. */}
          <main className="page">
            <div className="shell__section" key={current?.key}>
              {current?.render()}
            </div>
          </main>
        </div>
      </ShellNav.Provider>
    </div>
  );
}

/** Groups nav items by their `section` label, preserving order. Exported for
 *  tests because the grouping is the sidebar's structural contract. */
export function groupSections(items: NavItem[]): Array<{ label: string; items: NavItem[] }> {
  const groups: Array<{ label: string; items: NavItem[] }> = [];
  const byLabel = new Map<string, NavItem[]>();
  const order: string[] = [];
  for (const item of items) {
    const label = item.section ?? '';
    if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
    byLabel.get(label)!.push(item);
  }
  for (const label of order) groups.push({ label, items: byLabel.get(label)! });
  return groups;
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

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
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