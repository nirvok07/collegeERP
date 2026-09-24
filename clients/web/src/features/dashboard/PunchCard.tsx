import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';

interface StaffAttendanceDay {
  id: string;
  work_date: string;
  punch_in_at: string;
  punch_out_at: string | null;
}

interface CalendarHoliday {
  id: string;
  on_date: string;
  label: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * The visual form of the punch record: hours worked, one bar per day of the
 * current month, oldest to newest — the whole month in one chart, instead of
 * a plain list of raw punch times underneath it. Hovering a bar (or reading
 * its accessible name) gives the exact times; the bar itself is the record.
 * Bars grow in on mount/update (a `grown` flip one frame after render, so
 * the CSS `height` transition on `.dash__bar` has something to animate from)
 * rather than jumping straight to their final height.
 */
function HoursChart({ days }: { days: StaffAttendanceDay[] }) {
  const now = new Date();
  const { year, month, daysInMonth } = monthRange(now);
  const todayIso = now.toISOString().slice(0, 10);
  const byDate = new Map(days.map((d) => [d.work_date, d]));

  const bars = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const record = byDate.get(iso);
    const hours = record?.punch_out_at
      ? (new Date(record.punch_out_at).getTime() - new Date(record.punch_in_at).getTime()) / 3_600_000
      : 0;
    bars.push({ day, iso, hours, record, isToday: iso === todayIso });
  }
  const max = Math.max(1, ...bars.map((b) => b.hours));

  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [days]);

  return (
    <div className="dash__chart dash__chart--month" role="img" aria-label={`Hours worked this month, ${daysInMonth} days`}>
      {bars.map((b) => (
        <div
          key={b.iso}
          className={`dash__bar-wrap${b.isToday ? ' dash__bar-wrap--today' : ''}`}
          title={
            b.record
              ? `${b.iso}: ${formatTime(b.record.punch_in_at)}${
                  b.record.punch_out_at ? ` – ${formatTime(b.record.punch_out_at)}` : ' (still open)'
                }`
              : b.iso
          }
        >
          <div className="dash__bar" style={{ height: grown ? `${(b.hours / max) * 100}%` : 0 }} />
          <span className="dash__bar-day">{b.day === 1 || b.day % 5 === 0 || b.isToday ? b.day : ''}</span>
        </div>
      ))}
    </div>
  );
}

function monthRange(now: Date): { from: string; to: string; year: number; month: number; daysInMonth: number } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), year, month, daysInMonth: to.getDate() };
}

interface MonthCounts { present: number; absent: number; holiday: number; remaining: number }

/**
 * Classifies every day of the current month, in order, as: in the future
 * ("remaining", not yet happened), a holiday (the academic calendar,
 * CAL-1/CAL-2), present (a punch-in exists) or absent (a past working day
 * with no punch). Today counts as "absent" until punched in — same rule
 * as any other working day.
 */
function monthCounts(days: StaffAttendanceDay[], holidays: string[], now: Date): MonthCounts {
  const { year, month, daysInMonth } = monthRange(now);
  const todayIso = now.toISOString().slice(0, 10);
  const holidaySet = new Set(holidays);
  const presentSet = new Set(days.map((d) => d.work_date));
  const counts: MonthCounts = { present: 0, absent: 0, holiday: 0, remaining: 0 };
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso > todayIso) counts.remaining += 1;
    else if (holidaySet.has(iso)) counts.holiday += 1;
    else if (presentSet.has(iso)) counts.present += 1;
    else counts.absent += 1;
  }
  return counts;
}

/**
 * A "smart" donut: this month at a glance — present, absent, holiday and
 * days still to come — drawn as one ring, no charting library, matching
 * the mobile app's `RingChart` (`core/widgets/charts.dart`). Draws itself
 * in on mount by animating each arc's `stroke-dasharray` from 0.
 */
function MonthDonut({ counts, monthLabel }: { counts: MonthCounts; monthLabel: string }) {
  const { present, absent, holiday, remaining } = counts;
  const total = present + absent + holiday + remaining;
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [present, absent, holiday, remaining]);

  const cx = 60, cy = 60, r = 46, strokeWidth = 16;
  const circumference = 2 * Math.PI * r;
  const segments = [
    { key: 'present', value: present, color: 'var(--success)', label: 'Present' },
    { key: 'absent', value: absent, color: 'var(--error)', label: 'Absent' },
    { key: 'holiday', value: holiday, color: 'var(--info)', label: 'Holiday' },
    { key: 'remaining', value: remaining, color: 'var(--outline-strong)', label: 'Days left' },
  ];
  let cumulative = 0;
  const arcs = segments.map((s) => {
    const dash = total > 0 ? (s.value / total) * circumference : 0;
    const arc = { ...s, dash, offset: -cumulative };
    cumulative += dash;
    return arc;
  });

  return (
    <div className="dash__donut">
      <svg
        viewBox="0 0 120 120" width="112" height="112"
        role="img"
        aria-label={`${monthLabel}: ${present} present, ${absent} absent, ${holiday} holiday, ${remaining} days left, of ${total} days`}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--outline)" strokeWidth={strokeWidth} />
        {arcs.map((a) => a.value === 0 ? null : (
          <circle
            key={a.key}
            className="dash__donut-arc"
            cx={cx} cy={cy} r={r} fill="none" stroke={a.color} strokeWidth={strokeWidth}
            strokeDasharray={grown ? `${a.dash} ${circumference - a.dash}` : `0 ${circumference}`}
            strokeDashoffset={a.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy - 3} textAnchor="middle" className="dash__donut-num">{present}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" className="dash__donut-label">present</text>
      </svg>
      <ul className="dash__donut-legend">
        {segments.map((s) => (
          <li key={s.key}>
            <span className="dash__donut-dot" style={{ background: s.color }} />
            {s.label}: {s.value}
          </li>
        ))}
      </ul>
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
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { from, to } = monthRange(new Date());
    const [history, calendar] = await Promise.all([
      api.get<StaffAttendanceDay[]>('/v1/me/staff-attendance'),
      api.get<{ holidays: CalendarHoliday[] }>(`/v1/calendar?from=${from}&to=${to}`),
    ]);
    setDays(history.ok ? history.value : []);
    setHolidays(calendar.ok ? calendar.value.holidays : []);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (days === undefined) {
    return (
      <section className="dash__band dash__punch-band" aria-label="Attendance">
        <div className="dash__band-head">
          <h2 className="dash__h">Attendance</h2>
        </div>
        <div className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-card)' }} />
        <div className="skeleton" style={{ height: 160 }} />
      </section>
    );
  }

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
    <section className="dash__band dash__punch-band" aria-label="Attendance">
      <div className="dash__band-head">
        <h2 className="dash__h">Attendance</h2>
      </div>
      <div className="dash__punch">
        <div>
          <p className="dash__punch-status">
            {today === null
              ? 'Not punched in yet'
              : open
                ? `Punched in at ${formatTime(today.punch_in_at)}`
                : `Punched out at ${formatTime(today.punch_out_at!)}`}
          </p>
          {error && <p className="dash__punch-error" role="alert">{error}</p>}
        </div>
        <span className="dash__punch-btn">
          <Button variant="primary" disabled={busy || (today !== null && !open)} onClick={() => void punch()}>
            {busy ? 'Please wait…' : today !== null && !open ? 'Done' : open ? 'Punch out' : 'Punch in'}
          </Button>
        </span>
      </div>
      <div className="dash__punch-detail">
        <div>
          <h3 className="dash__sub">This month</h3>
          <MonthDonut
            counts={monthCounts(days, holidays.map((h) => h.on_date), new Date())}
            monthLabel={new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })}
          />
        </div>
        <div>
          <h3 className="dash__sub">Hours worked</h3>
          <HoursChart days={days} />
        </div>
      </div>
    </section>
  );
}
