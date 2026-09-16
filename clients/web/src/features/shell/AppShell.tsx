import { createContext, useContext, useEffect, useState, type ReactNode, type SVGProps } from 'react';
import { Button } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';
import type { Actor } from '../../lib/auth.ts';
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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('shell:collapsed') === '1'; } catch { return false; }
  });
  const current = items.find((i) => i.key === active) ?? items[0];

  const select = (key: string) => {
    setActive(key);
    setNavOpen(false); // close the off-canvas drawer after a choice on narrow screens
  };

  // Collapsing is a choice, not a width side-effect (WEB-POLISH feedback: items
  // used to vanish on laptop widths). It persists so the rail sticks between visits.
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('shell:collapsed', next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
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
    <div className={`shell${collapsed ? ' shell--collapsed' : ''}`}>
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

          {/* Groups and their items rise in one staggered pass on mount; the
              global stagger caps the delay so a long list still lands quickly. */}
          <nav className="shell__nav m-stagger">
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
            <button
              type="button"
              className="shell__collapsebar"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight width={18} height={18} /> : <ChevronLeft width={18} height={18} />}
            </button>
            <div className="shell__actor">
              <span className="shell__name">{actor.fullName}</span>
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

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function ChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function ChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}