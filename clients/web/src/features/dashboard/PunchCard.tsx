import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';

interface StaffAttendanceDay {
  id: string;
  work_date: string;
  punch_in_at: string;
  punch_out_at: string | null;
}

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

/**
 * SA-ATT-1, owner feedback: punch in/out belongs on the dashboard, not one
 * click away on Profile. Self-scoped, no permission needed beyond being
 * signed in — same rule as the week/courses cards next to it. The whole
 * attendance record (history, hours chart) moved here too, off Profile
 * entirely, so there is one place for it.
 */
export function PunchCard({ api }: { api: ApiClient }) {
  const [days, setDays] = useState<StaffAttendanceDay[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<StaffAttendanceDay[]>('/v1/me/staff-attendance');
    setDays(result.ok ? result.value : []);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (days === undefined) return null;

  const iso = new Date().toISOString().slice(0, 10);
  const today = days.find((d) => d.work_date === iso) ?? null;
  const open = today !== null && today.punch_out_at === null;

  async function punch() {
    setBusy(true); setError(null);
    const result = await api.post<StaffAttendanceDay>(`/v1/me/staff-attendance/${open ? 'punch-out' : 'punch-in'}`, {});
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    setDays((prev) => [result.value, ...(prev ?? []).filter((d) => d.id !== result.value.id)]);
  }

  return (
    <>
      <div className="dash__punch">
        <div>
          <p className="dash__punch-status">
            {today === null
              ? 'Not punched in yet'
              : open
                ? `Punched in at ${formatTime(today.punch_in_at)}`
                : `Punched out at ${formatTime(today.punch_out_at!)}`}
          </p>
          {error && <p className="dash__punch-error">{error}</p>}
        </div>
        <span className="dash__punch-btn">
          <Button variant="primary" disabled={busy || (today !== null && !open)} onClick={() => void punch()}>
            {busy ? 'Please wait…' : today !== null && !open ? 'Done' : open ? 'Punch out' : 'Punch in'}
          </Button>
        </span>
      </div>
      {days.length > 0 && (
        <div style={{ marginBottom: 'var(--space-base)' }}>
          <h3 className="dash__sub">Attendance history</h3>
          <HoursChart days={days} />
          <ul style={{ display: 'grid', gap: 'var(--space-xs)', listStyle: 'none', padding: 0, margin: 'var(--space-sm) 0 0' }}>
            {days.slice(0, 10).map((d) => (
              <li key={d.id} className="dash__muted">
                {d.work_date}: {formatTime(d.punch_in_at)}
                {d.punch_out_at ? ` – ${formatTime(d.punch_out_at)}` : ' (still open)'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
