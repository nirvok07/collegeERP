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

/**
 * SA-ATT-1, owner feedback: punch in/out belongs on the dashboard, not one
 * click away on Profile. Self-scoped, no permission needed beyond being
 * signed in — same rule as the week/courses cards next to it.
 */
export function PunchCard({ api }: { api: ApiClient }) {
  const [today, setToday] = useState<StaffAttendanceDay | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<StaffAttendanceDay[]>('/v1/me/staff-attendance');
    if (!result.ok) { setToday(null); return; }
    const iso = new Date().toISOString().slice(0, 10);
    setToday(result.value.find((d) => d.work_date === iso) ?? null);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (today === undefined) return null;

  const open = today !== null && today.punch_out_at === null;

  async function punch() {
    setBusy(true); setError(null);
    const result = await api.post<StaffAttendanceDay>(`/v1/me/staff-attendance/${open ? 'punch-out' : 'punch-in'}`, {});
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    setToday(result.value);
  }

  return (
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
      <Button variant="primary" disabled={busy || (today !== null && !open)} onClick={() => void punch()}>
        {busy ? 'Please wait…' : today !== null && !open ? 'Done for today' : open ? 'Punch out' : 'Punch in'}
      </Button>
    </div>
  );
}
