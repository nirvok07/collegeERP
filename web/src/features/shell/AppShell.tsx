import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';
import type { Actor } from '../../lib/auth.ts';
import './shell.css';

export interface NavItem {
  key: string;
  label: string;
  render: () => ReactNode;
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
          <Button variant="text" onClick={onSignOut}>Sign out</Button>
        </div>
      </header>

      <main className="page">{current?.render()}</main>
    </div>
  );
}

/** Reads the permission set once, so screens ask a question rather than a role. */
export async function loadPermissions(api: ApiClient): Promise<Set<string>> {
  const result = await api.get<{ permissions: string[] }>('/v1/auth/me');
  return new Set(result.ok ? result.value.permissions : []);
}
