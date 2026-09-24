import { useCallback, useEffect, useState } from 'react';
import { ErrorState, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { buildTiles } from '../dashboard/DashboardPage.tsx';
import '../dashboard/dashboard.css';

interface Assignment {
  role_key: string;
  scope_type: string;
  scope_ref_id: string | null;
  scope_name: string | null;
}

interface Me {
  full_name: string | null;
  login_identifier: string | null;
  permissions: string[];
  institution_permissions?: string[];
  assignments: Assignment[];
  has_access: boolean;
}

interface StaffAttendanceDay {
  id: string;
  work_date: string;
  punch_in_at: string;
  punch_out_at: string | null;
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function weekday(iso: string): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${iso}T00:00:00`).getDay()];
}

/** The visual form of the punch record: hours worked per day, oldest to newest. */
function HoursChart({ days }: { days: StaffAttendanceDay[] }) {
  const recent = [...days].slice(0, 7).reverse();
  const hours = recent.map((d) =>
    d.punch_out_at ? (new Date(d.punch_out_at).getTime() - new Date(d.punch_in_at).getTime()) / 3_600_000 : 0,
  );
  const max = Math.max(1, ...hours);
  return (
    <div className="dash__chart" role="img" aria-label={`Hours worked, last ${recent.length} recorded days`}>
      {recent.map((d, i) => (
        <div key={d.id} className="dash__bar-wrap" title={`${d.work_date}: ${hours[i].toFixed(1)}h`}>
          <div className="dash__bar" style={{ height: `${(hours[i] / max) * 100}%` }} />
          <span className="dash__bar-day">{weekday(d.work_date)}</span>
        </div>
      ))}
    </div>
  );
}

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
  const [days, setDays] = useState<StaffAttendanceDay[] | null>(null);
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
    // Punching itself lives on the Dashboard now (owner feedback); this is
    // just the history.
    const history = await api.get<StaffAttendanceDay[]>('/v1/me/staff-attendance');
    setDays(history.ok ? history.value : []);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (!me && failure) return <ErrorState message={failure.message} onRetry={() => void load()} />;
  if (!me) return <div className="skeleton" style={{ height: 240 }} />;

  const modules = buildTiles({
    all: new Set(me.permissions),
    institution: new Set(me.institution_permissions ?? me.permissions),
  });

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
        {days && days.length > 0 && (
          <div>
            <h2 className="page__eyebrow">Attendance history</h2>
            <p className="page__sub" style={{ margin: '0 0 var(--space-xs)' }}>Punch in and out from the Dashboard.</p>
            <HoursChart days={days} />
            <ul style={{ display: 'grid', gap: 'var(--space-xs)', listStyle: 'none', padding: 0, margin: 'var(--space-sm) 0 0' }}>
              {days.slice(0, 10).map((d) => (
                <li key={d.id}>
                  {d.work_date}: {formatTime(d.punch_in_at)}
                  {d.punch_out_at ? ` – ${formatTime(d.punch_out_at)}` : ' (still open)'}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h2 className="page__eyebrow">Your roles</h2>
          {me.assignments.length === 0 ? (
            <p>No role yet. Ask your College Administrator.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--space-xs)', listStyle: 'none', padding: 0, margin: 0 }}>
              {me.assignments.map((a, i) => (
                <li key={i}>
                  <StatusChip tone="info">{ROLE_LABELS[a.role_key] ?? a.role_key}</StatusChip>
                  {' '}for {a.scope_name ?? SCOPE_LABELS[a.scope_type] ?? a.scope_type}
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
