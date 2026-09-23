import { useCallback, useEffect, useState } from 'react';
import { ErrorState, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { buildTiles } from '../dashboard/DashboardPage.tsx';

interface Assignment {
  role_key: string;
  scope_type: string;
  scope_ref_id: string | null;
}

interface Me {
  full_name: string | null;
  login_identifier: string | null;
  permissions: string[];
  assignments: Assignment[];
  has_access: boolean;
}

interface TeachingWire {
  id: string;
  component: string;
  course: { code: string; title: string };
  section: { label: string; term_number: number };
  department_name: string | null;
  program: { name: string };
}

const ROLE_LABELS: Record<string, string> = {
  college_admin: 'College Administrator',
  department_head: 'Head of Department',
  faculty: 'Faculty',
  accountant: 'Accountant',
  cashier: 'Cashier',
};

const SCOPE_LABELS: Record<string, string> = {
  institution: 'the whole college',
  campus: 'a campus',
  department: 'a department',
  program: 'a program',
  section: 'a section',
  committee: 'a committee',
  self: 'themselves',
};

/**
 * Web's missing counterpart to the mobile app's Profile (UX-2): what the
 * signed-in person is, and what they can actually see in the sidebar — in
 * plain names, not permission keys, so a person (or the owner checking on
 * their behalf) can self-check access without reading server code.
 */
export function ProfilePage({ api }: { api: ApiClient }) {
  const [me, setMe] = useState<Me | null>(null);
  const [teaching, setTeaching] = useState<TeachingWire[] | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    const result = await api.get<Me>('/v1/auth/me');
    if (!result.ok) { setFailure(result.error); return; }
    setMe(result.value);
    // Self-scoped (mirrors the dashboard): department, class and subject for
    // whoever teaches, no extra permission needed beyond being signed in.
    const taught = await api.get<TeachingWire[]>('/v1/me/teaching');
    setTeaching(taught.ok ? taught.value : []);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (!me && failure) return <ErrorState message={failure.message} onRetry={() => void load()} />;
  if (!me) return <div className="skeleton" style={{ height: 240 }} />;

  const modules = buildTiles(new Set(me.permissions));

  return (
    <>
      <div className="page__head">
        <div>
          <p className="page__eyebrow">Profile</p>
          <h1 className="page__title">{me.full_name ?? 'Your account'}</h1>
          <p className="page__sub">{me.login_identifier ?? ''}</p>
        </div>
      </div>

      <section style={{ display: 'grid', gap: 'var(--space-md)', maxWidth: 560 }}>
        <div>
          <h2 className="page__eyebrow">Your roles</h2>
          {me.assignments.length === 0 ? (
            <p>No role yet. Ask your College Administrator.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--space-xs)', listStyle: 'none', padding: 0, margin: 0 }}>
              {me.assignments.map((a, i) => (
                <li key={i}>
                  <StatusChip tone="info">{ROLE_LABELS[a.role_key] ?? a.role_key}</StatusChip>
                  {' '}for {SCOPE_LABELS[a.scope_type] ?? a.scope_type}
                </li>
              ))}
            </ul>
          )}
        </div>

        {teaching && teaching.length > 0 && (
          <div>
            <h2 className="page__eyebrow">Your teaching</h2>
            <ul style={{ display: 'grid', gap: 'var(--space-xs)', listStyle: 'none', padding: 0, margin: 0 }}>
              {teaching.map((t) => (
                <li key={t.id}>
                  <strong>{t.course.code}</strong> — {t.course.title}
                  <br />
                  {t.department_name ?? 'No department'} · Section {t.section.label} (Semester {t.section.term_number}) ·{' '}
                  {t.program.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h2 className="page__eyebrow">What you can access</h2>
          {modules.length === 0 ? (
            <p>Nothing yet. Ask your College Administrator for access.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--space-xs)', listStyle: 'none', padding: 0, margin: 0 }}>
              {modules.map((m) => <li key={m.key}>✓ {m.label}</li>)}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
